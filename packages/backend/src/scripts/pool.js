const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii42@gmail.com";
const userSafeAddress = "0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";

// Lets work on POOL SECTION
// STARTING WITH DEPLOY POOL
// USER CLICKS ON DEPLOY POOL, PIN MODAL POPS UP
// INSIDE THE PIN MODAL, BELOW IT, ESTIMATE DEPLOY POOL FEE IS CALLED AND DISPLAYED WHILE USER IS INPUTTING PIN
// USER SHOULD NOT BE STOPPED FROM PROCEEDING EVEN IF FEE HASN'T BEEN FETCHED AND DISPLAYED
// THIS IS THE ESTIMATE ENDPOINT
// const estimatePoolDeploymentFee = await fetch(
//   `${BASE_URL}/api/user/estimate-deploy-pool-fee/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const estimatePoolDeploymentFeeData = await estimatePoolDeploymentFee.json();
// console.log(estimatePoolDeploymentFeeData);
// /**
//  * RETURNS THIS
//  * { status: true, data: { feeNGN: 3, feeUsd: 0.003 } }
//  */
// // SO THE FEE IN NAIRA(USD) IS DIPLAYED ON THE PIN MODAL -> 3#(0.003$)
// // THEN THE USER CLICKS ON PROCEED OR DEPLOY POOL AFTER INPUTTING PIN
// // THEN VERIFY PIN ENDPOINT IS CALLED TO VERIFY PIN
// // THIS IS THE ENDPOINT
// const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
// });
// const verifyPinData = await verifyPin.json();
// console.log(verifyPinData);

/**
 * RETURNS THIS
 * {
     success: true,
     privateKey: '0x508100c5998d8eb84a9d200f710baa4211cd2371b0fec92ff816863a98637dbe'
   }
 */

// ONCE SUCCESSFULLY RETURNS THE PRIVATE KEY, THEN DEPLOY POOL ENDPOINT IS CALLED
// THIS IS THE ENDPOINT
// const deployPool = await fetch(`${BASE_URL}/api/pool/deploy`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pin: verifyPinData.privateKey,
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });
// const deployPoolData = await deployPool.json();
// console.log(deployPoolData);
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * {
     status: true,
     poolAddress: '0x1Ef4b8231a1c610a55759A3027bb5925f673cFC1'
   }
 */
const poolAddress = "0x1b7Ba77cA1ba75Ec1E0E0138Fc60223066b86d51";
// Pool Address is then caches to local storage
// after SUCCESSFULL DEPLOYMENT, USER IS IMMEDIATELY ASKED IF THEY WANT TO GIVE A NAME TO THEIR POOL
// IF THE AGREE, DON'T REDIRECT TO LINK NAME TAB, DO THE LINKING IN THERE AND THEN, THE EXACTLY SAME FLOW LINK NAME TAB IS DOING
// INPUT NAME -> SELECT NAME SPACE/REGISTRY FROM DROP DOWN -> INPUT ADDRESS (BUT POOL ADDRESS WILL ALREADY BE PASTED) -> CHECK AVAILAIBILITY AND MAKE SURE ITS NOT A WHITELISTED NAME-> ENTER CONFIRM MODAL IS AVAILABLE (RETURNED ADDRESS(0))
// CONFIRM MODAL RUNS AND DISPLAYS SINGLETON FEE -> USER INPUTS PIN
// NOW THE ABOVE FLOW IS EXACTLY HOW LINK NAME TAB IS DOING IT.. BUT AFTER PUTTING PIN, THE ENPOINT CALL WILL BE DIFFERENT
// CALL VERIFYPIN AS USUAL const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
// THIS CALL THE POOL NAME LINK ENDPOINT
// const linkPoolAddress = await fetch(`${BASE_URL}/api/pool/nameAlias`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     name: "newpool.name", // from name input
//     poolAddress: poolAddress, // from cached
//     registry: "0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6", // from the selected registry
//     type: "link",
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });
// const linkPoolAddressData = await linkPoolAddress.json();
// console.log(linkPoolAddressData);
// I WILL NOT WARN AGAIN, THIS LINK POOL ADDRESS TO A NAME WILL DO EXACTLY THE SAME THING LINK NAME TAB IS DOING
// A FULL COPY
// THE ONLY DIFFERENT IS THE ENDPOINT TO CALL AFTER VERIFIYING PIN, WHICH IS THIS /api/pool/nameAlias
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true }
 */
