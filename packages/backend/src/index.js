// Salva-Digital-Tech/packages/backend/src/index.js
require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const { ethers } = require("ethers");
const { wallet, provider } = require("./services/walletSigner");
const { generateAndDeploySalvaIdentity } = require("./services/userService");
const {
  sponsorSafeTransfer,
  sponsorSafeTransferFrom,
  sponsorSafeApprove,
} = require("./services/relayService");
const Transaction = require("./models/Transaction");
const mongoose = require("mongoose");
const { Resend } = require("resend");
const { GelatoRelay } = require("@gelatonetwork/relay-sdk");
const Approval = require("./models/Approval");
const {
  encryptPrivateKey,
  decryptPrivateKey,
  hashPin,
  verifyPin,
} = require("./utils/encryption");
const crypto = require("crypto");
const TransactionQueue = require("./models/TransactionQueue");
const {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendApprovalEmailToApprover,
  sendApprovalEmailToSpender,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
} = require("./services/emailService");

const User = require("./models/User");
const AccountNumberCounter = require("./models/AccountNumberCounter");

const WalletRegistry = require("./models/WalletRegistry");
const FeeConfig = require("./models/FeeConfig");

// ===============================================
// SECURITY PACKAGES
// ===============================================
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const validator = require("validator");

const Proposal = require('./models/Proposal');
const {
  proposeRegistryInit,
  proposeValidatorUpdate,
  validateRegistry,
  validateValidator,
  cancelRegistryInit,
  cancelValidatorUpdate,
  executeRegistryInit,
  executeValidatorUpdate,
} = require('./services/multiSigService');

const { sendProposalNotificationEmail } = require('./services/emailService');

// ===============================================
// HELPER: ENSURE ADDRESS MATCHING
// ===============================================
function normalizeAddress(address) {
  if (!address) return null;
  return address.toLowerCase();
}

// Initialize services
const resend = new Resend(process.env.RESEND_API_KEY);
const relay = new GelatoRelay();

const app = express();

// ✅ Trust proxy - Required for Render/Heroku/behind load balancers
app.set("trust proxy", 1);

// ===============================================
// SECURITY: Helmet (Security Headers)
// ===============================================
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "https://api.anthropic.com",
          process.env.BASE_SEPOLIA_RPC_URL,
        ],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Manual MongoDB injection protection
function sanitizeObject(obj) {
  if (typeof obj !== "object" || obj === null) return obj;

  const sanitized = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    // Remove keys starting with $ or containing .
    if (key.startsWith("$") || key.includes(".")) continue;

    sanitized[key] =
      typeof obj[key] === "object" ? sanitizeObject(obj[key]) : obj[key];
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
const allowedOrigins =
  process.env.NODE_ENV === "production"
    ? [
      "https://salva-nexus.org",
      "https://www.salva-nexus.org",
      "https://salva-web.onrender.com",
    ]
    : [
      "https://salva-nexus.org",
      "https://www.salva-nexus.org",
      "https://salva-web.onrender.com",
      "http://localhost:3000",
      "http://localhost:5173",
    ];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`⚠️ CORS blocked: ${origin}`);
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);

// ===============================================
// SECURITY: Rate Limiters
// ===============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: "Too many authentication attempts. Please try again in 15 minutes.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn(`⚠️ Rate limit exceeded for IP: ${req.ip} on ${req.path}`);
    res.status(429).json({
      message: "Too many attempts. Please try again in 15 minutes.",
    });
  },
});

const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: "Too many requests. Please slow down.",
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/", generalLimiter);

// ===============================================
// SECURITY: Input Validation
// ===============================================
function sanitizeEmail(email) {
  if (typeof email !== "string") {
    throw new Error("Invalid email format");
  }
  const sanitized = email.trim().toLowerCase();
  if (!validator.isEmail(sanitized)) {
    throw new Error("Invalid email format");
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
        message: "Username must be 3-20 alphanumeric characters",
      });
    }

    if (!password || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters with uppercase, lowercase, and number",
      });
    }

    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

function validateAmount(amount) {
  const num = parseFloat(amount);
  if (isNaN(num) || num <= 0 || num > 1000000000) {
    throw new Error("Invalid amount");
  }
  return num;
}

function validatePin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits");
  }
  return true;
}

// ===============================================
// SECURITY: Error Handler
// ===============================================
function handleError(error, res, userMessage = "An error occurred") {
  console.error("Error:", error);

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ message: userMessage });
  } else {
    return res.status(500).json({
      message: userMessage,
      error: error.message,
      stack: error.stack,
    });
  }
}

// ===============================================
// OTP Storage with Auto-Cleanup
// ===============================================
const otpStore = {};

setInterval(
  () => {
    const now = Date.now();
    Object.keys(otpStore).forEach((email) => {
      if (otpStore[email] && otpStore[email].expires < now) {
        delete otpStore[email];
        console.log(`🧹 Cleaned up expired OTP for: ${email}`);
      }
    });
  },
  5 * 60 * 1000,
);

// Connect to MongoDB
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("🍃 MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Connection Failed:", err));

// ===============================================
// HELPERS
// ===============================================
async function delayBeforeBlockchain(
  walletAddress,
  message = "Preparing transaction...",
) {
  console.log(`⏳ ${message}`);

  // Check for active transactions
  if (await hasActiveTransaction(walletAddress)) {
    throw new Error("Another transaction is already in progress");
  }

  // Check cooldown
  const cooldownStatus = await checkCooldown(walletAddress);
  if (!cooldownStatus.ready) {
    console.log(`⏱️ Cooldown active, waiting ${cooldownStatus.delay}s...`);
    await new Promise((resolve) =>
      setTimeout(resolve, cooldownStatus.delay * 1000),
    );
  }

  console.log(`✅ Queue clear, proceeding with transaction`);
}

