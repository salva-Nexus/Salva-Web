// Salva-Digital-Tech/packages/backend/src/models/Transaction.js
const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
  // ── Sender ──────────────────────────────────────────────────────────────
  fromAddress: { type: String, required: true, lowercase: true },
  fromUsername: { type: String, default: null },
  // The sender's @salva alias if they are a Salva wallet user
  fromNameAlias: { type: String, default: null },

  // ── Recipient ────────────────────────────────────────────────────────────
  toAddress: { type: String, default: null, lowercase: true },
  toUsername: { type: String, default: null },
  // The recipient's @salva alias if they are a Salva wallet user
  toNameAlias: { type: String, default: null },

  // ── Display identifiers ──────────────────────────────────────────────────
  // Exactly what the sender typed into the recipient input box,
  // after welding — e.g. "cboi@metamask" or "0x1234…".
  // This is used verbatim as the "TO:" display on the sender's history.
  senderDisplayIdentifier: { type: String, default: null },

  // ── Token & amounts ──────────────────────────────────────────────────────
  amount: { type: String, required: true },
  // Human-readable fee taken (e.g. "50" NGNs or "0.015" USDC). null = free.
  fee: { type: String, default: null },
  // Token used: "NGN" | "USDT" | "USDC"
  coin: { type: String, default: "NGN" },

  // ── Status & type ────────────────────────────────────────────────────────
  status: { type: String, default: "pending" },
  taskId: { type: String, default: null },
  type: { type: String, default: "transfer" },
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Transaction", TransactionSchema);