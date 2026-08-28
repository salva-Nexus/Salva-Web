const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii42@gmail.com";
const testUsername = "cboi2";
const testPassword = "Okoronkwo1234@";
const userSafeAddress = "0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd";
const testPin = "1234";

// On the link Name tab, user inputs a name..
// Input is just a name, eg cboi or cboi.test, registry dropdown comes out and they select a namespace
// UI should only display the name of the registry

// 1.
const registries = await fetch(`${BASE_URL}/api/registry/registries`, {
  method: "GET",
});
const registriesData = await registries.json();
// console.log(registriesData);
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

// 2. when the user selects a registry, api/findByName/registry is called to get the full data of that specific registry
// user selects Salva Wallet 5

const registry = await fetch(
  `${BASE_URL}/api/registry/findByName/Salva Wallet 5`,
  {
    method: "GET",
  },
);
const registryData = await registry.json();
//console.log(registryData);
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
`${name}${registryData.nspace} = thisismyname3.name@salva5
*/

const justName = "thisismyname3.name";
const welded = `${justName}${registryData.nspace}`; // <-- UI Preview
console.log(welded);

// After this, user clicks on check availability, frontend calls resolve, just to check if the welded name is registered to an address that is not address(0)

const isAvail = await fetch(
  `${BASE_URL}/api/name/isAvail/${welded}/${registryData.registryAddress}`,
  {
    method: "GET",
  },
);

const isAvailData = await isAvail.json();
// console.log(isAvailData);
/**
 * returns this if name is available
 * { status: true, address: '0x9da6c69815a2b9ffe7ee08a0be00ef181881ad71' }
 * returns this if name is not available or resolving failed
 * { status: false, errorMsg: "Name 'cboi2.test@salva5' not found" }
 */

// if available, dont proceed
// if not available, display the confirmation modal saying Previewed name@namespace is available
// as this is happening, instead of estimating transaction fee, we are depreciating that
// only call the endpoint for fetching link fee charged by the singleton - /api/user/linkFee
// while this is going on, user cannot proceed until fee is displayed

const linkFee = await fetch(`${BASE_URL}/api/user/linkFee/`, {
  method: "GET",
});
const linkFeeData = await linkFee.json();
// console.log(linkFeeData);

/**
 * Which returns this on success
 * { status: true, data: '0' }
 *
 * Then in the confirm modal/card. it displays it as the charge for linking
 * if 0, -> Linking is free
 * if > 0 => linkFeeData.data is charged for linking
 */

/**
 * then user clicks on proceed and inputs pin to decrypt ptivate key
 */
const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
//console.log(verifyPinData);

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

// NOTE: RESERVED NAMES LOGIC STAYS, THE CURRENT LOGIC IS WORKING ALREADY
/**
 * then linkName is called on this endpoint - /api/user/link
 *
 */
const link = await fetch(`${BASE_URL}/api/user/link`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail, //                 |___ These two are gotten from local storage
    safeAddress: userSafeAddress, // ____|
    privateKey: verifyPinData.privateKey, // from verify pin return data
    name: justName, // from users input on UI
    address: userSafeAddress, // from users input on UI
    registry: registryData.registryAddress, // from registry address
  }),
});
const linkData = await link.json();
console.log(linkData);

/**
 * which return this when successful
 * {
  status: true,
  data: {
    receipt: {
      _type: 'TransactionReceipt',
      blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      blockNumber: 45627319,
      contractAddress: null,
      cumulativeGasUsed: '2033533',
      from: '0xfD5A9828bac27495FAb7F6174b3de386E0554187',
      gasPrice: '6000000',
      blobGasUsed: '170818',
      blobGasPrice: null,
      gasUsed: '207021',
      hash: '0x4d523089a991ffa87276c4f1ed838a71664cee050e80bcd3c31397c6289c92b1',
      index: 4,
      logs: [Array],
      logsBloom: '0x10000000400000000000000000000000000000000000020000000000040000000000000000000000000000000000000008000000000020000100000000020800000000000000004000000008000000000000040000000000000000000000000000000800000000000000000000000000200008000000000000000010000040000004000000000000000000020000000000000000000000000000000000000000000000000400000000000000000004000000000000000000000000000820000000000002000000000000000000028000000000000000004000000000000000000000000000000000000080000000000000400000100000000000000000000000',
      status: 1,
      to: '0x44eB679fB52e3f4a8ee90Fe3BAEf69Bb8C01EBDd'
    }
  }
}
 */
// Link name is now successfull

// and to display the link names on the link name tab
// frontend should call this endpoint

const linkedNames = await fetch(`${BASE_URL}/api/user/record/${testEmail}`, {
  method: "GET",
});
const linkedNamesData = await linkedNames.json();
// console.log(linkedNamesData);

/**
 * which returns this
 * {
  status: true,
  data: [
    {
      name: '4.name@salva5',
      wallet: '0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd',
      registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
      _id: '6a83d2391efc6758b4e31330'
    },
    {
      name: 'thisismyname.name@salva5',
      wallet: '0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd',
      registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
      _id: '6a83d32d1efc6758b4e31333'
    }
  ]
}

then the UI caches to local storage and displays only the names and their linked wallet(address) in the link Name tab (currently display is okay)
 */

/**
 * And as for Unlink name, it's simple, when the user clicks on the Unlink button on the name they want to unlink
 * ui opens pin model for the user to input pin, while this is going on, estimate unlink fee is called
 */
const unlinkFee = await fetch(`${BASE_URL}/api/user/unlinkTxFee`, {
  method: "GET",
});
const unlinkFeeData = await unlinkFee.json();
console.log(unlinkFeeData);

/**
 * return this on success -> { fee: { status: true, data: { feeNGN: 25.308, feeUsd: 0.01 } } }
 * User can still click continue after putting their pin even if fee has not pin fetch
 */

/**
 * So after putting pin and verifying pin, user clicks continue, 
 * but before unlink endpoint is called, we need the registry address
 * So we have to get the registry address associated with that fullName
 * so frontend calls the record endpoint to get the specific data associated with the full name
 * but with query
 */

const linkedNameToReg = await fetch(`${BASE_URL}/api/user/record/${testEmail}?fullName=${welded}`, {
  method: "GET",
});
const linkedNameToRegData = await linkedNameToReg.json();
console.log(linkedNameToRegData);

/**
 * Which returns an object
 * {
  status: true,
  data: {
    name: 'thisismyname3.name@salva5',
    wallet: '0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd',
    registryAddress: '0x0bfbfb11fd00796abc53812aeacbbdb4bc3828f6',
    _id: '6a83e89206a48921e7d34da2'
  }
}

then the registry address is picked from here and used to call unlink
 */

const unlink = await fetch(`${BASE_URL}/api/user/unlink`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail, //                 |___ These three are gotten from local storage
    safeAddress: userSafeAddress, //     |
    fullName: welded, // this is the name the user selected to be unlinked, fullName, eg, charles@salva, not just name charles
    privateKey: verifyPinData.privateKey, // from verify pin return data
    registry: linkedNameToRegData.data.registryAddress, // from registry address
  }),
});
const unlinkData = await unlink.json();
console.log(unlinkData);

/**
 * returns this one success
 *   status: true,
  data: {
    receipt: {
      _type: 'TransactionReceipt',
      blockHash: '0x0000000000000000000000000000000000000000000000000000000000000000',
      blockNumber: 45646455,
      contractAddress: null,
      cumulativeGasUsed: '1215735',
      from: '0xfD5A9828bac27495FAb7F6174b3de386E0554187',
      gasPrice: '6000000',
      blobGasUsed: '145396',
      blobGasPrice: null,
      gasUsed: '146430',
      hash: '0xedb72de256640f537c9c6cc165a9ab93634df1926b1d180308f2e5097d861029',
      index: 7,
      logs: [Array],
      logsBloom: '0x10000000400000000000000000000000000000000000000000000800040000000000000000000000000000000000000008000000000020000000000000020800000000000000004000000008000000000000040000000000000000000000000000000800000000000000000000000000200000000000000000000010000000000000010000000000000200020020000000000000000000000000000000000000000000000400000000000000000004000000000000000000000000000020000000000002000000000000000000028000000000000000004000000000000000000000000000000000000080000000000000400000100000000000001000000000',
      status: 1,
      to: '0x44eB679fB52e3f4a8ee90Fe3BAEf69Bb8C01EBDd'
    }
  }
}
~/Desktop/Salva-Services/Packages/backend/src/scripts $ 
 */


/**
 * These above is the exact and new flow for link name tab, any current logic or old api endpoint on Dashboard and BNBDashboard 
 * should be depreciated and replced with this current flow/logic/api endpoint
 */