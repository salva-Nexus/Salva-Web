// Salva-Digital-Tech/packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const User = require("../models/User");
const WalletRegistry = require("../models/WalletRegistry");
const { sendValidatorProposalEmail } = require("../services/emailService");
const { sponsorSafeMultisigCall } = require("../services/relayService");
const { GelatoRelay } = require("@gelatonetwork/relay-sdk");

const relay = new GelatoRelay();

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

// How many blocks to scan back for events.
const EVENT_BLOCK_RANGE = 1_000_000;

// ABI — only need the fragments to encode calldata + read events
const MULTISIG_IFACE = new ethers.Interface([
    "function proposeInitialization(string,address) external returns (string,bool)",
    "function proposeValidatorUpdate(address,bool) external returns (bool)",
    "function validateRegistry(address) external returns (bool)",
    "function validateValidator(address) external returns (bool)",
    "function cancelInit(address) external returns (bool)",
    "function cancelValidatorUpdate(address) external returns (bool)",
    "function executeInit(address) external returns (bool)",
    "function executeUpdateValidator(address) external returns (bool)",
    "event RegistryInitializationProposed(address indexed registry, string nspace, bytes16 nspaceBytes)",
    "event ValidatorUpdateProposed(address indexed addr, bool action)",
    "event RegistryValidated(address indexed registry, bytes16 nspace, uint128 remainingValidation)",
    "event ValidatorValidated(address indexed addr, bool action, uint128 remainingValidation)",
    "event RegistryInitializationCancelled(address indexed registry)",
    "event ValidatorUpdateCancelled(address indexed addr)",
    "event InitializationSuccess(address indexed registry, bytes16 nspace)",
    "event ValidatorUpdated(address indexed addr, bool action)",
]);

