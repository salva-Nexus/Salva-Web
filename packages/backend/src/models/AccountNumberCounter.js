// Salva-Digital-Tech/packages/backend/src/models/AccountNumberCounter.js
const mongoose = require('mongoose');

const AccountNumberCounterSchema = new mongoose.Schema({
  _id: { type: String, default: 'main' }, // Only one document ever exists
  lastAssigned: { type: String, required: true, default: '1122746244' } // Start BELOW 1122746245 so first assigned = 1122746245
});

module.exports = mongoose.model('AccountNumberCounter', AccountNumberCounterSchema);

// This MODEL is not useless, since v2.0.4 doesn't use number alias anymore