// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
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

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
];

// ─── Core execution ───────────────────────────────────────────────────────────
// Safe 1.3.0 signature type rules:
//   v = 27/28 → raw secp256k1, submitter MUST be the owner
//   v = 31/32 → prefixed eth_sign, anyone can submit (relayer pattern)
//
// Our setup: ownerKey signs, backend wallet submits (pays gas).
// So we use signMessage() [adds prefix, v=27/28] then +4 → v=31/32.
// Safe sees 31/32, adds the prefix itself during ecrecover, recovers owner. ✅
async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
  console.log(`🔍 _executeViaSafe → Safe: ${safeAddress}, to: ${to}`);

  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);

  // Fresh nonce read
  const currentNonce = await safeContract.nonce();
  console.log(`🔍 Safe nonce: ${currentNonce.toString()}`);
  console.log(`🔍 Owner: ${ownerWallet.address}`);
  console.log(`🔍 Submitter: ${wallet.address}`);

  // Get EIP-712 Safe tx hash
  const txHash = await safeContract.getTransactionHash(
    to,
    0, // value
    data,
    operation, // 0=CALL, 1=DELEGATECALL
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    currentNonce,
  );

  console.log(`🔍 txHash: ${txHash}`);

  // signMessage adds "\x19Ethereum Signed Message:\n32" prefix
  // v from signMessage = 27 or 28
  // +4 → v = 31 or 32 = eth_sign type in Safe
  const flatSig = await ownerWallet.signMessage(ethers.getBytes(txHash));
  const sig = ethers.Signature.from(flatSig);
  const v = (sig.v < 27 ? sig.v + 27 : sig.v) + 4;
  const signature =
    "0x" + sig.r.slice(2) + sig.s.slice(2) + v.toString(16).padStart(2, "0");

  console.log(
    `🔍 Signature v=${v} (eth_sign relayer type): ${signature.slice(0, 22)}...`,
  );

  // Backend wallet submits, pays gas
  const safeWithSigner = safeContract.connect(wallet);

  const tx = await safeWithSigner.execTransaction(
    to,
    0,
    data,
    operation,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    signature,
    { gasLimit: 1000000 },
  );

  console.log(`✅ Safe TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();

  if (!receipt || receipt.status === 0) {
    throw new Error("Safe transaction reverted on-chain");
  }

  console.log(`✅ Safe TX confirmed: ${tx.hash}`);
  return { taskId: tx.hash, receipt };
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
  console.log("🚀 ATTEMPTING EXECUTE FOR REGISTRY:", registry);
  const calldata = MULTISIG_IFACE.encodeFunctionData("executeInit", [registry]);
  console.log("🚀 ENCODED CALLDATA:", calldata);
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
        "0x00",
        toBytes,
        ethers.zeroPadValue("0x00", 32),
        dataLength,
        dataBytes,
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

    return _executeViaSafe(
      safeAddress,
      ownerKey,
      MULTISEND_ADDRESS,
      multisendCalldata,
      1,
    );
  } else {
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
