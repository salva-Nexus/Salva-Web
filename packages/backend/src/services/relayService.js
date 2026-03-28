// Salva-Digital-Tech/packages/backend/src/services/relayService.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

// ─── Guard ────────────────────────────────────────────────────────────────────
const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;
if (!MULTISIG_ADDRESS) {
  throw new Error(
    "FATAL: MULTISIG_CONTRACT_ADDRESS env var is not set. relayService cannot initialize.",
  );
}

// ─── ABI ──────────────────────────────────────────────────────────────────────
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

// ─── Core: ETH chain ─────────────────────────────────────────────────────────
// Uses signMessage (adds prefix) + v+4 so Safe can ecrecover with eth_sign type.
// NOTE: signMessage already prefixes, then v+4 tells Safe to prefix again during
// ecrecover — this is the WRONG pattern but kept here as the ETH variant since
// the ETH multisig deployment may have been tested with this scheme.
// The BASE variant below uses the correct raw-sign + v+4 scheme.
async function _executeViaSafeEth(
  safeAddress,
  ownerKey,
  to,
  data,
  operation = 0,
) {
  if (!safeAddress || !ownerKey || !to || !data) {
    throw new Error(
      `_executeViaSafeEth: missing params safeAddress=${safeAddress}, to=${to}`,
    );
  }

  const normalizedSafe = ethers.getAddress(safeAddress);
  const normalizedTo = ethers.getAddress(to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);

  const owners = await safeContract.getOwners();
  if (
    !owners
      .map((o) => o.toLowerCase())
      .includes(ownerWallet.address.toLowerCase())
  ) {
    throw new Error(
      `ETH: ${ownerWallet.address} is not an owner of Safe ${normalizedSafe}. Owners: ${owners.join(", ")}`,
    );
  }

  const currentNonce = await safeContract.nonce();
  console.log(
    `🔍 [ETH] Safe: ${normalizedSafe} nonce: ${currentNonce} to: ${normalizedTo}`,
  );

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

  // Raw sign + v+4 (correct eth_sign scheme for Safe)
  const rawSig = ownerWallet.signingKey.sign(ethers.getBytes(safeTxHash));
  const v = rawSig.v + 4;
  const signature =
    "0x" +
    rawSig.r.slice(2) +
    rawSig.s.slice(2) +
    v.toString(16).padStart(2, "0");
  console.log(`🔍 [ETH] Signature v=${v}: ${signature.slice(0, 22)}...`);

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

  console.log(`✅ [ETH] Safe TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status === 0) {
    throw new Error(`[ETH] Safe inner call reverted. TX: ${tx.hash}`);
  }
  console.log(`✅ [ETH] Safe TX confirmed: ${tx.hash}`);
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

// ─── Core: Base chain ─────────────────────────────────────────────────────────
// Raw secp256k1 sign (no prefix) + v+4 → Safe adds prefix once during ecrecover.
// This is the correct scheme and is what the Base Safe deployment expects.
async function _executeViaSafeBase(
  safeAddress,
  ownerKey,
  to,
  data,
  operation = 0,
) {
  if (!safeAddress || !ownerKey || !to || !data) {
    throw new Error(`_executeViaSafeBase: missing params`);
  }

  const normalizedSafe = ethers.getAddress(safeAddress);
  const normalizedTo = ethers.getAddress(to);
  const ownerWallet = new ethers.Wallet(ownerKey, provider);
  const safeContract = new ethers.Contract(normalizedSafe, SAFE_ABI, provider);

  // 1. Verify Ownership & Network
  const [owners, currentNonce, network] = await Promise.all([
    safeContract.getOwners(),
    safeContract.nonce(),
    provider.getNetwork(),
  ]);

  if (
    !owners
      .map((o) => o.toLowerCase())
      .includes(ownerWallet.address.toLowerCase())
  ) {
    throw new Error(
      `${ownerWallet.address} is not an owner of Safe ${normalizedSafe}`,
    );
  }

  console.log(
    `🔍 [BASE] Safe: ${normalizedSafe} | Nonce: ${currentNonce} | Chain: ${network.chainId}`,
  );

  // 1. Define the EIP-712 Domain (The 'Magic' config the Safe contract expects)
  const domain = {
    name: "Gnosis Safe",
    version: "1.3.0",
    chainId: network.chainId,
    verifyingContract: normalizedSafe,
  };

  // 2. Define the exact Schema (Types) for a Safe Transaction
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

  // 3. The specific transaction message
  const message = {
    to: normalizedTo,
    value: 0,
    data: data,
    operation: operation,
    safeTxGas: 0,
    baseGas: 0,
    gasPrice: 0,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: Number(currentNonce), // Ensure this is a number/bigint
  };

  // 4. Generate the signature (ethers handles the hashing and EIP-712 wrapping)
  const signature = await ownerWallet.signTypedData(domain, types, message);

  console.log(
    `🔍 [BASE] EIP-712 Signature generated: ${signature.slice(0, 20)}...`,
  );

  // 3. Execute the transaction using the Backend Admin Wallet (the gas payer)
  const safeWithSigner = safeContract.connect(wallet);
  try {
    await safeContract.execTransaction.staticCall(
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
    );
    console.log("✅ Simulation Succeeded!");
  } catch (simError) {
    console.error("❌ Simulation Failed! Reason:", simError.reason);
    console.error("❌ Error Data:", simError.data);
    // This will show us the REAL reason (e.g., "GS026", "GS013", etc.)
  }
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

  console.log(`✅ [BASE] Safe TX submitted: ${tx.hash}`);
  const receipt = await tx.wait();

  if (!receipt || receipt.status === 0) {
    throw new Error(`[BASE] Safe inner call reverted. TX: ${tx.hash}`);
  }

  console.log(`✅ [BASE] Safe TX confirmed: ${tx.hash}`);
  return { taskId: tx.hash, txHash: tx.hash, receipt };
}

// ─── Multisig call helpers ────────────────────────────────────────────────────
function _encodeMultisig(functionName, args) {
  const calldata = MULTISIG_IFACE.encodeFunctionData(functionName, args);
  if (!calldata || calldata === "0x")
    throw new Error(`ABI encoding failed for ${functionName}`);
  console.log(`📦 ${functionName} selector: ${calldata.slice(0, 10)}`);
  return calldata;
}

async function _callEth(safeAddress, ownerKey, functionName, args) {
  const calldata = _encodeMultisig(functionName, args);
  return _executeViaSafeEth(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    calldata,
    0,
  );
}

async function _callBase(safeAddress, ownerKey, functionName, args) {
  const calldata = _encodeMultisig(functionName, args);
  return _executeViaSafeBase(
    safeAddress,
    ownerKey,
    MULTISIG_ADDRESS,
    calldata,
    0,
  );
}

// ─── Named exports matching admin.js imports exactly ─────────────────────────

async function sponsorProposeInitializationEth(
  safeAddress,
  ownerKey,
  nspace,
  registry,
) {
  return _callEth(safeAddress, ownerKey, "proposeInitialization", [
    nspace,
    registry,
  ]);
}
async function sponsorProposeInitializationBase(
  safeAddress,
  ownerKey,
  nspace,
  registry,
) {
  return _callBase(safeAddress, ownerKey, "proposeInitialization", [
    nspace,
    registry,
  ]);
}

async function sponsorProposeValidatorUpdateEth(
  safeAddress,
  ownerKey,
  targetAddress,
  action,
) {
  return _callEth(safeAddress, ownerKey, "proposeValidatorUpdate", [
    targetAddress,
    action,
  ]);
}
async function sponsorProposeValidatorUpdateBase(
  safeAddress,
  ownerKey,
  targetAddress,
  action,
) {
  return _callBase(safeAddress, ownerKey, "proposeValidatorUpdate", [
    targetAddress,
    action,
  ]);
}

async function sponsorValidateRegistryEth(safeAddress, ownerKey, registry) {
  return _callEth(safeAddress, ownerKey, "validateRegistry", [registry]);
}
async function sponsorValidateRegistryBase(safeAddress, ownerKey, registry) {
  return _callBase(safeAddress, ownerKey, "validateRegistry", [registry]);
}

async function sponsorValidateValidatorEth(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callEth(safeAddress, ownerKey, "validateValidator", [targetAddress]);
}
async function sponsorValidateValidatorBase(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callBase(safeAddress, ownerKey, "validateValidator", [targetAddress]);
}

async function sponsorCancelInitEth(safeAddress, ownerKey, registry) {
  return _callEth(safeAddress, ownerKey, "cancelInit", [registry]);
}
async function sponsorCancelInitBase(safeAddress, ownerKey, registry) {
  return _callBase(safeAddress, ownerKey, "cancelInit", [registry]);
}

async function sponsorCancelValidatorUpdateEth(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callEth(safeAddress, ownerKey, "cancelValidatorUpdate", [
    targetAddress,
  ]);
}
async function sponsorCancelValidatorUpdateBase(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callBase(safeAddress, ownerKey, "cancelValidatorUpdate", [
    targetAddress,
  ]);
}

async function sponsorExecuteInitEth(safeAddress, ownerKey, registry) {
  return _callEth(safeAddress, ownerKey, "executeInit", [registry]);
}
async function sponsorExecuteInitBase(safeAddress, ownerKey, registry) {
  return _callBase(safeAddress, ownerKey, "executeInit", [registry]);
}

async function sponsorExecuteUpdateValidatorEth(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callEth(safeAddress, ownerKey, "executeUpdateValidator", [
    targetAddress,
  ]);
}
async function sponsorExecuteUpdateValidatorBase(
  safeAddress,
  ownerKey,
  targetAddress,
) {
  return _callBase(safeAddress, ownerKey, "executeUpdateValidator", [
    targetAddress,
  ]);
}

// ─── Token Transfer ───────────────────────────────────────────────────────────
async function _sponsorTransfer(
  execFn,
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
    return execFn(
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
    return execFn(safeAddress, ownerKey, NGN_TOKEN, data, 0);
  }
}

async function sponsorSafeTransferETH(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  return _sponsorTransfer(
    _executeViaSafeEth,
    safeAddress,
    ownerKey,
    recipientAddress,
    amountWei,
    feeWei,
  );
}

async function sponsorSafeTransferBase(
  safeAddress,
  ownerKey,
  recipientAddress,
  amountWei,
  feeWei = 0n,
) {
  return _sponsorTransfer(
    _executeViaSafeBase,
    safeAddress,
    ownerKey,
    recipientAddress,
    amountWei,
    feeWei,
  );
}

// ─── Module exports ───────────────────────────────────────────────────────────
module.exports = {
  sponsorSafeTransferETH,
  sponsorSafeTransferBase,
  sponsorProposeInitializationEth,
  sponsorProposeInitializationBase,
  sponsorProposeValidatorUpdateEth,
  sponsorProposeValidatorUpdateBase,
  sponsorValidateRegistryEth,
  sponsorValidateRegistryBase,
  sponsorValidateValidatorEth,
  sponsorValidateValidatorBase,
  sponsorCancelInitEth,
  sponsorCancelInitBase,
  sponsorCancelValidatorUpdateEth,
  sponsorCancelValidatorUpdateBase,
  sponsorExecuteInitEth,
  sponsorExecuteInitBase,
  sponsorExecuteUpdateValidatorEth,
  sponsorExecuteUpdateValidatorBase,
};
