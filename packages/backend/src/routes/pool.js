const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');
const { provider } = require('../services/walletSigner');
const relay = require('../services/relayService');

const Pool = require('../models/Pool');
const { getL1TokenDecimals } = require('../utils/l1Decimals');
const { estimatePoolFee } = require('../services/gasOracle');
const PoolSubscription = require('../models/PoolSubscription');
const TrustedPool = require('../models/TrustedPool');
const FeeConfig = require('../models/FeeConfig');

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const POOL_VIEW_ABI = [
  'function availableLiquidity(address asset) external view returns (uint256)',
  'function _getBuyRate() public view returns (uint256)',
  'function _getSellRate() public view returns (uint256)',
  'function getDeployer() external view returns (address)',
  'function getMinuimumNgnAmount() external view returns (uint256)',
  'function getMinuimumUSDAmount() external view returns (uint256)',
  'function isPaused() external view returns (bool)',
  'function getExactUSDAmountOut(address usdToken, uint256 ngnAmountIn, uint256 exRate) public view returns (uint256)',
  'function getExactNGNAmountOut(address usdToken, uint256 usdAmountIn, uint256 exRate) public view returns (uint256)',
  'function getExactNGNAmountIn(address usdToken, uint256 usdAmountOut, uint256 exRate) public view returns (uint256)',
  'function getExactUSDAmountIn(address usdTokenIn, uint256 ngnAmountOut, uint256 exRate) public view returns (uint256)',
];

const POOL_WRITE_ABI = [
  'function removeLiquidity(address asset, uint256 amount) external returns (bool)',
  'function updateBuyRate(uint256 _exRate) external returns (bool)',
  'function updateSellRate(uint256 _exRate) external returns (bool)',
  'function pause() external returns (bool)',
  'function unpause() external returns (bool)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

// ─── Pool Fee Helpers ─────────────────────────────────────────────────────────

const MULTISEND_ADDR = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';
const MULTISEND_IFACE = new ethers.Interface(['function multiSend(bytes memory transactions) public payable']);
const ERC20_TRANSFER_IFACE = new ethers.Interface(['function transfer(address to, uint256 amount) returns (bool)']);

// Shared MultiSend tx encoder — identical logic to what was inline in update-rates/set-mins
function _encodeMultiSendTx(to, data) {
  const dataBytes = ethers.getBytes(data);
  const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
  let offset = 0;
  buf[offset++] = 0; // CALL operation
  ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
  ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
  ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32)).forEach((b) => (buf[offset++] = b));
  dataBytes.forEach((b) => (buf[offset++] = b));
  return buf;
}

// Build a MultiSend calldata from an array of { to, data } objects
function _buildMultiSend(calls) {
  return MULTISEND_IFACE.encodeFunctionData('multiSend', [
    ethers.concat(calls.map((c) => _encodeMultiSendTx(c.to, c.data))),
  ]);
}

// Get pool operation fee (both NGN and USD) with fallback
async function _getPoolFee(chain) {
  try {
    return await estimatePoolFee(chain);
  } catch (err) {
    console.error(`❌ [pool fee] estimatePoolFee failed, using fallback:`, err.message);
    const isBNB = chain === 'bnb';
    const feeNGN = isBNB ? 50 : 20;
    const feeUSD = isBNB ? 0.04 : 0.015;
    return {
      feeNGN,
      feeUSD,
      feeWeiNGN: ethers.parseUnits(feeNGN.toFixed(6), 6),
      feeWeiUSD: ethers.parseUnits(feeUSD.toFixed(6), 6),
      ngnDecimals: 6,
      usdDecimals: 6,
    };
  }
}

// Resolve which token to collect the pool fee from.
// Priority: NGNs → cNGN → USDT → USDC
// Returns { tokenAddress, symbol, feeWei, decimals } or null if no balance covers fee.
async function _resolveFeeToken(chain, safeAddress, feeNGN, feeUSD, feeWeiNGN, feeWeiUSD) {
  const isProd = process.env.NODE_ENV === 'production';
  const isBNB = chain === 'bnb';

  const candidates = isBNB
    ? [
        { symbol: 'NGNs', address: cleanAddr(isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS), feeWei: feeWeiNGN, feeAmount: feeNGN },
        { symbol: 'cNGN', address: cleanAddr(isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS), feeWei: feeWeiNGN, feeAmount: feeNGN },
        { symbol: 'USDT', address: cleanAddr(isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS), feeWei: feeWeiUSD, feeAmount: feeUSD },
        { symbol: 'USDC', address: cleanAddr(isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS), feeWei: feeWeiUSD, feeAmount: feeUSD },
      ]
    : [
        { symbol: 'NGNs', address: cleanAddr(process.env.NGN_TOKEN_ADDRESS), feeWei: feeWeiNGN, feeAmount: feeNGN },
        { symbol: 'cNGN', address: cleanAddr(process.env.CNGN_CONTRACT_ADDRESS), feeWei: feeWeiNGN, feeAmount: feeNGN },
        { symbol: 'USDT', address: cleanAddr(process.env.USDT_CONTRACT_ADDRESS), feeWei: feeWeiUSD, feeAmount: feeUSD },
        { symbol: 'USDC', address: cleanAddr(process.env.USDC_CONTRACT_ADDRESS), feeWei: feeWeiUSD, feeAmount: feeUSD },
      ];

  // Balance check provider — always public nodes, no Alchemy
  const rpcUrl = isBNB
    ? (isProd ? 'https://bsc-dataseed.bnbchain.org' : 'https://bsc-testnet-rpc.publicnode.com')
    : (isProd ? 'https://mainnet.base.org' : 'https://sepolia.base.org');
  const checkProvider = new ethers.JsonRpcProvider(rpcUrl);

  const ERC20_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];

  for (const c of candidates) {
    if (!c.address) continue;
    try {
      // Decimals: Base hardcoded 6, BNB fetched from factory (cached)
      let decimals = 6;
      if (isBNB) {
        decimals = await getL1TokenDecimals(ethers.getAddress(c.address)).catch(() => 6);
      }
      const contract = new ethers.Contract(ethers.getAddress(c.address), ERC20_BAL_ABI, checkProvider);
      const bal = await contract.balanceOf(ethers.getAddress(safeAddress));
      const balNum = parseFloat(ethers.formatUnits(bal, decimals));
      if (balNum >= c.feeAmount) {
        console.log(`✅ [pool fee] Token: ${c.symbol} | balance=${balNum.toFixed(4)} >= fee=${c.feeAmount} chain=${chain}`);
        return { tokenAddress: c.address, symbol: c.symbol, feeWei: c.feeWei, decimals };
      }
      console.log(`⏭️ [pool fee] Skip ${c.symbol}: balance=${balNum.toFixed(4)} < fee=${c.feeAmount}`);
    } catch (e) {
      console.warn(`⚠️ [pool fee] Balance check failed for ${c.symbol}:`, e.message);
    }
  }
  return null; // no token has enough
}

function _feeErrorMsg(feeNGN, feeUSD) {
  return `Insufficient balance for network fee. Need ₦${feeNGN} NGNs, ₦${feeNGN} cNGN, $${feeUSD} USDT, or $${feeUSD} USDC in your wallet.`;
}

