import { ethers } from 'ethers';
import { ERC20 } from '../utils/abi.js';
import { keyValue } from '../utils/vars.js';

async function _getBalance(contract, address) {
  let balance;
  let decimals;
  const formatted = ethers.getAddress(address.toLowerCase());

  try {
    balance = await contract.balanceOf(formatted);
    decimals = await _getDecimals(contract);
    return { balance, decimals };
  } catch (err) {
    console.error(`⚠️ Fetch Balance Error ${err.message}, Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    balance = await contract.balanceOf(formatted);
    decimals = await _getDecimals(contract);
    return { balance, decimals };
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

async function balance(address, chain = 'base') {
  const isBase = chain.toLowerCase() === 'base';

  const ngnsAddress = keyValue(isBase ? 'ngnsBaseAddress' : 'ngnsBnbAddress');
  const cngnAddress = keyValue(isBase ? 'cngnBaseAddress' : 'cngnBnbAddress');
  const usdtAddress = keyValue(isBase ? 'usdtBaseAddress' : 'usdtBnbAddress');
  const usdcAddress = keyValue(isBase ? 'usdcBaseAddress' : 'usdcBnbAddress');
  const santAddress = keyValue('santAddress');
  const rpcUrl = keyValue(isBase ? 'baseRpcUrl' : 'bnbRpcUrl');

  if (!ngnsAddress || !cngnAddress || !usdtAddress || !usdcAddress || !rpcUrl) {
    console.error('❌ Missing token contract addresses or RPC URL in configuration');
    return {
      status: false,
      data: {
        ngnsBalance: '0.00',
        cNgnBalance: '0.00',
        usdtBalance: '0.00',
        usdcBalance: '0.00',
        santBalance: isBase ? '0.00' : null,
      },
    };
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);

  const ngnsContract = new ethers.Contract(
    ethers.getAddress(ngnsAddress.toLowerCase()),
    ERC20,
    provider
  );
  const cNgnContract = new ethers.Contract(
    ethers.getAddress(cngnAddress.toLowerCase()),
    ERC20,
    provider
  );
  const usdtContract = new ethers.Contract(
    ethers.getAddress(usdtAddress.toLowerCase()),
    ERC20,
    provider
  );
  const usdcContract = new ethers.Contract(
    ethers.getAddress(usdcAddress.toLowerCase()),
    ERC20,
    provider
  );
  const santContract =
    isBase && santAddress
      ? new ethers.Contract(ethers.getAddress(santAddress.toLowerCase()), ERC20, provider)
      : null;

  const [ngnsData, cngnData, usdtData, usdcData, santData] = await Promise.all([
    _getBalance(ngnsContract, address),
    _getBalance(cNgnContract, address),
    _getBalance(usdtContract, address),
    _getBalance(usdcContract, address),
    santContract ? _getBalance(santContract, address) : Promise.resolve(null),
  ]);

  return {
    status: true,
    data: {
      ngnsBalance: ethers.formatUnits(ngnsData.balance, ngnsData.decimals),
      cNgnBalance: ethers.formatUnits(cngnData.balance, cngnData.decimals),
      usdtBalance: ethers.formatUnits(usdtData.balance, usdtData.decimals),
      usdcBalance: ethers.formatUnits(usdcData.balance, usdcData.decimals),
      santBalance:
        santData !== null ? ethers.formatUnits(santData.balance, santData.decimals) : null,
    },
  };
}

export { balance, _getBalance, _getDecimals };
