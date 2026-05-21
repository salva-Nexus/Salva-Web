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

// ─── MultiSig ABI ─────────────────────────────────────────────────────────────
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
  "function proposeImplUpdate(address proxy, address newImpl) external returns (address, uint256)",
  "function validateImplUpdate(address newImpl) external returns (bool, uint256)",
  "function executeImplUpdate(address newImpl) external returns (bool)",
  "function cancelImplUpdate(address newImpl) external returns (bool)",

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

// ─── Interface declarations for pool operations ───────────────────────────────
const ERC20_IFACE = new ethers.Interface([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
]);

const POOL_IFACE = new ethers.Interface([
  "function swapExactNGNAmountForToken(address _receiver, address _swapTokenOut, address _ngnToken, uint256 _ngnAmountIn) external returns (bool)",
  "function swapExactTokenAmountForNGN(address _receiver, address _swapTokenIn, address _ngnTokenOut, uint256 _tokenAmountIn) external returns (bool)",
  "function swapForExactTokenAmount(address _receiver, address _swapTokenOut, address _ngnTokenIn, uint256 _tokenAmountOut) external returns (bool)",
  "function swapForExactNGNAmount(address _receiver, address _swapTokenIn, address _ngnTokenOut, uint256 _ngnAmountOut) external returns (bool)",
]);

const FACTORY_IFACE = new ethers.Interface([
  "function deployPool() external returns (address pool)",
]);

// ─── Core Safe execution helpers ──────────────────────────────────────────────

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

  console.log(
    "Safe tx data:",
    JSON.stringify(
      {
        to: signedSafeTx.data.to,
        data: signedSafeTx.data.data,
        value: signedSafeTx.data.value,
        signatures: signedSafeTx.encodedSignatures(),
      },
      null,
      2,
    ),
  );

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

const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

function _buildMultiSendCalldata(encodedTxs) {
  const payload = ethers.concat(encodedTxs);
  return new ethers.Interface([
    "function multiSend(bytes memory transactions) public payable",
  ]).encodeFunctionData("multiSend", [payload]);
}

// ─── Transfer (existing — unchanged) ─────────────────────────────────────────

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

// ─── Name Link (existing — unchanged) ────────────────────────────────────────

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

    const multiSendCalldata = _buildMultiSendCalldata([
      _encodeMultiSendTx(0, ngnAddr, 0n, approveCalldata),
      _encodeMultiSendTx(0, cleanRegistry, 0n, linkCalldata),
    ]);
    return execFn(
      safeAddress,
      ownerKey,
      MULTISEND_ADDRESS,
      multiSendCalldata,
      1,
    );
  }

  console.log(
    `🔗 Name link (free): Safe=${safeAddress} | Registry=${cleanRegistry} | Wallet=${cleanWallet}`,
  );
  return execFn(safeAddress, ownerKey, cleanRegistry, linkCalldata, 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// POOL RELAY FUNCTIONS (new)
// Every function uses _executeViaSafeBase — msg.sender = user's Safe.
// Backend wallet (wallet) pays gas. User signs the Safe tx with their key.
// ─────────────────────────────────────────────────────────────────────────────

// ── Deploy pool clone via PoolFactory ─────────────────────────────────────────
// msg.sender of deployPool() = user's Safe → Safe becomes pool DEPLOYER
async function _sponsorDeployPool(safeAddress, ownerKey, factoryAddress) {
  const cleanFactory = ethers.getAddress(
    cleanEnvAddr(factoryAddress) || factoryAddress,
  );
  const deployCalldata = FACTORY_IFACE.encodeFunctionData("deployPool", []);
  console.log(`🏭 DeployPool: Safe=${safeAddress} → Factory=${cleanFactory}`);
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    cleanFactory,
    deployCalldata,
    0,
  );
}

