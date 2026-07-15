// packages/backend/src/models/UserBNB.js
const mongoose = require('mongoose');

const LinkedNameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    wallet: { type: String, required: true, lowercase: true },
    registryAddress: { type: String, required: true, lowercase: true },
  },
  { _id: false }
);

const UserBNBSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  safeAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    set: (v) => v.toLowerCase(),
  },
  ownerPrivateKey: { type: String, required: true },
  transactionPin: { type: String, default: null },
  accountLockedUntil: { type: Date, default: null },
  pinSetupCompleted: { type: Boolean, default: false },
  nameAliases: { type: [LinkedNameSchema], default: [] },
  nameAlias: { type: String, default: null, sparse: true },
  deploymentLoanNGN: { type: Number, default: 0 },
  deploymentLoanUSD: { type: Number, default: 0 },
  hasPaidDeploymentLoan: { type: Boolean, default: false },

  // --- SANT community mining (BNB chain activity only) ---
  // No referral fields here — referrals live only on the Base User model.
  santPoints: { type: Number, default: 0, min: 0 },
  santClaimInProgress: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = UserBNBSchema; // Export schema, not model — model registered via l1db