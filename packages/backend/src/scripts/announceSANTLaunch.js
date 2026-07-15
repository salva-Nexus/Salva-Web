// packages/backend/src/scripts/announceSANTLaunch.js
// Run once: node src/scripts/announceSANTLaunch.js

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const mongoose = require('mongoose');
const { Resend } = require('resend');
const User = require('../models/User');

const resend = new Resend(process.env.RESEND_API_KEY);

function buildEmail(username) {
  // Fallback for missing usernames
  const displayName = username ? username : 'there';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>$SANT is Live — Salva's Native Token</title>
  <style>
    @media only screen and (max-width: 600px) {
      .sant-wrap { padding: 24px 8px !important; }
      .sant-card { border-radius: 0 !important; border-left: none !important; border-right: none !important; }
      .sant-hero { padding: 40px 22px 32px !important; }
      .sant-h1 { font-size: 34px !important; }
      .sant-sub { font-size: 15px !important; }
      .sant-body { font-size: 15px !important; }
      .sant-feature-cell { display: block !important; width: 100% !important; padding: 0 0 12px 0 !important; }
      .sant-footer-cell { display: block !important; width: 100% !important; text-align: left !important; }
      .sant-footer-cell.align-right { text-align: left !important; margin-top: 12px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#060606;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#060606;">
    <tr>
      <td align="center" class="sant-wrap" style="padding:48px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;">

          <tr>
            <td style="background:linear-gradient(90deg,transparent,#D4AF37,transparent);height:2px;font-size:0;line-height:0;">&nbsp;</td>
          </tr>

          <tr>
            <td class="sant-card" style="background:#0D0D0D;border-left:1px solid rgba(212,175,55,0.2);border-right:1px solid rgba(212,175,55,0.2);padding:40px 44px 24px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <p style="margin:0 0 4px;font-size:26px;font-weight:900;color:#D4AF37;letter-spacing:3px;">SALVA</p>
                    <p style="margin:0;font-size:11px;font-weight:700;color:#D4AF37;text-transform:uppercase;letter-spacing:6px;opacity:0.55;">$SANT · Live on Base</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="sant-card sant-hero" style="background:linear-gradient(160deg,#111008 0%,#0D0D0D 55%,#080810 100%);border-left:1px solid rgba(212,175,55,0.2);border-right:1px solid rgba(212,175,55,0.2);padding:44px 44px 48px;">

              <p style="margin:0 0 20px;font-size:14px;font-weight:700;color:#ffffff;text-transform:uppercase;letter-spacing:4px;">Hey ${displayName},</p>

              <h1 class="sant-h1" style="margin:0 0 6px;font-size:44px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#ffffff;">Introducing</h1>
              <h1 class="sant-h1" style="margin:0 0 24px;font-size:44px;font-weight:900;line-height:1.1;letter-spacing:-1.5px;color:#D4AF37;">$SANT.</h1>

              <p class="sant-sub" style="margin:0 0 40px;font-size:17px;font-weight:500;color:#cccccc;line-height:1.6;">
                The reward layer for real utility. Move money, build Nigeria's on-chain economy, and earn equity in the network with every single transaction.
              </p>

              <table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 40px;">
                <tr>
                  <td style="width:40px;height:2px;background:#D4AF37;vertical-align:middle;"></td>
                  <td style="width:8px;"></td>
                  <td style="width:20px;height:2px;background:rgba(212,175,55,0.3);vertical-align:middle;"></td>
                </tr>
              </table>

              <p style="margin:0 0 10px;font-size:11px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:4px;">The Concept</p>
              <p class="sant-body" style="margin:0 0 24px;font-size:16px;color:#ffffff;line-height:1.8;">
                Most crypto projects launch with a "Buy Our Token" story. We don't believe in that. We believe in earning ownership through real usage. 
              </p>
              <p class="sant-body" style="margin:0 0 32px;font-size:16px;color:#ffffff;line-height:1.8;">
                Every transaction you make on the <strong style="color:#D4AF37;">Salva Network</strong> now instantly mints and sends <strong style="color:#ffffff;">$SANT</strong> directly to your self-custody wallet on the **Base network**. Our backend covers the gas—you just use the app.
              </p>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 40px;">
                <tr>
                  <td width="48%" class="sant-feature-cell" style="vertical-align:top;padding-right:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:14px;height:100%;">
                      <tr>
                        <td style="padding:22px 18px;">
                          <p style="margin:0 0 10px;font-size:22px;">⚡</p>
                          <p style="margin:0 0 6px;font-size:12px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;">Instant Minting</p>
                          <p style="margin:0;font-size:13px;color:#cccccc;line-height:1.6;">No lockups. claim token from points, the tokens land in your wallet on Base.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                  <td width="48%" class="sant-feature-cell" style="vertical-align:top;padding-left:8px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:14px;height:100%;">
                      <tr>
                        <td style="padding:22px 18px;">
                          <p style="margin:0 0 10px;font-size:22px;">📉</p>
                          <p style="margin:0 0 6px;font-size:12px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:2px;">Early Adopter Edge</p>
                          <p style="margin:0;font-size:13px;color:#cccccc;line-height:1.6;">Rewards decay over time. The earlier you transact and build liquidity, the more $SANT you earn.</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.1);border-radius:16px;margin:0 0 44px;">
                <tr>
                  <td style="padding:30px 32px;">
                    <p style="margin:0 0 24px;font-size:11px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:5px;">How It Works</p>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">1</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">Make a transfer or swap</p>
                          <p class="sant-how-step-text" style="margin:0;font-size:14px;color:#cccccc;line-height:1.6;">Send money or execute a trade through your Salva App.</p>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px;">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">2</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">On-chain distribution</p>
                          <p class="sant-how-step-text" style="margin:0;font-size:14px;color:#cccccc;line-height:1.6;">You earn points after any transaction, you can claim anytime and $SANT gets minted on-chain directly to your wallet.</p>
                        </td>
                      </tr>
                    </table>

                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="width:36px;vertical-align:top;">
                          <span style="display:inline-block;width:28px;height:28px;background:#D4AF37;border-radius:50%;text-align:center;line-height:28px;font-size:13px;font-weight:900;color:#000000;">3</span>
                        </td>
                        <td style="vertical-align:top;padding-left:12px;">
                          <p style="margin:0 0 3px;font-size:15px;font-weight:900;color:#ffffff;">Watch it grow</p>
                          <p class="sant-how-step-text" style="margin:0;font-size:14px;color:#cccccc;line-height:1.6;">Track your real-time token count directly in your self-custody wallet dashboard.</p>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

              <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:rgba(212,175,55,0.05);border:1px solid rgba(212,175,55,0.25);border-radius:16px;overflow:hidden;">
                <tr>
                  <td style="padding:28px 32px;">
                    <p style="margin:0 0 6px;font-size:10px;font-weight:900;color:#D4AF37;text-transform:uppercase;letter-spacing:5px;">Get Active</p>
                    <p style="margin:0 0 8px;font-size:20px;font-weight:900;color:#ffffff;line-height:1.3;">Start Earning $SANT Today</p>
                    <p style="margin:0 0 28px;font-size:15px;color:#cccccc;line-height:1.75;">
                      No purchase needed. Just use Salva for your daily transactions, and secure your piece of the payment network of the future.
                    </p>
                    <a href="https://salva-nexus.org"
                       style="display:inline-block;background:#D4AF37;color:#000000;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2.5px;padding:15px 32px;border-radius:10px;text-decoration:none;">
                      Open Salva &nbsp;→
                    </a>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td class="sant-card" style="background:#0A0A0A;border:1px solid rgba(212,175,55,0.15);border-top:none;padding:32px 44px;border-radius:0 0 20px 20px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="sant-footer-cell">
                    <p style="margin:0 0 5px;font-size:14px;font-weight:900;color:#D4AF37;">— The Salva Team</p>
                    <p style="margin:0;font-size:12px;color:#ffffff;opacity:0.4;">Non-custodial · Permissionless · Open Source</p>
                  </td>
                  <td align="right" class="sant-footer-cell align-right" style="vertical-align:middle;">
                    <p style="margin:0;font-size:11px;color:#ffffff;opacity:0.2;text-align:right;">© 2026 Salva Protocol<br/>salva-nexus.org</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

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
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('🍃 MongoDB connected');

    const users = await User.find({}, 'email username').lean();
    console.log(`📋 Found ${users.length} users`);

    if (users.length === 0) {
      console.log('⚠️ No users found in database to message.');
      await mongoose.disconnect();
      process.exit(0);
    }

    let sent = 0;
    let failed = 0;

    for (const user of users) {
      if (!user.email) {
        console.warn(`⚠️ Skipped user ${user.username || 'unknown'} due to missing email`);
        continue;
      }

      try {
        await resend.emails.send({
          from: 'Salva <no-reply@salva-nexus.org>',
          to: user.email,
          subject: "🪙 $SANT is Live — Salva's Native Token",
          html: buildEmail(user.username),
        });

        sent++;
        console.log(`✅ [${sent}/${users.length}] ${user.email}`);

        // Throttle to respect Resend's free tier (10 req/sec maximum).
        // 150ms delay gives ~6.6 requests per second (safe limit).
        await new Promise((r) => setTimeout(r, 150));
      } catch (err) {
        failed++;
        console.error(`❌ Failed: ${user.email} — ${err.message}`);
      }
    }

    console.log(`\n📊 Done. Sent: ${sent} | Failed: ${failed} | Total: ${users.length}`);
  } catch (error) {
    console.error('💥 Execution error:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 MongoDB disconnected cleanly');
    process.exit(0);
  }
}

sendAnnouncementEmails().catch((err) => {
  console.error('💥 Script crashed:', err.message);
  process.exit(1);
});
