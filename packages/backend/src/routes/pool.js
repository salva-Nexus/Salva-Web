import express from 'express';
import { ethers } from 'ethers';
import { ERC20, POOL_IFACE, SAFE, CHAINLINK } from '../utils/abi.js';
import {
  deployPool,
  deployInventory,
  withdraw,
  updateSpread,
  addLiquidity,
} from '../services/poolServices.js';
import { Pool } from '../models/Pool.js';
import { keyValue, mode } from '../utils/vars.js';
import { getRpcUrlByChain, getNgnOracleAddressByChain } from '../utils/rpcUrls.js';
import { UserConfiguredAsset } from '../models/UserConfiguredAsset.js';
import { fetchPricePerNgn } from '../utils/fetchRate.js';
import Assets from '../models/Assets.js';
import { User } from '../models/Users.js';
import { verify_Pin } from '../services/pinService.js';

const router = express.Router();

const provider = (chain) => {
  const rpc = getRpcUrlByChain(chain);
  return new ethers.JsonRpcProvider(rpc);
};

// An inventory is verified only when BOTH its tokens are Salva-listed assets.
async function isVerifiedInventory(inv, chain) {
  const envType = mode === 'development' ? 'TESTNET' : 'MAINNET';
  const addrs = [inv.baseAddress, inv.quoteAddress].map((a) => String(a || '').toLowerCase());
  const found = await Assets.find({
    tokenAddress: { $in: addrs.map((a) => new RegExp(`^${a}$`, 'i')) },
    chain,
    type: envType,
  })
    .select('tokenAddress')
    .lean();
  const listed = new Set(found.map((a) => String(a.tokenAddress).toLowerCase()));
  return addrs.every((a) => listed.has(a));
}

