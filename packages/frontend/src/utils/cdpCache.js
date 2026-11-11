/* global BigInt */

import { SALVA_API_URL } from '../config';
import { readWalletCache } from './walletCache';

export const CDP_POLL_INTERVAL_MS = 20000;

const CDP_CACHE_VERSION = 2;
const CDP_CACHE_PREFIX = 'salva_cdp_cache:';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const MEM = new Map();

const norm = (v) => String(v || '').toLowerCase().trim();

export const cdpKey = (email, chain) => `${norm(email)}:${norm(chain)}`;

const storageKey = (email, chain) =>
  `${CDP_CACHE_PREFIX}${CDP_CACHE_VERSION}:${encodeURIComponent(cdpKey(email, chain))}`;

export const formatUnits = (raw, decimals = 18) => {
  try {
    const v = BigInt(raw ?? 0);
    const neg = v < 0n;
    const abs = neg ? -v : v;
    const base = 10n ** BigInt(decimals);
    const int = abs / base;
    const frac = (abs % base).toString().padStart(decimals, '0').replace(/0+$/, '');
    return `${neg ? '-' : ''}${int}${frac ? `.${frac}` : ''}`;
  } catch {
    return '0';
  }
};

const isPositiveRaw = (raw) => {
  try {
    return BigInt(raw ?? 0) > 0n;
  } catch {
    return false;
  }
};

const request = async (path, { method = 'GET', body, signal, allowFalse = false } = {}) => {
  const res = await fetch(`${SALVA_API_URL}${path}`, {
    method,
    signal,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON response (${res.status})`);
  }
  if (!res.ok || (data?.status === false && !allowFalse)) {
    throw new Error(data?.errorMsg || data?.message || `Request failed (${res.status})`);
  }
  return data;
};

const resolveDecimals = async (token, chain, email, known, signal) => {
  const addr = norm(token.tokenAddress);
  if (addr === ZERO_ADDRESS) return 18;
  if (Number.isFinite(known[addr])) return known[addr];

  const walletAsset = readWalletCache(email, chain)?.assets?.find(
    (a) => norm(a.contractAddress) === addr || a.symbol === String(token.symbol).toUpperCase()
  );
  if (walletAsset && Number.isFinite(Number(walletAsset.decimals))) {
    return Number(walletAsset.decimals);
  }

  const data = await request(
    `/api/user/token-details/${encodeURIComponent(chain)}/${encodeURIComponent(token.tokenAddress)}`,
    { signal }
  );
  return Number(data?.data?.decimals) || 18;
};

const fetchVault = async (manager, token, safe, chain, decimals, signal) => {
  const base = {
    safe,
    collateralTokenSymbol: token.symbol,
    chain,
    version: manager.version,
  };

  const cfg = (await request('/api/cdp/user-config', { method: 'POST', body: base, signal })).data;
  const ratioBps = Number(cfg.customCollateralRatio) || 0;
  const hasCollateral = isPositiveRaw(cfg.collateralDeposited);
  const hasDebt = isPositiveRaw(cfg.mintedNgns);
  const collateral = formatUnits(cfg.collateralDeposited, decimals);
  const debt = formatUnits(cfg.mintedNgns, 18);

  const soft = (p) => (p ? p.catch(() => null) : Promise.resolve(null));

  const [health, withdrawable, value] = await Promise.all([
    soft(
      hasDebt
        ? request('/api/cdp/position-health', {
            method: 'POST',
            body: { ...base, debtAmount: 0 },
            signal,
          })
        : null
    ),
    soft(
      hasCollateral && hasDebt
        ? request('/api/cdp/withdrawable', {
            method: 'POST',
            body: base,
            signal,
            allowFalse: true,
          })
        : null
    ),
    soft(
      hasCollateral
        ? request('/api/cdp/ngn-value', {
            method: 'POST',
            body: {
              collateralTokenSymbol: token.symbol,
              amount: collateral,
              chain,
              version: manager.version,
            },
            signal,
            allowFalse: true,
          })
        : null
    ),
  ]);

  return {
    decimals,
    registered: ratioBps > 0,
    ratioBps,
    collateral,
    debt,
    health: health?.data?.healthBps ?? null,
    withdrawable: hasDebt ? withdrawable?.data?.withdrawable ?? null : collateral,
    collateralNgn: value?.data?.ngnValue ?? (hasCollateral ? null : '0'),
    oracleStale: Boolean(
      (hasCollateral && (!value || value.status === false)) ||
        (hasCollateral && hasDebt && (!withdrawable || withdrawable.status === false))
    ),
  };
};

export const readCdpCache = (email, chain) => {
  if (!email || !chain) return null;
  const key = cdpKey(email, chain);
  try {
    const raw = localStorage.getItem(storageKey(email, chain));
    if (!raw) return MEM.get(key) || null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return MEM.get(key) || null;
    MEM.set(key, parsed);
    return parsed;
  } catch {
    return MEM.get(key) || null;
  }
};

export const writeCdpCache = (email, chain, value) => {
  if (!email || !chain) return null;
  const snapshot = { ...value, at: Date.now(), chain: norm(chain) };
  MEM.set(cdpKey(email, chain), snapshot);
  try {
    localStorage.setItem(storageKey(email, chain), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[cdpCache] write failed:', error?.message || error);
  }
  return snapshot;
};

export const clearCdpCache = (email, chain) => {
  MEM.delete(cdpKey(email, chain));
  try {
    localStorage.removeItem(storageKey(email, chain));
  } catch {}
};

export const fetchCdpSnapshot = async (email, safe, chain, { signal } = {}) => {
  const normalizedChain = norm(chain);
  const prev = readCdpCache(email, normalizedChain);

  const managersRes = await request('/api/cdp/managers', {
    method: 'POST',
    body: { chain: normalizedChain },
    signal,
  });

  const managers = (Array.isArray(managersRes?.data) ? managersRes.data : []).map((m) => ({
    version: m.version,
    contractAddress: m.contractAddress,
    chain: m.chain,
    type: m.type,
    whitelistedTokens: (m.whitelistedTokens || []).map((t) => ({
      symbol: String(t.symbol || '').toUpperCase(),
      tokenAddress: t.tokenAddress,
      priceFeed: t.priceFeed,
    })),
  }));

  const decimalsMap = { ...(prev?.decimals || {}) };
  const positions = {};
  const tasks = [];

  managers.forEach((manager) => {
    positions[manager.version] = {};
    manager.whitelistedTokens.forEach((token) => {
      tasks.push(
        (async () => {
          try {
            const decimals = await resolveDecimals(token, normalizedChain, email, decimalsMap, signal);
            decimalsMap[norm(token.tokenAddress)] = decimals;
            positions[manager.version][token.symbol] = await fetchVault(
              manager,
              { ...token, symbol: token.symbol },
              safe,
              normalizedChain,
              decimals,
              signal
            );
          } catch (error) {
            if (error?.name === 'AbortError') throw error;
            const old = prev?.positions?.[manager.version]?.[token.symbol];
            if (old) positions[manager.version][token.symbol] = { ...old, stale: true };
          }
        })()
      );
    });
  });

  await Promise.all(tasks);

  return writeCdpCache(email, normalizedChain, { managers, positions, decimals: decimalsMap });
};