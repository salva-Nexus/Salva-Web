// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { wallet, provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const { sendValidatorProposalEmail } = require("../services/emailService");

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

// How many blocks to scan back for events.
// Base Sepolia produces ~2 blocks/sec → 7 days ≈ 1,209,600 blocks.
// Keep it conservative (10,000) to avoid RPC timeouts on free-tier nodes.
const EVENT_BLOCK_RANGE = 10000;

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
  if (!safeAddress)
    return res.status(400).json({ message: "safeAddress required" });
  const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!user || !user.isValidator)
    return res.status(403).json({ message: "Not authorized" });
  req.callerUser = user;
  next();
}

// ── Helper: email all OTHER validators ────────────────────────────────────
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

// ── Helper: safe queryFilter with block range fallback ────────────────────
async function safeQueryFilter(contract, filter, blockRange) {
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - blockRange);
    return await contract.queryFilter(filter, fromBlock, latestBlock);
  } catch (error) {
    console.error(
      `queryFilter failed for ${filter?.fragment?.name || "unknown"}, returning empty:`,
      error.message,
    );
    return [];
  }
}

// ── GET: all active proposals ─────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const contract = new ethers.Contract(
      MULTISIG_ADDRESS,
      MULTISIG_ABI,
      provider,
    );

    // Fetch all event types in parallel using safe block range
    const [
      regProposedEvents,
      valProposedEvents,
      regCancelledEvents,
      regExecutedEvents,
      valCancelledEvents,
      valExecutedEvents,
    ] = await Promise.all([
      safeQueryFilter(
        contract,
        contract.filters.RegistryInitializationProposed(),
        EVENT_BLOCK_RANGE,
      ),
      safeQueryFilter(
        contract,
        contract.filters.ValidatorUpdateProposed(),
        EVENT_BLOCK_RANGE,
      ),
      safeQueryFilter(
        contract,
        contract.filters.RegistryInitializationCancelled(),
        EVENT_BLOCK_RANGE,
      ),
      safeQueryFilter(
        contract,
        contract.filters.InitializationSuccess(),
        EVENT_BLOCK_RANGE,
      ),
      safeQueryFilter(
        contract,
        contract.filters.ValidatorUpdateCancelled(),
        EVENT_BLOCK_RANGE,
      ),
      safeQueryFilter(
        contract,
        contract.filters.ValidatorUpdated(),
        EVENT_BLOCK_RANGE,
      ),
    ]);

    const cancelledRegistries = new Set(
      regCancelledEvents
        .map((e) => e.args?.registry?.toLowerCase())
        .filter(Boolean),
    );
    const executedRegistries = new Set(
      regExecutedEvents
        .map((e) => e.args?.registry?.toLowerCase())
        .filter(Boolean),
    );
    const cancelledValidators = new Set(
      valCancelledEvents
        .map((e) => e.args?.addr?.toLowerCase())
        .filter(Boolean),
    );
    const executedValidators = new Set(
      valExecutedEvents.map((e) => e.args?.addr?.toLowerCase()).filter(Boolean),
    );

    // Build registry proposals (active only)
    const registryProposals = [];
    for (const event of regProposedEvents) {
      try {
        const addr = event.args?.registry?.toLowerCase();
        if (!addr) continue;
        if (cancelledRegistries.has(addr) || executedRegistries.has(addr))
          continue;

        // Get latest validation count from RegistryValidated events
        const valEvents = await safeQueryFilter(
          contract,
          contract.filters.RegistryValidated(event.args.registry),
          EVENT_BLOCK_RANGE,
        );
        const latestValEvent = valEvents[valEvents.length - 1];
        const remainingValidation = latestValEvent
          ? Number(latestValEvent.args?.remainingValidation ?? null)
          : null;
        const isValidated =
          latestValEvent &&
          Number(latestValEvent.args?.remainingValidation) === 0;

        // Get timeLock from validated event block timestamp
        let timeLockTimestamp = null;
        if (isValidated && latestValEvent) {
          try {
            const block = await provider.getBlock(latestValEvent.blockNumber);
            timeLockTimestamp = block.timestamp + 24 * 60 * 60; // 24h from quorum
          } catch (blockErr) {
            console.error(
              "Failed to get block for timelock:",
              blockErr.message,
            );
          }
        }

        registryProposals.push({
          type: "registry",
          registry: addr,
          nspace: event.args?.nspace || "",
          remainingValidation,
          isValidated,
          timeLockTimestamp,
          blockNumber: event.blockNumber,
        });
      } catch (propErr) {
        console.error("Error processing registry proposal:", propErr.message);
      }
    }

    // Build validator proposals (active only)
    const validatorProposals = [];
    for (const event of valProposedEvents) {
      try {
        const addr = event.args?.addr?.toLowerCase();
        if (!addr) continue;
        if (cancelledValidators.has(addr) || executedValidators.has(addr))
          continue;

        const valEvents = await safeQueryFilter(
          contract,
          contract.filters.ValidatorValidated(event.args.addr),
          EVENT_BLOCK_RANGE,
        );
        const latestValEvent = valEvents[valEvents.length - 1];
        const remainingValidation = latestValEvent
          ? Number(latestValEvent.args?.remainingValidation ?? null)
          : null;
        const isValidated =
          latestValEvent &&
          Number(latestValEvent.args?.remainingValidation) === 0;

        let timeLockTimestamp = null;
        if (isValidated && latestValEvent) {
          try {
            const block = await provider.getBlock(latestValEvent.blockNumber);
            timeLockTimestamp = block.timestamp + 24 * 60 * 60;
          } catch (blockErr) {
            console.error(
              "Failed to get block for timelock:",
              blockErr.message,
            );
          }
        }

        validatorProposals.push({
          type: "validator",
          addr,
          action: event.args?.action ?? true,
          remainingValidation,
          isValidated,
          timeLockTimestamp,
          blockNumber: event.blockNumber,
        });
      } catch (propErr) {
        console.error("Error processing validator proposal:", propErr.message);
      }
    }

    res.json({ registryProposals, validatorProposals });
  } catch (error) {
    console.error("❌ Proposals fetch error:", error);
    // Return empty arrays rather than 500 — frontend handles gracefully
    res.status(500).json({
      message: "Failed to fetch proposals",
      registryProposals: [],
      validatorProposals: [],
    });
  }
});

