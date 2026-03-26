// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
const Safe = require("@safe-global/protocol-kit").default;
const { wallet } = require("./walletSigner");

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
    },
    safeDeploymentConfig: {
      safeVersion: "1.4.1",
      saltNonce: Date.now().toString(),
    },
  };

  // 3. Initialize the Protocol Kit
  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey,
    predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log("📍 Predicted Safe Address:", safeAddress);

  // 4. Deploy the Safe
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

  // 5. Re-initialize the Protocol Kit now pointing at the deployed Safe
  console.log("🔧 Re-initializing kit for deployed Safe...");
  const deployedKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey,
    safeAddress: safeAddress,
  });

  // 6. Check if the module is already enabled (in case a future version of
  //    protocol-kit starts honoring the modules array in safeAccountConfig)
  const alreadyEnabled = await deployedKit.isModuleEnabled(
    SAFE_4337_MODULE_ADDRESS,
  );
  console.log("🔍 4337 Module already enabled?", alreadyEnabled);

  if (!alreadyEnabled) {
    console.log("🔧 Enabling EIP-4337 module explicitly...");

    const enableModuleTx = await deployedKit.createEnableModuleTx(
      SAFE_4337_MODULE_ADDRESS,
    );
    const signedEnableTx = await deployedKit.signTransaction(enableModuleTx);
    const enableResult = await deployedKit.executeTransaction(signedEnableTx);
    await enableResult.transactionResponse?.wait();

    // Verify it actually worked
    const nowEnabled = await deployedKit.isModuleEnabled(
      SAFE_4337_MODULE_ADDRESS,
    );
    if (!nowEnabled) {
      throw new Error(
        "Failed to enable EIP-4337 module on Safe — aborting registration.",
      );
    }

    console.log("✅ EIP-4337 module enabled successfully!");
  } else {
    console.log("✅ EIP-4337 module was already enabled.");
  }

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress: safeAddress,
    deploymentTx: receipt.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentity };
