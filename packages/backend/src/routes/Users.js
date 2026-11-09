import { User } from '../models/Users.js';
import express from 'express';
import {
  userAssetsData,
  userCummulativeNgnBalance,
  loadTokenData,
  addAsset,
  removeAsset,
  getUserAndGlobalAssets,
  findMatchingAsset,
} from '../services/assetServices.js';
import { SupportedChain } from '../models/SupportedChain.js';
import { mode } from '../utils/vars.js';
import authLimiter from '../middleware/authLimiter.js';

const router = express.Router();

router.get('/user/:email/:chain', authLimiter, async (req, res) => {
  try {
    const email = req.params.email.toLowerCase().trim();
    const chain = req.params.chain.toLowerCase().trim();
    const record = await User.findOne({ email });
    if (!record) {
      return res.status(404).json({
        status: false,
        errorMsg: 'User not found',
      });
    }

    // Client copy only. Never saved back to the DB.
    const meta = record.toObject();
    meta.ownerPrivateKey = null;
    meta.transactionPin = null;
    meta.password = null;
    // assets = assets on the currently selected/deployed chain
    const assetsBalance = await userAssetsData(record.safeAddress, chain);

    // totalNgnValue = portfolio NGN value across every deployed chain
    const totalNgnValue = await userCummulativeNgnBalance(record.safeAddress);

    return res.status(200).json({
      status: true,
      data: {
        meta,
        assets: assetsBalance,
        totalNgnValue,
      },
    });
  } catch (err) {
    console.error('❌ Could not fetch user dashboard data:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/user/supportedChains', async (req, res) => {
  try {
    const chains = await SupportedChain.find({
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      isActive: true,
    })
      .sort({ chainName: 1 })
      .lean();
    // returns an array of chains
    // chains.logo is the logo of the chain
    /**
     * const TRUST_WALLET_BASE = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains'
     * {
     * chainName: 'base',
     * chainId: 8453,
     * logo: `${TRUST_WALLET_BASE}/base/info/logo.png`,
     * isActive: true,
     * },
     */
    res.status(200).json({
      status: true,
      data: chains,
    });
  } catch (err) {
    console.error(`❌Could not fetch record`);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// GET /api/user/token-details/:chain/:tokenAddress
router.get('/user/token-details/:chain/:tokenAddress', async (req, res) => {
  try {
    const chain = req.params.chain.toLowerCase().trim();
    const tokenAddress = req.params.tokenAddress.trim();

    const result = await loadTokenData(tokenAddress, chain);

    if (!result.status) {
      return res.status(400).json({
        status: false,
        errorMsg: result.errorMsg || 'Failed to fetch token metadata',
      });
    }

    return res.status(200).json({
      status: true,
      data: result.data,
    });
  } catch (err) {
    console.error('❌ Could not fetch token details:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: '❌ Could not fetch token details',
    });
  }
});

// POST /api/user/add-asset
router.post('/user/add-asset', async (req, res) => {
  try {
    const { safe, chain, tokenAddress, feedAddress, logo } = req.body;

    if (!safe || !chain || !tokenAddress) {
      return res.status(400).json({
        status: false,
        errorMsg: 'Missing required parameters: safe, chain, and tokenAddress are compulsory.',
      });
    }

    const result = await addAsset(safe, chain, tokenAddress, feedAddress, logo);

    if (!result.status) {
      return res.status(400).json({
        status: false,
        errorMsg: result.errorMsg,
      });
    }

    return res.status(200).json({
      status: true,
      message: result.message,
    });
  } catch (err) {
    console.error('❌ Could not add asset:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: '❌ Could not add asset',
    });
  }
});

// DELETE /api/user/remove-asset
router.delete('/user/remove-asset', async (req, res) => {
  try {
    const { safe, chain, tokenAddress } = req.body;

    if (!safe || !chain || !tokenAddress) {
      return res.status(400).json({
        status: false,
        errorMsg: 'Missing required parameters: safe, chain, and tokenAddress are compulsory.',
      });
    }

    const result = await removeAsset(safe, chain, tokenAddress);

    if (!result.status) {
      return res.status(400).json({
        status: false,
        errorMsg: result.errorMsg,
      });
    }

    return res.status(200).json({
      status: result.status,
    });
  } catch (err) {
    console.error('❌ Could not remove asset:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: '❌ Could not remove asset',
    });
  }
});

router.get('/user/assets/supported-and-user/:safe/:chain', async (req, res) => {
  try {
    const safe = req.params.safe.toLowerCase().trim();
    const chain = req.params.chain.toLowerCase().trim();

    const result = await getUserAndGlobalAssets(safe, chain);

    if (!result.status) {
      return res.status(404).json({
        status: false,
        errorMsg: result.errorMsg,
      });
    }

    return res.status(200).json({
      status: true,
      data: result.data,
    });
  } catch (err) {
    console.error('❌ Could not fetch assets breakdown:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: '❌ Could not fetch assets breakdown',
    });
  }
});

router.get('/user/assets/find/:safe/:chain/:target', async (req, res) => {
  try {
    const safe = req.params.safe.toLowerCase().trim();
    const chain = req.params.chain.toLowerCase().trim();
    const target = req.params.target.trim();

    if (!safe || !chain || !target) {
      return res.status(400).json({
        status: false,
        errorMsg: 'Missing required parameters: safe, chain, and target are required',
      });
    }

    const result = await findMatchingAsset(safe, chain, target);

    if (!result.status) {
      return res.status(404).json({
        status: false,
        errorMsg: result.errorMsg,
      });
    }

    return res.status(200).json({
      status: true,
      data: result.data,
    });
  } catch (err) {
    console.error('❌ Could not fetch matching asset:', err.message);
    return res.status(500).json({
      status: false,
      errorMsg: '❌ Could not fetch matching asset',
    });
  }
});

router.post('/save-subscription', async (req, res) => {
  try {
    const { email } = req.body; // or get user from your auth middleware
    const subscription = req.body.subscription;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: false, errorMsg: 'User not found' });
    }

    // Save the subscription object directly into MongoDB
    user.pushSubscription = subscription;
    await user.save();

    return res.status(200).json({ status: true, message: 'Subscribed successfully!' });
  } catch (err) {
    return res.status(500).json({ status: false, errorMsg: err.message });
  }
});

router.post('/remove-subscription', async (req, res) => {
  try {
    const { email } = req.body; // or get user from your auth middleware
    const subscription = req.body.subscription;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: false, errorMsg: 'User not found' });
    }

    user.pushSubscription = null;
    await user.save();

    return res.status(200).json({ status: true, message: 'Subscribed successfully!' });
  } catch (err) {
    return res.status(500).json({ status: false, errorMsg: err.message });
  }
});

router.post('/seen-push-notification', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: false, errorMsg: 'User not found' });
    }

    user.seenPushNotification = true;
    await user.save();

    return res.status(200).json({ status: true });
  } catch (err) {
    return res.status(500).json({ status: false, errorMsg: err.message });
  }
});

export default router;
