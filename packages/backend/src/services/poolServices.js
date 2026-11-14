import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { Pool } from '../models/Pool.js';
import { ERC20, FACTORY_IFACE, POOL_IFACE } from '../utils/abi.js';
import {
  estimatePoolDeploymentFee,
  estimateDeployInvFee,
  estimateUpdateSpreadFee,
  estimateWithdrawFee,
  estimateAddLiquidityFee,
  _buildUpdateSpreadData,
  _buildWithdrawData,
  _buildAddLiquidityData,
  _buildDeployInvData,
  _buildPoolDeploymentData,
  _getFeeAndToken,
} from './estimateFee.js';
import { _getDecimals } from './balanceServices.js';
import { keyValue } from '../utils/vars.js';
import { getRpcUrlByChain, getPoolFactoryAddress } from '../utils/rpcUrls.js';
import { SupportedPair } from '../models/SupportedPair.js';
import { _deploySafe } from './deployment.js';
import { verify_Pin } from './pinService.js';

function _getPoolAddress(receipt, chain) {
  const logs = receipt.logs;
  let address;
  const factoryAddress = getPoolFactoryAddress(chain);

  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.toLowerCase() === factoryAddress.toLowerCase()) {
      const cleaned = logs[i].topics[1].slice(26, logs[i].topics[1].length);
      address = `0x${cleaned}`;
      break;
    }
  }
  return ethers.getAddress(address);
}

