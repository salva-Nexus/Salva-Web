// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
const { SafeFactory } = require("@safe-global/protocol-kit");
const { wallet } = require("./walletSigner");
const { EthersAdapter } = require("@safe-global/protocol-kit");

// The official Safe 4337 Module address for Base Sepolia
const SAFE_4337_MODULE_ADDRESS = "0xa581c4A4DB7175302464fF3C06380BC3270b4037";

async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log("🏗️  Starting Safe v1.4.1 Deployment with 4337 Module...");

  const ethAdapter = new EthersAdapter({
    ethers,
    signerOrProvider: wallet,
  });

  const safeFactory = await SafeFactory.create({ ethAdapter });

  const owner = ethers.Wallet.createRandom();
  console.log("✅ Owner Address Generated:", owner.address);

  const safeAccountConfig = {
    owners: [owner.address],
    threshold: 1,
    // This MUST be passed here to be included in the setup() call
    modules: [SAFE_4337_MODULE_ADDRESS],
  };

  const saltNonce = Date.now().toString();

  // Deploying via Factory ensures the setup() call enables the module immediately
  const safeSdk = await safeFactory.deploySafe({
    safeAccountConfig,
    saltNonce,
    safeVersion: "1.4.1",
  });

  const safeAddress = await safeSdk.getAddress();
  console.log("📍 Safe Deployed & Module Enabled at:", safeAddress);

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress: safeAddress,
    // Getting the deployment transaction hash
    deploymentTx: (await safeSdk.getContractVersion()) ? "Success" : "Failed",
  };
}

module.exports = { generateAndDeploySalvaIdentity };
