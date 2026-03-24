// Salva-Digital-Tech/packages/backend/src/models/WalletRegistry.js
const mongoose = require('mongoose');

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },                           // e.g. "Salva Wallet"
  registryAddress: { type: String, required: true, lowercase: true, unique: true }, // deployed SalvaRegistry address
  namespace: { type: String, default: '@salva' },                   // e.g. "@salva", "@coinbase" — used for name welding in send flow
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WalletRegistry', WalletRegistrySchema);