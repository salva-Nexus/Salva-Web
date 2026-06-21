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
    const { email } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) {
      await Promise.race([
        l1DB.readyPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('L1DB timeout')), 12000)
        ),
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
    const bnbRpcUrl = isProd
      ? process.env.BNB_MAINNET_RPC_URL
      : process.env.BNB_TESTNET_RPC_URL;

    if (!bnbRpcUrl) {
      return res.status(500).json({ message: 'BNB network not configured. Please contact support.' });
    }

    const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
    const bnbSignerWallet = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, bnbProvider);

    let ownerAddress, ownerPrivateKey, safeAddress, deploymentTx;
    let usedPendingSeed = false;

    if (baseUser.pendingBNBDeploy) {
      // ── PATH A: Use stored matching seed ──────────────────────────────────
      console.log(`🔁 [/bnb/register] Using stored pending seed for: ${sanitizedEmail}`);

      let seed;
      try {
        const { decryptPrivateKey } = require('../utils/encryption');
        const serverSecret = process.env.MANAGER_PRIVATE_KEY.slice(2, 10);
        const decrypted = decryptPrivateKey(baseUser.pendingBNBDeploy, serverSecret);
        seed = JSON.parse(decrypted);
      } catch (decErr) {
        console.error('❌ Failed to decrypt pending BNB seed:', decErr.message);
        // Fall through to PATH B — at least user gets a deployed BNB wallet,
        // even if keypairs won't match. Log clearly for monitoring.
        console.warn('⚠️  Falling back to fresh keypair generation due to decryption failure');
        seed = null;
      }

      if (seed && seed.ownerAddress && seed.ownerPrivateKey) {
        ownerAddress = seed.ownerAddress;
        ownerPrivateKey = seed.ownerPrivateKey;
        usedPendingSeed = true;

        // Deploy using the stored owner address
        const predictedSafe = {
          safeAccountConfig: { owners: [ownerAddress], threshold: 1 },
          safeDeploymentConfig: { safeVersion: '1.3.0' },
        };

        const protocolKit = await Safe.init({
          provider: bnbRpcUrl,
          signer: bnbSignerWallet.privateKey,
          predictedSafe,
        });

        safeAddress = await protocolKit.getAddress();
        console.log(`📍 [BNB/PATH-A] Predicted Safe: ${safeAddress}`);

        const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

        let txResponse;
        try {
          txResponse = await bnbSignerWallet.sendTransaction({
            to: deploymentTransaction.to,
            data: deploymentTransaction.data,
            value: deploymentTransaction.value || '0',
            gasLimit: 300_000,
          });
        } catch (err) {
          if (
            err.code === 'INSUFFICIENT_FUNDS' ||
            (err.message && err.message.includes('insufficient funds'))
          ) {
            return res.status(503).json({
              message: 'Network deployment temporarily unavailable. Please try again shortly.',
            });
          }
          return res.status(500).json({
            message: 'BNB deployment failed. Please try again.',
          });
        }

        console.log(`⏳ [BNB/PATH-A] Waiting for tx: ${txResponse.hash}`);
        await txResponse.wait();
        deploymentTx = txResponse.hash;

        // Verify contract code exists at the address
        await new Promise((r) => setTimeout(r, 3000));
        let code = await bnbProvider.getCode(safeAddress);
        if (code === '0x') {
          console.log(`🔄 [BNB/PATH-A] Node not synced — retrying verification...`);
          await new Promise((r) => setTimeout(r, 4000));
          code = await bnbProvider.getCode(safeAddress);
        }
        if (code === '0x') {
          return res.status(500).json({
            message: 'BNB Safe deployment failed — no code at address. Please try again.',
          });
        }
        console.log(`✅ [BNB/PATH-A] Safe verified: ${safeAddress}`);

      } else {
        // Seed was present but decryption failed — fall through to PATH B
        usedPendingSeed = false;
      }
    }

    if (!usedPendingSeed) {
      // ── PATH B: Legacy fresh deployment ───────────────────────────────────
      console.log(`🆕 [/bnb/register] Fresh keypair deployment for: ${sanitizedEmail}`);
      try {
        const identity = await generateAndDeploySalvaIdentityBNB();
        ownerAddress = identity.ownerAddress;
        ownerPrivateKey = identity.ownerPrivateKey;
        safeAddress = identity.safeAddress;
        deploymentTx = identity.deploymentTx;
      } catch (err) {
        console.error('❌ /bnb/register PATH B failed:', err.message);
        const msg = err.message || '';
        if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS')) {
          return res.status(503).json({
            message: 'Network temporarily unavailable. Please try again shortly.',
          });
        }
        if (msg.includes('no code at address')) {
          return res.status(500).json({ message: 'Deployment timed out. Please try again.' });
        }
        return res.status(500).json({ message: 'BNB wallet deployment failed. Please try again.' });
      }
    }

    // ── Save UserBNB record ───────────────────────────────────────────────────
    const newUserBNB = new UserBNB({
      email: sanitizedEmail,
      username: baseUser.username,
      safeAddress,
      ownerPrivateKey, // raw — BNBSetPin will encrypt it
    });
    await newUserBNB.save();

    // ── Clear pending seed now both chains have confirmed DB records ──────────
    if (usedPendingSeed) {
      try {
        await User.findOneAndUpdate(
          { email: sanitizedEmail },
          { $unset: { pendingBNBDeploy: '' } }
        );
        console.log(`🧹 Pending BNB seed cleared for: ${sanitizedEmail}`);
      } catch (cleanupErr) {
        // Non-fatal — seed is harmless at rest and retry path is idempotent
        console.warn(`⚠️  Could not clear pending BNB seed: ${cleanupErr.message}`);
      }
    }

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

