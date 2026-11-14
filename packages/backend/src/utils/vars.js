import { ethers } from 'ethers';
import { SAFE_SETUP } from '../utils/abi.js';

const mode = process.env.NODE_ENV;
const isTestnetMode = mode === 'development';

/* ======================= HELPERS ======================= */

// Picks the testnet value in development, the mainnet value otherwise.
const pickByMode = ({ testnet, mainnet }) => (isTestnetMode ? testnet : mainnet);

// For addresses that are identical on testnet and mainnet.
const sameInAllModes = (address) => pickByMode({ testnet: address, mainnet: address });

/* ======================= RPC URLS ======================= */

const RPC_URL = {
  base: pickByMode({
    testnet: process.env.BASE_SEPOLIA_RPC_URL,
    mainnet: process.env.BASE_MAINNET_RPC_URL,
  }),
  bnb: pickByMode({
    testnet: process.env.BNB_TESTNET_RPC_URL,
    mainnet: process.env.BNB_MAINNET_RPC_URL,
  }),
};

/* ======================= CHAINLINK PRICE FEEDS (all quoted in USD) ======================= */

const CHAINLINK_FEED_ON_BASE = {
  ETH_USD: pickByMode({
    testnet: '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1',
    mainnet: '0x50015f8b17fb2C290Dde41fDc246ed0dcEE93a8b',
  }),
  USDT_USD: pickByMode({
    testnet: '0x3ec8593F930EA45ea58c968260e6e9FF53FC934f',
    mainnet: '0xE6c6bf78308C46bad5Cae5D0ed44b36370b4B00d',
  }),
  USDC_USD: pickByMode({
    testnet: '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165',
    mainnet: '0xd0Dc8c910565D94D408729D16bE5467B5d7633Ad',
  }),
  LINK_USD: pickByMode({
    testnet: '0x90c069C4538adAc136......................', // TODO: incomplete address
    mainnet: '0x17CAb8FE31E32f08326e5E27412894e49B0f9D65',
  }),
};

const CHAINLINK_FEED_ON_BNB = {
  BNB_USD: pickByMode({
    testnet: '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526',
    mainnet: '0xd5D290Fe2ae6b55F385ab9C14d2CeB91DD3d9022',
  }),
  USDT_USD: pickByMode({
    testnet: '0xEca2605f0BCF2BA5966372C99837b1F182d3D620',
    mainnet: '0x501e21126486424567f40D490856094D72986E41',
  }),
  USDC_USD: pickByMode({
    testnet: '0x90c069C4538adAc136E051052E14c1cD799C41B7',
    mainnet: '0x8068600c8f6d2fB3d44F5B4cb7E7f4Ac47c2c742',
  }),
  LINK_USD: pickByMode({
    testnet: '0x90c069C4538adAc136......................', // TODO: incomplete address
    mainnet: '0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8',
  }),
};

/* ======================= NGN ORACLE (NGN/USD) ======================= */

const NGN_ORACLE = {
  base: pickByMode({
    testnet: '0x6b51afD271bB46C8Ff068beAa511Fee5756Fcc66',
    mainnet: '0xf0Ed0652d5150606a84C7EF9726d9585478532Bc',
  }),
  bnb: pickByMode({
    testnet: '0x3Ad5c68BF82bB402F81379124DCf513015CAafF1',
    mainnet: '0x97F0BCA29304E39936dbf4C58b887DEAE5D9A75B',
  }),
};

/* ======================= TOKENS ======================= */

const TOKEN_ON_BASE = {
  NGNS: pickByMode({
    testnet: '0x4e6A3bfa5c54f5b79274C73c8128d1f1c3651321',
    mainnet: '0x79d61b73Ec980638ea4Efef7C5637aE37f596c6f',
  }),
  CNGN: pickByMode({
    testnet: '0xe2387F04d3858e7Cb64Ef5Ed6617f9B2fcEEAfa2',
    mainnet: '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F',
  }),
  USDT: pickByMode({
    testnet: '0x42cb35c315665b62b4A6970C7c6030243B808111',
    mainnet: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  }),
  USDC: pickByMode({
    testnet: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    mainnet: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  }),
  SANT: pickByMode({
    testnet: '0x49A82950Ed399B14B8e501B5Cf9D972408d305a3',
    mainnet: '0x8Df64281411d8E4E2B2C0200Ec5a1A694de5104C',
  }),
  LINK: pickByMode({
    testnet: '0x88Fb150BDc53A65fe9....................', // TODO: incomplete address
    mainnet: '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',
  }),
};

const TOKEN_ON_BNB = {
  NGNS: pickByMode({
    testnet: '0x4A9D58566A5F778e090c78258f0C54189a1095Ae',
    mainnet: '0x80C2436b19BD1fbCc5c35375D5d5Ff1FB28Ae323',
  }),
  CNGN: pickByMode({
    testnet: '0x8a078b182bA9649c03982c2a80CDcc81cdc99dA8',
    mainnet: '0xa8AEA66B361a8d53e8865c62D142167Af28Af058',
  }),
  USDT: pickByMode({
    testnet: '0x07437dC615BC4295BA9E658a2B30915ea220bC65',
    mainnet: '0x55d398326f99059fF775485246999027B3197955',
  }),
  USDC: pickByMode({
    testnet: '0xb07B89CF7495306D418131123b04a9A616616228',
    mainnet: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  }),
  LINK: pickByMode({
    testnet: '0xF8A0BF9cF54Bb92F173................', // TODO: incomplete address
    mainnet: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
  }),
};

/* ======================= MULTISEND ======================= */

