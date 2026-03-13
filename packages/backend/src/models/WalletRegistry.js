// Salva-Digital-Tech/packages/backend/src/models/WalletRegistry.js
const mongoose = require('mongoose');

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },               // e.g. "Salva Wallet"
  registryAddress: { type: String, required: true, lowercase: true, unique: true }, // deployed SalvaRegistry contract address
  description: { type: String, default: '' },            // optional short description
  active: { type: Boolean, default: true },              // can be toggled off without deleting
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WalletRegistry', WalletRegistrySchema);