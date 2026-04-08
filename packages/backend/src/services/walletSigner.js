// Salva-Digital-Tech/packages/backend/src/services/walletSigner.js
const { ethers } = require("ethers");

const rpcUrl = process.env.BASE_MAINNET_RPC_URL;

if (!rpcUrl) {
  console.error(
    "❌ No BASE_MAINNET_RPC_URL in .env",
  );
  process.exit(1);
}

// ─── Provider ─────────────────────────────────────────────────────────────────
// In ethers v6, passing { ensAddress: null } does NOT disable ENS lookups —
// it triggers an internal branch that attempts ENS on unsupported networks and
// throws UNSUPPORTED_OPERATION. The correct fix is to use StaticNetwork via
// Network.from() which hard-disables ENS address resolution entirely.
const network = new ethers.Network("base", 8453);

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
