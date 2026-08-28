import { User, UserBNB, buildHash } from "../models/Users.js";
import { setPin, verify_Pin } from "./pinService.js";
import bcrypt from "bcryptjs";
import {
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
} from "./emailService.js";
import validator from "validator";

function validatePin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits");
  }
  return true;
}

function sanitizeData(data, isEmail) {
  if (typeof data !== "string") {
    throw new Error("Invalid data format");
  }
  const sanitized = data.trim().toLowerCase();
  if (isEmail) {
    if (!validator.isEmail(sanitized)) {
      throw new Error("Invalid email format");
    }
  }
  return sanitized;
}

async function updateUsername(email, newUsername) {
  const userBase = await User.findOne({
    email: email.toLowerCase(),
  });
  const userBnb = await UserBNB.findOne({
    email: email.toLowerCase(),
  });

  // check existing
  const existingUserBase = await User.findOne({
    username: newUsername.toLowerCase(),
  });
  const existingUserBnb = await UserBNB.findOne({
    username: newUsername.toLowerCase(),
  });

  if (existingUserBase || existingUserBnb) {
    throw Error("❌ User with new username exists!!!");
  }

  // update
  userBase.username = newUsername.toLowerCase();
  await userBase.save();

  userBnb.username = newUsername.toLowerCase();
  await userBnb.save();

  return true;
}

async function updateEmail(email, newEmail) {
  const sanitized = sanitizeData(newEmail, true);
  const userBase = await User.findOne({
    email: email.toLowerCase(),
  });
  const userBnb = await UserBNB.findOne({
    email: email.toLowerCase(),
  });

  // check existing
  const existingUserBase = await User.findOne({
    email: newEmail.toLowerCase(),
  });
  const existingUserBnb = await UserBNB.findOne({
    email: newEmail.toLowerCase(),
  });

  if (existingUserBase || existingUserBnb) {
    throw Error("❌ User with new email exists!!!");
  }

  // update
  userBase.email = sanitized;
  await userBase.save();

  userBnb.email = sanitized;
  await userBnb.save();

  // lock and notify
  await sendSecurityChangeEmail(
    email,
    userBase.username || userBnb.username,
    "email",
  );
  await sendEmailChangeConfirmation(
    sanitized,
    userBase.username || userBnb.username,
  );

  userBase.accountLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await userBase.save();

  return true;
}

async function updatePassword(email, newPassword) {
  const userBase = await User.findOne({
    email: email.toLowerCase(),
  });

  const hashPassword = await bcrypt.hash(newPassword, 10);

  // update
  userBase.password = hashPassword;
  await userBase.save();

  // lock and notify
  await sendSecurityChangeEmail(email, userBase.username, "password");

  userBase.accountLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await userBase.save();

  return true;
}

async function updatePin(email, oldPin, newPin) {
  validatePin(newPin);
  const userBase = await User.findOne({
    email: email.toLowerCase(),
  });
  const userBnb = await UserBNB.findOne({
    email: email.toLowerCase(),
  });

  // verify
    const oldHash = userBase.ownerPrivateKey || userBnb.ownerPrivateKey;
    const oldPinHash = userBase.transactionPin || userBnb.transactionPin;
  const data = await verify_Pin(email, oldPin);
  if (!data.status) {
    throw Error("❌ Invalid Old Pin!!!");
  }
  const pKey = data.privateKey;

  try {
    userBase.ownerPrivateKey = pKey;
    userBase.transactionPin = null;
    await userBase.save();

    userBnb.ownerPrivateKey = pKey;
    userBnb.transactionPin = null;

    await userBnb.save();
    // set
    await setPin(email, newPin);
  } catch (err) {
    userBase.ownerPrivateKey = oldHash;
    userBase.transactionPin = oldPinHash;

    await userBase.save();

    userBnb.ownerPrivateKey = oldHash;
    userBnb.transactionPin = oldPinHash;

    await userBnb.save();
    throw Error(err.message);
  }

  // lock and notify
  await sendSecurityChangeEmail(
    email,
    userBase.username || userBnb.username,
    "pin",
  );

  userBase.accountLockedUntil = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await userBase.save();

  return true;
}

export { updateUsername, updateEmail, updatePin, updatePassword };
