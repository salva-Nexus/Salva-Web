// Salva-Digital-Tech/packages/backend/src/models/User.js
const mongoose = require("mongoose");

const LinkedNameSchema = new mongoose.Schema(
  {
    // The full welded name as stored on-chain, e.g. "charles@salva"
    name: { type: String, required: true },
    // The wallet address this name points to, lowercase
    wallet: { type: String, required: true, lowercase: true },
    // The registry contract address used for this link (lowercase)
    registryAddress: { type: String, required: true, lowercase: true },
  },
  { _id: false },
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

  // Array of {name, wallet, registryAddress} objects — one per linked alias
  nameAliases: { type: [LinkedNameSchema], default: [] },

  // LEGACY: keep for migration — single alias string. Will be null for new users.
  nameAlias: { type: String, default: null, sparse: true },

  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("User", UserSchema);
