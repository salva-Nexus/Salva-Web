// SeedAssets
import { ethers } from 'ethers';
import Assets from '../models/Assets.js';
import { keyValue, mode } from '../utils/vars.js';
import { getRpcUrlByChain, getChainlinkFeedByChainAndSymbol } from '../utils/rpcUrls.js';

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

const NATIVE_ADDRESS = '0x0000000000000000000000000000000000000000';

const TRUSTWALLET_CHAIN_MAP = {
  base: 'base',
  bnb: 'binance',
};

// Static URLs for stablecoins
const USDC_LOGO_URL =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png';

const USDT_LOGO_URL =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png';

const LINK_LOGO_URL =
  'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png';

const getLogoUrl = (chain, tokenAddress, symbol) => {
  // 1. Native assets use TrustWallet repo chain path
  if (tokenAddress === NATIVE_ADDRESS) {
    const repoChain = TRUSTWALLET_CHAIN_MAP[chain.toLowerCase()] || chain.toLowerCase();
    return `https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/${repoChain}/info/logo.png`;
  }

  // 2. Specific logos for USDC and USDT across all chains
  const upperSymbol = symbol ? symbol.toUpperCase() : '';
  if (upperSymbol === 'USDC') return USDC_LOGO_URL;
  if (upperSymbol === 'USDT') return USDT_LOGO_URL;
  if (upperSymbol === 'LINK') return LINK_LOGO_URL;

  // 3. Fallback to null for all other ERC20 tokens
  return null;
};

const nativeAssets = [
  { chain: 'base', symbol: 'ETH', decimals: 18 },
  { chain: 'bnb', symbol: 'BNB', decimals: 18 },
];

const tokenConfigs = [
  // Base
  { chain: 'base', key: 'ngnsBaseAddress', fallbackSymbol: 'NGNS', fallbackDecimals: 18 },
  { chain: 'base', key: 'cngnBaseAddress', fallbackSymbol: 'cNGN', fallbackDecimals: 6 },
  { chain: 'base', key: 'usdtBaseAddress', fallbackSymbol: 'USDT', fallbackDecimals: 6 },
  { chain: 'base', key: 'usdcBaseAddress', fallbackSymbol: 'USDC', fallbackDecimals: 6 },
  { chain: 'base', key: 'santAddress', fallbackSymbol: 'SANT', fallbackDecimals: 18 },
  { chain: 'base', key: 'linkBaseAddress', fallbackSymbol: 'LINK', fallbackDecimals: 18 },

  // BNB
  { chain: 'bnb', key: 'ngnsBnbAddress', fallbackSymbol: 'NGNS', fallbackDecimals: 18 },
  { chain: 'bnb', key: 'cngnBnbAddress', fallbackSymbol: 'cNGN', fallbackDecimals: 6 },
  { chain: 'bnb', key: 'usdtBnbAddress', fallbackSymbol: 'USDT', fallbackDecimals: 18 },
  { chain: 'bnb', key: 'usdcBnbAddress', fallbackSymbol: 'USDC', fallbackDecimals: 18 },
  { chain: 'bnb', key: 'linkBnbAddress', fallbackSymbol: 'LINK', fallbackDecimals: 18 },
];

async function seedAssets() {
  console.log(`🚀 Starting Asset Seeding (Mode: ${mode || 'development'})...`);
  const operations = [];

  // 1. Process Native Assets
  for (const native of nativeAssets) {
    const chain = native.chain.toLowerCase();
    const logoUrl = getLogoUrl(chain, NATIVE_ADDRESS, native.symbol);
    // https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/base/info/logo.png
    operations.push({
      updateOne: {
        filter: { chain, tokenAddress: NATIVE_ADDRESS },
        update: {
          $set: {
            chain,
            tokenAddress: NATIVE_ADDRESS,
            priceFeedAddress: getChainlinkFeedByChainAndSymbol(native.symbol.toUpperCase(), chain),
            tokenSymbol: native.symbol.toUpperCase(),
            tokenDecimals: native.decimals,
            logo: logoUrl,
            type: 'MAINNET',
            isActive: true,
          },
        },
        upsert: true,
      },
    });
  }

  const providers = {};

  for (const config of tokenConfigs) {
    const address = keyValue(config.key);

    // Skip if undefined, null, empty string, or an invalid EVM address
    if (!address || !ethers.isAddress(address)) {
      console.warn(`⚠️ Skipping ${config.key}: Key returned undefined or an invalid address.`);
      continue;
    }

    const chain = config.chain.toLowerCase();
    if (!providers[chain]) {
      const rpcUrl = getRpcUrlByChain(chain);
      if (rpcUrl) {
        providers[chain] = new ethers.JsonRpcProvider(rpcUrl);
      }
    }

    const provider = providers[chain];
    let symbol = config.fallbackSymbol;
    let decimals = config.fallbackDecimals;

    // Fetch on-chain details if RPC provider is available
    if (provider) {
      try {
        const contract = new ethers.Contract(address, ERC20_ABI, provider);
        const [fetchedSymbol, fetchedDecimals] = await Promise.all([
          contract.symbol(),
          contract.decimals(),
        ]);
        symbol = fetchedSymbol;
        decimals = Number(fetchedDecimals);
      } catch (err) {
        console.warn(
          `⚠️ Failed to fetch contract data on-chain for ${config.key} (${address}) on chain "${chain}". Using fallbacks (${config.fallbackSymbol}, ${config.fallbackDecimals}).`
        );
      }
    }

    const logoUrl = getLogoUrl(chain, address, symbol);

    operations.push({
      updateOne: {
        filter: { chain, tokenAddress: address.toLowerCase() },
        update: {
          $set: {
            chain,
            tokenAddress: address.toLowerCase(),
            priceFeedAddress: getChainlinkFeedByChainAndSymbol(symbol.toUpperCase(), chain),
            tokenSymbol: symbol.toUpperCase(),
            tokenDecimals: decimals,
            logo: logoUrl,
            type: 'MAINNET',
            isActive: true,
          },
        },
        upsert: true,
      },
    });
  }

  if (operations.length > 0) {
    const result = await Assets.bulkWrite(operations);
    console.log(
      `✅ Asset Seeding Complete. Upserted: ${result.upsertedCount}, Modified: ${result.modifiedCount}`
    );
  } else {
    console.log('ℹ️ No assets to seed.');
  }
}

seedAssets();
