// packages/backend/src/routes/sant.js
const express = require('express');
const router = express.Router();

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { verifyPin, decryptPrivateKey } = require('../utils/encryption');
const { mintSant, getSantAddress } = require('../services/santMint');
const { getClaimVisibility } = require('../services/pointsService');
const { ethers } = require('ethers');
const { provider } = require('../services/walletSigner');
const { _executeViaSafeBase } = require('../services/relayService');
const { resolveGasFee } = require('../services/gasOracle');
const {
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
} = require('../services/emailService');

const SANT_DECIMALS = 18; // hardcoded — never derived elsewhere, per spec

// ── MultiSend plumbing — identical pattern to pool.js / relayService.js ──────
const MULTISEND_ADDR = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
const ERC20_TRANSFER_IFACE = new ethers.Interface([
  'function transfer(address to, uint256 amount) returns (bool)',
]);
const ERC20_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

function _encodeMultiSendTx(to, data) {
  const dataBytes = ethers.getBytes(data);
  const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
  let offset = 0;
  buf[offset++] = 0; // CALL
  ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
  ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
  ethers
    .getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32))
    .forEach((b) => (buf[offset++] = b));
  dataBytes.forEach((b) => (buf[offset++] = b));
  return buf;
}
function _buildMultiSend(calls) {
  return new ethers.Interface([
    'function multiSend(bytes memory transactions) public payable',
  ]).encodeFunctionData('multiSend', [
    ethers.concat(calls.map((c) => _encodeMultiSendTx(c.to, c.data))),
  ]);
}

/**
 * Resolves which token the user pays the network fee in, in priority order:
 * NGNs → cNGN → USDT → USDC. All Base tokens are hardcoded 6 decimals.
 * feeNGN and feeUSD are the SAME underlying gas cost, just denominated in
 * each currency's terms via the live buffered exchange rate — exactly what
 * estimateTransferFee already computes.
 */
async function _resolveFeeTokenBase(safeAddress, feeNGN, feeUSD) {
  const candidates = [
    { symbol: 'NGNs', address: process.env.NGN_TOKEN_ADDRESS, feeAmount: feeNGN },
    { symbol: 'cNGN', address: process.env.CNGN_CONTRACT_ADDRESS, feeAmount: feeNGN },
    { symbol: 'USDT', address: process.env.USDT_CONTRACT_ADDRESS, feeAmount: feeUSD },
    { symbol: 'USDC', address: process.env.USDC_CONTRACT_ADDRESS, feeAmount: feeUSD },
  ];
  for (const c of candidates) {
    if (!c.address) continue;
    try {
      const contract = new ethers.Contract(ethers.getAddress(c.address), ERC20_BAL_ABI, provider);
      const balWei = await contract.balanceOf(ethers.getAddress(safeAddress));
      const balNum = parseFloat(ethers.formatUnits(balWei, 6)); // Base: all tokens hardcoded 6
      if (balNum >= c.feeAmount) {
        const feeWei = ethers.parseUnits(c.feeAmount.toFixed(6), 6);
        console.log(
          `✅ [SANT fee] Using ${c.symbol} — balance=${balNum.toFixed(4)} fee=${c.feeAmount}`
        );
        return { tokenAddress: c.address, symbol: c.symbol, feeWei };
      }
      console.log(
        `⏭️ [SANT fee] Skip ${c.symbol}: balance=${balNum.toFixed(4)} < fee=${c.feeAmount}`
      );
    } catch (e) {
      console.warn(`⚠️ [SANT fee] Balance check failed for ${c.symbol}:`, e.message);
    }
  }
  return null;
}

function sanitizeEmail(email) {
  const validator = require('validator');
  if (typeof email !== 'string') throw new Error('Invalid email');
  const s = email.trim().toLowerCase();
  if (!validator.isEmail(s)) throw new Error('Invalid email format');
  return s;
}

