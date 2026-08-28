import express from "express";
import Transaction from "../models/Transaction.js";

const router = express.Router();

router.get("/transactions/:fromAddress", async (req, res) => {
  const addr = req.params.fromAddress;
  try {
    const fromTransactions = await Transaction.find({
      fromAddress: addr.toLowerCase(),
    });
    const toTransactions = await Transaction.find({
      toAddress: addr.toLowerCase(),
    });

    const combined = [...fromTransactions, ...toTransactions];
    res.status(200).json(combined);
  } catch (err) {
    console.error(`❌ Fetch Transactions Error`);
    res.status(500).json({
      errorMsg: `❌ Fetch Transactions Error`,
    });
  }
});

export default router;
