// backend/src/routes/syncIncoming.js
const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendTransactionEmailToReceiver } = require('../services/emailService');

// ── ERC20 Transfer(address indexed from, address indexed to, uint256 value) ──
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// ── Chain-specific config ─────────────────────────────────────────────────────
// ── Chain-specific config ─────────────────────────────────────────────────────
function getChainConfig(chain) {
  const isProd = process.env.NODE_ENV === 'production';
  if (chain === 'bnb') {
    return {
      rpcUrl: isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL,
      factoryAddress: isProd ? process.env.L1_POOL_FACTORY_ADDRESS : process.env.L1_BSC_POOL_FACTORY_ADDRESS,
      tokens: [
        {
          address: isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS,
          symbol: 'NGN',
        },
        {
          address: isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS,
          symbol: 'CNGN',
        },
        {
          address: isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS,
          symbol: 'USDT',
        },
        {
          address: isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS,
          symbol: 'USDC',
        },
      ],
    };
  }
  // Default: Base chain — decimals are known (all 6) so no factory call needed
  return {
    rpcUrl: isProd
      ? (process.env.BASE_MAINNET_RPC_URL || 'https://base-rpc.publicnode.com')
      : (process.env.BASE_SEPOLIA_RPC_URL || 'https://base-sepolia-rpc.publicnode.com'),
    factoryAddress: null,
    tokens: [
      { address: process.env.NGN_TOKEN_ADDRESS, symbol: 'NGN', decimals: 6 },
      { address: process.env.CNGN_CONTRACT_ADDRESS, symbol: 'CNGN', decimals: 6 },
      { address: process.env.USDT_CONTRACT_ADDRESS, symbol: 'USDT', decimals: 6 },
      { address: process.env.USDC_CONTRACT_ADDRESS, symbol: 'USDC', decimals: 6 },
    ],
  };
}

const FACTORY_ABI = ['function tokenDecimal(address token) external view returns (uint8)'];

async function resolveDecimals(tokens, factoryAddress, provider) {
  if (!factoryAddress) return tokens; // Base — already has decimals set
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  return Promise.all(
    tokens.map(async (t) => {
      if (!t.address || !ethers.isAddress(t.address)) return { ...t, decimals: 18 };
      try {
        const dec = await factory.tokenDecimal(t.address);
        return { ...t, decimals: Number(dec) };
      } catch {
        return { ...t, decimals: 18 }; // safe fallback if factory call fails
      }
    })
  );
}

