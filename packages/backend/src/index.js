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
const User = require("./models/User");
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

// ===============================================
// SECURITY PACKAGES
// ===============================================
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const validator = require("validator");

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
        "https://salva-nexus.onrender.com",
      ]
    : [
        "https://salva-nexus.org",
        "https://www.salva-nexus.org",
        "https://salva-nexus.onrender.com",
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

// ===============================================
// REPLACE THE /api/register ROUTE WITH THIS
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
        process.env.BASE_SEPOLIA_RPC_URL,
      );

      console.log("📝 Registering account via Backend Manager wallet...");

      const REGISTRY_ABI = ["function registerNumber(uint128,address)"];
      const registryContract = new ethers.Contract(
        process.env.REGISTRY_CONTRACT_ADDRESS,
        REGISTRY_ABI,
        wallet,
      );

      const tx = await registryContract.registerNumber(
        identityData.accountNumber,
        identityData.safeAddress,
      );

      console.log(`⏳ Registration TX sent: ${tx.hash}`);
      await tx.wait();
      console.log("✅ On-chain Registration Successful!");

      const hashedPassword = await bcrypt.hash(password, 10);
      const newUser = new User({
        username,
        email,
        password: hashedPassword,
        safeAddress: identityData.safeAddress,
        accountNumber: identityData.accountNumber,
        ownerPrivateKey: identityData.ownerPrivateKey,
      });

      await newUser.save();
      console.log("✅ User saved to database");

      // ✅ SEND WELCOME EMAIL (Only after successful registration)
      try {
        await sendWelcomeEmail(email, username);
      } catch (emailError) {
        console.error("❌ Welcome email error:", emailError.message);
        // Don't fail registration if email fails
      }

      res.json({
        username: newUser.username,
        safeAddress: newUser.safeAddress,
        accountNumber: newUser.accountNumber,
        ownerPrivateKey: newUser.ownerPrivateKey,
        registrationTx: tx.hash,
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
    });
  } catch (error) {
    return handleError(error, res, "Login failed");
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
        // ✅ FIX: Use app.spender directly (it's already the resolved address)
        const spenderAddress = app.spender.toLowerCase();

        // Check if this approval's spender matches current user
        if (spenderAddress === userAddress) {
          // Check live allowance amount
          const liveAllowanceWei = await tokenContract.allowance(
            app.owner,
            userAddress,
          );
          const liveAmount = ethers.formatUnits(liveAllowanceWei, 6);

          if (parseFloat(liveAmount) > 0) {
            // Update amount if changed
            if (liveAmount !== app.amount) {
              await Approval.updateOne(
                { _id: app._id },
                { $set: { amount: liveAmount } },
              );
            }

            // ✅ FIX: Use spenderInputType to determine what approver used
            let ownerDisplay, spenderDisplay;

            if (app.spenderInputType === "accountNumber") {
              // Approver used account number for spender
              // So display owner's account number and spender's account number
              ownerDisplay = await getAccountNumberFromAddress(app.owner);
              if (!ownerDisplay) ownerDisplay = app.owner; // Fallback to address
              spenderDisplay = app.spenderInput; // ✅ What approver originally typed
            } else {
              // Approver used address for spender
              // So display owner's address and spender's address
              ownerDisplay = app.owner;
              spenderDisplay = userAddress;
            }

            relevantApprovals.push({
              allower: ownerDisplay, // ✅ What to show in "FROM" field
              allowerAddress: app.owner, // Actual address for backend
              spenderDisplay: spenderDisplay, // ✅ What to show in "TO" field
              amount: liveAmount,
              date: app.date,
            });
          } else {
            // Remove if allowance is 0
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
// REPLACE THE /api/transfer ROUTE WITH THIS
// ===============================================
app.post("/api/transfer", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, toInput, amount } = req.body;

    validateAmount(amount);
    const amountWei = ethers.parseUnits(amount.toString(), 6);

    let recipientAddress;
    try {
      recipientAddress = await resolveToAddress(toInput);
    } catch (error) {
      return res.status(404).json({ message: error.message });
    }

    const senderUsedAccountNumber = isAccountNumber(toInput);
    let senderDisplayIdentifier;
    let senderAccountNumber = null;

    if (senderUsedAccountNumber) {
      senderAccountNumber = await getAccountNumberFromAddress(safeAddress);
      senderDisplayIdentifier =
        senderAccountNumber || safeAddress.toLowerCase();
    } else {
      senderDisplayIdentifier = safeAddress.toLowerCase();
    }

    // ✅ NEW: Get sender's username
    const senderUser = await User.findOne({
      safeAddress: normalizeAddress(safeAddress),
    });
    const senderUsername = senderUser?.username || null;

    // ✅ NEW: Get recipient's username
    const recipientUser = await User.findOne({
      safeAddress: normalizeAddress(recipientAddress),
    });
    const recipientUsername = recipientUser?.username || null;

    await delayBeforeBlockchain(safeAddress, "Transfer queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "transfer",
      payload: { toInput, amount, recipientAddress },
    }).save();

    try {
      queueEntry.status = "SENDING";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      const result = await sponsorSafeTransfer(
        safeAddress,
        userPrivateKey,
        toInput,
        amountWei,
      );

      if (!result || !result.taskId) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit to relay";
        await queueEntry.save();

        await new Transaction({
          fromAddress: safeAddress.toLowerCase(),
          fromAccountNumber: senderAccountNumber,
          fromUsername: senderUsername, // ✅ NEW
          toAddress: recipientAddress,
          toAccountNumber: toInput,
          toUsername: recipientUsername, // ✅ NEW
          senderDisplayIdentifier: senderDisplayIdentifier,
          amount: amount,
          status: "failed",
          taskId: null,
          type: "transfer",
          date: new Date(),
        }).save();

        return res.status(400).json({
          success: false,
          message: "Transfer failed on blockchain",
        });
      }

      queueEntry.taskId = result.taskId;
      await queueEntry.save();

      const taskStatus = await checkGelatoTaskStatus(result.taskId);

      if (taskStatus.success) {
        queueEntry.status = "CONFIRMED";
        queueEntry.updatedAt = new Date();
        await queueEntry.save();

        await new Transaction({
          fromAddress: safeAddress.toLowerCase(),
          fromAccountNumber: senderAccountNumber,
          fromUsername: senderUsername, // ✅ NEW
          toAddress: recipientAddress,
          toAccountNumber: toInput,
          toUsername: recipientUsername, // ✅ NEW
          senderDisplayIdentifier: senderDisplayIdentifier,
          amount: amount,
          status: "successful",
          taskId: result.taskId,
          type: "transfer",
          date: new Date(),
        }).save();

        await applyCooldown(safeAddress, 20);

        // Send emails
        if (senderUser && senderUser.email) {
          try {
            await sendTransactionEmailToSender(
              senderUser.email,
              senderUser.username,
              toInput,
              amount,
              "successful",
            );
            console.log(`✅ Sender email sent to: ${senderUser.email}`);
          } catch (emailError) {
            console.error("❌ Sender email FAILED:", emailError.message);
          }
        }

        if (recipientUser && recipientUser.email) {
          try {
            await sendTransactionEmailToReceiver(
              recipientUser.email,
              recipientUser.username,
              senderDisplayIdentifier,
              amount,
            );
            console.log(`✅ Receiver email sent to: ${recipientUser.email}`);
          } catch (emailError) {
            console.error("❌ Receiver email FAILED:", emailError.message);
          }
        }
      } else {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = taskStatus.reason;
        queueEntry.updatedAt = new Date();
        await queueEntry.save();

        await new Transaction({
          fromAddress: safeAddress.toLowerCase(),
          fromAccountNumber: senderAccountNumber,
          fromUsername: senderUsername, // ✅ NEW
          toAddress: recipientAddress,
          toAccountNumber: toInput,
          toUsername: recipientUsername, // ✅ NEW
          senderDisplayIdentifier: senderDisplayIdentifier,
          amount: amount,
          status: "failed",
          taskId: result.taskId,
          type: "transfer",
          date: new Date(),
        }).save();

        return res.status(400).json({
          success: false,
          message: taskStatus.reason || "Transfer reverted on blockchain",
        });
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
    console.error("❌ Transfer failed:", error.message);
    return handleError(error, res, error.message || "Transfer failed");
  }
});

