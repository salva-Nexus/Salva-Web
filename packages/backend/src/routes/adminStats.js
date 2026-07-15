// packages/backend/src/routes/adminStats.js
const express = require('express');
const router = express.Router();

const User = require('../models/User');
const StatsSnapshot = require('../models/StatsSnapshot');
const { recordSnapshot } = require('../services/statsRecorder');

// Validator gate — every route here requires ?safeAddress= of a validator.
async function requireValidator(req, res, next) {
  try {
    const safeAddress = (req.query.safeAddress || '').toLowerCase();
    if (!safeAddress) return res.status(400).json({ message: 'safeAddress required' });
    const user = await User.findOne({ safeAddress });
    if (!user || !user.isValidator) {
      return res.status(403).json({ message: 'Validator access only' });
    }
    next();
  } catch (err) {
    res.status(500).json({ message: 'Access check failed' });
  }
}

const RANGE_MS = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

// ── GET /api/admin-stats?safeAddress=0x..&range=30d ───────────────────────────
router.get('/', requireValidator, async (req, res) => {
  try {
    const range = req.query.range || '30d';
    const windowMs = RANGE_MS[range];

    const query = windowMs ? { recordedAt: { $gte: new Date(Date.now() - windowMs) } } : {};

    const snapshots = await StatsSnapshot.find(query).sort({ recordedAt: 1 }).limit(2000).lean();

    res.json({ snapshots });
  } catch (err) {
    console.error('❌ /api/admin-stats:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/admin-stats/refresh?safeAddress=0x.. ─────────────────────────────
// Manual on-demand snapshot — lets a validator force a fresh data point
// instead of waiting for the next scheduled interval.
router.post('/refresh', requireValidator, async (req, res) => {
  try {
    const snapshot = await recordSnapshot();
    res.json({ success: true, snapshot });
  } catch (err) {
    console.error('❌ /api/admin-stats/refresh:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
