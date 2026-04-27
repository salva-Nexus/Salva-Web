// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express    = require("express");
const router     = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User           = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const Proposal       = require("../models/Proposal");
const { sendValidatorProposalEmail } = require("../services/emailService");
const relay = require("../services/relayService");

console.log("🚀 ADMIN ROUTES INITIALIZED (v2.1.0)");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanEnvAddr(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']|["']$/g, "");
  const match = s.match(/(0x[0-9a-fA-F]{40})/);
  if (match) return match[1];
  return s.trim();
}

function normalizeAddr(addr) {
  if (!addr) return null;
  try { return ethers.getAddress((cleanEnvAddr(addr) || addr).toLowerCase()); }
  catch { return null; }
}

function getMultisig() {
  const addr = cleanEnvAddr(process.env.MULTISIG_CONTRACT_ADDRESS);
  if (!addr) throw new Error("MULTISIG_CONTRACT_ADDRESS is not set");
  return new ethers.Contract(addr, MULTISIG_READ_ABI, provider);
}

// ─── MultiSig read ABI ────────────────────────────────────────────────────────

const MULTISIG_READ_ABI = [
  "function registryInitVotesRemaining(address registry) view returns (uint256)",
  "function validatorUpdateVotesRemaining(address target) view returns (uint256)",
  "function upgradeVotesRemaining(address newImpl) view returns (uint256)",
  "function signerUpdateVotesRemaining(address newSigner) view returns (uint256)",
  "function baseRegistryImplUpdateVotesRemaining(address newImpl) view returns (uint256)",
  "function unpauseVotesRemaining(address proxy) view returns (uint256)",
];

// ─── On-chain remaining reads ─────────────────────────────────────────────────

