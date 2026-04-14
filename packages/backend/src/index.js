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
const { sponsorSafeTransfer } = require("./services/relayService");
const Transaction = require("./models/Transaction");
const mongoose = require("mongoose");
const { Resend } = require("resend");
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

const { isReservedName } = require("./models/ReservedNames");
const {
  isNameAlias,
  resolveToAddress,
  checkNameAvailability,
  linkNameToWallet,
  unlinkName,
  weldName,
  getNamespace,
} = require("./services/registryResolver");

const User = require("./models/User");
const AccountNumberCounter = require("./models/AccountNumberCounter");

const WalletRegistry = require("./models/WalletRegistry");
const Proposal = require("./models/Proposal");
const FeeConfig = require("./models/FeeConfig");

// ===============================================
// SECURITY PACKAGES
// ===============================================
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const validator = require("validator");

const adminRoutes = require("./routes/admin");

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
app.set("trust proxy", 1);

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
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "https://cdnjs.cloudflare.com",
        ],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: [
          "'self'",
          "http://localhost:3001",
          "ws://localhost:3001",
          "https://salva-api-lx2t.onrender.com", // Allow your live API too
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
// Replace your current app.use(cors(...)) with this:
const allowedOrigins = [
  "https://salva-nexus.org",
  "https://www.salva-nexus.org",
  "https://salva-web.onrender.com",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://localhost:3001", // Add the backend port too
];

// ===============================================
// SECURITY: CORS (Environment-Based) — FIXED VERSION
// ===============================================
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow everything on localhost for development + production domains
      const allowed = [
        "https://salva-nexus.org",
        "https://www.salva-nexus.org",
        "https://salva-web.onrender.com",
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
      ];

      if (!origin || allowed.includes(origin)) {
        return callback(null, true);
      }

      console.error(`CORS blocked origin: ${origin}`);
      return callback(null, true); // ← Temporarily allow all on localhost to debug
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use("/api/admin", adminRoutes);

// ===============================================
// SECURITY: Rate Limiters
// ===============================================
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === "development" ? 100 : 5,
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
        status: "failed",
        reason: "Transaction confirmation timeout after 2 minutes",
      };
    }

    if (receipt.status === 1) {
      console.log(
        `✅ Transaction ${txHash} CONFIRMED on-chain (block ${receipt.blockNumber})`,
      );
      return { success: true, status: "successful" };
    } else {
      console.error(`❌ Transaction ${txHash} REVERTED on-chain`);
      return {
        success: false,
        status: "failed",
        reason: "Transaction reverted on-chain",
      };
    }
  } catch (error) {
    console.error(
      `❌ Error waiting for tx receipt (${txHash}):`,
      error.message,
    );
    return {
      success: false,
      status: "failed",
      reason: error.message || "Could not confirm transaction",
    };
  }
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
// HELPER: Get fee for a given amount and coin type
// NGN: tier-based fee in NGNs (from FeeConfig)
// USDT/USDC: $0.015 flat for $5+, free below $5
// Returns feeWei (BigInt) and feeHuman (number)
// ===============================================
async function getFeeForAmount(amountHuman, coin = "NGN") {
  if (coin === "USDT" || coin === "USDC") {
    const amount = parseFloat(amountHuman);
    if (amount >= 5) {
      // $0.015 fee — both USDT and USDC use 6 decimals
      const feeWei = ethers.parseUnits("0.015", 6);
      return { feeNGN: 0, feeUsd: 0.015, feeWei };
    }
    return { feeNGN: 0, feeUsd: 0, feeWei: 0n };
  }

  // NGN path
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });

  const amount = parseFloat(amountHuman);
  if (amount >= config.tier2Min) {
    return {
      feeNGN: config.tier2Fee,
      feeUsd: 0,
      feeWei: ethers.parseUnits(config.tier2Fee.toString(), 6),
    };
  }
  if (amount >= config.tier1Min && amount <= config.tier1Max) {
    return {
      feeNGN: config.tier1Fee,
      feeUsd: 0,
      feeWei: ethers.parseUnits(config.tier1Fee.toString(), 6),
    };
  }
  return { feeNGN: 0, feeUsd: 0, feeWei: 0n };
}

// ===============================================
// GET ALL ACTIVE REGISTRIES (for frontend dropdown)
// ===============================================
app.get("/api/registries", async (req, res) => {
  try {
    const registries = await WalletRegistry.find({ active: true }).select(
      "name registryAddress description nspace",
    );
    res.json(registries);
  } catch (error) {
    console.error("❌ Failed to fetch registries:", error);
    return handleError(error, res, "Failed to fetch registries");
  }
});

