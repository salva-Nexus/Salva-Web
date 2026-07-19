// src/pages/DeployPool.jsx  (Base Chain / L2)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import NetworkReminder, { useNetworkReminder } from '../components/NetworkReminder';

// ─── Shared helpers ───────────────────────────────────────────────────────────
const darkInput =
  'w-full p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-xs sm:text-sm text-white placeholder:text-white/60 transition-all';

// Parse raw pool value safely — always returns a number, never touches formatted strings
const toNum = (v) => parseFloat(v || 0) || 0;

// Full precision display (for tooltip / title)
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

// Compact display for tight cells — abbreviates large numbers, truncates long decimals
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

// ─── Registry Dropdown ────────────────────────────────────────────────────────
const RegistryDropdown = ({
  registries,
  value,
  onChange,
  placeholder = 'Search wallet service…',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
        className={`w-full flex items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3.5 rounded-xl border transition-all text-left ${
          open
            ? 'border-salvaGold bg-salvaGold/5 ring-1 ring-salvaGold/30'
            : value
              ? 'border-salvaGold/40 bg-salvaGold/5'
              : 'border-white/10 bg-white/5 hover:border-salvaGold/40'
        }`}
      >
        {value ? (
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-salvaGold/20 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
              <span className="text-salvaGold text-[9px] sm:text-xs font-black">
                {value.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-[10px] sm:text-sm truncate text-white">{value.name}</p>
              <p className="text-[7px] sm:text-[10px] text-white/60 font-mono truncate">{value.nspace}</p>
            </div>
          </div>
        ) : (
          <span className="text-[10px] sm:text-sm text-white/60 font-bold">{placeholder}</span>
        )}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setQuery('');
              }}
              className="w-3.5 h-3.5 sm:w-5 sm:h-5 rounded-full bg-white/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            >
              <span className="text-[7px] sm:text-[10px] text-red-400 font-black">✕</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((o) => !o);
              setQuery('');
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            className="w-3.5 h-3.5 sm:w-5 sm:h-5 flex items-center justify-center"
          >
            <svg
              className={`w-2 h-2 sm:w-3 sm:h-3 text-white/60 transition-transform ${open ? 'rotate-180' : ''}`}
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
            <div className="p-2 sm:p-3 border-b border-white/[0.05]">
              <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-lg bg-white/5">
                <svg
                  className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 text-white/60 flex-shrink-0"
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
                  className="flex-1 bg-transparent outline-none text-[9px] sm:text-xs font-bold placeholder:text-white/60 text-white"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-white/60 hover:text-white/80 text-[7px] sm:text-[10px]"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
            <div style={{ maxHeight: '160px', overflowY: 'auto' }}>
              {filtered.length === 0 ? (
                <div className="px-3 py-3.5 sm:px-4 sm:py-5 text-center text-[9px] sm:text-xs text-white/60 font-bold">
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
                    className={`w-full flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 hover:bg-salvaGold/5 transition-colors text-left ${value?.registryAddress === reg.registryAddress ? 'bg-salvaGold/10' : ''}`}
                  >
                    <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-salvaGold/15 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-salvaGold text-[9px] sm:text-xs font-black">
                        {reg.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-[10px] sm:text-sm text-white">{reg.name}</p>
                      <p className="text-[7px] sm:text-[10px] font-mono text-white/60">{reg.nspace}</p>
                    </div>
                    {value?.registryAddress === reg.registryAddress && (
                      <span className="text-salvaGold text-[10px] sm:text-sm">✓</span>
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

// ─── PIN Modal ────────────────────────────────────────────────────────────────
const PinModal = ({ title, subtitle, onConfirm, onCancel, loading, feeInfo }) => {
  const [pin, setPin] = useState('');
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-3 sm:px-4">
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
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="p-5 sm:p-8 text-center">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔐</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black mb-1 text-white">{title}</h3>
          <p className="text-[9px] sm:text-xs text-white/60 mb-4 sm:mb-6 leading-relaxed">
            {subtitle}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
            className="w-full p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-xl sm:text-3xl tracking-[0.7em] sm:tracking-[1em] font-black mb-4 sm:mb-6 text-white transition-all"
          />
          {feeInfo && (
            <div className="-mt-2 mb-4 sm:-mt-3 sm:mb-6 px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-[9px] sm:text-xs">
              <span className="uppercase tracking-widest text-white/60 font-black">
                Network Fee
              </span>
              {feeInfo.loading ? (
                <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border border-white/20 border-t-salvaGold rounded-full animate-spin inline-block" />
              ) : feeInfo.feeNGN != null ? (
                <span className="text-red-400 font-black">₦{feeInfo.feeNGN.toFixed(2)}</span>
              ) : (
                <span className="text-white/30">—</span>
              )}
            </div>
          )}
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 sm:py-3.5 rounded-2xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(pin)}
              disabled={loading || pin.length !== 4 || feeInfo?.loading}
              className="flex-1 py-2.5 sm:py-3.5 rounded-2xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 transition-all"
            >
              {(loading || feeInfo?.loading) && (
                <span className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              {loading ? 'Verifying…' : feeInfo?.loading ? 'Calculating fee…' : 'Confirm'}
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
  if (pool.isPaused) {
    return (
      <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
        {active ? `Paused · ${timeLabel} left` : 'Paused'}
      </span>
    );
  }

  if (!active) {
    return (
      <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase border border-white/10 bg-white/5 text-white/60">
        Unpublished
      </span>
    );
  }

  return (
    <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase border border-green-500/30 bg-green-500/10 text-green-400">
      Live · {timeLabel} left
    </span>
  );
};

// ─── Stat Cell — responsive, shows compact number with full value in title ────
const StatCell = ({ label, value, color }) => (
  <div className="px-2 py-2 sm:px-3 sm:py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
    <p className="text-[7px] sm:text-[10px] uppercase tracking-wide text-white/50 font-black flex-shrink-0">{label}</p>
    <p
      className="font-black text-[10px] sm:text-sm tabular-nums flex-shrink-0"
      style={{ color }}
      title={smartFmt(value)}
    >
      {compactFmt(value)}
    </p>
  </div>
);

// ─── Section Tab Row ──────────────────────────────────────────────────────────
const SectionTabs = ({ active, onChange }) => (
  <div className="flex gap-1 sm:gap-1.5">
    {['liquidity', 'rates', 'controls'].map((s) => (
      <button
        key={s}
        onClick={() => onChange(s)}
        className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${
          active === s
            ? 'bg-salvaGold text-black shadow-lg shadow-salvaGold/20'
            : 'bg-white/5 border border-white/[0.06] text-white/60 hover:text-white/60'
        }`}
      >
        {s}
      </button>
    ))}
  </div>
);

// ─── Pool Manage Panel ────────────────────────────────────────────────────────
const PoolManagePanel = ({ pool, user, showMsg, onClose, onRefresh }) => {
  const [activeSection, setActiveSection] = useState('liquidity');
  const [panelFee, setPanelFee] = useState({ feeNGN: null, feeUSD: null, loading: false });
  const panelFeeCache = useRef({});
  // Simulated ONLY when the user actually triggers a signed action (via
  // triggerPin below) — never eagerly when the Manage panel opens.
  const fetchPanelFeeForPin = useCallback(() => {
    const key = 'base_pool';
    const cached = panelFeeCache.current[key];
    if (cached && Date.now() - cached.at < 30_000) {
      setPanelFee({ ...cached.data, loading: false });
      return;
    }
    setPanelFee({ feeNGN: null, feeUSD: null, loading: true });
    fetch(`${SALVA_API_URL}/api/estimate-pool-fee?chain=base`)
      .then((r) => r.json())
      .then((d) => {
        const fee = { feeNGN: d.feeNGN, feeUSD: d.feeUSD, loading: false };
        panelFeeCache.current[key] = { data: fee, at: Date.now() };
        setPanelFee(fee);
      })
      .catch(() => setPanelFee({ feeNGN: null, feeUSD: null, loading: false }));
  }, []);

  // ── Fee-funds check — MetaMask-style pre-warning, shared across all tabs ──
  const [manageFeeFunds, setManageFeeFunds] = useState(null);
  useEffect(() => {
    if (!user?.safeAddress) return;
    fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`)
      .then((r) => r.json())
      .then((d) => {
        setManageFeeFunds({
          ngns: parseFloat(d.ngnsBalance || 0),
          cngn: parseFloat(d.cNgnBalance || 0),
          usdt: parseFloat(d.usdtBalance || 0),
          usdc: parseFloat(d.usdcBalance || 0),
        });
      })
      .catch(() => setManageFeeFunds(null));
  }, [user?.safeAddress]);

  const hasNoManageFeeFunds =
    manageFeeFunds &&
    manageFeeFunds.ngns <= 0 &&
    manageFeeFunds.cngn <= 0 &&
    manageFeeFunds.usdt <= 0 &&
    manageFeeFunds.usdc <= 0;

  const FeeFundsBanner = () =>
    hasNoManageFeeFunds ? (
      <div className="flex items-center gap-2 sm:gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
        <span className="text-yellow-400 text-xs sm:text-sm flex-shrink-0">⚠️</span>
        <p className="text-[8px] sm:text-[11px] text-yellow-400/90 font-bold leading-snug">
          This may not go through — you have no NGNs, cNGN, USDT, or USDC to cover the network fee.
        </p>
      </div>
    ) : null;

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

  // Returns raw float — never a formatted string (fixes parseFloat-on-comma bug)
  const rawBalanceForAsset = (asset) => {
    if (asset === 'NGNS') return toNum(pool.ngnsLiquidity);
    if (asset === 'CNGN') return toNum(pool.cNgnLiquidity);
    if (asset === 'USDT') return toNum(pool.usdtLiquidity);
    if (asset === 'USDC') return toNum(pool.usdcLiquidity);
    return 0;
  };

  // Raw string balance — no parseFloat round-trip, so Max never loses precision
  const rawBalanceStringForAsset = (asset) => {
    if (asset === 'NGNS') return String(pool.ngnsLiquidity ?? '0');
    if (asset === 'CNGN') return String(pool.cNgnLiquidity ?? '0');
    if (asset === 'USDT') return String(pool.usdtLiquidity ?? '0');
    if (asset === 'USDC') return String(pool.usdcLiquidity ?? '0');
    return '0';
  };

  const verifyPin = async (pin) => {
    setPinLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
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
      showMsg('Network error', 'error');
    } finally {
      setPinLoading(false);
    }
  };

  const executeProvideLiquidity = async (privateKey) => {
    console.log('provide liq called:', { liqAmount, liqAsset, pool: pool.poolAddress });
    if (!liqAmount || parseFloat(liqAmount) <= 0) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/provide-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          asset: liqAsset,
          amount: liqAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg(`${liqAmount} ${liqAsset} sent to pool!`);
      setLiqAmount('');
      onRefresh();
    } catch (err) {
      showMsg(err.message || 'Failed to add liquidity. Please try again.', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeRemoveLiquidity = async (privateKey) => {
    if (!liqAmount || parseFloat(liqAmount) <= 0) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/remove-liquidity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
          poolAddress: pool.poolAddress,
          asset: liqAsset,
          amount: liqAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed');
      showMsg(`${liqAmount} ${liqAsset} withdrawn!`);
      setLiqAmount('');
      onRefresh();
    } catch {
      showMsg('Failed', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateBuyRate = async (privateKey) => {
    if (buyRate === '' || buyRate === undefined) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/update-rates`, {
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
    } catch (err) {
      showMsg(err.message || 'Failed to update buy rate.', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateSellRate = async (privateKey) => {
    if (sellRate === '' || sellRate === undefined) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/update-rates`, {
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
    } catch (err) {
      showMsg(err.message || 'Failed to set minimum NGN amount.', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const executeTogglePause = async (privateKey, pause) => {
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/toggle-pause`, {
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
      const res = await fetch(`${SALVA_API_URL}/api/pool/set-mins`, {
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
      const res = await fetch(`${SALVA_API_URL}/api/pool/set-mins`, {
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
    } catch (err) {
      showMsg(err.message || 'Failed to set minimum USD amount.', 'error');
    } finally {
      setTxLoading(false);
    }
  };

  const triggerPin = (action) => {
    setPinAction(action);
    setPinVisible(true);
    fetchPanelFeeForPin();
  };

  // Accumulated totals — numeric addition, NOT string concatenation
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity); // FIX: was usdtLiquidity twice

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
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />

        {/* Header */}
        <div className="px-3 pt-2.5 pb-2.5 sm:px-4 sm:pt-3 sm:pb-3 border-b border-white/[0.05]">
          <div className="flex items-start justify-between gap-2 mb-2.5 sm:mb-3">
            <div className="min-w-0">
              <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.35em] text-salvaGold/60 font-black mb-0.5">
                Manage Pool
              </p>
              <p className="font-black text-[10px] sm:text-sm text-white truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <p className="font-mono text-[7px] sm:text-[9px] text-white/40 truncate mt-0.5">
                {pool.poolAddress}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0 mt-1 text-[10px] sm:text-base"
            >
              ✕
            </button>
          </div>
          {/* Accumulated totals — single number each, not "A + B" string */}
          <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.05]">
            <div className="flex items-center justify-between px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/50 font-black">
                NGN Total
              </span>
              <span className="font-black text-[10px] sm:text-sm text-salvaGold tabular-nums">
                {compactFmt(totalNgn)}
              </span>
            </div>
            <div className="flex items-center justify-between px-2.5 py-1.5 sm:px-3 sm:py-2">
              <span className="text-[7px] sm:text-[9px] uppercase tracking-widest text-green-400/60 font-black">
                USD Total
              </span>
              <span className="font-black text-[10px] sm:text-sm text-green-400 tabular-nums">
                {compactFmt(totalUsd)}
              </span>
            </div>
          </div>
        </div>

        {/* Section tabs */}
        <div className="px-3 py-1.5 sm:px-4 sm:py-2 border-b border-white/[0.05]">
          <SectionTabs active={activeSection} onChange={setActiveSection} />
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          {/* ── LIQUIDITY ── */}
          {activeSection === 'liquidity' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 sm:space-y-4"
            >
              {/* Mode toggle */}
              <div className="flex gap-1.5 sm:gap-2">
                {['provide', 'remove'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setLiqMode(m)}
                    className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[10px] font-black uppercase tracking-widest border transition-all ${
                      liqMode === m
                        ? m === 'provide'
                          ? 'bg-salvaGold text-black border-salvaGold shadow-lg shadow-salvaGold/20'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'border-white/10 bg-white/5 text-white/60 hover:text-white/50'
                    }`}
                  >
                    {m === 'provide' ? '↑ Add Liquidity' : '↓ Remove Liquidity'}
                  </button>
                ))}
              </div>

              <FeeFundsBanner />

              {/* Token selector — shows raw balance, compact-formatted */}
              <div>
                <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black block mb-1.5 sm:mb-2">
                  Token
                </label>
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  {assets.map((a) => {
                    const raw = rawBalanceForAsset(a);
                    return (
                      <button
                        key={a}
                        onClick={() => {
                          setLiqAsset(a);
                          setLiqAmount('');
                        }}
                        className={`flex items-center justify-between px-2 py-2 sm:px-3 sm:py-2.5 rounded-lg border transition-all ${
                          liqAsset === a
                            ? 'bg-salvaGold/10 border-salvaGold/40'
                            : 'border-white/[0.06] bg-white/5 hover:border-white/20'
                        }`}
                      >
                        <span
                          className={`text-[9px] sm:text-xs font-black uppercase ${
                            liqAsset === a ? 'text-salvaGold' : 'text-white/60'
                          }`}
                        >
                          {a}
                        </span>
                        <span
                          className="text-[9px] sm:text-xs font-black text-white/80 tabular-nums"
                          title={smartFmt(raw)}
                        >
                          {compactFmt(raw)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Amount */}
              <div>
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Amount
                  </label>
                  {liqMode === 'remove' && (
                    <button
                      type="button"
                      onClick={() => setLiqAmount(rawBalanceStringForAsset(liqAsset))}
                      className="text-[7px] sm:text-[10px] font-black uppercase tracking-widest text-blue-400 hover:opacity-80 transition-opacity px-1.5 py-0.5 sm:px-2 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
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
                    className={`${darkInput} text-sm sm:text-base pr-12 sm:pr-16`}
                  />
                  <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-[10px] sm:text-sm">
                    {liqAsset}
                  </span>
                </div>
                {liqMode === 'provide' && (
                  <p className="text-[7px] sm:text-[10px] text-white/60 mt-1 sm:mt-1.5 leading-relaxed">
                    Tokens sent from your Safe wallet directly to the pool contract.
                  </p>
                )}
              </div>

              <button
                onClick={() => triggerPin(liqMode)}
                disabled={!liqAmount || parseFloat(liqAmount) <= 0 || txLoading}
                className={`w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 active:scale-[0.98] shadow-lg ${
                  liqMode === 'provide'
                    ? 'bg-salvaGold text-black shadow-salvaGold/20'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white'
                }`}
              >
                {txLoading && (
                  <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                )}
                {txLoading
                  ? 'Processing…'
                  : liqMode === 'provide'
                  ? `Add ${liqAsset}`
                  : `Remove ${liqAsset}`}
              </button>
            </motion.div>
          )}

          {/* ── RATES ── */}
          {activeSection === 'rates' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 sm:space-y-4"
            >
              <div className="px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
                  Rates in <span className="font-black text-salvaGold">NGN per USD</span>. Each rate
                  saves as a separate on-chain transaction.
                </p>
              </div>

              <FeeFundsBanner />

              {/* Buy Rate */}
              <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-green-400">Buy Rate</p>
                    <p className="text-[7px] sm:text-[10px] text-white/60 mt-0.5">
                      Current: ₦{toNum(pool.buyRate).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 1490"
                      value={buyRate}
                      onChange={(e) => setBuyRate(e.target.value)}
                      className="w-full p-2 sm:p-3 rounded-xl bg-white/5 border border-white/10 focus:border-green-400 outline-none text-sm sm:text-base font-black text-white transition-all pr-11 sm:pr-14"
                    />
                    <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-green-400 font-black text-[10px] sm:text-sm">
                      NGN
                    </span>
                  </div>

                  <button
                    onClick={() => triggerPin('buyRate')}
                    disabled={txLoading || buyRate === ''}
                    className="w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500 hover:text-black hover:border-green-500"
                  >
                    {txLoading && pinAction === 'buyRate' && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Buy Rate On-Chain
                  </button>
                </div>
              </div>

              {/* Sell Rate */}
              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-blue-400">Sell Rate</p>
                    <p className="text-[7px] sm:text-[10px] text-white/60 mt-0.5">
                      Current: ₦{toNum(pool.sellRate).toLocaleString()}
                    </p>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="e.g. 1530"
                      value={sellRate}
                      onChange={(e) => setSellRate(e.target.value)}
                      className="w-full p-2 sm:p-3 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 outline-none text-sm sm:text-base font-black text-white transition-all pr-11 sm:pr-14"
                    />
                    <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-blue-400 font-black text-[10px] sm:text-sm">
                      NGN
                    </span>
                  </div>

                  <button
                    onClick={() => triggerPin('sellRate')}
                    disabled={txLoading || sellRate === ''}
                    className="w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500 hover:text-black hover:border-blue-500"
                  >
                    {txLoading && pinAction === 'sellRate' && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Sell Rate On-Chain
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CONTROLS ── */}
          {activeSection === 'controls' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 sm:space-y-4"
            >
              <div className="px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                <p className="text-[9px] sm:text-xs font-black text-yellow-400 mb-0.5">
                  Emergency Controls
                </p>
                <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
                  Pausing stops all swaps. Liquidity is safe — only you can unpause.
                </p>
              </div>

              <FeeFundsBanner />

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => triggerPin('pause')}
                  disabled={txLoading}
                  className="py-1.5 sm:py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:bg-yellow-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={() => triggerPin('unpause')}
                  disabled={txLoading}
                  className="py-1.5 sm:py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:bg-green-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ▶ Unpause
                </button>
              </div>

              {/* Min NGNs */}
              <div className="rounded-2xl border border-salvaGold/20 bg-salvaGold/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/30 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-salvaGold">
                      Min NGN Per Swap
                    </p>
                    <p className="text-[7px] sm:text-[10px] text-white/60 mt-0.5">
                      Current:{' '}
                      {toNum(pool.minNgnAmount) > 0
                        ? `${toNum(pool.minNgnAmount).toLocaleString('en-US', {
                            maximumFractionDigits: 2,
                          })} NGN`
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
                    className="w-full py-2 sm:py-3 rounded-xl bg-salvaGold/10 border border-salvaGold/25 text-salvaGold font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-salvaGold hover:text-black hover:border-salvaGold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2"
                  >
                    {txLoading && pinAction === 'minNgn' && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Min NGN
                  </button>
                </div>
              </div>

              {/* Min Token */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-white/60">
                      Min USD Per Swap
                    </p>
                    <p className="text-[7px] sm:text-[10px] text-white/60 mt-0.5">
                      Current:{' '}
                      {toNum(pool.minTokenAmount) > 0
                        ? `${toNum(pool.minTokenAmount).toLocaleString('en-US', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })} USD`
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
                    className="w-full py-2 sm:py-3 rounded-xl bg-white/5 border border-white/15 text-white/60 font-black text-[9px] sm:text-xs uppercase tracking-widest hover:bg-white/15 hover:text-white transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2"
                  >
                    {txLoading && pinAction === 'minToken' && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Min USD
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* ── PIN Modal ── */}
        <AnimatePresence>
          {pinVisible && (
            <PinModal
              title="Enter Transaction PIN"
              subtitle="Authorize this action via your Safe wallet"
              onConfirm={verifyPin}
              onCancel={() => setPinVisible(false)}
              loading={pinLoading}
              feeInfo={panelFee}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── Pool Card ────────────────────────────────────────────────────────────────
const PoolCard = ({ pool, index, onManage, onPublish, onRename, onDelete }) => {
  // Numeric totals — arithmetic on raw floats
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-salvaGold/20 transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-2.5 sm:p-3.5 space-y-2 sm:space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap mb-0.5">
              <p className="font-black text-salvaGold text-[10px] sm:text-sm truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <SubBadge pool={pool} />
            </div>
            <p className="font-mono text-[7px] sm:text-[9px] text-white/40 truncate">{pool.poolAddress}</p>
            {pool.subscriptionExpiresAt && new Date(pool.subscriptionExpiresAt) > new Date() && (
              <p className="text-[6px] sm:text-[8px] text-white/40 mt-0.5">
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

        {/* ── Token balances: 2×2 grid, spacious rows ── */}
        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <StatCell label="NGNs" value={toNum(pool.ngnsLiquidity)} color="#ffffff" />
          <StatCell label="cNGN" value={toNum(pool.cNgnLiquidity)} color="#ffffff" />
          <StatCell label="USDT" value={toNum(pool.usdtLiquidity)} color="#ffffff" />
          <StatCell label="USDC" value={toNum(pool.usdcLiquidity)} color="#ffffff" />
        </div>

        {/* Totals + Rates in one unified strip */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] overflow-hidden divide-y divide-white/[0.05]">
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            <span className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/50 font-black">
              NGN Total
            </span>
            <span className="font-black text-[10px] sm:text-sm text-salvaGold tabular-nums">
              {compactFmt(totalNgn)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/50 font-black">
              USD Total
            </span>
            <span className="font-black text-[10px] sm:text-base text-white tabular-nums">
              {compactFmt(totalUsd)}
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/50 font-black">
              Buy Rate
            </span>
            <span className="font-black text-[10px] sm:text-base text-white tabular-nums">
              ₦{toNum(pool.buyRate).toLocaleString()}
              <span className="text-[7px] sm:text-[10px] text-white/40 font-normal">/USD</span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/50 font-black">
              Sell Rate
            </span>
            <span className="font-black text-[10px] sm:text-base text-white tabular-nums">
              ₦{toNum(pool.sellRate).toLocaleString()}
              <span className="text-[7px] sm:text-[10px] text-white/40 font-normal">/USD</span>
            </span>
          </div>
        </div>

        {/* Action row */}
        <div className="flex gap-1 sm:gap-1.5">
          <button
            onClick={onManage}
            className="flex-1 py-1.5 sm:py-2 rounded-lg bg-white/5 border border-white/[0.07] text-white font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            ⚙ Manage
          </button>
          <button
            onClick={onPublish}
            className="flex-1 py-1.5 sm:py-2 rounded-lg bg-salvaGold text-black font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-salvaGold/20"
          >
            {pool.isPublished ? 'Extend' : 'Publish'}
          </button>
          <button
            onClick={onRename}
            className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 rounded-lg border border-salvaGold/25 text-salvaGold font-black text-[7px] sm:text-[10px] uppercase hover:bg-salvaGold/10 transition-all"
          >
            {pool.poolName ? '✎' : 'Name'}
          </button>
          <button
            onClick={onDelete}
            className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[7px] sm:text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all"
          >
            🗑
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ─── Main DeployPool ──────────────────────────────────────────────────────────
const DeployPool = ({ user, showMsg, onSwitchToLinkName }) => {
  const [poolFee, setPoolFee] = useState({ feeNGN: null, feeUSD: null, loading: false });
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
  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Fee-funds check — MetaMask-style pre-warning ─────────────────────────
  const [deployFeeFunds, setDeployFeeFunds] = useState(null);
  useEffect(() => {
    if (!user?.safeAddress) return;
    fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`)
      .then((r) => r.json())
      .then((d) => {
        setDeployFeeFunds({
          ngns: parseFloat(d.ngnsBalance || 0),
          cngn: parseFloat(d.cNgnBalance || 0),
          usdt: parseFloat(d.usdtBalance || 0),
          usdc: parseFloat(d.usdcBalance || 0),
        });
      })
      .catch(() => setDeployFeeFunds(null));
  }, [user?.safeAddress]);

  const hasNoDeployFeeFunds =
    deployFeeFunds &&
    deployFeeFunds.ngns <= 0 &&
    deployFeeFunds.cngn <= 0 &&
    deployFeeFunds.usdt <= 0 &&
    deployFeeFunds.usdc <= 0;
  useNetworkReminder();

  const fetchMyPools = useCallback(
    async (silent = false) => {
      if (!user?.safeAddress) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/pool/my/${user.safeAddress}`);
        const data = await res.json();
        setPools(data.pools || []);
      } catch (err) {
        console.warn('fetchMyPools error:', err.message);
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

  // Simulated ONLY when the user actually clicks Deploy — never eagerly on
  // tab load. See the Deploy button's onClick below.
  const fetchPoolFeeForPin = useCallback(() => {
    const key = 'base_pool';
    const cached = poolFeeCache.current[key];
    if (cached && Date.now() - cached.at < 30_000) {
      setPoolFee({ ...cached.data, loading: false });
      return;
    }
    setPoolFee({ feeNGN: null, feeUSD: null, loading: true });
    fetch(`${SALVA_API_URL}/api/estimate-pool-fee?chain=base`)
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
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
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
      if (pinAction === 'deploy') await executeDeploy(data.privateKey);
      if (pinAction === 'subscribe') await executeSubscribe(data.privateKey);
      if (pinAction === 'delete') await executeDelete(data.privateKey);
      if (pinAction === 'rename') await executeRename(data.privateKey);
    } catch {
      showMsg('Network error. Please check your connection and try again.', 'error');
      setPinVisible(false);
    } finally {
      setPinLoading(false);
    }
  };

  const executeDeploy = async (privateKey) => {
    setDeploying(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Deploy failed');
      showMsg('Pool deployed!');
      await fetchMyPools();
      setNewlyDeployedPool(data.poolAddress);
      setShowNamePrompt(true);
    } catch (err) {
      showMsg(err.message || 'Deployment failed — please try again.', 'error');
    } finally {
      setDeploying(false);
    }
  };

  const executeSubscribe = async (privateKey) => {
    if (!selectedPool) return;
    setSubscribing(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/subscribe`, {
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
        `Pool published! Expires ${new Date(data.subscriptionExpiresAt).toLocaleDateString(
          'en-US',
          { day: 'numeric', month: 'short', year: 'numeric' }
        )}`
      );
      await fetchMyPools();
    } catch (err) {
      showMsg(err.message || 'Subscription failed. Please try again.', 'error');
    } finally {
      setSubscribing(false);
      setSelectedPool(null);
    }
  };

  const executeDelete = async (privateKey) => {
    if (!deletingPool) return;
    setDeleting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: deletingPool.poolAddress,
          ownerSafeAddress: user.safeAddress,
          ownerPrivateKey: privateKey,
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
    } catch {
      showMsg('Could not remove pool — please try again', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeletingPool(null);
    }
  };

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
        body: JSON.stringify({
          name: renameInput,
          registryAddress: renameRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.message || 'Check failed');
        return;
      }
      if (data.reserved) {
        setRenameError('This name is reserved. Choose another.');
        return;
      }
      if (!data.available) {
        setRenameError('Name already taken. Try another.');
        return;
      }
      setRenameCheckResult(data);
      setRenameFee(null);
      setRenameFeeLoading(true);
      try {
        const feeRes = await fetch(`${SALVA_API_URL}/api/registry-fee`);
        const feeData = await feeRes.json();
        setRenameFee(feeRes.ok ? feeData.fee ?? 0 : 0);
      } catch {
        setRenameFee(0);
      } finally {
        setRenameFeeLoading(false);
      }
      setRenameStep('confirm');
    } catch {
      setRenameError('Network error. Try again.');
    } finally {
      setRenameChecking(false);
    }
  };

  const handleRenamePrepare = async () => {
    if (!renamingPool || !renameRegistry || !renameInput) return;
    setRenameLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          name: renameInput,
          walletToLink: renamingPool.poolAddress,
          registryAddress: renameRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.message || 'Preparation failed');
        setRenameStep('confirm');
        return;
      }
      if (data.reserved) {
        setRenameError('Name is reserved.');
        return;
      }
      if (data.lowBalance) {
        setRenameError(data.message || 'Insufficient NGNs for registration fee.');
        return;
      }
      setRenamePrepared(data);
      setPinAction('rename');
      setPinVisible(true);
    } catch {
      setRenameError('Network error during preparation.');
    } finally {
      setRenameLoading(false);
    }
  };

  const executeRename = async (privateKey) => {
    if (!renamingPool || !renamePrepared) return;
    setRenameLoading(true);
    setRenameStep('renaming');
    setShowRenameModal(false);
    try {
      if (renamingPool.poolName) {
        const unlinkRes = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safeAddress: user.safeAddress,
            weldedName: renamingPool.poolName.trim(),
            registryAddress: renamePrepared.registryAddress,
            userPrivateKey: privateKey,
          }),
        });
        if (!unlinkRes.ok) {
          showMsg('Failed to unlink old name', 'error');
          resetRenameModal();
          setRenameLoading(false);
          return;
        }
      }
      const execRes = await fetch(`${SALVA_API_URL}/api/alias/execute-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          pureName: renamePrepared.pureName,
          weldedName: renamePrepared.weldedName,
          walletToLink: renamePrepared.walletToLink,
          registryAddress: renamePrepared.registryAddress,
          signature: renamePrepared.signature,
          feeWei: renamePrepared.feeWei,
          userPrivateKey: privateKey,
        }),
      });
      if (!execRes.ok) {
        showMsg('Failed to link new name', 'error');
        resetRenameModal();
        setRenameLoading(false);
        return;
      }
      await fetch(`${SALVA_API_URL}/api/pool/set-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: renamingPool.poolAddress,
          ownerSafeAddress: user.safeAddress,
          poolName: renamePrepared.weldedName,
        }),
      }).catch(() => {});
      showMsg(`Pool renamed to "${renamePrepared.weldedName}"!`);
      await fetchMyPools();
    } catch {
      showMsg('Rename failed', 'error');
    } finally {
      resetRenameModal();
      setRenamingPool(null);
      setRenameLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3.5 sm:space-y-5 relative"
    >
      {/* Header + Deploy Button */}
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <h2 className="text-sm sm:text-lg font-black tracking-tight whitespace-nowrap">
            My Pools
          </h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 mt-1">
          <a
            href="/bnb"
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/[0.07] hover:bg-blue-500/[0.14] hover:border-blue-500/50 transition-all"
          >
            <span className="text-[6px] sm:text-[8px] font-black uppercase tracking-widest text-blue-400">
              BSC
            </span>
            <span className="text-blue-400 text-[6px] sm:text-[9px]">↗</span>
          </a>
          <button
            onClick={() => fetchMyPools(true)}
            disabled={loading || refreshing}
            className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            {loading || refreshing ? (
              <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            ) : (
              <span className="text-salvaGold text-xs sm:text-lg leading-none">↻</span>
            )}
          </button>
          <button
            onClick={() => {
              pendingAction.current = () => {
                setPinAction('deploy');
                setPinVisible(true);
                fetchPoolFeeForPin();
              };
              setShowNetworkReminder(true);
            }}
            disabled={deploying}
            className="flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 sm:px-5 sm:py-3 bg-salvaGold text-black font-black text-[9px] sm:text-xs uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-salvaGold/20"
          >
            {deploying && (
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            )}
            {deploying ? 'Deploying…' : '+ Deploy'}
          </button>
        </div>
      </div>

      {hasNoDeployFeeFunds && (
        <div className="flex items-center gap-2 sm:gap-2.5 px-3 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
          <span className="text-yellow-400 text-xs sm:text-sm flex-shrink-0">⚠️</span>
          <p className="text-[8px] sm:text-[11px] text-yellow-400/90 font-bold leading-snug">
            This may not go through — you have no NGNs, cNGN, USDT, or USDC to cover the network
            fee.
          </p>
        </div>
      )}

      {/* Info card */}
      <div className="p-2.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-[9px] sm:text-xs font-black text-salvaGold mb-0.5 sm:mb-1">
          How it works
        </p>
        <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
          Deploy your pool, add liquidity, set rates, then publish it. A subscription of{' '}
          <span className="font-black text-salvaGold">
            {subFees?.monthly?.toLocaleString() || '5,000'} NGN/month
          </span>{' '}
          keeps it visible on the swap marketplace. Time rolls over if you extend before expiry.
        </p>
      </div>

      {/* Pool list */}
      {loading ? (
        <div className="flex justify-center py-14 sm:py-20">
          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-14 sm:py-20 rounded-3xl border border-dashed border-white/[0.06] text-center"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-2.5 sm:mb-4">
            <span className="text-base sm:text-2xl">🏊</span>
          </div>
          <p className="font-black text-white/60 text-[10px] sm:text-sm mb-0.5 sm:mb-1">
            No pools yet
          </p>
          <p className="text-[8px] sm:text-[11px] text-white/60">
            Deploy your first pool to start earning as an LP
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
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

      {/* ── Manage Panel ── */}
      <AnimatePresence>
        {managingPool && (
          <PoolManagePanel
            pool={managingPool}
            user={user}
            showMsg={showMsg}
            onClose={() => setManagingPool(null)}
            onRefresh={async () => {
              await fetchMyPools(true);
              const res = await fetch(`${SALVA_API_URL}/api/pool/my/${user.safeAddress}`);
              const data = await res.json();
              const fresh = (data.pools || []).find(
                (p) => p.poolAddress === managingPool.poolAddress
              );
              if (fresh) setManagingPool(fresh);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Subscription Modal ── */}
      <AnimatePresence>
        {showSubModal && selectedPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-3 sm:px-4">
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
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
              <div className="p-5 sm:p-8">
                <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-1">
                  Marketplace
                </p>
                <h3 className="text-sm sm:text-xl font-black mb-1 text-white">Publish Pool</h3>
                <p className="text-[9px] sm:text-xs text-white/60 mb-3.5 sm:mb-5 leading-relaxed">
                  Subscribe to list your pool on the SWAP marketplace.
                  {selectedPool.isPublished && ' Remaining time is preserved.'}
                </p>
                <div className="space-y-1.5 sm:space-y-2 mb-3.5 sm:mb-5">
                  {subFees?.tiers?.map((tier) => (
                    <button
                      key={tier.months}
                      onClick={() => setSubTier(tier.months)}
                      className={`w-full flex items-center justify-between p-2.5 sm:p-4 rounded-xl border transition-all ${
                        subTier === tier.months
                          ? 'border-salvaGold bg-salvaGold/10'
                          : 'border-white/10 bg-white/5 hover:border-salvaGold/30'
                      }`}
                    >
                      <span className="font-black text-[10px] sm:text-sm text-white">
                        {tier.label}
                      </span>
                      <span
                        className={`font-black text-[10px] sm:text-sm ${
                          subTier === tier.months ? 'text-salvaGold' : 'text-white/60'
                        }`}
                      >
                        {tier.total.toLocaleString()} NGNs
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setShowSubModal(false)}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
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
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-50 shadow-lg shadow-salvaGold/20 transition-all"
                  >
                    Subscribe
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Name Prompt ── */}
      <AnimatePresence>
        {showNamePrompt && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-3 sm:px-4">
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
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
              <div className="p-5 sm:p-8">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <span className="text-base sm:text-2xl">🏷️</span>
                </div>
                <h3 className="text-sm sm:text-xl font-black mb-1.5 sm:mb-2 text-white">
                  Name Your Pool?
                </h3>
                <p className="text-[9px] sm:text-xs text-white/60 mb-1.5 sm:mb-2 leading-relaxed">
                  Give it a human-readable identity like{' '}
                  <span className="text-salvaGold font-black">mypool@salva</span>
                </p>
                <p className="font-mono text-[7px] sm:text-[10px] text-white/60 mb-4 sm:mb-6 break-all">
                  {newlyDeployedPool}
                </p>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setShowNamePrompt(false)}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      setShowNamePrompt(false);
                      if (onSwitchToLinkName && newlyDeployedPool)
                        onSwitchToLinkName(newlyDeployedPool);
                    }}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Delete Confirm ── */}
      <AnimatePresence>
        {showDeleteConfirm && deletingPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-3 sm:px-4">
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
              <div className="p-5 sm:p-8">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <span className="text-base sm:text-2xl">⚠️</span>
                </div>
                <h3 className="text-sm sm:text-xl font-black mb-1.5 sm:mb-2 text-white">
                  Delete Pool?
                </h3>
                <p className="text-[9px] sm:text-xs text-white/60 mb-1 leading-relaxed">
                  Removes from registry. Contract stays on-chain.
                </p>
                <p className="text-[9px] sm:text-xs text-red-400 font-bold mb-3 sm:mb-4">
                  Must have &lt;1,000 NGNs and &lt;$1 in stablecoins.
                </p>
                {deletingPool.poolName && (
                  <div className="mb-3.5 sm:mb-5 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                    <p className="text-[7px] sm:text-[10px] uppercase font-black text-yellow-400 tracking-widest mb-1">
                      Linked Name Detected
                    </p>
                    <p className="text-[9px] sm:text-xs text-white/60 leading-relaxed">
                      <span className="text-salvaGold font-black">{deletingPool.poolName}</span>{' '}
                      will be automatically unlinked on-chain.
                    </p>
                  </div>
                )}
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      if (deletingPool.poolName) {
                        setPinAction('delete');
                        setPinVisible(true);
                      } else executeDelete(null);
                    }}
                    disabled={deleting}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-red-500 text-white font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 transition-all"
                  >
                    {deleting && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {deleting ? 'Deleting…' : 'Yes, Delete'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Rename Modal ── */}
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
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />
              <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 border-b border-white/[0.05] flex items-center justify-between">
                <div>
                  <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-0.5">
                    Salva NS
                  </p>
                  <h3 className="text-sm sm:text-xl font-black text-white">Rename Pool</h3>
                  <p className="font-mono text-[7px] sm:text-[10px] text-white/60 truncate mt-0.5">
                    {renamingPool.poolAddress}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    resetRenameModal();
                  }}
                  className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors text-[10px] sm:text-base"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-5">
                {renamingPool.poolName && (
                  <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-[7px] sm:text-[10px] uppercase font-black text-white/60 tracking-widest flex-shrink-0">
                      Current
                    </span>
                    <span className="text-salvaGold font-black text-[10px] sm:text-sm truncate flex-1">
                      {renamingPool.poolName}
                    </span>
                    <span className="text-[7px] sm:text-[9px] text-white/60 font-bold flex-shrink-0">
                      will unlink
                    </span>
                  </div>
                )}

                {renameStep === 'form' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2.5 sm:space-y-4"
                  >
                    <div>
                      <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black block mb-1.5 sm:mb-2">
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
                        <p className="text-[7px] sm:text-[10px] text-salvaGold/60 font-bold mt-1 sm:mt-1.5 ml-1">
                          Preview: {renameInput}
                          {renameRegistry.nspace}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black block mb-1.5 sm:mb-2">
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
                      <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-[10px] sm:text-xs flex-shrink-0">⚠</span>
                        <p className="text-[9px] sm:text-xs text-red-400 font-bold">
                          {renameError}
                        </p>
                      </div>
                    )}
                    <button
                      onClick={handleRenameCheck}
                      disabled={renameChecking || !renameInput || !renameRegistry}
                      className="w-full py-2.5 sm:py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-40 uppercase tracking-widest text-[10px] sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-salvaGold/20"
                    >
                      {renameChecking && (
                        <span className="w-2.5 h-2.5 sm:w-4 sm:h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                      )}
                      {renameChecking ? 'Checking…' : 'Check Availability'}
                    </button>
                  </motion.div>
                )}

                {renameStep === 'confirm' && renameCheckResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2.5 sm:space-y-4"
                  >
                    <div className="p-3.5 sm:p-5 rounded-2xl bg-salvaGold/8 border border-salvaGold/20 text-center">
                      <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.3em] font-black text-salvaGold/50 mb-1.5 sm:mb-2">
                        Name Available
                      </p>
                      <p className="text-base sm:text-2xl font-black text-salvaGold">
                        {renameCheckResult.welded}
                      </p>
                    </div>
                    {renameFeeLoading ? (
                      <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
                        <p className="text-[9px] sm:text-xs text-salvaGold font-bold">
                          Fetching registration fee…
                        </p>
                      </div>
                    ) : renameFee !== null && renameFee > 0 ? (
                      <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[7px] sm:text-[10px] uppercase font-black text-white/60 tracking-widest">
                          Registration Fee
                        </p>
                        <p className="font-black text-white text-[10px] sm:text-sm">
                          {renameFee?.toLocaleString()}{' '}
                          <span className="text-salvaGold text-[8px] sm:text-xs">NGNs</span>
                        </p>
                      </div>
                    ) : renameFee === 0 ? (
                      <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl bg-green-500/8 border border-green-500/15">
                        <span className="text-green-400 text-[10px] sm:text-sm flex-shrink-0">
                          ✦
                        </span>
                        <p className="text-[9px] sm:text-xs font-black text-green-400">
                          Free Registration
                        </p>
                      </div>
                    ) : null}
                    {renamingPool.poolName && (
                      <div className="p-2.5 sm:p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                        <p className="text-[7px] sm:text-[10px] uppercase font-black text-yellow-400 tracking-widest mb-1.5 sm:mb-2">
                          What Happens
                        </p>
                        <p className="text-[9px] sm:text-xs text-white/60 leading-relaxed">
                          1.{' '}
                          <span className="text-red-400 font-black">{renamingPool.poolName}</span>{' '}
                          unlinked on-chain
                          <br />
                          2.{' '}
                          <span className="text-salvaGold font-black">
                            {renameCheckResult.welded}
                          </span>{' '}
                          linked to this pool
                        </p>
                      </div>
                    )}
                    {renameError && (
                      <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-[10px] sm:text-xs">⚠</span>
                        <p className="text-[9px] sm:text-xs text-red-400 font-bold">
                          {renameError}
                        </p>
                      </div>
                    )}
                    <div className="flex gap-2 sm:gap-3 pt-0.5 sm:pt-1">
                      <button
                        onClick={() => setRenameStep('form')}
                        className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 font-bold text-[10px] sm:text-sm text-white hover:bg-white/5 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRenamePrepare}
                        disabled={renameLoading || renameFeeLoading}
                        className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-[10px] sm:text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-salvaGold/20 transition-all"
                      >
                        {renameLoading && (
                          <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
                    className="py-11 sm:py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-2.5 sm:space-y-4"
                  >
                    <div className="relative w-10 h-10 sm:w-14 sm:h-14 mx-auto">
                      <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-salvaGold animate-spin" />
                      <div className="absolute inset-2 rounded-full bg-salvaGold/10 flex items-center justify-center">
                        <span className="text-salvaGold text-[9px] sm:text-sm font-black">₦</span>
                      </div>
                    </div>
                    <p className="font-black text-white text-xs sm:text-base">Renaming on-chain…</p>
                    <p className="text-[9px] sm:text-xs text-white/60">
                      Unlinking old, linking new · 60–90 seconds
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIN Modal ── */}
      <AnimatePresence>
        {pinVisible && (
          <PinModal
            title="Enter Transaction PIN"
            subtitle={
              pinAction === 'deploy'
                ? 'Sign pool deployment via your Safe'
                : pinAction === 'subscribe'
                ? 'Authorize subscription payment from your Safe'
                : pinAction === 'delete'
                ? 'Authorize pool deletion via your Safe'
                : pinAction === 'rename'
                ? 'Sign rename — unlink old, link new'
                : 'Enter your PIN'
            }
            onConfirm={handlePinConfirm}
            onCancel={() => setPinVisible(false)}
            loading={pinLoading}
            feeInfo={pinAction === 'deploy' ? poolFee : undefined}
          />
        )}
      </AnimatePresence>

      {/* Network Reminder Modal - Root Level */}
      <AnimatePresence>
        {showNetworkReminder && (
          <NetworkReminder
            chain="base"
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
    </motion.div>
  );
};

export default DeployPool;