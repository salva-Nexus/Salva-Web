const express  = require("express");
const router   = express.Router();
const { ethers } = require("ethers");
const { provider } = require("../services/walletSigner");
const relay    = require("../services/relayService");

const Pool             = require("../models/Pool");
const PoolSubscription = require("../models/PoolSubscription");
const TrustedPool      = require("../models/TrustedPool");
const FeeConfig        = require("../models/FeeConfig");

// ─── ABIs ─────────────────────────────────────────────────────────────────────
const POOL_VIEW_ABI = [
  "function availableLiquidity(address asset) external view returns (uint256)",
  "function _getBuyRate() public view returns (uint256)",
  "function _getSellRate() public view returns (uint256)",
  "function getDeployer() external view returns (address)",
  "function getMinuimumNgnAmount() external view returns (uint256)",
  "function getMinuimumTokenAmount() external view returns (uint256)",
  "function getExactTokenAmountOut(uint256 ngnsAmountIn, uint256 exRate) public pure returns (uint256)",
  "function getExactNGNAmountOut(uint256 tokenAmountIn, uint256 exRate) public pure returns (uint256)",
  "function getExactNGNAmountIn(uint256 tokenAmountOut, uint256 exRate) public pure returns (uint256)",
  "function getExactTokenAmountIn(uint256 ngnAmountOut, uint256 exRate) public pure returns (uint256)",
];

const POOL_WRITE_ABI = [
  "function removeLiquidity(address asset, uint256 amount) external returns (bool)",
  "function updateBuyRate(uint256 _exRate) external returns (bool)",
  "function updateSellRate(uint256 _exRate) external returns (bool)",
  "function pause() external returns (bool)",
  "function unpause() external returns (bool)",
];

const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function cleanAddr(raw) {
  if (!raw) return null;
  const match = String(raw).match(/(0x[0-9a-fA-F]{40})/);
  return match ? match[1].toLowerCase() : null;
}

function resolveTokenSymbol(symbol) {
  switch ((symbol || "").toUpperCase()) {
    case "NGN":  return cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    case "CNGN": return cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
    case "USDT": return cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
    case "USDC": return cleanAddr(process.env.USDC_CONTRACT_ADDRESS);
    default:     return null;
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
    if (!receipt) return { success: false, reason: "Transaction confirmation timeout" };
    if (receipt.status === 1) {
      console.log(`✅ Transaction ${txHash} confirmed (block ${receipt.blockNumber})`);
      return { success: true, receipt };
    }
    console.error(`❌ Transaction ${txHash} reverted on-chain`);
    return { success: false, reason: "Transaction reverted on-chain" };
  } catch (err) {
    console.error(`❌ Error waiting for receipt (${txHash}):`, err.message);
    return { success: false, reason: err.message || "Could not confirm transaction" };
  }
}

async function fetchPoolOnChain(poolAddress) {
  const ngnAddr  = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
const cNgnAddr = cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
const usdtAddr = cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
const usdcAddr = cleanAddr(process.env.USDC_CONTRACT_ADDRESS);

const pool = new ethers.Contract(ethers.getAddress(poolAddress), POOL_VIEW_ABI, provider);

const settled = await Promise.allSettled([
  pool.availableLiquidity(ngnAddr),
  pool.availableLiquidity(cNgnAddr),
  pool.availableLiquidity(usdtAddr),
  pool.availableLiquidity(usdcAddr),
  pool._getBuyRate(),
  pool._getSellRate(),
  pool.getMinuimumNgnAmount(),
  pool.getMinuimumTokenAmount(),
]);

const val = (r) => (r.status === "fulfilled" ? r.value : 0n);
const [ngnLiq, cNgnLiq, usdtLiq, usdcLiq, buyRate, sellRate, minNgn, minToken] = settled.map(val);

return {
  ngnLiquidity:   ethers.formatUnits(ngnLiq,   6),
  cNgnLiquidity:  ethers.formatUnits(cNgnLiq,  6),
  usdtLiquidity:  ethers.formatUnits(usdtLiq,  6),
  usdcLiquidity:  ethers.formatUnits(usdcLiq,  6),
  buyRate:        ethers.formatUnits(buyRate,  6),
  sellRate:       ethers.formatUnits(sellRate, 6),
  minNgnAmount:   ethers.formatUnits(minNgn,   6),
  minTokenAmount: ethers.formatUnits(minToken, 6),
};
}

