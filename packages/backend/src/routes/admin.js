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

let proposalsCache = {
  registryProposals: [],
  validatorProposals: [],
};

// --- Middleware & Helpers ---
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

async function waitForUserOp(userOpHash, maxRetries = 30, delayMs = 2000) {
  console.log(`🔍 Polling Alchemy UserOp: ${userOpHash}`);
  for (let i = 0; i < maxRetries; i++) {
    try {
      const receipt = await provider.send("eth_getUserOperationReceipt", [
        userOpHash,
      ]);
      if (receipt) {
        if (receipt.success === true) {
          return { success: true, returnData: receipt.returnData || null };
        }
        return {
          success: false,
          reason: receipt.reason || "UserOperation reverted on-chain",
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

// --- Cache Management ---
const getRegProposal = (reg) =>
  proposalsCache.registryProposals.find(
    (p) => p.registry === reg.toLowerCase(),
  );
const getValProposal = (addr) =>
  proposalsCache.validatorProposals.find((p) => p.addr === addr.toLowerCase());

function upsertRegProposal(patch) {
  const idx = proposalsCache.registryProposals.findIndex(
    (p) => p.registry === patch.registry,
  );
  if (idx === -1) proposalsCache.registryProposals.push(patch);
  else
    proposalsCache.registryProposals[idx] = {
      ...proposalsCache.registryProposals[idx],
      ...patch,
    };
}

function upsertValProposal(patch) {
  const idx = proposalsCache.validatorProposals.findIndex(
    (p) => p.addr === patch.addr,
  );
  if (idx === -1) proposalsCache.validatorProposals.push(patch);
  else
    proposalsCache.validatorProposals[idx] = {
      ...proposalsCache.validatorProposals[idx],
      ...patch,
    };
}

const removeRegProposal = (reg) => {
  proposalsCache.registryProposals = proposalsCache.registryProposals.filter(
    (p) => p.registry !== reg.toLowerCase(),
  );
};
const removeValProposal = (addr) => {
  proposalsCache.validatorProposals = proposalsCache.validatorProposals.filter(
    (p) => p.addr !== addr.toLowerCase(),
  );
};

// --- Routes ---
router.get("/proposals", (req, res) => res.json(proposalsCache));

router.post("/propose-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, nspace, registry, registryName } = req.body;
    if (!nspace?.startsWith("@"))
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

    if (!taskStatus.success)
      return res.status(500).json({ message: taskStatus.reason });

    const decoded = decodeReturn(
      "proposeInitialization",
      taskStatus.returnData,
    );
    const resolvedRegistry = (decoded?.[0] || registry).toLowerCase();
    const resolvedNspace = decoded?.[1] || nspace;

    upsertRegProposal({
      type: "registry",
      registry: resolvedRegistry,
      nspace: resolvedNspace,
      registryName: registryName || resolvedNspace,
      remainingValidation: null,
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
    res.status(500).json({ message: error.message });
  }
});

router.post("/propose-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const result = await sponsorProposeValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
      action,
    );
    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success)
      return res.status(500).json({ message: taskStatus.reason });

    const decoded = decodeReturn(
      "proposeValidatorUpdate",
      taskStatus.returnData,
    );
    upsertValProposal({
      type: "validator",
      addr: (decoded?.[0] || targetAddress).toLowerCase(),
      action: decoded?.[1] ?? action,
      remainingValidation: null,
      isValidated: false,
      timeLockTimestamp: null,
    });

    await notifyValidators(req.callerUser.safeAddress, "New Validator Update", {
      type: "validator",
      targetAddress,
      action,
    });
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;
    const result = await sponsorValidateRegistry(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success)
      return res.status(500).json({ message: taskStatus.reason });

    const decoded = decodeReturn("validateRegistry", taskStatus.returnData);
    if (decoded) {
      const remainingValidation = Number(decoded[2]);
      const isValidated = remainingValidation === 0;
      upsertRegProposal({
        registry: registry.toLowerCase(),
        remainingValidation,
        isValidated,
        timeLockTimestamp: isValidated
          ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
          : getRegProposal(registry)?.timeLockTimestamp || null,
      });
    }
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/validate-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const result = await sponsorValidateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForUserOp(result.taskId);

    if (!taskStatus.success)
      return res.status(500).json({ message: taskStatus.reason });

    const decoded = decodeReturn("validateValidator", taskStatus.returnData);
    if (decoded) {
      const remainingValidation = Number(decoded[2]);
      const isValidated = remainingValidation === 0;
      upsertValProposal({
        addr: targetAddress.toLowerCase(),
        remainingValidation,
        isValidated,
        timeLockTimestamp: isValidated
          ? Math.floor(Date.now() / 1000) + 24 * 60 * 60
          : getValProposal(targetAddress)?.timeLockTimestamp || null,
      });
    }
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry } = req.body;
    const result = await sponsorCancelInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForUserOp(result.taskId);
    if (taskStatus.success) removeRegProposal(registry);
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/cancel-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress } = req.body;
    const result = await sponsorCancelValidatorUpdate(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForUserOp(result.taskId);
    if (taskStatus.success) removeValProposal(targetAddress);
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-registry", requireValidator, async (req, res) => {
  try {
    const { privateKey, registry, registryName, nspace } = req.body;
    const result = await sponsorExecuteInit(
      req.callerUser.safeAddress,
      privateKey,
      registry,
    );
    const taskStatus = await waitForUserOp(result.taskId);

    if (taskStatus.success) {
      removeRegProposal(registry);
      await WalletRegistry.findOneAndUpdate(
        { registryAddress: registry.toLowerCase() },
        {
          name: registryName || nspace,
          registryAddress: registry.toLowerCase(),
          active: true,
        },
        { upsert: true },
      );
    }
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post("/execute-validator", requireValidator, async (req, res) => {
  try {
    const { privateKey, targetAddress, action } = req.body;
    const result = await sponsorExecuteUpdateValidator(
      req.callerUser.safeAddress,
      privateKey,
      targetAddress,
    );
    const taskStatus = await waitForUserOp(result.taskId);

    if (taskStatus.success) {
      removeValProposal(targetAddress);
      await User.findOneAndUpdate(
        { safeAddress: targetAddress.toLowerCase() },
        { isValidator: action },
      );
    }
    res.json({ success: true, taskId: result.taskId });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
