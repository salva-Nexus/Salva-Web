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
  sponsorSafeTransferETH,
  sponsorSafeTransferBase,
} = require("../services/relayService");

// ─── Multisig read ABI (VIEW only) ───────────────────────────────────────────
const MULTISIG_READ_ABI = [
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

// ─── Startup logs ────────────────────────────────────────────────────────────
console.log("🚀 ADMIN ROUTES INITIALIZED:");
console.log("Registry:", process.env.REGISTRY_CONTRACT_ADDRESS);
console.log("MultiSig:", process.env.MULTISIG_CONTRACT_ADDRESS);
console.log("NGN Token:", process.env.NGN_TOKEN_ADDRESS);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getMultisig() {
  return new ethers.Contract(
    process.env.MULTISIG_CONTRACT_ADDRESS,
    MULTISIG_READ_ABI,
    provider,
  );
}

function normalizeAddr(addr) {
  if (!addr) return null;
  try {
    return ethers.getAddress(addr.toLowerCase());
  } catch {
    return null;
  }
}

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

// ─── GET /proposals ───────────────────────────────────────────────────────────
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

// ─── PROPOSE REGISTRY ─────────────────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    let { privateKey, nspace, registry, registryName, chain } = req.body;

    if (!nspace?.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });

    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    const existing = await Proposal.findOne({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
    });
    if (existing)
      return res
        .status(409)
        .json({ message: "A proposal for this registry already exists" });

    const sponsorFn =
      chain === "base"
        ? sponsorProposeInitialization((safeAddress) => safeAddress).base
        : sponsorProposeInitialization((safeAddress) => safeAddress).eth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      cleanRegistry,
    );

    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

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

// ─── PROPOSE VALIDATOR ───────────────────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    let { privateKey, targetAddress, action, chain } = req.body;

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

    const sponsorFn =
      chain === "base"
        ? sponsorProposeValidatorUpdate().base
        : sponsorProposeValidatorUpdate().eth;

    const result = await sponsorFn(
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

// ─── VALIDATE / CANCEL / EXECUTE ─────────────────────────────────────────────

// Helper: execute multisig call & update DB
async function handleSimpleMultisig(
  req,
  res,
  sponsorFnBuilder,
  recordSelector,
  recordRemoval = false,
) {
  try {
    let { privateKey, chain } = req.body;
    const normalized = normalizeAddr(req.body[recordSelector.key]);
    if (!normalized)
      return res.status(400).json({ message: `Invalid ${recordSelector.key}` });

    const sponsorFn =
      chain === "base" ? sponsorFnBuilder().base : sponsorFnBuilder().eth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      normalized,
      ...(recordSelector.extraArgs || []),
    );
    const txStatus = await waitForTx(result.taskId);
    if (!txStatus.success)
      return res.status(500).json({ message: txStatus.reason });

    if (recordRemoval) {
      await Proposal.deleteOne(recordSelector.query(normalized));
    }

    res.json({ success: txStatus.success, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Multisig execution error:", error);
    res.status(500).json({ message: error.message });
  }
}

// VALIDATE REGISTRY
router.post("/validate-registry", requireValidator, async (req, res) => {
  return handleSimpleMultisig(req, res, sponsorValidateRegistry, {
    key: "registry",
    query: (normalized) => ({
      type: "registry",
      registry: normalized.toLowerCase(),
    }),
  });
});

// VALIDATE VALIDATOR
router.post("/validate-validator", requireValidator, async (req, res) => {
  return handleSimpleMultisig(req, res, sponsorValidateValidator, {
    key: "targetAddress",
    query: (normalized) => ({
      type: "validator",
      addr: normalized.toLowerCase(),
    }),
  });
});

// CANCEL REGISTRY
router.post("/cancel-registry", requireValidator, async (req, res) => {
  return handleSimpleMultisig(
    req,
    res,
    sponsorCancelInit,
    {
      key: "registry",
      query: (normalized) => ({
        type: "registry",
        registry: normalized.toLowerCase(),
      }),
    },
    true,
  );
});

// CANCEL VALIDATOR
router.post("/cancel-validator", requireValidator, async (req, res) => {
  return handleSimpleMultisig(
    req,
    res,
    sponsorCancelValidatorUpdate,
    {
      key: "targetAddress",
      query: (normalized) => ({
        type: "validator",
        addr: normalized.toLowerCase(),
      }),
    },
    true,
  );
});

// EXECUTE REGISTRY
router.post("/execute-registry", requireValidator, async (req, res) => {
  return handleSimpleMultisig(
    req,
    res,
    sponsorExecuteInit,
    {
      key: "registry",
      query: (normalized) => ({
        type: "registry",
        registry: normalized.toLowerCase(),
      }),
    },
    true,
  );
});

// EXECUTE VALIDATOR UPDATE
router.post("/execute-validator", requireValidator, async (req, res) => {
  return handleSimpleMultisig(
    req,
    res,
    sponsorExecuteUpdateValidator,
    {
      key: "targetAddress",
      query: (normalized) => ({
        type: "validator",
        addr: normalized.toLowerCase(),
      }),
    },
    true,
  );
});

module.exports = router;
