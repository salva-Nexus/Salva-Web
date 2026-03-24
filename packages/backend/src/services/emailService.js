// Salva-Digital-Tech/packages/backend/src/services/emailService.js
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Format number with commas
const formatAmount = (amount) => {
  return parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// ===============================================
// WELCOME EMAIL - SPAM-PROOF VERSION
// ===============================================
async function sendWelcomeEmail(userEmail, userName) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <h2 style="color: #D4AF37; margin: 0 0 20px 0;">Welcome to SALVA</h2>
            <p style="color: #333333; line-height: 1.6; margin: 0 0 15px 0;">Hi ${userName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 15px 0;">
              Your account has been successfully created, and your wallet is now ready to use.
            </p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              SALVA makes crypto simple with account aliases, strong security, and everyday transactions.
            </p>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #D4AF37; font-weight: bold; margin: 0 0 10px 0;">What you can do:</p>
                  <p style="color: #666666; margin: 5px 0;">• Receive NGNs and make transfers</p>
                  <p style="color: #666666; margin: 5px 0;">• Explore real-world crypto payments</p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #fff8e1; border-left: 4px solid #D4AF37; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #D4AF37; font-weight: bold; margin: 0 0 10px 0;">Security Reminder</p>
                  <p style="color: #666666; margin: 0; line-height: 1.6;">
                    SALVA will never ask for your password, PIN, or private keys. Contact support if you notice suspicious activity.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #666666; text-align: center; margin: 30px 0 10px 0;">
              Welcome to the future of everyday crypto.
            </p>
            <p style="color: #999999; text-align: center; margin: 0; font-style: italic;">
              — The SALVA Team
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hi ${userName},

Your SALVA account has been successfully created and your wallet is ready to use.

What you can do:
- Receive NGNs and make transfers
- Explore real-world crypto payments

Security Reminder: SALVA will never ask for your password, PIN, or private keys.

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: userEmail,
      subject: 'Welcome to SALVA - Your Account is Ready',
      html: html,
      text: text
    });
    console.log(`📧 Welcome email sent to: ${userEmail}`);
  } catch (error) {
    console.error('❌ Failed to send welcome email:', error.message);
  }
}

// ===============================================
// TRANSACTION EMAIL - SENDER (SPAM-PROOF)
// ===============================================
async function sendTransactionEmailToSender(senderEmail, senderName, recipientIdentifier, amount, status) {
  const subject = status === 'successful'
    ? 'Payment Sent Successfully - SALVA'
    : 'Payment Failed - SALVA';

  const statusColor = status === 'successful' ? '#10B981' : '#EF4444';
  const statusText = status === 'successful' ? 'PAYMENT SENT' : 'PAYMENT FAILED';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: ${statusColor};">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">${statusText}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${senderName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              ${status === 'successful'
      ? 'Your payment has been successfully processed and sent to the recipient.'
      : 'We were unable to process your payment. Please try again or contact support.'}
            </p>
            
            <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">AMOUNT</p>
                  <p style="color: #000000; font-size: 28px; font-weight: bold; margin: 0;">${formatAmount(amount)} NGNs</p>
                </td>
              </tr>
              <tr>
                <td style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">RECIPIENT</p>
                  <p style="color: #333333; margin: 0; word-break: break-all;">${recipientIdentifier}</p>
                </td>
              </tr>
            </table>
            
            ${status === 'successful' ? `
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #e6f7f1; border-left: 4px solid #10B981; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #10B981; margin: 0;">Transaction verified on Base Sepolia blockchain</p>
                </td>
              </tr>
            </table>
            ` : `
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #fee; border-left: 4px solid #EF4444; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #EF4444; margin: 0;">Please ensure you have sufficient balance and try again</p>
                </td>
              </tr>
            </table>
            `}
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${senderName},

${status === 'successful'
      ? 'Your payment has been successfully processed.'
      : 'We were unable to process your payment.'}

Amount: ${formatAmount(amount)} NGNs
Recipient: ${recipientIdentifier}

${status === 'successful' ? 'Transaction verified on Base Sepolia blockchain.' : 'Please ensure you have sufficient balance and try again.'}

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: senderEmail,
      subject: subject,
      html: html,
      text: text
    });
    console.log(`📧 Sender email sent to: ${senderEmail}`);
  } catch (error) {
    console.error('❌ Failed to send sender email:', error.message);
  }
}

