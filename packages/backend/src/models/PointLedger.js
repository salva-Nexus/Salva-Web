// packages/backend/src/models/PointLedger.js
const mongoose = require("mongoose");

const PointLedgerSchema = new mongoose.Schema({
  safeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  username: { type: String, required: true },
  points: { type: Number, required: true }, // positive = earned, negative = redeemed
  reason: {
    type: String,
    enum: [
      "TRANSFER_TIER_FREE", // < 5k transfer
      "TRANSFER_TIER_MID", // 5k-9,999 transfer
      "TRANSFER_TIER_HIGH", // >= 10k transfer
      "REFERRAL_BONUS", // referrer earned bonus
      "REDEMPTION", // points converted to NGN
    ],
    required: true,
  },
  txHash: { type: String, default: null }, // blockchain tx hash
  relatedAddress: { type: String, default: null }, // counterparty address
  amount: { type: Number, default: null }, // transfer amount that triggered this
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  createdAt: { type: Date, default: Date.now, index: true },
});

PointLedgerSchema.index({ safeAddress: 1, createdAt: -1 });
PointLedgerSchema.index({ reason: 1, createdAt: -1 });

module.exports = mongoose.model("PointLedger", PointLedgerSchema);
