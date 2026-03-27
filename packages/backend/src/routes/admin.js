// packages/backend/src/routes/admin.js
const express = require("express");
const router = express.Router();
const relayService = require("../services/relayService");

const SAFE_ADDRESS = process.env.SAFE_ADDRESS;
const OWNER_KEY = process.env.OWNER_PRIVATE_KEY;

// ─── Helper to safely execute sponsor functions ─────────────────────────────
/**
 * Executes a sponsor function from relayService
 * @param {Function} sponsorFnCreator - The sponsor function creator (e.g., sponsorProposeInitialization)
 * @param {Array} args - Arguments to pass to the sponsor function
 * @param {'eth'|'base'} chain - Chain to execute on (default 'eth')
 */
async function executeSponsorFn(sponsorFnCreator, args, chain = "eth") {
  if (typeof sponsorFnCreator !== "function") {
    throw new TypeError("sponsorFnCreator must be a function");
  }

  const sponsorCall = sponsorFnCreator(...args);

  if (!sponsorCall || typeof sponsorCall[chain] !== "function") {
    throw new Error(`Sponsor function does not support chain '${chain}'`);
  }

  return sponsorCall[chain]();
}

// ─── Routes ────────────────────────────────────────────────────────────────

// Example: Propose registry initialization
router.post("/propose-initialization", async (req, res) => {
  const { registryName, registryAddress, chain } = req.body;

  if (!registryName || !registryAddress) {
    return res
      .status(400)
      .json({ error: "Missing registryName or registryAddress" });
  }

  const sponsorFn = relayService.sponsorProposeInitialization;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, registryName, registryAddress],
      chain || "eth",
    );
    res.json({
      message: "Propose initialization submitted",
      txHash: txResult.txHash,
    });
  } catch (err) {
    console.error("❌ Propose initialization failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Propose validator update
router.post("/propose-validator-update", async (req, res) => {
  const { validatorAddress, isActive, chain } = req.body;

  if (!validatorAddress || typeof isActive !== "boolean") {
    return res
      .status(400)
      .json({ error: "Missing validatorAddress or isActive flag" });
  }

  const sponsorFn = relayService.sponsorProposeValidatorUpdate;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, validatorAddress, isActive],
      chain || "eth",
    );
    res.json({
      message: "Validator update proposed",
      txHash: txResult.txHash,
    });
  } catch (err) {
    console.error("❌ Propose validator update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Validate registry
router.post("/validate-registry", async (req, res) => {
  const { registryAddress, chain } = req.body;

  if (!registryAddress)
    return res.status(400).json({ error: "Missing registryAddress" });

  const sponsorFn = relayService.sponsorValidateRegistry;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, registryAddress],
      chain || "eth",
    );
    res.json({ message: "Registry validated", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Validate registry failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Validate validator
router.post("/validate-validator", async (req, res) => {
  const { validatorAddress, chain } = req.body;

  if (!validatorAddress)
    return res.status(400).json({ error: "Missing validatorAddress" });

  const sponsorFn = relayService.sponsorValidateValidator;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, validatorAddress],
      chain || "eth",
    );
    res.json({ message: "Validator validated", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Validate validator failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Cancel initialization
router.post("/cancel-init", async (req, res) => {
  const { targetAddress, chain } = req.body;

  if (!targetAddress)
    return res.status(400).json({ error: "Missing targetAddress" });

  const sponsorFn = relayService.sponsorCancelInit;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, targetAddress],
      chain || "eth",
    );
    res.json({ message: "Initialization canceled", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Cancel initialization failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Cancel validator update
router.post("/cancel-validator-update", async (req, res) => {
  const { targetAddress, chain } = req.body;

  if (!targetAddress)
    return res.status(400).json({ error: "Missing targetAddress" });

  const sponsorFn = relayService.sponsorCancelValidatorUpdate;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, targetAddress],
      chain || "eth",
    );
    res.json({ message: "Validator update canceled", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Cancel validator update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Execute initialization
router.post("/execute-init", async (req, res) => {
  const { targetAddress, chain } = req.body;

  if (!targetAddress)
    return res.status(400).json({ error: "Missing targetAddress" });

  const sponsorFn = relayService.sponsorExecuteInit;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, targetAddress],
      chain || "eth",
    );
    res.json({ message: "Initialization executed", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Execute initialization failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Execute validator update
router.post("/execute-validator-update", async (req, res) => {
  const { targetAddress, chain } = req.body;

  if (!targetAddress)
    return res.status(400).json({ error: "Missing targetAddress" });

  const sponsorFn = relayService.sponsorExecuteUpdateValidator;

  try {
    const txResult = await executeSponsorFn(
      sponsorFn,
      [SAFE_ADDRESS, OWNER_KEY, targetAddress],
      chain || "eth",
    );
    res.json({ message: "Validator update executed", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Execute validator update failed:", err);
    res.status(500).json({ error: err.message });
  }
});

// Example: Sponsor token transfer
router.post("/sponsor-transfer", async (req, res) => {
  const { recipientAddress, amountWei, feeWei = "0", chain } = req.body;

  if (!recipientAddress || !amountWei) {
    return res
      .status(400)
      .json({ error: "Missing recipientAddress or amountWei" });
  }

  const sponsorFn =
    chain === "base"
      ? relayService.sponsorSafeTransferBase
      : relayService.sponsorSafeTransferETH;

  try {
    const txResult = await sponsorFn(
      SAFE_ADDRESS,
      OWNER_KEY,
      recipientAddress,
      BigInt(amountWei),
      BigInt(feeWei),
    );
    res.json({ message: "Transfer executed", txHash: txResult.txHash });
  } catch (err) {
    console.error("❌ Sponsor transfer failed:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
