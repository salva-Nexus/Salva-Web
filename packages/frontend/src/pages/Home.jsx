// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useRef } from "react";
import { motion, useInView, animate, AnimatePresence } from "framer-motion";
import {
  Github,
  Mail,
  X,
  ChevronDown,
  Zap,
  Shield,
  Coins,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Stars from "../components/Stars";

const XLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.294 19.497h2.039L6.486 3.24H4.298l13.309 17.41z" />
  </svg>
);

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 dark:border-white/5 last:border-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full py-6 flex justify-between items-center text-left hover:text-salvaGold transition-all duration-300"
      >
        <span className="text-base sm:text-lg font-bold tracking-tight pr-4">
          {question}
        </span>
        <ChevronDown
          className={`flex-shrink-0 transform transition-transform duration-500 ${isOpen ? "rotate-180 text-salvaGold" : "opacity-40"}`}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
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

// ─── Smart stat display ──────────────────────────────────────────────────────
// If NGNs circulating > 10M → "10M+"
// If citizens > 200K → "200K+"
// Otherwise → animated count-up
const CountUp = ({ to, decimals = 0 }) => {
  const [currentValue, setCurrentValue] = useState(0);
  useEffect(() => {
    const targetValue =
      typeof to === "string" ? parseFloat(to.replace(/,/g, "")) : to;
    if (isNaN(targetValue)) return;
    const controls = animate(0, targetValue, {
      duration: 2.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setCurrentValue(v),
    });
    return () => controls.stop();
  }, [to]);
  return (
    <span>
      {currentValue.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
    </span>
  );
};

function formatNGNsStat(totalMinted) {
  const n = parseFloat(totalMinted) || 0;
  if (n > 10_000_000) return { capped: true, label: "10M+" };
  return { capped: false, value: n };
}

function formatCitizensStat(userCount) {
  const n = parseInt(userCount) || 0;
  if (n > 200_000) return { capped: true, label: "200K+" };
  return { capped: false, value: n };
}

// ─── Feature Visuals ─────────────────────────────────────────────────────────

// Name Service Protocol visual — names pointing to addresses or numbers
const NameServiceVisual = () => {
  const [activeIdx, setActiveIdx] = useState(0);
  const items = [
    { alias: "cboi@salva", dest: "0xd8dA...96045" },
    { alias: "sandra_eberechi@uba", dest: "0xAb5...3C9f" },
    { alias: "aggregatorv3_eth@chainlink", dest: "0x71C...8E2a" },
    { alias: "khabib@opay", dest: "1234567890" },
    { alias: "charles@coinbase", dest: "0xF3a...9D1b" },
  ];
  useEffect(() => {
    const t = setInterval(
      () => setActiveIdx((i) => (i + 1) % items.length),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="relative h-64 sm:h-72 bg-gradient-to-br from-[#0D0D0E] to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-center gap-3">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.08),transparent)]" />
      <p className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black mb-2 opacity-60">
        Live Resolution
      </p>
      {items.map((item, i) => (
        <motion.div
          key={i}
          animate={{
            opacity: activeIdx === i ? 1 : 0.22,
            scale: activeIdx === i ? 1 : 0.97,
          }}
          transition={{ duration: 0.45 }}
          className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2.5"
        >
          <span className="text-salvaGold font-black text-sm truncate max-w-[140px]">
            {item.alias}
          </span>
          <ArrowRight size={13} className="opacity-30 mx-2 flex-shrink-0" />
          <span className="font-mono text-xs opacity-50 truncate">
            {item.dest}
          </span>
        </motion.div>
      ))}
      <p className="text-[9px] opacity-20 text-center uppercase tracking-widest font-bold mt-1">
        Human-readable · Collision-proof · Multi-chain
      </p>
    </div>
  );
};

