import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { Pool } from '../models/Pool.js';
import { ERC20, POOL_IFACE } from '../utils/abi.js';
import { _getDecimals } from './balanceServices.js';
import {
  estimateDeploymentFee,
  estimateSwapExactInputFee,
  estimateSwapExactOutputFee,
  estimateTransferFee,
  _buildSwapData,
  _getFeeAndToken,
} from './estimateFee.js';
import { PointsRecord } from '../models/PointsState.js';
import { keyValue, mode } from '../utils/vars.js';
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import points from '../utils/points.js';
import Transaction from '../models/Transaction.js';
import { sendAlertToUser } from '../services/notificationServices.js';
import { _deploySafe } from './deployment.js';
import { verify_Pin } from './pinService.js';

const Provider = (rpc) => new ethers.JsonRpcProvider(rpc);

async function _alert(poolAddress, owner, initiator, amountIn, assetIn, amountOut, assetOut) {
  await sendAlertToUser(
    initiator,
    'Swap Success 💸',
    `${amountIn} ${assetIn} transfer to ${poolAddress} Successful ✅`
  );

  await sendAlertToUser(
    initiator,
    'Payment Received 💸',
    `Received ${amountOut} ${assetOut} from ${poolAddress} ✅`
  );

  await sendAlertToUser(
    owner,
    'Swap Success 💸',
    `${amountOut} ${assetOut} transfer to ${initiator} Successful ✅`
  );

  await sendAlertToUser(
    owner,
    'Payment Received 💸',
    `Received ${amountIn} ${assetIn} from ${initiator} ✅`
  );
}

async function _findPoolOrRetry(poolAddress, assetOut, assetIn) {
  let pool;
  try {
    pool = await Pool.findOne({
      poolAddress: poolAddress.toLowerCase(),
    });
  } catch (err) {
    console.warn(`⚠️ Pool query failed, retrying in 5s...`);
    await new Promise((r) => setTimeout(r, 5000));
    pool = await Pool.findOne({
      poolAddress: poolAddress.toLowerCase(),
    });
  }
  return pool?.inventories?.find(
    (inv) => inv.baseSymbol === assetOut && inv.quoteSymbol === assetIn
  );
}

