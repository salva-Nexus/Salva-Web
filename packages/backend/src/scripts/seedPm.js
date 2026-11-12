import { CdpPositionManager } from '../models/CDP.js';

await CdpPositionManager.create({
  version: 'pm-v1',
  contractAddress: '0x1638056996B3e902f4888380C1c83f2362153B6E',
  whitelistedTokens: [
    {
      symbol: 'USDT',
      tokenAddress: '0x55d398326f99059fF775485246999027B3197955',
      priceFeed: '0x501e21126486424567f40D490856094D72986E41',
      logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xdAC17F958D2ee523a2206206994597C13D831ec7/logo.png',
    },
    {
      symbol: 'USDC',
      tokenAddress: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
      priceFeed: '0x8068600c8f6d2fB3d44F5B4cb7E7f4Ac47c2c742',
      logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48/logo.png',
    },
    {
      symbol: 'BNB',
      tokenAddress: '0x0000000000000000000000000000000000000000',
      priceFeed: '0xd5D290Fe2ae6b55F385ab9C14d2CeB91DD3d9022',
      logo: 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/binance/info/logo.png',
    },
  ],
  chain: 'bnb',
  type: 'MAINNET',
});

console.log('done');
process.exit(0);
