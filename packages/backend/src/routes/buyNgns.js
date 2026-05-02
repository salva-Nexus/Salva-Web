// packages/backend/src/routes/buyNgns.js
const express = require("express");
const router = express.Router();
const { ethers } = require("ethers");
const { Resend } = require("resend");
const User = require("../models/User");
const MintRequest = require("../models/MintRequest");
const UserPoints = require("../models/UserPoints");
const PointLedger = require("../models/PointLedger");
const mongoose = require("mongoose");

let Transaction;
try {
  Transaction = require("../models/Transaction");
} catch {
  /* no tx model */
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log("🚀 BUY NGNs ROUTES INITIALIZED (v3.0.1 — points redemption)");

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
      return res.status(400).json({ message: "Maximum is ₦10,000,000 per request" });

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

    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (mintRequest && ["pending", "paid", "minting"].includes(mintRequest.status)) {
      return res.status(409).json({
        message: "You already have an active purchase request.",
        requestId: mintRequest._id,
      });
    }

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
      notifySellers(`[SALVA] 🛒 New Request — ₦${amount.toLocaleString()} — ${user.username}`, notifyEmail).catch(() => {});

      return res.json({
        success: true,
        requestId: mintRequest._id,
        amountNgn: amount,
        feeNgn,
        mintAmount,
        bankDetails: { accountName: acctName, accountNumber: acctNum, bankName },
        messages: mintRequest.messages,
      });
    }

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
    notifySellers(`[SALVA] 🛒 New Request — ₦${amount.toLocaleString()} — ${user.username}`, notifyEmail).catch(() => {});

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
    res.status(500).json({ message: err.message || "Failed to create request" });
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
      return res.status(400).json({ message: "requestId, safeAddress and receiptBase64 required" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Request not found" });
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
      return res.status(400).json({ message: "requestId, text, sender required" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });

    if (sender === "user") {
      if (mintRequest.userSafeAddress !== safeAddress?.toLowerCase())
        return res.status(403).json({ message: "Not authorized" });
    } else if (sender === "seller") {
      const s = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
      if (!s?.isSeller) return res.status(403).json({ message: "Not a seller" });
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
      return res.status(400).json({ message: "requestId and safeAddress required" });

    const seller = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
    if (mintRequest.status !== "paid")
      return res.status(400).json({ message: `Cannot mint — status is '${mintRequest.status}'` });

    mintRequest.status = "minting";
    await mintRequest.save();
    console.log(`⏳ Status → minting for ${requestId}`);

    const ngnTokenAddress = process.env.NGN_TOKEN_ADDRESS;
    if (!ngnTokenAddress) throw new Error("NGN_TOKEN_ADDRESS not set in .env");

    const signer = getBackendSigner();
    const ngnToken = new ethers.Contract(ngnTokenAddress, ERC20_MINT_ABI, signer);
    const decimals = await ngnToken.decimals();
    const mintAmt = ethers.parseUnits(mintRequest.mintAmountNgn.toString(), decimals);

    console.log(`🔗 Calling mint(${mintRequest.userSafeAddress}, ${mintAmt}) on ${ngnTokenAddress}`);
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

    return res.json({ success: true, status: "minted", txHash: tx.hash });
  } catch (err) {
    console.error("❌ confirm-mint:", err.message);
    try {
      await MintRequest.findByIdAndUpdate(req.body.requestId, { status: "paid" });
    } catch { /* ignore */ }
    res.status(500).json({ message: err.message || "Mint failed — please try again" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/reject  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post("/reject", async (req, res) => {
  try {
    const { requestId, safeAddress, reason } = req.body;
    const seller = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
    if (!["pending", "paid", "burned"].includes(mintRequest.status))
      return res.status(400).json({ message: "Cannot reject at this stage" });

    mintRequest.status = "rejected";
    mintRequest.messages.push({
      sender: "seller",
      text: reason?.trim() || "❌ Payment could not be verified. Contact support if you believe this is an error.",
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
router.get("/my-request/:safeAddress", async (req, res) => {
  try {
    const addr = req.params.safeAddress.toLowerCase();
    const request = await MintRequest.findOne({ userSafeAddress: addr }).sort({ createdAt: -1 });
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
    }).sort({ createdAt: -1 }).limit(20).select("-receiptImageBase64");
    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/all-requests", async (req, res) => {
  try {
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });

    const requests = await MintRequest.aggregate([
      { $sort: { updatedAt: -1 } },
      { $group: { _id: "$userSafeAddress", doc: { $first: "$$ROOT" } } },
      { $replaceRoot: { newRoot: "$doc" } },
      { $sort: { updatedAt: -1 } },
      { $limit: 100 },
      { $project: { receiptImageBase64: 0 } },
    ]);

    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get("/request/:id", async (req, res) => {
  try {
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });
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
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
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
// EXACT original logic — only addition is points redemption block
// ══════════════════════════════════════════════════════════════════════════════
router.post("/initiate-sell", async (req, res) => {
  try {
    const { safeAddress, amountNgn, bankName, accountNumber, accountName, pointsRedemption } = req.body;
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

    // ── Points redemption validation (new) ────────────────────────────────
    let validatedRedemption = null;
    if (pointsRedemption?.requested && pointsRedemption.pointsToRedeem > 0) {
      const pts = parseInt(pointsRedemption.pointsToRedeem);
      if (pts < 1000) {
        return res.status(400).json({ message: "Minimum redemption is 2,000 points" });
      }
      const userPts = await UserPoints.findOne({ safeAddress: safeAddress.toLowerCase() });
      if (!userPts || userPts.totalPoints < pts) {
        return res.status(400).json({
          message: `Insufficient points. You have ${userPts?.totalPoints || 0} pts.`,
        });
      }
      validatedRedemption = { requested: true, pointsToRedeem: pts, equivalentNGN: pts };
      console.log(`⭐ Redemption validated: ${pts} pts`);
    }

    // ── Check NGNs balance (ORIGINAL — no changes) ────────────────────────
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

    // Block if active request exists
    const existing = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
      status: { $in: ["pending", "paid", "minting"] },
    });
    if (existing) {
      return res.status(409).json({ message: "You already have an active request.", requestId: existing._id });
    }

    // ── Burn NGNs on-chain (ORIGINAL — no changes) ────────────────────────
    const burnAmt = ethers.parseUnits(amount.toString(), decimals);
    console.log(`🔥 Calling burn(${safeAddress}, ${burnAmt}) on ${ngnTokenAddress}`);
    const tx = await ngnToken.burn(safeAddress.toLowerCase(), burnAmt);
    console.log(`⏳ Burn tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("Burn transaction reverted");
    console.log(`✅ Burn confirmed: ${tx.hash}`);

    // ── Deduct points AFTER burn confirms (new — non-fatal) ───────────────
    if (validatedRedemption) {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await UserPoints.findOneAndUpdate(
            { safeAddress: safeAddress.toLowerCase() },
            {
              $inc: { totalPoints: -validatedRedemption.pointsToRedeem, redeemedPoints: validatedRedemption.pointsToRedeem },
              $set: { updatedAt: new Date() },
            },
            { session },
          );
          await PointLedger.create([{
            safeAddress: safeAddress.toLowerCase(),
            username: user.username,
            points: -validatedRedemption.pointsToRedeem,
            reason: "REDEMPTION",
            txHash: tx.hash,
            amount,
            metadata: { sellAmountNgn: amount, pointsRedeemed: validatedRedemption.pointsToRedeem, equivalentNGN: validatedRedemption.equivalentNGN },
            createdAt: new Date(),
          }], { session });
        });
        console.log(`⭐ ${validatedRedemption.pointsToRedeem} pts deducted from ${user.username}`);
      } catch (ptErr) {
        console.error("❌ Points deduction error (non-fatal):", ptErr.message);
        validatedRedemption = { ...validatedRedemption, deductionError: ptErr.message };
      } finally {
        await session.endSession();
      }
    }

    // ── Save to transaction history (ORIGINAL) ────────────────────────────
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

    // ── Build sell message (ORIGINAL + redemption line) ───────────────────
    let redemptionLine = "";
    if (validatedRedemption && !validatedRedemption.deductionError) {
      const total = amount + validatedRedemption.equivalentNGN;
      redemptionLine = `\n\n⭐ **Points Redeemed:** ${validatedRedemption.pointsToRedeem.toLocaleString()} pts → +₦${validatedRedemption.equivalentNGN.toLocaleString()} extra\n💰 **Total to pay user: ₦${total.toLocaleString()}**`;
    }

    const sellMsg = {
      sender: "user",
      isBurned: true,
      text: `💸 Sell request: **${amount.toLocaleString()} NGNs** burned on-chain.\n\n🏦 **${bankName.trim()}**\n👤 **${accountName.trim()}**\n🔢 **${accountNumber.trim()}**\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n🌐 Base Sepolia${redemptionLine}`,
      createdAt: new Date(),
    };

    // ── Reuse or create thread (ORIGINAL logic) ───────────────────────────
    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (mintRequest && ["minted", "rejected", "burned", "sell_completed"].includes(mintRequest.status)) {
      mintRequest.type = "sell";
      mintRequest.status = "paid";
      mintRequest.amountNgn = amount;
      mintRequest.feeNgn = 0;
      mintRequest.mintAmountNgn = amount;
      mintRequest.bankDetails = { bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() };
      mintRequest.pointsRedemption = validatedRedemption || { requested: false };
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
        bankDetails: { bankName: bankName.trim(), accountNumber: accountNumber.trim(), accountName: accountName.trim() },
        pointsRedemption: validatedRedemption || { requested: false },
        status: "paid",
        sellerRead: false,
        txHash: tx.hash,
        messages: [sellMsg],
      });
    }

    console.log(`✅ Sell request ${mintRequest._id} created`);

    // ── Notify sellers (ORIGINAL + redemption info) ───────────────────────
    const totalPayout = amount + (validatedRedemption?.equivalentNGN || 0);
    const redemptionHtml = validatedRedemption
      ? `<p>⭐ Pts redeemed: <b>${validatedRedemption.pointsToRedeem.toLocaleString()}</b> → pay ₦${totalPayout.toLocaleString()} total</p>`
      : `<p>Send <b style="color:#22c55e;">₦${amount.toLocaleString()}</b> to user.</p>`;

    notifySellers(
      `[SALVA] 💸 Sell — ₦${amount.toLocaleString()} — ${user.username}${validatedRedemption ? " + pts" : ""}`,
      `<div style="background:#0A0A0B;color:white;padding:32px;font-family:sans-serif;border-radius:16px;max-width:480px;">
        <h1 style="color:#D4AF37;margin:0 0 20px;font-size:24px;">SALVA</h1>
        <p><b>${user.username}</b> sold <b style="color:#ef4444;">₦${amount.toLocaleString()} NGNs</b> — burned ✅</p>
        ${redemptionHtml}
        <p>🏦 ${bankName} · 👤 ${accountName} · 🔢 ${accountNumber}</p>
        <p style="color:#666;font-size:11px;">TX: ${tx.hash}</p>
      </div>`,
    ).catch(() => {});

    return res.json({
      success: true,
      requestId: mintRequest._id,
      txHash: tx.hash,
      messages: mintRequest.messages,
      pointsDeducted: validatedRedemption?.pointsToRedeem || 0,
    });
  } catch (err) {
    console.error("❌ initiate-sell:", err.message);
    res.status(500).json({ message: err.message || "Sell failed" });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/send-image
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

    const msg = { sender, text: null, imageUrl: imageBase64, createdAt: new Date() };
    mintRequest.messages.push(msg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error("❌ send-image:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/complete-sell
// ══════════════════════════════════════════════════════════════════════════════
router.post("/complete-sell", async (req, res) => {
  try {
    const { requestId, safeAddress } = req.body;
    const seller = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: "Not authorized" });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: "Not found" });
    if (mintRequest.status !== "paid" || mintRequest.type !== "sell")
      return res.status(400).json({ message: "Cannot complete at this stage" });

    const totalPaid = (mintRequest.amountNgn || 0) +
      (mintRequest.pointsRedemption?.requested ? (mintRequest.pointsRedemption.equivalentNGN || 0) : 0);

    mintRequest.status = "sell_completed";
    mintRequest.messages.push({
      sender: "seller",
      text: `✅ Payment sent! ₦${totalPaid.toLocaleString()} has been transferred to your bank account.\n\n🏦 ${mintRequest.bankDetails?.bankName} · 🔢 ${mintRequest.bankDetails?.accountNumber}\n\nThank you for using Salva! 🎉`,
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