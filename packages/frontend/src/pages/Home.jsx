// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, animate, AnimatePresence } from 'framer-motion';
import { Instagram, Github, Mail, X, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';

// --- Custom Components ---

const XLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
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
        <span className="text-lg font-bold tracking-tight">{question}</span>
        <ChevronDown className={`transform transition-transform duration-500 ${isOpen ? 'rotate-180 text-salvaGold' : 'opacity-40'}`} />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }} 
            animate={{ height: 'auto', opacity: 1 }} 
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

const CountUp = ({ to, decimals = 0 }) => {
  const [currentValue, setCurrentValue] = useState(0);
  const [isCounting, setIsCounting] = useState(true);

  useEffect(() => {
    const targetValue = typeof to === 'string' ? parseFloat(to.replace(/,/g, '')) : to;
    if (isNaN(targetValue)) return;
    setIsCounting(true);
    const controls = animate(0, targetValue, {
      duration: 2.5,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (value) => setCurrentValue(value),
      onComplete: () => setIsCounting(false)
    });
    return () => controls.stop();
  }, [to]);

  return (
    <motion.span
      animate={isCounting ? { 
        textShadow: [
          "0 0 0px rgba(212, 175, 55, 0)", 
          "0 0 20px rgba(212, 175, 55, 0.5)", 
          "0 0 0px rgba(212, 175, 55, 0)"
        ] 
      } : { textShadow: "0 0 0px rgba(212, 175, 55, 0)" }}
      transition={{ repeat: Infinity, duration: 2 }}
    >
      {currentValue.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </motion.span>
  );
};

// --- Main Component ---

const Home = () => {
  const [stats, setStats] = useState({ totalMinted: 0, userCount: 0 });
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [isSupportOpen, setIsSupportOpen] = useState(false);

  const navigate = useNavigate();

  useEffect(() => {
    const checkExistingSession = () => {
      try {
        const savedUser = localStorage.getItem('salva_user');
        if (savedUser) {
          const userData = JSON.parse(savedUser);
          if (userData.safeAddress && userData.accountNumber && userData.ownerKey) {
            navigate('/dashboard', { replace: true });
            return;
          }
        }
      } catch (err) {
        localStorage.removeItem('salva_user');
      } finally {
        setCheckingAuth(false);
      }
    };
    checkExistingSession();
  }, [navigate]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/stats`, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) throw new Error();
        const data = await res.json();
        setStats({ 
          totalMinted: parseFloat(data.totalMinted || 0), 
          userCount: parseInt(data.userCount || 0) 
        });
        setLoading(false);
      } catch (err) {
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

  const fadeIn = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true },
    transition: { duration: 0.8 }
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

      {/* Hero Section */}
      <section className="relative pt-32 sm:pt-48 pb-12 sm:pb-20 px-4 sm:px-6 text-center">
        <motion.div {...fadeIn}>
          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-8xl font-black mb-4 sm:mb-6 tracking-tighter leading-[0.9] break-words px-2">
            ON-CHAIN PAYMENT <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-salvaGold to-yellow-600 block sm:inline">
              INFRASTRUCTURE.
            </span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl opacity-60 max-w-2xl mx-auto leading-relaxed px-4">
            Salva is the premier on-chain financial protocol designed for everyday Nigerian payments. 
            Instant settlement. Zero friction. Built on Base Mainnet.
          </p>
        </motion.div>
      </section>

      {/* Stats Section */}
      <motion.section {...fadeIn} className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
          <StatCard 
            title="Total NGNs Circulating" 
            value={loading ? "0" : <CountUp to={stats.totalMinted} decimals={2} />} 
            suffix="NGNs" 
          />
          <StatCard 
            title="Salva Network Citizens" 
            value={loading ? "0" : <CountUp to={stats.userCount} />} 
          />
        </div>
      </motion.section>

      {/* Creative Features */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-32 space-y-16 sm:space-y-32">
        <FeatureRow 
          title="Naira-Referenced Stability"
          desc="Unlike volatile assets, Salva NGNs are naira-denominated digital balances, allowing you to store value and trade with the confidence of the local currency, enhanced by the speed of blockchain."
          align="left"
        />
        <FeatureRow 
          title="The Salva Smart Wallet"
          desc="More than just storage. Our wallet automates your transactions, eliminates gas fees, and connects you directly to the global DeFi ecosystem without leaving the Naira."
          align="right"
        />
      </section>

      {/* FAQ Section */}
      <section className="max-w-4xl mx-auto px-6 py-24 sm:py-32">
        <motion.div {...fadeIn} className="text-center mb-16">
          <h2 className="text-3xl sm:text-5xl font-black tracking-tighter mb-4">FAQS</h2>
          <p className="opacity-50 uppercase text-xs tracking-[0.3em] font-bold">Everything you need to know</p>
        </motion.div>
        
        <motion.div {...fadeIn} className="space-y-2">
          <FAQItem 
            question="What makes Salva a 'Smart' wallet?" 
            answer="Traditional wallets require you to manage seed phrases and pay gas fees for every move. Salva uses Safe Smart Account technology on Base L2, meaning your account is a smart contract that supports gasless interactions and enhanced security." 
          />
          <FAQItem 
            question="Is this running on Mainnet?" 
            answer="Yes. Salva is deployed on the Base Layer 2 Mainnet. This ensures that every transaction is settled with the security of Ethereum but at the speed and cost required for real-world Nigerian payments." 
          />
          <FAQItem 
            question="How are NGNs valued?" 
            answer="NGNs on the Salva Network are pegged 1:1 to the Nigerian Naira. This stability allows users to transact on-chain without worrying about the price fluctuations typically associated with crypto." 
          />
          <FAQItem 
            question="Who controls my funds?" 
            answer="You do. Salva is non-custodial infrastructure. While our manager wallet facilitates transactions to ensure they are gasless for you, the ultimate permission to move funds rests with your specific Smart Account keys." 
          />
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-20 border-t border-gray-100 dark:border-white/5">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="text-center md:text-left">
            <h2 className="text-2xl font-black tracking-tighter text-salvaGold">SALVA</h2>
            <p className="text-[10px] uppercase tracking-[0.4em] opacity-40 font-bold mt-2">The Future of Nigerian Finance</p>
          </div>

          <div className="flex items-center gap-6">
            <SocialIcon 
              href="https://x.com/salva_Nexus?s=20" 
              icon={<XLogo size={18} />} 
              label="X (Twitter)" 
            />
            <SocialIcon 
              href="https://instagram.com/salvaFinance" 
              icon={<Instagram size={20} />} 
              label="Instagram" 
            />
            <SocialIcon 
              href="https://github.com/salva-Nexus/Salva-V1.git" 
              icon={<Github size={20} />} 
              label="GitHub" 
            />
            <button 
              onClick={() => setIsSupportOpen(true)}
              className="p-3 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 transition-all duration-300 opacity-60 hover:opacity-100 hover:text-salvaGold flex items-center justify-center"
              aria-label="Contact Support"
            >
              <Mail size={20} />
            </button>
          </div>

          <div className="text-[10px] uppercase tracking-widest opacity-30 font-bold">
            © 2026 SALVA NEXUS
          </div>
        </div>
      </footer>

      {/* --- Support Modal --- */}
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
                <h2 className="text-3xl font-black tracking-tighter mb-2">GET HELP</h2>
                <p className="text-sm opacity-50 uppercase tracking-widest font-bold">Direct line to Salva Notify</p>
              </div>
              
              <form onSubmit={handleSupportSubmit} className="space-y-4">
                <div className="space-y-4">
                  <input required name="name" placeholder="Full Name" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                  <input required name="account" placeholder="Salva Account Number" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 transition-colors" />
                  
                  {/* Select Dropdown with Icon */}
                  <div className="relative group">
                    <select name="topic" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 appearance-none transition-colors cursor-pointer">
                      <option value="General">General Inquiry</option>
                      <option value="Transaction">Transaction Issue</option>
                      <option value="Smart Account">Smart Wallet Access</option>
                      <option value="Feedback">Feedback / Suggestions</option>
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40 group-focus-within:opacity-100 transition-opacity">
                      <ChevronDown size={20} />
                    </div>
                  </div>

                  <textarea required name="message" rows="4" placeholder="How can we help you today?" className="w-full bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-4 outline-none focus:border-salvaGold/50 resize-none transition-colors"></textarea>
                </div>
                
                <button type="submit" className="w-full py-5 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                  <Mail size={18} />
                  SEND REQUEST
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SocialIcon = ({ href, icon, label }) => (
  <motion.a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    whileHover={{ y: -4, color: "#D4AF37" }}
    className="p-3 rounded-full bg-gray-50 dark:bg-white/5 border border-gray-100 dark:border-white/10 transition-colors duration-300 opacity-60 hover:opacity-100 flex items-center justify-center"
    aria-label={label}
  >
    {icon}
  </motion.a>
);

const StatCard = ({ title, value, suffix = "" }) => (
  <div className="group relative p-8 md:p-10 lg:p-12 rounded-3xl md:rounded-[3rem] border border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/5 backdrop-blur-sm hover:border-salvaGold/50 transition-all duration-500 w-full flex flex-col justify-center overflow-hidden min-h-[180px]">
    <div className="absolute -inset-1 bg-gradient-to-r from-salvaGold/0 via-salvaGold/5 to-salvaGold/0 opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
    <p className="relative z-10 text-[10px] sm:text-xs uppercase tracking-[0.3em] sm:tracking-[0.4em] text-salvaGold mb-4 md:mb-6 font-bold">
      {title}
    </p>
    <div className="relative z-10 flex items-baseline flex-wrap">
      <h3 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-black tracking-tighter truncate max-w-full">
        {value}
      </h3>
      {suffix && (
        <span className="text-xs sm:text-sm md:text-base font-bold opacity-40 ml-2 whitespace-nowrap uppercase tracking-widest">
          {suffix}
        </span>
      )}
    </div>
  </div>
);

const FeatureRow = ({ title, desc, align }) => (
  <motion.div 
    initial={{ opacity: 0, x: align === 'left' ? -50 : 50 }}
    whileInView={{ opacity: 1, x: 0 }}
    transition={{ duration: 1 }}
    viewport={{ once: true }}
    className={`flex flex-col ${align === 'left' ? 'md:flex-row' : 'md:flex-row-reverse'} gap-8 sm:gap-12 items-center`}
  >
    <div className="flex-1 space-y-4 sm:space-y-6 px-4 sm:px-0">
      <h3 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight">{title}</h3>
      <p className="text-base sm:text-lg opacity-60 leading-relaxed">{desc}</p>
    </div>
    <div className="flex-1 w-full h-48 sm:h-64 bg-gradient-to-br from-salvaGold/20 to-transparent rounded-2xl sm:rounded-[3rem] border border-salvaGold/10" />
  </motion.div>
);

export default Home;
// trigger deploy