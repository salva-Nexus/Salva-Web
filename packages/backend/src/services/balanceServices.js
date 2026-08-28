import { ethers } from "ethers";
import { ERC20 } from "../utils/abi.js";

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

const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;
const santAddress = process.env.SANT_BASE;

const ngnsBnbAddress = process.env.BSC_NGN_TOKEN_ADDRESS;
const cngnBnbAddress = process.env.BSC_CNGN_CONTRACT_ADDRESS;
const usdtBnbAddress = process.env.BSC_USDT_CONTRACT_ADDRESS;
const usdcBnbAddress = process.env.BSC_USDC_CONTRACT_ADDRESS;

async function _getBalance(contract, address) {
  let balance;
  let decimals;
  const formated = ethers.getAddress(address.toLowerCase());
  try {
    balance = await contract.balanceOf(formated);
    decimals = await _getDecimals(contract);
    return {
      balance,
      decimals,
    };
  } catch (err) {
    console.error(`⚠️ Fetch Balance Error ${err.message}, Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    balance = await contract.balanceOf(formated);
    decimals = await _getDecimals(contract);
    return {
      balance,
      decimals,
    };
  }
}

async function _getDecimals(contract) {
  let dec;
  try {
    dec = await contract.decimals();
    return Number(dec);
  } catch (err) {
    console.error(`⚠️ Fetch Decimals Error ${err.message}, Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    dec = await contract.decimals();
    return Number(dec);
  }
}

async function balance(address, chain) {
  if (
    !ngnsBaseAddress ||
    !cngnBaseAddress ||
    !usdtBaseAddress ||
    !usdcBaseAddress ||
    !ngnsBnbAddress ||
    !cngnBnbAddress ||
    !usdtBnbAddress ||
    !usdcBnbAddress
  ) {
    console.error("❌ Missing token contract addresses in .env");
    return {
      ngnsBalance: "0.00",
      cngnBalance: "0.00",
      usdtBalance: "0.00",
      usdcBalance: "0.00",
    };
  }
  // ──────────────────────────────────────────────────────────────────

  let provider;
  let ngnsContract;
  let cNgnContract;
  let usdtContract;
  let usdcContract;
  let santContract;

  if (chain === "base") {
    provider = new ethers.JsonRpcProvider(baseRpcUrl);
    ngnsContract = new ethers.Contract(
      ethers.getAddress(ngnsBaseAddress.toLowerCase()),
      ERC20,
      provider,
    );
    cNgnContract = new ethers.Contract(
      ethers.getAddress(cngnBaseAddress.toLowerCase()),
      ERC20,
      provider,
    );
    usdtContract = new ethers.Contract(
      ethers.getAddress(usdtBaseAddress.toLowerCase()),
      ERC20,
      provider,
    );
    usdcContract = new ethers.Contract(
      ethers.getAddress(usdcBaseAddress.toLowerCase()),
      ERC20,
      provider,
    );
    santContract = new ethers.Contract(
      ethers.getAddress(santAddress.toLowerCase()),
      ERC20,
      provider,
    );
  } else {
    provider = new ethers.JsonRpcProvider(bnbRpcUrl);
    ngnsContract = new ethers.Contract(
      ethers.getAddress(ngnsBnbAddress.toLowerCase()),
      ERC20,
      provider,
    );
    cNgnContract = new ethers.Contract(
      ethers.getAddress(cngnBnbAddress.toLowerCase()),
      ERC20,
      provider,
    );
    usdtContract = new ethers.Contract(
      ethers.getAddress(usdtBnbAddress.toLowerCase()),
      ERC20,
      provider,
    );
    usdcContract = new ethers.Contract(
      ethers.getAddress(usdcBnbAddress.toLowerCase()),
      ERC20,
      provider,
    );
  }

  const ngnsData = await _getBalance(ngnsContract, address);
  const cngnData = await _getBalance(cNgnContract, address);
  const usdtData = await _getBalance(usdtContract, address);
  const usdcData = await _getBalance(usdcContract, address);
  const santData =
    chain === "base" ? await _getBalance(santContract, address) : null;

  return {
    status: true,
    data: {
      ngnsBalance: ethers.formatUnits(ngnsData.balance, ngnsData.decimals),
      cNgnBalance: ethers.formatUnits(cngnData.balance, cngnData.decimals),
      usdtBalance: ethers.formatUnits(usdtData.balance, usdtData.decimals),
      usdcBalance: ethers.formatUnits(usdcData.balance, usdcData.decimals),
      santBalance:
        santData !== null
          ? ethers.formatUnits(santData.balance, santData.decimals)
          : null,
    },
  };
}

export { balance, _getBalance, _getDecimals };
