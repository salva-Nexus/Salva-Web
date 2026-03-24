// Salva-Digital-Tech/packages/backend/src/services/emailService.js
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

const formatAmount = (amount) => {
  return parseFloat(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// ===============================================
// WELCOME EMAIL
// ===============================================
async function sendWelcomeEmail(userEmail, userName) {
  const html = `
    <!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
    <body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;">
          <h1 style="margin:0;color:#000000;font-size:32px;">SALVA</h1>
          <p style="margin:5px 0 0 0;color:#000000;font-size:12px;">On-chain Financial Protocol</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <h2 style="color:#D4AF37;margin:0 0 20px 0;">Welcome to SALVA</h2>
          <p style="color:#333333;line-height:1.6;margin:0 0 15px 0;">Hi ${userName},</p>
          <p style="color:#666666;line-height:1.6;margin:0 0 15px 0;">Your account has been successfully created and your wallet is now ready to use.</p>
          <table width="100%" cellpadding="15" cellspacing="0" style="background-color:#fff8e1;border-left:4px solid #D4AF37;margin:20px 0;">
            <tr><td>
              <p style="color:#D4AF37;font-weight:bold;margin:0 0 10px 0;">Security Reminder</p>
              <p style="color:#666666;margin:0;line-height:1.6;">SALVA will never ask for your password, PIN, or private keys.</p>
            </td></tr>
          </table>
          <p style="color:#999999;text-align:center;margin:0;font-style:italic;">— The SALVA Team</p>
        </td></tr>
        <tr><td style="padding:30px;background-color:#f5f5f5;text-align:center;">
          <a href="mailto:salva.notify@gmail.com" style="display:inline-block;background-color:#D4AF37;color:#000000;padding:12px 30px;text-decoration:none;font-weight:bold;">Contact Support</a>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: userEmail, subject: 'Welcome to SALVA - Your Account is Ready', html });
    console.log(`📧 Welcome email sent to: ${userEmail}`);
  } catch (error) { console.error('❌ Failed to send welcome email:', error.message); }
}

// ===============================================
// TRANSACTION EMAIL - SENDER
// ===============================================
async function sendTransactionEmailToSender(senderEmail, senderName, recipientIdentifier, amount, status) {
  const subject = status === 'successful' ? 'Payment Sent Successfully - SALVA' : 'Payment Failed - SALVA';
  const statusColor = status === 'successful' ? '#10B981' : '#EF4444';
  const statusText = status === 'successful' ? 'PAYMENT SENT' : 'PAYMENT FAILED';
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1></td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:${statusColor};"><p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">${statusText}</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${senderName},</p>
          <table width="100%" cellpadding="20" cellspacing="0" style="background-color:#f9f9f9;border:1px solid #e0e0e0;margin:20px 0;">
            <tr><td><p style="color:#999;font-size:11px;margin:0 0 5px 0;">AMOUNT</p><p style="color:#000;font-size:28px;font-weight:bold;margin:0;">${formatAmount(amount)} NGNs</p></td></tr>
            <tr><td style="border-top:1px solid #e0e0e0;"><p style="color:#999;font-size:11px;margin:0 0 5px 0;">RECIPIENT</p><p style="color:#333;margin:0;">${recipientIdentifier}</p></td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: senderEmail, subject, html });
    console.log(`📧 Sender email sent to: ${senderEmail}`);
  } catch (error) { console.error('❌ Failed to send sender email:', error.message); }
}

// ===============================================
// TRANSACTION EMAIL - RECEIVER
// ===============================================
async function sendTransactionEmailToReceiver(receiverEmail, receiverName, senderIdentifier, amount) {
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1></td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:#10B981;"><p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">PAYMENT RECEIVED</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${receiverName},</p>
          <table width="100%" cellpadding="20" cellspacing="0" style="background-color:#f9f9f9;border:1px solid #e0e0e0;margin:20px 0;">
            <tr><td><p style="color:#999;font-size:11px;margin:0 0 5px 0;">AMOUNT RECEIVED</p><p style="color:#10B981;font-size:28px;font-weight:bold;margin:0;">+${formatAmount(amount)} NGNs</p></td></tr>
            <tr><td style="border-top:1px solid #e0e0e0;"><p style="color:#999;font-size:11px;margin:0 0 5px 0;">FROM</p><p style="color:#333;margin:0;">${senderIdentifier}</p></td></tr>
          </table>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: receiverEmail, subject: 'Payment Received - SALVA', html });
    console.log(`📧 Receiver email sent to: ${receiverEmail}`);
  } catch (error) { console.error('❌ Failed to send receiver email:', error.message); }
}

// ===============================================
// APPROVAL EMAILS
// ===============================================
async function sendApprovalEmailToApprover(approverEmail, approverName, spenderIdentifier, amount) {
  const isRevoke = parseFloat(amount) === 0;
  const subject = isRevoke ? 'Allowance Revoked - SALVA' : 'Allowance Approved - SALVA';
  const statusColor = isRevoke ? '#F59E0B' : '#10B981';
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1></td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:${statusColor};"><p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">${isRevoke ? 'ALLOWANCE REVOKED' : 'ALLOWANCE APPROVED'}</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${approverName},</p>
          <p style="color:#666;">${isRevoke ? `You revoked the allowance for <strong>${spenderIdentifier}</strong>.` : `You approved <strong>${spenderIdentifier}</strong> to spend ${formatAmount(amount)} NGNs.`}</p>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: approverEmail, subject, html });
  } catch (error) { console.error('❌ Failed to send approval email to approver:', error.message); }
}

async function sendApprovalEmailToSpender(spenderEmail, spenderName, approverIdentifier, amount) {
  const isRevoke = parseFloat(amount) === 0;
  const subject = isRevoke ? 'Allowance Revoked - SALVA' : 'Allowance Granted - SALVA';
  const statusColor = isRevoke ? '#F59E0B' : '#10B981';
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1></td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:${statusColor};"><p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">${isRevoke ? 'ALLOWANCE REVOKED' : 'ALLOWANCE GRANTED'}</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${spenderName},</p>
          <p style="color:#666;">${isRevoke ? `Your allowance from <strong>${approverIdentifier}</strong> has been revoked.` : `<strong>${approverIdentifier}</strong> approved you to spend ${formatAmount(amount)} NGNs.`}</p>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: spenderEmail, subject, html });
  } catch (error) { console.error('❌ Failed to send approval email to spender:', error.message); }
}

// ===============================================
// SECURITY CHANGE EMAIL
// ===============================================
async function sendSecurityChangeEmail(userEmail, userName, changeType, accountNumber) {
  const changeTypeText = { 'email': 'Email Address', 'password': 'Password', 'pin': 'Transaction PIN' };
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1><p style="margin:5px 0 0 0;color:#000;font-size:12px;">Security Alert</p></td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:#F59E0B;"><p style="margin:0;color:#fff;font-size:18px;font-weight:bold;">ACCOUNT SECURITY CHANGE</p></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${userName},</p>
          <p style="color:#666;">Your ${changeTypeText[changeType]} has been changed. Account locked for 24 hours.</p>
          <p style="color:#666;">Account Number: <strong style="color:#D4AF37;">${accountNumber}</strong></p>
          <p style="color:#EF4444;">Didn't do this? Contact support immediately.</p>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Security <no-reply@salva-nexus.org>', to: userEmail, subject: `Security Alert: ${changeTypeText[changeType]} Changed - SALVA`, html });
    console.log(`📧 Security alert sent to: ${userEmail}`);
  } catch (error) { console.error('❌ Failed to send security email:', error.message); }
}

// ===============================================
// EMAIL CHANGE CONFIRMATION
// ===============================================
async function sendEmailChangeConfirmation(newEmail, userName, accountNumber) {
  const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#D4AF37;"><h1 style="margin:0;color:#000;font-size:32px;">SALVA</h1></td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;">Hello ${userName},</p>
          <p style="color:#666;">Your email has been updated. Account Number: <strong style="color:#D4AF37;">${accountNumber}</strong></p>
          <p style="color:#F59E0B;">Account locked for 24 hours as a security measure.</p>
        </td></tr>
      </table>
    </body></html>`;
  try {
    await resend.emails.send({ from: 'SALVA Support <no-reply@salva-nexus.org>', to: newEmail, subject: 'Email Updated Successfully - SALVA', html });
    console.log(`📧 Email change confirmation sent to: ${newEmail}`);
  } catch (error) { console.error('❌ Failed to send email change confirmation:', error.message); }
}

// ===============================================
// PROPOSAL NOTIFICATION EMAIL — sent to all validators
// ===============================================
async function sendProposalNotificationEmail(validatorEmail, validatorName, proposal) {
  let subject, bodyContent;

  if (proposal.type === 'registryInit') {
    subject = `[SALVA MultiSig] New Registry Proposal: ${proposal.registryName}`;
    bodyContent = `
      <p style="color:#666;line-height:1.8;">A new registry initialization has been proposed and requires your validation.</p>
      <table width="100%" cellpadding="15" cellspacing="0" style="background-color:#0A0A0B;border:1px solid #D4AF37;border-radius:8px;margin:20px 0;">
        <tr><td>
          <p style="color:#D4AF37;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:2px;">Registry Name</p>
          <p style="color:#ffffff;font-size:20px;font-weight:bold;margin:0 0 16px 0;">${proposal.registryName}</p>
          <p style="color:#D4AF37;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:2px;">Namespace</p>
          <p style="color:#ffffff;font-size:16px;font-weight:bold;margin:0 0 16px 0;">${proposal.namespace}</p>
          <p style="color:#D4AF37;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:2px;">Registry Address</p>
          <p style="color:#ffffff;font-size:12px;font-family:monospace;margin:0;word-break:break-all;">${proposal.registryAddress}</p>
        </td></tr>
      </table>
      <p style="color:#666;">Log in to your Salva dashboard to review and validate this proposal.</p>`;
  } else {
    const actionText = proposal.action ? 'ADD VALIDATOR' : 'REMOVE VALIDATOR';
    const actionColor = proposal.action ? '#10B981' : '#EF4444';
    subject = `[SALVA MultiSig] Validator Update Proposal: ${actionText}`;
    bodyContent = `
      <p style="color:#666;line-height:1.8;">A validator set update has been proposed and requires your validation.</p>
      <table width="100%" cellpadding="15" cellspacing="0" style="background-color:#0A0A0B;border:1px solid #D4AF37;border-radius:8px;margin:20px 0;">
        <tr><td>
          <p style="color:#D4AF37;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:2px;">Action</p>
          <p style="color:${actionColor};font-size:20px;font-weight:bold;margin:0 0 16px 0;">${actionText}</p>
          <p style="color:#D4AF37;font-size:11px;margin:0 0 4px 0;text-transform:uppercase;letter-spacing:2px;">Validator Address</p>
          <p style="color:#ffffff;font-size:12px;font-family:monospace;margin:0;word-break:break-all;">${proposal.validatorAddress}</p>
        </td></tr>
      </table>
      <p style="color:#666;">Log in to your Salva dashboard to review and validate this proposal.</p>`;
  }

  const html = `
    <!DOCTYPE html><html>
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
    <body style="margin:0;padding:20px;background-color:#f5f5f5;font-family:Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background-color:#ffffff;">
        <tr><td style="padding:40px;text-align:center;background-color:#0A0A0B;border-bottom:3px solid #D4AF37;">
          <h1 style="margin:0;color:#D4AF37;font-size:32px;letter-spacing:4px;">SALVA</h1>
          <p style="margin:6px 0 0 0;color:#ffffff;font-size:11px;letter-spacing:3px;text-transform:uppercase;">MultiSig Admin Alert</p>
        </td></tr>
        <tr><td style="padding:30px;text-align:center;background-color:#1a1a1b;border-bottom:1px solid #D4AF37;">
          <p style="margin:0;color:#D4AF37;font-size:13px;font-weight:bold;text-transform:uppercase;letter-spacing:2px;">⚡ New Proposal Requires Validation</p>
        </td></tr>
        <tr><td style="padding:40px;">
          <p style="color:#333;font-weight:bold;margin:0 0 10px 0;">Hello ${validatorName},</p>
          ${bodyContent}
        </td></tr>
        <tr><td style="padding:30px;background-color:#f5f5f5;text-align:center;">
          <p style="color:#999;margin:0 0 15px 0;font-size:12px;">SALVA MultiSig — Validator Notification</p>
          <a href="mailto:salva.notify@gmail.com" style="display:inline-block;background-color:#D4AF37;color:#000;padding:12px 30px;text-decoration:none;font-weight:bold;border-radius:4px;">Contact Support</a>
        </td></tr>
      </table>
    </body></html>`;

  try {
    await resend.emails.send({ from: 'SALVA MultiSig <no-reply@salva-nexus.org>', to: validatorEmail, subject, html });
    console.log(`📧 Proposal notification sent to validator: ${validatorEmail}`);
  } catch (error) { console.error('❌ Failed to send proposal notification:', error.message); }
}

module.exports = {
  sendWelcomeEmail,
  sendTransactionEmailToSender,
  sendTransactionEmailToReceiver,
  sendApprovalEmailToApprover,
  sendApprovalEmailToSpender,
  sendSecurityChangeEmail,
  sendEmailChangeConfirmation,
  sendProposalNotificationEmail,
};