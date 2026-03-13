// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;
const { wallet, provider } = require('./walletSigner');

async function generateAndDeploySalvaIdentity(providerUrl) {
    console.log("🏗️  Starting Safe Wallet Generation & Deployment...");

    // 1. Create a random EOA to own the Safe
    const owner = ethers.Wallet.createRandom();
    console.log("✅ Owner Address Generated:", owner.address);

    // 2. Define the BLUEPRINT (Predicted Safe)
    const predictedSafe = {
        safeAccountConfig: {
            owners: [owner.address],
            threshold: 1
        },
        safeDeploymentConfig: {
            safeVersion: '1.3.0'
        }
    };

    // 3. Initialize Safe with Predicted Config
    const protocolKit = await Safe.init({
        provider: providerUrl,
        signer: wallet.privateKey,
        predictedSafe: predictedSafe
    });

    const safeAddress = await protocolKit.getAddress();
    console.log("📍 Safe Address (pre-deployment):", safeAddress);

    // 4. DEPLOY THE SAFE ON-CHAIN
    console.log("🚀 Deploying Safe on-chain (backend pays gas)...");
    const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

    const txResponse = await wallet.sendTransaction({
        to: deploymentTransaction.to,
        data: deploymentTransaction.data,
        value: deploymentTransaction.value
    });

    console.log("⏳ Waiting for transaction confirmation...");
    await txResponse.wait();
    console.log("✅ Safe Deployed! TX:", txResponse.hash);

    // 5. VERIFY DEPLOYMENT
    console.log("⏳ Verifying deployment on-chain...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    let code = await provider.getCode(safeAddress);

    if (code === '0x') {
        console.log("🔄 Node hasn't synced yet, retrying verification...");
        await new Promise(resolve => setTimeout(resolve, 3000));
        code = await provider.getCode(safeAddress);
    }

    if (code === '0x') {
        throw new Error("❌ Safe deployment failed - no code at address after retries");
    }
    console.log("✅ Safe deployment verified on-chain");

    // NOTE: Account number is NO LONGER generated here.
    // It is assigned in the registration route AFTER on-chain linking succeeds.
    return {
        ownerAddress: owner.address,
        ownerPrivateKey: owner.privateKey,
        safeAddress: safeAddress,
        deploymentTx: txResponse.hash
    };
}

module.exports = { generateAndDeploySalvaIdentity };