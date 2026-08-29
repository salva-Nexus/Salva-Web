import { User, UserBNB, buildHash } from "../models/Users.js";
import {
  encryptPrivateKey,
  decryptPrivateKey,
  hashPin,
  verifyPin,
} from "../utils/encryption.js";

const salva_secret = process.env.ENCRYPTION_KEY;

async function setPin(email, pin) {
  const baseUser = await User.findOne({ email: email });

  if (!baseUser) {
    return {
      status: false,
      errorMsg: "User not found",
    };
  }

  if (baseUser.transactionPin) {
    return {
      status: false,
      errorMsg: "PIN already set. Use reset-pin instead.",
    };
  }

  const mixed = mix(pin);
  const hashedPin = hashPin(mixed);
  const encryptedKey = encryptPrivateKey(baseUser.ownerPrivateKey, mixed);

  await baseUser.updateOne({
    ownerPrivateKey: encryptedKey,
    transactionPin: hashedPin,
    pinSetupCompleted: true,
  });

  console.log(
    `✅ PIN set for Base User: ${baseUser.email || baseUser.username}`,
  );

  // BNB
  const bnbUser = await UserBNB.findOne({ email: email });

  if (bnbUser) {
    if (bnbUser.transactionPin) {
      return {
        status: false,
        errorMsg: "PIN already set. Use reset-pin instead.",
      };
    }

    await bnbUser.updateOne({
      ownerPrivateKey: encryptedKey,
      transactionPin: hashedPin,
      pinSetupCompleted: true,
    });

    console.log(
      `✅ PIN set for BNB User: ${bnbUser.email || bnbUser.username}`,
    );
  }
  return {
    status: true,
  };
}

async function verify_Pin(email, pin) {
  let user = await User.findOne({ email: email });

  if (!user) {
    user = await User.findOne({ username: email });
  }

  if (!user) {
    return {
      status: false,
      errorMsg: "User not found",
    };
  }

  if (!user.transactionPin) {
    return {
      status: false,
      errorMsg: "No PIN set. Please set PIN first.",
    };
  }

  const newUser = user.isNewUser === true;
  const isValid = newUser
    ? verifyPin(mix(pin), user.transactionPin)
    : verifyPin(pin, user.transactionPin);

  if (!isValid) {
    // Constant-time delay to prevent timing oracle on PIN length/validity
    await new Promise((r) =>
      setTimeout(r, 200 + Math.floor(Math.random() * 100)),
    );
    return { status: false, errorMsg: "Invalid PIN" };
  }

  if (
    user.accountLockedUntil &&
    new Date(user.accountLockedUntil) > new Date()
  ) {
    const hoursLeft = Math.ceil(
      (new Date(user.accountLockedUntil) - new Date()) / (1000 * 60 * 60),
    );
    return {
      status: false,
      errorMsg: `Account locked for ${hoursLeft} more hours due to recent security changes.`,
    };
  }

  let decryptedKey;
  try {
    decryptedKey = decryptPrivateKey(user.ownerPrivateKey, newUser ? mix(pin) : pin);
  } catch (err) {
    return {
      status: false,
      errorMsg: err.message,
    };
  }

  return {
    status: true,
    privateKey: decryptedKey,
  };
}

function mix(pin) {
  return buildHash(`${salva_secret}${pin}`);
}

export { setPin, verify_Pin, mix };
