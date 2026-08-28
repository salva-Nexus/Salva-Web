import { ethers } from "ethers";
import { User } from "../models/Users.js";
import {
  basePool,
  bnbPool,
  trustedBasePool,
  trustedBnbPool,
} from "../models/Pool.js";
import { ERC20, POOL_IFACE } from "../utils/abi.js";
import { _getBalance, _getDecimals } from "./balanceServices.js";
import { _asset, _getFeeAndToken } from "./poolServices.js";
import {
  estimateSwapFee,
  _buildSwapData,
  _appendSafeReq,
} from "./estimateFee.js";
import { PointsRecord, pointsDistribution } from "../models/PointsState.js";

const sponsorKey = process.env.MANAGER_PRIVATE_KEY;
const treasury = process.env.TREASURY_CONTRACT_ADDRESS;

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

const maxUint256 =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";
const Provider = (rpc) => {
  return new ethers.JsonRpcProvider(rpc);
};

const tokenIn = (type, usdToken, ngnToken) => {
  return type === "swapExactNGNAmountForUSD" || type === "swapForExactUSDAmount"
    ? ngnToken
    : usdToken;
};

async function swap(
  email,
  pkey,
  poolAddress,
  receiver,
  usdToken,
  ngnToken,
  amount,
  chain,
  trustPool,
  type,
) {
  let pool;
  try {
    chain === "base"
      ? (pool = await basePool.findOne({
          poolAddress: poolAddress.toLowerCase(),
        }))
      : (pool = await bnbPool.findOne({
          poolAddress: poolAddress.toLowerCase(),
        }));
  } catch (err) {
    await new Promise((r) => setTimeout(r, 15000));
    chain === "base"
      ? (pool = await basePool.findOne({
          poolAddress: poolAddress.toLowerCase(),
        }))
      : (pool = await bnbPool.findOne({
          poolAddress: poolAddress.toLowerCase(),
        }));
  }

  if (!pool) {
    return {
      status: false,
    };
  }
  const owner = pool.ownerSafeAddress;

  const initiator = await User.findOne({
    email: email,
  });
  const tIn = tokenIn(type, usdToken, ngnToken);
  console.log("Token In: ", tIn);
  const rpc = chain === "base" ? baseRpcUrl : bnbRpcUrl;
  const provider = Provider(rpc);
  const contract = new ethers.Contract(_asset(tIn, chain), ERC20, provider);

  let allowanceNum;
  let isTrusted = false;
  try {
    const allowance = await contract.allowance(
      initiator.safeAddress,
      poolAddress,
    );
    allowanceNum = Number(allowance);
    isTrusted = allowanceNum >= maxUint256;
  } catch (err) {
    console.error(err.message);
    const trustedPool =
      chain === "base"
        ? await trustedBasePool.findOne({
            userSafeAddress: initiator.safeAddress,
            poolAddress: poolAddress.toLowerCase(),
            tokenAddress: _asset(tIn, chain).toLowerCase(),
          })
        : await trustedBnbPool.findOne({
            userSafeAddress: initiator.safeAddress,
            poolAddress: poolAddress.toLowerCase(),
            tokenAddress: _asset(tIn, chain).toLowerCase(),
          });
    isTrusted = trustedPool ? true : false;
  }
  const fee = await estimateSwapFee(chain, isTrusted, true);
  const feeData = await _getFeeAndToken(initiator.safeAddress, fee, chain);
  const sponsor = new ethers.Wallet(sponsorKey, provider);
  const decimals = await _getDecimals(contract);
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const txData = await _buildSwapData(
    initiator.safeAddress,
    pkey,
    feeData.data.feeToWei,
    feeData.data.feeTokenAddress,
    poolAddress,
    usdToken,
    ngnToken,
    amountWei,
    receiver,
    tIn,
    trustPool && !isTrusted ? maxUint256 : amountWei,
    provider,
    sponsor,
    chain,
    type,
    isTrusted,
  );
  const tx = await txData.safe.execTransaction(
    txData.params.to,
    txData.params.value,
    txData.params.data,
    txData.params.op,
    txData.params.safeTxGas,
    txData.params.baseGas,
    txData.params.gasPrice,
    txData.params.gasToken,
    txData.params.refundReceiver,
    txData.params.sig,
  );
  const receipt = await tx.wait();
  // UPDATE POINTS
  await _updatePoint(email, owner);

  if (trustPool && !isTrusted)
    await _updateTrustedPool(
      initiator.safeAddress,
      poolAddress,
      tIn,
      receipt.hash,
      chain,
    );
  return {
    status: true,
    receipt: receipt,
  };
}

// ==============VIEW=============================

async function getAmountOut(
  poolAddress,
  tokenOut,
  tokenIn,
  amount,
  rate,
  chain,
) {
  const rpc = chain === "base" ? baseRpcUrl : bnbRpcUrl;
  const provider = Provider(rpc);
  const poolContract = new ethers.Contract(poolAddress, POOL_IFACE, provider);
  const tokenOutAddress = _asset(tokenOut, chain);
  const tokenInAddress = _asset(tokenIn, chain);
  const tokenInContract = new ethers.Contract(tokenInAddress, ERC20, provider);
  const tokenInDecimals = await _getDecimals(tokenInContract);
  const amountWei = ethers.parseUnits(amount.toString(), tokenInDecimals);
  const rateWei = ethers.parseUnits(rate.toString(), 6);
  const amountOut =
    tokenOut === "USDC" || tokenOut === "USDT"
      ? await poolContract.getExactUSDAmountOut(
          tokenOutAddress,
          amountWei,
          rateWei,
        )
      : await poolContract.getExactNGNAmountOut(
          tokenOutAddress,
          amountWei,
          rateWei,
        );
  const tokenOutContract = new ethers.Contract(
    tokenOutAddress,
    ERC20,
    provider,
  );
  const tokenOutDecimals = await _getDecimals(tokenOutContract);
  return Number(amountOut) / 10 ** tokenOutDecimals;
}

