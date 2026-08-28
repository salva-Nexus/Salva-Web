import { User } from "../models/Users.js";
import express from "express";

const router = express.Router();

router.get("/user/:email", async (req, res) => {
  try {
    const email = req.params.email;
    const record = await User.find({
      email: email.toLowerCase(),
    });
    res.status(200).json({
      status: true,
      data: record,
    });
  } catch (err) {
    console.error(`❌Could not fetch users record`);
    res.status(200).json({
      status: false,
      errorMsg: err.message
    });
  }
})

export default router;

