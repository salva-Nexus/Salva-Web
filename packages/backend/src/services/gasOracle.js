// packages/backend/src/services/gasOracle.js
// ─────────────────────────────────────────────────────────────────────────────
// Dynamic gas fee oracle — fetches live gas cost and converts to NGN or USD.
// Used by transfer routes to replace ALL hardcoded fee tiers.
//
// Flow:
//   1. Estimate gas units for the tx type (ERC20 multisend = ~120,000 gas)
//   2. Fetch current gas price from the chain RPC
//   3. gasUSD = gasUnits × gasPrice × nativeTokenUSDPrice / 1e18
//   4. For NGN tokens: gasNGN = gasUSD × USD/NGN rate
//   5. Apply 20% buffer so we never undercharge
//   6. Cache crypto prices 30s, NGN rate 5min
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ethers } = require('ethers');

async function safeFetch(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`⚠️ Fetch retry ${i + 1}/${3}: ${url} — ${e.message}`);
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
}

// ── Cache store ───────────────────────────────────────────────────────────────
const _cache = {
  BNB_USD: { value: null, fetchedAt: 0, ttl: 120_000 }, // 2min
  ETH_USD: { value: null, fetchedAt: 0, ttl: 120_000 }, // 2min
  USD_NGN: { value: null, fetchedAt: 0, ttl: 600_000 }, // 10min
};

function _isFresh(key) {
  const e = _cache[key];
  return e.value !== null && Date.now() - e.fetchedAt < e.ttl;
}

function _set(key, value) {
  _cache[key].value = value;
  _cache[key].fetchedAt = Date.now();
}

// ── CoinGecko price fetch (no API key needed) ─────────────────────────────────
// symbol: 'BNBUSDT' | 'ETHUSDT' — we map to CoinGecko IDs internally
async function _fetchCryptoUSD(symbol) {
  const isBNBSymbol = symbol === 'BNBUSDT';
  const cacheKey = isBNBSymbol ? 'BNB_USD' : 'ETH_USD';
  if (_isFresh(cacheKey)) return _cache[cacheKey].value;

  const coinId = isBNBSymbol ? 'binancecoin' : 'ethereum';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
  const data = await safeFetch(url);
  const price = data[coinId]?.usd;
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Bad price from CoinGecko for ${coinId}`);

  _set(cacheKey, price);
  console.log(`📈 [GasOracle] ${symbol} price: $${price} (CoinGecko)`);
  return price;
}

// ── ExchangeRate-API NGN fetch ────────────────────────────────────────────────
async function _fetchUSDtoNGN() {
  if (_isFresh('USD_NGN')) return _cache.USD_NGN.value;

  const key = process.env.EXCHANGE_RATE_API_KEY;
  if (!key) throw new Error('EXCHANGE_RATE_API_KEY not set in .env');

  const url = `https://v6.exchangerate-api.com/v6/${key}/pair/USD/NGN`;
  const data = await safeFetch(url);
  const rate = data.conversion_rate;
  if (!Number.isFinite(rate) || rate <= 0) throw new Error('Bad NGN rate from ExchangeRate API');

  _set('USD_NGN', rate);
  console.log(`💱 [GasOracle] USD/NGN rate: ₦${rate}`);
  return rate;
}

// ── Gas price from chain operator's own public nodes ──────────────────────────
// Uses cached providers — initialized once, reused on every call.
// Mainnet: Binance's own BSC node, Coinbase's own Base node.
// Testnet: Binance's own BSC testnet node, Coinbase's own Base Sepolia node.
// No API keys. No Alchemy. No third-party dependency.
const _providerCache = {};

async function _fetchGasPrice(isBNB) {
  const isProd = process.env.NODE_ENV === 'production';

  const rpcs = isBNB
    ? isProd
      ? ['https://rpc.ankr.com/bsc', 'https://bsc.publicnode.com', 'https://binance.llamarpc.com']
      : ['https://bsc-testnet-rpc.publicnode.com']
    : isProd
      ? ['https://mainnet.base.org', 'https://base.llamarpc.com']
      : ['https://sepolia.base.org'];

  for (const rpc of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);

      const feeData = await Promise.race([
        provider.getFeeData(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('RPC timeout')), 8000)),
      ]);

      const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? ethers.parseUnits('3', 'gwei');

      console.log(`🔗 [GasOracle] RPC success: ${rpc}`);
      return gasPrice;
    } catch (e) {
      console.warn(`⚠️ [GasOracle] RPC failed: ${rpc} → ${e.message}`);
    }
  }

  throw new Error('All RPC endpoints failed for gas price fetch');
}

