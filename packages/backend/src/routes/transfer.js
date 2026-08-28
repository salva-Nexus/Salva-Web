import { executeTransfer } from "../services/transferServices.js";
import express from "express";

const router = express.Router();

router.post("/transfer", async (req, res) => {
  try {
    const {
      email,
      userPrivateKey,
      safeAddress,
      toAddress,
      amount,
      coin,
      chain,
    } = req.body;
    const coinFromQuery = req.query.coin;

    const transferResult = await executeTransfer(
      email,
      safeAddress,
      userPrivateKey,
      toAddress,
      amount,
      coinFromQuery ? coinFromQuery : coin,
      chain,
    );
    res.status(200).json({
      status: transferResult.status,
      data: transferResult.data,
      errorMsg: transferResult.errorMsg ? transferResult.errorMsg : null,
    });
  } catch (err) {
    console.error(`❌ Transfer Error: ${err.message}`);
    res.status(400).json({
      status: false,
      data: `❌ Transfer Error: ${err.message}`,
    });
  }
});

export default router;
