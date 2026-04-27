const mongoose = require("mongoose");

const MessageSchema = new mongoose.Schema({
  sender: { type: String, enum: ["user", "seller", "system"], required: true },
  text: { type: String, default: null },
  imageUrl: { type: String, default: null },
  isReceipt: { type: Boolean, default: false },
  isMinted: { type: Boolean, default: false },
  isBurned: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const MintRequestSchema = new mongoose.Schema({
  userSafeAddress: { type: String, lowercase: true, required: true },
  userEmail: { type: String, lowercase: true, required: true },
  username: { type: String, required: true },

  // "buy" or "sell"
  type: { type: String, enum: ["buy", "sell"], default: "buy" },

  amountNgn: { type: Number, required: true },
  feeNgn: { type: Number, default: 0 },
  mintAmountNgn: { type: Number, required: true },

  // Sell: user's bank details for manual payout
  bankDetails: {
    bankName: { type: String, default: null },
    accountNumber: { type: String, default: null },
    accountName: { type: String, default: null },
  },

  status: {
    type: String,
    enum: [
      "pending",
      "paid",
      "minting",
      "minted",
      "rejected",
      "burned",
      "sell_completed",
    ],
    default: "pending",
  },

  txHash: { type: String, default: null },
  mintedAt: { type: Date, default: null },
  receiptImageBase64: { type: String, default: null },
  messages: [MessageSchema],
  sellerRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

MintRequestSchema.index({ userSafeAddress: 1, status: 1 });
MintRequestSchema.index({ status: 1, createdAt: -1 });
MintRequestSchema.index({ sellerRead: 1, updatedAt: -1 });

module.exports = mongoose.model("MintRequest", MintRequestSchema);