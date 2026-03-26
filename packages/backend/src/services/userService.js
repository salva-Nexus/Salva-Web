// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
const Safe = require("@safe-global/protocol-kit").default;
const { wallet, provider } = require("./walletSigner");

async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log("🏗️  Starting Safe Wallet Generation & Deployment (v1.4.1)...");

  // 1. Create a random EOA to own the Safe
  const owner = ethers.Wallet.createRandom();
  console.log("✅ Owner Address Generated:", owner.address);

  // 2. Define the BLUEPRINT (Predicted Safe)
  // CRITICAL: Version must be 1.4.1 for ERC-4337 compatibility
  const predictedSafe = {
    safeAccountConfig: {
      owners: [owner.address],
      threshold: 1,
      modules: [SAFE_4337_MODULE_ADDRESS]
    },
    safeDeploymentConfig: {
      safeVersion: "1.4.1",
    },
  };

  // 3. Initialize Protocol Kit
  // Using the same signer (your backend manager wallet) to pay for deployment
  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey,
    predictedSafe: predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log("📍 Safe Address (pre-deployment):", safeAddress);

  // 4. DEPLOY THE SAFE ON-CHAIN
  console.log("🚀 Deploying Safe v1.4.1 on-chain (backend pays gas)...");

  // Get the deployment transaction data
  const deploymentTransaction =
    await protocolKit.createSafeDeploymentTransaction();

  // Send the transaction using your backend manager wallet
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