// ── Gas units per tx type ─────────────────────────────────────────────────────
// These are conservative upper-bound estimates.
// Single ERC20 transfer via Safe execTransaction: ~80,000–100,000
// MultiSend (2 transfers: amount + fee): ~120,000–150,000
// We use the higher bound — over-estimating protects us, never under.
const GAS_UNITS = {
  single: 100_000n, // single ERC20 transfer (no fee)
  multisend: 250_000n, // multisend (amount + fee to treasury)
};

// ── BUFFER: chain-aware gas buffer ───────────────────────────────────────────
const BUFFER_BASE = 2.7;
const BUFFER_BNB  = 1.3;

// ─────────────────────────────────────────────────────────────────────────────
// estimateTransferFee(chain, coin, hasFee)
//
// chain  : 'base' | 'bnb'
// coin   : 'NGN' | 'CNGN' | 'USDT' | 'USDC'
// hasFee : true  → multisend tx (amount + fee transfer)
//          false → single transfer (no treasury leg)
//
// Returns: { feeUSD, feeNGN, feeWei, decimals }
//   feeUSD  — fee in USD (for USDT/USDC deduction)
//   feeNGN  — fee in NGN (for NGNs/cNGN deduction)
//   feeWei  — fee as on-chain wei using correct token decimals
//   decimals — token decimals (6 for USDT/USDC, varies for NGN tokens)
// ─────────────────────────────────────────────────────────────────────────────
async function estimateTransferFee(chain, coin) {
  const isNGN = coin === 'NGN' || coin === 'CNGN';
  const isBNB = chain === 'bnb';

  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  // Always fetch all three — we always return BOTH feeNGN and feeUSD now
  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  const gasUnits = GAS_UNITS.multisend;
  const gasCostWei = BigInt(gasUnits) * BigInt(gasPrice);
  const gasCostNativeToken = parseFloat(ethers.formatEther(gasCostWei));
  const gasCostUSD = gasCostNativeToken * nativeUSD;

  // Chain-aware buffer ONLY — this is the real USD fee, no rate premium baked in
  const feeUSD = gasCostUSD * (isBNB ? BUFFER_BNB : BUFFER_BASE);

  // 8% premium belongs on the USD/NGN RATE, not on the USD fee itself
  const adjustedUsdNgnRate = usdNGN * 1.08;
  const feeNGN = feeUSD * adjustedUsdNgnRate;
  console.log('ADJUSTED RATE: ', adjustedUsdNgnRate);

  console.log(
    `⛽ [GasOracle] chain=${chain} coin=${coin} | ` +
      `gasUnits=${gasUnits} gasPrice=${ethers.formatUnits(gasPrice, 'gwei')}gwei | ` +
      `nativeUSD=$${nativeUSD.toFixed(4)} gasCostUSD=$${gasCostUSD.toFixed(6)} feeUSD=$${feeUSD.toFixed(6)}`
  );
  console.log(
    `💱 [GasOracle] USD/NGN=${usdNGN.toFixed(2)} (+8%=${adjustedUsdNgnRate.toFixed(2)}) | feeNGN=₦${feeNGN.toFixed(2)}`
  );

  let decimals = 6;
  if (isBNB) {
    try {
      const { getL1TokenDecimals } = require('../utils/l1Decimals');
      const isProd = process.env.NODE_ENV === 'production';
      const coinEnvKey = {
        NGN: isProd ? 'L1_NGN_TOKEN_ADDRESS' : 'L1_BSC_NGN_TOKEN_ADDRESS',
        CNGN: isProd ? 'L1_CNGN_CONTRACT_ADDRESS' : 'L1_BSC_CNGN_CONTRACT_ADDRESS',
        USDT: isProd ? 'L1_USDT_CONTRACT_ADDRESS' : 'L1_BSC_USDT_CONTRACT_ADDRESS',
        USDC: isProd ? 'L1_USDC_CONTRACT_ADDRESS' : 'L1_BSC_USDC_CONTRACT_ADDRESS',
      }[coin];
      const tokenAddr = process.env[coinEnvKey];
      if (tokenAddr) {
        decimals = await getL1TokenDecimals(tokenAddr);
        console.log(`🔢 [GasOracle] BNB ${coin} decimals from factory: ${decimals}`);
      }
    } catch (e) {
      console.warn(
        `⚠️ [GasOracle] Could not fetch BNB token decimals, using fallback 6:`,
        e.message
      );
      decimals = 6;
    }
  }

  const feeNGNRounded = Math.ceil(feeNGN * 1e2) / 1e2;
  const feeUSDRounded = Math.ceil(feeUSD * 1e6) / 1e6;

  const feeWei = isNGN
    ? ethers.parseUnits(feeNGNRounded.toFixed(decimals), decimals)
    : ethers.parseUnits(feeUSDRounded.toFixed(decimals), decimals);

  return {
    feeUSD: feeUSDRounded,
    feeNGN: feeNGNRounded,
    feeWei,
    decimals,
  };
}