// ── NGNs payment from user Safe → any address (subscription fee to treasury) ──
// Simple ERC20.transfer via user's Safe. Backend pays gas.
async function _sponsorNGNsPayment(
  safeAddress,
  ownerKey,
  toAddress,
  amountWei,
) {
  const ngnAddr = cleanEnvAddr(process.env.NGN_TOKEN_ADDRESS);
  if (!ngnAddr) throw new Error("NGN_TOKEN_ADDRESS not configured");

  const cleanTo = ethers.getAddress(cleanEnvAddr(toAddress) || toAddress);
  const calldata = ERC20_IFACE.encodeFunctionData("transfer", [
    cleanTo,
    amountWei,
  ]);

  console.log(
    `💸 NGNs subscription payment: Safe=${safeAddress} → ${cleanTo} (${ethers.formatUnits(amountWei, 6)} NGNs)`,
  );
  return _executeViaSafeBase(safeAddress, ownerKey, ngnAddr, calldata, 0);
}

// ── Approve pool to spend type(uint256).max of a token (trust flow) ───────────
// Called once when user chooses to trust a pool.
// After this, swaps skip the approve step entirely.
async function _sponsorApproveMax(
  safeAddress,
  ownerKey,
  tokenAddress,
  poolAddress,
) {
  const cleanToken = ethers.getAddress(
    cleanEnvAddr(tokenAddress) || tokenAddress,
  );
  const cleanPool = ethers.getAddress(cleanEnvAddr(poolAddress) || poolAddress);
  const calldata = ERC20_IFACE.encodeFunctionData("approve", [
    cleanPool,
    ethers.MaxUint256,
  ]);

  console.log(
    `🔓 ApproveMax (trust): Safe=${safeAddress} Token=${cleanToken} Pool=${cleanPool}`,
  );
  return _executeViaSafeBase(safeAddress, ownerKey, cleanToken, calldata, 0);
}

// ── Approve exact amount + swap in one MultiSend (non-trusted path) ───────────
// tx1: ERC20.approve(pool, exactAmountWei)
// tx2: pool.swapXxx(...)
// Both called as msg.sender = user's Safe via delegatecall MultiSend
async function _sponsorApproveAndSwap(
  safeAddress,
  ownerKey,
  tokenAddress, // token the user is spending (NGNs or stable)
  poolAddress,
  approveAmountWei, // bigint — exact amount to approve (not max)
  swapCalldata, // already-encoded pool function calldata
) {
  const cleanToken = ethers.getAddress(
    cleanEnvAddr(tokenAddress) || tokenAddress,
  );
  const cleanPool = ethers.getAddress(cleanEnvAddr(poolAddress) || poolAddress);

  const approveCalldata = ERC20_IFACE.encodeFunctionData("approve", [
    cleanPool,
    approveAmountWei,
  ]);

  const multiSendCalldata = _buildMultiSendCalldata([
    _encodeMultiSendTx(0, cleanToken, 0n, approveCalldata),
    _encodeMultiSendTx(0, cleanPool, 0n, swapCalldata),
  ]);

  console.log(
    `🔄 ApproveAndSwap (not trusted): Safe=${safeAddress} Token=${cleanToken} Pool=${cleanPool}`,
  );
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    MULTISEND_ADDRESS,
    multiSendCalldata,
    1,
  );
}

// ── Swap only — no approve (trusted path) ────────────────────────────────────
// User already approved max in a prior tx. Single Safe tx.
async function _sponsorSwapOnly(
  safeAddress,
  ownerKey,
  poolAddress,
  swapCalldata,
) {
  const cleanPool = ethers.getAddress(cleanEnvAddr(poolAddress) || poolAddress);
  console.log(`🔄 SwapOnly (trusted): Safe=${safeAddress} Pool=${cleanPool}`);
  return _executeViaSafeBase(safeAddress, ownerKey, cleanPool, swapCalldata, 0);
}

// ── Build swap calldata for any of the 4 pool swap functions ─────────────────
// All 4 functions share the same param order in SalvaPool:
//   (address receiver, address tokenA, address tokenB, uint256 amount)
// receiver is always the user's Safe (they receive the output).
function _buildSwapCalldata(fnName, receiver, tokenA, tokenB, amountBn) {
  return POOL_IFACE.encodeFunctionData(fnName, [
    ethers.getAddress(receiver),
    ethers.getAddress(tokenA),
    ethers.getAddress(tokenB),
    amountBn,
  ]);
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  _executeViaSafeBase,
  _executeViaSafe,

  // ── Transfers (existing)
  sponsorSafeTransfer: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),
  sponsorSafeTransferBase: (s, k, r, a, f, t) =>
    _sponsorTransfer(_executeViaSafeBase, s, k, r, a, f, t),

  // ── Name link (existing)
  sponsorLinkNameBase: (s, k, reg, nb, wa, feeWei, sig) =>
    _sponsorLinkName(_executeViaSafeBase, s, k, reg, nb, wa, feeWei, sig),

  // ── Registry (existing)
  sponsorProposeInitRegistry: (s, k, ns, singleton, factory) =>
    _callBase(s, k, "proposeInitRegistry", [ns, singleton, factory]),
  sponsorValidateRegistryInit: (s, k, registry) =>
    _callBase(s, k, "validateRegistryInit", [registry]),
  sponsorExecuteInitRegistry: (s, k, registry) =>
    _callBase(s, k, "executeInitRegistry", [registry]),
  sponsorCancelRegistryInit: (s, k, registry) =>
    _callBase(s, k, "cancelRegistryInit", [registry]),

  // ── Validator (existing)
  sponsorProposeValidatorUpdate: (s, k, target, action) =>
    _callBase(s, k, "proposeValidatorUpdate", [target, action]),
  sponsorValidateValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "validateValidatorUpdate", [target]),
  sponsorExecuteValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "executeValidatorUpdate", [target]),
  sponsorCancelValidatorUpdate: (s, k, target) =>
    _callBase(s, k, "cancelValidatorUpdate", [target]),

  // ── Upgrade (existing)
  sponsorProposeUpgrade: (s, k, proxy, newImpl, isMultisig) =>
    _callBase(s, k, "proposeUpgrade", [proxy, newImpl, isMultisig]),
  sponsorValidateUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "validateUpgrade", [newImpl]),
  sponsorExecuteUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "executeUpgrade", [newImpl]),
  sponsorCancelUpgrade: (s, k, newImpl) =>
    _callBase(s, k, "cancelUpgrade", [newImpl]),

  // ── Signer update (existing)
  sponsorProposeSignerUpdate: (s, k, proxy, newSigner) =>
    _callBase(s, k, "proposeSignerUpdate", [proxy, newSigner]),
  sponsorValidateSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "validateSignerUpdate", [newSigner]),
  sponsorExecuteSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "executeSignerUpdate", [newSigner]),
  sponsorCancelSignerUpdate: (s, k, newSigner) =>
    _callBase(s, k, "cancelSignerUpdate", [newSigner]),

  // ── BaseRegistry impl update (existing)
  sponsorProposeImplUpdate: (s, k, proxy, newImpl) =>
    _callBase(s, k, "proposeImplUpdate", [proxy, newImpl]),
  sponsorValidateImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "validateImplUpdate", [newImpl]),
  sponsorExecuteImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "executeImplUpdate", [newImpl]),
  sponsorCancelImplUpdate: (s, k, newImpl) =>
    _callBase(s, k, "cancelImplUpdate", [newImpl]),

  // ── Factory fee (existing)
  sponsorUpdateFactoryFee: (s, k, proxy, newFee) =>
    _callBase(s, k, "updateFactoryFee", [proxy, newFee]),

  // ── Pause / Unpause (existing)
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

  // ── Withdraw (existing)
  sponsorWithdrawFromSingleton: (s, k, singleton, token, receiver) =>
    _callBase(s, k, "withdrawFromSingleton", [singleton, token, receiver]),

  // ── Recovery (existing)
  sponsorUpdateRecovery: (s, k, account, action) =>
    _callBase(s, k, "updateRecovery", [account, action]),

  // ── Legacy aliases (existing)
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

  // ── Pool operations (new) ────────────────────────────────────────────────────

  // Deploy a new SalvaPool clone — msg.sender of deployPool() = user's Safe
  sponsorDeployPool: (safeAddress, ownerKey, factoryAddress) =>
    _sponsorDeployPool(safeAddress, ownerKey, factoryAddress),

  // Subscription payment: user Safe transfers NGNs → treasury
  sponsorNGNsPayment: (safeAddress, ownerKey, toAddress, amountWei) =>
    _sponsorNGNsPayment(safeAddress, ownerKey, toAddress, amountWei),

  // Trust pool: user Safe calls ERC20.approve(pool, type(uint256).max)
  sponsorApproveMax: (safeAddress, ownerKey, tokenAddress, poolAddress) =>
    _sponsorApproveMax(safeAddress, ownerKey, tokenAddress, poolAddress),

  // Untrusted swap: MultiSend approve(exact) + swap in one Safe tx
  sponsorApproveAndSwap: (
    safeAddress,
    ownerKey,
    tokenAddress,
    poolAddress,
    approveAmountWei,
    swapCalldata,
  ) =>
    _sponsorApproveAndSwap(
      safeAddress,
      ownerKey,
      tokenAddress,
      poolAddress,
      approveAmountWei,
      swapCalldata,
    ),

  // Trusted swap: single Safe tx calling swap directly (approve already done)
  sponsorSwapOnly: (safeAddress, ownerKey, poolAddress, swapCalldata) =>
    _sponsorSwapOnly(safeAddress, ownerKey, poolAddress, swapCalldata),

  // Build encoded swap calldata to pass into sponsorApproveAndSwap / sponsorSwapOnly
  buildSwapCalldata: _buildSwapCalldata,
};

