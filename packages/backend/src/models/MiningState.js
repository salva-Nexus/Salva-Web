// packages/backend/src/models/MiningState.js
const mongoose = require('mongoose');

// _id is now network-specific — 'GLOBAL_MINING_STATE_MAINNET' or
// 'GLOBAL_MINING_STATE_TESTNET' — instead of one shared singleton.
// Necessary because MONGO_URI is the same connection string for both dev
// and production; without this split, testnet activity while
// building/testing would silently count toward the real 500M mainnet cap.
const MiningStateSchema = new mongoose.Schema({
  _id: { type: String },
  totalPointsIssued: { type: Number, default: 0, min: 0 },
  isLocked: { type: Boolean, default: false },
  adminAlertSent: { type: Boolean, default: false },
  updatedAt: { type: Date, default: Date.now },
});

const TIERS = [
  { ceiling: 100_000_000, reward: 10 },
  { ceiling: 200_000_000, reward: 7 },
  { ceiling: 300_000_000, reward: 5 },
  { ceiling: 400_000_000, reward: 3 },
  { ceiling: 500_000_000, reward: 2 },
];
const HARD_CAP = 500_000_000;

MiningStateSchema.statics.HARD_CAP = HARD_CAP;

function _currentStateId() {
  const isProd = process.env.NODE_ENV === 'production';
  return isProd ? 'GLOBAL_MINING_STATE_MAINNET' : 'GLOBAL_MINING_STATE_TESTNET';
}

MiningStateSchema.statics.getOrCreate = async function () {
  const stateId = _currentStateId();
  let state = await this.findById(stateId);
  if (!state) state = await this.create({ _id: stateId });
  return state;
};

MiningStateSchema.statics.getCurrentStateId = _currentStateId;

// Reward per party BEFORE this award is added to the running total.
MiningStateSchema.statics.getTierReward = function (totalSoFar) {
  if (totalSoFar >= HARD_CAP) return 0;
  const tier = TIERS.find((t) => totalSoFar < t.ceiling);
  return tier ? tier.reward : 0;
};

module.exports = mongoose.model('MiningState', MiningStateSchema);
