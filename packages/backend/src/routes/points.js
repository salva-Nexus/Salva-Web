import { PointsRecord, canMint } from '../models/PointsState.js';
import express from 'express';
import { User } from '../models/Users.js';

const router = express.Router();
const mode = process.env.NODE_ENV;

router.get('/points-record/:email', async (req, res) => {
  try {
    const email = req.params.email;
    let record = await PointsRecord.findOne({
      network: mode === 'production' ? 'MAINNET' : 'TESTNET',
    });
    if (!record) {
      await new Promise((r) => setTimeout(r, 10000));
      record = await PointsRecord.findOne({
        network: mode === 'production' ? 'MAINNET' : 'TESTNET',
      });
    }

    if (!record) {
      return res.status(404).json({
        status: false,
        errorMsg: 'Points record not found',
      });
    }

    const user = await User.findOne({
      email: email,
    });
    const recordObj = record.toObject();
    recordObj.isLocked = !canMint(Number(user.santPoints));

    return res.status(200).json({
      status: true,
      data: recordObj,
    });
  } catch (err) {
    console.error(`❌Could not fetch point record:`, err);
    return res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
