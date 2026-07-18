// packages/backend/src/routes/bnb.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { encryptPrivateKey, decryptPrivateKey, hashPin, verifyPin } = require('../utils/encryption');
const { generateAndDeploySalvaIdentityBNB } = require('../services/userServiceBNB');
const Safe = require('@safe-global/protocol-kit').default;
const { sponsorBNBTransfer } = require('../services/relayServiceBNB');
const { getL1TokenDecimals } = require('../utils/l1Decimals');
const UserBNBSchema = require('../models/UserBNB');
const Transaction = require('../models/Transaction');

function getBNBProvider() {
  const isProd = process.env.NODE_ENV === 'production';
  return new ethers.JsonRpcProvider(
    isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL
  );
}

function getL1DB() {
  return require('../services/l1db');
}

function getUserBNB() {
  const l1DB = getL1DB();
  return l1DB.models.UserBNB || l1DB.model('UserBNB', UserBNBSchema);
}

function sanitizeEmail(email) {
  const validator = require('validator');
  if (typeof email !== 'string') throw new Error('Invalid email');
  const s = email.trim().toLowerCase();
  if (!validator.isEmail(s)) throw new Error('Invalid email format');
  return s;
}

function cleanAddr(raw) {
  if (!raw) return null;
  const m = String(raw).match(/(0x[0-9a-fA-F]{40})/);
  return m ? m[1].toLowerCase() : null;
}

function resolveL1Token(sym) {
  const isProd = process.env.NODE_ENV === 'production';
  switch ((sym || '').toUpperCase()) {
    case 'NGNS':
    case 'NGN':
      return cleanAddr(
        isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      );
    case 'CNGN':
      return cleanAddr(
        isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
      );
    case 'USDT':
      return cleanAddr(
        isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
      );
    case 'USDC':
      return cleanAddr(
        isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
      );
    default:
      return null;
  }
}

// ── POST /api/bnb/register ────────────────────────────────────────────────────
// Deploys a BNB Chain Safe for an existing Salva user.
//
// PATH A (new users, registration BNB failed):
//   User.pendingBNBDeploy is set — decrypt the stored seed, deploy using the
//   same owner keypair as Base, so addresses and private keys match exactly.
//   Clear pendingBNBDeploy from DB after successful deploy + DB save.
//
// PATH B (legacy — existing users who never had dual-deploy):
//   No pendingBNBDeploy — generate a fresh keypair and deploy normally.
//   This preserves backward compatibility for all existing users.
// ─────────────────────────────────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, pin } = req.body;
    // pin is required — it's the user's Base transaction PIN, used to encrypt the BNB key
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'Transaction PIN is required to deploy BNB wallet' });
    }
    const sanitizedEmail = sanitizeEmail(email);

    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      await Promise.race([
        l1DB.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 12000)),
      ]).catch(() => {});
    }
    const UserBNB = getUserBNB();

    // Guard: already deployed
    const existing = await UserBNB.findOne({ email: sanitizedEmail });
    if (existing)
      return res.status(400).json({ message: 'BNB wallet already deployed for this account' });

    const User = require('../models/User');
    const baseUser = await User.findOne({ email: sanitizedEmail });
    if (!baseUser)
      return res.status(404).json({ message: 'No Salva account found for this email' });

    const isProd = process.env.NODE_ENV === 'production';
    const bnbRpcUrl = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

    if (!bnbRpcUrl) {
      return res
        .status(500)
        .json({ message: 'BNB network not configured. Please contact support.' });
    }

    const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
    const bnbSignerWallet = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, bnbProvider);

    let ownerAddress, ownerPrivateKey, safeAddress, deploymentTx;

    try {
      const identity = await generateAndDeploySalvaIdentityBNB();
      ownerAddress = identity.ownerAddress;
      ownerPrivateKey = identity.ownerPrivateKey;
      safeAddress = identity.safeAddress;
      deploymentTx = identity.deploymentTx;
    } catch (err) {
      console.error('❌ /bnb/register failed:', err.message);
      const msg = err.message || '';
      if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS')) {
        return res.status(503).json({
          message: 'Network temporarily unavailable. Please try again shortly.',
        });
      }
      return res.status(500).json({ message: 'BNB wallet deployment failed. Please try again.' });
    }

    // Encrypt the BNB private key with the user's Base PIN immediately —
    // same pattern as /api/user/set-pin on Base. No separate BNBSetPin screen needed.
    const hashedPin = hashPin(pin);
    const encryptedKey = encryptPrivateKey(ownerPrivateKey, pin);

    // Record BNB deployment loan
    let bnbLoanNGN = 25;
    let bnbLoanUSD = 0.02;
    try {
      const { estimateTransferFee } = require('../services/gasOracle');
      const bnbLoan = await estimateTransferFee('bnb', 'NGN').catch(() => null);
      if (bnbLoan) {
        bnbLoanNGN = bnbLoan.feeNGN || 25;
        bnbLoanUSD = bnbLoan.feeUSD || 0.02;
      }
    } catch {
      /* non-fatal — fallback used */
    }

    const newUserBNB = new UserBNB({
      email: baseUser.email,
      username: baseUser.username,
      safeAddress,
      ownerPrivateKey: encryptedKey,
      transactionPin: hashedPin,
      pinSetupCompleted: true,
      deploymentLoanNGN: bnbLoanNGN,
      deploymentLoanUSD: bnbLoanUSD,
      hasPaidDeploymentLoan: false,
    });
    await newUserBNB.save();

    console.log(`✅ BNB wallet deployed for ${sanitizedEmail}: ${safeAddress}`);
    res.json({
      username: baseUser.username,
      email: sanitizedEmail,
      safeAddress,
    });
  } catch (err) {
    console.error('❌ /bnb/register:', err.message);
    res.status(500).json({ message: 'BNB wallet deployment failed. Please try again.' });
  }
});

