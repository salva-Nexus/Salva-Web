// Salva-Digital-Tech/packages/backend/src/models/User.js
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  username: { type: String, required: true, unique: true, trim: true, index: true },
  password: { type: String, required: true },
  safeAddress: { type: String, required: true, unique: true, index: true, lowercase: true, set: (v) => v.toLowerCase() },
  accountNumber: { type: String, required: true, unique: true, index: true },
  ownerPrivateKey: { type: String, required: true },
  transactionPin: { type: String, default: null },
  accountLockedUntil: { type: Date, default: null },
  pinSetupCompleted: { type: Boolean, default: false },
  isValidator: { type: Boolean, default: false }, // NEW — true = admin/validator
  nameAlias: { type: String, default: null },     // NEW — e.g. "charles" (without namespace)
  numberAlias: { type: String, default: null },   // NEW — the account number alias once linked
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("User", UserSchema);