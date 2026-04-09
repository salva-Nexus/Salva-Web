// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useRef } from "react";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  animate,
  AnimatePresence,
} from "framer-motion";
import {
  Github,
  Mail,
  X,
  ChevronDown,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Stars from "../components/Stars";

// ─── SEO Meta ────────────────────────────────────────────────────────────────
const SEOMeta = () => {
  useEffect(() => {
    document.title =
      "Salva — On-Chain Name Service & Nigerian Naira Stablecoin | Built on Base";
    const setMeta = (name, content, prop = false) => {
      const attr = prop ? "property" : "name";
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    setMeta(
      "description",
      "Salva is the on-chain name service and payment protocol built on Base. Register a human-readable alias like charles@salva, hold NGNs stablecoin pegged 1:1 to the Nigerian Naira, and send money like a text — no wallet addresses, no gas fees, no seed phrases.",
    );
    setMeta(
      "keywords",
      "Salva, NGNs, Nigerian stablecoin, on-chain name service, SNS, Base blockchain, smart wallet, Account Abstraction, Safe wallet, Nigeria DeFi, naira stablecoin, blockchain payments Nigeria, send crypto with name, web3 wallet",
    );
    setMeta("og:title", "Salva — Send Money Like Sending a Text", true);
    setMeta(
      "og:description",
      "Human-readable names for every wallet. NGNs stablecoin pegged to the Naira. Gasless smart wallets. Built on Base.",
      true,
    );
    setMeta("og:type", "website", true);
    setMeta("og:url", "https://salva-nexus.org", true);
    setMeta("twitter:card", "summary_large_image");
    setMeta("twitter:site", "@salva_Nexus");
    setMeta("twitter:title", "Salva — On-Chain Payment Infrastructure");
    setMeta(
      "twitter:description",
      "Register your name on-chain. Hold NGNs stablecoin. Send money like a text — no addresses, no gas, no complexity. Built on Base.",
    );
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
const CountUp = ({ to, decimals = 0 }) => {
  const [val, setVal] = useState(0);
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    const target =
      typeof to === "string" ? parseFloat(to.replace(/,/g, "")) : to;
    if (isNaN(target)) return;
    const c = animate(0, target, {
      duration: 2.8,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setVal(v),
    });
    return () => c.stop();
  }, [to, inView]);
  return (
    <span ref={ref}>
      {val.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
};

function formatNGNsStat(n) {
  const v = parseFloat(n) || 0;
  return v > 10_000_000
    ? { capped: true, label: "10M+" }
    : { capped: false, value: v };
}
function formatCitizensStat(n) {
  const v = parseInt(n) || 0;
  return v > 200_000
    ? { capped: true, label: "200K+" }
    : { capped: false, value: v };
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-200 dark:border-salvaGold/10 last:border-0">
      <button
        onClick={() => setOpen(!open)}
        className="w-full py-6 flex justify-between items-center text-left group"
      >
        <span className="text-base sm:text-lg font-bold tracking-tight pr-4 group-hover:text-salvaGold transition-colors duration-300">
          {question}
        </span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        >
          <ChevronDown
            className={`flex-shrink-0 transition-colors ${open ? "text-salvaGold" : "opacity-40"}`}
          />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <p className="pb-6 opacity-60 leading-relaxed text-sm sm:text-base max-w-3xl">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ─── Ticker ───────────────────────────────────────────────────────────────────
const Ticker = () => {
  const items = [
    "Name Service Protocol",
    "NGNs Stablecoin",
    "Safe Smart Wallet",
    "Multi-Chain Ready",
    "Gasless Transactions",
    "On-Chain Identity",
    "Zero Seed Phrases",
    "Phishing Resistant",
    "Built on Base",
    "DNS for Everything On-chain",
  ];
  return (
    <div className="overflow-hidden py-5 border-y border-gray-200 dark:border-salvaGold/10 my-20 bg-gray-50 dark:bg-salvaGold/[0.02]">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 28, ease: "linear", repeat: Infinity }}
        className="flex gap-10 whitespace-nowrap"
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            className="text-[10px] font-black uppercase tracking-[0.3em] text-salvaGold/50 flex items-center gap-5"
          >
            {item} <span className="text-salvaGold/30">◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
};

// ─── Chain Badge ──────────────────────────────────────────────────────────────
const ChainBadge = () => (
  <div className="inline-flex items-center gap-3 bg-black/10 dark:bg-black/30 border border-salvaGold/30 rounded-full px-5 py-2.5 mb-10">
    <span className="w-2 h-2 bg-salvaGold rounded-full animate-pulse" />
    <span className="text-[10px] text-salvaGold font-black uppercase tracking-[0.3em]">
      Live on Base Mainnet
    </span>
  </div>
);

// ─── Name Resolution Visual ───────────────────────────────────────────────────
const NameResolutionVisual = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const demos = [
    {
      alias: "cboi@salva",
      type: "Individual · Salva Ecosystem",
      dest: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    },
    {
      alias: "suzy_brown@coinbase",
      type: "Individual · Coinbase",
      dest: "0xAb5801a7D398351b8bE11C439e05C5B3259aeC9f",
    },
    {
      alias: "usdc_eth@usdc",
      type: "Protocol · USDC",
      dest: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    },
    {
      alias: "uniswapv4@uniswap",
      type: "Protocol · Uniswap",
      dest: "0x1F98431c8aD98523631AE4a59f267346ea31F984",
    },
  ];
  useEffect(() => {
    const t = setInterval(
      () => setActiveIdx((i) => (i + 1) % demos.length),
      2400,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative bg-gray-50 dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:via-zinc-900 dark:to-[#0A0A0B] rounded-3xl border border-gray-200 dark:border-salvaGold/20 overflow-hidden p-7 shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.06),transparent)]" />
      <p className="text-[10px] uppercase tracking-[0.35em] text-salvaGold font-black mb-5 opacity-70 flex items-center gap-2">
        <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse inline-block" />
        Live Resolution Engine
      </p>
      <div className="space-y-2.5">
        {demos.map((item, i) => (
          <motion.div
            key={i}
            animate={{
              opacity: activeIdx === i ? 1 : 0.2,
              scale: activeIdx === i ? 1 : 0.985,
              x: activeIdx === i ? 0 : -4,
            }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col gap-1 bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] rounded-2xl px-5 py-3.5 shadow-sm dark:shadow-none"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-salvaGold font-black text-sm truncate">
                {item.alias}
              </span>
              <ArrowRight size={12} className="opacity-30 flex-shrink-0" />
              <span className="font-mono text-[10px] opacity-40 truncate max-w-[140px] hidden sm:block">
                {item.dest.slice(0, 20)}…
              </span>
            </div>
            <span className="text-[9px] text-salvaGold/50 dark:text-salvaGold/40 uppercase tracking-widest font-bold">
              {item.type}
            </span>
          </motion.div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-white/5 flex items-center justify-between">
        <span className="text-[9px] opacity-30 uppercase tracking-widest font-bold">
          Namespace-isolated · Collision-proof
        </span>
        <span className="text-[9px] text-green-500 font-black">● On-chain</span>
      </div>
    </div>
  );
};

// ─── Stablecoin Visual ────────────────────────────────────────────────────────
const StablecoinVisual = () => {
  const [price, setPrice] = useState(1.0);
  const txs = [
    { from: "charles@salva", to: "sandra@rabby", amt: "50,000 NGNs" },
    { from: "ola@metamask", to: "emeka@salva", amt: "12,500 NGNs" },
    { from: "aisha@coinbase", to: "peter@binance", amt: "200,000 NGNs" },
  ];
  useEffect(() => {
    const t = setInterval(
      () => setPrice(1 + (Math.random() * 0.0006 - 0.0003)),
      1800,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative bg-gray-50 dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:via-zinc-900 dark:to-[#0A0A0B] rounded-3xl border border-gray-200 dark:border-salvaGold/20 overflow-hidden p-7 shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.06),transparent)]" />
      <div className="flex items-center justify-between mb-5">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-salvaGold font-black opacity-70">
            NGNs / NGN Exchange
          </p>
          <div className="flex items-baseline gap-2 mt-1">
            <motion.span
              key={price.toFixed(4)}
              initial={{ y: -8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="text-3xl font-black text-salvaGold"
            >
              ₦{price.toFixed(4)}
            </motion.span>
            <span className="text-[10px] text-green-500 font-black bg-green-500/10 px-2 py-0.5 rounded-full">
              ± 0.03%
            </span>
          </div>
        </div>
        <div className="w-14 h-14 rounded-full bg-salvaGold/10 border-2 border-salvaGold/40 flex items-center justify-center">
          <span className="text-2xl font-black text-salvaGold">₦</span>
        </div>
      </div>
      <div className="space-y-2 mb-4">
        <p className="text-[10px] uppercase tracking-[0.3em] opacity-30 font-bold">
          Recent Transfers
        </p>
        {txs.map((tx, i) => (
          <div
            key={i}
            className="flex items-center justify-between bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] rounded-xl px-4 py-2.5 shadow-sm dark:shadow-none"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-salvaGold text-[10px] font-black truncate max-w-[90px]">
                {tx.from}
              </span>
              <ArrowRight size={10} className="opacity-30 flex-shrink-0" />
              <span className="text-[10px] opacity-50 font-bold truncate max-w-[80px]">
                {tx.to}
              </span>
            </div>
            <span className="text-[10px] text-salvaGold font-black flex-shrink-0 ml-2">
              {tx.amt}
            </span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["1 NGNs = ₦1", "No FX Risk", "Instant"].map((t) => (
          <div
            key={t}
            className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] rounded-xl py-2.5 text-center shadow-sm dark:shadow-none"
          >
            <span className="text-[9px] font-black text-salvaGold uppercase tracking-wider">
              {t}
            </span>
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
    {
      label: "NGNs Balance",
      val: "1,250,000",
      sym: "NGNs",
      sub: "≈ ₦1,250,000",
    },
    { label: "USDT Balance", val: "823.50", sym: "USDT", sub: "≈ $823.50" },
    { label: "USDC Balance", val: "410.00", sym: "USDC", sub: "≈ $410.00" },
  ];
  useEffect(() => {
    const t = setInterval(
      () => setBalIdx((i) => (i + 1) % balances.length),
      2600,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative bg-gray-50 dark:bg-gradient-to-br dark:from-[#0A0A0B] dark:via-zinc-900 dark:to-[#0A0A0B] rounded-3xl border border-gray-200 dark:border-salvaGold/20 overflow-hidden p-7 shadow-xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.04),transparent)]" />
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.35em] text-salvaGold font-black opacity-70">
            Salva Smart Wallet
          </p>
          <p className="font-mono text-[10px] opacity-30 mt-1">
            cboi@salva · 0xb298...3Cb7
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1">
          <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span className="text-[10px] text-green-500 font-black">Active</span>
        </div>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={balIdx}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6"
        >
          <p className="text-[10px] uppercase opacity-40 font-bold">
            {balances[balIdx].label}
          </p>
          <p className="text-4xl font-black mt-1">
            {balances[balIdx].val}{" "}
            <span className="text-salvaGold text-xl">
              {balances[balIdx].sym}
            </span>
          </p>
          <p className="text-[10px] opacity-30 font-bold mt-1">
            {balances[balIdx].sub}
          </p>
        </motion.div>
      </AnimatePresence>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-salvaGold text-black font-black text-xs uppercase tracking-widest py-3 rounded-2xl text-center">
          SEND
        </div>
        <div className="border border-salvaGold/30 text-salvaGold font-black text-xs uppercase tracking-widest py-3 rounded-2xl text-center">
          RECEIVE
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: "⚡", label: "Gasless" },
          { icon: "🛡️", label: "Safe AA" },
          { icon: "🔵", label: "Base L2" },
        ].map((f) => (
          <div
            key={f.label}
            className="bg-white dark:bg-white/[0.04] border border-gray-200 dark:border-white/[0.07] rounded-xl py-2.5 text-center shadow-sm dark:shadow-none"
          >
            <p className="text-base">{f.icon}</p>
            <p className="text-[9px] uppercase font-black text-salvaGold tracking-wider">
              {f.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Explore Feature Section ──────────────────────────────────────────────────
const ExploreFeature = ({
  id,
  index,
  emoji,
  tag,
  title,
  headline,
  description,
  extendedContent,
  visual,
  cta,
}) => {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const fromLeft = index % 2 === 0;

  return (
    <section
      id={id}
      ref={ref}
      className={`flex flex-col ${fromLeft ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 lg:gap-20 items-start py-20 sm:py-24 border-b border-gray-100 dark:border-salvaGold/10`}
    >
      <motion.div
        initial={{ opacity: 0, x: fromLeft ? -50 : 50 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 space-y-6"
      >
        <div className="flex items-center gap-3">
          <span className="text-3xl">{emoji}</span>
          <span className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black">
            {tag}
          </span>
        </div>
        <div>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter leading-[0.94] mb-3">
            {title}
          </h2>
          <p className="text-lg sm:text-xl text-salvaGold font-bold opacity-80">
            {headline}
          </p>
        </div>
        <p className="text-base opacity-60 leading-relaxed">{description}</p>
        <div className="space-y-4 text-sm leading-relaxed opacity-70">
          {extendedContent}
        </div>
        {cta && <div className="pt-2">{cta}</div>}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: fromLeft ? 50 : -50 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="flex-1 w-full lg:sticky lg:top-28"
      >
        {visual}
      </motion.div>
    </section>
  );
};

// ─── Support Modal ────────────────────────────────────────────────────────────
const SupportModal = ({ onClose }) => (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="absolute inset-0 bg-black/90 backdrop-blur-md"
    />
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 30 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      exit={{ scale: 0.9, opacity: 0, y: 30 }}
      className="relative w-full max-w-lg bg-white dark:bg-[#0D0D0E] border border-gray-200 dark:border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl"
    >
      <button
        onClick={onClose}
        className="absolute top-8 right-8 opacity-40 hover:opacity-100 transition-opacity"
      >
        <X size={24} />
      </button>
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase">
          Get Help
        </h2>
        <p className="text-sm opacity-50 uppercase tracking-widest font-bold">
          Direct line to Salva Support
        </p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.target);
          const subject = `SALVA SUPPORT: ${fd.get("topic")}`;
          const body = `Name: ${fd.get("name")}\nAccount: ${fd.get("account")}\nIssue: ${fd.get("message")}`;
          window.location.href = `mailto:charlieonyii42@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
          onClose();
        }}
        className="space-y-4"
      >
        <input
          required
          name="name"
          placeholder="Full Name"
          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors placeholder:opacity-40"
        />
        <input
          required
          name="account"
          placeholder="Salva Account / Alias"
          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors placeholder:opacity-40"
        />
        <input
          required
          name="topic"
          placeholder="Topic"
          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors placeholder:opacity-40"
        />
        <textarea
          required
          name="message"
          rows={4}
          placeholder="How can we help you today?"
          className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors placeholder:opacity-40"
        />
        <button
          type="submit"
          className="w-full py-5 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest"
        >
          <Mail size={18} /> Send Request
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
  const heroOpacity = useTransform(scrollY, [0, 380], [1, 0]);
  const heroY = useTransform(scrollY, [0, 380], [0, 70]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("salva_user");
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.safeAddress && !u?.ownerKey) {
          navigate("/dashboard", { replace: true });
          return;
        }
      }
    } catch {
      localStorage.removeItem("salva_user");
    } finally {
      setCheckingAuth(false);
    }
  }, [navigate]);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/stats`);
        if (!res.ok) return;
        const d = await res.json();
        setStats({
          totalMinted: parseFloat(d.totalMinted || 0),
          userCount: parseInt(d.userCount || 0),
        });
      } catch {
      } finally {
        setStatsLoading(false);
      }
    };
    load();
    const iv = setInterval(load, 60000);
    return () => clearInterval(iv);
  }, []);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <motion.div
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ repeat: Infinity, duration: 1.8 }}
          className="text-salvaGold font-black text-2xl uppercase tracking-widest"
        >
          SALVA
        </motion.div>
      </div>
    );
  }

  const ngns = formatNGNsStat(stats.totalMinted);
  const citizens = formatCitizensStat(stats.userCount);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white overflow-x-hidden transition-colors duration-300">
      <SEOMeta />
      <Stars />

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <motion.section
        style={{ opacity: heroOpacity, y: heroY }}
        className="relative min-h-screen flex flex-col justify-center items-center text-center pt-24 pb-16 px-4 sm:px-6"
      >
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_60%_at_50%_30%,rgba(212,175,55,0.08),transparent)] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10 max-w-5xl mx-auto w-full"
        >
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="flex justify-center mb-6"
          >
            <ChainBadge />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="text-[clamp(2.8rem,8vw,7rem)] font-black mb-6 tracking-tighter leading-[0.88] px-2"
          >
            ON-CHAIN PAYMENT
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-salvaGold via-yellow-400 to-salvaGold">
              INFRASTRUCTURE.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.48, duration: 0.9 }}
            className="text-lg sm:text-xl md:text-2xl opacity-60 max-w-2xl mx-auto leading-relaxed mb-3 font-light"
          >
            Salva is the premier on-chain name service and financial protocol
            designed for everyday payments and data resolution.
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.62, duration: 0.8 }}
            className="text-xs opacity-30 mb-12 font-bold uppercase tracking-[0.35em]"
          >
            No seed phrases · No gas fees · No wallet addresses
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.72, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <button
              onClick={() => navigate("/login")}
              className="w-full sm:w-auto px-10 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/25 text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Create Free Wallet <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() =>
                document
                  .getElementById("explore-name-service")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
              className="w-full sm:w-auto px-10 py-4 border border-black/15 dark:border-white/10 font-bold rounded-2xl hover:border-salvaGold/50 hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest"
            >
              Explore Salva ↓
            </button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.88, duration: 1 }}
            className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto"
          >
            {[
              {
                label: "NGNs Circulating",
                value: statsLoading ? (
                  "—"
                ) : ngns.capped ? (
                  ngns.label
                ) : (
                  <>
                    <CountUp to={ngns.value} />{" "}
                    <span className="text-salvaGold text-lg font-bold ml-1">
                      NGNs
                    </span>
                  </>
                ),
              },
              {
                label: "Salva Citizens",
                value: statsLoading ? (
                  "—"
                ) : citizens.capped ? (
                  citizens.label
                ) : (
                  <CountUp to={citizens.value} />
                ),
              },
            ].map((s, i) => (
              <div
                key={i}
                className="relative p-7 rounded-3xl bg-gray-50 dark:bg-white/[0.04] border border-gray-200 dark:border-salvaGold/15 text-left group hover:border-salvaGold/40 transition-all"
              >
                <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-salvaGold/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-2 opacity-70">
                  {s.label}
                </p>
                <h3 className="text-4xl sm:text-5xl font-black tracking-tight">
                  {s.value}
                </h3>
              </div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-25"
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

      {/* ── EXPLORE FEATURES ─────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* 1. Name Service */}
        <ExploreFeature
          id="explore-name-service"
          index={0}
          emoji="🔗"
          tag="Salva Naming Service (SNS)"
          title="Your Name. Your Wallet. Everywhere."
          headline="No more copying long wallet addresses."
          description="With Salva Naming Service, you register a short, memorable name — like charles@salva — and anyone can send money directly to that name. No need to copy-paste a long string of letters and numbers. Just type a name, hit send."
          extendedContent={
            <div className="space-y-4">
              <p>
                Think of it like an email address or a phone contact — except it
                works for sending crypto and digital payments. Once your name is
                registered, you share it with whoever needs to pay you, and the
                money goes straight to your wallet.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Names belong to different services.
                </strong>{" "}
                The part after the @ tells you which wallet that name is linked
                to. <em>charles@salva</em> and <em>charles@coinbase</em> are two
                completely separate names — just like how someone can have the
                same username on different platforms, but each one is distinct.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  No look-alike scams.
                </strong>{" "}
                Salva is built so that similar-sounding names — like{" "}
                <em>charles_okoronkwo</em> and <em>okoronkwo_charles</em> — are
                treated as the same name. This means nobody can register a name
                that looks just like yours to trick your contacts into sending
                money to the wrong place.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Works across multiple wallets and apps.
                </strong>{" "}
                Your name can point to your Salva Wallet, your Coinbase Wallet,
                your Trust Wallet, or any other compatible wallet. The name
                travels with you — not with any specific app.
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

        {/* 2. Smart Wallet */}
        <ExploreFeature
          id="explore-wallet"
          index={1}
          emoji="🛡️"
          tag="Salva Smart Wallet"
          title="A Wallet That Feels Like a Banking App."
          headline="No seed phrase. No gas. No confusion."
          description="Most crypto wallets require you to write down a 24-word recovery phrase, manage ETH for transaction fees, and handle raw wallet addresses. Salva Wallet throws all of that out. You sign up with your email, set a 4-digit PIN, and you're ready to send and receive money."
          extendedContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Zero gas fees.
                </strong>{" "}
                Every time you make a transaction — sending NGNs, USDT, or USDC
                — Salva covers the network fee for you. You never need to hold
                ETH or worry about how much a transaction costs. It works
                exactly like an internet banking app, where the bank handles the
                behind-the-scenes infrastructure.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Your money is protected by the same tech used by major
                  institutions.
                </strong>{" "}
                Salva Wallet is built on Safe — the smart account technology
                that has been protecting billions of dollars in institutional
                funds for years. Every Salva account benefits from
                enterprise-grade security out of the box, with no extra setup
                required from you.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Hold multiple currencies in one place.
                </strong>{" "}
                Your wallet can hold NGNs (Nigerian Naira on-chain), USDT, and
                USDC — all in the same account. Switch between them, send in
                whichever currency your recipient prefers, and manage everything
                from one simple screen.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Only you can access your money.
                </strong>{" "}
                Your 4-digit PIN is the key to your account. Salva never stores
                your key in a way that gives us access to your funds. Even if
                something happened to Salva, your money stays yours. You can
                always recover your account with your PIN.
              </p>
            </div>
          }
          visual={<WalletVisual />}
          cta={
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Create a Smart Wallet <ArrowUpRight size={15} />
            </button>
          }
        />

        {/* 3. NGNs */}
        <ExploreFeature
          id="explore-ngns"
          index={2}
          emoji="₦"
          tag="NGNs Stablecoin"
          title="Nigerian Naira. On the Blockchain."
          headline="1 NGNs = ₦1. Always."
          description="NGNs is a digital version of the Nigerian Naira that lives on the blockchain. It holds its value — 1 NGNs is always worth exactly ₦1. That means you can send, save, and receive in Naira without touching volatile cryptocurrencies that go up and down unpredictably."
          extendedContent={
            <div className="space-y-4">
              <p>
                <strong className="text-black dark:text-white">
                  Your money keeps its value.
                </strong>{" "}
                When you send ₦50,000, the recipient gets ₦50,000. There's no
                exchange rate risk, no volatility, and no surprises. The value
                is locked to the Naira, so what you send is exactly what arrives
                — minus a small flat fee.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Simple, predictable fees.
                </strong>{" "}
                Sending NGNs between wallets costs a flat ₦10 for amounts up to
                ₦99,999, and ₦20 for amounts above ₦100,000. That's it. No
                percentage cut, no hidden charges, no surprises. Small amounts
                are completely free.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Every transaction is publicly visible and verifiable.
                </strong>{" "}
                Because NGNs lives on the blockchain, every transfer is
                permanently recorded. Anyone can check the transaction history —
                there's no private bank ledger, no back-office processing, no
                waiting for settlement. Payments clear instantly and can be
                confirmed by anyone.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Use it anywhere ERC-20 tokens are accepted.
                </strong>{" "}
                NGNs follows the same standard as USDT and USDC — meaning it
                works with MetaMask, Coinbase Wallet, Trust Wallet, and any
                other compatible wallet. Your Naira balance isn't locked inside
                Salva.
              </p>
              <p>
                <strong className="text-black dark:text-white">
                  Naira-to-NGNs top-up is coming.
                </strong>{" "}
                The ability to fund your wallet directly from a Nigerian bank
                account — and cash out back to Naira — is the next feature being
                built. The on-chain infrastructure is already live. The bank
                bridge is coming.
              </p>
            </div>
          }
          visual={<StablecoinVisual />}
          cta={
            <div className="relative inline-block">
              <button
                disabled
                className="inline-flex items-center gap-2 px-8 py-4 bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 text-black/30 dark:text-white/30 font-black rounded-2xl text-sm uppercase tracking-widest cursor-not-allowed"
              >
                Buy NGNs
              </button>
              <span className="absolute -top-2.5 -right-2.5 text-[9px] bg-salvaGold text-black font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                Coming Soon
              </span>
            </div>
          }
        />
      </div>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.9 }}
        >
          <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-4 opacity-70">
            Get started in three steps
          </p>
          <h2 className="text-4xl sm:text-5xl font-black tracking-tighter mb-14">
            How It Works
          </h2>
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              n: "01",
              title: "Create Your Wallet",
              desc: "Sign up with your email and a 4-digit PIN. Salva automatically sets up your smart wallet — no technical knowledge needed, no seed phrases to write down, ready in seconds.",
            },
            {
              n: "02",
              title: "Register Your Name",
              desc: "Choose your alias — like yourname@salva. Link it to your Salva Wallet, or any other compatible wallet you already use.",
            },
            {
              n: "03",
              title: "Send & Receive",
              desc: "Share your name with anyone who needs to pay you. When you want to pay someone, just type their name instead of a wallet address. That's the whole experience.",
            },
          ].map((step, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.8, delay: i * 0.12 }}
              className="relative p-8 rounded-3xl border border-gray-100 dark:border-white/[0.07] bg-gray-50 dark:bg-white/[0.03] hover:border-salvaGold/40 hover:bg-salvaGold/[0.03] transition-all group text-left"
            >
              <span className="text-5xl font-black text-salvaGold/10 group-hover:text-salvaGold/20 transition-colors block mb-5">
                {step.n}
              </span>
              <h4 className="font-black text-lg mb-3">{step.title}</h4>
              <p className="text-sm opacity-50 leading-relaxed">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── CALLOUT ───────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 mb-8">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative p-10 sm:p-16 rounded-[3rem] bg-gradient-to-br from-salvaGold/8 via-salvaGold/3 to-transparent dark:from-salvaGold/8 border border-salvaGold/20 text-center overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.07),transparent)]" />
          <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-5 opacity-70">
            Why Salva is different
          </p>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-5">
            Built with phishing resistance
            <br />
            <span className="text-salvaGold">at contract level.</span>
          </h2>
          <p className="text-base sm:text-lg opacity-60 max-w-2xl mx-auto leading-relaxed mb-10">
            Salva is designed so that similar-looking names — like{" "}
            <em>charles_okoronkwo</em> and <em>okoronkwo_charles</em> — are
            treated as identical. Nobody can register a name that looks just
            like yours to trick people into sending money to the wrong address.
            This protection happens automatically, for every name, on every
            transaction.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { stat: "$1", label: "One-time name fee" },
              { stat: "₦0", label: "Gas cost to you" },
              { stat: "24/7", label: "Online" },
              { stat: "0", label: "Seed phrases" },
            ].map((item) => (
              <div
                key={item.stat}
                className="p-5 rounded-2xl bg-white/60 dark:bg-black/30 border border-salvaGold/15"
              >
                <p className="text-2xl font-black text-salvaGold">
                  {item.stat}
                </p>
                <p className="text-[10px] uppercase tracking-widest opacity-40 font-bold mt-1">
                  {item.label}
                </p>
              </div>
            ))}
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
          <p className="text-[10px] uppercase tracking-[0.45em] text-salvaGold font-black mb-4 opacity-70">
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
              q: "What is a Salva name?",
              a: "A Salva name is a short, human-readable address you register — like charles@salva or aisha@trustwallet. Instead of sharing a long wallet address (0x...) every time someone needs to pay you, you just share your name. Anyone on Salva can send money to that name, and it goes directly to your linked wallet. Think of it like a username, except it actually receives money.",
            },
            {
              q: "Can someone register a name that looks like mine to scam people?",
              a: "No. Salva is specifically designed to prevent this. Names with similar words in a different order — like charles_okoronkwo and okoronkwo_charles — are treated as the same name. Only one person can hold each unique name combination, regardless of word order. This makes look-alike name squatting impossible.",
            },
            {
              q: "Do I need to know anything about crypto to use Salva?",
              a: "No. Salva is designed to feel like a regular banking or payments app. You sign up with your email, set a PIN, and you're ready. The wallet is created automatically, gas fees are covered for you, and you send money using names instead of addresses. You don't need to understand blockchain, manage private keys, or hold any cryptocurrency for fees.",
            },
            {
              q: "Is my money safe? Who controls it?",
              a: "You do, entirely. Your Salva Wallet is a smart contract that only you control with your PIN. Salva cannot move your funds — we simply power the infrastructure. Your PIN is the only thing that authorizes transactions. Even if Salva's servers went offline, your money would still be in your wallet on the blockchain, accessible with your credentials.",
            },
            {
              q: "What is NGNs and how is it different from regular crypto?",
              a: "NGNs is a digital version of the Nigerian Naira. Unlike Bitcoin or ETH which fluctuate in price, NGNs is always worth exactly ₦1. This means you can save, send, and receive in Naira without worrying about your money losing value overnight. It's designed for everyday payments — the same way you'd use mobile money or a bank transfer, but running on blockchain rails.",
            },
            {
              q: "How much does it cost to register a name?",
              a: "Registering a name costs $1 (paid in NGNs(1000 NGNs), USDT or USDC), one time only. There are no yearly renewal fees, no expiry dates. Once you register a name, it's yours indefinitely.",
            },
          ].map((faq, i) => (
            <FAQItem key={i} question={faq.q} answer={faq.a} />
          ))}
        </motion.div>
      </section>

      {/* ── CTA BANNER ───────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.9 }}
          className="relative p-12 sm:p-20 rounded-[3rem] bg-salvaGold overflow-hidden text-center"
        >
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.18),transparent)]" />
          <div className="absolute top-0 right-0 w-72 h-72 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-52 h-52 bg-black/10 rounded-full translate-y-1/2 -translate-x-1/2" />
          <div className="relative z-10">
            <p className="text-black/50 font-black text-[10px] uppercase tracking-[0.45em] mb-4">
              Start now — it's free
            </p>
            <h2 className="text-4xl sm:text-6xl font-black tracking-tighter text-black mb-5 leading-tight">
              Claim Your Name.
              <br />
              Own Your Money.
            </h2>
            <p className="text-black/60 text-base sm:text-lg mb-10 max-w-lg mx-auto leading-relaxed">
              Create your free smart wallet, register your alias, and start
              sending money using just a name — in under two minutes.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="inline-flex items-center gap-2 px-12 py-5 bg-black text-salvaGold font-black rounded-2xl hover:bg-zinc-900 active:scale-95 transition-all text-sm uppercase tracking-widest shadow-2xl shadow-black/30"
            >
              Get Started Free <ArrowUpRight size={16} />
            </button>
          </div>
        </motion.div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-gray-100 dark:border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-start gap-12">
          <div className="max-w-xs">
            <h2 className="text-2xl font-black tracking-tighter text-salvaGold mb-2">
              SALVA
            </h2>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-30 font-bold mb-4">
              On-Chain Payment Infrastructure
            </p>
            <p className="text-sm opacity-40 leading-relaxed">
              Names for every wallet. Naira on-chain. Built on Base.
              Non-custodial. Open source.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-30 font-black mb-3">
                Protocol
              </p>
              <div className="space-y-2.5">
                <button
                  onClick={() =>
                    document
                      .getElementById("explore-name-service")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                >
                  Name Service
                </button>
                <button
                  onClick={() =>
                    document
                      .getElementById("explore-wallet")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                >
                  Smart Wallet
                </button>
                <button
                  onClick={() =>
                    document
                      .getElementById("explore-ngns")
                      ?.scrollIntoView({ behavior: "smooth" })
                  }
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                >
                  NGNs Stablecoin
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-30 font-black mb-3">
                Links
              </p>
              <div className="space-y-2.5">
                <a
                  href="https://github.com/salva-Nexus/SALVA-V2"
                  target="_blank"
                  rel="noreferrer"
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/salva_Nexus"
                  target="_blank"
                  rel="noreferrer"
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all"
                >
                  Twitter / X
                </a>
                <button
                  onClick={() => setSupportOpen(true)}
                  className="block opacity-50 hover:opacity-100 hover:text-salvaGold transition-all text-left"
                >
                  Support
                </button>
              </div>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-widest opacity-30 font-black mb-3">
                Network
              </p>
              <div className="space-y-2.5">
                <span className="block text-salvaGold font-bold opacity-80 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full inline-block animate-pulse" />
                  Base Mainnet
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mt-12 pt-8 border-t border-gray-100 dark:border-white/5">
          <p className="text-[10px] opacity-20 uppercase tracking-widest font-bold">
            © 2025 Salva Protocol. Non-custodial. Open Source.
          </p>
          <div className="flex items-center gap-3">
            <a
              href="https://x.com/salva_Nexus"
              target="_blank"
              rel="noreferrer"
              className="p-3 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 opacity-50 hover:opacity-100 hover:text-salvaGold transition-all"
            >
              <XLogo size={16} />
            </a>
            <a
              href="https://github.com/salva-Nexus/SALVA-V2"
              target="_blank"
              rel="noreferrer"
              className="p-3 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 opacity-50 hover:opacity-100 hover:text-salvaGold transition-all"
            >
              <Github size={16} />
            </a>
            <button
              onClick={() => setSupportOpen(true)}
              className="p-3 rounded-full bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 opacity-50 hover:opacity-100 hover:text-salvaGold transition-all"
            >
              <Mail size={16} />
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
