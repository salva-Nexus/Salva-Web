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

// ─── Core execution ───────────────────────────────────────────────────────────
//
// SIGNATURE SCHEME — Safe 1.3.0 eth_sign type (v = 31 or 32):
//
//   Safe's ecrecover for v=31/32 internally does:
//     recovered = ecrecover(keccak256("\x19Ethereum Signed Message:\n32" + safeTxHash), v-4, r, s)
//
//   So we sign the raw safeTxHash bytes with NO prefix, then set v = rawV + 4.
//   Safe adds the prefix during ecrecover, which recovers the correct owner address.
//
//   WRONG (previous code): signMessage(safeTxHash) adds prefix BEFORE signing.
//     → Safe adds prefix AGAIN during ecrecover → double-prefixed → wrong address recovered
//     → execTransaction reverts with GS026 (invalid signature)
//
//   CORRECT: signingKey.sign(safeTxHashBytes) — raw secp256k1, no prefix added.
//     → v + 4 → Safe adds prefix once during ecrecover → correct owner recovered ✅
//
async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
  const normalizedSafe = ethers.getAddress(safeAddress);
  const normalizedTo = ethers.getAddress(to);

  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);

  const currentNonce = await safeContract.nonce();

  // 1. Get the Safe EIP-712 transaction hash
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

  // 2. SIGNING FIX: Use signTypedData instead of raw signing.
  // This is the most reliable way to get a valid Safe signature in ethers v6.
  // 2. SIGNING FIX: Use hardcoded chainId for Base Sepolia (84532)
  const domain = {
    verifyingContract: normalizedSafe,
    chainId: 84532, // FORCE BASE SEPOLIA ID
  };

  const types = {
    SafeTx: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "data", type: "bytes" },
      { name: "operation", type: "uint8" },
      { name: "safeTxGas", type: "uint256" },
      { name: "baseGas", type: "uint256" },
      { name: "gasPrice", type: "uint256" },
      { name: "gasToken", type: "address" },
      { name: "refundReceiver", type: "address" },
      { name: "nonce", type: "uint256" },
    ],
  };

  const message = {
    to: normalizedTo,
    value: 0n, // Use BigInt for Ethers v6 consistency
    data: data,
    operation: operation,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: BigInt(currentNonce), // Use BigInt
  };

  const sig = ownerWallet.signingKey.sign(safeTxHash);
  const signature = ethers.concat([
    sig.r,
    sig.s,
    ethers.toBeHex(sig.v + 4), // Safe adjustment
  ]);

  console.log(`🔍 Generated Signature: ${signature.slice(0, 20)}...`);

  // 3. GAS & SUBMISSION FIX
  const safeWithSigner = safeContract.connect(wallet);

  try {
    // We increase the gas limit because MultiSig operations can be heavy
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
      {
        gasLimit: 1200000,
      },
    );

    console.log(`✅ Safe TX submitted: ${tx.hash}`);
    const receipt = await tx.wait();

    if (!receipt || receipt.status === 0) {
      throw new Error("Safe execution reverted");
    }

    return { taskId: tx.hash, txHash: tx.hash, receipt };
  } catch (err) {
    // If the error contains "GS026", it's a signature error.
    // If it's "GS013", it's a revert inside your MultiSig contract logic.
    console.error("❌ Safe Exec Error:", err.message);
    throw err;
  }
}

// ─── Multisig relay helper ────────────────────────────────────────────────────
async function _sponsorMultisigCall(safeAddress, ownerKey, calldata) {
  if (!calldata || calldata === "0x") {
    throw new Error(
      "_sponsorMultisigCall: calldata is empty — ABI encoding failed",
    );
  }
  return _executeViaSafe(safeAddress, ownerKey, MULTISIG_ADDRESS, calldata, 0);
}

// ─── Sponsored Multisig Exports ───────────────────────────────────────────────
async function sponsorProposeInitialization(
  safeAddress,
  ownerKey,
  nspace,
  registry,
) {
  console.log(
    `📦 Encoding proposeInitialization: nspace=${nspace}, registry=${registry}`,
  );
  const calldata = MULTISIG_IFACE.encodeFunctionData("proposeInitialization", [
    nspace,
    registry,
  ]);
  console.log(`📦 proposeInitialization selector: ${calldata.slice(0, 10)}`);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorProposeValidatorUpdate(
  safeAddress,
  ownerKey,
  targetAddress,
  action,
) {
  console.log(
    `📦 Encoding proposeValidatorUpdate: target=${targetAddress}, action=${action}`,
  );
  const calldata = MULTISIG_IFACE.encodeFunctionData("proposeValidatorUpdate", [
    targetAddress,
    action,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorValidateRegistry(safeAddress, ownerKey, registry) {
  console.log(`📦 Encoding validateRegistry: registry=${registry}`);
  const calldata = MULTISIG_IFACE.encodeFunctionData("validateRegistry", [
    registry,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorValidateValidator(safeAddress, ownerKey, targetAddress) {
  console.log(`📦 Encoding validateValidator: target=${targetAddress}`);
  const calldata = MULTISIG_IFACE.encodeFunctionData("validateValidator", [
    targetAddress,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorCancelInit(safeAddress, ownerKey, registry) {
  console.log(`📦 Encoding cancelInit: registry=${registry}`);
  const calldata = MULTISIG_IFACE.encodeFunctionData("cancelInit", [registry]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorCancelValidatorUpdate(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  console.log(`📦 Encoding cancelValidatorUpdate: target=${targetAddress}`);
  const calldata = MULTISIG_IFACE.encodeFunctionData("cancelValidatorUpdate", [
    targetAddress,
  ]);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorExecuteInit(safeAddress, ownerKey, registry) {
  console.log(`🚀 Encoding executeInit: registry=${registry}`);
  const calldata = MULTISIG_IFACE.encodeFunctionData("executeInit", [registry]);
  console.log(`🚀 executeInit calldata: ${calldata}`);
  return _sponsorMultisigCall(safeAddress, ownerKey, calldata);
}

async function sponsorExecuteUpdateValidator(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  console.log(`🚀 Encoding executeUpdateValidator: target=${targetAddress}`);
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
