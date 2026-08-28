import mongoose from "mongoose";
import { baseConnection } from "../DB_connection.js";

const mode = process.env.NODE_ENV;

const PointsSchema = new mongoose.Schema({
  totalPointsIssued: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
  hardCap: { type: Number, default: 500_000_000, immutable: true },
  network: {
    type: String,
    default: mode === "production" ? "MAINNET" : "TESTNET",
    immutable: true,
  },
  redeemCap: { type: Number, default: 1_000_000 },
  canRedeem: { type: Boolean, default: false },
});

const pointsDistribution = {
  registration: {
    referrer: 0.3,
  },
  transfers: {
    sender: 0.3,
    receiver: 0.2,
  },
  swaps: {
    ls: 0.3,
    lp: 0.2,
  },
  link: 0.5,
};

const PointsRecord =
  mode === "production"
    ? baseConnection.model("PointsRecord", PointsSchema)
    : baseConnection.model("PointsRecordTest", PointsSchema);

export { PointsRecord, pointsDistribution };
