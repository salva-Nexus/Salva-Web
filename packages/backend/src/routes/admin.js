// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { wallet, provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const { sendValidatorProposalEmail } = require("../services/emailService");

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

const MULTISIG_ABI = [
  // Propose
  "function proposeInitialization(string,address) external returns (string,bool)",
  "function proposeValidatorUpdate(address,bool) external returns (bool)",
  // Validate
  "function validateRegistry(address) external returns (bool)",
  "function validateValidator(address) external returns (bool)",
  // Cancel
  "function cancelInit(address) external returns (bool)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  // Execute
  "function executeInit(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
  // Events (for reading)
  "event RegistryInitializationProposed(address indexed registry, string nspace, bytes16 nspaceBytes)",
  "event ValidatorUpdateProposed(address indexed addr, bool action)",
  "event RegistryValidated(address indexed registry, bytes16 nspace, uint128 remainingValidation)",
  "event ValidatorValidated(address indexed addr, bool action, uint128 remainingValidation)",
  "event RegistryInitializationCancelled(address indexed registry)",
  "event ValidatorUpdateCancelled(address indexed addr)",
  "event InitializationSuccess(address indexed registry, bytes16 nspace)",
  "event ValidatorUpdated(address indexed addr, bool action)",
];

function getMultisigContract(signerPrivateKey) {
  const signer = new ethers.Wallet(signerPrivateKey, provider);
  return new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, signer);
}

// ── Middleware: verify caller is a validator ───────────────────────────────
async function requireValidator(req, res, next) {
  const { safeAddress } = req.body;
  if (!safeAddress) return res.status(400).json({ message: "safeAddress required" });
  const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!user || !user.isValidator) return res.status(403).json({ message: "Not authorized" });
  req.callerUser = user;
  next();
}

// ── Helper: email all OTHER validators ────────────────────────────────────
async function notifyValidators(excludeAddress, subject, payload) {
  const validators = await User.find({ isValidator: true, safeAddress: { $ne: excludeAddress.toLowerCase() } });
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

// ── GET: all active proposals (read from events + on-chain state) ─────────
// Returns two arrays: registryProposals and validatorProposals
router.get("/proposals", async (req, res) => {
  try {
    const contract = new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, provider);

    // Read RegistryInitializationProposed events
    const regProposedFilter = contract.filters.RegistryInitializationProposed();
    const regProposedEvents = await contract.queryFilter(regProposedFilter, -50000);

    // Read ValidatorUpdateProposed events
    const valProposedFilter = contract.filters.ValidatorUpdateProposed();
    const valProposedEvents = await contract.queryFilter(valProposedFilter, -50000);

    // Read cancelled/executed events to filter out resolved proposals
    const regCancelledEvents = await contract.queryFilter(contract.filters.RegistryInitializationCancelled(), -50000);
    const regExecutedEvents = await contract.queryFilter(contract.filters.InitializationSuccess(), -50000);
    const valCancelledEvents = await contract.queryFilter(contract.filters.ValidatorUpdateCancelled(), -50000);
    const valExecutedEvents = await contract.queryFilter(contract.filters.ValidatorUpdated(), -50000);

    const cancelledRegistries = new Set(regCancelledEvents.map(e => e.args.registry.toLowerCase()));
    const executedRegistries = new Set(regExecutedEvents.map(e => e.args.registry.toLowerCase()));
    const cancelledValidators = new Set(valCancelledEvents.map(e => e.args.addr.toLowerCase()));
    const executedValidators = new Set(valExecutedEvents.map(e => e.args.addr.toLowerCase()));

    // Build registry proposals (active only)
    const registryProposals = [];
    for (const event of regProposedEvents) {
      const addr = event.args.registry.toLowerCase();
      if (cancelledRegistries.has(addr) || executedRegistries.has(addr)) continue;

      // Get latest validation count from RegistryValidated events
      const valFilter = contract.filters.RegistryValidated(event.args.registry);
      const valEvents = await contract.queryFilter(valFilter, -50000);
      const latestValEvent = valEvents[valEvents.length - 1];
      const remainingValidation = latestValEvent ? Number(latestValEvent.args.remainingValidation) : null;
      const isValidated = latestValEvent && Number(latestValEvent.args.remainingValidation) === 0;

      // Get timeLock from latest validated event block timestamp
      let timeLockTimestamp = null;
      if (isValidated && latestValEvent) {
        const block = await provider.getBlock(latestValEvent.blockNumber);
        timeLockTimestamp = block.timestamp + 24 * 60 * 60; // 24h from quorum
      }

      registryProposals.push({
        type: "registry",
        registry: addr,
        nspace: event.args.nspace,
        remainingValidation,
        isValidated,
        timeLockTimestamp,
        blockNumber: event.blockNumber,
      });
    }

    // Build validator proposals (active only)
    const validatorProposals = [];
    for (const event of valProposedEvents) {
      const addr = event.args.addr.toLowerCase();
      if (cancelledValidators.has(addr) || executedValidators.has(addr)) continue;

      const valFilter = contract.filters.ValidatorValidated(event.args.addr);
      const valEvents = await contract.queryFilter(valFilter, -50000);
      const latestValEvent = valEvents[valEvents.length - 1];
      const remainingValidation = latestValEvent ? Number(latestValEvent.args.remainingValidation) : null;
      const isValidated = latestValEvent && Number(latestValEvent.args.remainingValidation) === 0;

      let timeLockTimestamp = null;
      if (isValidated && latestValEvent) {
        const block = await provider.getBlock(latestValEvent.blockNumber);
        timeLockTimestamp = block.timestamp + 24 * 60 * 60;
      }

      validatorProposals.push({
        type: "validator",
        addr,
        action: event.args.action, // true = add, false = remove
        remainingValidation,
        isValidated,
        timeLockTimestamp,
        blockNumber: event.blockNumber,
      });
    }

    res.json({ registryProposals, validatorProposals });
  } catch (error) {
    console.error("❌ Proposals fetch error:", error);
    res.status(500).json({ message: "Failed to fetch proposals" });
  }
});

