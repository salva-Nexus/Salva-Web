// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

// ─── Guard ────────────────────────────────────────────────────────────────────
const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;
if (!MULTISIG_ADDRESS) {
  throw new Error("FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set.");
}

// ─── ABIs ─────────────────────────────────────────────────────────────────────
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
async function _executeViaSafe(safeAddress, ownerKey, to, data, operation = 0) {
  if (!safeAddress || !ownerKey || !to || !data) {
    throw new Error(
      `_executeViaSafe: missing params — safeAddress=${safeAddress}, to=${to}, hasData=${!!data}`,
    );
  }

  const normalizedSafe = ethers.getAddress(safeAddress);
  const normalizedTo = ethers.getAddress(to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);

  // Read-only contract for view calls (nonce, getOwners, getTransactionHash)
  const safeReader = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);

  // Verify owner controls this Safe before spending gas
  const owners = await safeReader.getOwners();
  if (!owners.map((o) => o.toLowerCase()).includes(ownerWallet.address.toLowerCase())) {
    throw new Error(
      `${ownerWallet.address} is not an owner of Safe ${normalizedSafe}. Owners: ${owners.join(", ")}`,
    );
  }

  const currentNonce = await safeReader.nonce();
  console.log(`🔍 Safe: ${normalizedSafe} | nonce: ${currentNonce} | to: ${normalizedTo}`);
  console.log(`🔍 Calldata selector: ${data.slice(0, 10)}`);

  const safeTxHash = await safeReader.getTransactionHash(
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

  // Raw secp256k1 sign — no prefix. Safe adds prefix during ecrecover (v=31/32).
  const rawSig = ownerWallet.signingKey.sign(ethers.getBytes(safeTxHash));
  const v = rawSig.v + 4; // 27→31 or 28→32
  const signature =
    "0x" +
    rawSig.r.slice(2) +
    rawSig.s.slice(2) +
    v.toString(16).padStart(2, "0");

  console.log(`🔍 Signature v=${v}: ${signature.slice(0, 22)}...`);

  // ─── FIX: create a NEW contract instance bound to the signer wallet.
  // Using safeReader.connect(wallet) in ethers v6 can lose the interface
  // and produce an empty `data` field on the submitted tx.
  // Creating a fresh Contract with the wallet as provider avoids this.
  const safeWriter = new ethers.Contract(normalizedSafe, SAFE_ABI, wallet);

  const tx = await safeWriter.execTransaction(
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

  console.log(`✅ Safe TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();

  if (!receipt || receipt.status === 0) {
    throw new Error(`Safe inner call reverted. TX: ${tx.hash}`);
  }

  console.log(`✅ Safe TX confirmed: ${tx.hash}`);
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

// ─── Multisig call helpers ────────────────────────────────────────────────────
function _encode(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  if (!calldata || calldata === "0x")
    throw new Error(`ABI encoding failed for ${functionName}`);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _call(safeAddress, ownerKey, functionName, args) {
  const data = _encode(functionName, args);
  return _executeViaSafe(safeAddress, ownerKey, MULTISIG_ADDRESS, data, 0);
}

// ─── Token transfer ───────────────────────────────────────────────────────────
async function _sponsorTransfer(safeAddress, ownerKey, recipient, amount, fee = 0n) {
  const iface = new ethers.Interface(["function transfer(address,uint256)"]);
  const NGN_TOKEN = process.env.NGN_TOKEN_ADDRESS;
  const TREASURY = process.env.TREASURY_CONTRACT_ADDRESS;
  const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

  if (!NGN_TOKEN) throw new Error("NGN_TOKEN_ADDRESS env var is not set");

  if (fee > 0n) {
    const encodePacked = (to, data) => {
      const dataBytes = ethers.getBytes(data);
      return ethers.concat([
        "0x00",
        ethers.getBytes(ethers.getAddress(to)),
        ethers.zeroPadValue("0x00", 32),
        ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32),
        dataBytes,
      ]);
    };
    const tx1 = iface.encodeFunctionData("transfer", [recipient, amount]);
    const tx2 = iface.encodeFunctionData("transfer", [TREASURY, fee]);
    const packed = ethers.concat([encodePacked(NGN_TOKEN, tx1), encodePacked(NGN_TOKEN, tx2)]);
    const data = new ethers.Interface(["function multiSend(bytes)"]).encodeFunctionData("multiSend", [packed]);
    return _executeViaSafe(safeAddress, ownerKey, MULTISEND_ADDRESS, data, 1);
  }

  const data = iface.encodeFunctionData("transfer", [recipient, amount]);
  return _executeViaSafe(safeAddress, ownerKey, NGN_TOKEN, data, 0);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Token transfer
  sponsorSafeTransfer:     (s, k, r, a, f) => _sponsorTransfer(s, k, r, a, f),
  sponsorSafeTransferETH:  (s, k, r, a, f) => _sponsorTransfer(s, k, r, a, f),
  sponsorSafeTransferBase: (s, k, r, a, f) => _sponsorTransfer(s, k, r, a, f),

  // Registry
  sponsorProposeInitializationEth:  (s, k, n, r) => _call(s, k, "proposeInitialization",  [n, r]),
  sponsorProposeInitializationBase: (s, k, n, r) => _call(s, k, "proposeInitialization",  [n, r]),
  sponsorValidateRegistryEth:       (s, k, r)    => _call(s, k, "validateRegistry",       [r]),
  sponsorValidateRegistryBase:      (s, k, r)    => _call(s, k, "validateRegistry",       [r]),
  sponsorCancelInitEth:             (s, k, r)    => _call(s, k, "cancelInit",             [r]),
  sponsorCancelInitBase:            (s, k, r)    => _call(s, k, "cancelInit",             [r]),
  sponsorExecuteInitEth:            (s, k, r)    => _call(s, k, "executeInit",            [r]),
  sponsorExecuteInitBase:           (s, k, r)    => _call(s, k, "executeInit",            [r]),

  // Validator
  sponsorProposeValidatorUpdateEth:  (s, k, t, a) => _call(s, k, "proposeValidatorUpdate",  [t, a]),
  sponsorProposeValidatorUpdateBase: (s, k, t, a) => _call(s, k, "proposeValidatorUpdate",  [t, a]),
  sponsorValidateValidatorEth:       (s, k, t)    => _call(s, k, "validateValidator",       [t]),
  sponsorValidateValidatorBase:      (s, k, t)    => _call(s, k, "validateValidator",       [t]),
  sponsorCancelValidatorUpdateEth:   (s, k, t)    => _call(s, k, "cancelValidatorUpdate",   [t]),
  sponsorCancelValidatorUpdateBase:  (s, k, t)    => _call(s, k, "cancelValidatorUpdate",   [t]),
  sponsorExecuteUpdateValidatorEth:  (s, k, t)    => _call(s, k, "executeUpdateValidator",  [t]),
  sponsorExecuteUpdateValidatorBase: (s, k, t)    => _call(s, k, "executeUpdateValidator",  [t]),
};