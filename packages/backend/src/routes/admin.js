// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
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

// ─── Multisig read ABI (view functions only) ──────────────────────────────────
const MULTISIG_READ_ABI = [
  "function _registry(address) view returns (address registryAddress, bytes16 nspace, uint128 requiredValidationCount, uint128 validationCount, uint256 timeLock, bool isProposed, bool isValidated, bool isExecuted)",
  "function _updateValidator(address) view returns (address addr, bool action, uint128 requiredValidationCount, uint128 validationCount, uint256 timeLock, bool isProposed, bool isValidated, bool isExecuted)",
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

const MULTISIG_IFACE = new ethers.Interface([
  "function proposeInitialization(string,address) external returns (address,string,bytes16,uint32)",
  "function proposeValidatorUpdate(address,bool) external returns (address,bool,uint32)",
  "function validateRegistry(address) external returns (address,bytes16,uint32)",
  "function validateValidator(address) external returns (address,bool,uint32)",
  "function cancelInit(address) external returns (bool)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  "function executeInit(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
]);

// In-memory proposals cache — shared across all validators in the same server process.
// Registry restarts wipe it; validators will just see empty lists and can re-propose.
let proposalsCache = {
  registryProposals: [],
  validatorProposals: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getMultisig() {
  return new ethers.Contract(
    process.env.MULTISIG_CONTRACT_ADDRESS,
    MULTISIG_READ_ABI,
    provider,
  );
}

// ─── Middleware ───────────────────────────────────────────────────────────────
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

// ─── Notify all other validators by email ────────────────────────────────────
async function notifyValidators(excludeAddress, subject, payload) {
  const validators = await User.find({
    isValidator: true,
    safeAddress: { $ne: excludeAddress.toLowerCase() },
  });
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

// ─── Wait for a regular tx receipt ───────────────────────────────────────────
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

// ─── Cache helpers ────────────────────────────────────────────────────────────
function upsertRegProposal(patch) {
  const idx = proposalsCache.registryProposals.findIndex(
    (p) => p.registry === patch.registry,
  );
  if (idx === -1) proposalsCache.registryProposals.push(patch);
  else
    proposalsCache.registryProposals[idx] = {
      ...proposalsCache.registryProposals[idx],
      ...patch,
    };
}

function upsertValProposal(patch) {
  const idx = proposalsCache.validatorProposals.findIndex(
    (p) => p.addr === patch.addr,
  );
  if (idx === -1) proposalsCache.validatorProposals.push(patch);
  else
    proposalsCache.validatorProposals[idx] = {
      ...proposalsCache.validatorProposals[idx],
      ...patch,
    };
}

const removeRegProposal = (reg) => {
  proposalsCache.registryProposals = proposalsCache.registryProposals.filter(
    (p) => p.registry !== reg.toLowerCase(),
  );
};
const removeValProposal = (addr) => {
  proposalsCache.validatorProposals = proposalsCache.validatorProposals.filter(
    (p) => p.addr !== addr.toLowerCase(),
  );
};

// ─── Routes ───────────────────────────────────────────────────────────────────
router.get("/proposals", (req, res) => res.json(proposalsCache));

// ─── PROPOSE REGISTRY ─────────────────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;

    if (!nspace?.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });
    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorProposeInitialization(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      registry,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // Read on-chain remaining count using the dedicated view helper
    let remainingValidation = null;
    try {
      const multisig = getMultisig();
      const remaining = await multisig._registryValidationCountRemains(
        registry.toLowerCase(),
      );
      remainingValidation = Number(remaining);
    } catch (e) {
      console.error("Could not read registry remaining count:", e.message);
    }

    const registryKey = registry.toLowerCase();
    upsertRegProposal({
      type: "registry",
      registry: registryKey,
      nspace,
      registryName: registryName || nspace,
      remainingValidation,
      isValidated: false,
      timeLockTimestamp: null,
    });

    // Email all other validators
    await notifyValidators(
      req.callerUser.safeAddress,
      "New Registry Proposal",
      {
        type: "registry",
        registryName: registryName || nspace,
        nspace,
        registry,
      },
    );

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── PROPOSE VALIDATOR ────────────────────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;

    if (!ethers.isAddress(targetAddress))
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorProposeValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
      action,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    let remainingValidation = null;
    let resolvedAction = action;
    try {
      const multisig = getMultisig();
      const remaining =
        await multisig._validatorValidationCountRemains(targetAddress);
      remainingValidation = Number(remaining);
      // Also read action from on-chain to be safe
      const update = await multisig._updateValidator(targetAddress);
      resolvedAction = update.action;
    } catch (e) {
      console.error("Could not read validator remaining count:", e.message);
    }

    upsertValProposal({
      type: "validator",
      addr: targetAddress.toLowerCase(),
      action: resolvedAction,
      remainingValidation,
      isValidated: false,
      timeLockTimestamp: null,
    });

    await notifyValidators(req.callerUser.safeAddress, "New Validator Update", {
      type: "validator",
      targetAddress,
      action,
    });

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE REGISTRY ────────────────────────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;

    const result = await sponsorValidateRegistry(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    // Read updated remaining count + timelock state from chain
    try {
      const multisig = getMultisig();

      const remaining =
        await multisig._registryValidationCountRemains(registry);
      const remainingValidation = Number(remaining);

      // Read full struct for isValidated + timeLock
      const reg = await multisig._registry(registry);
      const isValidated = reg.isValidated;
      const timeLockTimestamp = isValidated ? Number(reg.timeLock) : null;

      upsertRegProposal({
        registry: registry.toLowerCase(),
        remainingValidation,
        isValidated,
        timeLockTimestamp,
      });
    } catch (e) {
      console.error(
        "Could not read registry state after validation:",
        e.message,
      );
    }

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE VALIDATOR ───────────────────────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;

    const result = await sponsorValidateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    try {
      const multisig = getMultisig();

      const remaining =
        await multisig._validatorValidationCountRemains(targetAddress);
      const remainingValidation = Number(remaining);

      const update = await multisig._updateValidator(targetAddress);
      const isValidated = update.isValidated;
      const timeLockTimestamp = isValidated ? Number(update.timeLock) : null;

      upsertValProposal({
        addr: targetAddress.toLowerCase(),
        remainingValidation,
        isValidated,
        timeLockTimestamp,
      });
    } catch (e) {
      console.error(
        "Could not read validator state after validation:",
        e.message,
      );
    }

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL REGISTRY ──────────────────────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;
    const result = await sponsorCancelInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const txStatus = await waitForTx(result.taskId);
    if (txStatus.success) {
      removeRegProposal(registry);
      console.log(`✅ Registry proposal cancelled: ${registry}`);
    }
    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL VALIDATOR ─────────────────────────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const result = await sponsorCancelValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const txStatus = await waitForTx(result.taskId);
    if (txStatus.success) {
      removeValProposal(targetAddress);
      console.log(`✅ Validator proposal cancelled: ${targetAddress}`);
    }
    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE REGISTRY ─────────────────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;

    const result = await sponsorExecuteInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      removeRegProposal(registry);

      // Add to WalletRegistry so transfer dropdowns show it
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: registry.toLowerCase() },
        {
          name: registryName || nspace,
          nspace: nspace || "",
          registryAddress: registry.toLowerCase(),
          active: true,
        },
        { upsert: true, new: true },
      );

      console.log(
        `✅ Registry ${nspace} (${registry}) added to WalletRegistry`,
      );
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE VALIDATOR UPDATE ─────────────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;

    const result = await sponsorExecuteUpdateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const txStatus = await waitForTx(result.taskId);

    if (txStatus.success) {
      removeValProposal(targetAddress);

      // Update isValidator flag in DB for the target user
      const updated = await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action },
        { new: true },
      );

      if (updated) {
        console.log(`✅ User ${updated.username} isValidator set to ${action}`);
      } else {
        console.warn(
          `⚠️ No user found with safeAddress ${targetAddress} — isValidator not updated in DB`,
        );
      }
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
