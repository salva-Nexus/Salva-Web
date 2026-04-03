// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const Proposal = require("../models/Proposal");
const { sendValidatorProposalEmail } = require("../services/emailService");
const relay = require("../services/relayService");

// ─── Multisig read ABI ────────────────────────────────────────────
const MULTISIG_READ_ABI = [
  "function _registryValidationCountRemains(address) view returns (uint256)",
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

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

// ─── Middleware ───────────────────────────────────────────────────
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

// ─── Email helpers ────────────────────────────────────────────────
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

// ─── Tx polling (non-blocking) ────────────────────────────────────
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

// ─── On-chain read helpers ────────────────────────────────────────
async function getRegistryRemaining(addr) {
  try {
    const remains = await getMultisig()._registryValidationCountRemains(
      normalizeAddr(addr),
    );
    return Number(remains);
  } catch (e) {
    console.error("Registry read failed:", e.message);
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
    console.error("Validator read failed:", e.message);
    return null;
  }
}

// ─── GET /proposals ───────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    for (const p of all) {
      try {
        let remaining =
          p.type === "registry"
            ? await getRegistryRemaining(p.registry)
            : await getValidatorRemaining(p.addr);

        if (remaining === null) continue;

        const isValidated = remaining === 0;

        // Set timelock only once when quorum is first reached
        if (isValidated && !p.timeLockTimestamp) {

          p.timeLockTimestamp = Math.floor(Date.now() / 1000) + 120; // 2 minutes from now
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

// ─── PROPOSE REGISTRY ─────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const {
      privateKey,
      nspace,
      registry,
      registryName,
      isWallet = false,
      chain = "base",
    } = req.body;

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
        ? relay.sponsorProposeInitializationBase
        : relay.sponsorProposeInitializationEth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      cleanRegistry,
    );

    // Return immediately, sync in background
    const proposal = await Proposal.create({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
      nspace,
      registryName: registryName || nspace,
      isWallet: !!isWallet,
      remainingValidation: null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    res.json({ success: true, taskId: result.taskId, proposal });

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          const remaining = await getRegistryRemaining(cleanRegistry);
          await Proposal.updateOne(
            { _id: proposal._id },
            { remainingValidation: remaining },
          );
          await notifyAllValidators("New Registry Proposal", {
            type: "registry",
            registryName: registryName || nspace,
            nspace,
            registry: cleanRegistry,
            isWallet: !!isWallet,
          });
          console.log(`✅ Registry proposal synced: remaining=${remaining}`);
        } else {
          await Proposal.deleteOne({ _id: proposal._id });
          console.error(`❌ propose-registry tx failed, proposal removed`);
        }
      })
      .catch((err) =>
        console.error("❌ propose-registry bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ propose-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE REGISTRY ────────────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, chain = "base" } = req.body;

    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

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
              // Set 48h timelock only when quorum is first reached
              timeLockTimestamp: isValidated
                ? Math.floor(Date.now() / 1000) + 48 * 60 * 60
                : null,
            },
          );
          console.log(
            `✅ Registry validated. remaining=${remaining}${isValidated ? " — 48h timelock started." : ""}`,
          );
        }
      })
      .catch((err) =>
        console.error("❌ validate-registry bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ validate-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL REGISTRY ──────────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, chain = "base" } = req.body;

    const cleanRegistry = normalizeAddr(registry);
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

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

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          await Proposal.deleteOne({
            type: "registry",
            registry: cleanRegistry.toLowerCase(),
          });
          console.log(
            `✅ Registry proposal cancelled and removed: ${cleanRegistry}`,
          );
        }
      })
      .catch((err) =>
        console.error("❌ cancel-registry bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ cancel-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE REGISTRY ─────────────────────────────────────────────
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
    if (!cleanRegistry)
      return res.status(400).json({ message: "Invalid registry address" });

    // Fetch the proposal now so we have isWallet available in the background handler
    const proposal = await Proposal.findOne({
      type: "registry",
      registry: cleanRegistry.toLowerCase(),
    });

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

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          await Proposal.deleteOne({
            type: "registry",
            registry: cleanRegistry.toLowerCase(),
          });

          // Only add to WalletRegistry if isWallet was flagged on the proposal
          if (proposal?.isWallet) {
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
            console.log(
              `✅ Registry executed and added to WalletRegistry (isWallet=true): ${nspace} → ${cleanRegistry}`,
            );
          } else {
            console.log(
              `✅ Registry executed on-chain (isWallet=false, not added to WalletRegistry): ${nspace} → ${cleanRegistry}`,
            );
          }
        }
      })
      .catch((err) =>
        console.error("❌ execute-registry bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ execute-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── PROPOSE VALIDATOR ────────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action, chain = "base" } = req.body;

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
      remainingValidation: null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    res.json({ success: true, taskId: result.taskId, proposal });

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          const remaining = await getValidatorRemaining(cleanTarget);
          await Proposal.updateOne(
            { _id: proposal._id },
            { remainingValidation: remaining },
          );
          await notifyAllValidators("New Validator Update Proposal", {
            type: "validator",
            targetAddress: cleanTarget,
            action,
          });
          console.log(`✅ Validator proposal synced: remaining=${remaining}`);
        } else {
          await Proposal.deleteOne({ _id: proposal._id });
          console.error(`❌ propose-validator tx failed, proposal removed`);
        }
      })
      .catch((err) =>
        console.error("❌ propose-validator bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ propose-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE VALIDATOR ───────────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, chain = "base" } = req.body;

    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorValidateValidatorBase
        : relay.sponsorValidateValidatorEth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          const remaining = await getValidatorRemaining(cleanTarget);
          const isValidated = remaining === 0;

          await Proposal.findOneAndUpdate(
            { type: "validator", addr: cleanTarget.toLowerCase() },
            {
              remainingValidation: remaining,
              isValidated,
              // Set 48h timelock only when quorum is first reached
              timeLockTimestamp: isValidated
                ? Math.floor(Date.now() / 1000) + 48 * 60 * 60
                : null,
            },
          );
          console.log(
            `✅ Validator validated. remaining=${remaining}${isValidated ? " — 48h timelock started." : ""}`,
          );
        }
      })
      .catch((err) =>
        console.error("❌ validate-validator bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ validate-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── CANCEL VALIDATOR ─────────────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, chain = "base" } = req.body;

    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorCancelValidatorUpdateBase
        : relay.sponsorCancelValidatorUpdateEth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          await Proposal.deleteOne({
            type: "validator",
            addr: cleanTarget.toLowerCase(),
          });
          console.log(
            `✅ Validator proposal cancelled and removed: ${cleanTarget}`,
          );
        }
      })
      .catch((err) =>
        console.error("❌ cancel-validator bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ cancel-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── EXECUTE VALIDATOR UPDATE ─────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action, chain = "base" } = req.body;

    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)
      return res.status(400).json({ message: "Invalid target address" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorExecuteUpdateValidatorBase
        : relay.sponsorExecuteUpdateValidatorEth;

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      cleanTarget,
    );

    res.json({ success: true, taskId: result.taskId });

    waitForTx(result.taskId)
      .then(async (status) => {
        if (status.success) {
          await Proposal.deleteOne({
            type: "validator",
            addr: cleanTarget.toLowerCase(),
          });

          // Sync isValidator flag on the User record
          const updated = await User.findOneAndUpdate(
            { safeAddress: cleanTarget.toLowerCase() },
            { isValidator: action },
            { new: true },
          );

          if (updated) {
            console.log(
              `✅ Validator executed: ${updated.username} isValidator=${action}`,
            );
          } else {
            console.warn(`⚠️ No user found with safeAddress ${cleanTarget}`);
          }
        }
      })
      .catch((err) =>
        console.error("❌ execute-validator bg error:", err.message),
      );
  } catch (error) {
    console.error("❌ execute-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
