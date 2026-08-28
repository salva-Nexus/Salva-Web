import mongoose from "mongoose";
import { baseConnection, bnbConnection } from "../DB_connection.js";

const PoolSchema = new mongoose.Schema({
  poolAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },
  ownerSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  poolName: { type: String, default: null },
  registryAddress: { type: String, default: null },
});

const TrustedPoolSchema = new mongoose.Schema({
  userSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  poolAddress: { type: String, required: true, lowercase: true },
  tokenAddress: { type: String, required: true, lowercase: true },
  txHash: { type: String, default: null },
  trustedAt: { type: Date, default: Date.now },
});

const basePool = baseConnection.model("BasePools", PoolSchema);
const bnbPool = bnbConnection.model("BnbPools", PoolSchema);

const trustedBasePool = baseConnection.model(
  "TrustedBasePools",
  TrustedPoolSchema,
);
const trustedBnbPool = bnbConnection.model(
  "TrustedBnbPools",
  TrustedPoolSchema,
);

export { basePool, bnbPool, trustedBasePool, trustedBnbPool };
