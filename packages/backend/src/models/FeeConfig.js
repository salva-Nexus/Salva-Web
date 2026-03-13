// Salva-Digital-Tech/packages/backend/src/models/FeeConfig.js
const mongoose = require('mongoose');

// One document, _id = 'main'. Edit directly in MongoDB Atlas if you need to change fees.
const FeeConfigSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' },
  // Amounts in NGNs (human-readable, 6 decimal token)
  tier1Min: { type: Number, default: 10000 },   // 10,000 NGNs
  tier1Max: { type: Number, default: 99999 },   // 99,999 NGNs
  tier1Fee: { type: Number, default: 10 },      // 10 NGNs flat fee
  tier2Min: { type: Number, default: 100000 },  // 100,000 NGNs
  tier2Fee: { type: Number, default: 20 },      // 20 NGNs flat fee
});

module.exports = mongoose.model('FeeConfig', FeeConfigSchema);