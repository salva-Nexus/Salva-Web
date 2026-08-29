import Safe from '@safe-global/protocol-kit';
import { ethers } from 'ethers';
import {
  SAFE_PROXY_FACTORY,
  SAFE_SETUP,
  FACTORY_EVENT,
  SAFE,
  ERC20,
  REGISTRY,
  MULTISEND,
  CHAINLINK,
  FACTORY_IFACE,
  POOL_IFACE,
} from '../utils/abi.js';
import fetchRate from '../utils/fetchRate.js';
import buff from '../utils/buffer.js';
import { SNS } from '../../salva.js';
import { _asset } from './poolServices.js';
import Rate from '../models/Rate.js';

const mode = process.env.NODE_ENV;
const MULTI_SEND_BASE_ADDRESS =
  mode === 'development'
    ? '0xfA117BCFd4C5221B1aD8835EB3905Dc2A4500425'
    : '0xB7B32a484D49D555ec8519cC35eC5907353d9Ca3';

const MULTI_SEND_BNB_ADDRESS =
  mode === 'development'
    ? '0x5270A710B4df2ecB457Be1aCA29fbD6C34435eb6'
    : '0x63bF68FE0280799E43009eb66D7a1E4248082E14';

const dummySafe = process.env.DUMMY_SAFE;
const dummyKey = process.env.DUMMY_KEY;
const dummyBasePool = process.env.DUMMY_BASE_POOL;
const dummyBnbPool = process.env.DUMMY_BNB_POOL;
const maxAgeMs = 2 * 60 * 60 * 1000;
const baseRpcUrl =
  mode === 'development'
    ? process.env.BASE_SEPOLIA_RPC_URL || process.env.BASE_SEPOLIA_RPC_URL_FALLBACK
    : process.env.BASE_MAINNET_RPC_URL;

const bnbRpcUrl =
  mode === 'development'
    ? process.env.BNB_TESTNET_RPC_URL || process.env.BNB_LOGS_RPC_URL
    : process.env.BNB_MAINNET_RPC_URL;

const singleton = '0x29fcb43b46531bca003ddc8fcb67ffe91900c762';
const factory = process.env.SAFE_PROXY_FACTORY;
const fallbackHandler = '0xf48f2B2d2a534e402487b3ee7C18c33Aec0Fe5e4';
const DEPLOYMENT_SALT_MESSAGE = 'NEW_SALVA_SAFE_DEPLOYMENT';
const regFactory = process.env.REGISTRY_FACTORY;
const basePoolFactory = process.env.BASE_POOL_FACTORY_ADDRESS;
const bnbPoolFactory = process.env.BSC_POOL_FACTORY_ADDRESS;
const treasury = process.env.TREASURY_CONTRACT_ADDRESS;

const ngnsBaseAddress = process.env.NGN_TOKEN_ADDRESS;
const cngnBaseAddress = process.env.CNGN_CONTRACT_ADDRESS;
const usdtBaseAddress = process.env.USDT_CONTRACT_ADDRESS;
const usdcBaseAddress = process.env.USDC_CONTRACT_ADDRESS;

const ngnsBnbAddress = process.env.BSC_NGN_TOKEN_ADDRESS;
const cngnBnbAddress = process.env.BSC_CNGN_CONTRACT_ADDRESS;
const usdtBnbAddress = process.env.BSC_USDT_CONTRACT_ADDRESS;
const usdcBnbAddress = process.env.BSC_USDC_CONTRACT_ADDRESS;

