import { ethers } from "ethers";
import express from "express";
import { User, UserBNB, buildHash } from "../models/Users.js";
import { deploySafeWalletBASE_BNB } from "../services/deployment.js";
import bcrypt from "bcryptjs";
import { sendWelcomeEmail } from "../services/emailService.js";
import authLimiter from "../middleware/authLimiter.js";
import buff from "../utils/buffer.js";
import validator from "validator";
import deploySafeWalletBNB from "../services/bnbDeployment.js";
import { estimateDeploymentFee } from "../services/estimateFee.js";
import { PointsRecord, pointsDistribution } from "../models/PointsState.js";

const router = express.Router();

function validateRegistration(req, res, next) {
  try {
    const { username, email, password } = req.body;

    const sanitizedEmail = sanitizeData(email, true);
    req.body.email = sanitizedEmail;

    if (!username) {
      return res.status(400).json({
        message: "Please input a password",
      });
    }

    if (!password) {
      return res.status(400).json({
        message: "Please input a password",
      });
    }
    req.body.password = sanitizeData(password, false);

    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
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

router.post(
  "/register",
  authLimiter,
  validateRegistration,
  async (req, res) => {
    const { username, email, password, referralCode } = req.body;

    console.log(
      `📝 Registration attempt: username="${username}" email="${email}"`,
    );

    const existingEmail = await User.findOne({ email });
    if (existingEmail)
      return res.status(400).json({ message: "Email already registered" });

    const existingUsername = await User.findOne({ username });
    if (existingUsername)
      return res.status(400).json({ message: "Username already taken" });

    try {
      const deploymentData = await deploySafeWalletBASE_BNB();
      if (!deploymentData.status)
        return res.status(500).json({ message: `${deploymentData.data}` });
      console.log(`✅ Base Safe deployed`);
      if (deploymentData.data.bnbSuccess) console.log(`✅ BNB Safe deployed`);
      else
        console.warn(
          `⚠️  BNB deployment failed — user will deploy from BNB dashboard`,
        );

      const hashPassword = await bcrypt.hash(password, 10);

      let deploymentLoan = await estimateDeploymentFee();
      if (!deploymentLoan.status) {
        // wait 2 seconds and retry
        await new Promise((r) => setTimeout(r, 2000));
        deploymentLoan = await estimateDeploymentFee();
      }

      if (!deploymentLoan.status) {
        // user fallback
        deploymentLoan = {
          data: {
            BASE: {
              NGN: 8,
              USD: 0.006,
            },
            BNB: {
              NGN: 15,
              USD: 0.01,
            },
          },
        };
      }

      let newReferralCode;
      const Id = buildHash(email);

      for (let i = 0; i < Id.length; i += 8) {
        let split = Id.slice(i, i + 8);
        let isTaken = await User.findOne({
          referralCode: `SLV-${split}`.toUpperCase(),
        });
        if (!isTaken) {
          newReferralCode = `SLV-${split}`.toUpperCase();
          break;
        }
      }

      if (!newReferralCode) {
        console.error(`Could Not Generate Unique ID`);
      }

      const userBase = User.create({
        email: email,
        username: username,
        password: hashPassword,
        safeAddress: deploymentData.data.basesafe,
        ownerPrivateKey: deploymentData.data.pkey,
        deploymentLoanNGN: buff(deploymentLoan.data.BASE.NGN, 200),
        deploymentLoanUSD: buff(deploymentLoan.data.BASE.USD, 200),
        referralCode: newReferralCode,
        referredBy: referralCode,
      });

      if (deploymentData.data.bnbSuccess) {
        const userBnb = UserBNB.create({
          email: email,
          username: username,
          password: hashPassword,
          safeAddress: deploymentData.data.bnbSafe,
          ownerPrivateKey: deploymentData.data.pkey,
          deploymentLoanNGN: buff(deploymentLoan.data.BNB.NGN, 150),
          deploymentLoanUSD: buff(deploymentLoan.data.BNB.USD, 150),
        });
      }

      console.log(`✅ User saved: ${email}`);

      try {
        await sendWelcomeEmail(email, username);
        console.log(`📧 Welcome email sent to: ${email}`);
      } catch (emailError) {
        console.error("❌ Welcome email error:", emailError.message);
      }

      try {
        const pointsRecord = await PointsRecord.findOne({
          network:
            process.env.NODE_ENV === "production" ? "MAINNET" : "TESTNET",
        });
        if (!pointsRecord) await PointsRecord.create({});

        if (pointsRecord && !pointsRecord.isLocked) {
          console.log(`ISSUED 1 : ${pointsRecord.totalPointsIssued}`);

          const rem = pointsRecord.hardCap - pointsRecord.totalPointsIssued;
          console.log(`Remaining: ${rem}`);
          let totalReward = pointsDistribution.registration.referrer;
          console.log(`NEW USER Receives 1: ${totalReward}`);
          console.log(`Total Reward 1: ${totalReward}`);
          console.log(`Total Reward > Remaining?: ${totalReward > rem}`);

          if (totalReward > rem) {
            totalReward = rem;
            console.log(`NEW USER Receives 2: ${totalReward}`);
            console.log(`Total Reward 2: ${totalReward}`);
          }
          let existingUser;
          if (referralCode) {
            existingUser = await User.findOne({
              referralCode: referralCode,
            });

            if (!existingUser) {
              console.error(`Invalid Referral ID ❌`);
            } else {
              existingUser.santPoints += totalReward;
              await existingUser.save();

              pointsRecord.totalPointsIssued += totalReward;
              await pointsRecord.save();
            }
          }
          console.log(
            `Total Points Issued > Hard Cap?: ${
              pointsRecord.totalPointsIssued >= pointsRecord.hardCap
            }`,
          );

          console.log(`ISSUED 2 : ${pointsRecord.totalPointsIssued}`);
          console.log(`HARDCAP : ${pointsRecord.hardCap}`);

          if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap)
            await pointsRecord.updateOne({ isLocked: true });

          if (pointsRecord.totalPointsIssued >= pointsRecord.redeemCap)
            await pointsRecord.updateOne({ canRedeem: true });
        }
      } catch (err) {}

      res.json({
        username: username,
        email: email,
        safeAddress: deploymentData.data.basesafe,
        ownerPrivateKey: deploymentData.data.pkey,
        isValidator: false,
        nameAlias: null,
      });
    } catch (err) {
      console.error(err.message)
      return res.status(500).json({
        errorMsg: err.message,
      });
    }
  },
);

router.post("/bnb/register", async (req, res) => {
  try {
    const { email, pin } = req.body;
    // pin is required — it's the user's Base transaction PIN, used to encrypt the BNB key
    if (!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      return res
        .status(400)
        .json({ message: "Transaction PIN is required to deploy BNB wallet" });
    }
    const sanitizedEmail = sanitizeData(email, true);
    const data = await deploySafeWalletBNB(sanitizedEmail, pin);

    console.log(
      `✅ BNB wallet deployed for ${sanitizedEmail}: ${data.safeAddress}`,
    );
    res.json({
      username: data.data.username,
      email: sanitizedEmail,
      safeAddress: data.data.safeAddress,
    });
  } catch (err) {
    console.error("❌ /bnb/register:", err.message);
    res
      .status(500)
      .json({ message: "BNB wallet deployment failed. Please try again." });
  }
});

export default router;
