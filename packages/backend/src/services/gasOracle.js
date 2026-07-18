// packages/backend/src/services/gasOracle.js
// ─────────────────────────────────────────────────────────────────────────────
// Dynamic gas fee oracle — fetches live gas cost and converts to NGN or USD.
//
// GAS UNITS SOURCE:
//   - production  → simulate the real MultiSend calldata via eth_estimateGas
//                    (same idea as MetaMask's pre-send gas estimate), then
//                    buffer the simulated units by 30%.
//   - development → use conservative hardcoded gas units (simulation is
//                    unreliable on testnets), with the existing chain-aware
//                    buffer multipliers (BUFFER_BASE / BUFFER_BNB).
//   - simulation failure (any env) → silently fall back to the hardcoded path.
//
// Everything else (price fetch, NGN rate, caching) is unchanged.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ethers } = require('ethers');

// ── Chainlink price feed plumbing (production only) ──────────────────────────
const CHAINLINK_AGGREGATOR_ABI = [
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)',
  'function decimals() view returns (uint8)',
];

// If a feed's price is older than this, treat it as stale and fall back to CoinGecko.
// Chainlink ETH/USD and BNB/USD feeds normally update every few minutes on any
// meaningful price move, or at most once per heartbeat (~1hr for most feeds) —
// 1 hour gives real updates plenty of room while still catching a genuinely dead feed.
const CHAINLINK_STALENESS_SECONDS = 3600;

// Decimals almost never change for a given feed — cache per feed address so we
// don't re-fetch it on every single price read.
const _chainlinkDecimalsCache = new Map(); // feedAddress(lowercase) -> decimals(number)

async function _getChainlinkDecimals(feedContract, feedAddress) {
  const key = feedAddress.toLowerCase();
  if (_chainlinkDecimalsCache.has(key)) return _chainlinkDecimalsCache.get(key);
  const decimals = Number(await feedContract.decimals());
  _chainlinkDecimalsCache.set(key, decimals);
  return decimals;
}

/**
 * Reads a Chainlink price feed, verifies it isn't stale, and returns the
 * price as a plain USD number using the feed's OWN decimals (never hardcoded).
 * Throws on any problem — caller must catch and fall back to CoinGecko.
 */
async function _fetchChainlinkUSD(feedAddress, provider) {
  const feed = new ethers.Contract(
    ethers.getAddress(feedAddress),
    CHAINLINK_AGGREGATOR_ABI,
    provider
  );

  const [decimals, roundData] = await Promise.all([
    _getChainlinkDecimals(feed, feedAddress),
    feed.latestRoundData(),
  ]);

  const { answer, updatedAt } = roundData;
  if (answer <= 0n) throw new Error('Chainlink feed returned non-positive price');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const ageSeconds = nowSeconds - Number(updatedAt);
  if (ageSeconds > CHAINLINK_STALENESS_SECONDS) {
    throw new Error(
      `Chainlink feed stale (age=${ageSeconds}s, max=${CHAINLINK_STALENESS_SECONDS}s)`
    );
  }

  const price = Number(ethers.formatUnits(answer, decimals));
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('Bad Chainlink price after decimal formatting');

  return price;
}

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

