import mongoose from 'mongoose';
import { baseConnection } from '../DB_connection.js';

const SubmittedProposalReqSchema = new mongoose.Schema({
  initiatorSafe: { type: String, default: null },
  target: { type: String, default: null, required: true },
  value: { type: BigInt, default: 0n },
  data: { type: String, default: null, required: true },
  key: { type: String, default: null, required: true },
  description: { type: String, default: null, required: true },
  chain: { type: String, default: null, required: true },
  active: { type: Boolean, default: true },
});

const ProposalsSchema = new mongoose.Schema({
  initiatorSafe: { type: String, default: null, lowercase: true },
  target: { type: String, default: null, required: true },
  value: { type: BigInt, default: 0n, required: true },
  data: { type: String, default: null, required: true },
  key: { type: String, default: null, required: true },
  nonce: { type: BigInt, default: 0n, required: true },
  proposalHash: { type: String, default: null, required: true },
  description: { type: String, default: null, required: true },
  chain: { type: String, default: null, required: true },
  approved: { type: Boolean, default: false },
  hasApproved: {
    type: [
      {
        validator: { type: String, default: null, lowercase: true },
      },
    ],
  },
  remaining: { type: Number, default: 0 },
  timeRemaining: { type: Date, default: null },
  active: { type: Boolean, default: true },
});

const SubmittedProposalReq = baseConnection.model(
  'SubmittedProposalReq',
  SubmittedProposalReqSchema
);
const Proposals = baseConnection.model('Proposals', ProposalsSchema);
export { Proposals, SubmittedProposalReq };
