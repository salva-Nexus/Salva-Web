import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { PointsRecord, pointsDistribution } from '../models/PointsState.js';
import { REGISTRY, MULTISEND, REGISTRYFACTORY, ERC20, SAFE } from '../utils/abi.js';
import { SNS } from '../../salva.js';
import { _appendSafeReq } from './transferServices.js';
import { basePool, bnbPool } from '../models/Pool.js';
import { isReservedName } from '../models/ReservedNames.js';
import { keyValue, mode } from '../utils/vars.js';

const ABI = {
  REGISTRY,
  REGISTRYFACTORY,
};

async function linkName(email, owner, pKey, name, address, registry) {
  if (isReservedName(name)) {
    return { status: false };
  }
  const sns = new SNS(ABI, registry, keyValue('factory'), pKey, keyValue('baseRpcUrl'));
  const signerConfig = sns._buildConfig(keyValue('sponsorKey'));
  const snsFeeWei = await sns.getFee();

  const tx = await _buildAndExecLink(
    sns,
    owner,
    name.toLowerCase(),
    address,
    registry,
    signerConfig,
    snsFeeWei,
    Number(snsFeeWei) > 0 ? true : false
  );

  // UpdateDB
  const namespace = await sns.namespace();
  console.log(`Name Space: ${namespace}`);
  const welded = `${name.toLowerCase().trim()}${namespace.trim()}`;
  console.log(`Welded Name: ${welded}`);

  const userBase = await User.findOne({
    email: email,
  });

  if (userBase) {
    userBase.nameAliases.push({
      name: welded,
      wallet: address,
      registryAddress: registry,
    });
    await userBase.save();
  }

  const pointsRecord = await PointsRecord.findOne({
    network: mode === 'production' ? 'MAINNET' : 'TESTNET',
  });

  if (pointsRecord && !pointsRecord.isLocked) {
    console.log(`ISSUED 1 : ${pointsRecord.totalPointsIssued}`);
    const remainingPoints = pointsRecord.hardCap - pointsRecord.totalPointsIssued;
    console.log(`Remaining: ${remainingPoints}`);
    let totalReward = 0;
    let linkerReceives = pointsDistribution.link;
    console.log(`Linker Receives 1: ${linkerReceives}`);
    if (userBase) totalReward += linkerReceives;
    console.log(`Total Reward 1: ${totalReward}`);

    console.log(`Total Reward > Remaining?: ${totalReward > remainingPoints}`);

    if (totalReward > remainingPoints) {
      linkerReceives = remainingPoints;
      totalReward = remainingPoints;
      console.log(`Linker Receives 2: ${linkerReceives}`);
      console.log(`Total Reward 2: ${totalReward}`);
    }

    if (userBase) {
      userBase.santPoints += linkerReceives;
      await userBase.save();
    }

    pointsRecord.totalPointsIssued += totalReward;
    await pointsRecord.save();
    console.log(
      `Total Points Issued > Hard Cap?: ${pointsRecord.totalPointsIssued >= pointsRecord.hardCap}`
    );

    console.log(`ISSUED 2 : ${pointsRecord.totalPointsIssued}`);
    console.log(`HARDCAP : ${pointsRecord.hardCap}`);

    if (pointsRecord.totalPointsIssued >= pointsRecord.hardCap)
      await pointsRecord.updateOne({ isLocked: true });

    if (pointsRecord.totalPointsIssued >= pointsRecord.redeemCap)
      await pointsRecord.updateOne({ canRedeem: true });
  }

  return {
    status: tx.status,
    name: welded,
    data: tx.data,
  };
}

