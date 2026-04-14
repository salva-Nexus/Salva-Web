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

// ─── Env addr sanitizer (same logic as relayService) ─────────────────────────
// Strips emoji, comments, whitespace, quotes that leak into .env values.
function cleanEnvAddr(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']|["']$/g, "");
  const match = s.match(/(0x[0-9a-fA-F]{40})/);
  if (match) return match[1];
  return s.trim();
}

// ─── Multisig read ABI ────────────────────────────────────────────────────────
const MULTISIG_READ_ABI = [
  "function _validatorValidationCountRemains(address) view returns (uint256)",
];

console.log("🚀 ADMIN ROUTES INITIALIZED");

function getMultisig() {
  const addr = cleanEnvAddr(process.env.MULTISIG_CONTRACT_ADDRESS);
  if (!addr) throw new Error("MULTISIG_CONTRACT_ADDRESS is not set");
  return new ethers.Contract(addr, MULTISIG_READ_ABI, provider);
}

function normalizeAddr(addr) {
  if (!addr) return null;
  try {
    const clean = cleanEnvAddr(addr) || addr;
    return ethers.getAddress(clean.toLowerCase());
  } catch {
    return null;
  }
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

// ─── Email helpers ────────────────────────────────────────────────────────────
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

// ─── Tx polling ───────────────────────────────────────────────────────────────
async function waitForTx(txHash, maxRetries = 30, delayMs = 2000) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.getTransactionReceipt(txHash);
      if (receipt) return { success: receipt.status === 1, receipt };
    } catch (err) {
      if (i === maxRetries - 1) return { success: false, receipt: null };
    }
    await sleep(delayMs);
  }
  return { success: false, receipt: null };
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

function parseCloneFromReceipt(receipt) {
  if (!receipt?.logs?.length) return null;

  const EVENT_SIG = ethers.id("RegistryInitialized(address,string)");

  for (const log of receipt.logs) {
    if (
      log.topics &&
      log.topics[0] &&
      log.topics[0].toLowerCase() === EVENT_SIG.toLowerCase() &&
      log.topics[1]
    ) {
      try {
        const raw = log.topics[1];
        const addrHex = "0x" + raw.slice(raw.length - 40);
        const cloneAddress = ethers.getAddress(addrHex);
        console.log(`✅ Parsed clone address from RegistryInitialized event: ${cloneAddress}`);
        return cloneAddress;
      } catch (e) {
        console.error("Failed to parse clone address from topic:", e.message, "| raw topic:", log.topics[1]);
      }
    }
  }

  return null;
}

// ─── GET /proposals ───────────────────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    for (const p of all) {
      try {
        const remaining = await getValidatorRemaining(p.addr);

        if (remaining === null) continue;

        p.remainingValidation = remaining;
        p.isValidated = remaining === 0;
        await p.save();
      } catch (err) {
        console.error(`Sync error for ${p._id}:`, err.message);
      }
    }

    res.json({
      registryProposals: [],
      validatorProposals: all,
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
      registryName,
      isWallet = false,
      chain = "base",
    } = req.body;

    if (!nspace?.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorDeployAndInitRegistryBase
        : relay.sponsorDeployAndInitRegistryEth;

    console.log(
      `📋 Deploying and initializing registry: ${nspace} (isWallet=${isWallet})`,
    );

    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
    );

    if (!result?.txHash)
      return res
        .status(500)
        .json({ message: "Transaction failed to broadcast" });

    console.log(`✅ deployAndInitRegistry tx confirmed: ${result.txHash}`);

    const cloneAddress = parseCloneFromReceipt(result.receipt);

    if (!cloneAddress)
      return res.status(500).json({
        message:
          "Registry deployed on-chain but could not parse the clone address from logs. Check the tx on the explorer.",
        txHash: result.txHash,
      });

    console.log(`🏭 Registry initialized at: ${cloneAddress}`);

    if (isWallet) {
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: cloneAddress.toLowerCase() },
        {
          name: registryName || nspace,
          nspace: nspace.toLowerCase(),
          registryAddress: cloneAddress.toLowerCase(),
          active: true,
        },
        { upsert: true, new: true },
      );
      console.log(`✅ Added to WalletRegistry: ${nspace} → ${cloneAddress}`);
    } else {
      console.log(
        `✅ Registry initialized on-chain (isWallet=false, not added to WalletRegistry): ${nspace} → ${cloneAddress}`,
      );
    }

    res.json({
      success: true,
      txHash: result.txHash,
      cloneAddress,
      addedToWalletRegistry: !!isWallet,
    });
  } catch (error) {
    console.error("❌ deploy-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});


// ─── PROPOSE VALIDATOR ────────────────────────────────────────────────────────
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
          console.log(`✅ Validator proposal synced — remaining=${remaining}`);
        } else {
          await Proposal.deleteOne({ _id: proposal._id });
          console.error("❌ propose-validator tx failed — proposal removed");
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

// ─── VALIDATE VALIDATOR ───────────────────────────────────────────────────────
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
              timeLockTimestamp: isValidated
                ? // Math.floor(Date.now() / 1000) + 24 * 60 * 60
                  Math.floor(Date.now() / 1000) - 3600
                : null,
            },
          ); 
          console.log(
            `✅ Validator validated — remaining=${remaining}${isValidated ? " (24h timelock started)" : ""}`,
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

// ─── CANCEL VALIDATOR ─────────────────────────────────────────────────────────
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
          console.log(`✅ Validator proposal cancelled: ${cleanTarget}`);
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

// ─── EXECUTE VALIDATOR UPDATE ─────────────────────────────────────────────────
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
          const updated = await User.findOneAndUpdate(
            { safeAddress: cleanTarget.toLowerCase() },
            { isValidator: action },
            { new: true },
          );
          if (updated)
            console.log(
              `✅ Validator executed: ${updated.username} isValidator=${action}`,
            );
          else console.warn(`⚠️ No user found with safeAddress ${cleanTarget}`);
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
