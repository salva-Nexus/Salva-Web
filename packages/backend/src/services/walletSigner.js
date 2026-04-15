// Salva-Digital-Tech/packages/backend/src/services/walletSigner.js
const { ethers } = require("ethers");

// ─── Provider ─────────────────────────────────────────────────────────────────
const isDev = process.env.NODE_ENV === "development";
const rpcUrl = isDev ? process.env.BASE_SEPOLIA_RPC_URL : process.env.BASE_MAINNET_RPC_URL;
const chainId = isDev ? parseInt(process.env.CHAIN_ID_TESTNET) : parseInt(process.env.CHAIN_ID_MAINNET);
const networkName = isDev ? "base-sepolia" : "base";

if (!rpcUrl) {
  console.error("❌ No RPC_URL found in environment variables");
  process.exit(1);
}

const network = new ethers.Network(networkName, chainId);

const provider = new ethers.JsonRpcProvider(rpcUrl, network, {
  staticNetwork: network, // Prevents ethers from fetching network info on every call
});

// ─── Wallet ───────────────────────────────────────────────────────────────────
let rawKey = process.env.MANAGER_PRIVATE_KEY
  ? process.env.MANAGER_PRIVATE_KEY.trim().replace(/['"]+/g, "")
  : "";

const privateKey = rawKey.startsWith("0x") ? rawKey : `0x${rawKey}`;

console.log("🔧 Initializing Salva Backend Admin Wallet...");

let wallet;
try {
  if (privateKey.length !== 66) {
    throw new Error(
      `Invalid private key length: ${privateKey.length}. Expected 66 chars including 0x.`,
    );
  }
  wallet = new ethers.Wallet(privateKey, provider);
  console.log("✅ Admin Wallet Ready:", wallet.address);
} catch (error) {
  console.error("❌ Wallet Initialization Failed:", error.message);
  process.exit(1);
}

module.exports = { wallet, provider };