// ── GET /api/sant/balance/:address ────────────────────────────────────────────
// SANT is Base-only, hardcoded 18 decimals. No NGN/USD conversion rate exists
// yet (no liquidity pool), so the frontend always displays 0.00 for both.
router.get('/balance/:address', async (req, res) => {
  try {
    const { address } = req.params;
    if (!ethers.isAddress(address)) {
      return res.status(400).json({ message: 'Invalid address format' });
    }

    const ERC20_ABI = ['function balanceOf(address) view returns (uint256)'];
    const contract = new ethers.Contract(getSantAddress(), ERC20_ABI, provider);

    let balanceWei = 0n;
    try {
      balanceWei = await contract.balanceOf(address);
    } catch (e) {
      console.error('❌ [sant/balance] balanceOf failed:', e.message);
    }

    res.json({
      santBalance: ethers.formatUnits(balanceWei, SANT_DECIMALS),
      // No price feed exists yet — always 0 until liquidity launches.
      nairaValue: '0.00',
      usdValue: '0.00',
    });
  } catch (err) {
    console.error('❌ /sant/balance:', err.message);
    res.status(200).json({ santBalance: '0.00', nairaValue: '0.00', usdValue: '0.00' });
  }
});

// ── POST /api/sant/transfer ────────────────────────────────────────────────────
// Sends SANT (no fee on the SANT leg itself) bundled with a network-fee leg
// paid in whatever token the user actually holds — NGNs → cNGN → USDT → USDC,
// same priority fallback used everywhere else in the app. Both legs execute
// atomically via MultiSend through the user's Safe, exactly one signed tx.
//
// Body: { safeAddress, userPrivateKey, recipientAddress, amount }
router.post('/transfer', async (req, res) => {
  try {
    const { safeAddress, userPrivateKey, recipientAddress, amount, senderDisplayIdentifier } =
      req.body;

    if (!safeAddress || !ethers.isAddress(safeAddress))
      return res.status(400).json({ message: 'Invalid safe address' });
    if (!recipientAddress || !ethers.isAddress(recipientAddress))
      return res.status(400).json({ message: 'Invalid recipient address' });
    if (!userPrivateKey) return res.status(400).json({ message: 'Private key required' });

    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0)
      return res.status(400).json({ message: 'Invalid amount' });

    const santAddress = getSantAddress();
    const santContract = new ethers.Contract(santAddress, ERC20_BAL_ABI, provider);
    const balanceWei = await santContract.balanceOf(safeAddress);
    const balanceNum = parseFloat(ethers.formatUnits(balanceWei, SANT_DECIMALS));

    if (balanceNum < amountNum)
      return res.status(400).json({ message: 'Insufficient SANT balance' });

    const amountWei = ethers.parseUnits(amount.toString(), SANT_DECIMALS);

    // ── Balance-aware fee resolution — simulates using whichever token has
    // real balance, never a fabricated amount, and blocks outright if the
    // Safe genuinely holds zero across all four fee-payable tokens.
    const santActionCalls = [
      {
        to: santAddress,
        data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
          ethers.getAddress(recipientAddress),
          amountWei,
        ]),
        from: ethers.getAddress(safeAddress),
      },
    ];
    const santResolved = await resolveGasFee('base', safeAddress, 1, () => santActionCalls);
    if (santResolved.noBalance) {
      return res.status(400).json({
        message: 'CANNOT PROCEED: you have no NGNs, cNGN, USDT, or USDC balance to cover the network fee.',
      });
    }
    if (santResolved.insufficientFee) {
      return res.status(400).json({
        message: `Insufficient balance for network fee. Need ₦${santResolved.feeNGN.toFixed(2)} in NGNs/cNGN, or $${santResolved.feeUSD.toFixed(4)} in USDT/USDC.`,
      });
    }
    const feeToken = santResolved.payToken;
    const feeNGN = santResolved.feeNGN;
    const feeUSD = santResolved.feeUSD;

    const treasuryAddress = process.env.TREASURY_CONTRACT_ADDRESS;
    if (!treasuryAddress) return res.status(500).json({ message: 'Treasury not configured' });

    // ── Look up sender/recipient for username + nameAlias — same as the
    // main transfer queue processor does, so history displays identically.
    const senderUser = await User.findOne({ safeAddress: safeAddress.toLowerCase() }).catch(
      () => null
    );
    const recipientUser = await User.findOne({ safeAddress: recipientAddress.toLowerCase() }).catch(
      () => null
    );

    // ── Bundle: SANT transfer + fee transfer, one Safe tx via MultiSend ──────
    const calls = [
      {
        to: santAddress,
        data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
          ethers.getAddress(recipientAddress),
          amountWei,
        ]),
      },
      {
        to: ethers.getAddress(feeToken.tokenAddress),
        data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
          ethers.getAddress(treasuryAddress),
          feeToken.feeWei,
        ]),
      },
    ];
    const msData = _buildMultiSend(calls);

    let result;
    try {
      result = await _executeViaSafeBase(
        ethers.getAddress(safeAddress),
        userPrivateKey,
        MULTISEND_ADDR,
        msData,
        1
      );
    } catch (broadcastErr) {
      // Record the failure so it shows up in history, same as the main
      // transfer flow does when broadcast itself throws.
      await new Transaction({
        fromAddress: safeAddress.toLowerCase(),
        fromUsername: senderUser?.username || null,
        fromNameAlias: senderUser?.nameAlias || null,
        toAddress: recipientAddress.toLowerCase(),
        toUsername: recipientUser?.username || null,
        toNameAlias: recipientUser?.nameAlias || null,
        senderDisplayIdentifier: senderDisplayIdentifier || recipientAddress,
        amount: String(amount),
        fee: `${feeToken.feeWei ? ethers.formatUnits(feeToken.feeWei, 6) : '0'} ${feeToken.symbol}`,
        coin: 'SANT',
        status: 'failed',
        taskId: null,
        type: 'transfer',
        date: new Date(),
      })
        .save()
        .catch(() => {});
      console.error('❌ [SANT] Broadcast failed:', broadcastErr.message);
      return res.status(500).json({ message: 'SANT transfer failed to broadcast' });
    }

    if (!result || !result.txHash) {
      await new Transaction({
        fromAddress: safeAddress.toLowerCase(),
        fromUsername: senderUser?.username || null,
        fromNameAlias: senderUser?.nameAlias || null,
        toAddress: recipientAddress.toLowerCase(),
        toUsername: recipientUser?.username || null,
        toNameAlias: recipientUser?.nameAlias || null,
        senderDisplayIdentifier: senderDisplayIdentifier || recipientAddress,
        amount: String(amount),
        fee: `${feeToken.feeWei ? ethers.formatUnits(feeToken.feeWei, 6) : '0'} ${feeToken.symbol}`,
        coin: 'SANT',
        status: 'failed',
        taskId: null,
        type: 'transfer',
        date: new Date(),
      })
        .save()
        .catch(() => {});
      return res.status(500).json({ message: 'SANT transfer failed to broadcast' });
    }

    const receipt = await provider.waitForTransaction(result.txHash, 1, 120_000);
    const success = receipt && receipt.status === 1;

    // ── Record the transaction — success or on-chain revert — exactly the
    // same shape the main transfer queue processor writes, so it renders
    // correctly on the Transactions page with no special-casing.
    await new Transaction({
      fromAddress: safeAddress.toLowerCase(),
      fromUsername: senderUser?.username || null,
      fromNameAlias: senderUser?.nameAlias || null,
      toAddress: recipientAddress.toLowerCase(),
      toUsername: recipientUser?.username || null,
      toNameAlias: recipientUser?.nameAlias || null,
      senderDisplayIdentifier: senderDisplayIdentifier || recipientAddress,
      amount: String(amount),
      fee: `${ethers.formatUnits(feeToken.feeWei, 6)} ${feeToken.symbol}`,
      coin: 'SANT',
      status: success ? 'successful' : 'failed',
      taskId: result.txHash,
      type: 'transfer',
      date: new Date(),
    }).save();

    if (!success) return res.status(400).json({ message: 'SANT transfer reverted on-chain' });

    // ── Email notifications — same pair the main queue processor sends on
    // every successful transfer: one to the sender, one to the receiver.
    if (senderUser?.email) {
      try {
        await sendTransactionEmailToSender(
          senderUser.email,
          senderUser.username,
          senderDisplayIdentifier || recipientAddress,
          amount,
          'successful',
          'SANT'
        );
      } catch (emailErr) {
        console.error('📧 [SANT] Sender email error:', emailErr.message);
      }
    }
    if (recipientUser?.email) {
      try {
        await sendTransactionEmailToReceiver(
          recipientUser.email,
          recipientUser.username,
          safeAddress,
          amount,
          'SANT'
        );
      } catch (emailErr) {
        console.error('📧 [SANT] Receiver email error:', emailErr.message);
      }
    }

    console.log(
      `✅ [SANT] Transfer: ${amount} SANT ${safeAddress} → ${recipientAddress} (fee paid in ${feeToken.symbol})`
    );
    res.json({ success: true, txHash: result.txHash, feeSymbol: feeToken.symbol });
  } catch (err) {
    console.error('❌ /sant/transfer:', err.message);
    res.status(500).json({ message: err.message || 'SANT transfer failed' });
  }
});

