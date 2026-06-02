// packages/backend/src/utils/l1Decimals.js
//
// Fetches token decimals from the PoolFactory contract on BSC.
// Uses BSC Testnet RPC in development, BSC Mainnet RPC in production.
// Caches results in memory so we don't hit the RPC on every request.

const { ethers } = require('ethers');

const FACTORY_ABI = ['function tokenDecimal(address token) external view returns (uint8)'];

const cache = new Map(); // tokenAddress (lowercase) -> decimals (number)

async function getL1TokenDecimals(tokenAddress) {
  const key = tokenAddress.toLowerCase();

  if (cache.has(key)) {
    return cache.get(key);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const rpcUrl = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

  const factoryAddress = isProd
    ? process.env.L1_POOL_FACTORY_ADDRESS
    : process.env.L1_BSC_POOL_FACTORY_ADDRESS;

  if (!rpcUrl) throw new Error('BNB RPC URL not configured');
  if (!factoryAddress) throw new Error('L1 Pool Factory address not configured');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const factory = new ethers.Contract(ethers.getAddress(factoryAddress), FACTORY_ABI, provider);

  const decimals = await factory.tokenDecimal(ethers.getAddress(tokenAddress));
  const dec = Number(decimals);

  cache.set(key, dec);
  return dec;
}

// Pre-warms the cache for all four L1 tokens.
// Call this once at startup so the first real request is instant.
async function warmL1DecimalsCache() {
  const isProd = process.env.NODE_ENV === 'production';

  const addresses = [
    isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS,
    isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS,
    isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS,
    isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS,
  ].filter(Boolean);

  await Promise.allSettled(
    addresses.map((addr) =>
      getL1TokenDecimals(addr).catch((e) =>
        console.error(`⚠️ warmL1DecimalsCache: could not fetch decimals for ${addr}:`, e.message)
      )
    )
  );

  console.log('✅ L1 token decimals cache warmed:', Object.fromEntries(cache));
}

module.exports = { getL1TokenDecimals, warmL1DecimalsCache };
