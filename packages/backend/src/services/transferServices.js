import { ethers } from 'ethers';
import { User, UserBNB } from '../models/Users.js';
import { ERC20, SAFE, MULTISEND } from '../utils/abi.js';
import { estimateTransferFee } from './estimateFee.js';
import { _getBalance, balance } from './balanceServices.js';
import { sendTransactionEmailToSender, sendTransactionEmailToReceiver } from './emailService.js';
import Transaction from '../models/Transaction.js';
import { PointsRecord, pointsDistribution } from '../models/PointsState.js';

const sponsorKey = process.env.MANAGER_PRIVATE_KEY;
const mode = process.env.NODE_ENV;
const MULTI_SEND_BASE_ADDRESS =
  mode === 'development' ? '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425' : '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3';

const MULTI_SEND_BNB_ADDRESS =
  mode === 'development'
    ? '0x5270A710B4df2ecB457Be1aCA29fbD6C34435eb6'
    : '0x63bF68FE0280799E43009eb66D7a1E4248082E14';

const baseRpcUrl =
  mode === 'development'
    ? process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const bnbRpcUrl =
  mode === 'development'
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;

const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;
const santAddress = process.env.SANT_BASE;

const ngnsBnbAddress = process.env.BSC_NGN_TOKEN_ADDRESS;
const cngnBnbAddress = process.env.BSC_CNGN_CONTRACT_ADDRESS;
const usdtBnbAddress = process.env.BSC_USDT_CONTRACT_ADDRESS;
const usdcBnbAddress = process.env.BSC_USDC_CONTRACT_ADDRESS;
const treasury = process.env.TREASURY_CONTRACT_ADDRESS;

function validateAmount(amount) {
  const num = parseFloat(amount);
  if (!Number.isFinite(num) || num <= 0 || num > 1000000000) {
    throw new Error('Invalid amount');
  }
  return num;
}

async function getBalance(token, address, chain) {
  const balanceProvider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const tokenContract = new ethers.Contract(token, ERC20, balanceProvider);

  return await _getBalance(tokenContract, address);
}

const coinSibling = (coin, chain) => {
  if (chain === 'bnb') {
    return coin === 'USDT'
      ? { siblingSymbol: 'USDC', token: usdcBnbAddress }
      : coin === 'USDC'
        ? { siblingSymbol: 'USDT', token: usdtBnbAddress }
        : coin === 'CNGN'
          ? { siblingSymbol: 'NGNS', token: ngnsBnbAddress }
          : { siblingSymbol: 'CNGN', token: cngnBnbAddress };
  } else {
    return coin === 'USDT'
      ? { siblingSymbol: 'USDC', token: usdcBaseAddress }
      : coin === 'USDC'
        ? { siblingSymbol: 'USDT', token: usdtBaseAddress }
        : coin === 'CNGN'
          ? { siblingSymbol: 'NGNS', token: ngnsBaseAddress }
          : { siblingSymbol: 'CNGN', token: cngnBaseAddress };
  }
};