/**
 * 
 * There is a bug in this trusting pool logic.. 

This is how its meant to be: 

We have -

 NGNs and cNGN -> Naira Stablecoins

and 

USDC and USDT -> USDT Stablecoins



So, Trusted pools should be based on what the pool is taking from the persons wallet..

which means:





In the "Spend NGN, Get USD" section, trust pool logic and check should should work/revolve only around Naira Stablecoins, because those are the token the pool is pulling from the users wallet,. if i trust the pool on NGNs, it should only record trusted on NGNs and the pool address, so if select cNGN in the next swap, it will not show trusted, and there require approval.. and vice versa



In the "Spend USD, Get NGN" section, trust pool logic and check should should work/revolve only around USD Stablecoins, because those are the token the pool is pulling from the users wallet. if i trust the pool on USDT, it should only record trusted on USDT and the pool address, so if select USDC in the next swap, it will not show trusted, and there require approval.. and vice versa



apply this logic surgically, both on L2 (if needed) and L1 remember to explicitly tell me what and where to update, even if it means updating the trusted pool model





const mongoose = require("mongoose");

// Records that a user has approved type(uint256).max for a pool contract
// so that subsequent swaps skip the approve step
const TrustedPoolSchema = new mongoose.Schema({
  userSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  poolAddress: { type: String, required: true, lowercase: true, index: true },
  // Which token was approved (NGNs, USDC, or USDT address)
  tokenAddress: { type: String, required: true, lowercase: true },
  txHash: { type: String, default: null },
  trustedAt: { type: Date, default: Date.now },
});

// One trust record per (user, pool, token) triple
TrustedPoolSchema.index(
  { userSafeAddress: 1, poolAddress: 1, tokenAddress: 1 },
  { unique: true },
);

module.exports = mongoose.model("TrustedPool", TrustedPoolSchema);



 */