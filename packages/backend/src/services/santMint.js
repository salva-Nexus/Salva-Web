import { ethers } from 'ethers';
import { SANT_ABI } from '../utils/abi.js';
import { _getDecimals } from './balanceServices.js';
import { estimateTransferFee, _appendSafeReq, _getTransactionHash } from './estimateFee.js';
import { User } from '../models/Users.js';
import { PointsRecord } from '../models/PointsState.js';
import { keyValue, mode } from '../utils/vars.js';
import { _getFeeAndToken, _buildTransferData } from './estimateFee.js';
import { verify_Pin } from './pinService.js';

async function mintSant(email, toAddress, pin) {
  const pinData = await verify_Pin(email, pin);
  const toKey = pinData.privateKey;
  let user;
  try {
    user = await User.findOne({
      email: email,
    });
    if (!user) {
      return { status: false };
    }
    if (user.santClaimInProgress) {
      throw new Error('Double claim error');
    }
    const pointsRecord = await PointsRecord.findOne({
      network: mode === 'production' ? 'MAINNET' : 'TESTNET',
    });
    if (!pointsRecord || pointsRecord.isLocked) {
      if (user) {
        user.santClaimInProgress = false;
        await user.save().catch(() => {});
      }
      return { status: false };
    }
    user.santClaimInProgress = true;
    await user.save();

    const points = user.santPoints;
    const pointsStr = String(points);

    const provider = new ethers.JsonRpcProvider(keyValue('baseRpcUrl'));
    const sponsorPack = new ethers.Wallet(keyValue('sponsorKey'), provider);
    const santContract = new ethers.Contract(keyValue('santAddress'), SANT_ABI, sponsorPack);

    const decimals = await _getDecimals(santContract);
    const amountWei = ethers.parseUnits(pointsStr, decimals);

    const fee = await estimateTransferFee(
      toKey,
      toAddress,
      keyValue('santAddress'),
      toAddress,
      pointsStr,
      'base'
    );
    const feeData = await _getFeeAndToken(toAddress, fee, 'base');
    const txConfig = {
      token: [feeData.data.feeTokenAddress],
      to: [keyValue('treasury')],
      amount: [feeData.data.feeToWei],
    };

    const txData = await _buildTransferData(
      toKey,
      toAddress,
      txConfig,
      provider,
      sponsorPack,
      'base'
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
      txData.params.sig
    );
    const receipt = await tx.wait();
    if (!receipt) {
      if (user) {
        user.santClaimInProgress = false;
        await user.save().catch(() => {});
      }
      return { status: false };
    }

    console.log(`🪙 [SANT] Minting ${points} SANT → ${toAddress}`);

    const mintTx = await santContract.mint(ethers.getAddress(toAddress), amountWei, {
      gasLimit: 200_000,
    });

    console.log(`⏳ [SANT] Mint tx submitted: ${mintTx.hash}`);
    const mintReceipt = await mintTx.wait();

    if (!mintReceipt) {
      if (user) {
        user.santClaimInProgress = false;
        await user.save().catch(() => {});
      }
      return { status: false };
    }

    console.log(`✅ [SANT] Mint confirmed: ${mintTx.hash}`);

    user.santPoints -= points;
    user.santClaimInProgress = false;
    await user.save();

    return { status: true, txHash: mintTx.hash };
  } catch (err) {
    console.error(`❌ Mint SANT Failed: ${err.message}`);
    if (user) {
      user.santClaimInProgress = false;
      await user.save().catch(() => {});
    }
    return { status: false };
  }
}

export default mintSant;
