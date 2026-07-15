// packages/backend/src/models/StatsSnapshot.js
const mongoose = require('mongoose');

const StatsSnapshotSchema = new mongoose.Schema({
  recordedAt: { type: Date, default: Date.now, index: true },

  // Tags which environment recorded this snapshot. Necessary because
  // MONGO_URI is the same connection string for both dev and production —
  // there is only ONE StatsSnapshot collection, shared by testnet (dev)
  // and mainnet (prod) runs. Without this tag, the admin page can't tell
  // a testnet data point from a mainnet one, and would silently mix them.
  network: {
    type: String,
    enum: ['mainnet', 'testnet'],
    required: true,
    index: true,
  },

  userCount: { type: Number, default: 0 },

  // NGN token totalSupply() on Base + BNB combined into one number.
  // NGNS ONLY — cNGN is explicitly excluded per spec.
  ngnCirculating: { type: Number, default: 0 },

  // Treasury balance, currency-specific NOT chain-specific:
  //   treasuryNGN = (NGNs + cNGN) balance, Base + BNB combined
  //   treasuryUSD = (USDT + USDC) balance, Base + BNB combined
  treasuryNGN: { type: Number, default: 0 },
  treasuryUSD: { type: Number, default: 0 },

  // Cumulative confirmed transaction count.
  transactionVolume: { type: Number, default: 0 },
});

StatsSnapshotSchema.index({ network: 1, recordedAt: -1 });

module.exports = mongoose.model('StatsSnapshot', StatsSnapshotSchema);