const MULTISEND = {
  base: pickByMode({
    testnet: '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425',
    mainnet: '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3',
  }),
  bnb: pickByMode({
    testnet: '0x5270A710B4df2ecB457Be1aCA29fbD6C34435eb6',
    mainnet: '0x63bF68FE0280799E43009eb66D7a1E4248082E14',
  }),
};

/* ======================= MULTISIG ======================= */

const MULTISIG = {
  base: pickByMode({
    testnet: '0x7Fe2bB5D44bFE124A7eDbE507035246e6327CB3A',
    mainnet: '0xBCdE35307e897625E39915B200Be0A0a17088Da6',
  }),
  bnb: pickByMode({
    testnet: '0x8f574842E7CC0277E9256418C46A90e3398d4005',
    mainnet: '0xa2B37292A360EF2E19f0ff465142752aaDFd5556',
  }),
};

/* ======================= POOL FACTORY ======================= */

const POOL_FACTORY = {
  base: pickByMode({
    testnet: '0x2b9Bb8e60f63B886545f9C6F14a697b9C6eE45a9',
    mainnet: '0x805658D6520d53ECEe0E2DA8a95Df3E55213F0fA',
  }),
  bnb: pickByMode({
    testnet: '0xd2611e3acE93303052478af5EE5d13e2E9c63C7A',
    mainnet: '0x27BfB5f2da83c25909f272d30725D85ECC0B5920',
  }),
};

/* ======================= SAFE CONTRACTS ======================= */

const SAFE_CONTRACT = {
  salvaSingleton: pickByMode({
    testnet: '0xdc9711f3E85c11f35735AAE148B969e6cE5F3b9D',
    mainnet: '0x6b51afD271bB46C.........................', // TODO: incomplete address
  }),
  l1Singleton: sameInAllModes('0x41675c099f32341bf84bfc5382af534df5c7461a'),
  l2Singleton: sameInAllModes('0x29fcb43b46531bca003ddc8fcb67ffe91900c762'),
  proxyFactory: sameInAllModes('0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67'),
  fallbackHandler: '0xfd0732dc9e303f09fcef3a7388ad10a83459ec99',
};

/* ======================= CONFIG (keys unchanged) ======================= */

const obj = {
  sponsorKey: process.env.MANAGER_PRIVATE_KEY,

  baseMultisend: MULTISEND.base,
  bnbMultisend: MULTISEND.bnb,

  baseRpcUrl: RPC_URL.base,
  bnbRpcUrl: RPC_URL.bnb,

  // Chainlink price feeds on Base
  chainlinkBaseFeed: CHAINLINK_FEED_ON_BASE.ETH_USD,
  chainlinkUsdtBaseFeed: CHAINLINK_FEED_ON_BASE.USDT_USD,
  chainlinkUsdcBaseFeed: CHAINLINK_FEED_ON_BASE.USDC_USD,
  chainlinkLinkBaseFeed: CHAINLINK_FEED_ON_BASE.LINK_USD,

  // Chainlink price feeds on BNB
  chainlinkBnbFeed: CHAINLINK_FEED_ON_BNB.BNB_USD,
  chainlinkUsdtBnbFeed: CHAINLINK_FEED_ON_BNB.USDT_USD,
  chainlinkUsdcBnbFeed: CHAINLINK_FEED_ON_BNB.USDC_USD,
  chainlinkLinkBnbFeed: CHAINLINK_FEED_ON_BNB.LINK_USD,

  // Base tokens
  ngnsBaseAddress: TOKEN_ON_BASE.NGNS,
  cngnBaseAddress: TOKEN_ON_BASE.CNGN,
  usdtBaseAddress: TOKEN_ON_BASE.USDT,
  usdcBaseAddress: TOKEN_ON_BASE.USDC,
  santAddress: TOKEN_ON_BASE.SANT,
  linkBaseAddress: TOKEN_ON_BASE.LINK,

  // BNB tokens
  ngnsBnbAddress: TOKEN_ON_BNB.NGNS,
  cngnBnbAddress: TOKEN_ON_BNB.CNGN,
  usdtBnbAddress: TOKEN_ON_BNB.USDT,
  usdcBnbAddress: TOKEN_ON_BNB.USDC,
  linkBnbAddress: TOKEN_ON_BNB.LINK,

  // Multisig
  multisigBase: MULTISIG.base,
  multisigBnb: MULTISIG.bnb,

  // Pool factory
  basePoolFactory: POOL_FACTORY.base,
  bnbPoolFactory: POOL_FACTORY.bnb,

  // NGN oracle
  ngnOracleBase: NGN_ORACLE.base,
  ngnOracleBnb: NGN_ORACLE.bnb,

  treasury: process.env.TREASURY_CONTRACT_ADDRESS,
  maxUint256: ethers.MaxUint256.toString(),
  dummySafe: process.env.DUMMY_SAFE,
  dummyKey: process.env.DUMMY_KEY,
  maxAgeMs: 2 * 60 * 60 * 1000,

  // Safe
  singleton: SAFE_CONTRACT.salvaSingleton,
  safeL1Singleton: SAFE_CONTRACT.l1Singleton,
  safeL2Singleton: SAFE_CONTRACT.l2Singleton,
  safeFactory: SAFE_CONTRACT.proxyFactory,
  fallbackHandler: SAFE_CONTRACT.fallbackHandler,
  DEPLOYMENT_SALT_MESSAGE: 'NEW_SALVA_SAFE_DEPLOYMENT',
};

const keyValue = (key) => {
  return obj[key];
};

function setup(ownerEOA) {
  const setupIface = new ethers.Interface(SAFE_SETUP);
  return setupIface.encodeFunctionData('setup', [
    [ownerEOA],
    1,
    ethers.ZeroAddress,
    '0x',
    keyValue('fallbackHandler'),
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);
}

export { keyValue, mode, setup };
