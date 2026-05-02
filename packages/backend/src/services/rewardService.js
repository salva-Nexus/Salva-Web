// packages/backend/src/services/rewardService.js
const mongoose = require("mongoose");
const UserPoints = require("../models/UserPoints");
const PointLedger = require("../models/PointLedger");
const FeeConfig = require("../models/FeeConfig");
const { ReferralCode, ReferralUsage } = require("../models/ReferralCode");

async function getTransferTier(amountNGN) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });
  const amount = parseFloat(amountNGN);
  if (amount >= config.tier2Min) {
    return { fee: config.tier2Fee, points: config.tier2Points, tier: "HIGH", feeWei: BigInt(Math.round(config.tier2Fee * 1e6)) };
  }
  if (amount >= config.tier1Min) {
    return { fee: config.tier1Fee, points: config.tier1Points, tier: "MID", feeWei: BigInt(Math.round(config.tier1Fee * 1e6)) };
  }
  return { fee: config.tier0Fee, points: config.tier0Points, tier: "FREE", feeWei: 0n, dailyLimit: config.tier0DailyLimit };
}

async function checkFreeTransferRateLimit(safeAddress) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });
  const userPts = await UserPoints.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!userPts) return { allowed: true, used: 0, limit: config.tier0DailyLimit };
  const now = new Date();
  const windowStart = userPts.freeTransferWindowStart;
  if (!windowStart || now - windowStart > 24 * 60 * 60 * 1000) {
    return { allowed: true, used: 0, limit: config.tier0DailyLimit };
  }
  const used = userPts.freeTransferUsedToday;
  return { allowed: used < config.tier0DailyLimit, used, limit: config.tier0DailyLimit };
}

function isSelfTransfer(fromAddress, toAddress) {
  return fromAddress.toLowerCase() === toAddress.toLowerCase();
}

async function awardPoints(session, { safeAddress, username, email, points, reason, txHash, relatedAddress, amount }) {
  const now = new Date();
  const updated = await UserPoints.findOneAndUpdate(
    { safeAddress: safeAddress.toLowerCase() },
    {
      $inc: { totalPoints: points, lifetimePoints: points },
      $set: { username, email, updatedAt: now },
    },
    { upsert: true, new: true, session },
  );
  await PointLedger.create([{
    safeAddress: safeAddress.toLowerCase(),
    username,
    points,
    reason,
    txHash: txHash || null,
    relatedAddress: relatedAddress?.toLowerCase() || null,
    amount: amount || null,
    metadata: { tier: reason },
    createdAt: now,
  }], { session });
  return updated;
}

