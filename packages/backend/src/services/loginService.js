import { User } from '../models/Users.js';
import bcrypt from 'bcryptjs';
import { getSafeWallet } from './deployment.js';
import { updatePassword } from './userDataServices.js';
import { setPin } from './pinService.js';

async function login(email, password) {
  const user = await User.findOne({ email });
  if (!user) {
    throw Error('User not found ❌');
  }

    const pw = password.trim();
    const legacyOk =
      (await bcrypt.compare(pw, user.password)) ||
      (await bcrypt.compare(pw.toLowerCase(), user.password));
  if (!legacyOk) throw Error('Invalid credentials ❌');
  
  if (!user.isNewUser) {
    return {
      status: true,
      data: 'Is Existing user',
    };
  }
  const isMatch = await bcrypt.compare(password.trim().toLowerCase(), user.password);
  console.log('isMatch: ', isMatch);
  if (!isMatch) {
    throw Error('Invalid credentials ❌');
  }

  return {
    status: true,
    data: {
      username: user.username,
      email: email,
      safeAddress: user.safeAddress,
      isValidator: user.isValidator,
    },
  };
}

async function updateUser(email, password, pin) {
  const user = await User.findOne({ email });
  if (!user) {
    throw Error('User not found ❌');
  }

  if (user.isNewUser) {
    return {
      status: false,
    };
  }

  const res = await getSafeWallet('base');
  await user.updateOne({
    ownerPrivateKey: res.data.pkey,
    safeAddress: res.data.safe,
  });
  user.transactionPin = null;
  await user.save();
  await updatePassword(email, password);
  await setPin(email, pin);

  return {
    status: true,
    data: {
      username: user.username,
      email: email,
      safeAddress: res.data.safe,
      isValidator: user.isValidator,
    },
  };
}

export {login, updateUser} ;
