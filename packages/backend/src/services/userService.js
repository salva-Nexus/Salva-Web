// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require("ethers");
// FIX: Import the entire kit to access the nested classes correctly
const SafeProtocolKit = require("@safe-global/protocol-kit");
const { wallet } = require("./walletSigner");

// The official Safe 4337 Module address for Base Sepolia
const SAFE_4337_MODULE_ADDRESS = "0xa581c4A4DB7175302464fF3C06380BC3270b4037";

async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log("🏗️  Starting Safe v1.4.1 Deployment with 4337 Module...");

  // FIX: Access EthersAdapter through the main object or .default if needed
  const EthersAdapter =
    SafeProtocolKit.EthersAdapter || SafeProtocolKit.default.EthersAdapter;
  const SafeFactory =
    SafeProtocolKit.SafeFactory || SafeProtocolKit.default.SafeFactory;

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
    // This enables the 4337 module on creation
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
    deploymentTx: "Success",
  };
}

module.exports = { generateAndDeploySalvaIdentity };
