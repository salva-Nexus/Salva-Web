import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const assetSchema = new mongoose.Schema(
  {
    chain: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tokenAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    priceFeedAddress: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    tokenSymbol: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    tokenDecimals: {
      type: Number,
      required: true,
      default: 18,
    },
    logo: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      default: 'MAINNET',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

const Assets = baseConnection.model('Asset', assetSchema);

export default Assets;
