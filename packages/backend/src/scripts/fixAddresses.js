// Salva-Digital-Tech/packages/backend/src/scripts/fixAddresses.js
require('dotenv').config({
  path: require('path').resolve(__dirname, '../../.env'),
});
const mongoose = require('mongoose');
const User = require('../models/User');

async function fixAddresses() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('🍃 MongoDB Connected');

    const users = await User.find({});
    console.log(`📊 Found ${users.length} users to fix`);

    for (const user of users) {
      const originalAddress = user.safeAddress;
      const lowercaseAddress = originalAddress.toLowerCase();

      if (originalAddress !== lowercaseAddress) {
        user.safeAddress = lowercaseAddress;
        await user.save();
        console.log(`✅ Fixed: ${originalAddress} → ${lowercaseAddress} (${user.email})`);
      } else {
        console.log(`⏭️  Skipped: ${user.email} (already lowercase)`);
      }
    }

    console.log('✅ All addresses fixed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } //
}

fixAddresses();
