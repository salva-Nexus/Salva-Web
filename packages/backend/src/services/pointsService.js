// packages/backend/src/services/pointsService.js
const MiningState = require('../models/MiningState');
const User = require('../models/User');

const CHAIN = Object.freeze({ BASE: 'base', BNB: 'bnb' });
const REGISTRATION_BONUS = 5;

/**
 * Lazily resolves the UserBNB model off the l1db connection —
 * mirrors the exact pattern used throughout index.js/bnb.js.
 */
function getUserBNBModel() {
  const l1db = require('./l1db');
  const UserBNBSchema = require('../models/UserBNB');
  return l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
}

function getModelForChain(chain) {
  if (chain === CHAIN.BASE) return User;
  if (chain === CHAIN.BNB) return getUserBNBModel();
  throw new Error(`Unknown chain: ${chain}`);
}

async function sendCapReachedAlert() {
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Salva <no-reply@salva-nexus.org>',
        to: process.env.ADMIN_ALERT_EMAIL || process.env.EMAIL_USER,
        subject: '🚨 SANT Community Mining Cap Reached (500,000,000)',
        html: `<div style="background:#0A0A0B;color:white;padding:40px;font-family:sans-serif;border-radius:20px;">
          <h1 style="color:#D4AF37;">SALVA</h1>
          <p>The SANT community mining pool has reached its 500,000,000 point cap.</p>
          <p>No further points will be issued for network activity.</p>
        </div>`,
      }),
    });
  } catch (err) {
    console.error('⚠️ sendCapReachedAlert failed:', err.message);
  }
}

/**
 * Checks whether an address is a registered Salva wallet on the given chain.
 * Used to gate the receiver side of a Transfer.
 */
async function isRegisteredSalvaWallet(chain, address) {
  if (!address) return false;
  const Model = getModelForChain(chain);
  const exists = await Model.exists({ safeAddress: address.toLowerCase() });
  return !!exists;
}

/**
 * Core award function — call ONLY after on-chain confirmation.
 * partyB = null when there is no second recipient (DeployPool),
 * or when the recipient is not a registered Salva wallet (Transfer).
 */
async function awardActivityPoints(chain, partyAAddress, partyBAddress) {
  const miningState = await MiningState.getOrCreate();
  if (miningState.isLocked) return { awarded: 0, locked: true };

  const reward = MiningState.getTierReward(miningState.totalPointsIssued);
  if (reward === 0) return { awarded: 0, locked: true };

  // Dedup by address (case-insensitive) before counting parties. This
  // covers two real scenarios:
  //   - Transfer: sender sends to their own wallet (partyA === partyB)
  //   - Swap: the swapper is also the pool owner/deployer they're swapping
  //     against (self-swap)
  // In both cases it's ONE person performing ONE action — they should only
  // ever receive the single-party reward, not double-counted as two parties.
  const seen = new Set();
  const parties = [partyAAddress, partyBAddress].filter(Boolean).filter((addr) => {
    const key = addr.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const pointsToIssue = reward * parties.length;
  const Model = getModelForChain(chain);

  await Promise.all(
    parties.map((addr) =>
      Model.updateOne({ safeAddress: addr.toLowerCase() }, { $inc: { santPoints: reward } })
    )
  );

  const stateId = MiningState.getCurrentStateId();
  const updatedState = await MiningState.findByIdAndUpdate(
    stateId,
    { $inc: { totalPointsIssued: pointsToIssue }, $set: { updatedAt: new Date() } },
    { new: true }
  );

  if (updatedState.totalPointsIssued >= MiningState.HARD_CAP && !updatedState.isLocked) {
    const lockResult = await MiningState.findOneAndUpdate(
      { _id: stateId, isLocked: false },
      { $set: { isLocked: true, adminAlertSent: true } },
      { new: true }
    );
    if (lockResult) await sendCapReachedAlert();
  }

  return { awarded: reward, locked: false };
}

/**
 * Registration bonus — Base points ONLY, flat 5 points, does NOT touch
 * MiningState.totalPointsIssued (registration bonuses sit outside the
 * tiered activity-mining pool). Runs even after the 500M cap locks,
 * since it's a fixed welcome bonus, not tiered mining reward.
 *
 * @param {string} newUserId - Mongo _id of the freshly created Base User
 * @param {string|null} referralCodeUsed
 */
async function awardRegistrationPoints(newUserId, referralCodeUsed) {
  await User.updateOne({ _id: newUserId }, { $inc: { santPoints: REGISTRATION_BONUS } });

  if (!referralCodeUsed) return { referrerAwarded: false };

  const referrer = await User.findOneAndUpdate(
    { referralCode: referralCodeUsed },
    { $inc: { santPoints: REGISTRATION_BONUS } },
    { new: true }
  );

  return { referrerAwarded: !!referrer };
}

/**
 * Determines whether the SANT claim button should be visible for a user.
 *
 * Rules:
 *   - totalPoints > 0                              → visible, active
 *   - totalPoints === 0 AND global NOT locked       → visible, blurred/disabled
 *   - totalPoints === 0 AND global IS locked        → hidden entirely
 *
 * @param {number} basePoints
 * @param {number} bnbPoints
 * @returns {Promise<{visible: boolean, active: boolean, totalPoints: number}>}
 */
async function getClaimVisibility(basePoints, bnbPoints) {
  const totalPoints = (basePoints || 0) + (bnbPoints || 0);
  if (totalPoints > 0) return { visible: true, active: true, totalPoints };

  const miningState = await MiningState.getOrCreate();
  if (miningState.isLocked) return { visible: false, active: false, totalPoints: 0 };

  return { visible: true, active: false, totalPoints: 0 };
}

module.exports = {
  CHAIN,
  REGISTRATION_BONUS,
  awardActivityPoints,
  awardRegistrationPoints,
  isRegisteredSalvaWallet,
  getClaimVisibility,
};