// IF NOT SUCCESSFULL, TELL THE USER, BUT DON'T GIVE AN OPTION TO TRY AGAIN, THEY WILL DO IT FROM A LINK NAME BUTTON ATTACHED TO THAT POOL CARD

// AFTER THIS, THESE ENDPOINTS ARE CALLED TO GET EVERY INFO ON THE POOL SO THAT IT WILL BE DISPLAY ON THE SPECIFIC POOLS CARD
// FIRST CALL THIS USER ENDPOINT TO GET EVERY POOL OWNED BY THE USER
// const pools = await fetch(
//   `${BASE_URL}/api/pool/pools/${userSafeAddress}/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const poolsData = await pools.json();
// console.log(poolsData);
/**
 * RETURN THIS (Array of pools belonging to that user)
 * 
  status: true,
  pools: [
    {
      _id: '6a878e8f564696ca300e95dc',
      poolAddress: '0x659398396d9ec1a29c350dd08ea724dce4c1454f',
      ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      poolName: null,
      registryAddress: null
      __v: 0,
    },
    {
      _id: '6a8ba7f6146e87e24045b2b1',
      poolAddress: '0x1ef4b8231a1c610a55759a3027bb5925f673cfc1',
      ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      poolName: 'newpool.name@salva5',
      registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
      __v: 0
    }
  ]
}
 */

// THEN ANOTHER ENDPOINT IS CALLED TO GET POOL SUBSCRIPTION STATUS
// const poolSub = await fetch(
//   `${BASE_URL}/api/pool/subscription-status/${poolAddress}/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const poolSubData = await poolSub.json();
// console.log(poolSubData);
/**
 * RETURNS THIS IF POOL IS NOT SUBSCRIBED
 * { status: true, timeRemaining: 0, isSubscribed: false }
 *
 * RETURNS THIS IF SUBSCRIBED
 * { status: true, timeRemaining: 7567848636, isSubscribed: true }
 */

// IF ISSUBSCRIBED === FALSE ? UI SHOULD DISPLAY UNSUBSCRIBED, IF TRUE, UI SHOULD TAKE TIME REMAINING AND DISPLAY THE HUMAN READABLE TIME ON UI

// THE CURRENT UI IS OKAY, WE ARE JUST WORKING ON UPDATES AND API CHANGES
// OUTSIDE POOL CARD, FOR EACH POOL, THE IS MANAGE, LINK POOL ADDRESS TO NAME, DELETE POOL
// CURRENT ALLOWED TOKENS ARE NGNS, CNGN, USDC, USDT
// TO GET THE AVAILABLE LLIQUIDITY/BALANCE OF POOL FOR EACH TOKEN
// THIS ENDPOINT IS CALLED
// const balance = await fetch(
//   `${BASE_URL}/api/user/base/balance/${poolAddress}`, // ${BASE_URL}/api/user/bnb/balance/${poolAddress} for bnb
//   {
//     method: "GET",
//   },
// );
// const balanceData = await balance.json();
// console.log(balanceData);
/**
 * RETURNS THIS
 * POOL IS NEW, NO BALANCE
 * {
     ngnsBalance: '0.0',
     cNgnBalance: '0.0',
     usdtBalance: '0.0',
     usdcBalance: '0.0',
     santBalance: '0.0' <- DONT DISPLAY THIS
   }
 */
// THESE ABOVE DATA SHOULD BE USED TO NEATLY ARRANGE AND POPULATE ITS PART OF THE POOL CARD

// FOR RATE, THIS IS THE ENDPOINT TO CALL
// FOR BUY RATE (RATE TO GET ANY USD TOKENS WITH ANY NAIRA TOKENS IN NAIRA)
// FOR SELL RATE (RATE TO GET ANY NAIRA TOKENS WITH ANY USD TOKENS IN NAIRA)
// const rate = await fetch(
//   `${BASE_URL}/api/pool/rate/${poolAddress}/base`, // ${BASE_URL}/api/pool/rate/${poolAddress}/bnb for bnb(BNBDeployPool tab)
//   {
//     method: "GET",
//   },
// );
// const rateData = await rate.json();
// console.log(rateData);
/**
 * RETURNS
 * POOL IS NEW
 * { status: true, rate: { buyRate: '0.0', sellRate: '0.0' } }
 *
 * OR RATE IS SET
 * { status: true, rate: { buyRate: '1150.0', sellRate: '1600.0' } }
 */
