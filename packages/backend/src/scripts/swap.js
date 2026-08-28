const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii42@gmail.com";
const userSafeAddress = "0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";

// NOW LETS WORK ON THE SWAP TAB AND BNB SWAP TAB..
// LOOKING AT THE DASHBOARD('s), YOU'LL SEE THAT THE SWAP TABs IS THE FIRST TAB, AND THEREFORE SHOULD LOAD UP WITH THE RESTOF THE DASHBOARD THAT LOADS ON FIRST ENTRANCE OR REFRESH
// IN THE SWAP TAB, THERE ARE 2 SECTIONS, BUY SECTION AND SELL SECTION
// WE FIRST FETCH ALL POOL (SUBSCRIBED POOLS) BY CALLING THIS ENDPOINT
const pools = await fetch(`${BASE_URL}/api/pool/all-pools/bnb`, {
  // the param = 'base' for Swap tab, and 'bnb' for BNB Swap Tab, using bnb for test example
  method: "GET",
});

const poolsData = await pools.json();
// console.log(poolsData);

/**
 * RETURN AN ARRAY OF POOLS
 * {
  status: true,
  pools: [
    {
      _id: '6a8ccb0bded18b46cca312be',
      poolAddress: '0xe5c25818e8009c8baf787224425800d08709c70a',
      ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      poolName: 'bnb.pool2@salva5',
      registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
      __v: 0
    }
  ]
}
 */
// THERE ARE UP TO 7 POOL, BUT THIS CALL RETURNS ONLY ONE BECAUSE THE LOGIC IS THAT,
// A POOL CAN BE DISPLAYED AUTOMATICALLY ON THE MARKET PLACE IF
// 1. ITS SUBSCRIBED, 2. HAS SET RATE(BUY OR SELL), 3. HAS BALANCE ON ANY OF THE FOUR TOKENS (NGNS, CNGN, USDT, USDC), 4. IS NOT PAUSED
// ALL FOR MUST BE TRUE..
// SO THAT'S THE ONLY POOL THAT MEETS PASSES..

// NOW, THE UI ALREADY ARRANGES THE POOL CARD WELL
// THE CARD SHOULD DISPLAY -
// POOL NAME(from pool.poolName, if any), POOL ADDRESS(from pool.poolAddress), USDT USDC NGNS CNGN BALANCES (display token symbols and balances that are greater than 0), and BUY AND SELL RATE(display rates that are greater than 0)
// THESE ARE THE ENDPOINTS TO CALL FOR EACH POOL TO DISPLAY THE BALANCE AND RATE DETAILS ABOUT EACH POOL

const balances = await fetch(
  `${BASE_URL}/api/user/bnb/balance/${poolsData.pools[0].poolAddress}`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);

const balancesData = await balances.json();
// console.log(balancesData);
/**
 * RETURNS SOMETHING LIKE THIS
 * {
  ngnsBalance: '6047.415',
  cNgnBalance: '0.0',
  usdtBalance: '0.0001',
  usdcBalance: '45.001101',
  santBalance: null <- THIS IS NOT INCLUDED
}

NOW YOU SEE THAT NGNS, USDT AND USDC HAVE BALANCES > 0... THEREFORE THESE ARE THE ONLY TOKEN SYMBOLS AND BALANCE THAT THE UI SHOULD DISPLAY
DISPLAY THE WAY IT IS
*/
// AS FOR THE RATES

