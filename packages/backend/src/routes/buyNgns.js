// Salva-Digital-Tech/packages/backend/src/routes/buyNgns.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { Resend } = require("resend");
const User = require("../models/User");
const MintRequest = require("../models/MintRequest");

let Transaction;
try {
  Transaction = require("../models/Transaction");
} catch {
  /* no tx model */
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("🚀 BUY NGNs ROUTES INITIALIZED (v3.0.0 — WhatsApp-style thread)");

const ERC20_MINT_ABI = [
  "function mint(address to, uint256 amount) external",
  "function decimals() view returns (uint8)",
];

const ERC20_BURN_ABI = [
  "function burn(address from, uint256 amount) external",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
];

function computeFee(amountNgn) {
  if (amountNgn >= 100000) return 20;
  if (amountNgn >= 2000) return 10;
  return 0;
}

function getBackendSigner() {
  const rpcUrl =
    process.env.NODE_ENV === "production"
      ? process.env.BASE_MAINNET_RPC_URL
      : process.env.BASE_SEPOLIA_RPC_URL;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const pk = process.env.MANAGER_PRIVATE_KEY;
  if (!pk) throw new Error("MANAGER_PRIVATE_KEY not set in .env");
  return new ethers.Wallet(pk, provider);
}

async function notifySellers(subject, html) {
  const sellers = await User.find({ isSeller: true }).select("email username");
  for (const s of sellers) {
    if (!s.email) continue;
    try {
      await resend.emails.send({
        from: "SALVA <no-reply@salva-nexus.org>",
        to: s.email,
        subject,
        html,
      });
      console.log(`📧 Seller notified: ${s.email}`);
    } catch (e) {
      console.error(`❌ Seller email failed (${s.email}):`, e.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/initiate
// One persistent thread per user — WhatsApp style
// ══════════════════════════════════════════════════════════════════════════════
router.post("/initiate", async (req, res) => {
  try {
    const { safeAddress, amountNgn } = req.body;
    console.log(`💳 initiate: safeAddress=${safeAddress} amount=${amountNgn}`);

    if (!safeAddress || !safeAddress.startsWith("0x"))
      return res.status(400).json({ message: "Invalid safeAddress" });

    const amount = parseFloat(amountNgn);
    if (isNaN(amount) || amount < 100)
      return res.status(400).json({ message: "Minimum purchase is ₦100" });
    if (amount > 10_000_000)
      return res
        .status(400)
        .json({ message: "Maximum is ₦10,000,000 per request" });

    const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    const feeNgn = computeFee(amount);
    const mintAmount = amount - feeNgn;
    const acctName = process.env.SELLER_ACCOUNT_NAME || "Salva Digital Tech";
    const acctNum = process.env.SELLER_ACCOUNT_NUMBER || "0000000000";
    const bankName = process.env.SELLER_BANK_NAME || "OPay";

    const bankMsg = {
      sender: "seller",
      text: `👋 Hi **${user.username}**! Transfer exactly **₦${amount.toLocaleString()}** to:\n\n🏦 **${bankName}**\n👤 **${acctName}**\n🔢 **${acctNum}**\n\n${feeNgn > 0 ? `⚡ Fee: **${feeNgn} NGNs** deducted → you receive **${mintAmount.toLocaleString()} NGNs**` : `✅ No fee → you receive **${mintAmount.toLocaleString()} NGNs**`}\n\nTap **"I Have Paid"** after sending.`,
      createdAt: new Date(),
    };

    const notifyEmail = `<div style="background:#0A0A0B;color:white;padding:32px;font-family:sans-serif;border-radius:16px;max-width:480px;">
      <h1 style="color:#D4AF37;margin:0 0 20px;font-size:24px;">SALVA</h1>
      <p><b>${user.username}</b> wants to buy <b style="color:#D4AF37;">₦${amount.toLocaleString()}</b></p>
      <p>To mint: <b style="color:#22c55e;">${mintAmount.toLocaleString()} NGNs</b>${feeNgn ? ` (fee: ${feeNgn})` : ""}</p>
      <p style="color:#666;font-size:11px;">Open Salva dashboard → Mint Requests</p>
    </div>`;

    // ── Find existing thread for this user ────────────────────────────────
    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    // Block if already active
    if (
      mintRequest &&
      ["pending", "paid", "minting"].includes(mintRequest.status)
    ) {
      return res.status(409).json({
        message: "You already have an active purchase request.",
        requestId: mintRequest._id,
      });
    }

    // Reuse existing thread if minted or rejected — just push new bank msg
    if (mintRequest && ["minted", "rejected"].includes(mintRequest.status)) {
      mintRequest.status = "pending";
      mintRequest.amountNgn = amount;
      mintRequest.feeNgn = feeNgn;
      mintRequest.mintAmountNgn = mintAmount;
      mintRequest.receiptImageBase64 = null;
      mintRequest.sellerRead = false;
      mintRequest.txHash = null;
      mintRequest.mintedAt = null;
      mintRequest.updatedAt = new Date();
      mintRequest.messages.push(bankMsg);
      await mintRequest.save();

      console.log(`✅ MintRequest ${mintRequest._id} reused for new purchase`);

      notifySellers(
        `[SALVA] 🛒 New Request — ₦${amount.toLocaleString()} — ${user.username}`,
        notifyEmail,
      ).catch(() => {});

      return res.json({
        success: true,
        requestId: mintRequest._id,
        amountNgn: amount,
        feeNgn,
        mintAmount,
        bankDetails: {
          accountName: acctName,
          accountNumber: acctNum,
          bankName,
        },
        messages: mintRequest.messages,
      });
    }

    // Brand new user — create thread
    mintRequest = await MintRequest.create({
      userSafeAddress: safeAddress.toLowerCase(),
      userEmail: user.email,
      username: user.username,
      amountNgn: amount,
      feeNgn,
      mintAmountNgn: mintAmount,
      status: "pending",
      sellerRead: false,
      messages: [bankMsg],
    });

    console.log(`✅ MintRequest ${mintRequest._id} created (new thread)`);

    notifySellers(
      `[SALVA] 🛒 New Request — ₦${amount.toLocaleString()} — ${user.username}`,
      notifyEmail,
    ).catch(() => {});

    return res.json({
      success: true,
      requestId: mintRequest._id,
      amountNgn: amount,
      feeNgn,
      mintAmount,
      bankDetails: { accountName: acctName, accountNumber: acctNum, bankName },
      messages: mintRequest.messages,
    });
  } catch (err) {
    console.error("❌ initiate:", err.message);
    res
      .status(500)
      .json({ message: err.message || "Failed to create request" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/claim-paid
// ══════════════════════════════════════════════════════════════════════════════
router.post("/claim-paid", async (req, res) => {
  try {
    const { requestId, safeAddress, receiptBase64 } = req.body;
    console.log(`📸 claim-paid: ${requestId}`);

    if (!requestId || !safeAddress || !receiptBase64)
      return res
        .status(400)
        .json({ message: "requestId, safeAddress and receiptBase64 required" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest)
      return res.status(404).json({ message: "Request not found" });
    if (mintRequest.userSafeAddress !== safeAddress.toLowerCase())
      return res.status(403).json({ message: "Not authorized" });
    if (mintRequest.status !== "pending")
      return res.status(400).json({ message: "Not in pending state" });

    const receiptMsg = {
      sender: "user",
      text: "I have made the payment. Please verify my receipt.",
      imageUrl: receiptBase64,
      isReceipt: true,
      createdAt: new Date(),
    };

    mintRequest.status = "paid";
    mintRequest.receiptImageBase64 = receiptBase64;
    mintRequest.sellerRead = false;
    mintRequest.messages.push(receiptMsg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    console.log(`✅ MintRequest ${requestId} → PAID`);

    notifySellers(
      `[SALVA] 📸 Receipt — ${mintRequest.username} — ₦${mintRequest.amountNgn.toLocaleString()}`,
      `<div style="background:#0A0A0B;color:white;padding:32px;font-family:sans-serif;border-radius:16px;max-width:480px;">
        <h1 style="color:#D4AF37;margin:0 0 20px;font-size:24px;">SALVA</h1>
        <p><b>${mintRequest.username}</b> uploaded a payment receipt.</p>
        <p>Verify bank transfer then confirm in Salva dashboard.</p>
        <p style="color:#22c55e;font-size:18px;font-weight:700;">Mint: ${mintRequest.mintAmountNgn.toLocaleString()} NGNs</p>
      </div>`,
    ).catch(() => {});

    return res.json({ success: true, status: "paid" });
  } catch (err) {
    console.error("❌ claim-paid:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/send-message
// ══════════════════════════════════════════════════════════════════════════════
router.post("/send-message", async (req, res) => {
  try {
    const { requestId, safeAddress, text, sender } = req.body;
    if (!requestId || !text?.trim() || !sender)
      return res
        .status(400)
        .json({ message: "requestId, text, sender required" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });

    if (sender === "user") {
      if (mintRequest.userSafeAddress !== safeAddress?.toLowerCase())
        return res.status(403).json({ message: "Not authorized" });
    } else if (sender === "seller") {
      const s = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
      if (!s?.isSeller)
        return res.status(403).json({ message: "Not a seller" });
      mintRequest.sellerRead = true;
    } else {
      return res.status(400).json({ message: "sender must be user or seller" });
    }

    const msg = { sender, text: text.trim(), createdAt: new Date() };
    mintRequest.messages.push(msg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error("❌ send-message:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/confirm-mint  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post("/confirm-mint", async (req, res) => {
  try {
    const { requestId, safeAddress } = req.body;
    console.log(`🪙 confirm-mint: ${requestId} seller=${safeAddress}`);

    if (!requestId || !safeAddress)
      return res
        .status(400)
        .json({ message: "requestId and safeAddress required" });

    const seller = await User.findOne({
      safeAddress: safeAddress.toLowerCase(),
    });
    if (!seller?.isSeller)
      return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
    if (mintRequest.status !== "paid")
      return res
        .status(400)
        .json({ message: `Cannot mint — status is '${mintRequest.status}'` });

    mintRequest.status = "minting";
    await mintRequest.save();
    console.log(`⏳ Status → minting for ${requestId}`);

    const ngnTokenAddress = process.env.NGN_TOKEN_ADDRESS;
    if (!ngnTokenAddress) throw new Error("NGN_TOKEN_ADDRESS not set in .env");

    const signer = getBackendSigner();
    const ngnToken = new ethers.Contract(
      ngnTokenAddress,
      ERC20_MINT_ABI,
      signer,
    );
    const decimals = await ngnToken.decimals();
    const mintAmt = ethers.parseUnits(
      mintRequest.mintAmountNgn.toString(),
      decimals,
    );

    console.log(
      `🔗 Calling mint(${mintRequest.userSafeAddress}, ${mintAmt}) on ${ngnTokenAddress}`,
    );
    const tx = await ngnToken.mint(mintRequest.userSafeAddress, mintAmt);
    console.log(`⏳ Tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Mint transaction reverted");

    console.log(`✅ Mint confirmed: ${tx.hash}`);

    const successMsg = {
      sender: "seller",
      isMinted: true,
      text: `🎉 **${mintRequest.mintAmountNgn.toLocaleString()} NGNs** minted to your wallet!\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n🌐 Base Mainnet`,
      createdAt: new Date(),
    };

    mintRequest.status = "minted";
    mintRequest.txHash = tx.hash;
    mintRequest.mintedAt = new Date();
    mintRequest.sellerRead = true;
    mintRequest.messages.push(successMsg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    if (Transaction) {
      try {
        await Transaction.create({
          fromAddress: ngnTokenAddress,
          toAddress: mintRequest.userSafeAddress,
          fromUsername: "Salva Mint",
          toUsername: mintRequest.username,
          amount: mintRequest.mintAmountNgn,
          coin: "NGN",
          status: "successful",
          taskId: tx.hash,
          fee: mintRequest.feeNgn || 0,
          date: new Date(),
        });
        console.log(`📒 Tx saved for ${mintRequest.username}`);
      } catch (txErr) {
        console.error("⚠️ Tx history save failed:", txErr.message);
      }
    }

    resend.emails
      .send({
        from: "SALVA <no-reply@salva-nexus.org>",
        to: mintRequest.userEmail,
        subject: `✅ ${mintRequest.mintAmountNgn.toLocaleString()} NGNs minted to your wallet`,
        html: `<div style="background:#0A0A0B;color:white;padding:40px;font-family:sans-serif;border-radius:16px;max-width:520px;">
        <h1 style="color:#D4AF37;margin:0 0 20px;font-size:28px;">SALVA</h1>
        <p style="font-size:16px;">Hi <b>${mintRequest.username}</b>,</p>
        <p style="color:#22c55e;font-size:36px;font-weight:900;margin:16px 0;">${mintRequest.mintAmountNgn.toLocaleString()} NGNs</p>
        <p style="color:#888;">has been minted to your Salva wallet on Base Mainnet.</p>
        ${mintRequest.feeNgn > 0 ? `<p style="color:#666;font-size:11px;">Service fee: ${mintRequest.feeNgn} NGNs</p>` : ""}
        <p style="color:#555;font-size:10px;margin-top:24px;">TX: ${tx.hash}</p>
      </div>`,
      })
      .catch(() => {});

    return res.json({ success: true, status: "minted", txHash: tx.hash });
  } catch (err) {
    console.error("❌ confirm-mint:", err.message);
    try {
      await MintRequest.findByIdAndUpdate(req.body.requestId, {
        status: "paid",
      });
    } catch {
      /* ignore */
    }
    res
      .status(500)
      .json({ message: err.message || "Mint failed — please try again" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/reject  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post("/reject", async (req, res) => {
  try {
    const { requestId, safeAddress, reason } = req.body;
    const seller = await User.findOne({
      safeAddress: safeAddress?.toLowerCase(),
    });
    if (!seller?.isSeller)
      return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
if (!["pending", "paid", "burned"].includes(mintRequest.status))
      return res.status(400).json({ message: "Cannot reject at this stage" });

    mintRequest.status = "rejected";
    mintRequest.messages.push({
      sender: "seller",
      text:
        reason?.trim() ||
        "❌ Payment could not be verified. Contact support if you believe this is an error.",
      createdAt: new Date(),
    });
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, status: "rejected" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET routes
// ══════════════════════════════════════════════════════════════════════════════

// User: get their single persistent thread (most recent)
router.get("/my-request/:safeAddress", async (req, res) => {
  try {
    const addr = req.params.safeAddress.toLowerCase();
    const request = await MintRequest.findOne({
      userSafeAddress: addr,
    }).sort({ createdAt: -1 });
    return res.json({ request: request || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/history/:safeAddress", async (req, res) => {
  try {
    const addr = req.params.safeAddress.toLowerCase();
    const requests = await MintRequest.find({
      userSafeAddress: addr,
      status: { $in: ["minted", "rejected"] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select("-receiptImageBase64");
    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Seller: list — one entry per user (group by userSafeAddress, latest only)
router.get("/all-requests", async (req, res) => {
  try {
    const seller = await User.findOne({
      safeAddress: req.query.safeAddress?.toLowerCase(),
    });
    if (!seller?.isSeller)
      return res.status(403).json({ message: "Not authorized" });

    // Aggregate: one doc per user, sorted by most recently updated
    const requests = await MintRequest.aggregate([
      {
        $sort: { updatedAt: -1 },
      },
      {
        $group: {
          _id: "$userSafeAddress",
          doc: { $first: "$$ROOT" },
        },
      },
      {
        $replaceRoot: { newRoot: "$doc" },
      },
      {
        $sort: { updatedAt: -1 },
      },
      {
        $limit: 100,
      },
      {
        $project: { receiptImageBase64: 0 },
      },
    ]);

    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/request/:id", async (req, res) => {
  try {
    const seller = await User.findOne({
      safeAddress: req.query.safeAddress?.toLowerCase(),
    });
    if (!seller?.isSeller)
      return res.status(403).json({ message: "Not authorized" });
    const request = await MintRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: "Not found" });
    if (!request.sellerRead) {
      request.sellerRead = true;
      await request.save();
    }
    return res.json({ request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/unread-count", async (req, res) => {
  try {
    const seller = await User.findOne({
      safeAddress: req.query.safeAddress?.toLowerCase(),
    });
    if (!seller?.isSeller) return res.json({ unreadCount: 0 });
    const count = await MintRequest.countDocuments({
      sellerRead: false,
      status: { $ne: "minted" },
    });
    return res.json({ unreadCount: count });
  } catch {
    res.json({ unreadCount: 0 });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/initiate-sell
// Burns NGNs from user wallet, submits sell request to seller chat
// ══════════════════════════════════════════════════════════════════════════════
router.post("/initiate-sell", async (req, res) => {
  try {
    const { safeAddress, amountNgn, bankName, accountNumber, accountName } = req.body;
    console.log(`🔥 initiate-sell: safeAddress=${safeAddress} amount=${amountNgn}`);

    if (!safeAddress || !safeAddress.startsWith("0x"))
      return res.status(400).json({ message: "Invalid safeAddress" });

    const amount = parseFloat(amountNgn);
    if (isNaN(amount) || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    if (!bankName?.trim() || !accountNumber?.trim() || !accountName?.trim())
      return res.status(400).json({ message: "Bank name, account number and account name are required" });

    const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check NGNs balance
    const ngnTokenAddress = process.env.NGN_TOKEN_ADDRESS;
    if (!ngnTokenAddress) throw new Error("NGN_TOKEN_ADDRESS not set in .env");

    const signer = getBackendSigner();
    const ngnToken = new ethers.Contract(ngnTokenAddress, ERC20_BURN_ABI, signer);
    const decimals = await ngnToken.decimals();
    const balanceWei = await ngnToken.balanceOf(safeAddress.toLowerCase());
    const balanceHuman = parseFloat(ethers.formatUnits(balanceWei, decimals));

    if (amount > balanceHuman) {
      return res.status(400).json({
        message: `Insufficient NGNs balance. You have ${balanceHuman.toLocaleString()} NGNs.`,
        insufficientBalance: true,
      });
    }

    // Block if active buy/sell request exists
    const existing = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
      status: { $in: ["pending", "paid", "minting"] },
    });
    if (existing) {
      return res.status(409).json({
        message: "You already have an active request.",
        requestId: existing._id,
      });
    }

    // ── Burn NGNs on-chain ────────────────────────────────────────────────
    const burnAmt = ethers.parseUnits(amount.toString(), decimals);
    console.log(`🔥 Calling burn(${safeAddress}, ${burnAmt}) on ${ngnTokenAddress}`);
    const tx = await ngnToken.burn(safeAddress.toLowerCase(), burnAmt);
    console.log(`⏳ Burn tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Burn transaction reverted");
    console.log(`✅ Burn confirmed: ${tx.hash}`);

    // ── Save to transaction history ───────────────────────────────────────
    if (Transaction) {
      try {
        await Transaction.create({
          fromAddress: safeAddress.toLowerCase(),
          toAddress: ngnTokenAddress,
          fromUsername: user.username,
          toUsername: "Salva Burn",
          amount,
          coin: "NGN",
          status: "successful",
          taskId: tx.hash,
          fee: 0,
          date: new Date(),
        });
        console.log(`📒 Sell tx saved for ${user.username}`);
      } catch (txErr) {
        console.error("⚠️ Tx history save failed:", txErr.message);
      }
    }

    // ── Build sell request message ────────────────────────────────────────
    const sellMsg = {
      sender: "user",
      isBurned: true,
      text: `💸 Sell request: **${amount.toLocaleString()} NGNs** burned on-chain.\n\n🏦 **${bankName.trim()}**\n👤 **${accountName.trim()}**\n🔢 **${accountNumber.trim()}**\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n\nPlease send ₦${amount.toLocaleString()} to the account above.`,
      createdAt: new Date(),
    };

    // Reuse or create thread
    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (mintRequest && ["minted", "rejected", "burned"].includes(mintRequest.status)) {
      mintRequest.type = "sell";
      mintRequest.status = "paid"; // sell goes straight to paid (burn already done)
      mintRequest.amountNgn = amount;
      mintRequest.feeNgn = 0;
      mintRequest.mintAmountNgn = amount;
      mintRequest.bankDetails = {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      };
      mintRequest.receiptImageBase64 = null;
      mintRequest.sellerRead = false;
      mintRequest.txHash = tx.hash;
      mintRequest.updatedAt = new Date();
      mintRequest.messages.push(sellMsg);
      await mintRequest.save();
    } else {
      mintRequest = await MintRequest.create({
        userSafeAddress: safeAddress.toLowerCase(),
        userEmail: user.email,
        username: user.username,
        type: "sell",
        amountNgn: amount,
        feeNgn: 0,
        mintAmountNgn: amount,
        bankDetails: {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        },
        status: "paid",
        sellerRead: false,
        txHash: tx.hash,
        messages: [sellMsg],
      });
    }

    console.log(`✅ Sell request ${mintRequest._id} created`);

    // Email sellers
    notifySellers(
      `[SALVA] 💸 Sell Request — ₦${amount.toLocaleString()} — ${user.username}`,
      `<div style="background:#0A0A0B;color:white;padding:32px;font-family:sans-serif;border-radius:16px;max-width:480px;">
        <h1 style="color:#D4AF37;margin:0 0 20px;font-size:24px;">SALVA</h1>
        <p><b>${user.username}</b> wants to sell <b style="color:#ef4444;">₦${amount.toLocaleString()} NGNs</b></p>
        <p>NGNs already burned on-chain ✅</p>
        <p>Send <b style="color:#22c55e;">₦${amount.toLocaleString()}</b> to:</p>
        <p>🏦 ${bankName} · 👤 ${accountName} · 🔢 ${accountNumber}</p>
        <p style="color:#666;font-size:11px;">TX: ${tx.hash}</p>
      </div>`,
    ).catch(() => {});

    return res.json({
      success: true,
      requestId: mintRequest._id,
      txHash: tx.hash,
      messages: mintRequest.messages,
    });
  } catch (err) {
    console.error("❌ initiate-sell:", err.message);
    res.status(500).json({ message: err.message || "Sell failed" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/send-image  — any party uploads image to chat
// ══════════════════════════════════════════════════════════════════════════════
router.post("/send-image", async (req, res) => {
  try {
    const { requestId, safeAddress, imageBase64, sender } = req.body;
    if (!requestId || !safeAddress || !imageBase64 || !sender)
      return res.status(400).json({ message: "requestId, safeAddress, imageBase64, sender required" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });

    if (sender === "user") {
      if (mintRequest.userSafeAddress !== safeAddress.toLowerCase())
        return res.status(403).json({ message: "Not authorized" });
    } else if (sender === "seller") {
      const s = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      if (!s?.isSeller) return res.status(403).json({ message: "Not a seller" });
      mintRequest.sellerRead = true;
    }

    const msg = {
      sender,
      text: null,
      imageUrl: imageBase64,
      createdAt: new Date(),
    };
    mintRequest.messages.push(msg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error("❌ send-image:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/complete-sell", async (req, res) => {
  try {
    const { requestId, safeAddress } = req.body;
    const seller = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
    if (mintRequest.status !== "paid" || mintRequest.type !== "sell")
      return res.status(400).json({ message: "Cannot complete at this stage" });

    mintRequest.status = "sell_completed";
    mintRequest.messages.push({
      sender: "seller",
      text: `✅ Payment sent! ₦${(mintRequest.amountNgn || 0).toLocaleString()} has been transferred to your bank account.\n\n🏦 ${mintRequest.bankDetails?.bankName} · 🔢 ${mintRequest.bankDetails?.accountNumber}\n\nThank you for using Salva! 🎉`,
      createdAt: new Date(),
    });
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, status: "sell_completed" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
