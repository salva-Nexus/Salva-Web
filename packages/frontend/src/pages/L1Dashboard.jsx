// src/pages/L1Dashboard.jsx
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SALVA_API_URL } from "../config";
import Stars from "../components/Stars";
import L1BuyNGNs from "./L1BuyNGNs";
import L1SwapTab from "./L1SwapTab";
import L1DeployPool from "./L1DeployPool";

// ── Notification ──────────────────────────────────────────────────────────────
const L1Notification = ({ notification, onClose }) => {
  const cfgMap = {
    success: { icon: "✓", bar: "#D4AF37", btnBg: "#D4AF37", btnText: "#000" },
    error: { icon: "✕", bar: "#EF4444", btnBg: "#EF4444", btnText: "#fff" },
    info: {
      icon: "↻",
      bar: "#3B82F6",
      btnBg: "rgba(255,255,255,0.15)",
      btnText: "#fff",
    },
    warning: { icon: "⚠", bar: "#F59E0B", btnBg: "#F59E0B", btnText: "#000" },
  };
  const cfg = cfgMap[notification.type] || cfgMap.info;
  if (!notification.show) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-xs bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ height: 4, background: cfg.bar }} />
        <div className="p-7 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: cfg.bar }}
          >
            <span className="text-xl font-black" style={{ color: cfg.btnText }}>
              {cfg.icon}
            </span>
          </div>
          <p className="font-black text-sm leading-relaxed mb-6 text-white">
            {notification.message}
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            style={{ background: cfg.btnBg, color: cfg.btnText }}
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatNumber = (value, { minDecimals = 0, maxDecimals = 4 } = {}) => {
  if (value === null || value === undefined || value === "") {
    return "0";
  }

  const num = Number(value);

  if (!Number.isFinite(num)) {
    return "0";
  }

  const factor = 10 ** maxDecimals;

  // truncate instead of round
  const truncated = Math.trunc(num * factor) / factor;

  return truncated.toLocaleString("en-US", {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
};

const addDecimals = (a, b) => {
  const ai = Number(a || 0);
  const bi = Number(b || 0);

  const sum = ai + bi;

  // preserve precision safely
  return sum.toFixed(6).replace(/\.?0+$/, "");
};

// ── Balance Spinner ────────────────────────────────────────────────────────────
const BalanceSpinner = () => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin inline-block flex-shrink-0" />
    <span className="text-sm opacity-30 font-bold">—</span>
  </span>
);

// ── L1 Balance Card ───────────────────────────────────────────────────────────
const L1BalanceCard = ({
  ngnsBalance,
  cNgnBalance,
  usdtBalance,
  usdcBalance,
  showBalance,
  balanceLoading,
  onToggleVisibility,
}) => {
  const totalNgn = addDecimals(ngnsBalance, cNgnBalance);
  const totalUsd = addDecimals(usdtBalance, usdcBalance);
  const MASK = "••••••";

  return (
    <div className="rounded-3xl overflow-hidden border border-white/[0.07] bg-white/[0.03] shadow-2xl mb-5">
      {/* Blue accent line instead of gold — signals L1 context */}
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />

      {/* NGN — TOP */}
      <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="w-1.5 h-1.5 rounded-full bg-blue-400 block"
            />
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">
              NGN
            </p>
          </div>
          <button
            onClick={onToggleVisibility}
            className="text-white/60 hover:text-white/80 transition-colors text-sm leading-none"
          >
            {showBalance ? "👁" : "👁‍🗨"}
          </button>
        </div>

        <div className="min-h-[44px] flex items-baseline gap-1.5 flex-wrap overflow-hidden">
          {balanceLoading ? (
            <BalanceSpinner />
          ) : (
            <span
              className="font-black text-white tracking-tight break-all leading-none"
              style={{
                fontSize:
                  showBalance && formatNumber(totalNgn).length > 10
                    ? "clamp(1rem, 5vw, 1.75rem)"
                    : "1.875rem",
              }}
            >
              {showBalance
                ? formatNumber(totalNgn, {
                    minDecimals: 3,
                    maxDecimals: 3,
                  })
                : MASK}
            </span>
          )}
        </div>

        {!balanceLoading && (
          <p className="text-[10px] text-white/60 font-mono mt-2 truncate">
            {showBalance
              ? `${formatNumber(ngnsBalance, {
                  minDecimals: 3,
                  maxDecimals: 3,
                })} NGNs · ${formatNumber(cNgnBalance, {
                  minDecimals: 3,
                  maxDecimals: 3,
                })} cNGN`
              : "•••• NGNs · •••• cNGN"}
          </p>
        )}
      </div>

      {/* USD — BOTTOM */}
      <div className="px-5 sm:px-7 pt-4 pb-5 sm:pb-7">
        <div className="flex items-center gap-1.5 mb-3">
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, delay: 0.8 }}
            className="w-1.5 h-1.5 rounded-full bg-green-400 block"
          />
          <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">
            USD
          </p>
        </div>

        <div className="min-h-[36px] flex items-baseline gap-1.5 flex-wrap overflow-hidden">
          {balanceLoading ? (
            <BalanceSpinner />
          ) : (
            <span
              className="font-black text-white tracking-tight break-all leading-none"
              style={{
                fontSize:
                  showBalance && String(totalUsd).length > 10
                    ? "clamp(0.9rem, 4vw, 1.5rem)"
                    : "1.5rem",
              }}
            >
              {showBalance
                ? formatNumber(totalUsd, {
                    minDecimals: 2,
                    maxDecimals: 3,
                  })
                : MASK}
            </span>
          )}
        </div>

        {!balanceLoading && (
          <p className="text-[10px] text-white/60 font-mono mt-2 truncate">
            {showBalance
              ? `${formatNumber(usdtBalance, {
                  minDecimals: 2,
                  maxDecimals: 3,
                })} USDT · ${formatNumber(usdcBalance, {
                  minDecimals: 2,
                  maxDecimals: 3,
                })} USDC`
              : "•••• USDT · •••• USDC"}
          </p>
        )}
      </div>
    </div>
  );
};