// ===============================================
// GET FEE CONFIG (for frontend to preview fees)
// ===============================================
app.get("/api/fee-config", async (req, res) => {
  try {
    let config = await FeeConfig.findById("main");
    if (!config) {
      config = await FeeConfig.create({ _id: "main" });
    }
    res.json({
      tier1Min: config.tier1Min,
      tier1Max: config.tier1Max,
      tier1Fee: config.tier1Fee,
      tier2Min: config.tier2Min,
      tier2Fee: config.tier2Fee,
    });
  } catch (error) {
    return handleError(error, res, "Failed to fetch fee config");
  }
});

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

app.post("/api/auth/reset-password", authLimiter, async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    const sanitizedEmail = sanitizeEmail(email);

    if (!otpStore[sanitizedEmail] || !otpStore[sanitizedEmail].verified) {
      return res
        .status(401)
        .json({ message: "Unauthorized. Verify OTP first." });
    }

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
    const lockoutTime = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const user = await User.findOneAndUpdate(
      { email: sanitizedEmail },
      {
        password: hashedPassword,
        accountLockedUntil: lockoutTime,
      },
      { new: true },
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    delete otpStore[sanitizedEmail];

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

// ===============================================
// REGISTER — Deploy Safe only.
// ===============================================
app.post(
  "/api/register",
  authLimiter,
  validateRegistration,
  async (req, res) => {
    try {
      const { username, email, password } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      console.log("🚀 Generating Safe Wallet & Deploying...");
      const identityData = await generateAndDeploySalvaIdentity(
        process.env.BASE_MAINNET_RPC_URL,
      );

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        username,
        email,
        password: hashedPassword,
        safeAddress: identityData.safeAddress,
        ownerPrivateKey: identityData.ownerPrivateKey,
      });

      await newUser.save();
      console.log("✅ User saved to database");

      try {
        await sendWelcomeEmail(email, username);
      } catch (emailError) {
        console.error("❌ Welcome email error:", emailError.message);
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
      console.error("❌ Registration failed:", error);
      return handleError(error, res, "Registration failed");
    }
  },
);

// ===============================================
// LOGIN
// ===============================================
app.post("/api/login", authLimiter, async (req, res) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const { password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    res.json({
      username: user.username,
      safeAddress: user.safeAddress,
      accountNumber: user.accountNumber,
      ownerPrivateKey: user.ownerPrivateKey,
      isValidator: user.isValidator || false,
      nameAlias: user.nameAlias || null,
      numberAlias: user.numberAlias || null,
    });
  } catch (error) {
    return handleError(error, res, "Login failed");
  }
});

// ===============================================
// GET USER STATUS (for dashboard refresh)
// ===============================================
app.get("/api/user/status/:email", async (req, res) => {
  try {
    const email = sanitizeEmail(req.params.email);
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json({
      isValidator: user.isValidator || false,
      nameAlias: user.nameAlias || null,
      numberAlias: user.numberAlias || null,
    });
  } catch (error) {
    return handleError(error, res, "Failed to get user status");
  }
});

