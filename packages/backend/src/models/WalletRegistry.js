// Salva-Digital-Tech/packages/backend/src/models/WalletRegistry.js
import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },
  nspace: { type: String, default: '' }, // e.g. "@coinbase"
  registryAddress: {
    type: String,
    required: true,
    lowercase: true,
    unique: true,
  },
  description: { type: String, default: '' },
  active: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const WalletRegistry = baseConnection.model("WalletRegistries", WalletRegistrySchema);
export default WalletRegistry;