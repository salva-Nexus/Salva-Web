// packages/backend/src/services/rewardService.js
//
// Handles all point/reward logic for Salva transfers.
// Called from /api/transfer in index.js AFTER a successful on-chain tx.
// Uses MongoDB sessions for atomicity.

const mongoose = require("mongoose");
const UserPoints = require("../models/UserPoints");
const PointLedger = require("../models/PointLedger");
const FeeConfig = require("../models/FeeConfig");
const { ReferralCode, ReferralUsage } = require("../models/ReferralCode");

// ─── Get fee and points config for NGN transfers ──────────────────────────────
async function getTransferTier(amountNGN) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });

  const amount = parseFloat(amountNGN);

  if (amount >= config.tier2Min) {
    return {
      fee: config.tier2Fee,
      points: config.tier2Points,
      tier: "HIGH",
      feeWei: BigInt(Math.round(config.tier2Fee * 1e6)),
    };
  }
  if (amount >= config.tier1Min) {
    return {
      fee: config.tier1Fee,
      points: config.tier1Points,
      tier: "MID",
      feeWei: BigInt(Math.round(config.tier1Fee * 1e6)),
    };
  }
  return {
    fee: config.tier0Fee,
    points: config.tier0Points,
    tier: "FREE",
    feeWei: 0n,
    dailyLimit: config.tier0DailyLimit,
  };
}

// ─── Check rate limit for FREE tier transfers ─────────────────────────────────
// Returns { allowed: bool, used: number, limit: number }
async function checkFreeTransferRateLimit(safeAddress) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });

  const userPts = await UserPoints.findOne({
    safeAddress: safeAddress.toLowerCase(),
  });
  if (!userPts)
    return { allowed: true, used: 0, limit: config.tier0DailyLimit };

  const now = new Date();
  const windowStart = userPts.freeTransferWindowStart;

  // If no window or window expired (> 24h ago) → reset
  if (!windowStart || now - windowStart > 24 * 60 * 60 * 1000) {
    return { allowed: true, used: 0, limit: config.tier0DailyLimit };
  }

  const used = userPts.freeTransferUsedToday;
  return {
    allowed: used < config.tier0DailyLimit,
    used,
    limit: config.tier0DailyLimit,
  };
}

// ─── Self-transfer check ──────────────────────────────────────────────────────
function isSelfTransfer(fromAddress, toAddress) {
  return fromAddress.toLowerCase() === toAddress.toLowerCase();
}

// ─── Core: award points atomically ────────────────────────────────────────────
// Must be called with an active mongoose session if you want full atomicity.
async function awardPoints(
  session,
  {
    safeAddress,
    username,
    email,
    points,
    reason,
    txHash,
    relatedAddress,
    amount,
  },
) {
  const now = new Date();

  // Upsert UserPoints doc
  const updated = await UserPoints.findOneAndUpdate(
    { safeAddress: safeAddress.toLowerCase() },
    {
      $inc: { totalPoints: points, lifetimePoints: points },
      $set: { username, email, updatedAt: now },
    },
    { upsert: true, new: true, session },
  );

  // Write audit ledger entry
  await PointLedger.create(
    [
      {
        safeAddress: safeAddress.toLowerCase(),
        username,
        points,
        reason,
        txHash: txHash || null,
        relatedAddress: relatedAddress?.toLowerCase() || null,
        amount: amount || null,
        metadata: { tier: reason },
        createdAt: now,
      },
    ],
    { session },
  );

  return updated;
}

// ─── Increment free transfer counter ─────────────────────────────────────────
async function incrementFreeTransferCount(session, safeAddress) {
  const now = new Date();
  const userPts = await UserPoints.findOne({
    safeAddress: safeAddress.toLowerCase(),
  }).session(session);

  if (!userPts) return;

  const windowStart = userPts.freeTransferWindowStart;
  const windowExpired = !windowStart || now - windowStart > 24 * 60 * 60 * 1000;

  if (windowExpired) {
    await UserPoints.findOneAndUpdate(
      { safeAddress: safeAddress.toLowerCase() },
      { $set: { freeTransferUsedToday: 1, freeTransferWindowStart: now } },
      { session },
    );
  } else {
    await UserPoints.findOneAndUpdate(
      { safeAddress: safeAddress.toLowerCase() },
      { $inc: { freeTransferUsedToday: 1 } },
      { session },
    );
  }
}

