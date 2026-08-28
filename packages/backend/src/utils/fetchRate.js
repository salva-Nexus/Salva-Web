import express from "express";

const exRateKey1 = process.env.EXCHANGE_RATE_API_KEY;
const exRateKey2 = process.env.EXCHANGE_RATE_API_KEY2;

const keys = [exRateKey1, exRateKey2];

async function fetchRate() {
  let rate = 0;
  try {
    for (let i = 0; i < keys.length; i++) {
      const quote = await fetch(
        `https://v6.exchangerate-api.com/v6/${keys[i]}/quota`,
      );

      const quoteData = await quote.json();
      console.log(`KEY${i} Quote Remaining: ${quoteData.requests_remaining}`);
      if (quoteData.requests_remaining > 0) {
        const fetchRate = await fetch(
          `https://v6.exchangerate-api.com/v6/${keys[i]}/pair/USD/NGN`,
        );
        const rateData = await fetchRate.json();
        return {
          status: true,
          data: rateData.conversion_rate,
        };
        break;
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

export default fetchRate;