const rates = await fetch(
  `${BASE_URL}/api/pool/rate/${poolsData.pools[0].poolAddress}/bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);

const ratesData = await rates.json();
// console.log(ratesData);
/**
 * RETURNS THIS
 * { status: true, rate: { buyRate: '1200.0', sellRate: '1350.0' } }
 */

// NOW, THIS IS THE ARRANGEMENT
// IF THE POOL HAS AT LEAST USDC OR USDT BALANCE, IT SHOULD BE IN THE BUY SECTION, AND BUY RATE SHOULD BE DISPLAYED THERE
// IF THE POOL HAS AT LEAST NGNS OR CNGN BALANCE, IT SHOULD BE IN THE SELL SECTION, AND SELL RATE SHOULD BE DISPLAYED THERE
// WHICH MEANS IF THE POOL HAS BOTH (USDC || USDT) && (NGNS || CNGN), THE POOL WILL AUTOMATICALLY BE ON BOTH BUY AND SELL SECTION

// NOW, ON THE SEARCH BAR..
// IF A POOL IS NOT SUBSCRIBED, THAT DOESN'T MEAN THAT PEOPLE CANNOT SEARCH FOR THE POOL
// SUBSCRIPTION ONLY MAKES YOU POOL VISIBLE AUTOMACTICALLY, IF YOU DONT SUBSCRIBE, PEOPLE CAN STILL FIND IT BUT SEARCHING
// BUT IT MUST HAVE BALANCE, SET RATE AND IS NOT PAUSED
// SO THE SEARCH BAR TAKES 2 TYPE OF INPUT, AND ADDRESS OR A FULL SNS NAME (cbo@salva).. name must be full (includes '@')..
// IF THE INPUT IS A FULL NAME, THEN THE FRONTEND DOES THE SEACH IN THIS ORDER
// RESOLVE TO ADDRESS FIRST, FORST GET THE REGISTRY ADDRESS ASSOCIATED WITH THAT NAME

// AND LEAST I FORGET,
// IN BUY SECTION, POOLS ARE DISPLAYED FROM TOP TO BOTTOM USING THE POOLS WITH CHEAPEST BUY RATES
// IN SELL SECTION, POOLS ARE DISPLAYED FROM TOP TO BOTTOM USING THE POOLS WITH HIGHER SELL RATES

const name = "bnb.pool2@salva5"; // from input
const start = name.indexOf("@");
const nspace = name.slice(start);

const registry = await fetch(
  `${BASE_URL}/api/registry/findByNamespace/${nspace}`,
  {
    method: "GET",
  },
);
const registryData = await registry.json();
//console.log(registryData);
/**
 * RETURNS SOMETHING LIKE 
 * {
     _id: '6a809c42eb197ccfc5734cba',
     name: 'Salva Wallet 5',
     nspace: '@salva5',
     registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
     description: '',
     active: true,
     createdAt: '2026-08-15T17:05:06.123Z',
     __v: 0
   }
 */
// THEN RESOLVE
const poolNameToAddress = await fetch(
  `${BASE_URL}/api/name/isAvail/${name}/${registryData.registryAddress}`,
  {
    method: "GET",
  },
);
const poolNameToAddressData = await poolNameToAddress.json();
//console.log(poolNameToAddressData);
/**
 * RETURNS THIS (THE POOL ADDRESS)
 * { status: true, address: '0xe5c25818e8009c8baf787224425800d08709c70a' }
 */

// THEN FIND THE POOL
const sPool = await fetch(
  `${BASE_URL}/api/user/swap/single-pool/${poolNameToAddressData.address}/bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const sPoolData = await sPool.json();
//console.log(sPoolData);
/**
 * RETURNS THIS WHEN SUCCESSFUL AND POOL IS A READY POOL
 * {
  status: true,
  pool: {
    _id: '6a8ccb0bded18b46cca312be',
    poolAddress: '0xe5c25818e8009c8baf787224425800d08709c70a',
    ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
    poolName: 'bnb.pool2@salva5',
    registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
    __v: 0
  }
}
  THEN THE UI SHOULD ARRANGE IT ACCORDING TO HOW I STATED ABOVE
  // IF THE POOL HAS AT LEAST USDC OR USDT BALANCE, IT SHOULD BE IN THE BUY SECTION, AND BUY RATE SHOULD BE DISPLAYED THERE
// IF THE POOL HAS AT LEAST NGNS OR CNGN BALANCE, IT SHOULD BE IN THE SELL SECTION, AND SELL RATE SHOULD BE DISPLAYED THERE
// WHICH MEANS IF THE POOL HAS BOTH (USDC || USDT) && (NGNS || CNGN), THE POOL WILL AUTOMATICALLY BE ON BOTH BUY AND SELL SECTION
 */

const poolAddress = "0xe5c25818e8009c8baf787224425800d08709c70a";
// NOW, IF SEARCH INPUT IS JUST AN ADDRESS, NO NEED TO RESOLVE, JUST FIND POOL /api/user/swap/single-pool/ AND DISPLAY

// NOW, ENTERING PROCEED TO SWAP
// NOW, THERE IS EXACT OUTPUT AND EXACT INPUT
// FOR THE BUY SECTION, EXACT OUTPUT IS ANY USD TOKEN (USDT, USDC), EXACT INPUT IS ANY NGN TOKEN (NGNS, CNGN)
// FOR THE SELL SECTION, EXACT OUTPUT IS ANY NGN TOKEN (NGNS, CNGN), EXACT INPUT IS ANY USD TOKEN (USDT, USDC)
// TO GET EXACT OUTPUT, USER SELECT OUTPUT TOKEN, AND INPUT TOKEN
// THEN WHEN THE INPUT AMOUNT, THIS ENDPOINT IS CALLED
// USER SELECT USDC as tokenOut
const tokenOut = "USDC";
//USER SELECTS NGNS as tokenIn
const tokenIn = "NGNS";
const amountIn = "1"; // USER INPUTS 1 NGNS
// await fetch(`${BASE_URL}/api/pool/rate/${poolAddress}/bnb` is called to fetch the rate
// WE ARE IN THE BUY SECTION, SO WE ARE GETTING BUY RATE
const amount = await fetch(
  `${BASE_URL}/api/user/swap/amount-Out?poolAddress=${poolAddress}&tokenOut=${tokenOut}&tokenIn${tokenIn}&amount=${amountIn}&rate=${ratesData.rate.buyRate}&chain=bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const amountOut = await amount.json();
//console.log(amountOut);
/**
 * RETURNS THIS
 * { status: true, amountOut: 0.000833 }
 * BECAUSE RATE IS 1200 NGN PER USD, 1 NGNS INPUT = 0.00833 USDC OUTPUT
 * THE UI SHOULD THEN DISPLAY THAT OUTPUT
 * NOTE: IF USER BALANCE IS LESS THAN INPUT, IT SHOULD SHOW RED, AND USER CAN'T PROCEED, CALCULATION CAN STILL RUN
 *       THE UI ALREADY DOES THIS WELL.. 
 *       BUT DON'T FORGET, BALANCE FETCH USING - /api/user/bnb/balance/${poolsData.pools[0].poolAddress}`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
 *       WHICH RETURN SOMETHING LIKE 
 *       {
            ngnsBalance: '6047.415',
            cNgnBalance: '0.0',
            usdtBalance: '0.0001',
            usdcBalance: '45.001101',
            santBalance: null <- THIS IS NOT INCLUDED
        }
        IF INPUT IS NGNS - ngnsBalance, IF CNGN - cNgnBalance
        THE UI ALREADY DISPLAYS BALANCES OF USER AND POOL WELL, I AM JUST SHOWING YOU THE NEW ENDPOINT TO CALL FOR BALANCES

        ALSO, IF POOL BALANCE IS LESS THAN OUTPUT, DISPLAY RED TOO, UI ALREADY DOES THIS WELL
 */

// FOR EXACT INPUT
// USER SELECT USDC as tokenOut
const tokenOut2 = "USDC";
const usdToken = tokenOut2; // THE TOKEN CONTRACT WANTS OUT(SELECTED)
//USER SELECTS NGNS as tokenIn
const tokenIn2 = "NGNS";
const amountOut2 = "1"; // USER INPUTS 1 USDC AS HOW MUCH THEY WANT OUT, SO THEY NEED TO KNOW HOW MUCH THE SHOULD PUT IN
// await fetch(`${BASE_URL}/api/pool/rate/${poolAddress}/bnb` is called to fetch the rate
// WE ARE IN THE BUY SECTION, SO WE ARE GETTING BUY RATE
const amount2 = await fetch(
  `${BASE_URL}/api/user/swap/amount-In?poolAddress=${poolAddress}&usdToken=${usdToken}&inToken=${tokenIn2}&outToken=${tokenOut2}&outAmount=${amountOut2}&rate=${ratesData.rate.buyRate}&chain=bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const amountIn2 = await amount2.json();
//console.log(amountIn2);
/**
 * RETURNS THIS
 * { status: true, amountIn: 1200 }
 * BECAUSE RATE IS 1200 NGN PER USD, 1 USDC OUTPUT =  1200 NGNS INPUT
 * THE UI SHOULD THEN DISPLAY THAT AS INPUT
 */

// ANOTHER SCENARIO FOR EXACT INPUT
// USER SELECT NGNS as tokenOut
const tokenOut3 = "NGNS";
//USER SELECTS USDC as tokenIn
const tokenIn3 = "USDC";
const usdToken2 = tokenIn3; // THE TOKEN CONTRACT WANTS IN(SELECTED)

const amountOut3 = "1200"; // USER INPUTS 1200 NGNS AS HOW MUCH THEY WANT OUT, SO THEY NEED TO KNOW HOW MUCH USDC THE SHOULD PUT IN
// await fetch(`${BASE_URL}/api/pool/rate/${poolAddress}/bnb` is called to fetch the rate
// WE ARE IN THE BUY SECTION, SO WE ARE GETTING BUY RATE
const amount3 = await fetch(
  `${BASE_URL}/api/user/swap/amount-In?poolAddress=${poolAddress}&usdToken=${usdToken2}&inToken=${tokenIn3}&outToken=${tokenOut3}&outAmount=${amountOut3}&rate=${ratesData.rate.buyRate}&chain=bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const amountIn3 = await amount3.json();
//console.log(amountIn3);
/**
 * RETURNS THIS
 * { status: true, amountIn: 1 }
 * BECAUSE RATE IS 1200 NGN PER USD, 1200 NGNS OUTPUT =  1 USDC INPUT
 */

// ALL THESE APPLYS TO THE SELL SECTION, THE ONLY DIFFERENCE IS THE RATE, BUY RATE FOR BUY SECTION, SELL SECTION FOR SELL RATE

// NOW, FURTHER DOWN THE PROCEED TO SWAP CARD, THE DEFAULT RECEIVER IS THE USERS SAFE ADDRESS,
// BUT IT CAN TAKE FULL NAME INPUT OR ADDRESS INPUT, IF FULL NAME(MUST INCLUDE '@'), THEN RESOLVE IS CALLED ASAP (THE SAME WAY I EXPLAINED ABOVE) AND THE ADDRESS PREVIEW IS DISPLAY BELOW THE INPUT CARD
// IF IT'S NOT RESOLVED, USER CANNOT PROCEED
// IF NAME RESOLVED TO ADDRESS(0), OR WASN'T SUCCESSFUL, THE INPUT BOX SHOULD BE RED AND USER WARNED AND CANNOT PROCEED
// THE PREVIEWED ADDRESS WILL BE PASSED INTO THE SWAP PARAM AS RECEIVER

// IF ADDRESS, USE IT

// THERE IS A PLACE AT THE TOP OF THE PROCEED TO SWAP CARD THAT DISPLAYS IF USER HAS TRUSTED THE POOL ON A PARTICULAR TOKEN
// LETS SAYS USER SELETS NGNS AS INPUT TOKEN, AN ENDPOINT IS CALLED WITH THE USERS SAFE ADDRESS, THE POOLADDRESS, SELECTED TOKEN AND CHAIN, TO CHECK IF THE PERSON HAS TRUSTED THE POOL
// WHICH MEANS, TRUSTING IS ONLY BASED ON INPUT - /swap/isTrusted/:safeAddress/:poolAddress/:tokenIn/:chain
// THIS IS THE ENDPOINT TO CALL
const InputToken = "NGNS";
const isTrusted = await fetch(
  `${BASE_URL}/api/user/swap/isTrusted/${userSafeAddress}/${poolAddress}/${InputToken}/bnb`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const isTrustedData = await isTrusted.json();
console.log(isTrustedData);
/**
 * RETURN THIS IF TRUSTED
 * { status: true, isTrusted: true }
 * THEN UI DISPLAYS IT AS APPROVED AT THE TOP OF THE CARD FOR ANY INPUT TOKEN SELECTED
 * EVERY TOKEN INPUT SELECTED HAS IT'S OWN IS TRUSTED FETCH
 * THEN RETURNS THIS IF NOT TRUSTED
 * { status: true, isTrusted: false }
 * IF FALSE, THEN DON'T DISPLAY ANYTHING AT THE TOP
 */

// THEN USER PROCEEDS TO THE NEXT PAGE
// WHICH IS - IF THE POOL IS TRUSTED FOR THE INPUT TOKEN, PIN MODAL
// IF THE POOL IS NOT TRUSTED, TRUST POOL MODAL SPINS UP, ASKING USER TO EITHER TRUST POOL AND TELLS THAT TRUSTING THE POOL IS RISKY IF THEY DON'T KNOW THE POOL, BUT REDUCES NETWORK FEE COST
// OR DON'T TRUST POOL, TELLING USER THAT NOT TRUSTING POOL IS RECOMMENDED

// ONCE USER CHOOSES ANY, TRUST OR DON'T TRUST, ENTER PIN MODAL
// WHICH RUNS ESTIMATE SWAP FEE AT THE BOTTOM OF THE AS THEY ARE INPUTTING THEIR PIN, THEY SHOULD NOT BE STOPPING FOR EXECUTING SWAP EVEN IF FEE ESTIMATE HASN'T YET RETURNED ANYTHING
const estimateSwapFee = await fetch(
  `${BASE_URL}/api/user/swap/estimate-swap-fee/bnb/${isTrustedData.isTrusted}`, // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
  {
    method: "GET",
  },
);
const estimateSwapFeeData = await estimateSwapFee.json();
//console.log(estimateSwapFeeData);
/**
 * RETURNS THIS WHEN SUCCESSFULL
 * { status: true, fee: { feeNGN: 3, feeUsd: 0.003 } }
 *
 * WHICH DISPLAYS THE FEE IN UI - 3NGN(0.003USD)
 */

// THEN VERIFY PIN
// THIS IS THE ENDPOINT
const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
//console.log(verifyPinData);

/**
 * RETURN WHEN VERIFIED
 * {
     success: true,
     privateKey: '0x508100c5998d8eb84a9d200f710baa4211cd2371b0fec92ff816863a98637dbe'
    }
 */
// THEN EXECUTE SWAP
// NOW LET US SWAP EXACT NGN FOR USD (BUYING USDC WITH NGNS)
// This is the type
// const exactNgnForUsd = "swapExactNGNAmountForUSD";
// NGN AMOUNT WE WANT TO SEND TO THE POOL
// const ngnAmount = "1"; // from users input, raw string
// const swap1 = await fetch(`${BASE_URL}/api/user/swap/execute-swap`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail,
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress,
//     receiver: userSafeAddress,
//     usdToken: "USDC",
//     ngnToken: "NGNS",
//     amount: ngnAmount,
//     chain: "bnb", // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
//     trustPool: false, // if user selects trust pool, pass true, if user selects dont trust pool, input false, if user has trusted pool previously, input false
//     type: exactNgnForUsd,
//   }),
// });
// const swap1Data = await swap1.json();
// console.log(swap1Data);
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true, receipt: {
        _type: 'TransactionReceipt',
        blockHash: '0x605aa72ccd1894366daf700570bdb04f0c6189f781f4ccfc8c791fec7780c6cd',
        blockNumber: 127554171.... }
    }
 */

// // NOW LET US SWAP EXACT USD FOR NGN (SELLING USDT FOR NGNS)
// // This is the type
// const exactUsdForNgn = "swapExactUSDAmountForNGN";
// // USD AMOUNT WE WANT TO SEND TO THE POOL
// const usdAmount = "0.0001"; // from users input, raw string
// const swap2 = await fetch(`${BASE_URL}/api/user/swap/execute-swap`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail,
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress,
//     receiver: userSafeAddress,
//     usdToken: "USDT",
//     ngnToken: "NGNS",
//     amount: usdAmount,
//     chain: "bnb", // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
//     trustPool: false, // if user selects trust pool, pass true, if user selects dont trust pool, input false, if user has trusted pool previously, input false
//     type: exactUsdForNgn,
//   }),
// });
// const swap2Data = await swap2.json();
// console.log(swap2Data);
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true, receipt: {
        type: 'TransactionReceipt',
        blockHash: '0x004e13e3292394490dfe13ba2b354701ce83c5e414a9a5bc3b005ed516969a6c',
        blockNumber: 127555560,.... }
    }
 */

// NOW LET US SWAP FOR EXACT USD (BUYING USDC WITH NGNS)
// THIS IS WHERE USER USER INPUTS AN OUTPUT, SWAPPING FROM EXACT OUPUT
// This is the type
// const exactUsd = "swapForExactUSDAmount";
// // USD AMOUNT WE WANT TO RECEIVE FROM THE POOL
// const usdAmount = "0.0001"; // from users input, raw string, (the output the want)
// const swap3 = await fetch(`${BASE_URL}/api/user/swap/execute-swap`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail,
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress,
//     receiver: userSafeAddress,
//     usdToken: "USDC",
//     ngnToken: "NGNS",
//     amount: usdAmount,
//     chain: "bnb", // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
//     trustPool: false, // if user selects trust pool, pass true, if user selects dont trust pool, input false, if user has trusted pool previously, input false
//     type: exactUsd,
//   }),
// });
// const swap3Data = await swap3.json();
// console.log(swap3Data);
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true, receipt: {
        _type: 'TransactionReceipt',
        blockHash: '0xc88fe1723f998361b254861f8522a2941b806e0c061402fb2e41284e68dd2779',
        blockNumber: 127557000,.... }
    }
 */

// NOW LET US SWAP FOR EXACT NGN (SELLING USDT FOR NGNS)
// THIS IS WHERE USER USER INPUTS AN OUTPUT, SWAPPING FROM EXACT OUTPUT
// This is the type
const exactNgn = "swapForExactNGNAmount";
// NGN AMOUNT WE WANT TO RECEIVE FROM THE POOL
const ngnAmount = "1200"; // from users input, raw string, (the output the want)
const swap4 = await fetch(`${BASE_URL}/api/user/swap/execute-swap`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    pkey: verifyPinData.privateKey,
    poolAddress: poolAddress,
    receiver: userSafeAddress,
    usdToken: "USDT",
    ngnToken: "NGNS",
    amount: ngnAmount,
    chain: "bnb", // THE 'bnb' in this endpoint is for BNB swap tab, for Swap tab, its 'base'
    trustPool: false, // if user selects trust pool, pass true, if user selects dont trust pool, input false, if user has trusted pool previously, input false
    type: exactNgn,
  }),
});
const swap4Data = await swap4.json();
console.log(swap4Data);

/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true, receipt: {
        _type: 'TransactionReceipt',
        blockHash: '0x0b9e3076dbe35ebc1520f214866baef06b32d22a8a57782fcb27e76eb976d803',
        blockNumber: 127558182,.... }
    }
 */


// AND THAT'S IT
// SWAP DONE..
// MINIMUM USD OR NGN LOGIC IS DEPRECIATED
// THE UI IS ALREADY DISPLAY WELL, JUST UPDATE ENDPOINTS, AND NEW LOGIC IMPLEMENTATION LOGIC WHERE NEEDED
// AND MAKE THIS UI AESTHETICALLY PLEASING
// DONT MESS UP