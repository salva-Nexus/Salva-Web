// Salva-Digital-Tech/packages/backend/src/services/walletSigner.js
const { ethers } = require('ethers');
const path = require('path');

const provider = new ethers.JsonRpcProvider(
  process.env.ALCHEMY_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL,
);

// 1. Get the key and TRIM it to remove hidden spaces/newlines
let rawKey = process.env.MANAGER_PRIVATE_KEY ? process.env.MANAGER_PRIVATE_KEY.trim() : "";

// 2. Remove quotes if they accidentally got into the string
rawKey = rawKey.replace(/['"]+/g, '');

// 3. Ensure it has the 0x prefix
const privateKey = rawKey.startsWith('0x') ? rawKey : `0x${rawKey}`;

console.log("🔧 Initializing Backend Admin Wallet...");

console.log("🔧 Initializing Backend Admin Wallet...");
console.log("🔍 DEBUG - Raw key from env:", process.env.MANAGER_PRIVATE_KEY);
console.log("🔍 DEBUG - After trim:", rawKey);
console.log("🔍 DEBUG - After quote removal:", rawKey.replace(/['"]+/g, ''));
console.log("🔍 DEBUG - Final privateKey:", privateKey);
console.log("🔍 DEBUG - Key length:", privateKey.length, "chars");

let wallet;
try {
    // This is where the error was happening
    wallet = new ethers.Wallet(privateKey, provider);
    console.log("✅ Wallet Initialized Successfully:", wallet.address);
} catch (error) {
    console.error("❌ Ethers Error Details:", error.message);
    // This will tell us exactly what 'value' ethers is seeing
    process.exit(1); 
}

module.exports = { wallet, provider };