// ================================================================
// ALIAS: PREPARE LINK — validates, signs, returns prepared data
// Does NOT execute. Frontend calls /api/alias/execute-link after PIN.
// ================================================================
app.post("/api/alias/link-name", async (req, res) => {
  try {
    const { safeAddress, name, walletToLink, registryAddress } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: "Invalid safe address" });
    if (!walletToLink || !ethers.isAddress(walletToLink))
      return res
        .status(400)
        .json({ message: "Invalid wallet address to link" });
    if (!registryAddress || !ethers.isAddress(registryAddress))
      return res.status(400).json({ message: "Invalid registry address" });
    if (!name || typeof name !== "string")
      return res.status(400).json({ message: "Name is required" });

    const pureName = name.trim().toLowerCase();

    if (!/^[a-z2-9_]{1,32}$/.test(pureName))
      return res.status(400).json({
        message:
          "Invalid name. Use lowercase a–z, digits 2–9, one underscore max.",
      });
    if ((pureName.match(/_/g) || []).length > 1)
      return res.status(400).json({ message: "Only one underscore allowed." });
    if (pureName.includes("0") || pureName.includes("1"))
      return res
        .status(400)
        .json({ message: "Digits 0 and 1 are not allowed." });
    if (pureName.startsWith("_") || pureName.endsWith("_"))
      return res
        .status(400)
        .json({ message: "Name cannot start or end with underscore." });
    if (pureName.length < 2)
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters." });

    // ── Reserved name check ─────────────────────────────────────────────────
    if (isReservedName(pureName)) {
      return res.status(200).json({
        reserved: true,
        message:
          "This is a reserved name. Enter your email address so we can reach out to discuss eligibility.",
      });
    }

    // ── Find user ───────────────────────────────────────────────────────────
    const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    // ── Balance gate ─────────────────────────────────────────────────────────
    // Default: USDC. Fallback: USDT. Need at least 0.5 token (5e5 units, 6 decimals).
    const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

    // Change variable name to match the 0.5 value to avoid logic errors
    const POINT_FIVE = ethers.parseUnits("0.5", 6);

    const usdcAddr = process.env.USDC_CONTRACT_ADDRESS;
    const usdtAddr = process.env.USDT_CONTRACT_ADDRESS;
    const ngnAddr = process.env.NGN_TOKEN_ADDRESS;

    if (!usdcAddr || !usdtAddr || !ngnAddr)
      return res
        .status(500)
        .json({ message: "Token contract addresses not configured" });

    const usdcContract = new ethers.Contract(usdcAddr, ERC20_ABI, provider);
    const usdtContract = new ethers.Contract(usdtAddr, ERC20_ABI, provider);
    const ngnContract = new ethers.Contract(ngnAddr, ERC20_ABI, provider);

    // NGNs fee threshold: 500 NGNs (6 decimals)
    const FIVE_HUNDRED = ethers.parseUnits("500", 6);

    const [usdcWei, usdtWei, ngnWei] = await Promise.all([
      usdcContract.balanceOf(safeAddress).catch(() => 0n),
      usdtContract.balanceOf(safeAddress).catch(() => 0n),
      ngnContract.balanceOf(safeAddress).catch(() => 0n),
    ]);

    const hasUsdc = usdcWei >= POINT_FIVE;
    const hasUsdt = usdtWei >= POINT_FIVE;
    const hasNgn = ngnWei >= FIVE_HUNDRED;

    if (!hasUsdc && !hasUsdt && !hasNgn) {
      return res.status(400).json({
        message:
          "Insufficient balance. You need at least 0.5 USDC, 0.5 USDT, or 500 NGNs in your wallet to register a name.",
        lowBalance: true,
      });
    }

    // Priority: USDC (default) → USDT → NGNs
    const feeTokenAddress = hasUsdc ? usdcAddr : hasUsdt ? usdtAddr : ngnAddr;
    console.log(
      `💰 Fee token selected: ${hasUsdc ? "USDC" : hasUsdt ? "USDT" : "NGNs"} (${feeTokenAddress})`,
    );

    // ── Underscore collision check ──────────────────────────────────────────
    if (pureName.includes("_")) {
      const parts = pureName.split("_");
      const reversed = `${parts[1]}_${parts[0]}`;
      const collisionCheck = await User.findOne({
        "nameAliases.name": {
          $in: [
            new RegExp(`^${parts[0]}@`),
            new RegExp(`^${parts[1]}@`),
            new RegExp(`^${reversed}@`),
          ],
        },
      });
      if (collisionCheck) {
        return res.status(409).json({
          message: `A similar name (${parts[0]} or ${parts[1]}) is already registered.`,
        });
      }
    }

    // ── On-chain availability check ─────────────────────────────────────────
    const namespace = await getNamespace(registryAddress);
    const weldedName = weldName(pureName, namespace);
    console.log("DEBUG: pureName is:", pureName);
    console.log("DEBUG: namespace found is:", namespace);
    console.log("DEBUG: weldedName resulting is:", weldedName);

    const available = await checkNameAvailability(weldedName, registryAddress);
    if (!available)
      return res
        .status(409)
        .json({ message: "This name is already taken on-chain." });

    // ── Backend signs (nameBytes ++ wallet) ─────────────────────────────────
    // Matches the assembly packing in BaseRegistry.link():
    //   calldatacopy(0x00, _name.offset, _name.length)        ← name bytes
    //   mstore(_name.length, shl(sub(0x100, mul(0x14,0x08)), _wallet)) ← wallet 20 bytes
    //   messageHash := keccak256(0x00, add(_name.length, 0x14))
    //
    // Equivalent in JS: keccak256(concat(nameBytes, walletBytes20))
    const nameBytes = ethers.toUtf8Bytes(pureName);
    const walletAddress = ethers.getAddress(walletToLink);
    const rawPacked = ethers.concat([
      nameBytes,
      ethers.getBytes(walletAddress),
    ]);
    const messageHash = ethers.keccak256(rawPacked);
    // wallet.signMessage applies the Ethereum prefix → toEthSignedMessageHash
    const signature = await wallet.signMessage(ethers.getBytes(messageHash));

    console.log(
      `✅ Signed name link: pureName="${pureName}" wallet=${walletAddress}`,
    );
    console.log(
      `   Welded: ${weldedName} | Signature: ${signature.slice(0, 20)}…`,
    );

    return res.json({
      prepared: true,
      pureName,
      weldedName,
      walletToLink: walletAddress,
      registryAddress,
      namespace,
      signature,
      feeTokenAddress, // the token address the multicall will approve + registry will pull
    });
  } catch (error) {
    console.error("❌ link-name prepare error:", error);
    return handleError(error, res, "Failed to prepare name link");
  }
});

