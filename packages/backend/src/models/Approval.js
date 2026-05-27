// Salva-Digital-Tech/Packages/backend/src/models/Approval.js
const mongoose = require('mongoose');

const ApprovalSchema = new mongoose.Schema({
  owner: { type: String, required: true, index: true }, // The user's wallet address
  spender: { type: String, required: true }, // Resolved spender address (for blockchain queries)
  spenderInput: { type: String, required: true }, // What approver actually typed (account number or address)
  spenderInputType: { type: String, required: true }, // 'accountNumber' or 'address'
  amount: { type: String, required: true }, // How much
  date: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Approval', ApprovalSchema);
