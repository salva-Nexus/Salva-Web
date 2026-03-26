// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
const Safe = require("@safe-global/protocol-kit").default;
const { wallet, provider } = require("./walletSigner");

// The official Safe 4337 Module address for Base Sepolia
const SAFE_4337_MODULE_ADDRESS = "0xa581c4A4DB7175302464fF3C06380BC3270b4037";

async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log("🏗️  Starting Safe Wallet Generation & Deployment (v1.4.1)...");

  // 1. Create a random EOA to own the Safe
  const owner = ethers.Wallet.createRandom();
  console.log("✅ Owner Address Generated:", owner.address);

  // 2. Define the BLUEPRINT (Predicted Safe)
  const predictedSafe = {
    safeAccountConfig: {
      owners: [owner.address],
      threshold: 1,
      // Enable the module during deployment so Relay Kit can work immediately
      modules: [SAFE_4337_MODULE_ADDRESS],
    },
    safeDeploymentConfig: {
      safeVersion: "1.4.1",
    },
  };

  // 3. Initialize Protocol Kit
  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey,
    predictedSafe: predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log("📍 Safe Address (pre-deployment):", safeAddress);

  // 4. DEPLOY THE SAFE ON-CHAIN
  console.log("🚀 Deploying Safe v1.4.1 (4337 enabled) on-chain...");

  const deploymentTransaction =
    await protocolKit.createSafeDeploymentTransaction();

  const txResponse = await wallet.sendTransaction({
    to: deploymentTransaction.to,
    data: deploymentTransaction.data,
    value: deploymentTransaction.value,
  });

  console.log("⏳ Waiting for transaction confirmation...");
  const receipt = await txResponse.wait();
  console.log("✅ Safe v1.4.1 Deployed! TX:", receipt.hash);

  // 5. VERIFY DEPLOYMENT
  console.log("⏳ Verifying deployment on-chain...");
  await new Promise((resolve) => setTimeout(resolve, 3000));

  let code = await provider.getCode(safeAddress);

  if (code === "0x") {
    console.log("🔄 Node hasn't synced yet, retrying verification...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    code = await provider.getCode(safeAddress);
  }

  if (code === "0x") {
    throw new Error(
      "❌ Safe deployment failed - no code at address after retries",
    );
  }
  console.log("✅ Safe v1.4.1 deployment verified on-chain");

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress: safeAddress,
    deploymentTx: receipt.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentity };
