// Salva-Digital-Tech/packages/backend/src/models/TransactionQueue.js
const mongoose = require("mongoose");

const TransactionQueueSchema = new mongoose.Schema({
  walletAddress: {
    type: String,
    required: true,
    index: true,
    lowercase: true,
  },
  status: {
    type: String,
    enum: ["PENDING", "SENDING", "CONFIRMED", "FAILED"],
    default: "PENDING",
    index: true,
  },
  type: {
    type: String,
    enum: ["transfer"],
    required: true,
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  txHash: {
    type: String,
    default: null,
  },
  taskId: {
    type: String,
    default: null,
  },
  errorMessage: {
    type: String,
    default: null,
  },
  cooldownUntil: {
    type: Date,
    default: null,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

TransactionQueueSchema.index({ walletAddress: 1, status: 1 });

module.exports = mongoose.model("TransactionQueue", TransactionQueueSchema);
