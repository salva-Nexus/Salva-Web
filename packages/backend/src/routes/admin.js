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
const MULTISIG_READ_ABI = [
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

function getMultisig() {
  return new ethers.Contract(
    process.env.MULTISIG_CONTRACT_ADDRESS,
    MULTISIG_READ_ABI,
    provider,
  );
}

// ─── Helper: Normalize Address ────────────────────────────────────────────────
// This prevents "bad address checksum" errors by forcing lowercase then re-checksumming
function normalizeAddr(addr) {
  if (!addr) return null;
  try {
    return ethers.getAddress(addr.toLowerCase());
  } catch (e) {
    return null;
  }
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

async function getRegistryRemaining(registryAddress) {
  try {
    const multisig = getMultisig();
    const remaining = await multisig._registryValidationCountRemains(
      normalizeAddr(registryAddress),
    );
    return Number(remaining);
  } catch (e) {
    console.error("Registry read failed:", e);
    return null;
  }
}

async function getValidatorRemaining(addr) {
  try {
    const multisig = getMultisig();
    const remaining = await multisig._validatorValidationCountRemains(
      normalizeAddr(addr),
    );
    return Number(remaining);
  } catch (e) {
    console.error("Validator read failed:", e);
    return null;
  }
}

// ─── GET /proposals — serve from DB ───────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    for (const p of all) {
      try {
        let remaining = null;

        if (p.type === "registry") {
          remaining = await getRegistryRemaining(p.registry);
        } else {
          remaining = await getValidatorRemaining(p.addr);
        }

        if (remaining === null) continue;

        const isValidated = remaining === 0;

        // ONLY set timelock ONCE
        if (isValidated && !p.timeLockTimestamp) {
          p.timeLockTimestamp = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
        }

        p.remainingValidation = remaining;
        p.isValidated = isValidated;
        p.updatedAt = new Date();

        await p.save();
      } catch (e) {
        console.error("Refresh error:", e);
      }
    }

    res.json({
      registryProposals: all.filter((p) => p.type === "registry"),
      validatorProposals: all.filter((p) => p.type === "validator"),
    });
  } catch (e) {
    res.status(500).json({ message: "Failed to fetch proposals" });
  }
});

// ─── PROPOSE REGISTRY ──────────────────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    let { privateKey, nspace, registry, registryName } = req.body;

    if (!nspace?.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });

    // NORMALIZE FIX
    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    // Prevent duplicate proposals
    const existing = await Proposal.findOne({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
    });
    if (existing)
      return res
        .status(409)
        .json({ message: "A proposal for this registry already exists" });

    // Submit the tx through the validator's Safe
    const result = await sponsorProposeInitialization(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      cleanRegistry,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // Read on-chain state AFTER the tx is confirmed
    const remaining = await getRegistryRemaining(cleanRegistry);

    const proposal = await Proposal.create({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
      nspace,
      registryName: registryName || nspace,
      remainingValidation: remaining,
      isValidated: false,
      timeLockTimestamp: null,
    });

    // Email ALL validators (including proposer)
    await notifyAllValidators("New Registry Proposal", {
      type: "registry",
      registryName: registryName || nspace,
      nspace,
      registry: cleanRegistry,
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
    let { privateKey, targetAddress, action } = req.body;

    // NORMALIZE FIX
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const existing = await Proposal.findOne({
      type: "validator",
      addr: cleanTarget.toLowerCase(),
    });
    if (existing)
      return res
        .status(409)
        .json({ message: "A proposal for this address already exists" });

    const result = await sponsorProposeValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
      action,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    const remaining = await getValidatorRemaining(cleanTarget);

    const proposal = await Proposal.create({
      type: "validator",
      addr: cleanTarget.toLowerCase(),
      action,
      remainingValidation: remaining,
      isValidated: false,
      timeLockTimestamp: null,
    });

    console.log(
      `✅ Validator proposal saved: ${proposal._id}, remaining=${proposal.remainingValidation}`,
    );

    await notifyAllValidators("New Validator Update Proposal", {
      type: "validator",
      targetAddress: cleanTarget,
      action,
    });

    res.json({ success: true, taskId: result.taskId, proposal });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE REGISTRY ─────────────────────────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    let { privateKey, registry } = req.body;

    // NORMALIZE FIX
    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorValidateRegistry(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // CRITICAL: Read updated state from chain after the vote lands
    const remaining = await getRegistryRemaining(cleanRegistry);

    const isValidated = remaining === 0;
    const timeLockTimestamp = isValidated
      ? Math.floor(Date.now() / 1000) + 48 * 60 * 60
      : null;

    const updated = await Proposal.findOneAndUpdate(
      { type: "registry", registry: cleanRegistry.toLowerCase() },
      {
        remainingValidation: remaining,
        isValidated,
        timeLockTimestamp,
        updatedAt: new Date(),
      },
      { new: true },
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
    let { privateKey, targetAddress } = req.body;

    // NORMALIZE FIX
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorValidateValidator(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    const remaining = await getValidatorRemaining(cleanTarget);

    const isValidated = remaining === 0;
    const timeLockTimestamp = isValidated
      ? Math.floor(Date.now() / 1000) + 48 * 60 * 60
      : null;

    const updated = await Proposal.findOneAndUpdate(
      { type: "validator", addr: cleanTarget.toLowerCase() },
      {
        remainingValidation: remaining,
        isValidated,
        timeLockTimestamp,
        updatedAt: new Date(),
      },
      { new: true },
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
    let { privateKey, registry } = req.body;

    // NORMALIZE FIX
    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorCancelInit(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({
        type: "registry",
        registry: cleanRegistry.toLowerCase(),
      });
      console.log(`✅ Registry proposal deleted from DB: ${cleanRegistry}`);
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
    let { privateKey, targetAddress } = req.body;

    // NORMALIZE FIX
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorCancelValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({
        type: "validator",
        addr: cleanTarget.toLowerCase(),
      });
      console.log(`✅ Validator proposal deleted from DB: ${cleanTarget}`);
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE REGISTRY ──────────────────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    let { privateKey, registry, registryName, nspace } = req.body;

    // NORMALIZE FIX
    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorExecuteInit(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({
        type: "registry",
        registry: cleanRegistry.toLowerCase(),
      });
      console.log(
        `✅ Registry proposal executed and deleted: ${cleanRegistry}`,
      );

      // Add to WalletRegistry so it appears in transfer dropdowns
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: cleanRegistry.toLowerCase() },
        {
          name: registryName || nspace,
          nspace: nspace || "",
          registryAddress: cleanRegistry.toLowerCase(),
          active: true,
        },
        { upsert: true, new: true },
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
    let { privateKey, targetAddress, action } = req.body;

    // NORMALIZE FIX
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorExecuteUpdateValidator(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      await Proposal.deleteOne({
        type: "validator",
        addr: cleanTarget.toLowerCase(),
      });
      console.log(`✅ Validator proposal executed and deleted: ${cleanTarget}`);

      const updated = await User.findOneAndUpdate(
        { safeAddress: cleanTarget.toLowerCase() },
        { isValidator: action },
        { new: true },
      );

      if (updated) {
        console.log(`✅ User ${updated.username} isValidator set to ${action}`);
      } else {
        console.warn(`⚠️ No user found with safeAddress ${cleanTarget}`);
      }
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res.status(500).json({ message: error.message });
  }
});


module.exports = router;
