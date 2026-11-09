// src/pages/DeployPool.jsx
// v3.0.1 merchant pool dashboard.
// Cache-first UI, silent 60s polling, PIN-gated actions.
// Visual language: permissionless DeFi venue / market registry.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Database,
  Droplets,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  WalletCards,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';
import {
  POLL_INTERVAL_MS,
  clearPoolCache,
  fetchPoolSnapshot,
  formatDisplayNumber,
  poolHasBalance,
  readPoolCache,
  walletKey,
} from '../utils/walletCache';

const API = {
  poolFee: `${SALVA_API_URL}/api/user/estimate-deploy-pool-fee/`,
  deployPool: `${SALVA_API_URL}/api/pool/deploy-pool`,
  deletePool: `${SALVA_API_URL}/api/pool/delete-pool`,
};

const getUser = () => {
  try {
    const raw = localStorage.getItem('salva_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getChain = () =>
  String(localStorage.getItem('salva_chain') || 'base').trim().toLowerCase();

const money = (value, currency = '₦') => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${currency}${n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
};

const shortAddress = (value) =>
  value ? `${String(value).slice(0, 7)}…${String(value).slice(-5)}` : '—';

const parseResponse = async (response) => {
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid server response (${response.status})`);
  }

  if (!response.ok || data?.status === false || data?.success === false) {
    throw new Error(
      data?.errorMsg || data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
};

const verifyPin = async (email, pin) => {
  const response = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin }),
  });

  const data = await parseResponse(response);
  if (!data?.success) throw new Error('Invalid PIN');
  return pin;
};

const Modal = ({ children, onClose, danger = false, wide = false }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-2.5 sm:p-5">
    <motion.button
      aria-label="Close modal"
      className="absolute inset-0 bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    />
    <motion.div
      className={`relative w-full ${
        wide ? 'max-w-2xl' : 'max-w-md'
      } overflow-hidden rounded-[24px] border ${
        danger ? 'border-red-500/20' : 'border-white/[0.09]'
      } bg-[#0b0c10]/[.98] shadow-2xl`}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className={`h-px bg-gradient-to-r from-transparent ${danger ? 'via-red-500/60' : 'via-salvaGold/70'} to-transparent`} />
      {children}
    </motion.div>
  </div>
);

const TxStatusModal = ({ title, message, detail, onDone }) => (
  <Modal onClose={onDone}>
    <motion.div className="p-6 text-center sm:p-7" initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
      <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.08, type: 'spring', stiffness: 380, damping: 22 }} className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10">
        <ShieldCheck className="h-7 w-7 text-emerald-400" />
      </motion.div>
      <p className="mt-4 text-[8px] font-black uppercase tracking-[.32em] text-emerald-400/70">Transaction complete</p>
      <h3 className="mt-1.5 text-xl font-black tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-white/45">{message}</p>
      {detail && <p className="mt-2 text-[9px] font-bold text-white/20">{detail}</p>}
      <button onClick={onDone} className="mt-6 w-full rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black transition hover:brightness-110">Continue</button>
    </motion.div>
  </Modal>
);

const PinModal = ({ title, subtitle, loading, onCancel, onVerified }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (pin.length !== 4) return;
    setError('');
    try {
      await onVerified(pin);
    } catch (error) {
      setError(error?.message || 'PIN verification failed');
    }
  };

  return (
    <Modal onClose={() => !loading && onCancel()}>
      <div className="p-5 text-center sm:p-7">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-salvaGold/20 bg-salvaGold/10">
          <LockKeyhole className="h-5 w-5 text-salvaGold" />
        </div>
        <p className="text-[8px] font-black uppercase tracking-[.32em] text-salvaGold/65">Secure action</p>
        <h3 className="mt-1 text-lg font-black">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-white/40">{subtitle}</p>

        <input
          autoFocus
          value={pin}
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          onChange={(event) => {
            setError('');
            setPin(event.target.value.replace(/\D/g, ''));
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          className="mt-5 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-center text-2xl font-black tracking-[.65em] text-white outline-none transition focus:border-salvaGold/45"
        />

        {error && (
          <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-bold text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onCancel} disabled={loading} className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/60 transition hover:bg-white/5 disabled:opacity-40">
            Cancel
          </button>
          <button onClick={submit} disabled={loading || pin.length !== 4} className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black transition hover:brightness-110 disabled:opacity-40">
            {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Verify PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const FeeRow = ({ label, value, usd = false }) => (
  <div className="flex items-center justify-between border-b border-white/[0.05] py-2.5 last:border-0">
    <span className="text-[11px] font-bold text-white/35">{label}</span>
    <span className={`text-xs font-black ${usd ? 'text-emerald-400' : 'text-white'}`}>
      {usd ? `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}` : money(value)}
    </span>
  </div>
);

const PoolCard = ({ pool, onOpen, onDelete }) => {
  const count = Array.isArray(pool?.inventories) ? pool.inventories.length : 0;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group relative overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#101116]/80 transition hover:border-salvaGold/20 hover:bg-[#121319]"
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-44 w-44 rounded-full bg-salvaGold/[0.055] blur-3xl" />

      <div className="relative flex items-center gap-3 p-3.5 sm:p-5">
        <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10">
            <Droplets className="h-5 w-5 text-salvaGold" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[7px] font-black uppercase tracking-[.25em] text-white/25">Pool address</p>
            <h3 className="mt-0.5 truncate font-mono text-sm font-black text-white sm:text-base">
              {shortAddress(pool.poolAddress)}
            </h3>
            <p className="mt-1 text-[9px] font-black text-salvaGold">
              {count} {count === 1 ? 'inventory' : 'inventories'}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-white/25 transition group-hover:translate-x-0.5 group-hover:text-salvaGold" />
        </button>

        <button
          onClick={onDelete}
          title="Delete pool"
          className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 text-white/30 transition hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-400"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.article>
  );
};

const DeletePoolModal = ({ pool, onCancel, onDelete }) => {
  const funded = poolHasBalance(pool);

  return (
    <Modal danger onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-red-400/70">Destructive action</p>
          <h3 className="mt-1 text-lg font-black">Delete this pool?</h3>
          <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
            This removes the pool from the Salva registry. The on-chain contract is not automatically unwound.
          </p>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
          <p className="font-mono text-[10px] font-bold text-white/65">{shortAddress(pool.poolAddress)}</p>
          <p className="mt-0.5 text-[9px] text-white/30">{pool.inventories?.length || 0} market(s)</p>
        </div>

        {funded && (
          <div className="mt-2 rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-3">
            <p className="text-[10px] font-black text-yellow-400">Funds detected</p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-yellow-100/45">
              One or more inventories still contains assets. Withdraw them first if you intend to recover the funds.
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={onCancel} className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/60">Keep pool</button>
          <button onClick={onDelete} className="rounded-xl bg-red-500 py-3 text-xs font-black text-white transition hover:bg-red-400">Continue</button>
        </div>
      </div>
    </Modal>
  );
};

const PoolFeeConfirmModal = ({ fee, confirming, onCancel, onDeploy }) => (
  <Modal onClose={confirming ? undefined : onCancel}>
    <div className="p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10">
          <CircleDollarSign className="h-4 w-4 text-salvaGold" />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
            Final confirmation
          </p>
          <h3 className="text-lg font-black">Deploy pool</h3>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3">
        <FeeRow label="Deployment fee" value={fee?.feeNGN} />
        <FeeRow label="Approx. USD" value={fee?.feeUsd} usd />
      </div>

      <div className="mt-3 flex gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/5 p-3">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <p className="text-[9px] leading-relaxed text-emerald-100/50">
          PIN verification is complete. Your PIN is used only to authorize this transaction.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onCancel}
          disabled={confirming}
          className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/60"
        >
          Back
        </button>
        <button
          onClick={onDeploy}
          disabled={confirming}
          className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black disabled:opacity-40"
        >
          {confirming ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Deploy pool'}
        </button>
      </div>
    </div>
  </Modal>
);

const DeployPool = ({ user: suppliedUser, showMsg }) => {
  const navigate = useNavigate();
  const user = suppliedUser || getUser();
  const chain = getChain();
  const cached = readPoolCache(user?.email, chain);

  const [pools, setPools] = useState(cached?.pools || []);
  const [loading, setLoading] = useState(!cached);
  const [refreshing, setRefreshing] = useState(false);

  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [poolFee, setPoolFee] = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);
  const [poolPkey, setPoolPkey] = useState(null);
  const [poolConfirmOpen, setPoolConfirmOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [txResult, setTxResult] = useState(null);

  const [deletePool, setDeletePool] = useState(null);
  const [deletePinOpen, setDeletePinOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const mounted = useRef(true);
  const requestRef = useRef(null);

  const show = useCallback((message, type = 'info') => showMsg?.(message, type), [showMsg]);

  const readCacheIntoUI = useCallback(() => {
    const snapshot = readPoolCache(user?.email, chain);
    if (mounted.current && snapshot) setPools(snapshot.pools || []);
  }, [user?.email, chain]);

  const poll = useCallback(
    async ({ force = false } = {}) => {
      if (!user?.email || !user?.safeAddress) return;
      if (requestRef.current && !force) return;
      if (requestRef.current && force) requestRef.current.abort();

      const controller = new AbortController();
      requestRef.current = controller;
      if (force) setRefreshing(true);

      try {
        const snapshot = await fetchPoolSnapshot(user.email, user.safeAddress, chain, {
          signal: controller.signal,
        });
        if (mounted.current) setPools(snapshot?.pools || []);
      } catch (error) {
        if (error?.name !== 'AbortError') console.warn('[DeployPool] poll failed:', error?.message || error);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user?.email, user?.safeAddress, chain]
  );

  useEffect(() => {
    mounted.current = true;
    readCacheIntoUI();
    poll();

    const tick = () => {
      if (document.visibilityState === 'visible') poll();
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [poll, readCacheIntoUI]);

  const estimatePoolFee = async (pkey) => {
    setFeeLoading(true);
    try {
      const response = await fetch(API.poolFee, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safe: user.safeAddress, pin: pkey, chain }),
      });
      const data = await parseResponse(response);
      const feeNGN = data?.data?.feeNGN ?? data?.feeNGN;
      const feeUsd = data?.data?.feeUsd ?? data?.data?.feeUSD ?? data?.feeUsd ?? data?.feeUSD;
      if (feeNGN === undefined && feeUsd === undefined) throw new Error('Fee estimate was not returned by the server');
      setPoolFee({ feeNGN, feeUsd });
      return { feeNGN, feeUsd };
    } finally {
      setFeeLoading(false);
    }
  };

  const beginPoolDeploy = async (pin) => {
    setPinBusy(true);
    try {
      const pkey = await verifyPin(user.email, pin);
      setPoolPkey(pkey);
      await estimatePoolFee(pkey);
      setPinOpen(false);
      setPoolConfirmOpen(true);
    } finally {
      setPinBusy(false);
    }
  };

  const executePoolDeploy = async () => {
    if (!poolPkey) return;
    setDeploying(true);
    try {
      const response = await fetch(API.deployPool, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: poolPkey, chain }),
      });
      const data = await parseResponse(response);

      setPoolConfirmOpen(false);
      setPoolPkey(null);
      setTxResult({
        title: 'Pool deployed',
        message: 'Your new pool has been created successfully and is ready for inventory.',
        detail: data?.poolAddress ? shortAddress(data.poolAddress) : undefined,
        poolAddress: data?.poolAddress,
      });
    } catch (error) {
      show(error?.message || 'Pool deployment failed.', 'error');
    } finally {
      setDeploying(false);
    }
  };

  const beginDeletePool = () => {
    if (deletePool) setDeletePinOpen(true);
  };

  const executeDeletePool = async (pin) => {
    if (!deletePool) return;
    setDeleteBusy(true);
    try {
      const pkey = await verifyPin(user.email, pin);
      const response = await fetch(API.deletePool, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: pkey,
          poolAddress: deletePool.poolAddress,
          chain,
        }),
      });
      await parseResponse(response);

      setDeletePinOpen(false);
      setDeletePool(null);
      clearPoolCache(user.email, chain);
      setTxResult({ title: 'Pool deleted', message: 'The pool has been removed from the Salva registry successfully.' });
    } finally {
      setDeleteBusy(false);
    }
  };

  const totalInventories = useMemo(
    () => pools.reduce((total, pool) => total + Number(pool.inventoryCount ?? pool.inventories?.length ?? 0), 0),
    [pools]
  );

  return (
    <div className="relative min-h-[70vh] overflow-hidden text-white">
      <Stars />

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }} className="relative z-10 space-y-4 sm:space-y-6">
        <section className="relative overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0d0f14]/90 p-4 sm:rounded-[28px] sm:p-7">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(245,183,60,.08),transparent_32%)]" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.025] px-2.5 py-1">
                <Database className="h-3 w-3 text-salvaGold" />
                <span className="text-[7px] font-black uppercase tracking-[.25em] text-white/45">
                  P2P market registry
                </span>
              </div>
              <h1 className="text-[22px] font-black tracking-[-.04em] sm:text-4xl">
                Markets you control.
              </h1>
              <p className="mt-1.5 max-w-xl text-[10px] leading-relaxed text-white/35 sm:text-xs">
                Deploy an isolated pool, then publish your own inventory, price floor and liquidity.
                Traders interact directly with the market you configure.
              </p>
            </div>

            <button
              onClick={() => setPinOpen(true)}
              disabled={pinBusy || deploying}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-salvaGold px-4 text-[10px] font-black uppercase tracking-widest text-black shadow-lg shadow-salvaGold/10 transition hover:brightness-110 disabled:opacity-40 sm:h-11"
            >
              <Plus className="h-3.5 w-3.5" />
              Deploy pool
            </button>
          </div>

          <div className="relative mt-4 grid grid-cols-3 divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/25">
                Pools
              </p>
              <p className="mt-0.5 text-base font-black sm:text-lg">{pools.length}</p>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/25">
                Markets
              </p>
              <p className="mt-0.5 text-base font-black sm:text-lg">{totalInventories}</p>
            </div>
            <div className="px-3 py-2.5 sm:px-4 sm:py-3">
              <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/25">
                Chain
              </p>
              <p className="mt-0.5 text-base font-black capitalize sm:text-lg">{chain}</p>
            </div>
          </div>
        </section>

        <div className="flex items-end justify-between px-0.5">
          <div>
            <p className="text-[7px] font-black uppercase tracking-[.3em] text-white/25">
              Registry
            </p>
            <h2 className="mt-0.5 text-base font-black sm:text-lg">Active pools</h2>
          </div>
          <button
            onClick={() => poll({ force: true })}
            disabled={refreshing}
            className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 text-white/35 transition hover:text-white disabled:opacity-40"
            title="Refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="grid gap-2.5">
            {[0, 1].map((item) => (
              <div
                key={item}
                className="h-44 animate-pulse rounded-[20px] border border-white/[0.05] bg-white/[0.02]"
              />
            ))}
          </div>
        ) : pools.length === 0 ? (
          <div className="rounded-[22px] border border-dashed border-white/[0.09] bg-white/[0.012] px-5 py-14 text-center sm:py-16">
            <WalletCards className="mx-auto h-8 w-8 text-white/15" />
            <h3 className="mt-3 text-sm font-black">No markets deployed</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-[10px] leading-relaxed text-white/30">
              Your first pool becomes a dedicated permissionless venue for the inventories you
              publish.
            </p>
            <button
              onClick={() => setPinOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-salvaGold px-3.5 py-2 text-[10px] font-black text-black"
            >
              Deploy first pool <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="grid gap-2.5">
            <AnimatePresence initial={false}>
              {pools.map((pool) => (
                <PoolCard
                  key={walletKey(pool.poolAddress, chain)}
                  pool={pool}
                  onOpen={() =>
                    navigate(
                      `/pools/${encodeURIComponent(user.safeAddress)}/${encodeURIComponent(
                        chain
                      )}/${encodeURIComponent(pool.poolAddress)}`
                    )
                  }
                  onDelete={() => setDeletePool(pool)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {pinOpen && (
          <PinModal
            title="Authorize pool deployment"
            subtitle="Enter your 4-digit transaction PIN."
            loading={pinBusy || feeLoading}
            onCancel={() => setPinOpen(false)}
            onVerified={beginPoolDeploy}
          />
        )}

        {poolConfirmOpen && (
          <PoolFeeConfirmModal
            fee={poolFee}
            confirming={deploying}
            onCancel={() => {
              setPoolConfirmOpen(false);
              setPoolPkey(null);
            }}
            onDeploy={executePoolDeploy}
          />
        )}

        {deletePool && !deletePinOpen && (
          <DeletePoolModal
            pool={deletePool}
            onCancel={() => setDeletePool(null)}
            onDelete={beginDeletePool}
          />
        )}

        {deletePool && deletePinOpen && (
          <PinModal
            title="Authorize pool deletion"
            subtitle="Your PIN is required to sign the pool deletion request."
            loading={deleteBusy}
            onCancel={() => setDeletePinOpen(false)}
            onVerified={executeDeletePool}
          />
        )}

        {txResult && (
          <TxStatusModal
            title={txResult.title}
            message={txResult.message}
            detail={txResult.detail}
            onDone={async () => {
              setTxResult(null);
              await poll({ force: true });
              if (txResult.poolAddress) {
                navigate(`/pools/${encodeURIComponent(user.safeAddress)}/${encodeURIComponent(chain)}/${encodeURIComponent(txResult.poolAddress)}`, { replace: true });
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default DeployPool;
