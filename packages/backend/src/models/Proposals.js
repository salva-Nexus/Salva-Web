// Salva-Digital-Tech/packages/backend/src/models/Proposal.js
const mongoose = require("mongoose");

// Tracks proposals submitted to the MultiSig contract.
// Source of truth is always on-chain events, but we mirror here
// so the dashboard can show proposal state without hammering the RPC.
const ProposalSchema = new mongoose.Schema({
  // "registryInit" or "validatorUpdate"
  type: {
    type: String,
    enum: ["registryInit", "validatorUpdate"],
    required: true,
  },

  // ── Registry Init fields ─────────────────────────────────────────
  registryName: { type: String, default: null },       // e.g. "Coinbase"
  namespace: { type: String, default: null },          // e.g. "@coinbase"
  registryAddress: { type: String, default: null, lowercase: true },

  // ── Validator Update fields ──────────────────────────────────────
  validatorAddress: { type: String, default: null, lowercase: true },
  action: { type: Boolean, default: null }, // true = add, false = remove

  // ── Shared lifecycle fields ──────────────────────────────────────
  proposedBy: { type: String, required: true, lowercase: true }, // safeAddress of proposer
  requiredValidationCount: { type: Number, required: true },
  validationCount: { type: Number, default: 0 },
  // Array of safeAddresses that have validated — for UI locking per validator
  validatedBy: [{ type: String, lowercase: true }],

  // Timestamps
  proposedAt: { type: Date, default: Date.now },
  timelockEndsAt: { type: Date, default: null }, // set when quorum reached
  executedAt: { type: Date, default: null },

  // State flags
  isValidated: { type: Boolean, default: false }, // quorum reached
  isExecuted: { type: Boolean, default: false },  // execute called on-chain
  isCancelled: { type: Boolean, default: false },
  executionSuccess: { type: Boolean, default: null }, // null until executed
});

module.exports = mongoose.model("Proposal", ProposalSchema);