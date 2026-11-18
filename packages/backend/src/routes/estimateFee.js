import { estimateTransferFee } from '../services/estimateFee.js';
import express from 'express';
import { ethers } from 'ethers';
import {
  estimatePoolDeploymentFee,
  estimateDeployInvFee,
  estimateWithdrawFee,
  estimateUpdateSpreadFee,
  estimateAddLiquidityFee,
  estimateSwapExactInputFee,
  estimateSwapExactOutputFee,
  _estimateReg_Deposit_CollateralFee,
  _estimate_Deposit_CollateralFee,
  _estimate_Open_Position_Fee,
  _estimate_Settle_Position_Fee,
  _estimate_Withdraw_CollateralFee,
} from '../services/estimateFee.js';
import { _findManager, _findTokenConfig } from '../services/cdpService.js';
import { SupportedPair } from '../models/SupportedPair.js';
import { _findPoolOrRetry } from '../services/swapServices.js';
import { User } from '../models/Users.js';
import { verify_Pin } from '../services/pinService.js';
import { mode } from '../utils/vars.js';

const router = express.Router();

router.post('/transfer/estimate-fee', async (req, res) => {
  try {
    const { pin, safeAddress, toAddress, amount, tokenAddress, chain } = req.body;
    const uData = await User.findOne({
      safeAddress: safeAddress,
    });
    const pinData = await verify_Pin(uData.email, pin);
    const userPrivateKey = pinData.privateKey;

    const estimateResult = await estimateTransferFee(
      userPrivateKey,
      safeAddress,
      tokenAddress,
      toAddress,
      amount,
      chain
    );

    return res.json({
      status: true,
      data: {
        feeNGN: String(estimateResult.data.feeNGN),
        feeUsd: String(estimateResult.data.feeUsd),
      },
    });
  } catch (err) {
    console.error('❌ /api/estimate-fee error:', err.message);
    return res.status(500).json({ status: false, message: 'Failed to estimate fee' });
  }
});