async function executeTransfer(email, safeAddress, pKey, to, amount, coin, chain) {
  validateAmount(amount);
  let tokenAddress;
  if (chain === 'bnb') {
    if (coin === 'USDT') tokenAddress = usdtBnbAddress;
    else if (coin === 'USDC') tokenAddress = usdcBnbAddress;
    else if (coin === 'CNGN') tokenAddress = cngnBnbAddress;
    else if (coin === 'NGNS') tokenAddress = ngnsBnbAddress;
  } else {
    if (coin === 'USDT') tokenAddress = usdtBaseAddress;
    else if (coin === 'USDC') tokenAddress = usdcBaseAddress;
    else if (coin === 'CNGN') tokenAddress = cngnBaseAddress;
    else if (coin === 'NGNS') tokenAddress = ngnsBaseAddress;
    else tokenAddress = santAddress;
  }

  if (!tokenAddress) {
    return {
      status: false,
      errorMsg: `Token address not configured for coin: ${coin}`,
    };
  }

  const recipientAddress = ethers.getAddress(to);

  const fee = await estimateTransferFee(chain, true);
  const amountNum = parseFloat(amount);
  const tokenData = await getBalance(tokenAddress, safeAddress, chain);
  const balanceNum = parseFloat(ethers.formatUnits(tokenData.balance, tokenData.decimals));

  if (balanceNum < amountNum) {
    throw Error('Insufficient balance');
  }

  let feeHuman;
  let fToken;
  if (coin === 'NGN' || coin === 'CNGN') {
    feeHuman = fee.data.feeNGN;
    fToken = coin === 'NGNS' ? 'NGNS' : 'CNGN;';
  } else if (coin === 'USDT' || coin === 'USDC') {
    feeHuman = fee.data.feeUsd;
    fToken = coin === 'USDT' ? 'USDT' : 'USDC;';
  } else {
    const balances = await balance(safeAddress, 'base');
    if (
      balances.data.ngnsBalance >= fee.data.feeNGN ||
      balances.data.cNgnBalance >= fee.data.feeNGN
    ) {
      feeHuman = fee.data.feeNGN;
      fToken = balances.data.ngnsBalance >= fee.data.feeNGN ? 'NGNS' : 'CNGN';
    } else if (
      balances.data.usdtBalance >= fee.data.feeUsd ||
      balances.data.usdcBalance >= fee.data.feeUsd
    ) {
      feeHuman = fee.data.feeUsd;
      fToken = balances.data.usdtBalance >= fee.data.feeUsd ? 'USDT' : 'USDC';
    } else {
      return { status: false };
    }
  }

  let actualAmountWei = ethers.parseUnits(
    Number(amount).toFixed(tokenData.decimals).toString(),
    tokenData.decimals
  );

  let recipientReceives = amountNum;
  // sant is only on base
  let feeTokenAddress =
    chain === 'bnb'
      ? fToken === 'NGNS'
        ? ngnsBnbAddress
        : fToken === 'CNGN'
          ? cngnBnbAddress
          : fToken === 'USDC'
            ? usdcBnbAddress
            : usdtBnbAddress
      : fToken === 'NGNS'
        ? ngnsBaseAddress
        : fToken === 'CNGN'
          ? cngnBaseAddress
          : fToken === 'USDC'
            ? usdcBaseAddress
            : fToken === 'USDT'
              ? usdtBaseAddress
              : tokenAddress;

  let feeWei;
  let feeTokenDecimals;
  const fTokenData = await getBalance(feeTokenAddress, safeAddress, chain);
  if (coin !== 'SANT') {
    feeWei =
      coin === 'NGNS' || coin === 'CNGN'
        ? ethers.parseUnits(fee.data.feeNGN.toString(), tokenData.decimals)
        : ethers.parseUnits(fee.data.feeUsd.toString(), tokenData.decimals);
    feeTokenDecimals = tokenData.decimals;
  } else {
    feeWei =
      fToken === 'NGNS' || fToken === 'CNGN'
        ? ethers.parseUnits(fee.data.feeNGN.toString(), fTokenData.decimals)
        : ethers.parseUnits(fee.data.feeUsd.toString(), fTokenData.decimals);
    feeTokenDecimals = fTokenData.decimals;
  }

  let actualFeeWei = feeWei;

  // ===========FEE====================================
  if (coin !== 'SANT') {
    if (feeHuman > 0) {
      if (balanceNum >= amountNum + feeHuman) {
        actualFeeWei = feeWei;
      } else if (balanceNum < amountNum + feeHuman) {
        const siblingToken = coinSibling(coin, chain);
        const siblingTokenData = await getBalance(siblingToken.token, safeAddress, chain);
        if (siblingTokenData.balance >= actualFeeWei) {
          actualFeeWei = feeWei;
          feeTokenAddress = siblingToken.token;
          feeTokenDecimals = siblingTokenData.decimals;
        } else {
          if (feeHuman < amountNum) {
            recipientReceives = amountNum - feeHuman;
            actualAmountWei = ethers.parseUnits(
              recipientReceives.toFixed(tokenData.decimals),
              tokenData.decimals
            );
          } else {
            throw Error(`Amount too small to cover the network fee. Fee is ${feeHuman}`);
          }
        }
      } else {
        throw Error(`Fee Fetch failed`);
      }
    }
  }

  // ================ DEPLOYMENT LOAN================================
  let user =
    chain === 'base'
      ? await User.findOne({
          email: email,
        })
      : await UserBNB.findOne({
          email: email,
        });
  let isEnough = false;
  if (user) {
    if (!user.hasPaidDeploymentLoan) {
      const ngnLoan = user.deploymentLoanNGN;
      const usdLoan = user.deploymentLoanNGN;

      const rem =
        ethers.formatUnits(tokenData.balance, tokenData.decimals) -
        amountNum -
        ethers.formatUnits(actualFeeWei, feeTokenDecimals);

      isEnough = coin === 'NGNS' || coin === 'CNGN' ? ngnLoan <= rem : usdLoan <= rem;

      const loanTokenDec =
        chain === 'base'
          ? coin === 'NGNS'
            ? await getBalance(ngnsBaseAddress, safeAddress, chain)
            : coin === 'CNGN'
              ? await getBalance(cngnBaseAddress, safeAddress, chain)
              : coin === 'USDT'
                ? await getBalance(usdtBaseAddress, safeAddress, chain)
                : await getBalance(usdcBaseAddress, safeAddress, chain)
          : coin === 'NGNS'
            ? await getBalance(ngnsBnbAddress, safeAddress, chain)
            : coin === 'CNGN'
              ? await getBalance(cngnBnbAddress, safeAddress, chain)
              : coin === 'USDT'
                ? await getBalance(usdtBnbAddress, safeAddress, chain)
                : await getBalance(usdcBnbAddress, safeAddress, chain);

      actualFeeWei = isEnough
        ? coin === 'NGNS' || coin === 'CNGN'
          ? actualFeeWei +
            ethers.parseUnits(
              ngnLoan.toFixed(loanTokenDec.decimals).toString(),
              loanTokenDec.decimals
            )
          : actualFeeWei +
            ethers.parseUnits(
              usdLoan.toFixed(loanTokenDec.decimals).toString(),
              loanTokenDec.decimals
            )
        : actualFeeWei + 0n;
    }
  }

  const tx = [
    [
      recipientAddress,
      ethers.parseUnits(
        recipientReceives.toFixed(tokenData.decimals).toString(),
        tokenData.decimals
      ),
    ],
    [ethers.getAddress(treasury), actualFeeWei],
  ];

  const toData = [tokenAddress, feeTokenAddress];
  const value = [0n, 0n];
  let encodedData = [];
  const tokenContract = new ethers.Interface(ERC20);

  for (let i = 0; i < tx.length; i++) {
    let hex = tokenContract.encodeFunctionData('transfer', tx[i]);
    encodedData.push(hex);
  }

  const txData = {
    to: toData,
    value: value,
    encodedData: encodedData,
  };

  let data;
  try {
    data = await _executeTransfer(safeAddress, pKey, txData, chain);
  } catch (err) {
    await Transaction.create({
      fromAddress: safeAddress.toLowerCase(),
      toAddress: recipientAddress.toLowerCase(),
      amount,
      fee: feeHuman > 0 ? String(feeHuman) : null,
      feeCoin: fToken,
      coin: coin,
      chain: chain,
      status: 'failed',
      type: 'transfer',
      date: new Date(),
    });
    return {
      status: false,
      data: err.message,
    };
  }

  try {
    const pointsRecord = await PointsRecord.findOne({
      network: mode === 'production' ? 'MAINNET' : 'TESTNET',
    });
    if (!pointsRecord) await PointsRecord.create({});

    const receiver = await User.findOne({
      safeAddress: recipientAddress,
    });

    if (user) {
      await sendTransactionEmailToSender(email, safeAddress, to, amount, coin);
      if (isEnough) {
        await user.updateOne({
          hasPaidDeploymentLoan: true,
        });
      }
    }

    if (receiver) {
      await sendTransactionEmailToReceiver(
        receiver.email,
        receiver.username,
        safeAddress,
        amount,
        coin
      );
    }

    await Transaction.create({
      fromAddress: safeAddress.toLowerCase(),
      toAddress: recipientAddress.toLowerCase(),
      amount,
      fee: feeHuman > 0 ? String(feeHuman) : null,
      feeCoin: fToken,
      coin: coin,
      chain: chain,
      taskId: data.data.txHash,
      type: 'transfer',
      date: new Date(),
    });

    // POINTS UPDATE
    if ((chain === 'base' || chain === 'bnb') && coin !== 'SANT') {
      if (pointsRecord && !pointsRecord.isLocked) {
        console.log(`ISSUED 1 : ${pointsRecord.totalPointsIssued}`);
        const remainingPoints = pointsRecord.hardCap - pointsRecord.totalPointsIssued;
        console.log(`Remaining: ${remainingPoints}`);
        let totalReward = 0;
        let senderReceives = pointsDistribution.transfers.sender;
        let receiverReceives = pointsDistribution.transfers.receiver;
        console.log(`Sender Receives 1: ${senderReceives}`);
        console.log(`Recipient Receives 1: ${receiverReceives}`);
        if (user) totalReward += senderReceives;
        if (receiver) totalReward += receiverReceives;
        console.log(`Total Reward 1: ${totalReward}`);

        console.log(`Total Reward > Remaining?: ${totalReward > remainingPoints}`);

        if (totalReward > remainingPoints) {
          senderReceives = remainingPoints / 2;
          receiverReceives = remainingPoints / 2;
          totalReward = remainingPoints;
          console.log(`Sender Receives 2: ${senderReceives}`);
          console.log(`Recipient Receives 2: ${receiverReceives}`);
          console.log(`Total Reward 2: ${totalReward}`);
        }
        if (user) {
          if (chain === 'bnb') {
            const userBase = await User.findOne({
              email: user.email,
            });
            userBase.santPoints += senderReceives;
            await userBase.save();
          } else {
            user.santPoints += senderReceives;
            await user.save();
          }
        }
        if (receiver) {
          if (chain === 'bnb') {
            const receiverBase = await User.findOne({
              email: receiver.email,
            });
            receiverBase.santPoints += senderReceives;
            await receiverBase.save();
          } else {
            receiver.santPoints += receiverReceives;
            await receiver.save();
          }
        }
        pointsRecord.totalPointsIssued += totalReward;
        await pointsRecord.save();
        console.log(
          `Total Points Issued > Hard Cap?: ${
            pointsRecord.totalPointsIssued >= pointsRecord.hardCap
          }`
        );

        console.log(`ISSUED 2 : ${pointsRecord.totalPointsIssued}`);
        console.log(`HARDCAP : ${pointsRecord.hardCap}`);

        if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap)
          await pointsRecord.updateOne({ isLocked: true });

        if (pointsRecord.totalPointsIssued >= pointsRecord.redeemCap)
          await pointsRecord.updateOne({ canRedeem: true });
      }
    }
  } catch (err) {
    console.warn(`⚠️DB Update Error: ${err.message}`);
    return {
      status: true,
      data: data.data,
      errorMsg: err.message,
    };
  }

  return {
    status: true,
    data: data.data,
  };
}