// Pad an address into a 32-byte log topic
const toTopic = (addr) => '0x' + addr.replace('0x', '').toLowerCase().padStart(64, '0');

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync-incoming/:safeAddress
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:safeAddress', async (req, res) => {
  const raw = req.params.safeAddress;
  const chain = req.query.chain === 'bnb' ? 'bnb' : 'base';

  if (!ethers.isAddress(raw)) {
    return res.status(400).json({ message: 'Invalid address' });
  }

  const safeAddress = raw.toLowerCase();
  const { rpcUrl, tokens: rawTokens, factoryAddress } = getChainConfig(chain);
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const tokens = await resolveDecimals(rawTokens, factoryAddress, provider);

  try {
    // ── 1. Confirm this is a Salva user ──────────────────────────────────────
    // BNB users are stored in the L1 DB — check both
    let recipient = await User.findOne({ safeAddress }).catch(() => null);
    if (!recipient && chain === 'bnb') {
      try {
        const l1db = require('../services/l1db');
        if (l1db.readyState === 1) {
          const L1User = l1db.models.User || l1db.model('User', User.schema);
          recipient = await L1User.findOne({ safeAddress }).catch(() => null);
        }
      } catch {
        // l1db not available — skip
      }
    }
    if (!recipient) {
      return res.json({ synced: 0 });
    }

    // ── 2. Block range ────────────────────────────────────────────────────────
    // BNB ~3s blocks → 500 blocks ≈ 25 min; Base ~2s → 500 blocks ≈ 17 min
    const latestBlock = await provider.getBlockNumber();
    const blockRange = 300;
    const fromBlock = Math.max(0, latestBlock - blockRange);

    let synced = 0;

    // ── 3. Scan each token ───────────────────────────────────────────────────
    for (const token of tokens) {
      if (!token.address || !ethers.isAddress(token.address)) continue;

      let logs = [];
      try {
        logs = await provider.getLogs({
          fromBlock,
          toBlock: latestBlock,
          address: ethers.getAddress(token.address),
          topics: [
            TRANSFER_TOPIC,
            null,
            toTopic(safeAddress),
          ],
        });
      } catch (logsErr) {
        // Silently skip on free-tier block range errors — not worth retrying
        if (logsErr?.message?.includes('block range') || logsErr?.message?.includes('Free tier')) {
          continue;
        }
        console.error(`❌ getLogs error for ${token.symbol}:`, logsErr.message);
        continue;
      }

      for (const log of logs) {
        const txHash = log.transactionHash;

        // ── 3a. Deduplicate: skip if already in DB ───────────────────────────
        try {
          const exists = await Transaction.findOne({
            taskId: txHash,
            coin: token.symbol,
            toAddress: safeAddress,
          }).lean();

          if (exists) continue;
        } catch (dedupErr) {
          console.error('❌ Dedup query error:', dedupErr.message);
          continue;
        }

        // ── 3b. Decode log ───────────────────────────────────────────────────
        let fromAddress, rawAmount;
        try {
          fromAddress = ethers.getAddress('0x' + log.topics[1].slice(26));
          rawAmount = BigInt(log.data);
        } catch (decodeErr) {
          console.error('❌ Log decode error:', decodeErr.message);
          continue;
        }

        // ── 3c. Skip self-sends and zero-value transfers ─────────────────────
        if (fromAddress.toLowerCase() === safeAddress) continue;
        if (rawAmount === 0n) continue;

        // ── 3d. Get block timestamp ──────────────────────────────────────────
        let date = new Date();
        try {
          const block = await provider.getBlock(log.blockNumber);
          if (block?.timestamp) date = new Date(block.timestamp * 1000);
        } catch {
          // fallback to now
        }

        // ── 3e. Format amount ────────────────────────────────────────────────
        const amount = parseFloat(ethers.formatUnits(rawAmount, token.decimals)).toFixed(2);

        // ── 3f. Look up sender's Salva identity (best-effort) ────────────────
        let fromNameAlias = null;
        let fromUsername = null;
        try {
          const sender = await User.findOne({
            safeAddress: fromAddress.toLowerCase(),
          }).lean();
          fromNameAlias = sender?.nameAlias || null;
          fromUsername = sender?.username || null;
        } catch {
          // not a Salva user — fine
        }

        // ── 3g. Save transaction record ──────────────────────────────────────
        try {
          await Transaction.create({
            safeAddress,
            taskId: txHash,
            amount,
            coin: token.symbol,
            status: 'successful',
            date,
            fromAddress: fromAddress.toLowerCase(),
            fromNameAlias,
            fromUsername,
            toAddress: safeAddress,
            toNameAlias: recipient.nameAlias || null,
            toUsername: recipient.username || null,
            senderDisplayIdentifier: fromNameAlias || fromUsername || fromAddress.toLowerCase(),
            fee: '0',
            type: 'transfer',
          });

          synced++;
          console.log(
            `✅ sync-incoming: saved ${token.symbol} transfer ${txHash} → ${safeAddress}`
          );
        } catch (saveErr) {
          // Duplicate key on taskId is expected on concurrent calls — not a real error
          if (saveErr.code === 11000) continue;
          console.error('❌ Transaction.create error:', saveErr.message);
          continue;
        }

        // ── 3h. Email recipient (non-blocking) ───────────────────────────────
        if (recipient.email) {
          const senderDisplay = fromNameAlias || fromUsername || fromAddress.toLowerCase();
          sendTransactionEmailToReceiver(
            recipient.email,
            recipient.username,
            senderDisplay,
            amount,
            token.symbol // ← actual coin: NGN / USDT / USDC
          ).catch((emailErr) => {
            console.error('📧 sync-incoming email error:', emailErr.message);
          });
        }
      }
    }

    return res.json({ synced, scannedBlocks: latestBlock - fromBlock });
  } catch (err) {
    console.error('❌ /sync-incoming error:', err.message);
    return res.json({ synced: 0, error: err.message });
  }
});

module.exports = router;
