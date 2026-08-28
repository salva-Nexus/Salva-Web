import express from "express";
import authLimiter from "../middleware/authLimiter.js";
import login from "../services/loginService.js";
import validator from "validator";

const router = express.Router();

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

router.post("/login", authLimiter, async (req, res) => {
  try {
    const email = sanitizeData(req.body.email, true);
    const { password } = req.body;

    const data = await login(email, password);
    res.json(data.data);
  } catch (error) {
    return handleError(error, res, "Login failed");
  }
});

export default router;
