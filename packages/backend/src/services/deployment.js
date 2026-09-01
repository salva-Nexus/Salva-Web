import { ethers } from 'ethers';
import { _buildFactoryData } from './estimateFee.js';
import { keyValue } from '../utils/vars.js';

function _getAddress(receipt) {
  const safeFactory = keyValue('safeFactory');
  if (!safeFactory) {
    throw new Error('❌ SAFE_PROXY_FACTORY environment variable is not defined');
  }

  const logs = receipt.logs;
  let address;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.toLowerCase() === safeFactory.toLowerCase()) {
      const cleaned = logs[i].topics[1].slice(26);
      address = `0x${cleaned}`;
      break;
    }
  }

  if (!address) {
    throw new Error('❌ Proxy creation event log not found in receipt');
  }

  return ethers.getAddress(address);
}

// ===================================================================
async function deploySafeWalletBASE_BNB() {
  const baseRpcUrl = keyValue('baseRpcUrl');
  const bnbRpcUrl = keyValue('bnbRpcUrl');
  const sponsorKey = keyValue('sponsorKey');

  if (!sponsorKey) {
    throw new Error('❌ MANAGER_PRIVATE_KEY environment variable is not defined');
  }

  // BASE
  const owner = ethers.Wallet.createRandom();
  console.log('✅ Owner Address Generated:', owner.address);
  const ownerConfig = new ethers.Wallet(owner.privateKey);

  const data = await _buildFactoryData(ownerConfig);

  const baseProvider = new ethers.JsonRpcProvider(baseRpcUrl);
  const baseSponsor = new ethers.Wallet(sponsorKey, baseProvider);

  const baseTransactionHash = await baseSponsor.sendTransaction(data);

  const baseReceipt = await baseTransactionHash.wait();
  const baseSafeAddress = _getAddress(baseReceipt);

  let code = await baseProvider.getCode(baseSafeAddress);
  if (code === '0x') {
    await new Promise((r) => setTimeout(r, 15000));
    code = await baseProvider.getCode(baseSafeAddress);
  }

  if (code === '0x') {
    throw new Error('❌ Deployment not successful on BASE');
  }

  // BNB - Non-Fatal
  let bnbSafeAddress = '0x';
  let bnbSuccess = false;

  try {
    const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);
    const bnbSponsor = new ethers.Wallet(sponsorKey, bnbProvider);

    const bnbTransactionHash = await bnbSponsor.sendTransaction(data);

    const bnbReceipt = await bnbTransactionHash.wait();
    bnbSafeAddress = _getAddress(bnbReceipt);

    let bnbCode = await bnbProvider.getCode(bnbSafeAddress);
    if (bnbCode === '0x') {
      await new Promise((r) => setTimeout(r, 15000));
      bnbCode = await bnbProvider.getCode(bnbSafeAddress);
    }

    if (bnbCode !== '0x') {
      bnbSuccess = true;
    }
  } catch (err) {
    console.error(`⚠️ BNB deployment error (Non-Fatal): ${err.message}`);
    bnbSuccess = false;
  }

  return {
    status: true,
    data: {
      basesafe: baseSafeAddress,
      bnbSafe: bnbSafeAddress,
      pkey: owner.privateKey,
      bnbSuccess: bnbSuccess,
    },
  };
}

export { deploySafeWalletBASE_BNB, _getAddress };
