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

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

// ── Alchemy free tier: max 2000 blocks per eth_getLogs, stay under with 1800 ──
const RPC_PAGE_SIZE = 1800;

// ── How long before we re-scan the chain for new events ──
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Throttle between pages: Alchemy free tier allows ~10 CUPS, 1800-block
//    pages mean far fewer calls, so 100ms is plenty ──
const PAGE_DELAY_MS = 100;

// ── Retry backoff on 429 ──
const RATE_LIMIT_BACKOFF_MS = 3000;

const MULTISIG_ABI = [
  "event RegistryInitializationProposed(address indexed registry, string nspace, bytes16 nspaceBytes)",
  "event ValidatorUpdateProposed(address indexed addr, bool action)",
  "event RegistryValidated(address indexed registry, bytes16 nspace, uint128 remainingValidation)",
  "event ValidatorValidated(address indexed addr, bool action, uint128 remainingValidation)",
  "event RegistryInitializationCancelled(address indexed registry)",
  "event ValidatorUpdateCancelled(address indexed addr)",
  "event InitializationSuccess(address indexed registry, bytes16 nspace)",
  "event ValidatorUpdated(address indexed addr, bool action)",
];

// ── In-memory state ────────────────────────────────────────────────────────
// Accumulated raw events — grown incrementally, never rescanned from genesis
const eventStore = {
  regProposed: [],
  valProposed: [],
  regCancelled: [],
  regExecuted: [],
  valCancelled: [],
  valExecuted: [],
  regValidated: [], // keyed by registry address for quick lookup
  valValidated: [], // keyed by validator address for quick lookup
};

// The highest block we have already scanned (exclusive lower bound for next scan)
let lastScannedBlock = null;

// The built proposals list (derived from eventStore, cached)
let proposalsCache = null;
let cacheTimestamp = 0;
let cacheScanInProgress = false;

function getMultisigReader() {
  return new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, provider);
}

// ── Auth middleware ────────────────────────────────────────────────────────
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Paginated queryFilter with large pages and retry on 429 ───────────────
// With 1800-block pages instead of 9-block pages, a 7000-block range
// needs only ~4 calls instead of ~780. Night and day difference.
async function paginatedQueryFilter(contract, filter, fromBlock, toBlock) {
  const allEvents = [];

  for (let from = fromBlock; from <= toBlock; from += RPC_PAGE_SIZE) {
    const to = Math.min(from + RPC_PAGE_SIZE - 1, toBlock);
    let attempts = 0;

    while (attempts < 3) {
      try {
        const events = await contract.queryFilter(filter, from, to);
        allEvents.push(...events);
        break;
      } catch (err) {
        const is429 = err?.error?.code === 429 || err?.message?.includes("429");
        attempts++;
        if (is429 && attempts < 3) {
          console.warn(
            `⚠️  Rate limited on [${from}-${to}], backing off ${RATE_LIMIT_BACKOFF_MS * attempts}ms...`,
          );
          await sleep(RATE_LIMIT_BACKOFF_MS * attempts);
        } else {
          console.error(
            `queryFilter failed [${from}-${to}] for ${
              filter?.fragment?.name || "unknown"
            }:`,
            err.message,
          );
          break;
        }
      }
    }

    await sleep(PAGE_DELAY_MS);
  }

  return allEvents;
}

