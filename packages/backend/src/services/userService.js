// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
// FIX: Use the default export from the protocol-kit
const Safe = require("@safe-global/protocol-kit").default;
const { wallet } = require("./walletSigner");

// The official Safe 4337 Module address for Base Sepolia
const SAFE_4337_MODULE_ADDRESS = "0xa581c4A4DB7175302464fF3C06380BC3270b4037";

async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log("🏗️  Starting Modern Safe v1.4.1 Deployment (4337 enabled)...");

  // 1. Create a random EOA to own the Safe
  const owner = ethers.Wallet.createRandom();
  console.log("✅ Owner Address Generated:", owner.address);

  // 2. Setup the configuration
  const predictedSafe = {
    safeAccountConfig: {
      owners: [owner.address],
      threshold: 1,
      modules: [SAFE_4337_MODULE_ADDRESS], // Enables the 4337 module
    },
    safeDeploymentConfig: {
      safeVersion: "1.4.1",
      saltNonce: Date.now().toString(), // Ensures a unique address
    },
  };

  // 3. Initialize the Protocol Kit (No Adapter needed anymore!)
  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey, // Your backend manager key
    predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log("📍 Predicted Safe Address:", safeAddress);

  // 4. Generate and Send the Deployment Transaction
  console.log("🚀 Sending deployment transaction...");
  const deploymentTx = await protocolKit.createSafeDeploymentTransaction();

  const txResponse = await wallet.sendTransaction({
    to: deploymentTx.to,
    data: deploymentTx.data,
    value: deploymentTx.value,
  });

  console.log("⏳ Waiting for confirmation...");
  const receipt = await txResponse.wait();
  console.log("✅ Safe Deployed! TX:", receipt.hash);

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress: safeAddress,
    deploymentTx: receipt.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentity };
