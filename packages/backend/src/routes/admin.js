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

// ─── UPDATED GET PROPOSALS ──────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    for (const p of all) {
      try {
        let remaining = (p.type === "registry") 
          ? await getRegistryRemaining(p.registry) 
          : await getValidatorRemaining(p.addr);

        if (remaining === null) continue;

        const isValidated = remaining === 0;

        if (isValidated) {
          if (!p.timeLockTimestamp) {
            p.timeLockTimestamp = Math.floor(Date.now() / 1000) + (48 * 60 * 60);
          }
          
          // ⚡️ TOGGLE THIS LINE TO BYPASS TIME
          // p.timeLockTimestamp = Math.floor(Date.now() / 1000) - 3600; 
        }

        p.remainingValidation = remaining;
        p.isValidated = isValidated;
        await p.save();
      } catch (err) {
        console.error(`Sync error for ${p._id}:`, err.message);
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

// ─── UPDATED VALIDATE ROUTE (Background Debugging) ──────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, chain = "base" } = req.body;
    const cleanRegistry = normalizeAddr(registry);

    const sponsorFn = (chain === "base") 
      ? relay.sponsorValidateRegistryBase 
      : relay.sponsorValidateRegistryEth;
      
    const result = await sponsorFn(req.callerUser.safeAddress, privateKey, cleanRegistry);

    res.json({ success: true, taskId: result.taskId });

    // Added explicit error catching here
    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          const remaining = await getRegistryRemaining(cleanRegistry);
          const isValidated = remaining === 0;
          await Proposal.findOneAndUpdate(
            { type: "registry", registry: cleanRegistry.toLowerCase() },
            { 
              remainingValidation: remaining, 
              isValidated,
              timeLockTimestamp: isValidated ? Math.floor(Date.now() / 1000) + 172800 : null 
            }
          );
          console.log(`✅ Validation Sync Complete for ${cleanRegistry}`);
        } else {
          console.error(`❌ Chain Transaction Reverted for Task: ${result.taskId}`);
        }
      })
      .catch(err => console.error("🔥 Background Sync Fatal Error:", err)); // Look for this in logs

  } catch (error) {
    console.error("💥 Route Entry Error:", error.message);
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
