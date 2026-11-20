import { SALVA_API_URL } from '../config';

export const POLL_INTERVAL_MS = 120000;

const WALLET_CACHE_VERSION = 6;
const WALLET_CACHE_PREFIX = 'salva_wallet_snapshot:';
const CHAIN_CACHE_PREFIX = 'salva_chain_metadata:';
const POOL_CACHE_PREFIX = 'salva_pool_cache_v2';

export const walletKey = (email, chain) =>
  `${String(email || '')
    .toLowerCase()
    .trim()}:${String(chain || '')
    .toLowerCase()
    .trim()}`;

const walletStorageKey = (email, chain) =>
  `${WALLET_CACHE_PREFIX}${WALLET_CACHE_VERSION}:${encodeURIComponent(walletKey(email, chain))}`;

const chainStorageKey = (email) =>
  `${CHAIN_CACHE_PREFIX}${WALLET_CACHE_VERSION}:${encodeURIComponent(
    String(email || '')
      .toLowerCase()
      .trim()
  )}`;

const poolStorageKey = (email, chain) =>
  `${POOL_CACHE_PREFIX}:${String(chain || '')
    .toLowerCase()
    .trim()}:${String(email || '')
    .toLowerCase()
    .trim()}`;

const emitChainCacheUpdate = (email) => {
  try {
    window.dispatchEvent(
      new CustomEvent('salva:chain-cache-updated', {
        detail: {
          email: String(email || '')
            .toLowerCase()
            .trim(),
        },
      })
    );
  } catch {}
};

/*
 * IMPORTANT:
 * Every numeric value coming from the API is retained in its original/full
 * representation AND gets a presentation-only display value.
 *
 * Never use a `*Display` field for calculations, validation or transaction
 * payloads. The transaction path must always use the `*Full` field.
 */
export const numericFull = (value, fallback = '0') => {
  if (value === null || value === undefined || value === '') return fallback;

  const raw = String(value).trim();

  if (!raw) return fallback;

  return raw;
};

export const formatDisplayNumber = (value, maxDecimals = 12) => {
  const raw = numericFull(value, '');

  if (!raw) return '—';

  const n = Number(raw);

  if (!Number.isFinite(n)) return '—';

  if (n === 0) return '0';

  const abs = Math.abs(n);
  const threshold = 10 ** -maxDecimals;

  if (abs < threshold) {
    return `<${threshold.toFixed(maxDecimals)}`;
  }

  const str = /^-?\d+(\.\d+)?$/.test(raw) ? raw : n.toFixed(Math.min(100, maxDecimals + 8));
  const negative = str.startsWith('-');
  const [rawInt, rawDec = ''] = str.replace('-', '').split('.');
  const integer = rawInt.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimal = rawDec.slice(0, maxDecimals).replace(/0+$/, '');

  return `${negative ? '-' : ''}${integer}${decimal ? `.${decimal}` : ''}`;
};

const numericPair = (value, maxDecimals = 6) => ({
  full: numericFull(value),
  display: formatDisplayNumber(value, maxDecimals),
});

