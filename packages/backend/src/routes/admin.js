// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const Proposal = require("../models/Proposal");
const { sendValidatorProposalEmail } = require("../services/emailService");
const {
  sponsorProposeInitialization,
  sponsorProposeValidatorUpdate,
  sponsorValidateRegistry,
  sponsorValidateValidator,
  sponsorCancelInit,
  sponsorCancelValidatorUpdate,
  sponsorExecuteInit,
  sponsorExecuteUpdateValidator,
} = require("../services/relayService");

// ─── Multisig read ABI ─────────────────────────────────────────────────────────
// These are VIEW functions only — no gas, called directly on the contract.
// The struct fields must match the MultiSig contract exactly.
const MULTISIG_READ_ABI = [
  // _registry(address) returns the full Registry struct
  "function _registry(address) view returns (address registryAddress, bytes16 nspace, uint128 requiredValidationCount, uint128 validationCount, uint256 timeLock, bool isProposed, bool isValidated, bool isExecuted)",
  // _updateValidator(address) returns the full ValidatorUpdateRequest struct
  "function _updateValidator(address) view returns (address addr, bool action, uint128 requiredValidationCount, uint128 validationCount, uint256 timeLock, bool isProposed, bool isValidated, bool isExecuted)",
  // Helper view functions that return remaining votes
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

function getMultisig() {
  return new ethers.Contract(
    process.env.MULTISIG_CONTRACT_ADDRESS,
    MULTISIG_READ_ABI,
    provider
  );
}

// ─── Middleware ────────────────────────────────────────────────────────────────
async function requireValidator(req, res, next) {
  const { safeAddress } = req.body;
  if (!safeAddress)
    return res.status(400).json({ message: "safeAddress required" });
  const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!user || !user.isValidator)
    return res.status(403).json({ message: "Not authorized" });
  req.callerUser = user;
  next();
}

// ─── Email ALL validators ──────────────────────────────────────────────────────
async function notifyAllValidators(subject, payload) {
  const validators = await User.find({ isValidator: true });
  for (const v of validators) {
    if (v.email) {
      try {
        await sendValidatorProposalEmail(v.email, v.username, subject, payload);
      } catch (e) {
        console.error(`Failed to email validator ${v.email}:`, e.message);
      }
    }
  }
}

// ─── Wait for tx receipt ───────────────────────────────────────────────────────
async function waitForTx(txHash, maxRetries = 30, delayMs = 2000) {
  console.log(`🔍 Waiting for tx: ${txHash}`);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) {
        if (receipt.status === 1) {
          console.log(`✅ Tx confirmed: ${txHash}`);
          return { success: true, receipt };
        } else {
          console.error(`❌ Tx reverted: ${txHash}`);
          return { success: false, reason: "Transaction reverted on-chain" };
        }
      }
    } catch (err) {
      if (i === maxRetries - 1) return { success: false, reason: err.message };
    }
    await sleep(delayMs);
  }
  return { success: false, reason: "Timeout waiting for transaction" };
}

// ─── Read registry on-chain state ─────────────────────────────────────────────
// Returns: remainingValidation, isValidated, timeLockTimestamp
// IMPORTANT: remainingValidation uses _registryValidationCountRemains view helper.
// After proposeInitialization, the proposer has NOT voted yet — remaining = requiredValidationCount.
// After validateRegistry, remaining decrements. Once 0, isValidated becomes true and timeLock is set.
async function readRegistryState(registryAddress) {
  try {
    const multisig = getMultisig();

    // Call both in parallel for efficiency
    const [remaining, reg] = await Promise.all([
      multisig._registryValidationCountRemains(registryAddress),
      multisig._registry(registryAddress),
    ]);

    const remainingValidation = Number(remaining);
    const isValidated = reg.isValidated;
    // timeLock is a unix timestamp set by the contract when quorum is reached
    const timeLockTimestamp = isValidated && Number(reg.timeLock) > 0
      ? Number(reg.timeLock)
      : null;

    console.log(
      `📊 Registry ${registryAddress}: remaining=${remainingValidation}, isValidated=${isValidated}, timeLock=${timeLockTimestamp}`
    );

    return { remainingValidation, isValidated, timeLockTimestamp };
  } catch (e) {
    console.error("Could not read registry on-chain state:", e.message);
    return null;
  }
}

