import { resolveToAddress } from '../services/resolverServices.js';
import express from 'express';

const router = express.Router();

router.get('/isAvail/:name', async (req, res) => {
  const name = req.params.name;
  console.log(name);
  try {
    const address = await resolveToAddress(name);
    res.status(200).json({
      status: true,
      address: address,
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
