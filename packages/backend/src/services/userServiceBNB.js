// packages/backend/src/services/userServiceBNB.js
const { ethers } = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;

// Backend wallet for BNB — same MANAGER_PRIVATE_KEY, different provider
function getBNBWallet() {
  const isProd = process.env.NODE_ENV === 'production';
  const rpcUrl = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const pk = process.env.MANAGER_PRIVATE_KEY;
  if (!pk) throw new Error('MANAGER_PRIVATE_KEY not set');
  return { wallet: new ethers.Wallet(pk, provider), provider, rpcUrl };
}

async function generateAndDeploySalvaIdentityBNB() {
  const { wallet, provider, rpcUrl } = getBNBWallet();

  const owner = ethers.Wallet.createRandom();
  console.log(`✅ BNB Owner Address: ${owner.address}`);

  const predictedSafe = {
    safeAccountConfig: { owners: [owner.address], threshold: 1 },
    safeDeploymentConfig: { safeVersion: '1.3.0' },
  };

  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: wallet.privateKey,
    predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log(`📍 BNB Safe Address: ${safeAddress}`);

  const deployTx = await protocolKit.createSafeDeploymentTransaction();
  let txResponse;
  try {
    txResponse = await wallet.sendTransaction({
      to: deployTx.to,
      data: deployTx.data,
      value: deployTx.value || '0',
      gasLimit: 300_000,
    });
  } catch (err) {
    if (err.code === 'INSUFFICIENT_FUNDS' || err.message?.includes('insufficient funds')) {
      throw new Error('Network deployment temporarily unavailable. Please try again shortly.');
    }
    throw new Error('Failed to deploy BNB wallet. Please try again.');
  }

  await txResponse.wait();
  console.log(`✅ BNB Safe Deployed: ${txResponse.hash}`);

  await new Promise((r) => setTimeout(r, 3000));
  const code = await provider.getCode(safeAddress);
  if (code === '0x') throw new Error('BNB Safe deployment failed — no code at address');

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress,
    deploymentTx: txResponse.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentityBNB };