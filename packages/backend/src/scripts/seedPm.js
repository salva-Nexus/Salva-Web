import { CdpPositionManager } from '../models/CDP.js';

await CdpPositionManager.create({
  version: 'pm-v1',
  contractAddress: '0xe698C6D97F722993a7cf4830289ABA9dfe85EDB9', // BNB 0x1638056996B3e902f4888380C1c83f2362153B6E
  whitelistedTokens: [
    {
      symbol: 'USDT',
      tokenAddress: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
      priceFeed: '0xE6c6bf78308C46bad5Cae5D0ed44b36370b4B00d',
    },
    {
      symbol: 'USDC',
      tokenAddress: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      priceFeed: '0xd0Dc8c910565D94D408729D16bE5467B5d7633Ad',
    },
    {
      symbol: 'ETH',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      priceFeed: '0x50015f8b17fb2C290Dde41fDc246ed0dcEE93a8b',
    },
  ],
  chain: 'base',
  type: 'MAINNET',
});

console.log('done');
process.exit(0);
