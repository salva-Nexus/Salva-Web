import express from 'express';
import { ethers } from 'ethers';
import { keyValue, mode } from '../utils/vars.js';
import { NGN_ORACLE } from '../utils/abi.js';
import { getRpcUrlByChain, getNgnOracleAddressByChain } from '../utils/rpcUrls.js';
import { fetchRateEx, fetchRateFrank } from '../utils/fetchRate.js';
import { UserCdpPosition, UpdateControl } from '../models/CDP.js';
import { sendAlertToUser } from '../services/notificationServices.js';
import { userPositionHealth } from '../services/cdpService.js';

const router = express.Router();

const CHAINS = ['base', 'bsc'];
const STALE_THRESHOLD = 2 * 3600 + 45 * 60; // 2 hours 45 minutes in seconds
const HEALTH_VIEW_ABI = [
  'function userPositionHealth(address user, address token, uint256 debtAmount) view returns (uint256)',
];

async function checkAndAutoUpdateOracle(chain) {
  let oracleUpdated = false;
  try {
    const oracleAddress = getNgnOracleAddressByChain(chain);
    const rpcUrl = getRpcUrlByChain(chain);
    if (!oracleAddress || !rpcUrl) return { chain, updated: false, reason: 'Config missing' };

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const sponsorWallet = new ethers.Wallet(keyValue('sponsorKey'), provider);
    const oracleContract = new ethers.Contract(oracleAddress, NGN_ORACLE, sponsorWallet);

    // 1. Fetch current on-chain oracle price & timestamp
    const [rawPrice, updatedAt] = await oracleContract.getUsdPricePerNgn();
    const decimals = await oracleContract.decimals();
    const currentOnChainUsdPerNgn = Number(ethers.formatUnits(rawPrice, Number(decimals)));

    // Flip on-chain price to get 1 USD in NGN for comparison
    const onChainNgnPerUsd = currentOnChainUsdPerNgn;
    // 2. Fetch new external rate (1 USD to NGN)
    let rateResult = await fetchRateFrank();
    if (!rateResult.status) {
      rateResult = await fetchRateEx();
    }
    if (!rateResult.status || typeof rateResult.data !== 'number') {
      return { chain, updated: false, reason: 'External rate fetch failed' };
    }
    const externalNgnPerUsd = rateResult.data;

    // 3. Check conditions: Deviation > 1% OR Stale >= 2 hours 45 mins
    const now = Math.floor(Date.now() / 1000);
    const timeElapsed = now - Number(updatedAt);
    const isStale = timeElapsed >= STALE_THRESHOLD;
    const pd_ = onChainNgnPerUsd + (onChainNgnPerUsd * 1) / 100; // >1 percent of stored rate
    const _pd = onChainNgnPerUsd - (onChainNgnPerUsd * 1) / 100; // <1 percent of stored rate
    const hasSignificantDeviation = externalNgnPerUsd >= pd_ || externalNgnPerUsd <= _pd;

    if (isStale || hasSignificantDeviation) {
      const scaledPrice = ethers.parseEther(externalNgnPerUsd.toFixed(18));

      console.log(`🔄 Updating NGN Oracle on ${chain}`);

      const tx = await oracleContract.updatePrice(scaledPrice);
      await tx.wait();
      oracleUpdated = true;
      await new Promise((r) => setTimeout(r, 3000));
      const usersPosition = await UserCdpPosition.find({
        chain: chain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });

      for (const userPosition of usersPosition) {
        const pm = userPosition.positionManagerAddress;
        const user = userPosition.userSafeAddress;
        const cToken = userPosition.collateralAddress;
        const pmContract = new ethers.Contract(pm, HEALTH_VIEW_ABI, provider);
        let healthBps;
        try {
          healthBps = await pmContract.userPositionHealth(user, cToken, 0n);
        } catch {
          healthBps = await userPositionHealth(
            user,
            userPosition.collateralSymbol,
            0n,
            chain,
            userPosition.version
          );
        }
        const health = Number(healthBps) / 100;
        console.log(`User: ${user}`);
        console.log(`Collateral Token: ${userPosition.collateralSymbol}`);
        console.log(`Health: ${health}%`);
        if (health < 150) {
          await sendAlertToUser(
            user,
            `🟡 ~ Health at ${health}% for ${userPosition.collateralSymbol} Collateral`
          );
          return { chain, updated: true, newRate: externalNgnPerUsd };
        }
        if (health < 125) {
          await sendAlertToUser(
            user,
            `⚠️ ~ Warning: Health at ${health}% for ${userPosition.collateralSymbol} Collateral`
          );
          return { chain, updated: true, newRate: externalNgnPerUsd };
        }
        if (health <= 116) {
          await sendAlertToUser(
            user,
            `❌ ~ Risk: Health at ${health}% for ${userPosition.collateralSymbol} Collateral`
          );
          return { chain, updated: true, newRate: externalNgnPerUsd };
        }
      }

      return { chain, updated: true, newRate: externalNgnPerUsd };
    }

    return { chain, updated: false, reason: 'Within deviation and freshness threshold' };
  } catch (err) {
    console.error(`❌ Oracle auto-update error on ${chain}:`, err.message);
    return { chain, updated: oracleUpdated, error: err.message };
  }
}

// Polling endpoint triggered by server keep-alive sor cron
const NGN_ORACLE_KEY = 'ngn-oracle-update'; // must match the key used by the admin panel

router.get('/poll-update-ngn', async (req, res) => {
  try {
    const control = await UpdateControl.findOne({ key: NGN_ORACLE_KEY }).lean();
    if (control?.paused) {
      console.log('Skipped Update');
      return res.json({ status: 'paused' });
    }
  } catch (err) {
    // If the pause check itself fails, keep the oracle running rather than stall prices.
    console.error('⚓ Oracle pause check failed, continuing:', err.message);
  }

  const results = [];
  for (const chain of CHAINS) {
    const data = await checkAndAutoUpdateOracle(chain);
    results.push(data.updated);
  }
  return res.json({ status: results });
});

export default router;