// ── Warm the cache on startup (non-fatal) ─────────────────────────────────────
async function warmCache() {
  try {
    await Promise.allSettled([
      _fetchCryptoUSD('BNBUSDT'),
      _fetchCryptoUSD('ETHUSDT'),
      _fetchUSDtoNGN(),
    ]);

    console.log('✅ [GasOracle] Cache warm attempted (non-blocking)');
  } catch (e) {
    console.warn('⚠️ warmCache non-fatal:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// estimatePoolFee(chain)
//
// Pool operations need a fee token but the token is unknown upfront.
// This returns BOTH the NGN-denominated fee AND the USD-denominated fee
// from a single gas price fetch, so the caller can check balances and pick
// whichever token the user actually holds (NGNs → cNGN → USDT → USDC).
//
// Returns: { feeNGN, feeUSD, feeWeiNGN, feeWeiUSD, ngnDecimals, usdDecimals }
// ─────────────────────────────────────────────────────────────────────────────
async function estimatePoolFee(chain) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  // Single parallel fetch — gas price + native token price + NGN rate
  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  const gasUnits = GAS_UNITS.multisend; // pool op + fee transfer = multisend
  const gasCostWei = BigInt(gasUnits) * BigInt(gasPrice);
  const gasCostNativeToken = parseFloat(ethers.formatEther(gasCostWei));
  const gasCostUSD = gasCostNativeToken * nativeUSD;
  // Chain-aware buffer ONLY — real USD fee, no rate premium baked in
  const rawFeeUSD = gasCostUSD * (isBNB ? BUFFER_BNB : BUFFER_BASE);
  // 8% premium belongs on the USD/NGN RATE, not on the USD fee itself
  const adjustedUsdNgnRate = usdNGN * 1.08;
  const rawFeeNGN = rawFeeUSD * adjustedUsdNgnRate;
  console.log('ADJUSTED RATE: ', adjustedUsdNgnRate);

  console.log(
    `⛽ [GasOracle/pool] chain=${chain} | gasPrice=${ethers.formatUnits(gasPrice, 'gwei')}gwei | ` +
      `nativeUSD=$${nativeUSD.toFixed(2)} feeUSD=$${rawFeeUSD.toFixed(6)} feeNGN=₦${rawFeeNGN.toFixed(2)}`
  );

  // Base: all tokens hardcoded 6 decimals. BNB: fetch from factory (cached).
  let ngnDecimals = 6;
  if (isBNB) {
    try {
      const { getL1TokenDecimals } = require('../utils/l1Decimals');
      const ngnAddr = isProd
        ? process.env.L1_NGN_TOKEN_ADDRESS
        : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
      if (ngnAddr) ngnDecimals = await getL1TokenDecimals(ngnAddr);
    } catch (e) {
      console.warn('⚠️ [GasOracle/pool] BNB NGN decimals fallback 6:', e.message);
      ngnDecimals = 6;
    }
  }
  const usdDecimals = 6; // USDT/USDC always 6 on both chains

  const feeNGN = Math.ceil(rawFeeNGN * 1e2) / 1e2;
  const feeUSD = Math.ceil(rawFeeUSD * 1e6) / 1e6;
  const feeWeiNGN = ethers.parseUnits(feeNGN.toFixed(ngnDecimals), ngnDecimals);
  const feeWeiUSD = ethers.parseUnits(feeUSD.toFixed(usdDecimals), usdDecimals);

  console.log(
    `💱 [GasOracle/pool] feeNGN=₦${feeNGN} (dec=${ngnDecimals}) | feeUSD=$${feeUSD} (dec=${usdDecimals})`
  );

  return { feeNGN, feeUSD, feeWeiNGN, feeWeiUSD, ngnDecimals, usdDecimals };
}

module.exports = { estimateTransferFee, estimatePoolFee, warmCache };
