// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  animate,
  AnimatePresence,
  useMotionValue,
  useSpring,
} from "framer-motion";
import { Github, Mail, X, ChevronDown, ArrowUpRight, ArrowRight, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Stars from "../components/Stars";

// ─── SEO Meta ────────────────────────────────────────────────────────────────
const SEOMeta = () => {
  useEffect(() => {
    const setMeta = (name, content, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) { el = document.createElement("meta"); el.setAttribute(attr, name); document.head.appendChild(el); }
      el.setAttribute("content", content);
    };
    setMeta("description", "Salva V3 — On-chain DEX, naming service, and NGNs stablecoin on Base. Swap NGNs/USDT/USDC, register charles@salva, and send money like a text. Gasless. Non-custodial.");
    setMeta("og:title", "Salva V3 — On-Chain DEX & Name Service for Nigeria", true);
    setMeta("og:description", "NGNs DEX. Human-readable names. Gasless smart wallets. Built on Base.", true);
    setMeta("og:type", "website", true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:site", "@salva_Nexus");
  }, []);
  return null;
};

// ─── X Logo ──────────────────────────────────────────────────────────────────
const XLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.294 19.497h2.039L6.486 3.24H4.298l13.309 17.41z" />
  </svg>
);

// ─── Count Up ─────────────────────────────────────────────────────────────────
const CountUp = ({ to, decimals = 0, prefix = "", suffix = "" }) => {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const target = typeof to === "string" ? parseFloat(to.replace(/,/g, "")) : to;
    if (isNaN(target)) return;
    const c = animate(0, target, {
      duration: 2.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => c.stop();
  }, [to, inView]);
  return (
    <span ref={ref}>
      {prefix}{val.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}
    </span>
  );
};

// ─── Magnetic Button ──────────────────────────────────────────────────────────
const MagneticBtn = ({ children, className, onClick, strength = 0.3 }) => {
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });

  const handleMove = (e) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    x.set((e.clientX - cx) * strength);
    y.set((e.clientY - cy) * strength);
  };
  const handleLeave = () => { x.set(0); y.set(0); };

  return (
    <motion.button
      ref={ref}
      style={{ x: sx, y: sy }}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      onClick={onClick}
      className={className}
    >
      {children}
    </motion.button>
  );
};

// ─── Animated Number Card ─────────────────────────────────────────────────────
const StatCard = ({ label, value, loading, decimals = 0, suffix = "" }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="relative group p-8 rounded-3xl border border-white/[0.07] dark:border-white/[0.07] border-black/[0.07] bg-white/[0.03] dark:bg-white/[0.03] overflow-hidden hover:border-salvaGold/30 transition-all duration-500"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-salvaGold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-salvaGold/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-3 opacity-60">{label}</p>
      <h3 className="text-4xl sm:text-5xl font-black tracking-tighter">
        {loading ? <span className="opacity-20">—</span> : (
          typeof value === "number"
            ? <CountUp to={value} decimals={decimals} suffix={suffix} />
            : value
        )}
      </h3>
    </motion.div>
  );
};

// ─── Glowing Orb ─────────────────────────────────────────────────────────────
const GlowOrb = ({ x, y, size, color, delay = 0 }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: [0, 0.6, 0.3, 0.7, 0], scale: [0.8, 1.2, 0.9, 1.1, 0.8] }}
    transition={{ duration: 8, delay, repeat: Infinity, ease: "easeInOut" }}
    className="absolute rounded-full pointer-events-none blur-[80px]"
    style={{ left: x, top: y, width: size, height: size, background: color }}
  />
);

