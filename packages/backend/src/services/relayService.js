// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
const Safe = require("@safe-global/protocol-kit").default;
const { wallet, provider } = require("./walletSigner");

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

// ─── Core: execute any calldata through a user's Safe ────────────────────────
// ownerKey   = the Safe owner's private key (decrypted from DB via PIN)
// wallet     = backend hot wallet that pays gas
// Safe SDK handles all signing + EIP-712 digest correctly
async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
  console.log(`🔍 _executeViaSafe → Safe: ${safeAddress}, to: ${to}`);

  // Init Safe SDK with the owner key as signer
  const safe = await Safe.init({
    provider: process.env.BASE_SEPOLIA_RPC_URL,
    signer: ownerKey,
    safeAddress,
  });

  // Build the transaction
  const safeTx = await safe.createTransaction({
    transactions: [
      {
        to,
        value: "0",
        data,
        operation, // 0 = CALL, 1 = DELEGATECALL
      },
    ],
  });

  // Sign with the owner key (SDK handles EIP-712 correctly)
  const signedTx = await safe.signTransaction(safeTx);

  console.log(`🔍 Safe TX signed, submitting...`);

  // Execute — SDK submits via the signer (ownerKey wallet)
  // But we want the backend wallet to pay gas, so we relay manually:
  const encodedTx = await safe.getEncodedTransaction(signedTx);

  const txResponse = await wallet.sendTransaction({
    to: safeAddress,
    data: encodedTx,
  });

  console.log(`✅ Safe TX submitted: ${txResponse.hash}`);
  const receipt = await txResponse.wait();

  if (!receipt || receipt.status === 0) {
    throw new Error("Safe transaction reverted on-chain");
  }

  console.log(`✅ Safe TX confirmed: ${txResponse.hash}`);
  return { taskId: txResponse.hash, receipt };
}

// ─── Multisig relay helper ────────────────────────────────────────────────────
async function _sponsorMultisigCall(safeAddress, ownerKey, calldata) {
  return _executeViaSafe(safeAddress, ownerKey, MULTISIG_ADDRESS, calldata, 0);
}

// ─── Sponsored Multisig Exports ───────────────────────────────────────────────
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

// ─── Token Transfer ───────────────────────────────────────────────────────────
async function sponsorSafeTransfer(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const NGN_TOKEN = process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;

  if (feeWei > 0n) {
    // Two transfers via MultiSend (DELEGATECALL)
    const MULTISEND_ABI = [
      "function multiSend(bytes memory transactions) external payable",
    ];
    const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

    const encodePackedTx = (to, data) => {
      const toBytes = ethers.getBytes(to);
      const dataBytes = ethers.getBytes(data);
      const dataLength = ethers.zeroPadValue(
        ethers.toBeHex(dataBytes.length),
        32,
      );
      return ethers.concat([
        "0x00", // operation: CALL
        toBytes, // to (20 bytes)
        ethers.zeroPadValue("0x00", 32), // value (32 bytes, 0)
        dataLength, // data length (32 bytes)
        dataBytes, // data
      ]);
    };

    const tx1Data = iface.encodeFunctionData("transfer", [
      recipientAddress,
      amountWei,
    ]);
    const tx2Data = iface.encodeFunctionData("transfer", [TREASURY, feeWei]);
    const packed = ethers.concat([
      encodePackedTx(NGN_TOKEN, tx1Data),
      encodePackedTx(NGN_TOKEN, tx2Data),
    ]);
    const multisendCalldata = new ethers.Interface(
      MULTISEND_ABI,
    ).encodeFunctionData("multiSend", [packed]);

    // operation = 1 (DELEGATECALL) for MultiSend
    return _executeViaSafe(
      safeAddress,
      ownerKey,
      MULTISEND_ADDRESS,
      multisendCalldata,
      1,
    );
  } else {
    // Single transfer
    const data = iface.encodeFunctionData("transfer", [
      recipientAddress,
      amountWei,
    ]);
    return _executeViaSafe(safeAddress, ownerKey, NGN_TOKEN, data, 0);
  }
}

module.exports = {
  sponsorSafeTransfer,
  sponsorProposeInitialization,
  sponsorProposeValidatorUpdate,
  sponsorValidateRegistry,
  sponsorValidateValidator,
  sponsorCancelInit,
  sponsorCancelValidatorUpdate,
  sponsorExecuteInit,
  sponsorExecuteUpdateValidator,
};