// ── Incremental scan: only fetch blocks we haven't seen yet ───────────────
async function scanNewBlocks(contract) {
  const deployBlock = parseInt(process.env.MULTISIG_DEPLOY_BLOCK || "0");
  const latestBlock = await provider.getBlockNumber();

  const fromBlock =
    lastScannedBlock === null ? deployBlock : lastScannedBlock + 1;

  if (fromBlock > latestBlock) {
    console.log("📋 No new blocks to scan.");
    return false; // nothing new
  }

  console.log(
    `🔍 Scanning blocks ${fromBlock} → ${latestBlock} for MultiSig events...`,
  );

  // All 8 event types in parallel — but each only covers the NEW block range,
  // so the total call count is tiny compared to a full rescan.
  const [
    newRegProposed,
    newValProposed,
    newRegCancelled,
    newRegExecuted,
    newValCancelled,
    newValExecuted,
    newRegValidated,
    newValValidated,
  ] = await Promise.all([
    paginatedQueryFilter(
      contract,
      contract.filters.RegistryInitializationProposed(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.ValidatorUpdateProposed(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.RegistryInitializationCancelled(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.InitializationSuccess(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.ValidatorUpdateCancelled(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.ValidatorUpdated(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.RegistryValidated(),
      fromBlock,
      latestBlock,
    ),
    paginatedQueryFilter(
      contract,
      contract.filters.ValidatorValidated(),
      fromBlock,
      latestBlock,
    ),
  ]);

  // Append new events into the in-memory store
  eventStore.regProposed.push(...newRegProposed);
  eventStore.valProposed.push(...newValProposed);
  eventStore.regCancelled.push(...newRegCancelled);
  eventStore.regExecuted.push(...newRegExecuted);
  eventStore.valCancelled.push(...newValCancelled);
  eventStore.valExecuted.push(...newValExecuted);
  eventStore.regValidated.push(...newRegValidated);
  eventStore.valValidated.push(...newValValidated);

  lastScannedBlock = latestBlock;

  const newEventCount =
    newRegProposed.length +
    newValProposed.length +
    newRegCancelled.length +
    newRegExecuted.length +
    newValCancelled.length +
    newValExecuted.length +
    newRegValidated.length +
    newValValidated.length;

  console.log(`✅ Scan complete. ${newEventCount} new events found.`);
  return newEventCount > 0;
}

// ── Derive proposals from the accumulated eventStore ─────────────────────
async function buildProposalsFromStore() {
  const cancelledRegistries = new Set(
    eventStore.regCancelled
      .map((e) => e.args?.registry?.toLowerCase())
      .filter(Boolean),
  );
  const executedRegistries = new Set(
    eventStore.regExecuted
      .map((e) => e.args?.registry?.toLowerCase())
      .filter(Boolean),
  );
  const cancelledValidators = new Set(
    eventStore.valCancelled
      .map((e) => e.args?.addr?.toLowerCase())
      .filter(Boolean),
  );
  const executedValidators = new Set(
    eventStore.valExecuted
      .map((e) => e.args?.addr?.toLowerCase())
      .filter(Boolean),
  );

  // Group validation events by registry address for O(1) lookup
  const regValidatedMap = {};
  for (const e of eventStore.regValidated) {
    const addr = e.args?.registry?.toLowerCase();
    if (!addr) continue;
    if (!regValidatedMap[addr]) regValidatedMap[addr] = [];
    regValidatedMap[addr].push(e);
  }

  // Group validation events by validator address
  const valValidatedMap = {};
  for (const e of eventStore.valValidated) {
    const addr = e.args?.addr?.toLowerCase();
    if (!addr) continue;
    if (!valValidatedMap[addr]) valValidatedMap[addr] = [];
    valValidatedMap[addr].push(e);
  }

  // Build registry proposals
  const registryProposals = [];
  for (const event of eventStore.regProposed) {
    try {
      const addr = event.args?.registry?.toLowerCase();
      if (!addr) continue;
      if (cancelledRegistries.has(addr) || executedRegistries.has(addr))
        continue;

      const valEvents = regValidatedMap[addr] || [];
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
        } catch (_) {}
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

  // Build validator proposals
  const validatorProposals = [];
  for (const event of eventStore.valProposed) {
    try {
      const addr = event.args?.addr?.toLowerCase();
      if (!addr) continue;
      if (cancelledValidators.has(addr) || executedValidators.has(addr))
        continue;

      const valEvents = valValidatedMap[addr] || [];
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
        } catch (_) {}
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

  return { registryProposals, validatorProposals };
}

// ── Poll Alchemy bundler for UserOp receipt ───────────────────────────────
async function waitForAlchemyUserOp(
  userOpHash,
  maxRetries = 30,
  delayMs = 2000,
) {
  console.log(`🔍 Polling Alchemy UserOp: ${userOpHash}`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.send("eth_getUserOperationReceipt", [
        userOpHash,
      ]);
      if (receipt) {
        if (receipt.success === true) return { success: true };
        return {
          success: false,
          reason: receipt.reason || "UserOperation reverted",
        };
      }
      await sleep(delayMs);
    } catch (err) {
      if (i === maxRetries - 1) return { success: false, reason: err.message };
      await sleep(delayMs);
    }
  }
  return { success: false, reason: "Timeout waiting for UserOp" };
}

// ── GET /proposals ─────────────────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    // Serve stale cache immediately if a scan is already running
    if (cacheScanInProgress) {
      if (proposalsCache) return res.json(proposalsCache);
      // Wait up to 60s for the in-flight scan to finish
      const ok = await new Promise((resolve) => {
        const poll = setInterval(() => {
          if (!cacheScanInProgress) {
            clearInterval(poll);
            resolve(true);
          }
        }, 500);
        setTimeout(() => {
          clearInterval(poll);
          resolve(false);
        }, 60000);
      });
      if (proposalsCache) return res.json(proposalsCache);
      return res.status(503).json({
        message: "Scan timed out",
        registryProposals: [],
        validatorProposals: [],
      });
    }

    // Serve from cache if fresh and no state-changing action invalidated it
    if (proposalsCache && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
      return res.json(proposalsCache);
    }

    // Lock and scan only NEW blocks
    cacheScanInProgress = true;
    try {
      const contract = getMultisigReader();
      const hadNewEvents = await scanNewBlocks(contract);

      // Rebuild proposals only if something changed (or first load)
      if (hadNewEvents || !proposalsCache) {
        proposalsCache = await buildProposalsFromStore();
      }

      cacheTimestamp = Date.now();
      res.json(proposalsCache);
    } finally {
      cacheScanInProgress = false;
    }
  } catch (error) {
    cacheScanInProgress = false;
    console.error("❌ Proposals fetch error:", error);
    if (proposalsCache) return res.json(proposalsCache);
    res.status(500).json({
      message: "Failed to fetch proposals",
      registryProposals: [],
      validatorProposals: [],
    });
  }
});

// ── POST /propose-registry ─────────────────────────────────────────────────
router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;

    if (!nspace || !nspace.startsWith("@"))
      return res.status(400).json({ message: "Namespace must start with '@'" });
    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorProposeInitialization(
      req.callerUser.safeAddress,
      privateKey,
      nspace,
      registry,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "proposeInitialization reverted",
      });

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

    // Invalidate cache so next GET triggers a fresh incremental scan
    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to propose registry" });
  }
});

