import { ethers } from 'ethers';
import { keyValue, mode } from '../utils/vars.js';
import { NGN_ORACLE } from './abi.js';
import { getRpcUrlByChain, getNgnOracleAddressByChain } from './rpcUrls.js';

const exRateKey1 = process.env.EXCHANGE_RATE_API_KEY;
const exRateKey2 = process.env.EXCHANGE_RATE_API_KEY2;

const keys = [exRateKey1, exRateKey2];
const base = 'ngn';
const quote = 'usd';

async function fetchRateFrank() {
  try {
    const quote_ = await fetch(`https://api.frankfurter.dev/v2/rate/${quote}/${base}`);
    const rateData = await quote_.json();
    return { status: true, data: 1 / rateData.rate };
  } catch (err) {
    console.error(`NGN Rate fetch error - ${err.message}`);
    return {
      status: false,
      data: `⚠️ Fetch Rate Error:  Quota exhausted or ${err.message}`,
    };
  }
}

async function fetchRateEx() {
  try {
    for (let i = 0; i < keys.length; i++) {
      const quote = await fetch(`https://v6.exchangerate-api.com/v6/${keys[i]}/quota`);

      const quoteData = await quote.json();
      console.log(`KEY${i} Quote Remaining: ${quoteData.requests_remaining}`);
      if (quoteData.requests_remaining > 0) {
        const fetchRate = await fetch(`https://v6.exchangerate-api.com/v6/${keys[i]}/pair/USD/NGN`);
        const rateData = await fetchRate.json();
        return {
          status: true,
          data: 1 / rateData.conversion_rate,
        };
      }
    }
  } catch (err) {
    console.error(`NGN Rate fetch error - ${err.message}`);
    return {
      status: false,
      data: `⚠️ Fetch Rate Error:  Quota exhausted or ${err.message}`,
    };
  }
}

async function fetchNgnPricePerAsset(asset, chain) {
  try {
    const oracle = getNgnOracleAddressByChain(chain);
    const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
    const contract = new ethers.Contract(oracle, NGN_ORACLE, provider);
    const p = asset
      ? await contract.getAssetPricePerNgn(asset)
      : await contract.getUsdPricePerNgn();
    const dec = await contract.decimals();
    const formatted = ethers.formatUnits(p.price, Number(dec));
    console.log(formatted);
    return { status: true, data: 1 / Number(formatted) };
  } catch (err) {
    console.error('FETCH PRICE ERROR: ', err.message);
    return { status: false, data: 0 };
  }
}

export { fetchRateEx, fetchRateFrank, fetchNgnPricePerAsset };
