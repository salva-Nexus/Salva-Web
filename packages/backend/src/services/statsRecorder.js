// packages/backend/src/services/statsRecorder.js
// ─────────────────────────────────────────────────────────────────────────────
// Records a periodic snapshot per spec:
//   1. Total users
//   2. NGN circulating supply — NGN token ONLY (not cNGN), Base + BNB
//      totalSupply() combined into a single number
//   3. Treasury balance, CURRENCY-specific not chain-specific:
//        - NGN-side  = (NGNs + cNGN) treasury balance, Base + BNB combined
//        - USD-side  = (USDT + USDC) treasury balance, Base + BNB combined
//   4. Transaction volume — cumulative confirmed transaction count
//
// NODE_ENV drives every RPC endpoint and every BNB/L1 token address exactly
// the way the rest of the app already does. Base token addresses are read
// from the SAME unbranched .env vars every other Base route already uses
// (NGN_TOKEN_ADDRESS, CNGN_CONTRACT_ADDRESS, USDT_CONTRACT_ADDRESS,
// USDC_CONTRACT_ADDRESS, TREASURY_CONTRACT_ADDRESS) — untouched, no renaming.
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

// Normalizes an address before it touches ethers — handles bad-checksum
// typos and stray whitespace/quotes from hand-edited .env values.
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

  // ── RPC endpoints — NODE_ENV branched exactly as everywhere else ────────
  const baseRpc = prod ? process.env.BASE_MAINNET_RPC_URL : process.env.BASE_SEPOLIA_RPC_URL;
  const bnbRpc = prod ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

  // ── Base token addresses — read raw, exactly like every other Base route
  // in this app (index.js /api/balance, pool.js resolveTokenSymbol, etc.).
  // These are NOT branched by NODE_ENV; per your .env's own comment, the
  // deploy process swaps these values for production. Left untouched.
  const baseNgn = process.env.NGN_TOKEN_ADDRESS;
  const baseCngn = process.env.CNGN_CONTRACT_ADDRESS;
  const baseUsdt = process.env.USDT_CONTRACT_ADDRESS;
  const baseUsdc = process.env.USDC_CONTRACT_ADDRESS;
  const baseTreasury = process.env.TREASURY_CONTRACT_ADDRESS;

  // ── BNB/L1 token addresses — NODE_ENV branched, mainnet vs testnet vars ──
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

  // ── 1. Total users ────────────────────────────────────────────────────────
  const userCount = await User.countDocuments().catch(() => 0);

  // ── 2. NGN circulating supply — NGN TOKEN ONLY, Base + BNB totalSupply()
  // combined into a single number. cNGN is intentionally excluded.
  const [baseNgnSupply, bnbNgnSupply] = await Promise.all([
    _readTotalSupply(baseRpc, baseNgn, 6),
    _readTotalSupply(bnbRpc, bnbNgn, 6),
  ]);
  const ngnCirculating = baseNgnSupply + bnbNgnSupply;

  // ── 3. Treasury balance — currency-specific, chain-combined ──────────────
  // NGN-side: (NGNs + cNGN) balance, Base + BNB summed together into ONE number
  const [baseNgnTreasury, baseCngnTreasury, bnbNgnTreasury, bnbCngnTreasury] = await Promise.all([
    _readBalance(baseRpc, baseNgn, baseTreasury, 6),
    _readBalance(baseRpc, baseCngn, baseTreasury, 6),
    _readBalance(bnbRpc, bnbNgn, bnbTreasury, 6),
    _readBalance(bnbRpc, bnbCngn, bnbTreasury, 6),
  ]);
  const treasuryNGN = baseNgnTreasury + baseCngnTreasury + bnbNgnTreasury + bnbCngnTreasury;

  // USD-side: (USDT + USDC) balance, Base + BNB summed together into ONE number.
  // Base USD tokens are hardcoded 6 decimals; BNB USD tokens are 18 decimals.
  const [baseUsdtTreasury, baseUsdcTreasury, bnbUsdtTreasury, bnbUsdcTreasury] = await Promise.all([
    _readBalance(baseRpc, baseUsdt, baseTreasury, 6),
    _readBalance(baseRpc, baseUsdc, baseTreasury, 6),
    _readBalance(bnbRpc, bnbUsdt, bnbTreasury, 18),
    _readBalance(bnbRpc, bnbUsdc, bnbTreasury, 18),
  ]);
  const treasuryUSD = baseUsdtTreasury + baseUsdcTreasury + bnbUsdtTreasury + bnbUsdcTreasury;

  // ── 4. Transaction volume — cumulative confirmed transaction count ───────
  const transactionVolume = await Transaction.countDocuments().catch(() => 0);

  const snapshot = await StatsSnapshot.create({
    userCount,
    ngnCirculating,
    treasuryNGN,
    treasuryUSD,
    transactionVolume,
  });

  console.log(
    `📊 [statsRecorder] Snapshot recorded (${prod ? 'PRODUCTION' : 'DEVELOPMENT'}): ` +
      `users=${userCount} ngn=${ngnCirculating.toFixed(0)} treasuryNGN=${treasuryNGN.toFixed(0)} ` +
      `treasuryUSD=${treasuryUSD.toFixed(2)} tx=${transactionVolume}`
  );

  return snapshot;
}

module.exports = { recordSnapshot };
