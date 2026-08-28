const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii@gmail.com";
const testUsername = "cboi";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";
const userSafeAddress = "0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6"; // same on base and bnb
const ngnsToSend = "2"; // sending 2 NGNS
const receipientAddress = "0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd";


const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
console.log(verifyPinData);
if (!verifyPin) process.exit(1);

const transferTo0xAddress = await fetch(`${BASE_URL}/api/user/transfer`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    userPrivateKey: verifyPinData.privateKey,
    safeAddress: userSafeAddress, // gotten from local storage i guess
    toAddress: receipientAddress, // from input, cus this particular simulation is for address input
    amount: ngnsToSend,
    coin: "NGNS", // from coin selection (selected coin)
    chain: "base", // hardcoded 'base' on Dashboard.jsx, hardcoded 'bnb' on BNBDashboard.jsx
  }),
});
const transferTo0xAddressData = await transferTo0xAddress.json();
console.log(transferTo0xAddressData);
if (!transferTo0xAddress) process.exit(1);

const user = await fetch(`${BASE_URL}/api/user/${testEmail}`, {
  method: "GET",
});
const userData = await user.json();
console.log(userData);
if (!user) process.exit(1);

const point = await fetch(`${BASE_URL}/api/sant/points-record`, {
  method: "GET",
});
const pointData = await point.json();
console.log(pointData);
if (!point) process.exit(1);

