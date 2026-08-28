import mongoose from "mongoose";
import { baseConnection } from "../DB_connection.js";

const StatsSnapshotSchema = new mongoose.Schema({
  recordedAt: { type: Date, default: Date.now, index: true },
  network: {
    type: String,
    enum: ["MAINNET", "TESTNET"],
    required: true,
    index: true,
  },

  userCount: { type: Number, default: 0 },
  ngnsCirculating: { type: Number, default: 0 },

  // Treasury balance, currency-specific NOT chain-specific:
  //   treasuryNGN = (NGNs + cNGN) balance, Base + BNB combined
  //   treasuryUSD = (USDT + USDC) balance, Base + BNB combined
  treasuryNGN: { type: Number, default: 0 },
  treasuryUSD: { type: Number, default: 0 },
});

const StatsSnapshot = baseConnection.model(
  "StatsSnapshot",
  StatsSnapshotSchema,
);

export default StatsSnapshot;
