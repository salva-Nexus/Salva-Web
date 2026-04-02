const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
    fromAddress: { type: String, required: true },
    fromAccountNumber: { type: String },
    fromUsername: { type: String }, // ✅ NEW
    toAddress: { type: String },
    toAccountNumber: { type: String },
    toUsername: { type: String }, // ✅ NEW
    senderDisplayIdentifier: { type: String },
    executorAddress: { type: String },
    amount: { type: String, required: true },
    status: { type: String, default: 'pending' },
    taskId: { type: String },
    type: { type: String, default: 'transfer' },
    date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);

// same here