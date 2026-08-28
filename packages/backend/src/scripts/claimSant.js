const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieonyii42@gmail.com";
const testUsername = "cboi2";
const testPassword = "Okoronkwo1234@";
const userSafeAddress = "0x44eb679fb52e3f4a8ee90fe3baef69bb8c01ebdd";
const testPin = "1234";

const verifyPin = await fetch(`${BASE_URL}/api/user/verify-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, pin: testPin, secret: secret }),
});
const verifyPinData = await verifyPin.json();
console.log(verifyPinData);
if (!verifyPin) process.exit(1);

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
if (!mint) process.exit(1);

const user = await fetch(`${BASE_URL}/api/user/${testEmail}`, {
  method: "GET",
});
const userData = await user.json();
console.log(userData);
if (!user) process.exit(1);
