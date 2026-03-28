const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");
const Safe = require("@safe-global/protocol-kit").default;

// ─── Guard ────────────────────────────────────────────────────────────────────
const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;
if (!MULTISIG_ADDRESS) {
  throw new Error("FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set.");
}

// ─── ABIs ──────────────────────────────────────────────────────────────────────
const MULTISIG_IFACE = new ethers.Interface([
  "function proposeInitialization(string,address) external returns (address,string,bytes16,uint32)",
  "function proposeValidatorUpdate(address,bool) external returns (address,bool,uint32)",
  "function validateRegistry(address) external returns (address,bytes16,uint32)",
  "function validateValidator(address) external returns (address,bool,uint32)",
  "function cancelInit(address) external returns (bool)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  "function executeInit(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
]);

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
  "function getOwners() public view returns (address[])",
];

// ─── Core: ETH Chain (Manual Hashing) ────────────────────────────────────────
async function _executeViaSafeEth(
  safeAddress,
  ownerKey,
  to,
  data,
  operation = 0,
) {
  const normalizedSafe = ethers.getAddress(safeAddress);
  const normalizedTo = ethers.getAddress(to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);

  const currentNonce = await safeContract.nonce();
  const safeTxHash = await safeContract.getTransactionHash(
    normalizedTo,
    0,
    data,
    operation,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    currentNonce,
  );

  const rawSig = ownerWallet.signingKey.sign(ethers.getBytes(safeTxHash));
  const v = rawSig.v + 4;
  const signature =
    "0x" +
    rawSig.r.slice(2) +
    rawSig.s.slice(2) +
    v.toString(16).padStart(2, "0");

  const safeWithSigner = safeContract.connect(wallet);
  const tx = await safeWithSigner.execTransaction(
    normalizedTo,
    0,
    data,
    operation,
    0,
    0,
    0,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    signature,
    { gasLimit: 1_200_000 },
  );

  return { taskId: tx.hash, txHash: tx.hash, receipt: await tx.wait() };
}

// ─── Core: Base Chain (Safe SDK) ─────────────────────────────────────────────
async function _executeViaSafeBase(
  safeAddress,
  ownerKey,
  to,
  data,
  operation = 0,
) {
  // Ensure we pass the raw URL string, NOT the ethers provider object
  const rpcUrl = process.env.ALCHEMY_RPC_URL;

  if (!rpcUrl) {
    throw new Error("RPC_URL is not defined in environment variables");
  }
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: ownerKey,
    safeAddress: safeAddress,
  });

  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{ to: ethers.getAddress(to), data, value: "0", operation }],
  });

  const signedTx = await protocolKit.signTransaction(safeTransaction);

  // We execute using the backend 'wallet' to pay gas
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, wallet);
  const tx = await safeContract.execTransaction(
    signedTx.data.to,
    signedTx.data.value,
    signedTx.data.data,
    signedTx.data.operation,
    signedTx.data.safeTxGas,
    signedTx.data.baseGas,
    signedTx.data.gasPrice,
    signedTx.data.gasToken,
    signedTx.data.refundReceiver,
    signedTx.encodedSignatures(),
    { gasLimit: 1_200_000 },
  );

  return { taskId: tx.hash, txHash: tx.hash, receipt: await tx.wait() };
}

// ─── Multisig Helpers ─────────────────────────────────────────────────────────
function _encodeMultisig(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _callEth(safeAddress, ownerKey, functionName, args) {
  const data = _encodeMultisig(functionName, args);
  return _executeViaSafeEth(safeAddress, ownerKey, MULTISIG_ADDRESS, data, 0);
}

async function _callBase(safeAddress, ownerKey, functionName, args) {
  const data = _encodeMultisig(functionName, args);
  return _executeViaSafeBase(safeAddress, ownerKey, MULTISIG_ADDRESS, data, 0);
}

// ─── Token Transfer & MultiSend ──────────────────────────────────────────────
async function _sponsorTransfer(
  execFn,
  safeAddress,
  ownerKey,
  recipient,
  amount,
  fee = 0n,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const NGN_TOKEN = process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;
  const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

  if (fee > 0n) {
    const encodePacked = (to, data) =>
      ethers.concat([
        "0x00",
        ethers.getAddress(to),
        ethers.zeroPadValue("0x00", 32),
        ethers.zeroPadValue(ethers.toBeHex(ethers.getBytes(data).length), 32),
        data,
      ]);
    const tx1 = iface.encodeFunctionData("transfer", [recipient, amount]);
    const tx2 = iface.encodeFunctionData("transfer", [TREASURY, fee]);
    const packed = ethers.concat([
      encodePacked(NGN_TOKEN, tx1),
      encodePacked(NGN_TOKEN, tx2),
    ]);
    const data = new ethers.Interface([
      "function multiSend(bytes)",
    ]).encodeFunctionData("multiSend", [packed]);
    return execFn(safeAddress, ownerKey, MULTISEND_ADDRESS, data, 1);
  }
  return execFn(
    safeAddress,
    ownerKey,
    NGN_TOKEN,
    iface.encodeFunctionData("transfer", [recipient, amount]),
    0,
  );
}

// ─── Full Export Mapping ──────────────────────────────────────────────────────
module.exports = {
  sponsorSafeTransfer: (...a) => _sponsorTransfer(_executeViaSafeBase, ...a),
  sponsorSafeTransferETH: (...a) => _sponsorTransfer(_executeViaSafeEth, ...a),
  sponsorSafeTransferBase: (...a) =>
    _sponsorTransfer(_executeViaSafeBase, ...a),

  sponsorProposeInitializationEth: (s, k, n, r) =>
    _callEth(s, k, "proposeInitialization", [n, r]),
  sponsorProposeInitializationBase: (s, k, n, r) =>
    _callBase(s, k, "proposeInitialization", [n, r]),

  sponsorProposeValidatorUpdateEth: (s, k, t, a) =>
    _callEth(s, k, "proposeValidatorUpdate", [t, a]),
  sponsorProposeValidatorUpdateBase: (s, k, t, a) =>
    _callBase(s, k, "proposeValidatorUpdate", [t, a]),

  sponsorValidateRegistryEth: (s, k, r) =>
    _callEth(s, k, "validateRegistry", [r]),
  sponsorValidateRegistryBase: (s, k, r) =>
    _callBase(s, k, "validateRegistry", [r]),

  sponsorValidateValidatorEth: (s, k, t) =>
    _callEth(s, k, "validateValidator", [t]),
  sponsorValidateValidatorBase: (s, k, t) =>
    _callBase(s, k, "validateValidator", [t]),

  sponsorCancelInitEth: (s, k, r) => _callEth(s, k, "cancelInit", [r]),
  sponsorCancelInitBase: (s, k, r) => _callBase(s, k, "cancelInit", [r]),

  sponsorCancelValidatorUpdateEth: (s, k, t) =>
    _callEth(s, k, "cancelValidatorUpdate", [t]),
  sponsorCancelValidatorUpdateBase: (s, k, t) =>
    _callBase(s, k, "cancelValidatorUpdate", [t]),

  sponsorExecuteInitEth: (s, k, r) => _callEth(s, k, "executeInit", [r]),
  sponsorExecuteInitBase: (s, k, r) => _callBase(s, k, "executeInit", [r]),

  sponsorExecuteUpdateValidatorEth: (s, k, t) =>
    _callEth(s, k, "executeUpdateValidator", [t]),
  sponsorExecuteUpdateValidatorBase: (s, k, t) =>
    _callBase(s, k, "executeUpdateValidator", [t]),
};
