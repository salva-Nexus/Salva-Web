// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const Safe4337Pack = require("@safe-global/relay-kit").Safe4337Pack;
const { ethers } = require("ethers");
// Add this temporarily at the top of relayService.js, right after the require
console.log("🔍 Safe4337Pack.init source:", Safe4337Pack.init.toString().slice(0, 500));

const RPC_URL = process.env.ALCHEMY_RPC_URL;
const GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;
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

// ── Core: init Safe4337Pack for a given signer + safe ─────────────────────
async function initSafe4337(safeAddress, ownerKey) {
  const checksumAddress = ethers.getAddress(safeAddress);

  const safe4337Pack = await Safe4337Pack.init(
    {
      provider: RPC_URL,
      signer: ownerKey,
      bundlerUrl: RPC_URL,
      paymasterOptions: {
        isSponsored: true,
        paymasterUrl: RPC_URL,
        sponsorshipPolicyId: GAS_POLICY_ID,
      },
      safeAddress: checksumAddress, // keep it here too just in case
    },
    {
      safeAddress: checksumAddress, // second arg — this is what line 1057 is checking
    },
  );

  return safe4337Pack;
}

// ── Core: build, sign, send a UserOperation ───────────────────────────────
async function _executeViaAlchemy(safeAddress, ownerKey, transactions) {
  const safe4337Pack = await initSafe4337(safeAddress, ownerKey);

  const safeOperation = await safe4337Pack.createTransaction({ transactions });
  const signedOperation = await safe4337Pack.signSafeOperation(safeOperation);
  const userOpHash = await safe4337Pack.executeTransaction({
    executable: signedOperation,
  });

  console.log(`✅ Alchemy UserOp Hash: ${userOpHash}`);
  return { taskId: userOpHash };
}

// ── Internal: multisig call helper ────────────────────────────────────────
async function _sponsorMultisigCall(safeAddress, ownerKey, calldata) {
  const transactions = [{ to: MULTISIG_ADDRESS, data: calldata, value: "0" }];
  return _executeViaAlchemy(safeAddress, ownerKey, transactions);
}

// ─────────────────────────────────────────────────────────────────────────
// MULTISIG SPONSORED FUNCTIONS
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
// TOKEN SPONSORED FUNCTION — transfer only
// ─────────────────────────────────────────────────────────────────────────

async function sponsorSafeTransfer(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const checksumAddress = ethers.getAddress(safeAddress);

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

  return _executeViaAlchemy(checksumAddress, ownerKey, transactions);
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
