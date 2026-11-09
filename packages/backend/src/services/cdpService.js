import { ethers } from 'ethers';
import { User } from '../models/Users.js';
import { CdpPositionManager, UserCdpPosition } from '../models/CDP.js';
import { ERC20, CDP_ABI, SAFE } from '../utils/abi.js';
import { _getDecimals } from './balanceServices.js';
import {
  _getFeeAndToken,
  _estimateReg_Deposit_CollateralFee,
  _estimate_Deposit_CollateralFee,
  _estimate_Open_Position_Fee,
  _estimate_Settle_Position_Fee,
  _estimate_Withdraw_CollateralFee,
  _buildReg_Deposit_CollateralTx,
  _buildWithdrawCollateralTx,
  _buildPositionTx,
} from './estimateFee.js';
import { mode, keyValue } from '../utils/vars.js';
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import { verify_Pin } from './pinService.js';

const Provider = (rpc) => new ethers.JsonRpcProvider(rpc);

async function _findManager(version, chain) {
  const manager = await CdpPositionManager.findOne({
    version: version.trim(),
    chain: chain.toLowerCase(),
    type: mode === 'development' ? 'TESTNET' : 'MAINNET',
  });
  if (!manager) {
    throw new Error(`CDP Position Manager version ${version} not found for ${chain} (${mode})`);
  }
  return manager;
}

async function _findTokenConfig(manager, symbol) {
  const token = manager.whitelistedTokens.find(
    (t) => t.symbol.toUpperCase() === symbol.toUpperCase()
  );
  if (!token) {
    throw new Error(`Token symbol ${symbol} is not whitelisted in version ${manager.version}`);
  }
  return token;
}

/* ========================================================================================= */
/*                                       WRITE ACTIONS                                       */
/* ========================================================================================= */

