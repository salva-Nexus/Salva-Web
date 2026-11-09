import Assets from '../models/Assets.js';
import { User } from '../models/Users.js';
import { ethers } from 'ethers';
import { _getBalance, fetchTokenUsdPrice } from './balanceServices.js';
import { ERC20 } from '../utils/abi.js';
import { getRpcUrlByChain } from '../utils/rpcUrls.js';
import { SupportedChain } from '../models/SupportedChain.js';
import { keyValue, mode } from '../utils/vars.js';
import { dBalance } from './balanceServices.js';
import { fetchNgnPricePerAsset } from '../utils/fetchRate.js';

async function userAssetsData(safe, chain) {
  const normalizedChain = chain.toLowerCase();

  const user = await User.findOne({
    safeAddress: safe.toLowerCase(),
  });
  if (!user) return { status: false, assetData: [] };

  const hasChainTokens = user.tokenConfig.some(
    (config) => config.chain && config.chain.toLowerCase() === normalizedChain
  );

  if (!hasChainTokens) {
    const updated = await _updateConfig(user.email);
    if (!updated) {
     return { status: false, assetData: [] }; 
    }
  }

  // 1. Fetch raw NGN price per USD once upfront
  const ngnRateRes = await fetchNgnPricePerAsset(undefined, normalizedChain);
  const rawNgnPerUsd = ngnRateRes.status ? ngnRateRes.data : 0;

  const provider = new ethers.JsonRpcProvider(getRpcUrlByChain(chain));
  const userData = [];

  for (let i = 0; i < user.tokenConfig.length; i++) {
    const config = user.tokenConfig[i];
    if (config.chain && config.chain.toLowerCase() === normalizedChain) {
      const details = await Assets.findOne({
        chain: normalizedChain,
        tokenAddress: config.tokenAddress ? config.tokenAddress.toLowerCase() : '',
        type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      });

      // Check if Chainlink feed is present and starts with '0x'
      const feedAddress = config.priceFeedAddress;
      const hasValidFeed = feedAddress && feedAddress.startsWith('0x');

      let usdPrice = 0;
      let ngnRate = 0;

      const safeConfigSymbol = (config.tokenSymbol || '').toUpperCase();

      if (hasValidFeed) {
        usdPrice = await fetchTokenUsdPrice(safeConfigSymbol, normalizedChain, feedAddress);

        if (usdPrice > 0) {
          ngnRate = rawNgnPerUsd;
        }
      }
      if (safeConfigSymbol === 'NGNS' || safeConfigSymbol === 'CNGN') {
        usdPrice = rawNgnPerUsd > 0 ? 1 / rawNgnPerUsd : 0;
        ngnRate = rawNgnPerUsd;
      }

      // Guard against missing DB entries in Assets collection
      if (!details) {
        const uContract = new ethers.Contract(config.tokenAddress, ERC20, provider);
        const uData = await _getBalance(uContract, safe);

        const uFormattedBalance = ethers.formatUnits(uData.balance, Number(uData.decimals));
        userData.push({
          symbol: safeConfigSymbol,
          logo: config.logo || null,
          address: config.tokenAddress,
          decimals: config.tokenDecimals,
          balance: uFormattedBalance,
          chain: normalizedChain,
          usdPrice: usdPrice,
          ngnRate: ngnRate,
          extra: {
            feed: config.priceFeedAddress,
          },
        });
        continue;
      }

      const isNative =
        config.tokenAddress.toLowerCase() === ethers.ZeroAddress.toLowerCase() ||
        config.tokenAddress === '0x0';

      let data;

      if (isNative) {
        const rawBalance = await provider.getBalance(safe);
        data = {
          balance: rawBalance,
          decimals: 18,
        };
      } else {
        const contract = new ethers.Contract(config.tokenAddress, ERC20, provider);
        data = await _getBalance(contract, safe);
      }

      const formattedBalance = ethers.formatUnits(data.balance, Number(data.decimals));

      const safeDetailsSymbol = (details.tokenSymbol || config.tokenSymbol || '').toUpperCase();

      userData.push({
        symbol: safeDetailsSymbol,
        logo: details.logo || config.logo || null,
        address: details.tokenAddress,
        decimals: details.tokenDecimals,
        balance: formattedBalance,
        chain: normalizedChain,
        usdPrice: usdPrice,
        ngnRate: ngnRate,
        extra: {
          feed: config.priceFeedAddress,
        },
      });
    }
  }

  return { status: true, assetData: userData };
}

async function userCummulativeNgnBalance(safe) {
  const chains = await SupportedChain.find({
    type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    isActive: true,
  });

  let cumulativeNgnBalance = 0;

  for (let i = 0; i < chains.length; i++) {
    const currentChain = chains[i].chainName;
    const res = await userAssetsData(safe, currentChain);
    if (res.status && res.assetData) {
      for (let j = 0; j < res.assetData.length; j++) {
        const asset = res.assetData[j];

        const nValue = await dBalance(
          safe,
          asset.address,
          asset.symbol,
          currentChain,
          !asset.extra.feed || asset.extra.feed === null ? undefined : asset.extra.feed
        );
        if (nValue?.status && nValue?.data?.ngnValue) {
          cumulativeNgnBalance += nValue.data.ngnValue;
        }
      }
    }
  }

  return { status: true, ngnValue: cumulativeNgnBalance };
}

