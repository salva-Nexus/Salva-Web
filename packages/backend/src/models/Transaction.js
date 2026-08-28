// Salva-Digital-Tech/packages/backend/src/models/Transaction.js
import mongoose from "mongoose";
import { baseConnection } from "../DB_connection.js";

const TransactionSchema = new mongoose.Schema({
  // ── Sender ──────────────────────────────────────────────────────────────
  fromAddress: { type: String, required: true, lowercase: true },

  // ── Recipient ────────────────────────────────────────────────────────────
  toAddress: { type: String, default: null, lowercase: true },

  // ── Token & amounts ──────────────────────────────────────────────────────
  amount: { type: String, required: true },
  // Human-readable fee taken (e.g. "50" NGNs or "0.015" USDC). null = free.
  fee: { type: String, default: null },
  feeCoin: { type: String, default: "NGNS" },
  // Token used: "NGN" | "USDT" | "USDC"
  coin: { type: String, default: "NGNS" },
  chain: { type: String, default: "base" },

  // ── Status & type ────────────────────────────────────────────────────────
  status: { type: String, default: "success" },
  taskId: { type: String, default: null },
  type: { type: String, default: "transfer" },
  date: { type: Date, default: Date.now },
});

const Transaction = baseConnection.model("Transaction", TransactionSchema);
export default Transaction;