// RATE IS DISPLAYED IN NGN (NAIRA)
// USERS ARE BUYING USD WITH NAIRA, SELLING USD FOR NAIRA

// UNLINKING POOL ADDRESS FROM NAME
// THIS WONT FOLLOW THE SAME FLOW AND LOGIC AS UNLINK IN THE LINK NAME TAB,
// USER IS WARNED, WHEN THEY PROCEED, VERIFY PIN MODAL OPENS, AND WHILE ITS OPEN FOR USER TO INPUT PIN
// ESTIMATE UNLINK FEE IS CALLED
const unlinkFee = await fetch(`${BASE_URL}/api/user/unlinkTxFee`, {
  method: "GET",
});
const unlinkFeeData = await unlinkFee.json();
console.log(unlinkFeeData);

/**
 * return this on success -> { fee: { status: true, data: { feeNGN: 25.308, feeUsd: 0.01 } } }
 * User can still click continue after putting their pin even if fee has not pin fetch
 */
// THEN USER CONTINUE, ONCE PIN IS VERIFIED, PROCEED TO CALL THE API FOR LINK
// TO GET THE REGISTRY ADDRESS
// THIS ENDPOINT
// const singlePool = await fetch(
//   `${BASE_URL}/api/pool/single-pool/${poolAddress}/base`, // ${BASE_URL}/api/pool/single-pool/${poolAddress}/bnb for bnb(BNBDeployPool tab)
//   {
//     method: "GET",
//   },
// );
// const singlePoolData = await singlePool.json();
// console.log(singlePoolData);
/**
 * {
    status: true,
     pool: {
       _id: '6a8ba7f6146e87e24045b2b1',
       poolAddress: '0x1ef4b8231a1c610a55759a3027bb5925f673cfc1',
       ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
       poolName: 'newpool.name@salva5',
       registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
      __v: 0
    }
}
 */

// THEN UNLINK IS CALLED
// const unlinkPoolAddress = await fetch(`${BASE_URL}/api/pool/nameAlias`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     name: "newpool.name@salva5", // from name, taken from cached display
//     poolAddress: poolAddress, // from cached
//     registry: singlePoolData.registryAddress, // from the fecthed single pool data
//     type: "unlink",
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });

// const unlinkPoolAddressData = await unlinkPoolAddress.json();
// console.log(unlinkPoolAddressData);

// RETURNS THIS WHEN SUCCESSFULL
// { status: true }

// THIS
// const pools = await fetch(
//   `${BASE_URL}/api/pool/pools/${userSafeAddress}/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const poolsData = await pools.json();
// console.log(poolsData);
/**
 * NOW RETURN THIS AFTER THE UNLINK
 * 
  status: true,
  pools: [
    {
      _id: '6a878e8f564696ca300e95dc',
      poolAddress: '0x659398396d9ec1a29c350dd08ea724dce4c1454f',
      ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      poolName: null,
      registryAddress: null
      __v: 0,
    },
    {
      _id: '6a8ba7f6146e87e24045b2b1',
      poolAddress: '0x1ef4b8231a1c610a55759a3027bb5925f673cfc1',
      ownerSafeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      poolName: null,
      registryAddress: null,
      __v: 0
    }
  ]
}
 */

// TO SUBSCRIBE FOR POOL DISPLAY IN THE SWAP MARKET PLACE
// UI display the subscription fee per month is 1500 NGN... and only accepts in months
// AS USUAL, USER INPUTS PIN TO VERIFY
// THIS IS THE CORRECT API
// const subscription = await fetch(`${BASE_URL}/api/pool/subscription`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress, // from cached
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//     type: "subscribe", // "renew" to reneew, "unsubscribe" to unsubscribe
//     interval: 1, // 1 for one month, 2 for two months, 5 for five months... users are at liberty to input their desired interval.
//   }),
// });

