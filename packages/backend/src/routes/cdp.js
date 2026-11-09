import express from 'express';
import { CdpPositionManager } from '../models/CDP.js';
import { mode } from '../utils/vars.js';
import {
  registerAndDepositCollateral,
  depositCollateral,
  openPosition,
  settlePosition,
  withdraw,
  userConfig,
  userPositionHealth,
  collateralAmountWithdrawable,
  ngnValue,
} from '../services/cdpService.js';
import { User } from '../models/Users.js';
import { verify_Pin } from '../services/pinService.js';

const router = express.Router();

router.post('/managers', async (req, res) => {
  const { chain } = req.body;
  try {
    const managers = await CdpPositionManager.find({
      chain: chain.toLowerCase(),
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });
    res.status(200).json({
      status: true,
      data: managers,
    });
  } catch (err) {
    console.log(`CDP Managers Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/register-deposit', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ratioBps, amount, chain, version } = req.body;
  const uData = await User.find({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const result = await registerAndDepositCollateral(
      safe,
      pkey,
      collateralTokenSymbol,
      ratioBps,
      amount,
      chain,
      version
    );
    const receipt = result.receipt || result.data;
    res.status(200).json({
      status: result.status,
      data: { txHash: receipt?.hash },
    });
  } catch (err) {
    console.log(`CDP Register Deposit failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/deposit', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, amount, chain, version } = req.body;
  const uData = await User.find({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const result = await depositCollateral(
      safe,
      pkey,
      collateralTokenSymbol,
      amount,
      chain,
      version
    );
    const receipt = result.receipt || result.data;
    res.status(200).json({
      status: result.status,
      data: { txHash: receipt?.hash },
    });
  } catch (err) {
    console.log(`CDP Deposit failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/open-position', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ngnsAmount, chain, version } = req.body;
  const uData = await User.find({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const result = await openPosition(
      safe,
      pkey,
      collateralTokenSymbol,
      ngnsAmount,
      chain,
      version
    );
    const receipt = result.receipt || result.data;
    res.status(200).json({
      status: result.status,
      data: { txHash: receipt?.hash },
    });
  } catch (err) {
    console.log(`CDP Open Position failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/settle-position', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, ngnsAmount, chain, version } = req.body;
  const uData = await User.find({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const result = await settlePosition(
      safe,
      pkey,
      collateralTokenSymbol,
      ngnsAmount,
      chain,
      version
    );
    const receipt = result.receipt || result.data;
    res.status(200).json({
      status: result.status,
      data: { txHash: receipt?.hash },
    });
  } catch (err) {
    console.log(`CDP Settle Position failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/withdraw', async (req, res) => {
  const { safe, pin, collateralTokenSymbol, receiver, amount, chain, version } = req.body;
  const uData = await User.find({
    safeAddress: safe,
  });
  const pinData = await verify_Pin(uData.email, pin);
  const pkey = pinData.privateKey;
  try {
    const result = await withdraw(
      safe,
      pkey,
      collateralTokenSymbol,
      receiver,
      amount,
      chain,
      version
    );
    const receipt = result.receipt || result.data;
    res.status(200).json({
      status: result.status,
      data: { txHash: receipt?.hash },
    });
  } catch (err) {
    console.log(`CDP Withdraw failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/user-config', async (req, res) => {
  const { safe, collateralTokenSymbol, chain, version } = req.body;
  try {
    const data = await userConfig(safe, collateralTokenSymbol, chain, version);
    res.status(200).json({
      status: true,
      data,
    });
  } catch (err) {
    console.log(`CDP User Config Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/position-health', async (req, res) => {
  const { safe, collateralTokenSymbol, debtAmount, chain, version } = req.body;
  try {
    const health = await userPositionHealth(
      safe,
      collateralTokenSymbol,
      debtAmount || 0,
      chain,
      version
    );
    res.status(200).json({
      status: true,
      data: { healthBps: health },
    });
  } catch (err) {
    console.log(`CDP Position Health Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/withdrawable', async (req, res) => {
  const { safe, collateralTokenSymbol, chain, version } = req.body;
  try {
    const withdrawable = await collateralAmountWithdrawable(
      safe,
      collateralTokenSymbol,
      chain,
      version
    );
    res.status(200).json({
      status: true,
      data: { withdrawable },
    });
  } catch (err) {
    console.log(`CDP Withdrawable Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/ngn-value', async (req, res) => {
  const { collateralTokenSymbol, amount, chain, version } = req.body;
  try {
    const value = await ngnValue(collateralTokenSymbol, amount, chain, version);
    res.status(200).json({
      status: true,
      data: { ngnValue: value },
    });
  } catch (err) {
    // console.log(
    //   !err.message.includes('0x7ecd6fb2') ? `CDP NGN Value Fetch failed: ${err.message}` : ''
    // );
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