async function estimateDeploymentFee() {
  // This function is Non Fatal
  const owner = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY);
  const data = _buildFactoryData(owner);

  const baseProvider = new ethers.JsonRpcProvider(baseRpcUrl);
  const bnbProvider = new ethers.JsonRpcProvider(bnbRpcUrl);

  const baseSigner = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, baseProvider);
  const bnbSigner = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, bnbProvider);

  try {
    const baseGasCost = await baseSigner.estimateGas(data);
    const bnbGasCost = await bnbSigner.estimateGas(data);

    const baseGasPrice = (await baseProvider.getFeeData()).gasPrice;
    const bnbGasPrice = (await bnbProvider.getFeeData()).gasPrice;

    const baseEthCost = ethers.formatEther(baseGasCost * baseGasPrice);
    const bnbCost = ethers.formatEther(bnbGasCost * bnbGasPrice);
    const baseCostInUsd = await _ethCostInUsd(Number(baseEthCost), baseProvider, 'base');

    const bnbCostInUsd = await _ethCostInUsd(Number(bnbCost), bnbProvider, 'bnb');
    console.log('Base Usd Cost: ', baseCostInUsd);
    console.log('Base Usd Cost: ', bnbCostInUsd);

    let ngnRate = mode === 'development' ? { status: true, data: 1000.0 } : await fetchRate();
    console.log('Ngn Rate: ', ngnRate);

    if (!ngnRate.status) {
      await new Promise((r) => setTimeout(r, 5000));
      ngnRate = await fetchRate();
    }

    let baseCostInNgn;
    let bnbCostInNgn;
    if (!ngnRate.status) {
      // Non fatal
      ngnRate.data = 0;
    } else {
      baseCostInNgn = Math.ceil(ngnRate.data * baseCostInUsd.data * 1000) / 1000;
      bnbCostInNgn = Math.ceil(ngnRate.data * bnbCostInUsd.data * 1000) / 1000;
    }

    const value = {
      status: true,
      data: {
        BASE: {
          NGN: !baseCostInNgn || isNaN(baseCostInNgn) ? 3 : baseCostInNgn,
          USD: !baseCostInUsd.data || isNaN(baseCostInUsd.data) ? 0.0025 : baseCostInUsd.data,
        },
        BNB: {
          NGN: !bnbCostInNgn || isNaN(bnbCostInNgn) ? 22 : bnbCostInNgn,
          USD: !bnbCostInUsd.data || isNaN(bnbCostInUsd.data) ? 0.026 : bnbCostInUsd.data,
        },
      },
    };
    return value;
  } catch (err) {
    return {
      status: false,
      data: `${err.message}`,
    };
  }
}

// ==================================================================================

async function estimateTransferFee(chain, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildTransferData(provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildTransferData(provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(dummyKey, provider);
  const safe = new ethers.Contract(dummySafe, SAFE, sponsor);
  const firstTx = [treasury, '10000'];
  const secondTx = [treasury, '10000'];
  const token =
    chain === 'base' ? process.env.NGN_TOKEN_ADDRESS : process.env.BSC_NGN_TOKEN_ADDRESS;
  const data = [firstTx, secondTx];
  let to = [];
  let value = [];
  let encodedData = [];
  const erc20Contract = new ethers.Interface(ERC20);
  for (let i = 0; i < data.length; i++) {
    let hex = erc20Contract.encodeFunctionData('transfer', data[i]);
    to.push(token);
    value.push(0n);
    encodedData.push(hex);
  }

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };
  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );

  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);
  return {
    to: dummySafe,
    value: 0n,
    data: safeData,
  };
}

function _appendSafeReq(sig) {
  const v = Number(ethers.toBigInt(`0x${sig.slice(-2)}`));
  const newV = ethers.toBeHex(BigInt(v + 4)).slice(-2);
  const cutSig = sig.slice(0, sig.length - 2);
  return `${cutSig}${newV}`;
}

async function _buildFactoryData(owner) {
  const saltNonce = await deriveSaltNonce(owner, 0); // 0 = first deployment for this user

  const setupIface = new ethers.Interface(SAFE_SETUP);
  const setupCalldata = setupIface.encodeFunctionData('setup', [
    [owner.address],
    1,
    ethers.ZeroAddress,
    '0x',
    fallbackHandler,
    ethers.ZeroAddress,
    0,
    ethers.ZeroAddress,
  ]);

  const factoryIface = new ethers.Interface(SAFE_PROXY_FACTORY);
  const factoryCalldata = factoryIface.encodeFunctionData('createProxyWithNonce', [
    singleton,
    setupCalldata,
    saltNonce,
  ]);

  const data = {
    to: factory,
    value: 0n,
    data: factoryCalldata,
  };
  return data;
}

