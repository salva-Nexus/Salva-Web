import express from 'express';
import { ethers } from 'ethers';
import { POOL_IFACE, ERC20 } from '../utils/abi.js';
import { swap, getAmountIn, getAmountOut } from '../services/swapServices.js';
import { basePool, bnbPool, trustedBasePool, trustedBnbPool } from '../models/Pool.js';
import { balance } from '../services/balanceServices.js';
import { _asset } from '../services/poolServices.js';
import { estimateSwapFee } from '../services/estimateFee.js';
import { keyValue } from '../utils/vars.js';

const router = express.Router();

const provider = (chain) => {
  const baseRpcUrl = keyValue('baseRpcUrl');
  const bnbRpcUrl = keyValue('bnbRpcUrl');
  return chain === 'base'
    ? new ethers.JsonRpcProvider(baseRpcUrl)
    : new ethers.JsonRpcProvider(bnbRpcUrl);
};

router.post('/swap/execute-swap', async (req, res) => {
  const { email, pkey, poolAddress, receiver, usdToken, ngnToken, amount, chain, trustPool, type } =
    req.body;
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
      type
    );
    if (data?.status) {
      return res.status(200).json({
        status: data.status,
        receipt: data.receipt,
      });
    } else {
      return res.status(400).json({
        status: false,
        errorMsg: `Swap Failed`,
      });
    }
  } catch (err) {
    console.error(`Swap Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: `Swap Failed`,
    });
  }
});

router.get('/swap/amount-Out', async (req, res) => {
  const { poolAddress, tokenOut, tokenIn, amount, rate, chain } = req.query;
  try {
    const amountOut = await getAmountOut(poolAddress, tokenOut, tokenIn, amount, rate, chain);

    return res.status(200).json({
      status: true,
      amountOut: amountOut,
    });
  } catch (err) {
    console.error(`Amount Out Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: `Fetch Failed`,
    });
  }
});

router.get('/swap/amount-In', async (req, res) => {
  const { poolAddress, usdToken, inToken, outToken, outAmount, rate, chain } = req.query;
  try {
    const amountIn = await getAmountIn(
      poolAddress,
      usdToken,
      inToken,
      outToken,
      outAmount,
      rate,
      chain
    );

    return res.status(200).json({
      status: true,
      amountIn: amountIn,
    });
  } catch (err) {
    console.error(`Amount In Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: `Fetch Failed`,
    });
  }
});

router.get('/swap/single-pool/:poolAddress/:chain', async (req, res) => {
  const poolAddress = req.params.poolAddress;
  const chain = req.params.chain;
  try {
    const pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });

    if (pool) {
      const balances = await balance(poolAddress, chain);
      if (
        balances?.data &&
        (balances.data.ngnsBalance > 0 ||
          balances.data.cNgnBalance > 0 ||
          balances.data.usdtBalance > 0 ||
          balances.data.usdcBalance > 0)
      ) {
        const poolContract = new ethers.Contract(poolAddress, POOL_IFACE, provider(chain));
        const buyRate = await poolContract._getBuyRate();
        const sellRate = await poolContract._getSellRate();
        if (buyRate > 0n || sellRate > 0n) {
          const isPaused = await poolContract.isPaused();
          if (!isPaused) {
            return res.status(200).json({
              status: true,
              pool: pool,
            });
          }
        }
      }
    }

    return res.status(200).json({
      status: false,
      pool: {},
    });
  } catch (err) {
    console.error(`❌ Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/swap/isTrusted/:safeAddress/:poolAddress/:tokenIn/:chain', async (req, res) => {
  const safeAddress = req.params.safeAddress;
  const poolAddress = req.params.poolAddress;
  const tokenIn = req.params.tokenIn;
  const chain = req.params.chain;

  try {
    const tokenAddress = _asset(tokenIn, chain);
    const contract = new ethers.Contract(tokenAddress, ERC20, provider(chain));

    let isTrusted = false;
    try {
      const allowance = await contract.allowance(safeAddress, poolAddress);
      const maxUint256Val = ethers.MaxUint256;
      isTrusted = BigInt(allowance) >= maxUint256Val;
    } catch (err) {
      console.error(`Allowance read fallback to db: ${err.message}`);
      const trustedPool =
        chain === 'base'
          ? await trustedBasePool.findOne({
              userSafeAddress: safeAddress,
              poolAddress: poolAddress.toLowerCase(),
              tokenAddress: tokenAddress.toLowerCase(),
            })
          : await trustedBnbPool.findOne({
              userSafeAddress: safeAddress,
              poolAddress: poolAddress.toLowerCase(),
              tokenAddress: tokenAddress.toLowerCase(),
            });
      isTrusted = !!trustedPool;
    }

    return res.status(200).json({
      status: true,
      isTrusted: isTrusted,
    });
  } catch (newErr) {
    console.error(newErr.message);
    return res.status(200).json({
      status: false,
      isTrusted: false,
    });
  }
});

router.get('/swap/estimate-swap-fee/:chain/:isTrusted', async (req, res) => {
  const chain = req.params.chain;
  const isTrusted = req.params.isTrusted === 'true';
  try {
    const fee = await estimateSwapFee(chain, isTrusted, false);
    return res.status(200).json({
      status: fee?.status || false,
      fee: fee?.data,
    });
  } catch (err) {
    console.error(`Fee estimate failed: ${err.message}`);
    return res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