// ─── Main: processTransferRewards ─────────────────────────────────────────────
// Called AFTER a successful on-chain transfer.
// Returns { pointsAwarded, tier, rateLimitHit, referralBonusPaid }
async function processTransferRewards({
  fromAddress,
  toAddress,
  amount, // human-readable NGN amount
  coin, // "NGN" | "USDT" | "USDC"
  txHash,
  senderUser, // mongoose User doc
  recipientUser, // mongoose User doc or null
}) {
  // Only reward NGN transfers
  if (coin !== "NGN") {
    return {
      pointsAwarded: 0,
      tier: "NONE",
      rateLimitHit: false,
      referralBonusPaid: false,
    };
  }

  // No self-rewards
  if (isSelfTransfer(fromAddress, toAddress)) {
    console.log("⚠️  Self-transfer detected — no points awarded");
    return {
      pointsAwarded: 0,
      tier: "SELF",
      rateLimitHit: false,
      referralBonusPaid: false,
    };
  }

  if (!senderUser) {
    return {
      pointsAwarded: 0,
      tier: "NONE",
      rateLimitHit: false,
      referralBonusPaid: false,
    };
  }

  const { fee, points, tier, dailyLimit } = await getTransferTier(amount);

  // Rate limit check for FREE tier
  let rateLimitHit = false;
  if (tier === "FREE") {
    const rateCheck = await checkFreeTransferRateLimit(fromAddress);
    if (!rateCheck.allowed) {
      console.log(
        `⚠️  Rate limit hit for ${senderUser.username}: ${rateCheck.used}/${rateCheck.limit} free txs today`,
      );
      rateLimitHit = true;
      // No points for this transfer — still completes on-chain
      return { pointsAwarded: 0, tier, rateLimitHit, referralBonusPaid: false };
    }
  }

  // Use MongoDB session for atomicity
  const session = await mongoose.startSession();
  let pointsAwarded = 0;
  let referralBonusPaid = false;

  try {
    await session.withTransaction(async () => {
      // 1. Award sender points
      await awardPoints(session, {
        safeAddress: fromAddress,
        username: senderUser.username,
        email: senderUser.email,
        points,
        reason: `TRANSFER_TIER_${tier}`,
        txHash,
        relatedAddress: toAddress,
        amount: parseFloat(amount),
      });

      pointsAwarded = points;

      // 2. If FREE tier, increment rate limit counter
      if (tier === "FREE") {
        await incrementFreeTransferCount(session, fromAddress);
      }

      // 3. Mark first transfer done (for referral trigger)
// 3. Referral bonus — check if this is the referred user's first qualifying transfer
const amountNum = parseFloat(amount);

// Check if sender's first transfer is already done (on UserPoints, not User)
const senderPts = await UserPoints.findOne({
  safeAddress: fromAddress.toLowerCase(),
}).session(session);

const firstTransferAlreadyDone = senderPts?.firstTransferDone === true;

if (!firstTransferAlreadyDone) {
  // Determine referral bonus based on transfer amount tiers
  let referralBonus = 0;
  if (amountNum >= 10000) referralBonus = 20;
  else if (amountNum >= 5000) referralBonus = 10;
  // < 5000 → 0, no referral bonus

  if (referralBonus > 0) {
    // Check if this user was referred and bonus not yet paid
    const referralUsage = await ReferralUsage.findOne({
      referredSafeAddress: fromAddress.toLowerCase(),
      bonusPaid: false,
    }).session(session);

    if (referralUsage) {
      const referrerUser = await require("../models/User")
        .findOne({ safeAddress: referralUsage.referrerSafeAddress })
        .session(session);

      if (referrerUser) {
        await awardPoints(session, {
          safeAddress: referralUsage.referrerSafeAddress,
          username: referrerUser.username,
          email: referrerUser.email,
          points: referralBonus,
          reason: "REFERRAL_BONUS",
          txHash,
          relatedAddress: fromAddress,
          amount: amountNum,
        });

        await ReferralUsage.findOneAndUpdate(
          { _id: referralUsage._id },
          { $set: { bonusPaid: true, bonusPaidAt: new Date() } },
          { session },
        );

        await ReferralCode.findOneAndUpdate(
          { ownerSafeAddress: referralUsage.referrerSafeAddress },
          { $inc: { qualifiedReferrals: 1 } },
          { session },
        );

        referralBonusPaid = true;
        console.log(
          `🎁 Referral bonus: ${referralBonus} pts → ${referrerUser.username} (referred user sent ₦${amountNum.toLocaleString()})`,
        );
      }
    }
  }

  // Mark first transfer done regardless — even if amount was too small,
  // so we don't keep checking on every future transfer
  await UserPoints.findOneAndUpdate(
    { safeAddress: fromAddress.toLowerCase() },
    { $set: { firstTransferDone: true } },
    { session },
  );
}

    console.log(
      `⭐ Points awarded: ${pointsAwarded} (${tier}) to ${senderUser.username} | tx: ${txHash?.slice(0, 12)}`,
    );
    return { pointsAwarded, tier, rateLimitHit, referralBonusPaid };
  } catch (err) {
    console.error(
      "❌ rewardService.processTransferRewards error:",
      err.message,
    );
    // Points failure must NOT break the transfer
    return {
      pointsAwarded: 0,
      tier,
      rateLimitHit: false,
      referralBonusPaid: false,
      error: err.message,
    };
  } finally {
    await session.endSession();
  }
}

// ─── Referral code generation ─────────────────────────────────────────────────
function generateCode(username) {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${username.toUpperCase().slice(0, 6)}${suffix}`;
}

async function getOrCreateReferralCode(safeAddress, username) {
  const existing = await ReferralCode.findOne({
    ownerSafeAddress: safeAddress.toLowerCase(),
  });
  if (existing) return existing.code;

  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateCode(username);
    const collision = await ReferralCode.findOne({ code });
    if (!collision) break;
    attempts++;
  }

  const doc = await ReferralCode.create({
    code,
    ownerSafeAddress: safeAddress.toLowerCase(),
    ownerUsername: username,
  });
  return doc.code;
}

// ─── Redeem points → NGN ──────────────────────────────────────────────────────
async function redeemPoints(safeAddress, pointsToRedeem) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });

  const userPts = await UserPoints.findOne({
    safeAddress: safeAddress.toLowerCase(),
  });
  if (!userPts) throw new Error("No points record found");
  if (userPts.totalPoints < config.minRedemptionPoints)
    throw new Error(
      `Minimum redemption is ${config.minRedemptionPoints} points`,
    );
  if (pointsToRedeem > userPts.totalPoints)
    throw new Error("Insufficient points");
  if (pointsToRedeem < config.minRedemptionPoints)
    throw new Error(
      `Minimum redemption is ${config.minRedemptionPoints} points`,
    );

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await UserPoints.findOneAndUpdate(
        { safeAddress: safeAddress.toLowerCase() },
        {
          $inc: {
            totalPoints: -pointsToRedeem,
            redeemedPoints: pointsToRedeem,
          },
          $set: { updatedAt: new Date() },
        },
        { session },
      );

      await PointLedger.create(
        [
          {
            safeAddress: safeAddress.toLowerCase(),
            username: userPts.username,
            points: -pointsToRedeem,
            reason: "REDEMPTION",
            metadata: { pointsRedeemed: pointsToRedeem },
            createdAt: new Date(),
          },
        ],
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  return { pointsRedeemed: pointsToRedeem };
}

module.exports = {
  processTransferRewards,
  getTransferTier,
  checkFreeTransferRateLimit,
  getOrCreateReferralCode,
  redeemPoints,
};
