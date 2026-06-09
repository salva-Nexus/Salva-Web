// packages/backend/src/models/FeeConfig.js
const mongoose = require('mongoose');

const FeeConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },

  // Tier 0: FREE transfers (< 1,000 NGN) — no fee
  tier0Max: { type: Number, default: 999 },
  tier0Fee: { type: Number, default: 0 },

  // Tier 1: MID transfers (1,000 – 9,999 NGN) — 10 NGN/cNGN fee
  tier1Min: { type: Number, default: 1000 },
  tier1Max: { type: Number, default: 9999 },
  tier1Fee: { type: Number, default: 10 },

  // Tier 2: HIGH transfers (>= 10,000 NGN) — 20 NGN/cNGN fee
  tier2Min: { type: Number, default: 10000 },
  tier2Fee: { type: Number, default: 20 },

  // USD-denominated tokens (USDT/USDC) — flat fee unchanged
  usdTierFee: { type: Number, default: 0.015 },
  usdTierMin: { type: Number, default: 5 },

  poolSubscriptionMonthlyFee: { type: Number, default: 3000 },
});

module.exports = mongoose.model('FeeConfig', FeeConfigSchema);
