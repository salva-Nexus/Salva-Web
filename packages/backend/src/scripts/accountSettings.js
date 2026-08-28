// import { setPin } from "../services/pinService.js";
const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii42@gmail.com";
const testUsername = "cboi";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";

//await setPin(testEmail, testPin);

const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
console.log(verifyPinData);
if (!verifyPin) process.exit(1);

/**
 * if acccount is locked, user cannot do anything transaction
 * it returns this
 * {
  status: false,
  message: 'Account locked for 24 more hours due to recent security changes.'
}
 */

/**
 * This is the new flow for Account settings
 */

/**
 * 1. for username change, this is simple, no verification needed
 * new endpoint
 */
// const newusername = "charlie";
// const updateUsername = await fetch(`${BASE_URL}/api/data/update-username`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ email: testEmail, newusername: newusername }),
// });
// const updateUsernameData = await updateUsername.json();
// console.log(updateUsernameData);
/**
 * returns true when successful
 * { status: true }
 */

/**
 * Then for update email, same,no verification needed..
 * the only twit here is that account will be locked for 24 hours
 * the UI should notify the user that changing email will put their account on 24 hours lock down
 * once user agree, then input their new email and then this endpoint is called
 */

// const newemail = "cbs247964@gmail.com";
// const updateEmail = await fetch(`${BASE_URL}/api/data/update-email`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ email: testEmail, newEmail: newemail }),
// });
// const updateEmailData = await updateEmail.json();
// console.log(updateEmailData);

/**
 * returns true when successfull
 * { status: true }
 */

/**
 * and in the account settings, at the top... an endpoint is called display lock down count down
 * as long as the user is on account settings, this endpoint is called and is displays lockdown time if null
 * the UI should be smart, display in hours, and when it's down to the last minutes, display in minutes, 
 * when down to the last seconds, dsplay in seconds
 * when null, don't display
 */
const lockdownstatus = await fetch(`${BASE_URL}/api/data/account-status/${testEmail}`, {
  method: "GET",
});
const lockdownstatusData = await lockdownstatus.json();
console.log(lockdownstatusData);
/**
 * { status: null } <- if not lock
 * { status: '2026-08-19T18:43:05.317Z' } <- if locked 
 */

/**
 * AS for updating password, simple, no verification
 * just Ui warning them that their account will be locked for 24 hours
 * once they continue, theyll have to input their old pin and new pin and another input for confirm new pin
 * must be 4 digit
 */

// const newPin = "1234";
// const updatePin = await fetch(`${BASE_URL}/api/data/update-pin`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ email: testEmail, oldPin: testPin, newPin: newPin }),
// });
// const updatePinData = await updatePin.json();
// console.log(updatePinData);
/**
 * returns
 * { status: true } when successful
 */

/**
 * and finally, update password
 * simple, no verification
 * just Ui warning them that their account will be locked for 24 hours
 */

// const newPassword = "Cboi019@";
// const updatePassword = await fetch(`${BASE_URL}/api/data/update-password`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail,
//     newPassword: newPassword,
//   }),
// });
// const updatePasswordData = await updatePassword.json();
// console.log(updatePasswordData);
/**
 * returns
 * { status: true } when successful
 */

/**
 * This is the whole account settings story, anything that is not in this story should be remove/depreciated
 * Base and BNB share the same account settings page, so there should be no separate Base and bnb pin change buttons, 
 * it's unified, they both call the same endpoint
 * also, pin-status check should be depreciated in account settngs if its there
 * REMEMBER, WHEN CHANGING PIN, NO VERIFICATION, JUST WARN THEM THAT THE ACCOUNT WILL BE LOCKED FOR 24 HOURS
 * IF THEY AGREE, TALK OLD PIN AND NEW PIN AND CALL THAT ENDPOINT
 */

// const updatePassword = await fetch(`${BASE_URL}/api/data/update-time`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({
//     email: testEmail,
//   }),
// });
// const updatePasswordData = await updatePassword.json();
// console.log(updatePasswordData);

/**
 * LOCAL STORAGE SHOULD ALSO BE UPDATED IN THE CASE OF AFTER NAME OR EMAIL OR 
 */