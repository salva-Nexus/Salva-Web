import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Anchored to this file's real disk location — works correctly no matter
// which directory `node` is actually run from.
dotenv.config({ path: path.join(__dirname, "../.env") });

const MONGO_URI_BASE = process.env.MONGO_URI_BASE;
const MONGO_URI_BNB = process.env.MONGO_URI_BNB;

const baseConnection = mongoose.createConnection(MONGO_URI_BASE);
const bnbConnection = mongoose.createConnection(MONGO_URI_BNB);

// BASE
baseConnection.on("connected", () =>
  console.log("✅ BASE CHAIN DATABASE LIVE"),
);
baseConnection.on("disconnected", () =>
  console.warn("⚠️ BASE database disconnected — investigate"),
);
baseConnection.on("error", (err) =>
  console.error("❌ BASE database error:", err.message),
);

// BNB
bnbConnection.on("connected", () => console.log("✅ BNB CHAIN DATABASE LIVE"));
bnbConnection.on("disconnected", () =>
  console.warn("⚠️ BNB database disconnected — investigate"),
);
bnbConnection.on("error", (err) =>
  console.error("❌ BNB database error:", err.message),
);

export { baseConnection, bnbConnection };
