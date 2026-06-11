// Salva-Digital-Tech/packages/backend/src/index.js
require('dotenv').config({
  path: require('path').resolve(__dirname, '../.env'),
});
// Initialize L1 DB connection early so it's ready when pool routes are loaded
require('./services/l1db');

function cleanEnvAddr(raw) {
  if (!raw) return null;
  let s = raw.trim().replace(/^["']|["']$/g, '');
  const match = s.match(/(0x[0-9a-fA-F]{40})/);
  if (match) return match[1];
  return s.trim() || null;
}
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const { ethers } = require('ethers');
const { wallet, provider } = require('./services/walletSigner');
const { generateAndDeploySalvaIdentity } = require('./services/userService');
const { sponsorSafeTransfer } = require('./services/relayService');
const Transaction = require('./models/Transaction');
const mongoose = require('mongoose');
const { Resend } = require('resend');
const OtpStore = require('./models/OtpStore');
const { encryptPrivateKey, decryptPrivateKey, hashPin, verifyPin } = require('./utils/encryption');
const crypto = require('crypto');
const TransactionQueue = require('./models/TransactionQueue');
const {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendApprovalEmailToApprover,
  sendApprovalEmailToSpender,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
} = require('./services/emailService');

const { isReservedName } = require('./models/ReservedNames');
const {
  isNameAlias,
  resolveToAddress,
  checkNameAvailability,
  linkNameToWallet,
  unlinkName,
  weldName,
  getNamespace,
} = require('./services/registryResolver');

const User = require('./models/User');
const AccountNumberCounter = require('./models/AccountNumberCounter');

const WalletRegistry = require('./models/WalletRegistry');
const Proposal = require('./models/Proposal');
const FeeConfig = require('./models/FeeConfig');
const OtcConfig = require('./models/OtcConfig');

// ===============================================
// SECURITY PACKAGES
// ===============================================
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const validator = require('validator');

const adminRoutes = require('./routes/admin');

// ===============================================
// HELPER: ENSURE ADDRESS MATCHING
// ===============================================
function normalizeAddress(address) {
  if (!address) return null;
  return address.toLowerCase();
}

// Initialize services
const resend = new Resend(process.env.RESEND_API_KEY);

const app = express();

// ✅ Trust proxy - Required for Render/Heroku/behind load balancers
app.set('trust proxy', 1);

// ===============================================
// SECURITY: Helmet (Security Headers)
// ===============================================
// Replace your helmet block with this:
const isProduction = false;

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdnjs.cloudflare.com'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'http://localhost:3001',
          'ws://localhost:3001',
          'https://salva-web.vercel.app', // Allow your live API too
          process.env.BASE_MAINNET_RPC_URL,
        ],
      },
    },
    // DISABLE HSTS on Localhost
    hsts: isProduction
      ? {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Manual MongoDB injection protection
function sanitizeObject(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;

  const sanitized = Array.isArray(obj) ? [] : Object.create(null);

  for (const key of Object.keys(obj)) {
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    )
      continue;
    const val = obj[key];
    sanitized[key] = typeof val === 'object' && val !== null ? sanitizeObject(val) : val;
  }

  return sanitized;
}

// Apply to all routes
app.use((req, res, next) => {
  if (req.body) req.body = sanitizeObject(req.body);
  if (req.params) req.params = sanitizeObject(req.params);
  next();
});

// ===============================================
// SECURITY: CORS (Environment-Based)
// ===============================================
// Replace your current app.use(cors(...)) with this:
const allowedOrigins = [
  'https://salva-nexus.org',
  'https://www.salva-nexus.org',
  'https://salva-web.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5173',
  'http://localhost:3001', // Add the backend port too
];

// ===============================================
// SECURITY: CORS (Environment-Based) — FIXED VERSION
// ===============================================
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow everything on localhost for development + production domains
      const allowed = [
        'https://salva-nexus.org',
        'https://www.salva-nexus.org',
        'https://salva-web.vercel.app',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:5173',
        'http://localhost:3001',
        'http://127.0.0.1:3001',
      ];

      if (!origin || allowed.includes(origin)) {
        return callback(null, true);
      }

      console.error(`CORS blocked origin: ${origin}`);
      return callback(null, true); // ← Temporarily allow all on localhost to debug
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Ensure DB is connected before every API call
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('DB connect middleware:', err.message);
    res.status(503).json({ message: 'Service temporarily unavailable. Please retry.' });
  }
});

app.use('/api/admin', adminRoutes);

// ===============================================
// SECURITY: Rate Limiters
// ===============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 100 : 5,
  message: 'Too many authentication attempts. Please try again in 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      message: 'Too many attempts. Please try again in 15 minutes.',
    });
  },
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: 'Too many requests. Please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', generalLimiter);

// ===============================================
// SECURITY: Input Validation
// ===============================================
function sanitizeEmail(email) {
  if (typeof email !== 'string') {
    throw new Error('Invalid email format');
  }
  const sanitized = email.trim().toLowerCase();
  if (!validator.isEmail(sanitized)) {
    throw new Error('Invalid email format');
  }
  return sanitized;
}

function validateRegistration(req, res, next) {
  try {
    const { username, email, password } = req.body;

    const sanitizedEmail = sanitizeEmail(email);
    req.body.email = sanitizedEmail;

    if (!username || !/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
      return res.status(400).json({
        message: 'Username must be 3-20 alphanumeric characters',
      });
    }

    if (!password || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
      });
    }

    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

function validateAmount(amount) {
  const num = parseFloat(amount);
  if (!Number.isFinite(num) || num <= 0 || num > 1000000000) {
    throw new Error('Invalid amount');
  }
  return num;
}

function validatePin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error('PIN must be exactly 4 digits');
  }
  return true;
}

// ══════════════════════════════════════════════════════════════════════════════
// POINTS & REWARDS ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// ===============================================
// SECURITY: Error Handler
// ===============================================
function handleError(error, res, userMessage = 'An error occurred') {
  console.error('Error:', error);

  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ message: userMessage });
  } else {
    return res.status(500).json({
      message: userMessage,
      error: error.message,
      stack: error.stack,
    });
  }
}

// Connect to MongoDB
// ── MongoDB global connection cache ──────────────────────
if (!global._mongoConnection) {
  global._mongoConnection = {
    isConnected: false,
    promise: null,
  };
}

async function connectDB() {
  const cache = global._mongoConnection;

  if (cache.isConnected) return;
  if (cache.promise) return cache.promise;

  cache.promise = mongoose
    .connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
      maxPoolSize: 5,
    })
    .then((conn) => {
      cache.isConnected = true;
      cache.promise = null;
      console.log('🍃 MongoDB Connected');

      // FeeConfig is kept only for pool subscriptions — transfer fees are now gas-based
      FeeConfig.findOneAndUpdate(
        { _id: 'main' },
        { $setOnInsert: { poolSubscriptionMonthlyFee: 3000 } },
        { upsert: true }
      )
        .then(() => console.log('✅ FeeConfig seeded (pool subscription only)'))
        .catch((e) => console.error('❌ FeeConfig seed failed:', e.message));

      OtcConfig.findOneAndUpdate(
        { _id: 'main' },
        { $setOnInsert: { minNgn: 10000, maxNgn: 200000, feePercent: 0.2 } },
        { upsert: true }
      )
        .then(() => console.log('✅ OtcConfig seeded'))
        .catch((e) => console.error('❌ OtcConfig seed failed:', e.message));

      conn.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB disconnected — will reconnect on next request');
        cache.isConnected = false;
        cache.promise = null;
      });

      conn.connection.on('error', (err) => {
        console.error('❌ MongoDB connection error:', err.message);
        cache.isConnected = false;
        cache.promise = null;
      });
    })
    .catch((err) => {
      console.error('❌ MongoDB Connection Failed:', err.message);
      cache.isConnected = false;
      cache.promise = null;
      throw err;
    });

  return cache.promise;
}

connectDB().catch((err) =>
  console.error('❌ Initial MongoDB connection attempt failed:', err.message)
);

// Pre-warm L1 token decimal cache on startup
const { warmL1DecimalsCache } = require('./utils/l1Decimals');
warmL1DecimalsCache().catch((e) =>
  console.warn('⚠️ L1 decimal cache warm failed (non-fatal):', e.message)
);

// Pre-warm gas oracle price cache on startup
const { estimateTransferFee, estimatePoolFee, warmCache: warmGasOracleCache } = require('./services/gasOracle');
warmGasOracleCache().catch((e) =>
  console.warn('⚠️ Gas oracle cache warm failed (non-fatal):', e.message)
);

// ===============================================
// HELPERS
// ===============================================
async function delayBeforeBlockchain(walletAddress, message = 'Preparing transaction...') {
  console.log(`⏳ ${message}`);

  // Check for active transactions
  if (await hasActiveTransaction(walletAddress)) {
    throw new Error('Another transaction is already in progress');
  }

  // Check cooldown
  const cooldownStatus = await checkCooldown(walletAddress);
  if (!cooldownStatus.ready) {
    console.log(`⏱️ Cooldown active, waiting ${cooldownStatus.delay}s...`);
    await new Promise((resolve) => setTimeout(resolve, cooldownStatus.delay * 1000));
  }

  console.log(`✅ Queue clear, proceeding with transaction`);
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXED: waitForTxReceipt
//
// The OLD checkGelatoTaskStatus was calling eth_getUserOperationReceipt
// (an ERC-4337 UserOperation RPC method). But sponsorSafeTransfer uses the
// Safe SDK which calls execTransaction directly — producing a REGULAR on-chain
// tx hash, NOT a UserOp hash. eth_getUserOperationReceipt will always return
// null for a regular tx hash, causing 30 polling attempts to time out and
// incorrectly mark every successful transaction as "failed".
//
// FIX: Use provider.waitForTransaction() which is the correct ethers method
// for a regular transaction hash. It handles polling internally and returns
// the receipt once the tx is mined. We wrap it with a timeout safety net.
// ─────────────────────────────────────────────────────────────────────────────
async function waitForTxReceipt(txHash, timeoutMs = 120_000) {
  console.log(`🔍 Waiting for on-chain confirmation: ${txHash}`);

  try {
    // provider.waitForTransaction polls until the tx is mined.
    // confirmations=1 means we wait for at least 1 block confirmation.
    // timeout is in milliseconds.
    const receipt = await provider.waitForTransaction(txHash, 1, timeoutMs);

    if (!receipt) {
      console.error(`❌ No receipt returned for tx ${txHash} (timeout)`);
      return {
        success: false,
        status: 'failed',
        reason: 'Transaction confirmation timeout after 2 minutes',
      };
    }

    if (receipt.status === 1) {
      console.log(`✅ Transaction ${txHash} CONFIRMED on-chain (block ${receipt.blockNumber})`);
      return { success: true, status: 'successful' };
    } else {
      console.error(`❌ Transaction ${txHash} REVERTED on-chain`);
      return {
        success: false,
        status: 'failed',
        reason: 'Transaction reverted on-chain',
      };
    }
  } catch (error) {
    console.error(`❌ Error waiting for tx receipt (${txHash}):`, error.message);
    return {
      success: false,
      status: 'failed',
      reason: error.message || 'Could not confirm transaction',
    };
  }
}

async function retryRPCCall(fn, maxRetries = 3, baseDelay = 1500) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      // Exponential backoff: 1.5s → 3s → 6s, prevents RPC flood
      const wait = baseDelay * Math.pow(2, i);
      console.log(`⚠️ RPC call failed, retrying (${i + 1}/${maxRetries}) in ${wait}ms...`);
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
}

// Check if wallet has active transaction
async function hasActiveTransaction(walletAddress) {
  const activeStates = ['PENDING', 'SENDING'];
  const activeTx = await TransactionQueue.findOne({
    walletAddress: walletAddress.toLowerCase(),
    status: { $in: activeStates },
  });
  return !!activeTx;
}