const sanitizeCachedAsset = (asset) => {
  const balance = numericPair(
    asset?.balanceFull ??
      asset?.balance ??
      asset?.userBalance ??
      asset?.balanceFormatted ??
      asset?.tokenBalance ??
      '0'
  );

  const usdPrice = numericPair(asset?.usdPriceFull ?? asset?.usdPrice ?? 0);

  const ngnRate = numericPair(asset?.ngnRateFull ?? asset?.ngnRate ?? 0);

  return {
    _key: asset?._key,

    symbol: asset?.symbol,

    name: asset?.name ?? asset?.tokenName ?? null,

    logo: asset?.logo ?? asset?.logoURI ?? asset?.image ?? null,

    isSant: Boolean(asset?.isSant || asset?.symbol === 'SANT'),

    decimals: asset?.decimals ?? asset?.tokenDecimals ?? 18,

    /*
     * Keep the full value as the canonical balance.
     * `balanceDisplay` is presentation-only.
     */
    balance: balance.full,
    balanceFull: balance.full,
    balanceDisplay: balance.display,

    contractAddress: asset?.contractAddress ?? asset?.tokenAddress ?? asset?.address ?? null,

    chain: asset?.chain ?? asset?.chainName ?? null,

    rpcUrl: asset?.rpcUrl ?? asset?.rpc ?? asset?.extra?.rpcUrl ?? asset?.extra?.rpc ?? null,

    chainlinkFeedAddress:
      asset?.chainlinkFeedAddress ??
      asset?.priceFeed ??
      asset?.extra?.chainlinkFeedAddress ??
      asset?.extra?.feed ??
      null,

    usdPrice: usdPrice.full,
    usdPriceFull: usdPrice.full,
    usdPriceDisplay: usdPrice.display,

    ngnRate: ngnRate.full,
    ngnRateFull: ngnRate.full,
    ngnRateDisplay: ngnRate.display,
  };
};

const normalizeCachedSnapshot = (snapshot, fallbackChain, logoMap = {}) => {
  if (!snapshot || typeof snapshot !== 'object') {
    return null;
  }

  const assets = Array.isArray(snapshot.assets)
    ? snapshot.assets
        .map((asset) => {
          const symbol = String(asset?.symbol || asset?.tokenSymbol || '').toUpperCase();

          return sanitizeCachedAsset({
            ...asset,

            /*
             * Local logos always win for assets we own locally.
             * This means an old cache with logo:null is automatically
             * repaired when it is read.
             */
            logo: logoMap[symbol] || asset?.logo || asset?.logoURI || asset?.image || null,

            symbol,

            isSant: Boolean(asset?.isSant) || symbol === 'SANT',
          });
        })
        .filter((asset) => asset.symbol)
    : [];

  const total = numericPair(snapshot.totalNgnFull ?? snapshot.totalNgn ?? null, 2);

  return {
    assets,

    totalNgn: snapshot.totalNgn === null && snapshot.totalNgnFull === null ? null : total.full,

    totalNgnFull: snapshot.totalNgnFull ?? snapshot.totalNgn ?? null,

    totalNgnDisplay:
      snapshot.totalNgnFull === null && snapshot.totalNgn === null ? '—' : total.display,

    at: Number(snapshot.at) || 0,

    pushSubscription: snapshot.pushSubscription ?? null,

    seenPushNotification: Boolean(snapshot.seenPushNotification),

    chain: String(snapshot.chain || fallbackChain || '').toLowerCase(),

    namespaces: Array.isArray(snapshot.namespaces)
      ? snapshot.namespaces
          .filter((item) => item?.namespace)
          .map((item) => ({
            namespace: item.namespace,
          }))
      : [],

    nameAliases: Array.isArray(snapshot.nameAliases)
      ? snapshot.nameAliases
          .filter((item) => item?.name && item?.wallet)
          .map((item) => ({
            name: item.name,
            wallet: item.wallet,
          }))
      : [],
  };
};

const WALLET_CACHE = new Map();

export const readWalletCache = (email, chain, logoMap = {}) => {
  if (!email || !chain) {
    return null;
  }

  const key = walletKey(email, chain);

  try {
    const raw = localStorage.getItem(walletStorageKey(email, chain));

    if (!raw) {
      return WALLET_CACHE.get(key) || null;
    }

    const parsed = normalizeCachedSnapshot(JSON.parse(raw), chain, logoMap);

    if (!parsed) {
      return WALLET_CACHE.get(key) || null;
    }

    WALLET_CACHE.set(key, parsed);

    /*
     * Persist the repaired snapshot.
     *
     * This is important: once NGNS/SANT logos are hydrated from
     * LOCAL_LOGOS, the actual localStorage cache also contains them.
     * Future reads therefore do not depend on polling.
     */
    try {
      localStorage.setItem(walletStorageKey(email, chain), JSON.stringify(parsed));
    } catch (error) {
      console.warn('[walletCache] repaired snapshot write failed:', error?.message || error);
    }

    return parsed;
  } catch (error) {
    console.warn('[walletCache] read failed:', error?.message || error);

    return WALLET_CACHE.get(key) || null;
  }
};