async function loadTokenData(tokenAddress, chain) {
  const normalizedAddress = tokenAddress.trim();
  try {
    if (normalizedAddress !== ethers.ZeroAddress) {
      const rpcUrl = getRpcUrlByChain(chain);
      if (!rpcUrl) {
        throw new Error(`Unsupported chain or missing RPC URL for: ${chain}`);
      }

      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const contract = new ethers.Contract(normalizedAddress, ERC20, provider);

      // Call symbol and decimals on the ERC20 contract
      const [symbol, decimals] = await Promise.all([contract.symbol(), contract.decimals()]);
      return {
        status: true,
        data: {
          address: normalizedAddress,
          symbol: (symbol || '').toUpperCase(),
          decimals: Number(decimals),
        },
      };
    } else {
      const asset = await Assets.findOne({
        chain: chain.toLowerCase(),
        tokenAddress: normalizedAddress,
      });

      return {
        status: true,
        data: {
          address: normalizedAddress,
          symbol: (asset?.tokenSymbol || 'ETH').toUpperCase(),
          decimals: 18,
        },
      };
    }
  } catch (error) {
    console.error(`❌ Error loading ERC20 token data for ${tokenAddress}:`, error.message);
    return {
      status: false,
      errorMsg: error.message,
    };
  }
}

async function addAsset(safe, chain, tokenAddress, feedAddress = null, logo = null) {
  try {
    const normalizedChain = chain.toLowerCase().trim();
    const normalizedAddress = tokenAddress.toLowerCase().trim();

    // 1. Verify user exists
    const user = await User.findOne({ safeAddress: safe.toLowerCase().trim() });
    if (!user) {
      return { status: false, errorMsg: 'User wallet not found' };
    }

    // 2. Fetch on-chain ERC20 token metadata (symbol, decimals)
    const tokenInfo = await loadTokenData(normalizedAddress, normalizedChain);
    if (!tokenInfo.status) {
      return {
        status: false,
        errorMsg: tokenInfo.errorMsg || 'Failed to fetch token metadata from network',
      };
    }

    const { symbol, decimals } = tokenInfo.data;

    const hasDuplicateUserToken = user.tokenConfig.some(
      (cfg) =>
        cfg.chain === normalizedChain && cfg.tokenAddress?.toLowerCase() === normalizedAddress
    );

    if (hasDuplicateUserToken) {
      return { status: false, errorMsg: 'Token is already added to your assets portfolio' };
    }

    const existingGlobalAsset = await Assets.findOne({
      chain: normalizedChain,
      tokenAddress: normalizedAddress,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
    });

    const finalFeed = existingGlobalAsset?.priceFeedAddress
      ? existingGlobalAsset.priceFeedAddress
      : feedAddress
        ? feedAddress.toLowerCase().trim()
        : 'price conversion unavailable';

    user.tokenConfig.push({
      chain: normalizedChain,
      tokenAddress: normalizedAddress,
      tokenSymbol: symbol,
      tokenDecimals: decimals,
      logo: logo,
      priceFeedAddress: finalFeed,
    });

    await user.save();

    return {
      status: true,
      message: 'Asset successfully added',
    };
  } catch (error) {
    console.error(`❌ Error in addAsset:`, error.message);
    return { status: false, errorMsg: error.message };
  }
}

async function removeAsset(safe, chain, tokenAddress) {
  try {
    const normalizedChain = chain.toLowerCase().trim();
    const normalizedAddress = tokenAddress.toLowerCase().trim();

    const user = await User.findOne({
      safeAddress: safe.toLowerCase().trim(),
    });
    if (!user) {
      return { status: false, errorMsg: 'User not found' };
    }

    let assetFound = false;
    const updatedTokenConfig = [];

    for (let i = 0; i < user.tokenConfig.length; i++) {
      const config = user.tokenConfig[i];
      const matchChain = config.chain && config.chain.toLowerCase() === normalizedChain;
      const matchAddress =
        config.tokenAddress && config.tokenAddress.toLowerCase() === normalizedAddress;

      if (matchChain && matchAddress) {
        assetFound = true;
      } else {
        updatedTokenConfig.push(config);
      }
    }

    if (!assetFound) {
      return {
        status: false,
        errorMsg: 'Asset not found in user portfolio',
      };
    }

    user.tokenConfig = updatedTokenConfig;
    await user.save();

    return {
      status: true,
    };
  } catch (error) {
    console.error(`❌ Error removing asset:`, error.message);
    return {
      status: false,
      errorMsg: error.message,
    };
  }
}

