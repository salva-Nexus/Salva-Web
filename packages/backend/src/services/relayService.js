const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");
const Safe = require("@safe-global/protocol-kit").default;

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;
if (!MULTISIG_ADDRESS) {
  throw new Error("FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set.");
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const MULTISIG_IFACE = new ethers.Interface([
  // deployAndProposeInit replaces proposeInitialization(string,address)
  // Deploys a registry clone and opens a proposal atomically in one tx.
  "function deployAndProposeInit(string memory namespace) external returns (address _clone)",
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

// ─── Core: ETH Chain ──────────────────────────────────────────────────────────
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

  const receipt = await tx.wait();
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

// ─── Core: Base Chain ─────────────────────────────────────────────────────────
// relayService.js — REPLACE your _executeViaSafeBase with this

async function _executeViaSafeBase(safeAddress, ownerKey, to, data, operation = 0) {
  const rpcUrl = process.env.ALCHEMY_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL;

  // 1. Initialize Protocol Kit with the USER'S owner key for signing
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: ownerKey,                    // User's decrypted owner private key
    safeAddress: ethers.getAddress(safeAddress),
  });

  // 2. Create the Safe transaction (this is what gets signed)
  const safeTransaction = await protocolKit.createTransaction({
    transactions: [{
      to: ethers.getAddress(to),         // ← MUST be the MULTISIG
      data: data,
      value: "0",
      operation: operation,              // 0 = Call
    }]
  });

  // 3. Sign it with the owner's key
  const signedSafeTx = await protocolKit.signTransaction(safeTransaction);

  // 4. EXECUTE using the Protocol Kit (this handles everything correctly)
  //    The backend wallet (wallet) will pay gas, but the Safe is the msg.sender
  const executeTxResponse = await protocolKit.executeTransaction(signedSafeTx);

  const receipt = await executeTxResponse.transactionResponse.wait();

  console.log(`✅ Safe tx executed: ${executeTxResponse.transactionResponse.hash}`);

  return {
    taskId: executeTxResponse.transactionResponse.hash,
    txHash: executeTxResponse.transactionResponse.hash,
    receipt
  };
}

// ─── Multisig Helpers ─────────────────────────────────────────────────────────
function _encodeMultisig(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _callEth(safeAddress, ownerKey, functionName, args) {
  return _executeViaSafeEth(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    _encodeMultisig(functionName, args),
    0,
  );
}

// Change this in your relayService.js
async function _callBase(safeAddress, ownerKey, functionName, args) {
  const multisigData = _encodeMultisig(functionName, args);

  return _executeViaSafeBase(
    safeAddress, // The Sender (Safe)
    ownerKey, // The Signer
    process.env.MULTISIG_CONTRACT_ADDRESS, // The Destination (Multisig)
    multisigData,
    0,
  );
}

// ─── MultiSend encoder ────────────────────────────────────────────────────────
// Encodes a single transaction for Safe's MultiSend format:
// operation(1) | to(20) | value(32) | dataLength(32) | data(n)
function _encodeMultiSendTx(operation, to, value, data) {
  const dataBytes = ethers.getBytes(data);
  const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
  let offset = 0;
  buf[offset++] = operation;
  ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
  ethers
    .getBytes(ethers.zeroPadValue(ethers.toBeHex(value), 32))
    .forEach((b) => (buf[offset++] = b));
  ethers
    .getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32))
    .forEach((b) => (buf[offset++] = b));
  dataBytes.forEach((b) => (buf[offset++] = b));
  return buf;
}

// ─── Token Transfer ───────────────────────────────────────────────────────────
// Supports NGN, USDT, USDC via tokenAddress param.
// If fee > 0n, batches transfer + fee to treasury via MultiSend.
// tokenAddress defaults to NGN_TOKEN_ADDRESS if not provided.
async function _sponsorTransfer(
  execFn,
  safeAddress,
  ownerKey,
  recipient,
  amount,
  fee = 0n,
  tokenAddress = null,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const TOKEN = tokenAddress || process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;
  const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

  if (fee > 0n) {
    const tx1 = iface.encodeFunctionData("transfer", [recipient, amount]);
    const tx2 = iface.encodeFunctionData("transfer", [TREASURY, fee]);
    const multiSendData = ethers.concat([
      _encodeMultiSendTx(0, TOKEN, 0n, tx1),
      _encodeMultiSendTx(0, TOKEN, 0n, tx2),
    ]);
    const data = new ethers.Interface([
      "function multiSend(bytes)",
    ]).encodeFunctionData("multiSend", [multiSendData]);
    return execFn(safeAddress, ownerKey, MULTISEND_ADDRESS, data, 1);
  }

  return execFn(
    safeAddress,
    ownerKey,
    TOKEN,
    iface.encodeFunctionData("transfer", [recipient, amount]),
    0,
  );
}