/**
 * Now i want you to update the sant record fetch on sant tab and dashboard..
 * the endpoint above is the new and corrent endpoint to call - /api/sant/points-record
 * it returns the full obj 
 * {
  status: true,
  data: {
    _id: '6a82579eda166d1614677801',
    totalPointsIssued: 15.4,
    isLocked: false,
    hardCap: 50,
    network: 'TESTNET',
    redeemCap: 15,
    canRedeem: true,
    updatedAt: '2026-08-17T00:36:46.482Z',
    __v: 0
  }
}

Now, For the Dashboard.jsx..
every user balance load should calls this endpoint /api/user/${email} and this /api/sant/points-record
    which returns this
    {
  status: true,
  data: [
    {
      _id: '6a805e46c189d29e8516da96',
      email: 'charlieonyii@gmail.com',
      username: 'cboi',
      password: '$2b$10$hJvcaF9vSJCczb3PHgc84ekzJo75IGTJmU8nTB.o2drkaNIUNURLW',
      safeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      ownerPrivateKey: 'fe8c1e52915455b3b2f60af90a153e37:49d0294d0dff0c462d41b91b522589a4:b4a68716e81ed88e6d9f2c84098f1d61ed1c7b77ec4f24d75c6f1fbfa27e33de2f99929b92ba506330e43047415bfd7eb8f3348ba5b1499222f4ce62773ae8dd4d6023916198918946e0c4e202331f6f',
      transactionPin: '85ca9fd48e6f739632655d40184c6e02:086149824595627ee74079b7dd3d6b6543b2b2de247cc84cb80557c16f0a4eb1',
      accountLockedUntil: null,
      pinSetupCompleted: true,
      isValidator: true,
      isSeller: true,
      nameAlias: null,
      deploymentLoanNGN: 1.904,
      deploymentLoanUSD: 0.002,
      hasPaidDeploymentLoan: true,
      santPoints: 1.8,
      santClaimInProgress: false,
      referralCode: 'SLV-65079E21',
      referredBy: 'SLV-CBF5DF78',
      nameAliases: [],
      createdAt: '2026-08-15T12:40:38.177Z',
      __v: 0
    }
  ]
}
  and this 
  {
  status: true,
  data: {
    _id: '6a82579eda166d1614677801',
    totalPointsIssued: 15.4,
    isLocked: false,
    hardCap: 50,
    network: 'TESTNET',
    redeemCap: 15,
    canRedeem: true,
    updatedAt: '2026-08-17T00:36:46.482Z',
    __v: 0
  }
  
  and after getting this, displays the data[0].referralCode at the top of the Dashboard(constructed as the full link)
  then displays data[0].santPoints, it must be displayed as data[0].santPoints * 100, just for UI display, eg - 0.5 points will be diaplayed as 50 points
  when it's time to redeem, the value that will be passed into redeem endpoint will be actual data[0].santPoints0 eg 30.2 points will be sent, not the product of 30.2 * 100
  when isLocked === true and user has redeemed all their individual points, referral link and sant point display should disapper from UI
  for example, user A has 30 points, isLocked is === true, referral links and sant points should not disappear from user As Dashboard until they've redeemed all their points


  Now for Sant tab, should call this endpoint - /api/sant/points-record
  which returns this 
  {
  status: true,
  data: {
    _id: '6a82579eda166d1614677801',
    totalPointsIssued: 15.4,
    isLocked: false,
    hardCap: 50,
    network: 'TESTNET',
    redeemCap: 15,
    canRedeem: true,
    updatedAt: '2026-08-17T00:36:46.482Z',
    __v: 0
  }
  
  and this endpoint /api/sant/points-record
    which returns this
    {
  status: true,
  data: [
    {
      _id: '6a805e46c189d29e8516da96',
      email: 'charlieonyii@gmail.com',
      username: 'cboi',
      password: '$2b$10$hJvcaF9vSJCczb3PHgc84ekzJo75IGTJmU8nTB.o2drkaNIUNURLW',
      safeAddress: '0xa5f84f79ac0f09918d38ad3ea7199988a12d20f6',
      ownerPrivateKey: 'fe8c1e52915455b3b2f60af90a153e37:49d0294d0dff0c462d41b91b522589a4:b4a68716e81ed88e6d9f2c84098f1d61ed1c7b77ec4f24d75c6f1fbfa27e33de2f99929b92ba506330e43047415bfd7eb8f3348ba5b1499222f4ce62773ae8dd4d6023916198918946e0c4e202331f6f',
      transactionPin: '85ca9fd48e6f739632655d40184c6e02:086149824595627ee74079b7dd3d6b6543b2b2de247cc84cb80557c16f0a4eb1',
      accountLockedUntil: null,
      pinSetupCompleted: true,
      isValidator: true,
      isSeller: true,
      nameAlias: null,
      deploymentLoanNGN: 1.904,
      deploymentLoanUSD: 0.002,
      hasPaidDeploymentLoan: true,
      santPoints: 1.8,
      santClaimInProgress: false,
      referralCode: 'SLV-65079E21',
      referredBy: 'SLV-CBF5DF78',
      nameAliases: [],
      createdAt: '2026-08-15T12:40:38.177Z',
      __v: 0
    }
  ]
}
  
  this one is simple, claim button will not be opened until data.canRedeem === true, and when data.canRedeem === true, users can claim, if they 0 points, the claim button should be closed, users cannout claim 0 points 
   */

/**
 * Now, as for the minting endpoint
 * when user clicks on claim, they input their pin which decrypts their pkey using this:
 * const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin }),
});
const verifyPinData = await verifyPin.json();
console.log(verifyPinData);

this returns:
{
  success: true,
  privateKey: '0x40ac1f77619b6588ab1b084b58a264bc80f6b2117eb53581017b014545710c3a'
}

once pin is verified successfully, then the mint sant endpoint is called
const mint = await fetch(`${BASE_URL}/api/user/mint-sant`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    address: userSafeAddress,
    pKey: verifyPinData.privateKey,
  }),
});
const mintData = await mint.json();
console.log(mintData);

which returns this if successfull
{
  status: true,
  data: '0x21c9ba05a934446dfc4f77615c86c8914f16224826dccfe630312cb69d564372' <- this is txHash
}

or return status: false and these errors -"Fee not enough" , ("Double claim error"), ("Claim Locked"), "SANT mint transaction reverted on-chain"
 */