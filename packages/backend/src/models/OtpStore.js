import mongoose from "mongoose";
import { baseConnection, bnbConnection } from "../DB_connection.js";

const OtpStoreSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },
  code: { type: String, required: true },
  expires: { type: Date, required: true },
  verified: { type: Boolean, default: false },
});

// MongoDB TTL index — auto-deletes expired OTPs
OtpStoreSchema.index({ expires: 1 }, { expireAfterSeconds: 0 });

const OtpStore = baseConnection.model("OtpStore", OtpStoreSchema);
export default OtpStore; 