// Treasury address by chain
function _treasury(isBNB) {
  const isProd = process.env.NODE_ENV === 'production';
  return isBNB
    ? cleanAddr(isProd ? process.env.L1_TREASURY_CONTRACT_ADDRESS : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS)
    : cleanAddr(process.env.TREASURY_CONTRACT_ADDRESS);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanAddr(raw) {
  if (!raw) return null;
  const match = String(raw).match(/(0x[0-9a-fA-F]{40})/);
  return match ? match[1].toLowerCase() : null;
}

function resolveTokenSymbol(symbol) {
  switch ((symbol || '').toUpperCase()) {
    case 'NGNS':
      return cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    case 'CNGN':
      return cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
    case 'USDT':
      return cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
    case 'USDC':
      return cleanAddr(process.env.USDC_CONTRACT_ADDRESS);
    default:
      return null;
  }
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

async function waitForTxReceipt(txHash, timeoutMs = 120_000) {
  console.log(`🔍 Waiting for on-chain confirmation: ${txHash}`);
  try {
    const receipt = await provider.waitForTransaction(txHash, 1, timeoutMs);
    if (!receipt) return { success: false, reason: 'Transaction confirmation timeout' };
    if (receipt.status === 1) {
      console.log(`✅ Transaction ${txHash} confirmed (block ${receipt.blockNumber})`);
      return { success: true, receipt };
    }
    console.error(`❌ Transaction ${txHash} reverted on-chain`);
    return { success: false, reason: 'Transaction reverted on-chain' };
  } catch (err) {
    console.error(`❌ Error waiting for receipt (${txHash}):`, err.message);
    return { success: false, reason: err.message || 'Could not confirm transaction' };
  }
}

async function fetchPoolOnChain(poolAddress, isL1 = false) {
  const isProd = process.env.NODE_ENV === 'production';

  // L1 uses ETH RPC + L1 token addresses + balanceOf (raw transfer approach)
  // L2 uses Base RPC + L2 token addresses + availableLiquidity (internal accounting)
  let ngnsAddr, cNgnAddr, usdtAddr, usdcAddr, poolProvider;

  if (isL1) {
    ngnsAddr = cleanAddr(
      isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
    );
    cNgnAddr = cleanAddr(
      isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
    );
    usdtAddr = cleanAddr(
      isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
    );
    usdcAddr = cleanAddr(
      isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
    );
    const l1Rpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    poolProvider = new ethers.JsonRpcProvider(l1Rpc);
  } else {
    ngnsAddr = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    cNgnAddr = cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
    usdtAddr = cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
    usdcAddr = cleanAddr(process.env.USDC_CONTRACT_ADDRESS);
    poolProvider = provider; // existing Base provider from walletSigner
  }

  const ERC20_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];
  const poolAddr = ethers.getAddress(poolAddress);
  const poolContract = new ethers.Contract(poolAddr, POOL_VIEW_ABI, poolProvider);

  if (isL1) {
    // L1: tokens were sent via raw transfer — read balanceOf on each token contract
    // Fetch decimals from PoolFactory (BSC testnet or mainnet depending on NODE_ENV)
    const [ngnsDecimals, cNgnDecimals, usdtDecimals, usdcDecimals] = await Promise.all([
      ngnsAddr ? getL1TokenDecimals(ngnsAddr).catch(() => 18) : Promise.resolve(18),
      cNgnAddr ? getL1TokenDecimals(cNgnAddr).catch(() => 18) : Promise.resolve(18),
      usdtAddr ? getL1TokenDecimals(usdtAddr).catch(() => 18) : Promise.resolve(18),
      usdcAddr ? getL1TokenDecimals(usdcAddr).catch(() => 18) : Promise.resolve(18),
    ]);

    const settled = await Promise.allSettled([
      ngnsAddr
        ? new ethers.Contract(ethers.getAddress(ngnsAddr), ERC20_BAL_ABI, poolProvider).balanceOf(
            poolAddr
          )
        : Promise.resolve(0n),
      cNgnAddr
        ? new ethers.Contract(ethers.getAddress(cNgnAddr), ERC20_BAL_ABI, poolProvider).balanceOf(
            poolAddr
          )
        : Promise.resolve(0n),
      usdtAddr
        ? new ethers.Contract(ethers.getAddress(usdtAddr), ERC20_BAL_ABI, poolProvider).balanceOf(
            poolAddr
          )
        : Promise.resolve(0n),
      usdcAddr
        ? new ethers.Contract(ethers.getAddress(usdcAddr), ERC20_BAL_ABI, poolProvider).balanceOf(
            poolAddr
          )
        : Promise.resolve(0n),
      poolContract._getBuyRate(),
      poolContract._getSellRate(),
      poolContract.getMinuimumNgnAmount(),
      poolContract.getMinuimumUSDAmount(),
      poolContract.isPaused(),
    ]);

    const val = (r) => (r.status === 'fulfilled' ? r.value : 0n);
    const valBool = (r) => (r.status === 'fulfilled' ? r.value : false);
    const [ngnsLiq, cNgnLiq, usdtLiq, usdcLiq, buyRate, sellRate, minNgn, minToken] = settled
      .slice(0, 8)
      .map(val);
    const isPaused = valBool(settled[8]);

    // Rates and minimums are stored as 6-decimal fixed-point on the pool contract itself
    // (that is the pool contract's own internal precision — not the token's decimals).
    // Only token balances use the token's actual decimals.
    return {
      ngnsLiquidity: ethers.formatUnits(ngnsLiq, ngnsDecimals),
      cNgnLiquidity: ethers.formatUnits(cNgnLiq, cNgnDecimals),
      usdtLiquidity: ethers.formatUnits(usdtLiq, usdtDecimals),
      usdcLiquidity: ethers.formatUnits(usdcLiq, usdcDecimals),
      buyRate: ethers.formatUnits(buyRate, 6),
      sellRate: ethers.formatUnits(sellRate, 6),
      minNgnAmount: ethers.formatUnits(minNgn, 6),
      minTokenAmount: ethers.formatUnits(minToken, 6),
      isPaused,
    };
  } else {
    // L2: uses availableLiquidity internal accounting
    const settled = await Promise.allSettled([
      poolContract.availableLiquidity(ngnsAddr),
      poolContract.availableLiquidity(cNgnAddr),
      poolContract.availableLiquidity(usdtAddr),
      poolContract.availableLiquidity(usdcAddr),
      poolContract._getBuyRate(),
      poolContract._getSellRate(),
      poolContract.getMinuimumNgnAmount(),
      poolContract.getMinuimumUSDAmount(),
      poolContract.isPaused(),
    ]);

    const val = (r) => (r.status === 'fulfilled' ? r.value : 0n);
    const valBool = (r) => (r.status === 'fulfilled' ? r.value : false);
    const [ngnsLiq, cNgnLiq, usdtLiq, usdcLiq, buyRate, sellRate, minNgn, minToken] = settled
      .slice(0, 8)
      .map(val);
    const isPaused = valBool(settled[8]);

    return {
      ngnsLiquidity: ethers.formatUnits(ngnsLiq, 6),
      cNgnLiquidity: ethers.formatUnits(cNgnLiq, 6),
      usdtLiquidity: ethers.formatUnits(usdtLiq, 6),
      usdcLiquidity: ethers.formatUnits(usdcLiq, 6),
      buyRate: ethers.formatUnits(buyRate, 6),
      sellRate: ethers.formatUnits(sellRate, 6),
      minNgnAmount: ethers.formatUnits(minNgn, 6),
      minTokenAmount: ethers.formatUnits(minToken, 6),
      isPaused,
    };
  }
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

router.post('/deploy', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: 'Missing ownerSafeAddress or ownerPrivateKey' });

    const factoryAddr = cleanAddr(process.env.POOL_FACTORY_ADDRESS);
    if (!factoryAddr)
      return res.status(500).json({ message: 'POOL_FACTORY_ADDRESS not configured in .env' });

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: dFeeNGN, feeUSD: dFeeUSD, feeWeiNGN: dFeeWeiNGN, feeWeiUSD: dFeeWeiUSD } =
      await _getPoolFee('base');
    const dFeeToken = await _resolveFeeToken('base', cleanOwner, dFeeNGN, dFeeUSD, dFeeWeiNGN, dFeeWeiUSD);
    if (!dFeeToken) return res.status(400).json({ message: _feeErrorMsg(dFeeNGN, dFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    // Deploy pool + collect fee in single Safe tx via MultiSend
    const FACTORY_IFACE_LOCAL = new ethers.Interface(['function deployPool() external returns (address pool)']);
    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(factoryAddr), data: FACTORY_IFACE_LOCAL.encodeFunctionData('deployPool', []) },
        { to: ethers.getAddress(dFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), dFeeToken.feeWei]) },
      ]), 1
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Deploy transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Deploy reverted on-chain' });

    const POOL_DEPLOYED_TOPIC = ethers.id('PoolDeployed(address,address)');
    let poolAddress = null;

    for (const log of taskStatus.receipt.logs) {
      try {
        if (!log.topics || log.topics.length < 3) continue;
        if (log.topics[0].toLowerCase() !== POOL_DEPLOYED_TOPIC.toLowerCase()) continue;
        poolAddress = ethers.getAddress('0x' + log.topics[2].slice(-40));
        break;
      } catch (parseErr) {
        console.warn('⚠️ Log parse skip:', parseErr.message);
      }
    }

    if (!poolAddress) {
      console.error('❌ Could not find PoolDeployed event. Logs:');
      console.error(
        JSON.stringify(
          taskStatus.receipt.logs.map((l) => ({
            address: l.address,
            topics: l.topics,
            data: l.data,
          })),
          null,
          2
        )
      );
      return res.status(400).json({
        message:
          'Pool deployed on-chain but address could not be parsed from event. Check server logs.',
        txHash: result.txHash,
      });
    }

    const existing = await Pool.findOne({ poolAddress: poolAddress.toLowerCase() });
    if (!existing) {
      await Pool.create({ poolAddress: poolAddress.toLowerCase(), ownerSafeAddress: cleanOwner });
    }

    console.log(`✅ Pool deployed: ${poolAddress} by ${cleanOwner} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, poolAddress });
  } catch (err) {
    console.error('❌ /pool/deploy:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/provide-liquidity', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: 'Missing required fields' });

    const tokenAddr = resolveTokenSymbol(asset);
    if (!tokenAddr) return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const amountWei = ethers.parseUnits(String(amount), 6);

    const tokenContract = new ethers.Contract(ethers.getAddress(tokenAddr), ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(ethers.getAddress(cleanOwner));
    if (balance < amountWei)
      return res.status(400).json({
        message: `Insufficient ${asset} balance. You have ${ethers.formatUnits(balance, 6)} ${asset}.`,
      });

    const ERC20_IFACE = new ethers.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);
    const transferCalldata = ERC20_IFACE.encodeFunctionData('transfer', [
      ethers.getAddress(cleanPool),
      amountWei,
    ]);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: plFeeNGN, feeUSD: plFeeUSD, feeWeiNGN: plFeeWeiNGN, feeWeiUSD: plFeeWeiUSD } =
      await _getPoolFee('base');
    const plFeeToken = await _resolveFeeToken('base', cleanOwner, plFeeNGN, plFeeUSD, plFeeWeiNGN, plFeeWeiUSD);
    if (!plFeeToken) return res.status(400).json({ message: _feeErrorMsg(plFeeNGN, plFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(tokenAddr), data: transferCalldata },
        { to: ethers.getAddress(plFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), plFeeToken.feeWei]) },
      ]), 1
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Transfer failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Transfer reverted' });

    console.log(`✅ LP provided ${amount} ${asset} to pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error('❌ /pool/provide-liquidity:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/remove-liquidity', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: 'Missing required fields' });

    const tokenAddr = resolveTokenSymbol(asset);
    if (!tokenAddr) return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const amountWei = ethers.parseUnits(String(amount), 6);

    const poolContract = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, provider);
    const poolBal = await poolContract.availableLiquidity(ethers.getAddress(tokenAddr));
    if (poolBal < amountWei)
      return res.status(400).json({
        message: `Pool only has ${ethers.formatUnits(poolBal, 6)} ${asset} available.`,
      });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);
    const calldata = POOL_IFACE.encodeFunctionData('removeLiquidity', [
      ethers.getAddress(tokenAddr),
      amountWei,
    ]);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: rlFeeNGN, feeUSD: rlFeeUSD, feeWeiNGN: rlFeeWeiNGN, feeWeiUSD: rlFeeWeiUSD } =
      await _getPoolFee('base');
    const rlFeeToken = await _resolveFeeToken('base', cleanOwner, rlFeeNGN, rlFeeUSD, rlFeeWeiNGN, rlFeeWeiUSD);
    if (!rlFeeToken) return res.status(400).json({ message: _feeErrorMsg(rlFeeNGN, rlFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(cleanPool), data: calldata },
        { to: ethers.getAddress(rlFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), rlFeeToken.feeWei]) },
      ]), 1
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Remove liquidity failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Remove liquidity reverted' });

    console.log(`✅ LP removed ${amount} ${asset} from pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error('❌ /pool/remove-liquidity:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/update-rates', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, buyRate, sellRate } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: 'Missing required fields' });
    if (buyRate === undefined && sellRate === undefined)
      return res.status(400).json({ message: 'At least one of buyRate or sellRate required' });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);

    const encodeRate = (humanRate) => ethers.parseUnits(parseFloat(humanRate).toFixed(6), 6);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: rFeeNGN, feeUSD: rFeeUSD, feeWeiNGN: rFeeWeiNGN, feeWeiUSD: rFeeWeiUSD } =
      await _getPoolFee('base');
    const rFeeToken = await _resolveFeeToken('base', cleanOwner, rFeeNGN, rFeeUSD, rFeeWeiNGN, rFeeWeiUSD);
    if (!rFeeToken) return res.status(400).json({ message: _feeErrorMsg(rFeeNGN, rFeeUSD) });
    const rFeeTx = { to: ethers.getAddress(rFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), rFeeToken.feeWei]) };
    // ─────────────────────────────────────────────────────────────────────────

    let result;

    if (buyRate !== undefined && sellRate !== undefined) {
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('updateBuyRate', [encodeRate(buyRate)]) },
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('updateSellRate', [encodeRate(sellRate)]) },
          rFeeTx,
        ]), 1
      );
    } else {
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: buyRate !== undefined
              ? POOL_IFACE.encodeFunctionData('updateBuyRate', [encodeRate(buyRate)])
              : POOL_IFACE.encodeFunctionData('updateSellRate', [encodeRate(sellRate)]) },
          rFeeTx,
        ]), 1
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Rate update failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Rate update reverted' });

    console.log(`✅ Rates updated on pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/update-rates:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/toggle-pause', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, pause } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || pause === undefined)
      return res.status(400).json({ message: 'Missing required fields' });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);
    const calldata = pause
      ? POOL_IFACE.encodeFunctionData('pause', [])
      : POOL_IFACE.encodeFunctionData('unpause', []);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: tpFeeNGN, feeUSD: tpFeeUSD, feeWeiNGN: tpFeeWeiNGN, feeWeiUSD: tpFeeWeiUSD } =
      await _getPoolFee('base');
    const tpFeeToken = await _resolveFeeToken('base', cleanOwner, tpFeeNGN, tpFeeUSD, tpFeeWeiNGN, tpFeeWeiUSD);
    if (!tpFeeToken) return res.status(400).json({ message: _feeErrorMsg(tpFeeNGN, tpFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(cleanPool), data: calldata },
        { to: ethers.getAddress(tpFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), tpFeeToken.feeWei]) },
      ]), 1
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Toggle pause failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Toggle pause reverted' });

    res.json({ success: true, txHash: result.txHash, paused: pause });
  } catch (err) {
    console.error('❌ /pool/toggle-pause:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/quote', async (req, res) => {
  try {
    const { poolAddress, swapFn, amount, isL1, stableToken } = req.body;
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanPool || !swapFn || !amount)
      return res.status(400).json({ message: 'Missing fields' });
    if (!stableToken)
      return res.status(400).json({ message: 'Missing stableToken' });

    const isProd = process.env.NODE_ENV === 'production';
    const isL1Flag = isL1 === true || isL1 === 'true';
    function resolveQuoteStableAddr(sym) {
      const s = (sym || '').toUpperCase();
      if (isL1Flag) {
        if (s === 'USDT') return cleanAddr(isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS);
        if (s === 'USDC') return cleanAddr(isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS);
      } else {
        if (s === 'USDT') return cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
        if (s === 'USDC') return cleanAddr(process.env.USDC_CONTRACT_ADDRESS);
      }
      return null;
    }
    const stableAddr = resolveQuoteStableAddr(stableToken);
    if (!stableAddr)
      return res.status(400).json({ message: `Cannot resolve address for: ${stableToken}` });
    const usdTokenAddr = ethers.getAddress(stableAddr);

    // For L1, tokens can be 18 decimals (BSC USDT/USDC/NGNs) — fetch actual decimals.
    // For L2, all tokens are 6 decimals — hardcode to avoid extra RPC calls.
    let amountDecimals = 6;
    let quoteDecimals = 6;

    if (isL1Flag) {
      // Determine which token the `amount` param represents (the one being scaled to wei)
      // and which token the quote output represents (needed to format quoteWei back to human)
      const ngnAddrForDecimals = cleanAddr(isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS);
      const isAmountNgn = swapFn === 'swapExactNGNAmountForUSD' || swapFn === 'swapForExactNGNAmount';
      const amountTokenAddr = isAmountNgn ? ngnAddrForDecimals : stableAddr;
      const quoteIsNgn = swapFn === 'swapExactUSDAmountForNGN' || swapFn === 'swapForExactUSDAmount';
      const quoteTokenAddr = quoteIsNgn ? ngnAddrForDecimals : stableAddr;

      [amountDecimals, quoteDecimals] = await Promise.all([
        amountTokenAddr ? getL1TokenDecimals(ethers.getAddress(amountTokenAddr)).catch(() => 18) : Promise.resolve(18),
        quoteTokenAddr ? getL1TokenDecimals(ethers.getAddress(quoteTokenAddr)).catch(() => 18) : Promise.resolve(18),
      ]);
    }

    const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(amountDecimals)), amountDecimals);

    const quoteProvider =
      isL1 === true || isL1 === 'true'
        ? new ethers.JsonRpcProvider(
            process.env.NODE_ENV === 'production'
              ? process.env.BNB_MAINNET_RPC_URL
              : process.env.BNB_TESTNET_RPC_URL
          )
        : provider;

    const pool = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, quoteProvider);

    const [buyRate, sellRate] = await Promise.all([pool._getBuyRate(), pool._getSellRate()]);

    let quoteWei;

    switch (swapFn) {
      case 'swapExactNGNAmountForUSD':
        if (buyRate === 0n) return res.status(400).json({ message: 'Pool buy rate not set' });
        quoteWei = await pool.getExactUSDAmountOut(usdTokenAddr, amountWei, buyRate);
        break;
      case 'swapForExactUSDAmount':
        if (buyRate === 0n) return res.status(400).json({ message: 'Pool buy rate not set' });
        quoteWei = await pool.getExactNGNAmountIn(usdTokenAddr, amountWei, buyRate);
        break;
      case 'swapExactUSDAmountForNGN':
        if (sellRate === 0n) return res.status(400).json({ message: 'Pool sell rate not set' });
        quoteWei = await pool.getExactNGNAmountOut(usdTokenAddr, amountWei, sellRate);
        break;
      case 'swapForExactNGNAmount':
        if (sellRate === 0n) return res.status(400).json({ message: 'Pool sell rate not set' });
        quoteWei = await pool.getExactUSDAmountIn(usdTokenAddr, amountWei, sellRate);
        break;
      default:
        return res.status(400).json({ message: `Invalid swapFn: ${swapFn}` });
    }

    res.json({
      success: true,
      quoteHuman: ethers.formatUnits(quoteWei, quoteDecimals),
      quoteWei: quoteWei.toString(),
      buyRate: ethers.formatUnits(buyRate, 6),
      sellRate: ethers.formatUnits(sellRate, 6),
    });
  } catch (err) {
    console.error('❌ /pool/quote:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/pool/token-decimals?address=0x… ─────────────────────────────────
// Returns the decimal count for a given L1 token by calling the PoolFactory.
// Used by the frontend swap modal to build correct amountWei.
router.get('/token-decimals', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address || !ethers.isAddress(address)) {
      return res.status(400).json({ message: 'Valid token address required' });
    }
    const decimals = await getL1TokenDecimals(ethers.getAddress(address));
    res.json({ decimals });
  } catch (err) {
    console.error('❌ /pool/token-decimals:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/set-name', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, poolName } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanPool || !cleanOwner || !poolName)
      return res.status(400).json({ message: 'Missing fields' });

    const pool = await Pool.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'Pool not found' });

    pool.poolName = poolName.trim();
    await pool.save();
    res.json({ success: true, pool });
  } catch (err) {
    console.error('❌ /pool/set-name:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/my/:ownerSafeAddress', async (req, res) => {
  try {
    const cleanOwner = cleanAddr(req.params.ownerSafeAddress);
    if (!cleanOwner) return res.status(400).json({ message: 'Invalid address' });

    const pools = await Pool.find({ ownerSafeAddress: cleanOwner, deleted: false });

    const enriched = await Promise.all(
      pools.map(async (p) => {
        try {
          const onChain = await fetchPoolOnChain(p.poolAddress);
          return { ...p.toJSON(), ...onChain };
        } catch {
          return p.toJSON();
        }
      })
    );

    res.json({ pools: enriched });
  } catch (err) {
    console.error('❌ /pool/my:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/subscription-fee', async (req, res) => {
  try {
    let config = await FeeConfig.findById('main');
    if (!config) config = await FeeConfig.create({ _id: 'main' });
    const monthly = config.poolSubscriptionMonthlyFee || 5000;
    res.json({
      monthly: 3000,
      tiers: [
        { months: 1, total: 3000, label: '1 Month' },
        { months: 2, total: 6000, label: '2 Months' },
        { months: 6, total: 18000, label: '6 Months' },
        { months: 12, total: 36000, label: '12 Months' },
      ],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/subscribe', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, ownerPrivateKey, months } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: 'Missing required fields' });

    const validMonths = [1, 2, 6, 12];
    const m = Number(months);
    if (!validMonths.includes(m))
      return res.status(400).json({ message: 'months must be 1, 2, 6, or 12' });

    const pool = await Pool.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'Pool not found' });

    let config = await FeeConfig.findById('main');
    if (!config) config = await FeeConfig.create({ _id: 'main' });

    const TIER_PRICES = { 1: 3000, 2: 6000, 6: 18000, 12: 36000 };
    const totalFee = TIER_PRICES[m];
    if (!totalFee) return res.status(400).json({ message: 'Invalid subscription tier' });
    const feeWei = ethers.parseUnits(String(totalFee), 6);

    const ngnsAddr = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    if (!ngnsAddr) return res.status(500).json({ message: 'NGNs_TOKEN_ADDRESS not configured' });

    const ngnContract = new ethers.Contract(ethers.getAddress(ngnsAddr), ERC20_ABI, provider);
    const balance = await ngnContract.balanceOf(ethers.getAddress(cleanOwner));
    if (balance < feeWei)
      return res.status(400).json({
        message: `Insufficient NGNs. Need ${totalFee.toLocaleString()} NGNs for ${m} month(s).`,
        required: totalFee,
        balance: ethers.formatUnits(balance, 6),
      });

    const treasury = cleanAddr(process.env.TREASURY_CONTRACT_ADDRESS);
    if (!treasury)
      return res.status(500).json({ message: 'TREASURY_CONTRACT_ADDRESS not configured' });

    const result = await relay.sponsorNGNsPayment(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(treasury),
      feeWei
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Subscription transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res
        .status(400)
        .json({ message: taskStatus.reason || 'Subscription payment reverted' });

    const now = new Date();
    const base =
      pool.subscriptionExpiresAt && pool.subscriptionExpiresAt > now
        ? pool.subscriptionExpiresAt
        : now;

    const newExpiry = addMonths(base, m);

    await PoolSubscription.create({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      months: m,
      amountPaid: totalFee,
      txHash: result.txHash,
      startedAt: base,
      expiresAt: newExpiry,
    });

    pool.subscriptionExpiresAt = newExpiry;
    pool.isPublished = true;
    pool.totalSubscribedMonths += m;
    await pool.save();

    res.json({
      success: true,
      txHash: result.txHash,
      subscriptionExpiresAt: newExpiry,
      totalFee,
      months: m,
    });
  } catch (err) {
    console.error('❌ /pool/subscribe:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/pool/published ───────────────────────────────────────────────────
//
// DISPLAY RULES:
//   SELL USDT/USDC tab: subscribed + (NGNs or cNGN) liquidity > 0 + sellRate > 0
//   BUY USDT/USDC tab:  subscribed + (USDT or USDC) liquidity > 0 + buyRate > 0
//
//   If rate is not set (= 0), pool is hidden even if subscribed and funded.
//   Pool can appear on both tabs if it has both NGNs and stable liquidity
//   with both rates set.
//
router.get('/published', async (req, res) => {
  try {
    const { search } = req.query;
    const now = new Date();

    // Auto-expire lapsed subscriptions
    await Pool.updateMany(
      { isPublished: true, subscriptionExpiresAt: { $lt: now }, deleted: false },
      { isPublished: false }
    );

    let pools;
    if (search?.trim()) {
      const s = search.trim();
      // Search includes unsubscribed pools — user is deliberately looking for a specific pool
      pools = await Pool.find({
        deleted: false,
        $or: [
          { poolAddress: { $regex: s, $options: 'i' } },
          { poolName: { $regex: s, $options: 'i' } },
        ],
      });
    } else {
      // No search — only show subscribed pools in the public marketplace
      pools = await Pool.find({ isPublished: true, deleted: false });
    }

    const enriched = await Promise.all(
      pools.map(async (p) => {
        try {
          const onChain = await fetchPoolOnChain(p.poolAddress, false);
          let isPaused = false;
          try {
            const poolContract = new ethers.Contract(
              ethers.getAddress(p.poolAddress),
              ['function isPaused() external view returns (bool)'],
              provider
            );
            isPaused = await poolContract.isPaused();
          } catch {
            isPaused = false;
          }
          return { ...p.toJSON(), ...onChain, isPaused };
        } catch {
          return { ...p.toJSON(), fetchError: true, isPaused: false };
        }
      })
    );

    // SELL USDT/USDC: user sells stable → gets NGNs
    // Requirements: NGN liquidity > 0 AND sellRate > 0 AND not paused
    const sellPools = enriched
      .filter(
        (p) =>
          !p.isPaused &&
          (parseFloat(p.ngnsLiquidity || 0) > 0 || parseFloat(p.cNgnLiquidity || 0) > 0) &&
          parseFloat(p.sellRate || 0) > 0
      )
      .sort((a, b) => parseFloat(a.sellRate) - parseFloat(b.sellRate));

    // BUY USDT/USDC: user spends NGNs → gets stable
    // Requirements: USDT or USDC liquidity > 0 AND buyRate > 0 AND not paused
    const buyPools = enriched
      .filter(
        (p) =>
          !p.isPaused &&
          (parseFloat(p.usdtLiquidity || 0) > 0 || parseFloat(p.usdcLiquidity || 0) > 0) &&
          parseFloat(p.buyRate || 0) > 0
      )
      .sort((a, b) => parseFloat(a.buyRate) - parseFloat(b.buyRate));

    res.json({ buyPools, sellPools });
  } catch (err) {
    console.error('❌ /pool/published:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get('/trust-status', async (req, res) => {
  try {
    const cleanUser = cleanAddr(req.query.userSafeAddress);
    const cleanPool = cleanAddr(req.query.poolAddress);
    const tokenSymbol = req.query.tokenSymbol;

    if (!cleanUser || !cleanPool || !tokenSymbol)
      return res.status(400).json({
        message: 'Missing query params: userSafeAddress, poolAddress, tokenSymbol',
      });

    const cleanToken = resolveTokenSymbol(tokenSymbol);
    if (!cleanToken)
      return res.status(400).json({ message: `Unknown tokenSymbol: ${tokenSymbol}` });

    const record = await TrustedPool.findOne({
      userSafeAddress: cleanUser,
      poolAddress: cleanPool,
      tokenAddress: cleanToken,
    });

    // DB record is the source of truth for L2 — Safe wallet approvals are via relay, always valid
    res.json({ trusted: !!record });
  } catch (err) {
    console.error('❌ /pool/trust-status:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/trust', async (req, res) => {
  try {
    const { userSafeAddress, userPrivateKey, poolAddress, tokenSymbol } = req.body;

    const cleanUser = cleanAddr(userSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    const cleanToken = resolveTokenSymbol(tokenSymbol);

    if (!cleanUser || !userPrivateKey)
      return res.status(400).json({ message: 'Missing userSafeAddress or userPrivateKey' });
    if (!cleanPool) return res.status(400).json({ message: 'Missing poolAddress' });
    if (!cleanToken)
      return res
        .status(400)
        .json({ message: `Unknown tokenSymbol: ${tokenSymbol}. Must be NGN, USDT, or USDC.` });

    const result = await relay.sponsorApproveMax(
      ethers.getAddress(cleanUser),
      userPrivateKey,
      ethers.getAddress(cleanToken),
      ethers.getAddress(cleanPool)
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Approve transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Approve reverted' });

    await TrustedPool.findOneAndUpdate(
      { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanToken },
      { txHash: result.txHash, trustedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/trust:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/swap', async (req, res) => {
  try {
    const {
      userSafeAddress,
      userPrivateKey,
      poolAddress,
      stableToken,
      swapFn,
      amountWei,
      trusted,
      tokenIn,
    } = req.body;

    const cleanUser = cleanAddr(userSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    const ngnSymbol = req.body.ngnToken === 'CNGN' ? 'CNGN' : 'NGNS';
    const cleanNgn = resolveTokenSymbol(ngnSymbol);
    const cleanStable = resolveTokenSymbol(stableToken);
    const cleanTokenIn = resolveTokenSymbol(tokenIn);

    if (!cleanUser || !userPrivateKey)
      return res.status(400).json({ message: 'Missing userSafeAddress or userPrivateKey' });
    if (!cleanPool) return res.status(400).json({ message: 'Missing poolAddress' });
    if (!cleanNgn)
      return res.status(500).json({ message: 'NGN_TOKEN_ADDRESS not configured in .env' });
    if (!cleanStable)
      return res
        .status(400)
        .json({ message: `Unknown stableToken: ${stableToken}. Must be USDT or USDC.` });
    if (!cleanTokenIn)
      return res
        .status(400)
        .json({ message: `Unknown tokenIn: ${tokenIn}. Must be NGN, USDT, or USDC.` });
    if (!swapFn || !amountWei)
      return res.status(400).json({ message: 'Missing swapFn or amountWei' });

    const validFns = [
      'swapExactNGNAmountForUSD',
      'swapExactUSDAmountForNGN',
      'swapForExactUSDAmount',
      'swapForExactNGNAmount',
    ];
    if (!validFns.includes(swapFn))
      return res.status(400).json({ message: `Invalid swapFn: ${swapFn}` });

    const amountBn = BigInt(amountWei);
    const rawApprove = req.body.approveAmountWei;
    const approveBn =
      rawApprove && rawApprove !== 'max'
        ? BigInt(rawApprove)
        : BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

    // Optional custom receiver — validated strictly, falls back to signer's Safe
    const rawReceiver = req.body.receiverAddress;
    let cleanReceiver = cleanUser;
    if (rawReceiver) {
      const r = cleanAddr(rawReceiver);
      if (!r || !ethers.isAddress(ethers.getAddress(r))) {
        return res.status(400).json({ message: 'Invalid receiverAddress' });
      }
      cleanReceiver = r;
    }
    const receiver = ethers.getAddress(cleanReceiver);

    const swapCalldata = relay.buildSwapCalldata(
      swapFn,
      receiver,
      ethers.getAddress(cleanStable),
      ethers.getAddress(cleanNgn),
      amountBn
    );

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const {
      feeNGN: swFeeNGN,
      feeUSD: swFeeUSD,
      feeWeiNGN: swFeeWeiNGN,
      feeWeiUSD: swFeeWeiUSD,
    } = await _getPoolFee('base');
    const swFeeToken = await _resolveFeeToken(
      'base',
      cleanUser,
      swFeeNGN,
      swFeeUSD,
      swFeeWeiNGN,
      swFeeWeiUSD
    );
    if (!swFeeToken) return res.status(400).json({ message: _feeErrorMsg(swFeeNGN, swFeeUSD) });
    const swFeeCalldata = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
      ethers.getAddress(_treasury(false)),
      swFeeToken.feeWei,
    ]);
    // ─────────────────────────────────────────────────────────────────────────

    let result;

    if (trusted) {
      // Trusted: swap + fee transfer via MultiSend
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: swapCalldata },
          { to: ethers.getAddress(swFeeToken.tokenAddress), data: swFeeCalldata },
        ]),
        1
      );
    } else {
      // Not trusted: approve + swap + fee transfer via MultiSend (3 calls)
      const ERC20_APPROVE_IFACE = new ethers.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]);
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        MULTISEND_ADDR,
        _buildMultiSend([
          {
            to: ethers.getAddress(cleanTokenIn),
            data: ERC20_APPROVE_IFACE.encodeFunctionData('approve', [
              ethers.getAddress(cleanPool),
              approveBn,
            ]),
          },
          { to: ethers.getAddress(cleanPool), data: swapCalldata },
          { to: ethers.getAddress(swFeeToken.tokenAddress), data: swFeeCalldata },
        ]),
        1
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Swap transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Swap reverted on-chain' });

    // If user chose unlimited approve, record trust in DB
    if (req.body.doApproveMax === true) {
      await TrustedPool.findOneAndUpdate(
        { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanTokenIn },
        { trustedAt: new Date() },
        { upsert: true, returnDocument: 'after' }
      ).catch(() => {});
    }

    const Transaction = require('../models/Transaction');
    const User = require('../models/User');
    const receiverAddr = cleanAddr(req.body.receiverAddress) || cleanUser;
    const poolDoc = await Pool.findOne({ poolAddress: cleanPool })
      .lean()
      .catch(() => null);
    // Lookup receiver in Base (L2) DB — check name alias
    const receiverUser = await User.findOne({ safeAddress: receiverAddr })
      .lean()
      .catch(() => null);
    // Resolve best display identifier for receiver:
    // Priority: nameAlias (e.g. charles@salva) → username → address
    const receiverDisplayName = receiverUser
      ? receiverUser.nameAlias || receiverUser.username || receiverAddr
      : receiverAddr;
    const txTokenOut =
      swapFn === 'swapExactNGNAmountForUSD' || swapFn === 'swapForExactUSDAmount'
        ? stableToken
        : req.body.ngnToken === 'CNGN'
          ? 'cNGN'
          : 'NGNs';
    const txTokenIn = tokenIn;
    // ── Compute the correct OUTPUT amount for transaction history ─────────────
    // amountWei is the INPUT amount. For exact_in, the output is the quote.
    // We must read the output amount from the on-chain receipt event, or
    // use the quote value sent from the frontend.
    // Frontend sends approveAmountWei for exact_out (= the required input),
    // and amountWei for exact_in (= the input). The output (received) amount
    // is what the receiver actually gets — we must save THAT, not the input.
    //
    // Strategy: use req.body.quoteHuman if provided (frontend passes it),
    // otherwise fallback to calling getExactUSDAmountOut/getExactNGNAmountOut
    // from the pool contract using the current rate. This is the safest approach.
    let outputAmountHuman = null;
    try {
      if (req.body.quoteHuman && parseFloat(req.body.quoteHuman) > 0) {
        // Frontend passed the quote — use it directly (most accurate)
        outputAmountHuman = String(parseFloat(req.body.quoteHuman));
      } else {
        // Fallback: re-query the pool for the output amount
        // We can't know the exact output post-swap without reading events,
        // so we use the quote method as the best approximation.
        // For exact_out swaps, amountWei IS the output — use it directly.
        const isExactOut = swapFn === 'swapForExactUSDAmount' || swapFn === 'swapForExactNGNAmount';
        if (isExactOut) {
          // amountWei IS the desired output — scale using actual L1 output token decimals
          const isExactOutNgn = swapFn === 'swapForExactNGNAmount';
          const exactOutTokenAddr = isExactOutNgn ? cleanNgn : cleanStable;
          const exactOutDec = exactOutTokenAddr
            ? await getL1TokenDecimals(ethers.getAddress(exactOutTokenAddr)).catch(() => 6)
            : 6;
          l1OutputAmountHuman = ethers.formatUnits(BigInt(amountWei), exactOutDec);
        } else {
          // exact_in: amountWei = input, output is unknown without events
          // Use pool quote as approximation
          const poolViewContract = new ethers.Contract(
            ethers.getAddress(cleanPool),
            POOL_VIEW_ABI,
            provider
          );
          const [buyRate, sellRate] = await Promise.all([
            poolViewContract._getBuyRate().catch(() => 0n),
            poolViewContract._getSellRate().catch(() => 0n),
          ]);
          const stableAddr = ethers.getAddress(cleanStable);
          const ngnAddr = ethers.getAddress(cleanNgn);
          const amountBn2 = BigInt(amountWei);
          let quoteWei2 = 0n;
          try {
            if (swapFn === 'swapExactNGNAmountForUSD' && buyRate > 0n) {
              quoteWei2 = await poolViewContract.getExactUSDAmountOut(
                stableAddr,
                amountBn2,
                buyRate
              );
            } else if (swapFn === 'swapExactUSDAmountForNGN' && sellRate > 0n) {
              quoteWei2 = await poolViewContract.getExactNGNAmountOut(
                stableAddr,
                amountBn2,
                sellRate
              );
            }
          } catch {
            quoteWei2 = 0n;
          }
          outputAmountHuman = ethers.formatUnits(quoteWei2, 6);
        }
      }
    } catch (amtErr) {
      console.warn('⚠️ Could not compute output amount for tx history:', amtErr.message);
      // Never use amountWei (input) as fallback — it would show the wrong token amount.
      // Use 0 so the history shows nothing rather than misleading data.
      outputAmountHuman = '0';
    }

    // ── Receiver logic: determine who sees this in tx history ─────────────────
    // 1. Receiver == executor → save one tx (executor sees it as sent/received)
    // 2. Receiver != executor AND receiver is a Salva wallet (exists in DB on same chain) →
    //    save tx for executor (sent) AND a separate receive tx for the receiver
    // 3. Receiver != executor AND receiver is NOT a Salva wallet →
    //    save one tx only (executor sees it)
    const receiverIsSelf = cleanReceiver === cleanUser;

    // Save the primary tx — always (executor always sees it as RECEIVE)
    // fromAddress = pool (who sent the output tokens)
    // toAddress   = receiver (who got the output tokens)
    // amount      = OUTPUT amount (what receiver actually got), NOT the input
    // coin        = OUTPUT token
    await new Transaction({
      fromAddress: cleanPool,
      fromNameAlias: poolDoc?.poolName || null,
      toAddress: cleanReceiver,
      toUsername: receiverUser?.username || null,
      toNameAlias: receiverUser?.nameAlias || null,
      swapExecutor: cleanUser,
      amount: outputAmountHuman,
      coin: txTokenOut,
      status: 'successful',
      taskId: result.txHash,
      type: 'transfer',
      txType: 'swap',
      poolAddress: cleanPool,
      poolName: poolDoc?.poolName || null,
      tokenIn: txTokenIn,
      tokenOut: txTokenOut,
      date: new Date(),
    })
      .save()
      .catch((e) => console.error('⚠️ Primary swap tx save failed:', e.message));

    // If receiver is a different Salva wallet, save a receive tx for them too
    if (!receiverIsSelf && receiverUser) {
      await new Transaction({
        fromAddress: cleanPool,
        fromNameAlias: poolDoc?.poolName || null,
        toAddress: cleanReceiver,
        toUsername: receiverUser?.username || null,
        toNameAlias: receiverUser?.nameAlias || null,
        swapExecutor: cleanUser,
        amount: outputAmountHuman,
        coin: txTokenOut,
        status: 'successful',
        taskId: result.txHash + '_recv', // unique suffix to avoid dedup
        type: 'transfer',
        txType: 'swap',
        poolAddress: cleanPool,
        poolName: poolDoc?.poolName || null,
        tokenIn: txTokenIn,
        tokenOut: txTokenOut,
        date: new Date(),
        _isReceiverCopy: true,
      })
        .save()
        .catch((e) => console.error('⚠️ Receiver swap tx save failed:', e.message));
    }

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/swap:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/delete', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, ownerPrivateKey } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanPool || !cleanOwner) return res.status(400).json({ message: 'Missing fields' });

    // ownerPrivateKey is required when the pool has a name that needs unlinking.
    // We accept it unconditionally here — if the pool turns out to have no name,
    // it is simply ignored. Frontend always sends it (from PIN verify).
    const pool = await Pool.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'Pool not found' });

    // ── Liquidity gate (unchanged) ─────────────────────────────────────────
    const ngnsAddr = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    const cNgnAddr = cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
    const usdtAddr = cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
    const usdcAddr = cleanAddr(process.env.USDC_CONTRACT_ADDRESS);

    const poolContract = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, provider);

    const [ngnsLiq, cNgnLiq, usdtLiq, usdcLiq] = await Promise.all([
      poolContract.availableLiquidity(ngnsAddr).catch(() => 0n),
      poolContract.availableLiquidity(cNgnAddr).catch(() => 0n),
      poolContract.availableLiquidity(usdtAddr).catch(() => 0n),
      poolContract.availableLiquidity(usdcAddr).catch(() => 0n),
    ]);

    const MAX_NGN = ethers.parseUnits('1000', 6);
    const MAX_USD = ethers.parseUnits('1', 6);

    if (ngnsLiq > MAX_NGN)
      return res.status(400).json({
        message: `Pool has ${ethers.formatUnits(ngnsLiq, 6)} NGNs. Withdraw below 1,000 NGNs before deleting.`,
      });
    if (usdtLiq > MAX_USD || usdcLiq > MAX_USD)
      return res.status(400).json({
        message: 'Pool has more than $1 in stablecoins. Withdraw before deleting.',
      });

    // ── Auto-unlink name if the pool has one ──────────────────────────────
    // Pool names are stored as the welded form e.g. "charles_pool@salva".
    // The registry's unlink() takes the pure name as bytes (no namespace).
    // We call it via the user's Safe so msg.sender = Safe (required by contract).
    // Backend wallet pays gas. Failure is logged but does NOT block deletion —
    // the name may already be unlinked or the registry may have changed.
    if (pool.poolName && ownerPrivateKey) {
      try {
        const weldedName = pool.poolName.trim();

        // Strip namespace: "charles_pool@salva" → "charles_pool"
        const pureName = weldedName.includes('@')
          ? weldedName.substring(0, weldedName.indexOf('@'))
          : weldedName;

        // Locate which registry this alias belongs to — try the owner's aliases
        // in the User collection, falling back to env REGISTRY_CONTRACT_ADDRESS.
        const User = require('../models/User');
        const ownerUser = await User.findOne({ safeAddress: cleanOwner }).catch(() => null);

        let registryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
        if (ownerUser && Array.isArray(ownerUser.nameAliases)) {
          const matched = ownerUser.nameAliases.find(
            (a) => a.name?.toLowerCase() === weldedName.toLowerCase()
          );
          if (matched?.registryAddress) registryAddress = matched.registryAddress;
        }

        if (!registryAddress || !ethers.isAddress(registryAddress)) {
          console.warn(
            `⚠️ Could not resolve registry for pool name "${weldedName}" — skipping unlink`
          );
        } else {
          // Encode unlink calldata: registry.unlink(bytes calldata _name)
          // name must be passed as UTF-8 bytes, NOT a string.
          const REGISTRY_IFACE = new ethers.Interface([
            'function unlink(bytes calldata _name) external returns (bool)',
          ]);
          const nameBytes = ethers.toUtf8Bytes(pureName);
          const nameBytesHex = ethers.hexlify(nameBytes);
          const unlinkCalldata = REGISTRY_IFACE.encodeFunctionData('unlink', [nameBytesHex]);

          console.log(
            `🔓 Auto-unlink on delete: "${weldedName}" (pure="${pureName}") from ${registryAddress}`
          );

          // Execute via user's Safe — identical pattern to /api/alias/unlink-name
          const Safe = require('@safe-global/protocol-kit').default;
          const { wallet } = require('../services/walletSigner');
          const rpcUrl =
            process.env.NODE_ENV === 'production'
              ? process.env.BASE_MAINNET_RPC_URL
              : process.env.BASE_SEPOLIA_RPC_URL;

          const protocolKit = await Safe.init({
            provider: rpcUrl,
            signer: ownerPrivateKey,
            safeAddress: ethers.getAddress(cleanOwner),
          });

          const safeTx = await protocolKit.createTransaction({
            transactions: [
              {
                to: ethers.getAddress(registryAddress),
                data: unlinkCalldata,
                value: '0',
                operation: 0,
              },
            ],
          });

          const signedTx = await protocolKit.signTransaction(safeTx);

          const SAFE_ABI = [
            'function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns (bool success)',
          ];
          const { provider: prov } = require('../services/walletSigner');
          const safeContract = new ethers.Contract(ethers.getAddress(cleanOwner), SAFE_ABI, wallet);

          const tx = await safeContract.execTransaction(
            signedTx.data.to,
            BigInt(signedTx.data.value || '0'),
            signedTx.data.data,
            Number(signedTx.data.operation || 0),
            BigInt(signedTx.data.safeTxGas || '0'),
            BigInt(signedTx.data.baseGas || '0'),
            BigInt(signedTx.data.gasPrice || '0'),
            signedTx.data.gasToken || ethers.ZeroAddress,
            signedTx.data.refundReceiver || ethers.ZeroAddress,
            signedTx.encodedSignatures(),
            { gasLimit: 300_000 }
          );

          const receipt = await tx.wait();

          if (receipt && receipt.status === 1) {
            console.log(`✅ Auto-unlink successful: "${weldedName}" (tx: ${tx.hash})`);

            // Remove alias from User DB record too
            if (ownerUser && Array.isArray(ownerUser.nameAliases)) {
              ownerUser.nameAliases = ownerUser.nameAliases.filter(
                (a) => a.name?.toLowerCase() !== weldedName.toLowerCase()
              );
              if (ownerUser.nameAlias === weldedName) {
                ownerUser.nameAlias = ownerUser.nameAliases[0]?.name || null;
              }
              await ownerUser.save();
            }
          } else {
            console.error(
              `❌ Auto-unlink tx reverted for "${weldedName}" — proceeding with deletion anyway`
            );
          }
        }
      } catch (unlinkErr) {
        // Non-fatal — log and continue. LP can manually unlink if needed.
        console.error(`❌ Auto-unlink error for pool "${pool.poolName}":`, unlinkErr.message);
      }
    } else if (pool.poolName && !ownerPrivateKey) {
      console.warn(
        `⚠️ Pool "${pool.poolName}" has a name but no privateKey provided — skipping auto-unlink`
      );
    }

    // ── Hard-delete from DB ───────────────────────────────────────────────
    await Pool.deleteOne({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner });

    res.json({ success: true, message: 'Pool removed from registry.' });
  } catch (err) {
    console.error('❌ /pool/delete:', err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post('/set-mins', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, minNgnAmount, minTokenAmount } =
      req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: 'Missing required fields' });
    if (!minNgnAmount && !minTokenAmount)
      return res.status(400).json({ message: 'At least one min amount required' });

    const POOL_IFACE = new ethers.Interface([
      'function setMinimumNgnAmount(uint256 amount) external returns (bool)',
      'function setMinimumUsdAmount(uint256 amount) external returns (bool)',
    ]);

    const { feeNGN: smFN, feeUSD: smFU, feeWeiNGN: smFWN, feeWeiUSD: smFWU } = await _getPoolFee('base');
    const smFT = await _resolveFeeToken('base', cleanOwner, smFN, smFU, smFWN, smFWU);
    if (!smFT) return res.status(400).json({ message: _feeErrorMsg(smFN, smFU) });
    const smFeeTx = { to: ethers.getAddress(smFT.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(false)), smFT.feeWei]) };

    let result;

    if (minNgnAmount && minTokenAmount) {
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('setMinimumNgnAmount', [ethers.parseUnits(String(minNgnAmount), 6)]) },
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('setMinimumUsdAmount', [ethers.parseUnits(String(minTokenAmount), 6)]) },
          smFeeTx,
        ]), 1
      );
    } else {
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: minNgnAmount
              ? POOL_IFACE.encodeFunctionData('setMinimumNgnAmount', [ethers.parseUnits(String(minNgnAmount), 6)])
              : POOL_IFACE.encodeFunctionData('setMinimumUsdAmount', [ethers.parseUnits(String(minTokenAmount), 6)]) },
          smFeeTx,
        ]), 1
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Transaction failed to broadcast' });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || 'Transaction reverted' });

    console.log(`✅ Min amounts set on pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/set-mins:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// L1 ROUTES — use separate l1DB (salva-l1 database), NOT the L2 Pool model
// Pool addresses on L1 (Ethereum) are separate from L2 (Base) pools.
// Users swap on L1 pools from the L1 page, never mixed with L2.
// ══════════════════════════════════════════════════════════════════════════════

// Lazy-load L1 models from the L1 DB connection.
// We lazy-load (inside each route) to avoid issues with connection timing.
function getL1Models() {
  const l1DB = require('../services/l1db');
  const PoolSchema = require('../models/Pool').schema;
  const PoolSubSchema = require('../models/PoolSubscription').schema;
  const TrustedPoolSchema = require('../models/TrustedPool').schema;

  // .model() is idempotent — safe to call multiple times
  const PoolL1 = l1DB.models.Pool || l1DB.model('Pool', PoolSchema);
  const PoolSubL1 = l1DB.models.PoolSubscription || l1DB.model('PoolSubscription', PoolSubSchema);
  const TrustedPoolL1 = l1DB.models.TrustedPool || l1DB.model('TrustedPool', TrustedPoolSchema);

  return { PoolL1, PoolSubL1, TrustedPoolL1 };
}

// ── L1: Register pool ─────────────────────────────────────────────────────────
// Called after the frontend deploys a pool on-chain directly via MetaMask.
// No relay involved — frontend already did the on-chain deploy, this just
// records the pool in the L1 database (salva-l1) so it can be managed.
router.post('/register', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner)
      return res.status(400).json({ message: 'Missing poolAddress or ownerSafeAddress' });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1 } = getL1Models();

    const existing = await PoolL1.findOne({ poolAddress: cleanPool });
    if (existing) return res.json({ success: true, pool: existing.toJSON(), alreadyExists: true });

    const pool = await PoolL1.create({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
    });

    console.log(`✅ L1 Pool registered: ${cleanPool} by ${cleanOwner}`);
    res.json({ success: true, pool: pool.toJSON() });
  } catch (err) {
    console.error('❌ /pool/register:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Subscribe directly ────────────────────────────────────────────────────
// Called after the user has already transferred NGNs directly from their
// MetaMask wallet to the L1 treasury contract on-chain.
// This route just records the subscription in the L1 DB and publishes the pool.
// No relay, no Safe SDK — the on-chain transfer already happened.
router.post('/subscribe-direct', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, months, txHash } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner)
      return res.status(400).json({ message: 'Missing required fields' });

    const validMonths = [1, 2, 6, 12];
    const m = Number(months);
    if (!validMonths.includes(m))
      return res.status(400).json({ message: 'months must be 1, 2, 6, or 12' });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1, PoolSubL1 } = getL1Models();

    const pool = await PoolL1.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'L1 Pool not found' });

    // Use the same FeeConfig as L2 for the monthly fee amount
    let config = await FeeConfig.findById('main');
    if (!config) config = await FeeConfig.create({ _id: 'main' });

    const monthlyFee = config.poolSubscriptionMonthlyFee || 5000;
    const totalFee = monthlyFee * m;
    const now = new Date();

    // If there's still time left on the existing subscription, extend from
    // that expiry date, not from now. Otherwise extend from now.
    const base =
      pool.subscriptionExpiresAt && pool.subscriptionExpiresAt > now
        ? pool.subscriptionExpiresAt
        : now;

    const newExpiry = addMonths(base, m);

    // Record subscription in L1 DB
    await PoolSubL1.create({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      months: m,
      amountPaid: totalFee,
      txHash: txHash || null,
      startedAt: base,
      expiresAt: newExpiry,
    });

    // Update pool record in L1 DB
    pool.subscriptionExpiresAt = newExpiry;
    pool.isPublished = true;
    pool.totalSubscribedMonths = (pool.totalSubscribedMonths || 0) + m;
    await pool.save();

    console.log(`✅ L1 subscription recorded: ${cleanPool} (${m} months, tx: ${txHash || 'none'})`);
    res.json({
      success: true,
      subscriptionExpiresAt: newExpiry,
      months: m,
      totalFee,
    });
  } catch (err) {
    console.error('❌ /pool/subscribe-direct:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Delete pool directly ──────────────────────────────────────────────────
// Soft-deletes the pool from the L1 database.
// No on-chain relay needed — the contract stays on-chain forever.
// If the pool has a name, the name was linked via the L2 relay system,
// so the frontend (L1DeployPool) handles unlinking via L2 relay before calling here.
router.post('/delete-direct', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner)
      return res.status(400).json({ message: 'Missing poolAddress or ownerSafeAddress' });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1 } = getL1Models();

    const pool = await PoolL1.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'L1 Pool not found' });

    // ── Liquidity gate — same rules as L2 delete ─────────────────────────────
    const isProd = process.env.NODE_ENV === 'production';
    const ngnsAddr = cleanAddr(
      isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
    );
    const cNgnAddr = cleanAddr(
      isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
    );
    const usdtAddr = cleanAddr(
      isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
    );
    const usdcAddr = cleanAddr(
      isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
    );
    const l1Rpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const ERC20_BAL_ABI = ['function balanceOf(address) view returns (uint256)'];
    const poolAddr = ethers.getAddress(cleanPool);

    const [ngnsLiq, cNgnLiq, usdtLiq, usdcLiq] = await Promise.all([
      ngnsAddr
        ? new ethers.Contract(ethers.getAddress(ngnsAddr), ERC20_BAL_ABI, l1Provider)
            .balanceOf(poolAddr)
            .catch(() => 0n)
        : Promise.resolve(0n),
      cNgnAddr
        ? new ethers.Contract(ethers.getAddress(cNgnAddr), ERC20_BAL_ABI, l1Provider)
            .balanceOf(poolAddr)
            .catch(() => 0n)
        : Promise.resolve(0n),
      usdtAddr
        ? new ethers.Contract(ethers.getAddress(usdtAddr), ERC20_BAL_ABI, l1Provider)
            .balanceOf(poolAddr)
            .catch(() => 0n)
        : Promise.resolve(0n),
      usdcAddr
        ? new ethers.Contract(ethers.getAddress(usdcAddr), ERC20_BAL_ABI, l1Provider)
            .balanceOf(poolAddr)
            .catch(() => 0n)
        : Promise.resolve(0n),
    ]);

    // Fetch actual token decimals from PoolFactory for threshold comparison
    const [ngnsDecForGate, usdtDecForGate] = await Promise.all([
      ngnsAddr ? getL1TokenDecimals(ngnsAddr).catch(() => 18) : Promise.resolve(18),
      usdtAddr ? getL1TokenDecimals(usdtAddr).catch(() => 18) : Promise.resolve(18),
    ]);

    const MAX_NGN = ethers.parseUnits('1000', ngnsDecForGate);
    const MAX_USD = ethers.parseUnits('1', usdtDecForGate);
    const totalNgn = ngnsLiq + cNgnLiq;
    const totalUsd = usdtLiq + usdcLiq;

    if (totalNgn > MAX_NGN)
      return res.status(400).json({
        message: `Pool has ${ethers.formatUnits(totalNgn, 6)} NGNs/cNGN. Withdraw below 1,000 NGNs before deleting.`,
      });
    if (totalUsd > MAX_USD)
      return res.status(400).json({
        message: `Pool has $${ethers.formatUnits(totalUsd, 6)} in stablecoins. Withdraw below $1 before deleting.`,
      });
    // ─────────────────────────────────────────────────────────────────────────────

    await PoolL1.deleteOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
    });

    console.log(`✅ L1 Pool hard-deleted: ${cleanPool}`);
    res.json({ success: true, message: 'Pool removed from the L1 registry.' });
  } catch (err) {
    console.error('❌ /pool/delete-direct:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Get my pools ──────────────────────────────────────────────────────────
// Returns all L1 pools owned by the given address from the L1 database.
// The regular /pool/my/:address route returns L2 pools (L2 DB).
// This is separate so L1 and L2 pools never interfere.
router.get('/l1/my/:ownerAddress', async (req, res) => {
  try {
    const cleanOwner = cleanAddr(req.params.ownerAddress);
    if (!cleanOwner) return res.status(400).json({ message: 'Invalid address' });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1 } = getL1Models();

    const pools = await PoolL1.find({ ownerSafeAddress: cleanOwner, deleted: false });

    // Enrich with on-chain data (liquidity, rates etc) — same as L2
    const enriched = await Promise.all(
      pools.map(async (p) => {
        try {
          const onChain = await fetchPoolOnChain(p.poolAddress, true);
          return { ...p.toJSON(), ...onChain };
        } catch {
          return p.toJSON();
        }
      })
    );

    res.json({ pools: enriched });
  } catch (err) {
    console.error('❌ /pool/l1/my:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Set pool name in L1 DB ────────────────────────────────────────────────
// Called after L2 relay successfully links a name to the L1 pool address.
// Updates the poolName field in the L1 database record.
router.post('/l1/set-name', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, poolName } = req.body;
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner || poolName === undefined || poolName === null)
      return res
        .status(400)
        .json({ message: 'Missing poolAddress, ownerSafeAddress, or poolName' });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1 } = getL1Models();

    const pool = await PoolL1.findOne({
      poolAddress: cleanPool,
      ownerSafeAddress: cleanOwner,
      deleted: false,
    });
    if (!pool) return res.status(404).json({ message: 'L1 Pool not found' });

    pool.poolName = poolName.trim() || null;
    await pool.save();

    res.json({ success: true, pool: pool.toJSON() });
  } catch (err) {
    console.error('❌ /pool/l1/set-name:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Published pools (for L1 swap tab) ────────────────────────────────────
// Returns published L1 pools from the L1 database.
// The regular /pool/published route returns L2 pools.
// L1 users can only swap in L1 pools, not L2 pools.
router.get('/l1/published', async (req, res) => {
  try {
    const { search } = req.query;
    const now = new Date();

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { PoolL1 } = getL1Models();

    // Auto-expire lapsed subscriptions in L1 DB
    await PoolL1.updateMany(
      { isPublished: true, subscriptionExpiresAt: { $lt: now }, deleted: false },
      { isPublished: false }
    );

    let pools;
    if (search?.trim()) {
      const s = search.trim();
      // Search includes unsubscribed pools — user is deliberately looking for a specific pool
      pools = await PoolL1.find({
        deleted: false,
        $or: [
          { poolAddress: { $regex: s, $options: 'i' } },
          { poolName: { $regex: s, $options: 'i' } },
        ],
      });
    } else {
      // No search — only show subscribed pools in the public marketplace
      pools = await PoolL1.find({ isPublished: true, deleted: false });
    }

    const enriched = await Promise.all(
      pools.map(async (p) => {
        try {
          const onChain = await fetchPoolOnChain(p.poolAddress, true);
          const isProd = process.env.NODE_ENV === 'production';
          const l1Rpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
          const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
          let isPaused = false;
          try {
            const poolContract = new ethers.Contract(
              ethers.getAddress(p.poolAddress),
              ['function isPaused() external view returns (bool)'],
              l1Provider
            );
            isPaused = await poolContract.isPaused();
          } catch {
            isPaused = false;
          }
          return { ...p.toJSON(), ...onChain, isPaused };
        } catch {
          return { ...p.toJSON(), fetchError: true, isPaused: false };
        }
      })
    );

    // Same display rules as L2:
    // buyPools:  USDT or USDC liquidity > 0 AND buyRate > 0 AND not paused
    // sellPools: NGN liquidity > 0 AND sellRate > 0 AND not paused
    const buyPools = enriched
      .filter(
        (p) =>
          !p.isPaused &&
          (parseFloat(p.usdtLiquidity || 0) > 0 || parseFloat(p.usdcLiquidity || 0) > 0) &&
          parseFloat(p.buyRate || 0) > 0
      )
      .sort((a, b) => parseFloat(a.buyRate) - parseFloat(b.buyRate));

    const sellPools = enriched
      .filter(
        (p) =>
          !p.isPaused &&
          (parseFloat(p.ngnsLiquidity || 0) > 0 || parseFloat(p.cNgnLiquidity || 0) > 0) &&
          parseFloat(p.sellRate || 0) > 0
      )
      .sort((a, b) => parseFloat(a.sellRate) - parseFloat(b.sellRate));

    res.json({ buyPools, sellPools });
  } catch (err) {
    console.error('❌ /pool/l1/published:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Trust status ──────────────────────────────────────────────────────────
// Checks if a user has trusted a pool for a given token in the L1 DB.
// The regular /pool/trust-status checks L2 TrustedPool.
router.get('/l1/trust-status', async (req, res) => {
  try {
    const cleanUser = cleanAddr(req.query.userSafeAddress);
    const cleanPool = cleanAddr(req.query.poolAddress);
    const tokenSymbol = req.query.tokenSymbol;

    if (!cleanUser || !cleanPool || !tokenSymbol)
      return res.status(400).json({
        message: 'Missing query params: userSafeAddress, poolAddress, tokenSymbol',
      });

    // Resolve using L1 token addresses (from .env L1_* vars)
    const isProd = process.env.NODE_ENV === 'production';
    function resolveL1Token(sym) {
  switch (sym.toUpperCase()) {
    case 'NGNS':
    case 'NGN':
      return cleanAddr(
        isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      );
    case 'CNGN':
          return cleanAddr(
            isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
          );
        case 'USDT':
          return cleanAddr(
            isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
          );
        case 'USDC':
          return cleanAddr(
            isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
          );
        default:
          return null;
      }
    }

    const cleanToken = resolveL1Token(tokenSymbol);
    if (!cleanToken)
      return res.status(400).json({ message: `Unknown tokenSymbol: ${tokenSymbol}` });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const { TrustedPoolL1 } = getL1Models();

    const record = await TrustedPoolL1.findOne({
      userSafeAddress: cleanUser,
      poolAddress: cleanPool,
      tokenAddress: cleanToken,
    });

    // Also verify the on-chain allowance is still there
    // DB record is source of truth — if approve tx confirmed and recorded, trust is valid
    res.json({ trusted: !!record });
  } catch (err) {
    console.error('❌ /pool/l1/trust-status:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Record trust (called after frontend does approve-max directly) ─────────
// When the L1 user approves max spending on-chain via MetaMask, the frontend
// calls this endpoint to record it in the L1 TrustedPool DB so future checks
// know this pool is already approved.
// No relay — the on-chain approval already happened via MetaMask.
router.post('/l1/trust', async (req, res) => {
  try {
    const { userSafeAddress, poolAddress, tokenSymbol, txHash } = req.body;

    const cleanUser = cleanAddr(userSafeAddress);
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanUser || !cleanPool || !tokenSymbol)
      return res
        .status(400)
        .json({ message: 'Missing userSafeAddress, poolAddress, or tokenSymbol' });

    const isProd = process.env.NODE_ENV === 'production';
    function resolveL1Token(sym) {
  switch (sym.toUpperCase()) {
    case 'NGNS':
    case 'NGN':
      return cleanAddr(
        isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
      );
        case 'CNGN':
          return cleanAddr(
            isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
          );
        case 'USDT':
          return cleanAddr(
            isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
          );
        case 'USDC':
          return cleanAddr(
            isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
          );
        default:
          return null;
      }
    }

    const cleanToken = resolveL1Token(tokenSymbol);
    if (!cleanToken)
      return res.status(400).json({ message: `Unknown tokenSymbol: ${tokenSymbol}` });

    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});

    const { TrustedPoolL1 } = getL1Models();

    await TrustedPoolL1.findOneAndUpdate(
      { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanToken },
      { txHash: txHash || null, trustedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    console.log(`✅ L1 trust recorded: ${cleanUser} → pool ${cleanPool} (${tokenSymbol})`);
    res.json({ success: true });
  } catch (err) {
    console.error('❌ /pool/l1/trust:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── Record trust only (no relay) — called after frontend swap confirms approve-max ──
router.post('/trust-record', async (req, res) => {
  try {
    const { userSafeAddress, poolAddress, tokenSymbol } = req.body;
    const cleanUser = cleanAddr(userSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    const cleanToken = resolveTokenSymbol(tokenSymbol);

    if (!cleanUser || !cleanPool || !cleanToken)
      return res.status(400).json({ message: 'Missing or invalid fields' });

    await TrustedPool.findOneAndUpdate(
      { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanToken },
      { trustedAt: new Date() },
      { upsert: true, returnDocument: 'after' }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('❌ /pool/trust-record:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: AA Swap via BNB Safe relay ───────────────────────────────────────────
// Called by BNBDashboard SwapTab. User's BNB Safe signs, backend pays gas.
router.post('/l1/swap', async (req, res) => {
  try {
    const {
      userSafeAddress,
      userPrivateKey,
      poolAddress,
      stableToken,
      ngnToken,
      swapFn,
      amountWei,
      approveAmountWei,
      trusted,
      tokenIn,
      receiverAddress,
    } = req.body;

    const {
      executeViaSafeBNB,
      sponsorBNBApproveAndSwap,
      sponsorBNBSwapOnly,
      sponsorBNBApproveMax,
    } = require('../services/relayServiceBNB');
    const { TrustedPoolL1 } = getL1Models();

    const cleanUser = cleanAddr(userSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanUser || !userPrivateKey || !cleanPool)
      return res.status(400).json({ message: 'Missing required fields' });

    const isProd = process.env.NODE_ENV === 'production';
    function resolveL1Sym(sym) {
      switch ((sym || '').toUpperCase()) {
        case 'NGNS':
        case 'NGN':
          return cleanAddr(
            isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS
          );
        case 'CNGN':
          return cleanAddr(
            isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS
          );
        case 'USDT':
          return cleanAddr(
            isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS
          );
        case 'USDC':
          return cleanAddr(
            isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS
          );
        default:
          return null;
      }
    }

    const cleanNgn = resolveL1Sym(ngnToken === 'CNGN' ? 'CNGN' : 'NGNS');
    const cleanStable = resolveL1Sym(stableToken);
    const cleanTokenIn = resolveL1Sym(tokenIn);
    if (!cleanNgn || !cleanStable || !cleanTokenIn)
      return res.status(400).json({ message: 'Could not resolve token addresses' });

    const cleanReceiver = receiverAddress ? cleanAddr(receiverAddress) : cleanUser;

    const POOL_IFACE = new ethers.Interface([
      'function swapExactNGNAmountForUSD(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _ngnAmountIn) external returns (bool)',
      'function swapExactUSDAmountForNGN(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _usdAmountIn) external returns (bool)',
      'function swapForExactUSDAmount(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _usdAmountOut) external returns (bool)',
      'function swapForExactNGNAmount(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _ngnAmountOut) external returns (bool)',
    ]);

    const amountBn = BigInt(amountWei);
    const swapArgs = [
      ethers.getAddress(cleanReceiver),
      ethers.getAddress(cleanStable),
      ethers.getAddress(cleanNgn),
      amountBn,
    ];
    const swapCalldata = POOL_IFACE.encodeFunctionData(swapFn, swapArgs);

    const approveBn = approveAmountWei
      ? BigInt(approveAmountWei)
      : BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const {
      feeNGN: lswFeeNGN,
      feeUSD: lswFeeUSD,
      feeWeiNGN: lswFeeWeiNGN,
      feeWeiUSD: lswFeeWeiUSD,
    } = await _getPoolFee('bnb');
    const lswFeeToken = await _resolveFeeToken(
      'bnb',
      cleanUser,
      lswFeeNGN,
      lswFeeUSD,
      lswFeeWeiNGN,
      lswFeeWeiUSD
    );
    if (!lswFeeToken) return res.status(400).json({ message: _feeErrorMsg(lswFeeNGN, lswFeeUSD) });
    const lswFeeCalldata = ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [
      ethers.getAddress(_treasury(true)),
      lswFeeToken.feeWei,
    ]);
    // ─────────────────────────────────────────────────────────────────────────

    const { executeViaSafeBNB: _execBNB } = require('../services/relayServiceBNB');

    let result;
    if (trusted) {
      result = await _execBNB(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: swapCalldata },
          { to: ethers.getAddress(lswFeeToken.tokenAddress), data: lswFeeCalldata },
        ]),
        1
      );
    } else {
      const ERC20_APPROVE_IFACE2 = new ethers.Interface([
        'function approve(address spender, uint256 amount) returns (bool)',
      ]);
      result = await _execBNB(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        MULTISEND_ADDR,
        _buildMultiSend([
          {
            to: ethers.getAddress(cleanTokenIn),
            data: ERC20_APPROVE_IFACE2.encodeFunctionData('approve', [
              ethers.getAddress(cleanPool),
              approveBn,
            ]),
          },
          { to: ethers.getAddress(cleanPool), data: swapCalldata },
          { to: ethers.getAddress(lswFeeToken.tokenAddress), data: lswFeeCalldata },
        ]),
        1
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Swap failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1)
      return res.status(400).json({ message: 'Swap reverted on-chain' });

    if (req.body.doApproveMax === true) {
      const { TrustedPoolL1 } = getL1Models();
      await TrustedPoolL1.findOneAndUpdate(
        { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanTokenIn },
        { trustedAt: new Date() },
        { upsert: true, returnDocument: 'after' }
      ).catch(() => {});
    }

    const Transaction = require('../models/Transaction');
    const l1ReceiverAddr = cleanAddr(req.body.receiverAddress) || cleanUser;
    const { PoolL1 } = getL1Models();
    const l1PoolDoc = await PoolL1.findOne({ poolAddress: cleanPool })
      .lean()
      .catch(() => null);
    const l1TokenOut =
      swapFn === 'swapExactNGNAmountForUSD' || swapFn === 'swapForExactUSDAmount'
        ? stableToken
        : ngnToken === 'CNGN'
          ? 'cNGN'
          : 'NGNs';
    // Lookup receiver in BNB (L1) DB — chain-specific, NOT User (L2)
    const l1ReceiverIsSelf = l1ReceiverAddr === cleanUser;
    let l1ReceiverUser = null;
    try {
      const l1DB2 = require('../services/l1db');
      const UserBNBSchema = require('../models/UserBNB');
      const UserBNB = l1DB2.models.UserBNB || l1DB2.model('UserBNB', UserBNBSchema);
      l1ReceiverUser = await UserBNB.findOne({ safeAddress: l1ReceiverAddr })
        .lean()
        .catch(() => null);
    } catch {
      l1ReceiverUser = null;
    }

    // ── Compute correct OUTPUT amount (not input) ─────────────────────────────
    let l1OutputAmountHuman = null;
    try {
      if (req.body.quoteHuman && parseFloat(req.body.quoteHuman) > 0) {
        l1OutputAmountHuman = String(parseFloat(req.body.quoteHuman));
      } else {
        const isExactOut = swapFn === 'swapForExactUSDAmount' || swapFn === 'swapForExactNGNAmount';
        if (isExactOut) {
          // amountWei IS the desired output for exact_out — scale with output token decimals
          const isExactOutNgn = swapFn === 'swapForExactNGNAmount';
          const exactOutTokenAddr = isExactOutNgn ? cleanNgn : cleanStable;
          const exactOutDec = exactOutTokenAddr
            ? await getL1TokenDecimals(ethers.getAddress(exactOutTokenAddr)).catch(() => 6)
            : 6;
          l1OutputAmountHuman = ethers.formatUnits(BigInt(amountWei), exactOutDec);
        } else {
          // exact_in: re-query pool for output estimate
          const isProdEnv2 = process.env.NODE_ENV === 'production';
          const l1Rpc2 = isProdEnv2
            ? process.env.BNB_MAINNET_RPC_URL
            : process.env.BNB_TESTNET_RPC_URL;
          const l1Provider2 = new ethers.JsonRpcProvider(l1Rpc2);
          const poolViewL1 = new ethers.Contract(
            ethers.getAddress(cleanPool),
            POOL_VIEW_ABI,
            l1Provider2
          );
          const [l1BuyRate, l1SellRate] = await Promise.all([
            poolViewL1._getBuyRate().catch(() => 0n),
            poolViewL1._getSellRate().catch(() => 0n),
          ]);
          const l1StableAddr = ethers.getAddress(cleanStable);
          const l1AmountBn = BigInt(amountWei);
          let l1QuoteWei = 0n;
          try {
            if (swapFn === 'swapExactNGNAmountForUSD' && l1BuyRate > 0n) {
              l1QuoteWei = await poolViewL1.getExactUSDAmountOut(
                l1StableAddr,
                l1AmountBn,
                l1BuyRate
              );
            } else if (swapFn === 'swapExactUSDAmountForNGN' && l1SellRate > 0n) {
              l1QuoteWei = await poolViewL1.getExactNGNAmountOut(
                l1StableAddr,
                l1AmountBn,
                l1SellRate
              );
            }
          } catch {
            l1QuoteWei = 0n;
          }
          // Format using actual L1 output token decimals — never hardcode 6
          const outTokenAddr =
            swapFn === 'swapExactNGNAmountForUSD' || swapFn === 'swapForExactUSDAmount'
              ? cleanStable
              : cleanNgn;
          const outDec = outTokenAddr
            ? await getL1TokenDecimals(ethers.getAddress(outTokenAddr)).catch(() => 6)
            : 6;
          l1OutputAmountHuman = ethers.formatUnits(l1QuoteWei, outDec);
        }
      }
    } catch (l1AmtErr) {
      console.warn('⚠️ L1: Could not compute output amount for tx history:', l1AmtErr.message);
      // Never use amountWei (input) as output — shows wrong token amount in history.
      l1OutputAmountHuman = '0';
    }

    // ── Save primary tx (executor always sees it as RECEIVE) ─────────────────
    // fromAddress = pool, toAddress = receiver, amount = OUTPUT tokens received
    await new Transaction({
      fromAddress: cleanPool,
      fromNameAlias: l1PoolDoc?.poolName || null,
      toAddress: l1ReceiverAddr,
      toUsername: l1ReceiverUser?.username || null,
      toNameAlias: l1ReceiverUser?.nameAlias || null,
      swapExecutor: cleanUser,
      amount: l1OutputAmountHuman,
      coin: l1TokenOut,
      status: 'successful',
      taskId: result.txHash,
      type: 'transfer',
      txType: 'swap',
      poolAddress: cleanPool,
      poolName: l1PoolDoc?.poolName || null,
      tokenIn: tokenIn,
      tokenOut: l1TokenOut,
      date: new Date(),
    })
      .save()
      .catch((e) => console.error('⚠️ L1 primary swap tx save failed:', e.message));

    // If receiver is a different BNB Salva wallet, save a receive copy for them
    if (!l1ReceiverIsSelf && l1ReceiverUser) {
      await new Transaction({
        fromAddress: cleanPool,
        fromNameAlias: l1PoolDoc?.poolName || null,
        toAddress: l1ReceiverAddr,
        toUsername: l1ReceiverUser?.username || null,
        toNameAlias: l1ReceiverUser?.nameAlias || null,
        swapExecutor: cleanUser,
        amount: l1OutputAmountHuman,
        coin: l1TokenOut,
        status: 'successful',
        taskId: result.txHash + '_recv',
        type: 'transfer',
        txType: 'swap',
        poolAddress: cleanPool,
        poolName: l1PoolDoc?.poolName || null,
        tokenIn: tokenIn,
        tokenOut: l1TokenOut,
        date: new Date(),
        _isReceiverCopy: true,
      })
        .save()
        .catch((e) => console.error('⚠️ L1 receiver swap tx save failed:', e.message));
    }

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/l1/swap:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Provide liquidity ─────────────────────────────────────────────────────
router.post('/l1/provide-liquidity', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: 'Missing required fields' });

    const isProd = process.env.NODE_ENV === 'production';
    function resolveL1Token(sym) {
      switch (sym.toUpperCase()) {
        case 'NGNS': case 'NGN': return cleanAddr(isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS);
        case 'CNGN': return cleanAddr(isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS);
        case 'USDT': return cleanAddr(isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS);
        case 'USDC': return cleanAddr(isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS);
        default: return null;
      }
    }

    const tokenAddr = resolveL1Token(asset);
    if (!tokenAddr) return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const decimals = await getL1TokenDecimals(ethers.getAddress(tokenAddr)).catch(() => 18);
    const amountWei = ethers.parseUnits(String(amount), decimals);

    const ERC20_IFACE = new ethers.Interface(['function transfer(address to, uint256 amount) returns (bool)']);
    const calldata = ERC20_IFACE.encodeFunctionData('transfer', [ethers.getAddress(cleanPool), amountWei]);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: lplFeeNGN, feeUSD: lplFeeUSD, feeWeiNGN: lplFeeWeiNGN, feeWeiUSD: lplFeeWeiUSD } =
      await _getPoolFee('bnb');
    const lplFeeToken = await _resolveFeeToken('bnb', cleanOwner, lplFeeNGN, lplFeeUSD, lplFeeWeiNGN, lplFeeWeiUSD);
    if (!lplFeeToken) return res.status(400).json({ message: _feeErrorMsg(lplFeeNGN, lplFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await executeViaSafeBNB(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(tokenAddr), data: calldata },
        { to: ethers.getAddress(lplFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), lplFeeToken.feeWei]) },
      ]), 1
    );
    if (!result || !result.txHash) return res.status(500).json({ message: 'Transfer failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Transfer reverted on-chain' });

    console.log(`✅ L1 LP provided ${amount} ${asset} to pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error('❌ /pool/l1/provide-liquidity:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Remove liquidity ──────────────────────────────────────────────────────
router.post('/l1/remove-liquidity', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: 'Missing required fields' });

    const isProd = process.env.NODE_ENV === 'production';
    function resolveL1Token(sym) {
      switch (sym.toUpperCase()) {
        case 'NGNS': case 'NGN': return cleanAddr(isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS);
        case 'CNGN': return cleanAddr(isProd ? process.env.L1_CNGN_CONTRACT_ADDRESS : process.env.L1_BSC_CNGN_CONTRACT_ADDRESS);
        case 'USDT': return cleanAddr(isProd ? process.env.L1_USDT_CONTRACT_ADDRESS : process.env.L1_BSC_USDT_CONTRACT_ADDRESS);
        case 'USDC': return cleanAddr(isProd ? process.env.L1_USDC_CONTRACT_ADDRESS : process.env.L1_BSC_USDC_CONTRACT_ADDRESS);
        default: return null;
      }
    }

    const tokenAddr = resolveL1Token(asset);
    if (!tokenAddr) return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const decimals = await getL1TokenDecimals(ethers.getAddress(tokenAddr)).catch(() => 18);
    const amountWei = ethers.parseUnits(String(amount), decimals);

    const POOL_IFACE = new ethers.Interface(['function removeLiquidity(address asset, uint256 amount) external returns (bool)']);
    const calldata = POOL_IFACE.encodeFunctionData('removeLiquidity', [ethers.getAddress(tokenAddr), amountWei]);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: lrlFeeNGN, feeUSD: lrlFeeUSD, feeWeiNGN: lrlFeeWeiNGN, feeWeiUSD: lrlFeeWeiUSD } =
      await _getPoolFee('bnb');
    const lrlFeeToken = await _resolveFeeToken('bnb', cleanOwner, lrlFeeNGN, lrlFeeUSD, lrlFeeWeiNGN, lrlFeeWeiUSD);
    if (!lrlFeeToken) return res.status(400).json({ message: _feeErrorMsg(lrlFeeNGN, lrlFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await executeViaSafeBNB(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(cleanPool), data: calldata },
        { to: ethers.getAddress(lrlFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), lrlFeeToken.feeWei]) },
      ]), 1
    );
    if (!result || !result.txHash) return res.status(500).json({ message: 'Remove liquidity failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Remove liquidity reverted' });

    console.log(`✅ L1 LP removed ${amount} ${asset} from pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error('❌ /pool/l1/remove-liquidity:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Update rates ──────────────────────────────────────────────────────────
router.post('/l1/update-rates', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, buyRate, sellRate } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: 'Missing required fields' });
    if (buyRate === undefined && sellRate === undefined)
      return res.status(400).json({ message: 'At least one of buyRate or sellRate required' });

    const POOL_IFACE = new ethers.Interface([
      'function updateBuyRate(uint256 _exRate) external returns (bool)',
      'function updateSellRate(uint256 _exRate) external returns (bool)',
    ]);
    const encodeRate = (r) => ethers.parseUnits(parseFloat(r).toFixed(6), 6);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: lurFeeNGN, feeUSD: lurFeeUSD, feeWeiNGN: lurFeeWeiNGN, feeWeiUSD: lurFeeWeiUSD } =
      await _getPoolFee('bnb');
    const lurFeeToken = await _resolveFeeToken('bnb', cleanOwner, lurFeeNGN, lurFeeUSD, lurFeeWeiNGN, lurFeeWeiUSD);
    if (!lurFeeToken) return res.status(400).json({ message: _feeErrorMsg(lurFeeNGN, lurFeeUSD) });
    const lurFeeTx = { to: ethers.getAddress(lurFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), lurFeeToken.feeWei]) };
    // ─────────────────────────────────────────────────────────────────────────

    let result;
    if (buyRate !== undefined && sellRate !== undefined) {
      result = await executeViaSafeBNB(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('updateBuyRate', [encodeRate(buyRate)]) },
          { to: ethers.getAddress(cleanPool), data: POOL_IFACE.encodeFunctionData('updateSellRate', [encodeRate(sellRate)]) },
          lurFeeTx,
        ]), 1
      );
    } else {
      result = await executeViaSafeBNB(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: buyRate !== undefined
              ? POOL_IFACE.encodeFunctionData('updateBuyRate', [encodeRate(buyRate)])
              : POOL_IFACE.encodeFunctionData('updateSellRate', [encodeRate(sellRate)]) },
          lurFeeTx,
        ]), 1
      );
    }

    if (!result || !result.txHash) return res.status(500).json({ message: 'Rate update failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Rate update reverted' });

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/l1/update-rates:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Toggle pause ──────────────────────────────────────────────────────────
router.post('/l1/toggle-pause', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, pause } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanOwner || !ownerPrivateKey || !cleanPool || pause === undefined)
      return res.status(400).json({ message: 'Missing required fields' });

    const POOL_IFACE = new ethers.Interface([
      'function pause() external returns (bool)',
      'function unpause() external returns (bool)',
    ]);
    const calldata = pause
      ? POOL_IFACE.encodeFunctionData('pause', [])
      : POOL_IFACE.encodeFunctionData('unpause', []);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: ltpFeeNGN, feeUSD: ltpFeeUSD, feeWeiNGN: ltpFeeWeiNGN, feeWeiUSD: ltpFeeWeiUSD } =
      await _getPoolFee('bnb');
    const ltpFeeToken = await _resolveFeeToken('bnb', cleanOwner, ltpFeeNGN, ltpFeeUSD, ltpFeeWeiNGN, ltpFeeWeiUSD);
    if (!ltpFeeToken) return res.status(400).json({ message: _feeErrorMsg(ltpFeeNGN, ltpFeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await executeViaSafeBNB(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(cleanPool), data: calldata },
        { to: ethers.getAddress(ltpFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), ltpFeeToken.feeWei]) },
      ]), 1
    );
    if (!result || !result.txHash) return res.status(500).json({ message: 'Toggle pause failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Toggle pause reverted' });

    res.json({ success: true, txHash: result.txHash, paused: pause });
  } catch (err) {
    console.error('❌ /pool/l1/toggle-pause:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Set minimums ──────────────────────────────────────────────────────────
router.post('/l1/set-mins', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, minNgnAmount, minTokenAmount } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool = cleanAddr(poolAddress);
    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: 'Missing required fields' });
    if (!minNgnAmount && !minTokenAmount)
      return res.status(400).json({ message: 'At least one min amount required' });

    const POOL_IFACE = new ethers.Interface([
      'function setMinimumNgnAmount(uint256 amount) external returns (bool)',
      'function setMinimumUsdAmount(uint256 amount) external returns (bool)',
    ]);
    const MULTISEND = '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526';

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: lsmFeeNGN, feeUSD: lsmFeeUSD, feeWeiNGN: lsmFeeWeiNGN, feeWeiUSD: lsmFeeWeiUSD } =
      await _getPoolFee('bnb');
    const lsmFeeToken = await _resolveFeeToken('bnb', cleanOwner, lsmFeeNGN, lsmFeeUSD, lsmFeeWeiNGN, lsmFeeWeiUSD);
    if (!lsmFeeToken) return res.status(400).json({ message: _feeErrorMsg(lsmFeeNGN, lsmFeeUSD) });
    const lsmFeeTx = { to: ethers.getAddress(lsmFeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), lsmFeeToken.feeWei]) };
    // ─────────────────────────────────────────────────────────────────────────

    // Mins are always stored as 6-decimal fixed-point on the pool contract
    const ngnWei = minNgnAmount ? ethers.parseUnits(String(minNgnAmount), 6) : null;
    const tokenWei = minTokenAmount ? ethers.parseUnits(String(minTokenAmount), 6) : null;

    let result;
    if (ngnWei && tokenWei) {
      result = await executeViaSafeBNB(
        ethers.getAddress(cleanOwner),
        ownerPrivateKey,
        MULTISEND_ADDR,
        _buildMultiSend([
          {
            to: ethers.getAddress(cleanPool),
            data: POOL_IFACE.encodeFunctionData('setMinimumNgnAmount', [ngnWei]),
          },
          {
            to: ethers.getAddress(cleanPool),
            data: POOL_IFACE.encodeFunctionData('setMinimumUsdAmount', [tokenWei]),
          },
          lsmFeeTx,
        ]),
        1
      );
    } else {
      result = await executeViaSafeBNB(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
        _buildMultiSend([
          { to: ethers.getAddress(cleanPool), data: ngnWei
              ? POOL_IFACE.encodeFunctionData('setMinimumNgnAmount', [ngnWei])
              : POOL_IFACE.encodeFunctionData('setMinimumUsdAmount', [tokenWei]) },
          lsmFeeTx,
        ]), 1
      );
    }

    if (!result || !result.txHash) return res.status(500).json({ message: 'Transaction failed to broadcast' });

    const isProdEnv = process.env.NODE_ENV === 'production';
    const l1Rpc = isProdEnv ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Transaction reverted' });

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error('❌ /pool/l1/set-mins:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Subscribe (pays from BNB Safe using BNB NGNs token) ──────────────────
router.post('/l1/subscribe', async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, ownerPrivateKey, months } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanPool = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanPool || !cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: 'Missing required fields' });

    const validMonths = [1, 2, 6, 12];
    const m = Number(months);
    if (!validMonths.includes(m)) return res.status(400).json({ message: 'months must be 1, 2, 6, or 12' });

    const { PoolL1 } = getL1Models();
    const pool = await PoolL1.findOne({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner, deleted: false });
    if (!pool) return res.status(404).json({ message: 'L1 Pool not found' });

    const TIER_PRICES = { 1: 3000, 2: 6000, 6: 18000, 12: 36000 };
    const totalFee = TIER_PRICES[m];
    const isProd = process.env.NODE_ENV === 'production';
    const ngnAddr = cleanAddr(isProd ? process.env.L1_NGN_TOKEN_ADDRESS : process.env.L1_BSC_NGN_TOKEN_ADDRESS);
    const treasury = cleanAddr(isProd ? process.env.L1_TREASURY_CONTRACT_ADDRESS : process.env.L1_BSC_TREASURY_CONTRACT_ADDRESS);
    if (!ngnAddr) return res.status(500).json({ message: 'L1 NGNs token address not configured' });
    if (!treasury) return res.status(500).json({ message: 'L1 treasury address not configured' });

    const decimals = await getL1TokenDecimals(ethers.getAddress(ngnAddr)).catch(() => 18);
    const feeWei = ethers.parseUnits(String(totalFee), decimals);

    const ERC20_IFACE = new ethers.Interface([
      'function transfer(address to, uint256 amount) returns (bool)',
    ]);
    const transferCalldata = ERC20_IFACE.encodeFunctionData('transfer', [
      ethers.getAddress(treasury),
      feeWei,
    ]);
    const result = await executeViaSafeBNB(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(ngnAddr),
      transferCalldata,
      0
    );
    if (!result || !result.txHash) return res.status(500).json({ message: 'Subscription payment failed to broadcast' });

    const l1Rpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1) return res.status(400).json({ message: 'Subscription payment reverted' });

    const now = new Date();
    const base = pool.subscriptionExpiresAt && pool.subscriptionExpiresAt > now ? pool.subscriptionExpiresAt : now;
    function addMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
    const newExpiry = addMonths(base, m);

    const { PoolSubL1 } = getL1Models();
    await PoolSubL1.create({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner, months: m, amountPaid: totalFee, txHash: result.txHash, startedAt: base, expiresAt: newExpiry });
    pool.subscriptionExpiresAt = newExpiry;
    pool.isPublished = true;
    pool.totalSubscribedMonths = (pool.totalSubscribedMonths || 0) + m;
    await pool.save();

    res.json({ success: true, txHash: result.txHash, subscriptionExpiresAt: newExpiry, totalFee, months: m });
  } catch (err) {
    console.error('❌ /pool/l1/subscribe:', err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── L1: Deploy pool via BNB Safe ──────────────────────────────────────────────
router.post('/l1/deploy', async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey } = req.body;
    const { executeViaSafeBNB } = require('../services/relayServiceBNB');
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: 'Missing ownerSafeAddress or ownerPrivateKey' });

    const isProd = process.env.NODE_ENV === 'production';
    const factoryAddr = cleanAddr(
      isProd ? process.env.L1_POOL_FACTORY_ADDRESS : process.env.L1_BSC_POOL_FACTORY_ADDRESS
    );
    if (!factoryAddr)
      return res.status(500).json({ message: 'L1 pool factory address not configured' });

    const FACTORY_IFACE = new ethers.Interface([
      'function deployPool() external returns (address)',
    ]);
    const calldata = FACTORY_IFACE.encodeFunctionData('deployPool', []);

    // ── Pool fee ─────────────────────────────────────────────────────────────
    const { feeNGN: ld1FeeNGN, feeUSD: ld1FeeUSD, feeWeiNGN: ld1FeeWeiNGN, feeWeiUSD: ld1FeeWeiUSD } =
      await _getPoolFee('bnb');
    const ld1FeeToken = await _resolveFeeToken('bnb', cleanOwner, ld1FeeNGN, ld1FeeUSD, ld1FeeWeiNGN, ld1FeeWeiUSD);
    if (!ld1FeeToken) return res.status(400).json({ message: _feeErrorMsg(ld1FeeNGN, ld1FeeUSD) });
    // ─────────────────────────────────────────────────────────────────────────

    const result = await executeViaSafeBNB(
      ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND_ADDR,
      _buildMultiSend([
        { to: ethers.getAddress(factoryAddr), data: calldata },
        { to: ethers.getAddress(ld1FeeToken.tokenAddress), data: ERC20_TRANSFER_IFACE.encodeFunctionData('transfer', [ethers.getAddress(_treasury(true)), ld1FeeToken.feeWei]) },
      ]), 1
    );
    if (!result || !result.txHash)
      return res.status(500).json({ message: 'Deploy transaction failed to broadcast' });

    const l1Rpc = isProd ? process.env.BNB_MAINNET_RPC_URL : process.env.BNB_TESTNET_RPC_URL;
    const l1Provider = new ethers.JsonRpcProvider(l1Rpc);
    const receipt = await l1Provider.waitForTransaction(result.txHash, 1, 120_000);
    if (!receipt || receipt.status !== 1)
      return res.status(400).json({ message: 'Deploy reverted on-chain' });

    const POOL_DEPLOYED_TOPIC = ethers.id('PoolDeployed(address,address)');
    let poolAddress = null;
    for (const log of receipt.logs) {
      try {
        if (!log.topics || log.topics.length < 3) continue;
        if (log.topics[0].toLowerCase() !== POOL_DEPLOYED_TOPIC.toLowerCase()) continue;
        poolAddress = ethers.getAddress('0x' + log.topics[2].slice(-40));
        break;
      } catch (parseErr) {
        console.warn('⚠️ Log parse skip:', parseErr.message);
      }
    }

    if (!poolAddress)
      return res.status(400).json({
        message: 'Pool deployed on-chain but address could not be parsed from event.',
        txHash: result.txHash,
      });

    // Register in L1 DB immediately
    const l1DB = require('../services/l1db');
    if (l1DB.readyState !== 1) await l1DB.readyPromise.catch(() => {});
    const { PoolL1 } = getL1Models();
    const existing = await PoolL1.findOne({ poolAddress: poolAddress.toLowerCase() });
    if (!existing) {
      await PoolL1.create({ poolAddress: poolAddress.toLowerCase(), ownerSafeAddress: cleanOwner });
    }

    console.log(`✅ L1 Pool deployed: ${poolAddress} by ${cleanOwner} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, poolAddress });
  } catch (err) {
    console.error('❌ /pool/l1/deploy:', err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;