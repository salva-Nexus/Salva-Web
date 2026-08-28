import mongoose from "mongoose";
import { baseConnection, bnbConnection } from "../DB_connection.js";

// One document per payment event — full history preserved
const PoolSubscriptionSchema = new mongoose.Schema({
  poolAddress: { type: String, required: true, lowercase: true, index: true },
  ownerSafeAddress: { type: String, required: true, lowercase: true },
  months: { type: Number, required: true },
  amountPaid: { type: Number, required: true }, // in NGNs (human)
  txHash: { type: String, default: null },
  // Rollover-aware: if sub was already active, startedAt = old expiresAt
  active: { type: Boolean, default: false },
  startedAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

const FEE_PER_MONTH = 1500;

const basePoolSubscription = baseConnection.model(
  "BasePoolSubscription",
  PoolSubscriptionSchema,
);

const bnbPoolSubscription = bnbConnection.model(
  "BnbPoolSubscription",
  PoolSubscriptionSchema,
);

export { basePoolSubscription, bnbPoolSubscription, FEE_PER_MONTH };
