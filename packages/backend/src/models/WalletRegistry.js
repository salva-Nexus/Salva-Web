// Salva-Digital-Tech/packages/backend/src/models/WalletRegistry.js
const mongoose = require('mongoose');

const WalletRegistrySchema = new mongoose.Schema({
  name: { type: String, required: true },               // e.g. "Salva Wallet"
  registryAddress: { type: String, required: true, lowercase: true, unique: true }, // deployed SalvaRegistry contract address
  description: { type: String, default: '' },            // optional short description
  active: { type: Boolean, default: true },              // can be toggled off without deleting
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('WalletRegistry', WalletRegistrySchema);

/**
 * 
 * 
 * Q: Admin detection — how does the system know if a logged-in user is a validator/admin?

A: Add isValidator field to User model in MongoDB



Q: Wallet dropdown during sending — which wallets show up?

A: i told you explicit that dropdown shows lists of wallet/registries that have been apporved by admins, after multisig approves a registry, The name of the wallet that owns the registry(gotten from proposal input) eg Coinbase, the namespace eg @coinbase, and contract address is added to a model.. now when a user inputs name or number for transfer, the drop down shows, and when they click the drop down, they see list of all approved wallet(names and not namespace), when they click on any, they backend you should get the namespace of that wallet/registry in the database



Q: Validator email notifications — where is the list of validator emails stored?

A: validator is also a user, creates a normal wallet, now after other admins/valdators have validated a user, the backend automatically chnage the status from user to validator or admin, so still a user and also an admin, in that case, everyonr has their emails in the backend..
 */