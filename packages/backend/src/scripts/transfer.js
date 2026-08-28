const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";
const testEmail = "charlieonyii@gmail.com";
const testUsername = "cboi";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";
const userSafeAddress = "0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6"; // same on base and bnb
const ngnsToSend = "2"; // sending 2 NGNS
const receipientAddress = "0x9Da6C69815A2b9FFe7eE08A0be00EF181881Ad71"; // 20000

// Transfer Flow, on both BNB and Base chain

// UI opens transfer card
// recipient input should be flexible to take name/fullname/address - the current code already does this fine
// if fullname, eg name@namespace, or address, no  need to bring out wallet registry dropdown - this is already working well
// if just name (name without '@'), registry dropdown shows for them to select a registry

// LET US START BY DOING THIS ON BASE CHAIN
// AND SEDNING NGNS

// FIRST PART - Input is an address (no registry dropdown, no resolve)
// 1. Balance is displayed under each coin selection
const balance = await fetch(
  `${BASE_URL}/api/user/base/balance/${userSafeAddress}`, // ${BASE_URL}/api/user/bnb/balance/${userSafeAddress} for bnb
  {
    method: "GET",
  },
);
const balanceData = await balance.json();
console.log(balanceData);
if (!balance) process.exit(1);
/**
 * returns something like:
 * balance on base:
 * {
     ngnsBalance: '2.0',
     cNgnBalance: '0.0',
     usdtBalance: '2.0',
     usdcBalance: '2.0'
    }
    balance on bnb:
    {
      ngnsBalance: '2.0',
      cNgnBalance: '2.0',
      usdtBalance: '2.0',
      usdcBalance: '2.0'
    }
Which then displays then accordingly under each coin selection
 */

// 2. As user is inputting amount, etimate fee is called for display on UI
const estimateFee = await fetch(
  `${BASE_URL}/api/user/transfer/estimate-fee?chain=base&coin=NGNS` /**coin will be based on senders selection */,
  {
    method: "GET",
  },
);
const feeData = await estimateFee.json();
console.log(feeData);
if (!estimateFee) process.exit(1);

/**
 * Returns something like this
 * NAIRA DENOMINATED TOKEN: 
 * NGNS or CNGN - base
 *  {
      chain: 'base',
      coin: 'NGNS',
      feeNGN: 4.076,
      feeUsd: 0.003,
      feeWei: '4076000'
    }
    NGNS or CNGN - bnb
    {
      chain: 'bnb',
      coin: 'CNGN',
      feeNGN: 17.936,
      feeUsd: 0.014,
      feeWei: '17936000'
    }
    
    USD DENOMINATED TOKEN:
    USDC or USDT - base
    {
      chain: 'base',
      coin: 'USDC',
      feeNGN: 4.076,
      feeUsd: 0.003,
      feeWei: '3000'
    }
    USDC or USDT - bnb
    {
      chain: 'base',
      coin: 'USDT',
      feeNGN: 4.076,
      feeUsd: 0.003,
      feeWei: '3000'
    }
 */
// Sibling structure
// NAIRA COINS          USD COINS
//    __|__              __|__
//   |     |            |     |
//  NGNS  CNGN         USDC  USDT
// If users Balance for selected token < amount + estimated fee, no stopping yet,
// if users balance of selected token sibling < estimated fee, user cannot proceed
// The backend is smart enough to take the fee from any token and it'sibling
// in summary, if users balance of token < amount + estimated fee and balance of token sibling < estimate fee - cannot proceed, insufficient balance for fee
// and if amount > balance of selected token, insufficient balance too
// sibling token is only used for fee if balance of selected token < amount + estimated fee
// if fee is not sucessfully fetched, user can still continue, backend revert if the fee collection fails
// confirm modal displays recipeints address, amount, and fee, already doing that well

// 3. After confirmation model, pin is requested and user inputs pin to decrypt pkey, if invalid or corrupt pin, display that
const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
console.log(verifyPinData);
if (!verifyPin) process.exit(1);

