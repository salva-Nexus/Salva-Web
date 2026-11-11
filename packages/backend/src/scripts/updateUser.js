import { User } from '../models/Users.js';
import { baseConnection } from '../DB_connection.js';

// const targetEmail = 'mansmall769@gmail.com';

// const newConfigs = [
//   {
//     chain: 'bnb',
//     tokenAddress: '0x0000000000000000000000000000000000000000',
//     rpcUrl: null,
//     chainlinkFeedAddress: null,
//   },
//   {
//     chain: 'bnb',
//     tokenAddress: '0x95ef0B638899ad4ADCb86D9491D8A3fFf97161C2',
//     rpcUrl: null,
//     chainlinkFeedAddress: null,
//   },
// ];

// async function updateTokens() {
//   try {
//     // Wait for DB connection
//     if (baseConnection.readyState !== 1) {
//       await new Promise((resolve) => baseConnection.once('open', resolve));
//     }

//     // Push new configurations while avoiding duplicate tokens
//     for (const config of newConfigs) {
//       await User.updateOne(
//         {
//           email: targetEmail.toLowerCase(),
//         },
//         {
//           $push: { tokenConfig: config },
//         }
//       );
//     }

//     console.log(`✅ Successfully updated tokenConfig for ${targetEmail}`);
//   } catch (error) {
//     console.error('❌ Error updating user token config:', error);
//   } finally {
//     await baseConnection.close();
//     process.exit(0);
//   }
// }

// updateTokens();

async function update() {
  const users = await User.find({
    isNewUser: false,
  });

  for (const user of users) {
    user.pinSetupCompleted = false;
    await user.save();
  }

  process.exit(0);
}

update();