async function swapExactInput(
  email,
  pin,
  poolAddress,
  assetIn,
  assetOut,
  amountIn,
  minAmountOut,
  chain
) {
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);
  const initiator = await User.findOne({ email });
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;

  if (!pool || !initiator) {
    return { status: false };
  }

  const ownerSafeAddress = pool.ownerSafeAddress;
  const _assetIn = pool.quoteAddress;
  const _assetOut = pool.baseAddress;

  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const code = await provider.getCode(initiator.safeAddress);
  const isDeployed = code !== '0x';

  let fee = !isDeployed
    ? await estimateDeploymentFee(safeAddress, normchain)
    : await estimateSwapExactInputFee(
        initiator.safeAddress,
        pkey,
        poolAddress,
        _assetIn,
        _assetOut,
        amountIn,
        minAmountOut,
        chain
      );

  const amountOutEst = await getAmountOut(poolAddress, assetIn, assetOut, amountIn, chain);
  // Parse decimals & amounts
  const inContract =
    _assetIn !== ethers.ZeroAddress ? new ethers.Contract(_assetIn, ERC20, provider) : undefined;
  const inDecimals = inContract ? await _getDecimals(inContract) : 18;
  const amountWei = ethers.parseUnits(amountIn.toString(), inDecimals);

  const outContract =
    _assetOut !== ethers.ZeroAddress ? new ethers.Contract(_assetOut, ERC20, provider) : undefined;
  const outDecimals = outContract ? await _getDecimals(outContract) : 18;
  const minAmountOutWei = ethers.parseUnits(minAmountOut.toString(), outDecimals);

  const poolContractIface = new ethers.Interface(POOL_IFACE);
  const erc20ContractIface = new ethers.Interface(ERC20);
  const approveAction = _assetIn !== ethers.ZeroAddress ? 'approve' : undefined;
  let transferFee;
  if (!isDeployed) {
    transferFee = await estimateTransferFee(
      pkey,
      initiator.safeAddress,
      _assetIn,
      poolAddress,
      amountIn,
      chain
    );
    const initFeeData = await _getFeeAndToken(initiator.safeAddress, fee, chain);
    const initTransferFeeData = await _getFeeAndToken(initiator.safeAddress, transferFee, chain);

    if (!initFeeData.status || !initTransferFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    // If the fee token matches the input asset, ensure the user has enough for AmountIn + Deployment Fee + Transfer Fee
    if (initFeeData.data.feeToken === assetIn) {
      const balanceData = await getBalance(
        initFeeData.data.feeTokenAddress,
        initiator.safeAddress,
        chain
      );
      const totalRequired =
        amountWei + BigInt(initFeeData.data.feeToWei) + BigInt(initTransferFeeData.data.feeToWei);

      if (balanceData.balance < totalRequired || balanceData.balance <= amountWei) {
        throw new TypeError(
          'Insufficient balance to cover swap amount plus fees, please top up or reduce amount.'
        );
      }
    }
    await _deploySafe(initiator.safeAddress, pkey, provider, chain);
  }

  if (transferFee) {
    fee.data.feeEth += transferFee.data.feeEth;
    fee.data.feeNGN += transferFee.data.feeNGN;
    fee.data.feeUsd += transferFee.data.feeUsd;
  }

  const feeData = await _getFeeAndToken(initiator.safeAddress, fee, chain);

  const txConfig = {
    contractAddr: approveAction
      ? [_assetIn, poolAddress, feeData.data.feeTokenAddress]
      : [poolAddress, feeData.data.feeTokenAddress],
    to: approveAction
      ? [poolAddress, poolAddress, keyValue('treasury')]
      : [poolAddress, keyValue('treasury')],
    amount: approveAction
      ? [amountWei, amountWei, feeData.data.feeToWei]
      : [amountWei, feeData.data.feeToWei],
    contract: approveAction
      ? [erc20ContractIface, poolContractIface, erc20ContractIface]
      : [poolContractIface, erc20ContractIface],
    param: {
      tokenIn: _assetIn,
      tokenOut: _assetOut,
      amountThreshold: minAmountOutWei,
    },
    sig: approveAction
      ? [approveAction, 'swapExactInput', 'transfer']
      : ['swapExactInput', 'transfer'],
  };

  const txData = await _buildSwapData(
    initiator.safeAddress,
    pkey,
    poolAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );

  let txResponse;
  try {
    txResponse = await txData.safe.execTransaction(
      txData.params.to,
      txData.params.value,
      txData.params.data,
      txData.params.op,
      txData.params.safeTxGas,
      txData.params.baseGas,
      txData.params.gasPrice,
      txData.params.gasToken,
      txData.params.refundReceiver,
      txData.params.sig
    );
  } catch (err) {
    await Transaction.create({
      fromAddress: initiator.safeAddress.toLowerCase(),
      toAddress: poolAddress,
      amount: amountIn,
      fee: feeData.data.feeHuman > 0 ? String(feeData.data.feeHuman) : null,
      feeCoin: feeData.data.feeToken,
      coin: assetIn,
      chain: chain,
      status: 'failed',
      type: 'swap',
      date: new Date(),
    });

    await sendAlertToUser(
      initiator.safeAddress,
      'Swap Failed ❌',
      `${amountIn} ${assetIn} transfer to ${poolAddress} Failed`
    );

    return {
      status: false,
      data: err.message,
    };
  }

  const receipt = await txResponse.wait();
  if (!receipt) {
    return { status: false };
  }

  await Transaction.create({
    fromAddress: initiator.safeAddress.toLowerCase(),
    toAddress: poolAddress,
    amount: amountIn,
    fee: feeData.data.feeHuman > 0 ? String(feeData.data.feeHuman) : null,
    feeCoin: feeData.data.feeToken,
    coin: assetIn,
    chain: chain,
    status: 'success',
    type: 'swap',
    date: new Date(),
  });

  await _alert(
    poolAddress,
    ownerSafeAddress,
    initiator.safeAddress,
    amountIn,
    assetIn,
    String(amountOutEst),
    assetOut
  );

  await Transaction.create({
    fromAddress: poolAddress,
    toAddress: initiator.safeAddress.toLowerCase(),
    amount: String(amountOutEst),
    fee: null,
    feeCoin: null,
    coin: assetOut,
    chain: chain,
    status: 'success',
    type: 'swap',
    date: new Date(),
  });

  if (assetIn === 'NGNS' || assetOut === 'NGNS') {
    const ownerData = await User.findOne({ safeAddress: ownerSafeAddress });
    await _updatePoint(initiator, ownerData);
  }

  return {
    status: true,
    receipt,
  };
}

