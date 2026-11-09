import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const SupportedPairSchema = new mongoose.Schema(
  {
    ownerSafeAddress: { type: String, required: true, trim: true, lowercase: true, default: null },
    baseSymbol: { type: String, required: true, trim: true, uppercase: true },
    quoteSymbol: { type: String, required: true, trim: true, uppercase: true },
    baseAddress: { type: String, required: true, lowercase: true, index: true },
    quoteAddress: { type: String, required: true, lowercase: true, index: true },
    baseLogo: { type: String, default: null },
    quoteLogo: { type: String, default: null },
    priceFeed: { type: String, required: true, lowercase: true },
    chain: { type: String, required: true, trim: true, lowercase: true, index: true },
    isVerified: { type: Boolean, default: false },
    type: { type: String, uppercase: true, default: 'MAINNET' },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate base/quote pairs per chain
SupportedPairSchema.index({ chain: 1, baseAddress: 1, quoteAddress: 1 }, { unique: true });
const SupportedPair = baseConnection.model('SupportedPairs', SupportedPairSchema);
export { SupportedPair };
