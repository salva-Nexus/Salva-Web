import { PointsRecord } from "../models/PointsState.js";
import express from "express";

const router = express.Router();
const mode = process.env.NODE_ENV;

router.get("/points-record", async (req, res) => {
  try {
    let record = await PointsRecord.findOne({
      network: mode === "production" ? "MAINNET" : "TESTNET",
    });
    if (!record) {
      await new Promise((r) => setTimeout(r, 10000));
      record = await PointsRecord.findOne({
        network: mode === "production" ? "MAINNET" : "TESTNET",
      });
    }
    res.status(200).json({
      status: true,
      data: record,
    });
  } catch (err) {
    console.error(`❌Could not fetch point record`);
    res.status(200).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
