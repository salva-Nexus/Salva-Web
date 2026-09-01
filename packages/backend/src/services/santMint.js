import { ethers } from 'ethers';
import { SANT_ABI, ERC20, SAFE } from '../utils/abi.js';
import { _getDecimals } from './balanceServices.js';
import { estimateTransferFee } from './estimateFee.js';
import { balance } from './balanceServices.js';
import { _getTransactionHash, getBalance, _appendSafeReq } from './transferServices.js';
import { User } from '../models/Users.js';
import { PointsRecord } from '../models/PointsState.js';
import { keyValue, mode } from '../utils/vars.js';

async function mintSant(email, toAddress, toKey) {
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

    if (!pointsRecord || !pointsRecord.canRedeem) {
      throw new Error('Claim Locked');
    }

    user.santClaimInProgress = true;
    await user.save();

    const points = user.santPoints;
    const provider = new ethers.JsonRpcProvider(keyValue('baseRpcUrl'));
    const sponsorPack = new ethers.Wallet(keyValue('sponsorKey'), provider);
    const santContract = new ethers.Contract(keyValue('santAddress'), SANT_ABI, sponsorPack);
    const safeContract = new ethers.Contract(toAddress, SAFE, sponsorPack);
    const signerPack = new ethers.Wallet(toKey, provider);

    const decimals = await _getDecimals(santContract);
    const amountWei = ethers.parseUnits(String(Math.floor(points)), decimals);

    const fee = await estimateTransferFee('base', true);
    let feeHuman;
    let fToken;

    const balances = await balance(toAddress, 'base');
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
      user.santClaimInProgress = false;
      await user.save();
      return { status: false };
    }

    let feeTokenAddress =
      fToken === 'NGNS'
        ? keyValue('ngnsBaseAddress')
        : fToken === 'CNGN'
          ? keyValue('cngnBaseAddress')
          : fToken === 'USDC'
            ? keyValue('usdcBaseAddress')
            : keyValue('usdtBaseAddress');

    if (feeHuman <= 0) {
      throw new Error('Fee not enough');
    }

    const fTokenData = await getBalance(feeTokenAddress, toAddress, 'base');
    let feeWei =
      fToken === 'NGNS' || fToken === 'CNGN'
        ? ethers.parseUnits(fee.data.feeNGN.toString(), fTokenData.decimals)
        : ethers.parseUnits(fee.data.feeUsd.toString(), fTokenData.decimals);

    console.log(`🪙 [SANT] Minting ${points} SANT → ${toAddress}`);

    const tokenContract = new ethers.Interface(ERC20);
    let hex = tokenContract.encodeFunctionData('transfer', [
      ethers.getAddress(keyValue('treasury')),
      feeWei,
    ]);

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

    const mintTx = await santContract.mint(ethers.getAddress(toAddress), amountWei, {
      gasLimit: 200_000,
    });

    console.log(`⏳ [SANT] Mint tx submitted: ${mintTx.hash}`);
    const mintReceipt = await mintTx.wait();

    if (!mintReceipt || mintReceipt.status !== 1) {
      throw new Error('SANT mint transaction reverted on-chain');
    }

    console.log(`✅ [SANT] Mint confirmed: ${mintTx.hash}`);

    try {
      await safeContract.execTransaction(
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
    } catch (err) {
      console.error(`⚠️ Failed to deduct fee: ${err.message}`);
    }

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
