// packages/backend/src/models/OtpStore.js
const mongoose = require("mongoose");

const OtpStoreSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  code: { type: String, required: true },
  expires: { type: Date, required: true },
  verified: { type: Boolean, default: false },
});

// MongoDB TTL index — auto-deletes expired OTPs
OtpStoreSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("OtpStore", OtpStoreSchema);