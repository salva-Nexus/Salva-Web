import { ethers } from 'ethers';
import { User, UserBNB } from '../models/Users.js';
import { basePool, bnbPool } from '../models/Pool.js';
import {
  basePoolSubscription,
  bnbPoolSubscription,
  FEE_PER_MONTH,
} from '../models/PoolSubscription.js';
import { ERC20 } from '../utils/abi.js';
import {
  estimatePoolDeploymentFee,
  estimateAdd_RemoveLiqFee,
  estimateUpdateRateFee,
  estimateUpdatePauseStateFee,
  _buildUpdatePauseStateData,
  _buildUpdateRateData,
  _buildAdd_RemoveLiqData,
  _buildPoolDeploymentData,
} from './estimateFee.js';
import { balance, _getDecimals } from './balanceServices.js';
import { getBalance, executeTransfer } from './transferServices.js';
import { linkName, unlinkName } from './snservices.js';
import { keyValue } from '../utils/vars.js';

function _getPoolAddress(receipt, chain) {
  const logs = receipt.logs;
  let address;
  const factoryAddress =
    chain === 'base' ? keyValue('basePoolFactory') : keyValue('bnbPoolFactory');

  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.toLowerCase() === factoryAddress.toLowerCase()) {
      const cleaned = logs[i].topics[2].slice(26, logs[i].topics[1].length);
      address = `0x${cleaned}`;
      break;
    }
  }
  return ethers.getAddress(address);
}

function _asset(asset, chain) {
  return chain === 'base'
    ? asset === 'NGNS'
      ? keyValue('ngnsBaseAddress')
      : asset === 'CNGN'
        ? keyValue('cngnBaseAddress')
        : asset === 'USDC'
          ? keyValue('usdcBaseAddress')
          : keyValue('usdtBaseAddress')
    : asset === 'NGNS'
      ? keyValue('ngnsBnbAddress')
      : asset === 'CNGN'
        ? keyValue('cngnBnbAddress')
        : asset === 'USDC'
          ? keyValue('usdcBnbAddress')
          : keyValue('usdtBnbAddress');
}