async function getUserAndGlobalAssets(safe, chain) {
  try {
    const normalizedChain = chain.toLowerCase().trim();

    // 1. Fetch global active assets for the specific chain and mode
    const globalAssets = await Assets.find({
      chain: normalizedChain,
      type: mode === 'development' ? 'TESTNET' : 'MAINNET',
      isActive: true,
    }).lean();

    // 2. Fetch user by safeAddress
    const user = await User.findOne({
      safeAddress: safe.toLowerCase().trim(),
    }).lean();

    if (!user) {
      return {
        status: false,
        errorMsg: 'User not found',
      };
    }

    // 3. Filter user's tokenConfig by chain
    const userAssets = [];
    if (Array.isArray(user.tokenConfig)) {
      for (let i = 0; i < user.tokenConfig.length; i++) {
        const config = user.tokenConfig[i];
        if (config.chain && config.chain.toLowerCase() === normalizedChain) {
          userAssets.push(config);
        }
      }
    }

    return {
      status: true,
      data: {
        globalAssets: globalAssets,
        userAssets: userAssets,
      },
    };
  } catch (error) {
    console.error('❌ Error fetching user and global assets:', error.message);
    return {
      status: false,
      errorMsg: error.message,
    };
  }
}

async function findMatchingAsset(safe, chain, target) {
  try {
    const assetsRes = await getUserAndGlobalAssets(safe, chain);
    if (!assetsRes.status) {
      return {
        status: false,
        errorMsg: assetsRes.errorMsg,
      };
    }

    const { globalAssets, userAssets } = assetsRes.data;
    const query = target.toLowerCase().trim();

    let matchedAsset = null;

    // 1. Check userAssets first
    for (let i = 0; i < userAssets.length; i++) {
      const config = userAssets[i];
      const matchAddress = config.tokenAddress && config.tokenAddress.toLowerCase() === query;
      const matchSymbol = config.tokenSymbol && config.tokenSymbol.toLowerCase() === query;

      if (matchAddress || matchSymbol) {
        matchedAsset = config;
        break;
      }
    }

    // 2. Fall back to globalAssets if not found in userAssets
    if (!matchedAsset) {
      for (let i = 0; i < globalAssets.length; i++) {
        const asset = globalAssets[i];
        const matchAddress = asset.tokenAddress && asset.tokenAddress.toLowerCase() === query;
        const matchSymbol = asset.tokenSymbol && asset.tokenSymbol.toLowerCase() === query;

        if (matchAddress || matchSymbol) {
          matchedAsset = asset;
          break;
        }
      }
    }

    if (!matchedAsset) {
      return {
        status: false,
        errorMsg: 'No asset matched the provided symbol or address',
      };
    }

    return {
      status: true,
      data: matchedAsset,
    };
  } catch (error) {
    console.error('❌ Error finding matching asset:', error.message);
    return {
      status: false,
      errorMsg: error.message,
    };
  }
}

async function _updateConfig(email) {
  const user = await User.findOne({
    email: email,
  });
  const sChain = await SupportedChain.find({
    type: mode === 'MAINNET' ? 'MAINNET' : 'TESTNET',
  });
  let updateCount = 0;
  for (let i = 0; i < sChain.length; i++) {
    const ngns = await Assets.findOne({
      chain: sChain[i].chainName,
      tokenSymbol: 'NGNS',
    });
    if (ngns) {
      const isSet = user.tokenConfig.some(
        (config) => config.chain === ngns.chain && config.tokenSymbol === ngns.tokenSymbol
      );
      if (!isSet)
        user.tokenConfig.push({
          chain: ngns.chain,
          tokenAddress: ngns.tokenAddress,
          tokenSymbol: ngns.tokenSymbol,
          tokenDecimals: ngns.tokenDecimals,
          logo: ngns.logo,
          priceFeedAddress: ngns.priceFeedAddress,
        });
      updateCount++;
    }

    const sant = await Assets.findOne({
      chain: sChain[i].chainName,
      tokenSymbol: 'SANT',
    });
    if (sant) {
      const isSet = user.tokenConfig.some(
        (config) => config.chain === sant.chain && config.tokenSymbol === sant.tokenSymbol
      );
      if (!isSet) {
        user.tokenConfig.push({
          chain: sant.chain,
          tokenAddress: sant.tokenAddress,
          tokenSymbol: sant.tokenSymbol,
          tokenDecimals: sant.tokenDecimals,
          logo: sant.logo,
          priceFeedAddress: sant.priceFeedAddress,
        });
        updateCount++;
      }
    }
  }
  if (updateCount > 0) {
    await user.save();
    return { status: true };
  }
  return { status: false };
}

export {
  _updateConfig,
  userAssetsData,
  userCummulativeNgnBalance,
  loadTokenData,
  addAsset,
  removeAsset,
  getUserAndGlobalAssets,
  findMatchingAsset,
};