export const writeWalletCache = (email, chain, value, logoMap = {}) => {
  if (!email || !chain) {
    return null;
  }

  const snapshot = normalizeCachedSnapshot(
    {
      assets: value?.assets || [],

      totalNgn: value?.totalNgn ?? null,

      totalNgnFull: value?.totalNgnFull ?? value?.totalNgn ?? null,

      namespaces: value?.namespaces || [],

      nameAliases: value?.nameAliases || [],

      pushSubscription: value?.pushSubscription ?? null,

      seenPushNotification: Boolean(value?.seenPushNotification),

      chain,

      at: Date.now(),
    },
    chain,
    logoMap
  );

  if (!snapshot) {
    return null;
  }

  const key = walletKey(email, chain);

  WALLET_CACHE.set(key, snapshot);

  try {
    localStorage.setItem(walletStorageKey(email, chain), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[walletCache] write failed:', error?.message || error);
  }

  return snapshot;
};

export const clearWalletCache = (email, chain) => {
  if (!email || !chain) {
    return;
  }

  WALLET_CACHE.delete(walletKey(email, chain));

  try {
    localStorage.removeItem(walletStorageKey(email, chain));
  } catch {}
};

const normalizeSupportedChains = (chains) =>
  (Array.isArray(chains) ? chains : [])
    .map((chain) => {
      if (!chain || typeof chain !== 'object') {
        return null;
      }

      const name = String(chain.chainName || chain.name || '').trim();

      if (!name) {
        return null;
      }

      return {
        ...chain,
        chainName: name,
        name: chain.name || name,
      };
    })
    .filter(Boolean);

const readChainMetadataRaw = (email) => {
  if (!email) {
    return null;
  }

  try {
    const raw = localStorage.getItem(chainStorageKey(email));

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return {
      chains: normalizeSupportedChains(parsed.chains),

      at: Number(parsed.at) || 0,
    };
  } catch (error) {
    console.warn('[walletCache] chain metadata read failed:', error?.message || error);

    return null;
  }
};

export const readSupportedChainsCache = (email) => {
  const snapshot = readChainMetadataRaw(email);

  return snapshot
    ? {
        chains: snapshot.chains,
        at: snapshot.at,
      }
    : null;
};

export const writeSupportedChainsCache = (email, chains) => {
  if (!email) {
    return null;
  }

  const snapshot = {
    chains: normalizeSupportedChains(chains),

    at: Date.now(),
  };

  try {
    localStorage.setItem(chainStorageKey(email), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[walletCache] supported chains write failed:', error?.message || error);
  }

  emitChainCacheUpdate(email);

  return {
    chains: snapshot.chains,
    at: snapshot.at,
  };
};

export const readChainMetadataCache = (email) => readChainMetadataRaw(email);

const getAssetBalance = (asset) =>
  asset?.balanceFull ??
  asset?.balance ??
  asset?.userBalance ??
  asset?.balanceFormatted ??
  asset?.tokenBalance ??
  '0';

const getAssetAddress = (asset) =>
  asset?.contractAddress ?? asset?.tokenAddress ?? asset?.address ?? null;

const getAssetChain = (asset) => asset?.chain ?? asset?.chainName ?? null;

const normalizeAssetsForCache = (raw, fallbackChain = null, logoMap = {}) => {
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.assets)
    ? raw.assets
    : Array.isArray(raw?.data)
    ? raw.data
    : Array.isArray(raw?.assetData)
    ? raw.assetData
    : [];

  return list.map((asset, index) => {
    const symbol = String(asset?.symbol || asset?.tokenSymbol || 'TOKEN').toUpperCase();

    const chain = getAssetChain(asset) || fallbackChain || null;

    const logo = logoMap[symbol] || asset?.logo || asset?.logoURI || asset?.image || null;

    return sanitizeCachedAsset({
      ...asset,

      _key: `${chain || 'chain'}:${getAssetAddress(asset) || symbol || index}`,

      symbol,

      logo,

      isSant: symbol === 'SANT',

      decimals: asset?.decimals ?? asset?.tokenDecimals ?? 18,

      balance: getAssetBalance(asset),

      balanceFull: getAssetBalance(asset),

      contractAddress: getAssetAddress(asset),

      chain,
    });
  });
};

export const fetchWalletSnapshot = async (
  email,
  chain,
  { signal, logoMap = {}, timeout = 30000 } = {}
) => {
  const normalizedChain = String(chain).toLowerCase();

  const controller = new AbortController();

  const onAbort = () => controller.abort();

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;

  try {
    const response = await fetch(
      `${SALVA_API_URL}/api/user/${encodeURIComponent(email)}/${encodeURIComponent(
        normalizedChain
      )}`,
      {
        signal: controller.signal,

        headers: {
          Accept: 'application/json',
        },
      }
    );

    const text = await response.text();

    let data = null;

    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Invalid JSON response (${response.status})`);
    }

    if (!response.ok || data?.status === false) {
      throw new Error(
        data?.errorMsg || data?.message || data?.error || `Request failed (${response.status})`
      );
    }

    const payload = data?.data ?? data;

    const assetPayload = payload?.assets;

    if (assetPayload?.status === false) {
      throw new Error(
        assetPayload?.errorMsg || assetPayload?.message || 'Asset data is unavailable'
      );
    }

    const nextAssets = normalizeAssetsForCache(
      assetPayload?.assetData ?? assetPayload?.assets ?? assetPayload?.data ?? assetPayload ?? [],

      normalizedChain,

      logoMap
    );

    const rawTotal = payload?.totalNgnValue?.ngnValue ?? payload?.totalNgnValue ?? null;

    if (rawTotal !== null && rawTotal !== undefined && rawTotal !== '') {
      const parsedTotal = Number(rawTotal);

      if (!Number.isFinite(parsedTotal)) {
        throw new Error('Invalid portfolio balance received from server');
      }
    }

    const snapshot = writeWalletCache(
      email,
      normalizedChain,
      {
        assets: nextAssets,
        totalNgn: rawTotal,
        totalNgnFull: rawTotal,
        namespaces: payload?.namespaces || [],
        nameAliases: payload?.nameAliases || [],
        pushSubscription: payload?.meta?.pushSubscription ?? null,
        seenPushNotification: Boolean(payload?.meta?.seenPushNotification),
      },
      logoMap
    );

    return {
      snapshot,
      meta: payload?.meta || null,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }

    signal?.removeEventListener('abort', onAbort);
  }
};

/* =========================================================================
 * POOL CACHE
 * ========================================================================= */

const readPoolRoot = (email, chain) => {
  try {
    const raw = localStorage.getItem(poolStorageKey(email, chain));

    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writePoolRoot = (email, chain, root) => {
  try {
    localStorage.setItem(poolStorageKey(email, chain), JSON.stringify(root));
  } catch {
    /*
     * Cache failure must never
     * break the UI.
     */
  }
};

const normalizeInventory = (raw) => {
  const baseFull = numericFull(
    raw?.baseAssetBalanceFull ??
      raw?.balances?.base ??
      raw?.baseAssetBalance ??
      raw?.baseBalance ??
      raw?.baseAmount ??
      '0'
  );

  const quoteFull = numericFull(
    raw?.quoteAssetBalanceFull ??
      raw?.balances?.quote ??
      raw?.quoteAssetBalance ??
      raw?.quoteBalance ??
      raw?.quoteAmount ??
      '0'
  );

  const priceFull = numericFull(raw?.currentPriceFull ?? raw?.price ?? raw?.currentPrice ?? '0');

  const formattedPrice = formatDisplayNumber(priceFull);

  const floorFull = numericFull(raw?.floorFull ?? raw?.floor ?? '0');

  const current = Number(priceFull);

  const floor = Number(floorFull);

  const priceChangePct =
    Number.isFinite(current) && Number.isFinite(floor) && floor !== 0
      ? ((current - floor) / Math.abs(floor)) * 100
      : null;

  return {
    ...raw,

    /*
     * BASE BALANCE
     */
    baseAssetBalance: baseFull,

    baseAssetBalanceFull: baseFull,

    baseAssetBalanceDisplay: formatDisplayNumber(baseFull),

    /*
     * QUOTE BALANCE
     */
    quoteAssetBalance: quoteFull,

    quoteAssetBalanceFull: quoteFull,

    quoteAssetBalanceDisplay: formatDisplayNumber(quoteFull),

    /*
     * CURRENT MARKET PRICE
     */
    currentPrice: priceFull,

    currentPriceFull: priceFull,

    currentPriceDisplay: formattedPrice,

    formattedPrice,

    /*
     * ACQUISITION FLOOR
     */
    floor: floorFull,

    floorFull,

    floorDisplay: formatDisplayNumber(floorFull),

    /*
     * Price vs acquisition floor.
     *
     * This is NOT poll-over-poll movement.
     */
    priceChangePct,
  };
};

const normalizePools = (pools) =>
  (Array.isArray(pools) ? pools : []).map((pool) => {
    const inventories = (Array.isArray(pool?.inventories) ? pool.inventories : []).map(
      normalizeInventory
    );

    return {
      ...pool,

      inventories,

      inventoryCount: inventories.length,
    };
  });

export const readPoolCache = (email, chain) => readPoolRoot(email, chain);

export const writePoolCache = (email, chain, pools) => {
  const root = {
    pools: normalizePools(pools),

    poolsUpdatedAt: Date.now(),
  };

  writePoolRoot(email, chain, root);

  return root;
};

export const clearPoolCache = (email, chain) => {
  try {
    localStorage.removeItem(poolStorageKey(email, chain));
  } catch {}
};

const poolAssetsKey = (chain, safeAddress) =>
  `salva_pool_assets_v1:${String(chain || '')
    .toLowerCase()
    .trim()}:${String(safeAddress || '')
    .toLowerCase()
    .trim()}`;

export const readPoolAssetsCache = (chain, safeAddress) => {
  try {
    const raw = localStorage.getItem(poolAssetsKey(chain, safeAddress));
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed?.assets) ? parsed.assets : null;
  } catch {
    return null;
  }
};

export const writePoolAssetsCache = (chain, safeAddress, assets) => {
  try {
    localStorage.setItem(
      poolAssetsKey(chain, safeAddress),
      JSON.stringify({ assets: Array.isArray(assets) ? assets : [], at: Date.now() })
    );
  } catch {}
};

export const poolHasBalance = (pool) => {
  const inventories = Array.isArray(pool?.inventories) ? pool.inventories : [];

  return inventories.some((inv) => {
    const base = Number(inv?.baseAssetBalanceFull ?? inv?.baseAssetBalance ?? 0);

    const quote = Number(inv?.quoteAssetBalanceFull ?? inv?.quoteAssetBalance ?? 0);

    return (Number.isFinite(base) && base > 0) || (Number.isFinite(quote) && quote > 0);
  });
};

export async function fetchPoolSnapshot(email, safeAddress, chain, { signal } = {}) {
  const url = `${SALVA_API_URL}/api/pool/pools/${encodeURIComponent(
    safeAddress
  )}/${encodeURIComponent(chain)}`;

  const response = await fetch(url, {
    method: 'GET',

    headers: {
      Accept: 'application/json',
    },

    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch pools (${response.status})`);
  }

  const payload = await response.json();

  const pools = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.pools)
    ? payload.pools
    : Array.isArray(payload?.data)
    ? payload.data
    : [];

  return writePoolCache(email, chain, pools);
}
