// backend/src/routes/syncIncoming.js
const express = require("express");
const { ethers } = require("ethers");
const router = express.Router();

const Transaction = require("../models/Transaction");
const User = require("../models/User");
const { sendTransactionEmailToReceiver } = require("../services/emailService");

// ── Provider ──────────────────────────────────────────────────────────────────
const rpcUrl =
  process.env.NODE_ENV === "production"
    ? "https://base-rpc.publicnode.com"
    : "https://base-sepolia-rpc.publicnode.com";

const provider = new ethers.JsonRpcProvider(rpcUrl);

// ── ERC20 Transfer(address indexed from, address indexed to, uint256 value) ──
const TRANSFER_TOPIC = ethers.id("Transfer(address,address,uint256)");

// ── Token list ────────────────────────────────────────────────────────────────
const getTokens = () => [
  { address: process.env.NGN_TOKEN_ADDRESS,    symbol: "NGN",  decimals: 6 },
  { address: process.env.CNGN_CONTRACT_ADDRESS, symbol: "CNGN", decimals: 6 },
  { address: process.env.USDT_CONTRACT_ADDRESS, symbol: "USDT", decimals: 6 },
  { address: process.env.USDC_CONTRACT_ADDRESS, symbol: "USDC", decimals: 6 },
];

// Pad an address into a 32-byte log topic
const toTopic = (addr) =>
  "0x" + addr.replace("0x", "").toLowerCase().padStart(64, "0");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sync-incoming/:safeAddress
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:safeAddress", async (req, res) => {
  const raw = req.params.safeAddress;

  if (!ethers.isAddress(raw)) {
    return res.status(400).json({ message: "Invalid address" });
  }

  const safeAddress = raw.toLowerCase();

  try {
    // ── 1. Confirm this is a Salva user ──────────────────────────────────────
    const recipient = await User.findOne({ safeAddress }).catch(() => null);
    if (!recipient) {
      return res.json({ synced: 0 });
    }

    // ── 2. Block range: last 1,000 blocks (~33 min on Base) ──────────────────
    const latestBlock = await provider.getBlockNumber();
    const blockRange = 500;
    const fromBlock = Math.max(0, latestBlock - blockRange);

    let synced = 0;

    // ── 3. Scan each token ───────────────────────────────────────────────────
    for (const token of getTokens()) {
      if (!token.address || !ethers.isAddress(token.address)) continue;

      let logs = [];
      try {
        logs = await provider.getLogs({
          fromBlock,
          toBlock: latestBlock,
          address: ethers.getAddress(token.address),
          topics: [
            TRANSFER_TOPIC,
            null, // from: any
            toTopic(safeAddress), // to: this Safe only
          ],
        });
      } catch (logsErr) {
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
          console.error("❌ Dedup query error:", dedupErr.message);
          continue;
        }

        // ── 3b. Decode log ───────────────────────────────────────────────────
        let fromAddress, rawAmount;
        try {
          fromAddress = ethers.getAddress("0x" + log.topics[1].slice(26));
          rawAmount = BigInt(log.data);
        } catch (decodeErr) {
          console.error("❌ Log decode error:", decodeErr.message);
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
        const amount = parseFloat(
          ethers.formatUnits(rawAmount, token.decimals),
        ).toFixed(2);

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
            status: "successful",
            date,
            fromAddress: fromAddress.toLowerCase(),
            fromNameAlias,
            fromUsername,
            toAddress: safeAddress,
            toNameAlias: recipient.nameAlias || null,
            toUsername: recipient.username || null,
            senderDisplayIdentifier:
              fromNameAlias || fromUsername || fromAddress.toLowerCase(),
            fee: "0",
            type: "transfer",
          });

          synced++;
          console.log(
            `✅ sync-incoming: saved ${token.symbol} transfer ${txHash} → ${safeAddress}`,
          );
        } catch (saveErr) {
          // Duplicate key on taskId is expected on concurrent calls — not a real error
          if (saveErr.code === 11000) continue;
          console.error("❌ Transaction.create error:", saveErr.message);
          continue;
        }

        // ── 3h. Email recipient (non-blocking) ───────────────────────────────
        if (recipient.email) {
          const senderDisplay =
            fromNameAlias || fromUsername || fromAddress.toLowerCase();
          sendTransactionEmailToReceiver(
            recipient.email,
            recipient.username,
            senderDisplay,
            amount,
            token.symbol,   // ← actual coin: NGN / USDT / USDC
          ).catch((emailErr) => {
            console.error("📧 sync-incoming email error:", emailErr.message);
          });
        }
      }
    }

    return res.json({ synced, scannedBlocks: latestBlock - fromBlock });
  } catch (err) {
    console.error("❌ /sync-incoming error:", err.message);
    return res.json({ synced: 0, error: err.message });
  }
});

module.exports = router;