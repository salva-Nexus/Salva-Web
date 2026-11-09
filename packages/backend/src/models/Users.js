import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';
import { createHash } from 'node:crypto';

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  password: { type: String, required: true },
  safeAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
    set: (v) => v.toLowerCase(),
  },
  ownerPrivateKey: { type: String, required: true },
  transactionPin: { type: String, default: null },
  accountLockedUntil: { type: Date, default: null },
  pinSetupCompleted: { type: Boolean, default: false },
  isValidator: { type: Boolean, default: false },
  namespaces: {
    type: [
      {
        namespace: { type: String, required: true },
      },
    ],
    default: [],
  },
  nameAliases: {
    type: [
      {
        name: { type: String, required: true },
        wallet: { type: String, required: true },
      },
    ],
    default: [],
  },
  tokenConfig: {
    type: [
      {
        chain: { type: String, default: null, lowercase: true },
        tokenAddress: { type: String, default: null },
        tokenSymbol: { type: String, default: null },
        tokenDecimals: { type: Number, default: 0 },
        logo: { type: String, default: null },
        priceFeedAddress: { type: String, default: null, lowercase: true },
        isActive: { type: Boolean, default: true },
      },
    ],
    default: [],
  },

  // --- SANT community mining (Base chain activity only) ---
  santPoints: { type: Number, default: 0, min: 0 },
  santClaimInProgress: { type: Boolean, default: false },

  referralCode: { type: String, unique: true, index: true, sparse: true },
  referredBy: { type: String, default: null, index: true },
  isNewUser: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now, index: true },

  // Added proper type and default for push subscription storage
  pushSubscription: { type: Object, default: null },
  seenPushNotification: { type: Boolean, default: false },
});

const buildHash = (object) => {
  const hash = createHash('sha256');
  hash.write(object);
  hash.end();
  return hash.read().toString('hex');
};

const User = baseConnection.model('User', UserSchema);

export { User, buildHash };
