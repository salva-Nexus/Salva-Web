import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { keyValue, mode } from '../utils/vars.js';
import {
  _appendSafeReq,
  _getTransactionHash,
  _buildLinkData,
  _buildProposeData,
  _getFeeAndToken,
} from './estimateFee.js';
import { Proposals, SubmittedProposalReq } from '../models/Proposals.js';
import { getMultisigAddress, getRpcUrlByChain } from '../utils/rpcUrls.js';

const proposalHash = (receipt, target) => {
  const logs = receipt.logs;
  for (let i = 0; i < logs.length; i++) {
    if (logs[i].address.toLowerCase() === target.toLowerCase()) {
      return logs[i].topics[1];
    }
  }
};

async function proposalRequest() {
  const submitted = await SubmittedProposalReq.find({
    active: true,
  }).lean();
  const s = submitted;
  s.forEach((v) => (v.value = v.value.toString()));
  return s;
}

async function deleteProposalRequest(key) {
  await SubmittedProposalReq.deleteOne({
    key: key,
  });

  return { status: true };
}

async function deleteProposal(proposalHash) {
  await Proposals.deleteOne({
    proposalHash: proposalHash,
  });

  return { status: true };
}

async function proposals(validatorSafe) {
  const proposals = await Proposals.find({
    active: true,
  }).lean();
  if (!proposals) return [{}];
  let p = [];
  for (let i = 0; i < proposals.length; i++) {
    p.push({
      proposal: proposals[i],
      isApproved: proposals[i].approved,
      hasApproved: proposals[i].hasApproved.some(
        (r) => r.validator === validatorSafe.toLowerCase()
      ),
    });
  }

  p.forEach((v) => (v.proposal.value = v.proposal.value.toString()));
  return p;
}

async function propose(key, adminSafe, pin) {
  const submitted = await SubmittedProposalReq.findOne({
    key: key,
  });

  if (!submitted) return { status: false };
  const initData = {
    type: 'propose',
    target: submitted.target,
    value: submitted.value,
    data: submitted.data,
  };
  const multisig = getMultisigAddress(submitted.chain);
  const tx = await _buildAndExecProposal(adminSafe, pin, initData, submitted.chain);
  const pHash = proposalHash(tx.data.receipt, multisig);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const p = await tx.data.multisig.proposal(pHash);

  // UPDATE DB
  await Proposals.create({
    initiatorSafe: submitted.initiatorSafe,
    target: submitted.target,
    value: submitted.value,
    data: submitted.data,
    key: key,
    nonce: p.nonce,
    proposalHash: pHash,
    description: submitted.description,
    chain: submitted.chain,
    remaining: Number(p.remaining),
  });

  await submitted.deleteOne();
  return {
    status: tx.status,
    data: {
      description: submitted.description,
      proposalHash: pHash,
      remaining: Number(p.remaining),
      hasApproved: false,
      isApproved: false,
    },
  };
}

async function approve(proposalHash, adminSafe, pin) {
  const proposal = await Proposals.findOne({
    proposalHash: proposalHash,
  });

  if (!proposal) return { status: false };
  const initData = {
    type: 'approve',
    data: proposalHash,
  };
  const tx = await _buildAndExecProposal(adminSafe, pin, initData, proposal.chain);
  await new Promise((resolve) => setTimeout(resolve, 5000));
  const p = await tx.data.multisig.proposal(proposalHash);

  const approved = p.remaining === 0n ? true : false;
  // UPDATE DB
  proposal.approved = approved;
  proposal.hasApproved.push({ validator: adminSafe });
  proposal.remaining = Number(p.remaining);
  if (p.remaining === 0n) {
    proposal.timeRemaining = new Date(Date.now() + 24 * 60 * 60 * 1000);
  }
  await proposal.save();

  return {
    status: tx.status,
    data: {
      description: proposal.description,
      proposalHash: proposalHash,
      remaining: Number(p.remaining),
      hasApproved: true,
      isApproved: approved,
    },
  };
}

async function execute(proposalHash, adminSafe, pin) {
  const proposal = await Proposals.findOne({
    proposalHash: proposalHash,
  });

  if (!proposal) return { status: false };
  const initData = {
    type: 'execute',
    target: proposal.target,
    value: proposal.value,
    data: proposal.data,
    nonce: proposal.nonce,
  };
  const tx = await _buildAndExecProposal(adminSafe, pin, initData, proposal.chain);
  // UPDATE DB
  const user = await User.findOne({
    safeAddress: proposal.initiatorSafe,
  });

  if (user) {
    user.namespaces.push({
      namespace: proposal.key,
    });
    await user.save();
  }
  await proposal.deleteOne();

  return {
    status: tx.status,
    data: tx.data.receipt,
  };
}

async function _buildAndExecProposal(adminSafeAddress, pin, txData, chain) {
  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const adminData = await User.findOne({
    safeAddress: adminSafe,
  });
  const pinData = await verify_Pin(adminData.email, pin);
  const pKey = pinData.privateKey;
  const proposeData = await _buildProposeData(
    pKey,
    adminSafeAddress,
    txData,
    provider,
    sponsor,
    chain
  );
  const tx = await proposeData.data.safe.execTransaction(
    proposeData.data.params.to,
    proposeData.data.params.value,
    proposeData.data.params.data,
    proposeData.data.params.op,
    proposeData.data.params.safeTxGas,
    proposeData.data.params.baseGas,
    proposeData.data.params.gasPrice,
    proposeData.data.params.gasToken,
    proposeData.data.params.refundReceiver,
    proposeData.data.params.sig
  );

  const receipt = await tx.wait();
  if (receipt.hash) {
    return {
      status: true,
      data: {
        receipt: receipt,
        multisig: proposeData.multisig,
      },
    };
  } else {
    throw new Error('❌ Exec Proposal Failed');
  }
}

export {
  propose,
  approve,
  execute,
  proposalRequest,
  proposals,
  deleteProposalRequest,
  deleteProposal,
};
