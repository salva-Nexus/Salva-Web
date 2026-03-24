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

// Add this function to registryResolver.js
async function getAddressFromName(name, registryAddress) {
  try {
    const RESOLVE_ABI = ["function resolveViaName(string calldata) view returns (address)"];
    const reg = new ethers.Contract(registryAddress, RESOLVE_ABI, provider);
    const address = await reg.resolveViaName(name);
    if (!address || address === ethers.ZeroAddress) {
      throw new Error(`Name '${name}' not found in registry`);
    }
    console.log(`✅ Resolved name '${name}' → ${address}`);
    return address.toLowerCase();
  } catch (error) {
    console.error(`❌ Failed to resolve name '${name}':`, error.message);
    throw new Error(`Name '${name}' not found`);
  }
}

/**
 * Resolves any input to a wallet address.
 * - If input is an account number: requires registryAddress, calls Singleton
 * - If input is a 0x address: validates and returns as-is
 */
// In registryResolver.js, update resolveToAddress:
async function resolveToAddress(input, registryAddress) {
  const trimmed = input.trim();
  
  if (isAccountNumber(trimmed)) {
    if (!registryAddress) {
      throw new Error('Registry address is required to resolve an account number');
    }
    return await getAddressFromAccountNumber(trimmed, registryAddress);
  }

  // Check if it's a name alias (has letters, doesn't start with 0x)
  if (!trimmed.startsWith('0x') && /[a-zA-Z]/.test(trimmed)) {
    if (!registryAddress) {
      throw new Error('Registry address is required to resolve a name alias');
    }
    return await getAddressFromName(trimmed, registryAddress);
  }

  // It's a wallet address — validate it
  if (!ethers.isAddress(trimmed)) {
    throw new Error(`Invalid address or account number: ${trimmed}`);
  }
  return trimmed.toLowerCase();
}

// Also add to module.exports:
module.exports = {
  isAccountNumber,
  getAddressFromAccountNumber,
  getAccountNumberFromAddress,
  getAddressFromName,
  resolveToAddress
};