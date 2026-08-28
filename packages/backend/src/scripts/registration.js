

const BASE_URL = "http://localhost:3001";
const secret = "salva_nexus_loving_user-";

const testEmail = "charlieony55ii@gmail.com";
const testUsername = "cbo5i";
const testPassword = "Okoronkwo1234@";
const testPin = "1234";

// ─────────────────────────────────────────────────────────────────────────
// 1. send-otp
// ─────────────────────────────────────────────────────────────────────────
const sendOtpRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail }),
});
const sendOtpData = await sendOtpRes.json();
console.log("send-otp:", sendOtpRes.status, sendOtpData);

if(!sendOtpRes) process.exit(1);

// ─────────────────────────────────────────────────────────────────────────
// 2. verify-otp
//    You need the real code — check your server terminal log for it
//    (or your email, once real sending is wired up), then paste it here.
// ─────────────────────────────────────────────────────────────────────────
const otpCode = sendOtpData.OTP; 

const verifyOtpRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, code: otpCode }),
});
const verifyOtpData = await verifyOtpRes.json();
console.log("verify-otp:", verifyOtpRes.status, verifyOtpData);

if (!verifyOtpRes) process.exit(1);



// ─────────────────────────────────────────────────────────────────────────
// 3. register
// ─────────────────────────────────────────────────────────────────────────
const registerRes = await fetch(`${BASE_URL}/api/user/register`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    username: testUsername,
    email: testEmail,
    password: testPassword,
    referralCode: "SLV-65079E21",
  }),
});
const registerData = await registerRes.json();
console.log("register:", registerRes.status, registerData);

if (!registerRes) process.exit(1);


// ─────────────────────────────────────────────────────────────────────────
// 3b. set-pin — matches SetTransactionPin.jsx's POST /api/user/set-pin call.
//     Sent immediately after registration, exactly matching the real
//     frontend flow (register -> set-transaction-pin -> dashboard).
// ─────────────────────────────────────────────────────────────────────────

const setPinRes = await fetch(`${BASE_URL}/api/user/set-pin`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    email: testEmail,
    pin: testPin,
  }),
});
const setPinData = await setPinRes.json();
console.log("set-pin:", setPinRes.status, setPinData);

if (!setPinRes) process.exit(1);



// ─────────────────────────────────────────────────────────────────────────
// 4. login
// ─────────────────────────────────────────────────────────────────────────
const loginRes = await fetch(`${BASE_URL}/api/user/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: testEmail, password: testPassword }),
});
const loginData = await loginRes.json();
console.log("login:", loginRes.status, loginData);

if (!loginRes) process.exit(1);


// ─────────────────────────────────────────────────────────────────────────
// 5. pin-status
// ─────────────────────────────────────────────────────────────────────────
const pinStatusRes = await fetch(
  `${BASE_URL}/api/user/base/status/${encodeURIComponent(testEmail)}`,
);
const pinStatusData = await pinStatusRes.json();
console.log("pin-status:", pinStatusRes.status, pinStatusData);

console.log("\n✅ Full flow complete.");

