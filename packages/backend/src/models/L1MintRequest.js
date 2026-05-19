// packages/backend/src/models/L1MintRequest.js
const mongoose = require("mongoose");

const L1MintRequestSchema = new mongoose.Schema({
  // Who is buying/selling NGNs — their EOA wallet address
  eoaAddress: { type: String, required: true, lowercase: true },

  // buy = user sends NGN bank transfer → receives NGNs minted to EOA
  // sell = user burns NGNs from EOA → receives NGN bank payout
  type: { type: String, enum: ["buy", "sell"], required: true },

  // Amount in NGN / NGNs
  amount: { type: String, required: true },

  // Coin: NGN (our NGNs token) or CNGN
  coin: { type: String, default: "NGN" },

  // Status flow:
  // buy:  pending_proof → proof_uploaded → completed / rejected
  // sell: pending_burn  → burn_confirmed → completed / rejected
  status: {
    type: String,
    enum: [
      "pending_proof",
      "proof_uploaded",
      "pending_burn",
      "burn_confirmed",
      "completed",
      "rejected",
    ],
    default: "pending_proof",
  },

  // Bank details user provided (for sell: payout destination)
  bankDetails: {
    bankName: { type: String },
    accountName: { type: String },
    accountNumber: { type: String },
  },

  // Receipt image uploaded by user (base64 or URL)
  receiptImage: { type: String },

  // On-chain tx hash for burn (sell flow)
  burnTxHash: { type: String },

  // On-chain tx hash for mint (buy flow — filled by backend after approval)
  mintTxHash: { type: String },

  // Rejection reason
  rejectReason: { type: String },

  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  completedAt: { type: Date },
});

L1MintRequestSchema.pre("save", function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model("L1MintRequest", L1MintRequestSchema);
