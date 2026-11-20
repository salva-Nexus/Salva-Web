// migrateUserTokenConfigBnbToBsc.js
import { User } from '../models/Users.js';
import { baseConnection } from '../DB_connection.js';

const countBnbEntries = async () => {
  const users = await User.find({ 'tokenConfig.chain': 'bnb' }).select('tokenConfig.chain').lean();

  let entries = 0;
  for (const u of users) {
    entries += (u.tokenConfig || []).filter((t) => t.chain === 'bnb').length;
  }

  return { users: users.length, entries };
};

async function migrateTokenConfigChain() {
  console.log("🚀 Starting User tokenConfig migration: chain 'bnb' -> 'bsc'");

  try {
    const before = await countBnbEntries();
    console.log(`🔎 Found ${before.entries} tokenConfig entr(ies) across ${before.users} user(s)`);

    if (before.entries === 0) {
      console.log('ℹ️ Nothing to migrate.');
      return;
    }

    const result = await User.updateMany(
      { 'tokenConfig.chain': 'bnb' },
      { $set: { 'tokenConfig.$[entry].chain': 'bsc' } },
      { arrayFilters: [{ 'entry.chain': 'bnb' }] }
    );

    console.log(
      `✅ Users matched: ${result.matchedCount}, Users modified: ${result.modifiedCount}`
    );

    const after = await countBnbEntries();
    console.log(`🔁 Remaining 'bnb' entries: ${after.entries} across ${after.users} user(s)`);
  } catch (err) {
    console.error(`❌ Migration failed: ${err.message}`);
    process.exitCode = 1;
  } finally {
    await baseConnection.close();
    process.exit();
  }
}

migrateTokenConfigChain();
