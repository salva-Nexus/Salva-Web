// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView, animate, AnimatePresence } from 'framer-motion';
import { Instagram, Github, Mail, X, ChevronDown, ArrowRight, Zap, Shield, Coins } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';

const XLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.294 19.497h2.039L6.486 3.24H4.298l13.309 17.41z" />
  </svg>
);

const FAQItem = ({ question, answer }) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 dark:border-white/5 last:border-0">
      <button onClick={() => setIsOpen(!isOpen)} className="w-full py-6 flex justify-between items-center text-left hover:text-salvaGold transition-all duration-300">
        <span className="text-base sm:text-lg font-bold tracking-tight pr-4">{question}</span>
        <ChevronDown className={`flex-shrink-0 transform transition-transform duration-500 ${isOpen ? 'rotate-180 text-salvaGold' : 'opacity-40'}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <p className="pb-6 opacity-60 leading-relaxed text-sm sm:text-base max-w-3xl">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const CountUp = ({ to, decimals = 0 }) => {
  const [currentValue, setCurrentValue] = useState(0);
  useEffect(() => {
    const targetValue = typeof to === 'string' ? parseFloat(to.replace(/,/g, '')) : to;
    if (isNaN(targetValue)) return;
    const controls = animate(0, targetValue, { duration: 2.5, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => setCurrentValue(v) });
    return () => controls.stop();
  }, [to]);
  return <span>{currentValue.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
};

// Animated section that slides in from left or right on scroll
const ScrollSection = ({ children, direction = 'left', className = '' }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-100px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: direction === 'left' ? -80 : 80 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

// Feature block — alternates left/right
const FeatureBlock = ({ icon: Icon, tag, title, description, direction, accent, visual }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <div ref={ref} className={`flex flex-col ${direction === 'left' ? 'md:flex-row' : 'md:flex-row-reverse'} gap-10 sm:gap-16 items-center`}>
      {/* Text side */}
      <motion.div
        initial={{ opacity: 0, x: direction === 'left' ? -60 : 60 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${accent} bg-opacity-10`}>
            <Icon size={20} className="text-salvaGold" />
          </div>
          <span className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">{tag}</span>
        </div>
        <h3 className="text-2xl sm:text-3xl md:text-4xl font-black tracking-tight leading-tight">{title}</h3>
        <p className="text-base sm:text-lg opacity-60 leading-relaxed">{description}</p>
      </motion.div>

      {/* Visual side */}
      <motion.div
        initial={{ opacity: 0, x: direction === 'left' ? 60 : -60 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
        className="flex-1 w-full"
      >
        {visual}
      </motion.div>
    </div>
  );
};

// Visual cards for each feature
const AliasVisual = () => (
  <div className="relative h-52 sm:h-64 bg-gradient-to-br from-black to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-center gap-4">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,0.08),transparent)]" />
    {[
      { alias: 'charles@salva', addr: '0xd8dA...96045', delay: 0 },
      { alias: '1122746245@salva', addr: '0xAb5…3C9f', delay: 0.15 },
    ].map((item, i) => (
      <motion.div
        key={i}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: item.delay + 0.4, duration: 0.6 }}
        className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-3"
      >
        <span className="text-salvaGold font-black text-sm">{item.alias}</span>
        <ArrowRight size={14} className="opacity-30 mx-2 flex-shrink-0" />
        <span className="font-mono text-xs opacity-50 truncate">{item.addr}</span>
      </motion.div>
    ))}
    <p className="text-[10px] opacity-30 text-center uppercase tracking-widest font-bold">Human-readable • Collision-proof • Namespaced</p>
  </div>
);

