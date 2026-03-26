// Salva-Digital-Tech/packages/backend/src/models/WalletRegistry.js
const mongoose = require("mongoose");

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  nspace: { type: String, default: "" }, // e.g. "@coinbase"
  registryAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
  },
  description: { type: String, default: "" },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("WalletRegistry", WalletRegistrySchema);