// const subscriptionData = await subscription.json();
// console.log(subscriptionData);
/**
 * RETURNS THIS WHEN SUCCESSFULL
 * { status: true, expiresAt: '2026-09-23T14:54:42.708Z' }
 */
// YOU COULD EITHER USE THIS TO UPDATE THE POOL CARD..
// OR CALL SUBSCRIPTION STATUS API TO DO SO
// const poolSub2 = await fetch(
//   `${BASE_URL}/api/pool/subscription-status/${poolAddress}/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const poolSub2Data = await poolSub2.json();
// console.log(poolSub2Data);
/**
 * RETURNS THIS
 * { status: true, timeRemaining: 2591846521, isSubscribed: true }
 */

// FOR DELETING POOL
// IF THERE IS A CACHED POOL NAME, MEANING THE POOL HAS A LINKED NAME
// THE USER IS ALERTED THAT THE POOL NAME WILL BE UNLINKED FROM THE ADDRESS
// USER AGREES, THEN INPUTS PINS, NO FEE ESTIMATE
// VERIFY PIN AND CALL DELETE API
// const deletePool = await fetch(`${BASE_URL}/api/pool/delete`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress, // from cached
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });

// const deleteData = await deletePool.json();
// console.log(deleteData);
/**
 * RETURNS THIS WHEN SUCCESSFUL
 * { status: true }
 */

// THEN POOLS ENDPOINT AND POOL SUBSCRIPTION ENDPOINT CAN BE CALLED TO UPDATE THE OEPLOY TAB

// NOTE: WHEN DISPLAYING POOL BALANCE FOR EACH TOKEN (NGNS, CNGN, USDC, USDT)
//       THE UI SHOULD DISPLAY THE TOKEN BALANCE SEPARATELY..
//       THEN AT THE TOP, THE UI SHOULD DISPLAY THE ACCUMULATION OF EACH TOKEN FAMILT SUMMED TOGETHER
//       NGNS + CNGN BALANCE SUMMED UP TO GET <BALANCE>NGN
//       USDC + USDT BALANCE SUMMED UP TO GET <BALANCE>USD
//       UI ALREADY DOES SOMETHING LIKE THIS, MAKE SURE IT'S DOING IT CORRECTLY
// FOR ADD AND REMOVE LIQUIDITY
// THE UI IS ALREADY DOING THIS WELL.. USER

// FOR PROVIDING/REMOVING LIQUIDITY
// USER SELECTS A TOKEN (NGNS, CNGN, USDC, USDT)
// INPUTS AMOUNT
// CLICKS ON PROVIDE LIQUIDITY OR REMOVE LIQUIDITY (DEPENDS ON WHAT THEY WANT TO DO)
// PIN MODAL OPEN, AND CALLS ESTIMATE FEE ENDPOINT
// USER SHOULD BE NOT STOP FROM CONTINUING AFTER PUTTING PIN, EVEN WHEN FEE HASN'T BEEN DISPLAYES
// const provideOrRemoveFee = await fetch(
//   `${BASE_URL}/api/user/estimate-provide-remove-liquidity-fee/base/provide`, // 'base' for DeployPool tab, 'bnb' for BNBDeployPool tab, 'provide' for Provide Liq, 'remove' for Remove Liq
//   {
//     method: "GET",
//   },
// );
// const provideOrRemoveFeeData = await provideOrRemoveFee.json();
// console.log(provideOrRemoveFeeData);
/**
 * RETURNS
 * { status: true, data: { feeNGN: 3, feeUsd: 0.003 } }
 */

// ONCE PIN IS VERIFIED
// CALL THE PROVIDE OR REMOVE ENDPOINT (SAME)
// const provideOrRemove = await fetch(`${BASE_URL}/api/pool/liquidity`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress, // from cached
//     asset: "NGNS", // SELECTED FROM UI
//     amount: "1", // RAW INPUT AS STRING, NOT PARSED, IF USER TYPES 100, PASS 100
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//     type: "remove", // 'provide' for Provide Liq, 'remove' for Remove Liq
//   }),
// });

// const provideOrRemoveData = await provideOrRemove.json();
// console.log(provideOrRemoveData);
/**
 * RETURNS THIS WHEN SUCCESSFULL
 * { status: true }
 */
