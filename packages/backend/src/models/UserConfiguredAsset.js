import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const UserConfiguredAssetSchema = new mongoose.Schema(
  {
    ownerSafeAddress: { type: String, required: true, trim: true, lowercase: true, default: null },
    tokenSymbol: { type: String, required: true, trim: true, uppercase: true },
    tokenAddress: { type: String, required: true, lowercase: true, index: true },
    logo: { type: String, default: null },
    priceFeedAddress: { type: String, required: true, lowercase: true },
    chain: { type: String, required: true, trim: true, lowercase: true, index: true },
    type: { type: String, uppercase: true, default: 'MAINNET' },
  },
  {
    timestamps: true,
  }
);

const UserConfiguredAsset = baseConnection.model('UserConfiguredPoolAssets', UserConfiguredAssetSchema);
export { UserConfiguredAsset };