async function _buildAndExecLink(
  snsConfig,
  owner,
  name,
  address,
  registry,
  signer,
  singletonFee,
  approve
) {
  const safe = new ethers.Contract(owner, SAFE, signer);
  const firstTx = [registry, singletonFee];

  const data = snsConfig._dataHash(name, address);
  const signature = await signer.signMessage(data.hash);

  const secondTx = [data.nameBytes, data.address, ethers.hexlify(signature)];

  let to = !approve ? [registry] : [keyValue('ngnsBaseAddress'), registry];
  let value = !approve ? [0n] : [0n, 0n];

  const erc20Contract = new ethers.Interface(ERC20);
  const registryContract = new ethers.Interface(REGISTRY);
  let tx1Hex = erc20Contract.encodeFunctionData('approve', firstTx);
  let tx2Hex = registryContract.encodeFunctionData('link', secondTx);
  let encodedData = !approve ? [tx2Hex] : [tx1Hex, tx2Hex];

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: keyValue('MULTI_SEND_BASE_ADDRESS'),
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

  const sig = await snsConfig._snsConfig().OWNER.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);

  const tx = await safe.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig
  );
  const receipt = await tx.wait();
  if (receipt.hash) {
    return {
      status: true,
      data: {
        receipt: receipt,
      },
    };
  } else {
    throw new Error('❌ Link Failed');
  }
}

async function unlinkName(email, owner, name, pKey, registry) {
  console.log(name);
  const sns = new SNS(ABI, registry, keyValue('factory'), pKey, keyValue('baseRpcUrl'));
  const signerConfig = sns._buildConfig(keyValue('sponsorKey'));

  const tx = await _performUnlink(sns, name, owner, registry, signerConfig);

  // UpdateDB
  const namespace = await sns.namespace();
  console.log(`Name Space: ${namespace}`);
  const welded = name.includes('@') ? name : `${name.toLowerCase().trim()}${namespace.trim()}`;
  console.log(`Welded Name: ${welded}`);

  const userBase = await User.findOne({
    email: email,
  });

  if (userBase) {
    userBase.nameAliases.pull({
      name: welded.toLowerCase(),
    });
    await userBase.save();
  }

  const BasePool = await basePool.findOne({
    poolName: welded.toLowerCase(),
  });

  const BnbPool = await bnbPool.findOne({
    poolName: welded.toLowerCase(),
  });

  if (BasePool) {
    BasePool.poolName = null;
    BasePool.registryAddress = null;
    await BasePool.save();
  }
  if (BnbPool) {
    BnbPool.poolName = null;
    BnbPool.registryAddress = null;
    await BnbPool.save();
  }

  return {
    status: tx.status,
    name: welded,
    data: tx.data,
  };
}

async function _performUnlink(snsConfig, fullName, owner, registry, signer) {
  const safe = new ethers.Contract(owner, SAFE, signer);
  const firstTx = [ethers.toUtf8Bytes(fullName)];

  let to = [registry];

  let value = [0n];

  const registryContract = new ethers.Interface(REGISTRY);
  let tx1Hex = registryContract.encodeFunctionData('unlink', firstTx);
  let encodedData = [tx1Hex];

  const currentNonce = await safe.nonce();
  const multisendIface = new ethers.Interface(MULTISEND);
  const multisendTx = multisendIface.encodeFunctionData('multiSend', [to, value, encodedData]);
  const safeTx = {
    to: keyValue('MULTI_SEND_BASE_ADDRESS'),
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

  const sig = await snsConfig._snsConfig().OWNER.signMessage(ethers.getBytes(hash));
  const newSig = _appendSafeReq(sig);

  const tx = await safe.execTransaction(
    safeTx.to,
    safeTx.value,
    safeTx.data,
    safeTx.op,
    safeTx.safeTxGas,
    safeTx.baseGas,
    safeTx.gasPrice,
    safeTx.gasToken,
    safeTx.refundReceiver,
    newSig
  );
  const receipt = await tx.wait();
  if (receipt.hash) {
    return {
      status: true,
      data: {
        receipt: receipt,
      },
    };
  } else {
    throw new Error('❌ Unlink Failed');
  }
}

export { linkName, unlinkName };