async function deployPool(email, pin, chain) {
  let user;
  try {
    user = await User.findOne({ email: email });
  } catch (err) {
    console.log(`Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    user = await User.findOne({ email: email });
  }
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;

  const rpc = getRpcUrlByChain(chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const code = await provider.getCode(user.safeAddress);
  const isDeployed = code !== '0x';
  let fee = !isDeployed
    ? await estimateDeploymentFee(user.safeAddress, chain)
    : await await estimatePoolDeploymentFee(pkey, user.safeAddress, chain);
  const balanceData = await getBalance(tokenAddress, safeAddress, normchain);

  let deployPoolFee;
  if (!isDeployed) {
    deployPoolFee = estimatePoolDeploymentFee(pkey, user.safeAddress, chain);
    const initFeeData = await _getFeeAndToken(user.safeAddress, fee, chain);
    const initDeployPoolFeeData = await _getFeeAndToken(user.safeAddress, deployPoolFee, chain);

    if (!initFeeData.status || !initDeployPoolFeeData.status) {
      throw new TypeError('Insufficient Balance to cover fee, please top up or reduce amount');
    }

    // If the fee token matches the transfer token, ensure the user has enough for Amount + Deployment Fee + Transfer Fee
    const balanceData = await getBalance(initDeployPoolFeeData.data.tokenAddress, safeAddress, chain);
    if (initFeeData.data.feeToken === tokenSymbol) {
      const totalRequired = BigInt(initFeeData.data.feeToWei) + BigInt(initDeployPoolFeeData.data.feeToWei);
      console.log(balanceData.balance);
      console.log(totalRequired);
      if (balanceData.balance < totalRequired) {
        throw new TypeError('Insufficient balance to cover fee, please top up.');
      }
    } else {
      throw new TypeError('Insufficient balance to cover fee, please top up');
    }
    await _deploySafe(user.safeAddress, pkey, provider, chain);
  }

  if (deployPoolFee) {
    fee.data.feeEth += deployPoolFee.data.feeEth;
    fee.data.feeNGN += deployPoolFee.data.feeNGN;
    fee.data.feeUsd += deployPoolFee.data.feeUsd;
  }
  const feeData = await _getFeeAndToken(user.safeAddress, fee, chain);
  if (!feeData.status) {
    throw Error(`❌ No Balance to cover fee`);
  }

  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolFactoryContract = new ethers.Interface(FACTORY_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const txObj = {
    contractAddr: [getPoolFactoryAddress(chain), feeData.data.feeTokenAddress],
    to: ['0x', keyValue('treasury')],
    amount: [0n, feeData.data.feeToWei],
    contract: [poolFactoryContract, erc20Contract],
    sig: ['deployPool', 'transfer'],
  };
  const deployData = await _buildPoolDeploymentData(
    user.safeAddress,
    pkey,
    txObj,
    provider,
    sponsor,
    chain
  );

  const tx = await deployData.safe.execTransaction(
    deployData.params.to,
    deployData.params.value,
    deployData.params.data,
    deployData.params.op,
    deployData.params.safeTxGas,
    deployData.params.baseGas,
    deployData.params.gasPrice,
    deployData.params.gasToken,
    deployData.params.refundReceiver,
    deployData.params.sig
  );
  const receipt = await tx.wait();
  const poolAddress = _getPoolAddress(receipt, chain);
  if (!receipt) {
    return {
      status: false,
    };
  }

  // UPDATE DB
  try {
    await Pool.create({
      poolAddress: poolAddress,
      ownerSafeAddress: user.safeAddress,
      chain: chain,
    });
  } catch (err) {
    console.log(`Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    await Pool.create({
      poolAddress: poolAddress,
      ownerSafeAddress: user.safeAddress,
      chain: chain,
    });
  }

  return {
    status: true,
    poolAddress: poolAddress,
  };
}

async function deployInventory(
  email,
  pin,
  poolAddress,
  base,
  quote,
  floor,
  spread,
  amount,
  allowSwapBelowFloor,
  chain
) {
  let pool;
  let invExists = true;
  try {
    pool = await Pool.findOne({
      poolAddress: poolAddress,
      'inventories.baseSymbol': base,
      'inventories.quoteSymbol': quote,
    });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool = await Pool.findOne({
      poolAddress: poolAddress,
      'inventories.baseSymbol': base,
      'inventories.quoteSymbol': quote,
    });
  }
  if (!pool) {
    pool = await Pool.findOne({
      poolAddress: poolAddress,
    });
    invExists = false;
  }

  let owner = await User.findOne({
    email: email,
  });

  if (!pool || !owner) {
    return {
      status: false,
    };
  }
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;

  let isInverted = false;
  let inv = await SupportedPair.findOne({
    baseSymbol: base.toUpperCase(),
    quoteSymbol: quote.toUpperCase(),
    chain: chain,
  });
  if (!inv) {
    inv = await SupportedPair.findOne({
      baseSymbol: quote.toUpperCase(),
      quoteSymbol: base.toUpperCase(),
      chain: chain,
    });
    if (!inv) return { status: false };
    isInverted = true;
  }

  const isStableNgn = (sym) => sym === 'NGNS' || sym === 'CNGN';
  if (isStableNgn(inv.quoteSymbol)) {
    isInverted = true;
  }
  const rpc = getRpcUrlByChain(chain);
  const inAddress = !isInverted ? inv.quoteAddress : inv.baseAddress;
  const outAddress = !isInverted ? inv.baseAddress : inv.quoteAddress;

  const fee = await estimateDeployInvFee(
    owner.safeAddress,
    pkey,
    poolAddress,
    outAddress,
    inAddress,
    inv.priceFeed,
    floor,
    spread,
    amount,
    allowSwapBelowFloor,
    isInverted,
    chain
  );
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const contract =
    outAddress !== ethers.ZeroAddress
      ? new ethers.Contract(outAddress, ERC20, provider)
      : undefined;
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const approve = outAddress !== ethers.ZeroAddress ? 'approve' : undefined;
  const bpsValue = Math.round(parseFloat(spread) * 100);
  const spreadBps = BigInt(bpsValue);
  const data = {
    contractAddr: approve
      ? [outAddress, poolAddress, feeData.data.feeTokenAddress]
      : [poolAddress, feeData.data.feeTokenAddress],
    to: approve ? [poolAddress, '0x', keyValue('treasury')] : ['0x', keyValue('treasury')],
    amount: approve
      ? [amountWei, amountWei, feeData.data.feeToWei]
      : [amountWei, feeData.data.feeToWei],
    contract: approve
      ? [erc20Contract, poolContract, erc20Contract]
      : [poolContract, erc20Contract],
    param: {
      in: inAddress,
      out: outAddress,
      feed: inv.priceFeed,
      floor: ethers.parseEther(String(floor)),
      spread: spreadBps,
      allow: allowSwapBelowFloor,
      isInverted: isInverted,
    },
    sig: approve ? ['approve', 'deployInv', 'transfer'] : ['deployInv', 'transfer'],
  };
  const txData = await _buildDeployInvData(
    owner.safeAddress,
    pkey,
    poolAddress,
    data,
    provider,
    sponsor,
    chain
  );

  const tx = await txData.safe.execTransaction(
    txData.params.to,
    txData.params.value,
    txData.params.data,
    txData.params.op,
    txData.params.safeTxGas,
    txData.params.baseGas,
    txData.params.gasPrice,
    txData.params.gasToken,
    txData.params.refundReceiver,
    txData.params.sig
  );
  const receipt = await tx.wait();
  if (!receipt)
    return {
      status: false,
    };

  // UPDATE DB
  const invUpdate = {
    baseSymbol: base,
    quoteSymbol: quote,
    baseAddress: outAddress,
    quoteAddress: inAddress,
    priceFeed: inv.priceFeed,
    floor: floor,
    spread: spread,
    allowedSwapBelowFloor: allowSwapBelowFloor,
    isInverted: isInverted,
  };

  if (invExists) {
    pool.inventories = pool.inventories.filter(
      (item) => !(item.baseSymbol === base && item.quoteSymbol === quote)
    );
  }

  pool.inventories.push(invUpdate);
  await pool.save();

  return {
    status: true,
    data: receipt,
  };
}

async function withdraw(email, pin, poolAddress, base, quote, assetOut, amount, chain) {
  const normalizedChain = String(chain).toLowerCase();
  const baseSym = String(base).toUpperCase();
  const quoteSym = String(quote).toUpperCase();
  const outSym = String(assetOut || base).toUpperCase();

  if (outSym !== baseSym && outSym !== quoteSym) {
    throw new Error('assetOut must be the base or the quote symbol');
  }

  const owner = await User.findOne({ email: email });
  const pool = await Pool.findOne({
    poolAddress: poolAddress.toLowerCase(),
    chain: normalizedChain,
  });

  if (!pool || !owner) {
    return { status: false };
  }

  const rpc = getRpcUrlByChain(normalizedChain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);

  let isInverted = false;
  let pair = await SupportedPair.findOne({
    baseSymbol: baseSym,
    quoteSymbol: quoteSym,
    chain: normalizedChain,
  });
  if (!pair) {
    pair = await SupportedPair.findOne({
      baseSymbol: quoteSym,
      quoteSymbol: baseSym,
      chain: normalizedChain,
    });
    if (!pair) return { status: false };
    isInverted = true;
  }

  // Same direction handling as deployInventory: base = asset the merchant sells.
  const baseAsset = isInverted ? pair.quoteAddress : pair.baseAddress;
  const quoteAsset = isInverted ? pair.baseAddress : pair.quoteAddress;
  const outAsset = outSym === baseSym ? baseAsset : quoteAsset;

  const contract =
    outAsset !== ethers.ZeroAddress ? new ethers.Contract(outAsset, ERC20, provider) : undefined;
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);

  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;
  const fee = await estimateWithdrawFee(
    owner.safeAddress,
    pkey,
    poolAddress,
    baseAsset,
    quoteAsset,
    outAsset,
    amount,
    normalizedChain
  );
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, normalizedChain);
  if (!feeData.status) {
    throw new Error('❌ No Balance to cover fee');
  }

  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const data = {
    contractAddr: [poolAddress, feeData.data.feeTokenAddress],
    to: ['0x', keyValue('treasury')],
    amount: [amountWei, feeData.data.feeToWei],
    contract: [poolContract, erc20Contract],
    param: {
      base: baseAsset,
      quote: quoteAsset,
      assetOut: outAsset,
    },
    sig: ['removeLiquidity', 'transfer'],
  };

  const txData = await _buildWithdrawData(
    owner.safeAddress,
    pkey,
    poolAddress,
    data,
    provider,
    sponsor,
    normalizedChain
  );

  const tx = await txData.safe.execTransaction(
    txData.params.to,
    txData.params.value,
    txData.params.data,
    txData.params.op,
    txData.params.safeTxGas,
    txData.params.baseGas,
    txData.params.gasPrice,
    txData.params.gasToken,
    txData.params.refundReceiver,
    txData.params.sig
  );
  const receipt = await tx.wait();
  if (!receipt) {
    return { status: false };
  }

  return {
    status: true,
    data: receipt,
  };
}