// ===============================================
// APPROVE - FIXED VERSION
// ===============================================
app.post("/api/approve", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, spenderInput, amount } = req.body;

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount < 0 || numAmount > 1000000000) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    let finalSpenderAddress;
    try {
      finalSpenderAddress = await resolveToAddress(spenderInput);
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

      const result = await sponsorSafeApprove(
        safeAddress,
        userPrivateKey,
        finalSpenderAddress,
        amountWei,
      );

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
        return res.status(400).json({
          success: false,
          message: taskStatus.reason || "Approval reverted",
        });
      }

      queueEntry.status = "CONFIRMED";
      queueEntry.updatedAt = new Date();
      await queueEntry.save();

      const inputType = isAccountNumber(spenderInput)
        ? "accountNumber"
        : "address";

      if (numAmount === 0) {
        await Approval.deleteOne({
          owner: safeAddress.toLowerCase(),
          spender: finalSpenderAddress.toLowerCase(),
        });
      } else {
        await Approval.findOneAndUpdate(
          {
            owner: safeAddress.toLowerCase(),
            spender: finalSpenderAddress.toLowerCase(),
          },
          {
            amount: amount,
            date: new Date(),
            spenderInput: spenderInput,
            spenderInputType: inputType,
          },
          { upsert: true, new: true },
        );
      }

      await applyCooldown(safeAddress, 20);

      // ✅ SEND APPROVAL EMAILS (Only on Success)
      console.log(`🔍 Looking for approver: ${normalizeAddress(safeAddress)}`);
      console.log(
        `🔍 Looking for spender: ${normalizeAddress(finalSpenderAddress)}`,
      );

      const approverUser = await User.findOne({
        safeAddress: normalizeAddress(safeAddress),
      });
      const spenderUser = await User.findOne({
        safeAddress: normalizeAddress(finalSpenderAddress),
      });

      console.log(
        `🔍 Approver found: ${!!approverUser}, Email: ${approverUser?.email || "NONE"}`,
      );
      console.log(
        `🔍 Spender found: ${!!spenderUser}, Email: ${spenderUser?.email || "NONE"}`,
      );

      console.log(
        `📧 Preparing approval emails - Approver: ${approverUser?.email || "NOT FOUND"}, Spender: ${spenderUser?.email || "NOT FOUND"}`,
      );

      if (approverUser && approverUser.email) {
        try {
          await sendApprovalEmailToApprover(
            approverUser.email,
            approverUser.username,
            spenderInput,
            amount,
          );
          console.log(`✅ Approver email sent to: ${approverUser.email}`);
        } catch (emailError) {
          console.error("❌ Approver email FAILED:", emailError.message);
        }
      }

      // Notify spender (always send, even for revoke)
      if (spenderUser && spenderUser.email) {
        try {
          await sendApprovalEmailToSpender(
            spenderUser.email,
            spenderUser.username,
            approverUser?.username || safeAddress,
            amount,
          );
          console.log(`✅ Spender email sent to: ${spenderUser.email}`);
        } catch (emailError) {
          console.error("❌ Spender email FAILED:", emailError.message);
        }
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
// TRANSFER FROM - COMPLETE FIXED VERSION
// ===============================================
app.post("/api/transferFrom", async (req, res) => {
  try {
    const { userPrivateKey, safeAddress, fromInput, toInput, amount } = req.body;

    validateAmount(amount);
    const amountWei = ethers.parseUnits(amount.toString(), 6);

    let fromAddress, toAddress;
    try {
      fromAddress = await resolveToAddress(fromInput);
    } catch (error) {
      return res.status(404).json({ success: false, message: `Source: ${error.message}` });
    }

    try {
      toAddress = await resolveToAddress(toInput);
    } catch (error) {
      return res.status(404).json({ success: false, message: `Destination: ${error.message}` });
    }

    const fromInputWasAccountNumber = isAccountNumber(fromInput);
    let senderDisplayIdentifier = fromInputWasAccountNumber ? fromInput : fromAddress;

    // ✅ NEW: Get usernames BEFORE queue entry
    const fromUser = await User.findOne({
      safeAddress: normalizeAddress(fromAddress),
    });
    const toUser = await User.findOne({
      safeAddress: normalizeAddress(toAddress),
    });

    await delayBeforeBlockchain(safeAddress, "TransferFrom queued");

    const queueEntry = await new TransactionQueue({
      walletAddress: safeAddress.toLowerCase(),
      status: "PENDING",
      type: "transferFrom",
      payload: { fromInput, toInput, amount, fromAddress, toAddress },
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
        amountWei,
      );

      if (!result || !result.taskId) {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = "Failed to submit";
        await queueEntry.save();

        await new Transaction({
          fromAddress: fromAddress,
          fromAccountNumber: fromInputWasAccountNumber ? fromInput : null,
          fromUsername: fromUser?.username || null, // ✅ ADD THIS
          toAddress: toAddress,
          toAccountNumber: toInput,
          toUsername: toUser?.username || null, // ✅ ADD THIS
          senderDisplayIdentifier: senderDisplayIdentifier,
          executorAddress: safeAddress.toLowerCase(),
          amount: amount,
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

      if (taskStatus.success) {
        queueEntry.status = "CONFIRMED";
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
      } else {
        queueEntry.status = "FAILED";
        queueEntry.errorMessage = taskStatus.reason;
        queueEntry.updatedAt = new Date();
        await queueEntry.save();
      }

      // ✅ Save transaction with usernames
      await new Transaction({
        fromAddress: fromAddress,
        fromAccountNumber: fromInputWasAccountNumber ? fromInput : null,
        fromUsername: fromUser?.username || null, // ✅ ADD THIS
        toAddress: toAddress,
        toAccountNumber: toInput,
        toUsername: toUser?.username || null, // ✅ ADD THIS
        senderDisplayIdentifier: senderDisplayIdentifier,
        executorAddress: safeAddress.toLowerCase(),
        amount: amount,
        status: taskStatus.success ? "successful" : "failed",
        type: "transferFrom",
        taskId: result.taskId,
        date: new Date(),
      }).save();

      if (!taskStatus.success) {
        return res.status(400).json({
          success: false,
          message: taskStatus.reason || "Transfer reverted",
        });
      }

      await applyCooldown(safeAddress, 20);

      // ✅ SEND EMAILS (Only on Success)
      if (fromUser && fromUser.email) {
        try {
          await sendTransactionEmailToSender(
            fromUser.email,
            fromUser.username,
            toInput,
            amount,
            "successful",
          );
          console.log(`✅ From-user email sent to: ${fromUser.email}`);
        } catch (emailError) {
          console.error("❌ From-user email FAILED:", emailError.message);
        }
      }

      if (toUser && toUser.email) {
        try {
          await sendTransactionEmailToReceiver(
            toUser.email,
            toUser.username,
            fromInput,
            amount,
          );
          console.log(`✅ To-user email sent to: ${toUser.email}`);
        } catch (emailError) {
          console.error("❌ To-user email FAILED:", emailError.message);
        }
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
