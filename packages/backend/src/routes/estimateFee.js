import { estimateTransferFee } from '../services/estimateFee.js';
import express from 'express';
import { ethers } from 'ethers';
import { getContract } from '../services/resolverServices.js';
import { ERC20 } from '../utils/abi.js';
import { estimatePoolDeploymentFee, estimateAdd_RemoveLiqFee } from '../services/estimateFee.js';
import { keyValue } from '../utils/vars.js';

const router = express.Router();

router.get('/transfer/estimate-fee', async (req, res) => {
  try {
    const { chain, coin } = req.query;

    const baseRpcUrl = keyValue('baseRpcUrl');
    const bnbRpcUrl = keyValue('bnbRpcUrl');

    const ngnsBaseAddress = keyValue('ngnsBaseAddress');
    const cngnBaseAddress = keyValue('cngnBaseAddress');
    const usdtBaseAddress = keyValue('usdtBaseAddress');
    const usdcBaseAddress = keyValue('usdcBaseAddress');

    const ngnsBnbAddress = keyValue('ngnsBnbAddress');
    const cngnBnbAddress = keyValue('cngnBnbAddress');
    const usdtBnbAddress = keyValue('usdtBnbAddress');
    const usdcBnbAddress = keyValue('usdcBnbAddress');

    const rpc = chain === 'base' ? baseRpcUrl : bnbRpcUrl;
    const response = await estimateTransferFee(chain, false);
    const provider = new ethers.JsonRpcProvider(rpc);

    let address;
    if (chain === 'base') {
      address =
        coin === 'NGNS'
          ? ngnsBaseAddress
          : coin === 'CNGN'
            ? cngnBaseAddress
            : coin === 'USDT'
              ? usdtBaseAddress
              : usdcBaseAddress;
    } else {
      address =
        coin === 'NGNS'
          ? ngnsBnbAddress
          : coin === 'CNGN'
            ? cngnBnbAddress
            : coin === 'USDT'
              ? usdtBnbAddress
              : usdcBnbAddress;
    }
    const contract = getContract(address, ERC20, provider);

    const dec = await contract.decimals();

    res.json({
      chain,
      coin,
      feeNGN: response.data.feeNGN,
      feeUsd: response.data.feeUsd,
      feeWei:
        coin === 'NGNS' || coin === 'CNGN'
          ? ethers.parseUnits(response.data.feeNGN.toString(), Number(dec)).toString()
          : ethers.parseUnits(response.data.feeUsd.toString(), Number(dec)).toString(),
    });
  } catch (err) {
    console.error('❌ /api/estimate-fee error:', err.message);
    res.status(500).json({ message: 'Failed to estimate fee' });
  }
});

router.get('/estimate-deploy-pool-fee/:chain', async (req, res) => {
  const chain = req.params.chain;
  try {
    const fee = await estimatePoolDeploymentFee(chain, false);
    res.status(200).json({
      status: fee.status,
      data: fee.data,
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/estimate-provide-remove-liquidity-fee/:chain/:type', async (req, res) => {
  const chain = req.params.chain;
  const type = req.params.type;
  try {
    const fee = await estimateAdd_RemoveLiqFee(chain, type, false);
    res.status(200).json({
      status: fee.status,
      data: fee.data,
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
