import express from 'express';
import { ethers } from 'ethers';
import { ERC20 } from '../utils/abi.js';
import { User } from '../models/Users.js';
import StatsSnapshot from '../models/StatsSnapshot.js';
import { keyValue, mode } from '../utils/vars.js';

const router = express.Router();

const getProvider = (rpc) => new ethers.JsonRpcProvider(rpc);

router.get('/stats', async (req, res) => {
  try {
    const baseRpcUrl = keyValue('baseRpcUrl');
    const bnbRpcUrl = keyValue('bnbRpcUrl');
    const treasury = keyValue('treasury');

    const ngnsBaseAddress = keyValue('ngnsBaseAddress');
    const cngnBaseAddress = keyValue('cngnBaseAddress');
    const usdtBaseAddress = keyValue('usdtBaseAddress');
    const usdcBaseAddress = keyValue('usdcBaseAddress');

    const ngnsBnbAddress = keyValue('ngnsBnbAddress');
    const cngnBnbAddress = keyValue('cngnBnbAddress');
    const usdtBnbAddress = keyValue('usdtBnbAddress');
    const usdcBnbAddress = keyValue('usdcBnbAddress');

    if (
      !ngnsBaseAddress ||
      !cngnBaseAddress ||
      !usdtBaseAddress ||
      !usdcBaseAddress ||
      !ngnsBnbAddress ||
      !cngnBnbAddress ||
      !usdtBnbAddress ||
      !usdcBnbAddress ||
      !treasury
    ) {
      throw new Error('Missing target contract addresses or treasury configuration');
    }

    const baseProvider = getProvider(baseRpcUrl);
    const bnbProvider = getProvider(bnbRpcUrl);

    // NGNS
    const ngnsBase = new ethers.Contract(ngnsBaseAddress, ERC20, baseProvider);
    const ngnsBnb = new ethers.Contract(ngnsBnbAddress, ERC20, bnbProvider);

    // CNGN
    const cngnBase = new ethers.Contract(cngnBaseAddress, ERC20, baseProvider);
    const cngnBnb = new ethers.Contract(cngnBnbAddress, ERC20, bnbProvider);

    // USDT
    const usdtBase = new ethers.Contract(usdtBaseAddress, ERC20, baseProvider);
    const usdtBnb = new ethers.Contract(usdtBnbAddress, ERC20, bnbProvider);

    // USDC
    const usdcBase = new ethers.Contract(usdcBaseAddress, ERC20, baseProvider);
    const usdcBnb = new ethers.Contract(usdcBnbAddress, ERC20, bnbProvider);

    const [
      users,
      ngnsBaseTs,
      ngnsBnbTs,
      usdtBaseDec,
      usdtBnbDec,
      usdcBaseDec,
      usdcBnbDec,
      treasuryBaseNgnsBalance,
      treasuryBnbNgnsBalance,
      treasuryBaseCngnBalance,
      treasuryBnbCngnBalance,
      treasuryBaseUsdtBalance,
      treasuryBnbUsdtBalance,
      treasuryBaseUsdcBalance,
      treasuryBnbUsdcBalance,
    ] = await Promise.all([
      User.find({ pinSetupCompleted: true }),
      ngnsBase.totalSupply(),
      ngnsBnb.totalSupply(),
      usdtBase.decimals(),
      usdtBnb.decimals(),
      usdcBase.decimals(),
      usdcBnb.decimals(),
      ngnsBase.balanceOf(treasury),
      ngnsBnb.balanceOf(treasury),
      cngnBase.balanceOf(treasury),
      cngnBnb.balanceOf(treasury),
      usdtBase.balanceOf(treasury),
      usdtBnb.balanceOf(treasury),
      usdcBase.balanceOf(treasury),
      usdcBnb.balanceOf(treasury),
    ]);

    const tBaseNgnsFormat = ethers.formatUnits(treasuryBaseNgnsBalance, 6);
    const tBnbNgnsFormat = ethers.formatUnits(treasuryBnbNgnsBalance, 6);

    const tBaseCngnFormat = ethers.formatUnits(treasuryBaseCngnBalance, 6);
    const tBnbCngnFormat = ethers.formatUnits(treasuryBnbCngnBalance, 6);

    const tBaseUsdtFormat = ethers.formatUnits(treasuryBaseUsdtBalance, Number(usdtBaseDec));
    const tBnbUsdtFormat = ethers.formatUnits(treasuryBnbUsdtBalance, Number(usdtBnbDec));

    const tBaseUsdcFormat = ethers.formatUnits(treasuryBaseUsdcBalance, Number(usdcBaseDec));
    const tBnbUsdcFormat = ethers.formatUnits(treasuryBnbUsdcBalance, Number(usdcBnbDec));

    const currentNetwork = mode === 'development' ? 'TESTNET' : 'MAINNET';
    const computedUserCount = users.length;
    const computedNgnsCirculating =
      Number(ethers.formatUnits(ngnsBaseTs, 6)) + Number(ethers.formatUnits(ngnsBnbTs, 6));
    const computedTreasuryNGN =
      Number(tBaseNgnsFormat) +
      Number(tBnbNgnsFormat) +
      Number(tBaseCngnFormat) +
      Number(tBnbCngnFormat);
    const computedTreasuryUSD =
      Number(tBaseUsdtFormat) +
      Number(tBnbUsdtFormat) +
      Number(tBaseUsdcFormat) +
      Number(tBnbUsdcFormat);

    const stats = await StatsSnapshot.findOneAndUpdate(
      { network: currentNetwork },
      {
        userCount: computedUserCount,
        ngnsCirculating: computedNgnsCirculating,
        treasuryNGN: computedTreasuryNGN,
        treasuryUSD: computedTreasuryUSD,
      },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      status: true,
      data: {
        usersCount: stats.userCount,
        ngnsCirculating: stats.ngnsCirculating,
        treasuryNGN: stats.treasuryNGN,
        treasuryUSD: stats.treasuryUSD,
      },
    });
  } catch (err) {
    console.error(`Stats Fetch and update Failed: ${err.message}`);
    return res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