async function getRemaining(fnName, key) {
  try {
    const result = await getMultisig()[fnName](normalizeAddr(key));
    return Number(result);
  } catch (e) {
    console.error(`⚠️  ${fnName}(${key}) failed:`, e.message);
    return null;
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

async function requireValidator(req, res, next) {
  const { safeAddress } = req.body;
  if (!safeAddress) return res.status(400).json({ message: "safeAddress required" });
  const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!user || !user.isValidator) return res.status(403).json({ message: "Not authorized" });
  req.callerUser = user;
  next();
}

// ─── Email helpers ────────────────────────────────────────────────────────────

async function notifyAllValidators(subject, payload) {
  const validators = await User.find({ isValidator: true });
  for (const v of validators) {
    if (v.email) {
      try { await sendValidatorProposalEmail(v.email, v.username, subject, payload); }
      catch (e) { console.error(`📧 Failed email to ${v.email}:`, e.message); }
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

// ─── GET /proposals ───────────────────────────────────────────────────────────

router.get("/proposals", async (req, res) => {
  try {
    const all = await Proposal.find().sort({ createdAt: -1 });

    for (const p of all) {
      try {
        let remaining = null;
        if      (p.type === "registry"               && p.registry) remaining = await getRemaining("registryInitVotesRemaining",           p.registry);
        else if (p.type === "validator"              && p.addr)     remaining = await getRemaining("validatorUpdateVotesRemaining",         p.addr);
        else if (p.type === "upgrade"                && p.newImpl)  remaining = await getRemaining("upgradeVotesRemaining",                 p.newImpl);
        else if (p.type === "signerUpdate"           && p.newImpl)  remaining = await getRemaining("signerUpdateVotesRemaining",            p.newImpl);
        else if (p.type === "baseRegistryImplUpdate" && p.newImpl)  remaining = await getRemaining("baseRegistryImplUpdateVotesRemaining",  p.newImpl);
        else if (p.type === "unpause"                && p.proxy)    remaining = await getRemaining("unpauseVotesRemaining",                 p.proxy);

        if (remaining === null) continue;

        p.remainingValidation = remaining;
        p.isValidated         = remaining === 0;
        await p.save();
      } catch (err) {
        console.error(`⚠️  Sync error for proposal ${p._id}:`, err.message);
      }
    }

    res.json({
      registryProposals:         all.filter((p) => p.type === "registry"),
      validatorProposals:        all.filter((p) => p.type === "validator"),
      upgradeProposals:          all.filter((p) => p.type === "upgrade"),
      signerUpdateProposals:     all.filter((p) => p.type === "signerUpdate"),
      baseRegistryImplProposals: all.filter((p) => p.type === "baseRegistryImplUpdate"),
      unpauseProposals:          all.filter((p) => p.type === "unpause"),
    });
  } catch (e) {
    console.error("❌ GET /proposals error:", e.message);
    res.status(500).json({ message: "Failed to fetch proposals" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// REGISTRY
// ══════════════════════════════════════════════════════════════════════════════

router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registryName, isWallet = false } = req.body;
    if (!nspace?.startsWith("@")) return res.status(400).json({ message: "Namespace must start with '@'" });

    const singleton = cleanEnvAddr(process.env.SALVA_SINGLETON);
    const factory   = cleanEnvAddr(process.env.REGISTRY_FACTORY);
    if (!singleton || !factory) return res.status(500).json({ message: "SALVA_SINGLETON or REGISTRY_FACTORY env var not set" });

    console.log(`📋 proposeInitRegistry: ${nspace} (isWallet=${isWallet})`);

    const result = await relay.sponsorProposeInitRegistry(req.callerUser.safeAddress, privateKey, nspace, singleton, factory);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ proposeInitRegistry tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        let cloneAddress = null;
        const PROPOSED_SIG = ethers.id("RegistryInitProposed(address,string,uint256)");
        for (const log of (status.receipt?.logs || [])) {
          if (log.topics?.[0]?.toLowerCase() === PROPOSED_SIG.toLowerCase() && log.topics[1]) {
            try { cloneAddress = ethers.getAddress("0x" + log.topics[1].slice(26)); } catch { /* continue */ }
          }
        }
        if (!cloneAddress) { console.error("❌ Could not parse clone address from RegistryInitProposed event"); return; }

        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("registryInitVotesRemaining", cloneAddress);
        await Proposal.create({
          type: "registry", registry: cloneAddress.toLowerCase(),
          nspace: nspace.toLowerCase(), registryName: registryName || nspace, isWallet,
          remainingValidation: remaining, isValidated: false, timeLockTimestamp: null,
        });
        await notifyAllValidators("New Registry Initialization Proposal", { type: "registry", registry: cloneAddress, nspace, registryName: registryName || nspace, isWallet });
        console.log(`✅ Registry proposed: ${nspace} → clone=${cloneAddress}`);
      } else {
        console.error(`❌ proposeInitRegistry tx failed: ${result.txHash}`);
      }
    }).catch((e) => console.error("❌ propose-registry bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registryAddress } = req.body;
    const cleanRegistry = normalizeAddr(registryAddress);
    if (!cleanRegistry) return res.status(400).json({ message: "Invalid registry address" });

    console.log(`📋 validateRegistryInit: ${cleanRegistry}`);

    const result = await relay.sponsorValidateRegistryInit(req.callerUser.safeAddress, privateKey, cleanRegistry);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateRegistryInit tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("registryInitVotesRemaining", cleanRegistry);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "registry", registry: cleanRegistry.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ Registry validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-registry bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registryAddress } = req.body;
    const cleanRegistry = normalizeAddr(registryAddress);
    if (!cleanRegistry) return res.status(400).json({ message: "Invalid registry address" });

    console.log(`📋 executeInitRegistry: ${cleanRegistry}`);

    const result = await relay.sponsorExecuteInitRegistry(req.callerUser.safeAddress, privateKey, cleanRegistry);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeInitRegistry tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        const p = await Proposal.findOne({ type: "registry", registry: cleanRegistry.toLowerCase() });
        if (p?.isWallet) {
          await WalletRegistry.findOneAndUpdate(
            { registryAddress: cleanRegistry.toLowerCase() },
            { name: p.registryName, nspace: p.nspace, registryAddress: cleanRegistry.toLowerCase(), active: true },
            { upsert: true, new: true },
          );
          console.log(`✅ Registry executed + added to WalletRegistry: ${cleanRegistry}`);
        } else {
          console.log(`✅ Registry executed (non-wallet): ${cleanRegistry}`);
        }
        await Proposal.deleteOne({ type: "registry", registry: cleanRegistry.toLowerCase() });
      }
    }).catch((e) => console.error("❌ execute-registry bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registryAddress } = req.body;
    const cleanRegistry = normalizeAddr(registryAddress);
    if (!cleanRegistry) return res.status(400).json({ message: "Invalid registry address" });

    console.log(`📋 cancelRegistryInit: ${cleanRegistry}`);

    const result = await relay.sponsorCancelRegistryInit(req.callerUser.safeAddress, privateKey, cleanRegistry);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelRegistryInit tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "registry", registry: cleanRegistry.toLowerCase() });
        console.log(`✅ Registry proposal cancelled: ${cleanRegistry}`);
      }
    }).catch((e) => console.error("❌ cancel-registry bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-registry error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// VALIDATOR
// ══════════════════════════════════════════════════════════════════════════════

router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget) return res.status(400).json({ message: "Invalid target address" });

    const existing = await Proposal.findOne({ type: "validator", addr: cleanTarget.toLowerCase() });
    if (existing) return res.status(409).json({ message: "A proposal for this address already exists" });

    console.log(`📋 proposeValidatorUpdate: ${cleanTarget} action=${action}`);

    const result = await relay.sponsorProposeValidatorUpdate(req.callerUser.safeAddress, privateKey, cleanTarget, action);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    const proposal = await Proposal.create({
      type: "validator", addr: cleanTarget.toLowerCase(), action,
      remainingValidation: null, isValidated: false, timeLockTimestamp: null,
    });

    console.log(`⏳ proposeValidatorUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, taskId: result.txHash, proposal });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("validatorUpdateVotesRemaining", cleanTarget);
        await Proposal.updateOne({ _id: proposal._id }, { remainingValidation: remaining });
        await notifyAllValidators("New Validator Update Proposal", { type: "validator", targetAddress: cleanTarget, action });
        console.log(`✅ Validator proposal synced — remaining=${remaining}`);
      } else {
        await Proposal.deleteOne({ _id: proposal._id });
        console.error("❌ propose-validator tx failed — proposal removed");
      }
    }).catch((e) => console.error("❌ propose-validator bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget) return res.status(400).json({ message: "Invalid target address" });

    console.log(`📋 validateValidatorUpdate: ${cleanTarget}`);

    const result = await relay.sponsorValidateValidatorUpdate(req.callerUser.safeAddress, privateKey, cleanTarget);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateValidatorUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, taskId: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("validatorUpdateVotesRemaining", cleanTarget);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "validator", addr: cleanTarget.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ Validator validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-validator bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget) return res.status(400).json({ message: "Invalid target address" });

    console.log(`📋 executeValidatorUpdate: ${cleanTarget} action=${action}`);

    const result = await relay.sponsorExecuteValidatorUpdate(req.callerUser.safeAddress, privateKey, cleanTarget);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeValidatorUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, taskId: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "validator", addr: cleanTarget.toLowerCase() });
        const updated = await User.findOneAndUpdate({ safeAddress: cleanTarget.toLowerCase() }, { isValidator: action }, { new: true });
        if (updated) console.log(`✅ Validator executed: ${updated.username} isValidator=${action}`);
        else         console.warn(`⚠️  No user found with safeAddress ${cleanTarget}`);
      }
    }).catch((e) => console.error("❌ execute-validator bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget) return res.status(400).json({ message: "Invalid target address" });

    console.log(`📋 cancelValidatorUpdate: ${cleanTarget}`);

    const result = await relay.sponsorCancelValidatorUpdate(req.callerUser.safeAddress, privateKey, cleanTarget);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelValidatorUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, taskId: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "validator", addr: cleanTarget.toLowerCase() });
        console.log(`✅ Validator proposal cancelled: ${cleanTarget}`);
      }
    }).catch((e) => console.error("❌ cancel-validator bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// UPGRADE
// ══════════════════════════════════════════════════════════════════════════════

router.post("/propose-upgrade", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress, newImplAddress, isMultisig = false } = req.body;
    const cleanProxy   = normalizeAddr(proxyAddress);
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });
    if (!isMultisig && !cleanProxy) return res.status(400).json({ message: "proxyAddress required when isMultisig=false" });

    const existing = await Proposal.findOne({ type: "upgrade", newImpl: cleanNewImpl.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Upgrade proposal already exists for this impl" });

    console.log(`📋 proposeUpgrade: newImpl=${cleanNewImpl} isMultisig=${isMultisig}`);

    const result = await relay.sponsorProposeUpgrade(req.callerUser.safeAddress, privateKey, isMultisig ? ethers.ZeroAddress : cleanProxy, cleanNewImpl, isMultisig);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    const proposal = await Proposal.create({
      type: "upgrade", newImpl: cleanNewImpl.toLowerCase(), proxy: cleanProxy?.toLowerCase() || null, isMultisig,
      remainingValidation: null, isValidated: false, timeLockTimestamp: null,
    });

    console.log(`⏳ proposeUpgrade tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash, proposal });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("upgradeVotesRemaining", cleanNewImpl);
        await Proposal.updateOne({ _id: proposal._id }, { remainingValidation: remaining });
        console.log(`✅ Upgrade proposal synced — remaining=${remaining}`);
      } else {
        await Proposal.deleteOne({ _id: proposal._id });
        console.error("❌ propose-upgrade tx failed — proposal removed");
      }
    }).catch((e) => console.error("❌ propose-upgrade bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-upgrade error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-upgrade", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 validateUpgrade: ${cleanNewImpl}`);

    const result = await relay.sponsorValidateUpgrade(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateUpgrade tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("upgradeVotesRemaining", cleanNewImpl);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "upgrade", newImpl: cleanNewImpl.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ Upgrade validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-upgrade bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-upgrade error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-upgrade", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 executeUpgrade: ${cleanNewImpl}`);

    const result = await relay.sponsorExecuteUpgrade(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeUpgrade tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "upgrade", newImpl: cleanNewImpl.toLowerCase() });
        console.log(`✅ Upgrade executed: ${cleanNewImpl}`);
      }
    }).catch((e) => console.error("❌ execute-upgrade bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-upgrade error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-upgrade", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 cancelUpgrade: ${cleanNewImpl}`);

    const result = await relay.sponsorCancelUpgrade(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelUpgrade tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "upgrade", newImpl: cleanNewImpl.toLowerCase() });
        console.log(`✅ Upgrade proposal cancelled: ${cleanNewImpl}`);
      }
    }).catch((e) => console.error("❌ cancel-upgrade bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-upgrade error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SIGNER UPDATE
// ══════════════════════════════════════════════════════════════════════════════

router.post("/propose-signer-update", requireValidator, async (req, res) => {
  try {
    const { privateKey, factoryProxy, newSigner } = req.body;
    const cleanProxy  = normalizeAddr(factoryProxy);
    const cleanSigner = normalizeAddr(newSigner);
    if (!cleanProxy || !cleanSigner) return res.status(400).json({ message: "factoryProxy and newSigner required" });

    const existing = await Proposal.findOne({ type: "signerUpdate", newImpl: cleanSigner.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Signer update proposal already exists" });

    console.log(`📋 proposeSignerUpdate: ${cleanSigner} via factory=${cleanProxy}`);

    const result = await relay.sponsorProposeSignerUpdate(req.callerUser.safeAddress, privateKey, cleanProxy, cleanSigner);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    const proposal = await Proposal.create({
      type: "signerUpdate", newImpl: cleanSigner.toLowerCase(), proxy: cleanProxy.toLowerCase(),
      remainingValidation: null, isValidated: false, timeLockTimestamp: null,
    });

    console.log(`⏳ proposeSignerUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash, proposal });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("signerUpdateVotesRemaining", cleanSigner);
        await Proposal.updateOne({ _id: proposal._id }, { remainingValidation: remaining });
        console.log(`✅ Signer update proposal synced — remaining=${remaining}`);
      } else {
        await Proposal.deleteOne({ _id: proposal._id });
        console.error("❌ propose-signer-update tx failed — proposal removed");
      }
    }).catch((e) => console.error("❌ propose-signer-update bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-signer-update error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-signer-update", requireValidator, async (req, res) => {
  try {
    const { privateKey, newSigner } = req.body;
    const cleanSigner = normalizeAddr(newSigner);
    if (!cleanSigner) return res.status(400).json({ message: "Invalid newSigner address" });

    console.log(`📋 validateSignerUpdate: ${cleanSigner}`);

    const result = await relay.sponsorValidateSignerUpdate(req.callerUser.safeAddress, privateKey, cleanSigner);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateSignerUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("signerUpdateVotesRemaining", cleanSigner);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "signerUpdate", newImpl: cleanSigner.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ Signer update validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-signer-update bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-signer-update error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-signer-update", requireValidator, async (req, res) => {
  try {
    const { privateKey, newSigner } = req.body;
    const cleanSigner = normalizeAddr(newSigner);
    if (!cleanSigner) return res.status(400).json({ message: "Invalid newSigner address" });

    console.log(`📋 executeSignerUpdate: ${cleanSigner}`);

    const result = await relay.sponsorExecuteSignerUpdate(req.callerUser.safeAddress, privateKey, cleanSigner);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeSignerUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "signerUpdate", newImpl: cleanSigner.toLowerCase() });
        console.log(`✅ Signer updated: ${cleanSigner}`);
      }
    }).catch((e) => console.error("❌ execute-signer-update bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-signer-update error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-signer-update", requireValidator, async (req, res) => {
  try {
    const { privateKey, newSigner } = req.body;
    const cleanSigner = normalizeAddr(newSigner);
    if (!cleanSigner) return res.status(400).json({ message: "Invalid newSigner address" });

    console.log(`📋 cancelSignerUpdate: ${cleanSigner}`);

    const result = await relay.sponsorCancelSignerUpdate(req.callerUser.safeAddress, privateKey, cleanSigner);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelSignerUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "signerUpdate", newImpl: cleanSigner.toLowerCase() });
        console.log(`✅ Signer update cancelled: ${cleanSigner}`);
      }
    }).catch((e) => console.error("❌ cancel-signer-update bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-signer-update error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BASEREGISTRY IMPL UPDATE
// ══════════════════════════════════════════════════════════════════════════════

router.post("/propose-base-registry-impl", requireValidator, async (req, res) => {
  try {
    const { privateKey, factoryProxy, newImplAddress } = req.body;
    const cleanProxy   = normalizeAddr(factoryProxy);
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanProxy || !cleanNewImpl) return res.status(400).json({ message: "factoryProxy and newImplAddress required" });

    const existing = await Proposal.findOne({ type: "baseRegistryImplUpdate", newImpl: cleanNewImpl.toLowerCase() });
    if (existing) return res.status(409).json({ message: "BaseRegistry impl update proposal already exists" });

    console.log(`📋 proposeBaseRegistryImplUpdate: ${cleanNewImpl} via factory=${cleanProxy}`);

    const result = await relay.sponsorProposeBaseRegistryImplUpdate(req.callerUser.safeAddress, privateKey, cleanProxy, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    const proposal = await Proposal.create({
      type: "baseRegistryImplUpdate", newImpl: cleanNewImpl.toLowerCase(), proxy: cleanProxy.toLowerCase(),
      remainingValidation: null, isValidated: false, timeLockTimestamp: null,
    });

    console.log(`⏳ proposeBaseRegistryImplUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash, proposal });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("baseRegistryImplUpdateVotesRemaining", cleanNewImpl);
        await Proposal.updateOne({ _id: proposal._id }, { remainingValidation: remaining });
        console.log(`✅ BaseRegistry impl proposal synced — remaining=${remaining}`);
      } else {
        await Proposal.deleteOne({ _id: proposal._id });
        console.error("❌ propose-base-registry-impl tx failed — proposal removed");
      }
    }).catch((e) => console.error("❌ propose-base-registry-impl bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-base-registry-impl error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-base-registry-impl", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 validateBaseRegistryImplUpdate: ${cleanNewImpl}`);

    const result = await relay.sponsorValidateBaseRegistryImplUpdate(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateBaseRegistryImplUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("baseRegistryImplUpdateVotesRemaining", cleanNewImpl);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "baseRegistryImplUpdate", newImpl: cleanNewImpl.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ BaseRegistry impl validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-base-registry-impl bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-base-registry-impl error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-base-registry-impl", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 executeBaseRegistryImplUpdate: ${cleanNewImpl}`);

    const result = await relay.sponsorExecuteBaseRegistryImplUpdate(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeBaseRegistryImplUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "baseRegistryImplUpdate", newImpl: cleanNewImpl.toLowerCase() });
        console.log(`✅ BaseRegistry impl updated: ${cleanNewImpl}`);
      }
    }).catch((e) => console.error("❌ execute-base-registry-impl bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-base-registry-impl error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-base-registry-impl", requireValidator, async (req, res) => {
  try {
    const { privateKey, newImplAddress } = req.body;
    const cleanNewImpl = normalizeAddr(newImplAddress);
    if (!cleanNewImpl) return res.status(400).json({ message: "Invalid newImpl address" });

    console.log(`📋 cancelBaseRegistryImplUpdate: ${cleanNewImpl}`);

    const result = await relay.sponsorCancelBaseRegistryImplUpdate(req.callerUser.safeAddress, privateKey, cleanNewImpl);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelBaseRegistryImplUpdate tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "baseRegistryImplUpdate", newImpl: cleanNewImpl.toLowerCase() });
        console.log(`✅ BaseRegistry impl update cancelled: ${cleanNewImpl}`);
      }
    }).catch((e) => console.error("❌ cancel-base-registry-impl bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-base-registry-impl error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// FACTORY FEE — immediate
// ══════════════════════════════════════════════════════════════════════════════

router.post("/update-factory-fee", requireValidator, async (req, res) => {
  try {
    const { privateKey, factoryProxy, newFee } = req.body;
    const cleanProxy = normalizeAddr(factoryProxy);
    if (!cleanProxy) return res.status(400).json({ message: "Invalid factoryProxy address" });
    if (newFee === undefined || newFee === null) return res.status(400).json({ message: "newFee required" });

    console.log(`📋 updateFactoryFee: ${newFee} on factory=${cleanProxy}`);

    const feeWei = ethers.parseUnits(String(newFee), 6);
    const result = await relay.sponsorUpdateFactoryFee(req.callerUser.safeAddress, privateKey, cleanProxy, feeWei);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ updateFactoryFee tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });
  } catch (error) {
    console.error("❌ update-factory-fee error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PAUSE / UNPAUSE
// ══════════════════════════════════════════════════════════════════════════════

router.post("/pause-state", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress, mark } = req.body;
    const cleanProxy = normalizeAddr(proxyAddress);
    if (!cleanProxy)        return res.status(400).json({ message: "Invalid proxyAddress" });
    if (mark === undefined) return res.status(400).json({ message: "mark required (0=multisig, 1=external)" });

    console.log(`📋 pauseState: proxy=${cleanProxy} mark=${mark}`);

    const result = await relay.sponsorPauseState(req.callerUser.safeAddress, privateKey, cleanProxy, mark);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ pauseState tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });
  } catch (error) {
    console.error("❌ pause-state error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/propose-unpause", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress, mark } = req.body;
    const cleanProxy = normalizeAddr(proxyAddress);
    if (!cleanProxy)        return res.status(400).json({ message: "Invalid proxyAddress" });
    if (mark === undefined) return res.status(400).json({ message: "mark required (0=multisig, 1=external)" });

    const existing = await Proposal.findOne({ type: "unpause", proxy: cleanProxy.toLowerCase() });
    if (existing) return res.status(409).json({ message: "Unpause proposal already exists for this proxy" });

    console.log(`📋 proposeUnpause: proxy=${cleanProxy} mark=${mark}`);

    const result = await relay.sponsorProposeUnpause(req.callerUser.safeAddress, privateKey, cleanProxy, mark);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    const proposal = await Proposal.create({
      type: "unpause", proxy: cleanProxy.toLowerCase(), mark,
      remainingValidation: null, isValidated: false, timeLockTimestamp: null,
    });

    console.log(`⏳ proposeUnpause tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash, proposal });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await new Promise((r) => setTimeout(r, 3000));
        const remaining = await getRemaining("unpauseVotesRemaining", cleanProxy);
        await Proposal.updateOne({ _id: proposal._id }, { remainingValidation: remaining });
        console.log(`✅ Unpause proposal synced — remaining=${remaining}`);
      } else {
        await Proposal.deleteOne({ _id: proposal._id });
        console.error("❌ propose-unpause tx failed — proposal removed");
      }
    }).catch((e) => console.error("❌ propose-unpause bg error:", e.message));
  } catch (error) {
    console.error("❌ propose-unpause error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-unpause", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress } = req.body;
    const cleanProxy = normalizeAddr(proxyAddress);
    if (!cleanProxy) return res.status(400).json({ message: "Invalid proxyAddress" });

    console.log(`📋 validateUnpause: ${cleanProxy}`);

    const result = await relay.sponsorValidateUnpause(req.callerUser.safeAddress, privateKey, cleanProxy);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ validateUnpause tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    // relay already called tx.wait() — state is final, read directly
    try {
      const remaining   = await getRemaining("unpauseVotesRemaining", cleanProxy);
      const isValidated = remaining === 0;
      await Proposal.findOneAndUpdate(
        { type: "unpause", proxy: cleanProxy.toLowerCase() },
        { remainingValidation: remaining, isValidated,
          timeLockTimestamp: isValidated
            ? process.env.NODE_ENV === "development"
              ? Math.floor(Date.now() / 1000) - 3600          // dev: instant
              : Math.floor(Date.now() / 1000) + 24 * 60 * 60  // prod: real 24h
            : null },
      );
      console.log(`✅ Unpause validated — remaining=${remaining}${isValidated ? " (timelock started)" : ""}`);
    } catch (e) { console.error("❌ validate-unpause bg error:", e.message); }
  } catch (error) {
    console.error("❌ validate-unpause error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-unpause", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress } = req.body;
    const cleanProxy = normalizeAddr(proxyAddress);
    if (!cleanProxy) return res.status(400).json({ message: "Invalid proxyAddress" });

    console.log(`📋 executeUnpause: ${cleanProxy}`);

    const result = await relay.sponsorExecuteUnpause(req.callerUser.safeAddress, privateKey, cleanProxy);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ executeUnpause tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "unpause", proxy: cleanProxy.toLowerCase() });
        console.log(`✅ Unpaused: ${cleanProxy}`);
      }
    }).catch((e) => console.error("❌ execute-unpause bg error:", e.message));
  } catch (error) {
    console.error("❌ execute-unpause error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-unpause", requireValidator, async (req, res) => {
  try {
    const { privateKey, proxyAddress } = req.body;
    const cleanProxy = normalizeAddr(proxyAddress);
    if (!cleanProxy) return res.status(400).json({ message: "Invalid proxyAddress" });

    console.log(`📋 cancelUnpause: ${cleanProxy}`);

    const result = await relay.sponsorCancelUnpause(req.callerUser.safeAddress, privateKey, cleanProxy);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ cancelUnpause tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });

    waitForTx(result.txHash).then(async (status) => {
      if (status.success) {
        await Proposal.deleteOne({ type: "unpause", proxy: cleanProxy.toLowerCase() });
        console.log(`✅ Unpause proposal cancelled: ${cleanProxy}`);
      }
    }).catch((e) => console.error("❌ cancel-unpause bg error:", e.message));
  } catch (error) {
    console.error("❌ cancel-unpause error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// WITHDRAW — immediate
// ══════════════════════════════════════════════════════════════════════════════

router.post("/withdraw", requireValidator, async (req, res) => {
  try {
    const { privateKey, singletonAddress, tokenAddress, receiverAddress } = req.body;
    const cleanSingleton = normalizeAddr(singletonAddress);
    const cleanToken     = normalizeAddr(tokenAddress);
    const cleanReceiver  = normalizeAddr(receiverAddress);
    if (!cleanSingleton || !cleanToken || !cleanReceiver)
      return res.status(400).json({ message: "singletonAddress, tokenAddress, and receiverAddress required" });

    console.log(`📋 withdrawFromSingleton: token=${cleanToken} receiver=${cleanReceiver}`);

    const result = await relay.sponsorWithdrawFromSingleton(req.callerUser.safeAddress, privateKey, cleanSingleton, cleanToken, cleanReceiver);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ withdrawFromSingleton tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });
  } catch (error) {
    console.error("❌ withdraw error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECOVERY — immediate
// ══════════════════════════════════════════════════════════════════════════════

router.post("/update-recovery", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget)                return res.status(400).json({ message: "Invalid targetAddress" });
    if (typeof action !== "boolean") return res.status(400).json({ message: "action must be boolean" });

    console.log(`📋 updateRecovery: ${cleanTarget} action=${action}`);

    const result = await relay.sponsorUpdateRecovery(req.callerUser.safeAddress, privateKey, cleanTarget, action);
    if (!result?.txHash) return res.status(500).json({ message: "Transaction failed to broadcast" });

    console.log(`⏳ updateRecovery tx submitted: ${result.txHash}`);
    res.json({ success: true, txHash: result.txHash });
  } catch (error) {
    console.error("❌ update-recovery error:", error.message);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;

// ══════════════════════════════════════════════════════════════════════════════
// EMERGENCY — direct backend wallet call, bypasses Safe
// Used when numOfValidators = 0 (overflow recovery)
// ══════════════════════════════════════════════════════════════════════════════

router.post("/emergency-add-validator", requireValidator, async (req, res) => {
  try {
    const { targetAddress } = req.body;
    const cleanTarget = normalizeAddr(targetAddress);
    if (!cleanTarget) return res.status(400).json({ message: "Invalid targetAddress" });

    const multisigAddr = cleanEnvAddr(process.env.MULTISIG_CONTRACT_ADDRESS);
    const IFACE = new ethers.Interface([
      "function proposeValidatorUpdate(address target, bool action) external returns (address, bool, uint256)",
      "function validateValidatorUpdate(address target) external returns (address, bool, uint256)",
      "function executeValidatorUpdate(address target) external returns (bool)",
    ]);

    const { wallet } = require("../services/walletSigner");

    console.log(`🚨 Emergency: adding validator ${cleanTarget} via backend wallet directly`);

    // propose
    const multisig = new ethers.Contract(multisigAddr, IFACE, wallet);
    const tx1 = await multisig.proposeValidatorUpdate(cleanTarget, true, { gasLimit: 500_000 });
    await tx1.wait();
    console.log(`✅ proposeValidatorUpdate: ${tx1.hash}`);

    // validate (backend wallet is also a validator/recovery — quorum = 1 when numValidators=1 after propose)
    const tx2 = await multisig.validateValidatorUpdate(cleanTarget, { gasLimit: 500_000 });
    await tx2.wait();
    console.log(`✅ validateValidatorUpdate: ${tx2.hash}`);

    // execute
    const tx3 = await multisig.executeValidatorUpdate(cleanTarget, { gasLimit: 500_000 });
    await tx3.wait();
    console.log(`✅ executeValidatorUpdate: ${tx3.hash}`);

    res.json({ success: true, message: `${cleanTarget} added as validator` });
  } catch (error) {
    console.error("❌ emergency-add-validator error:", error.message);
    res.status(500).json({ message: error.message });
  }
});