async function swapExactOutput(
  email,
  pin,
  poolAddress,
  assetIn,
  assetOut,
  amountOut,
  maxAmountIn,
  chain
) {
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);
  const initiator = await User.findOne({ email });
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;

  if (!pool || !initiator) {
    return { status: false };
  }

  const ownerSafeAddress = pool.ownerSafeAddress;
  const _assetIn = pool.quoteAddress;
  const _assetOut = pool.baseAddress;

  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const code = await provider.getCode(initiator.safeAddress);
  const isDeployed = code !== '0x';

  let fee = !isDeployed
    ? await estimateDeploymentFee(initiator.safeAddress, chain)
    : await estimateSwapExactOutputFee(
        initiator.safeAddress,
        pkey,
        poolAddress,
        _assetIn,
        _assetOut,
        amountOut,
        maxAmountIn,
        chain
      );

  const amountInEst = await getAmountIn(poolAddress, assetIn, assetOut, amountOut, chain);

  let transferFee;
  if (!isDeployed) {
    transferFee = await estimateTransferFee(
      pkey,
      initiator.safeAddress,
      _assetIn,
      poolAddress,
      String(amountInEst),
      chain
    );
    const initFeeData = await _getFeeAndToken(initiator.safeAddress, fee, chain);
    const initTransferFeeData = await _getFeeAndToken(initiator.safeAddress, transferFee, chain);

    if (!initFeeData.status || !initTransferFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    if (initFeeData.data.feeToken === assetIn) {
      const balanceData = await getBalance(
        initFeeData.data.feeTokenAddress,
        initiator.safeAddress,
        chain
      );
      const totalRequired =
        BigInt(amountInEst) +
        BigInt(initFeeData.data.feeToWei) +
        BigInt(initTransferFeeData.data.feeToWei);

      if (balanceData.balance < totalRequired || balanceData.balance <= BigInt(amountInEst)) {
        throw new TypeError(
          'Insufficient balance to cover max swap amount plus fees, please top up or reduce amount.'
        );
      }
    }
    await _deploySafe(initiator.safeAddress, pkey, provider, chain);
  }

  if (transferFee) {
    fee.data.feeEth += transferFee.data.feeEth;
    fee.data.feeNGN += transferFee.data.feeNGN;
    fee.data.feeUsd += transferFee.data.feeUsd;
  }

  const feeData = await _getFeeAndToken(initiator.safeAddress, fee, chain);

  // Parse decimals & bounds
  const outContract =
    _assetOut !== ethers.ZeroAddress ? new ethers.Contract(_assetOut, ERC20, provider) : undefined;
  const outDecimals = outContract ? await _getDecimals(outContract) : 18;
  const amountOutWei = ethers.parseUnits(amountOut.toString(), outDecimals);

  const inContract =
    _assetIn !== ethers.ZeroAddress ? new ethers.Contract(_assetIn, ERC20, provider) : undefined;
  const inDecimals = inContract ? await _getDecimals(inContract) : 18;
  const maxAmountInWei = ethers.parseUnits(maxAmountIn.toString(), inDecimals);

  const poolContractIface = new ethers.Interface(POOL_IFACE);
  const erc20ContractIface = new ethers.Interface(ERC20);
  const approveAction = _assetIn !== ethers.ZeroAddress ? 'approve' : undefined;

  const txConfig = {
    contractAddr: approveAction
      ? [_assetIn, poolAddress, feeData.data.feeTokenAddress]
      : [poolAddress, feeData.data.feeTokenAddress],
    to: approveAction
      ? [poolAddress, poolAddress, keyValue('treasury')]
      : [poolAddress, keyValue('treasury')],
    amount: approveAction
      ? [maxAmountInWei, amountOutWei, feeData.data.feeToWei]
      : [amountOutWei, feeData.data.feeToWei],
    contract: approveAction
      ? [erc20ContractIface, poolContractIface, erc20ContractIface]
      : [poolContractIface, erc20ContractIface],
    param: {
      tokenIn: _assetIn,
      tokenOut: _assetOut,
      amountThreshold: maxAmountInWei,
    },
    sig: approveAction
      ? [approveAction, 'swapExactOutput', 'transfer']
      : ['swapExactOutput', 'transfer'],
  };

  const txData = await _buildSwapData(
    initiator.safeAddress,
    pkey,
    poolAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );

  let txResponse;
  try {
    txResponse = await txData.safe.execTransaction(
      txData.params.to,
      txData.params.value,
      txData.params.data,
      txData.params.op,
      txData.params.safeTxGas,
      txData.params.baseGas,
      txData.params.gasPrice,
      txData.params.gasToken,
      txData.params.refundReceiver,
      txData.params.sig
    );
  } catch (err) {
    await Transaction.create({
      fromAddress: initiator.safeAddress.toLowerCase(),
      toAddress: poolAddress,
      amount: String(amountInEst),
      fee: feeData.data.feeHuman > 0 ? String(feeData.data.feeHuman) : null,
      feeCoin: feeData.data.feeToken,
      coin: assetIn,
      chain: chain,
      status: 'failed',
      type: 'swap',
      date: new Date(),
    });

    await sendAlertToUser(
      initiator.safeAddress,
      'Swap Failed ❌',
      `${String(amountInEst)} ${assetIn} transfer to ${poolAddress} Failed`
    );

    return {
      status: false,
      data: err.message,
    };
  }

  const receipt = await txResponse.wait();
  if (!receipt) {
    return { status: false };
  }

  await Transaction.create({
    fromAddress: initiator.safeAddress.toLowerCase(),
    toAddress: poolAddress,
    amount: String(amountInEst),
    fee: feeData.data.feeHuman > 0 ? String(feeData.data.feeHuman) : null,
    feeCoin: feeData.data.feeToken,
    coin: assetIn,
    chain: chain,
    status: 'success',
    type: 'swap',
    date: new Date(),
  });

  await _alert(
    poolAddress,
    ownerSafeAddress,
    initiator.safeAddress,
    String(amountInEst),
    assetIn,
    amountOut,
    assetOut
  );

  await Transaction.create({
    fromAddress: poolAddress,
    toAddress: initiator.safeAddress.toLowerCase(),
    amount: amountOut,
    fee: null,
    feeCoin: null,
    coin: assetOut,
    chain: chain,
    status: 'success',
    type: 'swap',
    date: new Date(),
  });

  if (assetIn === 'NGNS' || assetOut === 'NGNS') {
    const ownerData = await User.findOne({ safeAddress: ownerSafeAddress });
    await _updatePoint(initiator, ownerData);
  }

  return {
    status: true,
    receipt,
  };
}

