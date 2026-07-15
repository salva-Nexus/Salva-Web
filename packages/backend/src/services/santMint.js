// packages/backend/src/services/santMint.js
// ─────────────────────────────────────────────────────────────────────────────
// Mints SANT to a user's Base address. SANT is Base-only, hardcoded 18 decimals.
// Backend wallet (MANAGER_PRIVATE_KEY) must hold the MINTER role on the SANT
// contract — same wallet already used for all other Base admin operations.
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const { ethers } = require('ethers');
const { wallet } = require('./walletSigner');

const SANT_ABI = ['function mint(address to, uint256 amount) external'];

function getSantAddress() {
  const isProd = process.env.NODE_ENV === 'production';
  const addr = isProd ? process.env.SANT_BASE_MAINNET : process.env.SANT_BASE_SEPOLIA;
  if (!addr) throw new Error('SANT token address not configured for this environment');
  return ethers.getAddress(addr);
}

/**
 * Mints `points` whole SANT (1 point = 1 SANT, 18 decimals) to `toAddress`.
 * Waits for on-chain confirmation before resolving — caller must not reset
 * DB points until this resolves successfully.
 *
 * @param {string} toAddress - recipient's Base safeAddress
 * @param {number} points - whole SANT amount to mint (integer)
 * @returns {Promise<{ txHash: string }>}
 */
async function mintSant(toAddress, points) {
  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('Invalid mint amount');
  }

  const santAddress = getSantAddress();
  const contract = new ethers.Contract(santAddress, SANT_ABI, wallet);

  // SANT is hardcoded 18 decimals — never derive this from anywhere else.
  const amountWei = ethers.parseUnits(String(points), 18);

  console.log(`🪙 [SANT] Minting ${points} SANT → ${toAddress}`);

  const tx = await contract.mint(ethers.getAddress(toAddress), amountWei, {
    gasLimit: 200_000,
  });

  console.log(`⏳ [SANT] Mint tx submitted: ${tx.hash}`);
  const receipt = await tx.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error('SANT mint transaction reverted on-chain');
  }

  console.log(`✅ [SANT] Mint confirmed: ${tx.hash}`);
  return { txHash: tx.hash };
}

module.exports = { mintSant, getSantAddress };