async function incrementFreeTransferCount(session, safeAddress) {
  const now = new Date();
  const userPts = await UserPoints.findOne({ safeAddress: safeAddress.toLowerCase() }).session(session);
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

async function processTransferRewards({ fromAddress, toAddress, amount, coin, txHash, senderUser, recipientUser }) {
  if (coin !== "NGN") {
    return { pointsAwarded: 0, tier: "NONE", rateLimitHit: false, referralBonusPaid: false };
  }

  if (isSelfTransfer(fromAddress, toAddress)) {
    console.log("⚠️  Self-transfer detected — no points awarded");
    return { pointsAwarded: 0, tier: "SELF", rateLimitHit: false, referralBonusPaid: false };
  }

  if (!senderUser) {
    return { pointsAwarded: 0, tier: "NONE", rateLimitHit: false, referralBonusPaid: false };
  }

  const { fee, points, tier, dailyLimit } = await getTransferTier(amount);

  let rateLimitHit = false;
  if (tier === "FREE") {
    const rateCheck = await checkFreeTransferRateLimit(fromAddress);
    if (!rateCheck.allowed) {
      console.log(`⚠️  Rate limit hit for ${senderUser.username}: ${rateCheck.used}/${rateCheck.limit} free txs today`);
      rateLimitHit = true;
      return { pointsAwarded: 0, tier, rateLimitHit, referralBonusPaid: false };
    }
  }

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

      // 2. Increment free transfer counter if FREE tier
      if (tier === "FREE") {
        await incrementFreeTransferCount(session, fromAddress);
      }

      // 3. Referral bonus — only fires on referred user's first transfer
      const amountNum = parseFloat(amount);

      // Read firstTransferDone from UserPoints (NOT from User model)
      const senderPts = await UserPoints.findOne({
        safeAddress: fromAddress.toLowerCase(),
      }).session(session);

      const firstTransferAlreadyDone = senderPts?.firstTransferDone === true;

      if (!firstTransferAlreadyDone) {
        // Tier-based referral bonus:
        // >= 10,000 → referrer gets 20 pts
        // 5,000–9,999 → referrer gets 10 pts
        // < 5,000 → referrer gets 0 pts
        let referralBonus = 0;
        if (amountNum >= 10000) referralBonus = 20;
        else if (amountNum >= 5000) referralBonus = 10;

        if (referralBonus > 0) {
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
              console.log(`🎁 Referral bonus: ${referralBonus} pts → ${referrerUser.username} (referred user sent ₦${amountNum.toLocaleString()})`);
            }
          }
        }

        // Mark first transfer done regardless of amount — stop checking on future transfers
        await UserPoints.findOneAndUpdate(
          { safeAddress: fromAddress.toLowerCase() },
          { $set: { firstTransferDone: true } },
          { session },
        );
      }
    }); // ← closes session.withTransaction

    console.log(`⭐ Points awarded: ${pointsAwarded} (${tier}) to ${senderUser.username} | tx: ${txHash?.slice(0, 12)}`);
    return { pointsAwarded, tier, rateLimitHit, referralBonusPaid };
  } catch (err) {
    console.error("❌ rewardService.processTransferRewards error:", err.message);
    return { pointsAwarded: 0, tier, rateLimitHit: false, referralBonusPaid: false, error: err.message };
  } finally {
    await session.endSession();
  }
}

function generateCode(username) {
  const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${username.toUpperCase().slice(0, 6)}${suffix}`;
}

async function getOrCreateReferralCode(safeAddress, username) {
  const existing = await ReferralCode.findOne({ ownerSafeAddress: safeAddress.toLowerCase() });
  if (existing) return existing.code;
  let code;
  let attempts = 0;
  while (attempts < 10) {
    code = generateCode(username);
    const collision = await ReferralCode.findOne({ code });
    if (!collision) break;
    attempts++;
  }
  const doc = await ReferralCode.create({ code, ownerSafeAddress: safeAddress.toLowerCase(), ownerUsername: username });
  return doc.code;
}

async function redeemPoints(safeAddress, pointsToRedeem) {
  let config = await FeeConfig.findById("main");
  if (!config) config = await FeeConfig.create({ _id: "main" });
  const userPts = await UserPoints.findOne({ safeAddress: safeAddress.toLowerCase() });
  if (!userPts) throw new Error("No points record found");
  if (userPts.totalPoints < config.minRedemptionPoints)
    throw new Error(`Minimum redemption is ${config.minRedemptionPoints} points`);
  if (pointsToRedeem > userPts.totalPoints) throw new Error("Insufficient points");
  if (pointsToRedeem < config.minRedemptionPoints)
    throw new Error(`Minimum redemption is ${config.minRedemptionPoints} points`);

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await UserPoints.findOneAndUpdate(
        { safeAddress: safeAddress.toLowerCase() },
        { $inc: { totalPoints: -pointsToRedeem, redeemedPoints: pointsToRedeem }, $set: { updatedAt: new Date() } },
        { session },
      );
      await PointLedger.create([{
        safeAddress: safeAddress.toLowerCase(),
        username: userPts.username,
        points: -pointsToRedeem,
        reason: "REDEMPTION",
        metadata: { pointsRedeemed: pointsToRedeem },
        createdAt: new Date(),
      }], { session });
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