// Read-only contract instance for event querying
function getMultisigReader() {
    return new ethers.Contract(MULTISIG_ADDRESS, MULTISIG_IFACE, provider);
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

// ── Helper: poll Gelato task until confirmed ──────────────────────────────
async function waitForGelatoTask(taskId, maxRetries = 30, delayMs = 2000) {
    console.log(`🔍 Polling Gelato task: ${taskId}`);
    for (let i = 0; i < maxRetries; i++) {
        try {
            const status = await relay.getTaskStatus(taskId);
            console.log(`📊 Task ${taskId} state: ${status.taskState}`);

            if (status.taskState === "ExecSuccess") {
                return { success: true };
            }
            if (["ExecReverted", "Cancelled", "Blacklisted"].includes(status.taskState)) {
                return { success: false, reason: `Task ${status.taskState}` };
            }
            await new Promise((r) => setTimeout(r, delayMs));
        } catch (err) {
            if (i === maxRetries - 1) return { success: false, reason: err.message };
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }
    return { success: false, reason: "Timeout waiting for Gelato task" };
}

// ── Helper: encode + sponsor + wait ───────────────────────────────────────
// This is the core helper every route uses.
// safeAddress = validator's Safe (msg.sender on-chain)
// ownerKey    = decrypted private key from PIN verification
// fnName      = multisig function name string
// args        = array of arguments
async function callMultisig(safeAddress, ownerKey, fnName, args) {
    const calldata = MULTISIG_IFACE.encodeFunctionData(fnName, args);
    const result = await sponsorSafeMultisigCall(safeAddress, ownerKey, MULTISIG_ADDRESS, calldata);
    if (!result || !result.taskId) {
        throw new Error("Failed to submit to Gelato relay");
    }
    const taskStatus = await waitForGelatoTask(result.taskId);
    if (!taskStatus.success) {
        throw new Error(taskStatus.reason || `${fnName} reverted on-chain`);
    }
    return result.taskId;
}

// ── GET: all active proposals ─────────────────────────────────────────────
router.get("/proposals", async (req, res) => {
    try {
        const contract = getMultisigReader();

        const [
            regProposedEvents,
            valProposedEvents,
            regCancelledEvents,
            regExecutedEvents,
            valCancelledEvents,
            valExecutedEvents,
        ] = await Promise.all([
            safeQueryFilter(contract, contract.filters.RegistryInitializationProposed(), EVENT_BLOCK_RANGE),
            safeQueryFilter(contract, contract.filters.ValidatorUpdateProposed(), EVENT_BLOCK_RANGE),
            safeQueryFilter(contract, contract.filters.RegistryInitializationCancelled(), EVENT_BLOCK_RANGE),
            safeQueryFilter(contract, contract.filters.InitializationSuccess(), EVENT_BLOCK_RANGE),
            safeQueryFilter(contract, contract.filters.ValidatorUpdateCancelled(), EVENT_BLOCK_RANGE),
            safeQueryFilter(contract, contract.filters.ValidatorUpdated(), EVENT_BLOCK_RANGE),
        ]);

        const cancelledRegistries = new Set(
            regCancelledEvents.map((e) => e.args?.registry?.toLowerCase()).filter(Boolean),
        );
        const executedRegistries = new Set(
            regExecutedEvents.map((e) => e.args?.registry?.toLowerCase()).filter(Boolean),
        );
        const cancelledValidators = new Set(
            valCancelledEvents.map((e) => e.args?.addr?.toLowerCase()).filter(Boolean),
        );
        const executedValidators = new Set(
            valExecutedEvents.map((e) => e.args?.addr?.toLowerCase()).filter(Boolean),
        );

        const registryProposals = [];
        for (const event of regProposedEvents) {
            try {
                const addr = event.args?.registry?.toLowerCase();
                if (!addr) continue;
                if (cancelledRegistries.has(addr) || executedRegistries.has(addr)) continue;

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
                    latestValEvent && Number(latestValEvent.args?.remainingValidation) === 0;

                let timeLockTimestamp = null;
                if (isValidated && latestValEvent) {
                    try {
                        const block = await provider.getBlock(latestValEvent.blockNumber);
                        timeLockTimestamp = block.timestamp + 24 * 60 * 60;
                    } catch (blockErr) {
                        console.error("Failed to get block for timelock:", blockErr.message);
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
                if (cancelledValidators.has(addr) || executedValidators.has(addr)) continue;

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
                    latestValEvent && Number(latestValEvent.args?.remainingValidation) === 0;

                let timeLockTimestamp = null;
                if (isValidated && latestValEvent) {
                    try {
                        const block = await provider.getBlock(latestValEvent.blockNumber);
                        timeLockTimestamp = block.timestamp + 24 * 60 * 60;
                    } catch (blockErr) {
                        console.error("Failed to get block for timelock:", blockErr.message);
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

// ── POST: propose registry initialization ─────────────────────────────────
// Safe is msg.sender → Safe must be registered as validator in multisig
router.post("/propose-registry", requireValidator, async (req, res) => {
    try {
        const { privateKey, nspace, registry, registryName } = req.body;

        if (!nspace || !nspace.startsWith("@")) {
            return res.status(400).json({ message: "Namespace must start with '@'" });
        }
        if (!ethers.isAddress(registry)) {
            return res.status(400).json({ message: "Invalid registry address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "proposeInitialization", [nspace, registry]);

        await notifyValidators(req.callerUser.safeAddress, "New Registry Proposal", {
            type: "registry",
            registryName: registryName || nspace,
            nspace,
            registry,
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Propose registry error:", error);
        res.status(500).json({ message: error.message || "Failed to propose registry" });
    }
});

// ── POST: propose validator update ─────────────────────────────────────────
router.post("/propose-validator", requireValidator, async (req, res) => {
    try {
        const { privateKey, targetAddress, action } = req.body;

        if (!ethers.isAddress(targetAddress)) {
            return res.status(400).json({ message: "Invalid target address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "proposeValidatorUpdate", [targetAddress, action]);

        await notifyValidators(req.callerUser.safeAddress, "New Validator Update Proposal", {
            type: "validator",
            targetAddress,
            action,
        });

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Propose validator error:", error);
        res.status(500).json({ message: error.message || "Failed to propose validator update" });
    }
});

// ── POST: validate registry proposal ──────────────────────────────────────
router.post("/validate-registry", requireValidator, async (req, res) => {
    try {
        const { privateKey, registry } = req.body;

        if (!ethers.isAddress(registry)) {
            return res.status(400).json({ message: "Invalid registry address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "validateRegistry", [registry]);

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Validate registry error:", error);
        res.status(500).json({ message: error.message || "Failed to validate registry" });
    }
});

// ── POST: validate validator proposal ─────────────────────────────────────
router.post("/validate-validator", requireValidator, async (req, res) => {
    try {
        const { privateKey, targetAddress } = req.body;

        if (!ethers.isAddress(targetAddress)) {
            return res.status(400).json({ message: "Invalid target address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "validateValidator", [targetAddress]);

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Validate validator error:", error);
        res.status(500).json({ message: error.message || "Failed to validate validator" });
    }
});

// ── POST: cancel registry proposal ────────────────────────────────────────
router.post("/cancel-registry", requireValidator, async (req, res) => {
    try {
        const { privateKey, registry } = req.body;

        if (!ethers.isAddress(registry)) {
            return res.status(400).json({ message: "Invalid registry address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "cancelInit", [registry]);

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Cancel registry error:", error);
        res.status(500).json({ message: error.message || "Failed to cancel registry proposal" });
    }
});

// ── POST: cancel validator proposal ───────────────────────────────────────
router.post("/cancel-validator", requireValidator, async (req, res) => {
    try {
        const { privateKey, targetAddress } = req.body;

        if (!ethers.isAddress(targetAddress)) {
            return res.status(400).json({ message: "Invalid target address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "cancelValidatorUpdate", [targetAddress]);

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Cancel validator error:", error);
        res.status(500).json({ message: error.message || "Failed to cancel validator proposal" });
    }
});

// ── POST: execute registry init ────────────────────────────────────────────
router.post("/execute-registry", requireValidator, async (req, res) => {
    try {
        const { privateKey, registry, registryName, nspace } = req.body;

        if (!ethers.isAddress(registry)) {
            return res.status(400).json({ message: "Invalid registry address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "executeInit", [registry]);

        // Upsert into WalletRegistry so it appears in the frontend dropdown
        await WalletRegistry.findOneAndUpdate(
            { registryAddress: registry.toLowerCase() },
            {
                name: registryName || nspace,
                registryAddress: registry.toLowerCase(),
                active: true,
            },
            { upsert: true, new: true },
        );

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Execute registry error:", error);
        res.status(500).json({ message: error.message || "Failed to execute registry init" });
    }
});

// ── POST: execute validator update ─────────────────────────────────────────
router.post("/execute-validator", requireValidator, async (req, res) => {
    try {
        const { privateKey, targetAddress, action } = req.body;

        if (!ethers.isAddress(targetAddress)) {
            return res.status(400).json({ message: "Invalid target address" });
        }

        await callMultisig(req.callerUser.safeAddress, privateKey, "executeUpdateValidator", [targetAddress]);

        // Sync validator status in MongoDB
        await User.findOneAndUpdate(
            { safeAddress: targetAddress.toLowerCase() },
            { isValidator: action },
        );

        res.json({ success: true });
    } catch (error) {
        console.error("❌ Execute validator error:", error);
        res.status(500).json({ message: error.message || "Failed to execute validator update" });
    }
});

module.exports = router;