// ─── Read validator on-chain state ────────────────────────────────────────────
async function readValidatorState(targetAddress) {
  try {
    const multisig = getMultisig();

    const [remaining, update] = await Promise.all([
      multisig._validatorValidationCountRemains(targetAddress),
      multisig._updateValidator(targetAddress),
    ]);

    const remainingValidation = Number(remaining);
    const isValidated = update.isValidated;
    const timeLockTimestamp = isValidated && Number(update.timeLock) > 0
      ? Number(update.timeLock)
      : null;
    const action = update.action;

    console.log(
      `📊 Validator ${targetAddress}: remaining=${remainingValidation}, isValidated=${isValidated}, action=${action}, timeLock=${timeLockTimestamp}`
    );

    return { remainingValidation, isValidated, timeLockTimestamp, action };
  } catch (e) {
    console.error("Could not read validator on-chain state:", e.message);
    return null;
  }
}

// ─── GET /proposals — serve from DB ───────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 }).lean();
    res.json({
      registryProposals: all.filter((p) => p.type === "registry"),
      validatorProposals: all.filter((p) => p.type === "validator"),
    });
  } catch (e) {
    console.error("❌ Fetch proposals error:", e);
    res.status(500).json({ message: "Failed to fetch proposals" });
  }
});

// ─── PROPOSE REGISTRY ──────────────────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;

    if (!nspace?.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });
    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    // Prevent duplicate proposals
    const existing = await Proposal.findOne({
      type: "registry",
      registry: registry.toLowerCase(),
    });
    if (existing)
      return res.status(409).json({ message: "A proposal for this registry already exists" });

    // Submit the tx through the validator's Safe
    const result = await sponsorProposeInitialization(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      registry
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // Read on-chain state AFTER the tx is confirmed
    // After propose: proposer has NOT voted yet, remaining = requiredValidationCount
    const onChain = await readRegistryState(registry);

    const proposal = await Proposal.create({
      type: "registry",
      registry: registry.toLowerCase(),
      nspace,
      registryName: registryName || nspace,
      // If on-chain read fails, default to null (UI shows loading state)
      remainingValidation: onChain?.remainingValidation ?? null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    console.log(
      `✅ Registry proposal saved: ${proposal._id}, remaining=${proposal.remainingValidation}`
    );

    // Email ALL validators (including proposer)
    await notifyAllValidators("New Registry Proposal", {
      type: "registry",
      registryName: registryName || nspace,
      nspace,
      registry,
    });

    res.json({ success: true, taskId: result.taskId, proposal });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── PROPOSE VALIDATOR ─────────────────────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;

    if (!ethers.isAddress(targetAddress))
      return res.status(400).json({ message: "Invalid target address" });

    const existing = await Proposal.findOne({
      type: "validator",
      addr: targetAddress.toLowerCase(),
    });
    if (existing)
      return res.status(409).json({ message: "A proposal for this address already exists" });

    const result = await sponsorProposeValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
      action
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    const onChain = await readValidatorState(targetAddress);

    const proposal = await Proposal.create({
      type: "validator",
      addr: targetAddress.toLowerCase(),
      action: onChain?.action ?? action,
      remainingValidation: onChain?.remainingValidation ?? null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    console.log(
      `✅ Validator proposal saved: ${proposal._id}, remaining=${proposal.remainingValidation}`
    );

    await notifyAllValidators("New Validator Update Proposal", {
      type: "validator",
      targetAddress,
      action,
    });

    res.json({ success: true, taskId: result.taskId, proposal });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE REGISTRY ─────────────────────────────────────────────────────────
// Called by each validator to cast their vote.
// After this tx confirms: re-read on-chain state and update DB.
// If remainingValidation becomes 0: isValidated=true and timeLock is set by contract.
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;

    const result = await sponsorValidateRegistry(
      req.callerUser.safeAddress,
      privateKey,
      registry
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // CRITICAL: Read updated state from chain after the vote lands
    const onChain = await readRegistryState(registry);

    if (!onChain) {
      // On-chain read failed — return success but UI will poll
      return res.json({ success: true, taskId: result.taskId });
    }

    const updated = await Proposal.findOneAndUpdate(
      { type: "registry", registry: registry.toLowerCase() },
      {
        remainingValidation: onChain.remainingValidation,
        isValidated: onChain.isValidated,
        timeLockTimestamp: onChain.timeLockTimestamp,
        updatedAt: new Date(),
      },
      { new: true }
    );

    console.log(
      `✅ Registry proposal updated: remaining=${onChain.remainingValidation}, isValidated=${onChain.isValidated}, timeLock=${onChain.timeLockTimestamp}`
    );

    res.json({ success: true, taskId: result.taskId, proposal: updated });
  } catch (error) {
    console.error("❌ Validate registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE VALIDATOR ────────────────────────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;

    const result = await sponsorValidateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    const onChain = await readValidatorState(targetAddress);

    if (!onChain) {
      return res.json({ success: true, taskId: result.taskId });
    }

    const updated = await Proposal.findOneAndUpdate(
      { type: "validator", addr: targetAddress.toLowerCase() },
      {
        remainingValidation: onChain.remainingValidation,
        isValidated: onChain.isValidated,
        timeLockTimestamp: onChain.timeLockTimestamp,
        updatedAt: new Date(),
      },
      { new: true }
    );

    console.log(
      `✅ Validator proposal updated: remaining=${onChain.remainingValidation}, isValidated=${onChain.isValidated}, timeLock=${onChain.timeLockTimestamp}`
    );

    res.json({ success: true, taskId: result.taskId, proposal: updated });
  } catch (error) {
    console.error("❌ Validate validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL REGISTRY ───────────────────────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;

    const result = await sponsorCancelInit(
      req.callerUser.safeAddress,
      privateKey,
      registry
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({ type: "registry", registry: registry.toLowerCase() });
      console.log(`✅ Registry proposal deleted from DB: ${registry}`);
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL VALIDATOR ──────────────────────────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;

    const result = await sponsorCancelValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({ type: "validator", addr: targetAddress.toLowerCase() });
      console.log(`✅ Validator proposal deleted from DB: ${targetAddress}`);
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE REGISTRY ──────────────────────────────────────────────────────────
// Only callable after isValidated=true AND timeLock has expired.
// The contract enforces this — it will revert if called too early.
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;

    const result = await sponsorExecuteInit(
      req.callerUser.safeAddress,
      privateKey,
      registry
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({ type: "registry", registry: registry.toLowerCase() });
      console.log(`✅ Registry proposal executed and deleted: ${registry}`);

      // Add to WalletRegistry so it appears in transfer dropdowns
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: registry.toLowerCase() },
        {
          name: registryName || nspace,
          nspace: nspace || "",
          registryAddress: registry.toLowerCase(),
          active: true,
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Registry ${nspace} added to WalletRegistry`);
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE VALIDATOR UPDATE ──────────────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;

    const result = await sponsorExecuteUpdateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({ type: "validator", addr: targetAddress.toLowerCase() });
      console.log(`✅ Validator proposal executed and deleted: ${targetAddress}`);

      const updated = await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action },
        { new: true }
      );

      if (updated) {
        console.log(`✅ User ${updated.username} isValidator set to ${action}`);
      } else {
        console.warn(`⚠️ No user found with safeAddress ${targetAddress}`);
      }
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;