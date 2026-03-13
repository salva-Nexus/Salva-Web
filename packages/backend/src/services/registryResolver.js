// Salva-Digital-Tech/packages/backend/src/services/registryResolver.js
const { ethers } = require('ethers');
const { provider } = require('./walletSigner');

// All resolution goes through the deployed SalvaRegistry contract.
// SalvaRegistry.resolveAddress(_num, _registry) internally calls Singleton.
// SalvaRegistry.resolveNumber(_addr, _registry) internally calls Singleton.
// NO direct calls to the Singleton ever happen from the backend.
const REGISTRY_ABI = [
  "function resolveAddress(uint128, address) view returns (address)",
  "function resolveNumber(address, address) view returns (uint128)",
  "function linkNumber(uint128, address) external",
];

const registryContract = new ethers.Contract(
  process.env.REGISTRY_CONTRACT_ADDRESS,
  REGISTRY_ABI,
  provider
);

/**
 * Returns true if the input looks like an account number:
 * - Does NOT start with 0x
 * - Is purely numeric
 */
function isAccountNumber(input) {
  if (typeof input !== 'string') return false;
  return !input.startsWith('0x') && /^\d+$/.test(input.trim());
}

/**
 * Given an account number and a registry address,
 * resolves to the wallet address via the Singleton.
 */
async function getAddressFromAccountNumber(accountNumber, registryAddress) {
  try {
    const address = await registryContract.resolveAddress(
      BigInt(accountNumber),
      registryAddress
    );

    if (!address || address === ethers.ZeroAddress) {
      throw new Error(`Account number ${accountNumber} not found in registry ${registryAddress}`);
    }

    console.log(`✅ Resolved account ${accountNumber} → ${address}`);
    return address.toLowerCase();
  } catch (error) {
    console.error(`❌ Failed to resolve account ${accountNumber}:`, error.message);
    throw new Error(`Account number ${accountNumber} not found`);
  }
}

/**
 * Given a wallet address and a registry address,
 * resolves to the account number via the Singleton.
 * Returns null if not found (doesn't throw).
 */
async function getAccountNumberFromAddress(walletAddress, registryAddress) {
  if (!registryAddress) {
    // Registry address unknown — skip on-chain lookup.
    // This happens in email/receipt contexts where we don't have the registry.
    return null;
  }

  try {
    const accountNumber = await registryContract.resolveNumber(
      walletAddress,
      registryAddress
    );

    if (accountNumber === 0n) {
      console.log(`⚠️ Address ${walletAddress} has no account number in registry ${registryAddress}`);
      return null;
    }

    console.log(`✅ Resolved address ${walletAddress} → ${accountNumber.toString()}`);
    return accountNumber.toString();
  } catch (error) {
    console.error(`❌ Failed to resolve address ${walletAddress}:`, error.message);
    return null;
  }
}

/**
 * Resolves any input to a wallet address.
 * - If input is an account number: requires registryAddress, calls Singleton
 * - If input is a 0x address: validates and returns as-is
 */
async function resolveToAddress(input, registryAddress) {
  if (isAccountNumber(input)) {
    if (!registryAddress) {
      throw new Error('Registry address is required to resolve an account number');
    }
    return await getAddressFromAccountNumber(input, registryAddress);
  }

  // It's a wallet address — validate it
  if (!ethers.isAddress(input)) {
    throw new Error(`Invalid address or account number: ${input}`);
  }
  return input.toLowerCase();
}

module.exports = {
  isAccountNumber,
  getAddressFromAccountNumber,
  getAccountNumberFromAddress,
  resolveToAddress
};