// ─── DEX Visual ───────────────────────────────────────────────────────────────
const DEXVisual = () => {
  const [tab, setTab] = useState("buy");
  const pools = [
    { name: "charles_pool@salva", rate: "₦1,490", usdt: "$29.01", usdc: "$0.00", ngn: "10,000" },
    { name: "jefta_pool@salva",       rate: "₦1,500", usdt: "$0.00",  usdc: "$50.00", ngn: "0" },
    { name: "amuobi_pool@salva",        rate: "₦1,480", usdt: "$100.00",usdc: "$0.00",  ngn: "5,000" },
  ];

  return (
    <div className="relative rounded-3xl border border-salvaGold/20 overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.08),transparent)]" />

      {/* Header */}
      <div className="flex items-center justify-between mb-5 relative">
        <div>
          <p className="text-[9px] uppercase tracking-[0.4em] text-salvaGold/50 font-black">Salva V3 DEX</p>
          <p className="text-base font-black text-white">Naira Exchange</p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-1.5 h-1.5 bg-green-500 rounded-full block"
          />
          <span className="text-[10px] text-green-400 font-black">Live</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 relative">
        {[{ id: "buy", label: "Buy USDT/USDC", color: "#D4AF37" }, { id: "sell", label: "Sell USDT/USDC", color: "#22c55e" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className="flex-1 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
            style={tab === t.id ? { background: t.color, color: "#000" } : { background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.4)" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Pool list */}
      <div className="space-y-2 relative">
        {pools.map((pool, i) => (
          <motion.div
            key={pool.name}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.1, duration: 0.5 }}
            className="p-3.5 rounded-2xl border border-white/5 bg-white/[0.03] hover:border-salvaGold/20 hover:bg-white/[0.05] transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-black text-salvaGold truncate">{pool.name}</p>
              <span className="text-[10px] font-black text-white/60">{pool.rate}/USD</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 text-[9px]">
              <div className="bg-white/5 rounded-lg px-2 py-1 text-center">
                <p className="text-white/30 uppercase font-bold">NGNs</p>
                <p className="text-salvaGold/80 font-black">{pool.ngn}</p>
              </div>
              <div className="bg-green-500/5 border border-green-500/10 rounded-lg px-2 py-1 text-center">
                <p className="text-green-400/50 uppercase font-bold">USDT</p>
                <p className="text-green-400 font-black">{pool.usdt}</p>
              </div>
              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg px-2 py-1 text-center">
                <p className="text-blue-400/50 uppercase font-bold">USDC</p>
                <p className="text-blue-400 font-black">{pool.usdc}</p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center relative">
        <span className="text-[9px] text-white/20 uppercase tracking-widest font-bold">Permissionless · On-chain</span>
        <span className="text-[9px] text-salvaGold/50 font-black">Base L2 ⬡</span>
      </div>
    </div>
  );
};

// ─── Name Resolution Visual ───────────────────────────────────────────────────
const NameResolutionVisual = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const demos = [
    { alias: "cboi@salva",          type: "Individual · Salva",    dest: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045" },
    { alias: "suzy@coinbase",        type: "Individual · Coinbase", dest: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9f" },
    { alias: "charles_pool@salva",   type: "Pool Contract · Salva", dest: "0x85B839dA40615A5ad7439d200768F0603418F881" },
    { alias: "usdc_eth@usdc",        type: "Protocol · USDC",       dest: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  ];
  useEffect(() => {
    const t = setInterval(() => setActiveIdx(i => (i + 1) % demos.length), 2200);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative rounded-3xl border border-salvaGold/20 overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.07),transparent)]" />
      <div className="flex items-center gap-2 mb-5 relative">
        <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
          className="w-1.5 h-1.5 bg-green-500 rounded-full block" />
        <p className="text-[9px] uppercase tracking-[0.4em] text-salvaGold/60 font-black">Live Resolution Engine</p>
      </div>
      <div className="space-y-2.5 relative">
        {demos.map((item, i) => (
          <motion.div key={i}
            animate={{ opacity: activeIdx === i ? 1 : 0.15, scale: activeIdx === i ? 1 : 0.97, x: activeIdx === i ? 0 : -6 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-1 bg-white/[0.04] border border-white/[0.06] rounded-2xl px-5 py-3.5"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-salvaGold font-black text-sm truncate">{item.alias}</span>
              <motion.div animate={{ x: activeIdx === i ? [0, 4, 0] : 0 }} transition={{ repeat: activeIdx === i ? Infinity : 0, duration: 1.5 }}>
                <ArrowRight size={12} className="opacity-30 flex-shrink-0" />
              </motion.div>
              <span className="font-mono text-[10px] opacity-30 truncate max-w-[130px] hidden sm:block">
                {item.dest.slice(0, 18)}…
              </span>
            </div>
            <span className="text-[9px] text-salvaGold/40 uppercase tracking-widest font-bold">{item.type}</span>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between relative">
        <span className="text-[9px] opacity-20 uppercase tracking-widest font-bold">Namespace-isolated · Phishing-resistant</span>
        <span className="text-[9px] text-green-500 font-black">● On-chain</span>
      </div>
    </div>
  );
};

// ─── Stablecoin Visual ────────────────────────────────────────────────────────
const StablecoinVisual = () => {
  const [price, setPrice] = useState(1.0);
  const txs = [
    { from: "charles@salva", to: "sandra@rabby",   amt: "50,000 NGNs" },
    { from: "ola@metamask",   to: "emeka@salva",    amt: "12,500 NGNs" },
    { from: "aisha@coinbase", to: "peter@binance",  amt: "200,000 NGNs" },
  ];
  useEffect(() => {
    const t = setInterval(() => setPrice(1 + (Math.random() * 0.0006 - 0.0003)), 1800);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative rounded-3xl border border-salvaGold/20 overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.07),transparent)]" />
      <div className="flex items-center justify-between mb-5 relative">
        <div>
          <p className="text-[9px] uppercase tracking-[0.4em] text-salvaGold/60 font-black mb-1">NGNs / NGN</p>
          <div className="flex items-baseline gap-2">
            <motion.span key={price.toFixed(4)} initial={{ y: -6, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="text-3xl font-black text-salvaGold">₦{price.toFixed(4)}</motion.span>
            <span className="text-[10px] text-green-400 font-black bg-green-500/10 px-2 py-0.5 rounded-full">± 0.03%</span>
          </div>
        </div>
        <div className="w-14 h-14 rounded-full bg-salvaGold/10 border-2 border-salvaGold/30 flex items-center justify-center">
          <span className="text-2xl font-black text-salvaGold">₦</span>
        </div>
      </div>
      <div className="space-y-2 mb-4 relative">
        <p className="text-[9px] uppercase tracking-[0.3em] opacity-20 font-bold">Recent On-Chain Transfers</p>
        {txs.map((tx, i) => (
          <div key={i} className="flex items-center justify-between bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-salvaGold text-[10px] font-black truncate max-w-[80px]">{tx.from}</span>
              <ArrowRight size={10} className="opacity-20 flex-shrink-0" />
              <span className="text-[10px] opacity-40 font-bold truncate max-w-[70px]">{tx.to}</span>
            </div>
            <span className="text-[10px] text-salvaGold font-black flex-shrink-0 ml-2">{tx.amt}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 relative">
        {["1 NGNs = ₦1", "No FX Risk", "Instant"].map(t => (
          <div key={t} className="bg-white/[0.04] border border-white/[0.06] rounded-xl py-2.5 text-center">
            <span className="text-[9px] font-black text-salvaGold uppercase tracking-wider">{t}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Wallet Visual ────────────────────────────────────────────────────────────
const WalletVisual = () => {
  const [balIdx, setBalIdx] = useState(0);
  const balances = [
    { label: "NGNs Balance", val: "1,250,000", sym: "NGNs", sub: "≈ ₦1,250,000" },
    { label: "USDT Balance", val: "823.50",    sym: "USDT", sub: "≈ $823.50" },
    { label: "USDC Balance", val: "410.00",    sym: "USDC", sub: "≈ $410.00" },
  ];
  useEffect(() => {
    const t = setInterval(() => setBalIdx(i => (i + 1) % balances.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative rounded-3xl border border-salvaGold/20 overflow-hidden bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.05),transparent)]" />
      <div className="flex items-center justify-between mb-6 relative">
        <div>
          <p className="text-[9px] uppercase tracking-[0.4em] text-salvaGold/60 font-black">Salva Smart Wallet</p>
          <p className="font-mono text-[10px] opacity-30 mt-1">cboi@salva · 0xb298...3Cb7</p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}
            className="w-1.5 h-1.5 bg-green-500 rounded-full block" />
          <span className="text-[10px] text-green-400 font-black">Active</span>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div key={balIdx} initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}
          transition={{ duration: 0.35 }} className="mb-6 relative">
          <p className="text-[9px] uppercase opacity-30 font-bold">{balances[balIdx].label}</p>
          <p className="text-4xl font-black mt-1 text-white">
            {balances[balIdx].val}{" "}
            <span className="text-salvaGold text-xl">{balances[balIdx].sym}</span>
          </p>
          <p className="text-[10px] opacity-25 font-bold mt-1">{balances[balIdx].sub}</p>
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-3 mb-4 relative">
        <div className="bg-salvaGold text-black font-black text-xs uppercase tracking-widest py-3 rounded-2xl text-center">SEND</div>
        <div className="border border-salvaGold/30 text-salvaGold font-black text-xs uppercase tracking-widest py-3 rounded-2xl text-center">RECEIVE</div>
      </div>
      <div className="grid grid-cols-3 gap-2 relative">
        {[{ icon: "⚡", label: "Gasless" }, { icon: "🛡️", label: "Safe AA" }, { icon: "🔵", label: "Base L2" }].map(f => (
          <div key={f.label} className="bg-white/[0.04] border border-white/[0.06] rounded-xl py-2.5 text-center">
            <p className="text-base">{f.icon}</p>
            <p className="text-[9px] uppercase font-black text-salvaGold tracking-wider">{f.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.06] dark:border-white/[0.06] last:border-0">
      <button onClick={() => setOpen(!open)}
        className="w-full py-6 flex justify-between items-center text-left group">
        <span className="text-base sm:text-lg font-bold tracking-tight pr-4 group-hover:text-salvaGold transition-colors duration-300">
          {question}
        </span>
        <motion.div animate={{ rotate: open ? 135 : 0 }} transition={{ duration: 0.25 }}>
          <div className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-all ${open ? "border-salvaGold bg-salvaGold text-black" : "border-current opacity-30"}`}>
            <span className="text-xs font-black leading-none">+</span>
          </div>
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden">
            <p className="pb-6 opacity-55 leading-relaxed text-sm sm:text-base max-w-3xl">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Ticker ───────────────────────────────────────────────────────────────────
const Ticker = () => {
  const items = [
    "V3 DEX Live",
    "Name Service Protocol",
    "NGNs Stablecoin",
    "Safe Smart Wallet",
    "Permissionless Pools",
    "Gasless Transactions",
    "On-Chain Identity",
    "LP Earn Fees",
    "Built on Base",
    "Swap NGNs/USDT/USDC",
  ];
  return (
    <div className="overflow-hidden py-4 border-y border-black/[0.06] dark:border-white/[0.06] my-24 bg-black/[0.02] dark:bg-white/[0.02]">
      <motion.div animate={{ x: ["0%", "-50%"] }} transition={{ duration: 24, ease: "linear", repeat: Infinity }}
        className="flex gap-8 whitespace-nowrap">
        {[...items, ...items].map((item, i) => (
          <span key={i} className="text-[10px] font-black uppercase tracking-[0.35em] text-salvaGold/40 flex items-center gap-6">
            {item} <span className="text-salvaGold/20">◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
};

// ─── Feature Section ──────────────────────────────────────────────────────────
const FeatureSection = ({ id, index, badge, tag, title, headline, body, extContent, visual, cta }) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const fromLeft = index % 2 === 0;
  return (
    <section id={id} ref={ref}
      className={`flex flex-col ${fromLeft ? "lg:flex-row" : "lg:flex-row-reverse"} gap-16 lg:gap-24 items-start py-24 border-b border-black/[0.05] dark:border-white/[0.05]`}>
      <motion.div initial={{ opacity: 0, x: fromLeft ? -40 : 40 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="flex-1 space-y-7">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.35em] border border-salvaGold/30 text-salvaGold bg-salvaGold/5">
            {badge && <span>{badge}</span>}{tag}
          </span>
        </div>
        <div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter leading-[0.92] mb-4">{title}</h2>
          <p className="text-xl text-salvaGold font-bold opacity-75">{headline}</p>
        </div>
        <p className="text-base opacity-55 leading-relaxed">{body}</p>
        <div className="space-y-4 text-sm leading-relaxed opacity-65">{extContent}</div>
        {cta && <div className="pt-2">{cta}</div>}
      </motion.div>
      <motion.div initial={{ opacity: 0, x: fromLeft ? 40 : -40 }} animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.18 }}
        className="flex-1 w-full lg:sticky lg:top-28">{visual}</motion.div>
    </section>
  );
};

// ─── Support Modal ────────────────────────────────────────────────────────────
const SupportModal = ({ onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
    <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 30 }}
      className="relative w-full max-w-lg bg-white dark:bg-zinc-950 border border-black/10 dark:border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl">
      <button onClick={onClose} className="absolute top-8 right-8 opacity-40 hover:opacity-100 transition-opacity"><X size={24} /></button>
      <div className="mb-7">
        <h2 className="text-3xl font-black tracking-tighter mb-1 uppercase">Get Help</h2>
        <p className="text-sm opacity-40 uppercase tracking-widest font-bold">Direct line to Salva Support</p>
      </div>
      <form onSubmit={e => {
        e.preventDefault();
        const fd = new FormData(e.target);
        window.location.href = `mailto:charlieonyii42@gmail.com?subject=${encodeURIComponent("SALVA SUPPORT: " + fd.get("topic"))}&body=${encodeURIComponent(`Name: ${fd.get("name")}\nAccount: ${fd.get("account")}\nIssue: ${fd.get("message")}`)}`; onClose();
      }} className="space-y-3">
        {[
          { name: "name",    placeholder: "Full Name" },
          { name: "account", placeholder: "Salva Account / Alias" },
          { name: "topic",   placeholder: "Topic" },
        ].map(f => (
          <input key={f.name} required name={f.name} placeholder={f.placeholder}
            className="w-full bg-black/[0.04] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors placeholder:opacity-30 text-sm" />
        ))}
        <textarea required name="message" rows={4} placeholder="How can we help?"
          className="w-full bg-black/[0.04] dark:bg-white/5 border border-black/10 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors placeholder:opacity-30 text-sm" />
        <button type="submit"
          className="w-full py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest text-sm">
          <Mail size={16} /> Send Request
        </button>
      </form>
    </motion.div>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────
const Home = () => {
  const [stats, setStats] = useState({ totalMinted: 0, userCount: 0 });
  const [statsLoading, setStatsLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const navigate = useNavigate();

  const { scrollY } = useScroll();
  const heroOpacity = useTransform(scrollY, [0, 400], [1, 0]);
  const heroY = useTransform(scrollY, [0, 400], [0, 80]);
  const heroScale = useTransform(scrollY, [0, 400], [1, 0.97]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("salva_user");
      if (saved) { const u = JSON.parse(saved); if (u?.safeAddress && !u?.ownerKey) { navigate("/dashboard", { replace: true }); return; } }
    } catch { localStorage.removeItem("salva_user"); }
    finally { setCheckingAuth(false); }
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/stats`);
        if (!res.ok) return;
        const d = await res.json();
        setStats({ totalMinted: parseFloat(d.totalMinted || 0), userCount: parseInt(d.userCount || 0) });
      } catch {} finally { setStatsLoading(false); }
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  if (checkingAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
      <motion.div animate={{ opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 2 }}
        className="text-salvaGold font-black text-2xl uppercase tracking-[0.5em]">SALVA</motion.div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white overflow-x-hidden transition-colors duration-300">
      <SEOMeta />
      <Stars />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <motion.section
        style={{ opacity: heroOpacity, y: heroY, scale: heroScale }}
        className="relative min-h-screen flex flex-col justify-center items-center text-center pt-28 pb-20 px-4 sm:px-6"
      >
        {/* Background glows */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <GlowOrb
            x="60%"
            y="10%"
            size="500px"
            color="rgba(212,175,55,0.06)"
            delay={0}
          />
          <GlowOrb
            x="10%"
            y="50%"
            size="400px"
            color="rgba(212,175,55,0.04)"
            delay={3}
          />
          <GlowOrb
            x="75%"
            y="60%"
            size="300px"
            color="rgba(34,197,94,0.03)"
            delay={6}
          />
        </div>

        {/* V3 badge */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 max-w-5xl mx-auto w-full"
        >
          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[clamp(2.8rem,8.5vw,7.5rem)] font-black mb-6 tracking-tighter leading-[0.86] px-2"
          >
            ON-CHAIN
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-salvaGold via-yellow-300 to-salvaGold animate-[shimmer_3s_linear_infinite]">
              PAYMENT RAILS.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.9 }}
            className="text-lg sm:text-xl md:text-2xl opacity-50 max-w-2xl mx-auto leading-relaxed mb-3 font-light"
          >
            DEX. Name Service. NGNs Stablecoin. Smart Wallet — all on Base.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45, duration: 0.8 }}
            className="text-[10px] opacity-25 mb-12 font-black uppercase tracking-[0.4em]"
          >
            No seed phrases · No gas · No wallet addresses
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-3 justify-center items-center mb-20"
          >
            <MagneticBtn
              onClick={() => navigate("/login")}
              className="w-full sm:w-auto px-10 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Create Free Wallet <ArrowUpRight size={15} />
            </MagneticBtn>
            <MagneticBtn
              onClick={() => navigate("/login")}
              className="w-full sm:w-auto px-10 py-4 border border-black/10 dark:border-white/10 font-bold rounded-2xl hover:border-salvaGold/40 hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Open DEX <ArrowUpRight size={15} />
            </MagneticBtn>
            <MagneticBtn
              onClick={() =>
                document
                  .getElementById("explore-dex")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full sm:w-auto px-10 py-4 border border-black/10 dark:border-white/10 font-bold rounded-2xl hover:border-salvaGold/40 hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest"
            >
              Explore V3 ↓
            </MagneticBtn>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
            <StatCard
              label="NGNs Circulating"
              value={stats.totalMinted}
              loading={statsLoading}
              suffix=" NGNs"
            />
            <StatCard
              label="Salva Citizens"
              value={stats.userCount}
              loading={statsLoading}
            />
          </div>
        </motion.div>

        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-20"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2.5 }}
        >
          <span className="text-[9px] uppercase tracking-[0.4em] font-bold">
            Scroll
          </span>
          <ChevronDown size={14} />
        </motion.div>
      </motion.section>

      <Ticker />

      {/* ── FEATURES ──────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* V3 DEX */}
        <FeatureSection
          id="explore-dex"
          index={0}
          badge="🔄"
          tag="Salva V3 DEX"
          title="Swap between NGN & USD stablecoins Instantly."
          headline="Permissionless OTC liquidity pools — anyone can be an LP."
          body="Salva V3 introduces a full on-chain DEX where liquidity providers deploy pools and set their own rates. Users swap between NGNs, USDT, and USDC in seconds via their Safe smart wallet — no bridges, no CEX, no delay."
          extContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Become an LP.
                </strong>{" "}
                Deploy your own pool, add NGNs or stablecoins, set your buy/sell
                rates, and subscribe to list it on the marketplace. Earn on
                every swap through your spread.
              </p>
            </div>
          }
          visual={<DEXVisual />}
          cta={
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Start Swapping <ArrowUpRight size={15} />
            </button>
          }
        />

        {/* Name Service */}
        <FeatureSection
          id="explore-name-service"
          index={1}
          badge="🔗"
          tag="Salva Naming Service (SNS)"
          title="Your Name. Your Wallet. Everywhere."
          headline="No more copying wallet addresses."
          body="Register charles@salva and share it like an email. Anyone on Salva — or any SNS-compatible app — can send money directly to that name. One name, any wallet, any chain."
          extContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Name your pool.
                </strong>{" "}
                V3 lets you link your pool contract to an SNS name like
                charles_pool@salva. Users see a human-readable identity instead
                of a hex address on the swap marketplace.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Namespace-isolated.
                </strong>{" "}
                charles@salva and charles@coinbase are completely separate
                identities. No collisions between ecosystems.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Phishing-resistant by design.
                </strong>{" "}
                Similar-sounding names are treated as identical at contract
                level. Nobody can register a lookalike to trick your contacts.
              </p>
            </div>
          }
          visual={<NameResolutionVisual />}
          cta={
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Get a Name <ArrowUpRight size={15} />
            </button>
          }
        />

        {/* Smart Wallet */}
        <FeatureSection
          id="explore-wallet"
          index={2}
          badge="🛡️"
          tag="Salva Smart Wallet"
          title="A Wallet That Feels Like Banking."
          headline="No seed phrase. No gas. No confusion."
          body="Sign up with your email, set a 4-digit PIN, and Salva creates a Safe-powered smart contract wallet for you instantly. Every transaction — swap, transfer, DEX trade — is gasless."
          extContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Non-custodial.
                </strong>{" "}
                Your keys are encrypted. Salva never sees it in plaintext. Only
                your PIN unlocks it.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Safe AA architecture.
                </strong>{" "}
                Built on the same institutional-grade smart account tech
                protecting billions in DeFi. Multisig-level security with
                consumer-grade UX.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  One wallet, everything.
                </strong>{" "}
                Send NGNs. Swap on the DEX. Register names. Become an LP. All
                from the same wallet, all gasless.
              </p>
            </div>
          }
          visual={<WalletVisual />}
          cta={
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Create Smart Wallet <ArrowUpRight size={15} />
            </button>
          }
        />

        {/* NGNs */}
        <FeatureSection
          id="explore-ngns"
          index={3}
          badge="₦"
          tag="NGNs Stablecoin"
          title="Nigerian Naira. On-Chain."
          headline="1 NGNs = ₦1. Always."
          body="NGNs is a digital Naira pegged 1:1 and tradeable on Salva's DEX against USDT and USDC. Buy it from the OTC desk, earn it through referrals, swap it, and send it to anyone in seconds."
          extContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Now DEX-tradeable.
                </strong>{" "}
                V3 lets anyone swap NGNs for USDT or USDC at market rates set by
                liquidity providers — no intermediary, no FX desk.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Instant settlement.
                </strong>{" "}
                Transactions confirm on Base in seconds. Every transfer is
                on-chain and permanently verifiable.
              </p>
            </div>
          }
          visual={<StablecoinVisual />}
          cta={
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Buy NGNs <ArrowUpRight size={15} />
            </button>
          }
        />
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-24 text-center">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
        >
          <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-4 opacity-60">
            Get started in minutes
          </p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-16">
            How It Works
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          {[
            {
              n: "01",
              title: "Create Wallet",
              desc: "Email + 4-digit PIN. Your Safe smart wallet is live in seconds. No seed phrase.",
            },
            {
              n: "02",
              title: "Register Name",
              desc: "Claim yourname@salva. Link it to your wallet or your pool contract.",
            },
            {
              n: "03",
              title: "Send & Receive",
              desc: "Send NGNs, USDT, USDC to any name or address. Gasless. Instant.",
            },
            {
              n: "04",
              title: "Swap on DEX",
              desc: "Trade between NGN and USD stablecoins on Salva V3. Or become an LP and earn from your spread.",
            },
          ].map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.7, delay: i * 0.1 }}
              className="relative p-7 rounded-3xl border border-black/[0.06] dark:border-white/[0.06] bg-black/[0.02] dark:bg-white/[0.02] hover:border-salvaGold/30 hover:bg-salvaGold/[0.02] transition-all group text-left"
            >
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-salvaGold/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="text-5xl font-black text-salvaGold/10 group-hover:text-salvaGold/25 transition-colors block mb-5">
                {step.n}
              </span>
              <h4 className="font-black text-base mb-2">{step.title}</h4>
              <p className="text-xs opacity-45 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── V3 CALLOUT ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative p-10 sm:p-16 rounded-[3rem] border border-salvaGold/15 overflow-hidden"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-salvaGold/6 via-transparent to-salvaGold/3" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.06),transparent)]" />
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
          <div className="relative text-center">
            <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-5 opacity-60">
              What's new on V3
            </p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-5">
              Permissionless DEX.
              <br />
              <span className="text-salvaGold">Anyone can be an LP.</span>
            </h2>
            <p className="text-base sm:text-lg opacity-50 max-w-2xl mx-auto leading-relaxed mb-12">
              Deploy a liquidity pool, fund it with NGNs or stablecoins and set
              your rate. Your pool earns on every swap through your bid-ask
              spread. Fully on-chain. Fully permissionless.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { stat: "100%", label: "On-chain" },
                { stat: "₦0", label: "Gas to swapper" },
                { stat: "V3", label: "Permissionless" },
                { stat: "Base", label: "Network" },
              ].map((item) => (
                <div
                  key={item.stat}
                  className="p-5 rounded-2xl bg-black/[0.04] dark:bg-white/[0.04] border border-salvaGold/10"
                >
                  <p className="text-2xl font-black text-salvaGold">
                    {item.stat}
                  </p>
                  <p className="text-[9px] uppercase tracking-widest opacity-35 font-bold mt-1">
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-24">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="text-center mb-14"
        >
          <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-4 opacity-60">
            Everything you need to know
          </p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter">
            FAQs
          </h2>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          {[
            {
              q: "What does V3 introduce?",
              a: "Salva V3 introduces a full on-chain DEX to the existing name service and NGNs stablecoin stack. Liquidity providers deploy pools, set their own NGNs/USDT/USDC rates, and earn through their bid-ask spread. Users swap via their Safe smart wallet — gasless, instant, permissionless.",
            },
            {
              q: "How do I become a liquidity provider?",
              a: "Go to the Deploy Pool tab in your Dashboard. Deploy your pool (one tx), add supported NGN or USDC stablecoins, set your buy/sell rates, then subscribe (pays a monthly NGNs fee) to list it on the swap marketplace. Your pool earns every time someone swaps through it.",
            },
            {
              q: "What is a Salva name?",
              a: "A short, human-readable alias — like charles@base or charles_pool@salva. Anyone can send money to that name directly. V3 extends this so your pool contract can also have a name, making it identifiable on the DEX marketplace.",
            },
            {
              q: "Is Salva wallet self-custodial?",
              a: "Yes. Your private key is encrypted. Salva never sees it in plaintext. Only your 4-digit PIN decrypts it locally to sign transactions. Not even Salva can move your funds.",
            },
            {
              q: "What is NGNs?",
              a: "A Nigerian Naira-pegged stablecoin on Base. 1 NGNs = ₦1. It's used for transfers, name registration, pool subscriptions, and now DEX swaps against USDT and USDC. No FX exposure, no volatility.",
            },
          ].map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </motion.div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-28">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative p-12 sm:p-20 rounded-[3rem] bg-salvaGold overflow-hidden text-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.2),transparent)]" />
          <motion.div
            animate={{
              x: ["0%", "3%", "0%", "-3%", "0%"],
              y: ["0%", "-3%", "0%", "3%", "0%"],
            }}
            transition={{ repeat: Infinity, duration: 14, ease: "easeInOut" }}
            className="absolute top-0 right-0 w-80 h-80 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2"
          />
          <motion.div
            animate={{
              x: ["0%", "-4%", "0%", "4%", "0%"],
              y: ["0%", "4%", "0%", "-4%", "0%"],
            }}
            transition={{ repeat: Infinity, duration: 18, ease: "easeInOut" }}
            className="absolute bottom-0 left-0 w-56 h-56 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2"
          />
          <div className="relative z-10">
            <p className="text-black/50 font-black text-[10px] uppercase tracking-[0.45em] mb-4">
              V3 is live — start now
            </p>
            <h2 className="text-4xl sm:text-6xl font-black tracking-tighter text-black mb-5 leading-[0.9]">
              Claim Your Name.
              <br />
              Swap Your Naira.
            </h2>
            <p className="text-black/55 text-base sm:text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              One wallet. DEX access. NGNs stablecoin. Human-readable identity.
              All free to start. Under two minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center justify-center gap-2 px-12 py-5 bg-black text-salvaGold font-black rounded-2xl hover:bg-zinc-900 active:scale-95 transition-all text-sm uppercase tracking-widest shadow-2xl shadow-black/30"
              >
                Get Started Free <ArrowUpRight size={16} />
              </button>
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center justify-center gap-2 px-10 py-5 border-2 border-black/20 text-black font-black rounded-2xl hover:border-black/40 hover:bg-black/5 active:scale-95 transition-all text-sm uppercase tracking-widest"
              >
                Open DEX <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-black/[0.05] dark:border-white/[0.05]">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="max-w-xs">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-2xl font-black tracking-tighter text-salvaGold">
                SALVA
              </h2>
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-salvaGold/10 text-salvaGold border border-salvaGold/20">
                V3
              </span>
            </div>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-25 font-bold mb-4">
              On-Chain Payment Infrastructure
            </p>
            <p className="text-sm opacity-35 leading-relaxed">
              DEX. Names. NGNs. Smart Wallet. Built on Base. Non-custodial.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 text-sm">
            {[
              {
                heading: "Protocol",
                links: [
                  { label: "V3 DEX", id: "explore-dex" },
                  { label: "Name Service", id: "explore-name-service" },
                  { label: "Smart Wallet", id: "explore-wallet" },
                  { label: "NGNs", id: "explore-ngns" },
                ],
              },
              {
                heading: "Build",
                links: [
                  { label: "GitHub", href: "https://github.com/salva-Nexus" },
                  { label: "Twitter", href: "https://x.com/salva_Nexus" },
                ],
              },
              {
                heading: "Support",
                links: [
                  { label: "Get Help", action: () => setSupportOpen(true) },
                ],
              },
              { heading: "Network", links: [] },
            ].map((col) => (
              <div key={col.heading}>
                <p className="text-[10px] uppercase tracking-widest opacity-25 font-black mb-3">
                  {col.heading}
                </p>
                <div className="space-y-2.5">
                  {col.links.map((link) =>
                    link.href ? (
                      <a
                        key={link.label}
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="block opacity-40 hover:opacity-100 hover:text-salvaGold transition-all"
                      >
                        {link.label}
                      </a>
                    ) : link.action ? (
                      <button
                        key={link.label}
                        onClick={link.action}
                        className="block opacity-40 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                      >
                        {link.label}
                      </button>
                    ) : (
                      <button
                        key={link.label}
                        onClick={() =>
                          document
                            .getElementById(link.id)
                            ?.scrollIntoView({ behavior: "smooth" })
                        }
                        className="block opacity-40 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                      >
                        {link.label}
                      </button>
                    ),
                  )}
                  {col.heading === "Network" && (
                    <span className="flex items-center gap-1.5 text-salvaGold font-bold opacity-70">
                      <motion.span
                        animate={{ opacity: [1, 0.3, 1] }}
                        transition={{ repeat: Infinity, duration: 2 }}
                        className="w-1.5 h-1.5 bg-green-500 rounded-full block"
                      />
                      Base Mainnet
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-12 pt-8 border-t border-black/[0.05] dark:border-white/[0.05]">
          <p className="text-[10px] opacity-15 uppercase tracking-widest font-bold">
            © 2025 Salva Protocol. Non-custodial. Open Source.
          </p>
          <div className="flex items-center gap-2">
            {[
              { href: "https://x.com/salva_Nexus", icon: <XLogo size={14} /> },
              {
                href: "https://github.com/salva-Nexus",
                icon: <Github size={14} />,
              },
            ].map((s) => (
              <a
                key={s.href}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                className="p-3 rounded-full bg-black/[0.04] dark:bg-white/5 border border-black/[0.06] dark:border-white/10 opacity-40 hover:opacity-100 hover:text-salvaGold transition-all"
              >
                {s.icon}
              </a>
            ))}
            <button
              onClick={() => setSupportOpen(true)}
              className="p-3 rounded-full bg-black/[0.04] dark:bg-white/5 border border-black/[0.06] dark:border-white/10 opacity-40 hover:opacity-100 hover:text-salvaGold transition-all"
            >
              <Mail size={14} />
            </button>
          </div>
        </div>
      </footer>

      <AnimatePresence>
        {supportOpen && <SupportModal onClose={() => setSupportOpen(false)} />}
      </AnimatePresence>
    </div>
  );
};

export default Home;