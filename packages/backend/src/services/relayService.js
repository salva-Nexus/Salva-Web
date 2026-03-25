// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { GelatoRelayPack } = require("@safe-global/relay-kit");
const SafeClient = require("@safe-global/protocol-kit").default;
const { ethers } = require("ethers");

const sponsorKey = process.env.GELATO_RELAY_API_KEY;
const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

const MULTISIG_IFACE = new ethers.Interface([
  "function proposeInitialization(string,address) external returns (string,bool)",
  "function proposeValidatorUpdate(address,bool) external returns (bool)",
  "function validateRegistry(address) external returns (bool)",
  "function validateValidator(address) external returns (bool)",
  "function cancelInit(address) external returns (bool)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  "function executeInit(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
]);

async function initKits(safeAddress, ownerKey) {
  const protocolKit = await SafeClient.init({
    provider: process.env.BASE_SEPOLIA_RPC_URL,
    signer: ownerKey,
    safeAddress: safeAddress,
  });
  const relayKit = new GelatoRelayPack({ apiKey: sponsorKey, protocolKit });
  return { protocolKit, relayKit };
}

// ── Internal: build, sign, relay a single multisig call through the Safe ─
async function _sponsorMultisigCall(safeAddress, ownerKey, calldata) {
  const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);
  const transactions = [{ to: MULTISIG_ADDRESS, data: calldata, value: "0" }];
  const safeTransaction = await relayKit.createTransaction({
    transactions,
    options: { isSponsored: true },
  });
  const signedSafeTransaction =
    await protocolKit.signTransaction(safeTransaction);
  const result = await relayKit.executeTransaction({
    executable: signedSafeTransaction,
    options: { isSponsored: true },
  });
  console.log(`✅ Multisig TaskId: ${result.taskId}`);
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// MULTISIG SPONSORED FUNCTIONS
// Each one mirrors the pattern of sponsorSafeTransfer/Approve/TransferFrom.
// The Safe is msg.sender on-chain, so the Safe address must be the validator.
// ─────────────────────────────────────────────────────────────────────────

async function sponsorProposeInitialization(
  safeAddress,
  ownerKey,
  nspace,
  registry,
) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("proposeInitialization", [
    nspace,
    registry,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorProposeValidatorUpdate(
  safeAddress,
  ownerKey,
  targetAddress,
  action,
) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("proposeValidatorUpdate", [
    targetAddress,
    action,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorValidateRegistry(safeAddress, ownerKey, registry) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("validateRegistry", [
    registry,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorValidateValidator(safeAddress, ownerKey, targetAddress) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("validateValidator", [
    targetAddress,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorCancelInit(safeAddress, ownerKey, registry) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("cancelInit", [registry]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorCancelValidatorUpdate(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("cancelValidatorUpdate", [
    targetAddress,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorExecuteInit(safeAddress, ownerKey, registry) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("executeInit", [registry]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorExecuteUpdateValidator(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  const calldata = MULTISIG_IFACE.encodeFunctionData("executeUpdateValidator", [
    targetAddress,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

// ─────────────────────────────────────────────────────────────────────────
// TOKEN SPONSORED FUNCTIONS (unchanged)
// ─────────────────────────────────────────────────────────────────────────

async function sponsorSafeTransfer(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const transactions = [
    {
      to: process.env.NGN_TOKEN_ADDRESS,
      data: iface.encodeFunctionData("transfer", [recipientAddress, amountWei]),
      value: "0",
    },
  ];
  if (feeWei > 0n) {
    transactions.push({
      to: process.env.NGN_TOKEN_ADDRESS,
      data: iface.encodeFunctionData("transfer", [
        process.env.TREASURY_CONTRACT_ADDRESS,
        feeWei,
      ]),
      value: "0",
    });
  }
  const safeTransaction = await relayKit.createTransaction({
    transactions,
    options: { isSponsored: true },
  });
  const signedSafeTransaction =
    await protocolKit.signTransaction(safeTransaction);
  const result = await relayKit.executeTransaction({
    executable: signedSafeTransaction,
    options: { isSponsored: true },
  });
  console.log(`✅ Transfer TaskId: ${result.taskId}`);
  return result;
}

async function sponsorSafeApprove(
  safeAddress,
  ownerKey,
  spenderAddress,
  amountWei,
) {
  const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);
  const iface = new ethers.Interface(["function approve(address,uint256)"]);
  const calldata = iface.encodeFunctionData("approve", [
    spenderAddress,
    amountWei,
  ]);
  const transactions = [
    { to: process.env.NGN_TOKEN_ADDRESS, data: calldata, value: "0" },
  ];
  const safeTransaction = await relayKit.createTransaction({
    transactions,
    options: { isSponsored: true },
  });
  const signedSafeTransaction =
    await protocolKit.signTransaction(safeTransaction);
  const result = await relayKit.executeTransaction({
    executable: signedSafeTransaction,
    options: { isSponsored: true },
  });
  console.log(`✅ Approve TaskId: ${result.taskId}`);
  return result;
}

async function sponsorSafeTransferFrom(
  ownerKey,
  safeAddress,
  fromAddress,
  toAddress,
  amountWei,
  feeWei = 0n,
) {
  const { protocolKit, relayKit } = await initKits(safeAddress, ownerKey);
  const iface = new ethers.Interface([
    "function transferFrom(address,address,uint256)",
  ]);
  const transactions = [
    {
      to: process.env.NGN_TOKEN_ADDRESS,
      data: iface.encodeFunctionData("transferFrom", [
        fromAddress,
        toAddress,
        amountWei,
      ]),
      value: "0",
    },
  ];
  if (feeWei > 0n) {
    transactions.push({
      to: process.env.NGN_TOKEN_ADDRESS,
      data: iface.encodeFunctionData("transferFrom", [
        fromAddress,
        process.env.TREASURY_CONTRACT_ADDRESS,
        feeWei,
      ]),
      value: "0",
    });
  }
  const safeTransaction = await relayKit.createTransaction({
    transactions,
    options: { isSponsored: true },
  });
  const signedSafeTransaction =
    await protocolKit.signTransaction(safeTransaction);
  const result = await relayKit.executeTransaction({
    executable: signedSafeTransaction,
    options: { isSponsored: true },
  });
  console.log(`✅ TransferFrom TaskId: ${result.taskId}`);
  return result;
}

module.exports = {
  // Token ops
  sponsorSafeTransfer,
  sponsorSafeApprove,
  sponsorSafeTransferFrom,
  // Multisig ops — one function per contract function
  sponsorProposeInitialization,
  sponsorProposeValidatorUpdate,
  sponsorValidateRegistry,
  sponsorValidateValidator,
  sponsorCancelInit,
  sponsorCancelValidatorUpdate,
  sponsorExecuteInit,
  sponsorExecuteUpdateValidator,
};
