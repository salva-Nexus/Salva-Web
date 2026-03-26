// Salva-Digital-Tech/packages/backend/src/models/Proposal.js
const mongoose = require("mongoose");

const ProposalSchema = new mongoose.Schema({
  // "registry" or "validator"
  type: { type: String, enum: ["registry", "validator"], required: true },

  // ── Registry fields ──────────────────────────────────────────────────
  registry: { type: String, lowercase: true, default: null },
  nspace: { type: String, default: null },
  registryName: { type: String, default: null },

  // ── Validator fields ─────────────────────────────────────────────────
  addr: { type: String, lowercase: true, default: null },
  action: { type: Boolean, default: null }, // true = add, false = remove

  // ── Shared voting state ──────────────────────────────────────────────
  remainingValidation: { type: Number, default: null },
  isValidated: { type: Boolean, default: false },
  timeLockTimestamp: { type: Number, default: null }, // unix seconds

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Unique constraint: only one active proposal per registry address or validator address
ProposalSchema.index({ type: 1, registry: 1 }, { sparse: true });
ProposalSchema.index({ type: 1, addr: 1 }, { sparse: true });

module.exports = mongoose.model("Proposal", ProposalSchema);
