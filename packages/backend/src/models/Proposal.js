// Salva-Digital-Tech/packages/backend/src/models/Proposal.js
const mongoose = require("mongoose");

const ProposalSchema = new mongoose.Schema({
  // "registry" | "validator" | "upgrade" | "signerUpdate" | "baseRegistryImplUpdate" | "unpause"
  type: {
    type: String,
    enum: [
      "registry",
      "validator",
      "upgrade",
      "signerUpdate",
      "baseRegistryImplUpdate",
      "unpause",
    ],
    required: true,
  },

  // ── Registry fields ───────────────────────────────────────────────────────
  registry: { type: String, lowercase: true, default: null },
  nspace: { type: String, default: null },
  registryName: { type: String, default: null },
  isWallet: { type: Boolean, default: false },

  // ── Validator fields ──────────────────────────────────────────────────────
  addr: { type: String, lowercase: true, default: null },
  action: { type: Boolean, default: null }, // true = add, false = remove

  // ── Upgrade / signerUpdate / baseRegistryImplUpdate fields ───────────────
  // newImpl stores: newImpl for upgrade/baseRegistryImplUpdate, newSigner for signerUpdate
  newImpl: { type: String, lowercase: true, default: null },
  proxy: { type: String, lowercase: true, default: null },
  isMultisig: { type: Boolean, default: false },

  // ── Unpause fields ────────────────────────────────────────────────────────
  // proxy field is shared; mark: 0 = multisig itself, 1 = external contract
  mark: { type: Number, default: null },

  // ── Shared voting state ───────────────────────────────────────────────────
  remainingValidation: { type: Number, default: null },
  isValidated: { type: Boolean, default: false },
  timeLockTimestamp: { type: Number, default: null }, // unix seconds

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Unique constraint: only one active proposal per key per type
ProposalSchema.index({ type: 1, registry: 1 }, { sparse: true });
ProposalSchema.index({ type: 1, addr: 1 }, { sparse: true });
ProposalSchema.index({ type: 1, newImpl: 1 }, { sparse: true });
ProposalSchema.index({ type: 1, proxy: 1 }, { sparse: true });

module.exports = mongoose.model("Proposal", ProposalSchema);
