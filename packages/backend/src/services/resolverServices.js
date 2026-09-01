import { ethers } from 'ethers';
import { REGISTRY } from '../utils/abi.js';
import { keyValue } from '../utils/vars.js';

const getProvider = () => new ethers.JsonRpcProvider(keyValue('baseRpcUrl'));

function getContract(address, abi, client) {
  if (!address || address === 'undefined') {
    throw new Error('Address is missing or undefined');
  }
  const ABI = abi.length === 0 ? REGISTRY : abi;
  const signerOrProvider = client || getProvider();
  return new ethers.Contract(address, ABI, signerOrProvider);
}

function nameToBytes(name) {
  return ethers.toUtf8Bytes(name.trim());
}

function weldName(pureName, namespace) {
  return `${pureName.trim()}${namespace.trim()}`;
}

async function getNamespace(registryAddress) {
  if (!registryAddress) return '';

  try {
    const reg = getContract(registryAddress, [], getProvider());
    return await reg.namespace();
  } catch (e) {
    console.error('Failed to get namespace:', e.message);
    return '';
  }
}

async function checkNameAvailability(weldedName, registryAddress) {
  try {
    const reg = getContract(registryAddress, [], getProvider());
    const resolved = await reg.resolveAddress(nameToBytes(weldedName));
    const isAvailable = !resolved || resolved === ethers.ZeroAddress;
    console.log(
      `🔍 Availability '${weldedName}': ${isAvailable ? 'AVAILABLE' : 'TAKEN'} (resolved: ${resolved})`
    );
    return isAvailable;
  } catch (err) {
    console.log(`🔍 resolveAddress reverted for '${weldedName}' — treating as not available`);
    return false;
  }
}

async function resolveNameToAddress(weldedName, registryAddress) {
  try {
    const reg = getContract(registryAddress, [], getProvider());
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

async function resolveToAddress(input, registryAddress) {
  const trimmed = input.trim();
  if (trimmed.startsWith('0x')) {
    if (!ethers.isAddress(trimmed)) throw new Error(`Invalid wallet address: ${trimmed}`);
    return trimmed.toLowerCase();
  }
  if (!registryAddress) throw new Error('A registry must be selected to resolve a name');

  const targetRegistry = registryAddress === '0x' ? keyValue('registry') : registryAddress;

  return await resolveNameToAddress(trimmed, targetRegistry);
}

function isNameAlias(input) {
  if (typeof input !== 'string') return false;
  return !(input.trim().startsWith('0x') || !input.trim().includes('@'));
}

export {
  checkNameAvailability,
  resolveNameToAddress,
  resolveToAddress,
  isNameAlias,
  nameToBytes,
  weldName,
  getNamespace,
  getContract,
};
