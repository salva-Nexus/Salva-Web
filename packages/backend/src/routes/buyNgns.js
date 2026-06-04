// packages/backend/src/routes/buyNgns.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { Resend } = require('resend');
const User = require('../models/User');
const MintRequest = require('../models/MintRequest');

let Transaction;
try {
  Transaction = require('../models/Transaction');
} catch {
  /* no tx model */
}

const resend = new Resend(process.env.RESEND_API_KEY);
console.log('🚀 BUY NGNs ROUTES INITIALIZED (v3.1.0)');

const ERC20_MINT_ABI = [
  'function mint(address to, uint256 amount) external',
  'function decimals() view returns (uint8)',
];

const ERC20_BURN_ABI = [
  'function burn(address from, uint256 amount) external',
  'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
];

const OtcConfig = require('../models/OtcConfig');
const { getL1TokenDecimals } = require('../utils/l1Decimals');

async function getOtcConfig() {
  let config = await OtcConfig.findById('main');
  if (!config) config = await OtcConfig.create({ _id: 'main' });
  return config;
}

function computeFee(amountNgn, feePercent) {
  return Math.round(amountNgn * (feePercent / 100));
}

function getBackendSigner(isL1 = false) {
  let rpcUrl;
  if (isL1) {
    rpcUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.BNB_MAINNET_RPC_URL
        : process.env.BNB_TESTNET_RPC_URL;
  } else {
    rpcUrl =
      process.env.NODE_ENV === 'production'
        ? process.env.BASE_MAINNET_RPC_URL
        : process.env.BASE_SEPOLIA_RPC_URL;
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const pk = process.env.MANAGER_PRIVATE_KEY;
  if (!pk) throw new Error('MANAGER_PRIVATE_KEY not set in .env');
  return new ethers.Wallet(pk, provider);
}

// ── Email helpers ──────────────────────────────────────────────────────────

function emailBase(bodyHtml) {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0A0A0B;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0B;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;background:#111113;border:1px solid #1f1f22;border-radius:20px;overflow:hidden;">
        <!-- Gold top bar -->
        <tr><td style="height:4px;background:linear-gradient(90deg,transparent,#D4AF37,transparent);"></td></tr>
        <!-- Logo -->
        <tr><td style="padding:32px 36px 0;">
          <p style="margin:0;font-size:26px;font-weight:900;letter-spacing:0.12em;color:#D4AF37;">SALVA</p>
          <p style="margin:4px 0 0;font-size:10px;color:#555;letter-spacing:0.3em;text-transform:uppercase;">Digital Finance · Base Network</p>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:28px 36px 36px;">
          ${bodyHtml}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:0 36px 28px;border-top:1px solid #1f1f22;">
          <p style="margin:20px 0 0;font-size:11px;color:#444;line-height:1.6;">
            This is an automated message from <span style="color:#D4AF37;">Salva</span>. Do not reply to this email.<br>
            © ${new Date().getFullYear()} Salva Digital Tech · <a href="https://salva-nexus.org" style="color:#D4AF37;text-decoration:none;">salva-nexus.org</a>
          </p>
        </td></tr>
        <!-- Gold bottom bar -->
        <tr><td style="height:3px;background:linear-gradient(90deg,transparent,#D4AF37,transparent);"></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function statBadge(label, value, color = '#D4AF37') {
  return `
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #1f1f22;border-radius:12px;margin:8px 0;">
    <tr>
      <td style="padding:14px 18px;">
        <p style="margin:0;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.25em;">${label}</p>
        <p style="margin:4px 0 0;font-size:18px;font-weight:900;color:${color};">${value}</p>
      </td>
    </tr>
  </table>`;
}

function txHashBlock(hash) {
  if (!hash) return '';
  return `
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #1f1f22;border-radius:12px;margin:8px 0;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.25em;">Transaction Hash</p>
      <p style="margin:4px 0 0;font-size:11px;font-family:monospace;color:#D4AF37;word-break:break-all;">${hash}</p>
    </td></tr>
  </table>`;
}

function ctaButton(label, href, color = '#D4AF37') {
  return `
  <table cellpadding="0" cellspacing="0" style="margin:20px 0 0;">
    <tr><td style="background:${color};border-radius:10px;">
      <a href="${href}" style="display:block;padding:14px 28px;font-size:12px;font-weight:900;color:#000;text-decoration:none;text-transform:uppercase;letter-spacing:0.15em;">${label}</a>
    </td></tr>
  </table>`;
}

async function sendEmail(to, subject, bodyHtml) {
  if (!to) return;
  try {
    await resend.emails.send({
      from: 'SALVA <no-reply@salva-nexus.org>',
      to,
      subject,
      html: emailBase(bodyHtml),
    });
    console.log(`📧 Email sent → ${to} | ${subject}`);
  } catch (e) {
    console.error(`❌ Email failed (${to}):`, e.message);
  }
}

async function notifySellers(subject, bodyHtml) {
  const sellers = await User.find({ isSeller: true }).select('email username');
  for (const s of sellers) {
    if (!s.email) continue;
    await sendEmail(s.email, subject, bodyHtml);
  }
}

// ── BUY emails ─────────────────────────────────────────────────────────────

function buyInitiatedUserEmail(username, amount, feeNgn, mintAmount, bankName, acctName, acctNum) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;">Buy Request Initiated</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, your NGNs purchase request has been received.</p>
  ${statBadge('You Pay', `₦${parseFloat(amount).toLocaleString()}`)}
  ${feeNgn > 0 ? statBadge('Platform Fee', `${feeNgn.toLocaleString()} NGNs`, '#ef4444') : ''}
  ${statBadge('You Will Receive', `${parseFloat(mintAmount).toLocaleString()} NGNs`, '#22c55e')}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #D4AF37;border-radius:12px;margin:16px 0;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:0.25em;font-weight:900;">Payment Instructions</p>
      <p style="margin:10px 0 0;font-size:13px;color:#fff;">Transfer exactly <strong style="color:#D4AF37;">₦${parseFloat(amount).toLocaleString()}</strong> to:</p>
      <p style="margin:8px 0 0;font-size:13px;color:#ccc;">🏦 <strong>${bankName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">👤 <strong>${acctName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">🔢 <strong>${acctNum}</strong></p>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">After making the transfer, upload your receipt in the Salva app and tap <strong style="color:#fff;">"I Have Paid"</strong>. Our team will verify and mint your NGNs typically within 30 minutes.</p>
  ${ctaButton('Open Salva App', 'https://salva-nexus.org')}`;
}

function buyInitiatedSellerEmail(username, amount, feeNgn, mintAmount) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;">New Buy Request</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;"><strong style="color:#fff;">${username}</strong> wants to purchase NGNs.</p>
  ${statBadge('Amount Requested', `₦${parseFloat(amount).toLocaleString()}`)}
  ${feeNgn > 0 ? statBadge('Fee', `${feeNgn.toLocaleString()} NGNs`, '#ef4444') : ''}
  ${statBadge('Amount to Mint', `${parseFloat(mintAmount).toLocaleString()} NGNs`, '#22c55e')}
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">The user has been sent payment instructions. Once they upload a receipt, verify the bank transfer and confirm the mint in your Salva dashboard.</p>
  ${ctaButton('Open Mint Requests', 'https://salva-nexus.org/dashboard')}`;
}

function buyMintedUserEmail(username, mintAmount, txHash) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#22c55e;">NGNs Minted Successfully!</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, your NGNs have been minted and sent to your wallet.</p>
  ${statBadge('Amount Minted', `${parseFloat(mintAmount).toLocaleString()} NGNs`, '#22c55e')}
  ${txHashBlock(txHash)}
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">Your NGNs are now available in your Salva wallet. You can use them for transfers, swaps, and more.</p>
  ${ctaButton('View My Wallet', 'https://salva-nexus.org/dashboard')}`;
}

function buyMintedSellerEmail(username, mintAmount, txHash) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#22c55e;">Mint Confirmed</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">You successfully minted NGNs for <strong style="color:#fff;">${username}</strong>.</p>
  ${statBadge('Amount Minted', `${parseFloat(mintAmount).toLocaleString()} NGNs`, '#22c55e')}
  ${txHashBlock(txHash)}`;
}

function buyRejectedUserEmail(username, amount, reason) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#ef4444;">Purchase Request Rejected</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, unfortunately your NGNs purchase could not be completed.</p>
  ${statBadge('Amount Requested', `₦${parseFloat(amount).toLocaleString()}`)}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #ef4444;border-radius:12px;margin:8px 0;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:10px;color:#ef4444;text-transform:uppercase;letter-spacing:0.25em;">Reason</p>
      <p style="margin:6px 0 0;font-size:13px;color:#ccc;">${reason || 'Payment could not be verified.'}</p>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">If you believe this is an error or you have already made the transfer, please contact support or initiate a new request in the app.</p>
  ${ctaButton('Try Again', 'https://salva-nexus.org/dashboard')}`;
}

function buyRejectedSellerEmail(username, amount) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#ef4444;">Request Rejected</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">You rejected the buy request from <strong style="color:#fff;">${username}</strong>.</p>
  ${statBadge('Amount', `₦${parseFloat(amount).toLocaleString()}`)}
  <p style="font-size:12px;color:#666;margin:16px 0 0;">The user has been notified.</p>`;
}

