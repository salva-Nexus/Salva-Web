const mongoose = require("mongoose");

const OtcConfigSchema = new mongoose.Schema({
  _id: { type: String, default: "main" },
  minNgn: { type: Number, default: 10000 },
  maxNgn: { type: Number, default: 200000 },
  feePercent: { type: Number, default: 0.2 }, // 0.2%
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("OtcConfig", OtcConfigSchema);