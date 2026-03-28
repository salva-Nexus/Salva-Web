const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const Proposal = require("../models/Proposal");
const { sendValidatorProposalEmail } = require("../services/emailService");
const relay = require("../services/relayService");

// ─── Multisig read ABI ──────────────────────────────────────────────
const MULTISIG_READ_ABI = [
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

// ─── Startup Logging ───────────────────────────────────────────────
console.log("🚀 ADMIN ROUTES INITIALIZED");

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
  } catch (e) {
    return null;
  }
}

// ─── Middleware ──────────────────────────────────────────────────
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

// ─── Email Helpers ────────────────────────────────────────────────
async function notifyAllValidators(subject, payload) {
  const validators = await User.find({ isValidator: true });
  for (const v of validators) {
    if (v.email) {
      try {
        await sendValidatorProposalEmail(v.email, v.username, subject, payload);
      } catch (e) {
        console.error(`📧 Failed email to ${v.email}:`, e.message);
      }
    }
  }
}

// ─── Background Sync Helper ───────────────────────────────────────
async function waitForTx(txHash, maxRetries = 30, delayMs = 2000) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return { success: receipt.status === 1 };
    } catch (err) {
      if (i === maxRetries - 1) return { success: false };
    }
    await sleep(delayMs);
  }
  return { success: false };
}

// ─── On-Chain Read Helpers ───────────────────────────────────────
async function getRegistryRemaining(addr) {
  try {
    const remains = await getMultisig()._registryValidationCountRemains(
      normalizeAddr(addr),
    );
    return Number(remains);
  } catch (e) {
    return null;
  }
}

async function getValidatorRemaining(addr) {
  try {
    const remains = await getMultisig()._validatorValidationCountRemains(
      normalizeAddr(addr),
    );
    return Number(remains);
  } catch (e) {
    return null;
  }
}

// ─── ROUTES ──────────────────────────────────────────────────────

router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    // ─── Refresh Loop ──────────────────────────────────────────────
    for (const p of all) {
      try {
        let remaining = null;

        // 1. Fetch live "Remaining Votes" from MultiSig
        if (p.type === "registry") {
          remaining = await getRegistryRemaining(p.registry);
        } else {
          remaining = await getValidatorRemaining(p.addr);
        }

        if (remaining === null) continue;

        const isValidated = remaining === 0;

        // 2. Handle Timelock Calculation
        if (isValidated) {
          // If validated but no timestamp exists, set it to 48h from now
          if (!p.timeLockTimestamp) {
            p.timeLockTimestamp = Math.floor(Date.now() / 1000) + 48 * 60 * 60;
          }

          // ─── DEBUG TIME MACHINE ──────────────────────────────────
          // UNCOMMENT the line below to bypass the 48h wait and test EXECUTE immediately
          // p.timeLockTimestamp = Math.floor(Date.now() / 1000) - 3600;
          // ─────────────────────────────────────────────────────────
        }

        // 3. Update the database entry with fresh stats
        p.remainingValidation = remaining;
        p.isValidated = isValidated;
        p.updatedAt = new Date();

        await p.save();
      } catch (err) {
        console.error(`❌ Sync failed for proposal ${p._id}:`, err.message);
      }
    }

    // 4. Return filtered results to the dashboard
    res.json({
      registryProposals: all.filter((p) => p.type === "registry"),
      validatorProposals: all.filter((p) => p.type === "validator"),
    });
  } catch (e) {
    console.error("❌ Proposals Route Error:", e);
    res.status(500).json({ message: "Failed to fetch proposals" });
  }
});

router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const {
      privateKey,
      nspace,
      registry,
      registryName,
      chain = "base",
    } = req.body;
    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid address" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorProposeInitializationBase
        : relay.sponsorProposeInitializationEth;
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      cleanRegistry,
    );

    // Create DB entry immediately
    const proposal = await Proposal.create({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
      nspace,
      registryName: registryName || nspace,
      remainingValidation: 1, // Defaulting to 1 pending sync
      isValidated: false,
    });

    res.json({ success: true, taskId: result.taskId, proposal });

    // Background Sync
    waitForTx(result.taskId).then(async (status) => {
      if (status.success) {
        const remaining = await getRegistryRemaining(cleanRegistry);
        await Proposal.updateOne(
          { _id: proposal._id },
          { remainingValidation: remaining },
        );
        notifyAllValidators("New Registry Proposal", {
          nspace,
          registry: cleanRegistry,
        });
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, chain = "base" } = req.body;
    const cleanRegistry = normalizeAddr(registry);

    const sponsorFn =
      chain === "base"
        ? relay.sponsorValidateRegistryBase
        : relay.sponsorValidateRegistryEth;
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId).then(async (status) => {
      if (status.success) {
        const remaining = await getRegistryRemaining(cleanRegistry);
        const isValidated = remaining === 0;
        await Proposal.findOneAndUpdate(
          { type: "registry", registry: cleanRegistry.toLowerCase() },
          {
            remainingValidation: remaining,
            isValidated,
            timeLockTimestamp: isValidated
              ? Math.floor(Date.now() / 1000) + 172800
              : null,
          },
        );
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const {
      privateKey,
      registry,
      registryName,
      nspace,
      chain = "base",
    } = req.body;
    const cleanRegistry = normalizeAddr(registry);

    const sponsorFn =
      chain === "base"
        ? relay.sponsorExecuteInitBase
        : relay.sponsorExecuteInitEth;
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({
          type: "registry",
          registry: cleanRegistry.toLowerCase(),
        });
        await WalletRegistry.findOneAndUpdate(
          { registryAddress: cleanRegistry.toLowerCase() },
          { name: registryName || nspace, nspace: nspace || "", active: true },
          { upsert: true },
        );
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Note: Validator Propose/Validate/Execute follow the exact same non-blocking pattern
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action, chain = "base" } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);

    const sponsorFn =
      chain === "base"
        ? relay.sponsorProposeValidatorUpdateBase
        : relay.sponsorProposeValidatorUpdateEth;
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
      action,
    );

    const proposal = await Proposal.create({
      type: "validator",
      addr: cleanTarget.toLowerCase(),
      action,
      remainingValidation: 1,
      isValidated: false,
    });

    res.json({ success: true, taskId: result.taskId, proposal });

    waitForTx(result.taskId).then(async (status) => {
      if (status.success) {
        const remaining = await getValidatorRemaining(cleanTarget);
        await Proposal.updateOne(
          { _id: proposal._id },
          { remainingValidation: remaining },
        );
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, chain = "base" } = req.body;
    const cleanRegistry = normalizeAddr(registry);
    const sponsorFn =
      chain === "base"
        ? relay.sponsorCancelInitBase
        : relay.sponsorCancelInitEth;
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanRegistry,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({
          type: "registry",
          registry: cleanRegistry.toLowerCase(),
        });
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