// ── SELL emails ────────────────────────────────────────────────────────────

function sellInitiatedUserEmail(username, amount, txHash, bankName, acctName, acctNum) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;">Sell Request Initiated</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, your NGNs have been burned and your sell request is being processed.</p>
  ${statBadge('NGNs Burned', `${parseFloat(amount).toLocaleString()} NGNs`, '#ef4444')}
  ${statBadge('You Will Receive', `₦${parseFloat(amount).toLocaleString()}`, '#22c55e')}
  ${txHashBlock(txHash)}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #D4AF37;border-radius:12px;margin:16px 0;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:0.25em;font-weight:900;">Your Bank Details</p>
      <p style="margin:10px 0 0;font-size:13px;color:#ccc;">🏦 <strong>${bankName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">👤 <strong>${acctName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">🔢 <strong>${acctNum}</strong></p>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">Our team will verify your details and transfer the funds to your bank account. This typically takes 30–60 minutes during business hours.</p>`;
}

function sellInitiatedSellerEmail(username, amount, txHash, bankName, acctName, acctNum) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;">New Sell Request</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;"><strong style="color:#fff;">${username}</strong> has burned NGNs and wants a bank payout.</p>
  ${statBadge('NGNs Burned', `${parseFloat(amount).toLocaleString()} NGNs`, '#ef4444')}
  ${statBadge('Amount to Pay User', `₦${parseFloat(amount).toLocaleString()}`, '#22c55e')}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #D4AF37;border-radius:12px;margin:16px 0;">
    <tr><td style="padding:16px 18px;">
      <p style="margin:0;font-size:10px;color:#D4AF37;text-transform:uppercase;letter-spacing:0.25em;font-weight:900;">User Bank Details</p>
      <p style="margin:10px 0 0;font-size:13px;color:#ccc;">🏦 <strong>${bankName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">👤 <strong>${acctName}</strong></p>
      <p style="margin:4px 0;font-size:13px;color:#ccc;">🔢 <strong>${acctNum}</strong></p>
    </td></tr>
  </table>
  ${txHashBlock(txHash)}
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">The burn is confirmed on-chain. Send the naira payout and mark as complete in your dashboard.</p>
  ${ctaButton('Open Mint Requests', 'https://salva-nexus.org/dashboard')}`;
}

function sellCompletedUserEmail(username, amount, bankName, acctNum) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#22c55e;">Payout Sent!</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, your naira payout has been sent to your bank account.</p>
  ${statBadge('Amount Sent', `₦${parseFloat(amount).toLocaleString()}`, '#22c55e')}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #1f1f22;border-radius:12px;margin:8px 0;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:10px;color:#555;text-transform:uppercase;letter-spacing:0.25em;">Sent To</p>
      <p style="margin:6px 0 0;font-size:13px;color:#ccc;">🏦 ${bankName} · 🔢 ${acctNum}</p>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">Funds typically appear in your account within minutes. If you have not received the transfer within 2 hours, please contact support.</p>
  ${ctaButton('View Dashboard', 'https://salva-nexus.org/dashboard')}`;
}