/**
 * Return this if successful
 * {
      success: true,
      privateKey: '0x508100c5998d8eb84a9d200f710baa4211cd2371b0fec92ff816863a98637dbe'
    }
    Return this if not successful
    {
      success: false,
      message: 'Invalid PIN or Error: PIN must be exactly 4 digits'
    }
 */

// // 3. Perform transfer
// const transferTo0xAddress = await fetch(
//   `${BASE_URL}/api/user/transfer`,
//   {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({
//       email: testEmail,
//       userPrivateKey: verifyPinData.privateKey,
//       safeAddress: userSafeAddress, // gotten from local storage i guess
//       toAddress: receipientAddress, // from input, cus this particular simulation is for address input
//       amount: ngnsToSend,
//       coin: "NGNS", // from coin selection (selected coin)
//       chain: "base", // hardcoded 'base' on Dashboard.jsx, hardcoded 'bnb' on BNBDashboard.jsx
//     }),
//   },
// );
// const transferTo0xAddressData = await transferTo0xAddress.json();
// console.log(transferTo0xAddressData);
// if (!transferTo0xAddress) process.exit(1);
// /**
//  * Returns this if successful
//  *status: true,
//   data: {
//     txHash: '0x84ab2095a8e6c87a07936c25cfccf4c60ff5ff85e96695a1328ecdd9ca29c398',
//     receipt: {
//       _type: 'TransactionReceipt',
//       blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
//       blockNumber: 45521651,
//       contractAddress: null,
//       cumulativeGasUsed: '702906',
//       from: '0xfD5A9828bac27495FAb7F6174b3de386E0554187',
//       gasPrice: '6000000',
//       blobGasUsed: '133800',
//       blobGasPrice: null,
//       gasUsed: '112813',
//       hash: '0x84ab2095a8e6c87a07936c25cfccf4c60ff5ff85e96695a1328ecdd9ca29c398',
//       index: 11,
//       logs: [Array],
//       logsBloom: '0x00008000400000000000000000000000000000000000000000000000040000000000000000000000000000000000000000400000000020000000000000000800001000000000104000000008000000000000040000000000000000000000000000000000000000000004000000000000000008000000000000004010000000000010000800000200000000020000000000000000000000000000000000000000000000000400000000000000000004000000040000000000000000000020000000000002000000000000000000020000000000000000000000000000000000000000000000000000000000000000000000400000000000000000000000020000',
//       status: 1,
//       to: '0xa5F84F79ac0f09918d38AD3Ea7199988a12D20f6'
//     }
//   }
// }
//  */

// the return of data.txHash is what should make the UI display transfer successful

// SECOND PART - Input is just a name, eg cboi or cboi.test, registry dropdown comes out and they select a namespace
// UI should only display the name of the registry
const justName = "cboi.test";

// 1.
const registries = await fetch(`${BASE_URL}/api/registry/registries`, {
  method: "GET",
});
const registriesData = await registries.json();
console.log(registriesData);
/**
 * Returns an array of registry, smething like this
 * [
  {
    _id: '6a809c42eb197ccfc5734cba',
    name: 'Salva Wallet 5',
    nspace: '@salva5',
    registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
    description: '',
    active: true,
    createdAt: '2026-08-15T17:05:06.123Z',
    __v: 0
  },
  {
    _id: '6a809fe1eb197ccfc5734cbc',
    name: 'coinbase Wallet ',
    nspace: '@coinbase',
    registryAddress: '0x0badfb11fd0079fdbc53812aeacbbdb4bc382efa',
    description: '',
    active: true,
    createdAt: '2026-08-15T17:20:33.024Z',
    __v: 0
  }
]

The UI will then display only the names of each registry
 * 
 */

// 2. when the user selects a registry, api is called to get the full data of that specific registry
// user selects Salva Wallet 5

const registry = await fetch(
  `${BASE_URL}/api/registry/findByName/Salva Wallet 5`,
  {
    method: "GET",
  },
);
const registryData = await registry.json();
console.log(registryData);
/**
 * Returns the registry OBJ
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

Then the frontend takes the nspace and welds them together and displays as preview in the ui
`${name}${registryData.nspace} = cboi.test@salva5

NB: once input has '@', wallet registry dropdown disappears, this is already working
 */
