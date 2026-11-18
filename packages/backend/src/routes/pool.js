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
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import { SupportedPair } from '../models/SupportedPair.js';
import { fetchPricePerNgn } from '../utils/fetchRate.js';
import Assets from '../models/Assets.js';
import { User } from '../models/Users.js';
import { verify_Pin } from '../services/pinService.js';

const router = express.Router();

const provider = (chain) => {
  const rpc = getRpcUrlByChain(chain);
  return new ethers.JsonRpcProvider(rpc);
};

router.get('/isInverted/:base/:quote/:chain', async (req, res) => {
  const { base, quote, chain } = req.query;

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

    // First: exact direction
    let pair = await SupportedPair.findOne({
      baseSymbol: normalizedBase,
      quoteSymbol: normalizedQuote,
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    if (pair) {
      return res.status(200).json({
        status: true,
        isInverted: false,
      });
    }

    // Second: reverse direction
    pair = await SupportedPair.findOne({
      baseSymbol: normalizedQuote,
      quoteSymbol: normalizedBase,
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    if (pair) {
      return res.status(200).json({
        status: true,
        isInverted: true,
      });
    }

    return res.status(404).json({
      status: false,
      errorMsg: `Supported pair not found for ${normalizedBase}/${normalizedQuote}`,
    });
  } catch (err) {
    console.error(`Is Inverted Check failed: ${err.message}`);

    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

router.get('/assets/price/:base/:quote/:chain', async (req, res) => {
  const { base, quote, chain } = req.params; // Fixed: use req.params for path variables

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

    let pair = await SupportedPair.findOne({
      baseSymbol: normalizedBase,
      quoteSymbol: normalizedQuote,
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    let isInverted = false;
    if (!pair) {
      pair = await SupportedPair.findOne({
        baseSymbol: normalizedQuote,
        quoteSymbol: normalizedBase,
        chain: normalizedChain,
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });

      if (!pair) {
        return res.status(404).json({
          status: false,
          errorMsg: `Supported pair not found for ${normalizedBase}/${normalizedQuote}`,
        });
      }
      isInverted = true;
    }

    let price = 0;
    const isStableNgn = (sym) => sym === 'NGNS' || sym === 'CNGN';
    if (isStableNgn(pair.quoteSymbol)) {
      isInverted = true;
    }
    if (!isInverted) {
      if (isStableNgn(pair.baseSymbol)) {
        const fetched = await fetchPricePerNgn(pair.quoteAddress, chain);
        price = 1 / fetched.data;
      } else {
        const priceFeed = new ethers.Contract(pair.priceFeed, CHAINLINK, provider(chain));
        const [, answer] = await priceFeed.latestRoundData();
        const decimals = await priceFeed.decimals();
        price = Number(ethers.formatUnits(answer, Number(decimals)));
      }
    } else {
      if (isStableNgn(pair.baseSymbol)) {
        const fetched = await fetchPricePerNgn(pair.quoteAddress, chain);
        price = fetched.data;
      } else {
        const priceFeed = new ethers.Contract(pair.priceFeed, CHAINLINK, provider(chain));
        const [, answer] = await priceFeed.latestRoundData();
        const decimals = await priceFeed.decimals();
        price = 1 / Number(ethers.formatUnits(answer, Number(decimals)));
      }
    }
    console.log('PRICE: ', price);
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

router.get('/supported-Pairs/:chain', async (req, res) => {
  const { chain } = req.params;
  try {
    const pairs = await SupportedPair.find({
      chain: chain.toLowerCase(),
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    }).lean();

    if (!pairs || pairs.length === 0) {
      return res.status(200).json({
        status: true,
        pairs: [],
      });
    }

    return res.status(200).json({
      status: true,
      pairs: pairs,
    });
  } catch (err) {
    console.error(`supported-Pairs fetch failed: ${err.message}`);
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
  try {
    const pools = await Pool.find({
      ownerSafeAddress: safeAddress.toLowerCase(),
      chain: chain.toLowerCase(),
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

        enrichedInventories.push({
          ...inv,
          balances: {
            base: baseBalance,
            quote: quoteBalance,
          },
          price: formattedPrice,
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
          results.push({
            poolAddress: pool.poolAddress,
            chain: pool.chain,
            inventory: {
              ...inv,
              balances: {
                base: baseBalance,
              },
              price: formattedPrice,
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
          enrichedInventories.push({
            ...inv,
            balance: {
              base: baseBalance,
            },
            price: formattedPrice,
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

      enrichedInventories.push({
        ...inv,
        balances: {
          base: baseBalance,
        },
        price: formattedPrice,
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
// 4. Upsert / Seed Supported Pair
// ==========================================
router.post('/pairs/upsert', async (req, res) => {
  const {
    ownerSafeAddress,
    baseSymbol,
    quoteSymbol,
    baseAddress,
    quoteAddress,
    baseLogo,
    quoteLogo,
    priceFeed,
    chain,
  } = req.body;

  try {
    if (
      !baseSymbol ||
      !quoteSymbol ||
      !baseAddress ||
      !quoteAddress ||
      !priceFeed ||
      !chain ||
      !ownerSafeAddress
    ) {
      return res.status(400).json({
        status: false,
        errorMsg:
          'baseSymbol, quoteSymbol, baseAddress, quoteAddress, priceFeed, and chain are required',
      });
    }

    const normalizedChain = chain.toLowerCase();
    const normalizedBase = baseSymbol.toUpperCase();
    const normalizedQuote = quoteSymbol.toUpperCase();
    const normalizedBaseAddress = baseAddress.toLowerCase();
    const normalizedQuoteAddress = quoteAddress.toLowerCase();

    // Check if the pair already exists
    let pair = await SupportedPair.findOne({
      chain: normalizedChain,
      baseAddress: normalizedBaseAddress,
      quoteAddress: normalizedQuoteAddress,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    if (pair) {
      throw new TypeError('Pair Exists');
    }

    // Resolve base logo: use input or search Assets DB
    let resolvedBaseLogo = baseLogo;
    if (!resolvedBaseLogo || baseLogo === '') {
      const foundBaseAsset = await Assets.findOne({
        chain: normalizedChain,
        tokenAddress: normalizedBaseAddress,
      });
      resolvedBaseLogo = foundBaseAsset && foundBaseAsset.logo ? foundBaseAsset.logo : null;
    }

    // Resolve quote logo: use input or search Assets DB
    let resolvedQuoteLogo = quoteLogo;
    if (!resolvedQuoteLogo || resolvedQuoteLogo === '') {
      const foundQuoteAsset = await Assets.findOne({
        chain: normalizedChain,
        tokenAddress: normalizedQuoteAddress,
      });
      resolvedQuoteLogo = foundQuoteAsset && foundQuoteAsset.logo ? foundQuoteAsset.logo : null;
    }

    // Create new pair with resolved logos
    pair = await SupportedPair.create({
      ownerSafeAddress: ownerSafeAddress,
      baseSymbol: normalizedBase,
      quoteSymbol: normalizedQuote,
      baseAddress: normalizedBaseAddress,
      quoteAddress: normalizedQuoteAddress,
      baseLogo: resolvedBaseLogo,
      quoteLogo: resolvedQuoteLogo,
      priceFeed: priceFeed.toLowerCase(),
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    return res.status(200).json({
      status: true,
      pair: pair,
    });
  } catch (err) {
    console.error(`❌ Upsert Supported Pair Failed: ${err.message}`);
    return res.status(500).json({
      status: false,
      errorMsg: err.message,
    });
  }
});

export default router;
