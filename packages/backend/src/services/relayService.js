// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

// ─── Guard: fail loudly at startup if critical env vars are missing ───────────
const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;
if (!MULTISIG_ADDRESS) {
  throw new Error(
    "FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set. relayService cannot initialize.",
  );
}

// ─── ABI — must exactly match the deployed contract signatures ────────────────
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

// ─── Core execution functions ────────────────────────────────────────────────

// ETH version
async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
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

  const sig = await ownerWallet.signMessage(ethers.getBytes(safeTxHash));
  const signature = ethers.concat([
    sig.r ?? ethers.getBytes(sig).slice(0, 32),
    sig.s ?? ethers.getBytes(sig).slice(32, 64),
    ethers.toBeHex(sig.v ?? 27),
  ]);

  const safeWithSigner = safeContract.connect(wallet);

  try {
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
    if (!receipt || receipt.status === 0)
      throw new Error("Safe execution reverted on ETH");
    return { taskId: tx.hash, txHash: tx.hash, receipt };
  } catch (err) {
    console.error("❌ Safe Exec Error on ETH:", err.message);
    throw err;
  }
}

// Base chain version
async function _executeViaSafeBase(
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

  const sig = ownerWallet.signingKey.sign(safeTxHash); // raw secp256k1, no prefix
  const signature = ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v)]);

  const safeWithSigner = safeContract.connect(wallet);

  try {
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
    if (!receipt || receipt.status === 0)
      throw new Error("Safe execution reverted on Base");
    return { taskId: tx.hash, txHash: tx.hash, receipt };
  } catch (err) {
    console.error("❌ Safe Exec Error on Base:", err.message);
    throw err;
  }
}

// ─── Sponsor helpers ─────────────────────────────────────────────────────────
async function _sponsorMultisigCallETH(safeAddress, ownerKey, calldata) {
  if (!calldata || calldata === "0x") throw new Error("ABI encoding failed");
  return _executeViaSafe(safeAddress, ownerKey, MULTISIG_ADDRESS, calldata, 0);
}

async function _sponsorMultisigCallBase(safeAddress, ownerKey, calldata) {
  if (!calldata || calldata === "0x") throw new Error("ABI encoding failed");
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    calldata,
    0,
  );
}

// ─── Exported sponsor functions (ETH & Base versions) ────────────────────────
function _createSponsorFunction(functionName) {
  return (safeAddress, ownerKey, ...args) => {
    const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
    return {
      eth: () => _sponsorMultisigCallETH(safeAddress, ownerKey, calldata),
      base: () => _sponsorMultisigCallBase(safeAddress, ownerKey, calldata),
    };
  };
}

const sponsorProposeInitialization = _createSponsorFunction(
  "proposeInitialization",
);
const sponsorProposeValidatorUpdate = _createSponsorFunction(
  "proposeValidatorUpdate",
);
const sponsorValidateRegistry = _createSponsorFunction("validateRegistry");
const sponsorValidateValidator = _createSponsorFunction("validateValidator");
const sponsorCancelInit = _createSponsorFunction("cancelInit");
const sponsorCancelValidatorUpdate = _createSponsorFunction(
  "cancelValidatorUpdate",
);
const sponsorExecuteInit = _createSponsorFunction("executeInit");
const sponsorExecuteUpdateValidator = _createSponsorFunction(
  "executeUpdateValidator",
);

// ─── Token Transfer ───────────────────────────────────────────────────────────
async function sponsorSafeTransferETH(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const NGN_TOKEN = process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;
  if (!NGN_TOKEN) throw new Error("NGN_TOKEN_ADDRESS env var is not set");

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

async function sponsorSafeTransferBase(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const NGN_TOKEN = process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;
  if (!NGN_TOKEN) throw new Error("NGN_TOKEN_ADDRESS env var is not set");

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
    return _executeViaSafeBase(
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
    return _executeViaSafeBase(safeAddress, ownerKey, NGN_TOKEN, data, 0);
  }
}

// ─── Module exports ───────────────────────────────────────────────────────────
module.exports = {
  sponsorSafeTransferETH,
  sponsorSafeTransferBase,
  sponsorProposeInitialization,
  sponsorProposeValidatorUpdate,
  sponsorValidateRegistry,
  sponsorValidateValidator,
  sponsorCancelInit,
  sponsorCancelValidatorUpdate,
  sponsorExecuteInit,
  sponsorExecuteUpdateValidator,
};
