import { estimateTransferFee } from "../services/estimateFee.js";
import express from "express";
import { ethers } from "ethers";
import { getContract } from "../services/resolverServices.js";
import { ERC20 } from "../utils/abi.js";
import {
  estimatePoolDeploymentFee,
  estimateAdd_RemoveLiqFee,
} from "../services/estimateFee.js";

const router = express.Router();
const mode = process.env.NODE_ENV;
const baseRpcUrl =
  mode === "development"
    ? process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const bnbRpcUrl =
  mode === "development"
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;

const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;

const ngnsBnbAddress = process.env.BSC_NGN_TOKEN_ADDRESS;
const cngnBnbAddress = process.env.BSC_CNGN_CONTRACT_ADDRESS;
const usdtBnbAddress = process.env.BSC_USDT_CONTRACT_ADDRESS;
const usdcBnbAddress = process.env.BSC_USDC_CONTRACT_ADDRESS;

router.get("/transfer/estimate-fee", async (req, res) => {
  try {
    const { chain, coin } = req.query;

    const rpc = chain === "base" ? baseRpcUrl : bnbRpcUrl;
    const response = await estimateTransferFee(chain, false);
    const provider = new ethers.JsonRpcProvider(rpc);

    let address;
    if (chain === "base") {
      address =
        coin === "NGNS"
          ? ngnsBaseAddress
          : coin === "CNGN"
            ? cngnBaseAddress
            : coin === "USDT"
              ? usdtBaseAddress
              : usdcBaseAddress;
    } else {
      address =
        coin === "NGNS"
          ? ngnsBnbAddress
          : coin === "CNGN"
            ? cngnBnbAddress
            : coin === "USDT"
              ? usdtBnbAddress
              : usdcBnbAddress;
    }
    const contract = getContract(address, ERC20, provider);

    const dec = await contract.decimals();

    res.json({
      chain,
      coin,
      feeNGN: response.data.feeNGN,
      feeUsd: response.data.feeUsd,
      feeWei:
        coin === "NGNS" || coin === "CNGN"
          ? ethers
              .parseUnits(response.data.feeNGN.toString(), Number(dec))
              .toString()
          : ethers
              .parseUnits(response.data.feeUsd.toString(), Number(dec))
              .toString(),
    });
  } catch (err) {
    console.error("❌ /api/estimate-fee error:", err.message);
    res.status(500).json({ message: "Failed to estimate fee" });
  }
});

router.get("/estimate-deploy-pool-fee/:chain", async (req, res) => {
  const chain = req.params.chain;
  try {
    const fee = await estimatePoolDeploymentFee(chain, false);
    res.status(200).json({
      status: fee.status,
      data: fee.data,
    });
  } catch (err) {
    console.log(`Fee Fetch failed: ${err.message}`);
    res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get(
  "/estimate-provide-remove-liquidity-fee/:chain/:type",
  async (req, res) => {
    const chain = req.params.chain;
    const type = req.params.chain;
    try {
      const fee = await estimateAdd_RemoveLiqFee(chain, type, false);
      res.status(200).json({
        status: fee.status,
        data: fee.data,
      });
    } catch (err) {
      console.log(`Fee Fetch failed: ${err.message}`);
      res.status(500).json({
        status: false,
        errorMsg: err.message,
      });
    }
  },
);

export default router;
