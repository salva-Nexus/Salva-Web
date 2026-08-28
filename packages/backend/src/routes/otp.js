import authLimiter from "../middleware/authLimiter.js";
import express from "express";
import OtpStore from "../models/OtpStore.js";
import { Resend } from "resend";
import validator from "validator";
import crypto from "crypto";

const router = express.Router();
const resend = new Resend(process.env.RESEND_API_KEY);

function sanitizeData(data, isEmail) {
  if (typeof data !== "string") {
    throw new Error("Invalid data format");
  }
  const sanitized = data.trim().toLowerCase();
  if (isEmail) {
    if (!validator.isEmail(sanitized)) {
      throw new Error("Invalid email format");
    }
  }
  return sanitized;
}

function handleError(error, res, userMessage = "An error occurred") {
  console.error("Error:", error);

  if (process.env.NODE_ENV === "production") {
    return res.status(500).json({ message: userMessage });
  } else {
    return res.status(500).json({
      message: userMessage,
      error: error.message,
      stack: error.stack,
    });
  }
}

router.post("/send-otp", authLimiter, async (req, res) => {
  try {
    const email = sanitizeData(req.body.email, true);
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await OtpStore.findOneAndUpdate(
      { email },
      { code: otp, expires: new Date(Date.now() + 600000), verified: false },
      { upsert: true, returnDocument: "after" },
    );

    const data = await resend.emails.send({
      from: "Salva <no-reply@salva-nexus.org>",
      to: email,
      subject: "Verify your Salva Account",
      html: `
        <div style="background: #0A0A0B; color: white; padding: 40px; font-family: sans-serif; border-radius: 20px;">
          <h1 style="color: #D4AF37; margin-bottom: 20px;">SALVA</h1>
          <p style="font-size: 16px;">Use the verification code below:</p>
          <div style="background: #1A1A1B; padding: 20px; font-size: 32px; font-weight: bold; letter-spacing: 10px; text-align: center; color: #D4AF37; border: 1px solid #D4AF37; border-radius: 12px; margin: 20px 0;">
            ${otp}
          </div>
          <p style="opacity: 0.5; font-size: 12px;">This code expires in 10 minutes.</p>
        </div>
      `,
    });

    console.log("📧 OTP sent:", undefined);
    res.json({
      OTP: otp,
      message: "OTP sent successfully",
    });
  } catch (err) {
    console.error("❌ RESEND FAIL:", err);
    return handleError(err, res, "Email service currently unavailable");
  }
});

router.post("/verify-otp", authLimiter, async (req, res) => {
  try {
    const { email, code } = req.body;
    const sanitizedEmail = sanitizeData(email, true);
    const record = await OtpStore.findOne({ email: sanitizedEmail });

    if (!record)
      return res.status(400).json({ message: "Invalid or expired code" });
    if (new Date() > record.expires) {
      await OtpStore.deleteOne({ email: sanitizedEmail });
      return res.status(400).json({ message: "Invalid or expired code" });
    }

    const isValid = crypto.timingSafeEqual(
      Buffer.from(record.code),
      Buffer.from(String(code)),
    );
    if (!isValid)
      return res.status(400).json({ message: "Invalid or expired code" });

    record.verified = true;
    await record.save();
    res.json({ success: true });
  } catch (error) {
    return handleError(error, res, "Verification failed");
  }
});

export default router;
