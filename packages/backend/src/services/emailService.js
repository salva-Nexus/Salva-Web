import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM = {
  default: "Salva <no-reply@salva-nexus.org>",
  security: "Salva Security <no-reply@salva-nexus.org>",
  admin: "Salva Admin <no-reply@salva-nexus.org>",
};

const APP_URL = "https://salva-nexus.org";
const DASHBOARD_URL = `${APP_URL}/dashboard`;
const SUPPORT_EMAIL = "support@salva-nexus.org";

const isProduction = process.env.NODE_ENV === "production";
const DEFAULT_NETWORK = `Base · ${isProduction ? "Mainnet" : "Testnet"}`;

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const escapeHtml = (value) => {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

const formatAmount = (amount) => {
  const parsed = Number.parseFloat(amount);

  if (!Number.isFinite(parsed)) return "0.00";

  return parsed.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
};

const shortAddress = (address, start = 10, end = 8) => {
  if (!address) return "—";

  const value = String(address);

  if (value.length <= start + end + 3) {
    return value;
  }

  return `${value.slice(0, start)}…${value.slice(-end)}`;
};

const getNetworkLabel = (network = "Base") => {
  const normalized = String(network || "Base").trim();

  if (!normalized) return DEFAULT_NETWORK;

  return `${normalized} · ${isProduction ? "Mainnet" : "Testnet"}`;
};

const getCoinLabel = (coin) => {
  if (!coin) return "Token";

  return String(coin).toUpperCase() === "NGN" ? "NGNs" : String(coin);
};

const safeName = (name, fallback = "there") => {
  const value = String(name || "").trim();

  return value ? escapeHtml(value) : fallback;
};

const safeValue = (value, fallback = "—") => {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return escapeHtml(value);
};

const sendEmail = async ({
  from,
  to,
  subject,
  html,
  text,
  logLabel,
}) => {
  try {
    const result = await resend.emails.send({
      from,
      to,
      subject,
      html,
      text,
    });

    if (result?.error) {
      throw new Error(result.error.message || "Resend returned an error");
    }

    if (logLabel) {
      console.log(`📧 ${logLabel}: ${to}`);
    }

    return result;
  } catch (error) {
    console.error(
      `❌ ${logLabel || "Email send"} failed:`,
      error?.message || error,
    );

    return null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// BASE TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────

function baseTemplate({
  preheader = "",
  body = "",
  footerNote = "",
}) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  />

  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />

  <title>SALVA</title>

  <style>
    /* ───────────────────────────────────────────────────────────────────────
       RESET
    ─────────────────────────────────────────────────────────────────────── */

    *,
    *::before,
    *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      margin: 0;
      padding: 0;
      width: 100%;
      background: #f0f0f0;
      color: #0a0a0b;
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        Helvetica,
        Arial,
        sans-serif;
      -webkit-font-smoothing: antialiased;
    }

    table {
      border-collapse: collapse;
    }

    a {
      color: inherit;
    }

    /* ───────────────────────────────────────────────────────────────────────
       THEME
    ─────────────────────────────────────────────────────────────────────── */

    :root {
      --bg-page: #f0f0f0;
      --bg-card: #ffffff;
      --bg-subtle: #f5f5f5;
      --bg-pill: #efefef;

      --border: #e0e0e0;

      --text-primary: #0a0a0b;
      --text-secondary: #555555;
      --text-muted: #999999;

      --gold: #c9a227;
      --gold-light: #fff8e1;
      --gold-border: #e8ce6a;

      --green: #16a34a;
      --green-light: #f0fdf4;
      --green-border: #86efac;

      --red: #dc2626;
      --red-light: #fef2f2;
      --red-border: #fecaca;

      --amber: #d97706;
      --amber-light: #fffbeb;
      --amber-border: #fde68a;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-page: #09090b;
        --bg-card: #111113;
        --bg-subtle: #18181b;
        --bg-pill: #222224;

        --border: rgba(255, 255, 255, 0.08);

        --text-primary: #ffffff;
        --text-secondary: rgba(255, 255, 255, 0.68);
        --text-muted: rgba(255, 255, 255, 0.38);

        --gold: #d4af37;
        --gold-light: rgba(212, 175, 55, 0.08);
        --gold-border: rgba(212, 175, 55, 0.3);

        --green: #22c55e;
        --green-light: rgba(34, 197, 94, 0.08);
        --green-border: rgba(34, 197, 94, 0.25);

        --red: #ef4444;
        --red-light: rgba(239, 68, 68, 0.08);
        --red-border: rgba(239, 68, 68, 0.25);

        --amber: #f59e0b;
        --amber-light: rgba(245, 158, 11, 0.08);
        --amber-border: rgba(245, 158, 11, 0.3);
      }

      body {
        background: #09090b !important;
        color: #ffffff !important;
      }
    }

    /* ───────────────────────────────────────────────────────────────────────
       LAYOUT
    ─────────────────────────────────────────────────────────────────────── */

    .wrapper {
      width: 100%;
      padding: 32px 16px;
      background: var(--bg-page);
    }

    .card {
      width: 100%;
      max-width: 560px;
      margin: 0 auto;
      overflow: hidden;

      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 20px;
    }

    /* ───────────────────────────────────────────────────────────────────────
       HEADER
    ─────────────────────────────────────────────────────────────────────── */

    .header {
      padding: 0 40px;
      background: #0a0a0b;
      text-align: center;
      border-bottom: 1px solid rgba(212, 175, 55, 0.18);
    }

    .header-inner {
      padding: 24px 0 20px;
    }

    .header-logo {
      color: #d4af37;
      font-size: 28px;
      font-weight: 900;
      line-height: 1;
      letter-spacing: 0.35em;
    }

    .header-tag {
      margin-top: 7px;

      color: rgba(212, 175, 55, 0.55);
      font-size: 9px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0.25em;
      text-transform: uppercase;
    }

    .gold-line {
      width: 100%;
      height: 1px;

      background:
        linear-gradient(
          to right,
          transparent,
          #d4af37,
          transparent
        );
    }

    /* ───────────────────────────────────────────────────────────────────────
       STATUS BANNER
    ─────────────────────────────────────────────────────────────────────── */

    .banner {
      padding: 14px 40px;

      font-size: 10px;
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: 0.2em;
      text-align: center;
      text-transform: uppercase;
    }

    .banner-success {
      color: var(--green);
      background: var(--green-light);
      border-bottom: 1px solid var(--green-border);
    }

    .banner-error {
      color: var(--red);
      background: var(--red-light);
      border-bottom: 1px solid var(--red-border);
    }

    .banner-warning {
      color: var(--amber);
      background: var(--amber-light);
      border-bottom: 1px solid var(--amber-border);
    }

    .banner-info {
      color: var(--gold);
      background: var(--gold-light);
      border-bottom: 1px solid var(--gold-border);
    }

    /* ───────────────────────────────────────────────────────────────────────
       BODY
    ─────────────────────────────────────────────────────────────────────── */

    .body {
      padding: 36px 40px;
    }

    .greeting {
      margin-bottom: 10px;

      color: var(--text-primary);
      font-size: 18px;
      font-weight: 900;
      line-height: 1.35;
      letter-spacing: -0.01em;
    }

    .subtext {
      margin-bottom: 24px;

      color: var(--text-secondary);
      font-size: 14px;
      line-height: 1.7;
    }

    .center-note {
      margin-top: 8px;

      color: var(--text-muted);
      font-size: 12px;
      line-height: 1.7;
      text-align: center;
    }

    /* ───────────────────────────────────────────────────────────────────────
       DATA BLOCKS
    ─────────────────────────────────────────────────────────────────────── */

    .data-block {
      margin-bottom: 16px;
      overflow: hidden;

      background: var(--bg-subtle);
      border: 1px solid var(--border);
      border-radius: 14px;
    }

    .data-row {
      padding: 15px 20px;
      border-bottom: 1px solid var(--border);
    }

    .data-row:last-child {
      border-bottom: none;
    }

    .data-label {
      margin-bottom: 6px;

      color: var(--text-muted);
      font-size: 9px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }

    .data-value {
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 700;
      line-height: 1.5;
      word-break: break-word;
    }

    .data-value-large {
      color: var(--text-primary);
      font-size: 28px;
      font-weight: 900;
      line-height: 1.2;
      letter-spacing: -0.025em;
      word-break: break-word;
    }

    .data-value-gold {
      color: var(--gold);
    }

    .data-value-green {
      color: var(--green);
    }

    .data-value-red {
      color: var(--red);
    }

    .data-value-mono {
      color: var(--text-muted);
      font-family:
        "SFMono-Regular",
        Consolas,
        "Liberation Mono",
        "Courier New",
        monospace;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.5;
      word-break: break-all;
    }

    /* ───────────────────────────────────────────────────────────────────────
       ALERTS
    ─────────────────────────────────────────────────────────────────────── */

    .alert {
      margin-bottom: 16px;
      padding: 15px 18px;

      border: 1px solid;
      border-radius: 12px;
    }

    .alert-title {
      margin-bottom: 6px;

      font-size: 10px;
      font-weight: 800;
      line-height: 1.4;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    .alert-body {
      font-size: 13px;
      line-height: 1.6;
    }

    .alert-gold {
      background: var(--gold-light);
      border-color: var(--gold-border);
    }

    .alert-gold .alert-title,
    .alert-gold .alert-body {
      color: var(--gold);
    }

    .alert-green {
      background: var(--green-light);
      border-color: var(--green-border);
    }

    .alert-green .alert-title,
    .alert-green .alert-body {
      color: var(--green);
    }

    .alert-red {
      background: var(--red-light);
      border-color: var(--red-border);
    }

    .alert-red .alert-title,
    .alert-red .alert-body {
      color: var(--red);
    }

    .alert-amber {
      background: var(--amber-light);
      border-color: var(--amber-border);
    }

    .alert-amber .alert-title,
    .alert-amber .alert-body {
      color: var(--amber);
    }

    /* ───────────────────────────────────────────────────────────────────────
       BADGES
    ─────────────────────────────────────────────────────────────────────── */

    .badge {
      display: inline-block;

      padding: 4px 10px;

      border: 1px solid;
      border-radius: 999px;

      font-size: 9px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0.15em;
      text-transform: uppercase;
    }

    .badge-gold {
      color: var(--gold);
      background: var(--gold-light);
      border-color: var(--gold-border);
    }

    .badge-green {
      color: var(--green);
      background: var(--green-light);
      border-color: var(--green-border);
    }

    .badge-red {
      color: var(--red);
      background: var(--red-light);
      border-color: var(--red-border);
    }

    .badge-blue {
      color: #3b82f6;
      background: rgba(59, 130, 246, 0.08);
      border-color: rgba(59, 130, 246, 0.3);
    }

    .badge-neutral {
      color: var(--text-muted);
      background: var(--bg-pill);
      border-color: var(--border);
    }

    /* ───────────────────────────────────────────────────────────────────────
       ACCOUNT BOX
    ─────────────────────────────────────────────────────────────────────── */

    .account-box {
      margin-top: 8px;
      padding: 11px 14px;

      color: var(--gold);
      background: var(--gold-light);
      border: 1px solid var(--gold-border);
      border-radius: 10px;

      font-family:
        "SFMono-Regular",
        Consolas,
        "Liberation Mono",
        "Courier New",
        monospace;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.5;
      word-break: break-word;
    }

    /* ───────────────────────────────────────────────────────────────────────
       DIVIDER
    ─────────────────────────────────────────────────────────────────────── */

    .divider {
      width: 100%;
      height: 1px;
      margin: 24px 0;

      background:
        linear-gradient(
          to right,
          transparent,
          var(--border),
          transparent
        );
    }

    /* ───────────────────────────────────────────────────────────────────────
       BUTTON
    ─────────────────────────────────────────────────────────────────────── */

    .button-wrap {
      margin-top: 8px;
      text-align: center;
    }

    .button {
      display: inline-block;

      padding: 12px 28px;

      color: #000000 !important;
      background: var(--gold);
      border-radius: 999px;

      font-size: 10px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0.2em;
      text-decoration: none;
      text-transform: uppercase;
    }

    /* ───────────────────────────────────────────────────────────────────────
       FOOTER
    ─────────────────────────────────────────────────────────────────────── */

    .footer {
      padding: 24px 40px;

      background: var(--bg-subtle);
      border-top: 1px solid var(--border);

      text-align: center;
    }

    .footer-note {
      margin-bottom: 16px;

      color: var(--text-muted);
      font-size: 11px;
      line-height: 1.7;
    }

    .footer-link {
      display: inline-block;

      padding: 10px 24px;

      color: #000000 !important;
      background: var(--gold);
      border-radius: 999px;

      font-size: 10px;
      font-weight: 800;
      line-height: 1.3;
      letter-spacing: 0.2em;
      text-decoration: none;
      text-transform: uppercase;
    }

    .footer-brand {
      margin-top: 16px;

      color: var(--text-muted);
      font-size: 9px;
      font-weight: 700;
      line-height: 1.4;
      letter-spacing: 0.3em;
      text-transform: uppercase;
    }

    /* ───────────────────────────────────────────────────────────────────────
       MOBILE
    ─────────────────────────────────────────────────────────────────────── */

    @media only screen and (max-width: 600px) {
      .wrapper {
        padding: 12px 8px !important;
      }

      .card {
        border-radius: 16px !important;
      }

      .header {
        padding-left: 24px !important;
        padding-right: 24px !important;
      }

      .body {
        padding: 28px 24px !important;
      }

      .footer {
        padding: 22px 24px !important;
      }

      .banner {
        padding-left: 24px !important;
        padding-right: 24px !important;
      }

      .header-logo {
        font-size: 24px !important;
      }

      .greeting {
        font-size: 17px !important;
      }

      .data-value-large {
        font-size: 23px !important;
      }

      .data-row {
        padding: 14px 16px !important;
      }
    }
  </style>
</head>

<body>
  ${
    preheader
      ? `
        <div
          style="
            display:none;
            max-height:0;
            overflow:hidden;
            opacity:0;
            color:transparent;
            mso-hide:all;
          "
        >
          ${escapeHtml(preheader)}
        </div>
      `
      : ""
  }

  <div class="wrapper">
    <div class="card">

      <!-- HEADER -->
      <div class="header">
        <div class="gold-line"></div>

        <div class="header-inner">
          <div class="header-logo">SALVA</div>
          <div class="header-tag">On-chain Financial Protocol</div>
        </div>

        <div class="gold-line"></div>
      </div>

      <!-- CONTENT -->
      ${body}

      <!-- FOOTER -->
      <div class="footer">
        <div class="footer-note">
          ${footerNote || "Questions? Our support team is here for you."}
        </div>

        <a
          href="mailto:${SUPPORT_EMAIL}"
          class="footer-link"
        >
          Contact Support
        </a>

        <div class="footer-brand">
          © SALVA · salva-nexus.org
        </div>
      </div>

    </div>
  </div>
</body>
</html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// WELCOME EMAIL
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendWelcomeEmail(userEmail, userName) {
  const name = safeName(userName);

  const body = `
    <div class="banner banner-info">✦ Welcome to Salva</div>

    <div class="body">
      <div class="greeting">Welcome, ${name} 👋</div>

      <p class="subtext">
        Your account is live and your smart wallet is ready.
        You're now connected to the Salva network — an on-chain
        financial layer built for everyday use.
      </p>

      <div class="data-block">
        <div class="data-row">
          <div class="data-label">What you can do</div>

          <div
            class="data-value"
            style="line-height:1.9;"
          >
            ↑ &nbsp;Send assets to other wallets<br/>
            ↓ &nbsp;Receive assets from any compatible wallet<br/>
            ⛓ &nbsp;Register a name alias<br/>
            ⭐ &nbsp;Earn Salva points through network activity
          </div>
        </div>
      </div>

      <div class="alert alert-gold">
        <div class="alert-title">Security reminder</div>

        <div class="alert-body">
          Salva will never ask for your password, transaction PIN,
          or private key. If anyone does — it's a scam.
        </div>
      </div>

      <p class="center-note">
        — The Salva Team
      </p>
    </div>
  `;

  const text = `Welcome to SALVA, ${userName || "there"}!

Your account is live and your smart wallet is ready.

What you can do:
- Send assets to other wallets
- Receive assets from compatible wallets
- Register a name alias
- Earn Salva points through network activity

Security reminder:
Salva will never ask for your password, transaction PIN, or private key.
If anyone does, it's a scam.

— The Salva Team
${APP_URL}`;

  return sendEmail({
    from: FROM.default,
    to: userEmail,
    subject: "Welcome to Salva — Your wallet is ready",
    html: baseTemplate({
      preheader: `Welcome ${userName || "to Salva"}, your wallet is live.`,
      body,
    }),
    text,
    logLabel: "Welcome email sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION EMAIL — SENDER
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendTransactionEmailToSender(
  email,
  senderAddress,
  receiverAddress,
  amount,
  coin,
) {
  const coinLabel = getCoinLabel(coin);

  const safeReceiver = safeValue(receiverAddress);
  const safeSender = safeValue(senderAddress);

  const body = `
    <div class="banner banner-success">✓ Payment Sent</div>

    <div class="body">
      <div class="greeting">Transfer complete</div>

      <p class="subtext">
        Your transfer has been confirmed on-chain and the
        transaction has been submitted successfully.
      </p>

      <div class="data-block">

        <div class="data-row">
          <div class="data-label">Amount sent</div>

          <div class="data-value-large data-value-green">
            ${formatAmount(amount)}
            <span style="font-size:14px;font-weight:700;">
              ${escapeHtml(coinLabel)}
            </span>
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">From</div>
          <div class="data-value data-value-mono">
            ${safeSender}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Sent to</div>
          <div class="data-value data-value-mono">
            ${safeReceiver}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Network</div>
          <div class="data-value">
            ${escapeHtml(DEFAULT_NETWORK)}
          </div>
        </div>

      </div>

      <div class="alert alert-green">
        <div class="alert-title">✓ Confirmed on-chain</div>

        <div class="alert-body">
          The transfer has been recorded on the Base blockchain.
          Blockchain transactions cannot be reversed by Salva.
        </div>
      </div>

      <div class="button-wrap">
        <a
          href="${DASHBOARD_URL}"
          class="button"
        >
          View Dashboard →
        </a>
      </div>
    </div>
  `;

  const text = `Transfer confirmed.

Amount: ${formatAmount(amount)} ${coinLabel}
From: ${senderAddress || "Your Salva wallet"}
Recipient: ${receiverAddress || "—"}
Network: ${DEFAULT_NETWORK}

The transfer has been recorded on-chain.

${DASHBOARD_URL}

— Salva
${APP_URL}`;

  return sendEmail({
    from: FROM.default,
    to: email,
    subject: `Transfer confirmed — ${formatAmount(amount)} ${coinLabel} sent`,
    html: baseTemplate({
      preheader: `Your transfer of ${formatAmount(amount)} ${coinLabel} is confirmed.`,
      body,
    }),
    text,
    logLabel: "Sender transaction email sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION EMAIL — RECEIVER
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendTransactionEmailToReceiver(
  email,
  receiverName,
  senderAddress,
  amount,
  coin,
) {
  const coinLabel = getCoinLabel(coin);

  const name = safeName(receiverName);
  const safeSender = safeValue(senderAddress);

  const body = `
    <div class="banner banner-success">↓ Payment Received</div>

    <div class="body">
      <div class="greeting">Hi ${name},</div>

      <p class="subtext">
        You've received a transfer. The funds are now available
        in your Salva wallet.
      </p>

      <div class="data-block">

        <div class="data-row">
          <div class="data-label">Amount received</div>

          <div class="data-value-large data-value-green">
            +${formatAmount(amount)}
            <span style="font-size:14px;font-weight:700;">
              ${escapeHtml(coinLabel)}
            </span>
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">From</div>
          <div class="data-value data-value-mono">
            ${safeSender}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Network</div>
          <div class="data-value">
            ${escapeHtml(DEFAULT_NETWORK)}
          </div>
        </div>

      </div>

      <div class="alert alert-gold">
        <div class="alert-title">Funds are available</div>

        <div class="alert-body">
          Log into your Salva dashboard to view your balance
          and transaction history.
        </div>
      </div>

      <div class="button-wrap">
        <a
          href="${DASHBOARD_URL}"
          class="button"
        >
          Open Salva →
        </a>
      </div>
    </div>
  `;

  const text = `Hi ${receiverName || "there"},

You received ${formatAmount(amount)} ${coinLabel} from ${senderAddress || "another wallet"}.

The funds are now available in your Salva wallet.

Network: ${DEFAULT_NETWORK}

Open your dashboard:
${DASHBOARD_URL}

— Salva
${APP_URL}`;

  return sendEmail({
    from: FROM.default,
    to: email,
    subject: `You received ${formatAmount(amount)} ${coinLabel} — Salva`,
    html: baseTemplate({
      preheader: `${formatAmount(amount)} ${coinLabel} landed in your wallet.`,
      body,
    }),
    text,
    logLabel: "Receiver transaction email sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY CHANGE EMAIL
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendSecurityChangeEmail(
  userEmail,
  userName,
  changeType,
) {
  const labels = {
    email: "Email Address",
    password: "Password",
    pin: "Transaction PIN",
  };

  const changeLabel =
    labels[String(changeType || "").toLowerCase()] ||
    String(changeType || "Account Security Setting");

  const safeChangeLabel = escapeHtml(changeLabel);
  const name = safeName(userName);

  const body = `
    <div class="banner banner-warning">⚠ Security Change</div>

    <div class="body">
      <div class="greeting">Hi ${name},</div>

      <p class="subtext">
        Your <strong>${safeChangeLabel}</strong> was just changed
        successfully. As a precaution, your account is now
        restricted for 24 hours.
      </p>

      <div class="data-block">

        <div class="data-row">
          <div class="data-label">Change type</div>
          <div class="data-value">
            ${safeChangeLabel}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Restriction period</div>
          <div class="data-value">
            24 hours from now
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Account</div>
          <div class="account-box">
            ${name}
          </div>
        </div>

      </div>

      <div class="alert alert-red">
        <div class="alert-title">Didn't make this change?</div>

        <div class="alert-body">
          If you didn't authorize this change, contact our support
          team immediately.
        </div>
      </div>
    </div>
  `;

  const text = `Hi ${userName || "there"},

Your ${changeLabel} was changed successfully.

As a security measure, your account is restricted for 24 hours.

Didn't make this change?
Contact ${SUPPORT_EMAIL} immediately.

— Salva Security Team
${APP_URL}`;

  return sendEmail({
    from: FROM.security,
    to: userEmail,
    subject: `Security alert: ${changeLabel} changed — Salva`,
    html: baseTemplate({
      preheader: `Your ${changeLabel} was just updated on your Salva account.`,
      body,
      footerNote:
        "If you didn't make this change, contact us immediately.",
    }),
    text,
    logLabel: "Security alert sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL CHANGE CONFIRMATION
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendEmailChangeConfirmation(
  newEmail,
  userName,
) {
  const name = safeName(userName);
  const safeEmail = safeValue(newEmail);

  const body = `
    <div class="banner banner-success">✓ Email Updated</div>

    <div class="body">
      <div class="greeting">Hi ${name},</div>

      <p class="subtext">
        Your email address has been updated. All future Salva
        notifications will arrive at this address.
      </p>

      <div class="data-block">

        <div class="data-row">
          <div class="data-label">New email</div>
          <div class="data-value">
            ${safeEmail}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Account</div>

          <div class="account-box">
            ${name}
          </div>
        </div>

      </div>

      <div class="alert alert-amber">
        <div class="alert-title">24-hour security lock active</div>

        <div class="alert-body">
          As a safety measure, transactions are paused for
          24 hours following an email change.
        </div>
      </div>
    </div>
  `;

  const text = `Hi ${userName || "there"},

Your Salva email address has been updated to ${newEmail}.

As a security measure, transactions are paused for 24 hours.

If you did not make this change, contact ${SUPPORT_EMAIL} immediately.

— Salva
${APP_URL}`;

  return sendEmail({
    from: FROM.default,
    to: newEmail,
    subject: "Email updated — Salva",
    html: baseTemplate({
      preheader: "Your Salva email address has been updated.",
      body,
    }),
    text,
    logLabel: "Email change confirmation sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// VALIDATOR PROPOSAL EMAIL
// Signature preserved.
// ─────────────────────────────────────────────────────────────────────────────

async function sendValidatorProposalEmail(
  validatorEmail,
  validatorName,
  subject,
  payload,
) {
  if (!payload || typeof payload !== "object") {
    console.error(
      "❌ sendValidatorProposalEmail: invalid payload",
    );
    return null;
  }

  let detailsBlock = "";
  let preheaderText = "";
  let detailsText = "";

  // ───────────────────────────────────────────────────────────────────────────
  // REGISTRY PROPOSAL
  // ───────────────────────────────────────────────────────────────────────────

  if (payload.type === "registry") {
    const registryName =
      payload.registryName || payload.nspace || "Unnamed Registry";

    const namespace = payload.nspace || "—";
    const registry = payload.registry || "—";
    const isWallet = Boolean(payload.isWallet);

    const walletBadge = isWallet
      ? `<span class="badge badge-blue">Crypto Wallet</span>`
      : `<span class="badge badge-neutral">Non-Wallet Registry</span>`;

    preheaderText =
      `New registry proposal: ${registryName}`;

    detailsText = [
      `Registry: ${registryName}`,
      `Namespace: ${namespace}`,
      `Address: ${registry}`,
      `Type: ${isWallet ? "Crypto Wallet" : "Non-Wallet Registry"}`,
    ].join("\n");

    detailsBlock = `
      <div class="data-block">

        <div class="data-row">
          <div class="data-label">Type</div>
          ${walletBadge}
        </div>

        <div class="data-row">
          <div class="data-label">Registry name</div>

          <div class="data-value">
            ${safeValue(registryName)}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Namespace</div>

          <div class="data-value data-value-gold">
            ${safeValue(namespace)}
          </div>
        </div>

        <div class="data-row">
          <div class="data-label">Contract address</div>

          <div class="data-value data-value-mono">
            ${safeValue(registry)}
          </div>
        </div>

      </div>
    `;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // VALIDATOR PROPOSAL
  // ───────────────────────────────────────────────────────────────────────────

  else if (payload.type === "validator") {
    const isAdd = Boolean(payload.action);

    const actionText = isAdd
      ? "Add Validator"
      : "Remove Validator";

    const badgeClass = isAdd
      ? "badge-green"
      : "badge-red";

    const targetAddress =
      payload.targetAddress || "—";

    preheaderText =
      `Validator proposal: ${actionText} — ${shortAddress(
        targetAddress,
      )}`;

    detailsText = [
      `Action: ${actionText}`,
      `Target: ${targetAddress}`,
    ].join("\n");

    detailsBlock = `
      <div class="data-block">

        <div class="data-row">
          <div class="data-label">Action</div>

          <span class="badge ${badgeClass}">
            ${actionText}
          </span>
        </div>

        <div class="data-row">
          <div class="data-label">Target address</div>

          <div class="data-value data-value-mono">
            ${safeValue(targetAddress)}
          </div>
        </div>

      </div>
    `;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // UNKNOWN PROPOSAL
  // ───────────────────────────────────────────────────────────────────────────

  else {
    console.error(
      `❌ sendValidatorProposalEmail: unknown payload type "${payload.type}"`,
    );

    return null;
  }

  const name = safeName(validatorName);
  const safeSubject = safeValue(subject);

  const body = `
    <div class="banner banner-info">
      📋 Action Required
    </div>

    <div class="body">

      <div class="greeting">
        Hi ${name},
      </div>

      <p class="subtext">
        A new governance proposal has been submitted and requires
        your vote. Review the proposal and cast your vote from
        the Salva Admin panel.
      </p>

      ${detailsBlock}

      <div class="alert alert-gold">
        <div class="alert-title">Your vote matters</div>

        <div class="alert-body">
          The proposal requires the required validator quorum
          before it can be executed.
        </div>
      </div>

      <div class="button-wrap">
        <a
          href="${DASHBOARD_URL}"
          class="button"
        >
          Go to Dashboard →
        </a>
      </div>

    </div>
  `;

  const text = `Hi ${validatorName || "there"},

A new governance proposal requires your vote.

${detailsText}

Open the Salva dashboard:
${DASHBOARD_URL}

— Salva Admin
${APP_URL}`;

  return sendEmail({
    from: FROM.admin,
    to: validatorEmail,
    subject: `[Salva Admin] ${subject || "Governance proposal requires your vote"}`,
    html: baseTemplate({
      preheader: preheaderText,
      body,
      footerNote:
        "You're receiving this because you are a Salva validator.",
    }),
    text,
    logLabel: "Validator proposal email sent",
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// IMPORTANT: Existing API preserved.
// ─────────────────────────────────────────────────────────────────────────────

export {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
  sendValidatorProposalEmail,
};

