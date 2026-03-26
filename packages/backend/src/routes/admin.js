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

const MULTISIG_IFACE = new ethers.Interface([
  "function proposeInitialization(string,address) external returns (address,string,bytes16,bool)",
  "function proposeValidatorUpdate(address,bool) external returns (address,bool,bool)",
  "function validateRegistry(address) external returns (address,bytes16,uint128,bool)",
  "function validateValidator(address) external returns (address,bool,uint128,bool)",
  "function cancelInit(address) external returns (bool)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  "function executeInit(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
]);

// ── In-memory proposals store ──────────────────────────────────────────────
// Keyed by address for O(1) lookup and update
let proposalsCache = {
  registryProposals: [], // array of proposal objects
  validatorProposals: [], // array of proposal objects
};

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

// ── Poll Alchemy bundler for UserOp receipt and decode return value ────────
// Returns { success, returnData } where returnData is the raw bytes from the
// inner call's return value, decoded by the caller using MULTISIG_IFACE.
async function waitForUserOp(userOpHash, maxRetries = 30, delayMs = 2000) {
  console.log(`🔍 Polling Alchemy UserOp: ${userOpHash}`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.send("eth_getUserOperationReceipt", [
        userOpHash,
      ]);
      if (receipt) {
        if (receipt.success === true) {
          // Extract the return data from the inner call log
          // Alchemy UserOp receipt: receipt.logs contains the execution log
          // The actual call return data is in receipt.receipt.logs or via
          // eth_getTransactionReceipt on the bundler tx hash
          const txHash = receipt.receipt?.transactionHash;
          let returnData = null;
          if (txHash) {
            try {
              const tx = await provider.getTransaction(txHash);
              const txReceipt = await provider.getTransactionReceipt(txHash);
              // The return data lives in the execution result within the UserOp receipt
              // Alchemy exposes it as receipt.returnData (ERC-4337 spec field)
              returnData = receipt.returnData || null;
            } catch (_) {}
          }
          return { success: true, returnData };
        }
        // On-chain revert — the UserOp itself failed
        console.error(`❌ UserOp ${userOpHash} reverted on-chain`);
        return {
          success: false,
          reason: receipt.reason || "UserOperation reverted on-chain",
          returnData: null,
        };
      }
      await sleep(delayMs);
    } catch (err) {
      if (i === maxRetries - 1)
        return { success: false, reason: err.message, returnData: null };
      await sleep(delayMs);
    }
  }
  return {
    success: false,
    reason: "Timeout waiting for UserOp",
    returnData: null,
  };
}

// ── Decode return data helper ──────────────────────────────────────────────
function decodeReturn(fnName, returnData) {
  if (!returnData || returnData === "0x") return null;
  try {
    const fragment = MULTISIG_IFACE.getFunction(fnName);
    return MULTISIG_IFACE.decodeFunctionResult(fragment, returnData);
  } catch (e) {
    console.error(`❌ Failed to decode return for ${fnName}:`, e.message);
    return null;
  }
}

// ── Proposal cache helpers ─────────────────────────────────────────────────
function getRegProposal(registry) {
  return proposalsCache.registryProposals.find(
    (p) => p.registry === registry.toLowerCase(),
  );
}

function getValProposal(addr) {
  return proposalsCache.validatorProposals.find(
    (p) => p.addr === addr.toLowerCase(),
  );
}

function upsertRegProposal(patch) {
  const idx = proposalsCache.registryProposals.findIndex(
    (p) => p.registry === patch.registry,
  );
  if (idx === -1) {
    proposalsCache.registryProposals.push(patch);
  } else {
    proposalsCache.registryProposals[idx] = {
      ...proposalsCache.registryProposals[idx],
      ...patch,
    };
  }
}

function upsertValProposal(patch) {
  const idx = proposalsCache.validatorProposals.findIndex(
    (p) => p.addr === patch.addr,
  );
  if (idx === -1) {
    proposalsCache.validatorProposals.push(patch);
  } else {
    proposalsCache.validatorProposals[idx] = {
      ...proposalsCache.validatorProposals[idx],
      ...patch,
    };
  }
}

function removeRegProposal(registry) {
  proposalsCache.registryProposals = proposalsCache.registryProposals.filter(
    (p) => p.registry !== registry.toLowerCase(),
  );
}

function removeValProposal(addr) {
  proposalsCache.validatorProposals = proposalsCache.validatorProposals.filter(
    (p) => p.addr !== addr.toLowerCase(),
  );
}