// ===============================================
// TRANSACTION EMAIL - RECEIVER (SPAM-PROOF)
// ===============================================
async function sendTransactionEmailToReceiver(receiverEmail, receiverName, senderIdentifier, amount) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: #10B981;">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">PAYMENT RECEIVED</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${receiverName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              You have received a payment. The funds are now available in your SALVA wallet.
            </p>
            
            <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">AMOUNT RECEIVED</p>
                  <p style="color: #10B981; font-size: 28px; font-weight: bold; margin: 0;">+${formatAmount(amount)} NGNs</p>
                </td>
              </tr>
              <tr>
                <td style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">FROM</p>
                  <p style="color: #333333; margin: 0; word-break: break-all;">${senderIdentifier}</p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #e6f7f1; border-left: 4px solid #10B981; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #10B981; margin: 0;">Transaction verified on Base Sepolia blockchain</p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${receiverName},

You have received a payment. The funds are now available in your SALVA wallet.

Amount Received: +${formatAmount(amount)} NGNs
From: ${senderIdentifier}

Transaction verified on Base Sepolia blockchain.

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: receiverEmail,
      subject: 'Payment Received - SALVA',
      html: html,
      text: text
    });
    console.log(`📧 Receiver email sent to: ${receiverEmail}`);
  } catch (error) {
    console.error('❌ Failed to send receiver email:', error.message);
  }
}

// ===============================================
// APPROVAL EMAIL - APPROVER (SPAM-PROOF)
// ===============================================
async function sendApprovalEmailToApprover(approverEmail, approverName, spenderIdentifier, amount) {
  const isRevoke = parseFloat(amount) === 0;
  const subject = isRevoke
    ? 'Allowance Revoked - SALVA'
    : 'Allowance Approved - SALVA';

  const statusColor = isRevoke ? '#F59E0B' : '#10B981';
  const statusText = isRevoke ? 'ALLOWANCE REVOKED' : 'ALLOWANCE APPROVED';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: ${statusColor};">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">${statusText}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${approverName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              ${isRevoke
      ? `You have revoked the spending allowance for <strong>${spenderIdentifier}</strong>.`
      : `You have approved <strong>${spenderIdentifier}</strong> to spend up to the specified amount from your wallet.`}
            </p>
            
            <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">${isRevoke ? 'REVOKED AMOUNT' : 'APPROVED AMOUNT'}</p>
                  <p style="color: #000000; font-size: 28px; font-weight: bold; margin: 0;">${formatAmount(amount)} NGNs</p>
                </td>
              </tr>
              <tr>
                <td style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">SPENDER</p>
                  <p style="color: #333333; margin: 0; word-break: break-all;">${spenderIdentifier}</p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: ${isRevoke ? '#fff8e1' : '#e6f7f1'}; border-left: 4px solid ${statusColor}; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: ${statusColor}; margin: 0;">
                    ${isRevoke
      ? 'This account can no longer spend tokens on your behalf.'
      : 'This account can now spend tokens on your behalf up to the approved limit.'}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${approverName},

${isRevoke
      ? `You have revoked the spending allowance for ${spenderIdentifier}.`
      : `You have approved ${spenderIdentifier} to spend up to ${formatAmount(amount)} NGNs from your wallet.`}

${isRevoke ? 'Revoked' : 'Approved'} Amount: ${formatAmount(amount)} NGNs
Spender: ${spenderIdentifier}

${isRevoke
      ? 'This account can no longer spend tokens on your behalf.'
      : 'This account can now spend tokens on your behalf up to the approved limit.'}

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: approverEmail,
      subject: subject,
      html: html,
      text: text
    });
    console.log(`📧 Approval email sent to approver: ${approverEmail}`);
  } catch (error) {
    console.error('❌ Failed to send approval email to approver:', error.message);
  }
}

