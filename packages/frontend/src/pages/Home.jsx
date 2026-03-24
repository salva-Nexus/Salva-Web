// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { motion, useInView, animate, AnimatePresence } from 'framer-motion';
import { Github, Mail, ChevronDown, Zap, Shield, Coins, ArrowUpRight, X } from 'lucide-react';
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

const CinematicFeature = ({ icon: Icon, tag, title, description, visual, index }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-120px' });
  const fromLeft = index % 2 === 0;

  return (
    <div ref={ref} className={`flex flex-col ${fromLeft ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 lg:gap-20 items-center min-h-[50vh]`}>
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
          <span className="text-[10px] uppercase tracking-[0.4em] text-salvaGold font-black">{tag}</span>
        </div>
        <h3 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight leading-tight">{title}</h3>
        <p className="text-base sm:text-lg opacity-60 leading-relaxed max-w-lg">{description}</p>
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

const Ticker = () => {
  const items = ['Dual Alias Protocol', 'NGNs Stablecoin', 'Safe Smart Wallet', 'Base L2', 'Gasless Transactions', 'On-chain Identity', 'Nigerian Finance', 'Zero Seed Phrases'];
  return (
    <div className="overflow-hidden py-4 border-y border-salvaGold/10 my-16">
      <motion.div
        animate={{ x: ['0%', '-50%'] }}
        transition={{ duration: 20, ease: 'linear', repeat: Infinity }}
        className="flex gap-8 whitespace-nowrap"
      >
        {[...items, ...items].map((item, i) => (
          <span key={i} className="text-xs font-black uppercase tracking-[0.3em] text-salvaGold/40 flex items-center gap-4">
            {item} <span className="text-salvaGold">◆</span>
          </span>
        ))}
      </motion.div>
    </div>
  );
};

const Home = () => {
  const [stats, setStats] = useState({ totalMinted: 0, userCount: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const navigate = useNavigate();

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
    } catch (_) {
      localStorage.removeItem('salva_user');
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
        setStats({ totalMinted: parseFloat(data.totalMinted || 0), userCount: parseInt(data.userCount || 0) });
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
    const subject = `SALVA SUPPORT: ${formData.get('topic')}`;
    const body = `Name: ${formData.get('name')}\nAccount: ${formData.get('account')}\nIssue: ${formData.get('message')}`;
    window.location.href = `mailto:charlieonyii42@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    setIsSupportOpen(false);
  };

  if (checkingAuth) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white transition-colors duration-500 overflow-x-hidden">
      <Stars />

      {/* ── HERO SECTION ── */}
      <section className="relative min-h-screen flex flex-col justify-center pt-24 pb-12 px-4 sm:px-6 text-center">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_30%,rgba(212,175,55,0.08),transparent)] pointer-events-none" />

        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1 }} className="relative z-10">
          <div className="inline-flex items-center gap-2 bg-salvaGold/10 border border-salvaGold/30 rounded-full px-4 py-2 mb-8">
            <div className="w-2 h-2 bg-salvaGold rounded-full animate-pulse" />
            <span className="text-[10px] text-salvaGold font-black uppercase tracking-[0.3em]">Live on Base Mainnet</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black mb-6 tracking-tighter leading-[0.9] px-2">
            ON-CHAIN PAYMENT <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-salvaGold via-yellow-400 to-salvaGold">
              INFRASTRUCTURE.
            </span>
          </h1>

          <p className="text-base sm:text-lg md:text-xl opacity-60 max-w-2xl mx-auto leading-relaxed px-4 mb-10">
            Salva is the premier on-chain financial protocol designed for everyday Nigerian payments. 
            Instant settlement. Zero friction. Built on Base Mainnet.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button onClick={() => navigate('/login')}
              className="w-full sm:w-auto px-10 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 text-sm uppercase tracking-widest flex items-center justify-center gap-2">
              Create Wallet <ArrowUpRight size={16} />
            </button>
            <button onClick={() => document.getElementById('features').scrollIntoView({ behavior: 'smooth' })}
              className="w-full sm:w-auto px-10 py-4 border border-salvaGold/30 font-bold rounded-2xl hover:border-salvaGold hover:bg-salvaGold/5 transition-all text-sm uppercase tracking-widest">
              Explore ↓
            </button>
          </div>

          {/* ── PREMIUM STATS SECTION ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto px-4">
            <motion.div 
              whileHover={{ y: -5 }}
              className="relative p-10 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-salvaGold/20 backdrop-blur-xl overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Coins size={80} className="text-salvaGold" />
              </div>
              <div className="relative z-10 text-center md:text-left">
                <p className="text-[10px] uppercase tracking-[0.5em] text-salvaGold font-black mb-3">Total NGNs Circulating</p>
                <h3 className="text-4xl sm:text-5xl font-black tracking-tight flex items-baseline justify-center md:justify-start gap-3">
                  {loading ? "0" : <CountUp to={stats.totalMinted} decimals={2} />}
                  <span className="text-salvaGold text-lg font-bold">NGNs</span>
                </h3>
                <div className="mt-4 h-1 w-12 bg-salvaGold/30 rounded-full mx-auto md:mx-0" />
              </div>
            </motion.div>

            <motion.div 
              whileHover={{ y: -5 }}
              className="relative p-10 rounded-[3rem] bg-gradient-to-br from-white/5 to-transparent border border-salvaGold/20 backdrop-blur-xl overflow-hidden group"
            >
              <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                <Shield size={80} className="text-salvaGold" />
              </div>
              <div className="relative z-10 text-center md:text-left">
                <p className="text-[10px] uppercase tracking-[0.5em] text-salvaGold font-black mb-3">Salva Network Citizens</p>
                <h3 className="text-4xl sm:text-5xl font-black tracking-tight justify-center md:justify-start">
                  {loading ? "0" : <CountUp to={stats.userCount} />}
                </h3>
                <div className="mt-4 h-1 w-12 bg-salvaGold/30 rounded-full mx-auto md:mx-0" />
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <Ticker />

      {/* ── FEATURES ── */}
      <section id="features" className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-28 space-y-32 sm:space-y-48">
        <CinematicFeature
          index={0} icon={Zap} tag="Dual Alias Protocol"
          title="Send Money Like Sending a Text"
          description="Replace wallet addresses with human-readable identifiers. Send to 'charles@salva' or '1122746245' — no hex strings, no copy-paste errors."
          visual={<div className="h-64 bg-white/5 border border-salvaGold/10 rounded-3xl" />} // Placeholder for your visual components
        />
        <CinematicFeature
          index={1} icon={Coins} tag="NGNs Stablecoin"
          title="Naira Power, Blockchain Speed"
          description="1 NGNs = 1 Nigerian Naira. No FX exposure. predictible payments settled on-chain with the finality of blockchain."
          visual={<div className="h-64 bg-white/5 border border-salvaGold/10 rounded-3xl" />} 
        />
      </section>

      {/* ── FAQ ── */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4 uppercase">Frequently Asked</h2>
          <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold">Answers for the curious</p>
        </div>
        <div className="space-y-2">
          <FAQItem question="What makes Salva a 'Smart' wallet?" answer="Salva uses Safe Smart Account technology on Base L2 — your account is a smart contract that supports gasless interactions." />
          <FAQItem question="Is this running on Mainnet?" answer="Yes. Salva is fully deployed on the Base Layer 2 Mainnet. Transactions settle with Ethereum security." />
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-16 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-8">
        <div>
          <h2 className="text-2xl font-black tracking-tighter text-salvaGold">SALVA</h2>
          <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold mt-2">The Future of Nigerian Finance</p>
        </div>
        <div className="flex items-center gap-5">
          <a href="https://x.com/salva_Nexus" target="_blank" rel="noreferrer" className="opacity-60 hover:text-salvaGold transition-all"><XLogo /></a>
          <a href="https://github.com/salva-Nexus/SALVA-V2" target="_blank" rel="noreferrer" className="opacity-60 hover:text-salvaGold transition-all"><Github size={20} /></a>
          <button onClick={() => setIsSupportOpen(true)} className="opacity-60 hover:text-salvaGold transition-all"><Mail size={20} /></button>
        </div>
      </footer>

      {/* ── SUPPORT MODAL ── */}
      <AnimatePresence>
        {isSupportOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsSupportOpen(false)} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.9, opacity: 0, y: 30 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#0D0D0E] border border-black/5 dark:border-white/10 rounded-[2.5rem] p-8 sm:p-10 shadow-2xl">
              <button onClick={() => setIsSupportOpen(false)} className="absolute top-8 right-8 opacity-40 hover:opacity-100 transition-opacity"><X size={24} /></button>
              <div className="mb-8">
                <h2 className="text-3xl font-black tracking-tighter mb-2 uppercase">Get Help</h2>
                <p className="text-sm opacity-50 uppercase tracking-widest font-bold">Direct line to Salva Support</p>
              </div>
              <form onSubmit={handleSupportSubmit} className="space-y-4">
                <input required name="name" placeholder="Full Name" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                <input required name="account" placeholder="Salva Account / Alias" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                <textarea required name="message" rows="4" placeholder="How can we help you today?" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors" />
                <button type="submit" className="w-full py-5 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 uppercase tracking-widest">
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