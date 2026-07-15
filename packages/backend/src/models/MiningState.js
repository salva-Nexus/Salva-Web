// packages/backend/src/models/MiningState.js
const mongoose = require('mongoose');

const MiningStateSchema = new mongoose.Schema({
  _id: { type: String, default: 'GLOBAL_MINING_STATE' },
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

MiningStateSchema.statics.getOrCreate = async function () {
  let state = await this.findById('GLOBAL_MINING_STATE');
  if (!state) state = await this.create({ _id: 'GLOBAL_MINING_STATE' });
  return state;
};

// Reward per party BEFORE this award is added to the running total.
MiningStateSchema.statics.getTierReward = function (totalSoFar) {
  if (totalSoFar >= HARD_CAP) return 0;
  const tier = TIERS.find((t) => totalSoFar < t.ceiling);
  return tier ? tier.reward : 0;
};

module.exports = mongoose.model('MiningState', MiningStateSchema);
