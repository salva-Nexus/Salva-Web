// packages/backend/src/models/UserPoints.js
const mongoose = require("mongoose");

const UserPointsSchema = new mongoose.Schema({
  safeAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },
  username: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  totalPoints: { type: Number, default: 0 },
  lifetimePoints: { type: Number, default: 0 }, // never decrements
  redeemedPoints: { type: Number, default: 0 },
  freeTransferUsedToday: { type: Number, default: 0 }, // rate limit counter
  freeTransferWindowStart: { type: Date, default: null }, // when 24h window started
  firstTransferDone: { type: Boolean, default: false }, // for referral trigger
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("UserPoints", UserPointsSchema);
