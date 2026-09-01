const mode = process.env.NODE_ENV;

const obj = {
  sponsorKey: process.env.MANAGER_PRIVATE_KEY,
  MULTI_SEND_BASE_ADDRESS:
    mode === 'development'
      ? '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425'
      : '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3',
  MULTI_SEND_BNB_ADDRESS:
    mode === 'development'
      ? '0x5270A710B4df2ecB457Be1aCA29fbD6C34435eb6'
      : '0x63bF68FE0280799E43009eb66D7a1E4248082E14',
  baseRpcUrl:
    mode === 'development'
      ? process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
      : process.env.BASE_MAINNET_RPC_URL,
  bnbRpcUrl:
    mode === 'development'
      ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
      : process.env.BNB_MAINNET_RPC_URL,

  ngnsBaseAddress: process.env.NGN_TOKEN_ADDRESS,
  cngnBaseAddress: process.env.CNGN_CONTRACT_ADDRESS,
  usdtBaseAddress: process.env.USDT_CONTRACT_ADDRESS,
  usdcBaseAddress: process.env.USDC_CONTRACT_ADDRESS,
  santAddress: process.env.SANT_BASE,

  ngnsBnbAddress: process.env.BSC_NGN_TOKEN_ADDRESS,
  cngnBnbAddress: process.env.BSC_CNGN_CONTRACT_ADDRESS,
  usdtBnbAddress: process.env.BSC_USDT_CONTRACT_ADDRESS,
  usdcBnbAddress: process.env.BSC_USDC_CONTRACT_ADDRESS,
  treasury: process.env.TREASURY_CONTRACT_ADDRESS,
  maxUint256: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  factory: process.env.REGISTRY_FACTORY,
  salvaRegistry: process.env.REGISTRY_CONTRACT_ADDRESS,
  registry: process.env.REGISTRY_CONTRACT_ADDRESS,
  dummySafe: process.env.DUMMY_SAFE,
  dummyKey: process.env.DUMMY_KEY,
  dummyBasePool: process.env.DUMMY_BASE_POOL,
  dummyBnbPool: process.env.DUMMY_BNB_POOL,
  maxAgeMs: 2 * 60 * 60 * 1000,
  singleton: '0x29fcb43b46531bca003ddc8fcb67ffe91900c762',
  safeFactory: process.env.SAFE_PROXY_FACTORY,
  fallbackHandler: '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4',
  DEPLOYMENT_SALT_MESSAGE: 'NEW_SALVA_SAFE_DEPLOYMENT',
  regFactory: process.env.REGISTRY_FACTORY,
  basePoolFactory: process.env.BASE_POOL_FACTORY_ADDRESS,
  bnbPoolFactory: process.env.BSC_POOL_FACTORY_ADDRESS,
};

const keyValue = (key) => {
  // console.log('Key: ', key)
  // console.log('Loaded Value: ', obj[key]);
  return obj[key];
};

export { keyValue, mode };