// ── GET /api/bnb/status/:email ────────────────────────────────────────────────
router.get('/status/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      try {
        await Promise.race([
          l1DB.readyPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 10000)),
        ]);
      } catch {
        // L1DB unreachable — return a retryable error so frontend uses cache
        return res
          .status(503)
          .json({ message: 'Service temporarily unavailable', retryable: true });
      }
    }
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) return res.json({ deployed: false });

    res.json({
      deployed: true,
      safeAddress: user.safeAddress,
      hasPin: !!user.transactionPin,
      nameAlias: user.nameAlias || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/bnb/pin-status/:email ────────────────────────────────────────────
// Dedicated PIN-status check, mirroring /api/user/pin-status on Base. Kept
// separate from /status/:email (which answers "is a BNB wallet deployed at
// all") because AccountSettings needs isLocked/lockedUntil specifically and
// should 404 clearly if no BNB wallet exists yet, rather than silently
// defaulting hasPin to false.
router.get('/pin-status/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      try {
        await Promise.race([
          l1DB.readyPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 10000)),
        ]);
      } catch {
        return res
          .status(503)
          .json({ message: 'Service temporarily unavailable', retryable: true });
      }
    }
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'BNB wallet not found for this account' });
    }

    res.json({
      hasPin: !!user.transactionPin,
      pinSetupCompleted: user.pinSetupCompleted || false,
      isLocked: !!(user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()),
      lockedUntil: user.accountLockedUntil || null,
    });
  } catch (err) {
    console.error('❌ /bnb/pin-status:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/bnb/verify-pin ──────────────────────────────────────────────────
router.post('/verify-pin', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!pin || pin.length !== 4) return res.status(400).json({ message: 'Invalid PIN' });

    const sanitizedEmail = sanitizeEmail(email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      try {
        await Promise.race([
          l1DB.readyPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 15000)),
        ]);
      } catch (dbErr) {
        console.error('❌ /bnb/verify-pin: L1DB not ready:', dbErr.message);
        return res.status(503).json({
          message: 'Service temporarily unavailable. Please wait a moment and try again.',
          retryable: true,
        });
      }
    }
    // Double-check after wait — readyState must be 1
    if (l1DB.readyState !== 1) {
      return res.status(503).json({
        message: 'Database connection not ready. Please try again in a few seconds.',
        retryable: true,
      });
    }
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user || !user.transactionPin) return res.status(404).json({ message: 'No BNB PIN set' });

    if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
      const h = Math.ceil((new Date(user.accountLockedUntil) - new Date()) / 3_600_000);
      return res.status(403).json({ message: `Account locked for ${h} more hour(s)` });
    }

    const isValid = verifyPin(pin, user.transactionPin);
    if (!isValid) {
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 100)));
      return res.status(401).json({ success: false, message: 'Invalid PIN' });
    }

    const privateKey = decryptPrivateKey(user.ownerPrivateKey, pin);
    res.json({ success: true, privateKey });
  } catch (err) {
    console.error('❌ /bnb/verify-pin:', err.message);
    res.status(401).json({ success: false, message: 'Invalid PIN or corrupted key' });
  }
});

