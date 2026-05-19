// Salva-Digital-Tech/packages/backend/src/services/emailService.js
const { Resend } = require("resend");
const resend = new Resend(process.env.RESEND_API_KEY);

const formatAmount = (amount) =>
  parseFloat(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// ─────────────────────────────────────────────────────────────────────────────
// BASE TEMPLATE
// Wraps every email in the Salva shell — dark/light adaptive via CSS media query.
// ─────────────────────────────────────────────────────────────────────────────
function baseTemplate({ preheader = "", body = "", footerNote = "" }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>SALVA</title>
  <style>
    /* ── Reset ── */
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }

    /* ── Light mode defaults ── */
    :root {
      --bg-page:    #F0F0F0;
      --bg-card:    #FFFFFF;
      --bg-subtle:  #F5F5F5;
      --bg-pill:    #EFEFEF;
      --border:     #E0E0E0;
      --text-primary:   #0A0A0B;
      --text-secondary: #555555;
      --text-muted:     #999999;
      --gold:       #C9A227;
      --gold-light: #FFF8E1;
      --gold-border: #E8CE6A;
      --green:      #16A34A;
      --green-light: #F0FDF4;
      --green-border: #86EFAC;
      --red:        #DC2626;
      --red-light:  #FEF2F2;
      --red-border: #FECACA;
      --amber:      #D97706;
      --amber-light: #FFFBEB;
      --amber-border: #FDE68A;
    }

    /* ── Dark mode overrides ── */
    @media (prefers-color-scheme: dark) {
      :root {
        --bg-page:    #0A0A0B;
        --bg-card:    #111113;
        --bg-subtle:  #1A1A1C;
        --bg-pill:    #222224;
        --border:     rgba(255,255,255,0.08);
        --text-primary:   #FFFFFF;
        --text-secondary: rgba(255,255,255,0.65);
        --text-muted:     rgba(255,255,255,0.35);
        --gold:       #D4AF37;
        --gold-light: rgba(212,175,55,0.08);
        --gold-border: rgba(212,175,55,0.3);
        --green:      #22C55E;
        --green-light: rgba(34,197,94,0.08);
        --green-border: rgba(34,197,94,0.25);
        --red:        #EF4444;
        --red-light:  rgba(239,68,68,0.08);
        --red-border: rgba(239,68,68,0.25);
        --amber:      #F59E0B;
        --amber-light: rgba(245,158,11,0.08);
        --amber-border: rgba(245,158,11,0.3);
      }
    }

    body  { background-color: var(--bg-page); }
    .wrapper { background-color: var(--bg-page); padding: 32px 16px; }
    .card {
      max-width: 560px;
      margin: 0 auto;
      background-color: var(--bg-card);
      border-radius: 20px;
      border: 1px solid var(--border);
      overflow: hidden;
    }

    /* ── Header ── */
    .header {
      background-color: #0A0A0B;
      padding: 32px 40px 28px;
      text-align: center;
      border-bottom: 1px solid rgba(212,175,55,0.2);
    }
    .header-logo {
      font-size: 28px;
      font-weight: 900;
      letter-spacing: 0.35em;
      color: #D4AF37;
    }
    .header-tag {
      font-size: 10px;
      letter-spacing: 0.25em;
      color: rgba(212,175,55,0.5);
      font-weight: 700;
      text-transform: uppercase;
      margin-top: 4px;
    }
    .gold-line {
      height: 2px;
      background: linear-gradient(to right, transparent, #D4AF37, transparent);
      width: 100%;
    }

    /* ── Status banner ── */
    .banner {
      padding: 16px 40px;
      text-align: center;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .banner-success { background-color: var(--green-light); color: var(--green); border-bottom: 1px solid var(--green-border); }
    .banner-error   { background-color: var(--red-light);   color: var(--red);   border-bottom: 1px solid var(--red-border); }
    .banner-warning { background-color: var(--amber-light); color: var(--amber); border-bottom: 1px solid var(--amber-border); }
    .banner-info    { background-color: var(--gold-light);  color: var(--gold);  border-bottom: 1px solid var(--gold-border); }

    /* ── Body ── */
    .body { padding: 36px 40px; }
    .greeting { font-size: 18px; font-weight: 900; color: var(--text-primary); margin-bottom: 10px; }
    .subtext  { font-size: 14px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 24px; }

    /* ── Data rows ── */
    .data-block {
      background-color: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 16px;
    }
    .data-row {
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }
    .data-row:last-child { border-bottom: none; }
    .data-label {
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .data-value {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-primary);
      word-break: break-all;
    }
    .data-value-large {
      font-size: 28px;
      font-weight: 900;
      color: var(--text-primary);
      letter-spacing: -0.02em;
    }
    .data-value-gold   { color: var(--gold); }
    .data-value-green  { color: var(--green); }
    .data-value-red    { color: var(--red); }
    .data-value-mono   { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: var(--text-muted); }

    /* ── Alert boxes ── */
    .alert {
      border-radius: 12px;
      padding: 16px 20px;
      margin-bottom: 16px;
      border: 1px solid;
    }
    .alert-title { font-size: 11px; font-weight: 800; letter-spacing: 0.15em; text-transform: uppercase; margin-bottom: 6px; }
    .alert-body  { font-size: 13px; line-height: 1.6; }
    .alert-gold    { background-color: var(--gold-light);  border-color: var(--gold-border);  }
    .alert-gold .alert-title, .alert-gold .alert-body  { color: var(--gold); }
    .alert-green   { background-color: var(--green-light); border-color: var(--green-border); }
    .alert-green .alert-title, .alert-green .alert-body { color: var(--green); }
    .alert-red     { background-color: var(--red-light);   border-color: var(--red-border);   }
    .alert-red .alert-title, .alert-red .alert-body     { color: var(--red); }
    .alert-amber   { background-color: var(--amber-light); border-color: var(--amber-border); }
    .alert-amber .alert-title, .alert-amber .alert-body { color: var(--amber); }

    /* ── Badge pill ── */
    .badge {
      display: inline-block;
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid;
      margin-bottom: 10px;
    }
    .badge-gold  { background-color: var(--gold-light);  border-color: var(--gold-border);  color: var(--gold); }
    .badge-green { background-color: var(--green-light); border-color: var(--green-border); color: var(--green); }
    .badge-red   { background-color: var(--red-light);   border-color: var(--red-border);   color: var(--red); }
    .badge-blue  { background-color: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.3); color: #3B82F6; }

    /* ── Account number ── */
    .account-box {
      background-color: var(--gold-light);
      border: 1px solid var(--gold-border);
      border-radius: 10px;
      padding: 12px 16px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      font-weight: 700;
      color: var(--gold);
      word-break: break-all;
      margin-top: 8px;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: linear-gradient(to right, transparent, var(--border), transparent);
      margin: 24px 0;
    }

    /* ── Footer ── */
    .footer {
      padding: 24px 40px;
      background-color: var(--bg-subtle);
      border-top: 1px solid var(--border);
      text-align: center;
    }
    .footer-note { font-size: 11px; color: var(--text-muted); line-height: 1.7; margin-bottom: 16px; }
    .footer-link {
      display: inline-block;
      background-color: var(--gold);
      color: #000000;
      font-size: 10px;
      font-weight: 800;
      letter-spacing: 0.2em;
      text-transform: uppercase;
      text-decoration: none;
      padding: 10px 24px;
      border-radius: 999px;
    }
    .footer-brand {
      font-size: 9px;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-top: 16px;
    }

    /* ── Responsive ── */
    @media (max-width: 600px) {
      .body, .header, .footer { padding-left: 24px; padding-right: 24px; }
      .data-value-large { font-size: 22px; }
      .greeting { font-size: 16px; }
    }
  </style>
</head>
<body>
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}</div>` : ""}
  <div class="wrapper">
    <div class="card">
      <!-- Header -->
      <div class="header">
        <div class="gold-line"></div>
        <div style="padding: 24px 0 20px;">
          <div class="header-logo">SALVA</div>
          <div class="header-tag">On-chain Financial Protocol</div>
        </div>
        <div class="gold-line"></div>
      </div>

      <!-- Body -->
      ${body}

      <!-- Footer -->
      <div class="footer">
        <div class="footer-note">${footerNote || "Questions? Our support team is here for you."}</div>
        <a href="mailto:support@salva-nexus.org" class="footer-link">Contact Support</a>
        <div class="footer-brand">© SALVA · salva-nexus.org</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME EMAIL
// ─────────────────────────────────────────────────────────────────────────────
async function sendWelcomeEmail(userEmail, userName) {
  const body = `
    <div class="banner banner-info">✦ Welcome to Salva</div>
    <div class="body">
      <div class="greeting">Welcome, ${userName} 👋</div>
      <p class="subtext">Your account is live and your smart wallet is ready. You're now part of the Salva network — Nigeria's on-chain financial layer.</p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">What you can do</div>
          <div class="data-value" style="line-height:1.9;">
            ↑ &nbsp;Send NGNs to any Salva citizen<br/>
            ↓ &nbsp;Receive stablecoins from any wallet<br/>
            ⛓ &nbsp;Register a name alias<br/>
            ⭐ &nbsp;Earn points on every transfer
          </div>
        </div>
      </div>

      <div class="alert alert-gold">
        <div class="alert-title">Security reminder</div>
        <div class="alert-body">Salva will never ask for your password, PIN, or private key. If anyone does — it's a scam.</div>
      </div>

      <p style="font-size:13px; color:var(--text-muted); text-align:center; margin-top:8px;">— The Salva Team</p>
    </div>`;

  const text = `Welcome to SALVA, ${userName}!\n\nYour account is live and your smart wallet is ready.\n\nWhat you can do:\n- Send NGNs to any Salva citizen\n- Receive stablecoins from any wallet\n- Register a name alias\n- Earn points on every transfer\n\nSecurity reminder: Salva will never ask for your password, PIN, or private key.\n\n— The Salva Team\nsalva-nexus.org`;

  try {
    await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: userEmail,
      subject: "Welcome to Salva — Your wallet is ready",
      html: baseTemplate({ preheader: `Welcome ${userName}, your Salva wallet is live.`, body }),
      text,
    });
    console.log(`📧 Welcome email sent to: ${userEmail}`);
  } catch (error) {
    console.error("❌ Failed to send welcome email:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION EMAIL — SENDER
// ─────────────────────────────────────────────────────────────────────────────
async function sendTransactionEmailToSender(
  senderEmail,
  senderName,
  recipientIdentifier,
  amount,
  status,
  coin = "NGN",
) {
  const coinLabel = coin === "NGN" ? "NGNs" : coin;
  const isSuccess = status === "successful";
  const bannerClass = isSuccess ? "banner-success" : "banner-error";
  const bannerText  = isSuccess ? "✓ Payment Sent" : "✕ Payment Failed";
  const amountColor = isSuccess ? "data-value-green" : "data-value-red";

  const body = `
    <div class="banner ${bannerClass}">${bannerText}</div>
    <div class="body">
      <div class="greeting">Hi ${senderName},</div>
      <p class="subtext">${isSuccess
        ? "Your transfer has been confirmed on-chain and is now complete."
        : "We couldn't process this transfer. Please check your balance and try again."}</p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">Amount</div>
          <div class="data-value-large ${amountColor}">${formatAmount(amount)} <span style="font-size:14px;font-weight:700;">${coinLabel}</span></div>
        </div>
        <div class="data-row">
          <div class="data-label">Sent To</div>
          <div class="data-value">${recipientIdentifier}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Network</div>
          <div class="data-value">Base · ${process.env.NODE_ENV === "production" ? "Mainnet" : "Testnet"}</div>
        </div>
      </div>

      ${isSuccess
        ? `<div class="alert alert-green">
             <div class="alert-title">✓ Confirmed on-chain</div>
             <div class="alert-body">This transaction is permanently recorded on the Base blockchain and cannot be reversed.</div>
           </div>`
        : `<div class="alert alert-red">
             <div class="alert-title">Transaction failed</div>
             <div class="alert-body">Ensure you have sufficient ${coinLabel} balance and your account is not locked, then try again.</div>
           </div>`}
    </div>`;

  const text = `Hi ${senderName},\n\n${isSuccess ? "Transfer confirmed." : "Transfer failed."}\n\nAmount: ${formatAmount(amount)} ${coinLabel}\nRecipient: ${recipientIdentifier}\n\n${isSuccess ? "Confirmed on Base blockchain." : "Please check your balance and try again."}\n\n— Salva\nsalva-nexus.org`;

  try {
    await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: senderEmail,
      subject: isSuccess ? `Transfer confirmed — ${formatAmount(amount)} ${coinLabel} sent` : "Transfer failed — Salva",
      html: baseTemplate({ preheader: `Your transfer of ${formatAmount(amount)} ${coinLabel} is ${isSuccess ? "confirmed" : "failed"}.`, body }),
      text,
    });
    console.log(`📧 Sender email sent to: ${senderEmail}`);
  } catch (error) {
    console.error("❌ Failed to send sender email:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION EMAIL — RECEIVER
// ─────────────────────────────────────────────────────────────────────────────
async function sendTransactionEmailToReceiver(
  receiverEmail,
  receiverName,
  senderIdentifier,
  amount,
  coin = "NGN",
) {
  const coinLabel = coin === "NGN" ? "NGNs" : coin;
  const body = `
    <div class="banner banner-success">↓ Payment Received</div>
    <div class="body">
      <div class="greeting">Hi ${receiverName},</div>
      <p class="subtext">You've received a transfer. The funds are live in your Salva wallet right now.</p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">Amount received</div>
          <div class="data-value-large data-value-green">+${formatAmount(amount)} <span style="font-size:14px;font-weight:700;">${coinLabel}</span></div>
        </div>
        <div class="data-row">
          <div class="data-label">From</div>
          <div class="data-value">${senderIdentifier}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Network</div>
          <div class="data-value">Base · ${process.env.NODE_ENV === "production" ? "Mainnet" : "Testnet"}</div>
        </div>
      </div>

      <div class="alert alert-gold">
        <div class="alert-title">Funds are available</div>
        <div class="alert-body">Log into your Salva dashboard to view your balance and transaction history.</div>
      </div>
    </div>`;

  const text = `Hi ${receiverName},\n\nYou received ${formatAmount(amount)} ${coinLabel} from ${senderIdentifier}.\n\nFunds are now available in your Salva wallet.\n\n— Salva\nsalva-nexus.org`;

  try {
    await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: receiverEmail,
      subject: `You received ${formatAmount(amount)} ${coinLabel} — Salva`,
      html: baseTemplate({ preheader: `${formatAmount(amount)} ${coinLabel} landed in your wallet.`, body }),
      text,
    });
    console.log(`📧 Receiver email sent to: ${receiverEmail}`);
  } catch (error) {
    console.error("❌ Failed to send receiver email:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY CHANGE EMAIL
// ─────────────────────────────────────────────────────────────────────────────
async function sendSecurityChangeEmail(
  userEmail,
  userName,
  changeType,
  accountNumber,
) {
  const labels = { email: "Email Address", password: "Password", pin: "Transaction PIN" };
  const changeLabel = labels[changeType] || changeType;

  const body = `
    <div class="banner banner-warning">⚠ Security Change</div>
    <div class="body">
      <div class="greeting">Hi ${userName},</div>
      <p class="subtext">Your <strong>${changeLabel}</strong> was just changed successfully. As a precaution, your account is now restricted for 24 hours.</p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">Change Type</div>
          <div class="data-value">${changeLabel}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Restriction Period</div>
          <div class="data-value">24 hours from now</div>
        </div>
        <div class="data-row">
          <div class="data-label">Your Account</div>
          <div class="account-box">${accountNumber}</div>
        </div>
      </div>

      <div class="alert alert-red">
        <div class="alert-title">Didn't make this change?</div>
        <div class="alert-body">If you didn't authorize this, contact our support team immediately with your account number above.</div>
      </div>
    </div>`;

  const text = `Hi ${userName},\n\nYour ${changeLabel} was changed. Your account is restricted for 24 hours.\n\nAccount: ${accountNumber}\n\nDidn't do this? Contact support@salva-nexus.org immediately.\n\n— Salva Security Team\nsalva-nexus.org`;

  try {
    await resend.emails.send({
      from: "Salva Security <no-reply@salva-nexus.org>",
      to: userEmail,
      subject: `Security alert: ${changeLabel} changed — Salva`,
      html: baseTemplate({
        preheader: `Your ${changeLabel} was just updated on your Salva account.`,
        body,
        footerNote: "If you didn't make this change, contact us immediately.",
      }),
      text,
    });
    console.log(`📧 Security alert sent to: ${userEmail}`);
  } catch (error) {
    console.error("❌ Failed to send security email:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CHANGE CONFIRMATION
// ─────────────────────────────────────────────────────────────────────────────
async function sendEmailChangeConfirmation(newEmail, userName, accountNumber) {
  const body = `
    <div class="banner banner-success">✓ Email Updated</div>
    <div class="body">
      <div class="greeting">Hi ${userName},</div>
      <p class="subtext">Your email address has been updated. All future Salva notifications will arrive at this address.</p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">New Email</div>
          <div class="data-value">${newEmail}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Account</div>
          <div class="account-box">${accountNumber}</div>
        </div>
      </div>

      <div class="alert alert-amber">
        <div class="alert-title">24-hour security lock active</div>
        <div class="alert-body">As a safety measure, transactions are paused for 24 hours following an email change.</div>
      </div>
    </div>`;

  const text = `Hi ${userName},\n\nYour email address has been updated to ${newEmail}.\n\nAccount: ${accountNumber}\n\nTransactions are paused for 24 hours as a security measure.\n\n— Salva\nsalva-nexus.org`;

  try {
    await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: newEmail,
      subject: "Email updated — Salva",
      html: baseTemplate({ preheader: "Your Salva email address has been updated.", body }),
      text,
    });
    console.log(`📧 Email change confirmation sent to: ${newEmail}`);
  } catch (error) {
    console.error("❌ Failed to send email change confirmation:", error.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATOR PROPOSAL EMAIL
// ─────────────────────────────────────────────────────────────────────────────
async function sendValidatorProposalEmail(
  validatorEmail,
  validatorName,
  subject,
  payload,
) {
  let detailsBlock = "";
  let preheaderText = "";
  let detailsText = "";

  if (payload.type === "registry") {
    const walletBadge = payload.isWallet
      ? `<span class="badge badge-blue">Crypto Wallet</span>`
      : `<span class="badge" style="background:var(--bg-pill);border-color:var(--border);color:var(--text-muted);">Non-Wallet Registry</span>`;

    preheaderText = `New registry proposal: ${payload.registryName || payload.nspace}`;
    detailsText   = `Registry: ${payload.registryName || payload.nspace}\nNamespace: ${payload.nspace}\nAddress: ${payload.registry}\nType: ${payload.isWallet ? "Crypto Wallet" : "Non-Wallet Registry"}`;

    detailsBlock = `
      <div class="data-block">
        <div class="data-row">
          <div class="data-label">Type</div>
          ${walletBadge}
        </div>
        <div class="data-row">
          <div class="data-label">Registry Name</div>
          <div class="data-value">${payload.registryName || payload.nspace}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Namespace</div>
          <div class="data-value data-value-gold">${payload.nspace}</div>
        </div>
        <div class="data-row">
          <div class="data-label">Contract Address</div>
          <div class="data-value data-value-mono">${payload.registry}</div>
        </div>
      </div>`;

  } else if (payload.type === "validator") {
    const isAdd      = payload.action;
    const badgeClass = isAdd ? "badge-green" : "badge-red";
    const actionText = isAdd ? "Add Validator" : "Remove Validator";

    preheaderText = `Validator proposal: ${actionText} — ${payload.targetAddress?.slice(0, 10)}…`;
    detailsText   = `Action: ${actionText}\nTarget: ${payload.targetAddress}`;

    detailsBlock = `
      <div class="data-block">
        <div class="data-row">
          <div class="data-label">Action</div>
          <span class="badge ${badgeClass}">${actionText}</span>
        </div>
        <div class="data-row">
          <div class="data-label">Target Address</div>
          <div class="data-value data-value-mono">${payload.targetAddress}</div>
        </div>
      </div>`;

  } else {
    console.error(`❌ sendValidatorProposalEmail: unknown payload type "${payload.type}"`);
    return;
  }

  const body = `
    <div class="banner banner-info">📋 Action Required</div>
    <div class="body">
      <div class="greeting">Hi ${validatorName},</div>
      <p class="subtext">A new governance proposal has been submitted and requires your vote. Log into your dashboard to validate or reject it.</p>

      ${detailsBlock}

      <div class="alert alert-gold">
        <div class="alert-title">Your vote matters</div>
        <div class="alert-body">Quorum is required before this proposal can be executed. Head to your Admin panel to cast your vote.</div>
      </div>

      <div style="text-align:center; margin-top:8px;">
        <a href="https://salva-nexus.org/dashboard" style="display:inline-block;background-color:var(--gold);color:#000;font-size:10px;font-weight:800;letter-spacing:0.2em;text-transform:uppercase;text-decoration:none;padding:12px 28px;border-radius:999px;">Go to Dashboard →</a>
      </div>
    </div>`;

  const text = `Hi ${validatorName},\n\nA new governance proposal requires your vote.\n\n${detailsText}\n\nLog in at salva-nexus.org/dashboard to validate.\n\n— Salva Admin`;

  try {
    await resend.emails.send({
      from: "Salva Admin <no-reply@salva-nexus.org>",
      to: validatorEmail,
      subject: `[Salva Admin] ${subject}`,
      html: baseTemplate({
        preheader: preheaderText,
        body,
        footerNote: "You're receiving this because you are a Salva validator.",
      }),
      text,
    });
    console.log(`📧 Validator proposal email sent to: ${validatorEmail}`);
  } catch (error) {
    console.error("❌ Validator proposal email failed:", error.message);
  }
}

module.exports = {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
  sendValidatorProposalEmail,
};