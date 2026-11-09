import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const PoolSchema = new mongoose.Schema({
  poolAddress: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
  },
  ownerSafeAddress: {
    type: String,
    required: true,
    lowercase: true,
    index: true,
  },
  inventories: [
    {
      baseSymbol: { type: String, trim: true },
      quoteSymbol: { type: String, trim: true },
      baseAddress: { type: String, lowercase: true },
      quoteAddress: { type: String, lowercase: true },
      priceFeed: { type: String, lowercase: true },
      floor: { type: String },
      spread: { type: String },
      allowedSwapBelowFloor: { type: Boolean, default: false },
      isInverted: { type: Boolean, default: false },
    },
  ],
  chain: { type: String, required: true, trim: true },
});

const Pool = baseConnection.model('Pools', PoolSchema);
export { Pool };
