// packages/backend/src/models/StatsSnapshot.js
const mongoose = require('mongoose');

const StatsSnapshotSchema = new mongoose.Schema({
  recordedAt: { type: Date, default: Date.now, index: true },
  userCount: { type: Number, default: 0 },
  ngnCirculating: {
    base: { type: Number, default: 0 },
    bnb: { type: Number, default: 0 },
    combined: { type: Number, default: 0 },
  },
  transactionVolume: {
    base: { type: Number, default: 0 },
    bnb: { type: Number, default: 0 },
    combined: { type: Number, default: 0 },
  },
  treasuryFees: {
    ngn: {
      base: { type: Number, default: 0 },
      bnb: { type: Number, default: 0 },
      combined: { type: Number, default: 0 },
    },
    usd: {
      base: { type: Number, default: 0 },
      bnb: { type: Number, default: 0 },
      combined: { type: Number, default: 0 },
    },
  },
});

StatsSnapshotSchema.index({ recordedAt: -1 });

module.exports = mongoose.model('StatsSnapshot', StatsSnapshotSchema);
