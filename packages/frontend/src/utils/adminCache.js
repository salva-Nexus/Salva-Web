// src/utils/adminCache.js
// Admin panel cache. The UI reads only from here; a silent poll refreshes it.

import { SALVA_API_URL } from '../config';

export const ADMIN_POLL_INTERVAL_MS = 120000;
export const NGN_ORACLE_KEY = 'ngn-oracle-update';

const CACHE_VERSION = 'v1';

const PROPOSAL_FIELDS = [
  'registryProposals',
  'validatorProposals',
  'upgradeProposals',
  'signerUpdateProposals',
  'implUpdateProposals',
  'unpauseProposals',
];

export const emptyProposals = () => Object.fromEntries(PROPOSAL_FIELDS.map((f) => [f, []]));

export const normalizeProposals = (data) => {
  const out = emptyProposals();
  PROPOSAL_FIELDS.forEach((field) => {
    out[field] = Array.isArray(data?.[field]) ? data[field] : [];
  });
  return out;
};

const cacheKey = (owner) =>
  `salva_admin_cache_${CACHE_VERSION}:${String(owner || '')
    .trim()
    .toLowerCase()}`;

export const readAdminCache = (owner) => {
  try {
    const raw = localStorage.getItem(cacheKey(owner));
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    const proposals = parsed.proposals ? normalizeProposals(parsed.proposals) : null;
    const oracle =
      parsed.oracle && typeof parsed.oracle.paused === 'boolean' ? parsed.oracle : null;

    if (!proposals && !oracle) return null;
    return { at: parsed.at || null, proposals, oracle };
  } catch {
    return null;
  }
};

export const writeAdminCache = (owner, patch) => {
  const current = readAdminCache(owner) || {};
  const next = { ...current, ...patch, at: Date.now() };
  try {
    localStorage.setItem(cacheKey(owner), JSON.stringify(next));
  } catch {
    // storage full or blocked; the next poll will retry
  }
  return next;
};

export const clearAdminCache = (owner) => {
  try {
    localStorage.removeItem(cacheKey(owner));
  } catch {
    // ignore
  }
};

const getJson = async (url, signal) => {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  const text = await res.text();

  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid server response (${res.status})`);
  }

  if (!res.ok) throw new Error(data?.message || data?.errorMsg || `Server error: ${res.status}`);
  return data;
};

// Network -> cache. Returns { snapshot, error }.
// Throws only when every request failed (or the request was aborted).
export const fetchAdminSnapshot = async (owner, { signal } = {}) => {
  const [proposalsRes, oracleRes] = await Promise.allSettled([
    getJson(`${SALVA_API_URL}/api/admin/proposals`, signal),
    getJson(
      `${SALVA_API_URL}/api/admin/update-control/${encodeURIComponent(NGN_ORACLE_KEY)}`,
      signal
    ),
  ]);

  if (signal?.aborted) {
    const abortError = new Error('Aborted');
    abortError.name = 'AbortError';
    throw abortError;
  }

  const patch = {};
  const errors = [];

  if (proposalsRes.status === 'fulfilled') {
    patch.proposals = normalizeProposals(proposalsRes.value);
  } else {
    errors.push(proposalsRes.reason);
  }

  if (oracleRes.status === 'fulfilled') {
    const state = oracleRes.value?.state;
    if (state === 'paused' || state === 'active') {
      patch.oracle = { paused: state === 'paused', at: Date.now() };
    } else {
      errors.push(new Error('Unexpected oracle status response'));
    }
  } else {
    errors.push(oracleRes.reason);
  }

  if (Object.keys(patch).length === 0) {
    throw errors[0] || new Error('Failed to load admin data');
  }

  const snapshot = writeAdminCache(owner, patch);
  return { snapshot, error: errors[0]?.message || null };
};

// Oracle-only snapshot (used by AdminStatsPage). Network -> cache.
export const fetchOracleStatus = async (owner, { signal } = {}) => {
  const data = await getJson(
    `${SALVA_API_URL}/api/admin/update-control/${encodeURIComponent(NGN_ORACLE_KEY)}`,
    signal
  );
  const state = data?.state;
  if (state !== 'paused' && state !== 'active') {
    throw new Error('Unexpected oracle status response');
  }
  return writeAdminCache(owner, { oracle: { paused: state === 'paused', at: Date.now() } });
};
