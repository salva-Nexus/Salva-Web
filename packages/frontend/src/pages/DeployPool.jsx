// src/pages/DeployPool.jsx  (Base Chain / L2)
// Rewritten against the updated pool API (see notes at bottom of file).
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from "../config";
import { createPortal } from 'react-dom';

// ─── Chain constants — this file is the BASE build. The BNB build is a ───────
// mirror of this file with CHAIN='bnb', BALANCE_PREFIX='bnb', and the gold
// accent swapped for blue (exactly like the old DeployPool/BNBDeployPool pair).
const CHAIN = "base";
const BALANCE_PREFIX = "base";
const SUBSCRIPTION_MONTHLY_FEE_NGN = 1500;
const _poolsCache = { pools: null };

// ─── Shared helpers ───────────────────────────────────────────────────────────
const darkInput =
  "w-full p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-xs sm:text-sm text-white placeholder:text-white/60 transition-all";

const toNum = (v) => parseFloat(v || 0) || 0;

const smartFmt = (n) => {
  const num = toNum(n);
  if (isNaN(num)) return "0";
  const str = num.toString();
  if (!str.includes(".")) return num.toLocaleString("en-US");
  const decimals = str.split(".")[1].replace(/0+$/, "").length;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

const compactFmt = (n) => {
  const num = toNum(n);
  if (num >= 1_000_000)
    return (
      (num / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 }) +
      "M"
    );
  if (num >= 100_000)
    return (
      (num / 1_000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + "K"
    );
  if (num >= 10_000)
    return (
      (num / 1_000).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "K"
    );
  if (num === Math.floor(num)) return num.toLocaleString("en-US");
  return num.toLocaleString("en-US", { maximumFractionDigits: 4 });
};

const validateNameLocally = (val) => {
  if (!val) return "Name is required";
  if (val.includes("0") || val.includes("1"))
    return "Digits 0 and 1 are not allowed";
  if (!/^[a-z2-9.]+$/.test(val))
    return "Only lowercase a–z, digits 2–9, one dot";
  if ((val.match(/\./g) || []).length > 1) return "Only one dot allowed";
  if (val.startsWith(".") || val.endsWith("."))
    return "Cannot start or end with a dot";
  if (val.length > 32) return "Max 32 characters";
  if (val.length < 2) return "At least 2 characters required";
  return "";
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
  const [coords, setCoords] = useState({ left: 0, width: 0, bottom: 0 });
  const ref = React.useRef(null);
  const inputRef = React.useRef(null);

  const filtered = registries.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.nspace || '').toLowerCase().includes(query.toLowerCase())
  );

  const updateCoords = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    setCoords({
      left: rect.left,
      width: rect.width,
      bottom: window.innerHeight - rect.top + 8,
    });
  };

  const openDropdown = () => {
    updateCoords();
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  React.useEffect(() => {
    if (!open) return;
    const handler = () => updateCoords();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  React.useEffect(() => {
    const h = (e) => {
      if (
        ref.current &&
        !ref.current.contains(e.target) &&
        !e.target.closest('[data-registry-portal]')
      ) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (!value) openDropdown();
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !value) {
            e.preventDefault();
            openDropdown();
          }
        }}
        className={`w-full flex items-center justify-between gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 sm:py-3.5 rounded-xl border transition-all text-left cursor-pointer ${
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
              <p className="text-[7px] sm:text-[10px] text-white/60 font-mono truncate">
                {value.nspace}
              </p>
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
            onClick={(e) => {
              e.stopPropagation();
              if (open) {
                setOpen(false);
                setQuery('');
              } else {
                openDropdown();
              }
            }}
            className="w-3.5 h-3.5 sm:w-5 sm:h-5 flex items-center justify-center"
          >
            <svg
              className={`w-2 h-2 sm:w-3 sm:h-3 text-white/60 transition-transform ${
                open ? 'rotate-180' : ''
              }`}
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
      </div>

      {open &&
        createPortal(
          <AnimatePresence>
            <motion.div
              data-registry-portal
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{
                position: 'fixed',
                left: coords.left,
                width: coords.width,
                bottom: coords.bottom,
                zIndex: 9999,
              }}
              className="bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
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
                      className={`w-full flex items-center gap-2 sm:gap-3 px-3 py-2 sm:px-4 sm:py-3 hover:bg-salvaGold/5 transition-colors text-left ${
                        value?.registryAddress === reg.registryAddress ? 'bg-salvaGold/10' : ''
                      }`}
                    >
                      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-salvaGold/15 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
                        <span className="text-salvaGold text-[9px] sm:text-xs font-black">
                          {reg.name.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-black text-[10px] sm:text-sm text-white">{reg.name}</p>
                        <p className="text-[7px] sm:text-[10px] font-mono text-white/60">
                          {reg.nspace}
                        </p>
                      </div>
                      {value?.registryAddress === reg.registryAddress && (
                        <span className="text-salvaGold text-[10px] sm:text-sm">✓</span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body
        )}
    </div>
  );
};

// ─── PIN Modal ────────────────────────────────────────────────────────────────
// feeInfo (optional) shape: { feeNGN, feeUsd, loading }. When omitted, no
// network-fee row is shown (rate updates / pause / unpause never estimate a
// fee per the current API — the user just signs).
const PinModal = ({
  title,
  subtitle,
  onConfirm,
  onCancel,
  loading,
  feeInfo,
}) => {
  const [pin, setPin] = useState("");
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
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="p-5 sm:p-8 text-center">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔐</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black mb-1 text-white">
            {title}
          </h3>
          <p className="text-[9px] sm:text-xs text-white/60 mb-4 sm:mb-6 leading-relaxed">
            {subtitle}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
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
                <span className="text-red-400 font-black">
                  ₦{smartFmt(feeInfo.feeNGN)}
                  {feeInfo.feeUsd != null
                    ? ` (~$${smartFmt(feeInfo.feeUsd)})`
                    : ""}
                </span>
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
              disabled={loading || pin.length !== 4}
              className="flex-1 py-2.5 sm:py-3.5 rounded-2xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 transition-all"
            >
              {loading && (
                <span className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              {loading ? "Verifying…" : "Confirm"}
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
  const expiry = pool.subscriptionExpiresAt
    ? new Date(pool.subscriptionExpiresAt)
    : null;
  const active = pool.isSubscribed && expiry && expiry > now;
  const msLeft = active ? expiry - now : 0;
  const mins = Math.ceil(msLeft / 60_000);
  const hours = Math.ceil(msLeft / 3_600_000);
  const days = Math.ceil(msLeft / 864e5);
  const timeLabel =
    mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;

  if (pool.isPaused) {
    return (
      <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black uppercase border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
        {active ? `Paused · ${timeLabel} left` : "Paused"}
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

// ─── Stat Cell ────────────────────────────────────────────────────────────────
const StatCell = ({ label, value, color }) => (
  <div className="px-2 py-2 sm:px-3 sm:py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
    <p className="text-[7px] sm:text-[10px] uppercase tracking-wide text-white/50 font-black flex-shrink-0">
      {label}
    </p>
    <p
      className="font-black text-[10px] sm:text-sm tabular-nums flex-shrink-0"
      style={{ color }}
      title={smartFmt(value)}
    >
      {compactFmt(value)}
    </p>
  </div>
);

// ─── Section Tab Row (min-liquidity controls removed — deprecated) ───────────
const SectionTabs = ({ active, onChange }) => (
  <div className="flex gap-1 sm:gap-1.5">
    {["liquidity", "rates", "controls"].map((s) => (
      <button
        key={s}
        onClick={() => onChange(s)}
        className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[9px] font-black uppercase tracking-widest transition-all ${
          active === s
            ? "bg-salvaGold text-black shadow-lg shadow-salvaGold/20"
            : "bg-white/5 border border-white/[0.06] text-white/60 hover:text-white/60"
        }`}
      >
        {s}
      </button>
    ))}
  </div>
);

