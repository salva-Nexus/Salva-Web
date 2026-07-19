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
const { getL1TokenDecimals } = require('../utils/l1Decimals');

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

  // Always try the project's OWN configured RPC (Alchemy, from .env) FIRST —
  // it has a real dedicated rate-limit budget. Public RPCs are kept ONLY as
  // a last-resort fallback chain, since they 429 or require auth under load
  // (rpc.ankr.com now requires an API key; mainnet.base.org rate-limits fast).
  const envRpc = isBNB
    ? isProd
      ? process.env.BNB_MAINNET_RPC_URL
      : process.env.BNB_TESTNET_RPC_URL
    : isProd
      ? process.env.BASE_MAINNET_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL;

  const publicFallbacks = isBNB
    ? isProd
      ? ['https://bsc.publicnode.com', 'https://binance.llamarpc.com', 'https://bsc-dataseed.bnbchain.org']
      : ['https://bsc-testnet-rpc.publicnode.com']
    : isProd
      ? ['https://base.llamarpc.com', 'https://base-rpc.publicnode.com']
      : ['https://sepolia.base.org'];

  if (!envRpc) return publicFallbacks;
  return [envRpc, ...publicFallbacks.filter((u) => u !== envRpc)];
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

// ─────────────────────────────────────────────────────────────────────────────
// _simFeeLegAmountWei(chain, coin, tokenAddress)
//
// Realistic simulated amount for the treasury fee-transfer leg — NOT a
// "1 wei" placeholder. Rule: 1 whole unit for NGN-family tokens (NGNs/
// cNGN), 0.01 whole unit for USD-family tokens (USDT/USDC), scaled to the
// token's REAL decimals — hardcoded 6 on Base (always), live
// PoolFactory.tokenDecimal() on BNB.
// ─────────────────────────────────────────────────────────────────────────────
// Simulates the fee-transfer leg using the REAL on-chain balanceOf(safeAddress)
// for that token — never a fabricated placeholder. If the balance is 0 (should
// never happen here since callers only reach this after confirming balance > 0
// via resolveGasFee's pre-check), falls back to 1 wei as an absolute last
// resort so simulation doesn't throw on a literal zero-amount transfer.
async function _simFeeLegAmountWei(chain, tokenAddress, safeAddress) {
  const isBNB = chain === 'bnb';
  let decimals = 6; // Base — hardcoded 6 for every token, always.

  if (isBNB) {
    try {
      decimals = await getL1TokenDecimals(ethers.getAddress(tokenAddress));
    } catch (e) {
      decimals = 6;
      console.warn(
        `⚠️ [GasOracle] Could not fetch live decimals for fee-leg sim, using fallback ${decimals}:`,
        e.message
      );
    }
  }

  try {
    const isProd = process.env.NODE_ENV === 'production';
    const rpcUrl = isBNB
      ? (isProd ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com')
      : (isProd ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
    const balProvider = new ethers.JsonRpcProvider(rpcUrl);
    const BAL_ABI = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(ethers.getAddress(tokenAddress), BAL_ABI, balProvider);
    const balWei = await contract.balanceOf(ethers.getAddress(safeAddress));
    if (balWei > 0n) {
      console.log(`🔬 [GasOracle] Using REAL balanceOf(${safeAddress}) for sim amount: ${ethers.formatUnits(balWei, decimals)} (token=${tokenAddress})`);
      return balWei;
    }
  } catch (e) {
    console.warn(`⚠️ [GasOracle] balanceOf() read failed for sim amount, using 1 wei fallback:`, e.message);
  }
  // Absolute last resort — should not normally be reached since resolveGasFee
  // already confirmed balance > 0 before calling into simulation.
  return 1n;
}

// ─────────────────────────────────────────────────────────────────────────────
// hasAnyFeeTokenBalance(chain, safeAddress)
//
// Used ONLY by pool and swap routes (never plain transfer/SANT — those have
// their own same-coin/alt-family deduction logic and don't need this). If
// the Safe genuinely holds ZERO across all four fee-payable tokens, no gas
// simulation retry or hardcoded-fee fallback can save the transaction — it
// is going to fail on-chain regardless. Callers use this to give an honest,
// immediate block instead of quietly trying (and failing) the fallback
// path. If the Safe holds SOME balance in at least one token, a simulation
// failure is treated as ordinary RPC/estimation noise and the existing
// hardcoded-fallback path proceeds as before.
// ─────────────────────────────────────────────────────────────────────────────
async function hasAnyFeeTokenBalance(chain, safeAddress) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';

  const addrs = isBNB
    ? [
        isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS,
        isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS,
        isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS,
        isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS,
      ]
    : [
        process.env.NGN_TOKEN_ADDRESS,
        process.env.CNGN_CONTRACT_ADDRESS,
        process.env.USDT_CONTRACT_ADDRESS,
        process.env.USDC_CONTRACT_ADDRESS,
      ];

  let provider;
  try {
    provider = await _getWorkingProvider(isBNB);
  } catch (e) {
    console.warn(`⚠️ [GasOracle] No working RPC for fee-balance check (${chain}):`, e.message);
    return false;
  }
  const BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

  for (const addr of addrs) {
    if (!addr) continue;
    try {
      const contract = new ethers.Contract(ethers.getAddress(addr), BAL_ABI, provider);
      const bal = await contract.balanceOf(ethers.getAddress(safeAddress));
      if (bal > 0n) return true;
    } catch (e) {
      console.warn(`⚠️ [GasOracle] balance check failed for ${addr}:`, e.message);
    }
  }
  return false;
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
async function _simulateMultiSendGasUnits(
  chain,
  tokenAddress,
  treasuryAddress,
  legs = 2,
  actionCalls = null,
  coin = 'NGN'
) {
  if (!tokenAddress) throw new Error('No token address resolved for simulation');
  if (!treasuryAddress) throw new Error('No treasury address resolved for simulation');

  const isBNB = chain === 'bnb';
  const provider = await _getWorkingProvider(isBNB);

  const dummyRecipient = '0x000000000000000000000000000000000000dEaD';
  const MULTISEND_LOOP_OVERHEAD_PER_LEG = 4000n;

  // ── Real-calldata path ──────────────────────────────────────────────────
  // actionCalls, when provided, is an array of { to, data, from? } describing
  // the ACTUAL on-chain calls this operation will make (deployPool(), swap
  // fn, updateBuyRate(), pause(), removeLiquidity(), etc.) — everything
  // except the final fee-transfer leg, which we always append ourselves
  // since it's genuinely always a plain ERC20 transfer to treasury.
  //
  // This replaces the old approach of pretending every leg is a token
  // transfer — a swap costs far more gas than a transfer, a pool deploy
  // (CREATE-based) costs vastly more, and updateBuyRate/pause are simple
  // storage writes roughly transfer-sized. Simulating the real calldata is
  // the only way to get a number that isn't wrong by an order of magnitude
  // for the non-transfer operations.
  if (actionCalls && actionCalls.length > 0) {
    let total = 0n;
    for (const call of actionCalls) {
      const from = call.from ? ethers.getAddress(call.from) : ethers.getAddress(treasuryAddress);
      try {
        const legGas = await provider.estimateGas({
          from,
          to: ethers.getAddress(call.to),
          data: call.data,
        });
        total += legGas + MULTISEND_LOOP_OVERHEAD_PER_LEG;
      } catch (simErr) {
        // A single leg failing to simulate (e.g. deployPool() reverts when
        // simulated from an address without the right on-chain state) must
        // not silently produce a garbage total — bail out entirely so the
        // caller falls back to the hardcoded path, which is honest about
        // being an estimate rather than quietly wrong.
        throw new Error(`Action leg simulation failed (to=${call.to}): ${simErr.message}`);
      }
    }
    // Always append the real fee-transfer leg too, for an accurate total.
    // IMPORTANT: simulate this leg from the SAME real address as the action
    // legs above (the user/owner actually calling the function) — NOT the
    // treasury. Gas cost of an ERC20 transfer depends on the SENDER's
    // on-chain state (cold vs warm storage slot, etc.), so treasury was
    // giving an inaccurate number for the account that actually pays.
    // Every actionCall passed into this function already carries the real
    // caller's address in `.from`, so we just reuse it. Falls back to
    // treasuryAddress only if no actionCall supplied one (shouldn't happen).
    const feeLegFrom = actionCalls[0]?.from
      ? ethers.getAddress(actionCalls[0].from)
      : ethers.getAddress(treasuryAddress);
    // Realistic simulated fee amount — 1 unit NGN-family / 0.01 unit
    // USD-family, scaled to real decimals (see _simFeeLegAmountWei). This
    // replaces the old "1 wei" placeholder.
    const feeLegAmountWei = await _simFeeLegAmountWei(chain, tokenAddress, feeLegFrom);
    const feeData = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
      ethers.getAddress(treasuryAddress),
      feeLegAmountWei,
    ]);
    const feeLegGas = await provider.estimateGas({
      from: feeLegFrom,
      to: ethers.getAddress(tokenAddress),
      data: feeData,
    });
    total += feeLegGas + MULTISEND_LOOP_OVERHEAD_PER_LEG;
    return total;
  }

  // ── Fallback path (no real calldata supplied) — old generic-transfer
  // approximation. Kept for callers that haven't been updated yet, and as
  // the fallback within _resolveGasUnitsAndBuffer if actionCalls simulation
  // throws.
  const numLegs = Math.max(1, legs);
  const genericAmountWei = await _simFeeLegAmountWei(chain, tokenAddress, treasuryAddress);
  let total = 0n;
  for (let i = 0; i < numLegs; i++) {
    const dest = i === numLegs - 1 ? ethers.getAddress(treasuryAddress) : dummyRecipient;
    const txData = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [dest, genericAmountWei]);
    const legGas = await provider.estimateGas({
      from: ethers.getAddress(treasuryAddress),
      to: ethers.getAddress(tokenAddress),
      data: txData,
    });
    total += legGas + MULTISEND_LOOP_OVERHEAD_PER_LEG;
  }
  return total;
}

