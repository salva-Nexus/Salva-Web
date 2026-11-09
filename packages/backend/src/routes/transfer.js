import { executeTransfer } from '../services/transferServices.js';
import express from 'express';

const router = express.Router();

router.post('/transfer', async (req, res) => {
  try {
    const {
      email,
      pin,
      safeAddress,
      toAddress,
      amount,
      tokenSymbol,
      tokenAddress,
      chain,
    } = req.body;
    const transferResult = await executeTransfer(
      email,
      safeAddress,
      pin,
      toAddress,
      amount,
      tokenSymbol,
      tokenAddress,
      chain
    );
    res.status(200).json({
      status: transferResult.status,
      data: transferResult.data,
      errorMsg: transferResult.errorMsg ? transferResult.errorMsg : null,
    });
  } catch (err) {
    console.error(`❌ Transfer Error: ${err.message}`);
    res.status(400).json({
      status: false,
      data: `❌ Transfer Error: ${err.message}`,
    });
  }
});

export default router;
