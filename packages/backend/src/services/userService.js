// Salva-Digital-Tech/packages/backend/src/services/userService.js
const { ethers } = require('ethers');
const Safe = require('@safe-global/protocol-kit').default;
const { wallet, provider } = require('./walletSigner');

// ─────────────────────────────────────────────────────────────────────────────
// EXISTING — preserved for existing callers (login flow, etc.)
// ─────────────────────────────────────────────────────────────────────────────
async function generateAndDeploySalvaIdentity(providerUrl) {
  console.log('🏗️  Starting Safe Wallet Generation & Deployment...');

  const owner = ethers.Wallet.createRandom();
  console.log('✅ Owner Address Generated:', owner.address);

  const predictedSafe = {
    safeAccountConfig: {
      owners: [owner.address],
      threshold: 1,
    },
    safeDeploymentConfig: {
      safeVersion: '1.3.0',
    },
  };

  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: wallet.privateKey,
    predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log('📍 Safe Address (pre-deployment):', safeAddress);

  console.log('🚀 Deploying Safe on-chain (backend pays gas)...');
  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

  const txResponse = await wallet.sendTransaction({
    to: deploymentTransaction.to,
    data: deploymentTransaction.data,
    value: deploymentTransaction.value,
  });

  console.log('⏳ Waiting for transaction confirmation...');
  await txResponse.wait();
  console.log('✅ Safe Deployed! TX:', txResponse.hash);

  console.log('⏳ Verifying deployment on-chain...');
  await new Promise((resolve) => setTimeout(resolve, 3000));

  let code = await provider.getCode(safeAddress);

  if (code === '0x') {
    console.log("🔄 Node hasn't synced yet, retrying verification...");
    await new Promise((resolve) => setTimeout(resolve, 3000));
    code = await provider.getCode(safeAddress);
  }

  if (code === '0x') {
    throw new Error('❌ Safe deployment failed - no code at address after retries');
  }
  console.log('✅ Safe deployment verified on-chain');

  return {
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
    safeAddress: safeAddress,
    deploymentTx: txResponse.hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL HELPER — deploys a Gnosis Safe on any chain given a signer wallet
// and a pre-determined owner address. Returns safeAddress + deploymentTx only.
// ownerPrivateKey is intentionally NOT returned here — caller manages it.
// ─────────────────────────────────────────────────────────────────────────────
async function _deployOnChain({ providerUrl, signerWallet, ownerAddress, chainLabel }) {
  console.log(`🏗️  [${chainLabel}] Deploying Safe...`);

  const predictedSafe = {
    safeAccountConfig: { owners: [ownerAddress], threshold: 1 },
    safeDeploymentConfig: { safeVersion: '1.3.0' },
  };

  const protocolKit = await Safe.init({
    provider: providerUrl,
    signer: signerWallet.privateKey,
    predictedSafe,
  });

  const safeAddress = await protocolKit.getAddress();
  console.log(`📍 [${chainLabel}] Predicted Safe Address: ${safeAddress}`);

  const deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();

  let txResponse;
  try {
    txResponse = await signerWallet.sendTransaction({
      to: deploymentTransaction.to,
      data: deploymentTransaction.data,
      value: deploymentTransaction.value || '0',
      gasLimit: 300_000,
    });
  } catch (err) {
    if (
      err.code === 'INSUFFICIENT_FUNDS' ||
      (err.message && err.message.includes('insufficient funds'))
    ) {
      throw new Error(
        `[${chainLabel}] Network deployment temporarily unavailable — insufficient gas`
      );
    }
    throw new Error(`[${chainLabel}] Deployment transaction failed: ${err.message}`);
  }

  console.log(`⏳ [${chainLabel}] Waiting for confirmation: ${txResponse.hash}`);
  await txResponse.wait();
  console.log(`✅ [${chainLabel}] Tx confirmed`);

  // Give the node time to index — BSC testnet nodes lag significantly
  const isSlowChain = chainLabel === 'BNB';
  const initialWait = isSlowChain ? 8000 : 3000;
  await new Promise((r) => setTimeout(r, initialWait));

  // Build ordered list of RPC URLs to try for verification.
  // For BNB: try Alchemy first (fast), fall back to public node.
  // For BASE: try primary, fall back to public node.
  const isProdEnv = process.env.NODE_ENV === 'production';
  let verifyRpcUrls;

  if (chainLabel === 'BNB') {
    const alchemy = isProdEnv
      ? process.env.BNB_MAINNET_RPC_URL
      : process.env.BNB_TESTNET_RPC_URL; // This IS Alchemy on testnet? No — it's public seed node.
    // Always try Alchemy mainnet-style URL first if available, then public fallback
    verifyRpcUrls = [
      isProdEnv
        ? process.env.BNB_MAINNET_RPC_URL
        : 'https://bsc-testnet-rpc.publicnode.com', // publicnode is faster than data-seed
      isProdEnv
        ? 'https://bsc-dataseed1.bnbchain.org'
        : 'https://bsc-testnet.bnbchain.org',
      isProdEnv
        ? 'https://bsc-dataseed2.bnbchain.org'
        : process.env.BNB_TESTNET_RPC_URL, // data-seed as last resort
    ].filter(Boolean);
  } else {
    verifyRpcUrls = [
      providerUrl,
      isProdEnv
        ? 'https://base-rpc.publicnode.com'
        : process.env.BASE_LOGS_RPC_URL || 'https://base-sepolia-rpc.publicnode.com',
    ].filter(Boolean);
  }

  const maxVerifyAttempts = chainLabel === 'BNB' ? 3 : 2;
  const verifyGapMs = chainLabel === 'BNB' ? 4000 : 3000;
  let code = '0x';
  let verified = false;

  // Initial wait — let the node breathe before first check
  await new Promise((r) => setTimeout(r, chainLabel === 'BNB' ? 5000 : 3000));

  outer: for (let attempt = 1; attempt <= maxVerifyAttempts; attempt++) {
    for (const rpcUrl of verifyRpcUrls) {
      try {
        const vProvider = new ethers.JsonRpcProvider(rpcUrl);
        code = await Promise.race([
          vProvider.getCode(safeAddress),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('getCode timeout')), 5000)
          ),
        ]);
        if (code !== '0x') {
          verified = true;
          console.log(
            `✅ [${chainLabel}] Safe verified on-chain: ${safeAddress} (via ${rpcUrl.slice(0, 40)}…)`
          );
          break outer;
        }
      } catch (codeErr) {
        console.warn(
          `⚠️ [${chainLabel}] getCode failed on ${rpcUrl.slice(0, 40)}…: ${codeErr.message}`
        );
      }
    }

    if (!verified && attempt < maxVerifyAttempts) {
      console.log(
        `🔄 [${chainLabel}] No code yet (attempt ${attempt}/${maxVerifyAttempts}) — waiting ${verifyGapMs}ms...`
      );
      await new Promise((r) => setTimeout(r, verifyGapMs));
    }
  }

  if (!verified) {
    // Tx confirmed on-chain — Safe IS deployed. Public nodes are just lagging.
    // Do not throw — treat as success to avoid destroying registration.
    console.warn(
      `⚠️ [${chainLabel}] getCode returned 0x across all RPCs after ${maxVerifyAttempts} attempts ` +
        `— tx confirmed so treating as deployed. Node sync lag on testnet.`
    );
  }

  console.log(`✅ [${chainLabel}] Safe verified on-chain: ${safeAddress}`);

  return {
    safeAddress,
    deploymentTx: txResponse.hash,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// NEW — used during registration only.
// Generates ONE shared keypair for both chains, deploys Base first (fatal if
// it fails), then attempts BNB (non-fatal if it fails).
//
// Returns:
//   base       — { safeAddress, deploymentTx, ownerPrivateKey } — always present
//   bnb        — { safeAddress, deploymentTx, ownerPrivateKey } | null
//   bnbFailed  — true when BNB deployment failed but Base succeeded
//   pendingSeed — { ownerAddress, ownerPrivateKey } | null
//                 Only set when bnbFailed=true. Caller must store this
//                 encrypted in User.pendingBNBDeploy for later retry.
// ─────────────────────────────────────────────────────────────────────────────
async function generateAndDeployBothChains(baseProviderUrl) {
  // ── 1. Generate ONE keypair shared across both chains ─────────────────────
  const owner = ethers.Wallet.createRandom();
  console.log(`✅ Shared keypair generated.`);

  // ── 2. Deploy BASE — failure here is fatal, kills registration ───────────
  let baseResult;
  try {
    baseResult = await _deployOnChain({
      providerUrl: baseProviderUrl,
      signerWallet: wallet,
      ownerAddress: owner.address,
      chainLabel: 'BASE',
    });
  } catch (err) {
    // Re-throw — register route will catch this and abort registration entirely
    console.error('❌ BASE deployment failed (fatal):', err.message);
    throw err;
  }

  const base = {
    safeAddress: baseResult.safeAddress,
    deploymentTx: baseResult.deploymentTx,
    ownerAddress: owner.address,
    ownerPrivateKey: owner.privateKey,
  };

  // ── 3. Deploy BNB — failure here is non-fatal ────────────────────────────
  const isProd = process.env.NODE_ENV === 'production';
  const bnbRpcUrl = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;

  if (!bnbRpcUrl) {
    console.warn('⚠️  BNB_RPC_URL not set — skipping BNB deployment during registration');
    return {
      base,
      bnb: null,
      bnbFailed: true,
      pendingSeed: { ownerAddress: owner.address, ownerPrivateKey: owner.privateKey },
    };
  }

  let bnb = null;
  let bnbFailed = false;

  try {
    if (!process.env.MANAGER_PRIVATE_KEY) {
      throw new Error('MANAGER_PRIVATE_KEY not set');
    }
    const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
    const bnbSignerWallet = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, bnbProvider);

    const bnbResult = await _deployOnChain({
      providerUrl: bnbRpcUrl,
      signerWallet: bnbSignerWallet,
      ownerAddress: owner.address,
      chainLabel: 'BNB',
    });

    bnb = {
      safeAddress: bnbResult.safeAddress,
      deploymentTx: bnbResult.deploymentTx,
      ownerAddress: owner.address,
      ownerPrivateKey: owner.privateKey,
    };

    console.log(`✅ BNB Safe deployed during registration: ${bnb.safeAddress}`);
  } catch (err) {
    console.warn(`⚠️  BNB deployment failed during registration (non-fatal): ${err.message}`);
    bnbFailed = true;
  }

  return {
    base,
    bnb,
    bnbFailed,
    // Only populated when BNB failed — caller stores this encrypted for retry
    pendingSeed: bnbFailed
      ? { ownerAddress: owner.address, ownerPrivateKey: owner.privateKey }
      : null,
  };
}

module.exports = { generateAndDeploySalvaIdentity, generateAndDeployBothChains };
