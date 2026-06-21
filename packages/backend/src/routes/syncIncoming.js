// backend/src/routes/syncIncoming.js
let globalRpcQueue = [];
let rpcBusy = false;

function enqueueRpc(fn) {
  return new Promise((resolve, reject) => {
    globalRpcQueue.push({ fn, resolve, reject });
    drainRpcQueue();
  });
}

async function drainRpcQueue() {
  if (rpcBusy || globalRpcQueue.length === 0) return;

  rpcBusy = true;
  const { fn, resolve, reject } = globalRpcQueue.shift();

  try {
    const res = await fn();
    resolve(res);
  } catch (e) {
    reject(e);
  } finally {
    rpcBusy = false;

    // IMPORTANT throttle
    setTimeout(drainRpcQueue, 250);
  }
}

const express = require('express');
const { ethers } = require('ethers');
const router = express.Router();

const Transaction = require('../models/Transaction');
const User = require('../models/User');
const { sendTransactionEmailToReceiver } = require('../services/emailService');

// ── ERC20 Transfer(address indexed from, address indexed to, uint256 value) ──
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

// ── Per-address lock: prevents same address running twice ─────────────────────
const syncLocks = new Map();

// ── Global BNB queue: only ONE BNB sync runs at a time across ALL addresses ───
// BSC testnet public nodes rate-limit at ~1 req/s — concurrent address scans
// from multiple users destroy this budget instantly.
let bnbSyncActive = false;
const bnbSyncQueue = [];

function enqueueBNBSync(fn) {
  return new Promise((resolve, reject) => {
    bnbSyncQueue.push({ fn, resolve, reject });
    drainBNBQueue();
  });
}

async function drainBNBQueue() {
  if (bnbSyncActive || bnbSyncQueue.length === 0) return;
  bnbSyncActive = true;
  const { fn, resolve, reject } = bnbSyncQueue.shift();
  try {
    const result = await fn();
    resolve(result);
  } catch (err) {
    reject(err);
  } finally {
    bnbSyncActive = false;
    // 3 second gap between BNB syncs — gives the RPC breathing room
    setTimeout(drainBNBQueue, 3000);
  }
}

// ── Chain-specific config ─────────────────────────────────────────────────────
function getChainConfig(chain) {
  const isProd = process.env.NODE_ENV === 'production';

  if (chain === 'bnb') {
    return {
      rpcUrl: isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL,

      // Mainnet: Alchemy BNB supports getLogs reliably — use it directly.
      // Testnet: Alchemy BNB testnet does NOT support getLogs — must use dataseed s2
      //          (s1 is used for tx broadcast, s2 is more stable for getLogs on testnet).
      logsRpcUrl: isProd
        ? process.env.BNB_LOGS_RPC_URL || 'https://bsc-dataseed1.bnbchain.org'
        : process.env.BNB_TESTNET_LOGS_RPC_URL || 'https://data-seed-prebsc-2-s1.bnbchain.org:8545',

      factoryAddress: isProd
        ? process.env.L1_POOL_FACTORY_ADDRESS
        : process.env.L1_BSC_POOL_FACTORY_ADDRESS,

      // Mainnet BSC: stable nodes, can scan more blocks per call with larger chunks.
      // Testnet BSC: public dataseed nodes rate-limit aggressively — keep tiny.
      blockRange: isProd ? 2000 : 200,
      chunkSize: isProd ? 200 : 25,
      chunkDelayMs: isProd ? 50 : 400,
      tokenDelayMs: isProd ? 500 : 2000,

      tokens: [
        {
          address: isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS,
          symbol: 'NGN',
        },
        {
          address: isProd
            ? process.env.L1_CNGN_CONTRACT_ADDRESS
            : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS,
          symbol: 'CNGN',
        },
        {
          address: isProd
            ? process.env.L1_USDT_CONTRACT_ADDRESS
            : process.env.L1_BSC_USDT_CONTRACT_ADDRESS,
          symbol: 'USDT',
        },
        {
          address: isProd
            ? process.env.L1_USDC_CONTRACT_ADDRESS
            : process.env.L1_BSC_USDC_CONTRACT_ADDRESS,
          symbol: 'USDC',
        },
      ],
    };
  }

  // ── Base chain ────────────────────────────────────────────────────────────
  // Mainnet: Alchemy Base supports getLogs — use BASE_LOGS_RPC_URL (publicnode
  //          mainnet) as logs endpoint since Alchemy free tier may block getLogs.
  // Testnet: Alchemy Base Sepolia blocks getLogs on free tier — must use
  //          BASE_LOGS_RPC_URL which points to base-sepolia-rpc.publicnode.com.
  return {
    rpcUrl: isProd
      ? process.env.BASE_MAINNET_RPC_URL || 'https://mainnet.base.org'
      : process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org',

    logsRpcUrl: isProd
      ? process.env.BASE_LOGS_RPC_URL || 'https://base-rpc.publicnode.com'
      : process.env.BASE_LOGS_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',

    factoryAddress: null,

    // Mainnet Base: publicnode supports getLogs fine with large chunks.
    // Testnet Base: publicnode also supports it but be conservative.
    blockRange: isProd ? 2000 : 500,
    chunkSize: isProd ? 500 : 100,
    chunkDelayMs: isProd ? 50 : 200,
    tokenDelayMs: isProd ? 100 : 300,

    tokens: [
      { address: process.env.NGN_TOKEN_ADDRESS, symbol: 'NGN', decimals: 6 },
      { address: process.env.CNGN_CONTRACT_ADDRESS, symbol: 'CNGN', decimals: 6 },
      { address: process.env.USDT_CONTRACT_ADDRESS, symbol: 'USDT', decimals: 6 },
      { address: process.env.USDC_CONTRACT_ADDRESS, symbol: 'USDC', decimals: 6 },
    ],
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pad an address into a 32-byte log topic
const toTopic = (addr) => '0x' + addr.replace('0x', '').toLowerCase().padStart(64, '0');

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
        return { ...t, decimals: 18 };
      }
    })
  );
}

