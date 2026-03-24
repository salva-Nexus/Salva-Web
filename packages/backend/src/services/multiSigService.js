// Salva-Digital-Tech/packages/backend/src/services/multiSigService.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

const MULTISIG_ABI = [
  // Propose
  "function proposeInitialization(string memory _nspace, address registry) external returns (string memory, bool)",
  "function proposeValidatorUpdate(address _addr, bool _action) external returns (bool)",
  // Validate
  "function validateRegistry(address registry) external returns (bool)",
  "function validateValidator(address _addr) external returns (bool)",
  // Cancel
  "function cancelInit(address registry) external returns (bool)",
  "function cancelValidatorUpdate(address _addr) external returns (bool)",
  // Execute
  "function executeInit(address registry) external returns (bool)",
  "function executeUpdateValidator(address _addr) external returns (bool)",
  // Events
  "event RegistryInitializationProposed(address indexed registry, string nspace, bytes16 nspaceBytes)",
  "event ValidatorUpdateProposed(address indexed addr, bool action)",
  "event RegistryValidated(address indexed registry, bytes16 nspace, uint128 remainingValidation)",
  "event ValidatorValidated(address indexed addr, bool action, uint128 remainingValidation)",
  "event RegistryInitializationCancelled(address indexed registry)",
  "event ValidatorUpdateCancelled(address indexed addr)",
  "event InitializationSuccess(address indexed registry, bytes16 nspace)",
  "event ValidatorUpdated(address indexed addr, bool action)",
];

function getMultiSigContract(signerKey) {
  const signer = new ethers.Wallet(signerKey, provider);
  return new ethers.Contract(
    process.env.MULTISIG_CONTRACT_ADDRESS,
    MULTISIG_ABI,
    signer
  );
}

// ── Propose Registry Initialization ────────────────────────────────────────
async function proposeRegistryInit(signerKey, namespace, registryAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.proposeInitialization(namespace, registryAddress);
  const receipt = await tx.wait();

  // Parse emitted event for confirmation data
  const iface = new ethers.Interface(MULTISIG_ABI);
  let eventData = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "RegistryInitializationProposed") {
        eventData = {
          registry: parsed.args[0],
          nspace: parsed.args[1],
          nspaceBytes: parsed.args[2],
        };
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, receipt, eventData };
}

// ── Propose Validator Update ────────────────────────────────────────────────
async function proposeValidatorUpdate(signerKey, targetAddress, action) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.proposeValidatorUpdate(targetAddress, action);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(MULTISIG_ABI);
  let eventData = null;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "ValidatorUpdateProposed") {
        eventData = {
          addr: parsed.args[0],
          action: parsed.args[1],
        };
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, receipt, eventData };
}

// ── Validate Registry ───────────────────────────────────────────────────────
async function validateRegistry(signerKey, registryAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.validateRegistry(registryAddress);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(MULTISIG_ABI);
  let remainingValidation = null;
  let timelockSet = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "RegistryValidated") {
        remainingValidation = Number(parsed.args[2]);
        timelockSet = remainingValidation === 0;
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, remainingValidation, timelockSet };
}

// ── Validate Validator ──────────────────────────────────────────────────────
async function validateValidator(signerKey, targetAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.validateValidator(targetAddress);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(MULTISIG_ABI);
  let remainingValidation = null;
  let timelockSet = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "ValidatorValidated") {
        remainingValidation = Number(parsed.args[2]);
        timelockSet = remainingValidation === 0;
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, remainingValidation, timelockSet };
}

// ── Cancel Registry Init ────────────────────────────────────────────────────
async function cancelRegistryInit(signerKey, registryAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.cancelInit(registryAddress);
  await tx.wait();
  return { txHash: tx.hash };
}

// ── Cancel Validator Update ─────────────────────────────────────────────────
async function cancelValidatorUpdate(signerKey, targetAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.cancelValidatorUpdate(targetAddress);
  await tx.wait();
  return { txHash: tx.hash };
}

// ── Execute Registry Init ───────────────────────────────────────────────────
async function executeRegistryInit(signerKey, registryAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.executeInit(registryAddress);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(MULTISIG_ABI);
  let success = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "InitializationSuccess") {
        success = true;
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, success, receipt };
}

// ── Execute Validator Update ────────────────────────────────────────────────
async function executeValidatorUpdate(signerKey, targetAddress) {
  const contract = getMultiSigContract(signerKey);
  const tx = await contract.executeUpdateValidator(targetAddress);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(MULTISIG_ABI);
  let success = false;
  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed && parsed.name === "ValidatorUpdated") {
        success = true;
        break;
      }
    } catch (_) {}
  }

  return { txHash: tx.hash, success, receipt };
}

module.exports = {
  proposeRegistryInit,
  proposeValidatorUpdate,
  validateRegistry,
  validateValidator,
  cancelRegistryInit,
  cancelValidatorUpdate,
  executeRegistryInit,
  executeValidatorUpdate,
};