function sellCompletedSellerEmail(username, amount) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#22c55e;">Sell Completed</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">You marked the sell request from <strong style="color:#fff;">${username}</strong> as complete.</p>
  ${statBadge('Amount Paid', `₦${parseFloat(amount).toLocaleString()}`, '#22c55e')}
  <p style="font-size:12px;color:#666;margin:16px 0 0;">The user has been notified that their payout was sent.</p>`;
}

function sellRejectedUserEmail(username, amount, reason) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#ef4444;">Sell Request Issue</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">Hi <strong style="color:#fff;">${username}</strong>, there was an issue with your sell request.</p>
  ${statBadge('NGNs Burned', `${parseFloat(amount).toLocaleString()} NGNs`, '#ef4444')}
  <table cellpadding="0" cellspacing="0" style="width:100%;background:#0A0A0B;border:1px solid #ef4444;border-radius:12px;margin:8px 0;">
    <tr><td style="padding:14px 18px;">
      <p style="margin:0;font-size:10px;color:#ef4444;text-transform:uppercase;letter-spacing:0.25em;">Note</p>
      <p style="margin:6px 0 0;font-size:13px;color:#ccc;">${reason || 'Your request could not be processed.'}</p>
    </td></tr>
  </table>
  <p style="font-size:12px;color:#666;margin:16px 0 0;line-height:1.6;">Please contact Salva support immediately referencing your burn transaction so we can resolve this for you.</p>
  ${ctaButton('Contact Support', 'https://salva-nexus.org')}`;
}

