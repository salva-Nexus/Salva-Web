// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

const RPC_URL = process.env.ALCHEMY_RPC_URL;
const GAS_POLICY_ID = process.env.ALCHEMY_GAS_POLICY_ID;
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

// ─── Safe ABI (just what we need) ────────────────────────────────────────────
const SAFE_ABI = [
  "function execTransaction(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, bytes memory signatures) public payable returns (bool success)",
  "function getTransactionHash(address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address payable refundReceiver, uint256 nonce) public view returns (bytes32)",
  "function nonce() public view returns (uint256)",
];

// ─── Build a Safe signature from the owner private key ───────────────────────
async function buildSafeSignature(safeAddress, ownerKey, to, data) {
  const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, provider);
  const nonce = await safeContract.nonce();

  const txHash = await safeContract.getTransactionHash(
    to,
    0, // value
    data,
    0, // operation (CALL)
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress, // gasToken
    ethers.ZeroAddress, // refundReceiver
    nonce,
  );

  // getTransactionHash already returns the EIP-712 digest — sign it directly
  const ownerWallet = new ethers.Wallet(ownerKey, provider);

  // Debug: verify the owner matches what's on-chain
  console.log(`🔍 Signing as owner: ${ownerWallet.address}`);
  console.log(`🔍 Safe address: ${safeAddress}`);
  console.log(`🔍 txHash to sign: ${txHash}`);

  // Verify this address is actually an owner of the Safe
  const OWNERS_ABI = ["function getOwners() view returns (address[])"];
  const safeCheck = new ethers.Contract(safeAddress, OWNERS_ABI, provider);
  const owners = await safeCheck.getOwners();
  console.log(`🔍 Safe owners on-chain:`, owners);
  console.log(
    `🔍 Is signer an owner?`,
    owners
      .map((o) => o.toLowerCase())
      .includes(ownerWallet.address.toLowerCase()),
  );

  const flatSig = await ownerWallet.signingKey.sign(ethers.getBytes(txHash));
  const flatSigHex = flatSig.serialized;

  const sig = ethers.Signature.from(flatSigHex);
  const v = sig.v < 27 ? sig.v + 27 : sig.v;
  const signature =
    sig.r.slice(2) + sig.s.slice(2) + v.toString(16).padStart(2, "0");

  console.log(
    `🔍 Signature built (v=${sig.v}): 0x${signature.slice(0, 20)}...`,
  );

  return { safeContract, nonce, signature };
}

// ─── Execute a tx through the Safe, sponsored via Alchemy ────────────────────
async function _executeViaSafe(safeAddress, ownerKey, to, data) {
  const { safeContract, signature } = await buildSafeSignature(
    safeAddress,
    ownerKey,
    to,
    data,
  );

  // Use the backend wallet to submit (it pays gas, Alchemy reimburses via policy)
  const safeWithSigner = safeContract.connect(wallet);

  // Add this temporary block inside _executeViaSafe before the execTransaction call
  try {
    await provider.estimateGas({
      from: wallet.address,
      to: safeAddress,
      data: safeContract.interface.encodeFunctionData("execTransaction", [
        to,
        0,
        data,
        0,
        0,
        0,
        0,
        ethers.ZeroAddress,
        ethers.ZeroAddress,
        "0x" + signature.toLowerCase(),
      ]),
    });
  } catch (error) {
    console.log("❌ DETAILED REVERT REASON:", error.reason || error.message);
  }

  const tx = await safeWithSigner.execTransaction(
    to,
    0,
    data,
    0, // operation CALL
    0, // safeTxGas
    0, // baseGas
    0, // gasPrice
    ethers.ZeroAddress,
    ethers.ZeroAddress,
    "0x" + signature,
  );

  console.log(`✅ Safe TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();

  return { taskId: tx.hash, receipt };
}

async function _sponsorMultisigCall(safeAddress, ownerKey, calldata) {
  return _executeViaSafe(safeAddress, ownerKey, MULTISIG_ADDRESS, calldata);
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

// ─── Token Transfer (also via Safe execTransaction) ──────────────────────────
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
    // Two transfers: recipient + treasury fee
    // Encode as a MultiSend batch
    const MULTISEND_ABI = [
      "function multiSend(bytes memory transactions) external payable",
    ];
    const MULTISEND_ADDRESS = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526"; // Safe MultiSend on Base Sepolia

    const encodePackedTx = (to, data) => {
      const toBytes = ethers.getBytes(to);
      const dataBytes = ethers.getBytes(data);
      const dataLength = ethers.zeroPadValue(
        ethers.toBeHex(dataBytes.length),
        32,
      );
      return ethers.concat([
        "0x00", // operation: CALL
        toBytes, // to (20 bytes)
        ethers.zeroPadValue("0x00", 32), // value (32 bytes, 0)
        dataLength, // data length (32 bytes)
        dataBytes, // data
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

    // DelegateCall (operation=1) to MultiSend
    const { safeContract, signature } = await buildSafeSignature(
      safeAddress,
      ownerKey,
      MULTISEND_ADDRESS,
      multisendCalldata,
    );

    const safeWithSigner = safeContract.connect(wallet);
    const tx = await safeWithSigner.execTransaction(
      MULTISEND_ADDRESS,
      0,
      multisendCalldata,
      1, // operation: DELEGATECALL
      0,
      0,
      0,
      ethers.ZeroAddress,
      ethers.ZeroAddress,
      "0x" + signature,
    );

    console.log(`✅ MultiSend TX submitted: ${tx.hash}`);
    await tx.wait();
    return { taskId: tx.hash };
  } else {
    // Single transfer
    const data = iface.encodeFunctionData("transfer", [
      recipientAddress,
      amountWei,
    ]);
    return _executeViaSafe(safeAddress, ownerKey, NGN_TOKEN, data);
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