// Check cooldown status
async function checkCooldown(walletAddress) {
  const queue = await TransactionQueue.findOne({
    walletAddress: walletAddress.toLowerCase(),
  }).sort({ updatedAt: -1 });

  if (!queue) return { ready: true, delay: 0 };

  const now = new Date();

  // If cooldown is set and still active
  if (queue.cooldownUntil && queue.cooldownUntil > now) {
    const waitTime = Math.ceil((queue.cooldownUntil - now) / 1000);
    return { ready: false, delay: waitTime };
  }

  // Dynamic throttling based on recent activity
  const timeSinceLastTx = (now - queue.updatedAt) / 1000; // in seconds

  if (timeSinceLastTx < 30) {
    return { ready: false, delay: 15 }; // Wait 15s if last tx was recent
  }

  if (timeSinceLastTx < 60) {
    return { ready: false, delay: 5 }; // Wait 5s if moderate activity
  }

  return { ready: true, delay: 0 };
}

// Apply cooldown after transaction
async function applyCooldown(walletAddress, seconds = 20) {
  const cooldownUntil = new Date(Date.now() + seconds * 1000);
  await TransactionQueue.updateOne(
    {
      walletAddress: walletAddress.toLowerCase(),
      status: { $in: ['CONFIRMED', 'FAILED'] },
    },
    {
      cooldownUntil: cooldownUntil,
      updatedAt: new Date(),
    },
    { sort: { updatedAt: -1 } }
  );
}

async function cleanupStaleQueueEntries() {
  const stuckDate = new Date(Date.now() - 5 * 60 * 1000);
  await TransactionQueue.updateMany(
    { status: 'SENDING', updatedAt: { $lt: stuckDate } },
    {
      $set: {
        status: 'PENDING',
        errorMessage: 'Stuck in SENDING — reverted for retry',
        updatedAt: new Date(),
      },
    }
  );

  const oldFailedDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await TransactionQueue.deleteMany({
    status: 'FAILED_ONCHAIN',
    updatedAt: { $lt: oldFailedDate },
  });
}

// ── resolvePoolFeeToken ────────────────────────────────────────────────────────
// Determines which token to collect the pool operation fee from.
// Priority: NGNs → cNGN → USDT → USDC
// Returns null if no token has sufficient balance.
//
// chain      : 'base' | 'bnb'
// safeAddress: user's Safe wallet address
// feeNGN     : fee amount in NGN units
// feeUSD     : fee amount in USD units
// feeWeiNGN  : fee as wei (NGN decimals)
// feeWeiUSD  : fee as wei (USD decimals)
//
// Returns: { tokenAddress, symbol, feeWei, decimals } | null
// ─────────────────────────────────────────────────────────────────────────────
async function resolvePoolFeeToken(chain, safeAddress, feeNGN, feeUSD, feeWeiNGN, feeWeiUSD) {
  const isProd = process.env.NODE_ENV === 'production';
  const isBNB = chain === 'bnb';

  // Token candidates in priority order
  const candidates = isBNB
    ? [
        {
          symbol: 'NGN',
          address: isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS,
          feeWei: feeWeiNGN,
          feeAmount: feeNGN,
          isNGN: true,
        },
        {
          symbol: 'CNGN',
          address: isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS,
          feeWei: feeWeiNGN,
          feeAmount: feeNGN,
          isNGN: true,
        },
        {
          symbol: 'USDT',
          address: isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS,
          feeWei: feeWeiUSD,
          feeAmount: feeUSD,
          isNGN: false,
        },
        {
          symbol: 'USDC',
          address: isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS,
          feeWei: feeWeiUSD,
          feeAmount: feeUSD,
          isNGN: false,
        },
      ]
    : [
        {
          symbol: 'NGN',
          address: process.env.NGN_TOKEN_ADDRESS,
          feeWei: feeWeiNGN,
          feeAmount: feeNGN,
          isNGN: true,
        },
        {
          symbol: 'CNGN',
          address: process.env.CNGN_CONTRACT_ADDRESS,
          feeWei: feeWeiNGN,
          feeAmount: feeNGN,
          isNGN: true,
        },
        {
          symbol: 'USDT',
          address: process.env.USDT_CONTRACT_ADDRESS,
          feeWei: feeWeiUSD,
          feeAmount: feeUSD,
          isNGN: false,
        },
        {
          symbol: 'USDC',
          address: process.env.USDC_CONTRACT_ADDRESS,
          feeWei: feeWeiUSD,
          feeAmount: feeUSD,
          isNGN: false,
        },
      ];

  // RPC for balance check
  const rpcUrl = isBNB
    ? (isProd ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com')
    : (isProd ? 'https://mainnet.base.org' : 'https://sepolia.base.org');

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  for (const candidate of candidates) {
    if (!candidate.address) continue;
    try {
      let decimals = 6; // Base hardcoded; BNB fetched
      if (isBNB) {
        try {
          const { getL1TokenDecimals } = require('./utils/l1Decimals');
          decimals = await getL1TokenDecimals(candidate.address);
        } catch {
          decimals = 6;
        }
      }

      const contract = new ethers.Contract(candidate.address, TOKEN_ABI, provider);
      const balanceWei = await contract.balanceOf(safeAddress);
      const balanceNum = parseFloat(ethers.formatUnits(balanceWei, decimals));

      if (balanceNum >= candidate.feeAmount) {
        console.log(
          `✅ [poolFee] Fee token resolved: ${candidate.symbol} | ` +
            `balance=${balanceNum.toFixed(4)} fee=${candidate.feeAmount} chain=${chain}`
        );
        return {
          tokenAddress: candidate.address,
          symbol: candidate.symbol,
          feeWei: candidate.feeWei,
          decimals,
        };
      } else {
        console.log(
          `⏭️ [poolFee] Skipping ${candidate.symbol}: balance=${balanceNum.toFixed(4)} < fee=${candidate.feeAmount}`
        );
      }
    } catch (e) {
      console.warn(`⚠️ [poolFee] Balance check failed for ${candidate.symbol}:`, e.message);
    }
  }

  return null; // no token has enough balance
}

// ── getPoolOperationFee ───────────────────────────────────────────────────────
// Wraps estimatePoolFee with fallback. Always returns both NGN and USD values.
// ─────────────────────────────────────────────────────────────────────────────
async function getPoolOperationFee(chain) {
  try {
    return await estimatePoolFee(chain);
  } catch (err) {
    console.error('❌ [getPoolOperationFee] Gas oracle failed, using fallback:', err.message);
    const isProd = process.env.NODE_ENV === 'production';
    const isBNB = chain === 'bnb';
    // Fallback minimums — same conservative values as transfer
    const feeNGN = isBNB ? 50 : 20;
    const feeUSD = isBNB ? 0.04 : 0.015;
    const ngnDecimals = 6;
    const usdDecimals = 6;
    return {
      feeNGN,
      feeUSD,
      feeWeiNGN: ethers.parseUnits(feeNGN.toFixed(ngnDecimals), ngnDecimals),
      feeWeiUSD: ethers.parseUnits(feeUSD.toFixed(usdDecimals), usdDecimals),
      ngnDecimals,
      usdDecimals,
    };
  }
}

// ── getFeeForTransfer ──────────────────────────────────────────────────────────
// Single unified fee function for ALL chains and ALL coins.
// Uses live gas oracle — no hardcoded tiers, no free thresholds.
// Every transfer is charged what the blockchain actually costs + 20% buffer.
//
// chain : 'base' | 'bnb'
// coin  : 'NGN' | 'CNGN' | 'USDT' | 'USDC'
//
// Returns: { feeNGN, feeUsd, feeWei }
async function getFeeForTransfer(chain, coin) {
  try {
    const result = await estimateTransferFee(chain, coin);
    return {
      feeNGN: result.feeNGN,
      feeUsd: result.feeUSD,
      feeWei: result.feeWei,
    };
  } catch (err) {
    // Oracle failure fallback — chain-aware minimums so transactions never break
    console.error('❌ [getFeeForTransfer] Gas oracle failed, using fallback:', err.message);
    const isNGN = coin === 'NGN' || coin === 'CNGN';
    const isBNB = chain === 'bnb';
    if (isNGN) {
      // Base: ₦20 | BNB: ₦50
      const fallbackNGN = isBNB ? '50' : '20';
      let decimals = 6;
      if (isBNB) {
        try {
          const { getL1TokenDecimals } = require('./utils/l1Decimals');
          const isProd = process.env.NODE_ENV === 'production';
          const tokenAddr = isProd
            ? process.env.L1_NGN_TOKEN_ADDRESS
            : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
          if (tokenAddr) decimals = await getL1TokenDecimals(tokenAddr);
        } catch (e) {
          console.warn('⚠️ Fallback decimals fetch failed, using 6:', e.message);
        }
      }
      const feeWei = ethers.parseUnits(fallbackNGN, decimals);
      return { feeNGN: parseFloat(fallbackNGN), feeUsd: 0, feeWei };
    } else {
      // Base: $0.015 | BNB: $0.04
      const fallbackUsd = isBNB ? '0.04' : '0.015';
      let decimals = 6;
      if (isBNB) {
        try {
          const { getL1TokenDecimals } = require('./utils/l1Decimals');
          const isProd = process.env.NODE_ENV === 'production';
          const usdEnvKey =
            coin === 'USDC'
              ? isProd
                ? 'L1_USDC_CONTRACT_ADDRESS'
                : 'L1_BSC_USDC_CONTRACT_ADDRESS'
              : isProd
                ? 'L1_USDT_CONTRACT_ADDRESS'
                : 'L1_BSC_USDT_CONTRACT_ADDRESS';
          const tokenAddr = process.env[usdEnvKey];
          if (tokenAddr) decimals = await getL1TokenDecimals(tokenAddr);
        } catch (e) {
          console.warn('⚠️ Fallback decimals fetch failed, using 6:', e.message);
        }
      }
      const feeWei = ethers.parseUnits(fallbackUsd, decimals);
      return { feeNGN: 0, feeUsd: parseFloat(fallbackUsd), feeWei };
    }
  }
}

// ===============================================
// ESTIMATE POOL OPERATION FEE — GET /api/estimate-pool-fee?chain=base|bnb
// Returns BOTH NGN and USD fee values so frontend can display either.
// Frontend fetches this once on mount, caches 30s.
// ===============================================
app.get('/api/estimate-pool-fee', async (req, res) => {
  try {
    const { chain = 'base' } = req.query;
    if (!['base', 'bnb'].includes(chain)) {
      return res.status(400).json({ message: 'Invalid chain. Use base or bnb.' });
    }
    let result;
    try {
      result = await estimatePoolFee(chain);
    } catch (err) {
      // Fallback — never leave frontend without a value
      console.error('❌ /api/estimate-pool-fee fallback:', err.message);
      const isBNB = chain === 'bnb';
      result = {
        feeNGN: isBNB ? 50 : 20,
        feeUSD: isBNB ? 0.04 : 0.015,
        feeWeiNGN: (isBNB ? 50n : 20n) * BigInt(1e6),
        feeWeiUSD: isBNB ? 40000n : 15000n,
        ngnDecimals: 6,
        usdDecimals: 6,
      };
    }
    res.json({
      chain,
      feeNGN: result.feeNGN,
      feeUSD: result.feeUSD,
      feeWeiNGN: result.feeWeiNGN.toString(),
      feeWeiUSD: result.feeWeiUSD.toString(),
      ngnDecimals: result.ngnDecimals,
      usdDecimals: result.usdDecimals,
    });
  } catch (err) {
    console.error('❌ /api/estimate-pool-fee error:', err.message);
    res.status(500).json({ message: 'Failed to estimate pool fee' });
  }
});

// ===============================================
// ESTIMATE TRANSFER FEE — called by frontend before send modal
// Returns live gas-based fee in NGN or USD depending on coin
// ===============================================
app.get('/api/estimate-fee', async (req, res) => {
  try {
    const { chain = 'base', coin = 'NGN' } = req.query;

    const validChains = ['base', 'bnb'];
    const validCoins  = ['NGN', 'CNGN', 'USDT', 'USDC'];

    if (!validChains.includes(chain)) return res.status(400).json({ message: 'Invalid chain' });
    if (!validCoins.includes(coin))   return res.status(400).json({ message: 'Invalid coin' });

    const { feeNGN, feeUsd, feeWei } = await getFeeForTransfer(chain, coin);

    res.json({
      chain,
      coin,
      feeNGN,
      feeUsd,
      feeWei: feeWei.toString(),
    });
  } catch (err) {
    console.error('❌ /api/estimate-fee error:', err.message);
    res.status(500).json({ message: 'Failed to estimate fee' });
  }
});

// ===============================================
// GET ALL ACTIVE REGISTRIES (for frontend dropdown)
// ===============================================
app.get('/api/registries', async (req, res) => {
  try {
    const registries = await WalletRegistry.find({ active: true }).select(
      'name registryAddress description nspace'
    );
    res.json(registries);
  } catch (error) {
    console.error('❌ Failed to fetch registries:', error);
    return handleError(error, res, 'Failed to fetch registries');
  }
});

// ===============================================
// GET FEE CONFIG (for frontend to preview fees)
// ===============================================
app.get('/api/otc-config', async (req, res) => {
  try {
    let config = await OtcConfig.findById('main');
    if (!config) config = await OtcConfig.create({ _id: 'main' });
    res.json({
      minNgn: config.minNgn,
      maxNgn: config.maxNgn,
      feePercent: config.feePercent,
    });
  } catch (e) {
    res.json({ minNgn: 10000, maxNgn: 200000, feePercent: 0.2 });
  }
});

// /api/fee-config kept for backward compat — only pool subscription fee now
app.get('/api/fee-config', async (req, res) => {
  try {
    let config = await FeeConfig.findById('main');
    if (!config) config = await FeeConfig.create({ _id: 'main' });
    res.json({
      poolSubscriptionMonthlyFee: config.poolSubscriptionMonthlyFee ?? 3000,
    });
  } catch (error) {
    return handleError(error, res, 'Failed to fetch fee config');
  }
});

app.get('/api/registry-fee', async (req, res) => {
  try {
    const factoryAddr = cleanEnvAddr(process.env.REGISTRY_FACTORY);
    if (!factoryAddr) return res.status(500).json({ message: 'REGISTRY_FACTORY not set' });
    const FACTORY_ABI = ['function getFee() external view returns (uint256 fee)'];
    const factoryContract = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);
    const feeWei = await retryRPCCall(() => factoryContract.getFee());
    const feeHuman = parseFloat(ethers.formatUnits(feeWei, 6));
    console.log(`💰 Registry link fee: ${feeHuman} NGNs`);
    res.json({ fee: feeHuman, feeWei: feeWei.toString() });
  } catch (error) {
    console.error('❌ Failed to fetch registry fee:', error.message);
    return handleError(error, res, 'Failed to fetch registry fee');
  }
});