// ── POST /api/bnb/set-pin ─────────────────────────────────────────────────────
router.post('/set-pin', async (req, res) => {
  try {
    const { email, pin } = req.body;
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin))
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });

    const sanitizedEmail = sanitizeEmail(email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) return res.status(404).json({ message: 'BNB user not found' });
    if (user.transactionPin) return res.status(400).json({ message: 'PIN already set' });

    user.transactionPin = hashPin(pin);
    user.ownerPrivateKey = encryptPrivateKey(user.ownerPrivateKey, pin);
    user.pinSetupCompleted = true;
    await user.save();

    res.json({ success: true });
  } catch (err) {
    console.error('❌ /bnb/set-pin:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/bnb/pin-status/:email ───────────────────────────────────────────
router.get('/pin-status/:email', async (req, res) => {
  try {
    const sanitizedEmail = sanitizeEmail(req.params.email);
    const l1DB = getL1DB();
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const UserBNB = getUserBNB();

    const user = await UserBNB.findOne({ email: sanitizedEmail });
    if (!user) return res.json({ hasPin: false });

    res.json({
      hasPin: !!user.transactionPin,
      isLocked: user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date(),
      lockedUntil: user.accountLockedUntil,
    });
  } catch (err) {
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

// ── POST /api/bnb/transfer ────────────────────────────────────────────────────
router.post('/transfer', async (req, res) => {
  try {
    const {
      userPrivateKey,
      safeAddress,
      toInput,
      amount,
      registryAddress,
      inputType,
      coin = 'NGNS',
      senderDisplayIdentifier,
    } = req.body;

    const isProd = process.env.NODE_ENV === 'production';

    let tokenAddress = resolveL1Token(coin);
    if (!tokenAddress) return res.status(400).json({ message: `Unknown coin: ${coin}` });

    // Resolve recipient
    let recipientAddress;
    let finalToInput = toInput.trim();

    if (finalToInput.startsWith('0x')) {
      if (!ethers.isAddress(finalToInput))
        return res.status(400).json({ message: 'Invalid address' });
      recipientAddress = finalToInput.toLowerCase();
    } else if (inputType === 'fullname') {
      // Resolve via Base chain registry (SNS is only on Base)
      const { resolveToAddress } = require('../services/registryResolver');
      recipientAddress = await resolveToAddress(
        finalToInput,
        process.env.REGISTRY_CONTRACT_ADDRESS
      );
    } else {
      return res
        .status(400)
        .json({
          message:
            'Only 0x addresses and full name aliases (e.g. name@salva) are supported on BNB transfers',
        });
    }

    // Fetch decimals from BNB PoolFactory
    const tokenDecimals = await getL1TokenDecimals(ethers.getAddress(tokenAddress)).catch(() => 18);
    const amountNum = parseFloat(amount);

    // Simple fee: same tier structure as L2 for NGN tokens, flat $0.015 for USD
    const FeeConfig = require('../models/FeeConfig');
    let feeHuman = 0;
    let feeWei = 0n;

    if (coin === 'USDT' || coin === 'USDC') {
      if (amountNum >= 5) {
        feeHuman = 0.015;
        feeWei = ethers.parseUnits('0.015', tokenDecimals);
      }
    } else {
      let config = await FeeConfig.findById('main');
      if (!config) config = await FeeConfig.create({ _id: 'main' });
      if (amountNum >= config.tier2Min) feeHuman = config.tier2Fee;
      else if (amountNum >= config.tier1Min) feeHuman = config.tier1Fee;
      if (feeHuman > 0) feeWei = ethers.parseUnits(feeHuman.toString(), tokenDecimals);
    }

    const actualAmountNum = amountNum - (feeHuman > 0 ? 0 : 0); // full amount to recipient
    const actualAmountWei = ethers.parseUnits(amountNum.toString(), tokenDecimals);

    const isProdTreasury = process.env.NODE_ENV === 'production';
    const treasuryAddress = isProdTreasury
      ? process.env.L1_TREASURY_CONTRACT_ADDRESS
      : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS;

    const result = await sponsorBNBTransfer(
      ethers.getAddress(safeAddress),
      userPrivateKey,
      ethers.getAddress(recipientAddress),
      actualAmountWei,
      feeWei,
      ethers.getAddress(tokenAddress),
      treasuryAddress ? ethers.getAddress(treasuryAddress) : ethers.ZeroAddress
    );

    if (!result || !result.txHash) return res.status(500).json({ message: 'Transfer failed' });

    const provider = getBNBProvider();
    const receipt = await provider.waitForTransaction(result.txHash, 1, 120_000);
    const success = receipt && receipt.status === 1;

    // Save tx record to L2 Transaction model (or create separate L1 tx collection — for now reuse)
    await Transaction.create({
      fromAddress: safeAddress.toLowerCase(),
      toAddress: recipientAddress.toLowerCase(),
      senderDisplayIdentifier: senderDisplayIdentifier || finalToInput,
      amount,
      fee: feeHuman > 0 ? String(feeHuman) : null,
      coin,
      status: success ? 'successful' : 'failed',
      taskId: result.txHash,
      type: 'transfer',
      date: new Date(),
    }).catch(() => {});

    if (!success) return res.status(400).json({ message: 'Transfer reverted on-chain' });
    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /bnb/transfer:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