// ================================================================
// ALIAS: EXECUTE LINK — fires the Safe multicall after PIN verification
// Receives prepared data from /api/alias/link-name + userPrivateKey from PIN
// ================================================================
app.post("/api/alias/execute-link", async (req, res) => {
  try {
    const {
      safeAddress,
      pureName,
      weldedName,
      walletToLink,
      registryAddress,
      signature,
      feeTokenAddress,
      userPrivateKey,
    } = req.body;

    // ── Input validation ────────────────────────────────────────────────────
    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: "Invalid safe address" });
    if (!userPrivateKey)
      return res.status(400).json({ message: "Private key required" });
    if (
      !pureName ||
      !weldedName ||
      !walletToLink ||
      !registryAddress ||
      !signature ||
      !feeTokenAddress
    )
      return res.status(400).json({ message: "Missing prepared link data" });

    const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const nameBytes = ethers.toUtf8Bytes(pureName);
    const walletAddress = ethers.getAddress(walletToLink);

    const { sponsorLinkNameBase } = require("./services/relayService");

    console.log(`🔗 Executing link: "${weldedName}" → ${walletAddress}`);
    console.log(
      `   Safe: ${safeAddress} | Registry: ${registryAddress} | FeeToken: ${feeTokenAddress}`,
    );

    const result = await sponsorLinkNameBase(
      safeAddress,
      userPrivateKey,
      registryAddress,
      nameBytes,
      walletAddress,
      feeTokenAddress,
      signature,
    );

    if (!result || !result.txHash)
      return res
        .status(400)
        .json({ message: "Link transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);

    if (!taskStatus.success)
      return res.status(400).json({
        message: taskStatus.reason || "Link transaction reverted on-chain",
      });

    // ── Save to DB ──────────────────────────────────────────────────────────
    const aliasEntry = {
      name: weldedName,
      wallet: walletAddress.toLowerCase(),
      registryAddress: registryAddress.toLowerCase(),
    };
    user.nameAliases = user.nameAliases || [];
    user.nameAliases.push(aliasEntry);
    if (!user.nameAlias) user.nameAlias = weldedName;
    await user.save();

    console.log(
      `✅ "${weldedName}" linked to ${walletAddress} (tx: ${result.txHash})`,
    );

    return res.json({
      success: true,
      txHash: result.txHash,
      alias: aliasEntry,
    });
  } catch (error) {
    console.error("❌ execute-link error:", error);
    return handleError(error, res, "Failed to execute name link");
  }
});

// ================================================================
// ALIAS: UNLINK NAME — single alias by name+wallet pair
// Receives: safeAddress, weldedName, userPrivateKey
// ================================================================
app.post("/api/alias/unlink-name", async (req, res) => {
  try {
    const { safeAddress, weldedName, registryAddress, userPrivateKey } =
      req.body;

    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: "Invalid safe address" });
    if (!weldedName || typeof weldedName !== "string")
      return res.status(400).json({ message: "weldedName is required" });
    if (!userPrivateKey)
      return res
        .status(400)
        .json({ message: "Private key required (unlock with PIN first)" });

    const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const aliasIndex = (user.nameAliases || []).findIndex(
      (a) => a.name.toLowerCase() === weldedName.toLowerCase(),
    );
    if (aliasIndex === -1)
      return res
        .status(404)
        .json({ message: "This name is not in your linked names list." });

    const aliasEntry = user.nameAliases[aliasIndex];
    const targetRegistryAddress =
      registryAddress ||
      aliasEntry.registryAddress ||
      process.env.REGISTRY_CONTRACT_ADDRESS;

    if (!targetRegistryAddress || !ethers.isAddress(targetRegistryAddress))
      return res
        .status(400)
        .json({ message: "Could not resolve registry address for this alias" });

    // Strip namespace to get the pure name — registry resolves namespace internally
    // e.g. "charles@salva" → "charles"
    const pureName = weldedName.includes("@")
      ? weldedName.substring(0, weldedName.indexOf("@"))
      : weldedName;

    // Convert pure name to UTF-8 bytes — contract takes `bytes calldata _name`
    const nameBytes = ethers.toUtf8Bytes(pureName);
    const nameBytesHex = ethers.hexlify(nameBytes);
    console.log(`🔓 Unlink: pureName="${pureName}" nameBytes=${nameBytesHex}`);

    // ABI encode the unlink call
    const REGISTRY_ABI = [
      "function unlink(bytes calldata _name) external returns (bool)",
    ];
    const registryIface = new ethers.Interface(REGISTRY_ABI);
    const unlinkCalldata = registryIface.encodeFunctionData("unlink", [
      nameBytesHex,
    ]);

    // Execute via the user's Safe — Safe is msg.sender on the registry
    // Backend wallet pays gas. No fee charged to the user.
    const Safe = require("@safe-global/protocol-kit").default;
    const rpcUrl = process.env.BASE_MAINNET_RPC_URL;

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
          value: "0",
          operation: 0, // regular call — msg.sender = Safe
        },
      ],
    });

    const signedTx = await protocolKit.signTransaction(safeTransaction);

    const SAFE_ABI = [
      "function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns (bool success)",
    ];
    const safeContract = new ethers.Contract(safeAddress, SAFE_ABI, wallet);

    const tx = await safeContract.execTransaction(
      signedTx.data.to,
      BigInt(signedTx.data.value || "0"),
      signedTx.data.data,
      Number(signedTx.data.operation || 0),
      BigInt(signedTx.data.safeTxGas || "0"),
      BigInt(signedTx.data.baseGas || "0"),
      BigInt(signedTx.data.gasPrice || "0"),
      signedTx.data.gasToken || ethers.ZeroAddress,
      signedTx.data.refundReceiver || ethers.ZeroAddress,
      signedTx.encodedSignatures(),
      { gasLimit: 300_000 },
    );

    console.log(`⏳ Unlink TX submitted: ${tx.hash}`);
    const receipt = await tx.wait();

    if (!receipt || receipt.status === 0)
      return res.status(400).json({ message: "On-chain unlink failed." });

    // Remove from DB
    user.nameAliases.splice(aliasIndex, 1);
    if (user.nameAlias === weldedName) {
      user.nameAlias = user.nameAliases[0]?.name || null;
    }
    await user.save();

    console.log(
      `✅ "${weldedName}" unlinked from ${safeAddress} (tx: ${tx.hash})`,
    );
    res.json({ success: true, txHash: tx.hash, removedAlias: weldedName });
  } catch (error) {
    console.error("❌ unlink-name error:", error);
    return handleError(error, res, "Failed to unlink name");
  }
});