async function registerAndDepositCollateral(
  safeAddress,
  pin,
  collateralTokenSymbol,
  ratioBps,
  collateralAmount,
  chain,
  version
) {
  const cdpPosition = await UserCdpPosition.findOne({
    userSafeAddress: safeAddress,
    version: version,
    collateralSymbol: collateralTokenSymbol,
    chain: chain,
    type: mode === 'development' ? 'TESTNET' : 'MAINNET',
  });
  if (cdpPosition) return { status: false };
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const dData = await User.findOne({
    safeAddress: safeAddress,
  });
  const pinData = await verify_Pin(dData.email, pin);
  const privateKey = pinData.privateKey;

  const fee = await _estimateReg_Deposit_CollateralFee(
    safeAddress,
    privateKey,
    manager.contractAddress,
    tokenInfo.tokenAddress,
    ratioBps,
    collateralAmount,
    chain
  );
  const feeData = await _getFeeAndToken(safeAddress, fee, chain);

  const isEth = tokenInfo.tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth
    ? undefined
    : new ethers.Contract(tokenInfo.tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const approveAction = !isEth ? 'approve' : undefined;

  const txConfig = {
    contractAddr: approveAction
      ? [
          tokenInfo.tokenAddress,
          manager.contractAddress,
          manager.contractAddress,
          feeData.data.feeTokenAddress,
        ]
      : [manager.contractAddress, manager.contractAddress, feeData.data.feeTokenAddress],
    to: approveAction
      ? [
          manager.contractAddress,
          manager.contractAddress,
          manager.contractAddress,
          keyValue('treasury'),
        ]
      : [manager.contractAddress, manager.contractAddress, keyValue('treasury')],
    amount: approveAction
      ? [amountWei, 0n, amountWei, feeData.data.feeToWei]
      : [0n, amountWei, feeData.data.feeToWei],
    contract: approveAction
      ? [erc20Iface, cdpIface, cdpIface, erc20Iface]
      : [cdpIface, cdpIface, erc20Iface],
    param: {
      token: tokenInfo.tokenAddress,
      ratio: ratioBps,
    },
    sig: approveAction
      ? [approveAction, 'registerCollateral', 'depositCollateral', 'transfer']
      : ['registerCollateral', 'depositCollateral', 'transfer'],
  };

  const txData = await _buildReg_Deposit_CollateralTx(
    safeAddress,
    privateKey,
    manager.contractAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );
  const txResponse = await txData.safe.execTransaction(
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

  const receipt = await txResponse.wait();
  if (!receipt) return { status: false };

  await UserCdpPosition.create({
    userSafeAddress: safeAddress.toLowerCase(),
    version: manager.version,
    positionManagerAddress: manager.contractAddress.toLowerCase(),
    collateralSymbol: tokenInfo.symbol.toUpperCase(),
    collateralAddress: tokenInfo.tokenAddress.toLowerCase(),
    chain: chain.toLowerCase(),
    type: mode === 'development' ? 'TESTNET' : 'MAINNET',
  });

  return { status: true, receipt };
}

async function depositCollateral(
  safeAddress,
  pin,
  collateralTokenSymbol,
  collateralAmount,
  chain,
  version
) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const dData = await User.findOne({
    safeAddress: safeAddress,
  });
  const pinData = await verify_Pin(dData.email, pin);
  const privateKey = pinData.privateKey;

  const fee = await _estimate_Deposit_CollateralFee(
    safeAddress,
    privateKey,
    manager.contractAddress,
    tokenInfo.tokenAddress,
    collateralAmount,
    chain
  );
  const feeData = await _getFeeAndToken(safeAddress, fee, chain);

  const isEth = tokenInfo.tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth
    ? undefined
    : new ethers.Contract(tokenInfo.tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const approveAction = !isEth ? 'approve' : undefined;

  const txConfig = {
    contractAddr: approveAction
      ? [tokenInfo.tokenAddress, manager.contractAddress, feeData.data.feeTokenAddress]
      : [manager.contractAddress, feeData.data.feeTokenAddress],
    to: approveAction
      ? [manager.contractAddress, manager.contractAddress, keyValue('treasury')]
      : [manager.contractAddress, keyValue('treasury')],
    amount: approveAction
      ? [amountWei, amountWei, feeData.data.feeToWei]
      : [amountWei, feeData.data.feeToWei],
    contract: approveAction ? [erc20Iface, cdpIface, erc20Iface] : [cdpIface, erc20Iface],
    param: {
      token: tokenInfo.tokenAddress,
    },
    sig: approveAction
      ? [approveAction, 'depositCollateral', 'transfer']
      : ['depositCollateral', 'transfer'],
  };

  const txData = await _buildReg_Deposit_CollateralTx(
    safeAddress,
    privateKey,
    manager.contractAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );
  const txResponse = await txData.safe.execTransaction(
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

  const receipt = await txResponse.wait();
  if (!receipt) return { status: false };
  return { status: true, data: receipt };
}

async function openPosition(safeAddress, pin, collateralTokenSymbol, ngnsAmount, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);

  const ngnsAmountWei = ethers.parseEther(ngnsAmount.toString());
  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const dData = await User.findOne({
    safeAddress: safeAddress,
  });
  const pinData = await verify_Pin(dData.email, pin);
  const privateKey = pinData.privateKey;

  const fee = await _estimate_Open_Position_Fee(
    safeAddress,
    privateKey,
    manager.contractAddress,
    tokenInfo.tokenAddress,
    ngnsAmount,
    chain
  );
  const feeData = await _getFeeAndToken(safeAddress, fee, chain);

  const txConfig = {
    contractAddr: [manager.contractAddress, feeData.data.feeTokenAddress],
    to: [manager.contractAddress, keyValue('treasury')],
    amount: [ngnsAmountWei, feeData.data.feeToWei],
    contract: [cdpIface, erc20Iface],
    param: {
      token: tokenInfo.tokenAddress,
    },
    sig: ['openPosition', 'transfer'],
  };

  const txData = await _buildPositionTx(
    safeAddress,
    privateKey,
    manager.contractAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );
  const txResponse = await txData.safe.execTransaction(
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

  const receipt = await txResponse.wait();
  return { status: !!receipt, receipt };
}

async function settlePosition(safeAddress, pin, collateralTokenSymbol, ngnsAmount, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);

  const ngnsAmountWei = ethers.parseEther(ngnsAmount.toString());
  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);
  const dData = await User.findOne({
    safeAddress: safeAddress,
  });
  const pinData = await verify_Pin(dData.email, pin);
  const privateKey = pinData.privateKey;

  const fee = await _estimate_Settle_Position_Fee(
    safeAddress,
    privateKey,
    manager.contractAddress,
    tokenInfo.tokenAddress,
    ngnsAmount,
    chain
  );
  const feeData = await _getFeeAndToken(safeAddress, fee, chain);

  const txConfig = {
    contractAddr: [manager.contractAddress, feeData.data.feeTokenAddress],
    to: [manager.contractAddress, keyValue('treasury')],
    amount: [ngnsAmountWei, feeData.data.feeToWei],
    contract: [cdpIface, erc20Iface],
    param: {
      token: tokenInfo.tokenAddress,
    },
    sig: ['settlePosition', 'transfer'],
  };

  const txData = await _buildPositionTx(
    safeAddress,
    privateKey,
    manager.contractAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );
  const txResponse = await txData.safe.execTransaction(
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

  const receipt = await txResponse.wait();
  return { status: !!receipt, receipt };
}

async function withdraw(
  safeAddress,
  pin,
  collateralTokenSymbol,
  receiver,
  collateralAmount,
  chain,
  version
) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const sponsor = new ethers.Wallet(keyValue('sponsorKey'), provider);
  const dData = await User.findOne({
    safeAddress: safeAddress,
  });
  const pinData = await verify_Pin(dData.email, pin);
  const privateKey = pinData.privateKey;

  const fee = await _estimate_Withdraw_CollateralFee(
    safeAddress,
    privateKey,
    manager.contractAddress,
    tokenInfo.tokenAddress,
    receiver,
    collateralAmount,
    chain
  );
  const feeData = await _getFeeAndToken(safeAddress, fee, chain);

  const isEth = tokenInfo.tokenAddress === ethers.ZeroAddress;
  const tokenContract = isEth
    ? undefined
    : new ethers.Contract(tokenInfo.tokenAddress, ERC20, provider);
  const decimals = tokenContract ? await _getDecimals(tokenContract) : 18;
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const cdpIface = new ethers.Interface(CDP_ABI);
  const erc20Iface = new ethers.Interface(ERC20);

  const txConfig = {
    contractAddr: [manager.contractAddress, feeData.data.feeTokenAddress],
    to: [manager.contractAddress, keyValue('treasury')],
    amount: [amountWei, feeData.data.feeToWei],
    contract: [cdpIface, erc20Iface],
    param: {
      token: tokenInfo.tokenAddress,
      receiver: receiver,
    },
    sig: ['withdraw', 'transfer'],
  };

  const txData = await _buildWithdrawCollateralTx(
    safeAddress,
    privateKey,
    manager.contractAddress,
    txConfig,
    provider,
    sponsor,
    chain
  );
  const txResponse = await txData.safe.execTransaction(
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

  const receipt = await txResponse.wait();
  if (!receipt) return { status: false };
  return { status: true, data: receipt };
}

/* ========================================================================================= */
/*                                       VIEW FUNCTIONS                                      */
/* ========================================================================================= */

async function userConfig(safeAddress, collateralTokenSymbol, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const cdpContract = new ethers.Contract(manager.contractAddress, CDP_ABI, provider);

  const result = await cdpContract.userConfig(safeAddress, tokenInfo.tokenAddress);
  return {
    customCollateralRatio: result[0].customCollateralRatio.toString(),
    collateralDeposited: result[1].collateralDeposited.toString(),
    mintedNgns: result[1].mintedNgns.toString(),
  };
}

async function userPositionHealth(safeAddress, collateralTokenSymbol, debtAmount, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const cdpContract = new ethers.Contract(manager.contractAddress, CDP_ABI, provider);

  const debtWei = ethers.parseUnits(debtAmount.toString(), 18);
  const healthBps = await cdpContract.userPositionHealth(
    safeAddress,
    tokenInfo.tokenAddress,
    debtWei
  );
  return healthBps.toString();
}

async function collateralAmountWithdrawable(safeAddress, collateralTokenSymbol, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const cdpContract = new ethers.Contract(manager.contractAddress, CDP_ABI, provider);

  const withdrawableWei = await cdpContract.collateralAmountWithdrawable(
    safeAddress,
    tokenInfo.tokenAddress
  );
  const decimals =
    tokenInfo.tokenAddress === ethers.ZeroAddress
      ? 18
      : await _getDecimals(new ethers.Contract(tokenInfo.tokenAddress, ERC20, provider));
  return ethers.formatUnits(withdrawableWei, decimals);
}

async function ngnValue(collateralTokenSymbol, collateralAmount, chain, version) {
  const manager = await _findManager(version, chain);
  const tokenInfo = await _findTokenConfig(manager, collateralTokenSymbol);
  const provider = Provider(getRpcUrlByChain(chain.toLowerCase()));
  const cdpContract = new ethers.Contract(manager.contractAddress, CDP_ABI, provider);

  const decimals =
    tokenInfo.tokenAddress === ethers.ZeroAddress
      ? 18
      : await _getDecimals(new ethers.Contract(tokenInfo.tokenAddress, ERC20, provider));
  const amountWei = ethers.parseUnits(collateralAmount.toString(), decimals);

  const valWei = await cdpContract.ngnValue(tokenInfo.tokenAddress, amountWei);
  return ethers.formatUnits(valWei, 18);
}

export {
  _findManager,
  _findTokenConfig,
  registerAndDepositCollateral,
  depositCollateral,
  openPosition,
  settlePosition,
  withdraw,
  userConfig,
  userPositionHealth,
  collateralAmountWithdrawable,
  ngnValue,
};