router.get('/assets/price/:base/:quote/:chain', async (req, res) => {
  const { base, quote, chain } = req.params;

  try {
    if (!base || !quote || !chain) {
      return res.status(400).json({
        status: false,
        errorMsg: 'base, quote and chain are required',
      });
    }

    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();
    const normalizedChain = chain.toLowerCase();
    const envType = mode === 'development' ? 'TESTNET' : 'MAINNET';

    let asset1 = await Assets.findOne({
      tokenSymbol: normalizedBase,
      chain: normalizedChain,
      type: envType,
    });
    if (!asset1) {
      asset1 = await UserConfiguredAsset.findOne({
        tokenSymbol: normalizedBase,
        chain: normalizedChain,
        type: envType,
      });
      if (!asset1) {
        return res.status(404).json({
          status: false,
          errorMsg: `Base asset ${normalizedBase} not found on ${normalizedChain}`,
        });
      }
    }

    let asset2 = await Assets.findOne({
      tokenSymbol: normalizedQuote,
      chain: normalizedChain,
      type: envType,
    });
    if (!asset2) {
      asset2 = await UserConfiguredAsset.findOne({
        tokenSymbol: normalizedQuote,
        chain: normalizedChain,
        type: envType,
      });
      if (!asset2) {
        return res.status(404).json({
          status: false,
          errorMsg: `Quote asset ${normalizedQuote} not found on ${normalizedChain}`,
        });
      }
    }

    const ngnOracleAddress = getNgnOracleAddressByChain(normalizedChain);
    const NGN_SYMBOLS = ['NGNS', 'CNGN'];
    const baseUsdFeed =
      asset1.priceFeedAddress ||
      (NGN_SYMBOLS.includes(String(asset1.tokenSymbol).toUpperCase()) ? ngnOracleAddress : null);
    const quoteUsdFeed =
      asset2.priceFeedAddress ||
      (NGN_SYMBOLS.includes(String(asset2.tokenSymbol).toUpperCase()) ? ngnOracleAddress : null);
    const chainProvider = provider(normalizedChain);

    const isNgnOracle = (addr) =>
      Boolean(addr && ngnOracleAddress && addr.toLowerCase() === ngnOracleAddress.toLowerCase());

    const getUsdPrice = async (feedAddress) => {
      if (!feedAddress) {
        throw new Error('No price feed configured for this asset');
      }
      if (isNgnOracle(feedAddress)) {
        const ngnRes = await fetchPricePerNgn(null, normalizedChain);
        if (!ngnRes.status || !ngnRes.data) {
          throw new Error('Failed to fetch NGN oracle price');
        }
        // fetchPricePerNgn returns USD/NGN; caller handles base (1 / data) vs quote (data)
        return { isNgn: true, value: Number(ngnRes.data) };
      }

      const feedContract = new ethers.Contract(feedAddress, CHAINLINK, chainProvider);
      const [roundData, feedDecimals] = await Promise.all([
        feedContract.latestRoundData(),
        feedContract.decimals(),
      ]);

      if (!roundData || roundData.answer <= 0n) {
        throw new Error(`Invalid Chainlink answer for feed ${feedAddress}`);
      }

      const formattedPrice = Number(ethers.formatUnits(roundData.answer, Number(feedDecimals)));
      return { isNgn: false, value: formattedPrice };
    };

    const [baseFeedResult, quoteFeedResult] = await Promise.all([
      getUsdPrice(baseUsdFeed),
      getUsdPrice(quoteUsdFeed),
    ]);
    console.log(baseFeedResult);
    console.log(quoteFeedResult);

    // UB: if base is NGNS/CNGN, flip back using 1 / returnData; otherwise use USD price directly
    const ub = baseFeedResult.isNgn ? 1 / baseFeedResult.value : baseFeedResult.value;

    // UQ: if quote is NGNS/CNGN, flip back using 1 / returnData; otherwise use USD price directly
    const uq = quoteFeedResult.isNgn ? 1 / quoteFeedResult.value : quoteFeedResult.value;

    if (!ub || !uq || uq === 0) {
      throw new Error('Computed UB or UQ is zero or invalid');
    }

    // UB * (1 / UQ) — matching crossPrice: BASE/USD * (1 / QUOTE/USD)
    const price = ub * (1 / uq);

    return res.status(200).json({
      status: true,
      price,
    });
  } catch (err) {
    console.error(`Price Fetch failed: ${err.message}`);

    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// changed from /supported-Pairs/:chain
router.get('/assets-swap/:chain', async (req, res) => {
  const { chain } = req.params;
  try {
    if (!chain) {
      return res.status(400).json({
        status: false,
        errorMsg: 'chain is required',
      });
    }

    const normalizedChain = chain.toLowerCase();
    const envType = mode === 'development' ? 'TESTNET' : 'MAINNET';

    const [asset1, asset2] = await Promise.all([
      Assets.find({
        chain: normalizedChain,
        type: envType,
      }).lean(),
      UserConfiguredAsset.find({
        chain: normalizedChain,
        type: envType,
      }).lean(),
    ]);

    const assets = [...asset1, ...asset2];

    return res.status(200).json({
      status: true,
      assets,
    });
  } catch (err) {
    console.error(`assets fetch failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/assets-pool/:chain/:safeAddress', async (req, res) => {
  const { chain, safeAddress } = req.params;
  try {
    if (!chain) {
      return res.status(400).json({
        status: false,
        errorMsg: 'chain is required',
      });
    }

    const normalizedChain = chain.toLowerCase();
    const envType = mode === 'development' ? 'TESTNET' : 'MAINNET';

    const [user, asset2] = await Promise.all([
      User.findOne({ safeAddress: safeAddress.toLowerCase() }).lean(),
      UserConfiguredAsset.find({
        ownerSafeAddress: safeAddress,
        chain: normalizedChain,
        type: envType,
      }).lean(),
    ]);

    const asset1 = (user?.tokenConfig || []).filter((t) => t.chain === normalizedChain);

    const assets = [...asset1, ...asset2];

    return res.status(200).json({
      status: true,
      assets,
    });
  } catch (err) {
    console.error(`assets fetch failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/deploy-pool', async (req, res) => {
  const { email, pin, chain } = req.body;
  try {
    const deployData = await deployPool(email, pin, chain);
    if (deployData?.status) {
      return res.status(200).json({
        status: true,
        poolAddress: deployData.poolAddress,
      });
    }
    return res.status(200).json({ status: false });
  } catch (err) {
    console.error(`Pool Deployment failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/pools/:safeAddress/:chain', async (req, res) => {
  const { safeAddress, chain } = req.params;
  const normalizedChain = chain.toLowerCase();
  try {
    const pools = await Pool.find({
      ownerSafeAddress: safeAddress.toLowerCase(),
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    }).lean();

    const enrichedPools = [];

    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const poolContract = new ethers.Contract(pool.poolAddress, POOL_IFACE, provider(chain));
      const enrichedInventories = [];

      for (let j = 0; j < pool.inventories.length; j++) {
        const inv = pool.inventories[j];
        let bDec = 18;
        let qDec = 18;
        if (inv.baseAddress !== ethers.ZeroAddress) {
          try {
            bDec = Number(
              await new ethers.Contract(inv.baseAddress, ERC20, provider(chain)).decimals()
            );
          } catch (e) {}
        }
        if (inv.quoteAddress !== ethers.ZeroAddress) {
          try {
            qDec = Number(
              await new ethers.Contract(inv.quoteAddress, ERC20, provider(chain)).decimals()
            );
          } catch (e) {}
        }

        let baseBalance = '0';
        let quoteBalance = '0';
        let formattedPrice = '0';

        try {
          const invData = await poolContract.getInventory(inv.baseAddress, inv.quoteAddress);
          baseBalance = ethers.formatUnits(invData.baseBalance, Number(bDec));
          quoteBalance = ethers.formatUnits(invData.quoteBalance, Number(qDec));
        } catch (e) {}

        try {
          const [rawPrice] = await poolContract.getPrice(inv.baseAddress, inv.quoteAddress);
          formattedPrice = ethers.formatUnits(rawPrice, 18);
        } catch (e) {}
        const f = await isVerifiedInventory(inv, normalizedChain);

        enrichedInventories.push({
          ...inv,
          balances: {
            base: baseBalance,
            quote: quoteBalance,
          },
          price: formattedPrice,
          isVerified: f,
        });
      }
      enrichedPools.push({
        ...pool,
        inventories: enrichedInventories,
      });
    }

    return res.status(200).json({
      status: true,
      pools: enrichedPools,
    });
  } catch (err) {
    console.error(`❌ Fetch Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/deploy-Inv', async (req, res) => {
  const {
    email,
    pin,
    poolAddress,
    base,
    quote,
    floor,
    spread,
    amount,
    allowSwapBelowFloor,
    chain,
  } = req.body;
  try {
    const invDeployData = await deployInventory(
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
    );
    return res.status(200).json({
      status: invDeployData.status || false,
    });
  } catch (err) {
    console.error(`Deploy Inv failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/update-spread', async (req, res) => {
  const { email, pin, poolAddress, base, quote, spread, chain } = req.body;
  try {
    const updateData = await updateSpread(email, pin, poolAddress, base, quote, spread, chain);
    return res.status(200).json({
      status: updateData.status || false,
    });
  } catch (err) {
    console.error(`Spread Update failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/add-liquidity', async (req, res) => {
  const { email, pin, poolAddress, base, quote, amount, chain } = req.body;
  try {
    if (!email || !pin || !poolAddress || !base || !quote || !amount || !chain) {
      return res.status(400).json({
        status: false,
        errorMsg: 'email, pin, poolAddress, base, quote, amount and chain are required',
      });
    }

    const data = await addLiquidity(email, pin, poolAddress, base, quote, amount, chain);
    if (data?.status) {
      return res.status(200).json({
        status: true,
        data: data.data,
      });
    }
    return res.status(200).json({ status: false });
  } catch (err) {
    console.error(`Add Liquidity failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/delete-pool', async (req, res) => {
  const { pin, poolAddress, chain } = req.body;
  try {
    const pool = await Pool.findOne({
      poolAddress: poolAddress,
      chain: chain.toLowerCase(),
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    if (!pool) {
      return res.status(404).json({
        status: false,
        errorMsg: 'Pool record not found',
      });
    }

    const owner = pool.ownerSafeAddress;
    const contract = new ethers.Contract(owner, SAFE, provider(chain));
    const user = await User.findOne({ safeAddress: pool.ownerSafeAddress });
    const pinData = await verify_Pin(user.email, pin);
    const pkey = pinData.privateKey;
    const wallet = new ethers.Wallet(pkey, provider(chain));
    const safeOwners = await contract.getOwners();

    if (wallet.address.toLowerCase() !== safeOwners[0].toLowerCase()) {
      throw new Error('❌ Not Allowed');
    }

    await pool.deleteOne();
    return res.status(200).json({ status: true });
  } catch (err) {
    console.error(`❌ Delete Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/delete-Inv', async (req, res) => {
  const { pin, poolAddress, base, quote, chain } = req.body;
  try {
    const pool = await Pool.findOne({
      poolAddress: poolAddress.toLowerCase(),
      chain: chain.toLowerCase(),
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    if (!pool) {
      return res.status(404).json({
        status: false,
        errorMsg: 'Pool record not found',
      });
    }

    const owner = pool.ownerSafeAddress;
    const contract = new ethers.Contract(owner, SAFE, provider(chain));
    const user = await User.findOne({ safeAddress: pool.ownerSafeAddress });
    const pinData = await verify_Pin(user.email, pin);
    const pkey = pinData.privateKey;
    const wallet = new ethers.Wallet(pkey, provider(chain));
    const safeOwners = await contract.getOwners();

    if (wallet.address.toLowerCase() !== safeOwners[0].toLowerCase()) {
      throw new Error('❌ Not Allowed');
    }
    const updatedInventories = [];
    for (let i = 0; i < pool.inventories.length; i++) {
      const inv = pool.inventories[i];
      const isMatch =
        inv.baseSymbol.toUpperCase() === base.toUpperCase() &&
        inv.quoteSymbol.toUpperCase() === quote.toUpperCase();

      if (!isMatch) {
        updatedInventories.push(inv);
      }
    }
    pool.inventories = updatedInventories;
    await pool.save();

    return res.status(200).json({ status: true });
  } catch (err) {
    console.error(`❌ Delete Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.post('/withdraw', async (req, res) => {
  const { email, pin, poolAddress, baseSymbol, quoteSymbol, assetOutSymbol, amount, chain } =
    req.body;
  try {
    const withdrawData = await withdraw(
      email,
      pin,
      poolAddress,
      baseSymbol,
      quoteSymbol,
      assetOutSymbol,
      amount,
      chain
    );
    if (withdrawData?.status) {
      return res.status(200).json({
        status: true,
        data: withdrawData.data,
      });
    }
    return res.status(200).json({ status: false });
  } catch (err) {
    console.error(`Withdrawal failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: 'Withdrawal failed',
    });
  }
});

// ==========================================
// 1. Get Pools & Inventories by Base Symbol
// ==========================================
router.get('/pools/base/:baseSymbol/:chain', async (req, res) => {
  const { baseSymbol, chain } = req.params;
  try {
    const normalizedBase = baseSymbol.toUpperCase();
    const normalizedChain = chain.toLowerCase();

    // Find all pools on this chain containing an inventory with this baseSymbol
    const pools = await Pool.find({
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      'inventories.baseSymbol': normalizedBase,
    }).lean();

    const results = [];

    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const poolContract = new ethers.Contract(
        pool.poolAddress,
        POOL_IFACE,
        provider(normalizedChain)
      );

      for (let j = 0; j < pool.inventories.length; j++) {
        const inv = pool.inventories[j];
        if (inv.baseSymbol.toUpperCase() === normalizedBase) {
          // Resolve decimals for base and quote addresses
          let bDec = 18;
          if (inv.baseAddress !== ethers.ZeroAddress) {
            try {
              bDec = Number(
                await new ethers.Contract(
                  inv.baseAddress,
                  ERC20,
                  provider(normalizedChain)
                ).decimals()
              );
            } catch (e) {}
          }

          let baseBalance = '0';
          let formattedPrice = '0';

          try {
            const invData = await poolContract.getInventory(inv.baseAddress, inv.quoteAddress);
            baseBalance = ethers.formatUnits(invData.baseBalance, Number(bDec));
          } catch (e) {}

          try {
            const [rawPrice] = await poolContract.getPrice(inv.baseAddress, inv.quoteAddress);
            formattedPrice = ethers.formatUnits(rawPrice, 18);
          } catch (e) {}
          const f = await isVerifiedInventory(inv, normalizedChain);
          results.push({
            poolAddress: pool.poolAddress,
            chain: pool.chain,
            inventory: {
              ...inv,
              balances: {
                base: baseBalance,
              },
              price: formattedPrice,
              isVerified: f,
            },
          });
        }
      }
    }

    return res.status(200).json({
      status: true,
      pools: results,
    });
  } catch (err) {
    console.error(`❌ Fetch By Base Symbol Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// ==========================================
// 2. Get Pools & Inventories by Exact Base and Quote Match
// ==========================================
router.get('/pools/pair/:base/:quote/:chain', async (req, res) => {
  const { base, quote, chain } = req.params;
  try {
    const normalizedBase = base.toUpperCase();
    const normalizedQuote = quote.toUpperCase();
    const normalizedChain = chain.toLowerCase();

    const pools = await Pool.find({
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      'inventories.baseSymbol': normalizedBase,
      'inventories.quoteSymbol': normalizedQuote,
    }).lean();

    const enrichedPools = [];

    for (let i = 0; i < pools.length; i++) {
      const pool = pools[i];
      const poolContract = new ethers.Contract(
        pool.poolAddress,
        POOL_IFACE,
        provider(normalizedChain)
      );
      const enrichedInventories = [];

      for (let j = 0; j < pool.inventories.length; j++) {
        const inv = pool.inventories[j];

        if (
          inv.baseSymbol.toUpperCase() === normalizedBase &&
          inv.quoteSymbol.toUpperCase() === normalizedQuote
        ) {
          let bDec = 18;
          if (inv.baseAddress !== ethers.ZeroAddress) {
            try {
              bDec = Number(
                await new ethers.Contract(
                  inv.baseAddress,
                  ERC20,
                  provider(normalizedChain)
                ).decimals()
              );
            } catch (e) {}
          }

          let baseBalance = '0';
          let formattedPrice = '0';
          try {
            const invData = await poolContract.getInventory(inv.baseAddress, inv.quoteAddress);
            baseBalance = ethers.formatUnits(invData.baseBalance, Number(bDec));
          } catch (e) {}

          try {
            const [rawPrice] = await poolContract.getPrice(inv.baseAddress, inv.quoteAddress);
            formattedPrice = ethers.formatUnits(rawPrice, 18);
          } catch (e) {}
          console.log('PRICE: ', formattedPrice);
          const f = await isVerifiedInventory(inv, normalizedChain);
          enrichedInventories.push({
            ...inv,
            balance: {
              base: baseBalance,
            },
            price: formattedPrice,
            isVerified: f,
            chain: normalizedChain,
          });
        }
      }

      if (enrichedInventories.length > 0) {
        enrichedPools.push({
          ...pool,
          inventories: enrichedInventories,
        });
      }
    }

    return res.status(200).json({
      status: true,
      pools: enrichedPools,
    });
  } catch (err) {
    console.error(`❌ Fetch By Exact Pair Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// ==========================================
// 3. Get All Inventories for a Specific Pool Address (No Symbol Filter)
// ==========================================
router.get('/pools/address/:poolAddress/:chain', async (req, res) => {
  const { poolAddress, chain } = req.params;
  try {
    const normalizedChain = chain.toLowerCase();
    const pool = await Pool.findOne({
      poolAddress: poolAddress.toLowerCase(),
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    }).lean();

    if (!pool) {
      return res.status(404).json({
        status: false,
        errorMsg: 'Pool record not found',
      });
    }

    const poolContract = new ethers.Contract(
      pool.poolAddress,
      POOL_IFACE,
      provider(normalizedChain)
    );
    const enrichedInventories = [];

    for (let j = 0; j < pool.inventories.length; j++) {
      const inv = pool.inventories[j];
      let bDec = 18;

      if (inv.baseAddress !== ethers.ZeroAddress) {
        try {
          bDec = Number(
            await new ethers.Contract(inv.baseAddress, ERC20, provider(normalizedChain)).decimals()
          );
        } catch (e) {}
      }

      let baseBalance = '0';
      let formattedPrice = '0';

      try {
        const invData = await poolContract.getInventory(inv.baseAddress, inv.quoteAddress);
        baseBalance = ethers.formatUnits(invData.baseBalance, Number(bDec));
      } catch (e) {}

      try {
        const [rawPrice] = await poolContract.getPrice(inv.baseAddress, inv.quoteAddress);
        formattedPrice = ethers.formatUnits(rawPrice, 18);
      } catch (e) {}
      const f = await isVerifiedInventory(inv, normalizedChain);
      enrichedInventories.push({
        ...inv,
        balances: {
          base: baseBalance,
        },
        price: formattedPrice,
        isVerified: f,
        chain: normalizedChain,
      });
    }

    return res.status(200).json({
      status: true,
      pool: {
        ...pool,
        inventories: enrichedInventories,
      },
    });
  } catch (err) {
    console.error(`❌ Fetch Pool By Address Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

// ==========================================
// 4. Upsert / Seed asset
// ==========================================
// changed from /pairs/upsert
router.post('/asset/upsert', async (req, res) => {
  const { ownerSafeAddress, symbol, contractAddress, logo, priceFeed, chain } = req.body;

  try {
    if (!symbol || !contractAddress || !priceFeed || !chain || !ownerSafeAddress) {
      return res.status(400).json({
        status: false,
        errorMsg: 'Symbol, Address, priceFeed, and chain are required',
      });
    }

    const normalizedChain = chain.toLowerCase();
    const normalizedSymbol = symbol.toUpperCase();
    const normalizedTokenAddress = contractAddress.toLowerCase();

    // Check if the pair already exists

    const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
    if (!ADDR_RE.test(contractAddress) || !ADDR_RE.test(priceFeed)) {
      return res.status(400).json({
        status: false,
        errorMsg: 'contractAddress and priceFeed must be valid addresses',
      });
    }

    const envType = mode === 'development' ? 'TESTNET' : 'MAINNET';
    const [user, ownDuplicate] = await Promise.all([
      User.findOne({ safeAddress: ownerSafeAddress.toLowerCase() }),
      UserConfiguredAsset.findOne({
        ownerSafeAddress: ownerSafeAddress.toLowerCase(),
        chain: normalizedChain,
        tokenSymbol: normalizedSymbol,
        type: envType,
      }).lean(),
    ]);
    if (!user) {
      return res.status(404).json({
        status: false,
        errorMsg: 'User not found',
      });
    }
    const listed = (user.tokenConfig || []).find(
      (t) =>
        t.chain === normalizedChain &&
        (t.tokenSymbol === normalizedSymbol ||
          String(t.tokenAddress || '').toLowerCase() === normalizedTokenAddress)
    );
    if (listed) {
      return res.status(409).json({
        status: false,
        errorMsg: 'This symbol or address is already a Salva-listed asset',
      });
    }
    if (ownDuplicate) {
      return res.status(409).json({
        status: false,
        errorMsg: `You already configured ${normalizedSymbol}`,
      });
    }

    let resolvedLogo = logo;
    if (!resolvedLogo || logo === '') {
      const foundAsset = await Assets.findOne({
        chain: normalizedChain,
        tokenAddress: normalizedTokenAddress,
      });
      resolvedLogo = foundAsset && foundAsset.logo ? foundAsset.logo : null;
    }

    const tokenDecimals = Number(
      await new ethers.Contract(normalizedTokenAddress, ERC20, provider(normalizedChain)).decimals()
    );

    // Create new pair with resolved logos
    const pair = await UserConfiguredAsset.create({
      ownerSafeAddress: ownerSafeAddress,
      tokenSymbol: normalizedSymbol,
      tokenAddress: normalizedTokenAddress,
      logo: resolvedLogo,
      priceFeedAddress: priceFeed.toLowerCase(),
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    const newTokenConfig = {
      chain: normalizedChain,
      tokenAddress: normalizedTokenAddress,
      tokenSymbol: normalizedSymbol,
      tokenDecimals,
      logo: resolvedLogo,
      priceFeedAddress: priceFeed.toLowerCase(),
      isActive: true,
    };

    user.tokenConfig.push(newTokenConfig);
    await user.save();

    return res.status(200).json({
      status: true,
      asset: pair,
    });
  } catch (err) {
    console.error(`❌ Upsert Asset Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
