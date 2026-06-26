// packages/backend/src/services/userServiceBNB.js
const { ethers } = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;
const FACTORY_ABI = ['event ProxyCreation(address proxy,address singleton)'];

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

  console.log('\n========== PREDICTED CONFIG ==========');

  console.dir(predictedSafe, { depth: null });

  console.log('======================================\n');

  const protocolKit = await Safe.init({
    provider: rpcUrl,
    signer: wallet.privateKey,
    predictedSafe,
  });

  const contractManager = await protocolKit.getContractManager();

  console.log('\n========== SAFE CONTRACTS ==========');

  try {
    console.log('Proxy Factory:', await contractManager.safeProxyFactory.getAddress());
  } catch (e) {
    console.log('Factory error:', e.message);
  }

  try {
    console.log('Singleton:', await contractManager.safeSingleton.getAddress());
  } catch (e) {
    console.log('Singleton error:', e.message);
  }

  try {
    console.log(
      'Fallback Handler:',
      await contractManager.compatibilityFallbackHandler.getAddress()
    );
  } catch (e) {
    console.log('Fallback error:', e.message);
  }

  console.log('====================================\n');

  console.log('\n========== SAFE SDK ==========');

  try {
    console.log(await protocolKit.getContractManager());
  } catch (err) {
    console.log('Contract Manager Error:', err.message);
  }

  console.log('==============================\n');

  console.log('\n========== SAFE INIT ==========');
  console.log('RPC:', rpcUrl);
  console.log('Chain ID:', await provider.getNetwork());
  console.log('Backend Wallet:', wallet.address);
  console.log('Owner Address:', owner.address);
  console.log('Safe Version:', predictedSafe.safeDeploymentConfig.safeVersion);
  console.log('===============================\n');

  // Don't trust the SDK predicted address on BNB.
  // The real deployed address will be read from ProxyCreation.

  let safeAddress = null;

  const deployTx = await protocolKit.createSafeDeploymentTransaction();
  console.log('\n========== DEPLOY CALLDATA ==========');
  console.log('Factory:', deployTx.to);
  console.log('Data:', deployTx.data);
  console.log('Data size:', deployTx.data.length);
  console.log('=====================================\n');
  console.log('\n========== DEPLOY TX ==========');
  console.log(deployTx);
  console.log('Factory:', deployTx.to);
  console.log('Value:', deployTx.value);
  console.log('Data Length:', deployTx.data.length);
  console.log('===============================\n');
  let txResponse;
  try {
    const balance = await provider.getBalance(wallet.address);

    console.log('\n========== BACKEND WALLET ==========');
    console.log('Backend:', wallet.address);
    console.log('Balance:', ethers.formatEther(balance), 'BNB');
    console.log('====================================\n');
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

  console.log('\n========== TX SENT ==========');
  console.log('Hash:', txResponse.hash);
  console.log('Nonce:', txResponse.nonce);
  console.log('=============================\n');

  const receipt = await txResponse.wait();

  console.log('\n========== RAW LOGS ==========');

  receipt.logs.forEach((log, i) => {
    console.log(`\nLOG ${i}`);

    console.log('address:', log.address);

    console.log('topics:', log.topics);

    console.log('data:', log.data);
  });

  console.log('==============================\n');

  const iface = new ethers.Interface(FACTORY_ABI);

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog(log);

      safeAddress = parsed.args.proxy;

      console.log('\n========== SAFE CREATED ==========');
      console.log('SAFE:', safeAddress);
      console.log('SINGLETON:', parsed.args.singleton);
      console.log('==================================\n');

      break;
    } catch {}
  }

  if (!safeAddress) {
    throw new Error('Safe ProxyCreation event not found.');
  }

  console.log('\n========== RECEIPT ==========');
  console.log(receipt);
  console.log('Status:', receipt.status);
  console.log('Gas Used:', receipt.gasUsed.toString());
  console.log('Block:', receipt.blockNumber);
  console.log('Logs:', receipt.logs.length);
  console.log('To:', receipt.to);
  console.log('================================\n');
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
          console.log('\n========== VERIFY SUCCESS ==========');
          console.log('RPC:', rpc);
          console.log('Code Length:', code.length);
          console.log(code.slice(0, 80));
          console.log('====================================\n');
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

    console.log('\n========== FINAL VERIFICATION ==========');
    console.log('Verified:', verified);
    console.log('Safe:', safeAddress);

    try {
      const finalCode = await provider.getCode(safeAddress);
      console.log('Main RPC Code:', finalCode);
    } catch (e) {
      console.log('Main RPC Error:', e.message);
    }

    console.log('========================================\n');

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

  const explorer =
    process.env.NODE_ENV === 'production'
      ? `https://bscscan.com/address/${safeAddress}`
      : `https://testnet.bscscan.com/address/${safeAddress}`;

  console.log('\n========== EXPLORER ==========');
  console.log(explorer);
  console.log('==============================\n');

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress,
    deploymentTx: txResponse.hash,
  };
}

module.exports = { generateAndDeploySalvaIdentityBNB };