// ===============================================
// APPROVAL EMAIL - SPENDER (SPAM-PROOF)
// ===============================================
async function sendApprovalEmailToSpender(spenderEmail, spenderName, approverIdentifier, amount) {
  const isRevoke = parseFloat(amount) === 0;
  const subject = isRevoke
    ? 'Allowance Revoked - SALVA'
    : 'Allowance Granted - SALVA';

  const statusColor = isRevoke ? '#F59E0B' : '#10B981';
  const statusText = isRevoke ? 'ALLOWANCE REVOKED' : 'ALLOWANCE GRANTED';

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: ${statusColor};">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">${statusText}</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${spenderName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              ${isRevoke
      ? `Your spending allowance from <strong>${approverIdentifier}</strong> has been revoked.`
      : `<strong>${approverIdentifier}</strong> has approved you to spend up to the specified amount from their wallet.`}
            </p>
            
            <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">${isRevoke ? 'REVOKED AMOUNT' : 'ALLOWANCE AMOUNT'}</p>
                  <p style="color: ${isRevoke ? '#F59E0B' : '#10B981'}; font-size: 28px; font-weight: bold; margin: 0;">${formatAmount(amount)} NGNs</p>
                </td>
              </tr>
              <tr>
                <td style="border-top: 1px solid #e0e0e0; padding-top: 15px;">
                  <p style="color: #999999; font-size: 11px; margin: 0 0 5px 0;">FROM</p>
                  <p style="color: #333333; margin: 0; word-break: break-all;">${approverIdentifier}</p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: ${isRevoke ? '#fff8e1' : '#e6f7f1'}; border-left: 4px solid ${statusColor}; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: ${statusColor}; margin: 0;">
                    ${isRevoke
      ? 'You can no longer spend tokens from this account.'
      : 'You can now spend tokens from this account up to the approved limit.'}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${spenderName},

${isRevoke
      ? `Your spending allowance from ${approverIdentifier} has been revoked.`
      : `${approverIdentifier} has approved you to spend up to ${formatAmount(amount)} NGNs from their wallet.`}

${isRevoke ? 'Revoked' : 'Allowance'} Amount: ${formatAmount(amount)} NGNs
From: ${approverIdentifier}

${isRevoke
      ? 'You can no longer spend tokens from this account.'
      : 'You can now spend tokens from this account up to the approved limit.'}

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: spenderEmail,
      subject: subject,
      html: html,
      text: text
    });
    console.log(`📧 Approval email sent to spender: ${spenderEmail}`);
  } catch (error) {
    console.error('❌ Failed to send approval email to spender:', error.message);
  }
}

// ===============================================
// SECURITY CHANGE EMAIL (SPAM-PROOF)
// ===============================================
async function sendSecurityChangeEmail(userEmail, userName, changeType, accountNumber) {
  const changeTypeText = {
    'email': 'Email Address',
    'password': 'Password',
    'pin': 'Transaction PIN'
  };

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">Security Alert</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: #F59E0B;">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">ACCOUNT SECURITY CHANGE</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${userName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              Your ${changeTypeText[changeType]} has been successfully changed.
            </p>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #fff8e1; border: 2px solid #F59E0B; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #F59E0B; font-weight: bold; margin: 0 0 10px 0;">Account Restricted for 24 Hours</p>
                  <p style="color: #666666; margin: 0;">
                    As a security measure, your account has been temporarily restricted. You will not be able to perform transactions during this period.
                  </p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #fee; border-left: 4px solid #EF4444; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #EF4444; font-weight: bold; margin: 0 0 10px 0;">Didn't make this change?</p>
                  <p style="color: #666666; margin: 0 0 15px 0;">
                    If you did not authorize this change, contact our support team immediately.
                  </p>
                  <p style="color: #666666; margin: 0 0 5px 0;"><strong>Your Account Number:</strong></p>
                  <p style="background-color: #fff8e1; color: #D4AF37; padding: 10px; margin: 0; font-weight: bold; border: 1px solid #D4AF37;">${accountNumber}</p>
                </td>
              </tr>
            </table>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="mailto:salva.notify@gmail.com?subject=Unauthorized%20Account%20Change%20-%20${accountNumber}" style="display: inline-block; background-color: #EF4444; color: #ffffff; padding: 12px 30px; text-decoration: none; font-weight: bold;">CONTACT SUPPORT</a>
            </div>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0;">SALVA Security Team</p>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${userName},

Your ${changeTypeText[changeType]} has been successfully changed.

ACCOUNT RESTRICTED FOR 24 HOURS
As a security measure, your account has been temporarily restricted.

DIDN'T MAKE THIS CHANGE?
If you did not authorize this change, contact support immediately.

Your Account Number: ${accountNumber}

Contact us at: salva.notify@gmail.com

— SALVA Security Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Security <no-reply@salva-nexus.org>',
      to: userEmail,
      subject: `Security Alert: ${changeTypeText[changeType]} Changed - SALVA`,
      html: html,
      text: text
    });
    console.log(`📧 Security alert sent to: ${userEmail}`);
  } catch (error) {
    console.error('❌ Failed to send security email:', error.message);
  }
}

