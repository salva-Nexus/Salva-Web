// Salva-Digital-Tech/packages/backend/src/services/registryResolver.js
const { ethers } = require("ethers");
const { wallet, provider } = require("./walletSigner");

// BaseRegistry ABI — backend wallet holds REGISTRAR_ROLE.
// RULES:
//   linkToWallet  → PURE name only      e.g. "charles"        (registry welds internally)
//   resolveAddress → WELDED name        e.g. "charles@salva"  (Singleton needs namespace)
//   unlink         → WELDED name        e.g. "charles@salva"  (Singleton needs namespace)
// All strings are converted to UTF-8 bytes before contract calls.
const BASE_REGISTRY_ABI = [
  "function linkToWallet(bytes calldata _name, address _wallet) external returns (bool)",
  "function unlink(bytes calldata _name) external returns (bool)",
  "function resolveAddress(bytes calldata _name) external view returns (address)",
  "function namespace() external pure returns (string memory)",
];

function getRegistryContract(registryAddress, signerOrProvider) {
  return new ethers.Contract(
    registryAddress,
    BASE_REGISTRY_ABI,
    signerOrProvider || provider,
  );
}

/** Converts a string to UTF-8 bytes for contract calls. */
function nameToBytes(name) {
  return ethers.toUtf8Bytes(name.trim());
}

/** Welds pure name + namespace. e.g. "charles" + "@salva" → "charles@salva" */
function weldName(pureName, namespace) {
  return `${pureName.trim()}${namespace.trim()}`;
}

/**
 * Fetches the namespace string from the BaseRegistry contract.
 * e.g. "@salva"
 */
async function getNamespace(registryAddress) {
  const reg = getRegistryContract(registryAddress, provider);
  return await reg.namespace();
}

/**
 * Checks if a name is available.
 * Calls resolveAddress with the FULLY WELDED name (e.g. "charles@salva") as bytes.
 * Returns true if available (resolves to address(0)).
 */
async function checkNameAvailability(weldedName, registryAddress) {
  try {
    const reg = getRegistryContract(registryAddress, provider);
    const resolved = await reg.resolveAddress(nameToBytes(weldedName));
    const isAvailable = !resolved || resolved === ethers.ZeroAddress;
    console.log(
      `🔍 Availability '${weldedName}': ${isAvailable ? "AVAILABLE" : "TAKEN"} (resolved: ${resolved})`,
    );
    return isAvailable;
  } catch (err) {
    // Revert means slot was never written — available
    console.log(
      `🔍 resolveAddress reverted for '${weldedName}' — treating as available`,
    );
    return true;
  }
}

/**
 * Links a PURE name to a wallet address.
 * Calls linkToWallet with PURE name (e.g. "charles") as bytes.
 * The registry welds it with "@salva" internally before calling Singleton.
 */
async function linkNameToWallet(pureName, walletAddress, registryAddress) {
  const reg = getRegistryContract(registryAddress, wallet);

  let tx;
  try {
    tx = await reg.linkToWallet(nameToBytes(pureName), walletAddress, {
      gasLimit: 300_000,
    });
    console.log(
      `⏳ linkToWallet TX sent: ${tx.hash} ('${pureName}' → ${walletAddress})`,
    );
  } catch (sendErr) {
    console.error(`❌ linkToWallet send failed:`, sendErr.message);
    throw new Error("On-chain name linking failed. Please try again.");
  }

  let receipt;
  try {
    receipt = await tx.wait();
  } catch (waitErr) {
    console.error(`❌ linkToWallet reverted:`, waitErr.message);
    throw new Error("On-chain name linking reverted. Please try again.");
  }

  if (!receipt || receipt.status === 0) {
    throw new Error("On-chain name linking failed (receipt status 0).");
  }

  console.log(`✅ '${pureName}' linked to ${walletAddress} (tx: ${tx.hash})`);
  return { txHash: tx.hash };
}

/**
 * Unlinks a name alias.
 * Calls unlink with the FULLY WELDED name (e.g. "charles@salva") as bytes.
 */
async function unlinkName(weldedName, registryAddress) {
  const reg = getRegistryContract(registryAddress, wallet);

  let tx;
  try {
    tx = await reg.unlink(nameToBytes(weldedName), { gasLimit: 200_000 });
    console.log(`⏳ unlink TX sent: ${tx.hash} ('${weldedName}')`);
  } catch (sendErr) {
    console.error(`❌ unlink send failed:`, sendErr.message);
    throw new Error("On-chain unlink failed. Please try again.");
  }

  let receipt;
  try {
    receipt = await tx.wait();
  } catch (waitErr) {
    console.error(`❌ unlink reverted:`, waitErr.message);
    throw new Error("On-chain unlink reverted. Please try again.");
  }

  if (!receipt || receipt.status === 0) {
    throw new Error("On-chain unlink failed (receipt status 0).");
  }

  console.log(`✅ '${weldedName}' unlinked (tx: ${tx.hash})`);
  return { txHash: tx.hash };
}

/**
 * Resolves a welded name alias to an address during transfers.
 * Calls resolveAddress with FULLY WELDED name as bytes.
 */
async function resolveNameToAddress(weldedName, registryAddress) {
  try {
    const reg = getRegistryContract(registryAddress, provider);
    const resolved = await reg.resolveAddress(nameToBytes(weldedName));
    if (!resolved || resolved === ethers.ZeroAddress) {
      throw new Error(`Name '${weldedName}' not found in registry`);
    }
    console.log(`✅ Resolved '${weldedName}' → ${resolved}`);
    return resolved.toLowerCase();
  } catch (err) {
    console.error(`❌ resolveAddress failed for '${weldedName}':`, err.message);
    throw new Error(`Name '${weldedName}' not found`);
  }
}

/**
 * Resolves any recipient input to a wallet address.
 * - 0x address → validates and returns as-is
 * - name string → expects already-welded name (e.g. "charles@salva")
 */
async function resolveToAddress(input, registryAddress) {
  const trimmed = input.trim();

  if (trimmed.startsWith("0x")) {
    if (!ethers.isAddress(trimmed)) {
      throw new Error(`Invalid wallet address: ${trimmed}`);
    }
    return trimmed.toLowerCase();
  }

  if (!registryAddress) {
    throw new Error("A registry must be selected to resolve a name");
  }

  // At this point input is already welded (transfer route welds before calling here)
  return await resolveNameToAddress(trimmed, registryAddress);
}

/** Returns true if input is a name alias (not a 0x address). */
function isNameAlias(input) {
  if (typeof input !== "string") return false;
  return !input.trim().startsWith("0x");
}

module.exports = {
  checkNameAvailability,
  linkNameToWallet,
  unlinkName,
  resolveNameToAddress,
  resolveToAddress,
  isNameAlias,
  nameToBytes,
  weldName,
  getNamespace,
};