async function getAmountOut(poolAddress, assetIn, assetOut, amount, chain) {
  const provider = Provider(getRpcUrlByChain(chain));
  const poolContract = new ethers.Contract(poolAddress, POOL_IFACE, provider);
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);

  const tokenInAddress = pool.quoteAddress;
  const tokenOutAddress = pool.baseAddress;

  const tokenInContract =
    tokenInAddress !== ethers.ZeroAddress
      ? new ethers.Contract(tokenInAddress, ERC20, provider)
      : undefined;
  const tokenInDecimals = tokenInContract ? await _getDecimals(tokenInContract) : 18;

  const amountWei = ethers.parseUnits(amount.toString(), tokenInDecimals);
  const amountOut = await poolContract.exactAmountOut(tokenInAddress, tokenOutAddress, amountWei);

  const tokenOutContract =
    tokenOutAddress !== ethers.ZeroAddress
      ? new ethers.Contract(tokenOutAddress, ERC20, provider)
      : undefined;
  const tokenOutDecimals = tokenOutContract ? await _getDecimals(tokenOutContract) : 18;

  return Number(amountOut) / 10 ** tokenOutDecimals;
}

async function getAmountIn(poolAddress, assetIn, assetOut, amount, chain) {
  const provider = Provider(getRpcUrlByChain(chain));
  const poolContract = new ethers.Contract(poolAddress, POOL_IFACE, provider);
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn);

  const tokenInAddress = pool.quoteAddress;
  const tokenOutAddress = pool.baseAddress;

  const tokenOutContract =
    tokenOutAddress !== ethers.ZeroAddress
      ? new ethers.Contract(tokenOutAddress, ERC20, provider)
      : undefined;
  const tokenOutDecimals = tokenOutContract ? await _getDecimals(tokenOutContract) : 18;

  const amountWei = ethers.parseUnits(amount.toString(), tokenOutDecimals);
  const amountIn = await poolContract.exactAmountIn(tokenInAddress, tokenOutAddress, amountWei);

  const tokenInContract =
    tokenInAddress !== ethers.ZeroAddress
      ? new ethers.Contract(tokenInAddress, ERC20, provider)
      : undefined;
  const tokenInDecimals = tokenInContract ? await _getDecimals(tokenInContract) : 18;

  return Number(amountIn) / 10 ** tokenInDecimals;
}