const StablecoinVisual = () => {
  const [price, setPrice] = useState(1.0);
  useEffect(() => {
    const t = setInterval(() => {
      setPrice(1 + (Math.random() * 0.0004 - 0.0002));
    }, 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="relative h-64 sm:h-72 bg-gradient-to-br from-[#0D0D0E] to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-between">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.08),transparent)]" />
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-salvaGold font-black">
          NGNs / NGN
        </span>
        <span className="text-[10px] text-green-400 font-black bg-green-400/10 px-2 py-1 rounded-full">
          ● LIVE
        </span>
      </div>
      <div className="text-center">
        <motion.div
          animate={{ scale: [1, 1.03, 1] }}
          transition={{ repeat: Infinity, duration: 3 }}
          className="w-20 h-20 rounded-full bg-salvaGold/10 border-2 border-salvaGold flex items-center justify-center mx-auto mb-4"
        >
          <span className="text-3xl font-black text-salvaGold">₦</span>
        </motion.div>
        <p className="text-2xl font-black text-salvaGold">
          ₦{price.toFixed(4)}
        </p>
        <p className="text-xs opacity-40 uppercase tracking-widest font-bold mt-1">
          Naira-Pegged Stablecoin
        </p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {["No FX Risk", "On-chain", "Base Testnet"].map((t) => (
          <div
            key={t}
            className="text-center bg-white/5 border border-white/10 rounded-lg py-2"
          >
            <span className="text-[10px] font-black text-salvaGold uppercase">
              {t}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const WalletVisual = () => (
  <div className="relative h-64 sm:h-72 bg-gradient-to-br from-[#0D0D0E] to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-between">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.05),transparent)]" />
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-widest text-salvaGold font-black">
        Salva Smart Wallet
      </span>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-bold">Active</span>
      </div>
    </div>
    <div>
      <p className="text-xs opacity-40 font-bold uppercase tracking-widest mb-1">
        Balance
      </p>
      <p className="text-3xl font-black text-white">
        250,000 <span className="text-salvaGold text-lg">NGNs</span>
      </p>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: "Gasless", icon: "⚡" },
        { label: "Safe AA", icon: "🛡️" },
        { label: "Base L2", icon: "🔵" },
      ].map((item) => (
        <div
          key={item.label}
          className="bg-white/5 border border-white/10 rounded-xl py-2 text-center"
        >
          <p className="text-base">{item.icon}</p>
          <p className="text-[9px] uppercase font-black text-salvaGold tracking-wider">
            {item.label}
          </p>
        </div>
      ))}
    </div>
  </div>
);

