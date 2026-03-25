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
const RPC_PAGE_SIZE = 9;

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

function getMultisigReader() {
  return new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_ABI, provider);
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

async function paginatedQueryFilter(contract, filter, deployBlock = 0) {
  const latestBlock = await provider.getBlockNumber();
  const allEvents = [];

  for (let from = deployBlock; from <= latestBlock; from += RPC_PAGE_SIZE) {
    const to = Math.min(from + RPC_PAGE_SIZE - 1, latestBlock);
    try {
      const events = await contract.queryFilter(filter, from, to);
      allEvents.push(...events);
    } catch (err) {
      console.error(`queryFilter page failed [${from}-${to}]:`, err.message);
    }
  }

  return allEvents;
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
      await new Promise((r) => setTimeout(r, delayMs));
    } catch (err) {
      if (i === maxRetries - 1) return { success: false, reason: err.message };
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  return { success: false, reason: "Timeout waiting for UserOp" };
}

// ── GET: all active proposals ─────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
  try {
    const contract = getMultisigReader();
    const deployBlock = parseInt(process.env.MULTISIG_DEPLOY_BLOCK || "0");

    const [
      regProposedEvents,
      valProposedEvents,
      regCancelledEvents,
      regExecutedEvents,
      valCancelledEvents,
      valExecutedEvents,
    ] = await Promise.all([
      paginatedQueryFilter(
        contract,
        contract.filters.RegistryInitializationProposed(),
        deployBlock,
      ),
      paginatedQueryFilter(
        contract,
        contract.filters.ValidatorUpdateProposed(),
        deployBlock,
      ),
      paginatedQueryFilter(
        contract,
        contract.filters.RegistryInitializationCancelled(),
        deployBlock,
      ),
      paginatedQueryFilter(
        contract,
        contract.filters.InitializationSuccess(),
        deployBlock,
      ),
      paginatedQueryFilter(
        contract,
        contract.filters.ValidatorUpdateCancelled(),
        deployBlock,
      ),
      paginatedQueryFilter(
        contract,
        contract.filters.ValidatorUpdated(),
        deployBlock,
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

    const registryProposals = [];
    for (const event of regProposedEvents) {
      try {
        const addr = event.args?.registry?.toLowerCase();
        if (!addr) continue;
        if (cancelledRegistries.has(addr) || executedRegistries.has(addr))
          continue;

        const valEvents = await paginatedQueryFilter(
          contract,
          contract.filters.RegistryValidated(event.args.registry),
          deployBlock,
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

    const validatorProposals = [];
    for (const event of valProposedEvents) {
      try {
        const addr = event.args?.addr?.toLowerCase();
        if (!addr) continue;
        if (cancelledValidators.has(addr) || executedValidators.has(addr))
          continue;

        const valEvents = await paginatedQueryFilter(
          contract,
          contract.filters.ValidatorValidated(event.args.addr),
          deployBlock,
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
    res.status(500).json({
      message: "Failed to fetch proposals",
      registryProposals: [],
      validatorProposals: [],
    });
  }
});

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
      return res
        .status(500)
        .json({
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

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to propose registry" });
  }
});

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
      return res
        .status(500)
        .json({
          message: taskStatus.reason || "proposeValidatorUpdate reverted",
        });

    await notifyValidators(
      req.callerUser.safeAddress,
      "New Validator Update Proposal",
      {
        type: "validator",
        targetAddress,
        action,
      },
    );

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Propose validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to propose validator update" });
  }
});

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
      return res
        .status(500)
        .json({ message: taskStatus.reason || "validateRegistry reverted" });

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to validate registry" });
  }
});

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
      return res
        .status(500)
        .json({ message: taskStatus.reason || "validateValidator reverted" });

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Validate validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to validate validator" });
  }
});

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
      return res
        .status(500)
        .json({ message: taskStatus.reason || "cancelInit reverted" });

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Cancel registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to cancel registry proposal" });
  }
});

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
      return res
        .status(500)
        .json({
          message: taskStatus.reason || "cancelValidatorUpdate reverted",
        });

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
      return res
        .status(500)
        .json({ message: taskStatus.reason || "executeInit reverted" });

    await WalletRegistry.findOneAndUpdate(
      { registryAddress: registry.toLowerCase() },
      {
        name: registryName || nspace,
        registryAddress: registry.toLowerCase(),
        active: true,
      },
      { upsert: true, new: true },
    );

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute registry error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to execute registry init" });
  }
});

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
      return res
        .status(500)
        .json({
          message: taskStatus.reason || "executeUpdateValidator reverted",
        });

    await User.findOneAndUpdate(
      { safeAddress: targetAddress.toLowerCase() },
      { isValidator: action },
    );

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to execute validator update" });
  }
});

module.exports = router;