// ── POST /propose-validator ────────────────────────────────────────────────
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
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "proposeValidatorUpdate reverted",
      });

    await notifyValidators(
      req.callerUser.safeAddress,
      "New Validator Update Proposal",
      { type: "validator", targetAddress, action },
    );

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to propose validator update" });
  }
});

// ── POST /validate-registry ────────────────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;

    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorValidateRegistry(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "validateRegistry reverted",
      });

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to validate registry" });
  }
});

// ── POST /validate-validator ───────────────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;

    if (!ethers.isAddress(targetAddress))
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorValidateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "validateValidator reverted",
      });

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to validate validator" });
  }
});

// ── POST /cancel-registry ──────────────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;

    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorCancelInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "cancelInit reverted",
      });

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to cancel registry proposal" });
  }
});

// ── POST /cancel-validator ─────────────────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;

    if (!ethers.isAddress(targetAddress))
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorCancelValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "cancelValidatorUpdate reverted",
      });

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel validator error:", error);
    res
      .status(500)
      .json({
        message: error.message || "Failed to cancel validator proposal",
      });
  }
});

// ── POST /execute-registry ─────────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;

    if (!ethers.isAddress(registry))
      return res.status(400).json({ message: "Invalid registry address" });

    const result = await sponsorExecuteInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "executeInit reverted",
      });

    await WalletRegistry.findOneAndUpdate(
      { registryAddress: registry.toLowerCase() },
      {
        name: registryName || nspace,
        registryAddress: registry.toLowerCase(),
        active: true,
      },
      { upsert: true, new: true },
    );

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to execute registry init" });
  }
});

// ── POST /execute-validator ────────────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;

    if (!ethers.isAddress(targetAddress))
      return res.status(400).json({ message: "Invalid target address" });

    const result = await sponsorExecuteUpdateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForAlchemyUserOp(result.taskId);
    if (!taskStatus.success)
      return res.status(500).json({
        message: taskStatus.reason || "executeUpdateValidator reverted",
      });

    await User.findOneAndUpdate(
      { safeAddress: targetAddress.toLowerCase() },
      { isValidator: action },
    );

    proposalsCache = null;
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to execute validator update" });
  }
});

module.exports = router;