async function _ethCostInUsd(etherCost, provider, chain) {
  let contract;
  if (chain === 'base') {
    if (mode === 'development') {
      contract = process.env.CHAINLINK_ETH_USD_FEED_BASE_SEP;
    } else {
      contract = process.env.CHAINLINK_ETH_USD_FEED_BASE;
    }
  } else {
    if (mode === 'development') {
      contract = process.env.CHAINLINK_BNB_USD_FEED_BSC_TEST;
    } else {
      contract = process.env.CHAINLINK_BNB_USD_FEED_BSC;
    }
  }
  const aggregator = new ethers.Contract(contract, CHAINLINK, provider);
  try {
    const data = await aggregator.latestRoundData();
    const dec = await aggregator.decimals();
    const isStale = Date.now() - Number(data.updatedAt) * 1000 > maxAgeMs;
    if (isStale) {
      console.error(`Price is stale`);
      return {
        status: false,
        data: 0,
      };
    }
    return {
      status: true,
      data: Math.ceil(etherCost * ethers.formatUnits(data.answer, dec) * 10000) / 10000,
    };
  } catch (err) {
    return {
      status: false,
      data: `Calculate Cost Error: ${err.message}`,
    };
  }
}

async function deriveSaltNonce(ownerWallet, deploymentIndex = 0) {
  const message = `${DEPLOYMENT_SALT_MESSAGE}:${deploymentIndex}`;
  const signature = await ownerWallet.signMessage(message);
  const hash = ethers.keccak256(signature);
  return BigInt(hash);
}