// ==================================================================

async function _executeTransfer(safe, pKey, data, chain) {
  const provider = new ethers.JsonRpcProvider(chain === 'base' ? baseRpcUrl : bnbRpcUrl);
  const sponsorPack = new ethers.Wallet(sponsorKey, provider);
  const signerPack = new ethers.Wallet(pKey, provider);
  const safeContract = new ethers.Contract(safe, SAFE, sponsorPack);

  const currentNonce = await safeContract.nonce();
  const multisendTx = _buildMultiSendTx(data);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
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

  const tx = await safeContract.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig
  );
  const receipt = await tx.wait();
  if (receipt.hash) {
    return {
      status: true,
      data: {
        txHash: tx.hash,
        receipt: receipt,
      },
    };
  } else {
    throw err('❌ Transfer Failed');
  }
}

async function _getTransactionHash(contract, data) {
  const hash = await contract.getTransactionHash(
    data.to,
    data.value,
    data.data,
    data.op,
    data.safeTxGas,
    data.baseGas,
    data.gasPrice,
    data.gasToken,
    data.refundReceiver,
    data.nonce
  );
  return hash;
}

function _buildMultiSendTx(data) {
  const contract = new ethers.Interface(MULTISEND);
  const txHex = contract.encodeFunctionData('multiSend', [data.to, data.value, data.encodedData]);

  return txHex;
}

function _appendSafeReq(sig) {
  const v = Number(ethers.toBigInt(`0x${sig.slice(-2)}`));
  const newV = ethers.toBeHex(BigInt(v + 4)).slice(-2);
  const cutSig = sig.slice(0, sig.length - 2);
  return `${cutSig}${newV}`;
}

export { executeTransfer, _getTransactionHash, getBalance, _appendSafeReq };