// ── POST /api/bnb/set-pin ─────────────────────────────────────────────────────
// First-time BNB PIN set. In the normal flow the BNB PIN is set automatically
// during /bnb/register (encrypted with the user's Base PIN at deploy time),
// so this route mainly exists as a fallback for edge cases — e.g. a UserBNB
// record that ended up without a PIN — and for parity with Base's
// /api/user/set-pin so the "Set" path in Account Settings never 404s again.
router.post('/set-pin', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
    }
    const sanitizedEmail = sanitizeEmail(email);

    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      try {
        await Promise.race([
          l1DB.readyPromise,
          new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 10000)),
        ]);
      } catch {
        return res
          .status(503)
          .json({ message: 'Service temporarily unavailable', retryable: true });
      }
    }
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'BNB wallet not found for this account' });
    }

    if (user.transactionPin) {
      return res.status(400).json({ message: 'BNB PIN already set. Use reset-pin instead.' });
    }

    const hashedPin = hashPin(pin);
    const encryptedKey = encryptPrivateKey(user.ownerPrivateKey, pin);

    user.transactionPin = hashedPin;
    user.ownerPrivateKey = encryptedKey;
    user.pinSetupCompleted = true;
    await user.save();

    console.log(`✅ BNB PIN set for user: ${sanitizedEmail}`);
    res.json({ success: true, message: 'BNB transaction PIN set successfully!' });
  } catch (err) {
    console.error('❌ /bnb/set-pin:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/bnb/reset-pin ───────────────────────────────────────────────────
router.post('/reset-pin', async (req, res) => {
  try {
    const { email, oldPin, newPin } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    // Require OTP verified first (same pattern as L2)
    const OtpStore = require('../models/OtpStore');
    const otpRecord = await OtpStore.findOne({ email: sanitizedEmail, verified: true });
    if (!otpRecord || new Date() > otpRecord.expires)
      return res.status(401).json({ message: 'Please verify OTP first' });

    if (!oldPin || oldPin.length !== 4 || !newPin || newPin.length !== 4)
      return res.status(400).json({ message: 'PINs must be 4 digits' });

    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user || !user.transactionPin)
      return res.status(404).json({ message: 'BNB user not found' });

    if (!verifyPin(oldPin, user.transactionPin))
      return res.status(401).json({ message: 'Invalid old PIN' });

    const privateKey = decryptPrivateKey(user.ownerPrivateKey, oldPin);
    user.transactionPin = hashPin(newPin);
    user.ownerPrivateKey = encryptPrivateKey(privateKey, newPin);
    user.accountLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await OtpStore.deleteOne({ email: sanitizedEmail });

    res.json({
      success: true,
      message: 'BNB PIN reset. Account locked 24h.',
      lockedUntil: user.accountLockedUntil,
    });
  } catch (err) {
    console.error('❌ /bnb/reset-pin:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/bnb/user-status/:email ──────────────────────────────────────────
router.get('/user-status/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) return res.status(404).json({ message: 'Not found' });

    res.json({
      isSeller: user.isSeller || false,
      nameAlias: user.nameAlias || null,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});



module.exports = router;