async function checkGelatoTaskStatus(taskId, maxRetries = 20, delayMs = 2000) {
  console.log(`🔍 Polling Gelato task status for: ${taskId}`);

  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await relay.getTaskStatus(taskId);
      console.log(`📊 Task ${taskId} status:`, status.taskState);

      if (status.taskState === "ExecSuccess") {
        console.log(`✅ Task ${taskId} SUCCEEDED on-chain`);
        return { success: true, status: "successful" };
      }

      if (status.taskState === "ExecReverted") {
        console.error(`❌ Task ${taskId} REVERTED on-chain`);
        return {
          success: false,
          status: "failed",
          reason: "Transaction reverted on blockchain",
        };
      }

      if (status.taskState === "Cancelled") {
        console.error(`❌ Task ${taskId} was CANCELLED`);
        return {
          success: false,
          status: "failed",
          reason: "Transaction cancelled",
        };
      }

      if (status.taskState === "Blacklisted") {
        console.error(`❌ Task ${taskId} was BLACKLISTED`);
        return {
          success: false,
          status: "failed",
          reason: "Transaction blacklisted",
        };
      }

      if (
        ["CheckPending", "ExecPending", "WaitingForConfirmation"].includes(
          status.taskState,
        )
      ) {
        console.log(
          `⏳ Task ${taskId} still pending... (attempt ${i + 1}/${maxRetries})`,
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      console.warn(`⚠️ Unknown task state: ${status.taskState}`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      console.error(
        `❌ Error checking task status (attempt ${i + 1}):`,
        error.message,
      );

      if (i === maxRetries - 1) {
        return {
          success: false,
          status: "failed",
          reason: "Could not verify transaction status",
        };
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  console.error(`⏰ Task ${taskId} timed out after ${maxRetries} attempts`);
  return {
    success: false,
    status: "failed",
    reason: "Transaction verification timeout",
  };
}

async function retryRPCCall(fn, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      console.log(`⚠️ RPC call failed, retrying (${i + 1}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
    }
  }
}

// Check if wallet has active transaction
async function hasActiveTransaction(walletAddress) {
  const activeStates = ["PENDING", "SENDING"];
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
      status: { $in: ["CONFIRMED", "FAILED"] },
    },
    {
      cooldownUntil: cooldownUntil,
      updatedAt: new Date(),
    },
    { sort: { updatedAt: -1 } },
  );
}

async function cleanupStaleQueueEntries() {
  const STALE_THRESHOLD = 10 * 60 * 1000; // 10 minutes
  const staleDate = new Date(Date.now() - STALE_THRESHOLD);

  const result = await TransactionQueue.deleteMany({
    status: { $in: ["PENDING", "SENDING"] },
    createdAt: { $lt: staleDate },
  });

  if (result.deletedCount > 0) {
    console.log(`🧹 Cleaned up ${result.deletedCount} stale queue entries`);
  }
}

// ===============================================
// HELPER: Get fee for a given human-readable NGN amount
// Returns fee in Wei (6 decimals) and human NGN amount
// ===============================================
async function getFeeForAmount(amountNGN) {
  let config = await FeeConfig.findById('main');
  if (!config) {
    // Seed default config on first call
    config = await FeeConfig.create({ _id: 'main' });
  }

  const amount = parseFloat(amountNGN);

  if (amount >= config.tier2Min) {
    return {
      feeNGN: config.tier2Fee,
      feeWei: ethers.parseUnits(config.tier2Fee.toString(), 6)
    };
  }

  if (amount >= config.tier1Min && amount <= config.tier1Max) {
    return {
      feeNGN: config.tier1Fee,
      feeWei: ethers.parseUnits(config.tier1Fee.toString(), 6)
    };
  }

  // Below tier1Min — free
  return { feeNGN: 0, feeWei: 0n };
}

// ===============================================
// GET ALL ACTIVE REGISTRIES (for frontend dropdown)
// ===============================================
app.get("/api/registries", async (req, res) => {
  try {
    // Seed Salva's own registry on first call if DB is empty
    const count = await WalletRegistry.countDocuments();
    if (count === 0) {
      await WalletRegistry.create({
        name: "Salva Wallet",
        registryAddress: process.env.REGISTRY_CONTRACT_ADDRESS,
        description: "Official Salva on-chain payment registry",
        active: true
      });
      console.log("✅ Salva registry seeded into WalletRegistry collection");
    }

    const registries = await WalletRegistry.find({ active: true }).select('name registryAddress description');
    res.json(registries);
  } catch (error) {
    console.error("❌ Failed to fetch registries:", error);
    return handleError(error, res, "Failed to fetch registries");
  }
});

// ================================================================
// NEW: /api/alias/register-number
// User registers a number alias. Backend assigns next number,
// calls linkNumber on-chain, then saves to DB.
// Add this as a new route AFTER the existing /api/registries route.
// ================================================================
app.post('/api/alias/register-number', authLimiter, async (req, res) => {
  try {
    const { safeAddress, email } = req.body;
 
    const identifier = sanitizeEmail(email);
    let user = await User.findOne({ email: identifier });
    if (!user) user = await User.findOne({ username: identifier });
    if (!user) return res.status(404).json({ message: 'User not found' });
 
    if (user.numberAlias) return res.status(400).json({ message: 'Number alias already registered' });
 
    // Get next number
    let counterDoc = await AccountNumberCounter.findById('main');
    if (!counterDoc) {
      counterDoc = await AccountNumberCounter.create({ _id: 'main', lastAssigned: '1122746244' });
    }
    const nextNumber = (BigInt(counterDoc.lastAssigned) + 1n).toString();
    console.log(`🔢 Assigning account number: ${nextNumber}`);
 
    // Call linkNumber on-chain
    const REGISTRY_ABI = ["function linkNumber(uint128,address) external"];
    const registryContract = new ethers.Contract(
      process.env.REGISTRY_CONTRACT_ADDRESS,
      REGISTRY_ABI,
      wallet
    );
 
    let linkTx;
    try {
      linkTx = await registryContract.linkNumber(BigInt(nextNumber), user.safeAddress);
      console.log(`⏳ linkNumber TX: ${linkTx.hash}`);
    } catch (err) {
      console.error('❌ linkNumber send failed:', err.message);
      return res.status(500).json({ message: 'On-chain registration failed. Please try again.' });
    }
 
    let linkReceipt;
    try {
      linkReceipt = await linkTx.wait();
    } catch (err) {
      console.error('❌ linkNumber reverted:', err.message);
      return res.status(500).json({ message: 'On-chain registration reverted. Please try again.' });
    }
 
    if (!linkReceipt || linkReceipt.status === 0) {
      return res.status(500).json({ message: 'On-chain registration failed. Please try again.' });
    }
 
    // Update DB — only after on-chain success
    counterDoc.lastAssigned = nextNumber;
    await counterDoc.save();
 
    user.numberAlias = nextNumber;
    user.accountNumber = nextNumber; // keep accountNumber in sync for backward compat
    await user.save();
 
    console.log('✅ Number alias registered:', nextNumber);
    res.json({ success: true, numberAlias: nextNumber });
  } catch (error) {
    console.error('❌ Register number alias failed:', error);
    return handleError(error, res, 'Failed to register number alias');
  }
});

// ================================================================
// NEW: /api/alias/check-name
// Check if a name alias is available before registration.
// Calls resolveViaName on the registry contract.
// ================================================================
app.post('/api/alias/check-name', async (req, res) => {
  try {
    const { name } = req.body;
 
    if (!name || typeof name !== 'string') return res.status(400).json({ message: 'Name is required' });
 
    // Validate characters (mirror phishingProof modifier)
    if (name.length > 16) return res.status(400).json({ message: 'Name too long (max 16 chars)' });
    if (!/^[a-z2-9.\-_]+$/.test(name)) return res.status(400).json({ message: 'Invalid characters in name' });
 
    // Weld name with @salva namespace (backend always uses salva registry for name registration)
    // The Singleton stores: name bytes OR-welded with namespace bytes in bytes32
    // We check by calling resolveViaName on the Salva registry contract
    const REGISTRY_ABI = ["function resolveViaName(string calldata) view returns (address)"];
    const registryContract = new ethers.Contract(
      process.env.REGISTRY_CONTRACT_ADDRESS,
      REGISTRY_ABI,
      provider
    );
 
    const resolved = await registryContract.resolveViaName(name);
    const taken = resolved !== ethers.ZeroAddress;
 
    res.json({ taken, name, weldedName: `${name}@salva` });
  } catch (error) {
    console.error('❌ Check name failed:', error);
    return handleError(error, res, 'Failed to check name availability');
  }
});

// ================================================================
// NEW: /api/alias/register-name
// Register a name alias on-chain via linkName, then save to DB.
// ================================================================
app.post('/api/alias/register-name', authLimiter, async (req, res) => {
  try {
    const { safeAddress, email, name } = req.body;
 
    if (!name || !/^[a-z2-9.\-_]+$/.test(name) || name.length > 16) {
      return res.status(400).json({ message: 'Invalid name' });
    }
 
    const identifier = sanitizeEmail(email);
    let user = await User.findOne({ email: identifier });
    if (!user) user = await User.findOne({ username: identifier });
    if (!user) return res.status(404).json({ message: 'User not found' });
 
    if (user.nameAlias) return res.status(400).json({ message: 'Name alias already registered' });
 
    // Call linkName on the Salva registry contract
    const REGISTRY_ABI = ["function linkName(string memory,address) external returns (bool)"];
    const registryContract = new ethers.Contract(
      process.env.REGISTRY_CONTRACT_ADDRESS,
      REGISTRY_ABI,
      wallet // backend manager wallet has REGISTRAR_ROLE
    );
 
    let linkTx;
    try {
      linkTx = await registryContract.linkName(name, user.safeAddress);
      console.log(`⏳ linkName TX: ${linkTx.hash}`);
    } catch (err) {
      console.error('❌ linkName send failed:', err.message);
      return res.status(500).json({ message: 'On-chain name registration failed. Please try again.' });
    }
 
    let linkReceipt;
    try {
      linkReceipt = await linkTx.wait();
    } catch (err) {
      console.error('❌ linkName reverted:', err.message);
      return res.status(500).json({ message: 'Name may be taken or invalid. Please try another.' });
    }
 
    if (!linkReceipt || linkReceipt.status === 0) {
      return res.status(500).json({ message: 'On-chain registration failed. Please try again.' });
    }
 
    user.nameAlias = name;
    await user.save();
 
    console.log(`✅ Name alias registered: ${name}@salva for ${user.safeAddress}`);
    res.json({ success: true, nameAlias: name });
  } catch (error) {
    console.error('❌ Register name alias failed:', error);
    return handleError(error, res, 'Failed to register name alias');
  }
});

// ================================================================
// NEW: /api/resolve-for-send
// Resolves name, number, or address for the send flow.
// Returns: { found, address, displayIdentifier }
// ================================================================
app.post('/api/resolve-for-send', async (req, res) => {
  try {
    const { input, inputType, registryAddress, namespace } = req.body;
 
    if (!input || !inputType) return res.status(400).json({ message: 'Input and inputType required' });
 
    let resolvedAddress = null;
    let displayIdentifier = input;
 
    if (inputType === 'address') {
      if (!ethers.isAddress(input)) return res.json({ found: false, message: 'Invalid wallet address' });
      resolvedAddress = input.toLowerCase();
      displayIdentifier = input;
    } else if (inputType === 'number') {
      if (!registryAddress) return res.json({ found: false, message: 'Select a wallet to resolve number' });
      try {
        const REGISTRY_ABI = ["function resolveViaNumber(uint128) view returns (address)"];
        const registryContract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
        const addr = await registryContract.resolveViaNumber(BigInt(input));
        if (!addr || addr === ethers.ZeroAddress) return res.json({ found: false, message: 'Number not found in selected wallet' });
        resolvedAddress = addr.toLowerCase();
        displayIdentifier = input; // show just the number
      } catch (err) {
        return res.json({ found: false, message: 'Failed to resolve number' });
      }
    } else if (inputType === 'name') {
      if (!registryAddress || !namespace) return res.json({ found: false, message: 'Select a wallet to resolve name' });
      try {
        // Weld name with namespace from selected registry
        const ns = namespace.replace('@', ''); // e.g. "salva"
        const REGISTRY_ABI = ["function resolveViaName(string calldata) view returns (address)"];
        const registryContract = new ethers.Contract(registryAddress, REGISTRY_ABI, provider);
        const addr = await registryContract.resolveViaName(input);
        if (!addr || addr === ethers.ZeroAddress) return res.json({ found: false, message: 'Name not found in selected wallet' });
        resolvedAddress = addr.toLowerCase();
        displayIdentifier = `${input}@${ns}`; // welded for display
      } catch (err) {
        return res.json({ found: false, message: 'Failed to resolve name' });
      }
    }
 
    if (!resolvedAddress) return res.json({ found: false, message: 'Could not resolve recipient' });
 
    res.json({ found: true, address: resolvedAddress, displayIdentifier });
  } catch (error) {
    console.error('❌ Resolve for send failed:', error);
    return handleError(error, res, 'Resolution failed');
  }
});

// ===============================================
// GET FEE CONFIG (for frontend to preview fees)
// ===============================================
app.get("/api/fee-config", async (req, res) => {
  try {
    let config = await FeeConfig.findById('main');
    if (!config) {
      config = await FeeConfig.create({ _id: 'main' });
    }
    res.json({
      tier1Min: config.tier1Min,
      tier1Max: config.tier1Max,
      tier1Fee: config.tier1Fee,
      tier2Min: config.tier2Min,
      tier2Fee: config.tier2Fee
    });
  } catch (error) {
    return handleError(error, res, "Failed to fetch fee config");
  }
});

// ================================================================
// NEW: /api/admin/proposals — GET all proposals from DB
// ================================================================
app.get('/api/admin/proposals', async (req, res) => {
  try {
    const proposals = await Proposal.find({}).sort({ proposedAt: -1 });
    res.json(proposals);
  } catch (error) {
    return handleError(error, res, 'Failed to fetch proposals');
  }
});
 
 
// ================================================================
// NEW: /api/admin/proposals/:id — DELETE a proposal record (after execute)
// ================================================================
app.delete('/api/admin/proposals/:id', async (req, res) => {
  try {
    await Proposal.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    return handleError(error, res, 'Failed to delete proposal');
  }
});
 
 
// ================================================================
// NEW: /api/admin/propose-registry
// ================================================================
app.post('/api/admin/propose-registry', authLimiter, async (req, res) => {
  try {
    const { registryName, namespace, registryAddress, privateKey, proposerAddress } = req.body;
 
    if (!registryName || !namespace || !registryAddress || !privateKey) {
      return res.status(400).json({ message: 'All fields required' });
    }
 
    if (!namespace.startsWith('@') || namespace.length > 16) {
      return res.status(400).json({ message: 'Namespace must start with @ and be max 16 chars' });
    }
 
    // Verify proposer is a validator
    const proposer = await User.findOne({ safeAddress: normalizeAddress(proposerAddress) });
    if (!proposer || !proposer.isValidator) {
      return res.status(403).json({ message: 'Not authorized — not a validator' });
    }
 
    // Get total validator count for quorum
    const totalValidators = await User.countDocuments({ isValidator: true });
    const requiredValidationCount = Math.floor((totalValidators - 1) / 2) + 1;
 
    // Call on-chain
    const { txHash, eventData } = await proposeRegistryInit(privateKey, namespace, registryAddress);
    console.log(`✅ Registry proposal TX: ${txHash}`);
 
    // Save proposal to DB
    const proposal = await Proposal.create({
      type: 'registryInit',
      registryName,
      namespace,
      registryAddress: registryAddress.toLowerCase(),
      proposedBy: proposerAddress.toLowerCase(),
      requiredValidationCount,
      validationCount: 0,
      validatedBy: [],
    });
 
    // Email all validators
    const validators = await User.find({ isValidator: true, email: { $exists: true, $ne: null } });
    for (const v of validators) {
      if (v.email) {
        try {
          await sendProposalNotificationEmail(v.email, v.username, {
            type: 'registryInit',
            registryName,
            namespace,
            registryAddress: registryAddress.toLowerCase(),
          });
        } catch (e) { console.error(`Email to ${v.email} failed:`, e.message); }
      }
    }
 
    res.json({ success: true, proposal, txHash, message: 'Registry initialization proposed successfully' });
  } catch (error) {
    console.error('❌ Propose registry failed:', error);
    return handleError(error, res, error.message || 'Failed to propose registry initialization');
  }
});
 
 
// ================================================================
// NEW: /api/admin/propose-validator
// ================================================================
app.post('/api/admin/propose-validator', authLimiter, async (req, res) => {
  try {
    const { targetAddress, action, privateKey, proposerAddress } = req.body;
 
    if (!targetAddress || action === undefined || !privateKey) {
      return res.status(400).json({ message: 'All fields required' });
    }
 
    const proposer = await User.findOne({ safeAddress: normalizeAddress(proposerAddress) });
    if (!proposer || !proposer.isValidator) {
      return res.status(403).json({ message: 'Not authorized' });
    }
 
    const totalValidators = await User.countDocuments({ isValidator: true });
    const requiredValidationCount = Math.floor((totalValidators - 1) / 2) + 1;
 
    const { txHash } = await proposeValidatorUpdate(privateKey, targetAddress, action);
    console.log(`✅ Validator proposal TX: ${txHash}`);
 
    const proposal = await Proposal.create({
      type: 'validatorUpdate',
      validatorAddress: targetAddress.toLowerCase(),
      action,
      proposedBy: proposerAddress.toLowerCase(),
      requiredValidationCount,
      validationCount: 0,
      validatedBy: [],
    });
 
    // Email all validators
    const validators = await User.find({ isValidator: true, email: { $exists: true, $ne: null } });
    for (const v of validators) {
      if (v.email) {
        try {
          await sendProposalNotificationEmail(v.email, v.username, {
            type: 'validatorUpdate',
            validatorAddress: targetAddress.toLowerCase(),
            action,
          });
        } catch (e) { console.error(`Email to ${v.email} failed:`, e.message); }
      }
    }
 
    res.json({ success: true, proposal, txHash, message: 'Validator update proposed successfully' });
  } catch (error) {
    console.error('❌ Propose validator failed:', error);
    return handleError(error, res, error.message || 'Failed to propose validator update');
  }
});
 
 
// ================================================================
// NEW: /api/admin/validate
// Casts a validation vote on a proposal (registry or validator)
// ================================================================
app.post('/api/admin/validate', authLimiter, async (req, res) => {
  try {
    const { proposalId, proposalType, targetAddress, privateKey, validatorAddress } = req.body;
 
    const validator = await User.findOne({ safeAddress: normalizeAddress(validatorAddress) });
    if (!validator || !validator.isValidator) {
      return res.status(403).json({ message: 'Not authorized' });
    }
 
    const proposal = await Proposal.findById(proposalId);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
 
    if (proposal.validatedBy.includes(validatorAddress.toLowerCase())) {
      return res.status(400).json({ message: 'Already validated this proposal' });
    }
 
    let result;
    if (proposalType === 'registryInit') {
      result = await validateRegistry(privateKey, targetAddress);
    } else {
      result = await validateValidator(privateKey, targetAddress);
    }
 
    // Update DB
    proposal.validatedBy.push(validatorAddress.toLowerCase());
    proposal.validationCount += 1;
 
    if (result.timelockSet) {
      proposal.isValidated = true;
      proposal.timelockEndsAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h from now
    }
 
    await proposal.save();
 
    res.json({
      success: true,
      txHash: result.txHash,
      remainingValidation: result.remainingValidation,
      timelockSet: result.timelockSet,
      message: 'Validation cast successfully'
    });
  } catch (error) {
    console.error('❌ Validate failed:', error);
    return handleError(error, res, error.message || 'Validation failed');
  }
});

 
 
// ================================================================
// NEW: /api/admin/execute
// Executes a validated proposal after timelock expires
// ================================================================
app.post('/api/admin/execute', authLimiter, async (req, res) => {
  try {
    const { proposalId, proposalType, targetAddress, privateKey, executorAddress } = req.body;
 
    const executor = await User.findOne({ safeAddress: normalizeAddress(executorAddress) });
    if (!executor || !executor.isValidator) {
      return res.status(403).json({ message: 'Not authorized' });
    }
 
    const proposal = await Proposal.findById(proposalId);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
 
    if (!proposal.isValidated) return res.status(400).json({ message: 'Proposal not yet validated' });
    if (proposal.timelockEndsAt && new Date(proposal.timelockEndsAt) > new Date()) {
      return res.status(400).json({ message: 'Timelock has not expired yet' });
    }
 
    let result;
    if (proposalType === 'registryInit') {
      result = await executeRegistryInit(privateKey, targetAddress);
    } else {
      result = await executeValidatorUpdate(privateKey, targetAddress);
    }
 
    // Mark executed
    proposal.isValidated = false;
    proposal.isExecuted = true;
    proposal.executedAt = new Date();
    proposal.executionSuccess = result.success;
    await proposal.save();
 
    // Post-execution side effects
    if (result.success) {
      if (proposalType === 'registryInit') {
        // Push to WalletRegistry model so it appears in send dropdown
        await WalletRegistry.findOneAndUpdate(
          { registryAddress: targetAddress.toLowerCase() },
          {
            name: proposal.registryName,
            registryAddress: targetAddress.toLowerCase(),
            namespace: proposal.namespace,
            description: `${proposal.registryName} registry — ${proposal.namespace}`,
            active: true
          },
          { upsert: true, new: true }
        );
        console.log(`✅ Registry ${proposal.registryName} added to WalletRegistry`);
      } else if (proposalType === 'validatorUpdate') {
        // Update isValidator on the target user if they exist in DB
        const targetUser = await User.findOne({
          $or: [
            { safeAddress: targetAddress.toLowerCase() },
          ]
        });
        if (targetUser) {
          targetUser.isValidator = proposal.action; // true = add, false = remove
          await targetUser.save();
          console.log(`✅ User ${targetAddress} isValidator set to ${proposal.action}`);
        }
      }
    }
 
    res.json({
      success: result.success,
      txHash: result.txHash,
      message: result.success ? 'Executed successfully on-chain' : 'Execution failed on-chain'
    });
  } catch (error) {
    console.error('❌ Execute failed:', error);
    return handleError(error, res, error.message || 'Execution failed');
  }
});
 
 
// ================================================================
// NEW: /api/admin/cancel
// Cancels a pending proposal
// ================================================================
app.post('/api/admin/cancel', authLimiter, async (req, res) => {
  try {
    const { proposalId, proposalType, targetAddress, privateKey } = req.body;
 
    const proposal = await Proposal.findById(proposalId);
    if (!proposal) return res.status(404).json({ message: 'Proposal not found' });
 
    let result;
    if (proposalType === 'registryInit') {
      result = await cancelRegistryInit(privateKey, targetAddress);
    } else {
      result = await cancelValidatorUpdate(privateKey, targetAddress);
    }
 
    proposal.isCancelled = true;
    await proposal.save();
 
    res.json({ success: true, txHash: result.txHash, message: 'Proposal cancelled' });
  } catch (error) {
    console.error('❌ Cancel failed:', error);
    return handleError(error, res, error.message || 'Cancellation failed');
  }
});

 
 
// ================================================================
// CHANGED: /api/registries
// Add 'namespace' field to the select so frontend can use it
// for name welding during send flow.
// Replace the existing /api/registries route with this:
// ================================================================
app.get('/api/registries', async (req, res) => {
  try {
    const count = await WalletRegistry.countDocuments();
    if (count === 0) {
      await WalletRegistry.create({
        name: 'Salva Wallet',
        registryAddress: process.env.REGISTRY_CONTRACT_ADDRESS,
        namespace: '@salva',
        description: 'Official Salva on-chain payment registry',
        active: true
      });
      console.log('✅ Salva registry seeded into WalletRegistry collection');
    }
    // Include namespace in the response — needed by frontend for name welding
    const registries = await WalletRegistry.find({ active: true }).select('name registryAddress namespace description');
    res.json(registries);
  } catch (error) {
    return handleError(error, res, 'Failed to fetch registries');
  }
});

const {
  isAccountNumber,
  getAccountNumberFromAddress,
  resolveToAddress,
} = require("./services/registryResolver");

// ===============================================
// AUTH ROUTES
// ===============================================
app.post("/api/auth/send-otp", authLimiter, async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    otpStore[email] = {
      code: otp,
      expires: Date.now() + 600000,
      verified: false,
    };

    const data = await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: email,
      subject: "Verify your Salva Account",
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

    console.log("📧 OTP sent successfully via Resend:", data.id);
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("❌ RESEND FAIL:", err);
    return handleError(err, res, "Email service currently unavailable");
  }
});

app.post("/api/auth/verify-otp", authLimiter, (req, res) => {
  try {
    const { email, code } = req.body;
    const sanitizedEmail = sanitizeEmail(email);
    const record = otpStore[sanitizedEmail];

    if (!record) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    if (Date.now() > record.expires) {
      delete otpStore[sanitizedEmail];
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    // Constant-time comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(record.code),
      Buffer.from(String(code)),
    );

    if (!isValid) {
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    record.verified = true;
    res.json({ success: true });
  } catch (error) {
    return handleError(error, res, "Verification failed");
  }
});

// ===================================================================
// REPLACE THE /api/auth/reset-password ROUTE (around line 382) WITH THIS:
// ===================================================================

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    // ✅ CHECK OTP VERIFICATION
    if (!otpStore[sanitizedEmail] || !otpStore[sanitizedEmail].verified) {
      return res
        .status(401)
        .json({ message: "Unauthorized. Verify OTP first." });
    }

    // ✅ VALIDATE PASSWORD STRENGTH
    if (
      !newPassword ||
      !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)
    ) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters with uppercase, lowercase, and number",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // ✅ APPLY 24-HOUR LOCKDOWN
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.findOneAndUpdate(
      { email: sanitizedEmail },
      {
        password: hashedPassword,
        accountLockedUntil: lockoutTime, // ✅ ADD LOCKDOWN
      },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // ✅ CLEAN UP OTP
    delete otpStore[sanitizedEmail];

    // ✅ SEND SECURITY EMAIL
    try {
      const accountNum =
        (await getAccountNumberFromAddress(user.safeAddress)) ||
        user.safeAddress;
      await sendSecurityChangeEmail(
        sanitizedEmail,
        user.username,
        "password",
        accountNum,
      );
    } catch (emailError) {
      console.error("❌ Security email error:", emailError.message);
    }

    res.json({
      success: true,
      message: "Password updated successfully. Account locked for 24 hours.",
      lockedUntil: lockoutTime,
    });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    return handleError(err, res, "Password reset failed");
  }
});

// ================================================================
// CHANGED: /api/register — REMOVE the linkNumber call entirely.
// Registration now only deploys the Safe and saves the user.
// Replace the entire /api/register route with this:
// ================================================================
app.post('/api/register', authLimiter, validateRegistration, async (req, res) => {
  try {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: 'Email already registered' });

    // Deploy Safe wallet
    console.log('🚀 Deploying Safe Wallet...');
    const identityData = await generateAndDeploySalvaIdentity(process.env.BASE_SEPOLIA_RPC_URL);

    // Save user — no account number, no alias yet
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      username,
      email,
      password: hashedPassword,
      safeAddress: identityData.safeAddress,
      ownerPrivateKey: identityData.ownerPrivateKey,
      accountNumber: null,
      nameAlias: null,
      numberAlias: null,
      isValidator: false,
    });
    await newUser.save();
    console.log('✅ User saved to database');

    try { await sendWelcomeEmail(email, username); } catch (e) { console.error('Welcome email error:', e.message); }

    res.json({
      username: newUser.username,
      safeAddress: newUser.safeAddress,
      accountNumber: null,
      nameAlias: null,
      numberAlias: null,
      isValidator: false,
      ownerPrivateKey: newUser.ownerPrivateKey,
      deploymentTx: identityData.deploymentTx,
    });
  } catch (error) {
    console.error('❌ Registration failed:', error);
    return handleError(error, res, 'Registration failed');
  }
});

// ================================================================
// CHANGED: /api/login — Return isValidator, nameAlias, numberAlias
// Replace the entire /api/login route with this:
// ================================================================
app.post('/api/login', authLimiter, async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const { password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

    res.json({
      username: user.username,
      safeAddress: user.safeAddress,
      accountNumber: user.accountNumber || null,
      nameAlias: user.nameAlias || null,
      numberAlias: user.numberAlias || null,
      isValidator: user.isValidator || false,
      ownerPrivateKey: user.ownerPrivateKey,
    });
  } catch (error) {
    return handleError(error, res, 'Login failed');
  }
});

// ===============================================
// RESOLVE ACCOUNT NUMBER TO USERNAME
// ===============================================
app.post("/api/resolve-account-info", async (req, res) => {
  try {
    const { accountNumberOrAddress } = req.body;

    if (!accountNumberOrAddress) {
      return res
        .status(400)
        .json({ message: "Account number or address required" });
    }

    let user;

    // Check if it's an address (starts with 0x)
    if (accountNumberOrAddress.toLowerCase().startsWith("0x")) {
      user = await User.findOne({
        safeAddress: normalizeAddress(accountNumberOrAddress),
      });
    } else {
      // It's an account number
      user = await User.findOne({
        accountNumber: accountNumberOrAddress,
      });
    }

    if (!user) {
      return res.status(404).json({
        message: "Account not found",
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
    console.error("❌ Resolve account error:", error);
    return handleError(error, res, "Failed to resolve account");
  }
});

// ===============================================
// BALANCE
// ===============================================
app.get("/api/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const TOKEN_ABI = ["function balanceOf(address) view returns (uint256)"];
    const tokenContract = new ethers.Contract(
      process.env.NGN_TOKEN_ADDRESS,
      TOKEN_ABI,
      provider,
    );

    const balanceWei = await retryRPCCall(
      async () => await tokenContract.balanceOf(address),
    );

    const balance = ethers.formatUnits(balanceWei, 6);

    res.json({ balance });
  } catch (error) {
    console.error("❌ Balance Fetch Failed:", error.message);
    res.status(200).json({ balance: "0.00" });
  }
});

// ===============================================
// APPROVALS
// ===============================================
app.get("/api/approvals/:address", async (req, res) => {
  try {
    const ownerAddress = req.params.address.toLowerCase();

    if (!ethers.isAddress(ownerAddress)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const savedApprovals = await Approval.find({ owner: ownerAddress });

    const TOKEN_ABI = [
      "function allowance(address,address) view returns (uint256)",
    ];
    const tokenContract = new ethers.Contract(
      process.env.NGN_TOKEN_ADDRESS,
      TOKEN_ABI,
      provider,
    );

    const liveApprovals = await Promise.all(
      savedApprovals.map(async (app) => {
        try {
          const spenderAddress = app.spender;
          const liveAllowanceWei = await tokenContract.allowance(
            ownerAddress,
            spenderAddress,
          );
          const liveAmount = ethers.formatUnits(liveAllowanceWei, 6);

          if (parseFloat(liveAmount) <= 0) {
            await Approval.deleteOne({ _id: app._id });
            return null;
          }

          if (liveAmount !== app.amount) {
            await Approval.updateOne(
              { _id: app._id },
              { $set: { amount: liveAmount } },
            );
            app.amount = liveAmount;
          }

          // --- SURGICAL ADDITION: USER LOOKUP ---
          const spenderUser = await User.findOne({
            $or: [
              { safeAddress: spenderAddress.toLowerCase() },
              { accountNumber: app.spenderInput }
            ]
          });

          let displaySpender;
          if (app.spenderInputType === "accountNumber") {
            displaySpender = app.spenderInput;
          } else {
            displaySpender = spenderAddress;
          }

          return {
            _id: app._id,
            spender: spenderAddress,
            displaySpender: displaySpender,
            displayName: spenderUser?.username || null, // Added Display Name
            amount: app.amount,
            date: app.date,
            inputType: app.spenderInputType,
          };
        } catch (err) {
          console.error(`Sync failed for ${app.spender}:`, err.message);
          return null;
        }
      }),
    );

    res.json(liveApprovals.filter((app) => app !== null));
  } catch (error) {
    console.error("Critical Approval Route Error:", error);
    return handleError(error, res, "Failed to fetch approvals");
  }
});

// ===============================================
// INCOMING ALLOWANCES - FIXED
// ===============================================
app.get("/api/allowances-for/:address", async (req, res) => {
  try {
    const userAddress = req.params.address.toLowerCase();

    if (!ethers.isAddress(userAddress)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const TOKEN_ABI = [
      "function allowance(address,address) view returns (uint256)",
    ];
    const tokenContract = new ethers.Contract(
      process.env.NGN_TOKEN_ADDRESS,
      TOKEN_ABI,
      provider,
    );

    const allApprovals = await Approval.find({});
    const relevantApprovals = [];

    for (const app of allApprovals) {
      try {
        const spenderAddress = app.spender.toLowerCase();

        if (spenderAddress === userAddress) {
          const liveAllowanceWei = await tokenContract.allowance(
            app.owner,
            userAddress,
          );
          const liveAmount = ethers.formatUnits(liveAllowanceWei, 6);

          if (parseFloat(liveAmount) > 0) {
            if (liveAmount !== app.amount) {
              await Approval.updateOne(
                { _id: app._id },
                { $set: { amount: liveAmount } },
              );
            }

            // --- SURGICAL ADDITION: ALLOWER LOOKUP ---
            const allowerUser = await User.findOne({
              safeAddress: app.owner.toLowerCase()
            });

            let ownerDisplay, spenderDisplay;

            if (app.spenderInputType === "accountNumber") {
              ownerDisplay = allowerUser?.accountNumber || app.owner;
              spenderDisplay = app.spenderInput;
            } else {
              ownerDisplay = app.owner;
              spenderDisplay = userAddress;
            }

            relevantApprovals.push({
              allower: ownerDisplay,
              allowerAddress: app.owner,
              displayName: allowerUser?.username || null, // Added Display Name
              spenderDisplay: spenderDisplay,
              amount: liveAmount,
              date: app.date,
            });
          } else {
            await Approval.deleteOne({ _id: app._id });
          }
        }
      } catch (err) {
        console.error(`Error processing approval ${app._id}:`, err.message);
      }
    }

    res.json(relevantApprovals);
  } catch (error) {
    console.error("Critical Incoming Allowance Route Error:", error);
    return handleError(error, res, "Failed to fetch allowances");
  }
});

// ===============================================
// TRANSFER — with fee, registry resolution, multicall
// ===============================================
app.post("/api/transfer", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, toInput, amount, registryAddress } = req.body;

    validateAmount(amount);

    // ── Resolve recipient ───────────────────────────────────────────────────
    let recipientAddress;
    try {
      // If toInput is an account number, registryAddress must be provided
      recipientAddress = await resolveToAddress(toInput, registryAddress || null);
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }

    // ── Fee calculation ─────────────────────────────────────────────────────
    const { feeNGN, feeWei } = await getFeeForAmount(amount);
    const amountNum = parseFloat(amount);

    // Determine how much recipient actually receives
    // If sender has enough balance to cover amount + fee: recipient gets full amount
    // If sender only has enough for amount: fee is deducted from amount
    // (balance check happens on-chain; we decide the split here for UX display)
    const TOKEN_ABI = ["function balanceOf(address) view returns (uint256)"];
    const tokenContract = new ethers.Contract(process.env.NGN_TOKEN_ADDRESS, TOKEN_ABI, provider);
    const balanceWei = await tokenContract.balanceOf(safeAddress);
    const balanceNum = parseFloat(ethers.formatUnits(balanceWei, 6));

    let actualAmountWei;    // what recipient gets
    let actualFeeWei;       // what treasury gets
    let recipientReceives;  // human-readable for display

    if (feeNGN === 0) {
      // Free tier
      actualAmountWei = ethers.parseUnits(amount.toString(), 6);
      actualFeeWei = 0n;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum + feeNGN) {
      // Sender covers full amount + fee from their balance
      actualAmountWei = ethers.parseUnits(amount.toString(), 6);
      actualFeeWei = feeWei;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum) {
      // Fee comes out of the sent amount (recipient gets less)
      recipientReceives = amountNum - feeNGN;
      if (recipientReceives <= 0) {
        return res.status(400).json({ message: "Amount too small to cover fee" });
      }
      actualAmountWei = ethers.parseUnits(recipientReceives.toString(), 6);
      actualFeeWei = feeWei;
    } else {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ── Sender / recipient metadata ─────────────────────────────────────────
    const senderUser = await User.findOne({ safeAddress: normalizeAddress(safeAddress) });
    const recipientUser = await User.findOne({ safeAddress: normalizeAddress(recipientAddress) });
    const senderAccountNumber = senderUser?.accountNumber || null;

    await delayBeforeBlockchain(safeAddress, "Transfer queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "transfer",
      payload: { toInput, amount, recipientAddress, feeNGN },
    }).save();

    try {
      queueEntry.status = "SENDING";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      const result = await sponsorSafeTransfer(
        safeAddress,
        userPrivateKey,
        recipientAddress,
        actualAmountWei,
        actualFeeWei,
      );

      if (!result || !result.taskId) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit to relay";
        await queueEntry.save();

        await new Transaction({
          fromAddress: safeAddress.toLowerCase(),
          fromAccountNumber: senderAccountNumber,
          fromUsername: senderUser?.username || null,
          toAddress: recipientAddress,
          toAccountNumber: isAccountNumber(toInput) ? toInput : null,
          toUsername: recipientUser?.username || null,
          senderDisplayIdentifier: senderAccountNumber || safeAddress.toLowerCase(),
          amount: amount,
          status: "failed",
          taskId: null,
          type: "transfer",
          date: new Date(),
        }).save();

        return res.status(400).json({ success: false, message: "Transfer failed on blockchain" });
      }

      queueEntry.taskId = result.taskId;
      await queueEntry.save();

      const taskStatus = await checkGelatoTaskStatus(result.taskId);

      const txRecord = {
        fromAddress: safeAddress.toLowerCase(),
        fromAccountNumber: senderAccountNumber,
        fromUsername: senderUser?.username || null,
        toAddress: recipientAddress,
        toAccountNumber: isAccountNumber(toInput) ? toInput : null,
        toUsername: recipientUser?.username || null,
        senderDisplayIdentifier: senderAccountNumber || safeAddress.toLowerCase(),
        amount: amount,
        status: taskStatus.success ? "successful" : "failed",
        taskId: result.taskId,
        type: "transfer",
        date: new Date(),
      };

      await new Transaction(txRecord).save();

      if (taskStatus.success) {
        queueEntry.status = "CONFIRMED";
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
        await applyCooldown(safeAddress, 20);

        if (senderUser?.email) {
          try { await sendTransactionEmailToSender(senderUser.email, senderUser.username, toInput, amount, "successful"); } catch (e) { console.error("❌ Sender email:", e.message); }
        }
        if (recipientUser?.email) {
          try { await sendTransactionEmailToReceiver(recipientUser.email, recipientUser.username, senderAccountNumber || safeAddress, amount); } catch (e) { console.error("❌ Receiver email:", e.message); }
        }

        return res.json({ success: true, taskId: result.taskId, feeNGN, recipientReceives });
      } else {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = taskStatus.reason;
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
        return res.status(400).json({ success: false, message: taskStatus.reason || "Transfer reverted on blockchain" });
      }
    } catch (error) {
      queueEntry.status = "FAILED";
      queueEntry.errorMessage = error.message;
      queueEntry.updatedAt = new Date();
      await queueEntry.save();
      throw error;
    }
  } catch (error) {
    console.error("❌ Transfer failed:", error.message);
    return handleError(error, res, error.message || "Transfer failed");
  }
});

// ===============================================
// APPROVE — registry resolution, no fee
// ===============================================
app.post("/api/approve", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, spenderInput, amount, registryAddress } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0 || numAmount > 1000000000) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    let finalSpenderAddress;
    try {
      finalSpenderAddress = await resolveToAddress(spenderInput, registryAddress || null);
    } catch (error) {
      return res.status(404).json({ message: `Spender: ${error.message}` });
    }

    const amountWei = ethers.parseUnits(amount.toString(), 6);

    await delayBeforeBlockchain(safeAddress, "Approval queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "approve",
      payload: { spenderInput, amount, finalSpenderAddress },
    }).save();

    try {
      queueEntry.status = "SENDING";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      // No fee on approvals — pass resolved address directly
      const result = await sponsorSafeApprove(safeAddress, userPrivateKey, finalSpenderAddress, amountWei);

      if (!result || !result.taskId) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit";
        await queueEntry.save();
        return res.status(400).json({ message: "Approval failed to submit" });
      }

      queueEntry.taskId = result.taskId;
      await queueEntry.save();

      const taskStatus = await checkGelatoTaskStatus(result.taskId);

      if (!taskStatus.success) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = taskStatus.reason;
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
        return res.status(400).json({ success: false, message: taskStatus.reason || "Approval reverted" });
      }

      queueEntry.status = "CONFIRMED";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      const inputType = isAccountNumber(spenderInput) ? "accountNumber" : "address";

      if (numAmount === 0) {
        await Approval.deleteOne({ owner: safeAddress.toLowerCase(), spender: finalSpenderAddress.toLowerCase() });
      } else {
        await Approval.findOneAndUpdate(
          { owner: safeAddress.toLowerCase(), spender: finalSpenderAddress.toLowerCase() },
          { amount: amount, date: new Date(), spenderInput: spenderInput, spenderInputType: inputType },
          { upsert: true, new: true },
        );
      }

      await applyCooldown(safeAddress, 20);

      const approverUser = await User.findOne({ safeAddress: normalizeAddress(safeAddress) });
      const spenderUser = await User.findOne({ safeAddress: normalizeAddress(finalSpenderAddress) });

      if (approverUser?.email) {
        try { await sendApprovalEmailToApprover(approverUser.email, approverUser.username, spenderInput, amount); } catch (e) { console.error("❌ Approver email:", e.message); }
      }
      if (spenderUser?.email) {
        try { await sendApprovalEmailToSpender(spenderUser.email, spenderUser.username, approverUser?.username || safeAddress, amount); } catch (e) { console.error("❌ Spender email:", e.message); }
      }

      res.json({ success: true, taskId: result.taskId });
    } catch (error) {
      queueEntry.status = "FAILED";
      queueEntry.errorMessage = error.message;
      queueEntry.updatedAt = new Date();
      await queueEntry.save();
      throw error;
    }
  } catch (error) {
    console.error("Approval Error:", error);
    return handleError(error, res, error.message || "Approval failed");
  }
});

// ===============================================
// TRANSACTIONS.
// ===============================================
app.get("/api/transactions/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const transactions = await Transaction.find({
      $or: [
        { fromAddress: address },
        { toAddress: address, status: "successful" },
      ],
    })
      .sort({ date: -1 })
      .limit(50);

    const formatted = transactions.map((tx) => {
      const isReceived =
        tx.toAddress?.toLowerCase() === address && tx.status === "successful";
      const isFailed = tx.status === "failed";

      const displayPartner = isReceived
        ? tx.senderDisplayIdentifier || tx.fromAccountNumber || tx.fromAddress
        : tx.toAccountNumber || tx.toAddress;

      return {
        ...tx._doc,
        displayType: isFailed ? "failed" : isReceived ? "receive" : "sent",
        displayPartner: displayPartner,
      };
    });

    res.json(formatted);
  } catch (error) {
    console.error("❌ History Fetch Error:", error);
    return handleError(error, res, "Failed to fetch transactions");
  }
});

// ===============================================
// TRANSFERFROM — fee, registry resolution, multicall
// ===============================================
app.post("/api/transferFrom", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, fromInput, toInput, amount, fromRegistry, toRegistry } = req.body;

    validateAmount(amount);

    let fromAddress, toAddress;
    try {
      fromAddress = await resolveToAddress(fromInput, fromRegistry || null);
    } catch (error) {
      return res.status(404).json({ success: false, message: `Source: ${error.message}` });
    }
    try {
      toAddress = await resolveToAddress(toInput, toRegistry || null);
    } catch (error) {
      return res.status(404).json({ success: false, message: `Destination: ${error.message}` });
    }

    // ── Fee calculation (same logic as transfer) ────────────────────────────
    const { feeNGN, feeWei } = await getFeeForAmount(amount);
    const amountNum = parseFloat(amount);

    let actualAmountWei;
    let actualFeeWei;
    let recipientReceives;

    if (feeNGN === 0) {
      actualAmountWei = ethers.parseUnits(amount.toString(), 6);
      actualFeeWei = 0n;
      recipientReceives = amountNum;
    } else {
      // For transferFrom, fee comes out of the amount (allowance covers amount+fee or amount only)
      // We deduct fee from the transfer amount to keep it simple
      recipientReceives = amountNum - feeNGN;
      if (recipientReceives <= 0) {
        return res.status(400).json({ message: "Amount too small to cover fee" });
      }
      actualAmountWei = ethers.parseUnits(recipientReceives.toString(), 6);
      actualFeeWei = feeWei;
    }

    const fromUser = await User.findOne({ safeAddress: normalizeAddress(fromAddress) });
    const toUser = await User.findOne({ safeAddress: normalizeAddress(toAddress) });
    const fromInputWasAccountNumber = isAccountNumber(fromInput);
    const senderDisplayIdentifier = fromInputWasAccountNumber ? fromInput : fromAddress;

    await delayBeforeBlockchain(safeAddress, "TransferFrom queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "transferFrom",
      payload: { fromInput, toInput, amount, fromAddress, toAddress, feeNGN },
    }).save();

    try {
      queueEntry.status = "SENDING";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      const result = await sponsorSafeTransferFrom(
        userPrivateKey,
        safeAddress,
        fromAddress,
        toAddress,
        actualAmountWei,
        actualFeeWei,
      );

      if (!result || !result.taskId) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit";
        await queueEntry.save();

        await new Transaction({
          fromAddress,
          fromAccountNumber: fromInputWasAccountNumber ? fromInput : null,
          fromUsername: fromUser?.username || null,
          toAddress,
          toAccountNumber: isAccountNumber(toInput) ? toInput : null,
          toUsername: toUser?.username || null,
          senderDisplayIdentifier,
          executorAddress: safeAddress.toLowerCase(),
          amount,
          status: "failed",
          taskId: null,
          type: "transferFrom",
          date: new Date(),
        }).save();

        return res.status(400).json({ success: false, message: "Transfer failed to submit" });
      }

      queueEntry.taskId = result.taskId;
      await queueEntry.save();

      const taskStatus = await checkGelatoTaskStatus(result.taskId);

      queueEntry.status = taskStatus.success ? "CONFIRMED" : "FAILED";
      queueEntry.errorMessage = taskStatus.success ? null : taskStatus.reason;
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      await new Transaction({
        fromAddress,
        fromAccountNumber: fromInputWasAccountNumber ? fromInput : null,
        fromUsername: fromUser?.username || null,
        toAddress,
        toAccountNumber: isAccountNumber(toInput) ? toInput : null,
        toUsername: toUser?.username || null,
        senderDisplayIdentifier,
        executorAddress: safeAddress.toLowerCase(),
        amount,
        status: taskStatus.success ? "successful" : "failed",
        type: "transferFrom",
        taskId: result.taskId,
        date: new Date(),
      }).save();

      if (!taskStatus.success) {
        return res.status(400).json({ success: false, message: taskStatus.reason || "Transfer reverted" });
      }

      await applyCooldown(safeAddress, 20);

      if (fromUser?.email) {
        try { await sendTransactionEmailToSender(fromUser.email, fromUser.username, toInput, amount, "successful"); } catch (e) { console.error("❌ From email:", e.message); }
      }
      if (toUser?.email) {
        try { await sendTransactionEmailToReceiver(toUser.email, toUser.username, fromInput, amount); } catch (e) { console.error("❌ To email:", e.message); }
      }

      res.json({ success: true, taskId: result.taskId, feeNGN, recipientReceives });
    } catch (error) {
      queueEntry.status = "FAILED";
      queueEntry.errorMessage = error.message;
      queueEntry.updatedAt = new Date();
      await queueEntry.save();
      throw error;
    }
  } catch (error) {
    console.error("❌ TransferFrom failed:", error.message);
    return handleError(error, res, error.message || "Transfer failed");
  }
});

// ===============================================
// PIN MANAGEMENT
// ===============================================
app.get("/api/user/pin-status/:email", async (req, res) => {
  try {
    const email = sanitizeEmail(req.params.email);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      hasPin: !!user.transactionPin,
      pinSetupCompleted: user.pinSetupCompleted || false,
      isLocked:
        user.accountLockedUntil &&
        new Date(user.accountLockedUntil) > new Date(),
      lockedUntil: user.accountLockedUntil,
    });
  } catch (error) {
    return handleError(error, res, "Failed to check PIN status");
  }
});

app.post("/api/user/set-pin", authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;

    validatePin(pin);

    const sanitizedEmail = sanitizeEmail(email);
    let user = await User.findOne({ email: sanitizedEmail });

    if (!user) {
      user = await User.findOne({ username: sanitizedEmail });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.transactionPin) {
      return res
        .status(400)
        .json({ message: "PIN already set. Use reset-pin instead." });
    }

    const hashedPin = hashPin(pin);
    const encryptedKey = encryptPrivateKey(user.ownerPrivateKey, pin);

    user.transactionPin = hashedPin;
    user.ownerPrivateKey = encryptedKey;
    user.pinSetupCompleted = true;
    await user.save();

    console.log(`✅ PIN set for user: ${user.email || user.username}`);
    res.json({ success: true, message: "Transaction PIN set successfully!" });
  } catch (error) {
    console.error("❌ Set PIN error:", error);
    return handleError(error, res, "Failed to set PIN");
  }
});

app.post("/api/user/verify-pin", authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;

    validatePin(pin);

    const sanitizedEmail = sanitizeEmail(email);
    let user = await User.findOne({ email: sanitizedEmail });

    if (!user) {
      user = await User.findOne({ username: sanitizedEmail });
    }

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.transactionPin) {
      return res
        .status(400)
        .json({ message: "No PIN set. Please set PIN first." });
    }

    const isValid = verifyPin(pin, user.transactionPin);

    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid PIN" });
    }

    if (
      user.accountLockedUntil &&
      new Date(user.accountLockedUntil) > new Date()
    ) {
      const hoursLeft = Math.ceil(
        (new Date(user.accountLockedUntil) - new Date()) / (1000 * 60 * 60),
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
        message: "Invalid PIN or corrupted key",
      });
    }

    res.json({
      success: true,
      privateKey: decryptedKey,
    });
  } catch (error) {
    console.error("❌ Verify PIN error:", error);
    return res.status(401).json({
      success: false,
      message: "Invalid PIN or corrupted key",
    });
  }
});

app.post("/api/user/reset-pin", authLimiter, async (req, res) => {
  try {
    const { email, oldPin, newPin } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    if (!otpStore[sanitizedEmail] || !otpStore[sanitizedEmail].verified) {
      return res.status(401).json({ message: "Please verify OTP first" });
    }

    validatePin(oldPin);
    validatePin(newPin);

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.transactionPin) {
      return res
        .status(400)
        .json({ message: "No PIN set. Please use set-pin instead." });
    }

    const isOldPinValid = verifyPin(oldPin, user.transactionPin);
    if (!isOldPinValid) {
      return res
        .status(401)
        .json({ message: "Invalid old PIN. Reset failed." });
    }

    let privateKey;
    try {
      privateKey = decryptPrivateKey(user.ownerPrivateKey, oldPin);
    } catch (error) {
      return res.status(401).json({
        message: "Failed to decrypt private key with old PIN.",
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

    delete otpStore[sanitizedEmail];

    // ✅ SEND SECURITY EMAIL
    try {
      const accountNum =
        (await getAccountNumberFromAddress(user.safeAddress)) ||
        user.safeAddress;
      await sendSecurityChangeEmail(
        sanitizedEmail,
        user.username,
        "pin",
        accountNum,
      );
    } catch (emailError) {
      console.error("❌ Security email error:", emailError.message);
    }

    console.log(`✅ PIN reset for user: ${sanitizedEmail}`);
    res.json({
      success: true,
      message: "PIN reset successful. Account locked for 24 hours.",
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error("❌ Reset PIN error:", error);
    return handleError(error, res, "Failed to reset PIN");
  }
});

app.post("/api/user/update-email", authLimiter, async (req, res) => {
  try {
    const { oldEmail, newEmail } = req.body;

    const sanitizedOldEmail = sanitizeEmail(oldEmail);
    const sanitizedNewEmail = sanitizeEmail(newEmail);

    if (!otpStore[sanitizedOldEmail] || !otpStore[sanitizedOldEmail].verified) {
      return res.status(401).json({ message: "Please verify OTP first" });
    }

    const user = await User.findOne({ email: sanitizedOldEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingUser = await User.findOne({ email: sanitizedNewEmail });
    if (existingUser) {
      return res.status(400).json({ message: "Email already in use" });
    }

    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.email = sanitizedNewEmail;
    user.accountLockedUntil = lockoutTime;
    await user.save();

    delete otpStore[sanitizedOldEmail];

    // ✅ SEND TWO EMAILS - Security alert to OLD email, Confirmation to NEW email
    try {
      const accountNum =
        (await getAccountNumberFromAddress(user.safeAddress)) ||
        user.safeAddress;

      // Send security alert to OLD email (with warning about unauthorized change)
      await sendSecurityChangeEmail(
        sanitizedOldEmail, // ✅ OLD EMAIL gets the warning
        user.username,
        "email",
        accountNum,
      );

      // Send confirmation to NEW email (friendly, no panic)
      await sendEmailChangeConfirmation(
        sanitizedNewEmail, // ✅ NEW EMAIL gets the confirmation
        user.username,
        accountNum,
      );
    } catch (emailError) {
      console.error("❌ Email notification error:", emailError.message);
    }

    res.json({
      success: true,
      message: "Email updated. Account locked for 24 hours.",
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error("❌ Update email error:", error);
    return handleError(error, res, "Failed to update email");
  }
});

app.post("/api/user/update-password", authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    if (!otpStore[sanitizedEmail] || !otpStore[sanitizedEmail].verified) {
      return res.status(401).json({ message: "Please verify OTP first" });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return res.status(400).json({
        message:
          "Password must be at least 8 characters with uppercase, lowercase, and number",
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    user.password = hashedPassword;
    user.accountLockedUntil = lockoutTime;
    await user.save();

    delete otpStore[sanitizedEmail];

    // ✅ SEND SECURITY EMAIL
    try {
      const accountNum =
        (await getAccountNumberFromAddress(user.safeAddress)) ||
        user.safeAddress;
      await sendSecurityChangeEmail(
        sanitizedEmail,
        user.username,
        "password",
        accountNum,
      );
    } catch (emailError) {
      console.error("❌ Security email error:", emailError.message);
    }

    res.json({
      success: true,
      message: "Password updated. Account locked for 24 hours.",
      lockedUntil: lockoutTime,
    });
  } catch (error) {
    console.error("❌ Update password error:", error);
    return handleError(error, res, "Failed to update password");
  }
});

app.post("/api/user/update-username", async (req, res) => {
  try {
    const { email, newUsername } = req.body;

    const sanitizedEmail = sanitizeEmail(email);

    if (!newUsername || !/^[a-zA-Z0-9_]{3,20}$/.test(newUsername)) {
      return res.status(400).json({
        message: "Username must be 3-20 alphanumeric characters",
      });
    }

    const user = await User.findOne({ email: sanitizedEmail });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const existingUser = await User.findOne({ username: newUsername });
    if (existingUser && existingUser._id.toString() !== user._id.toString()) {
      return res.status(400).json({ message: "Username already taken" });
    }

    user.username = newUsername;
    await user.save();

    res.json({ success: true, message: "Username updated successfully!" });
  } catch (error) {
    console.error("❌ Update username error:", error);
    return handleError(error, res, "Failed to update username");
  }
});

// ===============================================
// STATS
// ===============================================
app.get("/api/stats", async (req, res) => {
  try {
    const citizenCount = await User.countDocuments();
    let totalSupply = "0";

    try {
      const TOKEN_ABI = ["function totalSupply() view returns (uint256)"];
      const tokenContract = new ethers.Contract(
        process.env.NGN_TOKEN_ADDRESS,
        TOKEN_ABI,
        provider,
      );
      const supplyWei = await retryRPCCall(
        async () => await tokenContract.totalSupply(),
      );
      totalSupply = ethers.formatUnits(supplyWei, 6);
    } catch (rpcError) {
      console.error("Failed to fetch total supply:", rpcError.message);
      totalSupply = "0";
    }

    res.json({ userCount: citizenCount.toString(), totalMinted: totalSupply });
  } catch (error) {
    console.error("Stats fetch error:", error);
    res.status(200).json({ userCount: "0", totalMinted: "0" });
  }
});

// ===============================================
// ERROR HANDLER
// ===============================================
app.use((err, req, res, next) => {
  console.error("Final Catch-All Error:", err.stack);

  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ message: "Internal Server Error" });
  } else {
    res.status(500).json({
      message: "Internal Server Error",
      error: err.message,
      stack: err.stack,
    });
  }
});

// ===============================================
// START SERVER
// ===============================================
const PORT = process.env.PORT || 3001;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 SALVA BACKEND ACTIVE ON PORT ${PORT}`);
  console.log(`🔒 Security features enabled:`);
  console.log(`   ✅ MongoDB injection protection`);
  console.log(`   ✅ Rate limiting (Auth: 5/15min, API: 100/min)`);
  console.log(`   ✅ Security headers (Helmet)`);
  console.log(`   ✅ Input validation`);
  console.log(`   ✅ PBKDF2 encryption (600k iterations)`);
  console.log(`   ✅ Constant-time comparisons`);
  console.log(`   ✅ Environment-based CORS`);

  // ✅ START CLEANUP HERE (after everything is loaded)
  setInterval(cleanupStaleQueueEntries, 5 * 60 * 1000);
  console.log(`   ✅ Transaction queue cleanup (every 5 minutes)`);
});

// ===============================================
// KEEP-ALIVE (Update with your actual domain)
// ===============================================
const INTERVAL = 10 * 60 * 1000;
const URL = "https://salva-api-lx2t.onrender.com/api/stats"; // Update if different

function reloadWebsite() {
  fetch(URL)
    .then(() => console.log("⚓ Keep-Alive: Side-ping successful"))
    .catch((err) => console.error("⚓ Keep-Alive Error:", err.message));
}

setInterval(reloadWebsite, INTERVAL);