// ─── Shared layout ────────────────────────────────────────────────────────────
const CinematicFeature = ({
  icon: Icon,
  tag,
  title,
  description,
  visual,
  index,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-120px" });
  const fromLeft = index % 2 === 0;

  return (
    <div
      ref={ref}
      className={`flex flex-col ${fromLeft ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 lg:gap-20 items-center min-h-[50vh]`}
    >
      <motion.div
        initial={{ opacity: 0, x: fromLeft ? -80 : 80 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-salvaGold/10 border border-salvaGold/20">
            <Icon size={22} className="text-salvaGold" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.4em] text-salvaGold font-black">
            {tag}
          </span>
        </div>
        <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">
          {title}
        </h3>
        <p className="text-base sm:text-lg opacity-60 leading-relaxed max-w-lg">
          {description}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: fromLeft ? 80 : -80 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="flex-1 w-full"
      >
        {visual}
      </motion.div>
    </div>
  );
};

// ─── Chain badges (easily extensible) ────────────────────────────────────────
const LIVE_CHAINS = [
  { name: "Base Testnet", color: "text-blue-400", dot: "bg-blue-400" },
  // Add more here as you deploy: { name: "Arbitrum Testnet", color: "text-cyan-400", dot: "bg-cyan-400" },
  // { name: "Eth Testnet", color: "text-purple-400", dot: "bg-purple-400" },
];

const ChainBadges = () => (
  <div className="inline-flex flex-wrap items-center gap-2 bg-black/30 border border-salvaGold/20 rounded-full px-4 py-2 mb-8">
    <div className="w-2 h-2 bg-salvaGold rounded-full animate-pulse" />
    <span className="text-[10px] text-salvaGold font-black uppercase tracking-[0.25em]">
      Live on
    </span>
    {LIVE_CHAINS.map((c, i) => (
      <span key={c.name} className="flex items-center gap-1.5">
        {i > 0 && <span className="text-salvaGold/30 text-[10px]">·</span>}
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot} animate-pulse`} />
        <span className={`text-[10px] font-black uppercase tracking-widest ${c.color}`}>
          {c.name}
        </span>
      </span>
    ))}
  </div>
);

const Ticker = () => {
  const items = [
    "Name Service Protocol",
    "NGNs Stablecoin",
    "Safe Smart Wallet",
    "Multi-Chain",
    "Gasless Transactions",
    "On-chain Identity",
    "Nigerian Finance",
    "Zero Seed Phrases",
  ];
  return (
    <div className="overflow-hidden py-4 border-y border-salvaGold/10 my-16">
      <motion.div
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 20, ease: "linear", repeat: Infinity }}
        className="flex gap-8 whitespace-nowrap"
      >
        {[...items, ...items].map((item, i) => (
          <span
            key={i}
            className="text-xs font-black uppercase tracking-[0.3em] text-salvaGold/40 flex items-center gap-4"
          >
            {item} <span className="text-salvaGold">◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
};

// ─── Main ─────────────────────────────────────────────────────────────────────
const Home = () => {
  const [stats, setStats] = useState({ totalMinted: 0, userCount: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem("salva_user");
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.safeAddress && !userData.ownerKey) {
          navigate("/dashboard", { replace: true });
          return;
        }
      }
    } catch (_) {
      localStorage.removeItem("salva_user");
    } finally {
      setCheckingAuth(false);
    }
  }, [navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/stats`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats({
          totalMinted: parseFloat(data.totalMinted || 0),
          userCount: parseInt(data.userCount || 0),
        });
      } catch (_) {
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const subject = `SALVA SUPPORT: ${formData.get("topic")}`;
    const body = `Name: ${formData.get("name")}\nAccount: ${formData.get("account")}\nIssue: ${formData.get("message")}`;
    window.location.href = `mailto:charlieonyii42@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setIsSupportOpen(false);
  };

  if (checkingAuth)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <div className="text-salvaGold font-black text-2xl animate-pulse tracking-widest uppercase">
          Initializing...
        </div>
      </div>
    );

  const ngnsDisplay = formatNGNsStat(stats.totalMinted);
  const citizensDisplay = formatCitizensStat(stats.userCount);

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white transition-colors duration-500 overflow-x-hidden">
      <Stars />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-12 px-4 sm:px-6 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(212,175,55,0.08),transparent)] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="relative z-10"
        >
          {/* Chain badges — easily add more chains here */}
          <div className="flex justify-center">
            <ChainBadges />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black mb-6 tracking-tighter leading-[0.9] px-2">
            ON-CHAIN PAYMENT <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-salvaGold via-yellow-400 to-salvaGold">
              INFRASTRUCTURE.
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl opacity-60 max-w-2xl mx-auto leading-relaxed px-4 mb-10">
            Salva is the premier on-chain name service and financial protocol
            designed for everyday payments and data resolution.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={() => navigate("/login")}
              className="w-full sm:w-auto px-10 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest flex items-center justify-center gap-2"
            >
              Create Wallet <ArrowUpRight size={16} />
            </button>
            <button
              onClick={() =>
                document
                  .getElementById("features")
                  .scrollIntoView({ behavior: "smooth" })
              }
              className="w-full sm:w-auto px-10 py-4 border border-salvaGold/30 font-bold rounded-2xl hover:border-salvaGold hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest"
            >
              Explore ↓
            </button>
          </div>

          {/* ── STATS CARDS ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4">
            {/* NGNs Circulating */}
            <motion.div
              whileHover={{ y: -5 }}
              className="relative p-10 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-salvaGold/20 backdrop-blur-xl group text-left"
            >
              <Coins
                size={60}
                className="absolute top-6 right-6 opacity-10 text-salvaGold"
              />
              <p className="text-[10px] uppercase tracking-[0.5em] text-salvaGold font-black mb-3">
                Total NGNs Circulating
              </p>
              <h3 className="text-4xl sm:text-5xl font-black tracking-tight flex items-baseline gap-3">
                {loading ? (
                  "—"
                ) : ngnsDisplay.capped ? (
                  <span>{ngnsDisplay.label}</span>
                ) : (
                  <CountUp to={ngnsDisplay.value} decimals={2} />
                )}
                <span className="text-salvaGold text-lg font-bold">NGNs</span>
              </h3>
              <div className="mt-4 h-1 w-12 bg-salvaGold/30 rounded-full" />
            </motion.div>

            {/* Citizens */}
            <motion.div
              whileHover={{ y: -5 }}
              className="relative p-10 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-salvaGold/20 backdrop-blur-xl group text-left"
            >
              <Shield
                size={60}
                className="absolute top-6 right-6 opacity-10 text-salvaGold"
              />
              <p className="text-[10px] uppercase tracking-[0.5em] text-salvaGold font-black mb-3">
                Salva Network Citizens
              </p>
              <h3 className="text-4xl sm:text-5xl font-black tracking-tight">
                {loading ? (
                  "—"
                ) : citizensDisplay.capped ? (
                  <span>{citizensDisplay.label}</span>
                ) : (
                  <CountUp to={citizensDisplay.value} />
                )}
              </h3>
              <div className="mt-4 h-1 w-12 bg-salvaGold/30 rounded-full" />
            </motion.div>
          </div>
        </motion.div>
      </section>

      <Ticker />

      {/* ── CINEMATIC FEATURES ── */}
      <section
        id="features"
        className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-28 space-y-32 sm:space-y-48"
      >
        <CinematicFeature
          index={0}
          icon={Zap}
          tag="Name Service Protocol"
          title="Send Money Like Sending a Text"
          description="Replace wallet addresses with human-readable names. Send to 'cboi@salva', 'sandra_eberechi@uba', or 'aggregatorv3_eth@chainlink' — no hex strings, no copy-paste errors. Names are namespaced so @salva and @coinbase identities never collide."
          visual={<NameServiceVisual />}
        />
        <CinematicFeature
          index={1}
          icon={Coins}
          tag="NGNs Stablecoin"
          title="Naira Power, Blockchain Speed"
          description="1 NGNs = 1 Nigerian Naira. No FX exposure. No volatility. Your everyday payments stay predictable — but settle on-chain with the finality of blockchain. Spend, receive, and save in Naira without touching volatile crypto."
          visual={<StablecoinVisual />}
        />
        <CinematicFeature
          index={2}
          icon={Shield}
          tag="Smart Wallet (AA)"
          title="No Gas Fees. Ever."
          description="Built on Safe Protocol — your wallet is a smart contract, not just a key. Transactions are sponsored so you never pay gas. Built on Base (and expanding) for sub-cent settlement. Account abstraction means batched transactions and enterprise-grade security baked in."
          visual={<WalletVisual />}
        />
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
        <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4 uppercase">
          How it works
        </h2>
        <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold mb-16">
          Simple as 1 — 2 — 3
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            {
              step: "01",
              title: "Create a Wallet",
              desc: "Use any compatible wallet — Salva Wallet, Coinbase Wallet, MetaMask, or your bank app. Your wallet becomes your on-chain identity anchor.",
            },
            {
              step: "02",
              title: "Register Your Alias",
              desc: 'Claim your name directly from your wallet or bank app. "charles@salva", "sandra_eberechi@uba" — your permanent on-chain identity.',
            },
            {
              step: "03",
              title: "Send & Receive",
              desc: "Transfer crypto or NGNs to anyone using their alias. No long wallet addresses, no copy-paste mistakes — just a name.",
            },
          ].map((item, i) => (
            <motion.div
              key={i}
              className="relative p-6 rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 hover:border-salvaGold/40 transition-all group text-left"
            >
              <span className="text-5xl font-black text-salvaGold/10 group-hover:text-salvaGold/20 transition-colors block mb-4">
                {item.step}
              </span>
              <h4 className="font-black text-lg mb-2">{item.title}</h4>
              <p className="text-sm opacity-60 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4 uppercase">
            FAQs
          </h2>
          <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold">
            Everything you need to know
          </p>
        </div>
        <div className="space-y-2">
          <FAQItem
            question="What is Salva's Name Service Protocol?"
            answer="Salva's Name Service Protocol maps human-readable names like 'charles@salva' to wallet addresses or account numbers on-chain. Think of it like DNS for blockchain — instead of copying a 42-character address, you just use a name. Names are namespaced, so @salva and @coinbase are completely separate registries that can never collide."
          />
          <FAQItem
            question="What makes Salva a 'Smart' wallet?"
            answer="Traditional wallets require seed phrases and gas fees for every action. Salva uses Safe Smart Account technology — your account is a smart contract that supports gasless interactions and enhanced security out of the box."
          />
          <FAQItem
            question="Which chains is Salva deployed on?"
            answer="Salva is currently live on Base Testnet. We are expanding to additional chains — Ethereum, Arbitrum, and others. The name service protocol is designed to be chain-agnostic, so the same alias infrastructure works everywhere."
          />
          <FAQItem
            question="How are NGNs valued?"
            answer="NGNs are pegged 1:1 to the Nigerian Naira. Send and receive with the confidence of local currency, at blockchain speed."
          />
          <FAQItem
            question="Who controls my funds?"
            answer="You do. Salva is non-custodial. While transactions are relayed gaslessly through our infrastructure, the ultimate signing permission rests with your smart account keys."
          />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="text-center md:text-left">
          <h2 className="text-2xl font-black tracking-tighter text-salvaGold">
            SALVA
          </h2>
          <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold mt-2">
            The Future of Nigerian Finance
          </p>
        </div>
        <div className="flex items-center gap-5">
          <a
            href="https://x.com/salva_Nexus"
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-full bg-white/5 border border-white/10 opacity-60 hover:text-salvaGold transition-all"
          >
            <XLogo />
          </a>
          <a
            href="https://github.com/salva-Nexus/SALVA-V2"
            target="_blank"
            rel="noreferrer"
            className="p-3 rounded-full bg-white/5 border border-white/10 opacity-60 hover:text-salvaGold transition-all"
          >
            <Github size={20} />
          </a>
          <button
            onClick={() => setIsSupportOpen(true)}
            className="p-3 rounded-full bg-white/5 border border-white/10 opacity-60 hover:text-salvaGold transition-all"
          >
            <Mail size={20} />
          </button>
        </div>
      </footer>

      {/* ── SUPPORT MODAL ── */}
      <AnimatePresence>
        {isSupportOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSupportOpen(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 30 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#0D0D0E] border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl"
            >
              <button
                onClick={() => setIsSupportOpen(false)}
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
              <form onSubmit={handleSupportSubmit} className="space-y-4">
                <input
                  required
                  name="name"
                  placeholder="Full Name"
                  className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors"
                />
                <input
                  required
                  name="account"
                  placeholder="Salva Account / Alias"
                  className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors"
                />
                <textarea
                  required
                  name="message"
                  rows="4"
                  placeholder="How can we help you today?"
                  className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors"
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
        )}
      </AnimatePresence>
    </div>
  );
};

export default Home;