// ── Tab icons ─────────────────────────────────────────────────────────────────
const TAB_ICONS = {
  buy: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
    >
      <text
        x="12"
        y="17"
        textAnchor="middle"
        fontSize="16"
        fontWeight="700"
        stroke="none"
        fill="currentColor"
        fontFamily="sans-serif"
      >
        ₦
      </text>
    </svg>
  ),
  swap: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 16V4m0 0L4 7m3-3 3 3" />
      <path d="M17 8v12m0 0 3-3m-3 3-3-3" />
    </svg>
  ),
  deploy: (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
      <line x1="12" y1="12" x2="12" y2="16" />
      <line x1="10" y1="14" x2="14" y2="14" />
    </svg>
  ),
};

// ── Hero — shown before wallet connect ────────────────────────────────────────
const L1Hero = ({ onConnect, connecting }) => (
  <div className="min-h-screen bg-[#0A0A0B] text-white pt-28 px-4 pb-16 relative overflow-x-hidden">
    <Stars />
    {/* ── THIS SECTION IS FOR LOCKING ETH CHAIN PAGE ──────────────────────────── */}
    <div className="fixed inset-0 z-[999] flex items-center justify-center backdrop-blur-[2px] bg-black/50 pointer-events-auto">
        <div className="flex flex-col items-center gap-3 px-8 py-8 rounded-3xl border border-white/[0.07] bg-zinc-950/90 shadow-2xl text-center">
          <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center">
            <span className="text-2xl">⛓</span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black">
            Salva V3 · ETH Chain
          </p>
          <p className="text-xl font-black text-white">Coming Soon</p>
          <p className="text-xs text-white/30 max-w-[200px] leading-relaxed">
            V3 smart contracts are under development and testing on Ethereum.
          </p>
        </div>
      </div>
    {/* ── THIS IS THE END OF THE SECTION ──────────────────────────────────────── */}
    <div className="max-w-2xl mx-auto relative z-10">
      {/* Headline */}
      <div className="text-center mb-12">
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-white/60 text-base max-w-md mx-auto leading-relaxed"
        >
          The Salva V3 DEX and NGNs stablecoin — now on Ethereum mainnet.
          Connect your wallet to access pools, swaps and OTC exchange.
        </motion.p>
      </div>

      {/* Feature cards */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-12"
      >
        {[
          {
            icon: "₦",
            title: "Buy / Sell NGNs",
            desc: "OTC desk — purchase or sell Nigerian Naira stablecoin on ETH CHAIN.",
            color: "#D4AF37",
          },
          {
            icon: "⇄",
            title: "Swap",
            desc: "Peer-to-peer NGNs / USD stablecoin exchange via V3 liquidity pools.",
            color: "#22c55e",
          },
          {
            icon: "⛏",
            title: "Deploy Pool",
            desc: "Deploy your own V3 liquidity pool and earn as a market maker on ETH CHAIN.",
            color: "#3b82f6",
          },
        ].map((card) => (
          <div
            key={card.title}
            className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] flex flex-col gap-3"
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center font-black text-xl"
              style={{
                background: `${card.color}15`,
                color: card.color,
                border: `1px solid ${card.color}30`,
              }}
            >
              {card.icon}
            </div>
            <p className="font-black text-sm text-white">{card.title}</p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              {card.desc}
            </p>
          </div>
        ))}
      </motion.div>

      {/* Connect wallet CTA */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex flex-col items-center gap-4"
      >
        <button
          onClick={onConnect}
          disabled={connecting}
          className="flex items-center gap-3 px-8 py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 shadow-2xl"
          style={{
            background: "#D4AF37",
            color: "#000",
            boxShadow: "0 8px 32px rgba(212,175,55,0.35)",
          }}
        >
          {connecting && (
            <span className="w-4 h-4 border-2 border-black/25 border-t-black rounded-full animate-spin" />
          )}
          {connecting ? "Connecting…" : "Connect Wallet"}
        </button>
        <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">
          MetaMask · Coinbase Wallet · WalletConnect
        </p>
      </motion.div>

      {/* L2 link */}
      <div className="mt-12 text-center">
        <a
          href="/dashboard"
          className="text-[10px] font-black uppercase tracking-widest text-white/60 hover:text-white/80 transition-colors"
        >
          ← Back to Salva Wallet on Base
        </a>
      </div>
    </div>
  </div>
);

const L1Dashboard = ({ l1Account, l1ChainId, onConnect, l1Connecting }) => {
  const [activeTab, setActiveTab] = useState(
    () => localStorage.getItem("l1_active_tab") || "buy",
  );
  const [l1Config, setL1Config] = useState(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });

  // ── Balance state ────────────────────────────────────────────────────────
  const [ngnsBalance, setNgnsBalance] = useState("0.00");
  const [cNgnBalance, setCNgnBalance] = useState("0.00");
  const [usdtBalance, setUsdtBalance] = useState("0.00");
  const [usdcBalance, setUsdcBalance] = useState("0.00");
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [showBalance, setShowBalance] = useState(() => {
    try {
      const saved = localStorage.getItem("l1_show_balance");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });

  const toggleShowBalance = () => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("l1_show_balance", String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const fetchL1Balance = useCallback(async (address, showSpinner = false) => {
    if (!address) return;
    if (showSpinner) setBalanceLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/l1-balance/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setNgnsBalance(data.ngnsBalance ?? "0.00");
      setCNgnBalance(data.cNgnBalance ?? "0.00");
      setUsdtBalance(data.usdtBalance ?? "0.00");
      setUsdcBalance(data.usdcBalance ?? "0.00");
    } catch {
      /* keep existing values */
    } finally {
      if (showSpinner) setBalanceLoading(false);
    }
  }, []);
  const showMsg = (msg, type = "success") =>
    setNotification({ show: true, message: msg, type });
  const closeNotif = () => setNotification((n) => ({ ...n, show: false }));

  // Fetch L1 contract addresses from backend
  useEffect(() => {
    fetch(`${SALVA_API_URL}/api/l1-config`)
      .then((r) => r.json())
      .then((d) => setL1Config(d))
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  // Fetch balance when wallet connects, and refresh every 45 seconds
  useEffect(() => {
    if (!l1Account) return;
    fetchL1Balance(l1Account, true);
    const tick = () => {
      if (document.visibilityState === "visible") fetchL1Balance(l1Account);
    };
    const iv = setInterval(tick, 45000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [l1Account, fetchL1Balance]);

  const isProd = false; // set to: process.env.NODE_ENV === "production" before deploying
  const expectedChainId = l1Config?.chainId || null;
  const wrongChain =
    isProd &&
    l1Account &&
    l1ChainId !== null &&
    expectedChainId !== null &&
    l1ChainId !== expectedChainId;

  console.log("l1ChainId:", l1ChainId, "expectedChainId:", expectedChainId);

  const tabs = [
    { id: "buy", label: "Buy / Sell" },
    { id: "swap", label: "Swap" },
    { id: "deploy", label: "Deploy Pool" },
  ];

  // No wallet — show hero
  if (!l1Account) {
    return <L1Hero onConnect={onConnect} connecting={l1Connecting} />;
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white pt-28 px-4 pb-16 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-2xl mx-auto relative z-10"></div>
      <div className="max-w-2xl mx-auto relative z-10">
        {/* Header */}
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">
              ETH CHAIN
            </h1>
          </div>
          {/* Wallet chip */}
          <div className="flex flex-col items-end gap-1 mt-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.03]">
              <span
                className="w-2 h-2 rounded-full"
                style={{ background: wrongChain ? "#f97316" : "#D4AF37" }}
              />
              <span className="font-mono font-black text-[11px] text-white">
                {l1Account.slice(0, 6)}…{l1Account.slice(-4)}
              </span>
            </div>
            {wrongChain && (
              <p className="text-[9px] text-orange-400 font-black uppercase tracking-widest">
                ⚠ Switch to Ethereum Mainnet
              </p>
            )}
          </div>
        </header>

        {/* Wrong chain banner */}
        {wrongChain && (
          <div className="mb-5 p-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06]">
            <p className="text-sm font-bold text-orange-400">
              ⚠ Your wallet is on the wrong network. Please switch to{" "}
              <strong>Ethereum Mainnet</strong> in your wallet to use Salva.
            </p>
          </div>
        )}

        {/* ── L1 Balance Card ── */}
        <L1BalanceCard
          ngnsBalance={ngnsBalance}
          cNgnBalance={cNgnBalance}
          usdtBalance={usdtBalance}
          usdcBalance={usdcBalance}
          showBalance={showBalance}
          balanceLoading={balanceLoading}
          onToggleVisibility={toggleShowBalance}
        />

        {/* ── Connected wallet address chip ── */}
        <div
          onClick={() => {
            navigator.clipboard.writeText(l1Account);
            showMsg("Wallet address copied!");
          }}
          className="mb-6 px-4 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] cursor-pointer hover:border-blue-500/20 transition-all flex items-center gap-3"
        >
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-[10px]">⛓</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">
              EOA Wallet · ETH
            </p>
            <p className="font-mono text-[10px] text-blue-400/60 truncate mt-0.5">
              {showBalance
                ? l1Account
                : "0x••••••••••••••••••••••••••••••••••••••••"}
            </p>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              fetchL1Balance(l1Account);
            }}
            className="text-[10px] text-white/60 hover:text-blue-400 flex-shrink-0 font-black transition-colors uppercase tracking-widest"
          >
            Refresh
          </button>
        </div>

        {/* Tab nav */}
        <div className="mb-7">
          <div className="relative flex items-center mb-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
            <div className="mx-3 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-blue-400/40 block" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 block" />
              <span className="w-1 h-1 rounded-full bg-blue-400/40 block" />
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
          </div>

          <div className="grid grid-cols-3 gap-x-1 gap-y-5">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    localStorage.setItem("l1_active_tab", tab.id);
                  }}
                  className="flex flex-col items-center gap-2 group focus:outline-none"
                >
                  <div
                    className={`
                    relative w-14 h-14 rounded-full flex items-center justify-center
                    transition-all duration-200 active:scale-95
                    ${
                      isActive
                        ? "bg-[#1C1C1E] ring-2 ring-blue-500 shadow-[0_0_18px_rgba(59,130,246,0.2)]"
                        : "bg-[#1C1C1E] ring-1 ring-white/[0.05] hover:ring-white/15 hover:bg-[#232325]"
                    }
                  `}
                  >
                    <span
                      className={`w-[22px] h-[22px] transition-colors duration-200 ${
                        isActive
                          ? "text-blue-400"
                          : "text-white/60 group-hover:text-white/85"
                      }`}
                    >
                      {TAB_ICONS[tab.id]}
                    </span>
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-400" />
                    )}
                  </div>
                  <span
                    className={`
                    text-[9px] font-black uppercase tracking-[0.1em] leading-tight
                    text-center max-w-[64px] break-words transition-colors duration-200
                    ${isActive ? "text-blue-400" : "text-white/60 group-hover:text-white/70"}
                  `}
                  >
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative flex items-center mt-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
            <div className="mx-3 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-blue-400/30 block" />
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400/40 block" />
              <span className="w-1 h-1 rounded-full bg-blue-400/30 block" />
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent" />
          </div>
        </div>

        {/* Tab content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "buy" && (
              <L1BuyNGNs
                l1Account={l1Account}
                l1Config={l1Config}
                configLoading={configLoading}
                showMsg={showMsg}
              />
            )}
            {activeTab === "swap" && (
              <L1SwapTab
                l1Account={l1Account}
                l1Config={l1Config}
                configLoading={configLoading}
                showMsg={showMsg}
                wrongChain={wrongChain}
              />
            )}
            {activeTab === "deploy" && (
              <L1DeployPool
                l1Account={l1Account}
                l1Config={l1Config}
                configLoading={configLoading}
                showMsg={showMsg}
                wrongChain={wrongChain}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {notification.show && (
          <L1Notification notification={notification} onClose={closeNotif} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default L1Dashboard;
