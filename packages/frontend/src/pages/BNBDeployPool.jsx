// src/pages/BNBDeployPool.jsx  (BNB Chain / AA)
// Mirror of DeployPool.jsx adapted for BNB Chain:
//   - Fetches from /api/pool/l1/my/:address
//   - Deploys via /api/pool/deploy (same relay — L2 factory, but ownerSafeAddress is the BNB Safe)
//   - Subscribes via /api/pool/subscribe (same NGNs payment relay)
//   - Deletes via /api/pool/delete-direct (L1 DB, no on-chain relay)
//   - PIN verified via /api/bnb/verify-pin
//   - No NetworkReminder, no "Go to BSC/L1" crosslinks
//   - Blue accent throughout

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import NetworkReminder, { useNetworkReminder } from '../components/NetworkReminder';

const darkInput =
  'w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none font-bold text-sm text-white placeholder:text-white/60 transition-all';

const toNum = (v) => parseFloat(v || 0) || 0;

const smartFmt = (n) => {
  const num = toNum(n);
  if (isNaN(num)) return '0';
  const str = num.toString();
  if (!str.includes('.')) return num.toLocaleString('en-US');
  const decimals = str.split('.')[1].replace(/0+$/, '').length;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const compactFmt = (n) => {
  const num = toNum(n);
  if (num >= 1_000_000)
    return (num / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
  if (num >= 100_000)
    return (num / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  if (num >= 10_000)
    return (num / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'K';
  if (num === Math.floor(num)) return num.toLocaleString('en-US');
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

// ─── PIN Modal ────────────────────────────────────────────────────────────────
const PinModal = ({ title, subtitle, onConfirm, onCancel, loading }) => {
  const [pin, setPin] = useState('');
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => !loading && onCancel()}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h3 className="text-xl font-black mb-1 text-white">{title}</h3>
          <p className="text-xs text-white/60 mb-6 leading-relaxed">{subtitle}</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-center text-3xl tracking-[1em] font-black mb-6 text-white transition-all"
          />
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-3.5 rounded-2xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(pin)}
              disabled={loading || pin.length !== 4}
              className="flex-1 py-3.5 rounded-2xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
            >
              {loading && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Subscription Badge ───────────────────────────────────────────────────────
const SubBadge = ({ pool }) => {
  const now = new Date();
  const expiry = pool.subscriptionExpiresAt ? new Date(pool.subscriptionExpiresAt) : null;
  const active = expiry && expiry > now;
  const msLeft = active ? expiry - now : 0;
  const mins = Math.ceil(msLeft / 60_000);
  const hours = Math.ceil(msLeft / 3_600_000);
  const days = Math.ceil(msLeft / 864e5);
  const timeLabel = mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;

  // Paused always shows regardless of subscription state
  if (pool.isPaused)
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
        {active ? `Paused · ${timeLabel} left` : 'Paused'}
      </span>
    );

  if (!active)
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-white/10 bg-white/5 text-white/60">
        Unpublished
      </span>
    );

  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-green-500/30 bg-green-500/10 text-green-400">
      Live · {timeLabel} left
    </span>
  );
};

const StatCell = ({ label, value, color }) => (
  <div className="px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between gap-2 min-w-0">
    <p className="text-[10px] uppercase tracking-wide text-white/50 font-black flex-shrink-0">
      {label}
    </p>
    <p
      className="font-black text-sm tabular-nums flex-shrink-0"
      style={{ color }}
      title={smartFmt(value)}
    >
      {compactFmt(value)}
    </p>
  </div>
);

const SectionTabs = ({ active, onChange }) => (
  <div className="flex gap-1.5">
    {['liquidity', 'rates', 'controls'].map((s) => (
      <button
        key={s}
        onClick={() => onChange(s)}
        className={`flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${active === s ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'bg-white/5 border border-white/[0.06] text-white/60 hover:text-white/60'}`}
      >
        {s}
      </button>
    ))}
  </div>
);

// ─── Registry Dropdown ────────────────────────────────────────────────────────
const RegistryDropdown = ({
  registries,
  value,
  onChange,
  placeholder = 'Search wallet service…',
}) => {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  const filtered = registries.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.nspace || '').toLowerCase().includes(query.toLowerCase())
  );

  React.useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          if (!value) {
            setOpen(true);
            setQuery('');
            setTimeout(() => inputRef.current?.focus(), 50);
          }
        }}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
          open
            ? 'border-blue-500 bg-blue-500/5 ring-1 ring-blue-500/30'
            : value
              ? 'border-blue-500/40 bg-blue-500/5'
              : 'border-white/10 bg-white/5 hover:border-blue-500/40'
        }`}
      >
        {value ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 text-xs font-black">
                {value.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm truncate text-white">{value.name}</p>
              <p className="text-[10px] text-white/60 font-mono truncate">{value.nspace}</p>
            </div>
          </div>
        ) : (
          <span className="text-sm text-white/60 font-bold">{placeholder}</span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setQuery('');
              }}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            >
              <span className="text-[10px] text-red-400 font-black">✕</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setQuery('');
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-5 h-5 flex items-center justify-center"
          >
            <svg
              className={`w-3 h-3 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] bottom-full mb-2 w-full bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="p-3 border-b border-white/[0.05]">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                <svg
                  className="w-3.5 h-3.5 text-white/60 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" strokeWidth="2.5" />
                  <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search…"
                  className="flex-1 bg-transparent outline-none text-xs font-bold placeholder:text-white/60 text-white"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-white/60 hover:text-white/80 text-[10px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div className="px-4 py-5 text-center text-xs text-white/60 font-bold">
                  No services found
                </div>
              ) : (
                filtered.map((reg) => (
                  <button
                    key={reg.registryAddress}
                    type="button"
                    onClick={() => {
                      onChange(reg);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors text-left ${value?.registryAddress === reg.registryAddress ? 'bg-blue-500/10' : ''}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 text-xs font-black">
                        {reg.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm text-white">{reg.name}</p>
                      <p className="text-[10px] font-mono text-white/60">{reg.nspace}</p>
                    </div>
                    {value?.registryAddress === reg.registryAddress && (
                      <span className="text-blue-400 text-sm">✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Pool Manage Panel ────────────────────────────────────────────────────────
const PoolManagePanel = ({ pool, user, showMsg, onClose, onRefresh }) => {
  const [activeSection, setActiveSection] = useState('liquidity');
  const [panelFee, setPanelFee] = useState({ feeNGN: null, feeUSD: null, loading: true });
  const panelFeeCache = useRef({});
  useEffect(() => {
    const key = 'bnb_pool';
    const cached = panelFeeCache.current[key];
    if (cached && Date.now() - cached.at < 30_000) { setPanelFee({ ...cached.data, loading: false }); return; }
    setPanelFee((p) => ({ ...p, loading: true }));
    fetch(`${SALVA_API_URL}/api/estimate-pool-fee?chain=bnb`)
      .then((r) => r.json())
      .then((d) => { const fee = { feeNGN: d.feeNGN, feeUSD: d.feeUSD, loading: false }; panelFeeCache.current[key] = { data: fee, at: Date.now() }; setPanelFee(fee); })
      .catch(() => setPanelFee({ feeNGN: null, feeUSD: null, loading: false }));
  }, []);
  const [liqAsset, setLiqAsset] = useState('NGNS');
  const [liqAmount, setLiqAmount] = useState('');
  const [liqMode, setLiqMode] = useState('provide');
  const [buyRate, setBuyRate] = useState(toNum(pool.buyRate).toString());
  const [sellRate, setSellRate] = useState(toNum(pool.sellRate).toString());
  const [minNgn, setMinNgn] = useState('');
  const [minToken, setMinToken] = useState('');
  const [pinVisible, setPinVisible] = useState(false);
  const [pinAction, setPinAction] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);
  const assets = ['NGNS', 'CNGN', 'USDT', 'USDC'];

  const rawBalanceForAsset = (asset) => {
    if (asset === 'NGNS') return toNum(pool.ngnsLiquidity);
    if (asset === 'CNGN') return toNum(pool.cNgnLiquidity);
    if (asset === 'USDT') return toNum(pool.usdtLiquidity);
    if (asset === 'USDC') return toNum(pool.usdcLiquidity);
    return 0;
  };

  const verifyPin = async (pin) => {
    setPinLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/bnb/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg('Invalid PIN', 'error');
        return;
      }
      setPinVisible(false);
      if (pinAction === 'provide') await executeProvideLiquidity(data.privateKey);
      else if (pinAction === 'remove') await executeRemoveLiquidity(data.privateKey);
      else if (pinAction === 'buyRate') await executeUpdateBuyRate(data.privateKey);
      else if (pinAction === 'sellRate') await executeUpdateSellRate(data.privateKey);
      else if (pinAction === 'pause') await executeTogglePause(data.privateKey, true);
      else if (pinAction === 'unpause') await executeTogglePause(data.privateKey, false);
      else if (pinAction === 'minNgn') await executeSetMinNgn(data.privateKey);
      else if (pinAction === 'minToken') await executeSetMinToken(data.privateKey);
    } catch {
      showMsg('Network error. Please try again.', 'error');
      setPinVisible(false);
    } finally {
      setPinLoading(false);
    }
  };

  const executeProvideLiquidity = async (privateKey) => {
    if (!liqAmount || parseFloat(liqAmount) <= 0) return;
    setTxLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150_000);
      let res;
      try {
        res = await fetch(`${SALVA_API_URL}/api/pool/l1/provide-liquidity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ownerSafeAddress: user.safeAddress,
            ownerPrivateKey: privateKey,
            poolAddress: pool.poolAddress,
            asset: liqAsset,
            amount: liqAmount,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg(`${liqAmount} ${liqAsset} sent to pool!`);
      setLiqAmount('');
      onRefresh();
    } catch (err) {
      if (err.name === 'AbortError') {
        showMsg('Transaction timed out — check your BNB wallet has gas, then retry', 'error');
      } else {
        showMsg(err.message || 'Provide liquidity failed', 'error');
      }
    } finally {
      setTxLoading(false);
    }
  };

  const executeRemoveLiquidity = async (privateKey) => {
    if (!liqAmount || parseFloat(liqAmount) <= 0) return;
    setTxLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 150_000); // 2.5 min max
      let res;
      try {
        res = await fetch(`${SALVA_API_URL}/api/pool/l1/remove-liquidity`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            ownerSafeAddress: user.safeAddress,
            ownerPrivateKey: privateKey,
            poolAddress: pool.poolAddress,
            asset: liqAsset,
            amount: liqAmount,
          }),
        });
      } finally {
        clearTimeout(timeout);
      }
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg(`${liqAmount} ${liqAsset} withdrawn!`);
      setLiqAmount('');
      onRefresh();
    } catch (err) {
      if (err.name === 'AbortError') {
        showMsg('Transaction timed out — check your BNB wallet has gas, then retry', 'error');
      } else {
        showMsg(err.message || 'Remove liquidity failed', 'error');
      }
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateBuyRate = async (privateKey) => {
    if (!buyRate) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/update-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          buyRate,
          sellRate: undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg('Buy rate updated!');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateSellRate = async (privateKey) => {
    if (!sellRate) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/update-rates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          buyRate: undefined,
          sellRate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg('Sell rate updated!');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeTogglePause = async (privateKey, pause) => {
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/toggle-pause`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          pause,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg(pause ? 'Pool paused.' : 'Pool unpaused.');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeSetMinNgn = async (privateKey) => {
    if (!minNgn || parseFloat(minNgn) < 0) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/set-mins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          minNgnAmount: minNgn,
          minTokenAmount: undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg('Min NGN updated!');
      setMinNgn('');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeSetMinToken = async (privateKey) => {
    if (!minToken || parseFloat(minToken) < 0) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/set-mins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          minNgnAmount: undefined,
          minTokenAmount: minToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg('Min USD amount updated!');
      setMinToken('');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const triggerPin = (action) => {
    setPinAction(action);
    setPinVisible(true);
  };
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />

        <div className="px-4 pt-3 pb-3 border-b border-white/[0.05]">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.35em] text-blue-400/60 font-black mb-0.5">
                Manage Pool · BNB Chain
              </p>
              <p className="font-black text-sm text-white truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <p className="font-mono text-[9px] text-white/40 truncate mt-0.5">
                {pool.poolAddress}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0 mt-1"
            >
              ✕
            </button>
          </div>
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.05]">
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[9px] uppercase tracking-widest text-blue-400/60 font-black">
                NGN Total
              </span>
              <span className="font-black text-sm text-blue-400 tabular-nums">
                {compactFmt(totalNgn)}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2">
              <span className="text-[9px] uppercase tracking-widest text-green-400/60 font-black">
                USD Total
              </span>
              <span className="font-black text-sm text-green-400 tabular-nums">
                {compactFmt(totalUsd)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-4 py-2 border-b border-white/[0.05]">
          <SectionTabs active={activeSection} onChange={setActiveSection} />
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {activeSection === 'liquidity' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                {['provide', 'remove'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setLiqMode(m)}
                    className={`flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all ${liqMode === m ? (m === 'provide' ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20' : 'bg-red-500/10 border-red-500/30 text-red-400') : 'border-white/10 bg-white/5 text-white/60 hover:text-white/50'}`}
                  >
                    {m === 'provide' ? '↑ Add Liquidity' : '↓ Remove Liquidity'}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                  Token
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {assets.map((a) => {
                    const raw = rawBalanceForAsset(a);
                    return (
                      <button
                        key={a}
                        onClick={() => {
                          setLiqAsset(a);
                          setLiqAmount('');
                        }}
                        className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${
                          liqAsset === a
                            ? 'bg-blue-500/10 border-blue-500/40'
                            : 'border-white/[0.06] bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <span
                          className={`text-xs font-black uppercase ${liqAsset === a ? 'text-blue-400' : 'text-white/60'}`}
                        >
                          {a}
                        </span>
                        <span
                          className="text-xs font-black text-white/80 tabular-nums"
                          title={smartFmt(raw)}
                        >
                          {compactFmt(raw)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Amount
                  </label>
                  {liqMode === 'remove' && (
                    <button
                      type="button"
                      onClick={() => setLiqAmount(String(rawBalanceForAsset(liqAsset)))}
                      className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:opacity-80 transition-opacity px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={liqAmount}
                    onChange={(e) => setLiqAmount(e.target.value)}
                    className={`${darkInput} text-base pr-16`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400 font-black text-sm">
                    {liqAsset}
                  </span>
                </div>
              </div>

              <div className="mb-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] flex justify-between items-center text-[10px]">
                <span className="uppercase tracking-widest text-white/60 font-black">
                  Network Fee
                </span>
                {panelFee.loading ? (
                  <span className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                ) : panelFee.feeNGN !== null ? (
                  <span className="text-red-400 font-black">₦{panelFee.feeNGN.toFixed(2)}</span>
                ) : (
                  <span className="text-white/30">—</span>
                )}
              </div>

              <button
                onClick={() => triggerPin(liqMode)}
                disabled={!liqAmount || parseFloat(liqAmount) <= 0 || txLoading}
                className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg ${liqMode === 'provide' ? 'bg-blue-500 text-white shadow-blue-500/20' : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white'}`}
              >
                {txLoading && (
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                )}
                {txLoading
                  ? 'Processing…'
                  : liqMode === 'provide'
                    ? `Add ${liqAsset}`
                    : `Remove ${liqAsset}`}
              </button>
            </motion.div>
          )}

          {activeSection === 'rates' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Rates in <span className="font-black text-blue-400">NGN per USD</span>. Each rate
                  saves as a separate on-chain transaction.
                </p>
              </div>
              <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-black text-green-400">Buy Rate</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      Current: ₦{toNum(pool.buyRate).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 1490"
                      value={buyRate}
                      onChange={(e) => setBuyRate(e.target.value)}
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-green-400 outline-none text-base font-black text-white transition-all pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-green-400 font-black text-sm">
                      NGN
                    </span>
                  </div>
                  <button
                    onClick={() => triggerPin('buyRate')}
                    disabled={txLoading || buyRate === ''}
                    className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500 hover:text-black hover:border-green-500"
                  >
                    {txLoading && pinAction === 'buyRate' && (
                      <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Buy Rate On-Chain
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-black text-blue-400">Sell Rate</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      Current: ₦{toNum(pool.sellRate).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 1530"
                      value={sellRate}
                      onChange={(e) => setSellRate(e.target.value)}
                      className="w-full p-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 outline-none text-base font-black text-white transition-all pr-14"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400 font-black text-sm">
                      NGN
                    </span>
                  </div>
                  <button
                    onClick={() => triggerPin('sellRate')}
                    disabled={txLoading || sellRate === ''}
                    className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500 hover:text-white hover:border-blue-500"
                  >
                    {txLoading && pinAction === 'sellRate' && (
                      <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Sell Rate On-Chain
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {activeSection === 'controls' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                <p className="text-xs font-black text-yellow-400 mb-0.5">Emergency Controls</p>
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Pausing stops all swaps. Liquidity is safe — only you can unpause.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => triggerPin('pause')}
                  disabled={txLoading}
                  className="py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-black text-[10px] uppercase tracking-widest hover:bg-yellow-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={() => triggerPin('unpause')}
                  disabled={txLoading}
                  className="py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 font-black text-[10px] uppercase tracking-widest hover:bg-green-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ▶ Unpause
                </button>
              </div>
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-black text-blue-400">Min NGN Per Swap</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      Current:{' '}
                      {toNum(pool.minNgnAmount) > 0
                        ? `${toNum(pool.minNgnAmount).toLocaleString('en-US', { maximumFractionDigits: 2 })} NGN`
                        : 'Not set'}
                    </p>
                  </div>
                  <input
                    type="number"
                    placeholder={`e.g. ${toNum(pool.minNgnAmount).toLocaleString()}`}
                    value={minNgn}
                    onChange={(e) => setMinNgn(e.target.value)}
                    className={darkInput}
                  />
                  <button
                    onClick={() => triggerPin('minNgn')}
                    disabled={txLoading || !minNgn}
                    className="w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400 font-black text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {txLoading && pinAction === 'minNgn' && (
                      <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Min NGN
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="p-3.5 space-y-2.5">
                  <div>
                    <p className="text-xs font-black text-white/60">Min USD Per Swap</p>
                    <p className="text-[10px] text-white/60 mt-0.5">
                      Current:{' '}
                      {toNum(pool.minTokenAmount) > 0
                        ? `${toNum(pool.minTokenAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                        : 'Not set'}
                    </p>
                  </div>
                  <input
                    type="number"
                    placeholder={`e.g. ${toNum(pool.minTokenAmount).toLocaleString()}`}
                    value={minToken}
                    onChange={(e) => setMinToken(e.target.value)}
                    className={darkInput}
                  />
                  <button
                    onClick={() => triggerPin('minToken')}
                    disabled={txLoading || !minToken}
                    className="w-full py-3 rounded-xl bg-white/5 border border-white/15 text-white/60 font-black text-xs uppercase tracking-widest hover:bg-white/15 hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {txLoading && pinAction === 'minToken' && (
                      <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Min USD
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {pinVisible && (
            <PinModal
              title="Enter Transaction PIN"
              subtitle="Authorize this action via your BNB Safe"
              onConfirm={verifyPin}
              onCancel={() => setPinVisible(false)}
              loading={pinLoading}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── Pool Card ────────────────────────────────────────────────────────────────
const PoolCard = ({ pool, index, onManage, onPublish, onRename, onDelete }) => {
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-blue-500/20 transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-3.5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              <p className="font-black text-blue-400 text-sm truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <SubBadge pool={pool} />
            </div>
            <p className="font-mono text-[9px] text-white/40 truncate">{pool.poolAddress}</p>
            {pool.subscriptionExpiresAt && new Date(pool.subscriptionExpiresAt) > new Date() && (
              <p className="text-[8px] text-white/40 mt-0.5">
                Expires{' '}
                {new Date(pool.subscriptionExpiresAt).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        {/* ── Token balances: 2×2 spacious grid ── */}
        <div className="grid grid-cols-2 gap-2">
          <StatCell label="NGNs" value={toNum(pool.ngnsLiquidity)} color="#ffffff" />
          <StatCell label="cNGN" value={toNum(pool.cNgnLiquidity)} color="#ffffff" />
          <StatCell label="USDT" value={toNum(pool.usdtLiquidity)} color="#ffffff" />
          <StatCell label="USDC" value={toNum(pool.usdcLiquidity)} color="#ffffff" />
        </div>

        {/* Totals + Rates unified strip */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.05]">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-[9px] uppercase tracking-widest text-white/50 font-black">
              NGN Total
            </span>
            <span className="font-black text-sm text-blue-400 tabular-nums">
              {compactFmt(totalNgn)}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-black">
              USD Total
            </span>
            <span className="font-black text-base text-white tabular-nums">
              {compactFmt(totalUsd)}
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-black">
              Buy Rate
            </span>
            <span className="font-black text-base text-white tabular-nums">
              ₦{toNum(pool.buyRate).toLocaleString()}
              <span className="text-[10px] text-white/40 font-normal">/USD</span>
            </span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-[10px] uppercase tracking-widest text-white/50 font-black">
              Sell Rate
            </span>
            <span className="font-black text-base text-white tabular-nums">
              ₦{toNum(pool.sellRate).toLocaleString()}
              <span className="text-[10px] text-white/40 font-normal">/USD</span>
            </span>
          </div>
        </div>

        <div className="flex gap-1.5">
          <button
            onClick={onManage}
            className="flex-1 py-2 rounded-lg bg-white/5 border border-white/[0.07] text-white font-black text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            ⚙ Manage
          </button>
          <button
            onClick={onPublish}
            className="flex-1 py-2 rounded-lg bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-blue-500/20"
          >
            {pool.isPublished ? 'Extend' : 'Publish'}
          </button>
          <button
            onClick={onRename}
            className="py-2 px-2.5 rounded-lg border border-blue-500/25 text-blue-400 font-black text-[10px] uppercase hover:bg-blue-500/10 transition-all"
          >
            {pool.poolName ? '✎' : 'Name'}
          </button>
          <button
            onClick={onDelete}
            className="py-2 px-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all"
          >
            🗑
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main BNBDeployPool ───────────────────────────────────────────────────────
const BNBDeployPool = ({ user, showMsg, onSwitchToLinkName }) => {
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [poolFee, setPoolFee] = useState({ feeNGN: null, feeUSD: null, loading: true });
  const poolFeeCache = useRef({});
  const [refreshing, setRefreshing] = useState(false);
  const [subFees, setSubFees] = useState(null);
  const [managingPool, setManagingPool] = useState(null);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinAction, setPinAction] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null);
  const [subTier, setSubTier] = useState(1);
  const [subscribing, setSubscribing] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [newlyDeployedPool, setNewlyDeployedPool] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingPool, setDeletingPool] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingPool, setRenamingPool] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameRegistry, setRenameRegistry] = useState(null);
  const [renameStep, setRenameStep] = useState('form');
  const [renameCheckResult, setRenameCheckResult] = useState(null);
  const [renamePrepared, setRenamePrepared] = useState(null);
  const [renameError, setRenameError] = useState('');
  const [renameChecking, setRenameChecking] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameFee, setRenameFee] = useState(null);
  const [renameFeeLoading, setRenameFeeLoading] = useState(false);
  const [registries, setRegistries] = useState([]);
  const [showNetworkReminder, setShowNetworkReminder] = useState(false);
  const pendingAction = useRef(null);
  const { isDismissed } = useNetworkReminder();

  const resetRenameModal = () => {
    setRenameInput('');
    setRenameRegistry(null);
    setRenameStep('form');
    setRenameCheckResult(null);
    setRenamePrepared(null);
    setRenameError('');
    setRenameFee(null);
    setRenameFeeLoading(false);
  };

  const handleRenameCheck = async () => {
    if (!renameInput || !renameRegistry || !renamingPool) return;
    setRenameError('');
    setRenameChecking(true);
    setRenameCheckResult(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameInput, registryAddress: renameRegistry.registryAddress }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.message || 'Check failed'); return; }
      if (data.reserved) { setRenameError('This name is reserved. Choose another.'); return; }
      if (!data.available) { setRenameError('Name already taken. Try another.'); return; }
      setRenameCheckResult(data);
      setRenameFee(null);
      setRenameFeeLoading(true);
      try {
        const feeRes = await fetch(`${SALVA_API_URL}/api/registry-fee`);
        const feeData = await feeRes.json();
        setRenameFee(feeRes.ok ? (feeData.fee ?? 0) : 0);
      } catch { setRenameFee(0); } finally { setRenameFeeLoading(false); }
      setRenameStep('confirm');
    } catch { setRenameError('Network error. Try again.'); }
    finally { setRenameChecking(false); }
  };

  const handleRenamePrepare = async () => {
    if (!renamingPool || !renameRegistry || !renameInput) return;
    setRenameLoading(true);
    // Uses Base Safe from localStorage for the link prep (naming service is on Base)
    const baseUser = (() => { try { return JSON.parse(localStorage.getItem('salva_user') || 'null'); } catch { return null; } })();
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: baseUser?.safeAddress || user.safeAddress,
          name: renameInput,
          walletToLink: renamingPool.poolAddress,
          registryAddress: renameRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setRenameError(data.message || 'Preparation failed'); setRenameStep('confirm'); return; }
      if (data.reserved) { setRenameError('Name is reserved.'); return; }
      if (data.lowBalance) { setRenameError(data.message || 'Insufficient NGNs for registration fee.'); return; }
      setRenamePrepared(data);
      setPinAction('rename');
      setPinVisible(true);
    } catch { setRenameError('Network error during preparation.'); }
    finally { setRenameLoading(false); }
  };

  const executeRename = async (privateKey) => {
    if (!renamingPool || !renamePrepared) return;
    setRenameLoading(true);
    setRenameStep('renaming');
    setShowRenameModal(false);
    const baseUser = (() => { try { return JSON.parse(localStorage.getItem('salva_user') || 'null'); } catch { return null; } })();
    try {
      if (renamingPool.poolName) {
        const unlinkRes = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safeAddress: baseUser?.safeAddress || user.safeAddress,
            bnbSafeAddress: user.safeAddress,
            weldedName: renamingPool.poolName.trim(),
            registryAddress: renamePrepared.registryAddress,
            userPrivateKey: privateKey,
          }),
        });
        if (!unlinkRes.ok) { showMsg('Failed to unlink old name', 'error'); resetRenameModal(); setRenameLoading(false); return; }
      }
      const execRes = await fetch(`${SALVA_API_URL}/api/alias/execute-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: baseUser?.safeAddress || user.safeAddress,
          bnbSafeAddress: user.safeAddress,
          pureName: renamePrepared.pureName,
          weldedName: renamePrepared.weldedName,
          walletToLink: renamePrepared.walletToLink,
          registryAddress: renamePrepared.registryAddress,
          signature: renamePrepared.signature,
          feeWei: renamePrepared.feeWei,
          userPrivateKey: privateKey,
        }),
      });
      if (!execRes.ok) { showMsg('Failed to link new name', 'error'); resetRenameModal(); setRenameLoading(false); return; }
      await fetch(`${SALVA_API_URL}/api/pool/l1/set-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAddress: renamingPool.poolAddress, ownerSafeAddress: user.safeAddress, poolName: renamePrepared.weldedName }),
      }).catch(() => {});
      showMsg(`Pool renamed to "${renamePrepared.weldedName}"!`);
      await fetchMyPools();
    } catch { showMsg('Rename failed', 'error'); }
    finally { resetRenameModal(); setRenamingPool(null); setRenameLoading(false); }
  };

  const fetchMyPools = useCallback(
    async (silent = false) => {
      if (!user?.safeAddress) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/pool/l1/my/${user.safeAddress}`);
        const data = await res.json();
        setPools(data.pools || []);
      } catch (err) {
        console.warn('fetchMyPools (BNB) error:', err.message);
        setPools([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.safeAddress]
  );

  const fetchSubFees = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/subscription-fee`);
      const data = await res.json();
      setSubFees(data);
    } catch {}
  }, []);

  // Fetch pool operation fee once on mount, cache 30s
  useEffect(() => {
    const key = 'bnb_pool';
    const cached = poolFeeCache.current[key];
    if (cached && Date.now() - cached.at < 30_000) {
      setPoolFee({ ...cached.data, loading: false });
      return;
    }
    setPoolFee((p) => ({ ...p, loading: true }));
    fetch(`${SALVA_API_URL}/api/estimate-pool-fee?chain=bnb`)
      .then((r) => r.json())
      .then((d) => {
        const fee = { feeNGN: d.feeNGN, feeUSD: d.feeUSD, loading: false };
        poolFeeCache.current[key] = { data: fee, at: Date.now() };
        setPoolFee(fee);
      })
      .catch(() => setPoolFee({ feeNGN: null, feeUSD: null, loading: false }));
  }, []);

  useEffect(() => {
    fetchMyPools();
    fetchSubFees();
    fetch(`${SALVA_API_URL}/api/registries`)
      .then((r) => r.json())
      .then((d) => setRegistries(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [fetchMyPools, fetchSubFees]);

  const handlePinConfirm = async (pin) => {
    setPinLoading(true);
    try {
      // delete (with name) and rename both need the Base Safe key — use Base PIN
      const needsBaseKey =
        (pinAction === 'delete' && deletingPool?.poolName) || pinAction === 'rename';
      const baseUser = (() => {
        try {
          return JSON.parse(localStorage.getItem('salva_user') || 'null');
        } catch {
          return null;
        }
      })();
      const pinEndpoint = needsBaseKey ? '/api/user/verify-pin' : '/api/bnb/verify-pin';
      const pinEmail = needsBaseKey ? baseUser?.email || user.email : user.email;
      const res = await fetch(`${SALVA_API_URL}${pinEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pinEmail, pin }),
      });
      const data = await res.json();
      if (!res.ok) {
        showMsg('Invalid PIN', 'error');
        return;
      }
      setPinVisible(false);
      if (pinAction === 'deploy') await executeDeploy(data.privateKey);
      if (pinAction === 'subscribe') await executeSubscribe(data.privateKey);
      if (pinAction === 'delete') await executeDelete(data.privateKey);
      if (pinAction === 'rename') await executeRename(data.privateKey);
    } catch {
      showMsg('Network error. Please try again.', 'error');
      setPinVisible(false);
    } finally {
      setPinLoading(false);
    }
  };

  const executeDeploy = async (privateKey) => {
    setDeploying(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerSafeAddress: user.safeAddress, ownerPrivateKey: privateKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Deploy failed');

      showMsg('Pool deployed!');
      await fetchMyPools();
      setNewlyDeployedPool(data.poolAddress);
      setShowNamePrompt(true);
    } catch {
      showMsg('Deployment failed — please try again', 'error');
    } finally {
      setDeploying(false);
    }
  };

  const executeSubscribe = async (privateKey) => {
    if (!selectedPool) return;
    setSubscribing(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/l1/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: selectedPool.poolAddress,
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          months: subTier,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Subscription failed');

      showMsg(
        `Pool published! Expires ${new Date(data.subscriptionExpiresAt).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}`
      );
      await fetchMyPools();
    } catch {
      showMsg('Subscription failed', 'error');
    } finally {
      setSubscribing(false);
      setSelectedPool(null);
    }
  };

  const executeDelete = async (privateKey) => {
    if (!deletingPool) return;
    setDeleting(true);
    try {
      // If the pool has a name, unlink it on Base chain first using Base Safe key
      if (deletingPool.poolName && privateKey) {
        const baseUser = (() => { try { return JSON.parse(localStorage.getItem('salva_user') || 'null'); } catch { return null; } })();
        const unlinkRes = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safeAddress: baseUser?.safeAddress || user.safeAddress,
            bnbSafeAddress: user.safeAddress,
            weldedName: deletingPool.poolName.trim(),
            registryAddress: process.env.REACT_APP_REGISTRY_CONTRACT_ADDRESS || '',
            userPrivateKey: privateKey,
          }),
        });
        if (!unlinkRes.ok) {
          const unlinkData = await unlinkRes.json();
          showMsg(unlinkData.message || 'Failed to unlink pool name', 'error');
          setDeleting(false);
          setShowDeleteConfirm(false);
          setDeletingPool(null);
          return;
        }
      }
      const res = await fetch(`${SALVA_API_URL}/api/pool/delete-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: deletingPool.poolAddress,
          ownerSafeAddress: user.safeAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      showMsg(
        deletingPool.poolName
          ? `Pool deleted & "${deletingPool.poolName}" unlinked.`
          : 'Pool removed.'
      );
      await fetchMyPools();
    } catch (err) {
      showMsg(err.message || 'Could not remove pool — please try again', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeletingPool(null);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 relative">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-lg font-black tracking-tight whitespace-nowrap">My Pools</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          <a
            href="/dashboard"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-salvaGold/30 bg-salvaGold/[0.07] hover:bg-salvaGold/[0.14] hover:border-salvaGold/50 transition-all"
          >
            <div className="w-3 h-3 rounded-full bg-[#0052FF] flex items-center justify-center flex-shrink-0">
              <span className="text-white text-[6px] font-black">B</span>
            </div>
            <span className="text-[8px] font-black uppercase tracking-widest text-salvaGold">
              Base
            </span>
            <span className="text-salvaGold text-[9px]">↗</span>
          </a>
          <button
            onClick={() => fetchMyPools(true)}
            disabled={loading || refreshing}
            className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-blue-500/30 transition-all"
          >
            {loading || refreshing ? (
              <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            ) : (
              <span className="text-blue-400 text-lg leading-none">↻</span>
            )}
          </button>
          <button
            onClick={() => {
              pendingAction.current = () => {
                setPinAction('deploy');
                setPinVisible(true);
              };
              setShowNetworkReminder(true);
            }}
            disabled={deploying}
            className="flex items-center gap-2 px-5 py-3 bg-blue-500 text-white font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20"
          >
            {deploying && (
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {deploying ? 'Deploying…' : '+ Deploy'}
          </button>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs font-black text-blue-400 mb-1">How it works</p>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Deploy your pool, add liquidity, set rates, then publish it. A subscription of{' '}
          <span className="font-black text-blue-400">
            {subFees?.monthly?.toLocaleString() || '3,000'} NGN/month
          </span>{' '}
          keeps it visible on the swap marketplace.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 rounded-3xl border border-dashed border-white/[0.06] text-center"
        >
          <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏊</span>
          </div>
          <p className="font-black text-white/60 text-sm mb-1">No pools yet</p>
          <p className="text-[11px] text-white/60">
            Deploy your first pool to start earning as an LP
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool, i) => (
            <PoolCard
              key={pool.poolAddress}
              pool={pool}
              index={i}
              onManage={() => {
                pendingAction.current = () => setManagingPool(pool);
                setShowNetworkReminder(true);
              }}
              onPublish={() => {
                pendingAction.current = () => {
                  setSelectedPool(pool);
                  setShowSubModal(true);
                };
                setShowNetworkReminder(true);
              }}
              onRename={() => {
                if (pool.poolName) {
                  setRenamingPool(pool);
                  setRenameInput('');
                  setRenameRegistry(registries.length === 1 ? registries[0] : null);
                  setRenameStep('form');
                  setRenameCheckResult(null);
                  setRenamePrepared(null);
                  setRenameError('');
                  setShowRenameModal(true);
                } else {
                  setNewlyDeployedPool(pool.poolAddress);
                  setShowNamePrompt(true);
                }
              }}
              onDelete={() => {
                setDeletingPool(pool);
                setShowDeleteConfirm(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Manage Panel */}
      <AnimatePresence>
        {managingPool && (
          <PoolManagePanel
            pool={managingPool}
            user={user}
            showMsg={showMsg}
            onClose={() => setManagingPool(null)}
            onRefresh={async () => {
              await fetchMyPools(true);
              const res = await fetch(`${SALVA_API_URL}/api/pool/l1/my/${user.safeAddress}`);
              const data = await res.json();
              const fresh = (data.pools || []).find(
                (p) => p.poolAddress === managingPool.poolAddress
              );
              if (fresh) setManagingPool(fresh);
            }}
          />
        )}
      </AnimatePresence>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubModal && selectedPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubModal(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="p-8">
                <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-1">
                  Marketplace
                </p>
                <h3 className="text-xl font-black mb-1 text-white">Publish Pool</h3>
                <p className="text-xs text-white/60 mb-5 leading-relaxed">
                  Subscribe to list your pool on the SWAP marketplace.
                  {selectedPool.isPublished && ' Remaining time is preserved.'}
                </p>
                <div className="space-y-2 mb-5">
                  {subFees?.tiers?.map((tier) => (
                    <button
                      key={tier.months}
                      onClick={() => setSubTier(tier.months)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${subTier === tier.months ? 'border-blue-500 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:border-blue-500/30'}`}
                    >
                      <span className="font-black text-sm text-white">{tier.label}</span>
                      <span
                        className={`font-black text-sm ${subTier === tier.months ? 'text-blue-400' : 'text-white/60'}`}
                      >
                        {tier.total.toLocaleString()} NGNs
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubModal(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowSubModal(false);
                      setPinAction('subscribe');
                      setPinVisible(true);
                    }}
                    disabled={subscribing}
                    className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Name Prompt */}
      <AnimatePresence>
        {showNamePrompt && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNamePrompt(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="p-8">
                <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🏷️</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">Name Your Pool?</h3>
                <p className="text-xs text-white/60 mb-2 leading-relaxed">
                  Give it a human-readable identity like{' '}
                  <span className="text-blue-400 font-black">mypool@salva</span>
                </p>
                <p className="font-mono text-[10px] text-white/60 mb-6 break-all">
                  {newlyDeployedPool}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowNamePrompt(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      setShowNamePrompt(false);
                      if (onSwitchToLinkName && newlyDeployedPool)
                        onSwitchToLinkName(newlyDeployedPool);
                    }}
                    className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {showDeleteConfirm && deletingPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-red-500/20 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
              <div className="p-8">
                <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">Delete Pool?</h3>
                <p className="text-xs text-white/60 mb-1 leading-relaxed">
                  Removes from registry. Contract stays on-chain.
                </p>
                <p className="text-xs text-red-400 font-bold mb-4">
                  Must have &lt;1,000 NGNs and &lt;$1 in stablecoins.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setPinAction('delete');
                      setPinVisible(true);
                    }}
                    disabled={deleting}
                    className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  >
                    {deleting && (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {deleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {showRenameModal && renamingPool && (
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowRenameModal(false);
                resetRenameModal();
              }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />
              <div className="px-6 pt-5 pb-4 border-b border-white/[0.05] flex items-center justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-0.5">
                    Salva NS
                  </p>
                  <h3 className="text-xl font-black text-white">Rename Pool</h3>
                  <p className="font-mono text-[10px] text-white/60 truncate mt-0.5">
                    {renamingPool.poolAddress}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    resetRenameModal();
                  }}
                  className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {renamingPool.poolName && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-[10px] uppercase font-black text-white/60 tracking-widest flex-shrink-0">
                      Current
                    </span>
                    <span className="text-blue-400 font-black text-sm truncate flex-1">
                      {renamingPool.poolName}
                    </span>
                    <span className="text-[9px] text-white/60 font-bold flex-shrink-0">
                      will unlink
                    </span>
                  </div>
                )}
                {renameStep === 'form' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                        New Name
                      </label>
                      <input
                        type="text"
                        placeholder="newpoolname"
                        value={renameInput}
                        onChange={(e) => {
                          setRenameInput(e.target.value.toLowerCase().replace(/[^a-z2-9.]/g, ''));
                          setRenameError('');
                        }}
                        maxLength={32}
                        className={darkInput}
                      />
                      {renameInput && renameRegistry && (
                        <p className="text-[10px] text-blue-400/60 font-bold mt-1.5 ml-1">
                          Preview: {renameInput}
                          {renameRegistry.nspace}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                        Wallet Service
                      </label>
                      <RegistryDropdown
                        registries={registries}
                        value={renameRegistry}
                        onChange={(r) => {
                          setRenameRegistry(r);
                          setRenameError('');
                        }}
                      />
                    </div>
                    {renameError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-xs flex-shrink-0">⚠</span>
                        <p className="text-xs text-red-400 font-bold">{renameError}</p>
                      </div>
                    )}
                    <button
                      onClick={handleRenameCheck}
                      disabled={renameChecking || !renameInput || !renameRegistry}
                      className="w-full py-4 bg-blue-500 text-white font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-40 uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      {renameChecking && (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {renameChecking ? 'Checking…' : 'Check Availability'}
                    </button>
                  </motion.div>
                )}
                {renameStep === 'confirm' && renameCheckResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-5 rounded-2xl bg-blue-500/8 border border-blue-500/20 text-center">
                      <p className="text-[9px] uppercase tracking-[0.3em] font-black text-blue-400/50 mb-2">
                        Name Available
                      </p>
                      <p className="text-2xl font-black text-blue-400">
                        {renameCheckResult.welded}
                      </p>
                    </div>
                    {renameFeeLoading ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin flex-shrink-0" />
                        <p className="text-xs text-blue-400 font-bold">
                          Fetching registration fee…
                        </p>
                      </div>
                    ) : renameFee !== null && renameFee > 0 ? (
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[10px] uppercase font-black text-white/60 tracking-widest">
                          Registration Fee
                        </p>
                        <p className="font-black text-white text-sm">
                          {renameFee?.toLocaleString()}{' '}
                          <span className="text-blue-400 text-xs">NGNs</span>
                        </p>
                      </div>
                    ) : renameFee === 0 ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/15">
                        <span className="text-green-400 text-sm flex-shrink-0">✦</span>
                        <p className="text-xs font-black text-green-400">Free Registration</p>
                      </div>
                    ) : null}
                    {renamingPool.poolName && (
                      <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                        <p className="text-[10px] uppercase font-black text-yellow-400 tracking-widest mb-2">
                          What Happens
                        </p>
                        <p className="text-xs text-white/60 leading-relaxed">
                          1.{' '}
                          <span className="text-red-400 font-black">{renamingPool.poolName}</span>{' '}
                          unlinked on-chain
                          <br />
                          2.{' '}
                          <span className="text-blue-400 font-black">
                            {renameCheckResult.welded}
                          </span>{' '}
                          linked to this pool
                        </p>
                      </div>
                    )}
                    {renameError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-xs">⚠</span>
                        <p className="text-xs text-red-400 font-bold">{renameError}</p>
                      </div>
                    )}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => setRenameStep('form')}
                        className="flex-1 py-3.5 rounded-xl border border-white/10 font-bold text-sm text-white hover:bg-white/5 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRenamePrepare}
                        disabled={renameLoading || renameFeeLoading}
                        className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                      >
                        {renameLoading && (
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {renameLoading ? 'Preparing…' : 'Confirm & Enter PIN'}
                      </button>
                    </div>
                  </motion.div>
                )}
                {renameStep === 'renaming' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-4"
                  >
                    <div className="relative w-14 h-14 mx-auto">
                      <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin" />
                      <div className="absolute inset-2 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <span className="text-blue-400 text-sm font-black">₦</span>
                      </div>
                    </div>
                    <p className="font-black text-white">Renaming on-chain…</p>
                    <p className="text-xs text-white/60">
                      Unlinking old, linking new · 60–90 seconds
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Network Reminder */}
      <AnimatePresence>
        {showNetworkReminder && (
          <NetworkReminder
            chain="bnb"
            action="deploy"
            onContinue={() => {
              setShowNetworkReminder(false);
              const fn = pendingAction.current;
              pendingAction.current = null;
              if (fn) fn();
            }}
            onClose={() => {
              setShowNetworkReminder(false);
              pendingAction.current = null;
            }}
          />
        )}
      </AnimatePresence>

      {/* PIN Modal */}
      <AnimatePresence mode="wait">
        {pinVisible && (
          <PinModal
            key={`pin-${pinAction}`}
            title="Enter Transaction PIN"
            subtitle={
              pinAction === 'deploy'
                ? 'Sign pool deployment via your BNB Safe'
                : pinAction === 'subscribe'
                  ? 'Authorize subscription payment'
                  : pinAction === 'delete'
                    ? deletingPool?.poolName
                      ? 'Enter Base PIN to unlink pool name and delete'
                      : 'Authorize pool deletion'
                    : pinAction === 'rename'
                      ? 'Sign rename — unlink old, link new'
                      : 'Enter your PIN'
            }
            onConfirm={handlePinConfirm}
            onCancel={() => setPinVisible(false)}
            loading={pinLoading}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default BNBDeployPool;
