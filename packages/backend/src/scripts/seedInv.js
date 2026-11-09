import { SupportedPair } from '../models/SupportedPair.js';
import { getChainlinkFeedByChainAndSymbol } from '../utils/rpcUrls.js';
import { keyValue, mode } from '../utils/vars.js';
import { ethers } from 'ethers';

const NGN_SYMBOLS = ['NGNS', 'CNGN'];
const NATIVE_ADDRESS = ethers.ZeroAddress;

const TRUSTWALLET_CHAIN_MAP = {
  base: 'base',
  bnb: 'binance',
};

// Static URLs for stablecoins / LINK (same as seedAssets)
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

  // 2. Specific logos for USDC, USDT and LINK across all chains
  const upperSymbol = symbol ? symbol.toUpperCase() : '';
  if (upperSymbol === 'USDC') return USDC_LOGO_URL;
  if (upperSymbol === 'USDT') return USDT_LOGO_URL;
  if (upperSymbol === 'LINK') return LINK_LOGO_URL;

  // 3. NGNS / cNGN (and anything else) -> null
  return null;
};

// Per-chain token config. NATIVE = zero address.
const CHAINS = {
  base: {
    nativeSymbol: 'ETH',
    ngnOracleKey: 'ngnOracleBase',
    tokens: {
      NGNS: 'ngnsBaseAddress',
      CNGN: 'cngnBaseAddress',
      USDT: 'usdtBaseAddress',
      USDC: 'usdcBaseAddress',
      LINK: 'linkBaseAddress',
    },
  },
  bnb: {
    nativeSymbol: 'BNB',
    ngnOracleKey: 'ngnOracleBnb',
    tokens: {
      NGNS: 'ngnsBnbAddress',
      CNGN: 'cngnBnbAddress',
      USDT: 'usdtBnbAddress',
      USDC: 'usdcBnbAddress',
      LINK: 'linkBnbAddress',
    },
  },
};

// NATIVE is replaced with the chain's native symbol (ETH on base, BNB on bnb).
const PAIR_TEMPLATES = [
  ['NGNS', 'NATIVE'],
  ['NGNS', 'USDT'],
  ['NGNS', 'USDC'],
  ['NGNS', 'LINK'],
  ['CNGN', 'NATIVE'],
  ['CNGN', 'USDT'],
  ['CNGN', 'USDC'],
  ['CNGN', 'LINK'],
  ['NATIVE', 'USDT'],
  ['NATIVE', 'USDC'],
  ['LINK', 'USDT'],
  ['LINK', 'USDC'],
];

const resolveAsset = (chain, chainCfg, sym) => {
  if (sym === 'NATIVE') {
    return {
      symbol: chainCfg.nativeSymbol,
      address: NATIVE_ADDRESS,
      logo: getLogoUrl(chain, NATIVE_ADDRESS, chainCfg.nativeSymbol),
    };
  }
  const address = keyValue(chainCfg.tokens[sym]);
  return {
    symbol: sym,
    address,
    logo: getLogoUrl(chain, address, sym),
  };
};

const buildSeedPairs = () => {
  const out = [];
  for (const [chain, cfg] of Object.entries(CHAINS)) {
    for (const [b, q] of PAIR_TEMPLATES) {
      const base = resolveAsset(chain, cfg, b);
      const quote = resolveAsset(chain, cfg, q);
      const priceFeed = NGN_SYMBOLS.includes(base.symbol)
        ? keyValue(cfg.ngnOracleKey)
        : getChainlinkFeedByChainAndSymbol(base.symbol.toUpperCase(), chain);
      out.push({ chain, base, quote, priceFeed });
    }
  }
  return out;
};

async function seedDatabase() {
  try {
    console.log(`🌱 Starting Supported Pairs Seeding (Mode: ${mode || 'development'})...`);

    const type = mode === 'development' ? 'TESTNET' : 'MAINNET';
    let created = 0;
    let existing = 0;
    let skipped = 0;

    for (const { chain, base, quote, priceFeed } of buildSeedPairs()) {
      const label = `${base.symbol}/${quote.symbol} [${chain}]`;

      if (
        !base.address ||
        !quote.address ||
        !priceFeed ||
        !ethers.isAddress(base.address) ||
        !ethers.isAddress(quote.address) ||
        !ethers.isAddress(priceFeed)
      ) {
        console.warn(`⚠️ Skipping ${label}: missing or invalid address/feed.`);
        skipped++;
        continue;
      }

      try {
        await SupportedPair.create({
          ownerSafeAddress: '0x0000000000000000000000000000000000000000',
          baseSymbol: base.symbol,
          quoteSymbol: quote.symbol,
          baseAddress: base.address.toLowerCase(),
          quoteAddress: quote.address.toLowerCase(),
          baseLogo: base.logo,
          quoteLogo: quote.logo,
          priceFeed: priceFeed.toLowerCase(),
          chain,
          isVerified: true,
          type,
        });
        created++;
        console.log(`✅ Created: ${label}`);
      } catch (err) {
        // Unique index (chain + baseAddress + quoteAddress) hit -> pair already seeded
        if (err?.code === 11000) {
          existing++;
          console.log(`ℹ️ Already exists, skipped: ${label}`);
          continue;
        }
        throw err;
      }
    }

    console.log(
      `✨ Seeding completed. Created: ${created}, Already existed: ${existing}, Skipped (invalid): ${skipped}`
    );
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  }
}

seedDatabase();
