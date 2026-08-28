import { ethers } from "ethers";
import { SANT_ABI, ERC20, SAFE } from "../utils/abi.js";
import { _getDecimals, _getBalance } from "./balanceServices.js";
import { estimateTransferFee } from "./estimateFee.js";
import { balance } from "./balanceServices.js";
import {
  _getTransactionHash,
  getBalance,
  _appendSafeReq,
} from "./transferServices.js";
import { User } from "../models/Users.js";
import { PointsRecord } from "../models/PointsState.js";

const sponsorKey = process.env.MANAGER_PRIVATE_KEY;
const mode = process.env.NODE_ENV;

const baseRpcUrl =
  mode === "development"
    ? process.env.BASE_SEPOLIA_RPC_URL ||
      process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const treasury = process.env.TREASURY_CONTRACT_ADDRESS;
const santAddress = process.env.SANT_BASE;
const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;

async function mintSant(email, toAddress, toKey) {
  const user = await User.findOne({
    email: email,
  });

  const pointsRecord = await PointsRecord.findOne({
    network: mode === "production" ? "MAINNET" : "TESTNET",
  });

  //   if (user.santClaimInProgress) {
  //     throw Error("Double claim error");
  //   }

  if (!pointsRecord.canRedeem) {
    throw Error("Claim Locked");
  }
  user.santClaimInProgress = true;
  await user.save();
  console.log(user.santClaimInProgress);
  const points = user.santPoints;
  console.log(points, Math.floor(points));
  const provider = new ethers.JsonRpcProvider(baseRpcUrl);
  const sponsorPack = new ethers.Wallet(sponsorKey, provider);
  const santContract = new ethers.Contract(santAddress, SANT_ABI, sponsorPack);
  const safeContract = new ethers.Contract(toAddress, SAFE, sponsorPack);
  const signerPack = new ethers.Wallet(toKey, provider);

  const decimals = await _getDecimals(santContract);
  const amountWei = ethers.parseUnits(String(Math.floor(points)), decimals);

  const fee = await estimateTransferFee("base", true);
  let feeHuman;
  let fToken;

  const balances = await balance(toAddress, "base");
  if (
    balances.data.ngnsBalance >= fee.data.feeNGN ||
    balances.data.cNgnBalance >= fee.data.feeNGN
  ) {
    feeHuman = fee.data.feeNGN;
    fToken = balances.data.ngnsBalance >= fee.data.feeNGN ? "NGNS" : "CNGN";
  } else if (
    balances.data.usdtBalance >= fee.data.feeUsd ||
    balances.data.usdcBalance >= fee.data.feeUsd
  ) {
    feeHuman = fee.data.feeUsd;
    fToken = balances.data.usdtBalance >= fee.data.feeUsd ? "USDT" : "USDC";
  } else {
    return { status: false };
  }

  let feeTokenAddress =
    fToken === "NGNS"
      ? ngnsBaseAddress
      : fToken === "CNGN"
        ? cngnBaseAddress
        : fToken === "USDC"
          ? usdcBaseAddress
          : usdtBaseAddress;

  if (feeHuman <= 0) {
    user.santClaimInProgress = false;
    await user.save();
    throwError("Fee not enough");
  }

  const fTokenData = await getBalance(feeTokenAddress, toAddress, "base");
  console.log(
    signerPack.address ===
      ethers.getAddress("0xF9762f5f1b5eab36f609B78C3C6fd04e1d293220"),
  );
  let feeWei =
    fToken === "NGNS" || fToken === "CNGN"
      ? ethers.parseUnits(fee.data.feeNGN.toString(), fTokenData.decimals)
      : ethers.parseUnits(fee.data.feeUsd.toString(), fTokenData.decimals);
  let feeTokenDecimals = fTokenData.decimals;

  console.log(feeHuman, fToken, feeTokenAddress, feeWei);

  console.log(`🪙 [SANT] Minting ${points} SANT → ${toAddress}`);

  const tokenContract = new ethers.Interface(SANT_ABI);

  let hex = tokenContract.encodeFunctionData("transfer", [
    ethers.getAddress(treasury),
    feeWei,
  ]);
  console.log(hex);
  const currentNonce = await safeContract.nonce();
  const safeTx = {
    to: feeTokenAddress,
    value: 0n,
    data: hex,
    op: 0n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };

  const hash = await _getTransactionHash(safeContract, safeTx);
  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);

  const mintTx = await santContract.mint(
    ethers.getAddress(toAddress),
    amountWei,
    {
      gasLimit: 200_000,
    },
  );

  console.log(`⏳ [SANT] Mint tx submitted: ${mintTx.hash}`);
  const mintReceipt = await mintTx.wait();

  if (!mintReceipt || mintReceipt.status !== 1) {
    throw new Error("SANT mint transaction reverted on-chain");
  }

  console.log(`✅ [SANT] Mint confirmed: ${mintTx.hash}`);

  let feeTx;
  try {
    feeTx = await safeContract.execTransaction(
      safeTx.to,
      safeTx.value,
      safeTx.data,
      safeTx.op,
      safeTx.safeTxGas,
      safeTx.baseGas,
      safeTx.gasPrice,
      safeTx.gasToken,
      safeTx.refundReceiver,
      newSig,
    );
  } catch (err) {
      console.error(`⚠️ Failed to deduct fee: ${err.message}`)
  }
  // UPDATE DB

  user.santPoints -= points;
  user.santClaimInProgress = false;
  await user.save();

  return { txHash: mintTx.hash };
}

export default mintSant;