// ─── ROUTES ───────────────────────────────────────────────────────────────────

router.post("/deploy", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: "Missing ownerSafeAddress or ownerPrivateKey" });

    const factoryAddr = cleanAddr(process.env.POOL_FACTORY_ADDRESS);
    if (!factoryAddr)
      return res.status(500).json({ message: "POOL_FACTORY_ADDRESS not configured in .env" });

    const result = await relay.sponsorDeployPool(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(factoryAddr),
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Deploy transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Deploy reverted on-chain" });

    const POOL_DEPLOYED_TOPIC = ethers.id("PoolDeployed(address,address)");
    let poolAddress = null;

    for (const log of taskStatus.receipt.logs) {
      try {
        if (!log.topics || log.topics.length < 3) continue;
        if (log.topics[0].toLowerCase() !== POOL_DEPLOYED_TOPIC.toLowerCase()) continue;
        poolAddress = ethers.getAddress("0x" + log.topics[2].slice(-40));
        break;
      } catch (parseErr) {
        console.warn("⚠️ Log parse skip:", parseErr.message);
      }
    }

    if (!poolAddress) {
      console.error("❌ Could not find PoolDeployed event. Logs:");
      console.error(JSON.stringify(taskStatus.receipt.logs.map((l) => ({
        address: l.address, topics: l.topics, data: l.data,
      })), null, 2));
      return res.status(400).json({
        message: "Pool deployed on-chain but address could not be parsed from event. Check server logs.",
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
    console.error("❌ /pool/deploy:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/provide-liquidity", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: "Missing required fields" });

    const tokenAddr = resolveTokenSymbol(asset);
    if (!tokenAddr)
      return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const amountWei = ethers.parseUnits(String(amount), 6);

    const tokenContract = new ethers.Contract(ethers.getAddress(tokenAddr), ERC20_ABI, provider);
    const balance = await tokenContract.balanceOf(ethers.getAddress(cleanOwner));
    if (balance < amountWei)
      return res.status(400).json({
        message: `Insufficient ${asset} balance. You have ${ethers.formatUnits(balance, 6)} ${asset}.`,
      });

    const ERC20_IFACE = new ethers.Interface([
      "function transfer(address to, uint256 amount) returns (bool)",
    ]);
    const transferCalldata = ERC20_IFACE.encodeFunctionData("transfer", [
      ethers.getAddress(cleanPool),
      amountWei,
    ]);

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(tokenAddr),
      transferCalldata,
      0,
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Transfer failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Transfer reverted" });

    console.log(`✅ LP provided ${amount} ${asset} to pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error("❌ /pool/provide-liquidity:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/remove-liquidity", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, asset, amount } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || !asset || !amount)
      return res.status(400).json({ message: "Missing required fields" });

    const tokenAddr = resolveTokenSymbol(asset);
    if (!tokenAddr)
      return res.status(400).json({ message: `Unknown asset: ${asset}` });

    const amountWei = ethers.parseUnits(String(amount), 6);

    const poolContract = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, provider);
    const poolBal = await poolContract.availableLiquidity(ethers.getAddress(tokenAddr));
    if (poolBal < amountWei)
      return res.status(400).json({
        message: `Pool only has ${ethers.formatUnits(poolBal, 6)} ${asset} available.`,
      });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);
    const calldata = POOL_IFACE.encodeFunctionData("removeLiquidity", [
      ethers.getAddress(tokenAddr),
      amountWei,
    ]);

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(cleanPool),
      calldata,
      0,
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Remove liquidity failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Remove liquidity reverted" });

    console.log(`✅ LP removed ${amount} ${asset} from pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash, amount, asset });
  } catch (err) {
    console.error("❌ /pool/remove-liquidity:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/update-rates", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, buyRate, sellRate } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: "Missing required fields" });
    if (buyRate === undefined && sellRate === undefined)
      return res.status(400).json({ message: "At least one of buyRate or sellRate required" });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);
    const MULTISEND  = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

    const encodeRate = (humanRate) =>
      ethers.parseUnits(parseFloat(humanRate).toFixed(6), 6);

    function encodeMultiSendTx(to, data) {
      const dataBytes = ethers.getBytes(data);
      const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
      let offset = 0;
      buf[offset++] = 0;
      ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
      ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
      ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32)).forEach((b) => (buf[offset++] = b));
      dataBytes.forEach((b) => (buf[offset++] = b));
      return buf;
    }

    let result;

    if (buyRate !== undefined && sellRate !== undefined) {
      const buyCalldata  = POOL_IFACE.encodeFunctionData("updateBuyRate",  [encodeRate(buyRate)]);
      const sellCalldata = POOL_IFACE.encodeFunctionData("updateSellRate", [encodeRate(sellRate)]);

      const multiSendCalldata = new ethers.Interface([
        "function multiSend(bytes memory transactions) public payable",
      ]).encodeFunctionData("multiSend", [
        ethers.concat([
          encodeMultiSendTx(ethers.getAddress(cleanPool), buyCalldata),
          encodeMultiSendTx(ethers.getAddress(cleanPool), sellCalldata),
        ]),
      ]);

      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner),
        ownerPrivateKey,
        MULTISEND,
        multiSendCalldata,
        1,
      );
    } else {
      const calldata = buyRate !== undefined
        ? POOL_IFACE.encodeFunctionData("updateBuyRate",  [encodeRate(buyRate)])
        : POOL_IFACE.encodeFunctionData("updateSellRate", [encodeRate(sellRate)]);

      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner),
        ownerPrivateKey,
        ethers.getAddress(cleanPool),
        calldata,
        0,
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Rate update failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Rate update reverted" });

    console.log(`✅ Rates updated on pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error("❌ /pool/update-rates:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/toggle-pause", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, pause } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool || pause === undefined)
      return res.status(400).json({ message: "Missing required fields" });

    const POOL_IFACE = new ethers.Interface(POOL_WRITE_ABI);
    const calldata   = pause
      ? POOL_IFACE.encodeFunctionData("pause",   [])
      : POOL_IFACE.encodeFunctionData("unpause", []);

    const result = await relay._executeViaSafeBase(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(cleanPool),
      calldata,
      0,
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Toggle pause failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Toggle pause reverted" });

    res.json({ success: true, txHash: result.txHash, paused: pause });
  } catch (err) {
    console.error("❌ /pool/toggle-pause:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/quote", async (req, res) => {
  try {
    const { poolAddress, swapFn, amount } = req.body;
    const cleanPool = cleanAddr(poolAddress);

    if (!cleanPool || !swapFn || !amount)
      return res.status(400).json({ message: "Missing fields" });

    const amountWei = ethers.parseUnits(String(parseFloat(amount).toFixed(6)), 6);
    const pool      = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, provider);

    const [buyRate, sellRate] = await Promise.all([
      pool._getBuyRate(),
      pool._getSellRate(),
    ]);

    let quoteWei;

    switch (swapFn) {
      // BUY USDT/USDC: user spends NGNs → gets stable (pool buyRate)
      case "swapExactNGNAmountForToken":
        if (buyRate === 0n) return res.status(400).json({ message: "Pool buy rate not set" });
        quoteWei = await pool.getExactTokenAmountOut(amountWei, buyRate);
        break;
      case "swapForExactTokenAmount":
        if (buyRate === 0n) return res.status(400).json({ message: "Pool buy rate not set" });
        quoteWei = await pool.getExactNGNAmountIn(amountWei, buyRate);
        break;
      // SELL USDT/USDC: user spends stable → gets NGNs (pool sellRate)
      case "swapExactTokenAmountForNGN":
        if (sellRate === 0n) return res.status(400).json({ message: "Pool sell rate not set" });
        quoteWei = await pool.getExactNGNAmountOut(amountWei, sellRate);
        break;
      case "swapForExactNGNAmount":
        if (sellRate === 0n) return res.status(400).json({ message: "Pool sell rate not set" });
        quoteWei = await pool.getExactTokenAmountIn(amountWei, sellRate);
        break;
      default:
        return res.status(400).json({ message: `Invalid swapFn: ${swapFn}` });
    }

    res.json({
      success:    true,
      quoteHuman: ethers.formatUnits(quoteWei, 6),
      quoteWei:   quoteWei.toString(),
      buyRate:    ethers.formatUnits(buyRate,  6),
      sellRate:   ethers.formatUnits(sellRate, 6),
    });
  } catch (err) {
    console.error("❌ /pool/quote:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/set-name", async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, poolName } = req.body;
    const cleanPool  = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanPool || !cleanOwner || !poolName)
      return res.status(400).json({ message: "Missing fields" });

    const pool = await Pool.findOne({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner, deleted: false });
    if (!pool) return res.status(404).json({ message: "Pool not found" });

    pool.poolName = poolName.trim();
    await pool.save();
    res.json({ success: true, pool });
  } catch (err) {
    console.error("❌ /pool/set-name:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/my/:ownerSafeAddress", async (req, res) => {
  try {
    const cleanOwner = cleanAddr(req.params.ownerSafeAddress);
    if (!cleanOwner) return res.status(400).json({ message: "Invalid address" });

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
    console.error("❌ /pool/my:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/subscription-fee", async (req, res) => {
  try {
    let config = await FeeConfig.findById("main");
    if (!config) config = await FeeConfig.create({ _id: "main" });
    const monthly = config.poolSubscriptionMonthlyFee || 5000;
    res.json({
      monthly,
      tiers: [
        { months: 1,  total: monthly * 1,  label: "1 Month"   },
        { months: 2,  total: monthly * 2,  label: "2 Months"  },
        { months: 6,  total: monthly * 6,  label: "6 Months"  },
        { months: 12, total: monthly * 12, label: "12 Months" },
      ],
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post("/subscribe", async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, ownerPrivateKey, months } = req.body;
    const cleanPool  = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);

    if (!cleanPool || !cleanOwner || !ownerPrivateKey)
      return res.status(400).json({ message: "Missing required fields" });

    const validMonths = [1, 2, 6, 12];
    const m = Number(months);
    if (!validMonths.includes(m))
      return res.status(400).json({ message: "months must be 1, 2, 6, or 12" });

    const pool = await Pool.findOne({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner, deleted: false });
    if (!pool) return res.status(404).json({ message: "Pool not found" });

    let config = await FeeConfig.findById("main");
    if (!config) config = await FeeConfig.create({ _id: "main" });

    const monthlyFee = config.poolSubscriptionMonthlyFee || 5000;
    const totalFee   = monthlyFee * m;
    const feeWei     = ethers.parseUnits(String(totalFee), 6);

    const ngnAddr = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    if (!ngnAddr) return res.status(500).json({ message: "NGN_TOKEN_ADDRESS not configured" });

    const ngnContract = new ethers.Contract(ethers.getAddress(ngnAddr), ERC20_ABI, provider);
    const balance = await ngnContract.balanceOf(ethers.getAddress(cleanOwner));
    if (balance < feeWei)
      return res.status(400).json({
        message: `Insufficient NGNs. Need ${totalFee.toLocaleString()} NGNs for ${m} month(s).`,
        required: totalFee,
        balance: ethers.formatUnits(balance, 6),
      });

    const treasury = cleanAddr(process.env.TREASURY_CONTRACT_ADDRESS);
    if (!treasury) return res.status(500).json({ message: "TREASURY_CONTRACT_ADDRESS not configured" });

    const result = await relay.sponsorNGNsPayment(
      ethers.getAddress(cleanOwner),
      ownerPrivateKey,
      ethers.getAddress(treasury),
      feeWei,
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Subscription transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Subscription payment reverted" });

    const now  = new Date();
    const base = pool.subscriptionExpiresAt && pool.subscriptionExpiresAt > now
      ? pool.subscriptionExpiresAt
      : now;

    const newExpiry = addMonths(base, m);

    await PoolSubscription.create({
      poolAddress:      cleanPool,
      ownerSafeAddress: cleanOwner,
      months:           m,
      amountPaid:       totalFee,
      txHash:           result.txHash,
      startedAt:        base,
      expiresAt:        newExpiry,
    });

    pool.subscriptionExpiresAt = newExpiry;
    pool.isPublished            = true;
    pool.totalSubscribedMonths += m;
    await pool.save();

    res.json({
      success:               true,
      txHash:                result.txHash,
      subscriptionExpiresAt: newExpiry,
      totalFee,
      months:                m,
    });
  } catch (err) {
    console.error("❌ /pool/subscribe:", err.message);
    res.status(500).json({ message: err.message });
  }
});

// ── GET /api/pool/published ───────────────────────────────────────────────────
//
// DISPLAY RULES:
//   SELL USDT/USDC tab: subscribed + NGN liquidity > 0 + sellRate > 0
//   BUY USDT/USDC tab:  subscribed + (USDT or USDC) liquidity > 0 + buyRate > 0
//
//   If rate is not set (= 0), pool is hidden even if subscribed and funded.
//   Pool can appear on both tabs if it has both NGNs and stable liquidity
//   with both rates set.
//
router.get("/published", async (req, res) => {
  try {
    const { search } = req.query;
    const now = new Date();

    // Auto-expire lapsed subscriptions
    await Pool.updateMany(
      { isPublished: true, subscriptionExpiresAt: { $lt: now }, deleted: false },
      { isPublished: false }
    );

    const query = { isPublished: true, deleted: false };
    if (search?.trim()) {
      const s = search.trim();
      query.$or = [
        { poolAddress: { $regex: s, $options: "i" } },
        { poolName:    { $regex: s, $options: "i" } },
      ];
    }

    const pools = await Pool.find(query);

    const enriched = await Promise.all(
      pools.map(async (p) => {
        try {
          const onChain = await fetchPoolOnChain(p.poolAddress);
          return { ...p.toJSON(), ...onChain };
        } catch {
          return { ...p.toJSON(), fetchError: true };
        }
      })
    );

    // SELL USDT/USDC: user sells stable → gets NGNs
    // Requirements: NGN liquidity > 0 AND sellRate > 0
    const sellPools = enriched
      .filter((p) =>
        parseFloat(p.ngnLiquidity || 0) > 0 &&
        parseFloat(p.sellRate     || 0) > 0
      )
      .sort((a, b) => parseFloat(a.sellRate) - parseFloat(b.sellRate));

    // BUY USDT/USDC: user spends NGNs → gets stable
    // Requirements: USDT or USDC liquidity > 0 AND buyRate > 0
    const buyPools = enriched
      .filter((p) =>
        (parseFloat(p.usdtLiquidity || 0) > 0 || parseFloat(p.usdcLiquidity || 0) > 0) &&
        parseFloat(p.buyRate || 0) > 0
      )
      .sort((a, b) => parseFloat(a.buyRate) - parseFloat(b.buyRate));

    res.json({ buyPools, sellPools });
  } catch (err) {
    console.error("❌ /pool/published:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.get("/trust-status", async (req, res) => {
  try {
    const cleanUser   = cleanAddr(req.query.userSafeAddress);
    const cleanPool   = cleanAddr(req.query.poolAddress);
    const tokenSymbol = req.query.tokenSymbol;

    if (!cleanUser || !cleanPool || !tokenSymbol)
      return res.status(400).json({ message: "Missing query params: userSafeAddress, poolAddress, tokenSymbol" });

    const cleanToken = resolveTokenSymbol(tokenSymbol);
    if (!cleanToken)
      return res.status(400).json({ message: `Unknown tokenSymbol: ${tokenSymbol}` });

    const record = await TrustedPool.findOne({
      userSafeAddress: cleanUser,
      poolAddress:     cleanPool,
      tokenAddress:    cleanToken,
    });

    let onChainTrusted = false;
    if (record) {
      try {
        const tokenContract = new ethers.Contract(ethers.getAddress(cleanToken), ERC20_ABI, provider);
        const allowance = await tokenContract.allowance(
          ethers.getAddress(cleanUser),
          ethers.getAddress(cleanPool)
        );
        onChainTrusted = allowance >= BigInt("340282366920938463463374607431768211456");
      } catch {
        onChainTrusted = false;
      }
    }

    res.json({ trusted: !!record && onChainTrusted });
  } catch (err) {
    console.error("❌ /pool/trust-status:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/trust", async (req, res) => {
  try {
    const { userSafeAddress, userPrivateKey, poolAddress, tokenSymbol } = req.body;

    const cleanUser  = cleanAddr(userSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);
    const cleanToken = resolveTokenSymbol(tokenSymbol);

    if (!cleanUser || !userPrivateKey)
      return res.status(400).json({ message: "Missing userSafeAddress or userPrivateKey" });
    if (!cleanPool)
      return res.status(400).json({ message: "Missing poolAddress" });
    if (!cleanToken)
      return res.status(400).json({ message: `Unknown tokenSymbol: ${tokenSymbol}. Must be NGN, USDT, or USDC.` });

    const result = await relay.sponsorApproveMax(
      ethers.getAddress(cleanUser),
      userPrivateKey,
      ethers.getAddress(cleanToken),
      ethers.getAddress(cleanPool),
    );

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Approve transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Approve reverted" });

    await TrustedPool.findOneAndUpdate(
      { userSafeAddress: cleanUser, poolAddress: cleanPool, tokenAddress: cleanToken },
      { txHash: result.txHash, trustedAt: new Date() },
      { upsert: true, new: true }
    );

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error("❌ /pool/trust:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/swap", async (req, res) => {
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

    const cleanUser    = cleanAddr(userSafeAddress);
    const cleanPool    = cleanAddr(poolAddress);
    const cleanNgn     = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
    const cleanStable  = resolveTokenSymbol(stableToken);
    const cleanTokenIn = resolveTokenSymbol(tokenIn);

    if (!cleanUser || !userPrivateKey)
      return res.status(400).json({ message: "Missing userSafeAddress or userPrivateKey" });
    if (!cleanPool)
      return res.status(400).json({ message: "Missing poolAddress" });
    if (!cleanNgn)
      return res.status(500).json({ message: "NGN_TOKEN_ADDRESS not configured in .env" });
    if (!cleanStable)
      return res.status(400).json({ message: `Unknown stableToken: ${stableToken}. Must be USDT or USDC.` });
    if (!cleanTokenIn)
      return res.status(400).json({ message: `Unknown tokenIn: ${tokenIn}. Must be NGN, USDT, or USDC.` });
    if (!swapFn || !amountWei)
      return res.status(400).json({ message: "Missing swapFn or amountWei" });

    const validFns = [
      "swapExactNGNAmountForToken",
      "swapExactTokenAmountForNGN",
      "swapForExactTokenAmount",
      "swapForExactNGNAmount",
    ];
    if (!validFns.includes(swapFn))
      return res.status(400).json({ message: `Invalid swapFn: ${swapFn}` });

    const amountBn  = BigInt(amountWei);
    const approveBn = req.body.approveAmountWei ? BigInt(req.body.approveAmountWei) : amountBn;
    const receiver  = ethers.getAddress(cleanUser);

    const swapCalldata = relay.buildSwapCalldata(
      swapFn,
      receiver,
      ethers.getAddress(cleanStable),
      ethers.getAddress(cleanNgn),
      amountBn,
    );

    let result;

    if (trusted) {
      result = await relay.sponsorSwapOnly(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        ethers.getAddress(cleanPool),
        swapCalldata,
      );
    } else {
      result = await relay.sponsorApproveAndSwap(
        ethers.getAddress(cleanUser),
        userPrivateKey,
        ethers.getAddress(cleanTokenIn),
        ethers.getAddress(cleanPool),
        approveBn,
        swapCalldata,
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Swap transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Swap reverted on-chain" });

    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error("❌ /pool/swap:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/delete", async (req, res) => {
  try {
    const { poolAddress, ownerSafeAddress, ownerPrivateKey } = req.body;
    const cleanPool  = cleanAddr(poolAddress);
    const cleanOwner = cleanAddr(ownerSafeAddress);
    if (!cleanPool || !cleanOwner)
      return res.status(400).json({ message: "Missing fields" });

    // ownerPrivateKey is required when the pool has a name that needs unlinking.
    // We accept it unconditionally here — if the pool turns out to have no name,
    // it is simply ignored. Frontend always sends it (from PIN verify).
    const pool = await Pool.findOne({ poolAddress: cleanPool, ownerSafeAddress: cleanOwner, deleted: false });
    if (!pool) return res.status(404).json({ message: "Pool not found" });

    // ── Liquidity gate (unchanged) ─────────────────────────────────────────
    const ngnAddr  = cleanAddr(process.env.NGN_TOKEN_ADDRESS);
const cNgnAddr = cleanAddr(process.env.CNGN_CONTRACT_ADDRESS);
const usdtAddr = cleanAddr(process.env.USDT_CONTRACT_ADDRESS);
const usdcAddr = cleanAddr(process.env.USDC_CONTRACT_ADDRESS);

const poolContract = new ethers.Contract(ethers.getAddress(cleanPool), POOL_VIEW_ABI, provider);

const [ngnLiq, cNgnLiq, usdtLiq, usdcLiq] = await Promise.all([
  poolContract.availableLiquidity(ngnAddr).catch(() => 0n),
  poolContract.availableLiquidity(cNgnAddr).catch(() => 0n),
  poolContract.availableLiquidity(usdtAddr).catch(() => 0n),
  poolContract.availableLiquidity(usdcAddr).catch(() => 0n),
]);

    const MAX_NGN = ethers.parseUnits("1000", 6);
    const MAX_USD = ethers.parseUnits("1",    6);

    if (ngnLiq > MAX_NGN)
      return res.status(400).json({
        message: `Pool has ${ethers.formatUnits(ngnLiq, 6)} NGNs. Withdraw below 1,000 NGNs before deleting.`,
      });
    if (usdtLiq > MAX_USD || usdcLiq > MAX_USD)
      return res.status(400).json({
        message: "Pool has more than $1 in stablecoins. Withdraw before deleting.",
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
        const pureName = weldedName.includes("@")
          ? weldedName.substring(0, weldedName.indexOf("@"))
          : weldedName;

        // Locate which registry this alias belongs to — try the owner's aliases
        // in the User collection, falling back to env REGISTRY_CONTRACT_ADDRESS.
        const User = require("../models/User");
        const ownerUser = await User.findOne({ safeAddress: cleanOwner }).catch(() => null);

        let registryAddress = process.env.REGISTRY_CONTRACT_ADDRESS;
        if (ownerUser && Array.isArray(ownerUser.nameAliases)) {
          const matched = ownerUser.nameAliases.find(
            (a) => a.name?.toLowerCase() === weldedName.toLowerCase()
          );
          if (matched?.registryAddress) registryAddress = matched.registryAddress;
        }

        if (!registryAddress || !ethers.isAddress(registryAddress)) {
          console.warn(`⚠️ Could not resolve registry for pool name "${weldedName}" — skipping unlink`);
        } else {
          // Encode unlink calldata: registry.unlink(bytes calldata _name)
          // name must be passed as UTF-8 bytes, NOT a string.
          const REGISTRY_IFACE = new ethers.Interface([
            "function unlink(bytes calldata _name) external returns (bool)",
          ]);
          const nameBytes    = ethers.toUtf8Bytes(pureName);
          const nameBytesHex = ethers.hexlify(nameBytes);
          const unlinkCalldata = REGISTRY_IFACE.encodeFunctionData("unlink", [nameBytesHex]);

          console.log(`🔓 Auto-unlink on delete: "${weldedName}" (pure="${pureName}") from ${registryAddress}`);

          // Execute via user's Safe — identical pattern to /api/alias/unlink-name
          const Safe = require("@safe-global/protocol-kit").default;
          const { wallet } = require("../services/walletSigner");
          const rpcUrl =
            process.env.NODE_ENV === "production"
              ? process.env.BASE_MAINNET_RPC_URL
              : process.env.BASE_SEPOLIA_RPC_URL;

          const protocolKit = await Safe.init({
            provider: rpcUrl,
            signer: ownerPrivateKey,
            safeAddress: ethers.getAddress(cleanOwner),
          });

          const safeTx = await protocolKit.createTransaction({
            transactions: [{
              to: ethers.getAddress(registryAddress),
              data: unlinkCalldata,
              value: "0",
              operation: 0,
            }],
          });

          const signedTx = await protocolKit.signTransaction(safeTx);

          const SAFE_ABI = [
            "function execTransaction(address to,uint256 value,bytes calldata data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address payable refundReceiver,bytes memory signatures) public payable returns (bool success)",
          ];
          const { provider: prov } = require("../services/walletSigner");
          const safeContract = new ethers.Contract(ethers.getAddress(cleanOwner), SAFE_ABI, wallet);

          const tx = await safeContract.execTransaction(
            signedTx.data.to,
            BigInt(signedTx.data.value || "0"),
            signedTx.data.data,
            Number(signedTx.data.operation || 0),
            BigInt(signedTx.data.safeTxGas || "0"),
            BigInt(signedTx.data.baseGas || "0"),
            BigInt(signedTx.data.gasPrice || "0"),
            signedTx.data.gasToken || ethers.ZeroAddress,
            signedTx.data.refundReceiver || ethers.ZeroAddress,
            signedTx.encodedSignatures(),
            { gasLimit: 300_000 },
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
            console.error(`❌ Auto-unlink tx reverted for "${weldedName}" — proceeding with deletion anyway`);
          }
        }
      } catch (unlinkErr) {
        // Non-fatal — log and continue. LP can manually unlink if needed.
        console.error(`❌ Auto-unlink error for pool "${pool.poolName}":`, unlinkErr.message);
      }
    } else if (pool.poolName && !ownerPrivateKey) {
      console.warn(`⚠️ Pool "${pool.poolName}" has a name but no privateKey provided — skipping auto-unlink`);
    }

    // ── Soft-delete from DB ───────────────────────────────────────────────
    pool.deleted     = true;
    pool.isPublished = false;
    await pool.save();

    res.json({ success: true, message: "Pool removed from registry." });
  } catch (err) {
    console.error("❌ /pool/delete:", err.message);
    res.status(500).json({ message: err.message });
  }
});

router.post("/set-mins", async (req, res) => {
  try {
    const { ownerSafeAddress, ownerPrivateKey, poolAddress, minNgnAmount, minTokenAmount } = req.body;
    const cleanOwner = cleanAddr(ownerSafeAddress);
    const cleanPool  = cleanAddr(poolAddress);

    if (!cleanOwner || !ownerPrivateKey || !cleanPool)
      return res.status(400).json({ message: "Missing required fields" });
    if (!minNgnAmount && !minTokenAmount)
      return res.status(400).json({ message: "At least one min amount required" });

    const POOL_IFACE = new ethers.Interface([
      "function setMinimumNgnAmount(uint256 amount) external returns (bool)",
      "function setMinimumTokenAmount(uint256 amount) external returns (bool)",
    ]);
    const MULTISEND = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

    function encodeMultiSendTx(to, data) {
      const dataBytes = ethers.getBytes(data);
      const buf = new Uint8Array(1 + 20 + 32 + 32 + dataBytes.length);
      let offset = 0;
      buf[offset++] = 0;
      ethers.getBytes(ethers.getAddress(to)).forEach((b) => (buf[offset++] = b));
      ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(0n), 32)).forEach((b) => (buf[offset++] = b));
      ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(dataBytes.length), 32)).forEach((b) => (buf[offset++] = b));
      dataBytes.forEach((b) => (buf[offset++] = b));
      return buf;
    }

    let result;

    if (minNgnAmount && minTokenAmount) {
      const ngnCalldata   = POOL_IFACE.encodeFunctionData("setMinimumNgnAmount",   [ethers.parseUnits(String(minNgnAmount),   6)]);
      const tokenCalldata = POOL_IFACE.encodeFunctionData("setMinimumTokenAmount", [ethers.parseUnits(String(minTokenAmount), 6)]);
      const multiSendCalldata = new ethers.Interface([
        "function multiSend(bytes memory transactions) public payable",
      ]).encodeFunctionData("multiSend", [
        ethers.concat([
          encodeMultiSendTx(ethers.getAddress(cleanPool), ngnCalldata),
          encodeMultiSendTx(ethers.getAddress(cleanPool), tokenCalldata),
        ]),
      ]);
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, MULTISEND, multiSendCalldata, 1,
      );
    } else {
      const calldata = minNgnAmount
        ? POOL_IFACE.encodeFunctionData("setMinimumNgnAmount",   [ethers.parseUnits(String(minNgnAmount),   6)])
        : POOL_IFACE.encodeFunctionData("setMinimumTokenAmount", [ethers.parseUnits(String(minTokenAmount), 6)]);
      result = await relay._executeViaSafeBase(
        ethers.getAddress(cleanOwner), ownerPrivateKey, ethers.getAddress(cleanPool), calldata, 0,
      );
    }

    if (!result || !result.txHash)
      return res.status(500).json({ message: "Transaction failed to broadcast" });

    const taskStatus = await waitForTxReceipt(result.txHash);
    if (!taskStatus.success)
      return res.status(400).json({ message: taskStatus.reason || "Transaction reverted" });

    console.log(`✅ Min amounts set on pool ${cleanPool} (tx: ${result.txHash})`);
    res.json({ success: true, txHash: result.txHash });
  } catch (err) {
    console.error("❌ /pool/set-mins:", err.message);
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;