// Lazily resolves UserBNB off the l1db connection — same pattern as everywhere else.
function getUserBNBModel() {
  const l1db = require('../services/l1db');
  const UserBNBSchema = require('../models/UserBNB');
  return l1db.models.UserBNB || l1db.model('UserBNB', UserBNBSchema);
}

// ── GET /api/sant/claim-status/:email ─────────────────────────────────────────
// Returns everything the SANT wallet tab needs to render the claim button:
// visible (show the button at all), active (button enabled vs blurred),
// and the point breakdown. Drives the "hide once cap hit + 0 points" rule.
router.get('/claim-status/:email', async (req, res) => {
  try {
    const email = sanitizeEmail(req.params.email);

    const baseUser = await User.findOne({ email }).select('santPoints safeAddress');
    if (!baseUser) return res.status(404).json({ message: 'User not found' });

    let bnbPoints = 0;
    try {
      const l1db = require('../services/l1db');
      if (l1db.readyState === 1) {
        const UserBNB = getUserBNBModel();
        const bnbUser = await UserBNB.findOne({ email }).select('santPoints');
        bnbPoints = bnbUser?.santPoints || 0;
      }
    } catch (e) {
      console.warn('⚠️ [sant/claim-status] Could not read BNB points:', e.message);
    }

    const basePoints = baseUser.santPoints || 0;
    const visibility = await getClaimVisibility(basePoints, bnbPoints);

    res.json({
      basePoints,
      bnbPoints,
      totalPoints: basePoints + bnbPoints,
      visible: visibility.visible,
      active: visibility.active,
    });
  } catch (err) {
    console.error('❌ /sant/claim-status:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── POST /api/sant/claim ──────────────────────────────────────────────────────
// Sums Base + BNB points, mints that many SANT to the user's Base address,
// and only resets both point ledgers to 0 AFTER the mint is confirmed
// on-chain. Requires PIN verification so a leaked email alone can't drain
// someone's accrued points.
//
// Body: { email, pin }
router.post('/claim', async (req, res) => {
  const email = (() => {
    try {
      return sanitizeEmail(req.body.email);
    } catch {
      return null;
    }
  })();
  if (!email) return res.status(400).json({ message: 'Valid email required' });

  const { pin } = req.body;
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
  }

  try {
    const baseUser = await User.findOne({ email });
    if (!baseUser) return res.status(404).json({ message: 'User not found' });
    if (!baseUser.transactionPin) {
      return res.status(400).json({ message: 'No PIN set. Please set your PIN first.' });
    }
    if (!verifyPin(pin, baseUser.transactionPin)) {
      return res.status(401).json({ message: 'Invalid PIN' });
    }

    // ── Lock staleness window — a lock older than this is treated as
    // abandoned (crashed request, closed tab mid-flight, etc.) and can be
    // safely re-acquired.
    //
    // CRITICAL: uses $ne / $not-$gte so it correctly matches THREE distinct
    // states as "claimable" — not just two:
    //   1. santClaimInProgress is explicitly false
    //   2. santClaimInProgress field is MISSING entirely (old documents
    //      created before this field existed in the schema — Mongoose's
    //      schema default only hydrates in JS, it does NOT retroactively
    //      match raw Mongo queries against already-stored documents)
    //   3. santClaimInProgress is true but the lock is stale (timestamp
    //      older than the window, or missing entirely)
    const STALE_LOCK_MS = 2 * 60 * 1000; // 2 minutes
    const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
    const lockQuery = (extra) => ({
      ...extra,
      $or: [
        { santClaimInProgress: { $ne: true } }, // false OR missing entirely
        { santClaimInProgress: true, santClaimStartedAt: { $not: { $gte: staleThreshold } } }, // stale OR missing timestamp
      ],
    });

    // ── Lock Base ────────────────────────────────────────────────────────
    const lockedUser = await User.findOneAndUpdate(
      lockQuery({ email }),
      { $set: { santClaimInProgress: true, santClaimStartedAt: new Date() } },
      { new: true }
    );
    if (!lockedUser) {
      return res.status(409).json({
        message: 'A claim is already in progress for this account. Please wait and try again.',
      });
    }

    // ── Resolve BNB — wait out any transient L1DB connection state before
    // deciding whether this user has a BNB wallet. Silently treating "not
    // ready yet" as "no BNB wallet" would mint base-only and strand the
    // user's real BNB points with no error surfaced — must never happen.
    let UserBNB = null;
    let bnbUser = null;
    let bnbWalletExists = false;
    let l1dbUnavailable = false;

    const l1db = require('../services/l1db');
    if (l1db.readyState !== 1) {
      await Promise.race([
        l1db.readyPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('L1DB timeout')), 12000)),
      ]).catch(() => {});
    }

    if (l1db.readyState === 1) {
      // Connection confirmed live — a null result here means the user
      // genuinely has no BNB wallet, which is normal, not a failure.
      try {
        UserBNB = getUserBNBModel();
        const bnbDoc = await UserBNB.findOne({ email });
        bnbWalletExists = !!bnbDoc;
      } catch (e) {
        console.error('❌ [sant/claim] BNB wallet lookup failed after DB ready:', e.message);
        l1dbUnavailable = true;
      }
    } else {
      // Connection never came up even after waiting — we cannot tell
      // whether this user has a BNB wallet, so we must not guess.
      console.error('❌ [sant/claim] L1DB still unreachable after wait — aborting claim');
      l1dbUnavailable = true;
    }

    if (l1dbUnavailable) {
      await User.updateOne(
        { email },
        { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
      );
      return res.status(503).json({
        message:
          'Could not verify your BNB chain points right now. Please try again in a moment — your points are untouched.',
      });
    }

    // ── Lock BNB (only if a wallet actually exists) ──────────────────────
    if (bnbWalletExists) {
      bnbUser = await UserBNB.findOneAndUpdate(
        lockQuery({ email }),
        { $set: { santClaimInProgress: true, santClaimStartedAt: new Date() } },
        { new: true }
      );

      if (!bnbUser) {
        // BNB side is genuinely locked by another in-flight claim (and not
        // stale). Release the Base lock and abort entirely — never proceed
        // with a partial claim that strands BNB points.
        await User.updateOne(
          { email },
          { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
        );
        return res.status(409).json({
          message: 'A claim is already in progress for this account. Please wait and try again.',
        });
      }
    }

    // ── Compute claimable total from the LOCKED snapshot — base + bnb ────
    const basePointsAtClaim = lockedUser.santPoints || 0;
    const bnbPointsAtClaim = bnbUser?.santPoints || 0;
    const totalPoints = basePointsAtClaim + bnbPointsAtClaim;

    if (totalPoints <= 0) {
      await User.updateOne(
        { email },
        { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
      );
      if (bnbUser) {
        await UserBNB.updateOne(
          { email },
          { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
        );
      }
      return res.status(400).json({ message: 'No points available to claim.' });
    }

    // ── Mint on-chain — must succeed before ANY DB reset happens ────────────
    let mintResult;
    try {
      mintResult = await mintSant(lockedUser.safeAddress, totalPoints);
    } catch (mintErr) {
      console.error('❌ [sant/claim] Mint failed:', mintErr.message);
      await User.updateOne(
        { email },
        { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
      );
      if (bnbUser) {
        await UserBNB.updateOne(
          { email },
          { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
        );
      }
      return res.status(500).json({
        message: 'SANT mint failed on-chain. Your points are safe — please try again.',
      });
    }

    // ── Mint confirmed — now, and only now, decrement by the claimed amount ─
    await User.updateOne(
      { email },
      {
        $inc: { santPoints: -basePointsAtClaim },
        $set: { santClaimInProgress: false, santClaimStartedAt: null },
      }
    );
    if (bnbUser) {
      await UserBNB.updateOne(
        { email },
        {
          $inc: { santPoints: -bnbPointsAtClaim },
          $set: { santClaimInProgress: false, santClaimStartedAt: null },
        }
      );
    }

    console.log(
      `✅ [SANT] Claim complete: ${email} claimed ${totalPoints} SANT (base=${basePointsAtClaim}, bnb=${bnbPointsAtClaim}) tx=${mintResult.txHash}`
    );

    res.json({
      success: true,
      claimedAmount: totalPoints,
      txHash: mintResult.txHash,
      mintedTo: lockedUser.safeAddress,
    });
  } catch (err) {
    console.error('❌ /sant/claim:', err.message);
    try {
      await User.updateOne(
        { email },
        { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
      );
      const l1db = require('../services/l1db');
      if (l1db.readyState === 1) {
        const UserBNB2 = getUserBNBModel();
        await UserBNB2.updateOne(
          { email },
          { $set: { santClaimInProgress: false, santClaimStartedAt: null } }
        );
      }
    } catch {
      /* best-effort only */
    }
    res.status(500).json({ message: err.message || 'Claim failed' });
  }
});

module.exports = router;
