import { CdpPositionManager } from '../models/CDP.js';

await CdpPositionManager.create({
  version: 'pm-v1',
  contractAddress: '0x3A31390f448C6D4025eeeAD014b5164Df399C6a9',
  whitelistedTokens: [
    {
      symbol: 'USDC',
      tokenAddress: '0xb07B89CF7495306D418131123b04a9A616616228',
      priceFeed: '0x90c069C4538adAc136E051052E14c1cD799C41B7',
      logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      symbol: 'BNB',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      priceFeed: '0x2514895c72f50D8bd4B4F9b1110F0D6bD2c97526',
      logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
    },
  ],
  chain: 'bsc',
  type: 'TESTNET',
});

console.log('done');
process.exit(0);
