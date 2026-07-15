// packages/backend/src/models/User.js
const mongoose = require('mongoose');

const LinkedNameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    wallet: { type: String, required: true, lowercase: true },
    registryAddress: { type: String, required: true, lowercase: true },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema({
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
  password: { type: String, required: true },
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
  isValidator: { type: Boolean, default: false },
  isSeller: { type: Boolean, default: false },
  nameAliases: { type: [LinkedNameSchema], default: [] },
  nameAlias: { type: String, default: null, sparse: true },
  deploymentLoanNGN: { type: Number, default: 0 },
  deploymentLoanUSD: { type: Number, default: 0 },
  hasPaidDeploymentLoan: { type: Boolean, default: false },

  // --- SANT community mining (Base chain activity only) ---
  // Incremented on confirmed Transfer/Swap/DeployPool on Base, and on
  // registration/referral bonuses. Reset to 0 the instant a claim mints.
  santPoints: { type: Number, default: 0, min: 0 },
  // True while a claim mint is in-flight for this user — blocks concurrent
  // claim requests from double-spending the same point balance.
  santClaimInProgress: { type: Boolean, default: false },

  // --- Referral system (Base User only — never on UserBNB) ---
  referralCode: { type: String, unique: true, index: true, sparse: true },
  referredBy: { type: String, default: null, index: true },

  createdAt: { type: Date, default: Date.now, index: true },
});

UserSchema.statics.generateReferralCode = async function () {
  const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  for (let attempt = 0; attempt < 5; attempt++) {
    let suffix = '';
    for (let i = 0; i < 6; i++) suffix += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    const candidate = `SLV-${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const exists = await mongoose.models.User.exists({ referralCode: candidate });
    if (!exists) return candidate;
  }
  throw new Error('Could not generate a unique referral code after 5 attempts');
};

module.exports = mongoose.model('User', UserSchema);
