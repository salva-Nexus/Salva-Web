// packages/backend/src/services/statsRecorder.js
// ─────────────────────────────────────────────────────────────────────────────
// Records a periodic snapshot of network health into StatsSnapshot.
// Reads are all live on-chain / DB counts at the moment of recording — this
// mirrors the pattern already used by GET /api/stats, just persisted so the
// admin analytics page can render trend graphs instead of a single number.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ethers } = require('ethers');
const StatsSnapshot = require('../models/StatsSnapshot');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

const TOKEN_ABI = ['function totalSupply() view returns (uint256)'];
const BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

function isProd() {
  return process.env.NODE_ENV === 'production';
}

// Normalizes any address from .env before it touches ethers — handles both
// bad-checksum typos (like a hand-edited USDT_CONTRACT_ADDRESS) and stray
// whitespace/quotes. Lowercasing first bypasses ethers' strict checksum
// validation, then getAddress() re-derives the correct checksum from scratch.
function _safeAddress(raw) {
  if (!raw) return null;
  try {
    return ethers.getAddress(raw.trim().toLowerCase());
  } catch {
    console.warn(`⚠️ [statsRecorder] Invalid address in .env, skipping: "${raw}"`);
    return null;
  }
}

async function _readTotalSupply(rpcUrl, tokenAddress, decimals) {
  const clean = _safeAddress(tokenAddress);
  if (!rpcUrl || !clean) return 0;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(clean, TOKEN_ABI, provider);
    const raw = await contract.totalSupply();
    return parseFloat(ethers.formatUnits(raw, decimals));
  } catch (e) {
    console.warn('⚠️ [statsRecorder] totalSupply read failed:', e.message);
    return 0;
  }
}

async function _readBalance(rpcUrl, tokenAddress, holder, decimals) {
  const cleanToken = _safeAddress(tokenAddress);
  const cleanHolder = _safeAddress(holder);
  if (!rpcUrl || !cleanToken || !cleanHolder) return 0;
  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const contract = new ethers.Contract(cleanToken, BAL_ABI, provider);
    const raw = await contract.balanceOf(cleanHolder);
    return parseFloat(ethers.formatUnits(raw, decimals));
  } catch (e) {
    console.warn(`⚠️ [statsRecorder] balanceOf failed (${cleanToken}):`, e.message);
    return 0;
  }
}

async function recordSnapshot() {
  const prod = isProd();

  const baseRpc = prod ? process.env.BASE_MAINNET_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL;
  const bnbRpc = prod ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

  const baseNgn = process.env.NGN_TOKEN_ADDRESS;
  const baseCngn = process.env.CNGN_CONTRACT_ADDRESS;
  const baseUsdt = process.env.USDT_CONTRACT_ADDRESS;
  const baseUsdc = process.env.USDC_CONTRACT_ADDRESS;
  const baseTreasury = process.env.TREASURY_CONTRACT_ADDRESS;

  const bnbNgn = prod ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
  const bnbCngn = prod
    ? process.env.L1_CNGN_CONTRACT_ADDRESS
    : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS;
  const bnbUsdt = prod
    ? process.env.L1_USDT_CONTRACT_ADDRESS
    : process.env.L1_BSC_USDT_CONTRACT_ADDRESS;
  const bnbUsdc = prod
    ? process.env.L1_USDC_CONTRACT_ADDRESS
    : process.env.L1_BSC_USDC_CONTRACT_ADDRESS;
  const bnbTreasury = prod
    ? process.env.L1_TREASURY_CONTRACT_ADDRESS
    : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS;

  // ── User count ──────────────────────────────────────────────────────────
  const userCount = await User.countDocuments().catch(() => 0);

  // ── NGN circulating supply (NGN token only — 6 decimals both chains) ─────
  const [baseNgnSupply, bnbNgnSupply] = await Promise.all([
    _readTotalSupply(baseRpc, baseNgn, 6),
    _readTotalSupply(bnbRpc, bnbNgn, 6),
  ]);

  // ── Cumulative transaction volume — combined count of all activity ───────
  // Per-chain split isn't tracked on the Transaction model today, so this
  // records the combined cumulative count. Still forms a valid progress
  // graph — it only ever grows.
  const transactionCount = await Transaction.countDocuments().catch(() => 0);

  // ── Treasury balances — NGN-side (NGN+cNGN) and USD-side (USDT+USDC) ─────
  // This is a balance snapshot, not a delta — since fees only ever flow IN
  // to the treasury, the balance-over-time curve IS the fee accumulation
  // graph the admin page needs.
  const [baseNgnTreasury, baseCngnTreasury, baseUsdtTreasury, baseUsdcTreasury] = await Promise.all(
    [
      _readBalance(baseRpc, baseNgn, baseTreasury, 6),
      _readBalance(baseRpc, baseCngn, baseTreasury, 6),
      _readBalance(baseRpc, baseUsdt, baseTreasury, 6),
      _readBalance(baseRpc, baseUsdc, baseTreasury, 6),
    ]
  );

  const [bnbNgnTreasury, bnbCngnTreasury, bnbUsdtTreasury, bnbUsdcTreasury] = await Promise.all([
    _readBalance(bnbRpc, bnbNgn, bnbTreasury, 6),
    _readBalance(bnbRpc, bnbCngn, bnbTreasury, 6),
    _readBalance(bnbRpc, bnbUsdt, bnbTreasury, 18),
    _readBalance(bnbRpc, bnbUsdc, bnbTreasury, 18),
  ]);

  const baseNgnFees = baseNgnTreasury + baseCngnTreasury;
  const bnbNgnFees = bnbNgnTreasury + bnbCngnTreasury;
  const baseUsdFees = baseUsdtTreasury + baseUsdcTreasury;
  const bnbUsdFees = bnbUsdtTreasury + bnbUsdcTreasury;

  const snapshot = await StatsSnapshot.create({
    userCount,
    ngnCirculating: {
      base: baseNgnSupply,
      bnb: bnbNgnSupply,
      combined: baseNgnSupply + bnbNgnSupply,
    },
    transactionVolume: {
      base: 0, // not split per-chain today — see comment above
      bnb: 0,
      combined: transactionCount,
    },
    treasuryFees: {
      ngn: { base: baseNgnFees, bnb: bnbNgnFees, combined: baseNgnFees + bnbNgnFees },
      usd: { base: baseUsdFees, bnb: bnbUsdFees, combined: baseUsdFees + bnbUsdFees },
    },
  });

  console.log(
    `📊 [statsRecorder] Snapshot recorded: users=${userCount} ngn=${(baseNgnSupply + bnbNgnSupply).toFixed(0)} tx=${transactionCount}`
  );

  return snapshot;
}

module.exports = { recordSnapshot };
