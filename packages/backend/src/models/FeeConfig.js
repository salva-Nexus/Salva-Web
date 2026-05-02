// packages/backend/src/models/FeeConfig.js
const mongoose = require("mongoose");

// One document, _id = 'main'.
// NEW TIERS (per user acquisition spec):
//   >= 10,000 NGN  → 50 NGN fee, 25 points
//   5,000–9,999    → 25 NGN fee, 15 points
//   < 5,000        → 0 NGN fee,  5 points (rate-limited: 3x/24h)
const FeeConfigSchema = new mongoose.Schema({
  _id: { type: String, default: "main" },

  // Tier 1: FREE transfers (< 5,000 NGN) — no fee
  tier0Max: { type: Number, default: 4999 },
  tier0Fee: { type: Number, default: 0 },
  tier0Points: { type: Number, default: 5 },
  tier0DailyLimit: { type: Number, default: 3 }, // max 3 free point-earning txs per 24h

  // Tier 1: MID transfers (5,000 – 9,999 NGN) — 25 NGN fee
  tier1Min: { type: Number, default: 5000 },
  tier1Max: { type: Number, default: 9999 },
  tier1Fee: { type: Number, default: 25 },
  tier1Points: { type: Number, default: 15 },

  // Tier 2: HIGH transfers (>= 10,000 NGN) — 50 NGN fee
  tier2Min: { type: Number, default: 10000 },
  tier2Fee: { type: Number, default: 50 },
  tier2Points: { type: Number, default: 25 },

  // Referral bonus — paid to referrer after referred user's first 10k+ tx
  referralBonusPoints: { type: Number, default: 20 },
  referralQualifyingMin: { type: Number, default: 10000 },

  // Redemption threshold
  minRedemptionPoints: { type: Number, default: 1000 },

  // USD-denominated tokens (USDT/USDC) — flat fee unchanged
  usdTierFee: { type: Number, default: 0.015 },
  usdTierMin: { type: Number, default: 5 },
});

module.exports = mongoose.model("FeeConfig", FeeConfigSchema);
