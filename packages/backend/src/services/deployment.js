import { ethers } from 'ethers';
import { _buildFactoryData } from './estimateFee.js';
import { keyValue, setup } from '../utils/vars.js';
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import { FACTORY_ABI } from '../utils/abi.js';
import { appendBuilderCode } from '../utils/builderCode.js';
// ===================================================================
async function getSafeWallet(chain) {
  const rpcUrl = getRpcUrlByChain(chain);
  const sponsorKey = keyValue('sponsorKey');

  if (!sponsorKey) {
    throw new Error('❌ MANAGER_PRIVATE_KEY environment variable is not defined');
  }

  const owner = ethers.Wallet.createRandom();
  console.log('✅ Owner Address Generated:', owner.address);
  
  const factory = new ethers.Contract(
    keyValue('safeFactory'),
    FACTORY_ABI,
    new ethers.JsonRpcProvider(rpcUrl)
  );
  
  const factoryProxyCreationCode = await factory.proxyCreationCode();
  const abiCoder = ethers.AbiCoder.defaultAbiCoder();
  const safe = abiCoder.encode(
    ['address'],
    [keyValue('safeL2Singleton')]
  );
  const init = ethers.concat([factoryProxyCreationCode, safe]);
  const initHash = ethers.keccak256(init);
  const initializer = setup(owner.address);
  const salt = ethers.keccak256(
    ethers.solidityPacked(['bytes32', 'uint256'], [ethers.keccak256(initializer), 0])
  );
  const address = ethers.getCreate2Address(keyValue('safeFactory'), salt, initHash);
  return {
    status: true,
    data: {
      safe: address,
      pkey: owner.privateKey,
    },
  };
}


async function _deploySafe(safe, pKey, provider, chain) {
  const ownerConfig = new ethers.Wallet(pKey);
  const data = await _buildFactoryData(ownerConfig, chain);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  // const transactionHash = await sponsor.sendTransaction(data);
    const transactionHash = await sponsor.sendTransaction({
      ...data,
      data: appendBuilderCode(data.data),
    });
  await transactionHash.wait();
  let code = await provider.getCode(safe);
  if (code === '0x') {
    await new Promise((r) => setTimeout(r, 15000));
    code = await provider.getCode(safe);
  }
  if (code === '0x') {
    throw new Error('❌ Transaction not successful');
  }
}

export { getSafeWallet, _deploySafe };
