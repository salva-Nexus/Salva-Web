import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { PointsRecord, pointsDistribution } from '../models/PointsState.js';
import { Pool } from '../models/Pool.js';
import { keyValue, mode } from '../utils/vars.js';
import {
  _appendSafeReq,
  _getTransactionHash,
  estimateLinkFee,
  _buildLinkData,
  _buildProposeData,
  _getFeeAndToken,
} from './estimateFee.js';
import { SubmittedProposalReq } from '../models/Proposals.js';
import { SINGLETON } from '../utils/abi.js';
import points from '../utils/points.js';
import { verify_Pin } from './pinService.js';

const encode = (type, data) => {
  const singletonIface = new ethers.Interface(SINGLETON);
  return singletonIface.encodeFunctionData(type, data);
};

async function submitInitNamespaceReq(initiatorSafe, namespace, owners) {
  const submitted = await SubmittedProposalReq.findOne({
    key: namespace,
  });
  if (submitted) return { status: false };
  // UPDATE DB
  await SubmittedProposalReq.create({
    initiatorSafe: initiatorSafe,
    target: keyValue('singleton'),
    data: encode('initializeRegistry', [namespace, owners]),
    key: namespace,
    description: `Initialize Namesapce ${namespace}`,
    chain: 'base',
  });

  return { status: true };
}

async function submitReInitNamespaceReq(initiatorSafe, namespace, owners) {
  const submitted = await SubmittedProposalReq.findOne({
    key: namespace,
  });
  if (submitted) return { status: false };
  // UPDATE DB
  await SubmittedProposalReq.create({
    initiatorSafe: initiatorSafe,
    target: keyValue('singleton'),
    data: encode('reInitializeRegistry', [namespace, owners]),
    key: namespace,
    description: `ReInitialize Registry Namesapce ${namespace}`,
    chain: 'base',
  });

  return { status: true };
}

async function linkName(email, owner, pin, name, address) {
  const tx = await _buildAndExecLink(owner, pin, name, address, 'link');

  // UpdateDB
  const userBase = await User.findOne({
    email: email,
  });

  if (userBase) {
    userBase.nameAliases.push({
      name: name,
      wallet: address,
    });
    await userBase.save();
  }

  try {
    if (userBase) {
      const activeNetwork = mode === 'production' ? 'MAINNET' : 'TESTNET';
      let pointsRecord = await PointsRecord.findOne({
        network: activeNetwork,
      });

      if (!pointsRecord) {
        pointsRecord = await PointsRecord.create({
          network: activeNetwork,
        });
      }

      if (pointsRecord.totalPointsIssued < pointsRecord.hardCap) {
        const point = points(pointsRecord, 'registration', undefined);
        if (point && point.status && point.initiator > 0) {
          const initiatorPoints = point.initiator;

          // Check hard cap overage
          if (pointsRecord.totalPointsIssued + initiatorPoints <= pointsRecord.hardCap) {
            userBase.santPoints = (userBase.santPoints || 0) + initiatorPoints;
            await userBase.save();
            pointsRecord.totalPointsIssued += initiatorPoints;
            await pointsRecord.save();
          }
        }
      }
    }
  } catch (err) {
    console.warn('Link Name Point Update Failed: ', err.message);
  }

  return {
    status: tx.status,
    name: name,
    data: tx.data,
  };
}

async function unlinkName(email, owner, name, pin) {
  const tx = await _buildAndExecLink(owner, pin, name, undefined, 'unlink');

  const userBase = await User.findOne({
    email: email,
  });

  if (userBase) {
    userBase.nameAliases.pull({
      name: name,
    });
    await userBase.save();
  }

  const pool = await Pool.findOne({
    poolName: name,
  });

  if (pool) {
    pool.poolName = null;
    await pool.save();
  }

  return {
    status: tx.status,
    name: name,
    data: tx.data,
  };
}

async function _buildAndExecLink(safe, pin, name, address, type) {
  const pinData = await verify_Pin(email, pin);
  const pKey = pinData.privateKey;
  const fee = await estimateLinkFee(safe);
  console.log(fee);
  const feeData = await _getFeeAndToken(safe, fee, 0, 0, 0, 'base');
  if (!feeData.status) {
    throw Error(`❌ No Balance to cover fee`);
  }

  const provider = new ethers.JsonRpcProvider(keyValue('baseRpcUrl'));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const linkData = await _buildLinkData(
    pKey,
    safe,
    name,
    address,
    feeData.data.feeTokenAddress,
    feeData.data.feeToWei,
    provider,
    sponsor,
    type
  );

  const tx = await linkData.safe.execTransaction(
    linkData.params.to,
    linkData.params.value,
    linkData.params.data,
    linkData.params.op,
    linkData.params.safeTxGas,
    linkData.params.baseGas,
    linkData.params.gasPrice,
    linkData.params.gasToken,
    linkData.params.refundReceiver,
    linkData.params.sig
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

export { linkName, unlinkName, submitInitNamespaceReq, submitReInitNamespaceReq };