async function updateSpread(email, pin, poolAddress, base, quote, spread, chain) {
  let pool;
  try {
    pool = await Pool.findOne({
      poolAddress: poolAddress,
      'inventories.baseSymbol': base,
      'inventories.quoteSymbol': quote,
    });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool = await Pool.findOne({
      poolAddress: poolAddress,
      'inventories.baseSymbol': base,
      'inventories.quoteSymbol': quote,
    });
  }

  let owner = await User.findOne({
    email: email,
  });

  if (!pool || !owner) {
    return {
      status: false,
    };
  }
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;

  let isInverted = false;
  let inv = await SupportedPair.findOne({
    baseSymbol: base.toUpperCase(),
    quoteSymbol: quote.toUpperCase(),
    chain: chain,
  });
  if (!inv) {
    inv = await SupportedPair.findOne({
      baseSymbol: quote.toUpperCase(),
      quoteSymbol: base.toUpperCase(),
      chain: chain,
    });
    if (!inv) return { status: false };
    isInverted = true;
  }
  const isStableNgn = (sym) => sym === 'NGNS' || sym === 'CNGN';
  if (isStableNgn(inv.quoteSymbol)) {
    isInverted = true;
  }
  const rpc = getRpcUrlByChain(chain);
  const inAddress = !isInverted ? inv.quoteAddress : inv.baseAddress;
  const outAddress = !isInverted ? inv.baseAddress : inv.quoteAddress;

  const fee = await estimateUpdateSpreadFee(
    owner.safeAddress,
    pkey,
    poolAddress,
    outAddress,
    inAddress,
    spread,
    chain
  );
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const bpsValue = Math.round(parseFloat(spread) * 100);
  const spreadBps = BigInt(bpsValue);
  const data = {
    contractAddr: [poolAddress, feeData.data.feeTokenAddress],
    to: ['0x', keyValue('treasury')],
    amount: [0n, feeData.data.feeToWei],
    contract: [poolContract, erc20Contract],
    param: {
      base: outAddress,
      quote: inAddress,
      spread: spreadBps,
    },
    sig: ['updateSpread', 'transfer'],
  };
  const txData = await _buildUpdateSpreadData(
    owner.safeAddress,
    pkey,
    poolAddress,
    data,
    provider,
    sponsor,
    chain
  );

  const tx = await txData.safe.execTransaction(
    txData.params.to,
    txData.params.value,
    txData.params.data,
    txData.params.op,
    txData.params.safeTxGas,
    txData.params.baseGas,
    txData.params.gasPrice,
    txData.params.gasToken,
    txData.params.refundReceiver,
    txData.params.sig
  );
  const receipt = await tx.wait();
  if (!receipt) {
    return {
      status: false,
    };
  }

  const inventoryItem = pool.inventories.find(
    (inv) => inv.baseSymbol === base && inv.quoteSymbol === quote
  );

  inventoryItem.spread = spread.toString();
  await pool.save();

  return {
    status: true,
    data: receipt,
  };
}