// ── Single-chunk getLogs with exponential backoff ─────────────────────────────
// Returns [] on fatal errors (unsupported RPC, 400 errors).
// Retries on transient errors (rate limit, timeout, ECONNRESET, socket hang up).
async function getLogsChunk(provider, filter, chain, chunkStart, chunkEnd, maxRetries = 4) {
  let lastErr;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await provider.getLogs(filter);
    } catch (err) {
      lastErr = err;
      const msg = (err?.message || '').toLowerCase();

      // Fatal — RPC doesn't support getLogs at all, no point retrying
      const isFatal =
        msg.includes('400') ||
        msg.includes('403') ||
        msg.includes('forbidden') ||
        msg.includes('bad request') ||
        msg.includes('not supported') ||
        msg.includes('not available') ||
        msg.includes('method not found');

      if (isFatal) {
        console.warn(`⚠️ getLogs not supported by ${chain} RPC — skipping all log scans`);
        return null; // null signals "abort entire token scan"
      }

      // Transient — back off and retry
      const isTransient =
        msg.includes('timeout') ||
        msg.includes('econnreset') ||
        msg.includes('socket hang up') ||
        msg.includes('etimedout') ||
        err?.code === 'TIMEOUT' ||
        err?.code === 'NETWORK_ERROR';

      if (isTransient && attempt < maxRetries - 1) {
        // Exponential backoff: 2s → 4s → 8s → 16s
        const delay = 2000 * Math.pow(2, attempt);
        console.warn(
          `⚠️ getLogs chunk ${chunkStart}-${chunkEnd} attempt ${attempt + 1}/${maxRetries} ` +
            `failed (${err.message?.slice(0, 60)}) — retrying in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }

      // Non-transient or exhausted retries — log and skip this chunk
      console.warn(
        `⚠️ getLogs chunk ${chunkStart}-${chunkEnd} skipped after ${attempt + 1} attempts: ` +
          `${err.message?.slice(0, 80)}`
      );
      return []; // skip chunk, don't abort entire scan
    }
  }
  console.warn(
    `⚠️ getLogs chunk ${chunkStart}-${chunkEnd} exhausted all retries: ` +
      `${lastErr?.message?.slice(0, 80)}`
  );
  return [];
}

// ── Scan one token for incoming transfers — fully sequential, rate-limited ────
// Returns array of raw ethers logs.
// Returns null if the RPC fatally rejects getLogs (so caller can skip remaining tokens).
async function scanTokenIncoming(
  provider,
  tokenAddress,
  tokenSymbol,
  safeAddress,
  fromBlock,
  toBlock,
  chunkSize,
  chunkDelayMs,
  chain
) {
  const logs = [];
  let totalChunks = 0;

  let dynamicChunkSize = chunkSize;

  for (let start = fromBlock; start <= toBlock; start += dynamicChunkSize) {
    const end = Math.min(start + dynamicChunkSize - 1, toBlock);
    totalChunks++;

    const chunk = await enqueueRpc(() =>
      getLogsChunk(
        provider,
        {
          fromBlock: start,
          toBlock: end,
          address: ethers.getAddress(tokenAddress),
          topics: [TRANSFER_TOPIC, null, toTopic(safeAddress)],
        },
        chain
      )
    );

    // null = fatal RPC error, abort all further scanning
    if (chunk === null) {
      console.warn(`⚠️ Fatal RPC error on ${tokenSymbol}`);
      return null;
    }

    if (chunk.length > 0) {
      logs.push(...chunk);
    }

    // Mandatory delay between chunks — prevents burst that triggers rate limits
    if (start + chunkSize <= toBlock) {
      await sleep(chunkDelayMs);
    }
  }

  if (totalChunks > 1) {
    console.log(
      `📊 [${chain}] ${tokenSymbol}: scanned ${totalChunks} chunks, ` +
        `${logs.length} transfers found`
    );
  }

  return logs;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync-incoming/:safeAddress?chain=base|bnb
// ─────────────────────────────────────────────────────────────────────────────
router.get('/:safeAddress', async (req, res) => {
  const raw = req.params.safeAddress;
  const chain = req.query.chain === 'bnb' ? 'bnb' : 'base';

  if (!ethers.isAddress(raw)) {
    return res.status(400).json({ message: 'Invalid address' });
  }

  const safeAddress = raw.toLowerCase();

  // ── Per-address lock ──────────────────────────────────────────────────────
  const lockKey = `${chain}:${safeAddress}`;
  if (syncLocks.get(lockKey)) {
    return res.json({ synced: 0, skipped: true, reason: 'sync already in progress' });
  }
  syncLocks.set(lockKey, true);

  // ── BNB: queue globally — only one BNB scan runs at a time ───────────────
  if (chain === 'bnb') {
    // Check if BNB queue is already backed up — if so, skip rather than pile up
    if (bnbSyncQueue.length >= 3) {
      syncLocks.delete(lockKey);
      return res.json({ synced: 0, skipped: true, reason: 'bnb sync queue full' });
    }
    try {
      const result = await enqueueBNBSync(() => runSync(safeAddress, chain));
      return res.json(result);
    } catch (err) {
      console.error('❌ BNB sync queue error:', err.message);
      return res.json({ synced: 0, error: err.message });
    } finally {
      syncLocks.delete(lockKey);
    }
  }

  try {
    const result = await runSync(safeAddress, chain);
    return res.json(result);
  } catch (err) {
    console.error('❌ /sync-incoming unhandled error:', err.message);
    return res.json({ synced: 0, error: err.message });
  } finally {
    syncLocks.delete(lockKey);
  }
});

// ── Core sync logic extracted so it can be called from queue or directly ─────
async function runSync(safeAddress, chain) {
  const {
    logsRpcUrl,
    tokens: rawTokens,
    factoryAddress,
    blockRange,
    chunkSize,
    chunkDelayMs,
    tokenDelayMs,
  } = getChainConfig(chain);

  const provider = new ethers.JsonRpcProvider(logsRpcUrl, undefined, { batchMaxCount: 1 });
  const tokens = await resolveDecimals(rawTokens, factoryAddress, provider);

  console.log(
    `🔍 sync-incoming: address=${safeAddress} chain=${chain} rpc=${logsRpcUrl.replace(/\/\/.*@/, '//***@')}`
  );

  let recipient = await User.findOne({ safeAddress }).catch(() => null);
  if (!recipient && chain === 'bnb') {
    try {
      const l1db = require('../services/l1db');
      if (l1db.readyState === 1) {
        const UserBNBModel = require('../models/UserBNB');
        const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBModel);
        recipient = await UserBNB.findOne({ safeAddress }).catch(() => null);
      }
    } catch (e) {
      console.warn('⚠️ sync-incoming: BNB user lookup failed:', e.message);
    }
  }

  if (!recipient) return { synced: 0 };

  let latestBlock;
  try {
    latestBlock = await provider.getBlockNumber();
  } catch (blockErr) {
    console.error(`❌ sync-incoming: could not fetch latest block (${chain}): ${blockErr.message}`);
    return { synced: 0, error: 'Could not reach RPC' };
  }

  const fromBlock = Math.max(0, latestBlock - blockRange);
  console.log(
    `📦 sync-incoming: blocks ${fromBlock}–${latestBlock} (${latestBlock - fromBlock + 1} blocks, chunk=${chunkSize})`
  );

  let synced = 0;

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti];
    if (!token.address || !ethers.isAddress(token.address)) continue;
    if (ti > 0) await sleep(tokenDelayMs);

    console.log(
      `🔎 sync-incoming [${chain}]: scanning ${token.symbol} (${token.address.slice(0, 10)}…)`
    );

    const logs = await scanTokenIncoming(
      provider,
      token.address,
      token.symbol,
      safeAddress,
      fromBlock,
      latestBlock,
      chunkSize,
      chunkDelayMs,
      chain
    );

    if (logs === null) {
      console.error(`❌ Aborting ${token.symbol} scan due to fatal RPC error`);
      break;
    }

    if (!logs || logs.length === 0) {
      console.warn(`⚠️ No logs for ${token.symbol} — skipping token`);
      continue;
    }

    console.log(
      `📨 sync-incoming [${chain}]: ${logs.length} ${token.symbol} transfer(s) to process`
    );

    for (const log of logs) {
      const txHash = log.transactionHash;

      try {
        const exists = await Transaction.findOne({
          taskId: txHash,
          coin: token.symbol,
          toAddress: safeAddress,
        }).lean();
        if (exists) continue;
      } catch (dedupErr) {
        console.error('❌ sync-incoming dedup query error:', dedupErr.message);
        continue;
      }

      let fromAddress, rawAmount;
      try {
        fromAddress = ethers.getAddress('0x' + log.topics[1].slice(-40));
        rawAmount = BigInt(log.data || '0x0');
      } catch (decodeErr) {
        console.error('❌ sync-incoming log decode error:', decodeErr.message);
        continue;
      }

      if (fromAddress.toLowerCase() === safeAddress) continue;
      if (rawAmount === 0n) continue;

      let date = new Date();
      try {
        const block = await provider.getBlock(log.blockNumber);
        if (block?.timestamp) date = new Date(block.timestamp * 1000);
      } catch {
        /* fallback to now */
      }

      const amount = parseFloat(ethers.formatUnits(rawAmount, token.decimals)).toFixed(2);

      let fromNameAlias = null;
      let fromUsername = null;
      try {
        let sender = await User.findOne({ safeAddress: fromAddress.toLowerCase() }).lean();
        if (!sender && chain === 'bnb') {
          const l1db = require('../services/l1db');
          if (l1db.readyState === 1) {
            const UserBNBModel = require('../models/UserBNB');
            const UserBNB = l1db.models.UserBNB || l1db.model('UserBNB', UserBNBModel);
            sender = await UserBNB.findOne({ safeAddress: fromAddress.toLowerCase() })
              .lean()
              .catch(() => null);
          }
        }
        fromNameAlias = sender?.nameAlias || null;
        fromUsername = sender?.username || null;
      } catch {
        /* not a Salva user */
      }

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
        console.log(`✅ sync-incoming: saved ${token.symbol} transfer ${txHash} → ${safeAddress}`);
      } catch (saveErr) {
        if (saveErr.code === 11000) continue;
        console.error('❌ sync-incoming Transaction.create error:', saveErr.message);
        continue;
      }

      if (recipient.email) {
        sendTransactionEmailToReceiver(
          recipient.email,
          recipient.username,
          fromNameAlias || fromUsername || fromAddress.toLowerCase(),
          amount,
          token.symbol
        ).catch((emailErr) => console.error('📧 sync-incoming email error:', emailErr.message));
      }
    }
  }

  console.log(`✅ sync-incoming complete: chain=${chain} address=${safeAddress} synced=${synced}`);
  return { synced, scannedBlocks: latestBlock - fromBlock + 1 };
}

module.exports = router;

/**
 * 
{
  "_id": {
    "$oid": "6a259ee312531593b749533e"
  },
  "registryAddress": "0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6",
  "__v": 0,
  "active": true,
  "createdAt": {
    "$date": "2026-06-07T16:40:02.476Z"
  },
  "description": "",
  "name": "Salva Wallet 5",
  "nspace": "@salva5"
}
 */
