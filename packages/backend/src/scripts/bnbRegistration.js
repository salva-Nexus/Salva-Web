const BASE_URL = "http://localhost:3001";

const testEmail = "charlieonyii@gmail.com";
const testUsername = "cboi";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";

// ─────────────────────────────────────────────────────────────────────────
// 2. verify-pin — matches BNBDeployWallet.jsx step 1
//    Real flow expects this to return { privateKey } (decrypted, using the
//    ENCRYPTION_KEY server-side, not the raw pin, per tonight's fix).
// // ─────────────────────────────────────────────────────────────────────────
// const verifyPinRes = await fetch(`${BASE_URL}/api/user/verify-pin`, {
//   method: "POST",
//   headers: { "Content-Type": "application/json" },
//   body: JSON.stringify({ email: testEmail, pin: testPin }),
// });
// const verifyPinData = await verifyPinRes.json();
// console.log("verify-pin:", verifyPinRes.status);

// if (!verifyPinRes.ok) {
//   process.exit(1);
// }

// ─────────────────────────────────────────────────────────────────────────
// 3. bnb/register — matches BNBDeployWallet.jsx step 2 (post-fix version)
//    Sends the SAME owner private key obtained from verify-pin, not a
//    freshly generated one. Backend should deploy the BNB Safe with this
//    exact key and copy over the encrypted record from the Base user.
// ─────────────────────────────────────────────────────────────────────────
const bnbRegisterRes = await fetch(`${BASE_URL}/api/user/bnb/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    pin: testPin,
  }),
});
const bnbRegisterData = await bnbRegisterRes.json();
console.log("bnb/register:", bnbRegisterRes.status, bnbRegisterData);

if (!bnbRegisterRes.ok) process.exit(1);
