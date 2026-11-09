import { ethers } from 'ethers';
import { SAFE_SETUP } from '../utils/abi.js';
const mode = process.env.NODE_ENV;

const obj = {
  sponsorKey: process.env.MANAGER_PRIVATE_KEY,
  baseMultisend:
    mode === 'development'
      ? '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425'
      : '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3',
  bnbMultisend:
    mode === 'development'
      ? '0x5270A710B4df2ecB457Be1aCA29fbD6C34435eb6'
      : '0x63bF68FE0280799E43009eb66D7a1E4248082E14',
  baseRpcUrl:
    mode === 'development' ? process.env.BASE_SEPOLIA_RPC_URL : process.env.BASE_MAINNET_RPC_URL,
  bnbRpcUrl:
    mode === 'development' ? process.env.BNB_TESTNET_RPC_URL : process.env.BNB_MAINNET_RPC_URL,

  // Chainlink USDT Price Feed Oracles BASE
  chainlinkBaseFeed:
    mode === 'development'
      ? '0x4aDC67696bA383F43DD60A9e78F2C97Fbbfc7cb1'
      : '0x50015f8b17fb2C290Dde41fDc246ed0dcEE93a8b',
  chainlinkUsdtBaseFeed:
    mode === 'development'
      ? '0x3ec8593F930EA45ea58c968260e6e9FF53FC934f'
      : '0xE6c6bf78308C46bad5Cae5D0ed44b36370b4B00d',
  chainlinkUsdcBaseFeed:
    mode === 'development'
      ? '0xd30e2101a97dcbAeBCBC04F14C3f624E67A35165'
      : '0xd0Dc8c910565D94D408729D16bE5467B5d7633Ad',
  chainlinkLinkBaseFeed:
    mode === 'development'
      ? '0x90c069C4538adAc136......................'
      : '0x17CAb8FE31E32f08326e5E27412894e49B0f9D65',

  // Chainlink USDC Price Feed Oracles BNB
  chainlinkBnbFeed:
    mode === 'development'
      ? '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526'
      : '0xd5D290Fe2ae6b55F385ab9C14d2CeB91DD3d9022',
  chainlinkUsdtBnbFeed:
    mode === 'development'
      ? '0xEca2605f0BCF2BA5966372C99837b1F182d3D620'
      : '0x501e21126486424567f40D490856094D72986E41',

  chainlinkUsdcBnbFeed:
    mode === 'development'
      ? '0x90c069C4538adAc136E051052E14c1cD799C41B7'
      : '0x8068600c8f6d2fB3d44F5B4cb7E7f4Ac47c2c742',
  chainlinkLinkBnbFeed:
    mode === 'development'
      ? '0x90c069C4538adAc136......................'
      : '0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8',

  // Base Tokens
  ngnsBaseAddress:
    mode === 'development'
      ? '0x4e6A3bfa5c54f5b79274C73c8128d1f1c3651321'
      : '0x79d61b73Ec980638ea4Efef7C5637aE37f596c6f',
  cngnBaseAddress:
    mode === 'development'
      ? '0xe2387F04d3858e7Cb64Ef5Ed6617f9B2fcEEAfa2'
      : '0x46C85152bFe9f96829aA94755D9f915F9B10EF5F',
  usdtBaseAddress:
    mode === 'development'
      ? '0x42cb35c315665b62b4A6970C7c6030243B808111'
      : '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  usdcBaseAddress:
    mode === 'development'
      ? '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
      : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  santAddress:
    mode === 'development'
      ? '0x49A82950Ed399B14B8e501B5Cf9D972408d305a3'
      : '0x8Df64281411d8E4E2B2C0200Ec5a1A694de5104C',
  linkBaseAddress:
    mode === 'development'
      ? '0x88Fb150BDc53A65fe9....................'
      : '0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196',

  // BNB Tokens
  ngnsBnbAddress:
    mode === 'development'
      ? '0x4A9D58566A5F778e090c78258f0C54189a1095Ae'
      : '0x80C2436b19BD1fbCc5c35375D5d5Ff1FB28Ae323',
  cngnBnbAddress:
    mode === 'development'
      ? '0x8a078b182bA9649c03982c2a80CDcc81cdc99dA8'
      : '0xa8AEA66B361a8d53e8865c62D142167Af28Af058',
  usdtBnbAddress:
    mode === 'development'
      ? '0x07437dC615BC4295BA9E658a2B30915ea220bC65'
      : '0x55d398326f99059fF775485246999027B3197955',
  usdcBnbAddress:
    mode === 'development'
      ? '0xb07B89CF7495306D418131123b04a9A616616228'
      : '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  linkBnbAddress:
    mode === 'development'
      ? '0xF8A0BF9cF54Bb92F173................'
      : '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',

  // MULTISIG
  multisigBase:
    mode === 'development'
      ? '0x7Fe2bB5D44bFE124A7eDbE507035246e6327CB3A'
      : '0xBCdE35307e897625E39915B200Be0A0a17088Da6',
  multisigBnb:
    mode === 'development'
      ? '0x8f574842E7CC0277E9256418C46A90e3398d4005'
      : '0xa2B37292A360EF2E19f0ff465142752aaDFd5556',

  // POOL FACTORY
  basePoolFactory:
    mode === 'development'
      ? '0x2b9Bb8e60f63B886545f9C6F14a697b9C6eE45a9'
      : '0xAfAFa714893B76026D8cDa8b32fC665CFB2E5D67',
  bnbPoolFactory:
    mode === 'development'
      ? '0xd2611e3acE93303052478af5EE5d13e2E9c63C7A'
      : '0xcEcc21518489113B7fa5b8CE463330cf372BF9fF',

  // NGN ORACLE
  ngnOracleBase:
    mode === 'development'
      ? '0x6b51afD271bB46C8Ff068beAa511Fee5756Fcc66'
      : '0xf0Ed0652d5150606a84C7EF9726d9585478532Bc',
  ngnOracleBnb:
    mode === 'development'
      ? '0x3Ad5c68BF82bB402F81379124DCf513015CAafF1'
      : '0x97F0BCA29304E39936dbf4C58b887DEAE5D9A75B',

  treasury: process.env.TREASURY_CONTRACT_ADDRESS,
  maxUint256: '115792089237316195423570985008687907853269984665640564039457584007913129639935',
  dummySafe: process.env.DUMMY_SAFE,
  dummyKey: process.env.DUMMY_KEY,
  maxAgeMs: 2 * 60 * 60 * 1000,
  singleton:
    mode === 'development'
      ? '0xdc9711f3E85c11f35735AAE148B969e6cE5F3b9D'
      : '0x6b51afD271bB46C.........................',
  safeL1Singleton:
    mode === 'development'
      ? '0x41675c099f32341bf84bfc5382af534df5c7461a'
      : '0x41675c099f32341bf84bfc5382af534df5c7461a',
  safeL2Singleton:
    mode === 'development'
      ? '0x29fcb43b46531bca003ddc8fcb67ffe91900c762'
      : '0x29fcb43b46531bca003ddc8fcb67ffe91900c762',
  safeFactory:
    mode === 'development'
      ? '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67'
      : '0x4e1dcf7ad4e460cfd30791ccc4f9c8a4f820ec67',
  fallbackHandler: '0xfd0732dc9e303f09fcef3a7388ad10a83459ec99',
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