// ── POST: propose registry initialization ─────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;
    if (!nspace.startsWith("@")) return res.status(400).json({ message: "Namespace must start with @" });

    const contract = getMultisigContract(privateKey);
    const tx = await contract.proposeInitialization(nspace, registry);
    await tx.wait();

    await notifyValidators(req.callerUser.safeAddress, "New Registry Proposal", {
      type: "registry",
      registryName: registryName || nspace,
      nspace,
      registry,
    });

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res.status(500).json({ message: error.reason || "Failed to propose registry" });
  }
});

// ── POST: propose validator update ─────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.proposeValidatorUpdate(targetAddress, action);
    await tx.wait();

    await notifyValidators(req.callerUser.safeAddress, "New Validator Update Proposal", {
      type: "validator",
      targetAddress,
      action, // true = add, false = remove
    });

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res.status(500).json({ message: error.reason || "Failed to propose validator update" });
  }
});

// ── POST: validate registry proposal ──────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.validateRegistry(registry);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Validate registry error:", error);
    res.status(500).json({ message: error.reason || "Failed to validate registry" });
  }
});

// ── POST: validate validator proposal ─────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.validateValidator(targetAddress);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Validate validator error:", error);
    res.status(500).json({ message: error.reason || "Failed to validate validator" });
  }
});

// ── POST: cancel registry proposal ────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.cancelInit(registry);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Cancel registry error:", error);
    res.status(500).json({ message: error.reason || "Failed to cancel" });
  }
});

// ── POST: cancel validator proposal ───────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.cancelValidatorUpdate(targetAddress);
    await tx.wait();
    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Cancel validator error:", error);
    res.status(500).json({ message: error.reason || "Failed to cancel" });
  }
});

// ── POST: execute registry init ────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.executeInit(registry);
    const receipt = await tx.wait();

    // If successful, push to WalletRegistry
    if (receipt.status === 1) {
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: registry.toLowerCase() },
        { name: registryName || nspace, registryAddress: registry.toLowerCase(), active: true },
        { upsert: true, new: true }
      );
    }

    res.json({ success: receipt.status === 1, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res.status(500).json({ message: error.reason || "Failed to execute" });
  }
});

// ── POST: execute validator update ─────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.executeUpdateValidator(targetAddress);
    const receipt = await tx.wait();

    // If successful, update user's isValidator field
    if (receipt.status === 1) {
      await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action }
      );
    }

    res.json({ success: receipt.status === 1, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res.status(500).json({ message: error.reason || "Failed to execute" });
  }
});

module.exports = router;