async function deployPool(email, pkey, chain) {
  let user;
  try {
    user =
      chain === 'base'
        ? await User.findOne({ email: email })
        : await UserBNB.findOne({ email: email });
  } catch (err) {
    console.log(`Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    user =
      chain === 'base'
        ? await User.findOne({ email: email })
        : await UserBNB.findOne({ email: email });
  }

  const rpc = chain === 'base' ? keyValue('baseRpcUrl') : keyValue('bnbRpcUrl');

  const fee = await estimatePoolDeploymentFee(chain, true);
  const feeData = await _getFeeAndToken(user.safeAddress, fee, chain);
  if (!feeData.status) {
    throw Error(`❌ No Balance to cover fee`);
  }
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const deployData = await _buildPoolDeploymentData(
    user.safeAddress,
    pkey,
    feeData.data.feeToWei,
    feeData.data.feeTokenAddress,
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
  let pool;
  try {
    pool =
      chain === 'base'
        ? await basePool.create({
            poolAddress: poolAddress,
            ownerSafeAddress: user.safeAddress,
          })
        : await bnbPool.create({
            poolAddress: poolAddress,
            ownerSafeAddress: user.safeAddress,
          });
  } catch (err) {
    console.log(`Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool =
      chain === 'base'
        ? await basePool.create({
            poolAddress: poolAddress,
            ownerSafeAddress: user.safeAddress,
          })
        : await bnbPool.create({
            poolAddress: poolAddress,
            ownerSafeAddress: user.safeAddress,
          });
  }

  return {
    status: true,
    poolAddress: poolAddress,
  };
}

async function poolNameService(email, pkey, name, poolAddress, registry, type, chain) {
  let pool =
    chain === 'base'
      ? await basePool.findOne({
          poolAddress: poolAddress,
        })
      : await bnbPool.findOne({
          poolAddress: poolAddress,
        });

  const owner = await User.findOne({
    email: email,
  });

  if (!pool || !owner) {
    return {
      status: false,
    };
  }

  let nameOpResult;
  if (type === 'link') {
    nameOpResult = await linkName(email, owner.safeAddress, pkey, name, poolAddress, registry);
    if (nameOpResult.status) {
      pool.poolName = nameOpResult.name;
      pool.registryAddress = registry;
      await pool.save();
    } else {
      return {
        status: false,
      };
    }
  } else {
    nameOpResult = await unlinkName(email, owner.safeAddress, name, pkey, pool.registryAddress);
    if (nameOpResult.status) {
      pool.poolName = null;
      pool.registryAddress = null;
      await pool.save();
    } else {
      return {
        status: false,
      };
    }
  }

  console.log(nameOpResult.name || name);
  return {
    status: true,
    data: {
      name: nameOpResult.name || name,
      receipt: nameOpResult.data,
    },
  };
}

async function poolSubscription(email, pkey, poolAddress, chain, type, interval) {
  let pool;
  try {
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  }

  const owner = await User.findOne({
    email: email,
  });

  if (!pool || !owner) {
    return {
      status: false,
    };
  }

  let returnData;
  let poolSub;
  const month = 30 * 24 * 60 * 60 * 1000;
  const treasuryAddress = keyValue('treasury');

  if (pool) {
    if (type === 'subscribe') {
      returnData = await executeTransfer(
        email,
        owner.safeAddress,
        pkey,
        treasuryAddress,
        FEE_PER_MONTH * interval,
        'NGNS',
        chain
      );
      if (!returnData.status) throw Error(`❌ Subscription Failed`);

      poolSub =
        chain === 'base'
          ? await basePoolSubscription.findOne({ poolAddress: poolAddress })
          : await bnbPoolSubscription.findOne({ poolAddress: poolAddress });

      if (poolSub) {
        const currentExpiry = poolSub.expiresAt;
        console.log(`Current expiry: ${currentExpiry.getTime()}`);
        poolSub.months += interval;
        poolSub.amountPaid += FEE_PER_MONTH * interval;
        poolSub.expiresAt = currentExpiry.getTime() + month * interval;
        await poolSub.save();
      } else {
        const subData = {
          poolAddress: poolAddress,
          ownerSafeAddress: owner.safeAddress,
          months: interval,
          amountPaid: FEE_PER_MONTH * interval,
          txHash: returnData.data.txHash,
          active: true,
          startedAt: Date.now(),
          expiresAt: Date.now() + month * interval,
        };

        chain === 'base'
          ? await basePoolSubscription.create(subData)
          : await bnbPoolSubscription.create(subData);
      }
    } else if (type === 'renew') {
      returnData = await executeTransfer(
        email,
        owner.safeAddress,
        pkey,
        treasuryAddress,
        FEE_PER_MONTH * interval,
        'NGNS',
        chain
      );
      if (!returnData.status) throw Error(`❌ Subscription Failed`);

      poolSub =
        chain === 'base'
          ? await basePoolSubscription.findOne({ poolAddress: poolAddress })
          : await bnbPoolSubscription.findOne({ poolAddress: poolAddress });

      if (poolSub) {
        const currentExpiry = poolSub.expiresAt;
        poolSub.months += interval;
        poolSub.amountPaid += FEE_PER_MONTH * interval;
        poolSub.expiresAt = currentExpiry.getTime() + month * interval;
        await poolSub.save();
      }
    } else {
      chain === 'base'
        ? await basePoolSubscription.deleteOne({ poolAddress: poolAddress })
        : await bnbPoolSubscription.deleteOne({ poolAddress: poolAddress });
    }
  }

  return {
    status: true,
    expiresAt: type === `cancel` ? null : new Date(Date.now() + month * interval),
  };
}

async function add_RemoveLiq(email, pkey, poolAddress, asset, amount, chain, type) {
  let pool;
  try {
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
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
  const rpc = chain === 'base' ? keyValue('baseRpcUrl') : keyValue('bnbRpcUrl');

  const fee = await estimateAdd_RemoveLiqFee(chain, type, true);
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const assetAddress = _asset(asset, chain);
  const contract = new ethers.Contract(assetAddress, ERC20, provider);
  const decimals = await _getDecimals(contract);
  const amountWei = ethers.parseUnits(amount.toString(), decimals);
  const txData = await _buildAdd_RemoveLiqData(
    owner.safeAddress,
    pkey,
    feeData.data.feeToWei,
    feeData.data.feeTokenAddress,
    poolAddress,
    assetAddress,
    amountWei,
    provider,
    sponsor,
    chain,
    type
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
  if (receipt) {
    return {
      status: true,
      data: receipt,
    };
  } else {
    return {
      status: false,
    };
  }
}

async function updateRate(email, pkey, poolAddress, rate, type, chain) {
  let pool;
  try {
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  }

  const owner = await User.findOne({
    email: email,
  });

  if (!pool || !owner) {
    return {
      status: false,
    };
  }

  const rpc = chain === 'base' ? keyValue('baseRpcUrl') : keyValue('bnbRpcUrl');

  const fee = await estimateUpdateRateFee(chain, true);
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const ratetWei = ethers.parseUnits(rate.toString(), 6);
  const txData = await _buildUpdateRateData(
    owner.safeAddress,
    pkey,
    feeData.data.feeToWei,
    feeData.data.feeTokenAddress,
    poolAddress,
    ratetWei,
    type,
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
  if (receipt) {
    return {
      status: true,
      data: receipt,
    };
  } else {
    return {
      status: false,
    };
  }
}

async function updatePauseState(email, pkey, poolAddress, state, chain) {
  let pool;
  try {
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
          });
  } catch (err) {
    console.warn(`⚠️ Retrying!!!`);
    await new Promise((r) => setTimeout(r, 5000));
    pool =
      chain === 'base'
        ? await basePool.findOne({
            poolAddress: poolAddress,
          })
        : await bnbPool.findOne({
            poolAddress: poolAddress,
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

  const rpc = chain === 'base' ? keyValue('baseRpcUrl') : keyValue('bnbRpcUrl');

  const fee = await estimateUpdatePauseStateFee(chain, true);
  const feeData = await _getFeeAndToken(owner.safeAddress, fee, chain);
  const provider = new ethers.JsonRpcProvider(rpc);
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const txData = await _buildUpdatePauseStateData(
    owner.safeAddress,
    pkey,
    feeData.data.feeToWei,
    feeData.data.feeTokenAddress,
    poolAddress,
    state,
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
  if (receipt) {
    return {
      status: true,
      data: receipt,
    };
  } else {
    return {
      status: false,
    };
  }
}

async function _getFeeAndToken(safeAddress, data, chain) {
  const balances = await balance(safeAddress, chain);
  let feeHuman;
  let feeTokenSymbol;
  if (
    balances.data.ngnsBalance >= data.data.feeNGN ||
    balances.data.cNgnBalance >= data.data.feeNGN
  ) {
    feeHuman = data.data.feeNGN;
    feeTokenSymbol = balances.data.ngnsBalance >= data.data.feeNGN ? 'NGNS' : 'CNGN';
  } else if (
    balances.data.usdtBalance >= data.data.feeUsd ||
    balances.data.usdcBalance >= data.data.feeUsd
  ) {
    feeHuman = data.data.feeUsd;
    feeTokenSymbol = balances.data.usdtBalance >= data.data.feeUsd ? 'USDT' : 'USDC';
  } else {
    return { status: false };
  }

  let feeTokenAddress = _asset(feeTokenSymbol, chain);

  const feeTokenData = await getBalance(feeTokenAddress, safeAddress, chain);

  const feeWei =
    feeTokenSymbol === 'NGNS' || feeTokenSymbol === 'CNGN'
      ? ethers.parseUnits(data.data.feeNGN.toString(), feeTokenData.decimals)
      : ethers.parseUnits(data.data.feeUsd.toString(), feeTokenData.decimals);

  return {
    status: true,
    data: {
      feeHuman: feeHuman,
      feeToken: feeTokenSymbol,
      feeTokenAddress: feeTokenAddress,
      feeToWei: feeWei,
    },
  };
}

export {
  deployPool,
  poolNameService,
  poolSubscription,
  add_RemoveLiq,
  updateRate,
  updatePauseState,
  _getFeeAndToken,
  _asset,
};
