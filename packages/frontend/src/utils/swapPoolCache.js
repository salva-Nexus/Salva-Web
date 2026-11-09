// packages/frontend/src/utils/swapPoolCache.js
// Cache + network layer for the Swap tab. Kept separate from walletCache.js.
//
//  - Supported pairs, and pool listings for each search query, are cached in
//    memory + localStorage so the Swap tab paints instantly.
//  - fetchListings() writes the cache and then reads it back, so the UI always
//    renders from cache.
//  - fetchLivePairListings() is the ONLY uncached call. It powers the live
//    price polling inside the "Proceed to swap" card.

import { SALVA_API_URL } from '../config';

export const SWAP_POLL_INTERVAL_MS = 10000;
export const SWAP_LIVE_POLL_INTERVAL_MS = 5000;
export const SWAP_PAIRS_POLL_INTERVAL_MS = 60000;
export const DEFAULT_BUY_SYMBOL = 'NGNS';

const CACHE_VERSION = 2;
const CACHE_PREFIX = 'salva_swap_pool_cache';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const MEMORY = new Map();

const lc = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();
const uc = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase();

/* ============================================================================
   LOW-LEVEL STORAGE
============================================================================ */

const storageKey = (kind, chain, id = '') =>
  `${CACHE_PREFIX}:${CACHE_VERSION}:${kind}:${lc(chain)}:${encodeURIComponent(id)}`;

const readEntry = (key) => {
  if (MEMORY.has(key)) return MEMORY.get(key);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    MEMORY.set(key, parsed);
    return parsed;
  } catch {
    return null;
  }
};

const writeEntry = (key, value) => {
  MEMORY.set(key, value);

  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // A full / unavailable localStorage must never break the UI.
  }

  return value;
};

/* ============================================================================
   NETWORK
============================================================================ */

