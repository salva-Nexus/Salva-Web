import express from 'express';
import { UpdateControl } from '../models/CDP.js';
import {
  propose,
  approve,
  execute,
  proposalRequest,
  proposals,
  deleteProposalRequest,
  deleteProposal,
} from '../services/proposalServices.js';

const router = express.Router();

router.get('/proposals/:adminSafe', async (req, res) => {
  const safeAddress = req.params.adminSafe;
  try {
    const data = await proposals(safeAddress);
    res.status(200).json({
      status: true,
      proposals: data,
    });
  } catch (err) {
    console.error(`Proposals Fetch error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Proposals Fetch error`,
    });
  }
});

router.get('/proposalRequests', async (req, res) => {
  try {
    const data = await proposalRequest();
    res.status(200).json({
      status: true,
      proposalRequests: data,
    });
  } catch (err) {
    console.error(`Proposal Requests Fetch error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Proposal Requests Fetch error`,
    });
  }
});

router.post('/deleteProposalRequests', async (req, res) => {
  const { key } = req.body;
  try {
    const data = await deleteProposalRequest(key);
    res.status(200).json({
      status: data.status,
    });
  } catch (err) {
    console.error(`Proposal Requests Delete error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Proposal Requests Delete error`,
    });
  }
});

router.post('/deleteProposal', async (req, res) => {
  const { proposalHash } = req.body;
  try {
    const data = await deleteProposal(proposalHash);
    res.status(200).json({
      status: data.status,
    });
  } catch (err) {
    console.error(`Proposal Delete error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Proposal Delete error`,
    });
  }
});

router.post('/propose', async (req, res) => {
  // key gotten from proposalRequest.key
  const { key, safeAddress, pin } = req.body;
  try {
    const data = await propose(key, safeAddress, pin);
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    console.error(`propose error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `Propose error`,
    });
  }
});

router.post('/approve', async (req, res) => {
  // proposalHash gotten from proposals.proposalHash
  const { proposalHash, adminSafe, privateKey } = req.body;

  try {
    const data = await approve(proposalHash, adminSafe, privateKey);
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    console.error(`approve error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `approve error`,
    });
  }
});

router.post('/execute', async (req, res) => {
  // proposalHash gotten from proposals.proposalHash
  const { proposalHash, adminSafe, pin } = req.body;

  try {
    const data = await execute(proposalHash, adminSafe, pin);
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    console.error(`execute error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: `execute error`,
    });
  }
});

router.post('/update-control', async (req, res) => {
  // key: the update name, e.g. 'cdp-price-update'
  // active: true = running, false = paused
  const { key, active } = req.body;

  if (typeof key !== 'string' || !key.trim() || typeof active !== 'boolean') {
    return res.status(400).json({
      status: false,
      errorMsg: 'key (string) and active (boolean) are required',
    });
  }

  try {
    const control = await UpdateControl.findOneAndUpdate(
      { key: key.trim() },
      { paused: !active, pausedAt: active ? null : new Date() },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.status(200).json({
      status: !control.paused,
      state: control.paused ? 'paused' : 'active',
    });
  } catch (err) {
    console.error(`update-control error: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: 'update-control error',
    });
  }
});

router.get('/update-control/:key', async (req, res) => {
  try {
    const control = await UpdateControl.findOne({ key: req.params.key.trim() }).lean();
    const paused = Boolean(control?.paused);
    res.status(200).json({ status: !paused, state: paused ? 'paused' : 'active' });
  } catch (err) {
    console.error(`update-control status error: ${err.message}`);
    res.status(500).json({ status: false, errorMsg: 'update-control status error' });
  }
});

export default router;
