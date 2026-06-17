// packages/backend/src/scripts/announceV3Live.js
// Run once: node src/scripts/announceV3Live.js

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
  <title>Salva V3 is Live — The Naira DEX is Here</title>
</head>
<body style="margin:0;padding:0;background:#060606;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060606;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <!-- TOP ACCENT LINE -->
          <tr>
            <td style="background:linear-gradient(90deg,transparent,#D4AF37,transparent);height:2px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <!-- HEADER -->
          <tr>
            <td style="background:#0D0D0D;border-left:1px solid rgba(212,175,55,0.2);border-right:1px solid rgba(212,175,55,0.2);padding:40px 44px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:26px;font-weight:900;color:#D4AF37;letter-spacing:3px;">SALVA</p>
                    <p style="margin:0;font-size:11px;font-weight:700;color:#D4AF37;text-transform:uppercase;letter-spacing:6px;opacity:0.55;">V3 · Live Now</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- HERO -->
          <tr>
            <td style="background:linear-gradient(160deg,#111008 0%,#0D0D0D 55%,#080810 100%);border-left:1px solid rgba(212,175,55,0.2);border-right:1px solid rgba(212,175,55,0.2);padding:56px 44px 48px;">

              <!-- Greeting -->
              <p style="margin:0 0 32px;font-size:14px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:4px;">Hey ${username},</p>

              <!-- Headline -->
              <h1 style="margin:0 0 6px;font-size:50px;font-weight:900;line-height:1.0;letter-spacing:-2px;color:#ffffff;">The Naira DEX</h1>
              <h1 style="margin:0 0 12px;font-size:50px;font-weight:900;line-height:1.0;letter-spacing:-2px;color:#D4AF37;">is live. 🎉</h1>

              <!-- Sub-headline -->
              <p style="margin:0 0 40px;font-size:18px;font-weight:700;color:#ffffff;line-height:1.5;">
                Salva V3 — Nigeria's first permissionless, decentralized exchange for Naira stablecoins — is now open to everyone.
              </p>

              <!-- Accent rule -->
              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 40px;">
                <tr>
                  <td style="width:40px;height:2px;background:#D4AF37;vertical-align:middle;"></td>
                  <td style="width:8px;"></td>
                  <td style="width:20px;height:2px;background:rgba(212,175,55,0.3);vertical-align:middle;"></td>
                </tr>
              </table>

              <!-- Body copy block 1 -->
              <p style="margin:0 0 20px;font-size:17px;color:#ffffff;line-height:1.85;">
                You can now swap between <strong style="color:#D4AF37;">NGN and USD stablecoins</strong> directly on-chain — no banks, no middlemen, no permission needed.
              </p>
              <p style="margin:0 0 20px;font-size:17px;color:#ffffff;line-height:1.85;">
                Deploy your own liquidity pool, set your own rates, earn fees from every swap, and manage everything from your Salva wallet. It's fully non-custodial — your keys, your funds.
              </p>
              <p style="margin:0 0 48px;font-size:17px;color:#ffffff;line-height:1.85;">
                Available on <strong style="color:#ffffff;">Base</strong> and <strong style="color:#ffffff;">BNB Chain</strong> — right now.
              </p>

              <!-- Feature cards row -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 48px;">
                <tr>
                  <!-- Card 1 -->
                  <td width="32%" style="vertical-align:top;padding-right:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(34,197,94,0.06);border:1px solid rgba(34,197,94,0.25);border-radius:14px;">
                      <tr>
                        <td style="padding:22px 18px;">
                          <p style="margin:0 0 10px;font-size:22px;">⛏</p>
                          <p style="margin:0 0 6px;font-size:12px;font-weight:900;color:#22c55e;text-transform:uppercase;letter-spacing:2px;">Deploy Pools</p>
                          <p style="margin:0;font-size:13px;color:#ffffff;line-height:1.6;">Launch your own NGN/USD liquidity pool in seconds.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Card 2 -->
                  <td width="32%" style="vertical-align:top;padding-right:8px;padding-left:4px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(96,165,250,0.06);border:1px solid rgba(96,165,250,0.25);border-radius:14px;">
                      <tr>
                        <td style="padding:22px 18px;">
                          <p style="margin:0 0 10px;font-size:22px;">⚡</p>
                          <p style="margin:0 0 6px;font-size:12px;font-weight:900;color:#60a5fa;text-transform:uppercase;letter-spacing:2px;">Earn Fees</p>
                          <p style="margin:0;font-size:13px;color:#ffffff;line-height:1.6;">Earn on every swap through your pool — 24/7, on-chain.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <!-- Card 3 -->
                  <td width="32%" style="vertical-align:top;padding-left:4px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:14px;">
                      <tr>
                        <td style="padding:22px 18px;">
                          <p style="margin:0 0 10px;font-size:22px;">⇄</p>
                          <p style="margin:0 0 6px;font-size:12px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;">Swap</p>
                          <p style="margin:0;font-size:13px;color:#ffffff;line-height:1.6;">Swap NGN and USD stablecoins at market rates, instantly.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- How it works section -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;margin:0 0 44px;">
                <tr>
                  <td style="padding:30px 32px;">
                    <p style="margin:0 0 24px;font-size:11px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:5px;">How It Works</p>

                    <!-- Step 1 -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">1</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">Open your Salva Dashboard</p>
                          <p style="margin:0;font-size:14px;color:#ffffff;line-height:1.6;">Head to salva-nexus.org and log in to your wallet.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 2 -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">2</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">Tap "Swap" to trade</p>
                          <p style="margin:0;font-size:14px;color:#ffffff;line-height:1.6;">Pick a pool, enter your amount, swap NGN ↔ USD at the live rate.</p>
                        </td>
                      </tr>
                    </table>

                    <!-- Step 3 -->
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">3</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">Or tap "Deploy Pool" to earn</p>
                          <p style="margin:0;font-size:14px;color:#ffffff;line-height:1.6;">Deploy a pool, add liquidity, set your rates, publish — start earning immediately.</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <!-- Article card -->
              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.25);border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:5px;">Featured Read</p>
                    <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#ffffff;line-height:1.3;">What Salva V3 Means for Nigerian DeFi</p>
                    <p style="margin:0 0 6px;font-size:13px;color:#D4AF37;font-weight:700;">by cboi@salva</p>
                    <p style="margin:0 0 28px;font-size:15px;color:#ffffff;line-height:1.75;">
                      A full breakdown of the V3 DEX architecture, the liquidity model, and what permissionless Naira trading means for everyday Nigerians transacting on-chain.
                    </p>
                    <a href="https://x.com/cboi019/status/2060354001120473184"
                       style="display:inline-block;background:#D4AF37;color:#000000;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2.5px;padding:15px 32px;border-radius:10px;text-decoration:none;">
                      Read the Article &nbsp;→
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- CTA STRIP -->
          <tr>
            <td style="background:#D4AF37;border-left:1px solid #D4AF37;border-right:1px solid #D4AF37;padding:0;">
              <a href="https://salva-nexus.org" style="display:block;text-decoration:none;padding:22px 44px;text-align:center;">
                <span style="font-size:15px;font-weight:900;color:#000000;text-transform:uppercase;letter-spacing:4px;">Open Salva &nbsp;→</span>
              </a>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#0A0A0A;border:1px solid rgba(212,175,55,0.15);border-top:none;padding:32px 44px;border-radius:0 0 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 5px;font-size:14px;font-weight:900;color:#D4AF37;">— The Salva Team</p>
                    <p style="margin:0;font-size:12px;color:#ffffff;opacity:0.4;">Non-custodial · Permissionless · Open Source</p>
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <p style="margin:0;font-size:11px;color:#ffffff;opacity:0.2;text-align:right;">© 2025 Salva Protocol<br/>salva-nexus.org</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- BOTTOM ACCENT LINE -->
          <tr>
            <td style="background:linear-gradient(90deg,transparent,rgba(212,175,55,0.4),transparent);height:2px;font-size:0;line-height:0;">&nbsp;</td>
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
        subject: '🎉 Salva V3 is Live — The Naira DEX is Here',
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