// ===============================================
// EMAIL CHANGE CONFIRMATION (SPAM-PROOF)
// ===============================================
async function sendEmailChangeConfirmation(newEmail, userName, accountNumber) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 20px; background-color: #f5f5f5; font-family: Arial, sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <tr>
          <td style="padding: 40px; text-align: center; background-color: #D4AF37;">
            <h1 style="margin: 0; color: #000000; font-size: 32px;">SALVA</h1>
            <p style="margin: 5px 0 0 0; color: #000000; font-size: 12px;">On-chain Financial Protocol</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; text-align: center; background-color: #10B981;">
            <p style="margin: 0; color: #ffffff; font-size: 18px; font-weight: bold;">EMAIL UPDATED SUCCESSFULLY</p>
          </td>
        </tr>
        <tr>
          <td style="padding: 40px;">
            <p style="color: #333333; font-weight: bold; margin: 0 0 10px 0;">Hello ${userName},</p>
            <p style="color: #666666; line-height: 1.6; margin: 0 0 20px 0;">
              Your email address has been successfully updated. This is now your primary email for all SALVA communications.
            </p>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #e6f7f1; border: 1px solid #10B981; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #10B981; font-weight: bold; margin: 0 0 10px 0;">Your new email is now active</p>
                  <p style="color: #666666; margin: 0 0 15px 0;">
                    You'll receive all future notifications and alerts at this email address.
                  </p>
                  <p style="color: #666666; margin: 0 0 5px 0;"><strong>Your Account Number:</strong></p>
                  <p style="background-color: #fff8e1; color: #D4AF37; padding: 10px; margin: 0; font-weight: bold; border: 1px solid #D4AF37;">${accountNumber}</p>
                </td>
              </tr>
            </table>
            
            <table width="100%" cellpadding="15" cellspacing="0" style="background-color: #fff8e1; border-left: 4px solid #F59E0B; margin: 20px 0;">
              <tr>
                <td>
                  <p style="color: #F59E0B; font-weight: bold; margin: 0 0 10px 0;">24-Hour Security Lock Active</p>
                  <p style="color: #666666; margin: 0;">
                    As a security measure, your account has been temporarily restricted for 24 hours.
                  </p>
                </td>
              </tr>
            </table>
            
            <p style="color: #666666; text-align: center; margin: 20px 0;">
              Thank you for keeping your account information up to date.
            </p>
            <p style="color: #999999; text-align: center; margin: 0; font-style: italic;">
              — The SALVA Team
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding: 30px; background-color: #f5f5f5; text-align: center;">
            <p style="color: #999999; margin: 0 0 15px 0;">Need help?</p>
            <a href="mailto:salva.notify@gmail.com" style="display: inline-block; background-color: #D4AF37; color: #000000; padding: 12px 30px; text-decoration: none; font-weight: bold;">Contact Support</a>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;

  const text = `Hello ${userName},

Your email address has been successfully updated. This is now your primary email for all SALVA communications.

Your Account Number: ${accountNumber}

24-HOUR SECURITY LOCK ACTIVE
As a security measure, your account has been temporarily restricted for 24 hours.

Thank you for keeping your account information up to date.

Need help? Email us at salva.notify@gmail.com

— The SALVA Team`;

  try {
    await resend.emails.send({
      from: 'SALVA Support <no-reply@salva-nexus.org>',
      to: newEmail,
      subject: 'Email Updated Successfully - SALVA',
      html: html,
      text: text
    });
    console.log(`📧 Email change confirmation sent to: ${newEmail}`);
  } catch (error) {
    console.error('❌ Failed to send email change confirmation:', error.message);
  }
}