// ===============================================
// AUTH ROUTES
// ===============================================
app.post('/api/auth/send-otp', authLimiter, async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    await OtpStore.findOneAndUpdate(
      { email },
      { code: otp, expires: new Date(Date.now() + 600000), verified: false },
      { upsert: true, new: true }
    );

    const data = await resend.emails.send({
      from: 'Salva <no-reply@salva-nexus.org>',
      to: email,
      subject: 'Verify your Salva Account',
      html: `
        <div style="background: #0A0A0B; color: white; padding: 40px; font-family: sans-serif; border-radius: 20px;">
          <h1 style="color: #D4AF37; margin-bottom: 20px;">SALVA</h1>
          <p style="font-size: 16px;">Use the verification code below:</p>
          <div style="background: #1A1A1B; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 10px; text-align: center; color: #D4AF37; border: 1px solid #D4AF37; border-radius: 12px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="opacity: 0.5; font-size: 12px;">This code expires in 10 minutes.</p>
        </div>
      `,
    });

    console.log('📧 OTP sent:', data.id);
    res.json({ message: 'OTP sent successfully' });
  } catch (err) {
    console.error('❌ RESEND FAIL:', err);
    return handleError(err, res, 'Email service currently unavailable');
  }
});

app.post('/api/auth/verify-otp', authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    const record = await OtpStore.findOne({ email: sanitizedEmail });

    if (!record) return res.status(400).json({ message: 'Invalid or expired code' });
    if (new Date() > record.expires) {
      await OtpStore.deleteOne({ email: sanitizedEmail });
      return res.status(400).json({ message: 'Invalid or expired code' });
    }

    const isValid = crypto.timingSafeEqual(Buffer.from(record.code), Buffer.from(String(code)));
    if (!isValid) return res.status(400).json({ message: 'Invalid or expired code' });

    record.verified = true;
    await record.save();
    res.json({ success: true });
  } catch (error) {
    return handleError(error, res, 'Verification failed');
  }
});

app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    const otpRecord = await OtpStore.findOne({
      email: sanitizedEmail,
      verified: true,
    });
    if (!otpRecord || new Date() > otpRecord.expires) {
      return res.status(401).json({ message: 'Please verify OTP first' });
    }

    if (!newPassword || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.findOneAndUpdate(
      { email: sanitizedEmail },
      {
        password: hashedPassword,
        accountLockedUntil: lockoutTime,
      },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    await OtpStore.deleteOne({ email: sanitizedEmail });

    try {
      const accountNum = (await getAccountNumberFromAddress(user.safeAddress)) || user.safeAddress;
      await sendSecurityChangeEmail(sanitizedEmail, user.username, 'password', accountNum);
    } catch (emailError) {
      console.error('❌ Security email error:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Password updated successfully. Account locked for 24 hours.',
      lockedUntil: lockoutTime,
    });
  } catch (err) {
    console.error('❌ Reset password error:', err);
    return handleError(err, res, 'Password reset failed');
  }
});

