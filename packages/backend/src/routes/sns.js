import express from 'express';
import {
  linkName,
  unlinkName,
  submitInitNamespaceReq,
  submitReInitNamespaceReq,
} from '../services/snservices.js';
import { User } from '../models/Users.js';
const router = express.Router();

router.post('/namespaceInitRequest', async (req, res) => {
  const { type, safeAddress, namespace, owners } = req.body;
  
  // type should be init or reinit
  try {
    let data =
      type === 'init'
        ? await submitInitNamespaceReq(safeAddress, namespace, owners)
        : await submitReInitNamespaceReq(safeAddress, namespace, owners);
    res.status(200).json({
      status: data.status,
    });
  } catch (err) {
    console.error(`Request Submission error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/link', async (req, res) => {
  const { email, safeAddress, pin, name, address } = req.body;
  try {
    const data = await linkName(email, safeAddress, pin, name, address);
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
  const { email, safeAddress, fullName, pin } = req.body;

  try {
    const data = await unlinkName(email, safeAddress, fullName, pin);
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


export default router;
