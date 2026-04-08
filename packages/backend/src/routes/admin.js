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
  "function _registryValidationCountRemains(address) view returns (uint256)",
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

// ─── On-chain read helpers ────────────────────────────────────────────────────
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

// ─── Parse clone address from receipt logs ────────────────────────────────────
// RegistryInitializationProposed(address indexed clone, string namespace, bytes16 id)
// topics[0] = event signature hash
// topics[1] = abi-encoded indexed address (32 bytes, left-padded with zeros)
// The address occupies the LAST 20 bytes (40 hex chars) of the 32-byte topic.
function parseCloneFromReceipt(receipt) {
  if (!receipt?.logs?.length) return null;

  const EVENT_SIG = ethers.id(
    "RegistryInitializationProposed(address,string,bytes16)",
  );

  for (const log of receipt.logs) {
    if (
      log.topics &&
      log.topics[0] &&
      log.topics[0].toLowerCase() === EVENT_SIG.toLowerCase() &&
      log.topics[1]
    ) {
      try {
        // topics[1] is a 32-byte hex string like:
        // "0x000000000000000000000000c6D4dcA16F1D904632871c52Fb4E6cdfb243F6C2"
        // Strip the leading "0x" + 24 zero-padding chars, leaving 40 hex chars.
        const raw = log.topics[1]; // "0x" + 64 hex chars
        const addrHex = "0x" + raw.slice(raw.length - 40); // last 40 hex chars
        const cloneAddress = ethers.getAddress(addrHex);
        console.log(`✅ Parsed clone address from event log: ${cloneAddress}`);
        return cloneAddress;
      } catch (e) {
        console.error(
          "Failed to parse clone address from topic:",
          e.message,
          "| raw topic:",
          log.topics[1],
        );
      }
    }
  }

  // Fallback: try ABI decoding the full log data if address wasn't indexed
  for (const log of receipt.logs) {
    try {
      const iface = new ethers.Interface([
        "event RegistryInitializationProposed(address clone, string namespace, bytes16 id)",
      ]);
      const parsed = iface.parseLog(log);
      if (parsed && parsed.args.clone) {
        const addr = ethers.getAddress(parsed.args.clone);
        console.log(`✅ Parsed clone address via ABI decode: ${addr}`);
        return addr;
      }
    } catch {
      // not this log, keep trying
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
        const remaining =
          p.type === "registry"
            ? await getRegistryRemaining(p.registry)
            : await getValidatorRemaining(p.addr);

        if (remaining === null) continue;

        p.remainingValidation = remaining;
        p.isValidated = remaining === 0;
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

// ─── PROPOSE REGISTRY ─────────────────────────────────────────────────────────
// Calls deployAndProposeInit(namespace) on the MultiSig contract via the
// caller's Safe. The MultiSig deploys a new registry clone atomically and
// opens an initialization proposal. We parse the clone address from the
// RegistryInitializationProposed event emitted in the receipt.
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

    // Only one active proposal per namespace
    const existing = await Proposal.findOne({
      type: "registry",
      nspace: nspace.toLowerCase(),
    });
    if (existing)
      return res
        .status(409)
        .json({ message: "A proposal for this namespace already exists" });

    const sponsorFn =
      chain === "base"
        ? relay.sponsorDeployAndProposeInitBase
        : relay.sponsorDeployAndProposeInitEth;

    console.log(
      `📋 Proposing registry for namespace: ${nspace} (isWallet=${isWallet})`,
    );

    // Execute deployAndProposeInit — deploys clone + opens proposal atomically
    const result = await sponsorFn(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
    );

    if (!result?.txHash) {
      return res
        .status(500)
        .json({ message: "Transaction failed to broadcast" });
    }

    console.log(`✅ deployAndProposeInit tx confirmed: ${result.txHash}`);

    // Parse the deployed clone address from the receipt event log
    const cloneAddress = parseCloneFromReceipt(result.receipt);

    if (!cloneAddress) {
      console.error("❌ Could not parse clone address from receipt logs");
      console.error(
        "   Receipt logs:",
        JSON.stringify(result.receipt?.logs?.slice(0, 3), null, 2),
      );
      return res.status(500).json({
        message:
          "Registry deployed on-chain but could not parse the clone address from the transaction logs. Check the tx on the explorer.",
        txHash: result.txHash,
      });
    }

    console.log(`🏭 Clone deployed at: ${cloneAddress}`);

    // Save proposal to DB
    const proposal = await Proposal.create({
      type: "registry",
      registry: cloneAddress.toLowerCase(),
      nspace: nspace.toLowerCase(),
      registryName: registryName || nspace,
      isWallet: !!isWallet,
      remainingValidation: null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    // Respond immediately — background work follows
    res.json({
      success: true,
      txHash: result.txHash,
      cloneAddress,
      proposal,
    });

    // Background: sync remaining vote count + email all validators
    try {
      const remaining = await getRegistryRemaining(cloneAddress);
      await Proposal.updateOne(
        { _id: proposal._id },
        { remainingValidation: remaining },
      );

      await notifyAllValidators("New Registry Proposal", {
        type: "registry",
        registryName: registryName || nspace,
        nspace,
        registry: cloneAddress,
        isWallet: !!isWallet,
      });

      console.log(
        `📊 Registry proposal synced — remaining votes: ${remaining}`,
      );
    } catch (err) {
      console.error("❌ propose-registry background task error:", err.message);
    }
  } catch (error) {
    console.error("❌ propose-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ─── VALIDATE REGISTRY ────────────────────────────────────────────────────────
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
              timeLockTimestamp: isValidated
                ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
                : null,
            },
          );
          console.log(
            `✅ Registry validated — remaining=${remaining}${isValidated ? " (24h timelock started)" : ""}`,
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

// ─── CANCEL REGISTRY ──────────────────────────────────────────────────────────
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
          console.log(`✅ Registry proposal cancelled: ${cleanRegistry}`);
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

// ─── EXECUTE REGISTRY ─────────────────────────────────────────────────────────
// After the timelock expires, executes the proposal on-chain.
// If isWallet=true on the proposal, adds the registry to WalletRegistry so users
// can resolve names and send to it.
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

          const finalName = registryName || proposal?.registryName || nspace;
          const finalNspace = nspace || proposal?.nspace || "";
          const walletFlag = proposal?.isWallet ?? false;

          if (walletFlag) {
            await WalletRegistry.findOneAndUpdate(
              { registryAddress: cleanRegistry.toLowerCase() },
              {
                name: finalName,
                nspace: finalNspace,
                registryAddress: cleanRegistry.toLowerCase(),
                active: true,
              },
              { upsert: true, new: true },
            );
            console.log(
              `✅ Registry executed + added to WalletRegistry: ${finalNspace} → ${cleanRegistry}`,
            );
          } else {
            console.log(
              `✅ Registry executed on-chain (isWallet=false, not added to WalletRegistry): ${finalNspace} → ${cleanRegistry}`,
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
                ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
                : // Math.floor(Date.now() / 1000) - 3600
                  null,
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
