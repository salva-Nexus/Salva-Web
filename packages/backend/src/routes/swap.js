import express from 'express';
import { ethers } from 'ethers';
import {
  swapExactInput,
  swapExactOutput,
  getAmountIn,
  getAmountOut,
} from '../services/swapServices.js';
import { keyValue } from '../utils/vars.js';

const router = express.Router();

// --- Execute Exact Input Swap ---
router.post('/swap/execute-exact-input', async (req, res) => {
  const { email, pin, poolAddress, assetIn, assetOut, amountIn, minAmountOut, chain } = req.body;
  try {
    
    const data = await swapExactInput(
      email,
      pin,
      poolAddress,
      assetIn,
      assetOut,
      amountIn,
      minAmountOut,
      chain
    );
    if (data?.status) {
      return res.status(200).json({
        status: data.status,
        receipt: data.receipt,
      });
    } else {
      return res.status(400).json({
        status: false,
        errorMsg: 'Exact Input Swap Failed',
      });
    }
  } catch (err) {
    console.error(`❌ Exact Input Swap Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// --- Execute Exact Output Swap ---
router.post('/swap/execute-exact-output', async (req, res) => {
  const { email, pin, poolAddress, assetIn, assetOut, amountOut, maxAmountIn, chain } = req.body;
  try {
    const data = await swapExactOutput(
      email,
      pin,
      poolAddress,
      assetIn,
      assetOut,
      amountOut,
      maxAmountIn,
      chain
    );
    if (data?.status) {
      return res.status(200).json({
        status: data.status,
        receipt: data.receipt,
      });
    } else {
      return res.status(400).json({
        status: false,
        errorMsg: 'Exact Output Swap Failed',
      });
    }
  } catch (err) {
    console.error(`❌ Exact Output Swap Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// --- Fetch Amount Out ---
router.get('/swap/amount-out', async (req, res) => {
  const { poolAddress, assetIn, assetOut, amount, chain } = req.query;
  try {
    const amountOut = await getAmountOut(poolAddress, assetIn, assetOut, amount, chain);
    return res.status(200).json({
      status: true,
      amountOut: amountOut,
    });
  } catch (err) {
    console.error(`❌ Amount Out Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// --- Fetch Amount In ---
router.get('/swap/amount-in', async (req, res) => {
  const { poolAddress, assetIn, assetOut, amount, chain } = req.query;
  try {
    const amountIn = await getAmountIn(poolAddress, assetIn, assetOut, amount, chain);

    return res.status(200).json({
      status: true,
      amountIn: amountIn,
    });
  } catch (err) {
    console.error(`❌ Amount In Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
