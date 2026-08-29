import express from "express";
import {
  linkName,
  unlinkName,
} from "../services/snservices.js";
import { REGISTRYFACTORY } from "../utils/abi.js";
import { ethers } from "ethers";
import { User } from "../models/Users.js";

const router = express.Router();
const factory = process.env.REGISTRY_FACTORY;

const mode = process.env.NODE_ENV;
const MULTI_SEND_BASE_ADDRESS =
  mode === 'development'
    ? '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425'
    : '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3';

const baseRpcUrl =
  mode === "development"
    ? process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

router.post("/link", async (req, res) => {
  const { email, safeAddress, privateKey, name, address, registry } = req.body;

  try {
    const data = await linkName(
      email,
      safeAddress,
      privateKey,
      name,
      address,
      registry,
    );
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post("/unlink", async (req, res) => {
  const { email, safeAddress, fullName, privateKey, registry } = req.body;

  try {
    const data = await unlinkName(
      email,
      safeAddress,
      fullName,
      privateKey,
      registry,
    );
    res.status(200).json({
      status: data.status,
      data: data.data,
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/linkFee", async (req, res) => {
  try {
    const provider = new ethers.JsonRpcProvider(baseRpcUrl);
    const factoryContract = new ethers.Contract(
      factory,
      REGISTRYFACTORY,
      provider,
    );
    const fee = await factoryContract.getFee();
    res.status(200).json({
      status: true,
      data: ethers.formatUnits(fee.toString(), 6).toString(),
    });
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get("/record/:email", async (req, res) => {
  const email = req.params.email;
  const fullName = req.query.fullName;
  try {
    const user = await User.findOne({
      email: email,
    });
    const aliases = user.nameAliases;
    if (!fullName) {
      res.status(200).json({
        status: true,
        data: aliases,
      });
    } else {
      res.status(200).json({
        status: true,
        data: aliases.find((alias) => alias.name === fullName.toLowerCase()),
      });
    }
  } catch (err) {
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
