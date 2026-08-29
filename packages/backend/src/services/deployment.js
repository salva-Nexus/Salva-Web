import Safe from "@safe-global/protocol-kit";
import { ethers } from "ethers";
import { SAFE_PROXY_FACTORY, SAFE_SETUP, FACTORY_EVENT } from "../utils/abi.js";
import { _buildFactoryData } from "./estimateFee.js";

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

const factory = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";

function _getAddress(receipt) {
  const logs = receipt.logs;
  let address;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.toLowerCase() === factory.toLowerCase()) {
      const cleaned = logs[i].topics[1].slice(26, logs[i].topics[1].length);
      address = `0x${cleaned}`;
      break;
    }
  }
  return ethers.getAddress(address);
}

// ===================================================================
async function deploySafeWalletBASE_BNB() {
  // BASE
  const owner = ethers.Wallet.createRandom();
  console.log("✅ Owner Address Generated:", owner.address);
  const ownerConfig = new ethers.Wallet(owner.privateKey);

  const data = await _buildFactoryData(ownerConfig);

  const baseProvider = new ethers.JsonRpcProvider(baseRpcUrl);
  const baseSponsor = new ethers.Wallet(
    process.env.MANAGER_PRIVATE_KEY,
    baseProvider,
  );

  const baseTransactionHash = await baseSponsor.sendTransaction(data);

  const baseReceipt = await baseTransactionHash.wait();
  const baseSafeAddress = _getAddress(baseReceipt);

  let code = await baseProvider.getCode(baseSafeAddress);
  if (code === "0x") {
    await new Promise((r) => {
      setTimeout(r, 15000);
    });
    code = await baseProvider.getCode(baseSafeAddress);
  }

  if (code === "0x") {
    throw new Error("❌ Deployment not successfull");
  }

  // BNB - Non Fatal
  let bnbSafeAddress;
  let bnbSuccess;
  try {
    const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
    const bnbSponsor = new ethers.Wallet(
      process.env.MANAGER_PRIVATE_KEY,
      bnbProvider,
    );

    const bnbTransactionHash = await bnbSponsor.sendTransaction(data);

    const bnbReceipt = await bnbTransactionHash.wait();
    bnbSafeAddress = _getAddress(bnbReceipt);
  

    let bnbCode = await bnbProvider.getCode(bnbSafeAddress);
    if (bnbCode === "0x") {
      await new Promise((r) => {
        setTimeout(r, 15000);
      });
      bnbCode = await bnbProvider.getCode(bnbSafeAddress);
    }

    if (bnbCode === "0x") {
      return {
        status: true,
        data: {
          basesafe: baseSafeAddress,
          bnbSafe: "0x",
          pkey: owner.privateKey,
          bnbSuccess: false,
        },
      };
    }
    bnbSuccess = true;
  } catch (err) {
    console.error(`⚠️ BNB deployment error....Non-Fatal`);
    bnbSuccess = false;
  }

  return {
    status: true,
    data: {
      basesafe: baseSafeAddress,
      bnbSafe: bnbSafeAddress,
      pkey: owner.privateKey,
      bnbSuccess: bnbSuccess,
    },
  };
}

// ==============================================================================



export {
  deploySafeWalletBASE_BNB,
  _getAddress,
};
