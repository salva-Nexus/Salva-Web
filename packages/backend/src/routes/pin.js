import authLimiter from "../middleware/authLimiter.js";
import express from "express";
import validator from "validator";
import { setPin, verify_Pin } from "../services/pinService.js";
import { User, UserBNB } from "../models/Users.js";

const router = express.Router();

function validatePin(pin) {
  if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
    throw new Error("PIN must be exactly 4 digits");
  }
  return true;
}

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

router.post("/set-pin", authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;

    validatePin(pin);
    const sanitizedEmail = sanitizeData(email, true);
    const status = await setPin(sanitizedEmail, pin);
    res.status(200).json({
      message: status.status,
    });
  } catch (error) {
    console.error("❌ Set PIN error:", error);
    return handleError(error, res, "Failed to set PIN");
  }
});

router.post("/verify-pin", authLimiter, async (req, res) => {
  try {
    const { email, pin } = req.body;  
    validatePin(pin);

    const sanitizedEmail = sanitizeData(email, true);
    const data = await verify_Pin(sanitizedEmail, pin);
    if (!data.status) {
      console.error("❌ Verify PIN error:", data.errorMsg);
      return res.status(401).json({
        status: data.status,
        message: data.errorMsg,
      });
    }

    res.json({
      success: data.status,
      privateKey: data.privateKey,
    });
  } catch (error) {
    console.error("❌ Verify PIN error:", error);
    return res.status(401).json({
      success: false,
      message: `Invalid PIN or ${error}`,
    });
  }
});

router.get("/base/status/:email", async (req, res) => {
  try {
    const email = sanitizeData(req.params.email, true);
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      hasPin: !!user.transactionPin,
      pinSetupCompleted: user.pinSetupCompleted || false,
      isLocked:
        user.accountLockedUntil &&
        new Date(user.accountLockedUntil) > new Date(),
      lockedUntil: user.accountLockedUntil,
      isValidator: user.isValidator,
    });
  } catch (error) {
    return handleError(error, res, "Failed to check PIN status");
  }
});

router.get("/bnb/status/:email", async (req, res) => {
  try {
    const email = sanitizeData(req.params.email, true);
    const user = await UserBNB.findOne({ email });

    if (user) {
      res.json({
        deployed: true,
        safeAddress: user.safeAddress,
        hasPin: !!user.transactionPin,
        nameAlias: user.nameAlias || null,
      });
    } else {
      res.json({
        deployed: false,
      });
    }
  } catch (error) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