/**
 * Resolves the gas units to use for a multisend-shaped tx, per the rule:
 *   production  → simulate live, buffer +30%
 *   development → hardcoded GAS_UNITS.multisend, buffer = BUFFER_BASE/BUFFER_BNB
 *   simulation failure (any env) → same fallback as development
 *
 * Returns { gasUnits: bigint, bufferMultiplier: number, simulated: boolean }
 */
async function _resolveGasUnitsAndBuffer(chain, coin, legs = 2, actionCalls = null) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';

  if (isProd) {
    try {
      const tokenAddr = _resolveTokenAddress(chain, coin);
      const treasuryAddr = _resolveTreasuryAddress(chain);
      const simulatedUnits = await _simulateMultiSendGasUnits(
        chain,
        tokenAddr,
        treasuryAddr,
        legs,
        actionCalls,
        coin
      );
      console.log(
        `🔬 [GasOracle] Simulated gas units (chain=${chain} coin=${coin} realCalldata=${!!actionCalls}): ${simulatedUnits}`
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
async function estimateTransferFee(chain, coin, fromAddress = null, actionCalls = null) {
  const isNGN = coin === 'NGN' || coin === 'CNGN';
  const isBNB = chain === 'bnb';

  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  // Build a real-calldata simulation using the caller's OWN address — chain
  // specific — rather than a treasury placeholder, mirroring what pool.js
  // already does for every pool operation.
  let effectiveActionCalls = actionCalls;
  if (!effectiveActionCalls && fromAddress) {
    try {
      const tokenAddr = _resolveTokenAddress(chain, coin);
      if (tokenAddr) {
        const dummyRecipient = '0x000000000000000000000000000000000000dEaD';
        effectiveActionCalls = [
          {
            to: ethers.getAddress(tokenAddr),
            data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [dummyRecipient, 1n]),
            from: ethers.getAddress(fromAddress),
          },
        ];
      }
    } catch (e) {
      console.warn(
        '⚠️ [GasOracle] Could not build actionCalls from fromAddress, falling back:',
        e.message
      );
    }
  }

  const { gasUnits, bufferMultiplier, simulated } = await _resolveGasUnitsAndBuffer(
    chain,
    coin,
    2,
    effectiveActionCalls
  );

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
async function estimatePoolFee(chain, legs = 2, actionCalls = null) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  const priceSymbol = isBNB ? 'BNBUSDT' : 'ETHUSDT';

  const [nativeUSD, gasPrice, usdNGN] = await Promise.all([
    _fetchCryptoUSD(priceSymbol),
    _fetchGasPrice(isBNB),
    _fetchUSDtoNGN(),
  ]);

  // actionCalls, when passed, contains the REAL calldata for this specific
  // pool operation (swap/deploy/updateBuyRate/pause/etc) — simulated as-is
  // instead of approximated as generic token transfers.
  const { gasUnits, bufferMultiplier, simulated } = await _resolveGasUnitsAndBuffer(
    chain,
    'NGN',
    legs,
    actionCalls
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

// ─────────────────────────────────────────────────────────────────────────────
// _getTokenBalance(chain, tokenAddress, safeAddress) → { balance: number, decimals: number }
// Balance-check helper, chain-aware decimals (Base=hardcoded 6, BNB=live factory read).
// ─────────────────────────────────────────────────────────────────────────────
async function _getTokenBalance(chain, tokenAddress, safeAddress) {
  if (!tokenAddress) return { balance: 0, decimals: 6 };
  const isBNB = chain === 'bnb';
  const BAL_ABI = ['function balanceOf(address) view returns (uint256)'];
  let decimals = 6;
  if (isBNB) {
    try {
      decimals = await getL1TokenDecimals(ethers.getAddress(tokenAddress));
    } catch {
      decimals = 6; // caller supplies fallback context if needed
    }
  }
  try {
    // Uses the same env-first, public-fallback provider resolution as every
    // other RPC call in this file — never a single hardcoded public endpoint.
    const balProvider = await _getWorkingProvider(isBNB);
    const contract = new ethers.Contract(ethers.getAddress(tokenAddress), BAL_ABI, balProvider);
    const wei = await contract.balanceOf(ethers.getAddress(safeAddress));
    return { balance: parseFloat(ethers.formatUnits(wei, decimals)), decimals };
  } catch (e) {
    console.warn(`⚠️ [GasOracle] balance read failed for ${tokenAddress}:`, e.message);
    return { balance: 0, decimals };
  }
}

// Ordered candidate list — NGNs → cNGN → USDT → USDC — resolved per chain.
function _feeCandidates(chain) {
  const isBNB = chain === 'bnb';
  const isProd = process.env.NODE_ENV === 'production';
  if (isBNB) {
    return [
      { symbol: 'NGNs', family: 'NGN', address: isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS },
      { symbol: 'cNGN', family: 'NGN', address: isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS },
      { symbol: 'USDT', family: 'USD', address: isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS },
      { symbol: 'USDC', family: 'USD', address: isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS },
    ];
  }
  return [
    { symbol: 'NGNs', family: 'NGN', address: process.env.NGN_TOKEN_ADDRESS },
    { symbol: 'cNGN', family: 'NGN', address: process.env.CNGN_CONTRACT_ADDRESS },
    { symbol: 'USDT', family: 'USD', address: process.env.USDT_CONTRACT_ADDRESS },
    { symbol: 'USDC', family: 'USD', address: process.env.USDC_CONTRACT_ADDRESS },
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// resolveGasFee(chain, safeAddress, legs, actionCallsBuilder)
//
// Implements the full spec:
//   1. Balance-check NGNs → cNGN → USDT → USDC in order. First one with
//      balance > 0 is used ONLY to make the gas simulation realistic
//      (doesn't mean it pays the fee).
//   2. If ALL four are genuinely zero → return { noBalance: true } and
//      STOP. No fallback, no simulation, no guessing. Caller must block
//      the action entirely.
//   3. Simulate real gas cost using that token (via actionCallsBuilder,
//      which receives the chosen token address and must return the real
//      action calldata array — since some ops need a token address baked
//      into the calldata, e.g. approve()).
//   4. Convert simulated gas to feeUSD/feeNGN.
//   5. Re-check balances against the COMPUTED fee: NGN family first
//      (NGNs, then cNGN) — first one >= feeNGN wins. Else USD family
//      (USDT, then USDC) — first one >= feeUSD wins.
//   6. If nothing can cover the computed fee → return { insufficientFee: true, feeNGN, feeUSD }.
//   7. Otherwise return the resolved payer + which currency the UI should show.
//
// Returns one of:
//   { noBalance: true }
//   { insufficientFee: true, feeNGN, feeUSD }
//   { feeNGN, feeUSD, currency: 'NGN'|'USD', payToken: { symbol, address, decimals, feeWei } }
// ─────────────────────────────────────────────────────────────────────────────
async function resolveGasFee(chain, safeAddress, legs = 2, actionCallsBuilder = null) {
  const candidates = _feeCandidates(chain);

  // ── Step 1/2: find first token with real balance > 0, for simulation only ──
  let simToken = null;
  for (const c of candidates) {
    if (!c.address) continue;
    const { balance } = await _getTokenBalance(chain, c.address, safeAddress);
    if (balance > 0) {
      simToken = c;
      break;
    }
  }
  if (!simToken) {
    console.log(`🚫 [GasOracle] ${safeAddress} has ZERO balance across all 4 fee tokens on ${chain} — no fallback, blocking.`);
    return { noBalance: true };
  }

  // ── Step 3/4: simulate + convert using the balance-checked sim token ────────
  const actionCalls = actionCallsBuilder ? actionCallsBuilder(simToken.address) : null;
  const result = actionCalls
    ? await estimatePoolFee(chain, legs, actionCalls)
    : await estimatePoolFee(chain, legs, null);

  const { feeNGN, feeUSD } = result;

  // ── Step 5/6: re-check balances against the COMPUTED fee ────────────────────
  for (const c of candidates.filter((x) => x.family === 'NGN')) {
    if (!c.address) continue;
    const { balance, decimals } = await _getTokenBalance(chain, c.address, safeAddress);
    if (balance >= feeNGN) {
      const feeWei = ethers.parseUnits(feeNGN.toFixed(decimals), decimals);
      return { feeNGN, feeUSD, currency: 'NGN', payToken: { symbol: c.symbol, tokenAddress: c.address, decimals, feeWei } };
    }
  }
  for (const c of candidates.filter((x) => x.family === 'USD')) {
    if (!c.address) continue;
    const { balance, decimals } = await _getTokenBalance(chain, c.address, safeAddress);
    if (balance >= feeUSD) {
      const feeWei = ethers.parseUnits(feeUSD.toFixed(decimals), decimals);
      return { feeNGN, feeUSD, currency: 'USD', payToken: { symbol: c.symbol, tokenAddress: c.address, decimals, feeWei } };
    }
  }

  return { insufficientFee: true, feeNGN, feeUSD };
}

module.exports = { estimateTransferFee, estimatePoolFee, warmCache, hasAnyFeeTokenBalance, resolveGasFee };
