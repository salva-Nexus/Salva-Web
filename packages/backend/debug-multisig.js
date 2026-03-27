// /packages/backend/debug-multisig.js
require("dotenv").config();
const { ethers } = require("ethers");

// 1. Setup Provider & Wallet
const provider = new ethers.JsonRpcProvider(process.env.ALCHEMY_RPC_URL);
const wallet = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);

// 2. Define the exact Interface
const MULTISIG_IFACE = new ethers.Interface([
  "function proposeInitialization(string,address) external returns (address,string,bytes16,bool)",
]);

const MULTISIG_ADDRESS = process.env.MULTISIG_CONTRACT_ADDRESS;

async function debugMultisig() {
  console.log("🔍 Starting simulation...");
  console.log(`🔍 Using Wallet: ${wallet.address}`);
  console.log(`🔍 Targeting Multisig: ${MULTISIG_ADDRESS}`);

  const multisig = new ethers.Contract(
    MULTISIG_ADDRESS,
    MULTISIG_IFACE,
    wallet,
  );

  try {
    // This simulates the call as if the Backend Wallet was calling directly.
    // If THIS fails, the problem is your Multisig logic (e.g. namespace taken).
    // If THIS succeeds, the problem is 100% your Safe Signature code.
    // Force it to lowercase first, then let ethers get the correct checksum
    const rawAddress = "0x0FbF3EaE3131C01e8808034A02eACCbddfF495d6";
    const normalizedRegistry = ethers.getAddress(rawAddress.toLowerCase());

    console.log(`✅ Normalized to: ${normalizedRegistry}`);

    await multisig.proposeInitialization.staticCall(
      "@salva",
      normalizedRegistry,
    );

    console.log("--------------------------------------------------");
    console.log("✅ RESULT: The Multisig logic is FINE.");
    console.log(
      "This means the '@salva' namespace is available and your wallet has permission.",
    );
    console.log(
      "The GS013 error is happening because the SAFE rejected your signature.",
    );
    console.log("--------------------------------------------------");
  } catch (error) {
    console.log("--------------------------------------------------");
    console.log("❌ RESULT: THE MULTISIG REJECTED THE CALL.");
    console.log("Reason:", error.reason || error.message);

    if (error.data) {
      console.log("Raw Error Data:", error.data);
    }
    console.log("--------------------------------------------------");
  }
}

debugMultisig();
