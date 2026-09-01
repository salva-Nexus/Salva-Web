import express from 'express';
import { ethers } from 'ethers';
import { POOL_IFACE, SAFE } from '../utils/abi.js';
import {
  deployPool,
  poolNameService,
  poolSubscription,
  add_RemoveLiq,
  updateRate,
  updatePauseState,
  _getFeeAndToken,
} from '../services/poolServices.js';

import { estimateUpdateRateFee, estimateUpdatePauseStateFee } from '../services/estimateFee.js';

import { basePool, bnbPool, trustedBasePool, trustedBnbPool } from '../models/Pool.js';

import { basePoolSubscription, bnbPoolSubscription } from '../models/PoolSubscription.js';

import { User } from '../models/Users.js';
import { balance } from '../services/balanceServices.js';
import { keyValue } from '../utils/vars.js';

const router = express.Router();

const provider = (chain) => {
  const baseRpcUrl = keyValue('baseRpcUrl');
  const bnbRpcUrl = keyValue('bnbRpcUrl');
  return chain === 'base'
    ? new ethers.JsonRpcProvider(baseRpcUrl)
    : new ethers.JsonRpcProvider(bnbRpcUrl);
};

router.post('/deploy', async (req, res) => {
  const { email, pkey, chain } = req.body;
  try {
    const deployData = await deployPool(email, pkey, chain);
    if (deployData?.status) {
      return res.status(200).json({
        status: true,
        poolAddress: deployData.poolAddress,
      });
    }
    return res.status(200).json({ status: false });
  } catch (err) {
    console.error(`Pool Deployment failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/nameAlias', async (req, res) => {
  const { email, pkey, name, poolAddress, registry, type, chain } = req.body;
  try {
    const nameData = await poolNameService(email, pkey, name, poolAddress, registry, type, chain);
    if (nameData?.status) {
      return res.status(200).json({
        status: true,
        poolName: nameData.name,
      });
    }
    return res.status(200).json({ status: false });
  } catch (err) {
    console.error(`Link failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/all-pools/:chain', async (req, res) => {
  const { chain } = req.params;
  try {
    const subPools =
      chain === 'base'
        ? await basePoolSubscription.find({ active: true })
        : await bnbPoolSubscription.find({ active: true });

    const nonExpSubPools = subPools.filter((sp) => new Date(sp.expiresAt).getTime() > Date.now());

    const pools = [];
    for (const nsp of nonExpSubPools) {
      const pool =
        chain === 'base'
          ? await basePool.findOne({ poolAddress: nsp.poolAddress })
          : await bnbPool.findOne({ poolAddress: nsp.poolAddress });

      if (!pool) continue;

      const balances = await balance(pool.poolAddress, chain);
      const hasBalance =
        balances?.data &&
        (balances.data.ngnsBalance > 0 ||
          balances.data.cNgnBalance > 0 ||
          balances.data.usdtBalance > 0 ||
          balances.data.usdcBalance > 0);

      if (hasBalance) {
        const poolContract = new ethers.Contract(pool.poolAddress, POOL_IFACE, provider(chain));
        const [buyRate, sellRate] = await Promise.all([
          poolContract._getBuyRate(),
          poolContract._getSellRate(),
        ]);

        if (buyRate > 0n || sellRate > 0n) {
          const isPaused = await poolContract.isPaused();
          if (!isPaused) {
            pools.push(pool);
          }
        }
      }
    }

    return res.status(200).json({
      status: true,
      pools: pools,
    });
  } catch (err) {
    console.error(`❌ Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/pools/:safeAddress/:chain', async (req, res) => {
  const { safeAddress, chain } = req.params;
  try {
    const pools =
      chain === 'base'
        ? await basePool.find({ ownerSafeAddress: safeAddress })
        : await bnbPool.find({ ownerSafeAddress: safeAddress });

    return res.status(200).json({
      status: true,
      pools: pools || [],
    });
  } catch (err) {
    console.error(`❌ Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/subscription', async (req, res) => {
  const { email, pkey, poolAddress, chain, type, interval } = req.body;
  try {
    const subData = await poolSubscription(email, pkey, poolAddress, chain, type, interval);
    return res.status(200).json({
      status: subData.status,
      expiresAt: subData.expiresAt,
    });
  } catch (err) {
    console.error(`❌ Sub Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/subscription-status/:poolAddress/:chain', async (req, res) => {
  const { poolAddress, chain } = req.params;
  try {
    const poolSub =
      chain === 'base'
        ? await basePoolSubscription.findOne({ poolAddress })
        : await bnbPoolSubscription.findOne({ poolAddress });

    if (!poolSub) {
      return res.status(200).json({
        status: true,
        timeRemaining: 0,
        isSubscribed: false,
      });
    }

    const timeRemaining = new Date(poolSub.expiresAt).getTime() - Date.now();
    return res.status(200).json({
      status: true,
      timeRemaining: Math.max(0, timeRemaining),
      isSubscribed: timeRemaining > 0,
    });
  } catch (err) {
    console.error(`❌ Sub Status Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/liquidity', async (req, res) => {
  const { email, pkey, poolAddress, asset, amount, chain, type } = req.body;
  try {
    const liqData = await add_RemoveLiq(email, pkey, poolAddress, asset, amount, chain, type);
    return res.status(200).json({
      status: liqData?.status || false,
    });
  } catch (err) {
    console.error(`Liquidity Update failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/update-rate', async (req, res) => {
  const { email, pkey, poolAddress, rate, type, chain } = req.body;
  try {
    const rateData = await updateRate(email, pkey, poolAddress, rate, type, chain);
    return res.status(200).json({
      status: rateData?.status || false,
    });
  } catch (err) {
    console.error(`Rate Update failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/update-state', async (req, res) => {
  const { email, pkey, poolAddress, state, chain } = req.body;
  try {
    const stateData = await updatePauseState(email, pkey, poolAddress, state, chain);
    return res.status(200).json({
      status: stateData?.status || false,
    });
  } catch (err) {
    console.error(`Pause State Update failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/rate/:poolAddress/:chain', async (req, res) => {
  const { poolAddress, chain } = req.params;
  try {
    const contract = new ethers.Contract(poolAddress, POOL_IFACE, provider(chain));
    const [buyRateWei, sellRateWei] = await Promise.all([
      contract._getBuyRate(),
      contract._getSellRate(),
    ]);

    return res.status(200).json({
      status: true,
      rate: {
        buyRate: ethers.formatUnits(buyRateWei.toString(), 6),
        sellRate: ethers.formatUnits(sellRateWei.toString(), 6),
      },
    });
  } catch (err) {
    console.error(`Rate Fetch failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/isPaused/:poolAddress/:chain', async (req, res) => {
  const { poolAddress, chain } = req.params;
  try {
    const contract = new ethers.Contract(poolAddress, POOL_IFACE, provider(chain));
    const isPaused = await contract.isPaused();
    return res.status(200).json({
      status: true,
      isPaused: isPaused,
    });
  } catch (err) {
    console.error(`Paused State Fetch failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/single-pool/:poolAddress/:chain', async (req, res) => {
  const { poolAddress, chain } = req.params;
  try {
    const pool =
      chain === 'base'
        ? await basePool.findOne({ poolAddress })
        : await bnbPool.findOne({ poolAddress });

    return res.status(200).json({
      status: true,
      pool: pool,
    });
  } catch (err) {
    console.error(`❌ Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/delete', async (req, res) => {
  const { email, pkey, poolAddress, chain } = req.body;
  try {
    const pool =
      chain === 'base'
        ? await basePool.findOne({ poolAddress })
        : await bnbPool.findOne({ poolAddress });

    if (!pool) {
      return res.status(404).json({
        status: false,
        errorMsg: 'Pool record not found',
      });
    }

    const poolSub =
      chain === 'base'
        ? await basePoolSubscription.findOne({ poolAddress })
        : await bnbPoolSubscription.findOne({ poolAddress });

    const owner = pool.ownerSafeAddress;
    const contract = new ethers.Contract(owner, SAFE, provider(chain));
    const wallet = new ethers.Wallet(pkey, provider(chain));
    const safeOwners = await contract.getOwners();

    if (wallet.address.toLowerCase() !== safeOwners[0].toLowerCase()) {
      throw new Error('❌ Not Allowed');
    }

    if (pool.poolName) {
      try {
        await poolNameService(
          email,
          pkey,
          pool.poolName,
          poolAddress,
          pool.registryAddress,
          'unlink',
          chain
        );
      } catch (err) {
        console.warn(`⚠️ Unlink Failed, continue anyway: ${err.message}`);
      }
    }

    await pool.deleteOne();
    if (poolSub) {
      await poolSub.deleteOne();
    }

    return res.status(200).json({ status: true });
  } catch (err) {
    console.error(`❌ Delete Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