async function addLiquidity(email, pin, poolAddress, base, quote, amount, chain) {
  const normalizedChain = String(chain).toLowerCase();

  const owner = await User.findOne({ email: email });
  const pool = await Pool.findOne({
    poolAddress: poolAddress.toLowerCase(),
    chain: normalizedChain,
  });

  if (!pool || !owner) {
    return { status: false };
  }
  const pinData = await verify_Pin(email, pin);
  const pkey = pinData.privateKey;
  let isInverted = false;
  let pair = await SupportedPair.findOne({
    baseSymbol: base.toUpperCase(),
    quoteSymbol: quote.toUpperCase(),
    chain: chain,
  });

  if (!pair) {
    pair = await SupportedPair.findOne({
      baseSymbol: quote.toUpperCase(),
      quoteSymbol: base.toUpperCase(),
      chain: chain,
    });
    if (!pair) return { status: false };

    isInverted = true;
  }
  const baseAsset = isInverted ? pair.quoteAddress : pair.baseAddress;
  const quoteAsset = isInverted ? pair.baseAddress : pair.quoteAddress;

  const rpc = getRpcUrlByChain(normalizedChain);

  const fee = await estimateAddLiquidityFee(
    owner.safeAddress,
    pkey,
    poolAddress,
    baseAsset,
    quoteAsset,
    amount,
    normalizedChain
  );
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, normalizedChain);
  if (!feeData.status) {
    throw new Error('❌ No Balance to cover fee');
  }

  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const isEth = baseAsset === ethers.ZeroAddress;
  const contract = isEth ? undefined : new ethers.Contract(baseAsset, ERC20, provider);
  const decimals = contract ? await _getDecimals(contract) : 18;
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const poolContract = new ethers.Interface(POOL_IFACE);
  const erc20Contract = new ethers.Interface(ERC20);
  const approve = !isEth ? 'approve' : undefined;

  const data = {
    contractAddr: approve
      ? [baseAsset, poolAddress, feeData.data.feeTokenAddress]
      : [poolAddress, feeData.data.feeTokenAddress],
    to: approve ? [poolAddress, '0x', keyValue('treasury')] : ['0x', keyValue('treasury')],
    amount: approve
      ? [amountWei, amountWei, feeData.data.feeToWei]
      : [amountWei, feeData.data.feeToWei],
    contract: approve
      ? [erc20Contract, poolContract, erc20Contract]
      : [poolContract, erc20Contract],
    param: {
      base: baseAsset,
      quote: quoteAsset,
    },
    sig: approve ? ['approve', 'addLiquidity', 'transfer'] : ['addLiquidity', 'transfer'],
  };

  const txData = await _buildAddLiquidityData(
    owner.safeAddress,
    pkey,
    data,
    provider,
    sponsor,
    normalizedChain
  );

  const tx = await txData.safe.execTransaction(
    txData.params.to,
    txData.params.value,
    txData.params.data,
    txData.params.op,
    txData.params.safeTxGas,
    txData.params.baseGas,
    txData.params.gasPrice,
    txData.params.gasToken,
    txData.params.refundReceiver,
    txData.params.sig
  );
  const receipt = await tx.wait();
  if (!receipt) {
    return { status: false };
  }

  return {
    status: true,
    data: receipt,
  };
}

export { deployPool, deployInventory, withdraw, updateSpread, addLiquidity };
