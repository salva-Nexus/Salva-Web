import { ethers } from 'ethers';
import {
  SAFE_PROXY_FACTORY,
  SAFE_SETUP,
  SAFE,
  ERC20,
  MULTISEND,
  CHAINLINK,
  FACTORY_IFACE,
  POOL_IFACE,
  SINGLETON,
  MULTISIG,
  CDP_ABI,
} from '../utils/abi.js';
import { SNS } from '../../salva.js';
import { fetchNgnPricePerAsset } from '../utils/fetchRate.js';
import buff from '../utils/buffer.js';
import { keyValue, mode, setup } from '../utils/vars.js';
import {
  getRpcUrlByChain,
  getMultiSendAddress,
  getWhitelistedTokenAddress,
  whitelistedTokens,
  getNativeTokenSymbol,
  isL2,
  getMultisigAddress,
  getPoolFactoryAddress,
} from '../utils/rpcUrls.js';
import { _getBalance, _getDecimals } from './balanceServices.js';

async function estimateDeploymentFee(safe, chain) {
  if (!chain || typeof chain !== 'string') {
    return {
      status: false,
      data: 'Invalid or missing chain parameter',
    };
  }

  const normalizedChain = chain.trim().toLowerCase();
  const rpcUrl = getRpcUrlByChain(normalizedChain);

  if (!rpcUrl) {
    return {
      status: false,
      data: `Unsupported or unconfigured chain: ${chain}`,
    };
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const owner = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const data = await _buildFactoryData(owner);

  const gasCost = await owner.estimateGas(data);
  return await _getFee(safe, gasCost, provider, chain);
}

// ==================================================================================

async function estimateTransferFee(pkey, safe, tokenAddress, to, amount, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const code = await provider.getCode(safe);
  if (code === '0x') {
    return await estimateDeploymentFee(safe, chain);
  }
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const contract =
    tokenAddress !== ethers.ZeroAddress
      ? new ethers.Contract(tokenAddress, ERC20, provider)
      : tokenAddress;
  const decimals = tokenAddress !== ethers.ZeroAddress ? await contract.decimals() : 18;
  const amountToWei = ethers.parseUnits(amount, Number(decimals));
  const tx = {
    token: [tokenAddress],
    to: [to],
    amount: [amountToWei],
  };
  const data = await _buildTransferData(pkey, safe, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildTransferData(senderKey, senderSafe, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(senderKey, provider);
  const safe = new ethers.Contract(senderSafe, SAFE, sponsor);
  const erc20Contract = new ethers.Interface(ERC20);
  let to = [];
  let value = [];
  let callData = [];
  for (let i = 0; i < tx.token.length; i++) {
    if (tx.token[i] !== ethers.ZeroAddress) {
      to.push(tx.token[i]);
      value.push(0n);
      callData.push(erc20Contract.encodeFunctionData('transfer', [tx.to[i], tx.amount[i]]));
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };
  return await _completeTxBuild(safe, senderSafe, signerPack, fData, chain);
}

async function _completeTxBuild(safeConfig, safeAddress, signerPack, data, chain) {
  const currentNonce = await safeConfig.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [
    data.to,
    data.value,
    data.callData,
  ]);
  const safeTx = {
    to: getMultiSendAddress(chain),
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
  const hash = await _getTransactionHash(safeConfig, safeTx);

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
    safe: safeConfig,
    estData: {
      to: safeAddress,
      value: 0n,
      txRawCallData: safeData,
    },
    params: safeParams,
  };
}

async function _getTransactionHash(contract, data) {
  const hash = await contract.getTransactionHash(
    data.to,
    data.value,
    data.data,
    data.op,
    data.safeTxGas,
    data.baseGas,
    data.gasPrice,
    data.gasToken,
    data.refundReceiver,
    data.nonce
  );
  return hash;
}

function _appendSafeReq(sig) {
  const v = Number(ethers.toBigInt(`0x${sig.slice(-2)}`));
  const newV = ethers.toBeHex(BigInt(v + 4)).slice(-2);
  const cutSig = sig.slice(0, sig.length - 2);
  return `${cutSig}${newV}`;
}

async function _buildFactoryData(owner) {
  const saltNonce = 0;
  const setupCalldata = setup(owner.address);

  const factoryIface = new ethers.Interface(SAFE_PROXY_FACTORY);
  const factoryCalldata = factoryIface.encodeFunctionData('createProxyWithNonce', [
    keyValue('safeL2Singleton'),
    setupCalldata,
    saltNonce,
  ]);

  const data = {
    to: keyValue('safeFactory'),
    value: 0n,
    data: factoryCalldata,
  };
  return data;
}

async function _ethCostInUsd(etherCost, provider, chain) {
  const chainKeyMap = {
    base: 'chainlinkBaseFeed',
    bnb: 'chainlinkBnbFeed',
    bsc: 'chainlinkBnbFeed',
  };

  const key = chainKeyMap[chain.toLowerCase()];
  console.log(key);
  const contract = keyValue(key);
  console.log(contract);

  if (!contract) {
    console.error(`Unsupported or unconfigured chain: ${chain}`);
    return {
      status: false,
      data: `Unsupported chain: ${chain}`,
    };
  }

  const aggregator = new ethers.Contract(contract, CHAINLINK, provider);
  const code = await provider.getCode(contract);
  console.log('CONTRACT CODE:', code.slice(0, 32), '.......');

  try {
    const data = await aggregator.latestRoundData();
    const dec = await aggregator.decimals();
    const isStale = Date.now() - Number(data.updatedAt) * 1000 > keyValue('maxAgeMs');

    if (isStale) {
      console.error(`Price is stale`);
      return {
        status: false,
        data: 0,
      };
    }

    console.log('CHAIN LINK ANSWER: ', data.answer, '\n', ethers.formatUnits(data.answer, dec));
    return {
      status: true,
      data: Math.ceil(etherCost * ethers.formatUnits(data.answer, dec) * 10000) / 10000,
    };
  } catch (err) {
    console.error('Deployment Error: ', err.message);
    return {
      status: false,
      data: `Calculate Cost Error: ${err.message}`,
    };
  }
}

async function estimatePoolDeploymentFee(pkey, safe, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const code = await provider.getCode(safe);
  if (code === '0x') {
    return await estimateDeploymentFee(safe, chain);
  }
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolFactoryContract = new ethers.Interface(FACTORY_IFACE);
  const tx = {
    contractAddr: [getPoolFactoryAddress(chain)],
    to: [keyValue('treasury')],
    amount: [0n],
    contract: [poolFactoryContract],
    sig: ['deployPool'],
  };
  const data = await _buildPoolDeploymentData(safe, pkey, tx, provider, sponsor, chain);
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildPoolDeploymentData(safeAddress, privateKey, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);

  const poolFactory = getPoolFactoryAddress(chain);
  let to = [];
  let value = [];
  let callData = [];
  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === poolFactory ? [] : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };
  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateDeployInvFee(
  safe,
  pkey,
  poolAddress,
  base,
  quote,
  priceFeed,
  floor,
  spread,
  amount,
  allowSwapBelowFloor,
  isInverted,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const contract =
    base !== ethers.ZeroAddress ? new ethers.Contract(base, ERC20, provider) : undefined;
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const approve = base !== ethers.ZeroAddress ? 'approve' : undefined;
  const bpsValue = Math.round(parseFloat(spread) * 100);
  const spreadBps = BigInt(bpsValue);
  const tx = {
    contractAddr: approve ? [base, poolAddress] : [poolAddress],
    to: approve ? [poolAddress, '0x'] : ['0x'],
    amount: approve ? [amountWei, amountWei] : [amountWei],
    contract: approve ? [erc20Contract, poolContract] : [poolContract],
    param: {
      in: quote,
      out: base,
      feed: priceFeed,
      floor: ethers.parseEther(String(floor)),
      spread: spreadBps,
      allow: allowSwapBelowFloor,
      isInverted: isInverted,
    },
    sig: approve ? [approve, 'deployInv'] : ['deployInv'],
  };

  const data = await _buildDeployInvData(safe, pkey, poolAddress, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildDeployInvData(safeAddress, pkey, poolAddress, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(pkey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);

  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      const isEth = tx.param.out === ethers.ZeroAddress;
      to.push(tx.contractAddr[i]);
      value.push(isEth ? tx.amount[i] : 0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === poolAddress
            ? [
                tx.param.in,
                tx.param.out,
                tx.param.feed,
                tx.param.floor,
                tx.param.spread,
                isEth ? 0n : tx.amount[i],
                tx.param.allow,
                tx.param.isInverted,
              ]
            : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateUpdateSpreadFee(safe, pkey, poolAddress, base, quote, spread, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const bpsValue = Math.round(parseFloat(spread) * 100);
  const spreadBps = BigInt(bpsValue);
  const tx = {
    contractAddr: [poolAddress],
    to: ['0x'],
    amount: [0n],
    contract: [poolContract],
    param: {
      base: base,
      quote: quote,
      spread: spreadBps,
    },
    sig: ['updateSpread'],
  };

  const data = await _buildUpdateSpreadData(safe, pkey, poolAddress, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildUpdateSpreadData(
  safeAddress,
  pkey,
  poolAddress,
  tx,
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(pkey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);

  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === poolAddress
            ? [tx.param.base, tx.param.quote, tx.param.spread]
            : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateWithdrawFee(safe, pkey, poolAddress, base, quote, assetOut, amount, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const contract =
    assetOut !== ethers.ZeroAddress ? new ethers.Contract(assetOut, ERC20, provider) : undefined;
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  const tx = {
    contractAddr: [poolAddress],
    to: ['0x'],
    amount: [amountWei],
    contract: [poolContract],
    param: {
      base: base,
      quote: quote,
      assetOut: assetOut,
    },
    sig: ['removeLiquidity'],
  };
  const data = await _buildWithdrawData(safe, pkey, poolAddress, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildWithdrawData(safeAddress, pkey, poolAddress, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(pkey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);

  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] === poolAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(
        tx.contract[i].encodeFunctionData(tx.sig[i], [
          tx.param.base,
          tx.param.quote,
          tx.param.assetOut,
          tx.amount[i],
        ])
      );
    } else if ((tx.contractAddr[i] !== poolAddress && tx.contractAddr[i]) !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(tx.contract[i].encodeFunctionData(tx.sig[i], [tx.to[i], tx.amount[i]]));
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };
  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateAddLiquidityFee(safe, pkey, poolAddress, base, quote, amount, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const isEth = base === ethers.ZeroAddress;
  const tokenContract = isEth ? undefined : new ethers.Contract(base, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const approve = !isEth ? 'approve' : undefined;

  const tx = {
    contractAddr: approve ? [base, poolAddress] : [poolAddress],
    to: approve ? [poolAddress, '0x'] : ['0x'],
    amount: approve ? [amountWei, amountWei] : [amountWei],
    contract: approve ? [erc20Contract, poolContract] : [poolContract],
    param: {
      base: base,
      quote: quote,
    },
    sig: approve ? [approve, 'addLiquidity'] : ['addLiquidity'],
  };

  const data = await _buildAddLiquidityData(safe, pkey, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildAddLiquidityData(safeAddress, pkey, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(pkey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const isEth = tx.param.base === ethers.ZeroAddress;

  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.sig[i] === 'addLiquidity') {
      to.push(tx.contractAddr[i]);
      value.push(isEth ? tx.amount[i] : 0n);
      callData.push(
        tx.contract[i].encodeFunctionData(tx.sig[i], [
          tx.param.base,
          tx.param.quote,
          isEth ? 0n : tx.amount[i],
        ])
      );
    } else if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(tx.contract[i].encodeFunctionData(tx.sig[i], [tx.to[i], tx.amount[i]]));
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateSwapExactInputFee(
  safe,
  pkey,
  poolAddress,
  assetin,
  assetOut,
  amountIn,
  minAmountOut,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const code = await provider.getCode(safe);
  if (code === '0x') {
    return await estimateDeploymentFee(safe, chain);
  }
  const contract =
    assetin !== ethers.ZeroAddress ? new ethers.Contract(assetin, ERC20, provider) : undefined;
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amountIn.toString(), decimals);
  const contract1 =
    assetOut !== ethers.ZeroAddress ? new ethers.Contract(assetOut, ERC20, provider) : undefined;
  const decimals1 = contract1 ? await _getDecimals(contract1) : 18;
  const minAmountOutWei = ethers.parseUnits(minAmountOut.toString(), decimals1);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const approve = assetin !== ethers.ZeroAddress ? 'approve' : undefined;
  const tx = {
    contractAddr: approve ? [assetin, poolAddress] : [poolAddress],
    to: approve ? [poolAddress, poolAddress] : [poolAddress],
    amount: approve ? [amountWei, amountWei] : [amountWei],
    contract: approve ? [erc20Contract, poolContract] : [poolContract],
    param: {
      tokenIn: assetin,
      tokenOut: assetOut,
      amountThreshold: minAmountOutWei,
    },
    sig: approve ? [approve, 'swapExactInput'] : ['swapExactInput'],
  };
  const data = await _buildSwapData(safe, pkey, poolAddress, tx, provider, sponsor, chain);

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function estimateSwapExactOutputFee(
  safe,
  pkey,
  poolAddress,
  assetIn,
  assetOut,
  amountOut,
  maxAmountIn,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
   const code = await provider.getCode(safe);
   if (code === '0x') {
     return await estimateDeploymentFee(safe, chain);
   }

  // Parse decimals for tokenOut (amountOut) and tokenIn (maxAmountIn)
  const outContract =
    assetOut !== ethers.ZeroAddress ? new ethers.Contract(assetOut, ERC20, provider) : undefined;
  const outDecimals = outContract ? await _getDecimals(outContract) : 18;
  const amountOutWei = ethers.parseUnits(amountOut.toString(), outDecimals);
  const inContract =
    assetIn !== ethers.ZeroAddress ? new ethers.Contract(assetIn, ERC20, provider) : undefined;
  const inDecimals = inContract ? await _getDecimals(inContract) : 18;
  const maxAmountInWei = ethers.parseUnits(maxAmountIn.toString(), inDecimals);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const approve = assetIn !== ethers.ZeroAddress ? 'approve' : undefined;

  const tx = {
    contractAddr: approve ? [assetIn, poolAddress] : [poolAddress],
    to: approve ? [poolAddress, poolAddress] : [poolAddress],
    amount: approve ? [maxAmountInWei, amountOutWei] : [amountOutWei],
    contract: approve ? [erc20Contract, poolContract] : [poolContract],
    param: {
      tokenIn: assetIn,
      tokenOut: assetOut,
      amountThreshold: maxAmountInWei,
    },
    sig: approve ? [approve, 'swapExactOutput'] : ['swapExactOutput'],
  };

  const data = await _buildSwapData(safe, pkey, poolAddress, tx, provider, sponsor, chain);
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, chain);
}

async function _buildSwapData(safeAddress, privateKey, poolAddress, tx, provider, sponsor, chain) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      const isEth = tx.param.tokenIn === ethers.ZeroAddress;
      to.push(tx.contractAddr[i]);
      value.push(isEth ? tx.amount[i] : 0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === poolAddress
            ? [
                tx.param.tokenIn,
                tx.param.tokenOut,
                isEth ? 0n : tx.amount[i],
                tx.param.amountThreshold,
              ]
            : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function _estimateReg_Deposit_CollateralFee(
  safeAddress,
  pkey,
  managerAddress,
  tokenAddress,
  ratioBps,
  collateralAmount,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const isEth = tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth ? undefined : new ethers.Contract(tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const approveAction = !isEth ? 'approve' : undefined;

  const tx = {
    contractAddr: approveAction
      ? [tokenAddress, managerAddress, managerAddress]
      : [managerAddress, managerAddress],
    to: approveAction
      ? [managerAddress, managerAddress, managerAddress]
      : [managerAddress, managerAddress],
    amount: approveAction ? [amountWei, 0n, amountWei] : [0n, amountWei],
    contract: approveAction ? [erc20Iface, cdpIface, cdpIface] : [cdpIface, cdpIface],
    param: {
      token: tokenAddress,
      ratio: ratioBps,
    },
    sig: approveAction
      ? [approveAction, 'registerCollateral', 'depositCollateral']
      : ['registerCollateral', 'depositCollateral'],
  };

  const data = await _buildReg_Deposit_CollateralTx(
    safeAddress,
    pkey,
    managerAddress,
    tx,
    provider,
    sponsor,
    chain
  );
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safeAddress, gasCost, provider, chain);
}

async function _estimate_Deposit_CollateralFee(
  safeAddress,
  pkey,
  managerAddress,
  tokenAddress,
  collateralAmount,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const isEth = tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth ? undefined : new ethers.Contract(tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const approveAction = !isEth ? 'approve' : undefined;

  const tx = {
    contractAddr: approveAction ? [tokenAddress, managerAddress] : [managerAddress],
    to: approveAction ? [managerAddress, managerAddress] : [managerAddress],
    amount: approveAction ? [amountWei, amountWei] : [amountWei],
    contract: approveAction ? [erc20Iface, cdpIface] : [cdpIface],
    param: {
      token: tokenAddress,
    },
    sig: approveAction ? [approveAction, 'depositCollateral'] : ['depositCollateral'],
  };

  const data = await _buildReg_Deposit_CollateralTx(
    safeAddress,
    pkey,
    managerAddress,
    tx,
    provider,
    sponsor,
    chain
  );
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safeAddress, gasCost, provider, chain);
}

async function _buildReg_Deposit_CollateralTx(
  safeAddress,
  privateKey,
  managerAddress,
  tx,
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      const isEth = tx.param.token === ethers.ZeroAddress;
      to.push(tx.contractAddr[i]);
      value.push(isEth && tx.sig[i] === 'depositCollateral' ? tx.amount[i] : 0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === managerAddress && tx.sig[i] === 'registerCollateral'
            ? [tx.param.token, tx.param.ratio]
            : tx.contractAddr[i] === managerAddress && tx.sig[i] === 'depositCollateral'
              ? [tx.param.token, isEth ? 0n : tx.amount[i]]
              : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function _estimate_Open_Position_Fee(
  safeAddress,
  pkey,
  managerAddress,
  tokenAddress,
  ngnsAmount,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const amountWei = ethers.parseEther(ngnsAmount.toString());
  const cdpIface = new ethers.Interface(CDP_ABI);

  const tx = {
    contractAddr: [managerAddress],
    to: [managerAddress],
    amount: [amountWei],
    contract: [cdpIface],
    param: {
      token: tokenAddress,
    },
    sig: ['openPosition'],
  };

  const data = await _buildPositionTx(
    safeAddress,
    pkey,
    managerAddress,
    tx,
    provider,
    sponsor,
    chain
  );
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safeAddress, gasCost, provider, chain);
}

async function _estimate_Settle_Position_Fee(
  safeAddress,
  pkey,
  managerAddress,
  tokenAddress,
  ngnsAmount,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const amountWei = ethers.parseEther(ngnsAmount.toString());
  const cdpIface = new ethers.Interface(CDP_ABI);

  const tx = {
    contractAddr: [managerAddress],
    to: [managerAddress],
    amount: [amountWei],
    contract: [cdpIface],
    param: {
      token: tokenAddress,
    },
    sig: ['settlePosition'],
  };

  const data = await _buildPositionTx(
    safeAddress,
    pkey,
    managerAddress,
    tx,
    provider,
    sponsor,
    chain
  );
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safeAddress, gasCost, provider, chain);
}

async function _buildPositionTx(
  safeAddress,
  privateKey,
  managerAddress,
  tx,
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === managerAddress
            ? [tx.param.token, tx.amount[i]]
            : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };

  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function _estimate_Withdraw_CollateralFee(
  safeAddress,
  pkey,
  managerAddress,
  tokenAddress,
  receiver,
  collateralAmount,
  chain
) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const isEth = tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth ? undefined : new ethers.Contract(tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);

  const tx = {
    contractAddr: [managerAddress],
    to: [managerAddress],
    amount: [amountWei],
    contract: [cdpIface],
    param: {
      token: tokenAddress,
      receiver: receiver,
    },
    sig: ['withdraw'],
  };

  const data = await _buildWithdrawCollateralTx(
    safeAddress,
    pkey,
    managerAddress,
    tx,
    provider,
    sponsor,
    chain
  );
  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safeAddress, gasCost, provider, chain);
}

async function _buildWithdrawCollateralTx(
  safeAddress,
  privateKey,
  managerAddress,
  tx,
  provider,
  sponsor,
  chain
) {
  const signerPack = new ethers.Wallet(privateKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  let to = [];
  let value = [];
  let callData = [];

  for (let i = 0; i < tx.contractAddr.length; i++) {
    if (tx.contractAddr[i] !== ethers.ZeroAddress) {
      to.push(tx.contractAddr[i]);
      value.push(0n);
      callData.push(
        tx.contract[i].encodeFunctionData(
          tx.sig[i],
          tx.contractAddr[i] === managerAddress
            ? [tx.param.token, tx.param.receiver, tx.amount[i]]
            : [tx.to[i], tx.amount[i]]
        )
      );
    } else {
      to.push(tx.to[i]);
      value.push(tx.amount[i]);
      callData.push('0x');
    }
  }

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };
  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function estimateLinkFee(safe) {
  const provider = new ethers.JsonRpcProvider(keyValue('baseRpcUrl'));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const data = await _buildLinkData(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    provider,
    sponsor,
    'link'
  );

  const gasCost = await sponsor.estimateGas(data.estData);
  return await _getFee(safe, gasCost, provider, 'base');
}

async function _buildLinkData(
  safeKey = keyValue('dummyKey'),
  safeAddress = keyValue('dummySafe'),
  name = '03243546@sant',
  address = keyValue('dummySafe'),
  feeToken = keyValue('ngnsBaseAddress'),
  feeWei = '1',
  provider,
  sponsor,
  type
) {
  const chain = 'base';
  const sns = new SNS(keyValue('singleton'), safeKey, keyValue('baseRpcUrl'));
  const signerPack = new ethers.Wallet(safeKey, provider);
  const safe = new ethers.Contract(safeAddress, SAFE, sponsor);
  const parsed = sns.parseHandle(name);
  const dataToBytes = sns.parse32(address);
  const firstTx =
    type === 'link'
      ? [parsed.nameHash, parsed.nsKey, dataToBytes]
      : [parsed.nameHash, parsed.nsKey];
  const secondTx = [keyValue('treasury'), feeWei];

  const to = [keyValue('singleton'), feeToken];
  const value = [0n, 0n];
  const erc20Contract = new ethers.Interface(ERC20);
  const singletonContract = new ethers.Interface(SINGLETON);
  const tx1Hex = singletonContract.encodeFunctionData(type, firstTx);
  const tx2Hex = erc20Contract.encodeFunctionData('transfer', secondTx);
  const encodedData = [tx1Hex, tx2Hex];

  const fData = {
    to: to,
    value: value,
    callData: encodedData,
  };
  return await _completeTxBuild(safe, safeAddress, signerPack, fData, chain);
}

async function _buildProposeData(adminSafeKey, adminSafeAddress, txData, provider, sponsor, chain) {
  const multisig = getMultisigAddress(chain);
  const signerPack = new ethers.Wallet(adminSafeKey, provider);
  const safe = new ethers.Contract(adminSafeAddress, SAFE, sponsor);
  const mSig = new ethers.Contract(multisig, MULTISIG, sponsor);
  const to = [multisig];
  const value = [0n];
  const multisigContract = new ethers.Interface(MULTISIG);
  const txHex =
    txData.type === 'propose'
      ? multisigContract.encodeFunctionData(txData.type, [txData.target, txData.value, txData.data])
      : txData.type === 'approve'
        ? multisigContract.encodeFunctionData(txData.type, [txData.data])
        : multisigContract.encodeFunctionData(txData.type, [
            txData.target,
            txData.value,
            txData.data,
            txData.nonce,
          ]);
  const callData = [txHex];

  const fData = {
    to: to,
    value: value,
    callData: callData,
  };
  return {
    data: await _completeTxBuild(safe, adminSafeAddress, signerPack, fData, chain),
    multisig: mSig,
  };
}

async function _getFee(safeAddress, gasCost, provider, chain) {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas ?? 0n;

  // If L2, buff gas units by 200% (multiply by 3). Otherwise, keep exact estimation.
  const isLayer2 = isL2(chain);
  const bufferedGasUnits = isLayer2 ? gasCost * 18n : gasCost + (gasCost * 50n) / 100n;
  const rawGasWei = bufferedGasUnits * gasPrice;
  const ethCost = ethers.formatEther(rawGasWei);

  const costInUsd = await _ethCostInUsd(Number(ethCost), provider, chain);
  const rawUsd = costInUsd.data || 0;

  let ngnRate = await fetchNgnPricePerAsset(undefined, chain);
  if (!ngnRate?.status) {
    await new Promise((r) => setTimeout(r, 5000));
    ngnRate = await fetchNgnPricePerAsset(undefined, chain);
  }
  const ratePerUsd = Number(ngnRate?.data || 0);
  let finalFeeUsd = rawUsd;
  let finalFeeNgn = Math.ceil(finalFeeUsd * ratePerUsd * 1000) / 1000;

  if (finalFeeNgn < 15) {
    const diff = 15 - finalFeeNgn;
    // If the difference/gap is less than 5 NGN, add a buffer adjustment
    if (diff < 5) {
      finalFeeNgn = finalFeeNgn + diff + 5;
    } else {
      finalFeeNgn = 15;
    }
  }

  finalFeeUsd = ratePerUsd > 0 ? finalFeeNgn / ratePerUsd : finalFeeUsd;

  const ethBalance = await provider.getBalance(safeAddress);
  const hasEnoughEth = ethBalance >= rawGasWei;

  return {
    status: true,
    data: {
      hasEth: hasEnoughEth,
      feeEth: !hasEnoughEth ? 0n : BigInt(rawGasWei),
      feeNGN: finalFeeNgn,
      feeUsd: finalFeeUsd,
    },
  };
}

async function _getFeeAndToken(safeAddress, feeData, chain) {
  if (feeData.data.hasEth) {
    const rawFeeEth = Number(ethers.formatEther(feeData.data.feeEth));
    const feeEthString = rawFeeEth.toFixed(18);

    return {
      status: true,
      data: {
        feeHuman: rawFeeEth,
        feeToken: getNativeTokenSymbol(chain),
        feeTokenAddress: ethers.ZeroAddress,
        feeToWei: ethers.parseEther(feeEthString),
      },
    };
  }
  for (let i = 0; i < whitelistedTokens.length; i++) {
    const coin = whitelistedTokens[i];
    const isNgn = coin === 'NGNS' || coin === 'CNGN';
    const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
    const tokenAddress = getWhitelistedTokenAddress(coin, chain);
    if (!tokenAddress) continue;
    const contract = new ethers.Contract(tokenAddress, ERC20, provider);

    const balanceData = await _getBalance(contract, safeAddress);
    const decimals = Number(balanceData.decimals);
    const formattedBal = ethers.formatUnits(balanceData.balance, decimals);
    const baseFee = isNgn ? feeData.data.feeNGN : feeData.data.feeUsd;
    const fee = Number(baseFee);

    if (Number(formattedBal) >= fee) {
      const feeWei = ethers.parseUnits(fee.toFixed(decimals), decimals);
      return {
        status: true,
        data: {
          feeHuman: fee,
          feeToken: coin,
          feeTokenAddress: tokenAddress,
          feeToWei: feeWei,
        },
      };
    }
  }

  return {
    status: false,
    message: 'Insufficient balance across all whitelisted tokens',
  };
}

export {
  estimateDeploymentFee,
  estimateTransferFee,
  estimatePoolDeploymentFee,
  estimateDeployInvFee,
  estimateUpdateSpreadFee,
  estimateWithdrawFee,
  estimateAddLiquidityFee,
  estimateSwapExactInputFee,
  estimateSwapExactOutputFee,
  estimateLinkFee,
  _estimate_Deposit_CollateralFee,
  _estimate_Open_Position_Fee,
  _estimate_Settle_Position_Fee,
  _estimateReg_Deposit_CollateralFee,
  _estimate_Withdraw_CollateralFee,
  _buildReg_Deposit_CollateralTx,
  _buildWithdrawCollateralTx,
  _buildPositionTx,
  _buildUpdateSpreadData,
  _buildWithdrawData,
  _buildAddLiquidityData,
  _buildLinkData,
  _buildProposeData,
  _buildSwapData,
  _buildFactoryData,
  _buildDeployInvData,
  _buildPoolDeploymentData,
  _buildTransferData,
  _appendSafeReq,
  _getTransactionHash,
  _getFeeAndToken,
};