// ── GET /proposals ─────────────────────────────────────────────────────────
// Pure in-memory read — no chain calls, no event scanning
router.get("/proposals", (req, res) => {
  res.json(proposalsCache);
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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "proposeInitialization reverted on-chain",
      });
    }

    // Decode: returns (address registry, string nspace, bytes16 nspaceBytes, bool)
    const decoded = decodeReturn(
      "proposeInitialization",
      taskStatus.returnData,
    );

    // decoded[0] = registry address, decoded[1] = nspace string, decoded[3] = true
    // If decode fails we still have the inputs — fall back gracefully
    const resolvedRegistry = (decoded?.[0] || registry).toLowerCase();
    const resolvedNspace = decoded?.[1] || nspace;

    upsertRegProposal({
      type: "registry",
      registry: resolvedRegistry,
      nspace: resolvedNspace,
      registryName: registryName || resolvedNspace,
      remainingValidation: null, // not known yet — no one has validated
      isValidated: false,
      timeLockTimestamp: null,
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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message:
          taskStatus.reason || "proposeValidatorUpdate reverted on-chain",
      });
    }

    // Decode: returns (address addr, bool action, bool)
    const decoded = decodeReturn(
      "proposeValidatorUpdate",
      taskStatus.returnData,
    );

    const resolvedAddr = (decoded?.[0] || targetAddress).toLowerCase();
    const resolvedAction = decoded?.[1] ?? action;

    upsertValProposal({
      type: "validator",
      addr: resolvedAddr,
      action: resolvedAction,
      remainingValidation: null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    await notifyValidators(
      req.callerUser.safeAddress,
      "New Validator Update Proposal",
      { type: "validator", targetAddress, action },
    );

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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "validateRegistry reverted on-chain",
      });
    }

    // Decode: returns (address registry, bytes16 nspace, uint128 remainingValidation, bool)
    const decoded = decodeReturn("validateRegistry", taskStatus.returnData);

    if (decoded) {
      const remainingValidation = Number(decoded[2]);
      const isValidated = remainingValidation === 0;

      const patch = {
        registry: registry.toLowerCase(),
        remainingValidation,
        isValidated,
        // If quorum just reached, set timelock = now + 24h
        timeLockTimestamp: isValidated
          ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
          : getRegProposal(registry)?.timeLockTimestamp || null,
      };

      upsertRegProposal(patch);
    }

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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "validateValidator reverted on-chain",
      });
    }

    // Decode: returns (address addr, bool action, uint128 remainingValidation, bool)
    const decoded = decodeReturn("validateValidator", taskStatus.returnData);

    if (decoded) {
      const remainingValidation = Number(decoded[2]);
      const isValidated = remainingValidation === 0;

      const patch = {
        addr: targetAddress.toLowerCase(),
        remainingValidation,
        isValidated,
        timeLockTimestamp: isValidated
          ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
          : getValProposal(targetAddress)?.timeLockTimestamp || null,
      };

      upsertValProposal(patch);
    }

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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "cancelInit reverted on-chain",
      });
    }

    // Decode: returns (bool) — if true, proposal was cancelled on-chain
    const decoded = decodeReturn("cancelInit", taskStatus.returnData);
    const cancelled = decoded?.[0] ?? true; // true = success

    if (cancelled) {
      removeRegProposal(registry);
    }

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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "cancelValidatorUpdate reverted on-chain",
      });
    }

    const decoded = decodeReturn(
      "cancelValidatorUpdate",
      taskStatus.returnData,
    );
    const cancelled = decoded?.[0] ?? true;

    if (cancelled) {
      removeValProposal(targetAddress);
    }

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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message: taskStatus.reason || "executeInit reverted on-chain",
      });
    }

    // Decode: returns (bool) — true = execution succeeded on-chain
    const decoded = decodeReturn("executeInit", taskStatus.returnData);
    const executed = decoded?.[0] ?? true;

    if (executed) {
      // Remove from active proposals — it's finalized
      removeRegProposal(registry);

      // Persist to WalletRegistry so it shows up in the registry dropdown
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

    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success) {
      return res.status(500).json({
        message:
          taskStatus.reason || "executeUpdateValidator reverted on-chain",
      });
    }

    const decoded = decodeReturn(
      "executeUpdateValidator",
      taskStatus.returnData,
    );
    const executed = decoded?.[0] ?? true;

    if (executed) {
      // Remove from active proposals — it's finalized
      removeValProposal(targetAddress);

      // Sync validator status in DB
      await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action },
      );
    }

    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    console.error("❌ Execute validator error:", error);
    res
      .status(500)
      .json({ message: error.message || "Failed to execute validator update" });
  }
});

module.exports = router;
