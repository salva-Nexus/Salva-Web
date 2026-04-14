const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");
const Safe = require("@safe-global/protocol-kit").default;

// ─── Env var sanitizer ────────────────────────────────────────────────────────
function cleanEnvAddr(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']|["']$/g, "");
  const match = s.match(/(0x[0-9a-fA-F]{40})/);
  if (match) return match[1];
  return s.trim() || null;
}

const MULTISIG_ADDRESS = cleanEnvAddr(process.env.MULTISIG_CONTRACT_ADDRESS);
if (!MULTISIG_ADDRESS)
  throw new Error("FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set.");
console.log(`🔗 RelayService using MULTISIG: ${MULTISIG_ADDRESS}`);

const MULTISIG_IFACE = new ethers.Interface([
  "function deployAndInitRegistry(string memory namespace) external returns (address _clone)",
  "function proposeValidatorUpdate(address,bool) external returns (address,bool,uint32)",
  "function validateValidator(address) external returns (address,bool,uint32)",
  "function cancelValidatorUpdate(address) external returns (bool)",
  "function executeUpdateValidator(address) external returns (bool)",
]);

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
  "function getOwners() public view returns (address[])",
];

async function _executeViaSafeEth(
  safeAddress,
  ownerKey,
  to,
  data,
  operation = 0,
) {
  const normalizedSafe = ethers.getAddress(
    cleanEnvAddr(safeAddress) || safeAddress,
  );
  const normalizedTo = ethers.getAddress(cleanEnvAddr(to) || to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);
  const currentNonce = await safeContract.nonce();
  const safeTxHash = await safeContract.getTransactionHash(
    normalizedTo,
    0n,
    data,
    operation,
    0n,
    0n,
    0n,
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
    0n,
    data,
    operation,
    0n,
    0n,
    0n,
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    signature,
    { gasLimit: 1_200_000 },
  );
  const receipt = await tx.wait();
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

async function _executeViaSafeBase(
  safeAddress,
  ownerKey,
  target,
  data,
  operation = 0,
) {
  const rpcUrl = process.env.BASE_MAINNET_RPC_URL;
  const cleanSafe = ethers.getAddress(cleanEnvAddr(safeAddress) || safeAddress);
  const cleanTarget = ethers.getAddress(cleanEnvAddr(target) || target);
  const hexData = typeof data === "string" ? data : ethers.hexlify(data);
  console.log(
    `🔄 Safe sponsored execution → Safe=${cleanSafe} | Target=${cleanTarget}`,
  );
  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: ownerKey,
    safeAddress: cleanSafe,
  });
  const safeTransaction = await protocolKit.createTransaction({
    transactions: [
      { to: cleanTarget, data: hexData, value: "0", operation: operation },
    ],
  });
  const signedSafeTx = await protocolKit.signTransaction(safeTransaction);
  const safeContract = new ethers.Contract(cleanSafe, SAFE_ABI, wallet);
  const tx = await safeContract.execTransaction(
    signedSafeTx.data.to,
    BigInt(signedSafeTx.data.value || "0"),
    signedSafeTx.data.data,
    Number(signedSafeTx.data.operation || 0),
    BigInt(signedSafeTx.data.safeTxGas || "0"),
    BigInt(signedSafeTx.data.baseGas || "0"),
    BigInt(signedSafeTx.data.gasPrice || "0"),
    signedSafeTx.data.gasToken || ethers.ZeroAddress,
    signedSafeTx.data.refundReceiver || ethers.ZeroAddress,
    signedSafeTx.encodedSignatures(),
    { gasLimit: 2_800_000 },
  );
  const receipt = await tx.wait();
  console.log(`✅ Safe tx confirmed: ${tx.hash}`);
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