const StablecoinVisual = () => (
  <div className="relative h-52 sm:h-64 bg-gradient-to-br from-black to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-center items-center gap-4">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(212,175,55,0.08),transparent)]" />
    <motion.div
      animate={{ scale: [1, 1.04, 1], rotate: [0, 2, -2, 0] }}
      transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
      className="w-20 h-20 rounded-full bg-salvaGold/10 border-2 border-salvaGold flex items-center justify-center"
    >
      <span className="text-3xl font-black text-salvaGold">₦</span>
    </motion.div>
    <div className="text-center">
      <p className="text-xl font-black text-salvaGold">1 NGNs = 1 NGN</p>
      <p className="text-xs opacity-40 uppercase tracking-widest font-bold mt-1">Pegged • Stable • Predictable</p>
    </div>
    <div className="flex gap-3 w-full">
      {['No FX Risk', 'On-chain', 'Base L2'].map((tag) => (
        <div key={tag} className="flex-1 text-center bg-white/5 border border-white/10 rounded-lg py-2 px-1">
          <span className="text-[10px] font-black text-salvaGold uppercase">{tag}</span>
        </div>
      ))}
    </div>
  </div>
);

const WalletVisual = () => (
  <div className="relative h-52 sm:h-64 bg-gradient-to-br from-black to-zinc-900 rounded-3xl border border-salvaGold/20 overflow-hidden p-6 flex flex-col justify-between">
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(212,175,55,0.05),transparent)]" />
    <div className="flex items-center justify-between">
      <span className="text-[10px] uppercase tracking-widest text-salvaGold font-black">Salva Smart Wallet</span>
      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
        <span className="text-[10px] text-green-400 font-bold">Active</span>
      </div>
    </div>
    <div>
      <p className="text-xs opacity-40 font-bold uppercase tracking-widest mb-1">Balance</p>
      <p className="text-3xl font-black text-white">250,000 <span className="text-salvaGold text-lg">NGNs</span></p>
    </div>
    <div className="grid grid-cols-3 gap-2">
      {[
        { label: 'Gasless', icon: '⚡' },
        { label: 'Safe AA', icon: '🛡️' },
        { label: 'Base L2', icon: '🔵' },
      ].map((item) => (
        <div key={item.label} className="bg-white/5 border border-white/10 rounded-xl py-2 text-center">
          <p className="text-base">{item.icon}</p>
          <p className="text-[9px] uppercase font-black text-salvaGold tracking-wider">{item.label}</p>
        </div>
      ))}
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────────────────
const Home = () => {
  const [stats, setStats] = useState({ totalMinted: 0, userCount: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();
  const heroRef = useRef(null);
  const heroInView = useInView(heroRef, { once: true });

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('salva_user');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.safeAddress && userData.ownerKey) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }
    } catch (_) { localStorage.removeItem('salva_user'); }
    finally { setCheckingAuth(false); }
  }, [navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/stats`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats({ totalMinted: parseFloat(data.totalMinted || 0), userCount: parseInt(data.userCount || 0) });
      } catch (_) { } finally { setLoading(false); }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSupportSubmit = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const subject = `SALVA SUPPORT: ${formData.get('topic')}`;
    const body = `Name: ${formData.get('name')}\nAccount: ${formData.get('account')}\nIssue: ${formData.get('message')}`;
    window.location.href = `mailto:charlieonyii42@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setIsSupportOpen(false);
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <div className="text-salvaGold font-black text-2xl animate-pulse tracking-widest uppercase">Initializing...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white transition-colors duration-500 overflow-x-hidden">
      <Stars />

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center pt-24 pb-12 px-4 sm:px-6 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(212,175,55,0.07),transparent)] pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={heroInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          className="relative z-10"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-salvaGold/10 border border-salvaGold/30 rounded-full px-4 py-2 mb-8"
          >
            <div className="w-2 h-2 bg-salvaGold rounded-full animate-pulse" />
            <span className="text-[10px] text-salvaGold font-black uppercase tracking-[0.3em]">Live on Base Mainnet</span>
          </motion.div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black mb-6 tracking-tighter leading-[0.88] px-2">
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.8 }}
              className="block"
            >
              THE FUTURE OF
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.8 }}
              className="block text-transparent bg-clip-text bg-gradient-to-r from-salvaGold via-yellow-400 to-salvaGold"
            >
              NIGERIAN FINANCE
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-base sm:text-lg md:text-xl opacity-60 max-w-2xl mx-auto leading-relaxed px-4 mb-10"
          >
            On-chain payments. Human-readable aliases. Naira-pegged stability.
            Gasless smart wallets. Built on Base — built for Nigeria.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.65, duration: 0.8 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center"
          >
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest"
            >
              Create Wallet
            </button>
            <button
              onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-8 py-4 border border-salvaGold/30 font-bold rounded-2xl hover:border-salvaGold hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest"
            >
              Learn More ↓
            </button>
          </motion.div>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 opacity-30"
        >
          <ChevronDown size={24} className="text-salvaGold" />
        </motion.div>
      </section>

      {/* ── STATS ── */}
      <ScrollSection direction="left" className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[
            { title: 'Total NGNs Circulating', value: loading ? '0' : <CountUp to={stats.totalMinted} decimals={2} />, suffix: 'NGNs' },
            { title: 'Salva Network Citizens', value: loading ? '0' : <CountUp to={stats.userCount} /> },
          ].map((card, i) => (
            <div key={i} className="group relative p-8 md:p-10 rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 backdrop-blur-sm hover:border-salvaGold/50 transition-all duration-500 overflow-hidden">
              <div className="absolute -inset-1 bg-gradient-to-r from-salvaGold/0 via-salvaGold/5 to-salvaGold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              <p className="relative z-10 text-[10px] sm:text-xs uppercase tracking-[0.4em] text-salvaGold mb-4 font-black">{card.title}</p>
              <div className="relative z-10 flex items-baseline gap-2 flex-wrap">
                <h3 className="text-3xl sm:text-4xl xl:text-5xl font-black tracking-tighter">{card.value}</h3>
                {card.suffix && <span className="text-sm font-bold opacity-40 uppercase tracking-widest">{card.suffix}</span>}
              </div>
            </div>
          ))}
        </div>
      </ScrollSection>

      {/* ── FEATURES ── */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-28 space-y-24 sm:space-y-40">

        <FeatureBlock
          direction="left"
          icon={Zap}
          tag="Dual Alias Protocol"
          title="Send Money Like Sending a Text"
          description="Replace wallet addresses with human-readable identifiers. Send to 'charles@salva' or '1122746245' — no hex addresses, no copy-paste errors. Names and numbers are namespaced so @salva and @coinbase identities never collide."
          accent="bg-salvaGold"
          visual={<AliasVisual />}
        />

        <FeatureBlock
          direction="right"
          icon={Coins}
          tag="NGNs Stablecoin"
          title="Naira Power, Blockchain Speed"
          description="1 NGNs = 1 Nigerian Naira. No FX exposure. No volatility. Your everyday payments stay predictable — but settle on-chain with the finality of blockchain. Spend, receive, and save in Naira without ever touching volatile crypto."
          accent="bg-salvaGold"
          visual={<StablecoinVisual />}
        />

        <FeatureBlock
          direction="left"
          icon={Shield}
          tag="Smart Wallet (AA)"
          title="No Gas Fees. Ever."
          description="Built on Safe Protocol — your wallet is a smart contract, not just a key. Transactions are sponsored so you never pay gas. Built on Base L2 for sub-cent settlement costs. Account abstraction means approvals, batched transactions, and enterprise-grade security baked in."
          accent="bg-salvaGold"
          visual={<WalletVisual />}
        />
      </section>

      {/* ── HOW IT WORKS ── */}
      <ScrollSection direction="left" className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">HOW IT WORKS</h2>
          <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold">Simple as 1 — 2 — 3</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { step: '01', title: 'Create Wallet', desc: 'Register with email. A Safe smart wallet is deployed on Base — no gas, no seed phrases to manage.' },
            { step: '02', title: 'Register Alias', desc: 'Claim your name or number. "charles@salva" or "1122746245" — your identity on-chain.' },
            { step: '03', title: 'Send & Receive', desc: 'Transfer NGNs to anyone by alias. Instant settlement, zero gas, email confirmation.' },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.15, duration: 0.7 }}
              className="relative p-6 rounded-3xl border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 hover:border-salvaGold/40 transition-all group"
            >
              <span className="text-5xl font-black text-salvaGold/10 group-hover:text-salvaGold/20 transition-colors block mb-4">{item.step}</span>
              <h4 className="font-black text-lg mb-2">{item.title}</h4>
              <p className="text-sm opacity-60 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </ScrollSection>

      {/* ── FAQ ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <ScrollSection direction="right" className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">FAQS</h2>
          <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold">Everything you need to know</p>
        </ScrollSection>
        <ScrollSection direction="left" className="space-y-2">
          <FAQItem question="What makes Salva a 'Smart' wallet?" answer="Traditional wallets require seed phrases and gas fees for every action. Salva uses Safe Smart Account technology on Base L2 — your account is a smart contract that supports gasless interactions and enhanced security out of the box." />
          <FAQItem question="What is a Dual Alias?" answer="A dual alias means you can be found by both a name (e.g. 'charles@salva') and a number (e.g. '1122746245'). Both resolve to your wallet address. The namespace prevents collisions — 'charles@salva' and 'charles@coinbase' are completely different identities." />
          <FAQItem question="Is this running on Mainnet?" answer="Yes. Salva is deployed on the Base Layer 2 Mainnet. Transactions settle with Ethereum security at Base's speed and cost — fractions of a cent." />
          <FAQItem question="How are NGNs valued?" answer="NGNs are pegged 1:1 to the Nigerian Naira. Send and receive with the confidence of local currency, at blockchain speed." />
          <FAQItem question="Who controls my funds?" answer="You do. Salva is non-custodial. While transactions are relayed gaslessly through our infrastructure, the ultimate signing permission rests with your smart account keys." />
        </ScrollSection>
      </section>

      {/* ── FOOTER ── */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-20 border-t border-gray-100 dark:border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-black tracking-tighter text-salvaGold">SALVA</h2>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold mt-2">The Future of Nigerian Finance</p>
          </div>
          <div className="flex items-center gap-5">
            {[
              { href: 'https://x.com/salva_Nexus?s=20', icon: <XLogo size={18} />, label: 'X' },
              { href: 'https://github.com/salva-Nexus/SALVA-V2', icon: <Github size={20} />, label: 'GitHub' },
            ].map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer"
                className="p-3 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 opacity-60 hover:opacity-100 hover:text-salvaGold transition-all flex items-center justify-center"
                aria-label={s.label}>
                {s.icon}
              </a>
            ))}
            <button onClick={() => setIsSupportOpen(true)}
              className="p-3 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 opacity-60 hover:opacity-100 hover:text-salvaGold transition-all flex items-center justify-center"
              aria-label="Support">
              <Mail size={20} />
            </button>
          </div>
          <div className="text-[10px] uppercase tracking-widest opacity-30 font-bold">© 2026 SALVA NEXUS</div>
        </div>
      </footer>

      {/* ── SUPPORT MODAL ── */}
      <AnimatePresence>
        {isSupportOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setIsSupportOpen(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#0D0D0E] border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl">
              <button onClick={() => setIsSupportOpen(false)} className="absolute top-8 right-8 opacity-40 hover:opacity-100 transition-opacity"><X size={24} /></button>
              <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tighter mb-2">GET HELP</h2>
                <p className="text-sm opacity-50 uppercase tracking-widest font-bold">Direct line to Salva Support</p>
              </div>
              <form onSubmit={handleSupportSubmit} className="space-y-4">
                <input required name="name" placeholder="Full Name" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                <input required name="account" placeholder="Salva Account / Alias" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                <div className="relative">
                  <select name="topic" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 appearance-none transition-colors cursor-pointer">
                    <option value="General">General Inquiry</option>
                    <option value="Transaction">Transaction Issue</option>
                    <option value="Smart Account">Smart Wallet Access</option>
                    <option value="Feedback">Feedback / Suggestions</option>
                  </select>
                  <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 opacity-40 pointer-events-none" />
                </div>
                <textarea required name="message" rows="4" placeholder="How can we help you today?" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors" />
                <button type="submit" className="w-full py-5 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  <Mail size={18} /> SEND REQUEST
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