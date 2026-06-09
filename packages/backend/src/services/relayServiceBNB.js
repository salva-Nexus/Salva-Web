// packages/backend/src/services/relayServiceBNB.js
// Carbon copy of relayService.js pool/transfer helpers but using BNB RPC + BNB wallet signer
const { ethers } = require('ethers');

function getBNBProvider() {
  const isProd = process.env.NODE_ENV === 'production';
  return new ethers.JsonRpcProvider(
    isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL
  );
}

function getBNBWallet() {
  const pk = process.env.MANAGER_PRIVATE_KEY;
  if (!pk) throw new Error('MANAGER_PRIVATE_KEY not set');
  return new ethers.Wallet(pk, getBNBProvider());
}

function getBNBRpcUrl() {
  const isProd = process.env.NODE_ENV === 'production';
  return isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
}

const SAFE_EXEC_ABI = [
  'function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns (bool success)',
];

// Execute any calldata via user's BNB Safe — backend wallet pays gas
async function executeViaSafeBNB(safeAddress, ownerKey, target, data, operation = 0) {
  const Safe = require('@safe-global/protocol-kit').default;
  const rpcUrl = getBNBRpcUrl();
  const backendWallet = getBNBWallet();

  // Check backend wallet BNB balance before attempting — fail fast with a clear message
  try {
    const bal = await backendWallet.provider.getBalance(backendWallet.address);
    const minGas = ethers.parseEther('0.0003');
    if (bal < minGas) {
      throw new Error(
        `Backend wallet has insufficient BNB for gas (${ethers.formatEther(bal)} tBNB). Fund the relay wallet: ${backendWallet.address}`
      );
    }
  } catch (balErr) {
    if (balErr.message.includes('insufficient BNB')) throw balErr;
    console.warn('⚠️ Could not check backend wallet balance:', balErr.message);
  }

  const cleanSafe = ethers.getAddress(safeAddress);
  const cleanTarget = ethers.getAddress(target);
  const hexData = typeof data === 'string' ? data : ethers.hexlify(data);

  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: ownerKey,
    safeAddress: cleanSafe,
  });

  const safeTx = await protocolKit.createTransaction({
    transactions: [{ to: cleanTarget, data: hexData, value: '0', operation }],
  });
  const signedTx = await protocolKit.signTransaction(safeTx);
  const safeContract = new ethers.Contract(cleanSafe, SAFE_EXEC_ABI, backendWallet);

  const tx = await safeContract.execTransaction(
    signedTx.data.to,
    BigInt(signedTx.data.value || '0'),
    signedTx.data.data,
    Number(signedTx.data.operation || 0),
    BigInt(signedTx.data.safeTxGas || '0'),
    BigInt(signedTx.data.baseGas || '0'),
    BigInt(signedTx.data.gasPrice || '0'),
    signedTx.data.gasToken || ethers.ZeroAddress,
    signedTx.data.refundReceiver || ethers.ZeroAddress,
    signedTx.encodedSignatures(),
    { gasLimit: 300_000 }
  );

  const receipt = await tx.wait();
  return { txHash: tx.hash, receipt };
}

// ERC20 transfer via user's BNB Safe
async function sponsorBNBTransfer(safeAddress, ownerKey, recipient, amount, fee, tokenAddress, treasuryAddress) {
  const iface = new ethers.Interface(['function transfer(address,uint256)']);
  const MULTISEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';

  function encodeMultiSendTx(to, data) {
    const dataBytes = ethers.getBytes(data);
    const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
    let offset = 0;
    buf[offset++] = 0;
    ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
    ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
    ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32)).forEach((b) => (buf[offset++] = b));
    dataBytes.forEach((b) => (buf[offset++] = b));
    return buf;
  }

  if (fee > 0n) {
    const tx1 = iface.encodeFunctionData('transfer', [recipient, amount]);
    const tx2 = iface.encodeFunctionData('transfer', [treasuryAddress, fee]);
    const msData = new ethers.Interface(['function multiSend(bytes)']).encodeFunctionData('multiSend', [
      ethers.concat([encodeMultiSendTx(tokenAddress, tx1), encodeMultiSendTx(tokenAddress, tx2)]),
    ]);
    return executeViaSafeBNB(safeAddress, ownerKey, MULTISEND, msData, 1);
  }

  return executeViaSafeBNB(
    safeAddress, ownerKey, tokenAddress,
    iface.encodeFunctionData('transfer', [recipient, amount]), 0
  );
}

// Pool: approve + swap or swap only
async function sponsorBNBApproveAndSwap(safeAddress, ownerKey, tokenAddress, poolAddress, approveAmountWei, swapCalldata) {
  const MULTISEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
  const erc20 = new ethers.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
  const approveCalldata = erc20.encodeFunctionData('approve', [poolAddress, approveAmountWei]);

  function encodeMultiSendTx(to, data) {
    const dataBytes = ethers.getBytes(data);
    const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
    let offset = 0;
    buf[offset++] = 0;
    ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
    ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
    ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32)).forEach((b) => (buf[offset++] = b));
    dataBytes.forEach((b) => (buf[offset++] = b));
    return buf;
  }

  const msData = new ethers.Interface(['function multiSend(bytes)']).encodeFunctionData('multiSend', [
    ethers.concat([encodeMultiSendTx(tokenAddress, approveCalldata), encodeMultiSendTx(poolAddress, swapCalldata)]),
  ]);
  return executeViaSafeBNB(safeAddress, ownerKey, MULTISEND, msData, 1);
}

async function sponsorBNBSwapOnly(safeAddress, ownerKey, poolAddress, swapCalldata) {
  return executeViaSafeBNB(safeAddress, ownerKey, poolAddress, swapCalldata, 0);
}

async function sponsorBNBApproveMax(safeAddress, ownerKey, tokenAddress, poolAddress) {
  const calldata = new ethers.Interface(['function approve(address spender, uint256 amount) returns (bool)'])
    .encodeFunctionData('approve', [poolAddress, ethers.MaxUint256]);
  return executeViaSafeBNB(safeAddress, ownerKey, tokenAddress, calldata, 0);
}

module.exports = {
  executeViaSafeBNB,
  sponsorBNBTransfer,
  sponsorBNBApproveAndSwap,
  sponsorBNBSwapOnly,
  sponsorBNBApproveMax,
};