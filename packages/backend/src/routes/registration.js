import { ethers } from 'ethers';
import express from 'express';
import { User, buildHash } from '../models/Users.js';
import { getSafeWallet } from '../services/deployment.js';
import bcrypt from 'bcryptjs';
import { sendWelcomeEmail } from '../services/emailService.js';
import authLimiter from '../middleware/authLimiter.js';
import validator from 'validator';
import { PointsRecord } from '../models/PointsState.js';
import { keyValue, mode } from '../utils/vars.js';
import points from '../utils/points.js';
import { _updateConfig } from '../services/assetServices.js';
import { setPin } from '../services/pinService.js';

const router = express.Router();

function validateRegistration(req, res, next) {
  try {
    const { username, email, password, pin } = req.body;

    const sanitizedEmail = sanitizeData(email, true);
    req.body.email = sanitizedEmail;

    if (!username) {
      return res.status(400).json({
        message: 'Please input a password',
      });
    }

    if (!password) {
      return res.status(400).json({
        message: 'Please input a password',
      });
    }
    req.body.password = sanitizeData(password, false);

    if (typeof pin !== 'string' || !/^\d{4}$/.test(pin)) {
      return res.status(400).json({ message: 'PIN must be exactly 4 digits' });
    }

    next();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
}

function sanitizeData(data, isEmail) {
  if (typeof data !== 'string') {
    throw new Error('Invalid data format');
  }
  const sanitized = data.trim().toLowerCase();
  if (isEmail) {
    if (!validator.isEmail(sanitized)) {
      throw new Error('Invalid email format');
    }
  }
  return sanitized;
}

router.post('/register', authLimiter, validateRegistration, async (req, res) => {
  // startup chain = 'base'
  const chain = 'base';
  const { username, email, password, pin, referralCode } = req.body;
  console.log(`📝 Registration attempt: username="${username}" email="${email}"`);

  const existingEmail = await User.findOne({ email });
  if (existingEmail) return res.status(400).json({ message: 'Email already registered' });

  const existingUsername = await User.findOne({ username });
  if (existingUsername) return res.status(400).json({ message: 'Username already taken' });

  try {
    const deploymentData = await getSafeWallet(chain);
    if (!deploymentData.status) return res.status(500).json({ message: `${deploymentData.data}` });
    const hashPassword = await bcrypt.hash(password, 10);

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

    await User.create({
      email: email,
      username: username,
      password: hashPassword,
      safeAddress: deploymentData.data.safe.toLowerCase(),
      ownerPrivateKey: deploymentData.data.pkey,
      referralCode: newReferralCode,
      referredBy: referralCode,
    });
    await setPin(email, pin)
    await _updateConfig(email);

    console.log(`✅ User saved: ${email}`);

    try {
      await sendWelcomeEmail(email, username);
      console.log(`📧 Welcome email sent to: ${email}`);
    } catch (emailError) {
      console.error('❌ Welcome email error:', emailError.message);
    }

    try {
      const eUser = await User.findOne({
        referralCode: referralCode,
      });
      if (eUser) {
        let pointsRecord = await PointsRecord.findOne({
          network: mode === 'production' ? 'MAINNET' : 'TESTNET',
        });

        if (!pointsRecord) {
          pointsRecord = await PointsRecord.create({
            network: mode === 'production' ? 'MAINNET' : 'TESTNET',
          });
        }

        const point = points(pointsRecord, 'registration', false);
        if (point.status) {
          eUser.santPoints += point.initiator;
          await eUser.save();

          if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap)
            await pointsRecord.updateOne({ isLocked: true });

          if (pointsRecord.totalPointsIssued >= pointsRecord.redeemCap)
            await pointsRecord.updateOne({ canRedeem: true });
        }
      }
    } catch (err) {}

    res.json({
      username: username,
      email: email,
      safeAddress: deploymentData.data.safe,
      isValidator: false,
    });
  } catch (err) {
    console.error(err.message);
    return res.status(500).json({
      errorMsg: err.message,
    });
  }
});



export default router;