// ADD THIS FUNCTION to emailService.js before module.exports

async function sendValidatorProposalEmail(validatorEmail, validatorName, subject, payload) {
  let detailsHtml = "";
  let detailsText = "";

  if (payload.type === "registry") {
    detailsHtml = `
      <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
        <tr><td>
          <p style="color:#999;font-size:11px;margin:0 0 5px 0;">REGISTRY NAME</p>
          <p style="color:#000;font-size:20px;font-weight:bold;margin:0 0 15px 0;">${payload.registryName}</p>
          <p style="color:#999;font-size:11px;margin:0 0 5px 0;">NAMESPACE</p>
          <p style="color:#D4AF37;font-size:16px;font-weight:bold;margin:0 0 15px 0;">${payload.nspace}</p>
          <p style="color:#999;font-size:11px;margin:0 0 5px 0;">CONTRACT ADDRESS</p>
          <p style="color:#333;font-size:12px;margin:0;word-break:break-all;">${payload.registry}</p>
        </td></tr>
      </table>`;
    detailsText = `Registry: ${payload.registryName}\nNamespace: ${payload.nspace}\nAddress: ${payload.registry}`;
  } else {
    const actionText = payload.action ? "ADD VALIDATOR" : "REMOVE VALIDATOR";
    const actionColor = payload.action ? "#10B981" : "#EF4444";
    detailsHtml = `
      <table width="100%" cellpadding="20" cellspacing="0" style="background-color: #f9f9f9; border: 1px solid #e0e0e0; margin: 20px 0;">
        <tr><td>
          <p style="color:#999;font-size:11px;margin:0 0 5px 0;">ACTION</p>
          <p style="color:${actionColor};font-size:20px;font-weight:bold;margin:0 0 15px 0;">${actionText}</p>
          <p style="color:#999;font-size:11px;margin:0 0 5px 0;">TARGET ADDRESS</p>
          <p style="color:#333;font-size:12px;margin:0;word-break:break-all;">${payload.targetAddress}</p>
        </td></tr>
      </table>`;
    detailsText = `Action: ${actionText}\nTarget: ${payload.targetAddress}`;
  }

  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;">
          <h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1>
          <p style="margin:5px 0 0 0;color:#000;font-size:12px;">Admin Panel — Validator Action Required</p>
        </td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:#1A1A1B;">
          <p style="margin:0;color:#D4AF37;font-size:18px;font-weight:bold;">NEW PROPOSAL SUBMITTED</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;margin:0 0 10px 0;">Hello ${validatorName},</p>
          <p style="color:#666;line-height:1.6;margin:0 0 20px 0;">A new proposal requires your validation. Log in to your dashboard to review and cast your vote.</p>
          ${detailsHtml}
          <p style="color:#999;text-align:center;margin:20px 0 0 0;font-size:12px;">Log in at salva-nexus.org to validate this proposal.</p>
        </td></tr>
        <tr><td style="padding:30px;background-color:#f5f5f5;text-align:center;">
          <a href="https://salva-nexus.org/dashboard" style="display:inline-block;background-color:#D4AF37;color:#000;padding:12px 30px;text-decoration:none;font-weight:bold;">GO TO DASHBOARD</a>
        </td></tr>
      </table>
    </body></html>`;

  const text = `Hello ${validatorName},\n\nA new proposal requires your validation.\n\n${detailsText}\n\nLog in at salva-nexus.org to validate.\n\n— SALVA Admin`;

  try {
    await resend.emails.send({
      from: "SALVA Admin <no-reply@salva-nexus.org>",
      to: validatorEmail,
      subject: `[SALVA Admin] ${subject}`,
      html,
      text,
    });
  } catch (error) {
    console.error("❌ Validator proposal email failed:", error.message);
  }
}

module.exports = {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendApprovalEmailToApprover,
  sendApprovalEmailToSpender,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
  sendValidatorProposalEmail, // ADD THIS
};