// packages/backend/cleanupMiningState.js
// ─────────────────────────────────────────────────────────────────────────────
// One-time cleanup script for the MiningState network-split fix.
//
// Before this fix, MiningState used a single shared _id ('GLOBAL_MINING_STATE')
// with no network tag — meaning dev/testnet activity and real production
// activity were both incrementing the SAME totalPointsIssued counter, since
// MONGO_URI is the same connection string for both environments.
//
// This script:
//   1. Inspects the old contaminated 'GLOBAL_MINING_STATE' document (if any)
//      and prints it so you can decide what to do with it.
//   2. Does NOT delete or modify anything automatically — deletion requires
//      an explicit --delete flag, since this number affects real SANT
//      minting math and should never be removed blindly.
//
// Run from packages/backend:
//   node cleanupMiningState.js            → inspect only (safe, read-only)
//   node cleanupMiningState.js --delete   → inspect AND delete the old doc
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('❌ MONGO_URI not found in .env');
    process.exit(1);
  }

  const shouldDelete = process.argv.includes('--delete');

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(uri);
  console.log('✅ Connected');

  const db = mongoose.connection.db;
  const collection = db.collection('miningstates');

  const oldState = await collection.findOne({ _id: 'GLOBAL_MINING_STATE' });

  if (!oldState) {
    console.log('✅ No contaminated legacy MiningState document found. Nothing to do.');
  } else {
    console.log('📊 Found legacy contaminated MiningState document:');
    console.log(JSON.stringify(oldState, null, 2));
    console.log('');
    console.log(
      `   totalPointsIssued: ${oldState.totalPointsIssued} (mixes testnet + mainnet activity)`
    );
    console.log(`   isLocked: ${oldState.isLocked}`);

    if (shouldDelete) {
      await collection.deleteOne({ _id: 'GLOBAL_MINING_STATE' });
      console.log('🗑️  Deleted legacy GLOBAL_MINING_STATE document.');
      console.log(
        '   Production will now start a fresh GLOBAL_MINING_STATE_MAINNET at totalPointsIssued=0'
      );
    } else {
      console.log('');
      console.log('ℹ️  Not deleted (read-only run). Re-run with --delete to remove this document,');
      console.log('   or manually seed GLOBAL_MINING_STATE_MAINNET with a corrected value if this');
      console.log('   number contains real production activity you need to preserve.');
    }
  }

  // Show current state of the new network-scoped documents, if they exist yet.
  const mainnetState = await collection.findOne({ _id: 'GLOBAL_MINING_STATE_MAINNET' });
  const testnetState = await collection.findOne({ _id: 'GLOBAL_MINING_STATE_TESTNET' });
  console.log('');
  console.log('📊 Current network-scoped states:');
  console.log('   GLOBAL_MINING_STATE_MAINNET:', mainnetState || '(not created yet)');
  console.log('   GLOBAL_MINING_STATE_TESTNET:', testnetState || '(not created yet)');

  await mongoose.disconnect();
  console.log('');
  console.log('✅ Done');
  process.exit(0);
}

run().catch((err) => {
  console.error('❌ Cleanup failed:', err.message);
  process.exit(1);
});
