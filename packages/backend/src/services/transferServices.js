import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { ERC20 } from '../utils/abi.js';
import {
  estimateDeploymentFee,
  estimateTransferFee,
  _getTransactionHash,
  _appendSafeReq,
  _getFeeAndToken,
  _buildTransferData,
} from './estimateFee.js';
import { _getBalance } from './balanceServices.js';
import { sendTransactionEmailToSender, sendTransactionEmailToReceiver } from './emailService.js';
import Transaction from '../models/Transaction.js';
import { Pool } from '../models/Pool.js';
import { keyValue, mode } from '../utils/vars.js';
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import points from '../utils/points.js';
import { PointsRecord } from '../models/PointsState.js';
import { _deploySafe } from './deployment.js';
import { sendAlertToUser } from '../services/notificationServices.js';
import { verify_Pin } from './pinService.js';

async function getBalance(token, address, chain) {
  const balanceProvider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  if (token !== ethers.ZeroAddress) {
    const tokenContract = new ethers.Contract(token, ERC20, balanceProvider);

    return await _getBalance(tokenContract, address);
  } else {
    const ethBal = await balanceProvider.getBalance(address);
    return { balance: ethBal, decimals: 18 };
  }
}

async function executeTransfer(
  email,
  safeAddress,
  pin,
  to,
  amount,
  tokenSymbol,
  tokenAddress,
  chain
) {
  const token = tokenSymbol.toUpperCase();
  const normchain = chain.toLowerCase();
  const pinData = await verify_Pin(email, pin);
  const pKey = pinData.privateKey;

  if (!tokenAddress || !token || !chain) {
    return {
      status: false,
      errorMsg: `Token Config Error: ${token}`,
    };
  }

  const recipientAddress = ethers.getAddress(to);
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(normchain));
  const code = await provider.getCode(safeAddress);
  const isDeployed = code !== '0x';
  let fee = !isDeployed
    ? await estimateDeploymentFee(safeAddress, normchain)
    : await estimateTransferFee(pKey, safeAddress, tokenAddress, to, amount, normchain);
  const balanceData = await getBalance(tokenAddress, safeAddress, normchain);
  const amountToWei = ethers.parseUnits(amount, balanceData.decimals);
  if (balanceData.balance < amountToWei) {
    throw Error('❌ Insufficient balance');
  }

  const user = await User.findOne({
    email: email,
  });

  let transferFee;
  if (!isDeployed) {
    transferFee = await estimateTransferFee(pKey, safeAddress, tokenAddress, to, amount, normchain);
    const initFeeData = await _getFeeAndToken(safeAddress, fee, normchain);
    const initTransferFeeData = await _getFeeAndToken(safeAddress, transferFee, normchain);

    if (!initFeeData.status || !initTransferFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    // If the fee token matches the transfer token, ensure the user has enough for Amount + Deployment Fee + Transfer Fee
    if (initFeeData.data.feeToken === tokenSymbol) {
      const totalRequired =
        amountToWei + BigInt(initFeeData.data.feeToWei) + BigInt(initTransferFeeData.data.feeToWei);
      console.log(balanceData.balance);
      console.log(totalRequired);
      if (balanceData.balance < totalRequired || balanceData.balance <= amountToWei) {
        throw new TypeError('Insufficient balance to cover fee, please top up or reduce amount.');
      }
    } else {
      throw new TypeError('Insufficient balance to cover fee, please top up or reduce amount.');
    }
    await _deploySafe(safeAddress, pKey, provider, normchain);
  }

  if (transferFee) {
    fee.data.feeEth += transferFee.data.feeEth;
    fee.data.feeNGN += transferFee.data.feeNGN;
    fee.data.feeUsd += transferFee.data.feeUsd;
  }
  const feeData = await _getFeeAndToken(safeAddress, fee, normchain);

  if (!feeData.status) {
    throw Error('❌ Insufficient balance: Cannot Cover Fee');
  }

  if (feeData.data.feeTokenAddress !== ethers.ZeroAddress) {
    if (feeData.data.feeToken === token) {
      const totalRequired = amountToWei + feeData.data.feeToWei;
      if (balanceData.balance < totalRequired) {
        throw Error('❌ Insufficient balance: Cannot Cover Fee');
      }
    }
  }

  const tx = {
    token: [tokenAddress, feeData.data.feeTokenAddress],
    to: [recipientAddress, keyValue('treasury')],
    amount: [amountToWei, feeData.data.feeToWei],
  };

  let data;

  const recipientData = await User.findOne({
    safeAddress: recipientAddress.toLowerCase(),
  });
  const poolData = await Pool.findOne({
    poolAddress: recipientAddress.toLowerCase(),
  });

  try {
    data = await _executeTransfer(safeAddress, pKey, tx, chain);
  } catch (err) {
    await Transaction.create({
      fromAddress: user ? user.username : safeAddress.toLowerCase(),
      toAddress: recipientData
        ? recipientData.username
        : poolData
          ? poolData.poolName
          : recipientAddress.toLowerCase(),
      amount: amount,
      fee: 0,
      feeCoin: feeData.data.feeToken,
      coin: token,
      chain: chain,
      status: 'failed',
      type: 'transfer',
      date: new Date(),
    });
    await _sendAlert(
      safeAddress,
      'Transfer Failed!!!',
      `${amount} ${tokenSymbol} transfer to ${
        recipientData
          ? recipientData.username
          : poolData
            ? poolData.poolName
            : recipientAddress.toLowerCase()
      } Failed ❌`
    );
    return {
      status: false,
      data: err.message,
    };
  }

  await sendTransactionEmailToSender(email, user.username, recipientAddress, amount, token);
  await _sendAlert(
    safeAddress,
    'Transfer Sent 💸',
    `${amount} ${tokenSymbol} transfer to ${
      recipientData
        ? recipientData.username
        : poolData
          ? poolData.poolName
          : recipientAddress.toLowerCase()
    } Successful ✅`
  );

  if (recipientData) {
    await _sendAlert(
      safeAddress,
      'Payment Received 💸',
      `Received ${amount} ${tokenSymbol} from ${user ? user.username : safeAddress.toLowerCase()} ✅`
    );
    await sendTransactionEmailToReceiver(
      recipientData.email,
      recipientData.username,
      safeAddress,
      amount,
      token
    );
  }

  await Transaction.create({
    fromAddress: user ? user.username : safeAddress.toLowerCase(),
    toAddress: recipientData
      ? recipientData.username
      : poolData
        ? poolData.poolName
        : recipientAddress.toLowerCase(),
    amount,
    fee: feeData.data.feeHuman > 0 ? String(feeData.data.feeHuman) : null,
    feeCoin: feeData.data.feeToken,
    coin: token,
    chain: chain,
    status: 'success',
    type: 'transfer',
    date: new Date(),
  });

  // POINTS UPDATE
  if (tokenSymbol === 'NGNS') {
    try {
      if (user) {
        const activeNetwork = mode === 'production' ? 'MAINNET' : 'TESTNET';
        let pointsRecord = await PointsRecord.findOne({
          network: activeNetwork,
        });

        if (!pointsRecord) {
          pointsRecord = await PointsRecord.create({
            network: activeNetwork,
          });
        }

        if (pointsRecord.totalPointsIssued < pointsRecord.hardCap) {
          const point = points(pointsRecord, 'transfer', recipientData ? true : false);
          if (point && point.status) {
            const initiatorPoints = point.initiator || 0;
            const tPartyPoints = recipientData ? point.tParty || 0 : 0;
            const totalNewPoints = initiatorPoints + tPartyPoints;

            if (pointsRecord.totalPointsIssued + totalNewPoints <= pointsRecord.hardCap) {
              user.santPoints = (user.santPoints || 0) + initiatorPoints;

              if (recipientData) {
                recipientData.santPoints = (recipientData.santPoints || 0) + tPartyPoints;
                await recipientData.save();
              }
              await user.save();

              pointsRecord.totalPointsIssued += totalNewPoints;
              await pointsRecord.save();
            }
          }
        }
      }
    } catch (err) {
      console.warn('Point Update Failed: ', err.message);
    }
  }
  return {
    status: true,
    data: data.data,
  };
}

async function _executeTransfer(safe, pKey, data, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsorPack = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const txData = await _buildTransferData(pKey, safe, data, provider, sponsorPack, chain);
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
    txData.params.sig
  );
  const receipt = await tx.wait();
  if (receipt) {
    return {
      status: true,
      data: receipt,
    };
  } else {
    return {
      status: false,
    };
  }
}

async function _sendAlert(safe, title, message) {
  await sendAlertToUser(safe, title, message);
}

export { executeTransfer, getBalance };
