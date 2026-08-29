import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { User, UserBNB, buildHash } from "../models/Users.js";
import { decryptPrivateKey, hashPin } from "../utils/encryption.js";
import { _getAddress } from "./deployment.js";
import buff from "../utils/buffer.js";
import {
  estimateDeploymentFee,
  _buildFactoryData,
} from "../services/estimateFee.js";
import { mix } from "./pinService.js";

const mode = process.env.NODE_ENV;
const bnbRpcUrl =
  mode === "development"
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;

async function deploySafeWalletBNB(email, pin) {
  const userBase = await User.findOne({
    email: email,
  });

  const key = decryptPrivateKey(userBase.ownerPrivateKey, mix(pin));
  const wallet = new ethers.Wallet(key);
  const data = await _buildFactoryData(wallet);
  const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
  const bnbSponsor = new ethers.Wallet(
    process.env.MANAGER_PRIVATE_KEY,
    bnbProvider,
  );

  const bnbTransactionHash = await bnbSponsor.sendTransaction(data);

  const transactionReceipt = await bnbTransactionHash.wait();
  const bnbSafeAddress = _getAddress(transactionReceipt);

  let code = await bnbProvider.getCode(bnbSafeAddress);
  if (code === "0x") {
    await new Promise((r) => {
      setTimeout(r, 15000);
    });
    code = await bnbProvider.getCode(bnbSafeAddress);
  }

  if (code === "0x") {
    throw new Error("❌ Deployment not successfull");
  }

  let deploymentLoan = await estimateDeploymentFee();
  if (!deploymentLoan.status) {
    // wait 2 seconds and retry
    await new Promise((r) => setTimeout(r, 2000));
    deploymentLoan = await estimateDeploymentFee();
  }

  if (!deploymentLoan.status) {
    // user fallback
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
    deploymentLoanNGN: buff(deploymentLoan.data.BNB.NGN, 150),
    deploymentLoanUSD: buff(deploymentLoan.data.BNB.USD, 150),
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