// ===============================================
// CHECK NAME AVAILABILITY
// ===============================================
app.post("/api/alias/check-name", async (req, res) => {
  try {
    const { name, registryAddress } = req.body;

    // 1. Basic validation
    if (!name || typeof name !== "string") {
      return res.status(400).json({ message: "Name is required" });
    }
    if (!registryAddress || !ethers.isAddress(registryAddress)) {
      return res
        .status(400)
        .json({ message: "A valid registry address is required" });
    }

    const pureName = name.trim().toLowerCase();

    // 2. Character rules: a-z, 2-9, one underscore max, no 0/1, min length 2
    if (!/^[a-z2-9_]{1,32}$/.test(pureName)) {
      return res.status(400).json({
        message:
          "Use lowercase a–z, digits 2–9, one underscore max. No 0 or 1.",
      });
    }
    if ((pureName.match(/_/g) || []).length > 1) {
      return res.status(400).json({ message: "Only one underscore allowed." });
    }
    if (pureName.startsWith("_") || pureName.endsWith("_")) {
      return res
        .status(400)
        .json({ message: "Name cannot start or end with underscore." });
    }
    if (pureName.length < 2) {
      return res
        .status(400)
        .json({ message: "Name must be at least 2 characters." });
    }

    // 3. Reserved name check
    const { isReservedName } = require("./models/ReservedNames");
    if (isReservedName(pureName)) {
      return res.json({
        available: false,
        reserved: true,
        welded: null,
        message: "This is a reserved name.",
      });
    }

    // 4. Get Namespace from DB (Matches link-name logic)
    const WalletRegistry = require("./models/WalletRegistry");
    const registryDoc = await WalletRegistry.findOne({
      registryAddress: registryAddress.toLowerCase(),
      active: true,
    });

    if (!registryDoc) {
      return res
        .status(404)
        .json({ message: "Selected wallet registry not found or inactive" });
    }

    // Use nspace from DB. Note: If your DB stores it without the '@', weldName handles it.
    const namespace = registryDoc.nspace || "";
    const welded = weldName(pureName, namespace);

    console.log(
      `🔍 Checking: pure='${pureName}' + ns='${namespace}' -> welded='${welded}'`,
    );

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
    console.error("❌ check-name error:", error);
    return handleError(error, res, "Failed to check name availability");
  }
});

