import { keyValue } from './vars.js';

export const getRpcUrlByChain = (chain) => {
  if (!chain || typeof chain !== 'string') {
    return null;
  }

  const normalizedChain = chain.trim().toLowerCase();

  const chainRpcKeys = {
    base: 'baseRpcUrl',
    bsc: 'bnbRpcUrl',
  };

  const configKey = chainRpcKeys[normalizedChain];

  if (!configKey) {
    return null;
  }

  return keyValue(configKey) || null;
};

export function getChainlinkFeedByChainAndSymbol(tokenSymbol, chain) {
  if (!chain || !tokenSymbol) return undefined;

  const normalizedChain = chain.trim().toLowerCase();
  const normalizedSymbol = tokenSymbol.trim().toUpperCase();

  // Mapping chain + token combination to explicit Chainlink config key in obj
  const feedMapping = {
    base: {
      ETH: 'chainlinkBaseFeed',
      USDT: 'chainlinkUsdtBaseFeed',
      USDC: 'chainlinkUsdcBaseFeed',
      LINK: 'chainlinkLinkBaseFeed',
    },
    bsc: {
      BSC: 'chainlinkBnbFeed',
      USDT: 'chainlinkUsdtBnbFeed',
      USDC: 'chainlinkUsdcBnbFeed',
      LINK: 'chainlinkLinkBnbFeed',
    },
  };

  const configKey = feedMapping[normalizedChain]?.[normalizedSymbol];
  return configKey ? keyValue(configKey) : undefined;
}

export const getMultiSendAddress = (chain) => {
  if (!chain) throw new Error('Chain identifier required');

  const keyMap = {
    base: 'baseMultisend',
    bsc: 'bnbMultisend',
  };

  const key = keyMap[chain.toLowerCase().trim()];
  if (!key) throw new Error(`Unsupported chain: ${chain}`);

  const address = keyValue(key);
  if (!address || address === '0x') {
    throw new Error(`MultiSend contract not deployed on ${chain}`);
  }

  return address;
};

export const whitelistedTokens = ['NGNS', 'CNGN', 'USDT', 'USDC'];

export const getWhitelistedTokenAddress = (symbol, chain) => {
  if (!symbol) throw new Error('Token symbol required');

  const sym = symbol.toUpperCase().trim();
  const c = chain.toLowerCase().trim();

  if (!whitelistedTokens.includes(sym)) {
    throw new Error(`Symbol "${symbol}" is not a whitelisted gas reimbursement token`);
  }

  // Maps chain + symbol directly to vars.js obj keys
  const tokenKeyMap = {
    base: {
      NGNS: 'ngnsBaseAddress',
      CNGN: 'cngnBaseAddress',
      USDT: 'usdtBaseAddress',
      USDC: 'usdcBaseAddress',
    },
    bsc: {
      NGNS: 'ngnsBnbAddress',
      CNGN: 'cngnBnbAddress',
      USDT: 'usdtBnbAddress',
      USDC: 'usdcBnbAddress',
    },
  };

  const chainMap = tokenKeyMap[c];
  if (!chainMap) throw new Error(`Unsupported chain: ${chain}`);

  const key = chainMap[sym];
  if (!key) return undefined;

  const address = keyValue(key);
  if (!address || address === '0x') {
    throw new Error(`Token address for ${sym} on ${chain} is not configured`);
  }

  return address;
};

export function getNativeTokenSymbol(chain) {
  if (!chain || typeof chain !== 'string') return 'ETH';

  const chainMap = {
    base: 'ETH',
    bsc: 'BNB',
    binance: 'BNB',
  };

  return chainMap[chain.trim().toLowerCase()] || 'ETH';
}

export function isL2(chain) {
  if (!chain || typeof chain !== 'string') return false;

  const l2Chains = new Set(['base']);

  return l2Chains.has(chain.trim().toLowerCase());
}

export function getSafeSingletonAddress(chain) {
  if (!chain || typeof chain !== 'string') return null;

  const configKey = isL2(chain) ? 'safeL2Singleton' : 'safeL1Singleton';

  return keyValue(configKey) || null;
}

export const getMultisigAddress = (chain) => {
  if (!chain || typeof chain !== 'string') {
    throw new Error('Chain identifier required');
  }

  const normalizedChain = chain.trim().toLowerCase();

  const keyMap = {
    base: 'multisigBase',
    bsc: 'multisigBnb',
    binance: 'multisigBnb',
  };

  const key = keyMap[normalizedChain];
  if (!key) {
    throw new Error(`Unsupported chain for Multisig: ${chain}`);
  }

  const address = keyValue(key);
  if (!address || address === '0x') {
    throw new Error(`Multisig contract address not configured for ${chain}`);
  }

  return address;
};

export function getNgnsAddressByChain(chain) {
  if (!chain || typeof chain !== 'string') return null;

  const chainToKeyMap = {
    base: 'ngnsBaseAddress',
    bsc: 'ngnsBnbAddress',
  };

  const key = chainToKeyMap[chain.toLowerCase().trim()];
  return key ? keyValue(key) || null : null;
}

export const getPoolFactoryAddress = (chain) => {
  if (!chain || typeof chain !== 'string') {
    throw new Error('Chain identifier required');
  }

  const normalizedChain = chain.trim().toLowerCase();

  const keyMap = {
    base: 'basePoolFactory',
    bsc: 'bnbPoolFactory',
    binance: 'bnbPoolFactory',
  };

  const key = keyMap[normalizedChain];
  if (!key) {
    throw new Error(`Unsupported chain for PoolFactory: ${chain}`);
  }

  const address = keyValue(key);
  if (!address || address === '0x') {
    throw new Error(`PoolFactory contract address not configured for ${chain}`);
  }

  return address;
};

export function getNgnOracleAddressByChain(chain) {
  if (!chain || typeof chain !== 'string') return null;

  const chainToKeyMap = {
    base: 'ngnOracleBase',
    bsc: 'ngnOracleBnb',
  };

  const key = chainToKeyMap[chain.toLowerCase().trim()];
  return key ? keyValue(key) || null : null;
}