// utils/snsCache.js
// Cache for the SNS page (namespaces + linked names).
// The UI only ever READS from this cache. Network polling writes to it.
import { SALVA_API_URL } from '../config';

export const SNS_POLL_INTERVAL_MS = 20000;

const SNS_CACHE_VERSION = 1;
const SNS_CACHE_PREFIX = 'salva_sns_cache:';
const MEM = new Map();

const norm = (v) =>
  String(v || '')
    .toLowerCase()
    .trim();

export const snsKey = (email, chain) => `${norm(email)}:${norm(chain)}`;

const storageKey = (email, chain) =>
  `${SNS_CACHE_PREFIX}${SNS_CACHE_VERSION}:${encodeURIComponent(snsKey(email, chain))}`;

const normalizeSnapshot = (value) => ({
  namespaces: (Array.isArray(value?.namespaces) ? value.namespaces : [])
    .filter((n) => n && n.namespace)
    .map((n) => ({ namespace: String(n.namespace) })),
  nameAliases: (Array.isArray(value?.nameAliases) ? value.nameAliases : [])
    .filter((a) => a && a.name && a.wallet)
    .map((a) => ({ name: String(a.name), wallet: String(a.wallet) })),
});

export const readSnsCache = (email, chain) => {
  if (!email || !chain) return null;
  const key = snsKey(email, chain);
  try {
    const raw = localStorage.getItem(storageKey(email, chain));
    if (!raw) return MEM.get(key) || null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return MEM.get(key) || null;
    const snapshot = { ...normalizeSnapshot(parsed), at: Number(parsed.at) || 0 };
    MEM.set(key, snapshot);
    return snapshot;
  } catch {
    return MEM.get(key) || null;
  }
};

export const writeSnsCache = (email, chain, value) => {
  if (!email || !chain) return null;
  const snapshot = { ...normalizeSnapshot(value), at: Date.now(), chain: norm(chain) };
  MEM.set(snsKey(email, chain), snapshot);
  try {
    localStorage.setItem(storageKey(email, chain), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('[snsCache] write failed:', error?.message || error);
  }
  return snapshot;
};

export const clearSnsCache = (email, chain) => {
  MEM.delete(snsKey(email, chain));
  try {
    localStorage.removeItem(storageKey(email, chain));
  } catch {}
};

// Network -> cache. Throws on any failure and NEVER overwrites the cache with empty data
// when the request fails, so a bad poll can't wipe what the user already sees.
export const fetchSnsSnapshot = async (email, chain, { signal } = {}) => {
  const normalizedChain = norm(chain);

  const res = await fetch(
    `${SALVA_API_URL}/api/user/${encodeURIComponent(email)}/${encodeURIComponent(normalizedChain)}`,
    { signal, headers: { Accept: 'application/json' } }
  );

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON response (${res.status})`);
  }

  if (!res.ok || data?.status === false) {
    throw new Error(data?.errorMsg || data?.message || `Request failed (${res.status})`);
  }

  const payload = data?.data ?? data;
  const meta = payload?.meta;

  // The page used to read meta.*; the wallet payload also carries the same lists.
  const namespaces = meta?.namespaces ?? payload?.namespaces;
  const nameAliases = meta?.nameAliases ?? payload?.nameAliases;

  if (!Array.isArray(namespaces) && !Array.isArray(nameAliases)) {
    throw new Error('SNS data missing from response');
  }

  return writeSnsCache(email, normalizedChain, { namespaces, nameAliases });
};