// Shared JSON request helper (also used by SwapTab for POST / preview calls).
export const swapRequest = async (url, { method = 'GET', body, signal } = {}) => {
  const response = await fetch(url, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid server response (${response.status})`);
  }

  if (!response.ok || data?.status === false) {
    throw new Error(
      data?.errorMsg || data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
};

/* ============================================================================
   NORMALISERS
============================================================================ */

const normalizePair = (raw) => ({
  baseSymbol: uc(raw?.baseSymbol),
  quoteSymbol: uc(raw?.quoteSymbol),
  baseAddress: raw?.baseAddress ? lc(raw.baseAddress) : null,
  quoteAddress: raw?.quoteAddress ? lc(raw.quoteAddress) : null,
  baseLogo: raw?.baseLogo ? String(raw.baseLogo).trim() || null : null,
  quoteLogo: raw?.quoteLogo ? String(raw.quoteLogo).trim() || null : null,
  isVerified: raw?.isVerified === true,
});

const toNumericString = (value, fallback = '0') => {
  if (value === null || value === undefined || value === '') return fallback;
  const raw = String(value).trim();
  return raw || fallback;
};

// Presentation only. >= 1 -> 4 decimals, < 1 -> 12 decimals. Truncated, never rounded.
// Never use this for calculations or payloads; use the raw string.
export const truncateDisplay = (value) => {
  const raw = String(value ?? '').trim();
  const n = Number(raw);
  if (!raw || !Number.isFinite(n)) return '—';
  if (n === 0) return '0';

  const decimals = Math.abs(n) >= 1 ? 4 : 12;
  const plain = /e/i.test(raw) ? n.toFixed(20) : raw;
  const negative = plain.startsWith('-');
  const [intPart, fracPart = ''] = plain.replace(/^[-+]/, '').split('.');
  const grouped = (intPart || '0').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  return `${negative ? '-' : ''}${grouped}.${fracPart.slice(0, decimals).padEnd(decimals, '0')}`;
};

// One listing == one inventory inside one pool.
const normalizeListing = (pool, inv, chain) => {
  const baseSymbol = uc(inv?.baseSymbol);
  const quoteSymbol = uc(inv?.quoteSymbol);
  const baseAddress = inv?.baseAddress ? lc(inv.baseAddress) : ZERO_ADDRESS;
  const quoteAddress = inv?.quoteAddress ? lc(inv.quoteAddress) : ZERO_ADDRESS;
  const poolAddress = lc(pool?.poolAddress);

  // /pools/base and /pools/address return `balances.base`,
  // /pools/pair returns `balance.base`. Both are handled.
  const baseBalance = toNumericString(inv?.balances?.base ?? inv?.balance?.base ?? '0');

  return {
    key: `${poolAddress}:${baseAddress}:${quoteAddress}`,
    poolAddress,
    chain: lc(pool?.chain || inv?.chain || chain),
    baseSymbol,
    quoteSymbol,
    baseAddress,
    quoteAddress,
    baseLogo: inv?.baseLogo ? String(inv.baseLogo).trim() || null : null,
    quoteLogo: inv?.quoteLogo ? String(inv.quoteLogo).trim() || null : null,
    price: toNumericString(inv?.price),
    priceDisplay: truncateDisplay(inv?.price),
    baseBalance,
    baseBalanceDisplay: truncateDisplay(baseBalance),
  };
};
const isAvailable = (listing) => Number(listing.price) > 0 && Number(listing.baseBalance) > 0;

const sortListings = (listings) =>
  [...listings].sort(
    (a, b) =>
      Number(!isAvailable(a)) - Number(!isAvailable(b)) ||
      a.quoteSymbol.localeCompare(b.quoteSymbol) ||
      Number(a.price) - Number(b.price)
  );

const dedupe = (listings) => {
  const map = new Map();
  listings.forEach((item) => {
    if (item.baseSymbol && item.quoteSymbol && !map.has(item.key)) map.set(item.key, item);
  });
  return Array.from(map.values());
};

/* ============================================================================
   SUPPORTED PAIRS CACHE
============================================================================ */

export const readSupportedPairsCache = (chain) => {
  const entry = readEntry(storageKey('pairs', chain));
  if (!entry || !Array.isArray(entry.pairs)) return null;
  return { pairs: entry.pairs, at: Number(entry.at) || 0 };
};

export const writeSupportedPairsCache = (chain, pairs) =>
  writeEntry(storageKey('pairs', chain), {
    pairs: (Array.isArray(pairs) ? pairs : [])
      .map(normalizePair)
      .filter((pair) => pair.baseSymbol && pair.quoteSymbol),
    at: Date.now(),
  });

export const fetchSupportedPairs = async (chain, { signal } = {}) => {
  const data = await swapRequest(
    `${SALVA_API_URL}/api/pool/supported-Pairs/${encodeURIComponent(lc(chain))}`,
    { signal }
  );

  writeSupportedPairsCache(chain, data?.pairs);
  return readSupportedPairsCache(chain); // read back from cache
};

// Every asset that appears as a base OR a quote, one entry each. NGNS is first.
export const buildAssetList = (pairs) => {
  const map = new Map();

  (Array.isArray(pairs) ? pairs : []).forEach((pair) => {
    [
      { symbol: pair.baseSymbol, address: pair.baseAddress, logo: pair.baseLogo },
      { symbol: pair.quoteSymbol, address: pair.quoteAddress, logo: pair.quoteLogo },
    ].forEach((asset) => {
      if (!asset.symbol) return;

      const key = asset.address ? lc(asset.address) : `native:${asset.symbol}`;
      const existing = map.get(key);

      if (!existing) {
        map.set(key, asset);
      } else if (!existing.logo && asset.logo) {
        existing.logo = asset.logo;
      }
    });
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.symbol === DEFAULT_BUY_SYMBOL) return -1;
    if (b.symbol === DEFAULT_BUY_SYMBOL) return 1;
    return a.symbol.localeCompare(b.symbol);
  });
};

// Logo lookup built from the supported pairs (fallback when an inventory has no logo).
export const buildLogoIndex = (pairs) => {
  const byAddress = new Map();
  const bySymbol = new Map();

  (Array.isArray(pairs) ? pairs : []).forEach((pair) => {
    [
      { symbol: pair.baseSymbol, address: pair.baseAddress, logo: pair.baseLogo },
      { symbol: pair.quoteSymbol, address: pair.quoteAddress, logo: pair.quoteLogo },
    ].forEach(({ symbol, address, logo }) => {
      if (!logo) return;
      if (address && !byAddress.has(lc(address))) byAddress.set(lc(address), logo);
      if (symbol && !bySymbol.has(uc(symbol))) bySymbol.set(uc(symbol), logo);
    });
  });

  return { byAddress, bySymbol };
};

// Set of "base:quote" address keys (both directions) for pairs Salva has verified.
export const buildVerifiedIndex = (pairs) => {
  const verified = new Set();

  (Array.isArray(pairs) ? pairs : []).forEach((pair) => {
    if (pair.isVerified !== true || !pair.baseAddress || !pair.quoteAddress) return;
    verified.add(`${lc(pair.baseAddress)}:${lc(pair.quoteAddress)}`);
    verified.add(`${lc(pair.quoteAddress)}:${lc(pair.baseAddress)}`);
  });

  return verified;
};

export const isPairVerified = (index, baseAddress, quoteAddress) =>
  index instanceof Set && index.has(`${lc(baseAddress)}:${lc(quoteAddress)}`);

/* ============================================================================
   LISTINGS CACHE
   query = { mode: 'base', base }
         | { mode: 'pair', base, quote }
         | { mode: 'address', poolAddress, label? }
============================================================================ */

export const swapQueryKey = (query) => {
  if (query?.mode === 'pair') return `pair:${uc(query.base)}:${uc(query.quote)}`;
  if (query?.mode === 'address') return `address:${lc(query.poolAddress)}`;
  return `base:${uc(query?.base || DEFAULT_BUY_SYMBOL)}`;
};

export const readListingsCache = (chain, query) => {
  const entry = readEntry(storageKey('listings', chain, swapQueryKey(query)));
  if (!entry || !Array.isArray(entry.listings)) return null;
  return { listings: entry.listings, at: Number(entry.at) || 0 };
};

export const writeListingsCache = (chain, query, listings) =>
  writeEntry(storageKey('listings', chain, swapQueryKey(query)), {
    listings: Array.isArray(listings) ? listings : [],
    at: Date.now(),
  });

export const clearSwapPoolCache = (chain) => {
  const prefix = `${CACHE_PREFIX}:${CACHE_VERSION}:`;
  const marker = chain ? `:${lc(chain)}:` : null;

  Array.from(MEMORY.keys()).forEach((key) => {
    if (key.startsWith(prefix) && (!marker || key.includes(marker))) MEMORY.delete(key);
  });

  try {
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith(prefix) && (!marker || key.includes(marker))) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // ignore
  }
};

const queryUrl = (chain, query) => {
  const c = encodeURIComponent(lc(chain));

  if (query.mode === 'pair') {
    return `${SALVA_API_URL}/api/pool/pools/pair/${encodeURIComponent(
      uc(query.base)
    )}/${encodeURIComponent(uc(query.quote))}/${c}`;
  }

  if (query.mode === 'address') {
    return `${SALVA_API_URL}/api/pool/pools/address/${encodeURIComponent(
      lc(query.poolAddress)
    )}/${c}`;
  }

  return `${SALVA_API_URL}/api/pool/pools/base/${encodeURIComponent(
    uc(query.base || DEFAULT_BUY_SYMBOL)
  )}/${c}`;
};

const parseListings = (query, data, chain) => {
  let listings = [];

  if (query.mode === 'address') {
    const pool = data?.pool;
    (Array.isArray(pool?.inventories) ? pool.inventories : []).forEach((inv) => {
      listings.push(normalizeListing(pool, inv, chain));
    });
  } else if (query.mode === 'pair') {
    (Array.isArray(data?.pools) ? data.pools : []).forEach((pool) => {
      (Array.isArray(pool?.inventories) ? pool.inventories : []).forEach((inv) => {
        listings.push(normalizeListing(pool, inv, chain));
      });
    });
  } else {
    (Array.isArray(data?.pools) ? data.pools : []).forEach((entry) => {
      if (entry?.inventory) listings.push(normalizeListing(entry, entry.inventory, chain));
    });
  }

  return sortListings(dedupe(listings));
};

// persist = true  -> write the cache, then read it back (normal path)
// persist = false -> temporary / live data, never cached
export const fetchListings = async (chain, query, { signal, persist = true } = {}) => {
  const data = await swapRequest(queryUrl(chain, query), { signal });
  const listings = parseListings(query, data, chain);

  if (!persist) return { listings, at: Date.now() };

  writeListingsCache(chain, query, listings);
  return readListingsCache(chain, query);
};

// Uncached. Used only while the "Proceed to swap" card is open.
export const fetchLivePairListings = async (chain, baseSymbol, quoteSymbol, { signal } = {}) => {
  const result = await fetchListings(
    chain,
    { mode: 'pair', base: baseSymbol, quote: quoteSymbol },
    { signal, persist: false }
  );
  return result.listings;
};

/* ============================================================================
   POOL ADDRESS / SALVA NAME RESOLUTION
============================================================================ */

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export const classifyPoolInput = (input) => {
  const value = String(input ?? '').trim();
  if (!value) return 'empty';
  if (value.includes('@')) return 'name';
  if (value.toLowerCase().startsWith('0x')) return 'address';
  return 'invalid';
};

// Returns { address, label }.
export const resolvePoolTarget = async (input, { signal } = {}) => {
  const value = String(input ?? '').trim();
  const type = classifyPoolInput(value);

  if (type === 'address') {
    if (!ADDRESS_RE.test(value)) throw new Error('That is not a valid pool address');
    return { address: lc(value), label: value };
  }

  if (type === 'name') {
    // Same resolver SendTransferModal uses: one call, no registry lookup.
    let data;

    try {
      data = await swapRequest(`${SALVA_API_URL}/api/name/isAvail/${encodeURIComponent(value)}`, {
        signal,
      });
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      throw new Error(err?.message || 'Could not resolve this name.');
    }

    const address = String(data?.address || '').trim();

    if (!address) throw new Error(data?.errorMsg || 'Could not resolve this name.');
    if (address.toLowerCase() === ZERO_ADDRESS) {
      throw new Error('This name currently resolves to the zero address.');
    }
    if (!ADDRESS_RE.test(address)) {
      throw new Error('Resolver returned an invalid wallet address.');
    }

    return { address: lc(address), label: value };
  }

  throw new Error('Enter a 0x pool address or a name containing @');
};