// THEN /api/user/base/balance/${poolAddress} should be CALLED TO UPDATE POOL BALANCE ON UI
/**
 * WHICH RETURNS THIS
 *
 * {
     ngnsBalance: '5.0',
     cNgnBalance: '0.0',
     usdtBalance: '0.0',
     usdcBalance: '0.0',
     santBalance: '0.0' <- DONT DISPLAY THIS
   }
 */

// NOW FOR UPDATE RATE
// PRETTY EASY, THERE IS BUY RATE AND SELL RATE
// USER INPUT RATE (RAW)
// user clicks ON ANY, PIN MODAL POPS
// NO ESTIMATE FEE, JUST INPUT PIN
// AFTER INPUTTING PIN AND CONTINUING
// VERIFY PIN
// THEN CALL THE UPDATE RATE ENDPOINT

// const updateRate = await fetch(`${BASE_URL}/api/pool/update-rate`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress, // from cached
//     rate: "1200", // FROM INPUT
//     type: "buy", // 'buy' for buy rate, 'sell' for sell rate
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });

// const updateRateData = await updateRate.json();
// console.log(updateRateData);
/**
 * RETURNS THIS WHEN SUCCESSFULL
 * { status: true }
 */
// /api/pool/rate/${poolAddress}/base`, // ${BASE_URL}/api/pool/rate/${poolAddress}/bnb for bnb(BNBDeployPool tab)
// SHOULD BE CALL TO UPDATE THE RATE ON THE UI
/**
 * RETURNS
 * { status: true, rate: { buyRate: '1200.0', sellRate: '0.0' } }
 */

// NOW FOR UPDATE PAUSE STATUS (PAUSE AND UNPAUSE)
// SIMPLE TOO
// NO INPUT, JUST PAUSE AND UNPASE BUTTON
// USER CLICKS ANY
// PIN MODAL POPS
// NO ESTIMATE FEE
// USER INPUTS PIN
// VERIFY PIN
// CONTINUE WHEN SUCCESSFUL
// CALL THE UPDATE PAUSE STATE ENDPOINT
// const updatePauseState = await fetch(`${BASE_URL}/api/pool/update-state`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail, // from local storage
//     pkey: verifyPinData.privateKey,
//     poolAddress: poolAddress, // from cached
//     state: "unpause", // 'pause' for pause contract, 'unpause' for unpause contract
//     chain: "base", // chain = 'base' for DeployPool tab and 'bnb' for BNBDeployPool tab
//   }),
// });

// const updatePauseStateData = await updatePauseState.json();
// console.log(updatePauseStateData);
/**
 * RETURNS THIS WHEN SUCCESSFULL
 * { status: true }
 */

// THEN UI SHOULD DISPLAY STATE OF POOL ON THE POOL CARD, TP SIGNAL THAT THIS POOL IS PAUSED OR ACTIVE
// THIS IS THE ENDPOINT TO CALL
// const poolISPaused = await fetch(
//   `${BASE_URL}/api/pool/isPaused/${poolAddress}/base`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
//   {
//     method: "GET",
//   },
// );
// const poolISPausedData = await poolISPaused.json();
// console.log(poolISPausedData);
/**
 * RETURNS THIS WHEN SUCCESSFULL AND POOL IS PAUSED
 * { status: true, isPaused: true }
 *
 * RETURNS THIS WHEN SUCCESSFULL AND POOL IS NOT PAUSED
 * { status: true, isPaused: false }
 */

// SO THIS IS IT FOR THE POOL SECTION
// THE UI IS ALREADY DOING WELL, JUST UPDATE ENDPOINT AND STORY
// SET MINIMUM NGN AND MINIMUM USD IS NOW DEPRECIATED, REMOVE IT FROM ANY WHERE
// GET TO WORK AND MAKE THIS PROFESSIONAL AND UI SHOULD BE AESTHETICALLY PLEASING AND SHOULD BE BEAUTIFULLY RESPONSIVE ACCROSS ALL SCREEN SIZES

const pools = await fetch(
  `${BASE_URL}/api/pool/all-pools/bnb`, // chain should be 'base' on DeployPool tab and 'bnb' on BNBDeployPool tab
  {
    method: "GET",
  },
);
const poolsData = await pools.json();
console.log(poolsData);