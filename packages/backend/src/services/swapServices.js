import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { Pool } from '../models/Pool.js';
import { ERC20, POOL_IFACE } from '../utils/abi.js';
import { _getBalance, _getDecimals } from './balanceServices.js';
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
import { sendSafeTxWithBuilderCode } from '../utils/builderCode.js';
import { _clampToBalance, _deductFee, _sameToken, _scaleByAmount } from './amountServices.js';

const Provider = (rpc) => new ethers.JsonRpcProvider(rpc);

async function getBalance(token, address, chain) {
  const rpcProvider = Provider(getRpcUrlByChain(String(chain).toLowerCase()));

  if (token !== ethers.ZeroAddress) {
    const tokenContract = new ethers.Contract(token, ERC20, rpcProvider);
    return _getBalance(tokenContract, address);
  }

  const balance = await rpcProvider.getBalance(address);
  return { balance, decimals: 18 };
}

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

async function _findPoolOrRetry(poolAddress, assetOut, assetIn, chain) {
  const query = {
    poolAddress: String(poolAddress).toLowerCase(),
    chain: String(chain).toLowerCase(),
    type: mode === 'development' ? 'TESTNET' : 'MAINNET',
  };

  let pool;
  try {
    pool = await Pool.findOne(query);
  } catch (err) {
    console.warn(`⚠️ Pool query failed, retrying in 5s...`);
    await new Promise((r) => setTimeout(r, 5000));
    pool = await Pool.findOne(query);
  }

  const inv = pool?.inventories?.find(
    (item) =>
      String(item.baseSymbol).toUpperCase() === String(assetOut).toUpperCase() &&
      String(item.quoteSymbol).toUpperCase() === String(assetIn).toUpperCase()
  );

  if (!inv) return undefined;

  return {
    baseSymbol: inv.baseSymbol,
    quoteSymbol: inv.quoteSymbol,
    baseAddress: inv.baseAddress,
    quoteAddress: inv.quoteAddress,
    floor: inv.floor,
    spread: inv.spread,
    allowedSwapBelowFloor: inv.allowedSwapBelowFloor,
    poolAddress: pool.poolAddress,
    ownerSafeAddress: pool.ownerSafeAddress,
  };
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
  console.log(amountIn);
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn, chain);
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

  // Parse decimals & amounts
  const inContract =
    _assetIn !== ethers.ZeroAddress ? new ethers.Contract(_assetIn, ERC20, provider) : undefined;
  const inDecimals = inContract ? await _getDecimals(inContract) : 18;

  const outContract =
    _assetOut !== ethers.ZeroAddress ? new ethers.Contract(_assetOut, ERC20, provider) : undefined;
  const outDecimals = outContract ? await _getDecimals(outContract) : 18;

  // Never swap more than the balance: shrink amountIn and scale the min output with it
  const inBalance = await getBalance(_assetIn, initiator.safeAddress, chain);
  const requestedWei = ethers.parseUnits(amountIn.toString(), inDecimals);
  let amountWei = _clampToBalance(inBalance.balance, requestedWei);
  let minAmountOutWei = _scaleByAmount(
    ethers.parseUnits(minAmountOut.toString(), outDecimals),
    amountWei,
    requestedWei
  );
  amountIn = ethers.formatUnits(amountWei, inDecimals);
  minAmountOut = ethers.formatUnits(minAmountOutWei, outDecimals);

  let fee = !isDeployed
    ? await estimateDeploymentFee(initiator.safeAddress, chain)
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

  let amountOutEst = await getAmountOut(poolAddress, assetIn, assetOut, amountIn, chain);

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
    const initFeeData = await _getFeeAndToken(
      initiator.safeAddress,
      fee,
      chain,
      amountWei,
      _assetIn
    );
    const initTransferFeeData = await _getFeeAndToken(
      initiator.safeAddress,
      transferFee,
      chain,
      amountWei,
      _assetIn
    );

    if (!initFeeData.status || !initTransferFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    // If the fee token matches the input asset, make sure amountIn can still cover Deployment Fee + Transfer Fee (amount is fitted once the final fee is known)
    if (_sameToken(initFeeData.data.feeTokenAddress, _assetIn)) {
      _deductFee(
        inBalance.balance,
        amountWei,
        BigInt(initFeeData.data.feeToWei) + BigInt(initTransferFeeData.data.feeToWei)
      );
    }
    await _deploySafe(initiator.safeAddress, pkey, provider, chain);
  }

  if (transferFee) {
    fee.data.feeEth += transferFee.data.feeEth;
    fee.data.feeNGN += transferFee.data.feeNGN;
    fee.data.feeUsd += transferFee.data.feeUsd;
  }

  const feeData = await _getFeeAndToken(initiator.safeAddress, fee, chain, amountWei, _assetIn);

  if (!feeData.status) {
    throw Error('❌ Insufficient balance: Cannot Cover Fee');
  }

  // Fee is paid in the token being sent: deduct it from the swap amount if the balance can't cover both
  if (_sameToken(feeData.data.feeTokenAddress, _assetIn)) {
    const fittedWei = _deductFee(inBalance.balance, amountWei, feeData.data.feeToWei);
    if (fittedWei !== amountWei) {
      minAmountOutWei = _scaleByAmount(minAmountOutWei, fittedWei, amountWei);
      amountWei = fittedWei;
      amountIn = ethers.formatUnits(amountWei, inDecimals);
      amountOutEst = await getAmountOut(poolAddress, assetIn, assetOut, amountIn, chain);
    }
  }

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
    // txResponse = await txData.safe.execTransaction(
    //   txData.params.to,
    //   txData.params.value,
    //   txData.params.data,
    //   txData.params.op,
    //   txData.params.safeTxGas,
    //   txData.params.baseGas,
    //   txData.params.gasPrice,
    //   txData.params.gasToken,
    //   txData.params.refundReceiver,
    //   txData.params.sig
    // );
    txResponse = await sendSafeTxWithBuilderCode(txData);
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
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn, chain);
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

  // Parse decimals
  const inContract =
    _assetIn !== ethers.ZeroAddress ? new ethers.Contract(_assetIn, ERC20, provider) : undefined;
  const inDecimals = inContract ? await _getDecimals(inContract) : 18;

  const outContract =
    _assetOut !== ethers.ZeroAddress ? new ethers.Contract(_assetOut, ERC20, provider) : undefined;
  const outDecimals = outContract ? await _getDecimals(outContract) : 18;

  // Never pull more than the balance: if amountOut costs more, shrink amountOut to what the balance can buy
  const inBalance = await getBalance(_assetIn, initiator.safeAddress, chain);
  if (inBalance.balance <= 0n) {
    throw Error('❌ Insufficient balance');
  }
  let amountInEst = await getAmountIn(poolAddress, assetIn, assetOut, amountOut, chain);
  const requiredWei = ethers.parseUnits(Number(amountInEst).toFixed(inDecimals), inDecimals);
  if (requiredWei > inBalance.balance) {
    const balanceIn = ethers.formatUnits(inBalance.balance, inDecimals);
    amountOut = await _fitAmountOut(poolAddress, assetIn, assetOut, balanceIn, outDecimals, chain);
    maxAmountIn = balanceIn;
    amountInEst = await getAmountIn(poolAddress, assetIn, assetOut, amountOut, chain);
  }

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
    const estInWei = ethers.parseUnits(Number(amountInEst).toFixed(inDecimals), inDecimals);
    const initFeeData = await _getFeeAndToken(
      initiator.safeAddress,
      fee,
      chain,
      estInWei,
      _assetIn
    );
    const initTransferFeeData = await _getFeeAndToken(
      initiator.safeAddress,
      transferFee,
      chain,
      estInWei,
      _assetIn
    );

    if (!initFeeData.status || !initTransferFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    if (_sameToken(initFeeData.data.feeTokenAddress, _assetIn)) {
      _deductFee(
        inBalance.balance,
        ethers.parseUnits(Number(amountInEst).toFixed(inDecimals), inDecimals),
        BigInt(initFeeData.data.feeToWei) + BigInt(initTransferFeeData.data.feeToWei)
      );
    }
    await _deploySafe(initiator.safeAddress, pkey, provider, chain);
  }

  if (transferFee) {
    fee.data.feeEth += transferFee.data.feeEth;
    fee.data.feeNGN += transferFee.data.feeNGN;
    fee.data.feeUsd += transferFee.data.feeUsd;
  }

  const requiredInWei = ethers.parseUnits(Number(amountInEst).toFixed(inDecimals), inDecimals);
  const feeData = await _getFeeAndToken(initiator.safeAddress, fee, chain, requiredInWei, _assetIn);

  if (!feeData.status) {
    throw Error('❌ Insufficient balance: Cannot Cover Fee');
  }

  // Fee is paid in the token being sent: fit the swap into balance minus fee
  if (_sameToken(feeData.data.feeTokenAddress, _assetIn)) {
    const fittedWei = _deductFee(inBalance.balance, requiredInWei, feeData.data.feeToWei);
    if (fittedWei !== requiredInWei) {
      const budgetIn = ethers.formatUnits(fittedWei, inDecimals);
      amountOut = await _fitAmountOut(poolAddress, assetIn, assetOut, budgetIn, outDecimals, chain);
      maxAmountIn = budgetIn;
      amountInEst = await getAmountIn(poolAddress, assetIn, assetOut, amountOut, chain);
    }
  }

  const amountOutWei = ethers.parseUnits(amountOut.toString(), outDecimals);
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
    // txResponse = await txData.safe.execTransaction(
    //   txData.params.to,
    //   txData.params.value,
    //   txData.params.data,
    //   txData.params.op,
    //   txData.params.safeTxGas,
    //   txData.params.baseGas,
    //   txData.params.gasPrice,
    //   txData.params.gasToken,
    //   txData.params.refundReceiver,
    //   txData.params.sig
    // );
        txResponse = await sendSafeTxWithBuilderCode(txData);
  } catch (err) {
    await Transaction.create({
      fromAddress: initiator.safeAddress.toLowerCase(),
      toAddress: poolAddress,
      amount: String(amountInEst),
      fee: 0,
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
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn, chain);

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
  const pool = await _findPoolOrRetry(poolAddress, assetOut, assetIn, chain);

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

// amountOut the pool can pay for `amountIn`, shaved 0.01% and floored so the pull never exceeds the budget
async function _fitAmountOut(poolAddress, assetIn, assetOut, amountIn, outDecimals, chain) {
  const digits = Math.min(Number(outDecimals), 8);
  const factor = 10 ** digits;
  const out = await getAmountOut(poolAddress, assetIn, assetOut, amountIn, chain);
  const fitted = Math.floor(out * 0.9999 * factor) / factor;
  if (fitted <= 0) {
    throw new TypeError('Insufficient balance to cover swap, please top up.');
  }
  return fitted.toFixed(digits);
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
