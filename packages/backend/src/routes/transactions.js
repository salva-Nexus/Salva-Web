import express from 'express';
import Transaction from '../models/Transaction.js';
import { User } from '../models/Users.js';

const router = express.Router();

router.get('/transactions/:from', async (req, res) => {
  const from = req.params.from;
  try {
    let fromTransactions = await Transaction.find({
      fromAddress: from.toLowerCase(),
    });
    let toTransactions = await Transaction.find({
      toAddress: from.toLowerCase(),
    });
    // could be a username
    const user = await User.findOne({
      safeAddress: from.toLowerCase(),
    });
    if (user) {
      const fromNameTx = await Transaction.find({
        fromAddress: user.username,
      });
      fromNameTx.forEach((fr) => fromTransactions.push(fr));

      const toNameTx = await Transaction.find({
        toAddress: user.username,
      });

      toNameTx.forEach((to) => toTransactions.push(to));
    }

    const combined = [...fromTransactions, ...toTransactions];
    res.status(200).json(combined);
  } catch (err) {
    console.error(`❌ Fetch Transactions Error: ${err.message}`);
    res.status(500).json({
      errorMsg: `❌ Fetch Transactions Error`,
    });
  }
});

export default router;
