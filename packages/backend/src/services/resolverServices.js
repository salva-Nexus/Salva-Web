import { ethers } from 'ethers';
import { keyValue } from '../utils/vars.js';
import { SNS } from '../../salva.js';

const sns = new SNS(keyValue('singleton'), keyValue('sponsorKey'), keyValue('baseRpcUrl'));

async function checkNameAvailability(name) {
  try {
    const resolved = await sns.resolveAddr(name);
    const isAvailable = !resolved || resolved === ethers.ZeroAddress;
    console.log(
      `🔍 Availability '${name}': ${isAvailable ? 'AVAILABLE' : 'TAKEN'} (resolved: ${resolved})`
    );
    return isAvailable;
  } catch (err) {
    console.log(`🔍 resolveAddress reverted for '${name}' — treating as not available`);
    return false;
  }
}

async function resolveToAddress(name) {
  try {
    const resolved = await sns.resolveAddr(name);
    if (!resolved || resolved === ethers.ZeroAddress) {
      throw new Error(`Name '${name}' not found in registry`);
    }
    console.log(`✅ Resolved '${name}' → ${resolved}`);
    return resolved.toLowerCase();
  } catch (err) {
    console.error(`❌ resolveAddress failed for '${name}':`, err.message);
    throw new Error(`Name '${name}' not found`);
  }
}

function isNameAlias(input) {
  if (typeof input !== 'string') return false;
  return !(input.trim().startsWith('0x') || !input.trim().includes('@'));
}

export { checkNameAvailability, resolveToAddress, isNameAlias };
