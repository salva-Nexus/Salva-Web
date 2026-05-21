// src/services/l1db.js
// L1-specific MongoDB connection — uses the "salva-l1" database
// Separate from the main L2 connection so L1 and L2 pool data never mix.
require("dotenv").config({
  path: require("path").resolve(__dirname, "../../.env"),
});
const mongoose = require("mongoose");

const l1DB = mongoose.createConnection(
  process.env.MONGO_URI_L1 || process.env.MONGO_URI,
  {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    bufferCommands: false,
    maxPoolSize: 3,
  }
);

l1DB.on("connected", () => console.log("🔵 L1 MongoDB connected (salva-l1 DB)"));
l1DB.on("error",     (e) => console.error("❌ L1 MongoDB error:", e.message));
l1DB.on("disconnected", () => console.warn("⚠️ L1 MongoDB disconnected"));

module.exports = l1DB;
