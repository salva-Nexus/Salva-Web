import { pointsDistribution } from '../models/PointsState.js';

const points = (pointsRecord, type, tParty) => {
  if (pointsRecord && !pointsRecord.isLocked) {
    const remainingPoints = pointsRecord.hardCap - pointsRecord.totalPointsIssued;
    let totalReward = 0;
    let initiatorReceives = alloc(type, 'initiator');
    let tPartyReceives = alloc(type, 'tParty');
    totalReward += initiatorReceives;
    if (tParty) totalReward += tPartyReceives;
    if (totalReward > remainingPoints) {
      initiatorReceives = remainingPoints / 2;
      tPartyReceives = remainingPoints / 2;
      totalReward = remainingPoints;
    }
    return {
      status: true,
      initiator: initiatorReceives,
      tParty: tPartyReceives,
    };
  } else {
      return {
          status: false,
      }
  }
};

const alloc = (type, to) => {
  return to === 'initiator'
    ? type === 'transfer'
      ? pointsDistribution.transfers.sender
      : type === 'registration'
        ? pointsDistribution.registration.referrer
        : type === 'swap'
          ? pointsDistribution.swaps.ls
          : pointsDistribution.link
    : to === 'tParty'
      ? type === 'transfer'
        ? pointsDistribution.transfers.receiver
        : type === 'swap'
          ? pointsDistribution.swaps.lp
          : pointsDistribution.link
      : 0;
};


export default points;