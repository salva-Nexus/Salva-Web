// Salva-Digital-Tech/packages/backend/src/services/registryResolver.js
const { ethers } = require("ethers");
const { provider } = require("./walletSigner");

// All resolution goes through the deployed SalvaRegistry contract.
// SalvaRegistry.resolveViaName(name) — resolves a plain name under the registry's namespace
// SalvaRegistry.resolveViaNumber(num) — resolves a uint128 account number under the registry's namespace
// NO direct calls to the Singleton ever happen from the backend.

const SALVA_REGISTRY_ABI = [
  "function resolveViaName(string calldata) view returns (address)",
  "function resolveViaNumber(uint128) view returns (address)",
  "function linkNumber(uint128, address) external",
  "function linkName(string memory, address) external",
];

// Default Salva registry (used for linkNumber / linkName called by the backend wallet)
const salvaRegistryContract = new ethers.Contract(
  process.env.REGISTRY_CONTRACT_ADDRESS,
  SALVA_REGISTRY_ABI,
  provider,
);

/**
 * Returns true if the input looks like an account number:
 * - Does NOT start with 0x
 * - Is purely numeric
 */
function isAccountNumber(input) {
  if (typeof input !== "string") return false;
  return !input.startsWith("0x") && /^\d+$/.test(input.trim());
}

/**
 * Returns true if the input looks like a name alias:
 * - Does NOT start with 0x
 * - Contains at least one letter
 */
function isNameAlias(input) {
  if (typeof input !== "string") return false;
  const trimmed = input.trim();
  return !trimmed.startsWith("0x") && /[a-zA-Z]/.test(trimmed);
}

/**
 * Given a plain name (e.g. "charles") and the SalvaRegistry contract address,
 * resolves to the wallet address via resolveViaName on that registry.
 * The registry internally welds name+namespace for lookup.
 */
async function getAddressFromName(name, registryAddress) {
  try {
    const reg = new ethers.Contract(
      registryAddress,
      SALVA_REGISTRY_ABI,
      provider,
    );
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
 * Given an account number (uint128) and the SalvaRegistry contract address,
 * resolves to the wallet address via resolveViaNumber on that registry.
 */
async function getAddressFromAccountNumber(accountNumber, registryAddress) {
  try {
    const reg = new ethers.Contract(
      registryAddress,
      SALVA_REGISTRY_ABI,
      provider,
    );
    const address = await reg.resolveViaNumber(BigInt(accountNumber));
    if (!address || address === ethers.ZeroAddress) {
      throw new Error(
        `Account number ${accountNumber} not found in registry ${registryAddress}`,
      );
    }
    console.log(`✅ Resolved account ${accountNumber} → ${address}`);
    return address.toLowerCase();
  } catch (error) {
    console.error(
      `❌ Failed to resolve account ${accountNumber}:`,
      error.message,
    );
    throw new Error(`Account number ${accountNumber} not found`);
  }
}

/**
 * Given a wallet address and the default Salva registry,
 * resolves to the account number. Returns null if not found.
 * Used for security emails / receipts only.
 */
async function getAccountNumberFromAddress(walletAddress, registryAddress) {
  const regAddress = registryAddress || process.env.REGISTRY_CONTRACT_ADDRESS;
  if (!regAddress) return null;

  try {
    // We call resolveViaNumber in reverse — but SalvaRegistry doesn't expose reverse lookup.
    // Fall back to checking the on-chain wallet alias via the Singleton ABI if needed.
    // For now, we return null gracefully — caller falls back to safeAddress.
    // (The Singleton stores _walletAliases[wallet].num but is not exposed on SalvaRegistry.)
    return null;
  } catch (error) {
    console.error(
      `❌ Failed to resolve address ${walletAddress}:`,
      error.message,
    );
    return null;
  }
}

/**
 * Resolves any recipient input to a wallet address.
 *
 * - 0x address → validates and returns as-is (no registry needed)
 * - Pure number → resolveViaNumber on the provided registryAddress
 * - Name string  → resolveViaName  on the provided registryAddress
 *
 * registryAddress is mandatory for name/number inputs.
 */
async function resolveToAddress(input, registryAddress) {
  const trimmed = input.trim();

  // Raw 0x wallet address — no registry lookup needed
  if (trimmed.startsWith("0x")) {
    if (!ethers.isAddress(trimmed)) {
      throw new Error(`Invalid wallet address: ${trimmed}`);
    }
    return trimmed.toLowerCase();
  }

  if (!registryAddress) {
    throw new Error(
      "A registry must be selected to resolve a name or account number",
    );
  }

  // Pure numeric → account number
  if (isAccountNumber(trimmed)) {
    return await getAddressFromAccountNumber(trimmed, registryAddress);
  }

  // Contains letters → name alias
  if (isNameAlias(trimmed)) {
    return await getAddressFromName(trimmed, registryAddress);
  }

  throw new Error(`Invalid recipient input: ${trimmed}`);
}

/**
 * Check whether a name is available in the Salva registry (default @salva namespace).
 * Returns true if available (resolves to zero address).
 */
async function isNameAvailable(name) {
  try {
    const address = await salvaRegistryContract.resolveViaName(name);
    return !address || address === ethers.ZeroAddress;
  } catch {
    return true; // If call fails (e.g. no mapping), treat as available
  }
}

module.exports = {
  isAccountNumber,
  isNameAlias,
  getAddressFromName,
  getAddressFromAccountNumber,
  getAccountNumberFromAddress,
  resolveToAddress,
  isNameAvailable,
  salvaRegistryContract,
};
