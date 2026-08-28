import express from 'express';
import { ethers } from 'ethers';
import { ERC20 } from '../utils/abi.js';
import { User } from '../models/Users.js';
import StatsSnapshot from '../models/StatsSnapshot.js';

const router = express.Router();
const mode = process.env.NODE_ENV;
const baseRpcUrl =
  mode === 'development'
    ? process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const bnbRpcUrl =
  mode === 'development'
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;

const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;

const ngnsBnbAddress = process.env.BSC_NGN_TOKEN_ADDRESS;
const cngnBnbAddress = process.env.BSC_CNGN_CONTRACT_ADDRESS;
const usdtBnbAddress = process.env.BSC_USDT_CONTRACT_ADDRESS;
const usdcBnbAddress = process.env.BSC_USDC_CONTRACT_ADDRESS;
const treasury = process.env.TREASURY_CONTRACT_ADDRESS;
const Provider = (rpc) => {
  return new ethers.JsonRpcProvider(rpc);
};

router.get('/stats', async (req, res) => {
  try {
    const users = await User.find({
      pinSetupCompleted: true,
    });

    // NGNS

    console.log(ngnsBaseAddress, cngnBaseAddress, usdtBaseAddress, usdcBaseAddress);
    console.log(ngnsBnbAddress, cngnBnbAddress, cngnBnbAddress, usdcBnbAddress);
    const ngnsBase = new ethers.Contract(ngnsBaseAddress, ERC20, Provider(baseRpcUrl));
    const ngnsBnb = new ethers.Contract(ngnsBnbAddress, ERC20, Provider(bnbRpcUrl));

    // CNGN
    const cngnBase = new ethers.Contract(cngnBaseAddress, ERC20, Provider(baseRpcUrl));
    const cngnBnb = new ethers.Contract(cngnBnbAddress, ERC20, Provider(bnbRpcUrl));

    //USDT
    const usdtBase = new ethers.Contract(usdtBaseAddress, ERC20, Provider(baseRpcUrl));
    const usdtBnb = new ethers.Contract(usdtBnbAddress, ERC20, Provider(bnbRpcUrl));

    // USC
    const usdcBase = new ethers.Contract(usdcBaseAddress, ERC20, Provider(baseRpcUrl));
    const usdcBnb = new ethers.Contract(usdcBnbAddress, ERC20, Provider(bnbRpcUrl));

    const ngnsBaseTs = await ngnsBase.totalSupply();
    const ngnsBnbTs = await ngnsBase.totalSupply();

    const usdtBaseDec = await usdtBase.decimals();
    const usdtBnbDec = await usdtBnb.decimals();
    const usdcBaseDec = await usdcBase.decimals();
    const usdcBnbDec = await usdcBase.decimals();

    //NGNS
    const treasuryBaseNgnsBalance = await ngnsBase.balanceOf(treasury);
    const treasuryBnbNgnsBalance = await ngnsBnb.balanceOf(treasury);
    const tBaseNgnsFormat = ethers.formatUnits(treasuryBaseNgnsBalance.toString(), 6);
    const tBnbNgnsFormat = ethers.formatUnits(treasuryBnbNgnsBalance.toString(), 6);

    // CNGN
    const treasuryBaseCngnBalance = await cngnBase.balanceOf(treasury);
    const treasuryBnbCngnBalance = await cngnBnb.balanceOf(treasury);
    const tBaseCngnFormat = ethers.formatUnits(treasuryBaseCngnBalance.toString(), 6);
    const tBnbCngnFormat = ethers.formatUnits(treasuryBnbCngnBalance.toString(), 6);

    // USDT
    const treasuryBaseUsdtBalance = await usdtBase.balanceOf(treasury);
    const treasuryBnbUsdtBalance = await usdtBnb.balanceOf(treasury);
    const tBaseUsdtFormat = ethers.formatUnits(
      treasuryBaseUsdtBalance.toString(),
      Number(usdtBaseDec)
    );
    const tBnbUsdtFormat = ethers.formatUnits(
      treasuryBnbUsdtBalance.toString(),
      Number(usdtBnbDec)
    );

    // USDC
    const treasuryBaseUsdcBalance = await usdcBase.balanceOf(treasury);
    const treasuryBnbUsdcBalance = await usdcBnb.balanceOf(treasury);
    const tBaseUsdcFormat = ethers.formatUnits(
      treasuryBaseUsdcBalance.toString(),
      Number(usdcBaseDec)
    );
    const tBnbUsdcFormat = ethers.formatUnits(
      treasuryBnbUsdcBalance.toString(),
      Number(usdcBnbDec)
    );

    let stats = await StatsSnapshot.findOne({
      network: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    if (!stats) {
      stats = await StatsSnapshot.create({
        network: mode === 'development' ? 'TESTNET' : 'MAINNET',
        userCount: users.length,
        ngnsCirculating:
          Number(ethers.formatUnits(ngnsBaseTs.toString(), 6)) +
          Number(ethers.formatUnits(ngnsBnbTs.toString(), 6)),
        treasuryNGN:
          Number(tBaseNgnsFormat) +
          Number(tBnbNgnsFormat) +
          Number(tBaseCngnFormat) +
          Number(tBnbCngnFormat),
        treasuryUSD:
          Number(tBaseUsdtFormat) +
          Number(tBnbUsdtFormat) +
          Number(tBaseUsdcFormat) +
          Number(tBnbUsdcFormat),
      });
    } else {
      await stats.updateOne({
        userCount: users.length,
        ngnsCirculating:
          Number(ethers.formatUnits(ngnsBaseTs.toString(), 6)) +
          Number(ethers.formatUnits(ngnsBnbTs.toString(), 6)),
        treasuryNGN:
          Number(tBaseNgnsFormat) +
          Number(tBnbNgnsFormat) +
          Number(tBaseCngnFormat) +
          Number(tBnbCngnFormat),
        treasuryUSD:
          Number(tBaseUsdtFormat) +
          Number(tBnbUsdtFormat) +
          Number(tBaseUsdcFormat) +
          Number(tBnbUsdcFormat),
      });
    }
    res.status(200).json({
      status: true,
      data: {
        usersCount: stats.userCount,
        ngnsCirculating: stats.ngnsCirculating,
        treasuryNGN: stats.treasuryNGN,
        treasuryUSD: stats.treasuryUSD,
      },
    });
  } catch (err) {
    console.log(`Stats Fetch and update Failed: ${err.message}`);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