// ─── Name Link MultiCall ──────────────────────────────────────────────────────
// Batches two transactions via Safe MultiSend (delegatecall to MultiSend contract):
//   1. registry.link(_name, _wallet, signature) — payable with ETH fee
//   2. ERC20 feeToken.transfer(treasury, 1 USDT or 1 USDC) — $1 SNS registration fee
async function _sponsorLinkName(
  execFn,
  safeAddress,
  ownerKey,
  registryAddress,
  nameBytes,
  walletAddress,
  signature,
  ethFee,
  feeTokenAddress,
) {
  const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
  const ONE_DOLLAR = ethers.parseUnits("1", 6);

  const registryIface = new ethers.Interface([
    "function link(bytes calldata _name, address _wallet, bytes calldata signature) external payable",
  ]);
  const erc20Iface = new ethers.Interface([
    "function transfer(address,uint256) returns (bool)",
  ]);

  const linkCalldata = registryIface.encodeFunctionData("link", [
    nameBytes,
    walletAddress,
    signature,
  ]);
  const feeCalldata = erc20Iface.encodeFunctionData("transfer", [
    process.env.TREASURY_CONTRACT_ADDRESS,
    ONE_DOLLAR,
  ]);

  const multiSendData = ethers.concat([
    _encodeMultiSendTx(0, registryAddress, ethFee, linkCalldata),
    _encodeMultiSendTx(0, feeTokenAddress, 0n, feeCalldata),
  ]);

  const data = new ethers.Interface([
    "function multiSend(bytes)",
  ]).encodeFunctionData("multiSend", [multiSendData]);
  return execFn(safeAddress, ownerKey, MULTISEND_ADDRESS, data, 1);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // ── Token Transfers ──────────────────────────────────────────────────────
  // Pass tokenAddress for USDT/USDC; omit for NGN (defaults to NGN_TOKEN_ADDRESS)
  sponsorSafeTransfer: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),
  sponsorSafeTransferETH: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeEth, s, k, r, a, f, t),
  sponsorSafeTransferBase: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),

  // ── Name Linking Multicall ───────────────────────────────────────────────
  sponsorLinkNameBase: (s, k, reg, nb, wa, sig, fee, token) =>
    _sponsorLinkName(_executeViaSafeBase, s, k, reg, nb, wa, sig, fee, token),
  sponsorLinkNameEth: (s, k, reg, nb, wa, sig, fee, token) =>
    _sponsorLinkName(_executeViaSafeEth, s, k, reg, nb, wa, sig, fee, token),

  // ── Registry Proposals ───────────────────────────────────────────────────
  // NEW: deployAndProposeInit — deploys clone + proposes in one atomic tx
  sponsorDeployAndProposeInitBase: (s, k, namespace) =>
    _callBase(s, k, "deployAndProposeInit", [namespace]),
  sponsorDeployAndProposeInitEth: (s, k, namespace) =>
    _callEth(s, k, "deployAndProposeInit", [namespace]),

  sponsorValidateRegistryEth: (s, k, r) =>
    _callEth(s, k, "validateRegistry", [r]),
  sponsorValidateRegistryBase: (s, k, r) =>
    _callBase(s, k, "validateRegistry", [r]),
  sponsorCancelInitEth: (s, k, r) => _callEth(s, k, "cancelInit", [r]),
  sponsorCancelInitBase: (s, k, r) => _callBase(s, k, "cancelInit", [r]),
  sponsorExecuteInitEth: (s, k, r) => _callEth(s, k, "executeInit", [r]),
  sponsorExecuteInitBase: (s, k, r) => _callBase(s, k, "executeInit", [r]),

  // ── Validator Proposals ──────────────────────────────────────────────────
  sponsorProposeValidatorUpdateEth: (s, k, t, a) =>
    _callEth(s, k, "proposeValidatorUpdate", [t, a]),
  sponsorProposeValidatorUpdateBase: (s, k, t, a) =>
    _callBase(s, k, "proposeValidatorUpdate", [t, a]),
  sponsorValidateValidatorEth: (s, k, t) =>
    _callEth(s, k, "validateValidator", [t]),
  sponsorValidateValidatorBase: (s, k, t) =>
    _callBase(s, k, "validateValidator", [t]),
  sponsorCancelValidatorUpdateEth: (s, k, t) =>
    _callEth(s, k, "cancelValidatorUpdate", [t]),
  sponsorCancelValidatorUpdateBase: (s, k, t) =>
    _callBase(s, k, "cancelValidatorUpdate", [t]),
  sponsorExecuteUpdateValidatorEth: (s, k, t) =>
    _callEth(s, k, "executeUpdateValidator", [t]),
  sponsorExecuteUpdateValidatorBase: (s, k, t) =>
    _callBase(s, k, "executeUpdateValidator", [t]),
};
