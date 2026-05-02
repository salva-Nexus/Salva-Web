// packages/backend/src/models/ReferralCode.js
const mongoose = require("mongoose");

const ReferralCodeSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    index: true,
  },
  ownerSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true, // one code per user
    index: true,
  },
  ownerUsername: { type: String, required: true },
  totalReferrals: { type: Number, default: 0 },
  qualifiedReferrals: { type: Number, default: 0 }, // completed first 10k+ tx
  createdAt: { type: Date, default: Date.now },
});

// Referral usage — tracks each referred user
const ReferralUsageSchema = new mongoose.Schema({
  referralCode: { type: String, required: true, uppercase: true, index: true },
  referrerSafeAddress: { type: String, required: true, lowercase: true },
  referredSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true, // a user can only be referred once
    index: true,
  },
  referredUsername: { type: String, required: true },
  bonusPaid: { type: Boolean, default: false }, // true after first qualifying tx
  bonusPaidAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now },
});

ReferralUsageSchema.index({ referrerSafeAddress: 1, bonusPaid: 1 });

const ReferralCode = mongoose.model("ReferralCode", ReferralCodeSchema);
const ReferralUsage = mongoose.model("ReferralUsage", ReferralUsageSchema);

module.exports = { ReferralCode, ReferralUsage };
