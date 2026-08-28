import express from "express";
import { ethers } from "ethers";
import { balance } from "../services/balanceServices.js";
const router = express.Router();

router.get("/base/balance/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ message: "Invalid address format" });
  }

  try {
    const response = await balance(address, "base");

    res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ Base Balance Fetch Failed:", error.message);
    res.status(200).json({
      ngnsBalance: "0.00",
      cNgnBalance: "0.00",
      usdtBalance: "0.00",
      usdcBalance: "0.00",
    });
  }
});

router.get("/sant/base/balance/:address", async (req, res) => {
  const { address } = req.params;
  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ message: "Invalid address format" });
  }

  try {
    const response = await balance(address, "base");

    res.status(200).json(response.data);
  } catch (error) {
    console.error("❌ SANT Balance Fetch Failed:", error.message);
    res.status(200).json({
      santBalance: "0.00",
    });
  }
});

router.get("/bnb/balance/:address", async (req, res) => {
  const { address } = req.params;

  if (!address || !address.startsWith("0x") || address.length !== 42) {
    return res.status(400).json({ error: "Invalid address" });
  }
  if (!ethers.isAddress(address)) {
    return res.status(400).json({ message: "Invalid address format" });
  }

  try {
    const response = await balance(address, "bnb");
    res.status(200).json(response.data);
  } catch (err) {
    console.error("BNB balance fetch error:", err);
    res.status(500).json({
      error: "Failed to fetch BNB balances",
      ngnsBalance: "0.00",
      cNgnBalance: "0.00",
      usdtBalance: "0.00",
      usdcBalance: "0.00",
    });
  }
});

export default router;
