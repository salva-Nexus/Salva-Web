import express from "express";
import { POOL_IFACE, SAFE } from "../utils/abi.js";
import {
  deployPool,
  poolNameService,
  poolSubscription,
  add_RemoveLiq,
  updateRate,
  updatePauseState,
  _getFeeAndToken,
} from "../services/poolServices.js";

import {
  estimateUpdateRateFee,
  estimateUpdatePauseStateFee,
} from "../services/estimateFee.js";
import {
  basePool,
  bnbPool,
  trustedBasePool,
  trustedBnbPool,
} from "../models/Pool.js";

import {
  basePoolSubscription,
  bnbPoolSubscription,
} from "../models/PoolSubscription.js";
import { ethers } from "ethers";
import { User } from "../models/Users.js";
import { balance } from "../services/balanceServices.js";
import { SafeProvider } from "@safe-global/protocol-kit";

const router = express.Router();
const mode = process.env.NODE_ENV;

const baseRpcUrl =
  mode === "development"
    ? process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const bnbRpcUrl =
  mode === "development"
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;
const provider = (chain) => {
  return chain === "base"
    ? new ethers.JsonRpcProvider(baseRpcUrl)
    : new ethers.JsonRpcProvider(bnbRpcUrl);
};

router.post("/deploy", async (req, res) => {
  const { email, pkey, chain } = req.body;
  try {
    const deployData = await deployPool(email, pkey, chain);
    if (deployData.status) {
      res.status(200).json({
        status: deployData.status,
        poolAddress: deployData.poolAddress,
      });
    } else {
      res.status(200).json({
        status: false,
      });
    }
  } catch (err) {
    console.log(`Pool Deployment failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/nameAlias", async (req, res) => {
  const { email, pkey, name, poolAddress, registry, type, chain } = req.body;
  try {
    const nameData = await poolNameService(
      email,
      pkey,
      name,
      poolAddress,
      registry,
      type,
      chain,
    );
    if (nameData.status) {
      res.status(200).json({
        status: nameData.status,
        poolName: nameData.name,
      });
    }
  } catch (err) {
    console.log(`Link failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/all-pools/:chain", async (req, res) => {
  const chain = req.params.chain;
  try {
    const subPools =
      chain === "base"
        ? await basePoolSubscription.find({
            active: true,
          })
        : await bnbPoolSubscription.find({
            active: true,
          });

    const nonExpSubPools = subPools.filter(
      (sp) => new Date(sp.expiresAt).getTime() > Date.now(),
    );

    if (nonExpSubPools) {
      const pools = [];
      for (const nsp of nonExpSubPools) {
        const pool =
          chain === "base"
            ? await basePool.findOne({ poolAddress: nsp.poolAddress })
            : await bnbPool.findOne({ poolAddress: nsp.poolAddress });

        const balances = await balance(pool.poolAddress, chain);
        if (
          balances.data.ngnsBalance > 0 ||
          balances.data.cNgnBalance > 0 ||
          balances.data.usdtBalance > 0 ||
          balances.data.usdcBalance > 0
        ) {
          const poolContract = new ethers.Contract(
            pool.poolAddress,
            POOL_IFACE,
            provider(chain),
          );
          const buyRate = await poolContract._getBuyRate();
          const sellRate = await poolContract._getSellRate();
          if (buyRate > 0n || sellRate > 0n) {
            const isPaused = await poolContract.isPaused();
            if (!isPaused) {
              pools.push(pool);
            }
          }
        }
      }
      res.status(200).json({
        status: true,
        pools: pools,
      });
    } else {
      res.status(200).json({
        status: false,
        pools: [],
      });
    }
  } catch (err) {
    console.error(`❌ Fetch Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/pools/:safeAddress/:chain", async (req, res) => {
  const safeAddress = req.params.safeAddress;
  const chain = req.params.chain;
  try {
    const pools =
      chain === "base"
        ? await basePool.find({
            ownerSafeAddress: safeAddress,
          })
        : await bnbPool.find({
            ownerSafeAddress: safeAddress,
          });
    if (pools) {
      res.status(200).json({
        status: true,
        pools: pools,
      });
    } else {
      res.status(200).json({
        status: false,
        pools: [],
      });
    }
  } catch (err) {
    console.error(`❌ Fetch Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/subscription", async (req, res) => {
  const { email, pkey, poolAddress, chain, type, interval } = req.body;
  try {
    const subData = await poolSubscription(
      email,
      pkey,
      poolAddress,
      chain,
      type,
      interval,
    );
    res.status(200).json({
      status: subData.status,
      expiresAt: subData.expiresAt,
    });
  } catch (err) {
    console.error(`❌ Sub Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/subscription-status/:poolAddress/:chain", async (req, res) => {
  const poolAddress = req.params.poolAddress;
  const chain = req.params.chain;
  try {
    const poolSub =
      chain === "base"
        ? await basePoolSubscription.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPoolSubscription.findOne({
            poolAddress: poolAddress,
          });
    if (!poolSub) {
      res.status(200).json({
        status: true,
        timeRemaining: 0,
        isSubscribed: false,
      });
    } else {
      const currentTime = Date.now();
      const expiry = new Date(poolSub.expiresAt.getTime());
      res.status(200).json({
        status: true,
        timeRemaining: expiry - currentTime,
        isSubscribed: expiry - currentTime > 0 ? true : false,
      });
    }
  } catch (err) {
    console.error(`❌ Sub Status Fetch Failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/liquidity", async (req, res) => {
  const { email, pkey, poolAddress, asset, amount, chain, type } = req.body;
  try {
    const liqData = await add_RemoveLiq(
      email,
      pkey,
      poolAddress,
      asset,
      amount,
      chain,
      type,
    );
    if (liqData.status) {
      res.status(200).json({
        status: liqData.status,
      });
    }
  } catch (err) {
    console.log(`Liquidity Update failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-rate", async (req, res) => {
  const { email, pkey, poolAddress, rate, type, chain } = req.body;
  try {
    const rateData = await updateRate(
      email,
      pkey,
      poolAddress,
      rate,
      type,
      chain,
    );
    if (rateData.status) {
      res.status(200).json({
        status: rateData.status,
      });
    }
  } catch (err) {
    console.log(`Rate Update failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-state", async (req, res) => {
  const { email, pkey, poolAddress, state, chain } = req.body;
  try {
    const stateData = await updatePauseState(
      email,
      pkey,
      poolAddress,
      state,
      chain,
    );
    if (stateData.status) {
      res.status(200).json({
        status: stateData.status,
      });
    }
  } catch (err) {
    console.log(`Rate Update failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/rate/:poolAddress/:chain", async (req, res) => {
  const poolAddress = req.params.poolAddress;
  const chain = req.params.chain;

  const contract = new ethers.Contract(
    poolAddress,
    POOL_IFACE,
    provider(chain),
  );
  try {
    const buyRateWei = await contract._getBuyRate();
    const sellRateWei = await contract._getSellRate();
    const buyRate = ethers.formatUnits(buyRateWei.toString(), 6);
    const sellRate = ethers.formatUnits(sellRateWei.toString(), 6);
    res.status(200).json({
      status: true,
      rate: {
        buyRate: buyRate,
        sellRate: sellRate,
      },
    });
  } catch (err) {
    console.log(`Rate Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/isPaused/:poolAddress/:chain", async (req, res) => {
  const poolAddress = req.params.poolAddress;
  const chain = req.params.chain;

  const contract = new ethers.Contract(
    poolAddress,
    POOL_IFACE,
    provider(chain),
  );
  try {
    const isPaused = await contract.isPaused();
    res.status(200).json({
      status: true,
      isPaused: isPaused,
    });
  } catch (err) {
    console.log(`Paused State Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;

router.get("/single-pool/:poolAddress/:chain", async (req, res) => {
  const poolAddress = req.params.poolAddress;
  const chain = req.params.chain;
  try {
    const pool =
      chain === "base"
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });

    res.status(200).json({
      status: true,
      pool: pool,
    });
  } catch (err) {
    console.error(`❌ Fetch Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/delete", async (req, res) => {
  const { email, pkey, poolAddress, chain } = req.body;
  try {
    const pool =
      chain === "base"
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });

    const poolSub =
      chain === "base"
        ? await basePoolSubscription.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPoolSubscription.findOne({
            bnbPoolSubscription: poolAddress,
          });

    const owner = pool.ownerSafeAddress;
    const contract = new ethers.Contract(owner, SAFE, provider(chain));
    const wallet = new ethers.Wallet(pkey, provider(chain));
    const safeOwner = await contract.getOwners();
    // prevent again arb calling delete
    if (wallet.address !== safeOwner[0]) {
      throw Error("❌ Not Allowed");
    }
    if (pool.poolName || pool.poolName !== null) {
      try {
        await poolNameService(
          email,
          pkey,
          pool.poolName,
          poolAddress,
          pool.registryAddress,
          "unlink",
          chain,
        );
      } catch (err) {
        console.warn(`⚠️ Unlink Failed, continue anyway`);
      }
    }
    await pool.deleteOne({
      poolAddress: poolAddress,
    });
    if (poolSub) {
      await poolSub.deleteOne({
        poolAddress: poolAddress,
      });
    }
    res.status(200).json({
      status: true,
    });
  } catch (err) {
    console.error(`❌ Delete Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});