function sellRejectedSellerEmail(username, amount) {
  return `
  <h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#ef4444;">Sell Request Rejected</h2>
  <p style="margin:0 0 20px;font-size:13px;color:#888;">You rejected the sell request from <strong style="color:#fff;">${username}</strong>.</p>
  ${statBadge('NGNs Burned', `${parseFloat(amount).toLocaleString()} NGNs`, '#ef4444')}
  <p style="font-size:12px;color:#666;margin:16px 0 0;">The user has been notified. Ensure any outstanding balance is resolved manually if funds were received.</p>`;
}

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/initiate
// ══════════════════════════════════════════════════════════════════════════════
router.post('/initiate', async (req, res) => {
  try {
    const { safeAddress, amountNgn, isL1: isL1Flag, recipientAddress } = req.body;
    const isL1 = isL1Flag === true || isL1Flag === 'true';
    const chain = isL1 ? 'bnb' : 'base';
    const isProd = process.env.NODE_ENV === 'production';

    // For L1: mintTo comes from recipientAddress (the Mint-to Address card on frontend).
    // For L2: mintTo is the Safe address.
    // safeAddress is the wallet the request is keyed to (EOA on L1, Safe on L2).
    const mintToAddress =
      isL1 && recipientAddress ? recipientAddress.toLowerCase() : safeAddress.toLowerCase();

    console.log(
      `💳 initiate: safeAddress=${safeAddress} amount=${amountNgn} isL1=${isL1} mintTo=${mintToAddress}`
    );

    if (!safeAddress || !safeAddress.startsWith('0x'))
      return res.status(400).json({ message: 'Invalid wallet address' });
    if (!mintToAddress || !mintToAddress.startsWith('0x'))
      return res.status(400).json({ message: 'Invalid recipient address' });

    const otcConfig = await getOtcConfig();
    const amount = parseFloat(amountNgn);
    if (isNaN(amount) || amount < otcConfig.minNgn)
      return res
        .status(400)
        .json({ message: `Minimum purchase is ₦${otcConfig.minNgn.toLocaleString()}` });
    if (amount > otcConfig.maxNgn)
      return res
        .status(400)
        .json({ message: `Maximum is ₦${otcConfig.maxNgn.toLocaleString()} per request` });

    // For L1 buys, the wallet is an EOA — no User record required.
    // For L2, we still look up by safeAddress to get email/username for notifications.
    let userEmail = null;
    let username = null;
    if (!isL1) {
      const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      if (!user) return res.status(404).json({ message: 'User not found' });
      userEmail = user.email;
      username = user.username;
    } else {
      // For L1, try to find a user by safeAddress OR by any address match, but don't hard-fail.
      const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      userEmail = user?.email || null;
      username = user?.username || `${safeAddress.slice(0, 6)}…${safeAddress.slice(-4)}`;
    }

    const feeNgn = computeFee(amount, otcConfig.feePercent);
    const mintAmount = amount - feeNgn;
    const acctName = process.env.SELLER_ACCOUNT_NAME || 'Salva Digital Tech';
    const acctNum = process.env.SELLER_ACCOUNT_NUMBER || '0000000000';
    const bankName = process.env.SELLER_BANK_NAME || 'OPay';

    const networkLabel = isL1
      ? isProd
        ? 'BNB Chain (Mainnet)'
        : 'BNB Chain (Testnet)'
      : isProd
        ? 'Base Mainnet'
        : 'Base Sepolia';

    const bankMsg = {
      sender: 'seller',
      text: `👋 Hi **${username}**!\n\n💳 Billed: **₦${amount.toLocaleString()}** (includes ₦${feeNgn.toLocaleString()} fee)\n🪙 Will mint: **${mintAmount.toLocaleString()} NGNs**\n\nTransfer **₦${amount.toLocaleString()}** to:\n🏦 **${bankName}**\n👤 **${acctName}**\n🔢 **${acctNum}**\n\n🌐 Network: **${networkLabel}**\n📍 Minting to: \`${mintToAddress.slice(0, 10)}…${mintToAddress.slice(-6)}\`\n\nTap **"I Have Paid"** after sending.`,
      createdAt: new Date(),
    };

    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (mintRequest && ['pending', 'paid', 'minting'].includes(mintRequest.status)) {
      return res.status(409).json({
        message: 'You already have an active purchase request.',
        requestId: mintRequest._id,
      });
    }

    if (mintRequest && ['minted', 'rejected'].includes(mintRequest.status)) {
      mintRequest.status = 'pending';
      mintRequest.amountNgn = amount;
      mintRequest.feeNgn = feeNgn;
      mintRequest.mintAmountNgn = mintAmount;
      mintRequest.isL1 = isL1;
      mintRequest.chain = chain;
      mintRequest.mintToAddress = mintToAddress;
      mintRequest.receiptImageBase64 = null;
      mintRequest.sellerRead = false;
      mintRequest.txHash = null;
      mintRequest.mintedAt = null;
      mintRequest.updatedAt = new Date();
      mintRequest.messages.push(bankMsg);
      await mintRequest.save();
    } else {
      mintRequest = await MintRequest.create({
        userSafeAddress: safeAddress.toLowerCase(),
        userEmail: userEmail || '',
        username,
        amountNgn: amount,
        feeNgn,
        mintAmountNgn: mintAmount,
        isL1,
        chain,
        mintToAddress,
        status: 'pending',
        sellerRead: false,
        messages: [bankMsg],
      });
    }

    console.log(`✅ MintRequest ${mintRequest._id} created/reused for buy (${networkLabel})`);

    // Emails — non-blocking, only if we have an email address
    if (userEmail) {
      sendEmail(
        userEmail,
        `[SALVA] Buy Request — ₦${amount.toLocaleString()} NGNs`,
        buyInitiatedUserEmail(username, amount, feeNgn, mintAmount, bankName, acctName, acctNum)
      ).catch(() => {});
    }

    notifySellers(
      `[SALVA] 🛒 New Buy Request — ₦${amount.toLocaleString()} — ${username} [${networkLabel}]`,
      buyInitiatedSellerEmail(username, amount, feeNgn, mintAmount)
    ).catch(() => {});

    return res.json({
      success: true,
      requestId: mintRequest._id,
      amountNgn: amount,
      feeNgn,
      mintAmount,
      bankDetails: { accountName: acctName, accountNumber: acctNum, bankName },
      messages: mintRequest.messages,
    });
  } catch (err) {
    console.error('❌ initiate:', err.message);
    res.status(500).json({ message: err.message || 'Failed to create request' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/claim-paid
// ══════════════════════════════════════════════════════════════════════════════
router.post('/claim-paid', async (req, res) => {
  try {
    const { requestId, safeAddress, receiptBase64 } = req.body;
    console.log(`📸 claim-paid: ${requestId}`);

    if (!requestId || !safeAddress || !receiptBase64)
      return res.status(400).json({ message: 'requestId, safeAddress and receiptBase64 required' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Request not found' });
    if (mintRequest.userSafeAddress !== safeAddress.toLowerCase())
      return res.status(403).json({ message: 'Not authorized' });
    if (mintRequest.status !== 'pending')
      return res.status(400).json({ message: 'Not in pending state' });

    const receiptMsg = {
      sender: 'user',
      text: 'I have made the payment. Please verify my receipt.',
      imageUrl: receiptBase64,
      isReceipt: true,
      createdAt: new Date(),
    };

    mintRequest.status = 'paid';
    mintRequest.receiptImageBase64 = receiptBase64;
    mintRequest.sellerRead = false;
    mintRequest.messages.push(receiptMsg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    console.log(`✅ MintRequest ${requestId} → PAID`);

    // Notify sellers that receipt was uploaded (plain text seller body)
    notifySellers(
      `[SALVA] 📸 Receipt Uploaded — ${mintRequest.username} — ₦${mintRequest.amountNgn.toLocaleString()}`,
      `<h2 style="margin:0 0 6px;font-size:20px;font-weight:900;color:#fff;">Receipt Uploaded</h2>
       <p style="margin:0 0 20px;font-size:13px;color:#888;"><strong style="color:#fff;">${mintRequest.username}</strong> has uploaded their payment receipt.</p>
       ${statBadge('To Mint', `${mintRequest.mintAmountNgn.toLocaleString()} NGNs`, '#22c55e')}
       <p style="font-size:12px;color:#666;margin:16px 0 0;">Verify the bank transfer in your dashboard and confirm the mint.</p>
       ${ctaButton('Review Receipt', 'https://salva-nexus.org/dashboard')}`
    ).catch(() => {});

    return res.json({ success: true, status: 'paid' });
  } catch (err) {
    console.error('❌ claim-paid:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/send-message
// ══════════════════════════════════════════════════════════════════════════════
router.post('/send-message', async (req, res) => {
  try {
    const { requestId, safeAddress, text, sender } = req.body;
    if (!requestId || !text?.trim() || !sender)
      return res.status(400).json({ message: 'requestId, text, sender required' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });

    if (sender === 'user') {
      if (mintRequest.userSafeAddress !== safeAddress?.toLowerCase())
        return res.status(403).json({ message: 'Not authorized' });
    } else if (sender === 'seller') {
      const s = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
      if (!s?.isSeller) return res.status(403).json({ message: 'Not a seller' });
      mintRequest.sellerRead = true;
    } else {
      return res.status(400).json({ message: 'sender must be user or seller' });
    }

    const msg = { sender, text: text.trim(), createdAt: new Date() };
    mintRequest.messages.push(msg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error('❌ send-message:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/confirm-mint  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/confirm-mint', async (req, res) => {
  try {
    const { requestId, safeAddress } = req.body;
    console.log(`🪙 confirm-mint: ${requestId} seller=${safeAddress}`);

    if (!requestId || !safeAddress)
      return res.status(400).json({ message: 'requestId and safeAddress required' });

    const seller = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });
    if (mintRequest.status !== 'paid')
      return res.status(400).json({ message: `Cannot mint — status is '${mintRequest.status}'` });

    mintRequest.status = 'minting';
    await mintRequest.save();
    console.log(`⏳ Status → minting for ${requestId}`);

    const isL1 = mintRequest.isL1 === true;
    const isProd = process.env.NODE_ENV === 'production';

    const ngnTokenAddress = isL1
      ? isProd
        ? process.env.L1_NGN_TOKEN_ADDRESS
        : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      : process.env.NGN_TOKEN_ADDRESS;

    if (!ngnTokenAddress) throw new Error(`NGN token address not set for ${isL1 ? 'L1' : 'L2'}`);

    const mintTarget = mintRequest.mintToAddress || mintRequest.userSafeAddress;

    const signer = getBackendSigner(isL1);
    const ngnToken = new ethers.Contract(ngnTokenAddress, ERC20_MINT_ABI, signer);
    const decimals = isL1 ? await getL1TokenDecimals(ngnTokenAddress) : await ngnToken.decimals();
    const mintAmt = ethers.parseUnits(mintRequest.mintAmountNgn.toString(), decimals);

    const networkLabel = isL1 ? (isProd ? 'BNB Mainnet' : 'BNB Testnet') : 'Base Mainnet';
    console.log(
      `🔗 Calling mint(${mintTarget}, ${mintAmt}) on ${ngnTokenAddress} [${networkLabel}]`
    );
    const tx = await ngnToken.mint(mintTarget, mintAmt);
    console.log(`⏳ Tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Mint transaction reverted');
    console.log(`✅ Mint confirmed: ${tx.hash}`);

    const networkLabelSuccess = isL1
      ? isProd
        ? 'BNB Chain (Mainnet)'
        : 'BNB Chain (Testnet)'
      : isProd
        ? 'Base Mainnet'
        : 'Base Sepolia';
    const explorerBase = isL1
      ? isProd
        ? 'https://bscscan.com'
        : 'https://testnet.bscscan.com'
      : isProd
        ? 'https://basescan.org'
        : 'https://sepolia.basescan.org';

    const successMsg = {
      sender: 'seller',
      isMinted: true,
      text: `🎉 **${mintRequest.mintAmountNgn.toLocaleString()} NGNs** minted to your wallet!\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n🌐 ${networkLabelSuccess}`,
      createdAt: new Date(),
    };

    mintRequest.status = 'minted';
    mintRequest.txHash = tx.hash;
    mintRequest.mintedAt = new Date();
    mintRequest.sellerRead = true;
    mintRequest.messages.push(successMsg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    if (Transaction) {
      try {
        await Transaction.create({
          fromAddress: ngnTokenAddress,
          toAddress: mintRequest.userSafeAddress,
          fromUsername: 'Salva Mint',
          toUsername: mintRequest.username,
          amount: mintRequest.mintAmountNgn,
          coin: 'NGN',
          status: 'successful',
          taskId: tx.hash,
          fee: mintRequest.feeNgn || 0,
          date: new Date(),
        });
        console.log(`📒 Tx saved for ${mintRequest.username}`);
      } catch (txErr) {
        console.error('⚠️ Tx history save failed:', txErr.message);
      }
    }

    // Emails — non-blocking
    sendEmail(
      mintRequest.userEmail,
      `[SALVA] ✅ ${mintRequest.mintAmountNgn.toLocaleString()} NGNs Minted to Your Wallet`,
      buyMintedUserEmail(mintRequest.username, mintRequest.mintAmountNgn, tx.hash)
    ).catch(() => {});

    sendEmail(
      seller.email,
      `[SALVA] ✅ Mint Confirmed — ${mintRequest.username}`,
      buyMintedSellerEmail(mintRequest.username, mintRequest.mintAmountNgn, tx.hash)
    ).catch(() => {});

    return res.json({ success: true, status: 'minted', txHash: tx.hash });
  } catch (err) {
    console.error('❌ confirm-mint:', err.message);
    try {
      await MintRequest.findByIdAndUpdate(req.body.requestId, { status: 'paid' });
    } catch {
      /* ignore */
    }
    res.status(500).json({ message: err.message || 'Mint failed — please try again' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/reject  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/reject', async (req, res) => {
  try {
    const { requestId, safeAddress, reason } = req.body;
    const seller = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });
    if (!['pending', 'paid', 'burned'].includes(mintRequest.status))
      return res.status(400).json({ message: 'Cannot reject at this stage' });

    const rejectReason =
      reason?.trim() ||
      'Payment could not be verified. Contact support if you believe this is an error.';

    mintRequest.status = 'rejected';
    mintRequest.messages.push({
      sender: 'seller',
      text: `❌ ${rejectReason}`,
      createdAt: new Date(),
    });
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    // Determine email type based on request type
    const isSell = mintRequest.type === 'sell';

    // User email
    sendEmail(
      mintRequest.userEmail,
      isSell
        ? `[SALVA] ❌ Sell Request Issue — Action Required`
        : `[SALVA] ❌ Purchase Request Rejected`,
      isSell
        ? sellRejectedUserEmail(mintRequest.username, mintRequest.amountNgn, rejectReason)
        : buyRejectedUserEmail(mintRequest.username, mintRequest.amountNgn, rejectReason)
    ).catch(() => {});

    // Seller confirmation email
    sendEmail(
      seller.email,
      isSell
        ? `[SALVA] Sell Request Rejected — ${mintRequest.username}`
        : `[SALVA] Buy Request Rejected — ${mintRequest.username}`,
      isSell
        ? sellRejectedSellerEmail(mintRequest.username, mintRequest.amountNgn)
        : buyRejectedSellerEmail(mintRequest.username, mintRequest.amountNgn)
    ).catch(() => {});

    return res.json({ success: true, status: 'rejected' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// GET routes
// ══════════════════════════════════════════════════════════════════════════════
router.get('/my-request/:safeAddress', async (req, res) => {
  try {
    const addr = req.params.safeAddress.toLowerCase();
    const request = await MintRequest.findOne({ userSafeAddress: addr }).sort({ createdAt: -1 });
    return res.json({ request: request || null });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/history/:safeAddress', async (req, res) => {
  try {
    const addr = req.params.safeAddress.toLowerCase();
    const requests = await MintRequest.find({
      userSafeAddress: addr,
      status: { $in: ['minted', 'rejected'] },
    })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-receiptImageBase64');
    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/all-requests', async (req, res) => {
  try {
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });

    const requests = await MintRequest.aggregate([
      { $sort: { updatedAt: -1 } },
      { $group: { _id: '$userSafeAddress', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
      { $sort: { updatedAt: -1 } },
      { $limit: 50 },
      {
        $project: {
          receiptImageBase64: 0,
          'messages.imageUrl': 0,
        },
      },
    ]);

    return res.json({ requests });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/request/:id', async (req, res) => {
  try {
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });
    const request = await MintRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Not found' });
    if (!request.sellerRead) {
      request.sellerRead = true;
      await request.save();
    }
    return res.json({ request });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/unread-count', async (req, res) => {
  try {
    const seller = await User.findOne({ safeAddress: req.query.safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.json({ unreadCount: 0 });
    const count = await MintRequest.countDocuments({
      sellerRead: false,
      status: { $ne: 'minted' },
    });
    return res.json({ unreadCount: count });
  } catch {
    res.json({ unreadCount: 0 });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/initiate-sell
// ══════════════════════════════════════════════════════════════════════════════
router.post('/initiate-sell', async (req, res) => {
  try {
    const {
      safeAddress,
      amountNgn,
      bankName,
      accountNumber,
      accountName,
      isL1: isL1Flag,
      burnFromAddress,
    } = req.body;
    const isL1 = isL1Flag === true || isL1Flag === 'true';
    const chain = isL1 ? 'ethereum' : 'base';
    const isProd = process.env.NODE_ENV === 'production';
    console.log(`🔥 initiate-sell: safeAddress=${safeAddress} amount=${amountNgn} isL1=${isL1}`);

    if (!safeAddress || !safeAddress.startsWith('0x'))
      return res.status(400).json({ message: 'Invalid wallet address' });

    const otcConfig = await getOtcConfig();
    const amount = parseFloat(amountNgn);
    if (isNaN(amount) || amount < otcConfig.minNgn)
      return res
        .status(400)
        .json({ message: `Minimum sell is ₦${otcConfig.minNgn.toLocaleString()}` });
    if (amount > otcConfig.maxNgn)
      return res
        .status(400)
        .json({ message: `Maximum sell is ₦${otcConfig.maxNgn.toLocaleString()} per request` });

    if (!bankName?.trim() || !accountNumber?.trim() || !accountName?.trim())
      return res
        .status(400)
        .json({ message: 'Bank name, account number and account name are required' });

    // For L1 sells, the connected address is the EOA — no User record required.
    // For L2, look up by safeAddress.
    let userEmail = null;
    let username = null;
    if (!isL1) {
      const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      if (!user) return res.status(404).json({ message: 'User not found' });
      userEmail = user.email;
      username = user.username;
    } else {
      const user = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      userEmail = user?.email || null;
      username = user?.username || `${safeAddress.slice(0, 6)}…${safeAddress.slice(-4)}`;
    }

    const ngnTokenAddress = isL1
      ? isProd
        ? process.env.L1_NGN_TOKEN_ADDRESS
        : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      : process.env.NGN_TOKEN_ADDRESS;

    if (!ngnTokenAddress) throw new Error(`NGN token address not set for ${isL1 ? 'L1' : 'L2'}`);

    // For L1: burn from the connected EOA. burnFromAddress is sent explicitly by the frontend.
    // For L2: burn from the Safe address.
    const burnTarget =
      isL1 && burnFromAddress ? burnFromAddress.toLowerCase() : safeAddress.toLowerCase();
    const feeNgn = computeFee(amount, otcConfig.feePercent);
    const payoutAmount = amount - feeNgn;

    const signer = getBackendSigner(isL1);
    const ngnToken = new ethers.Contract(ngnTokenAddress, ERC20_BURN_ABI, signer);
    const decimals = isL1 ? await getL1TokenDecimals(ngnTokenAddress) : await ngnToken.decimals();
    const balanceWei = await ngnToken.balanceOf(burnTarget);
    const balanceHuman = parseFloat(ethers.formatUnits(balanceWei, decimals));

    if (amount > balanceHuman) {
      return res.status(400).json({
        message: `Insufficient NGNs balance. You have ${balanceHuman.toLocaleString()} NGNs.`,
        insufficientBalance: true,
      });
    }

    const existing = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
      status: { $in: ['pending', 'paid', 'minting'] },
    });
    if (existing) {
      return res
        .status(409)
        .json({ message: 'You already have an active request.', requestId: existing._id });
    }

    const burnAmt = ethers.parseUnits(amount.toString(), decimals);
    console.log(`🔥 Calling burn(${burnTarget}, ${burnAmt}) on ${ngnTokenAddress}`);
    const tx = await ngnToken.burn(burnTarget, burnAmt);
    console.log(`⏳ Burn tx submitted: ${tx.hash}`);

    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Burn transaction reverted');
    console.log(`✅ Burn confirmed: ${tx.hash}`);

    if (Transaction) {
      try {
        await Transaction.create({
          fromAddress: burnTarget,
          toAddress: ngnTokenAddress,
          fromUsername: username,
          toUsername: 'Salva Burn',
          amount,
          coin: 'NGN',
          status: 'successful',
          taskId: tx.hash,
          fee: 0,
          date: new Date(),
        });
        console.log(`📒 Sell tx saved for ${user.username}`);
      } catch (txErr) {
        console.error('⚠️ Tx history save failed:', txErr.message);
      }
    }

    const networkLabelSell = isL1
      ? isProd
        ? 'BNB Chain (Mainnet)'
        : 'BNB Chain (Testnet)'
      : isProd
        ? 'Base Mainnet'
        : 'Base Sepolia';

    const sellMsg = {
      sender: 'user',
      isBurned: true,
      text: `🔥 Sell request submitted!\n\n💸 Burned: **${amount.toLocaleString()} NGNs** (fee: ${feeNgn.toLocaleString()} NGNs)\n💵 Payout to user: **₦${payoutAmount.toLocaleString()}**\n\n🏦 **${bankName.trim()}**\n👤 **${accountName.trim()}**\n🔢 **${accountNumber.trim()}**\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n🌐 ${networkLabelSell}\n📍 Burned from: \`${burnTarget.slice(0, 10)}…${burnTarget.slice(-6)}\``,
      createdAt: new Date(),
    };

    let mintRequest = await MintRequest.findOne({
      userSafeAddress: safeAddress.toLowerCase(),
    }).sort({ createdAt: -1 });

    if (
      mintRequest &&
      ['minted', 'rejected', 'burned', 'sell_completed'].includes(mintRequest.status)
    ) {
      mintRequest.type = 'sell';
      mintRequest.isL1 = isL1;
      mintRequest.chain = chain;
      mintRequest.status = 'paid';
      mintRequest.amountNgn = amount;
      mintRequest.feeNgn = feeNgn;
      mintRequest.mintAmountNgn = payoutAmount;
      mintRequest.bankDetails = {
        bankName: bankName.trim(),
        accountNumber: accountNumber.trim(),
        accountName: accountName.trim(),
      };
      mintRequest.receiptImageBase64 = null;
      mintRequest.sellerRead = false;
      mintRequest.txHash = tx.hash;
      mintRequest.updatedAt = new Date();
      mintRequest.messages.push(sellMsg);
      await mintRequest.save();
    } else {
      mintRequest = await MintRequest.create({
        userSafeAddress: safeAddress.toLowerCase(),
        userEmail: userEmail || '',
        username,
        type: 'sell',
        isL1,
        chain,
        amountNgn: amount,
        feeNgn: feeNgn,
        mintAmountNgn: payoutAmount,
        bankDetails: {
          bankName: bankName.trim(),
          accountNumber: accountNumber.trim(),
          accountName: accountName.trim(),
        },
        status: 'paid',
        sellerRead: false,
        txHash: tx.hash,
        messages: [sellMsg],
      });
    }

    console.log(`✅ Sell request ${mintRequest._id} created`);

    // Emails — non-blocking, only if we have an address
    if (userEmail) {
      sendEmail(
        userEmail,
        `[SALVA] Sell Request — ${amount.toLocaleString()} NGNs Burned`,
        sellInitiatedUserEmail(
          username,
          amount,
          tx.hash,
          bankName.trim(),
          accountName.trim(),
          accountNumber.trim()
        )
      ).catch(() => {});
    }

    notifySellers(
      `[SALVA] 💸 New Sell Request — ₦${amount.toLocaleString()} — ${username} [${networkLabelSell}]`,
      sellInitiatedSellerEmail(
        username,
        amount,
        tx.hash,
        bankName.trim(),
        accountName.trim(),
        accountNumber.trim()
      )
    ).catch(() => {});

    return res.json({
      success: true,
      requestId: mintRequest._id,
      txHash: tx.hash,
      messages: mintRequest.messages,
    });
  } catch (err) {
    console.error('❌ initiate-sell:', err.message);
    res.status(500).json({ message: err.message || 'Sell failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/send-image
// ══════════════════════════════════════════════════════════════════════════════
router.post('/send-image', async (req, res) => {
  try {
    const { requestId, safeAddress, imageBase64, sender } = req.body;
    if (!requestId || !safeAddress || !imageBase64 || !sender)
      return res
        .status(400)
        .json({ message: 'requestId, safeAddress, imageBase64, sender required' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });

    if (sender === 'user') {
      if (mintRequest.userSafeAddress !== safeAddress.toLowerCase())
        return res.status(403).json({ message: 'Not authorized' });
    } else if (sender === 'seller') {
      const s = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
      if (!s?.isSeller) return res.status(403).json({ message: 'Not a seller' });
      mintRequest.sellerRead = true;
    }

    const msg = { sender, text: null, imageUrl: imageBase64, createdAt: new Date() };
    mintRequest.messages.push(msg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    return res.json({ success: true, message: msg });
  } catch (err) {
    console.error('❌ send-image:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/complete-sell  (seller only)
// ══════════════════════════════════════════════════════════════════════════════
router.post('/complete-sell', async (req, res) => {
  try {
    const { requestId, safeAddress } = req.body;
    const seller = await User.findOne({ safeAddress: safeAddress?.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });
    if (mintRequest.status !== 'paid' || mintRequest.type !== 'sell')
      return res.status(400).json({ message: 'Cannot complete at this stage' });

    const totalPaid = mintRequest.mintAmountNgn || 0;

    mintRequest.status = 'sell_completed';
    mintRequest.messages.push({
      sender: 'seller',
      text: `✅ Payment sent! ₦${totalPaid.toLocaleString()} has been transferred to your bank account.\n\n🏦 ${mintRequest.bankDetails?.bankName} · 🔢 ${mintRequest.bankDetails?.accountNumber}\n\nThank you for using Salva! 🎉`,
      createdAt: new Date(),
    });
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    const bankName = mintRequest.bankDetails?.bankName || '';
    const acctNum = mintRequest.bankDetails?.accountNumber || '';

    // Emails — non-blocking
    sendEmail(
      mintRequest.userEmail,
      `[SALVA] ✅ Payout of ₦${totalPaid.toLocaleString()} Sent`,
      sellCompletedUserEmail(mintRequest.username, totalPaid, bankName, acctNum)
    ).catch(() => {});

    sendEmail(
      seller.email,
      `[SALVA] Sell Completed — ${mintRequest.username}`,
      sellCompletedSellerEmail(mintRequest.username, totalPaid)
    ).catch(() => {});

    return res.json({ success: true, status: 'sell_completed' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// POST /api/buy-ngns/mark-minted  (seller only — forwards to confirm-mint logic)
// The frontend SellerMintPanel calls /mark-minted; this keeps it working.
// ══════════════════════════════════════════════════════════════════════════════
router.post('/mark-minted', async (req, res) => {
  req.url = '/confirm-mint';
  // Re-use confirm-mint by duplicating the handler inline
  try {
    const { requestId, safeAddress } = req.body;
    console.log(`🪙 mark-minted (→confirm-mint): ${requestId} seller=${safeAddress}`);

    if (!requestId || !safeAddress)
      return res.status(400).json({ message: 'requestId and safeAddress required' });

    const seller = await User.findOne({ safeAddress: safeAddress.toLowerCase() });
    if (!seller?.isSeller) return res.status(403).json({ message: 'Not authorized' });

    const mintRequest = await MintRequest.findById(requestId);
    if (!mintRequest) return res.status(404).json({ message: 'Not found' });
    if (mintRequest.status !== 'paid')
      return res.status(400).json({ message: `Cannot mint — status is '${mintRequest.status}'` });

    mintRequest.status = 'minting';
    await mintRequest.save();

    const isL1Req = mintRequest.isL1 === true;
    const isProdReq = process.env.NODE_ENV === 'production';

    const ngnTokenAddress = isL1Req
      ? isProdReq
        ? process.env.L1_NGN_TOKEN_ADDRESS
        : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      : process.env.NGN_TOKEN_ADDRESS;

    if (!ngnTokenAddress) throw new Error(`NGN token address not set for ${isL1Req ? 'L1' : 'L2'}`);

    const mintTargetReq = mintRequest.mintToAddress || mintRequest.userSafeAddress;
    const signer = getBackendSigner(isL1Req);
    const ngnToken = new ethers.Contract(ngnTokenAddress, ERC20_MINT_ABI, signer);
    const decimals = isL1Req
      ? await getL1TokenDecimals(ngnTokenAddress)
      : await ngnToken.decimals();
    const mintAmt = ethers.parseUnits(mintRequest.mintAmountNgn.toString(), decimals);

    const tx = await ngnToken.mint(mintTargetReq, mintAmt);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error('Mint transaction reverted');
    console.log(`✅ mark-minted confirmed: ${tx.hash}`);

    const networkLabelMark = isL1Req
      ? isProdReq
        ? 'BNB Chain (Mainnet)'
        : 'BNB Chain (Testnet)'
      : isProdReq
        ? 'Base Mainnet'
        : 'Base Sepolia';

    const successMsg = {
      sender: 'seller',
      isMinted: true,
      text: `🎉 **${mintRequest.mintAmountNgn.toLocaleString()} NGNs** minted to your wallet!\n\n🔗 TX: \`${tx.hash.slice(0, 12)}...${tx.hash.slice(-8)}\`\n🌐 ${networkLabelMark}`,
      createdAt: new Date(),
    };

    mintRequest.status = 'minted';
    mintRequest.txHash = tx.hash;
    mintRequest.mintedAt = new Date();
    mintRequest.sellerRead = true;
    mintRequest.messages.push(successMsg);
    mintRequest.updatedAt = new Date();
    await mintRequest.save();

    if (Transaction) {
      try {
        await Transaction.create({
          fromAddress: ngnTokenAddress,
          toAddress: mintRequest.userSafeAddress,
          fromUsername: 'Salva Mint',
          toUsername: mintRequest.username,
          amount: mintRequest.mintAmountNgn,
          coin: 'NGN',
          status: 'successful',
          taskId: tx.hash,
          fee: mintRequest.feeNgn || 0,
          date: new Date(),
        });
      } catch (txErr) {
        console.error('⚠️ Tx history save failed:', txErr.message);
      }
    }

    sendEmail(
      mintRequest.userEmail,
      `[SALVA] ✅ ${mintRequest.mintAmountNgn.toLocaleString()} NGNs Minted to Your Wallet`,
      buyMintedUserEmail(mintRequest.username, mintRequest.mintAmountNgn, tx.hash)
    ).catch(() => {});

    sendEmail(
      seller.email,
      `[SALVA] ✅ Mint Confirmed — ${mintRequest.username}`,
      buyMintedSellerEmail(mintRequest.username, mintRequest.mintAmountNgn, tx.hash)
    ).catch(() => {});

    return res.json({ success: true, status: 'minted', txHash: tx.hash });
  } catch (err) {
    console.error('❌ mark-minted:', err.message);
    try {
      await MintRequest.findByIdAndUpdate(req.body.requestId, { status: 'paid' });
    } catch {
      /* ignore */
    }
    res.status(500).json({ message: err.message || 'Mint failed — please try again' });
  }
});

module.exports = router;