// ─── Pool Manage Panel ────────────────────────────────────────────────────────
// pool prop already carries balances/rate/pause state merged in by the parent
// (fetchPoolFullData). onRefresh re-pulls all four detail endpoints for just
// this pool and hands the parent a fresh merged object.
const PoolManagePanel = ({ pool, user, showMsg, onClose, onRefresh }) => {
  const [activeSection, setActiveSection] = useState("liquidity");
  const [panelFee, setPanelFee] = useState({
    feeNGN: null,
    feeUsd: null,
    loading: false,
  });
  const [liqAsset, setLiqAsset] = useState("NGNS");
  const [liqAmount, setLiqAmount] = useState("");
  const [liqMode, setLiqMode] = useState("provide");
  const [buyRate, setBuyRate] = useState(toNum(pool.buyRate).toString());
  const [sellRate, setSellRate] = useState(toNum(pool.sellRate).toString());
  const [pinVisible, setPinVisible] = useState(false);
  const [pinAction, setPinAction] = useState(null);
  const [pinLoading, setPinLoading] = useState(false);
  const [txLoading, setTxLoading] = useState(false);

  const assets = ["NGNS", "CNGN", "USDT", "USDC"];

  // Liquidity fee is the ONLY manage-panel action that estimates a fee.
  // GET /api/pool/estimate-provide-remove-liquidity-fee/:chain/:type — no
  // body, doesn't depend on asset/amount, just the operation type.
  const fetchLiquidityFee = useCallback((type) => {
    setPanelFee({ feeNGN: null, feeUsd: null, loading: true });
    fetch(
      `${SALVA_API_URL}/api/user/estimate-provide-remove-liquidity-fee/${CHAIN}/${type}`,
    )
      .then((r) => r.json())
      .then((d) =>
        setPanelFee({
          feeNGN: d?.data?.feeNGN ?? null,
          feeUsd: d?.data?.feeUsd ?? null,
          loading: false,
        }),
      )
      .catch(() => setPanelFee({ feeNGN: null, feeUsd: null, loading: false }));
  }, []);

  const rawBalanceForAsset = (asset) => {
    if (asset === "NGNS") return toNum(pool.ngnsLiquidity);
    if (asset === "CNGN") return toNum(pool.cNgnLiquidity);
    if (asset === "USDT") return toNum(pool.usdtLiquidity);
    if (asset === "USDC") return toNum(pool.usdcLiquidity);
    return 0;
  };

  const rawBalanceStringForAsset = (asset) => {
    if (asset === "NGNS") return String(pool.ngnsLiquidity ?? "0");
    if (asset === "CNGN") return String(pool.cNgnLiquidity ?? "0");
    if (asset === "USDT") return String(pool.usdtLiquidity ?? "0");
    if (asset === "USDC") return String(pool.usdcLiquidity ?? "0");
    return "0";
  };

  const verifyPin = async (pin) => {
    setPinLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg("Invalid PIN", "error");
        return;
      }
      setPinVisible(false);
      const pkey = data.privateKey;
      if (pinAction === "provide") await executeLiquidity(pkey, "provide");
      else if (pinAction === "remove") await executeLiquidity(pkey, "remove");
      else if (pinAction === "buyRate")
        await executeUpdateRate(pkey, "buy", buyRate);
      else if (pinAction === "sellRate")
        await executeUpdateRate(pkey, "sell", sellRate);
      else if (pinAction === "pause") await executeUpdateState(pkey, "pause");
      else if (pinAction === "unpause")
        await executeUpdateState(pkey, "unpause");
    } catch {
      showMsg("Network error", "error");
    } finally {
      setPinLoading(false);
    }
  };

  const executeLiquidity = async (pkey, type) => {
    if (!liqAmount || parseFloat(liqAmount) <= 0) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/liquidity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey,
          poolAddress: pool.poolAddress,
          asset: liqAsset,
          amount: liqAmount,
          chain: CHAIN,
          type,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.message || "Failed");
      showMsg(
        type === "provide"
          ? `${liqAmount} ${liqAsset} sent to pool!`
          : `${liqAmount} ${liqAsset} withdrawn!`,
      );
      setLiqAmount("");
      onRefresh();
    } catch (err) {
      showMsg(
        err.message || "Liquidity transaction failed. Please try again.",
        "error",
      );
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateRate = async (pkey, type, rateValue) => {
    if (rateValue === "" || rateValue === undefined) return;
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/update-rate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey,
          poolAddress: pool.poolAddress,
          rate: rateValue,
          type,
          chain: CHAIN,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.message || "Failed");
      showMsg(type === "buy" ? "Buy rate updated!" : "Sell rate updated!");
      onRefresh();
    } catch (err) {
      showMsg(err.message || "Failed to update rate.", "error");
    } finally {
      setTxLoading(false);
    }
  };

  const executeUpdateState = async (pkey, state) => {
    setTxLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/update-state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey,
          poolAddress: pool.poolAddress,
          state,
          chain: CHAIN,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status) throw new Error(data.message || "Failed");
      showMsg(state === "pause" ? "Pool paused." : "Pool unpaused.");
      onRefresh();
    } catch (err) {
      showMsg(err.message || "Failed", "error");
    } finally {
      setTxLoading(false);
    }
  };

  const triggerPin = (action) => {
    setPinAction(action);
    setPinVisible(true);
    if (action === "provide" || action === "remove") fetchLiquidityFee(action);
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
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
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
                {pool.poolName || "Unnamed Pool"}
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

        <div className="px-3 py-1.5 sm:px-4 sm:py-2 border-b border-white/[0.05]">
          <SectionTabs active={activeSection} onChange={setActiveSection} />
        </div>

        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3">
          {/* ── LIQUIDITY ── */}
          {activeSection === "liquidity" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 sm:space-y-4"
            >
              <div className="flex gap-1.5 sm:gap-2">
                {["provide", "remove"].map((m) => (
                  <button
                    key={m}
                    onClick={() => setLiqMode(m)}
                    className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[10px] font-black uppercase tracking-widest border transition-all ${
                      liqMode === m
                        ? m === "provide"
                          ? "bg-salvaGold text-black border-salvaGold shadow-lg shadow-salvaGold/20"
                          : "bg-red-500/10 border-red-500/30 text-red-400"
                        : "border-white/10 bg-white/5 text-white/60 hover:text-white/50"
                    }`}
                  >
                    {m === "provide" ? "↑ Add Liquidity" : "↓ Remove Liquidity"}
                  </button>
                ))}
              </div>

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
                          setLiqAmount("");
                        }}
                        className={`flex items-center justify-between px-2 py-2 sm:px-3 sm:py-2.5 rounded-lg border transition-all ${
                          liqAsset === a
                            ? "bg-salvaGold/10 border-salvaGold/40"
                            : "border-white/[0.06] bg-white/5 hover:border-white/20"
                        }`}
                      >
                        <span
                          className={`text-[9px] sm:text-xs font-black uppercase ${liqAsset === a ? "text-salvaGold" : "text-white/60"}`}
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

              <div>
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Amount
                  </label>
                  {liqMode === "remove" && (
                    <button
                      type="button"
                      onClick={() =>
                        setLiqAmount(rawBalanceStringForAsset(liqAsset))
                      }
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
                {liqMode === "provide" && (
                  <p className="text-[7px] sm:text-[10px] text-white/60 mt-1 sm:mt-1.5 leading-relaxed">
                    Tokens sent from your Safe wallet directly to the pool
                    contract.
                  </p>
                )}
              </div>

              <button
                onClick={() => triggerPin(liqMode)}
                disabled={!liqAmount || parseFloat(liqAmount) <= 0 || txLoading}
                className={`w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 active:scale-[0.98] shadow-lg ${
                  liqMode === "provide"
                    ? "bg-salvaGold text-black shadow-salvaGold/20"
                    : "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white"
                }`}
              >
                {txLoading && (
                  <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                )}
                {txLoading
                  ? "Processing…"
                  : liqMode === "provide"
                    ? `Add ${liqAsset}`
                    : `Remove ${liqAsset}`}
              </button>
            </motion.div>
          )}

          {/* ── RATES (no fee estimate — sign directly) ── */}
          {activeSection === "rates" && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-2.5 sm:space-y-4"
            >
              <div className="px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
                  Rates in{" "}
                  <span className="font-black text-salvaGold">NGN per USD</span>
                  . Each rate saves as a separate on-chain transaction.
                </p>
              </div>

              <div className="rounded-2xl border border-green-500/20 bg-green-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-green-500/30 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-green-400">
                      Buy Rate
                    </p>
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
                    onClick={() => triggerPin("buyRate")}
                    disabled={txLoading || buyRate === ""}
                    className="w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500 hover:text-black hover:border-green-500"
                  >
                    {txLoading && pinAction === "buyRate" && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Buy Rate On-Chain
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] overflow-hidden">
                <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                <div className="p-2.5 sm:p-3.5 space-y-1.5 sm:space-y-2.5">
                  <div>
                    <p className="text-[9px] sm:text-xs font-black text-blue-400">
                      Sell Rate
                    </p>
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
                    onClick={() => triggerPin("sellRate")}
                    disabled={txLoading || sellRate === ""}
                    className="w-full py-2 sm:py-3 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 bg-blue-500/10 border border-blue-500/25 text-blue-400 hover:bg-blue-500 hover:text-black hover:border-blue-500"
                  >
                    {txLoading && pinAction === "sellRate" && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                    )}
                    Set Sell Rate On-Chain
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── CONTROLS (pause/unpause only — min-NGN/min-USD deprecated) ── */}
          {activeSection === "controls" && (
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
                  Pausing stops all swaps. Liquidity is safe — only you can
                  unpause.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  onClick={() => triggerPin("pause")}
                  disabled={txLoading}
                  className="py-1.5 sm:py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:bg-yellow-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={() => triggerPin("unpause")}
                  disabled={txLoading}
                  className="py-1.5 sm:py-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 font-black text-[7px] sm:text-[10px] uppercase tracking-widest hover:bg-green-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ▶ Unpause
                </button>
              </div>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {pinVisible && (
            <PinModal
              title="Enter Transaction PIN"
              subtitle="Authorize this action via your Safe wallet"
              onConfirm={verifyPin}
              onCancel={() => setPinVisible(false)}
              loading={pinLoading}
              feeInfo={
                pinAction === "provide" || pinAction === "remove"
                  ? panelFee
                  : undefined
              }
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── Pool Card ────────────────────────────────────────────────────────────────
const PoolCard = ({ pool, index, onManage, onPublish, onName, onDelete }) => {
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
                {pool.poolName || "Unnamed Pool"}
              </p>
              <SubBadge pool={pool} />
            </div>
            <p className="font-mono text-[7px] sm:text-[9px] text-white/40 truncate">
              {pool.poolAddress}
            </p>
            {pool.isSubscribed && pool.subscriptionExpiresAt && (
              <p className="text-[6px] sm:text-[8px] text-white/40 mt-0.5">
                Expires{" "}
                {new Date(pool.subscriptionExpiresAt).toLocaleDateString(
                  "en-US",
                  { day: "numeric", month: "short", year: "numeric" },
                )}
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
          <StatCell
            label="NGNs"
            value={toNum(pool.ngnsLiquidity)}
            color="#ffffff"
          />
          <StatCell
            label="cNGN"
            value={toNum(pool.cNgnLiquidity)}
            color="#ffffff"
          />
          <StatCell
            label="USDT"
            value={toNum(pool.usdtLiquidity)}
            color="#ffffff"
          />
          <StatCell
            label="USDC"
            value={toNum(pool.usdcLiquidity)}
            color="#ffffff"
          />
        </div>

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
              <span className="text-[7px] sm:text-[10px] text-white/40 font-normal">
                /USD
              </span>
            </span>
          </div>
          <div className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3">
            <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/50 font-black">
              Sell Rate
            </span>
            <span className="font-black text-[10px] sm:text-base text-white tabular-nums">
              ₦{toNum(pool.sellRate).toLocaleString()}
              <span className="text-[7px] sm:text-[10px] text-white/40 font-normal">
                /USD
              </span>
            </span>
          </div>
        </div>

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
            {pool.isSubscribed ? "Extend" : "Publish"}
          </button>
          <button
            onClick={onName}
            className="py-1.5 px-1.5 sm:py-2 sm:px-2.5 rounded-lg border border-salvaGold/25 text-salvaGold font-black text-[7px] sm:text-[10px] uppercase hover:bg-salvaGold/10 transition-all"
          >
            {pool.poolName ? "✎" : "Name"}
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

// ─── Pool Name Modal ──────────────────────────────────────────────────────────
// Handles both first-time naming AND renaming, entirely inline (no tab
// switch). If `existingName` is passed, on confirm we unlink the old name
// first, then link the new one — both signed by the same PIN entry, using
// POST /api/pool/nameAlias (type: 'unlink' | 'link').
const PoolNameModal = ({
  poolAddress,
  existingName,
  registries,
  user,
  showMsg,
  onClose,
  onDone,
}) => {
  const [step, setStep] = useState("form"); // form | reserved | confirm | pin | linking | success
  const [nameInput, setNameInput] = useState("");
  const [registry, setRegistry] = useState(
    registries.length === 1 ? registries[0] : null,
  );
  const [nameError, setNameError] = useState("");
  const [checking, setChecking] = useState(false);
  const [weldedName, setWeldedName] = useState("");
  const [linkFee, setLinkFee] = useState(null);
  const [linkFeeLoading, setLinkFeeLoading] = useState(false);
  const [oldRegistryAddress, setOldRegistryAddress] = useState(null);
  const [reservedEmail, setReservedEmail] = useState("");
  const [reservedSubmitting, setReservedSubmitting] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [finalError, setFinalError] = useState("");

  const handleCheck = async () => {
    const err = validateNameLocally(nameInput);
    if (err) return setNameError(err);
    if (!registry)
      return setNameError("Select which wallet service this name belongs to");
    setNameError("");
    setChecking(true);
    try {
      const welded = `${nameInput}${registry.nspace}`;
      const isAvailRes = await fetch(
        `${SALVA_API_URL}/api/name/isAvail/${welded}/${registry.registryAddress}`,
      );
      const isAvailData = await isAvailRes.json();
      if (isAvailData.reserved) {
        setWeldedName(welded);
        setStep("reserved");
        return;
      }
      if (isAvailData.status) {
        setNameError("This name is already taken. Try another.");
        return;
      }
      setWeldedName(welded);

      // Fetch link fee, and (if renaming) unlink fee + the OLD name's registry
      // address via /api/pool/single-pool — never trust a cached registry.
      setLinkFeeLoading(true);
      const jobs = [
        fetch(`${SALVA_API_URL}/api/user/linkFee`)
          .then((r) => r.json())
          .then((d) => setLinkFee(d.status ? d.data : "0"))
          .catch(() => setLinkFee("0")),
      ];
      if (existingName) {
        jobs.push(
          fetch(`${SALVA_API_URL}/api/pool/single-pool/${poolAddress}/${CHAIN}`)
            .then((r) => r.json())
            .then((d) =>
              setOldRegistryAddress(d?.pool?.registryAddress || null),
            )
            .catch(() => setOldRegistryAddress(null)),
        );
      }
      await Promise.all(jobs);
      setLinkFeeLoading(false);
      setStep("confirm");
    } catch {
      setNameError("Network error. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const handleSendReserved = async () => {
    if (!reservedEmail) return;
    setReservedSubmitting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/notify-reserved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput,
          requesterEmail: reservedEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("Your request has been sent to our team!");
        onClose();
      } else showMsg(data.message || "Failed to send", "error");
    } catch {
      showMsg("Network error", "error");
    } finally {
      setReservedSubmitting(false);
    }
  };

  const handleConfirmPin = async (pin) => {
    setPinLoading(true);
    setFinalError("");
    try {
      const verifyRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        showMsg("Invalid PIN", "error");
        setPinLoading(false);
        return;
      }
      const pkey = verifyData.privateKey;
      setStep("linking");

      if (existingName) {
        const unlinkRes = await fetch(`${SALVA_API_URL}/api/pool/nameAlias`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: user.email,
            pkey,
            name: existingName,
            poolAddress,
            registry: oldRegistryAddress,
            type: "unlink",
            chain: CHAIN,
          }),
        });
        const unlinkData = await unlinkRes.json();
        if (!unlinkRes.ok || !unlinkData.status) {
          setFinalError("Failed to unlink the old name.");
          setStep("confirm");
          setPinLoading(false);
          return;
        }
      }

      const linkRes = await fetch(`${SALVA_API_URL}/api/pool/nameAlias`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey,
          name: nameInput,
          poolAddress,
          registry: registry.registryAddress,
          type: "link",
          chain: CHAIN,
        }),
      });
      const linkData = await linkRes.json();
      if (!linkRes.ok || !linkData.status) {
        if (existingName) {
          setFinalError(
            "The new name could not be linked. You can retry from here.",
          );
          setStep("confirm");
        } else {
          setFinalError(
            "Pool deployed, but the name could not be linked. Use the Link Name button on the pool card to try again.",
          );
          setStep("failed");
        }
        setPinLoading(false);
        return;
      }
      setStep("success");
    } catch {
      setFinalError("Network error during linking.");
      setStep("confirm");
    } finally {
      setPinLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => step !== "linking" && onClose()}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />
        <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4 border-b border-white/[0.05] flex items-center justify-between">
          <div>
            <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-0.5">
              Salva NS
            </p>
            <h3 className="text-sm sm:text-xl font-black text-white">
              {existingName ? "Rename Pool" : "Name Your Pool"}
            </h3>
            <p className="font-mono text-[7px] sm:text-[10px] text-white/60 truncate mt-0.5">
              {poolAddress}
            </p>
          </div>
          {step !== "linking" && (
            <button
              onClick={onClose}
              className="w-6 h-6 sm:w-8 sm:h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors text-[10px] sm:text-base"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-3.5 sm:space-y-5">
          {existingName && (
            <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <span className="text-[7px] sm:text-[10px] uppercase font-black text-white/60 tracking-widest flex-shrink-0">
                Current
              </span>
              <span className="text-salvaGold font-black text-[10px] sm:text-sm truncate flex-1">
                {existingName}
              </span>
              <span className="text-[7px] sm:text-[9px] text-white/60 font-bold flex-shrink-0">
                will unlink
              </span>
            </div>
          )}

          {step === "form" && (
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
                  value={nameInput}
                  onChange={(e) => {
                    let cleaned = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z2-9.]/g, "");
                    const firstDot = cleaned.indexOf(".");
                    if (firstDot !== -1)
                      cleaned =
                        cleaned.slice(0, firstDot + 1) +
                        cleaned.slice(firstDot + 1).replace(/\./g, "");
                    setNameInput(cleaned);
                    setNameError("");
                  }}
                  maxLength={32}
                  className={darkInput}
                />
                {nameInput && registry && (
                  <p className="text-[7px] sm:text-[10px] text-salvaGold/60 font-bold mt-1 sm:mt-1.5 ml-1">
                    Preview: {nameInput}
                    {registry.nspace}
                  </p>
                )}
              </div>
              <div>
                <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black block mb-1.5 sm:mb-2">
                  Wallet Service
                </label>
                <RegistryDropdown
                  registries={registries}
                  value={registry}
                  onChange={(r) => {
                    setRegistry(r);
                    setNameError("");
                  }}
                />
              </div>
              {nameError && (
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                  <span className="text-red-400 text-[10px] sm:text-xs flex-shrink-0">
                    ⚠
                  </span>
                  <p className="text-[9px] sm:text-xs text-red-400 font-bold">
                    {nameError}
                  </p>
                </div>
              )}
              <button
                onClick={handleCheck}
                disabled={checking || !nameInput || !registry}
                className="w-full py-2.5 sm:py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-40 uppercase tracking-widest text-[10px] sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-salvaGold/20"
              >
                {checking && (
                  <span className="w-2.5 h-2.5 sm:w-4 sm:h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                )}
                {checking ? "Checking…" : "Check Availability"}
              </button>
            </motion.div>
          )}

          {step === "reserved" && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 sm:p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 space-y-3.5 sm:space-y-5"
            >
              <div className="flex items-start gap-2.5 sm:gap-4">
                <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm sm:text-lg">⭐</span>
                </div>
                <div>
                  <p className="font-black text-white text-[10px] sm:text-sm">
                    Reserved Name
                  </p>
                  <p className="text-[8px] sm:text-[11px] text-white/60 mt-0.5 leading-relaxed">
                    <span className="text-salvaGold font-black">
                      {weldedName}
                    </span>{" "}
                    is reserved. Share your email and we'll reach out about
                    eligibility.
                  </p>
                </div>
              </div>
              <input
                type="email"
                placeholder="your@email.com"
                value={reservedEmail}
                onChange={(e) => setReservedEmail(e.target.value)}
                className={darkInput}
              />
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={() => setStep("form")}
                  className="flex-1 py-2 sm:py-3 rounded-xl border border-white/10 font-bold text-[10px] sm:text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleSendReserved}
                  disabled={reservedSubmitting || !reservedEmail}
                  className="flex-1 py-2 sm:py-3 rounded-xl bg-yellow-500 text-black font-black text-[10px] sm:text-sm hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {reservedSubmitting ? "Sending…" : "Send Request"}
                </button>
              </div>
            </motion.div>
          )}

          {step === "confirm" && (
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
                  {weldedName}
                </p>
              </div>
              {linkFeeLoading ? (
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="w-2.5 h-2.5 sm:w-4 sm:h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
                  <p className="text-[9px] sm:text-xs text-salvaGold font-bold">
                    Fetching fees…
                  </p>
                </div>
              ) : (
                <>
                  {linkFee !== null && Number(linkFee) > 0 ? (
                    <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                      <p className="text-[7px] sm:text-[10px] uppercase font-black text-white/60 tracking-widest">
                        Link Fee
                      </p>
                      <p className="font-black text-white text-[10px] sm:text-sm">
                        {Number(linkFee).toLocaleString()}{" "}
                        <span className="text-salvaGold text-[8px] sm:text-xs">
                          NGNs
                        </span>
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-4 rounded-xl bg-green-500/8 border border-green-500/15">
                      <span className="text-green-400 text-[10px] sm:text-sm flex-shrink-0">
                        ✦
                      </span>
                      <p className="text-[9px] sm:text-xs font-black text-green-400">
                        Free Registration
                      </p>
                    </div>
                  )}
                </>
              )}
              {existingName && (
                <div className="p-2.5 sm:p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                  <p className="text-[7px] sm:text-[10px] uppercase font-black text-yellow-400 tracking-widest mb-1.5 sm:mb-2">
                    What Happens
                  </p>
                  <p className="text-[9px] sm:text-xs text-white/60 leading-relaxed">
                    1.{" "}
                    <span className="text-red-400 font-black">
                      {existingName}
                    </span>{" "}
                    unlinked on-chain
                    <br />
                    2.{" "}
                    <span className="text-salvaGold font-black">
                      {weldedName}
                    </span>{" "}
                    linked to this pool
                  </p>
                </div>
              )}
              {finalError && (
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                  <span className="text-red-400 text-[10px] sm:text-xs">⚠</span>
                  <p className="text-[9px] sm:text-xs text-red-400 font-bold">
                    {finalError}
                  </p>
                </div>
              )}
              <div className="flex gap-2 sm:gap-3 pt-0.5 sm:pt-1">
                <button
                  onClick={() => setStep("form")}
                  className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 font-bold text-[10px] sm:text-sm text-white hover:bg-white/5 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setStep("pin")}
                  disabled={linkFeeLoading}
                  className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-[10px] sm:text-sm hover:brightness-110 disabled:opacity-50 transition-all shadow-lg shadow-salvaGold/20"
                >
                  Continue & Enter PIN
                </button>
              </div>
            </motion.div>
          )}

          {step === "linking" && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-11 sm:py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-2.5 sm:space-y-4"
            >
              <div className="relative w-10 h-10 sm:w-14 sm:h-14 mx-auto">
                <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
                <div className="absolute inset-0 rounded-full border-2 border-t-salvaGold animate-spin" />
                <div className="absolute inset-2 rounded-full bg-salvaGold/10 flex items-center justify-center">
                  <span className="text-salvaGold text-[9px] sm:text-sm font-black">
                    ₦
                  </span>
                </div>
              </div>
              <p className="font-black text-white text-xs sm:text-base">
                {existingName ? "Renaming on-chain…" : "Linking on-chain…"}
              </p>
              <p className="text-[9px] sm:text-xs text-white/60">
                {existingName
                  ? "Unlinking old, linking new"
                  : "Broadcasting to Base"}{" "}
                · 30–90 seconds
              </p>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 sm:py-12 px-4 sm:px-6 rounded-2xl border border-salvaGold/20 bg-salvaGold/[0.04] text-center space-y-3.5 sm:space-y-5"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 280, delay: 0.1 }}
                className="w-11 h-11 sm:w-16 sm:h-16 bg-salvaGold/15 border border-salvaGold/30 rounded-2xl flex items-center justify-center mx-auto"
              >
                <span className="text-xl sm:text-3xl">✓</span>
              </motion.div>
              <div>
                <p className="text-base sm:text-xl font-black text-white">
                  {weldedName}
                </p>
                <p className="text-[8px] sm:text-[11px] text-white/60 mt-0.5 sm:mt-1">
                  Your pool is now live on Base
                </p>
              </div>
              <button
                onClick={() => {
                  onDone();
                  onClose();
                }}
                className="w-full py-2.5 sm:py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 transition-all shadow-lg shadow-salvaGold/20 uppercase tracking-widest text-[10px] sm:text-sm"
              >
                Done
              </button>
            </motion.div>
          )}

          {step === "failed" && (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="py-8 sm:py-12 px-4 sm:px-6 rounded-2xl border border-red-500/20 bg-red-500/[0.04] text-center space-y-3.5 sm:space-y-5"
            >
              <div className="w-11 h-11 sm:w-16 sm:h-16 bg-red-500/15 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-xl sm:text-3xl">⚠️</span>
              </div>
              <p className="text-[9px] sm:text-xs text-white/60 leading-relaxed px-2">
                {finalError}
              </p>
              <button
                onClick={onClose}
                className="w-full py-2.5 sm:py-4 bg-white/5 border border-white/10 text-white font-black rounded-2xl hover:bg-white/10 transition-all uppercase tracking-widest text-[10px] sm:text-sm"
              >
                Close
              </button>
            </motion.div>
          )}
        </div>

        <AnimatePresence>
          {step === "pin" && (
            <PinModal
              title="Enter Transaction PIN"
              subtitle={
                existingName
                  ? "Sign rename — unlink old, link new"
                  : "Authorize the on-chain name link"
              }
              onConfirm={handleConfirmPin}
              onCancel={() => setStep("confirm")}
              loading={pinLoading}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

// ─── Main DeployPool ──────────────────────────────────────────────────────────
const DeployPool = ({ user, showMsg }) => {
const [pools, setPools] = useState(_poolsCache.pools || []);
const [loading, setLoading] = useState(_poolsCache.pools === null);
const [refreshing, setRefreshing] = useState(false);

  const [poolFee, setPoolFee] = useState({
    feeNGN: null,
    feeUsd: null,
    loading: false,
  });
  const [managingPool, setManagingPool] = useState(null);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [deploying, setDeploying] = useState(false);

  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null);
  const [subInterval, setSubInterval] = useState(1);
  const [subscribing, setSubscribing] = useState(false);

  const [showNameModal, setShowNameModal] = useState(false);
  const [namingPool, setNamingPool] = useState(null); // { poolAddress, existingName }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingPool, setDeletingPool] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [registries, setRegistries] = useState([]);
  const [showNetworkReminder, setShowNetworkReminder] = useState(false);

  // Merges the four per-pool detail endpoints into the shape our
  // presentational components (SubBadge, PoolCard, PoolManagePanel) expect.
  const fetchPoolFullData = useCallback(async (basePool) => {
    const [balRes, rateRes, subRes, pauseRes] = await Promise.all([
      fetch(
        `${SALVA_API_URL}/api/user/${BALANCE_PREFIX}/balance/${basePool.poolAddress}`,
      )
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(`${SALVA_API_URL}/api/pool/rate/${basePool.poolAddress}/${CHAIN}`)
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(
        `${SALVA_API_URL}/api/pool/subscription-status/${basePool.poolAddress}/${CHAIN}`,
      )
        .then((r) => r.json())
        .catch(() => ({})),
      fetch(
        `${SALVA_API_URL}/api/pool/isPaused/${basePool.poolAddress}/${CHAIN}`,
      )
        .then((r) => r.json())
        .catch(() => ({})),
    ]);
    return {
      ...basePool,
      ngnsLiquidity: balRes.ngnsBalance ?? "0",
      cNgnLiquidity: balRes.cNgnBalance ?? "0",
      usdtLiquidity: balRes.usdtBalance ?? "0",
      usdcLiquidity: balRes.usdcBalance ?? "0",
      buyRate: rateRes?.rate?.buyRate ?? "0",
      sellRate: rateRes?.rate?.sellRate ?? "0",
      isSubscribed: !!subRes.isSubscribed,
      subscriptionExpiresAt: subRes.isSubscribed
        ? new Date(Date.now() + Number(subRes.timeRemaining || 0)).toISOString()
        : null,
      isPaused: !!pauseRes.isPaused,
    };
  }, []);

  const fetchMyPools = useCallback(
    async (silent = false) => {
      if (!user?.safeAddress) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(
          `${SALVA_API_URL}/api/pool/pools/${user.safeAddress}/${CHAIN}`,
        );
        const data = await res.json();
        const basePools = data.pools || [];
        const enriched = await Promise.all(
          basePools.map((p) => fetchPoolFullData(p)),
        );
        setPools(enriched);
        _poolsCache.pools = enriched;
      } catch (err) {
        console.warn("fetchMyPools error:", err.message);
        setPools([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.safeAddress, fetchPoolFullData],
  );

  const refreshOnePool = useCallback(
    async (poolAddress) => {
      const base = pools.find((p) => p.poolAddress === poolAddress);
      if (!base) return null;
      const fresh = await fetchPoolFullData(base);
      setPools((prev) =>
        prev.map((p) => (p.poolAddress === poolAddress ? fresh : p)),
      );
      return fresh;
    },
    [pools, fetchPoolFullData],
  );

  const fetchPoolFeeForPin = useCallback(() => {
    setPoolFee({ feeNGN: null, feeUsd: null, loading: true });
    fetch(`${SALVA_API_URL}/api/user/estimate-deploy-pool-fee/${CHAIN}`)
      .then((r) => r.json())
      .then((d) =>
        setPoolFee({
          feeNGN: d?.data?.feeNGN ?? null,
          feeUsd: d?.data?.feeUsd ?? null,
          loading: false,
        }),
      )
      .catch(() => setPoolFee({ feeNGN: null, feeUsd: null, loading: false }));
  }, []);

  useEffect(() => {
    fetchMyPools(_poolsCache.pools !== null);
    fetch(`${SALVA_API_URL}/api/registry/registries`)
      .then((r) => r.json())
      .then((d) => setRegistries(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [fetchMyPools]);

  const executeDeploy = async (pin) => {
    setPinLoading(true);
    try {
      const verifyRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        showMsg("Invalid PIN", "error");
        return;
      }
      setPinVisible(false);
      setDeploying(true);
      const res = await fetch(`${SALVA_API_URL}/api/pool/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pkey: verifyData.privateKey,
          chain: CHAIN,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status)
        throw new Error(data.message || "Deploy failed");
      showMsg("Pool deployed!");
      await fetchMyPools();
      setNamingPool({ poolAddress: data.poolAddress, existingName: null });
      setShowNameModal(true);
    } catch (err) {
      showMsg(err.message || "Deployment failed — please try again.", "error");
    } finally {
      setDeploying(false);
      setPinLoading(false);
    }
  };

  const executeSubscribe = async (pin) => {
    if (!selectedPool) return;
    setPinLoading(true);
    try {
      const verifyRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        showMsg("Invalid PIN", "error");
        return;
      }
      setPinVisible(false);
      setSubscribing(true);
      const res = await fetch(`${SALVA_API_URL}/api/pool/subscription`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey: verifyData.privateKey,
          poolAddress: selectedPool.poolAddress,
          chain: CHAIN,
          type: selectedPool.isSubscribed ? "renew" : "subscribe",
          interval: subInterval,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status)
        throw new Error(data.message || "Subscription failed");
      showMsg(
        `Pool published! Expires ${new Date(data.expiresAt).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })}`,
      );
      await refreshOnePool(selectedPool.poolAddress);
    } catch (err) {
      showMsg(err.message || "Subscription failed. Please try again.", "error");
    } finally {
      setSubscribing(false);
      setSelectedPool(null);
      setPinLoading(false);
    }
  };

  const executeDelete = async (pin) => {
    if (!deletingPool) return;
    setPinLoading(true);
    try {
      const verifyRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.success) {
        showMsg("Invalid PIN", "error");
        return;
      }
      setPinVisible(false);
      setDeleting(true);
      const res = await fetch(`${SALVA_API_URL}/api/pool/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey: verifyData.privateKey,
          poolAddress: deletingPool.poolAddress,
          chain: CHAIN,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status)
        throw new Error(data.message || "Delete failed");
      showMsg(
        deletingPool.poolName
          ? `Pool deleted & "${deletingPool.poolName}" unlinked.`
          : "Pool removed.",
      );
      await fetchMyPools();
    } catch (err) {
      showMsg(
        err.message || "Could not remove pool — please try again",
        "error",
      );
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeletingPool(null);
      setPinLoading(false);
    }
  };

  // Single PIN dispatcher for deploy/subscribe/delete — pinAction tracked
  // via which modal is open (mutually exclusive by design).
  const [pinKind, setPinKind] = useState(null); // 'deploy' | 'subscribe' | 'delete'
  const handlePinConfirm = (pin) => {
    if (pinKind === "deploy") return executeDeploy(pin);
    if (pinKind === "subscribe") return executeSubscribe(pin);
    if (pinKind === "delete") return executeDelete(pin);
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
              <span className="text-salvaGold text-xs sm:text-lg leading-none">
                ↻
              </span>
            )}
          </button>
          <button
            onClick={() => {
              setPinKind("deploy");
              setPinVisible(true);
              fetchPoolFeeForPin();
            }}
            disabled={deploying}
            className="flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 sm:px-5 sm:py-3 bg-salvaGold text-black font-black text-[9px] sm:text-xs uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-salvaGold/20"
          >
            {deploying && (
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            )}
            {deploying ? "Deploying…" : "+ Deploy"}
          </button>
        </div>
      </div>

      {/* Info card */}
      <div className="p-2.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-[9px] sm:text-xs font-black text-salvaGold mb-0.5 sm:mb-1">
          How it works
        </p>
        <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
          Deploy your pool, add liquidity, set rates, then publish it. A
          subscription of{" "}
          <span className="font-black text-salvaGold">
            {SUBSCRIPTION_MONTHLY_FEE_NGN.toLocaleString()} NGN/month
          </span>{" "}
          keeps it visible on the swap marketplace.
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
              onManage={() => setManagingPool(pool)}
              onPublish={() => {
                setSelectedPool(pool);
                setSubInterval(1);
                setShowSubModal(true);
              }}
              onName={() => {
                setNamingPool({
                  poolAddress: pool.poolAddress,
                  existingName: pool.poolName || null,
                });
                setShowNameModal(true);
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
              const fresh = await refreshOnePool(managingPool.poolAddress);
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
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
              <div className="p-5 sm:p-8">
                <p className="text-[7px] sm:text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-1">
                  Marketplace
                </p>
                <h3 className="text-sm sm:text-xl font-black mb-1 text-white">
                  Publish Pool
                </h3>
                <p className="text-[9px] sm:text-xs text-white/60 mb-3.5 sm:mb-5 leading-relaxed">
                  {SUBSCRIPTION_MONTHLY_FEE_NGN.toLocaleString()} NGN per month.
                  Choose how many months to{" "}
                  {selectedPool.isSubscribed ? "extend" : "subscribe"} for.
                </p>
                <div className="mb-3.5 sm:mb-5">
                  <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black block mb-1.5 sm:mb-2">
                    Months
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={subInterval}
                    onChange={(e) => setSubInterval(e.target.value)}
                    onBlur={() => {
                      const n = parseInt(subInterval, 10);
                      setSubInterval(!n || n < 1 ? 1 : n);
                    }}
                    className={darkInput}
                  />
                  <p className="text-[7px] sm:text-[10px] text-salvaGold/70 font-bold mt-1.5 ml-1">
                    Total:{" "}
                    {(
                      SUBSCRIPTION_MONTHLY_FEE_NGN *
                      (parseInt(subInterval, 10) || 1)
                    ).toLocaleString()}{" "}
                    NGNs
                  </p>
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
                      const n = parseInt(subInterval, 10);
                      setSubInterval(!n || n < 1 ? 1 : n);
                      setShowSubModal(false);
                      setPinKind("subscribe");
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

      {/* ── Pool Name Modal (first-time naming & rename) ── */}
      <AnimatePresence>
        {showNameModal && namingPool && (
          <PoolNameModal
            poolAddress={namingPool.poolAddress}
            existingName={namingPool.existingName}
            registries={registries}
            user={user}
            showMsg={showMsg}
            onClose={() => {
              setShowNameModal(false);
              setNamingPool(null);
            }}
            onDone={() => fetchMyPools(true)}
          />
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
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
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
                <p className="text-[9px] sm:text-xs text-white/60 mb-3 sm:mb-4 leading-relaxed">
                  Removes this pool from your dashboard. The contract stays
                  on-chain.
                </p>
                {deletingPool.poolName && (
                  <div className="mb-3.5 sm:mb-5 px-3 py-2 sm:px-4 sm:py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                    <p className="text-[7px] sm:text-[10px] uppercase font-black text-yellow-400 tracking-widest mb-1">
                      Linked Name Detected
                    </p>
                    <p className="text-[9px] sm:text-xs text-white/60 leading-relaxed">
                      <span className="text-salvaGold font-black">
                        {deletingPool.poolName}
                      </span>{" "}
                      will be automatically unlinked.
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
                      setPinKind("delete");
                      setPinVisible(true);
                    }}
                    disabled={deleting}
                    className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-red-500 text-white font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-1.5 sm:gap-2 transition-all"
                  >
                    {deleting && (
                      <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {deleting ? "Deleting…" : "Yes, Delete"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIN Modal (deploy / subscribe / delete) ── */}
      <AnimatePresence>
        {pinVisible && (
          <PinModal
            title="Enter Transaction PIN"
            subtitle={
              pinKind === "deploy"
                ? "Sign pool deployment via your Safe"
                : pinKind === "subscribe"
                  ? "Authorize subscription payment from your Safe"
                  : pinKind === "delete"
                    ? "Authorize pool deletion via your Safe"
                    : "Enter your PIN"
            }
            onConfirm={handlePinConfirm}
            onCancel={() => setPinVisible(false)}
            loading={pinLoading}
            feeInfo={pinKind === "deploy" ? poolFee : undefined}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default DeployPool;