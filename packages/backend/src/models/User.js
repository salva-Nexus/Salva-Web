const mongoose = require("mongoose");

const LinkedNameSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    wallet: { type: String, required: true, lowercase: true },
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
  isSeller: { type: Boolean, default: false },
  nameAliases: { type: [LinkedNameSchema], default: [] },
  nameAlias: { type: String, default: null, sparse: true },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("User", UserSchema);