async function estimatePoolDeploymentFee(chain, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildPoolDeploymentData(
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    chain
  );

  const gasCost = await sponsor.estimateGas(data.data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildPoolDeploymentData(
  safeAddress = dummySafe,
  privateKey = dummyKey,
  txFee = '1000',
  feeToken,
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const firstTx = [];
  const secondTx = [treasury, txFee];
  let ftoken =
    feeToken === undefined
      ? chain === 'base'
        ? process.env.NGN_TOKEN_ADDRESS
        : process.env.BSC_NGN_TOKEN_ADDRESS
      : feeToken;

  const pool_factory = chain === 'base' ? basePoolFactory : bnbPoolFactory;
  const data = [firstTx, secondTx];
  let to = [pool_factory, ftoken];
  let value = [0n, 0n];
  const poolFactoryContract = new ethers.Interface(FACTORY_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  let deployPoolCalldata = poolFactoryContract.encodeFunctionData('deployPool', data[0]);
  let transferFeeCalldata = erc20Contract.encodeFunctionData('transfer', data[1]);
  let encodedData = [deployPoolCalldata, transferFeeCalldata];

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };
  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );

  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);

  const safeParams = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    op: safeTx.op,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    sig: newSig,
  };
  return {
    safe: safe,
    data: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function estimateAdd_RemoveLiqFee(chain, type, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildAdd_RemoveLiqData(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    chain,
    type
  );

  const gasCost = await sponsor.estimateGas(data.data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildAdd_RemoveLiqData(
  safeAddress = dummySafe,
  privateKey = dummyKey,
  txFee = '1000',
  feeToken,
  poolAddress,
  asset,
  amount = '500',
  provider,
  sponsor,
  chain,
  type
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const poolAddr =
    poolAddress === undefined ? (chain === 'base' ? dummyBasePool : dummyBnbPool) : poolAddress;
  const assetToken =
    asset === undefined ? (chain === 'base' ? ngnsBaseAddress : ngnsBnbAddress) : asset;
  const firstTx = [poolAddr, amount];
  const secondTx = [assetToken, amount];
  let ftoken =
    feeToken === undefined
      ? chain === 'base'
        ? process.env.NGN_TOKEN_ADDRESS
        : process.env.BSC_NGN_TOKEN_ADDRESS
      : feeToken;
  const thirdTx = [treasury, txFee];
  let to = type === 'provide' ? [assetToken, poolAddr, ftoken] : [poolAddr, ftoken];
  let value = type === 'provide' ? [0n, 0n, 0n] : [0n, 0n];
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  let approveCalldata = erc20Contract.encodeFunctionData('approve', firstTx);
  let provideLiquidityCalldata = poolContract.encodeFunctionData('provideLiquidity', secondTx);
  let removeLiquidityCalldata = poolContract.encodeFunctionData('removeLiquidity', secondTx);
  let transferFeeCalldata = erc20Contract.encodeFunctionData('transfer', thirdTx);
  let encodedData =
    type === 'provide'
      ? [approveCalldata, provideLiquidityCalldata, transferFeeCalldata]
      : [removeLiquidityCalldata, transferFeeCalldata];
  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };
  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );

  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);

  const safeParams = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    op: safeTx.op,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    sig: newSig,
  };
  return {
    safe: safe,
    data: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function estimateUpdateRateFee(chain, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildUpdateRateData(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    chain
  );

  const gasCost = await sponsor.estimateGas(data.data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildUpdateRateData(
  safeAddress = dummySafe,
  privateKey = dummyKey,
  txFee = '1000',
  feeToken,
  poolAddress,
  rate = '1200',
  type = 'buy',
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const poolAddr =
    poolAddress === undefined ? (chain === 'base' ? dummyBasePool : dummyBnbPool) : poolAddress;
  const firstTx = [rate];
  let ftoken =
    feeToken === undefined
      ? chain === 'base'
        ? process.env.NGN_TOKEN_ADDRESS
        : process.env.BSC_NGN_TOKEN_ADDRESS
      : feeToken;
  const secondTx = [treasury, txFee];
  let to = [poolAddr, ftoken];
  let value = [0n, 0n];
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  let updateRateCalldata = poolContract.encodeFunctionData(
    type === 'buy' ? 'updateBuyRate' : 'updateSellRate',
    firstTx
  );
  let transferFeeCalldata = erc20Contract.encodeFunctionData('transfer', secondTx);
  let encodedData = [updateRateCalldata, transferFeeCalldata];

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };
  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );

  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);

  const safeParams = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    op: safeTx.op,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    sig: newSig,
  };
  return {
    safe: safe,
    data: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function estimateUpdatePauseStateFee(chain, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildUpdatePauseStateData(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    chain
  );

  const gasCost = await sponsor.estimateGas(data.data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildUpdatePauseStateData(
  safeAddress = dummySafe,
  privateKey = dummyKey,
  txFee = '100',
  feeToken,
  poolAddress,
  state = 'pause',
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const poolAddr =
    poolAddress === undefined ? (chain === 'base' ? dummyBasePool : dummyBnbPool) : poolAddress;
  const firstTx = [];
  let ftoken =
    feeToken === undefined
      ? chain === 'base'
        ? process.env.NGN_TOKEN_ADDRESS
        : process.env.BSC_NGN_TOKEN_ADDRESS
      : feeToken;
  const secondTx = [treasury, txFee];
  let to = [poolAddr, ftoken];
  let value = [0n, 0n];
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  let updatePauseStateCalldata = poolContract.encodeFunctionData(
    state === 'pause' ? 'pause' : 'unpause',
    firstTx
  );
  let transferFeeCalldata = erc20Contract.encodeFunctionData('transfer', secondTx);
  let encodedData = [updatePauseStateCalldata, transferFeeCalldata];

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };
  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );

  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);

  const safeParams = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    op: safeTx.op,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    sig: newSig,
  };
  return {
    safe: safe,
    data: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function estimateSwapFee(chain, isTrusted, tx) {
  const provider =
    chain === 'base'
      ? new ethers.JsonRpcProvider(baseRpcUrl)
      : new ethers.JsonRpcProvider(bnbRpcUrl);

  const sponsor = new ethers.Wallet(process.env.MANAGER_PRIVATE_KEY, provider);
  const data = await _buildSwapData(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    chain,
    undefined,
    isTrusted
  );

  const gasCost = await sponsor.estimateGas(data.data);
  return await _getFee(gasCost, provider, chain, tx);
}

async function _buildSwapData(
  safeAddress = dummySafe,
  privateKey = dummyKey,
  txFee = '100',
  feeToken,
  poolAddress,
  usdToken = 'NGNS',
  ngnToken = 'NGNS',
  amount = '100',
  receiver = dummySafe,
  approveToken = 'NGNS',
  approveAmount = '100',
  provider,
  sponsor,
  chain,
  type = 'swapExactNGNAmountForUSD',
  isTrusted
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const poolAddr =
    poolAddress === undefined ? (chain === 'base' ? dummyBasePool : dummyBnbPool) : poolAddress;
  const firstTx = [poolAddr, approveAmount];
  const secondTx = [receiver, _asset(usdToken, chain), _asset(ngnToken, chain), amount];
  const thirdTx = [treasury, txFee];
  let ftoken =
    feeToken === undefined
      ? chain === 'base'
        ? process.env.NGN_TOKEN_ADDRESS
        : process.env.BSC_NGN_TOKEN_ADDRESS
      : feeToken;

  let to = isTrusted ? [poolAddr, ftoken] : [_asset(approveToken, chain), poolAddr, ftoken];
  let value = isTrusted ? [0n, 0n] : [0n, 0n, 0n];
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  let approveCalldata = erc20Contract.encodeFunctionData('approve', firstTx);
  let swapCalldata = poolContract.encodeFunctionData(type, secondTx);
  let transferFeeCalldata = erc20Contract.encodeFunctionData('transfer', thirdTx);

  let encodedData = isTrusted
    ? [swapCalldata, transferFeeCalldata]
    : [approveCalldata, swapCalldata, transferFeeCalldata];
  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);

  const safeTx = {
    to: chain === 'base' ? MULTI_SEND_BASE_ADDRESS : MULTI_SEND_BNB_ADDRESS,
    value: 0n,
    data: multisendTx,
    op: 1n,
    safeTxGas: 0n,
    baseGas: 0n,
    gasPrice: 0n,
    gasToken: ethers.ZeroAddress,
    refundReceiver: ethers.ZeroAddress,
    nonce: currentNonce,
  };

  const hash = await safe.getTransactionHash(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    safeTx.nonce
  );
  const sig = await signerPack.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);
  const safeIFace = new ethers.Interface(SAFE);
  const safeData = safeIFace.encodeFunctionData('execTransaction', [
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig,
  ]);

  const safeParams = {
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    op: safeTx.op,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    sig: newSig,
  };
  return {
    safe: safe,
    data: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function _getFee(gasCost, provider, chain, tx) {
  const gasPrice = (await provider.getFeeData()).gasPrice;
  console.log(chain, ' gas price: ', gasPrice);
  const ethCost = ethers.formatEther(gasCost * gasPrice);
  const costInUsd = await _ethCostInUsd(Number(ethCost), provider, chain);

  let storedRate = await Rate.findOne({
    active: true,
  });

  if (!storedRate) {
    storedRate = await Rate.create({
      active: true,
    });
  }

  let ngnRate =
    mode === 'development'
      ? { status: true, data: 1000.0 }
      : !tx
        ? { status: true, data: storedRate.rate }
        : await fetchRate();
  if (!ngnRate.status) {
    await new Promise((r) => setTimeout(r, 5000));
    ngnRate = await fetchRate();
  } else {
    if (mode !== 'development') {
      await storedRate.updateOne({
        rate: ngnRate.data,
      });
    }
  }

  if (!ngnRate.status) ngnRate = { status: true, data: storedRate.rate };

  console.log(ngnRate);

  if (!ngnRate.status) {
    // Non fatal
    ngnRate.data = 1000.0;
  }

  const costInNgn = Math.ceil(ngnRate.data * costInUsd.data * 1000) / 1000;

  const safeCostInNgn = !costInNgn || isNaN(costInNgn) ? (chain === 'base' ? 3 : 22) : costInNgn;
  const safeCostInUsd =
    !costInUsd.data || isNaN(costInUsd.data) ? (chain === 'base' ? 0.0025 : 0.015) : costInUsd.data;

  const value = {
    status: true,
    data: {
      feeNGN: chain === 'base' ? buff(safeCostInNgn, 600) : buff(safeCostInNgn, 150),
      feeUsd: chain === 'base' ? buff(safeCostInUsd, 600) : buff(safeCostInUsd, 150),
    },
  };
  return value;
  return value;
}

export {
  estimateDeploymentFee,
  estimateTransferFee,
  estimatePoolDeploymentFee,
  estimateAdd_RemoveLiqFee,
  estimateUpdateRateFee,
  estimateUpdatePauseStateFee,
  estimateSwapFee,
  _buildSwapData,
  _buildUpdatePauseStateData,
  _buildUpdateRateData,
  _buildFactoryData,
  _buildAdd_RemoveLiqData,
  _buildPoolDeploymentData,
  _appendSafeReq,
};