// ── Price fetch: Chainlink first (production), CoinGecko fallback (always) ───
// Chainlink is only attempted in production because the feed addresses on file
// are mainnet feeds — dev/testnet keeps using CoinGecko exactly as before.
async function _fetchCryptoUSD(symbol) {
  const isBNBSymbol = symbol === 'BNBUSDT';
  const cacheKey = isBNBSymbol ? 'BNB_USD' : 'ETH_USD';
  if (_isFresh(cacheKey)) return _cache[cacheKey].value;

  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    const feedAddress = isBNBSymbol
      ? process.env.CHAINLINK_BNB_USD_FEED_BSC
      : process.env.CHAINLINK_ETH_USD_FEED_BASE;

    if (feedAddress) {
      try {
        const rpcUrl = isBNBSymbol
          ? process.env.BNB_MAINNET_RPC_URL
          : process.env.BASE_MAINNET_RPC_URL;
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const price = await _fetchChainlinkUSD(feedAddress, provider);
        _set(cacheKey, price);
        console.log(`📈 [GasOracle] ${symbol} price: $${price} (Chainlink)`);
        return price;
      } catch (clErr) {
        console.warn(
          `⚠️ [GasOracle] Chainlink feed failed for ${symbol}, falling back to CoinGecko:`,
          clErr.message
        );
      }
    } else {
      console.warn(
        `⚠️ [GasOracle] No Chainlink feed address configured for ${symbol} — using CoinGecko`
      );
    }
  }

  // Fallback path — also the ONLY path in development/testnet.
  const coinId = isBNBSymbol ? 'binancecoin' : 'ethereum';
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`;
  const data = await safeFetch(url);
  const price = data[coinId]?.usd;
  if (!Number.isFinite(price) || price <= 0) throw new Error(`Bad price from CoinGecko for ${coinId}`);

  _set(cacheKey, price);
  console.log(`📈 [GasOracle] ${symbol} price: $${price} (CoinGecko fallback)`);
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

// ── RPC endpoint lists (no API keys, chain operator's own public nodes) ──────
function _rpcListFor(isBNB) {
  const isProd = process.env.NODE_ENV === 'production';
  return isBNB
    ? isProd
      ? ['https://rpc.ankr.com/bsc', 'https://bsc.publicnode.com', 'https://binance.llamarpc.com']
      : ['https://bsc-testnet-rpc.publicnode.com']
    : isProd
      ? ['https://mainnet.base.org', 'https://base.llamarpc.com']
      : ['https://sepolia.base.org'];
}

// ── Gas price from chain operator's own public nodes ──────────────────────────
async function _fetchGasPrice(isBNB) {
  const rpcs = _rpcListFor(isBNB);

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

// ── Returns a live, working provider (used for gas simulation) ──────────────
async function _getWorkingProvider(isBNB) {
  const rpcs = _rpcListFor(isBNB);
  for (const rpc of rpcs) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      await Promise.race([
        provider.getBlockNumber(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('probe timeout')), 8000)),
      ]);
      return provider;
    } catch (e) {
      console.warn(`⚠️ [GasOracle] Provider probe failed: ${rpc} → ${e.message}`);
    }
  }
  throw new Error('No working RPC available for gas simulation');
}

// ── Gas units per tx type (DEV / FALLBACK ONLY) ───────────────────────────────
// Conservative upper-bound estimates, used only when NODE_ENV !== 'production'
// or when live simulation fails for any reason. Keyed by leg count so a
// 3-leg transaction (e.g. approve+swap+fee, or dual-rate-update+fee) isn't
// charged the same gas estimate as a plain 2-leg transaction.
const GAS_UNITS = {
  1: 100_000n, // single call, no fee leg
  2: 250_000n, // multisend, 2 legs (action + fee)
  3: 350_000n, // multisend, 3 legs (e.g. approve + swap + fee)
};

function _gasUnitsForLegs(legs) {
  const key = Math.max(1, Math.min(3, legs));
  return GAS_UNITS[key];
}

// ── Buffers ───────────────────────────────────────────────────────────────────
// SIM_BUFFER applies ONLY to gas units obtained from live simulation (production).
// BUFFER_BASE / BUFFER_BNB apply ONLY to the hardcoded dev/fallback gas units —
// unchanged from before, since those were already tuned for testnet volatility.
const SIM_BUFFER_BASE = 5.0; // +400% on simulated gas units, Base only
const SIM_BUFFER_BNB = 2.9; // +190% on simulated gas units, BNB only
const BUFFER_BASE = 2.7;
const BUFFER_BNB = 1.3;

// ─────────────────────────────────────────────────────────────────────────────
// Token / treasury address resolution — used only for gas simulation, so we
// have a realistic `to` (token contract) and `from` (treasury, assumed to
// hold a real balance so the ERC20 internal balance check doesn't revert).
// ─────────────────────────────────────────────────────────────────────────────
function _resolveTokenAddress(chain, coin) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  if (isBNB) {
    if (coin === 'CNGN')
      return isProd
        ? process.env.L1_CNGN_CONTRACT_ADDRESS
        : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS;
    if (coin === 'USDT')
      return isProd
        ? process.env.L1_USDT_CONTRACT_ADDRESS
        : process.env.L1_BSC_USDT_CONTRACT_ADDRESS;
    if (coin === 'USDC')
      return isProd
        ? process.env.L1_USDC_CONTRACT_ADDRESS
        : process.env.L1_BSC_USDC_CONTRACT_ADDRESS;
    return isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
  }
  if (coin === 'CNGN') return process.env.CNGN_CONTRACT_ADDRESS;
  if (coin === 'USDT') return process.env.USDT_CONTRACT_ADDRESS;
  if (coin === 'USDC') return process.env.USDC_CONTRACT_ADDRESS;
  return process.env.NGN_TOKEN_ADDRESS;
}

function _resolveTreasuryAddress(chain) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  if (isBNB)
    return isProd
      ? process.env.L1_TREASURY_CONTRACT_ADDRESS
      : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS;
  return process.env.TREASURY_CONTRACT_ADDRESS;
}

// ── MultiSend simulation plumbing ─────────────────────────────────────────────
const MULTISEND_ADDRESS = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
const ERC20_TRANSFER_IFACE = new ethers.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const MULTISEND_IFACE = new ethers.Interface([
  'function multiSend(bytes memory transactions) public payable',
]);

function _encodeMultiSendTx(to, data) {
  const dataBytes = ethers.getBytes(data);
  const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
  let offset = 0;
  buf[offset++] = 0; // CALL
  ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
  ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
  ethers
    .getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32))
    .forEach((b) => (buf[offset++] = b));
  dataBytes.forEach((b) => (buf[offset++] = b));
  return buf;
}

/**
 * Simulates the real MultiSend calldata (transfer leg + treasury fee leg)
 * via eth_estimateGas, using the treasury address as `from` so the ERC20
 * internal balanceOf/allowance checks pass against a real, funded account.
 * This is the closest same-effect equivalent to what MetaMask shows before
 * a user signs — it does NOT require a Safe signature because we're not
 * calling execTransaction, just estimating the inner MultiSend call cost.
 *
 * Throws on any failure — callers must catch and fall back to hardcoded units.
 */
async function _simulateMultiSendGasUnits(chain, tokenAddress, treasuryAddress, legs = 2) {
  if (!tokenAddress) throw new Error('No token address resolved for simulation');
  if (!treasuryAddress) throw new Error('No treasury address resolved for simulation');

  const isBNB = chain === 'bnb';
  const provider = await _getWorkingProvider(isBNB);

  const dummyRecipient = '0x000000000000000000000000000000000000dEaD';

  // MultiSend enforces delegatecall-only execution (reverts with
  // "MultiSend should only be called via delegatecall" on a plain call),
  // and eth_estimateGas cannot fake a delegatecall context. So instead of
  // simulating the bundled MultiSend call itself, sum the estimateGas of
  // each individual leg as a standalone call from treasury, then add a
  // fixed per-leg overhead to approximate MultiSend's decode+delegatecall
  // loop cost (empirically ~3-5k gas per leg on top of the inner call).
  const MULTISEND_LOOP_OVERHEAD_PER_LEG = 4000n;
  const numLegs = Math.max(1, legs);

  let total = 0n;
  for (let i = 0; i < numLegs; i++) {
    const dest = i === numLegs - 1 ? ethers.getAddress(treasuryAddress) : dummyRecipient;
    const txData = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [dest, 1n]);
    const legGas = await provider.estimateGas({
      from: ethers.getAddress(treasuryAddress),
      to: ethers.getAddress(tokenAddress),
      data: txData,
    });
    total += legGas + MULTISEND_LOOP_OVERHEAD_PER_LEG;
  }

  return total; // bigint
}

/**
 * Resolves the gas units to use for a multisend-shaped tx, per the rule:
 *   production  → simulate live, buffer +30%
 *   development → hardcoded GAS_UNITS.multisend, buffer = BUFFER_BASE/BUFFER_BNB
 *   simulation failure (any env) → same fallback as development
 *
 * Returns { gasUnits: bigint, bufferMultiplier: number, simulated: boolean }
 */
async function _resolveGasUnitsAndBuffer(chain, coin, legs = 2) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    try {
      const tokenAddr = _resolveTokenAddress(chain, coin);
      const treasuryAddr = _resolveTreasuryAddress(chain);
      const simulatedUnits = await _simulateMultiSendGasUnits(chain, tokenAddr, treasuryAddr, legs);
      console.log(
        `🔬 [GasOracle] Simulated gas units (chain=${chain} coin=${coin}): ${simulatedUnits}`
      );
      const simBuffer = isBNB ? SIM_BUFFER_BNB : SIM_BUFFER_BASE;
      return { gasUnits: simulatedUnits, bufferMultiplier: simBuffer, simulated: true };
    } catch (simErr) {
      console.warn(
        `⚠️ [GasOracle] Simulation failed (chain=${chain} coin=${coin}), falling back to hardcoded units:`,
        simErr.message
      );
    }
  }

  const gasUnits = _gasUnitsForLegs(legs);
  return { gasUnits, bufferMultiplier: isBNB ? BUFFER_BNB : BUFFER_BASE, simulated: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// estimateTransferFee(chain, coin)
//
// chain  : 'base' | 'bnb'
// coin   : 'NGN' | 'CNGN' | 'USDT' | 'USDC'
//
// Returns: { feeUSD, feeNGN, feeWei, decimals }
// ─────────────────────────────────────────────────────────────────────────────
async function estimateTransferFee(chain, coin) {
  const isNGN = coin === 'NGN' || coin === 'CNGN';
  const isBNB = chain === 'bnb';

  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  const { gasUnits, bufferMultiplier, simulated } = await _resolveGasUnitsAndBuffer(chain, coin, 2);

  const gasCostWei = BigInt(gasUnits) * BigInt(gasPrice);
  const gasCostNativeToken = parseFloat(ethers.formatEther(gasCostWei));
  const gasCostUSD = gasCostNativeToken * nativeUSD;

  // bufferMultiplier is SIM_BUFFER (1.3) when simulated=true, or the
  // chain-aware BUFFER_BASE/BUFFER_BNB when using hardcoded fallback units.
  const feeUSD = gasCostUSD * bufferMultiplier;

  // 8% premium belongs on the USD/NGN RATE, not on the USD fee itself
  const adjustedUsdNgnRate = usdNGN * 1.08;
  const feeNGN = feeUSD * adjustedUsdNgnRate;

  console.log(
    `⛽ [GasOracle] chain=${chain} coin=${coin} simulated=${simulated} | ` +
      `gasUnits=${gasUnits} gasPrice=${ethers.formatUnits(gasPrice, 'gwei')}gwei buffer=${bufferMultiplier}x | ` +
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
// Returns BOTH the NGN-denominated fee AND the USD-denominated fee from a
// single gas price fetch, so the caller can check balances and pick
// whichever token the user actually holds (NGNs → cNGN → USDT → USDC).
//
// Returns: { feeNGN, feeUSD, feeWeiNGN, feeWeiUSD, ngnDecimals, usdDecimals }
// ─────────────────────────────────────────────────────────────────────────────
// legs: number of on-chain calls bundled into the MultiSend for this specific
// pool operation. Callers MUST pass the real leg count — e.g. a trusted swap
// (swap + fee = 2) vs an untrusted swap (approve + swap + fee = 3), or a
// single-rate update (rate + fee = 2) vs a dual-rate update (buy + sell +
// fee = 3). Defaulting silently to 2 for everything was the original bug —
// it undercharged every 3-leg operation.
async function estimatePoolFee(chain, legs = 2) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  // Pool ops simulate against the NGN token leg by default — representative
  // of the dominant real-world pool operation (NGN swap leg + fee leg).
  const { gasUnits, bufferMultiplier, simulated } = await _resolveGasUnitsAndBuffer(
    chain,
    'NGN',
    legs
  );

  const gasCostWei = BigInt(gasUnits) * BigInt(gasPrice);
  const gasCostNativeToken = parseFloat(ethers.formatEther(gasCostWei));
  const gasCostUSD = gasCostNativeToken * nativeUSD;
  const rawFeeUSD = gasCostUSD * bufferMultiplier;
  const adjustedUsdNgnRate = usdNGN * 1.08;
  const rawFeeNGN = rawFeeUSD * adjustedUsdNgnRate;

  console.log(
    `⛽ [GasOracle/pool] chain=${chain} simulated=${simulated} | gasUnits=${gasUnits} buffer=${bufferMultiplier}x | ` +
      `gasPrice=${ethers.formatUnits(gasPrice, 'gwei')}gwei | ` +
      `nativeUSD=$${nativeUSD.toFixed(2)} feeUSD=$${rawFeeUSD.toFixed(6)} feeNGN=₦${rawFeeNGN.toFixed(2)}`
  );

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
  const usdDecimals = 6;

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
