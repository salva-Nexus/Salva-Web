// packages/backend/src/scripts/announceV3.js
// Run once: node src/scripts/announceV3.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { Resend } = require('resend');
const User = require('../models/User');

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmail(username) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Salva V3 — The Naira DEX is on it's way!!!🎉</title>
</head>
<body style="margin:0;padding:0;background:#060606;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060606;padding:40px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

          <!-- TOP ACCENT LINE -->
          <tr>
            <td style="background:linear-gradient(90deg,transparent,#D4AF37,transparent);height:1px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- HEADER -->
          <tr>
            <td style="background:#0D0D0D;border-left:1px solid rgba(212,175,55,0.12);border-right:1px solid rgba(212,175,55,0.12);padding:36px 40px 28px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 2px;font-size:22px;font-weight:900;color:#D4AF37;letter-spacing:2px;">SALVA</p>
                    <p style="margin:0;font-size:9px;font-weight:700;color:rgba(212,175,55,0.4);text-transform:uppercase;letter-spacing:5px;">V3 · Announcement</p>
                  </td>
                  <td align="right" style="vertical-align:top;">
                    <span style="display:inline-block;background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:20px;padding:5px 14px;font-size:9px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:3px;">Coming Soon</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- HERO BLOCK -->
          <tr>
            <td style="background:linear-gradient(160deg,#111008 0%,#0D0D0D 60%,#080810 100%);border-left:1px solid rgba(212,175,55,0.12);border-right:1px solid rgba(212,175,55,0.12);padding:48px 40px 40px;">

              <!-- Greeting -->
              <p style="margin:0 0 28px;font-size:12px;font-weight:700;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:4px;">Hey ${username},</p>

              <!-- Headline -->
              <h1 style="margin:0 0 8px;font-size:42px;font-weight:900;line-height:1.05;letter-spacing:-1.5px;color:#ffffff;">The Naira DEX</h1>
              <h1 style="margin:0 0 36px;font-size:42px;font-weight:900;line-height:1.05;letter-spacing:-1.5px;color:#D4AF37;">is on its way. 🎉</h1>

              <!-- Divider dot row -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 32px;">
                <tr>
                  <td style="width:24px;height:1px;background:rgba(212,175,55,0.4);vertical-align:middle;"></td>
                  <td style="width:6px;height:6px;background:#D4AF37;border-radius:50%;margin:0 8px;vertical-align:middle;padding:0 6px;"></td>
                  <td style="width:24px;height:1px;background:rgba(212,175,55,0.15);vertical-align:middle;"></td>
                </tr>
              </table>

              <!-- Body copy -->
              <p style="margin:0 0 18px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.8;">
                Salva V3 brings a fully on-chain decentralized exchange to the Naira stablecoin ecosystem — letting anyone deploy liquidity pools, earn as a market maker and swap between <strong style="color:rgba(255,255,255,0.8);">NGN and USD stablecoins</strong>.
              </p>
              <p style="margin:0 0 40px;font-size:15px;color:rgba(255,255,255,0.55);line-height:1.8;">
                Permissionless. Non-custodial. Built on <strong style="color:rgba(255,255,255,0.8);">Base</strong> and <strong style="color:rgba(255,255,255,0.8);">BNB Chain</strong>.
              </p>

              <!-- Feature pills -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 44px;">
                <tr>
                  <td style="padding-right:8px;">
                    <span style="display:inline-block;background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.2);border-radius:8px;padding:7px 14px;font-size:10px;font-weight:900;color:#22c55e;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">⛏ Deploy Pools</span>
                  </td>
                  <td style="padding-right:8px;">
                    <span style="display:inline-block;background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.2);border-radius:8px;padding:7px 14px;font-size:10px;font-weight:900;color:#60a5fa;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">⚡ Earn Fees</span>
                  </td>
                  <td>
                    <span style="display:inline-block;background:rgba(212,175,55,0.07);border:1px solid rgba(212,175,55,0.2);border-radius:8px;padding:7px 14px;font-size:10px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;white-space:nowrap;">⇄ Swap</span>
                  </td>
                </tr>
              </table>

              <!-- Article card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.04);border:1px solid rgba(212,175,55,0.18);border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:24px 28px;">
                    <p style="margin:0 0 4px;font-size:9px;font-weight:900;color:rgba(212,175,55,0.5);text-transform:uppercase;letter-spacing:4px;">Featured Read</p>
                    <p style="margin:0 0 6px;font-size:16px;font-weight:900;color:#ffffff;line-height:1.3;">What Salva V3 Means for Nigerian DeFi</p>
                    <p style="margin:0 0 20px;font-size:12px;color:rgba(212,175,55,0.5);font-weight:700;">by cboi@salva</p>
                    <p style="margin:0 0 24px;font-size:13px;color:rgba(255,255,255,0.4);line-height:1.7;">
                      A full breakdown of what V3 brings — the DEX architecture, liquidity model, and what it means for everyday Nigerians transacting on-chain.
                    </p>
                    <a href="https://x.com/cboi019/status/2060354001120473184"
                       style="display:inline-block;background:#D4AF37;color:#000000;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:2.5px;padding:13px 28px;border-radius:10px;text-decoration:none;">
                      Read the Article &nbsp;→
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#0A0A0A;border:1px solid rgba(212,175,55,0.1);border-top:none;padding:28px 40px;border-radius:0 0 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:12px;font-weight:900;color:rgba(212,175,55,0.6);">— The Salva Team</p>
                    <p style="margin:0;font-size:10px;color:rgba(255,255,255,0.15);">Stay tuned. V3 launches soon.</p>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <p style="margin:0;font-size:9px;color:rgba(255,255,255,0.1);text-align:right;">© 2025 Salva Protocol<br/>Non-custodial · Open Source</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BOTTOM ACCENT LINE -->
          <tr>
            <td style="background:linear-gradient(90deg,transparent,rgba(212,175,55,0.3),transparent);height:1px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>
  `;
}

async function sendAnnouncementEmails() {
  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });
  console.log('🍃 MongoDB connected');

  const users = await User.find({}, 'email username').lean();
  console.log(`📋 Found ${users.length} users`);

  let sent = 0;
  let failed = 0;

  for (const user of users) {
    try {
      await resend.emails.send({
        from: 'Salva <no-reply@salva-nexus.org>',
        to: user.email,
        subject: '⚡ Salva V3 — The Naira DEX is Coming',
        html: buildEmail(user.username),
      });

      sent++;
      console.log(`✅ [${sent}/${users.length}] ${user.email}`);

      // 300ms throttle — Resend free tier ~2 req/s
      await new Promise((r) => setTimeout(r, 300));
    } catch (err) {
      failed++;
      console.error(`❌ Failed: ${user.email} — ${err.message}`);
    }
  }

  console.log(`\n📊 Done. Sent: ${sent} | Failed: ${failed} | Total: ${users.length}`);
  await mongoose.disconnect();
  process.exit(0);
}

sendAnnouncementEmails().catch((err) => {
  console.error('💥 Script crashed:', err.message);
  process.exit(1);
});

// node packages/backend/src/scripts/announceV3.js