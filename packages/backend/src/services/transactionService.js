// Salva-Digital-Tech/packages/backend/src/services/transactionService.js - Helper to resolve recipient (address or account number)
const { ethers } = require('ethers');
const { provider } = require('./walletSigner');

const REGISTRY_ABI = ['function getAddressFromNumber(uint128) view returns (address)'];
const registryContract = new ethers.Contract(
  process.env.REGISTRY_CONTRACT_ADDRESS,
  REGISTRY_ABI,
  provider
);

async function resolveRecipient(input) {
  // If input is already an Ethereum address, return it
  if (ethers.isAddress(input)) {
    console.log(`✅ Valid address detected: ${input}`);
    return input;
  }

  // Otherwise, treat it as account number and resolve from Registry
  try {
    console.log(`🔍 Resolving account number: ${input}`);
    const address = await registryContract.getAddressFromNumber(input);

    if (address === ethers.ZeroAddress) {
      throw new Error('Account number not registered');
    }

    console.log(`✅ Resolved to address: ${address}`);
    return address;
  } catch (e) {
    console.error('❌ Resolution failed:', e.message);
    throw new Error('Invalid recipient: not a valid address or registered account number');
  }
}

module.exports = { resolveRecipient };
