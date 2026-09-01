import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import { User, UserBNB } from '../models/Users.js';
import { decryptPrivateKey } from '../utils/encryption.js';
import { _getAddress } from './deployment.js';
import buff from '../utils/buffer.js';
import { estimateDeploymentFee, _buildFactoryData } from '../services/estimateFee.js';
import { mix } from './pinService.js';
import { keyValue } from '../utils/vars.js';

async function deploySafeWalletBNB(email, pin) {
  const userBase = await User.findOne({ email });
  if (!userBase) {
    throw new Error('❌ User not found');
  }

  const bnbRpcUrl = keyValue('bnbRpcUrl');
  const sponsorKey = keyValue('sponsorKey');

  if (!sponsorKey) {
    throw new Error('❌ MANAGER_PRIVATE_KEY environment variable is not defined');
  }

  const key = decryptPrivateKey(userBase.ownerPrivateKey, mix(pin));
  const wallet = new ethers.Wallet(key);
  const data = await _buildFactoryData(wallet);

  const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
  const bnbSponsor = new ethers.Wallet(sponsorKey, bnbProvider);

  const bnbTransactionHash = await bnbSponsor.sendTransaction(data);
  const transactionReceipt = await bnbTransactionHash.wait();
  const bnbSafeAddress = _getAddress(transactionReceipt);

  let code = await bnbProvider.getCode(bnbSafeAddress);
  if (code === '0x') {
    await new Promise((r) => setTimeout(r, 15000));
    code = await bnbProvider.getCode(bnbSafeAddress);
  }

  if (code === '0x') {
    throw new Error('❌ BNB Safe deployment not successful');
  }

  let deploymentLoan = await estimateDeploymentFee();
  if (!deploymentLoan.status) {
    await new Promise((r) => setTimeout(r, 2000));
    deploymentLoan = await estimateDeploymentFee();
  }

  if (!deploymentLoan.status) {
    deploymentLoan = {
      data: {
        BNB: {
          NGN: 15,
          USD: 0.01,
        },
      },
    };
  }

  await UserBNB.create({
    email: email,
    username: userBase.username,
    safeAddress: bnbSafeAddress,
    ownerPrivateKey: userBase.ownerPrivateKey,
    transactionPin: userBase.transactionPin,
    pinSetupCompleted: userBase.pinSetupCompleted,
    deploymentLoanNGN: buff(deploymentLoan.data.BNB.NGN, 400),
    deploymentLoanUSD: buff(deploymentLoan.data.BNB.USD, 400),
  });

  return {
    status: true,
    data: {
      username: userBase.username,
      safeAddress: bnbSafeAddress,
    },
  };
}

export default deploySafeWalletBNB;