function _encodeMultisig(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _callBase(safeAddress, ownerKey, functionName, args) {
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    _encodeMultisig(functionName, args),
    0,
  );
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
  const TOKEN =
    cleanEnvAddr(tokenAddress) || cleanEnvAddr(process.env.NGN_TOKEN_ADDRESS);
  const TREASURY = cleanEnvAddr(process.env.TREASURY_CONTRACT_ADDRESS);
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

// ─── Name Link Multicall ──────────────────────────────────────────────────────
// BaseRegistry.link() signature:
//   link(bytes _name, address _wallet, address _feeToken, bytes signature) external
//
// The registry calls IERC20(_feeToken).safeTransferFrom(msg.sender, singleton, fee)
// where fee = _feeToken == ngns ? 1000e6 : 1e6
// so the Safe must approve the registry for the correct amount before calling link.
//
// Multicall (both operation=0, regular calls, msg.sender = Safe via delegatecall):
//   tx1: feeToken.approve(registryAddress, feeAmount)   ← 1000e6 NGNs OR 1e6 USDC/USDT
//   tx2: registry.link(nameBytes, wallet, feeTokenAddress, signature)
//
// Backend wallet pays gas. User Safe signs via their decrypted private key.
// No ETH fee. No Chainlink.
async function _sponsorLinkName(
  execFn,
  safeAddress,
  ownerKey,
  registryAddress,
  nameBytes, // Uint8Array from ethers.toUtf8Bytes(pureName)
  walletAddress, // checksummed address string
  feeTokenAddress, // USDC, USDT, or NGNs address from .env
  signature, // 65-byte hex signature from backend wallet
) {
  const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

  const cleanRegistry = ethers.getAddress(
    cleanEnvAddr(registryAddress) || registryAddress,
  );
  const cleanFeeToken = ethers.getAddress(
    cleanEnvAddr(feeTokenAddress) || feeTokenAddress,
  );
  const cleanWallet = ethers.getAddress(walletAddress);

  // Fee amount must match exactly what the registry will pull via safeTransferFrom:
  //   NGNs token  → 1000e6  (1,000 NGNs, 6 decimals)
  //   USDC / USDT → 1e6     ($1, 6 decimals)
  // Both tokens use 6 decimals so the unit is consistent.
  const ngnAddr = cleanEnvAddr(process.env.NGN_TOKEN_ADDRESS);
  const isNgn =
    ngnAddr && cleanFeeToken.toLowerCase() === ngnAddr.toLowerCase();
  const feeAmount = isNgn
    ? ethers.parseUnits("1000", 6) // 1,000 NGNs
    : ethers.parseUnits("1", 6); // $1 USDC or USDT

  console.log(
    `💰 Approve amount: ${ethers.formatUnits(feeAmount, 6)} ${isNgn ? "NGNs" : "USDC/USDT"}`,
  );

  const erc20Iface = new ethers.Interface([
    "function approve(address spender, uint256 amount) returns (bool)",
  ]);
  const registryIface = new ethers.Interface([
    "function link(bytes calldata _name, address _wallet, address _feeToken, bytes calldata signature) external",
  ]);

  // nameBytes and signature must be hex strings for ethers ABI encoding
  const nameBytesHex = ethers.hexlify(nameBytes);
  const signatureHex =
    typeof signature === "string" ? signature : ethers.hexlify(signature);

  // tx1: approve registry to spend exactly what it will pull
  const approveCalldata = erc20Iface.encodeFunctionData("approve", [
    cleanRegistry,
    feeAmount,
  ]);

  // tx2: call registry.link — registry verifies signature then pulls fee via transferFrom
  const linkCalldata = registryIface.encodeFunctionData("link", [
    nameBytesHex, // bytes  — raw name, no namespace suffix
    cleanWallet, // address — wallet to bind alias to
    cleanFeeToken, // address — token registry will pull from Safe
    signatureHex, // bytes  — 65-byte ECDSA sig from backend signer
  ]);

  console.log(`🔗 Name link multicall:`);
  console.log(`   Safe:      ${safeAddress}`);
  console.log(`   Registry:  ${cleanRegistry}`);
  console.log(`   FeeToken:  ${cleanFeeToken} (approve + transferFrom)`);
  console.log(`   Wallet:    ${cleanWallet}`);

  // Pack both transactions for MultiSend
  const multiSendPayload = ethers.concat([
    _encodeMultiSendTx(0, cleanFeeToken, 0n, approveCalldata), // approve
    _encodeMultiSendTx(0, cleanRegistry, 0n, linkCalldata), // link
  ]);

  // MultiSend is called via delegatecall (operation=1) so msg.sender = Safe throughout
  const multiSendCalldata = new ethers.Interface([
    "function multiSend(bytes memory transactions) public payable",
  ]).encodeFunctionData("multiSend", [multiSendPayload]);

  return execFn(safeAddress, ownerKey, MULTISEND_ADDRESS, multiSendCalldata, 1);
}

module.exports = {
  _executeViaSafeBase,
  _executeViaSafeEth,

  sponsorSafeTransfer: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),
  sponsorSafeTransferETH: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeEth, s, k, r, a, f, t),
  sponsorSafeTransferBase: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),

  // (safeAddress, ownerKey, registryAddress, nameBytes, walletAddress, feeTokenAddress, signature)
  sponsorLinkNameBase: (s, k, reg, nb, wa, token, sig) =>
    _sponsorLinkName(_executeViaSafeBase, s, k, reg, nb, wa, token, sig),
  sponsorLinkNameEth: (s, k, reg, nb, wa, token, sig) =>
    _sponsorLinkName(_executeViaSafeEth, s, k, reg, nb, wa, token, sig),

  sponsorDeployAndInitRegistryBase: (s, k, ns) =>
    _callBase(s, k, "deployAndInitRegistry", [ns]),
  sponsorDeployAndInitRegistryEth: (s, k, ns) =>
    _callEth(s, k, "deployAndInitRegistry", [ns]),
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
