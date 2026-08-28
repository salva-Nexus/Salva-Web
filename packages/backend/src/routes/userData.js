import { User, UserBNB } from "../models/Users.js";
import express from "express";
import {
  updateUsername,
  updateEmail,
  updatePin,
  updatePassword,
} from "../services/userDataServices.js";

const router = express.Router();

router.get("/account-status/:email", async (req, res) => {
  const email = req.params.email;
  const user = await User.findOne({
    email: email,
  });

  res.json({
    status: user.accountLockedUntil,
  });
});

router.post("/update-username", async (req, res) => {
  const { email, newusername } = req.body;

  const user = await User.findOne({
    email: email,
  });

  try {
    const data = await updateUsername(email, newusername);
    res.status(200).json({
      status: data,
    });
  } catch (err) {
    console.error(err.message);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-email", async (req, res) => {
  const { email, newEmail } = req.body;

  const user = await User.findOne({
    email: email,
  });

  try {
    const data = await updateEmail(email, newEmail);
    console.log(data);
    res.status(200).json({
      status: data,
    });
  } catch (err) {
    console.error(err.message);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-password", async (req, res) => {
  const { email, newPassword } = req.body;

  const user = await User.findOne({
    email: email,
  });

  try {
    const data = await updatePassword(email, newPassword);
    res.status(200).json({
      status: data,
    });
  } catch (err) {
    console.error(err.message);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-pin", async (req, res) => {
  const { email, oldPin, newPin } = req.body;

  const user = await User.findOne({
    email: email,
  });

  try {
    const data = await updatePin(email, oldPin, newPin);
    res.status(200).json({
      status: data,
    });
  } catch (err) {
    console.error(err.message);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/update-time", async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({
    email: email,
  });

  user.accountLockedUntil = null;
  await user.save();
  res.json({
    status: true,
  });
});
export default router;