async function getAmountIn(
  poolAddress,
  usdToken,
  inToken,
  outToken,
  outAmount,
  rate,
  chain,
) {
  const rpc = chain === "base" ? baseRpcUrl : bnbRpcUrl;
  const provider = Provider(rpc);
  const poolContract = new ethers.Contract(poolAddress, POOL_IFACE, provider);
  const usdTokenAddress = _asset(usdToken, chain);
  const outTokenAddress = _asset(outToken, chain);
  const usdTokenContract = new ethers.Contract(
    usdTokenAddress,
    ERC20,
    provider,
  );
  const outTokenContract = new ethers.Contract(
    outTokenAddress,
    ERC20,
    provider,
  );
  const outTokenDecimals = await _getDecimals(outTokenContract);
  const amountWei = ethers.parseUnits(outAmount.toString(), outTokenDecimals);
  const rateWei = ethers.parseUnits(rate.toString(), 6);
  const amountIn =
    inToken === "NGNS" || inToken === "CNGN"
      ? await poolContract.getExactNGNAmountIn(
          usdTokenAddress,
          amountWei,
          rateWei,
        )
      : await poolContract.getExactUSDAmountIn(
          usdTokenAddress,
          amountWei,
          rateWei,
        );

  const inTokenAddress = _asset(inToken, chain);
  const inTokenContract = new ethers.Contract(inTokenAddress, ERC20, provider);
  const inTokenDecimals = await _getDecimals(inTokenContract);

  return Number(amountIn) / 10 ** inTokenDecimals;
}

// =============HELPERS============================

async function _updateTrustedPool(
  swapInitiator,
  poolAddress,
  approveToken,
  txHash,
  chain,
) {
  console.log(`Trusting Pool!!!`);
  try {
    chain === "base"
      ? await trustedBasePool.create({
          userSafeAddress: swapInitiator,
          poolAddress: poolAddress,
          tokenAddress: _asset(approveToken, chain),
          txHash: txHash,
        })
      : await trustedBnbPool.create({
          userSafeAddress: swapInitiator,
          poolAddress: poolAddress,
          tokenAddress: _asset(approveToken, chain),
          txHash: txHash,
        });

    return;
  } catch (err) {
    console.error("⚠️ TRUSTED POOL UPDATE FAILED - NON FATAL", err.message);
    return;
  }
}

async function _updatePoint(swapInitiator, poolOwner) {
  // Non Fatal
  try {
    const initiator = await User.findOne({
      email: swapInitiator,
    });
    const owner = await User.findOne({
      safeAddress: poolOwner.toLowerCase(),
    });
    const pointsRecord = await PointsRecord.findOne({
      network: mode === "production" ? "MAINNET" : "TESTNET",
    });
    if (!pointsRecord) await PointsRecord.create({});
    if (pointsRecord && !pointsRecord.isLocked) {
      console.log(`ISSUED 1 : ${pointsRecord.totalPointsIssued}`);
      const remainingPoints =
        pointsRecord.hardCap - pointsRecord.totalPointsIssued;
      console.log(`Remaining: ${remainingPoints}`);
      let totalReward = 0;
      let initiatorReceives = pointsDistribution.swaps.ls;
      let poolOwnerReceives = pointsDistribution.swaps.lp;
      console.log(`Initiator Receives 1: ${initiatorReceives}`);
      console.log(`Pool Owner Receives 1: ${poolOwnerReceives}`);
      if (initiator) totalReward += initiatorReceives;
      if (owner) totalReward += poolOwnerReceives;
      console.log(`Total Reward 1: ${totalReward}`);

      console.log(
        `Total Reward > Remaining?: ${totalReward > remainingPoints}`,
      );

      if (totalReward > remainingPoints) {
        initiatorReceives = remainingPoints / 2;
        poolOwnerReceives = remainingPoints / 2;
        totalReward = remainingPoints;
        console.log(`Initiator Receives 2: ${initiatorReceives}`);
        console.log(`Pool Owner Receives 2: ${poolOwnerReceives}`);
        console.log(`Total Reward 2: ${totalReward}`);
      }
      if (initiator) {
        initiator.santPoints += initiatorReceives;
        await initiator.save();
      }

      if (owner) {
        owner.santPoints += poolOwnerReceives;
        await owner.save();
      }
      pointsRecord.totalPointsIssued += totalReward;
      await pointsRecord.save();

      console.log(
        `Total Points Issued > Hard Cap?: ${
          pointsRecord.totalPointsIssued >= pointsRecord.hardCap
        }`,
      );

      console.log(`ISSUED 2 : ${pointsRecord.totalPointsIssued}`);
      console.log(`HARDCAP : ${pointsRecord.hardCap}`);
      if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap)
        await pointsRecord.updateOne({ isLocked: true });

      if (pointsRecord.totalPointsIssued >= pointsRecord.redeemCap)
        await pointsRecord.updateOne({ canRedeem: true });
    }
    return {
      status: true,
    };
  } catch (err) {
    console.warn(`⚠️DB Update Error: ${err.message}`);
    return {
      status: false,
    };
  }
}

export { swap, getAmountIn, getAmountOut, maxUint256 };