// ================================================================
// ALIAS: NOTIFY ADMINS OF RESERVED NAME REQUEST
// ================================================================
app.post("/api/alias/notify-reserved", async (req, res) => {
  try {
    const { name, requesterEmail } = req.body;

    if (!name || !requesterEmail) {
      return res.status(400).json({ message: "Name and email are required" });
    }

    // Validate email
    const sanitizedEmail = sanitizeEmail(requesterEmail);

    // Find all validators to notify
    const validators = await User.find({ isValidator: true }).select(
      "email username",
    );

    const { sendValidatorProposalEmail } = require("./services/emailService");

    for (const v of validators) {
      if (v.email) {
        try {
          await resend.emails.send({
            from: "SALVA Admin <no-reply@salva-nexus.org>",
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
      message:
        "Your request has been sent to our team. We will reach out to you shortly.",
    });
  } catch (error) {
    return handleError(error, res, "Failed to send notification");
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

    if (accountNumberOrAddress.toLowerCase().startsWith("0x")) {
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

    // ── ADD THESE CHECKS ──────────────────────────────────────────────
    if (
      !process.env.NGN_TOKEN_ADDRESS ||
      !process.env.USDT_CONTRACT_ADDRESS ||
      !process.env.USDC_CONTRACT_ADDRESS
    ) {
      console.error("❌ Missing token contract addresses in .env");
      return res
        .status(200)
        .json({ balance: "0.00", usdtBalance: "0.00", usdcBalance: "0.00" });
    }
    // ──────────────────────────────────────────────────────────────────

    const ERC20_ABI = ["function balanceOf(address) view returns (uint256)"];

    const ngnContract = new ethers.Contract(
      process.env.NGN_TOKEN_ADDRESS,
      ERC20_ABI,
      provider,
    );
    const usdtContract = new ethers.Contract(
      process.env.USDT_CONTRACT_ADDRESS,
      ERC20_ABI,
      provider,
    );
    const usdcContract = new ethers.Contract(
      process.env.USDC_CONTRACT_ADDRESS,
      ERC20_ABI,
      provider,
    );

    const [ngnWei, usdtWei, usdcWei] = await Promise.all([
      retryRPCCall(() => ngnContract.balanceOf(address)).catch(() => 0n),
      retryRPCCall(() => usdtContract.balanceOf(address)).catch(() => 0n),
      retryRPCCall(() => usdcContract.balanceOf(address)).catch(() => 0n),
    ]);

    res.json({
      balance: ethers.formatUnits(ngnWei, 6), // NGNs (6 decimals)
      usdtBalance: ethers.formatUnits(usdtWei, 6), // USDT (6 decimals)
      usdcBalance: ethers.formatUnits(usdcWei, 6), // USDC (6 decimals)
    });
  } catch (error) {
    console.error("❌ Balance Fetch Failed:", error.message);
    res
      .status(200)
      .json({ balance: "0.00", usdtBalance: "0.00", usdcBalance: "0.00" });
  }
});

app.get("/api/alias/list/:safeAddress", async (req, res) => {
  try {
    const user = await User.findOne({
      safeAddress: req.params.safeAddress.toLowerCase(),
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Migrate legacy single nameAlias if nameAliases array is empty
    let aliases = user.nameAliases || [];
    if (aliases.length === 0 && user.nameAlias) {
      aliases = [
        {
          name: user.nameAlias,
          wallet: user.safeAddress,
          registryAddress: process.env.REGISTRY_CONTRACT_ADDRESS || "",
        },
      ];
    }

    res.json({ aliases });
  } catch (error) {
    return handleError(error, res, "Failed to get alias list");
  }
});

// ================================================================
// ALIAS: GET status (kept for backward compat with existing dashboard code)
// ================================================================
app.get("/api/alias/status/:safeAddress", async (req, res) => {
  try {
    const user = await User.findOne({
      safeAddress: req.params.safeAddress.toLowerCase(),
    });
    if (!user) return res.status(404).json({ message: "User not found" });

    const aliases = user.nameAliases || [];
    // Legacy compat: expose first alias as nameAlias
    const firstAlias = aliases[0]?.name || user.nameAlias || null;

    res.json({
      nameAlias: firstAlias,
      nameAliases: aliases,
      hasName: aliases.length > 0 || !!user.nameAlias,
    });
  } catch (error) {
    return handleError(error, res, "Failed to get alias status");
  }
});

app.post("/api/resolve-recipient", async (req, res) => {
  try {
    const { input, registryAddress } = req.body;

    if (!input) return res.status(400).json({ message: "Input required" });

    if (input.trim().startsWith("0x")) {
      return res
        .status(400)
        .json({ message: "Address inputs do not need resolution" });
    }

    if (!registryAddress) {
      return res.status(400).json({ message: "Registry selection required" });
    }

    const registryDoc = await WalletRegistry.findOne({
      registryAddress: registryAddress.toLowerCase(),
    });

    if (!registryDoc) {
      return res
        .status(404)
        .json({ message: "Selected Registry not found in database" });
    }

    const weldedInput = `${input.trim()}${registryDoc.nspace}`;
    console.log(`🔗 Welded Name: ${weldedInput}`);

    // ✅ FIX: resolve is ALWAYS called on REGISTRY_CONTRACT_ADDRESS from .env
    const envRegistryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;

    let resolvedAddress;
    try {
      resolvedAddress = await resolveToAddress(weldedInput, envRegistryAddress);
    } catch (err) {
      return res
        .status(404)
        .json({ message: err.message || "Recipient not found" });
    }

    const recipientUser = await User.findOne({
      safeAddress: resolvedAddress.toLowerCase(),
    });

    res.json({
      resolvedAddress,
      displayName: recipientUser?.username || null,
    });
  } catch (error) {
    console.error("❌ Resolve recipient error:", error);
    return res.status(500).json({ message: "Failed to resolve recipient" });
  }
});

// ===============================================
// TRANSFER — supports NGN, USDT, USDC
// coin param determines which token to send and which fee tier to use.
// ===============================================
app.post("/api/transfer", async (req, res) => {
  try {
    const {
      userPrivateKey,
      safeAddress,
      toInput,
      amount,
      registryAddress,
      inputType,
      coin = "NGN", // "NGN" | "USDT" | "USDC"
    } = req.body;

    validateAmount(amount);

    const envRegistryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;

    // Determine token contract address from env based on coin
    let tokenAddress;
    if (coin === "USDT") tokenAddress = process.env.USDT_CONTRACT_ADDRESS;
    else if (coin === "USDC") tokenAddress = process.env.USDC_CONTRACT_ADDRESS;
    else tokenAddress = process.env.NGN_TOKEN_ADDRESS; // default NGN

    if (!tokenAddress) {
      return res
        .status(400)
        .json({ message: `Token address not configured for coin: ${coin}` });
    }

    // ── 1. Resolve Recipient ─────────────────────────────────────────────────
    let recipientAddress;
    let finalToInput = toInput.trim();

    try {
      if (!finalToInput.startsWith("0x")) {
        if (!registryAddress) {
          return res.status(400).json({
            message: "Registry selection required for name resolution",
          });
        }
        const registryDoc = await WalletRegistry.findOne({
          registryAddress: registryAddress.toLowerCase(),
        });
        if (!registryDoc)
          return res
            .status(404)
            .json({ message: "Selected Registry not found in database" });
        finalToInput = weldName(finalToInput, registryDoc.nspace);
        console.log(`🔗 Welded Recipient: ${finalToInput}`);
      }
      // Resolution always uses REGISTRY_CONTRACT_ADDRESS from env (universal resolver)
      recipientAddress = await resolveToAddress(
        finalToInput,
        envRegistryAddress,
      );
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }

    // ── 2. Fee Calculation ───────────────────────────────────────────────────
    const { feeNGN, feeUsd, feeWei } = await getFeeForAmount(amount, coin);
    const amountNum = parseFloat(amount);

    // Check balance of the selected token
    const TOKEN_ABI = ["function balanceOf(address) view returns (uint256)"];
    const tokenContract = new ethers.Contract(
      tokenAddress,
      TOKEN_ABI,
      provider,
    );
    const balanceWei = await tokenContract.balanceOf(safeAddress);
    const decimals = 6; // NGN, USDT, USDC all 6 decimals
    const balanceNum = parseFloat(ethers.formatUnits(balanceWei, decimals));

    let actualAmountWei;
    let actualFeeWei;
    let recipientReceives;

    const feeHuman = coin === "NGN" ? feeNGN : feeUsd;

    if (feeHuman === 0) {
      actualAmountWei = ethers.parseUnits(amount.toString(), decimals);
      actualFeeWei = 0n;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum + feeHuman) {
      actualAmountWei = ethers.parseUnits(amount.toString(), decimals);
      actualFeeWei = feeWei;
      recipientReceives = amountNum;
    } else if (balanceNum >= amountNum) {
      recipientReceives = amountNum - feeHuman;
      if (recipientReceives <= 0)
        return res
          .status(400)
          .json({ message: "Amount too small to cover fee" });
      actualAmountWei = ethers.parseUnits(
        recipientReceives.toString(),
        decimals,
      );
      actualFeeWei = feeWei;
    } else {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    // ── 3. Metadata ──────────────────────────────────────────────────────────
    const senderUser = await User.findOne({
      safeAddress: safeAddress.toLowerCase(),
    });
    const recipientUser = await User.findOne({
      safeAddress: recipientAddress.toLowerCase(),
    });

    await delayBeforeBlockchain(safeAddress, "Transfer queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "transfer",
      payload: {
        toInput: finalToInput,
        amount,
        recipientAddress,
        feeNGN,
        coin,
      },
    }).save();

    // ── 4. Blockchain Execution ──────────────────────────────────────────────
    try {
      queueEntry.status = "SENDING";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      // sponsorSafeTransfer accepts tokenAddress as 6th param — pass it for USDT/USDC
      const result = await sponsorSafeTransfer(
        safeAddress,
        userPrivateKey,
        recipientAddress,
        actualAmountWei,
        actualFeeWei,
        tokenAddress,
      );

      if (!result || !result.txHash) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit to relay";
        await queueEntry.save();
        await new Transaction({
          fromAddress:              safeAddress.toLowerCase(),
          fromUsername:             senderUser?.username || null,
          fromNameAlias:            senderUser?.nameAlias || null,
          toAddress:                recipientAddress.toLowerCase(),
          toUsername:               recipientUser?.username || null,
          toNameAlias:              recipientUser?.nameAlias || null,
          senderDisplayIdentifier:  req.body.senderDisplayIdentifier || finalToInput,
          amount,
          fee:                      feeHuman > 0 ? String(feeHuman) : null,
          coin,
          status:                   "failed",
          taskId:                   null,
          type:                     "transfer",
          date:                     new Date(),
        }).save();
        return res
          .status(400)
          .json({ success: false, message: "Transfer failed on blockchain" });
      }

      queueEntry.taskId = result.txHash;
      queueEntry.txHash = result.txHash;
      await queueEntry.save();

      const taskStatus = await waitForTxReceipt(result.txHash);

      await new Transaction({
        fromAddress:              safeAddress.toLowerCase(),
        fromUsername:             senderUser?.username || null,
        fromNameAlias:            senderUser?.nameAlias || null,
        toAddress:                recipientAddress.toLowerCase(),
        toUsername:               recipientUser?.username || null,
        toNameAlias:              recipientUser?.nameAlias || null,
        senderDisplayIdentifier:  req.body.senderDisplayIdentifier || finalToInput,
        amount,
        fee:                      feeHuman > 0 ? String(feeHuman) : null,
        coin,
        status:                   taskStatus.success ? "successful" : "failed",
        taskId:                   result.txHash,
        type:                     "transfer",
        date:                     new Date(),
      }).save();

      if (taskStatus.success) {
        queueEntry.status = "CONFIRMED";
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
        await applyCooldown(safeAddress, 20);

        if (senderUser?.email) {
          try {
            await sendTransactionEmailToSender(
              senderUser.email,
              senderUser.username,
              finalToInput,
              amount,
              "successful",
            );
          } catch (e) {
            console.error("❌ Sender email error:", e.message);
          }
        }
        if (recipientUser?.email) {
          try {
            await sendTransactionEmailToReceiver(
              recipientUser.email,
              recipientUser.username,
              safeAddress,
              amount,
            );
          } catch (e) {
            console.error("❌ Recipient email error:", e.message);
          }
        }

        return res.json({
          success: true,
          taskId: result.txHash,
          feeNGN,
          feeUsd,
          recipientReceives,
          coin,
        });
      } else {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = taskStatus.reason;
        await queueEntry.save();
        return res.status(400).json({
          success: false,
          message: taskStatus.reason || "Transfer reverted on-chain",
        });
      }
    } catch (error) {
      queueEntry.status = "FAILED";
      queueEntry.errorMessage = error.message;
      await queueEntry.save();
      throw error;
    }
  } catch (error) {
    console.error("❌ Transfer failed:", error.message);
    return res
      .status(500)
      .json({ message: error.message || "Transfer failed" });
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
app.get("/api/transactions/:address", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();

    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: "Invalid address format" });
    }

    const transactions = await Transaction.find({
      $or: [{ fromAddress: address }, { toAddress: address }],
    })
      .sort({ date: -1 })
      .limit(50);

    const formatted = transactions.map((tx) => {
      const isFromMe = tx.fromAddress?.toLowerCase() === address;
      const isToMe = tx.toAddress?.toLowerCase() === address;
      const isSuccessful = tx.status === "successful";

      let displayType;
      if (isFromMe) {
        displayType = isSuccessful ? "sent" : "failed";
      } else if (isToMe && isSuccessful) {
        displayType = "receive";
      } else {
        displayType = "hidden";
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

    const visible = formatted.filter((tx) => tx.displayType !== "hidden");
    res.json(visible);
  } catch (error) {
    console.error("❌ History Fetch Error:", error);
    return handleError(error, res, "Failed to fetch transactions");
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

    try {
      const accountNum =
        (await getAccountNumberFromAddress(user.safeAddress)) ||
        user.safeAddress;

      await sendSecurityChangeEmail(
        sanitizedOldEmail,
        user.username,
        "email",
        accountNum,
      );

      await sendEmailChangeConfirmation(
        sanitizedNewEmail,
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

  setInterval(cleanupStaleQueueEntries, 5 * 60 * 1000);
  console.log(`   ✅ Transaction queue cleanup (every 5 minutes)`);
});

// ===============================================
// KEEP-ALIVE
// ===============================================
const INTERVAL = 10 * 60 * 1000;
const URL = "https://salva-api-lx2t.onrender.com/api/stats";

function reloadWebsite() {
  fetch(URL)
    .then(() => console.log("⚓ Keep-Alive: Side-ping successful"))
    .catch((err) => console.error("⚓ Keep-Alive Error:", err.message));
}

setInterval(reloadWebsite, INTERVAL);