// ── POST: propose registry initialization ─────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;
    if (!nspace.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with @" });

    const contract = getMultisigContract(privateKey);
    const formattedNspace = ethers.zeroPadValue(ethers.toUtf8Bytes(nspace), 16);
    const tx = await contract.proposeInitialization(formattedNspace, registry);
    await tx.wait();

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

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res.status(500).json({
      message: error.reason || error.message || "Failed to propose registry",
    });
  }
});

// ── POST: propose validator update ─────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.proposeValidatorUpdate(targetAddress, action);
    await tx.wait();

    await notifyValidators(
      req.callerUser.safeAddress,
      "New Validator Update Proposal",
      {
        type: "validator",
        targetAddress,
        action,
      },
    );

    res.json({ success: true, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res.status(500).json({
      message:
        error.reason || error.message || "Failed to propose validator update",
    });
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
    res.status(500).json({
      message: error.reason || error.message || "Failed to validate registry",
    });
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
    res.status(500).json({
      message: error.reason || error.message || "Failed to validate validator",
    });
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
    res
      .status(500)
      .json({ message: error.reason || error.message || "Failed to cancel" });
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
    res
      .status(500)
      .json({ message: error.reason || error.message || "Failed to cancel" });
  }
});

// ── POST: execute registry init ────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.executeInit(registry);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: registry.toLowerCase() },
        {
          name: registryName || nspace,
          registryAddress: registry.toLowerCase(),
          active: true,
        },
        { upsert: true, new: true },
      );
    }

    res.json({ success: receipt.status === 1, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res
      .status(500)
      .json({ message: error.reason || error.message || "Failed to execute" });
  }
});

// ── POST: execute validator update ─────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const contract = getMultisigContract(privateKey);
    const tx = await contract.executeUpdateValidator(targetAddress);
    const receipt = await tx.wait();

    if (receipt.status === 1) {
      await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action },
      );
    }

    res.json({ success: receipt.status === 1, txHash: tx.hash });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res
      .status(500)
      .json({ message: error.reason || error.message || "Failed to execute" });
  }
});

module.exports = router;
