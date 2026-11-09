import { ethers } from 'ethers';
import { ERC20, CHAINLINK } from '../utils/abi.js';
import { keyValue } from '../utils/vars.js';
import { fetchNgnPricePerAsset } from '../utils/fetchRate.js';
import { getChainlinkFeedByChainAndSymbol, getRpcUrlByChain } from '../utils/rpcUrls.js';

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

async function fetchTokenUsdPrice(tokenSymbol, chain, feed) {
  try {
    const feedAddress = !feed
      ? getChainlinkFeedByChainAndSymbol(tokenSymbol, chain)
      : !feed.startsWith('0x')
        ? undefined
        : feed;
    if (!feedAddress) return 0;

    const rpcUrl = getRpcUrlByChain(chain);
    if (!rpcUrl) return 0;

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const priceFeed = new ethers.Contract(feedAddress, CHAINLINK, provider);

    const [, answer] = await priceFeed.latestRoundData();
    const decimals = await priceFeed.decimals();

    return Number(ethers.formatUnits(answer, Number(decimals)));
  } catch (err) {
    console.error(`Error fetching Chainlink price for ${tokenSymbol} on ${chain}:`, err.message);
    return 0;
  }
}

async function dBalance(safeAddress, tokenAddress, tokenSymbol, chain, feedAddress) {
  try {
    const rpcUrl = getRpcUrlByChain(chain);
    if (!rpcUrl) {
      throw new Error(`Unsupported chain or missing RPC URL for: ${chain}`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const isNative =
      !tokenAddress ||
      tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
      tokenAddress === '0x0';

    let balanceData;

    if (isNative) {
      // Native gas token (ETH, BNB, etc.)
      const rawBalance = await provider.getBalance(safeAddress);
      balanceData = {
        balance: rawBalance,
        decimals: 18,
      };
    } else {
      // Standard ERC20 Token
      const contract = new ethers.Contract(tokenAddress, ERC20, provider);
      balanceData = await _getBalance(contract, safeAddress);
    }
    const priceResult = await fetchNgnPricePerAsset(undefined, chain);
    if (!balanceData || !priceResult?.status) {
      return {
        status: false,
        data: {
          formattedBalance: '0.00',
          ngnValue: '0.00',
        },
      };
    }
    const ngnPerUsd = Number(priceResult.data);
    const formattedBalance = Number(
      ethers.formatUnits(balanceData.balance, Number(balanceData.decimals))
    );
    const symbolUpper = tokenSymbol.trim().toUpperCase();
    let totalNgnValue = 0;

    if (['NGNS', 'CNGN'].includes(symbolUpper)) {
      totalNgnValue = formattedBalance;
    } else if (['USDT', 'USDC'].includes(symbolUpper)) {
      totalNgnValue = formattedBalance * ngnPerUsd;
    } else {
      const usdPrice = await fetchTokenUsdPrice(symbolUpper, chain, feedAddress);
      totalNgnValue = formattedBalance * Number(usdPrice) * ngnPerUsd;
    }

    return {
      status: true,
      data: {
        formattedBalance: formattedBalance.toFixed(4),
        ngnValue: Number(totalNgnValue.toFixed(2)), // Keep as Number so cumulative math (+=) works
      },
    };
  } catch (error) {
    console.error('Error calculating dBalance:', error.message);
    return {
      status: false,
      data: {
        formattedBalance: '0.00',
        ngnValue: 0,
      },
    };
  }
}

export { dBalance, _getBalance, _getDecimals, fetchTokenUsdPrice };
