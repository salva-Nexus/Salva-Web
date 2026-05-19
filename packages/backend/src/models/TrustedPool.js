const mongoose = require("mongoose");

// Records that a user has approved type(uint256).max for a pool contract
// so that subsequent swaps skip the approve step
const TrustedPoolSchema = new mongoose.Schema({
  userSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  poolAddress: { type: String, required: true, lowercase: true, index: true },
  // Which token was approved (NGNs, USDC, or USDT address)
  tokenAddress: { type: String, required: true, lowercase: true },
  txHash: { type: String, default: null },
  trustedAt: { type: Date, default: Date.now },
});

// One trust record per (user, pool, token) triple
TrustedPoolSchema.index(
  { userSafeAddress: 1, poolAddress: 1, tokenAddress: 1 },
  { unique: true },
);

module.exports = mongoose.model("TrustedPool", TrustedPoolSchema);
