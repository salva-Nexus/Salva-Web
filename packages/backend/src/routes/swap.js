import express from "express";
import { POOL_IFACE, ERC20 } from "../utils/abi.js";
import {
  swap,
  getAmountIn,
  getAmountOut,
  maxUint256,
} from "../services/swapServices.js";
import {
  basePool,
  bnbPool,
  trustedBasePool,
  trustedBnbPool,
} from "../models/Pool.js";
import { balance } from "../services/balanceServices.js";
import { _asset } from "../services/poolServices.js";

import { estimateSwapFee } from "../services/estimateFee.js";
import { ethers } from "ethers";
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

router.post("/swap/execute-swap", async (req, res) => {
  const {
    email,
    pkey,
    poolAddress,
    receiver,
    usdToken,
    ngnToken,
    amount,
    chain,
    trustPool,
    type,
  } = req.body;
  try {
    const data = await swap(
      email,
      pkey,
      poolAddress,
      receiver,
      usdToken,
      ngnToken,
      amount,
      chain,
      trustPool,
      type,
    );
    if (data.status) {
      res.status(200).json({
        status: data.status,
        receipt: data.receipt,
      });
    } else {
      res.status(400).json({
        status: data.status,
        errorMsg: `Swap Failed`,
      });
    }
  } catch (err) {
    console.error(`Swap Failed: ${err.message}`);
    res.status(500).json({
      status: data.status,
      errorMsg: `Swap Failed`,
    });
  }
});

router.get("/swap/amount-Out", async (req, res) => {
  const { poolAddress, tokenOut, tokenIn, amount, rate, chain } = req.query;
  try {
    const amountOut = await getAmountOut(
      poolAddress,
      tokenOut,
      tokenIn,
      amount,
      rate,
      chain,
    );

    res.status(200).json({
      status: true,
      amountOut: amountOut,
    });
  } catch (err) {
    console.error(`Amount Out Fetch Failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Fetch Failed`,
    });
  }
});

router.get("/swap/amount-In", async (req, res) => {
  const { poolAddress, usdToken, inToken, outToken, outAmount, rate, chain } =
    req.query;
  try {
    const amountIn = await getAmountIn(
      poolAddress,
      usdToken,
      inToken,
      outToken,
      outAmount,
      rate,
      chain,
    );

    res.status(200).json({
      status: true,
      amountIn: amountIn,
    });
  } catch (err) {
    console.error(`Amount In Fetch Failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Fetch Failed`,
    });
  }
});

router.get("/swap/single-pool/:poolAddress/:chain", async (req, res) => {
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

    if (pool) {
      const balances = await balance(poolAddress, chain);
      if (
        balances.data.ngnsBalance > 0 ||
        balances.data.cNgnBalance > 0 ||
        balances.data.usdtBalance > 0 ||
        balances.data.usdcBalance > 0
      ) {
        const poolContract = new ethers.Contract(
          poolAddress,
          POOL_IFACE,
          provider(chain),
        );
        const buyRate = await poolContract._getBuyRate();
        const sellRate = await poolContract._getSellRate();
        if (buyRate > 0n || sellRate > 0n) {
          const isPaused = await poolContract.isPaused();
          if (!isPaused) {
            res.status(200).json({
              status: true,
              pool: pool,
            });
          }
        } else {
          res.status(200).json({
            status: false,
            pool: {},
          });
        }
      } else {
        res.status(200).json({
          status: false,
          pool: {},
        });
      }
    }
  } catch (err) {
    console.error(`❌ Fetch Failed`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get(
  "/swap/isTrusted/:safeAddress/:poolAddress/:tokenIn/:chain",
  async (req, res) => {
    const safeAddress = req.params.safeAddress;
    const poolAddress = req.params.poolAddress;
    const tokenIn = req.params.tokenIn;
    const chain = req.params.chain;

    try {
      const contract = new ethers.Contract(
        _asset(tokenIn, chain),
        ERC20,
        provider(chain),
      );

      let isTrusted;
      try {
        const allowance = await contract.allowance(safeAddress, poolAddress);
        const allowanceNum = Number(allowance);
        isTrusted = allowanceNum >= maxUint256;
      } catch (err) {
        console.error(err.message);
        const trustedPool =
          chain === "base"
            ? await trustedBasePool.findOne({
                userSafeAddress: safeAddress,
                poolAddress: poolAddress.toLowerCase(),
                tokenAddress: _asset(tokenIn, chain).toLowerCase(),
              })
            : await trustedBnbPool.findOne({
                userSafeAddress: safeAddress,
                poolAddress: poolAddress.toLowerCase(),
                tokenAddress: _asset(tokenIn, chain).toLowerCase(),
              });
        isTrusted = trustedPool ? true : false;
      }
      res.status(200).json({
        status: true,
        isTrusted: isTrusted,
      });
    } catch (newErr) {
      console.error(newErr.message);
      res.status(200).json({
        status: false,
        isTrusted: false,
      });
    }
  },
);

router.get("/swap/estimate-swap-fee/:chain/:isTrusted", async (req, res) => {
  const chain = req.params.chain;
  const isTrusted = req.params.isTrusted;
  try {
    const fee = await estimateSwapFee(chain, isTrusted, false);
    res.status(200).json({
      status: fee.status,
      fee: fee.data,
    });
  } catch (err) {
    console.error(`Fee estimate failed: ${err.message}`);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