const recipientName = "cboi.test";
const welded = `${recipientName}${registryData.nspace}`;
console.log(welded);
// Then as the first past, when user is inputting amount, estimate fee is call to display, same logic flow as the above

// 3. after user clicks on continue, frontend calls resolve, just to check if the welded name is registered to an address that is not address(0)

const isAvail = await fetch(
  `${BASE_URL}/api/name/isAvail/${welded}/${registryData.registryAddress}`,
  {
    method: "GET",
  },
);

const isAvailData = await isAvail.json();
console.log(isAvailData);
/**
 * returns this if name is available
 * { status: true, address: '0x9da6c69815a2b9ffe7ee08a0be00ef181881ad71' }
 * returns this if name is not available or resolving failed
 * { status: false, errorMsg: "Name 'cbotest@salva5' not found" }
 */

// if available, proceed to confirm, if not, show the error and dont proceed

// after confirm modal, verify pin to decrypt key and call transfer as usual
// const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {

// 3. Perform transfer
const transferToJustName = await fetch(`${BASE_URL}/api/user/transfer`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail, // gotten from local storage i guess
    userPrivateKey: verifyPinData.privateKey,
    safeAddress: userSafeAddress, // gotten from local storage i guess
    toAddress: isAvailData.address, // from input, cus this particular simulation is for address input
    amount: ngnsToSend,
    coin: "NGNS", // from coin selection (selected coin)
    chain: "base", // hardcoded 'base' on Dashboard.jsx, hardcoded 'bnb' on BNBDashboard.jsx
  }),
});
const transferToJustNameData = await transferToJustName.json();
console.log(transferToJustNameData);
if (!transferToJustName) process.exit(1);
/**
 * {
  status: true,
  data: {
    txHash: '0x24e62c151c985fe882356b33dd0e63fe861dd948aab2917881e488ec68c8a95c',
    receipt: {
      _type: 'TransactionReceipt',
      blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      blockNumber: 45527814,
      contractAddress: null,
      cumulativeGasUsed: '3544780',
      from: '0xfD5A9828bac27495FAb7F6174b3de386E0554187',
      gasPrice: '6000000',
      blobGasUsed: '133800',
      blobGasPrice: null,
      gasUsed: '112825',
      hash: '0x24e62c151c985fe882356b33dd0e63fe861dd948aab2917881e488ec68c8a95c',
      index: 20,
      logs: [Array],
      logsBloom: '0x00008000400000000000000000000000000000004000000000000000040000000000000000000000000000000000000000400000000020000000000000000800001000000000004000000008000000000000040000000000000000000000000000000000000000000004000000000000000000000000000000004010000000000010000800000000000000020000000000000000000000000000000000000000000008000400000000000000000004000000040000000000000000000020000000000002000000000000000000020000000000000000000000000000000002000000000000000000000000000000000000400000000000000000000000020000',
      status: 1,
      to: '0xa5F84F79ac0f09918d38AD3Ea7199988a12D20f6'
    }
  }
}
 */
// the return of data.txHash is what should make the UI display transfer successful

// THIRD PART - user input full salva name, eg cboi.test@salva, pay.claude@anthropic
// no registry down drop
// just fetch fee
// check full name avail
// if avail, enter confirm models
// verify pin to decrypt key and call transfer
// easy
 

// Update Transaction.jsx to work with only these, rearrange UI display, but aesthetics remain the same
// sought by using safeAddress
// Base and BNB will and must share the same transaction history, the chain tag in the UI display will tell Users which chain the transaction happened
// This is the endpoint for transaction history
const transactions = await fetch(
  `${BASE_URL}/api/user/transactions/${userSafeAddress}`,
  {
    method: "GET",
  },
);

const transactionsData = await transactions.json();
console.log(transactionsData);
// this returns every transaction where the user is sender and recipient..