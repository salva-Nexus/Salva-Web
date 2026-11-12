import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const CdpPositionManagerSchema = new mongoose.Schema({
  version: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true,
  },
  contractAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },
  whitelistedTokens: [
    {
      symbol: { type: String, required: true, trim: true },
      tokenAddress: { type: String, required: true, lowercase: true },
      priceFeed: { type: String, required: true, lowercase: true },
      logo: { type: String },
    },
  ],
  chain: {
    type: String,
    required: true,
    trim: true,
  },
  type: {
    type: String,
    uppercase: true,
    default: 'TESTNET',
  },
});

const CdpPositionManager = baseConnection.model('CdpPositionManagers', CdpPositionManagerSchema);

const UserCdpPositionSchema = new mongoose.Schema(
  {
    userSafeAddress: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },
    version: {
      type: String,
      required: true,
      trim: true,
    },
    positionManagerAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    collateralSymbol: {
      type: String,
      required: true,
      trim: true,
    },
    collateralAddress: {
      type: String,
      required: true,
      lowercase: true,
    },
    chain: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      uppercase: true,
      default: 'TESTNET',
    },
  },
  { timestamps: true }
);

// Compound index to ensure a Safe only registers a specific collateral once per position manager version
UserCdpPositionSchema.index(
  { userSafeAddress: 1, positionManagerAddress: 1, collateralAddress: 1 },
  { unique: true }
);

const UserCdpPosition = baseConnection.model('UserCdpPositions', UserCdpPositionSchema);

const UpdateControlSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, index: true },
    paused: { type: Boolean, default: false },
    pausedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

const UpdateControl = baseConnection.model('UpdateControls', UpdateControlSchema);

export { CdpPositionManager, UserCdpPosition, UpdateControl };
