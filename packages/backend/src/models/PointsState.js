import mongoose from "mongoose";
import { baseConnection } from "../DB_connection.js";
import { mode } from "../utils/vars.js";


const PointsSchema = new mongoose.Schema({
  totalPointsIssued: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now },
  hardCap: { type: Number, default: 500_000_000, immutable: true },
  network: {
    type: String,
    default: mode === "production" ? "MAINNET" : "TESTNET",
    immutable: true,
  },
});

const canMint = (p) => p >= 1_000_000;

const pointsDistribution = {
  registration: {
    referrer: 1,
  },
  transfers: {
    sender: 3,
    receiver: 2,
  },
  swaps: {
    ls: 2,
    lp: 3,
  },
  link: 1,
};

const PointsRecord =
  mode === "production"
    ? baseConnection.model("PointsRecord", PointsSchema)
    : baseConnection.model("PointsRecordTest", PointsSchema);

export { PointsRecord, pointsDistribution, canMint };