router.post('/estimate-deploy-pool-fee/', async (req, res) => {
  const { pin, safe, chain } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const fee = await estimatePoolDeploymentFee(pkey, safe, chain);
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/estimate-deploy-Inv-fee', async (req, res) => {
  const { safe, pin, poolAddress, base, quote, floor, spread, amount, allowSwapBelowFloor, chain } =
    req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    let pair = await SupportedPair.findOne({
      baseSymbol: base.toUpperCase(),
      quoteSymbol: quote.toUpperCase(),
      chain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    let inv = false;
    if (!pair) {
      pair = await SupportedPair.findOne({
        baseSymbol: quote.toUpperCase(),
        quoteSymbol: base.toUpperCase(),
        chain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });
      if (!pair) throw new Error('Supported pair not found');
      inv = true;
    }
    const isStableNgn = (sym) => sym === 'NGNS' || sym === 'CNGN';
    if (isStableNgn(pair.quoteSymbol)) {
      isInverted = true;
    }
    const inAddress = !inv ? pair.quoteAddress : pair.baseAddress;
    const outAddress = !inv ? pair.baseAddress : pair.quoteAddress;

    const fee = await estimateDeployInvFee(
      safe,
      pkey,
      poolAddress,
      outAddress,
      inAddress,
      pair.priceFeed,
      floor,
      spread,
      amount,
      allowSwapBelowFloor,
      inv,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/estimate-update-spread-fee', async (req, res) => {
  const { safe, pin, poolAddress, base, quote, spread, chain } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    let pair = await SupportedPair.findOne({
      baseSymbol: base.toUpperCase(),
      quoteSymbol: quote.toUpperCase(),
      chain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    let inv = false;
    if (!pair) {
      pair = await SupportedPair.findOne({
        baseSymbol: quote.toUpperCase(),
        quoteSymbol: base.toUpperCase(),
        chain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });
      if (!pair) throw new Error('Supported pair not found');
      inv = true;
    }

    const isStableNgn = (sym) => sym === 'NGNS' || sym === 'CNGN';
    if (isStableNgn(pair.quoteSymbol)) {
      isInverted = true;
    }
    const inAddress = !inv ? pair.quoteAddress : pair.baseAddress;
    const outAddress = !inv ? pair.baseAddress : pair.quoteAddress;

    const fee = await estimateUpdateSpreadFee(
      safe,
      pkey,
      poolAddress,
      outAddress,
      inAddress,
      spread,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/estimate-add-liquidity-fee', async (req, res) => {
  const { safe, pin, poolAddress, base, quote, amount, chain } = req.body;
  try {
    if (!safe || !pin || !poolAddress || !base || !quote || !amount || !chain) {
      return res.status(400).json({
        status: false,
        errorMsg: 'safe, pkey, poolAddress, base, quote, amount and chain are required',
      });
    }
    const uData = await User.findOne({
      safeAddress: safe,
    });
    const pinData = await verify_Pin(uData.email, pin);
    const pkey = pinData.privateKey;

    const normalizedChain = String(chain).toLowerCase();
    let isInverted = false;
    let pair = await SupportedPair.findOne({
      baseSymbol: base.toUpperCase(),
      quoteSymbol: quote.toUpperCase(),
      chain: chain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    if (!pair) {
      pair = await SupportedPair.findOne({
        baseSymbol: quote.toUpperCase(),
        quoteSymbol: base.toUpperCase(),
        chain: chain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });
      if (!pair)
        return res.status(404).json({ status: false, errorMsg: 'Supported pair not found' });

      isInverted = true;
    }
    const baseAsset = isInverted ? pair.quoteAddress : pair.baseAddress;
    const quoteAsset = isInverted ? pair.baseAddress : pair.quoteAddress;

    const fee = await estimateAddLiquidityFee(
      safe,
      pkey,
      poolAddress,
      baseAsset,
      quoteAsset,
      amount,
      normalizedChain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Add Liquidity Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/estimate-withdraw-fee', async (req, res) => {
  const { safe, pin, poolAddress, base, quote, assetOut, amount, chain } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;

  try {
    let isInverted = false;
    let pair = await SupportedPair.findOne({
      baseSymbol: base.toUpperCase(),
      quoteSymbol: quote.toUpperCase(),
      chain: chain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    if (!pair) {
      pair = await SupportedPair.findOne({
        baseSymbol: quote.toUpperCase(),
        quoteSymbol: base.toUpperCase(),
        chain: chain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });
      if (!pair)
        return res.status(404).json({ status: false, errorMsg: 'Supported pair not found' });
      isInverted = true;
    }
    const baseAsset = isInverted ? pair.quoteAddress : pair.baseAddress;
    const quoteAsset = isInverted ? pair.baseAddress : pair.quoteAddress;
    const outAsset = isInverted
      ? assetOut === quote
        ? quoteAsset
        : baseAsset
      : assetOut === base
        ? baseAsset
        : quoteAsset;
    const fee = await estimateWithdrawFee(
      safe,
      pkey,
      poolAddress,
      baseAsset,
      quoteAsset,
      outAsset,
      amount,
      chain
    );

    return res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/swap/estimate-exact-input-fee', async (req, res) => {
  const { safe, pin, poolAddress, assetIn, assetOut, amountIn, minAmountOut, chain } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);
    const _assetIn = pool.quoteAddress;
    const _assetOut = pool.baseAddress;
    const fee = await estimateSwapExactInputFee(
      safe,
      pkey,
      poolAddress,
      _assetIn,
      _assetOut,
      amountIn,
      minAmountOut,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Swap Exact Input Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/swap/estimate-exact-output-fee', async (req, res) => {
  const { safe, pin, poolAddress, assetIn, assetOut, amountOut, maxAmountIn, chain } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);
    const _assetIn = pool.quoteAddress;
    const _assetOut = pool.baseAddress;
    const fee = await estimateSwapExactOutputFee(
      safe,
      pkey,
      poolAddress,
      _assetIn,
      _assetOut,
      amountOut,
      maxAmountIn,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`Swap Exact Output Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/cdp/estimate-register-deposit-fee', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ratioBps, amount, chain, version } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const manager = await _findManager(version, chain);
    const token = await _findTokenConfig(manager, collateralTokenSymbol);
    const fee = await _estimateReg_Deposit_CollateralFee(
      safe,
      pkey,
      manager.contractAddress,
      token.tokenAddress,
      ratioBps,
      amount,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`CDP Register Deposit Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/cdp/estimate-deposit-fee', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, amount, chain, version } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const manager = await _findManager(version, chain);
    const token = await _findTokenConfig(manager, collateralTokenSymbol);
    const fee = await _estimate_Deposit_CollateralFee(
      safe,
      pkey,
      manager.contractAddress,
      token.tokenAddress,
      amount,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`CDP Deposit Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/cdp/estimate-open-position-fee', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ngnsAmount, chain, version } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const manager = await _findManager(version, chain);
    const token = await _findTokenConfig(manager, collateralTokenSymbol);
    const fee = await _estimate_Open_Position_Fee(
      safe,
      pkey,
      manager.contractAddress,
      token.tokenAddress,
      ngnsAmount,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`CDP Open Position Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/cdp/estimate-settle-position-fee', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ngnsAmount, chain, version } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const manager = await _findManager(version, chain);
    const token = await _findTokenConfig(manager, collateralTokenSymbol);
    const fee = await _estimate_Settle_Position_Fee(
      safe,
      pkey,
      manager.contractAddress,
      token.tokenAddress,
      ngnsAmount,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`CDP Settle Position Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/cdp/estimate-withdraw-fee', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, receiver, amount, chain, version } = req.body;
  const uData = await User.findOne({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const manager = await _findManager(version, chain);
    const token = await _findTokenConfig(manager, collateralTokenSymbol);
    const fee = await _estimate_Withdraw_CollateralFee(
      safe,
      pkey,
      manager.contractAddress,
      token.tokenAddress,
      receiver,
      amount,
      chain
    );
    res.status(200).json({
      status: fee.status,
      data: {
        feeNGN: String(fee.data.feeNGN),
        feeUsd: String(fee.data.feeUsd),
      },
    });
  } catch (err) {
    console.log(`CDP Withdraw Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});
export default router;
