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
  console.log('✅ Owner wallet generated');

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

  // BSC testnet nodes lag significantly on getCode after tx confirmation.
  // Try multiple times across multiple RPCs before giving up.
  // If all fail but tx was confirmed, treat as success — node sync lag, not a real failure.
  const isProd = process.env.NODE_ENV === 'production';
  const verifyRpcs = isProd
    ? [
        process.env.BNB_MAINNET_RPC_URL,
        'https://bsc-dataseed1.bnbchain.org',
        'https://bsc-dataseed2.bnbchain.org',
      ]
    : [
        'https://bsc-testnet-rpc.publicnode.com',
        'https://bsc-testnet.bnbchain.org',
        process.env.BNB_TESTNET_RPC_URL,
      ];

  let verified = false;
  for (let attempt = 1; attempt <= 5 && !verified; attempt++) {
    await new Promise((r) => setTimeout(r, attempt === 1 ? 6000 : 8000));
    for (const rpc of verifyRpcs.filter(Boolean)) {
      try {
        const vProvider = new ethers.JsonRpcProvider(rpc);
        const code = await Promise.race([
          vProvider.getCode(safeAddress),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
        ]);
        if (code !== '0x') {
          verified = true;
          console.log(
            `✅ BNB Safe verified on-chain (attempt ${attempt}, rpc: ${rpc.slice(0, 40)})`
          );
          break;
        }
      } catch (e) {
        console.warn(`⚠️ getCode failed on ${rpc.slice(0, 40)}: ${e.message}`);
      }
    }
    if (!verified) {
      console.warn(`⚠️ BNB Safe not yet visible (attempt ${attempt}/3) — node sync lag`);
    }
  }

  if (!verified) {
    throw new Error(
      `BNB Safe contract not found at ${safeAddress} after tx confirmation. ` +
        `Deployment likely failed — Safe factory may not exist on this network.`
    );
  }

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress,
    deploymentTx: txResponse.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentityBNB };