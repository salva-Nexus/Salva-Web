// Salva-Digital-Tech/packages/backend/src/services/relayService.js
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

// ─── MultiSig ABI — all functions exposed to the admin panel ─────────────────
const MULTISIG_IFACE = new ethers.Interface([
  // ── Registry
  "function proposeInitRegistry(string memory namespace_, address singleton, address factory) external returns (address, bytes31, uint256)",
  "function validateRegistryInit(address registry) external returns (address, bool, uint256)",
  "function executeInitRegistry(address registry) external returns (bool)",
  "function cancelRegistryInit(address registry) external returns (bool)",

  // ── Validator
  "function proposeValidatorUpdate(address target, bool action) external returns (address, bool, uint256)",
  "function validateValidatorUpdate(address target) external returns (address, bool, uint256)",
  "function executeValidatorUpdate(address target) external returns (bool)",
  "function cancelValidatorUpdate(address target) external returns (bool)",

  // ── Upgrades
  "function proposeUpgrade(address proxy, address newImpl, bool isMultisig) external returns (address, uint256)",
  "function validateUpgrade(address newImpl) external returns (bool, uint256)",
  "function executeUpgrade(address newImpl) external returns (bool)",
  "function cancelUpgrade(address newImpl) external returns (bool)",

  // ── Signer Update
  "function proposeSignerUpdate(address proxy, address newSigner) external returns (address, uint256)",
  "function validateSignerUpdate(address newSigner) external returns (bool, uint256)",
  "function executeSignerUpdate(address newSigner) external returns (bool)",
  "function cancelSignerUpdate(address newSigner) external returns (bool)",

  // ── BaseRegistry Impl Update
  "function proposeBaseRegistryImplUpdate(address proxy, address newImpl) external returns (address, uint256)",
  "function validateBaseRegistryImplUpdate(address newImpl) external returns (bool, uint256)",
  "function executeBaseRegistryImplUpdate(address newImpl) external returns (bool)",
  "function cancelBaseRegistryImplUpdate(address newImpl) external returns (bool)",

  // ── Factory Fee (immediate)
  "function updateFactoryFee(address proxy, uint256 newFee) external returns (bool)",

  // ── Pause / Unpause
  "function pauseState(address proxy, uint128 mark) external returns (bool)",
  "function proposeUnpause(address proxy, uint128 mark) external returns (uint256)",
  "function validateUnpause(address proxy) external returns (bool, uint256)",
  "function executeUnpause(address proxy) external returns (bool)",
  "function cancelUnpause(address proxy) external returns (bool)",

  // ── Withdraw
  "function withdrawFromSingleton(address singleton, address token, address receiver) external",

  // ── Recovery
  "function updateRecovery(address account, bool action) external returns (bool)",
]);

const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
  "function getOwners() public view returns (address[])",
];

// ─── Core Safe execution helpers ─────────────────────────────────────────────

async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
  const normalizedSafe = ethers.getAddress(
    cleanEnvAddr(safeAddress) || safeAddress,
  );
  const normalizedTo = ethers.getAddress(cleanEnvAddr(to) || to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const hexData = typeof data === "string" ? data : ethers.hexlify(data);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);
  const currentNonce = await safeContract.nonce();
  const safeTxHash = await safeContract.getTransactionHash(
    normalizedTo,
    0n,
    hexData,
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
    hexData,
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
  const rpcUrl =
    process.env.NODE_ENV === "production"
      ? process.env.BASE_MAINNET_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL;
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
    transactions: [{ to: cleanTarget, data: hexData, value: "0", operation }],
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

// ─── Encoding helpers ─────────────────────────────────────────────────────────

function _encode(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _callBase(safeAddress, ownerKey, functionName, args) {
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    _encode(functionName, args),
    0,
  );
}

// ─── MultiSend helpers ────────────────────────────────────────────────────────

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

// ─── Transfer ─────────────────────────────────────────────────────────────────

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
  const MULTISEND = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
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
    return execFn(safeAddress, ownerKey, MULTISEND, data, 1);
  }
  return execFn(
    safeAddress,
    ownerKey,
    TOKEN,
    iface.encodeFunctionData("transfer", [recipient, amount]),
    0,
  );
}

// ─── Name Link ────────────────────────────────────────────────────────────────
// v2.1.0: link(bytes _name, address _wallet, bytes signature)
// No _feeToken param. Fee handled separately via approve before link.
// If feeWei > 0: multicall approve(NGNs → registry, feeWei) + link
// If feeWei = 0: direct link call only — no approve needed

async function _sponsorLinkName(
  execFn,
  safeAddress,
  ownerKey,
  registryAddress,
  nameBytes,
  walletAddress,
  feeWei,
  signature,
) {
  const MULTISEND = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";
  const cleanRegistry = ethers.getAddress(
    cleanEnvAddr(registryAddress) || registryAddress,
  );
  const cleanWallet = ethers.getAddress(walletAddress);
  const nameBytesHex = ethers.hexlify(nameBytes);
  const signatureHex =
    typeof signature === "string" ? signature : ethers.hexlify(signature);
  const feeBigInt = typeof feeWei === "bigint" ? feeWei : BigInt(feeWei || 0);

  const registryIface = new ethers.Interface([
    "function link(bytes calldata _name, address _wallet, bytes calldata signature) external returns (bool)",
  ]);
  const linkCalldata = registryIface.encodeFunctionData("link", [
    nameBytesHex,
    cleanWallet,
    signatureHex,
  ]);

  if (feeBigInt > 0n) {
    const ngnAddr = cleanEnvAddr(process.env.NGN_TOKEN_ADDRESS);
    if (!ngnAddr) throw new Error("NGN_TOKEN_ADDRESS not configured");

    const erc20Iface = new ethers.Interface([
      "function approve(address spender, uint256 amount) returns (bool)",
    ]);
    const approveCalldata = erc20Iface.encodeFunctionData("approve", [
      cleanRegistry,
      feeBigInt,
    ]);

    console.log(
      `💰 Link with fee: approve ${ethers.formatUnits(feeBigInt, 6)} NGNs → ${cleanRegistry}`,
    );
    console.log(
      `🔗 Name link multicall: Safe=${safeAddress} | Registry=${cleanRegistry} | Wallet=${cleanWallet}`,
    );

    const multiSendPayload = ethers.concat([
      _encodeMultiSendTx(0, ngnAddr, 0n, approveCalldata),
      _encodeMultiSendTx(0, cleanRegistry, 0n, linkCalldata),
    ]);
    const multiSendCalldata = new ethers.Interface([
      "function multiSend(bytes memory transactions) public payable",
    ]).encodeFunctionData("multiSend", [multiSendPayload]);

    return execFn(safeAddress, ownerKey, MULTISEND, multiSendCalldata, 1);
  }

  // fee == 0 — direct link, no approve needed
  console.log(
    `🔗 Name link (free): Safe=${safeAddress} | Registry=${cleanRegistry} | Wallet=${cleanWallet}`,
  );
  return execFn(safeAddress, ownerKey, cleanRegistry, linkCalldata, 0);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  _executeViaSafeBase,
  _executeViaSafe,

  // ── Transfers
  sponsorSafeTransfer: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),
  sponsorSafeTransferBase: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),

  // ── Name link — uses _executeViaSafeBase (same as transfer, proven to work)
  sponsorLinkNameBase: (s, k, reg, nb, wa, feeWei, sig) =>
    _sponsorLinkName(_executeViaSafeBase, s, k, reg, nb, wa, feeWei, sig),

  // ── Registry
  sponsorProposeInitRegistry: (s, k, ns, singleton, factory) =>
    _callBase(s, k, "proposeInitRegistry", [ns, singleton, factory]),
  sponsorValidateRegistryInit: (s, k, registry) =>
    _callBase(s, k, "validateRegistryInit", [registry]),
  sponsorExecuteInitRegistry: (s, k, registry) =>
    _callBase(s, k, "executeInitRegistry", [registry]),
  sponsorCancelRegistryInit: (s, k, registry) =>
    _callBase(s, k, "cancelRegistryInit", [registry]),

  // ── Validator
  sponsorProposeValidatorUpdate: (s, k, target, action) =>
    _callBase(s, k, "proposeValidatorUpdate", [target, action]),
  sponsorValidateValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "validateValidatorUpdate", [target]),
  sponsorExecuteValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "executeValidatorUpdate", [target]),
  sponsorCancelValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "cancelValidatorUpdate", [target]),

  // ── Upgrade
  sponsorProposeUpgrade: (s, k, proxy, newImpl, isMultisig) =>
    _callBase(s, k, "proposeUpgrade", [proxy, newImpl, isMultisig]),
  sponsorValidateUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "validateUpgrade", [newImpl]),
  sponsorExecuteUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "executeUpgrade", [newImpl]),
  sponsorCancelUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "cancelUpgrade", [newImpl]),

  // ── Signer update
  sponsorProposeSignerUpdate: (s, k, proxy, newSigner) =>
    _callBase(s, k, "proposeSignerUpdate", [proxy, newSigner]),
  sponsorValidateSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "validateSignerUpdate", [newSigner]),
  sponsorExecuteSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "executeSignerUpdate", [newSigner]),
  sponsorCancelSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "cancelSignerUpdate", [newSigner]),

  // ── BaseRegistry impl update
  sponsorProposeBaseRegistryImplUpdate: (s, k, proxy, newImpl) =>
    _callBase(s, k, "proposeBaseRegistryImplUpdate", [proxy, newImpl]),
  sponsorValidateBaseRegistryImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "validateBaseRegistryImplUpdate", [newImpl]),
  sponsorExecuteBaseRegistryImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "executeBaseRegistryImplUpdate", [newImpl]),
  sponsorCancelBaseRegistryImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "cancelBaseRegistryImplUpdate", [newImpl]),

  // ── Factory fee
  sponsorUpdateFactoryFee: (s, k, proxy, newFee) =>
    _callBase(s, k, "updateFactoryFee", [proxy, newFee]),

  // ── Pause / Unpause
  sponsorPauseState: (s, k, proxy, mark) =>
    _callBase(s, k, "pauseState", [proxy, mark]),
  sponsorProposeUnpause: (s, k, proxy, mark) =>
    _callBase(s, k, "proposeUnpause", [proxy, mark]),
  sponsorValidateUnpause: (s, k, proxy) =>
    _callBase(s, k, "validateUnpause", [proxy]),
  sponsorExecuteUnpause: (s, k, proxy) =>
    _callBase(s, k, "executeUnpause", [proxy]),
  sponsorCancelUnpause: (s, k, proxy) =>
    _callBase(s, k, "cancelUnpause", [proxy]),

  // ── Withdraw
  sponsorWithdrawFromSingleton: (s, k, singleton, token, receiver) =>
    _callBase(s, k, "withdrawFromSingleton", [singleton, token, receiver]),

  // ── Recovery
  sponsorUpdateRecovery: (s, k, account, action) =>
    _callBase(s, k, "updateRecovery", [account, action]),

  // ── Legacy aliases
  sponsorDeployAndInitRegistryBase: (s, k, ns) =>
    _callBase(s, k, "proposeInitRegistry", [
      ns,
      process.env.SALVA_SINGLETON,
      process.env.REGISTRY_FACTORY,
    ]),
  sponsorProposeValidatorUpdateBase: (s, k, t, a) =>
    _callBase(s, k, "proposeValidatorUpdate", [t, a]),
  sponsorValidateValidatorBase: (s, k, t) =>
    _callBase(s, k, "validateValidatorUpdate", [t]),
  sponsorCancelValidatorUpdateBase: (s, k, t) =>
    _callBase(s, k, "cancelValidatorUpdate", [t]),
  sponsorExecuteUpdateValidatorBase: (s, k, t) =>
    _callBase(s, k, "executeValidatorUpdate", [t]),
};