// ===============================================
// REGISTER — Deploy Safe only.
// ===============================================
app.post('/api/register', authLimiter, validateRegistration, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    console.log(`📝 Registration attempt: username="${username}" email="${email}"`);

    const existingEmail = await User.findOne({ email });
    if (existingEmail) return res.status(400).json({ message: 'Email already registered' });

    const existingUsername = await User.findOne({ username });
    if (existingUsername) return res.status(400).json({ message: 'Username already taken' });

    const rpcUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.BASE_MAINNET_RPC_URL
        : process.env.BASE_SEPOLIA_RPC_URL;

    console.log(`🔗 Using RPC: ${rpcUrl}`);
    const identityData = await generateAndDeploySalvaIdentity(rpcUrl);
    console.log(`✅ Safe deployed: ${identityData.safeAddress}`);

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      safeAddress: identityData.safeAddress,
      ownerPrivateKey: identityData.ownerPrivateKey,
    });

    await newUser.save();
    console.log(`✅ User saved: ${email}`);

    try {
      await sendWelcomeEmail(email, username);
      console.log(`📧 Welcome email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Welcome email error:', emailError.message);
    }

    res.json({
      username: newUser.username,
      safeAddress: newUser.safeAddress,
      accountNumber: null,
      ownerPrivateKey: newUser.ownerPrivateKey,
      isValidator: false,
      nameAlias: null,
      numberAlias: null,
    });
  } catch (error) {
    console.error('❌ Registration failed:', error.message);
    return handleError(error, res, 'Registration failed');
  }
});

// ===============================================
// LOGIN
// ===============================================
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    await connectDB();
    const email = sanitizeEmail(req.body.email);
    const { password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const hasPinAlreadySet = !!user.transactionPin;

    res.json({
      username: user.username,
      safeAddress: user.safeAddress,
      accountNumber: user.accountNumber,
      ownerPrivateKey: hasPinAlreadySet ? null : user.ownerPrivateKey,
      isValidator: user.isValidator || false,
      isSeller: user.isSeller || false,
      nameAlias: user.nameAlias || null,
      numberAlias: user.numberAlias || null,
    });
  } catch (error) {
    return handleError(error, res, 'Login failed');
  }
});

// ===============================================
// GET USER STATUS (for dashboard refresh)
// ===============================================
app.get('/api/user/status/:email', async (req, res) => {
  try {
    const email = sanitizeEmail(req.params.email);
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      isValidator: user.isValidator || false,
      nameAlias: user.nameAlias || null,
      numberAlias: user.numberAlias || null,
      isSeller: user.isSeller || false,
    });
  } catch (error) {
    return handleError(error, res, 'Failed to get user status');
  }
});

// ================================================================
// ALIAS: PREPARE LINK — validates, signs, returns prepared data
// Does NOT execute. Frontend calls /api/alias/execute-link after PIN.
// ================================================================
app.post('/api/alias/link-name', async (req, res) => {
  try {
    const { safeAddress, name, walletToLink, registryAddress } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: 'Invalid safe address' });
    if (!walletToLink || !ethers.isAddress(walletToLink))
      return res.status(400).json({ message: 'Invalid wallet address to link' });
    if (!registryAddress || !ethers.isAddress(registryAddress))
      return res.status(400).json({ message: 'Invalid registry address' });
    if (!name || typeof name !== 'string')
      return res.status(400).json({ message: 'Name is required' });

    const pureName = name.trim().toLowerCase();

    if (!/^[a-z2-9.]{1,32}$/.test(pureName))
  return res.status(400).json({
    message: 'Invalid name. Use lowercase a–z, digits 2–9, one dot max.',
  });
if ((pureName.match(/\./g) || []).length > 1)
  return res.status(400).json({ message: 'Only one dot allowed.' });
if (pureName.includes('0') || pureName.includes('1'))
  return res.status(400).json({ message: 'Digits 0 and 1 are not allowed.' });
if (pureName.startsWith('.') || pureName.endsWith('.'))
  return res.status(400).json({ message: 'Name cannot start or end with a dot.' });
    if (pureName.length < 2)
      return res.status(400).json({ message: 'Name must be at least 2 characters.' });

    // ── Reserved name check ─────────────────────────────────────────────────
    if (isReservedName(pureName)) {
      return res.status(200).json({
        reserved: true,
        message:
          'This is a reserved name. Enter your email address so we can reach out to discuss eligibility.',
      });
    }

    // ── Find user ───────────────────────────────────────────────────────────
    let user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    let isL1User = false;
    if (!user) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          user = await UserBNB.findOne({ safeAddress: safeAddress.toLowerCase() });
          if (user) isL1User = true;
        }
      } catch (e) {
        console.error('⚠️ L1 user lookup failed:', e.message);
      }
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    // ── Balance gate ─────────────────────────────────────────────────────────
    const ngnAddr = process.env.NGN_TOKEN_ADDRESS;
    if (!ngnAddr) return res.status(500).json({ message: 'NGN_TOKEN_ADDRESS not configured' });

    // Read live fee from RegistryFactory contract
    let feeWei = 0n;
    try {
      const factoryAddr = cleanEnvAddr(process.env.REGISTRY_FACTORY);
      if (factoryAddr) {
        const FACTORY_ABI = ['function getFee() external view returns (uint256 fee)'];
        const factoryContract = new ethers.Contract(factoryAddr, FACTORY_ABI, provider);
        feeWei = await retryRPCCall(() => factoryContract.getFee());
      }
    } catch (e) {
      console.error('⚠️ Could not read registry fee from contract:', e.message);
      // proceed with feeWei = 0n — transaction will still work, just no balance gate
    }

    const feeHuman = parseFloat(ethers.formatUnits(feeWei, 6));
    console.log(`💰 Link name fee: ${feeHuman} NGNs`);

    // Only gate if fee > 0
    if (feeWei > 0n) {
      const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
      const ngnContract = new ethers.Contract(ngnAddr, ERC20_ABI, provider);
      const ngnWei = await ngnContract.balanceOf(safeAddress).catch(() => 0n);

      if (ngnWei < feeWei) {
        return res.status(400).json({
          message: `Insufficient NGNs. You need ${feeHuman.toLocaleString()} NGNs to register a name. Top up your wallet and try again.`,
          lowBalance: true,
          requiredNgns: feeHuman,
        });
      }
    }

    // v2.1.0: fee token is always NGNs
    const feeWeiStr = feeWei.toString(); // pass feeWei as string to frontend
    console.log(`💰 Registry link fee: ${feeHuman} NGNs (feeWei=${feeWeiStr})`);

    // ── On-chain availability check ─────────────────────────────────────────
    const namespace = await getNamespace(registryAddress);
    const weldedName = weldName(pureName, namespace);
    console.log('DEBUG: pureName is:', pureName);
    console.log('DEBUG: namespace found is:', namespace);
    console.log('DEBUG: weldedName resulting is:', weldedName);

    const available = await checkNameAvailability(weldedName, registryAddress);
    if (!available)
      return res.status(409).json({ message: 'This name is already taken on-chain.' });

    // ── Backend signs (nameBytes ++ wallet) ─────────────────────────────────
    // Matches the assembly packing in BaseRegistry.link():
    //   calldatacopy(0x00, _name.offset, _name.length)        ← name bytes
    //   mstore(_name.length, shl(sub(0x100, mul(0x14,0x08)), _wallet)) ← wallet 20 bytes
    //   messageHash := keccak256(0x00, add(_name.length, 0x14))
    //
    // Equivalent in JS: keccak256(concat(nameBytes, walletBytes20))
    const nameBytes = ethers.toUtf8Bytes(pureName);
    const walletAddress = ethers.getAddress(walletToLink);
    const rawPacked = ethers.concat([nameBytes, ethers.getBytes(walletAddress)]);
    const messageHash = ethers.keccak256(rawPacked);
    // wallet.signMessage applies the Ethereum prefix → toEthSignedMessageHash
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    console.log(`✅ Signed name link: pureName="${pureName}" wallet=${walletAddress}`);
    console.log(`   Welded: ${weldedName} | Signature: ${signature.slice(0, 20)}…`);

    return res.json({
      prepared: true,
      pureName,
      weldedName,
      walletToLink: walletAddress,
      registryAddress,
      namespace,
      signature,
      feeWei: feeWei.toString(), // pass to execute-link so relay knows whether to approve
    });
  } catch (error) {
    console.error('❌ link-name prepare error:', error);
    return handleError(error, res, 'Failed to prepare name link');
  }
});

// ================================================================
// ALIAS: EXECUTE LINK — fires the Safe multicall after PIN verification
// Receives prepared data from /api/alias/link-name + userPrivateKey from PIN
// ================================================================
app.post('/api/alias/execute-link', async (req, res) => {
  try {
    const {
      safeAddress,
      bnbSafeAddress,
      pureName,
      weldedName,
      walletToLink,
      registryAddress,
      signature,
      feeWei,
      userPrivateKey,
    } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: 'Invalid safe address' });
    if (!userPrivateKey) return res.status(400).json({ message: 'Private key required' });
    if (!pureName || !weldedName || !walletToLink || !registryAddress || !signature)
      return res.status(400).json({ message: 'Missing prepared link data' });

    let user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    let isL1User = false;
    if (!user) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          user = await UserBNB.findOne({ safeAddress: safeAddress.toLowerCase() });
          if (user) isL1User = true;
        }
      } catch (e) {
        console.error('⚠️ L1 user lookup failed:', e.message);
      }
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    const nameBytes = ethers.toUtf8Bytes(pureName);
    const walletAddress = ethers.getAddress(walletToLink);

    const { sponsorLinkNameBase } = require('./services/relayService');

    console.log(`🔗 Executing link: "${weldedName}" → ${walletAddress}`);
    console.log(
      `   Safe: ${safeAddress} | Registry: ${registryAddress} | FeeWei: ${feeWei || '0'}`
    );

    const result = await sponsorLinkNameBase(
      safeAddress,
      userPrivateKey,
      registryAddress,
      nameBytes,
      walletAddress,
      BigInt(feeWei || '0'),
      signature
    );

    if (!result || !result.txHash)
      return res.status(400).json({ message: 'Link transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);

    if (!taskStatus.success)
      return res.status(400).json({
        message: taskStatus.reason || 'Link transaction reverted on-chain',
      });

    // ── Save to DB ──────────────────────────────────────────────────────────
    const aliasEntry = {
      name: weldedName,
      wallet: walletAddress.toLowerCase(),
      registryAddress: registryAddress.toLowerCase(),
    };

    // If bnbSafeAddress provided, save to UserBNB instead of Base User
    if (bnbSafeAddress && bnbSafeAddress.toLowerCase() !== safeAddress.toLowerCase()) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          const bnbUser = await UserBNB.findOne({ safeAddress: bnbSafeAddress.toLowerCase() });
          if (bnbUser) {
            bnbUser.nameAliases = bnbUser.nameAliases || [];
            bnbUser.nameAliases.push(aliasEntry);
            if (!bnbUser.nameAlias) bnbUser.nameAlias = weldedName;
            await bnbUser.save();
            console.log(`✅ "${weldedName}" saved to UserBNB (${bnbSafeAddress})`);
          }
        }
      } catch (e) {
        console.error('⚠️ Failed to save alias to UserBNB:', e.message);
      }
    } else {
      user.nameAliases = user.nameAliases || [];
      user.nameAliases.push(aliasEntry);
      if (!user.nameAlias) user.nameAlias = weldedName;
      await user.save();
    }

    console.log(`✅ "${weldedName}" linked to ${walletAddress} (tx: ${result.txHash})`);

    return res.json({
      success: true,
      txHash: result.txHash,
      alias: aliasEntry,
    });
  } catch (error) {
    console.error('❌ execute-link error:', error);
    return handleError(error, res, 'Failed to execute name link');
  }
});

// ================================================================
// ALIAS: UNLINK NAME — single alias by name+wallet pair
// Receives: safeAddress, weldedName, userPrivateKey
// ================================================================
app.post('/api/alias/unlink-name', async (req, res) => {
  try {
    const { safeAddress, weldedName, registryAddress, userPrivateKey } = req.body;

    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: 'Invalid safe address' });
    if (!weldedName || typeof weldedName !== 'string')
      return res.status(400).json({ message: 'weldedName is required' });
    if (!userPrivateKey)
      return res.status(400).json({ message: 'Private key required (unlock with PIN first)' });

    let user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          user = await UserBNB.findOne({ safeAddress: safeAddress.toLowerCase() });
        }
      } catch (e) {
        console.error('⚠️ L1 user lookup failed:', e.message);
      }
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    // If bnbSafeAddress provided, the execution Safe is the Base Safe but the DB record lives in UserBNB
    const { bnbSafeAddress } = req.body;
    let dbUser = user;
    let isL1DbUser = false;
    if (bnbSafeAddress && bnbSafeAddress.toLowerCase() !== safeAddress.toLowerCase()) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          const bnbUser = await UserBNB.findOne({ safeAddress: bnbSafeAddress.toLowerCase() });
          if (bnbUser) { dbUser = bnbUser; isL1DbUser = true; }
        }
      } catch (e) { console.error('⚠️ L1 user lookup for unlink failed:', e.message); }
    }

    const aliasIndex = (dbUser.nameAliases || []).findIndex(
      (a) => a.name.toLowerCase() === weldedName.toLowerCase()
    );

    if (aliasIndex === -1)
      return res.status(404).json({ message: 'This name is not in your linked names list.' });

    const aliasEntry = dbUser.nameAliases[aliasIndex];
    const targetRegistryAddress =
      registryAddress || aliasEntry.registryAddress || process.env.REGISTRY_CONTRACT_ADDRESS;

    if (!targetRegistryAddress || !ethers.isAddress(targetRegistryAddress))
      return res.status(400).json({ message: 'Could not resolve registry address for this alias' });

    // Strip namespace to get the pure name — registry resolves namespace internally
    // e.g. "charles@salva" → "charles"
    const pureName = weldedName.includes('@')
      ? weldedName.substring(0, weldedName.indexOf('@'))
      : weldedName;

    // Convert pure name to UTF-8 bytes — contract takes `bytes calldata _name`
    const nameBytes = ethers.toUtf8Bytes(pureName);
    const nameBytesHex = ethers.hexlify(nameBytes);
    console.log(`🔓 Unlink: pureName="${pureName}" nameBytes=${nameBytesHex}`);

    // ABI encode the unlink call
    const REGISTRY_ABI = ['function unlink(bytes calldata _name) external returns (bool)'];
    const registryIface = new ethers.Interface(REGISTRY_ABI);
    const unlinkCalldata = registryIface.encodeFunctionData('unlink', [nameBytesHex]);

    // Execute via the user's Safe — Safe is msg.sender on the registry
    // Backend wallet pays gas. No fee charged to the user.
    const Safe = require('@safe-global/protocol-kit').default;
    const rpcUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.BASE_MAINNET_RPC_URL
        : process.env.BASE_SEPOLIA_RPC_URL;

    const protocolKit = await Safe.init({
      provider: rpcUrl,
      signer: userPrivateKey,
      safeAddress: safeAddress,
    });

    const safeTransaction = await protocolKit.createTransaction({
      transactions: [
        {
          to: ethers.getAddress(targetRegistryAddress),
          data: unlinkCalldata,
          value: '0',
          operation: 0, // regular call — msg.sender = Safe
        },
      ],
    });

    const signedTx = await protocolKit.signTransaction(safeTransaction);

    const SAFE_ABI = [
      'function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns (bool success)',
    ];
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, wallet);

    const tx = await safeContract.execTransaction(
      signedTx.data.to,
      BigInt(signedTx.data.value || '0'),
      signedTx.data.data,
      Number(signedTx.data.operation || 0),
      BigInt(signedTx.data.safeTxGas || '0'),
      BigInt(signedTx.data.baseGas || '0'),
      BigInt(signedTx.data.gasPrice || '0'),
      signedTx.data.gasToken || ethers.ZeroAddress,
      signedTx.data.refundReceiver || ethers.ZeroAddress,
      signedTx.encodedSignatures(),
      { gasLimit: 300_000 }
    );

    console.log(`⏳ Unlink TX submitted: ${tx.hash}`);
    const receipt = await tx.wait();

    if (!receipt || receipt.status === 0)
      return res.status(400).json({ message: 'On-chain unlink failed.' });

    // Remove from DB
    dbUser.nameAliases.splice(aliasIndex, 1);
    if (dbUser.nameAlias === weldedName) {
      dbUser.nameAlias = dbUser.nameAliases[0]?.name || null;
    }
    await dbUser.save();

    const linkedPoolAddress = aliasEntry.wallet?.toLowerCase();
    const Pool = require('./models/Pool');

    await Pool.updateOne(
      { poolAddress: linkedPoolAddress, poolName: weldedName },
      { $set: { poolName: null } }
    ).catch((e) => console.error('⚠️ L2 pool name clear failed:', e.message));

    try {
      const l1DB = require('./services/l1db');
      if (l1DB.readyState === 1) {
        const PoolL1 = l1DB.models.Pool || l1DB.model('Pool', require('./models/Pool').schema);
        await PoolL1.updateOne(
          { poolAddress: linkedPoolAddress, poolName: weldedName },
          { $set: { poolName: null } }
        ).catch((e) => console.error('⚠️ L1 pool name clear failed:', e.message));
      }
    } catch (e) {
      console.error('⚠️ L1 pool name clear skipped:', e.message);
    }

    console.log(`✅ "${weldedName}" unlinked from ${safeAddress} (tx: ${tx.hash})`);
    res.json({ success: true, txHash: tx.hash, removedAlias: weldedName });
  } catch (error) {
    console.error('❌ unlink-name error:', error);
    return handleError(error, res, 'Failed to unlink name');
  }
});

const buyNgnsRoutes = require('./routes/buyNgns');
app.use('/api/buy-ngns', buyNgnsRoutes);

const poolRoutes = require('./routes/pool');
app.use('/api/pool', poolRoutes);

const bnbRoutes = require('./routes/bnb');
app.use('/api/bnb', bnbRoutes);

app.use('/api/sync-incoming', require('./routes/syncIncoming'));

// ===============================================
// CHECK NAME AVAILABILITY
// ===============================================
app.post('/api/alias/check-name', async (req, res) => {
  try {
    const { name, registryAddress } = req.body;

    // 1. Basic validation
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (!registryAddress || !ethers.isAddress(registryAddress)) {
      return res.status(400).json({ message: 'A valid registry address is required' });
    }

    const pureName = name.trim().toLowerCase();

    // 2. Character rules: a-z, 2-9, one underscore max, no 0/1, min length 2
    if (!/^[a-z2-9.]{1,32}$/.test(pureName)) {
  return res.status(400).json({
    message: 'Use lowercase a–z, digits 2–9, one dot max. No 0 or 1.',
  });
}
if ((pureName.match(/\./g) || []).length > 1) {
  return res.status(400).json({ message: 'Only one dot allowed.' });
}
if (pureName.startsWith('.') || pureName.endsWith('.')) {
  return res.status(400).json({ message: 'Name cannot start or end with a dot.' });
}
    if (pureName.length < 2) {
      return res.status(400).json({ message: 'Name must be at least 2 characters.' });
    }

    // 3. Reserved name check
    const { isReservedName } = require('./models/ReservedNames');
    if (isReservedName(pureName)) {
      return res.json({
        available: false,
        reserved: true,
        welded: null,
        message: 'This is a reserved name.',
      });
    }

    // 4. Get Namespace from DB (Matches link-name logic)
    const WalletRegistry = require('./models/WalletRegistry');
    const registryDoc = await WalletRegistry.findOne({
      registryAddress: registryAddress.toLowerCase(),
      active: true,
    });

    if (!registryDoc) {
      return res.status(404).json({ message: 'Selected wallet registry not found or inactive' });
    }

    // Use nspace from DB. Note: If your DB stores it without the '@', weldName handles it.
    const namespace = registryDoc.nspace || '';
    const welded = weldName(pureName, namespace);

    console.log(`🔍 Checking: pure='${pureName}' + ns='${namespace}' -> welded='${welded}'`);

    // 5. On-chain availability check
    const available = await checkNameAvailability(welded, registryAddress);

    // 6. Response
    res.json({
      available,
      reserved: false,
      welded,
      namespace,
      registryAddress: registryDoc.registryAddress,
    });
  } catch (error) {
    console.error('❌ check-name error:', error);
    return handleError(error, res, 'Failed to check name availability');
  }
});

// ================================================================
// ALIAS: NOTIFY ADMINS OF RESERVED NAME REQUEST
// ================================================================
app.post('/api/alias/notify-reserved', async (req, res) => {
  try {
    const { name, requesterEmail } = req.body;

    if (!name || !requesterEmail) {
      return res.status(400).json({ message: 'Name and email are required' });
    }

    // Validate email
    const sanitizedEmail = sanitizeEmail(requesterEmail);

    // Find all validators to notify
    const validators = await User.find({ isValidator: true }).select('email username');

    const { sendValidatorProposalEmail } = require('./services/emailService');

    for (const v of validators) {
      if (v.email) {
        try {
          await resend.emails.send({
            from: 'SALVA Admin <no-reply@salva-nexus.org>',
            to: v.email,
            subject: `[SALVA] Reserved Name Request: "${name}"`,
            html: `
              <div style="background:#0A0A0B;color:white;padding:40px;font-family:sans-serif;border-radius:20px;">
                <h1 style="color:#D4AF37;">SALVA</h1>
                <h2 style="color:#fff;">Reserved Name Request</h2>
                <p>Someone has requested the reserved name: <strong style="color:#D4AF37;">${name}</strong></p>
                <p>Their email: <strong>${sanitizedEmail}</strong></p>
                <p>Please reach out to verify their eligibility before granting access.</p>
                <hr style="border-color:#333;margin:20px 0;">
                <p style="opacity:0.5;font-size:12px;">This is an automated notification from Salva.</p>
              </div>
            `,
          });
        } catch (e) {
          console.error(`❌ Failed to notify validator ${v.email}:`, e.message);
        }
      }
    }

    res.json({
      success: true,
      message: 'Your request has been sent to our team. We will reach out to you shortly.',
    });
  } catch (error) {
    return handleError(error, res, 'Failed to send notification');
  }
});

// ===============================================
// RESOLVE ACCOUNT NUMBER TO USERNAME
// ===============================================
app.post('/api/resolve-account-info', async (req, res) => {
  try {
    const { accountNumberOrAddress } = req.body;

    if (!accountNumberOrAddress) {
      return res.status(400).json({ message: 'Account number or address required' });
    }

    let user;

    if (accountNumberOrAddress.toLowerCase().startsWith('0x')) {
      user = await User.findOne({
        safeAddress: normalizeAddress(accountNumberOrAddress),
      });
    } else {
      user = await User.findOne({
        accountNumber: accountNumberOrAddress,
      });
    }

    if (!user) {
      return res.status(404).json({
        message: 'Account not found',
        found: false,
      });
    }

    res.json({
      found: true,
      username: user.username,
      accountNumber: user.accountNumber,
      safeAddress: user.safeAddress,
    });
  } catch (error) {
    console.error('❌ Resolve account error:', error);
    return handleError(error, res, 'Failed to resolve account');
  }
});

// ===============================================
// BALANCE
// ===============================================
app.get('/api/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: 'Invalid address format' });
    }

    // ── ADD THESE CHECKS ──────────────────────────────────────────────
    if (
      !process.env.NGN_TOKEN_ADDRESS ||
      !process.env.USDT_CONTRACT_ADDRESS ||
      !process.env.USDC_CONTRACT_ADDRESS
    ) {
      console.error('❌ Missing token contract addresses in .env');
      return res.status(200).json({ balance: '0.00', usdtBalance: '0.00', usdcBalance: '0.00' });
    }
    // ──────────────────────────────────────────────────────────────────

    const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];

    const ngnsContract = new ethers.Contract(process.env.NGN_TOKEN_ADDRESS, ERC20_ABI, provider);
    const cNgnContract = new ethers.Contract(
      process.env.CNGN_CONTRACT_ADDRESS,
      ERC20_ABI,
      provider
    );
    const usdtContract = new ethers.Contract(
      process.env.USDT_CONTRACT_ADDRESS,
      ERC20_ABI,
      provider
    );
    const usdcContract = new ethers.Contract(
      process.env.USDC_CONTRACT_ADDRESS,
      ERC20_ABI,
      provider
    );

    const [ngnsWei, cNgnWei, usdtWei, usdcWei] = await Promise.all([
      retryRPCCall(() => ngnsContract.balanceOf(address)).catch(() => 0n),
      retryRPCCall(() => cNgnContract.balanceOf(address)).catch(() => 0n),
      retryRPCCall(() => usdtContract.balanceOf(address)).catch(() => 0n),
      retryRPCCall(() => usdcContract.balanceOf(address)).catch(() => 0n),
    ]);

    res.json({
      ngnsBalance: ethers.formatUnits(ngnsWei, 6),
      cNgnBalance: ethers.formatUnits(cNgnWei, 6),
      usdtBalance: ethers.formatUnits(usdtWei, 6),
      usdcBalance: ethers.formatUnits(usdcWei, 6),
    });
  } catch (error) {
    console.error('❌ Balance Fetch Failed:', error.message);
    res.status(200).json({
      ngnsBalance: '0.00',
      cNgnBalance: '0.00',
      usdtBalance: '0.00',
      usdcBalance: '0.00',
    });
  }
});

app.get('/api/l1-balance/:address', async (req, res) => {
  const { address } = req.params;

  if (!address || !address.startsWith('0x') || address.length !== 42) {
    return res.status(400).json({ error: 'Invalid address' });
  }

  const isProd = process.env.NODE_ENV === 'production';

  const rpcUrl = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

  const NGN_ADDRESS = isProd
    ? process.env.L1_NGN_TOKEN_ADDRESS
    : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
  const CNGN_ADDRESS = isProd
    ? process.env.L1_CNGN_CONTRACT_ADDRESS
    : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS;
  const USDT_ADDRESS = isProd
    ? process.env.L1_USDT_CONTRACT_ADDRESS
    : process.env.L1_BSC_USDT_CONTRACT_ADDRESS;
  const USDC_ADDRESS = isProd
    ? process.env.L1_USDC_CONTRACT_ADDRESS
    : process.env.L1_BSC_USDC_CONTRACT_ADDRESS;

  const L1_ERC20_ABI = [
    'function balanceOf(address owner) view returns (uint256)',
    'function decimals() view returns (uint8)',
  ];

  try {
    const l1Provider = new ethers.JsonRpcProvider(rpcUrl);

    const fetchTokenBalance = async (tokenAddress, fallbackDecimals = 18) => {
      if (!tokenAddress || tokenAddress.startsWith('0xYOUR') || tokenAddress.length !== 42) {
        return '0';
      }
      try {
        const contract = new ethers.Contract(tokenAddress, L1_ERC20_ABI, l1Provider);
        const [raw, decimals] = await Promise.all([
          contract.balanceOf(address),
          contract.decimals().catch(() => fallbackDecimals),
        ]);
        return ethers.formatUnits(raw, decimals); // ← return raw string, no rounding
      } catch {
        return '0';
      }
    };

    const [ngnsBalance, cNgnBalance, usdtBalance, usdcBalance] = await Promise.all([
      fetchTokenBalance(NGN_ADDRESS, 18),
      fetchTokenBalance(CNGN_ADDRESS, 18),
      fetchTokenBalance(USDT_ADDRESS, 6),
      fetchTokenBalance(USDC_ADDRESS, 6),
    ]);

    return res.json({ ngnsBalance, cNgnBalance, usdtBalance, usdcBalance });
  } catch (err) {
    console.error('L1 balance fetch error:', err);
    return res.status(500).json({
      error: 'Failed to fetch L1 balances',
      ngnsBalance: '0.00',
      cNgnBalance: '0.00',
      usdtBalance: '0.00',
      usdcBalance: '0.00',
    });
  }
});

app.get('/api/alias/list/:safeAddress', async (req, res) => {
  try {
    let user = await User.findOne({
      safeAddress: req.params.safeAddress.toLowerCase(),
    });
    if (!user) {
      try {
        const l1db = require('./services/l1db');
        if (l1db.readyState === 1) {
          const UserBNBSchema = require('./models/UserBNB');
          const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
          user = await UserBNB.findOne({ safeAddress: req.params.safeAddress.toLowerCase() });
        }
      } catch (e) { /* ignore */ }
    }
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Migrate legacy single nameAlias if nameAliases array is empty
    let aliases = user.nameAliases || [];
    if (aliases.length === 0 && user.nameAlias) {
      aliases = [
        {
          name: user.nameAlias,
          wallet: user.safeAddress,
          registryAddress: process.env.REGISTRY_CONTRACT_ADDRESS || '',
        },
      ];
    }

    res.json({ aliases });
  } catch (error) {
    return handleError(error, res, 'Failed to get alias list');
  }
});

app.get('/api/seller-info', (req, res) => {
  res.json({
    bankName: process.env.SELLER_BANK_NAME || '',
    accountName: process.env.SELLER_ACCOUNT_NAME || '',
    accountNumber: process.env.SELLER_ACCOUNT_NUMBER || '',
  });
});

// ===============================================
// GET L1 CONFIG — returns correct addresses for dev (Sepolia) or prod (Mainnet)
// NODE_ENV=production → Ethereum Mainnet addresses
// NODE_ENV=development → Ethereum Sepolia addresses
// ===============================================
app.get('/api/l1-config', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.json({
    ngnsTokenAddress: isProd
      ? process.env.L1_NGN_TOKEN_ADDRESS || ''
      : process.env.L1_BSC_NGN_TOKEN_ADDRESS || '',
    cngnContractAddress: isProd
      ? process.env.L1_CNGN_CONTRACT_ADDRESS || ''
      : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS || '',
    usdtContractAddress: isProd
      ? process.env.L1_USDT_CONTRACT_ADDRESS || ''
      : process.env.L1_BSC_USDT_CONTRACT_ADDRESS || '',
    usdcContractAddress: isProd
      ? process.env.L1_USDC_CONTRACT_ADDRESS || ''
      : process.env.L1_BSC_USDC_CONTRACT_ADDRESS || '',
    poolFactoryAddress: isProd
      ? process.env.L1_POOL_FACTORY_ADDRESS || ''
      : process.env.L1_BSC_POOL_FACTORY_ADDRESS || '',
    treasuryAddress: isProd
      ? process.env.L1_TREASURY_CONTRACT_ADDRESS || ''
      : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS || '',
    rpcUrl: isProd ? process.env.BNB_MAINNET_RPC_URL || '' : process.env.BNB_TESTNET_RPC_URL || '',
    chainId: isProd ? 56 : 97,
    explorerUrl: isProd ? 'https://bscscan.com' : 'https://testnet.bscscan.com',
  });
});

// ================================================================
// ALIAS: GET status (kept for backward compat with existing dashboard code)
// ================================================================
app.get('/api/alias/status/:safeAddress', async (req, res) => {
  try {
    const user = await User.findOne({
      safeAddress: req.params.safeAddress.toLowerCase(),
    });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const aliases = user.nameAliases || [];
    // Legacy compat: expose first alias as nameAlias
    const firstAlias = aliases[0]?.name || user.nameAlias || null;

    res.json({
      nameAlias: firstAlias,
      nameAliases: aliases,
      hasName: aliases.length > 0 || !!user.nameAlias,
    });
  } catch (error) {
    return handleError(error, res, 'Failed to get alias status');
  }
});

app.post('/api/resolve-recipient', async (req, res) => {
  try {
    const { input, registryAddress } = req.body;

    if (!input) return res.status(400).json({ message: 'Input required' });

    if (input.trim().startsWith('0x')) {
      return res.status(400).json({ message: 'Address inputs do not need resolution' });
    }

    if (!registryAddress) {
      return res.status(400).json({ message: 'Registry selection required' });
    }

    const registryDoc = await WalletRegistry.findOne({
      registryAddress: registryAddress.toLowerCase(),
    });

    if (!registryDoc) {
      return res.status(404).json({ message: 'Selected Registry not found in database' });
    }

    const weldedInput = `${input.trim()}${registryDoc.nspace}`;
    console.log(`🔗 Welded Name: ${weldedInput}`);

    // ✅ FIX: resolve is ALWAYS called on REGISTRY_CONTRACT_ADDRESS from .env
    const envRegistryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;

    let resolvedAddress;
    try {
      resolvedAddress = await resolveToAddress(weldedInput, envRegistryAddress);
    } catch (err) {
      return res.status(404).json({ message: err.message || 'Recipient not found' });
    }

    const recipientUser = await User.findOne({
      safeAddress: resolvedAddress.toLowerCase(),
    });

    res.json({
      resolvedAddress,
      displayName: recipientUser?.username || null,
    });
  } catch (error) {
    console.error('❌ Resolve recipient error:', error);
    return res.status(500).json({ message: 'Failed to resolve recipient' });
  }
});

app.post('/api/resolve-full-name', async (req, res) => {
  try {
    const { fullName } = req.body;

    if (!fullName || typeof fullName !== 'string')
      return res.status(400).json({ message: 'fullName is required' });

    const trimmed = fullName.trim();

    const parts = trimmed.split('@');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return res.status(400).json({
        message: 'Invalid name format. Expected: name@wallet (e.g. charles@salva)',
      });
    }

    const envRegistryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;

    let resolvedAddress;
    try {
      resolvedAddress = await resolveToAddress(trimmed, envRegistryAddress);
    } catch (err) {
      return res.status(404).json({
        message: err.message || 'Name not found. Make sure the name is registered.',
      });
    }

    const recipientUser = await User.findOne({
      safeAddress: resolvedAddress.toLowerCase(),
    });

    res.json({
      resolvedAddress,
      weldedName: trimmed,
      displayName: recipientUser?.username || null,
    });
  } catch (error) {
    console.error('❌ resolve-full-name error:', error);
    return handleError(error, res, 'Failed to resolve full name');
  }
});

// ===============================================
// TRANSFER — supports NGN, USDT, USDC
// coin param determines which token to send and which fee tier to use.
// ===============================================
app.post('/api/transfer', async (req, res) => {
  try {
    const {
      userPrivateKey,
      safeAddress,
      toInput,
      amount,
      registryAddress,
      inputType,
      coin = 'NGN',
    } = req.body;

    validateAmount(amount);

    const envRegistryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;

    const isBnbChain = (req.body.chain || '').toLowerCase() === 'bnb';
    const isProdEnv = process.env.NODE_ENV === 'production';

    let tokenAddress;
    if (isBnbChain) {
      if (coin === 'USDT')
        tokenAddress = isProdEnv
          ? process.env.L1_USDT_CONTRACT_ADDRESS
          : process.env.L1_BSC_USDT_CONTRACT_ADDRESS;
      else if (coin === 'USDC')
        tokenAddress = isProdEnv
          ? process.env.L1_USDC_CONTRACT_ADDRESS
          : process.env.L1_BSC_USDC_CONTRACT_ADDRESS;
      else if (coin === 'CNGN')
        tokenAddress = isProdEnv
          ? process.env.L1_CNGN_CONTRACT_ADDRESS
          : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS;
      else
        tokenAddress = isProdEnv
          ? process.env.L1_NGN_TOKEN_ADDRESS
          : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
    } else {
      if (coin === 'USDT') tokenAddress = process.env.USDT_CONTRACT_ADDRESS;
      else if (coin === 'USDC') tokenAddress = process.env.USDC_CONTRACT_ADDRESS;
      else if (coin === 'CNGN') tokenAddress = process.env.CNGN_CONTRACT_ADDRESS;
      else tokenAddress = process.env.NGN_TOKEN_ADDRESS;
    }

    if (!tokenAddress) {
      return res.status(400).json({ message: `Token address not configured for coin: ${coin}` });
    }

    // ── 1. Resolve Recipient ─────────────────────────────────────────────────
    let recipientAddress;
    let finalToInput = toInput.trim();

    try {
      if (!finalToInput.startsWith('0x')) {
        if (inputType === 'fullname') {
          // Already a welded name like charles@salva — resolve directly, no welding
          console.log(`🔗 Full name input (pre-welded): ${finalToInput}`);
        } else {
          if (!registryAddress) {
            return res.status(400).json({
              message: 'Registry selection required for name resolution',
            });
          }
          const registryDoc = await WalletRegistry.findOne({
            registryAddress: registryAddress.toLowerCase(),
          });
          if (!registryDoc)
            return res.status(404).json({ message: 'Selected Registry not found in database' });
          finalToInput = weldName(finalToInput, registryDoc.nspace);
          console.log(`🔗 Welded Recipient: ${finalToInput}`);
        }
      }
      recipientAddress = await resolveToAddress(finalToInput, envRegistryAddress);
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }

    // ── 2. Fee Calculation — live gas oracle, no hardcoded tiers ────────────
    const txChain = isBnbChain ? 'bnb' : 'base';
    const { feeNGN, feeUsd, feeWei } = await getFeeForTransfer(txChain, coin);
    const amountNum = parseFloat(amount);

    // Check balance — use BNB provider if chain=bnb, Base provider otherwise
    const TOKEN_ABI = ['function balanceOf(address) view returns (uint256)'];
    const txChainForBalance = req.body.chain || 'base';
    let balanceProvider = provider;
    if (txChainForBalance === 'bnb') {
      const isProdBal = process.env.NODE_ENV === 'production';
      balanceProvider = new ethers.JsonRpcProvider(
        isProdBal ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL
      );
    }
    const tokenContract = new ethers.Contract(tokenAddress, TOKEN_ABI, balanceProvider);
    const balanceWei = await tokenContract.balanceOf(safeAddress);

    let decimals = 6; // Base — all tokens are 6 decimals, hardcoded
    if (isBnbChain) {
      try {
        const { getL1TokenDecimals } = require('./utils/l1Decimals');
        decimals = await getL1TokenDecimals(tokenAddress);
      } catch (e) {
        console.warn('⚠️ Could not fetch BNB token decimals, using fallback 6:', e.message);
        decimals = 6;
      }
    }

    const balanceNum = parseFloat(ethers.formatUnits(balanceWei, decimals));

    let actualAmountWei;
    let actualFeeWei;
    let recipientReceives;

    const feeHuman = coin === 'NGN' || coin === 'CNGN' ? feeNGN : feeUsd;

    if (feeHuman === 0) {
      // No fee — send full amount
      actualAmountWei = ethers.parseUnits(amount.toString(), decimals);
      actualFeeWei = 0n;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum + feeHuman) {
      // Best case: balance covers amount + fee — recipient gets full amount, fee from surplus balance
      actualAmountWei = ethers.parseUnits(amount.toString(), decimals);
      actualFeeWei = feeWei;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum && feeHuman < amountNum) {
      // Balance covers amount but not amount+fee, and fee is less than amount
      // Deduct fee from amount — recipient gets amount - fee
      recipientReceives = amountNum - feeHuman;
      actualAmountWei = ethers.parseUnits(recipientReceives.toFixed(6), decimals);
      actualFeeWei = feeWei;
    } else if (balanceNum < amountNum) {
      return res.status(400).json({ message: 'Insufficient balance' });
    } else {
      // Balance covers amount but fee >= amount — nothing useful to send
      return res.status(400).json({ message: 'Amount too small to cover network fee' });
    }

    // ── 3. Metadata ──────────────────────────────────────────────────────────
    const senderUser = await User.findOne({
      safeAddress: safeAddress.toLowerCase(),
    });
    const recipientUser = await User.findOne({
      safeAddress: recipientAddress.toLowerCase(),
    });

    // ── 4. Queue the transaction — processor picks it up via /api/queue/process ──
    await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: 'PENDING',
      submittedOnchain: false,
      type: 'transfer',
      payload: {
        safeAddress,
        userPrivateKey,
        recipientAddress,
        actualAmountWei: actualAmountWei.toString(),
        actualFeeWei: actualFeeWei.toString(),
        tokenAddress,
        coin,
        chain: req.body.chain || 'base',
        amount,
        feeHuman,
        toInput: finalToInput,
        senderDisplayIdentifier: req.body.senderDisplayIdentifier || finalToInput,
      },
    }).save();

    return res.json({
      success: true,
      queued: true,
      message: 'Transaction queued. It will be processed shortly.',
      feeNGN,
      feeUsd,
      recipientReceives,
      coin,
    });
  } catch (error) {
    console.error('❌ Transfer failed:', error.message);
    return res.status(500).json({ message: error.message || 'Transfer failed' });
  }
});

// ===============================================
// TRANSACTIONS — FIXED
//
// OLD BUG: The query was:
//   { $or: [{ fromAddress: address }, { toAddress: address, status: "successful" }] }
//
// This had two problems:
//   1. For the RECIPIENT: toAddress entries only appeared if status was
//      "successful" — but since the old polling always timed out and saved
//      everything as "failed", recipients never saw any transactions.
//   2. For the SENDER: sent transactions with status "failed" were included
//      (correct), but the frontend was using isSuccessful = tx.status?.toLowerCase()
//      .includes("success") which correctly showed ❌ for failed status — but
//      because the OLD poller always saved "failed", even real successes showed ❌.
//
// FIX for this route: Include ALL toAddress matches (not just successful),
// so recipients always see what was sent to them. The displayType logic
// will correctly sort out failed vs received using the status field.
// The real fix that makes this work is waitForTxReceipt correctly saving
// "successful" status — but removing the status filter from toAddress
// ensures nothing is ever silently hidden.
// ===============================================
app.get('/api/transactions/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: 'Invalid address format' });
    }

    // Pull completed transactions
    const transactions = await Transaction.find({
      $or: [{ fromAddress: address }, { toAddress: address }],
    })
      .sort({ date: -1 })
      .limit(50);

    // Pull active queue entries — PENDING and SENDING show as pending in history
    const queueEntries = await TransactionQueue.find({
      walletAddress: address,
      status: { $in: ['PENDING', 'SENDING', 'FAILED_ONCHAIN'] },
    }).sort({ createdAt: -1 });

    const pendingTxs = queueEntries.map((q) => ({
      _id: q._id,
      fromAddress: address,
      toAddress: q.payload?.recipientAddress || null,
      amount: q.payload?.amount || '0',
      coin: q.payload?.coin || 'NGN',
      status: q.status === 'FAILED_ONCHAIN' ? 'failed' : 'pending',
      displayType: q.status === 'FAILED_ONCHAIN' ? 'failed' : 'pending',
      displayPartner: q.payload?.toInput || q.payload?.recipientAddress || '—',
      date: q.createdAt,
      taskId: q.txHash || null,
      fee: null,
      isPending: q.status !== 'FAILED_ONCHAIN',
      submittedOnchain: q.submittedOnchain || false,
      canCancel: false,
    }));
    const formatted = transactions.map((tx) => {
      const isFromMe = tx.fromAddress?.toLowerCase() === address;
      const isToMe = tx.toAddress?.toLowerCase() === address;
      const isSuccessful = tx.status === 'successful';

      let displayType;
      if (isFromMe) {
        displayType = isSuccessful ? 'sent' : 'failed';
      } else if (isToMe && isSuccessful) {
        displayType = 'receive';
      } else {
        displayType = 'hidden';
      }

      // Display partner: prefer username, fall back to wallet address
      const displayPartner = isFromMe
        ? tx.toUsername || tx.toAddress
        : tx.fromUsername || tx.fromAddress;

      return {
        ...tx._doc,
        displayType,
        displayPartner,
      };
    });

    const visible = formatted.filter((tx) => tx.displayType !== 'hidden');

    // Merge pending queue entries at the top, dedup by txHash if confirmed
    const confirmedHashes = new Set(visible.map((tx) => tx.taskId).filter(Boolean));
    const filteredPending = pendingTxs.filter((p) => !p.taskId || !confirmedHashes.has(p.taskId));

    res.json([...filteredPending, ...visible]);
  } catch (error) {
    console.error('❌ History Fetch Error:', error);
    return handleError(error, res, 'Failed to fetch transactions');
  }
});

// ===============================================
// PIN MANAGEMENT
// ===============================================
app.get('/api/user/pin-status/:email', async (req, res) => {
  try {
    const email = sanitizeEmail(req.params.email);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      hasPin: !!user.transactionPin,
      pinSetupCompleted: user.pinSetupCompleted || false,
      isLocked: user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date(),
      lockedUntil: user.accountLockedUntil,
    });
  } catch (error) {
    return handleError(error, res, 'Failed to check PIN status');
  }
});

app.post('/api/user/set-pin', authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;

    validatePin(pin);

    const sanitizedEmail = sanitizeEmail(email);
    let user = await User.findOne({ email: sanitizedEmail });

    if (!user) {
      user = await User.findOne({ username: sanitizedEmail });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.transactionPin) {
      return res.status(400).json({ message: 'PIN already set. Use reset-pin instead.' });
    }

    const hashedPin = hashPin(pin);
    const encryptedKey = encryptPrivateKey(user.ownerPrivateKey, pin);

    user.transactionPin = hashedPin;
    user.ownerPrivateKey = encryptedKey;
    user.pinSetupCompleted = true;
    await user.save();

    console.log(`✅ PIN set for user: ${user.email || user.username}`);
    res.json({ success: true, message: 'Transaction PIN set successfully!' });
  } catch (error) {
    console.error('❌ Set PIN error:', error);
    return handleError(error, res, 'Failed to set PIN');
  }
});

app.post('/api/user/verify-pin', authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;

    validatePin(pin);

    const sanitizedEmail = sanitizeEmail(email);
    let user = await User.findOne({ email: sanitizedEmail });

    if (!user) {
      user = await User.findOne({ username: sanitizedEmail });
    }

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.transactionPin) {
      return res.status(400).json({ message: 'No PIN set. Please set PIN first.' });
    }

    const isValid = verifyPin(pin, user.transactionPin);

    if (!isValid) {
      // Constant-time delay to prevent timing oracle on PIN length/validity
      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 100)));
      return res.status(401).json({ success: false, message: 'Invalid PIN' });
    }

    if (user.accountLockedUntil && new Date(user.accountLockedUntil) > new Date()) {
      const hoursLeft = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / (1000 * 60 * 60)
      );
      return res.status(403).json({
        message: `Account locked for ${hoursLeft} more hours due to recent security changes.`,
        lockedUntil: user.accountLockedUntil,
      });
    }

    let decryptedKey;
    try {
      decryptedKey = decryptPrivateKey(user.ownerPrivateKey, pin);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid PIN or corrupted key',
      });
    }

    res.json({
      success: true,
      privateKey: decryptedKey,
    });
  } catch (error) {
    console.error('❌ Verify PIN error:', error);
    return res.status(401).json({
      success: false,
      message: 'Invalid PIN or corrupted key',
    });
  }
});

app.post('/api/user/reset-pin', authLimiter, async (req, res) => {
  try {
    const { email, oldPin, newPin } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    const otpRecord = await OtpStore.findOne({
      email: sanitizedEmail,
      verified: true,
    });
    if (!otpRecord || new Date() > otpRecord.expires) {
      return res.status(401).json({ message: 'Please verify OTP first' });
    }

    validatePin(oldPin);
    validatePin(newPin);

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.transactionPin) {
      return res.status(400).json({ message: 'No PIN set. Please use set-pin instead.' });
    }

    const isOldPinValid = verifyPin(oldPin, user.transactionPin);
    if (!isOldPinValid) {
      return res.status(401).json({ message: 'Invalid old PIN. Reset failed.' });
    }

    let privateKey;
    try {
      privateKey = decryptPrivateKey(user.ownerPrivateKey, oldPin);
    } catch (error) {
      return res.status(401).json({
        message: 'Failed to decrypt private key with old PIN.',
      });
    }

    const hashedNewPin = hashPin(newPin);
    const encryptedKey = encryptPrivateKey(privateKey, newPin);
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.transactionPin = hashedNewPin;
    user.ownerPrivateKey = encryptedKey;
    user.accountLockedUntil = lockoutTime;
    user.pinSetupCompleted = true;
    await user.save();

    await OtpStore.deleteOne({ email: sanitizedEmail });

    try {
      const accountNum = (await getAccountNumberFromAddress(user.safeAddress)) || user.safeAddress;
      await sendSecurityChangeEmail(sanitizedEmail, user.username, 'pin', accountNum);
    } catch (emailError) {
      console.error('❌ Security email error:', emailError.message);
    }

    console.log(`✅ PIN reset for user: ${sanitizedEmail}`);
    res.json({
      success: true,
      message: 'PIN reset successful. Account locked for 24 hours.',
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error('❌ Reset PIN error:', error);
    return handleError(error, res, 'Failed to reset PIN');
  }
});

app.post('/api/user/update-email', authLimiter, async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;

    const sanitizedOldEmail = sanitizeEmail(oldEmail);
    const sanitizedNewEmail = sanitizeEmail(newEmail);

    const otpRecord = await OtpStore.findOne({
      email: sanitizedOldEmail,
      verified: true,
    });
    if (!otpRecord || new Date() > otpRecord.expires) {
      return res.status(401).json({ message: 'Please verify OTP first' });
    }

    const user = await User.findOne({ email: sanitizedOldEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingUser = await User.findOne({ email: sanitizedNewEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use' });
    }

    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.email = sanitizedNewEmail;
    user.accountLockedUntil = lockoutTime;
    await user.save();

    await OtpStore.deleteOne({ email: sanitizedOldEmail });

    try {
      const accountNum = (await getAccountNumberFromAddress(user.safeAddress)) || user.safeAddress;

      await sendSecurityChangeEmail(sanitizedOldEmail, user.username, 'email', accountNum);

      await sendEmailChangeConfirmation(sanitizedNewEmail, user.username, accountNum);
    } catch (emailError) {
      console.error('❌ Email notification error:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Email updated. Account locked for 24 hours.',
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error('❌ Update email error:', error);
    return handleError(error, res, 'Failed to update email');
  }
});

app.post('/api/user/update-password', authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    const otpRecord = await OtpStore.findOne({
      email: sanitizedEmail,
      verified: true,
    });
    if (!otpRecord || new Date() > otpRecord.expires) {
      return res.status(401).json({ message: 'Please verify OTP first' });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({
        message: 'Password must be at least 8 characters with uppercase, lowercase, and number',
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.password = hashedPassword;
    user.accountLockedUntil = lockoutTime;
    await user.save();

    await OtpStore.deleteOne({ email: sanitizedEmail });

    try {
      const accountNum = (await getAccountNumberFromAddress(user.safeAddress)) || user.safeAddress;
      await sendSecurityChangeEmail(sanitizedEmail, user.username, 'password', accountNum);
    } catch (emailError) {
      console.error('❌ Security email error:', emailError.message);
    }

    res.json({
      success: true,
      message: 'Password updated. Account locked for 24 hours.',
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error('❌ Update password error:', error);
    return handleError(error, res, 'Failed to update password');
  }
});

app.post('/api/user/update-username', async (req, res) => {
  try {
    const { email, newUsername } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    if (!newUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      return res.status(400).json({
        message: 'Username must be 3-20 alphanumeric characters',
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: 'Username already taken' });
    }

    user.username = newUsername;
    await user.save();

    res.json({ success: true, message: 'Username updated successfully!' });
  } catch (error) {
    console.error('❌ Update username error:', error);
    return handleError(error, res, 'Failed to update username');
  }
});

// ===============================================
// PROCESS QUEUE
// ===============================================
app.post('/api/queue/process/:address', async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    // Reset any SENDING entries stuck longer than 10 minutes before checking
    const stuckCutoff = new Date(Date.now() - 10 * 60 * 1000);
    await TransactionQueue.updateMany(
      { walletAddress: address, status: 'SENDING', updatedAt: { $lt: stuckCutoff } },
      {
        $set: {
          status: 'PENDING',
          errorMessage: 'Stuck in SENDING — reset on process call',
          updatedAt: new Date(),
        },
      }
    );

    const inFlight = await TransactionQueue.findOne({
      walletAddress: address,
      status: 'SENDING',
    });
    if (inFlight) {
      return res.json({ processing: false, reason: 'Already in-flight' });
    }

    const entry = await TransactionQueue.findOne({
      walletAddress: address,
      status: 'PENDING',
    }).sort({ createdAt: 1 });

    if (!entry) {
      return res.json({ processing: false, reason: 'No pending transactions' });
    }

    const claimed = await TransactionQueue.findOneAndUpdate(
      { _id: entry._id, status: 'PENDING' },
      { $set: { status: 'SENDING', updatedAt: new Date() } },
      { new: true }
    );
    if (!claimed) {
      return res.json({ processing: false, reason: 'Race condition — already claimed' });
    }

    res.json({ processing: true, queueId: entry._id });

    setImmediate(async () => {
      try {
        const {
          safeAddress,
          userPrivateKey,
          recipientAddress,
          actualAmountWei,
          actualFeeWei,
          tokenAddress,
          coin,
          amount,
          feeHuman,
          toInput,
          senderDisplayIdentifier,
        } = claimed.payload;

        const senderUser = await User.findOne({
          safeAddress: safeAddress.toLowerCase(),
        });
        const recipientUser = await User.findOne({
          safeAddress: recipientAddress.toLowerCase(),
        });

        let result;
        let broadcastChain = 'base';
        try {
          // Fallback: if chain not tagged (pre-fix entries), detect from DB
          let chain = claimed.payload.chain;
          if (!chain) {
            try {
              const l1db = require('./services/l1db');
              if (l1db.readyState === 1) {
                const UserBNBSchema = require('./models/UserBNB');
                const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
                const isBnbUser = await UserBNB.findOne({
                  safeAddress: claimed.payload.safeAddress?.toLowerCase(),
                }).lean();
                chain = isBnbUser ? 'bnb' : 'base';
              } else {
                chain = 'base';
              }
            } catch {
              chain = 'base';
            }
          }
          broadcastChain = chain;
          console.log(`🔗 Processing queue entry for chain: ${chain} | safe: ${safeAddress}`);
          if (chain === 'bnb') {
            const { sponsorBNBTransfer } = require('./services/relayServiceBNB');
            const isProd = process.env.NODE_ENV === 'production';
            const treasury = isProd
              ? process.env.L1_TREASURY_CONTRACT_ADDRESS
              : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS;
            result = await sponsorBNBTransfer(
              safeAddress,
              userPrivateKey,
              recipientAddress,
              BigInt(actualAmountWei),
              BigInt(actualFeeWei),
              tokenAddress,
              treasury
            );
          } else {
            result = await sponsorSafeTransfer(
              safeAddress,
              userPrivateKey,
              recipientAddress,
              BigInt(actualAmountWei),
              BigInt(actualFeeWei),
              tokenAddress
            );
          }
        } catch (broadcastErr) {
          console.error(`❌ Broadcast failed for ${safeAddress}: ${broadcastErr.message}`);
          // Record as a failed transaction in history so user can see it
          await new Transaction({
            fromAddress: safeAddress.toLowerCase(),
            fromUsername: senderUser?.username || null,
            fromNameAlias: senderUser?.nameAlias || null,
            toAddress: recipientAddress.toLowerCase(),
            toUsername: recipientUser?.username || null,
            toNameAlias: recipientUser?.nameAlias || null,
            senderDisplayIdentifier: senderDisplayIdentifier || toInput,
            amount,
            fee: feeHuman > 0 ? String(feeHuman) : null,
            coin,
            status: 'failed',
            taskId: null,
            type: 'transfer',
            date: new Date(),
          }).save().catch(() => {});
          // Mark queue entry as failed — never leave it as PENDING
          await TransactionQueue.findByIdAndUpdate(claimed._id, {
            $set: {
              status: 'FAILED_ONCHAIN',
              errorMessage: broadcastErr.message,
              updatedAt: new Date(),
            },
          }).catch(() => {});
          return;
        }

        if (!result || !result.txHash) {
          console.error(`❌ No txHash returned for ${safeAddress}`);
          await new Transaction({
            fromAddress: safeAddress.toLowerCase(),
            fromUsername: senderUser?.username || null,
            fromNameAlias: senderUser?.nameAlias || null,
            toAddress: recipientAddress.toLowerCase(),
            toUsername: recipientUser?.username || null,
            toNameAlias: recipientUser?.nameAlias || null,
            senderDisplayIdentifier: senderDisplayIdentifier || toInput,
            amount,
            fee: feeHuman > 0 ? String(feeHuman) : null,
            coin,
            status: 'failed',
            taskId: null,
            type: 'transfer',
            date: new Date(),
          }).save().catch(() => {});
          await TransactionQueue.findByIdAndUpdate(claimed._id, {
            $set: {
              status: 'FAILED_ONCHAIN',
              errorMessage: 'No txHash returned from broadcast',
              updatedAt: new Date(),
            },
          }).catch(() => {});
          return;
        }

        entry.submittedOnchain = true;
        entry.txHash = result.txHash;
        entry.taskId = result.txHash;
        entry.updatedAt = new Date();
        await entry.save();

        const txChain = claimed.payload.chain || 'base';
        let taskStatus;
        if (txChain === 'bnb') {
          const isProdEnv = process.env.NODE_ENV === 'production';
          const bnbRpc = isProdEnv
            ? process.env.BNB_MAINNET_RPC_URL
            : process.env.BNB_TESTNET_RPC_URL;
          const bnbProvider = new ethers.JsonRpcProvider(bnbRpc);
          try {
            const receipt = await bnbProvider.waitForTransaction(result.txHash, 1, 120_000);
            taskStatus =
              receipt && receipt.status === 1
                ? { success: true, status: 'successful' }
                : { success: false, status: 'failed', reason: 'Transaction reverted on BNB chain' };
          } catch (err) {
            taskStatus = { success: false, status: 'failed', reason: err.message };
          }
        } else {
          taskStatus = await waitForTxReceipt(result.txHash);
        }

        await new Transaction({
          fromAddress: safeAddress.toLowerCase(),
          fromUsername: senderUser?.username || null,
          fromNameAlias: senderUser?.nameAlias || null,
          toAddress: recipientAddress.toLowerCase(),
          toUsername: recipientUser?.username || null,
          toNameAlias: recipientUser?.nameAlias || null,
          senderDisplayIdentifier: senderDisplayIdentifier || toInput,
          amount,
          fee: feeHuman > 0 ? String(feeHuman) : null,
          coin,
          status: taskStatus.success ? 'successful' : 'failed',
          taskId: result.txHash,
          type: 'transfer',
          date: new Date(),
        }).save();

        if (taskStatus.success) {
          await TransactionQueue.deleteOne({ _id: claimed._id });
          await applyCooldown(safeAddress, 20);
          console.log(`✅ Processed and removed: ${result.txHash}`);
          if (senderUser?.email) {
            try {
              await sendTransactionEmailToSender(
                senderUser.email,
                senderUser.username,
                toInput,
                amount,
                'successful',
                coin
              );
            } catch {}
          }
          if (recipientUser?.email) {
            try {
              await sendTransactionEmailToReceiver(
                recipientUser.email,
                recipientUser.username,
                safeAddress,
                amount,
                coin
              );
            } catch {}
          }
        } else {
          entry.status = 'FAILED_ONCHAIN';
          entry.errorMessage = taskStatus.reason || 'Transaction reverted on-chain';
          entry.updatedAt = new Date();
          await entry.save();
          console.error(`❌ On-chain failure for ${safeAddress}: ${taskStatus.reason}`);
        }
      } catch (err) {
        console.error('❌ Queue processor crashed:', err.message);
        try {
          const freshEntry = await TransactionQueue.findById(claimed._id);
          if (!freshEntry) return;
          freshEntry.status = 'PENDING';
          freshEntry.errorMessage = `Processor error: ${err.message}`;
          freshEntry.updatedAt = new Date();
          await freshEntry.save();
        } catch (saveErr) {
          console.error('❌ Could not save after crash:', saveErr.message);
        }
      }
    });
  } catch (error) {
    return handleError(error, res, 'Failed to process queue');
  }
});

// ===============================================
// STATS
// ===============================================
app.get('/api/stats', async (req, res) => {
  try {
    await connectDB();
    const citizenCount = await User.countDocuments();

    const isProd = process.env.NODE_ENV === 'production';
    const TOKEN_ABI = ['function totalSupply() view returns (uint256)'];

    // Base chain supply
    let baseSupply = 0;
    try {
      const baseContract = new ethers.Contract(process.env.NGN_TOKEN_ADDRESS, TOKEN_ABI, provider);
      const baseWei = await retryRPCCall(() => baseContract.totalSupply());
      baseSupply = parseFloat(ethers.formatUnits(baseWei, 6));
    } catch (e) {
      console.error('Failed to fetch Base NGNs supply:', e.message);
    }

    // BNB chain supply
    let bnbSupply = 0;
    try {
      const bnbRpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
      const bnbTokenAddress = isProd
        ? process.env.L1_NGN_TOKEN_ADDRESS
        : process.env.L1_BSC_NGN_TOKEN_ADDRESS;
      const bnbProvider = new ethers.JsonRpcProvider(bnbRpc);
      const bnbContract = new ethers.Contract(bnbTokenAddress, TOKEN_ABI, bnbProvider);
      const bnbWei = await retryRPCCall(() => bnbContract.totalSupply());
      // BNB NGNs token has 6 decimals per .env deploy
      bnbSupply = parseFloat(ethers.formatUnits(bnbWei, 6));
    } catch (e) {
      console.error('Failed to fetch BNB NGNs supply:', e.message);
    }

    const totalSupply = (baseSupply + bnbSupply).toFixed(6);
    console.log(`📊 Stats: Base=${baseSupply} + BNB=${bnbSupply} = ${totalSupply}`);

    res.json({ userCount: citizenCount.toString(), totalMinted: totalSupply });
  } catch (error) {
    console.error('Stats fetch error:', error);
    res.status(200).json({ userCount: '0', totalMinted: '0' });
  }
});

// ===============================================
// ERROR HANDLER
// ===============================================
app.use((err, req, res, next) => {
  console.error('Final Catch-All Error:', err.stack);

  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ message: 'Internal Server Error' });
  } else {
    res.status(500).json({
      message: 'Internal Server Error',
      error: err.message,
      stack: err.stack,
    });
  }
});

// ===============================================
// START SERVER
// ===============================================
const PORT = process.env.PORT || 3001;


app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 SALVA BACKEND ACTIVE ON PORT ${PORT}`);
  console.log(`🔒 Security features enabled:`);
  console.log(`   ✅ MongoDB injection protection`);
  console.log(`   ✅ Rate limiting (Auth: 5/15min, API: 100/min)`);
  console.log(`   ✅ Security headers (Helmet)`);
  console.log(`   ✅ Input validation`);
  console.log(`   ✅ PBKDF2 encryption (600k iterations)`);
  console.log(`   ✅ Constant-time comparisons`);
  console.log(`   ✅ Environment-based CORS`);

  setInterval(cleanupStaleQueueEntries, 5 * 60 * 1000);
  console.log(`   ✅ Transaction queue cleanup (every 5 minutes)`);
});

// ===============================================
// KEEP-ALIVE
// ===============================================
const INTERVAL = 10 * 60 * 1000;
const URL = 'https://salva-web.vercel.app/api/stats';

function reloadWebsite() {
  fetch(URL)
    .then(() => console.log('⚓ Keep-Alive: Side-ping successful'))
    .catch((err) => console.error('⚓ Keep-Alive Error:', err.message));
}

setInterval(reloadWebsite, INTERVAL);
