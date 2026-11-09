import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const SupportedChainSchema = new mongoose.Schema({
  chainName: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  logo: {
    type: String,
    required: true,
    trim: true,
  },
  chainId: {
    type: Number,
    required: true,
    unique: true,
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
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const SupportedChain = baseConnection.model('SupportedChain', SupportedChainSchema);

export { SupportedChain };
