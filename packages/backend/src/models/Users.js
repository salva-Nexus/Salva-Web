import mongoose from "mongoose";
import { baseConnection, bnbConnection } from "../DB_connection.js";
import { createHash } from "node:crypto";

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
  nameAliases: {
    type: [
      {
        name: { type: String, required: true },
        wallet: { type: String, required: true, lowercase: true },
        registryAddress: { type: String, required: true, lowercase: true },
      },
    ],
    default: [],
  },
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
  isNewUser: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

const buildHash = (object) => {
  const hash = createHash("sha256");
  hash.write(object);
  hash.end();
  return hash.read().toString("hex");
};

const User = baseConnection.model("User", UserSchema);

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
  pinSetupCompleted: { type: Boolean, default: false },
  deploymentLoanNGN: { type: Number, default: 0 },
  deploymentLoanUSD: { type: Number, default: 0 },
  hasPaidDeploymentLoan: { type: Boolean, default: false },

  createdAt: { type: Date, default: Date.now, index: true },
});

const UserBNB = bnbConnection.model("users", UserBNBSchema);

export { User, UserBNB, buildHash };
