import express from 'express';
import { linkName, unlinkName } from '../services/snservices.js';
import { REGISTRYFACTORY } from '../utils/abi.js';
import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { keyValue } from '../utils/vars.js';

const router = express.Router();

router.post('/link', async (req, res) => {
  const { email, safeAddress, privateKey, name, address, registry } = req.body;
  try {
    const data = await linkName(email, safeAddress, privateKey, name, address, registry);
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    console.error(`Link error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/unlink', async (req, res) => {
  const { email, safeAddress, fullName, privateKey, registry } = req.body;

  try {
    const data = await unlinkName(email, safeAddress, fullName, privateKey, registry);
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    console.error(`Unlink error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/linkFee', async (req, res) => {
  try {
    const baseRpcUrl = keyValue('baseRpcUrl');
    const factory = keyValue('factory');

    if (!baseRpcUrl || !factory) {
      throw new Error('Missing baseRpcUrl or registry factory configuration');
    }

    const provider = new ethers.JsonRpcProvider(baseRpcUrl);
    const factoryContract = new ethers.Contract(factory, REGISTRYFACTORY, provider);
    const fee = await factoryContract.getFee();

    res.status(200).json({
      status: true,
      data: ethers.formatUnits(fee.toString(), 6),
    });
  } catch (err) {
    console.error(`LinkFee error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/record/:email', async (req, res) => {
  const { email } = req.params;
  const { fullName } = req.query;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        status: false,
        errorMsg: 'User record not found',
      });
    }

    const aliases = user.nameAliases || [];

    if (!fullName) {
      return res.status(200).json({
        status: true,
        data: aliases,
      });
    }

    const targetAlias = aliases.find(
      (alias) => alias.name.toLowerCase() === fullName.toLowerCase()
    );

    return res.status(200).json({
      status: true,
      data: targetAlias || null,
    });
  } catch (err) {
    console.error(`Record fetch error: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