async function _updatePoint(recipientData, ownerData) {
  try {
    const activeNetwork = mode === 'production' ? 'MAINNET' : 'TESTNET';
    let pointsRecord = await PointsRecord.findOne({ network: activeNetwork });
    if (!pointsRecord) {
      pointsRecord = await PointsRecord.create({ network: activeNetwork });
    }
    if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap) {
      return;
    }
    const point = points(pointsRecord, 'swap', Boolean(recipientData));
    if (!point || !point.status) {
      return;
    }
    const tPartyPoints = point.tParty || 0;
    const initiatorPoints = point.initiator || 0;
    const totalNewPoints = tPartyPoints + initiatorPoints;
    if (pointsRecord.totalPointsIssued + totalNewPoints > pointsRecord.hardCap) {
      console.warn('Point Update Skipped: Would exceed hard cap');
      return;
    }

    const savePromises = [];

    if (ownerData && tPartyPoints > 0) {
      ownerData.santPoints = (ownerData.santPoints || 0) + tPartyPoints;
      savePromises.push(ownerData.save());
    }

    const isSameUser =
      recipientData &&
      ownerData &&
      recipientData.safeAddress.toLowerCase() === ownerData.safeAddress.toLowerCase();

    if (recipientData && initiatorPoints > 0 && !isSameUser) {
      recipientData.santPoints = (recipientData.santPoints || 0) + initiatorPoints;
      savePromises.push(recipientData.save());
    }

    await Promise.all(savePromises);
    pointsRecord.totalPointsIssued += totalNewPoints;
    await pointsRecord.save();
  } catch (err) {
    console.warn('Point Update Failed:', err.message);
  }
}

export { swapExactInput, swapExactOutput, getAmountIn, getAmountOut, _findPoolOrRetry };
