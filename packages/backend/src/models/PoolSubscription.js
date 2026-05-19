const mongoose = require("mongoose");

// One document per payment event — full history preserved
const PoolSubscriptionSchema = new mongoose.Schema({
  poolAddress: { type: String, required: true, lowercase: true, index: true },
  ownerSafeAddress: { type: String, required: true, lowercase: true },
  months: { type: Number, required: true, enum: [1, 2, 6, 12] },
  amountPaid: { type: Number, required: true }, // in NGNs (human)
  txHash: { type: String, default: null },
  // Rollover-aware: if sub was already active, startedAt = old expiresAt
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("PoolSubscription", PoolSubscriptionSchema);
