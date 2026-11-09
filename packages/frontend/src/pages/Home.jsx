// Salva-Digital-Tech/packages/frontend/src/pages/Home.jsx
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  ArrowLeftRight,
  ArrowUpRight,
  AtSign,
  Check,
  ChevronDown,
  Github,
  Landmark,
  Mail,
  Wallet,
  X,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';

const EASE = [0.16, 1, 0.3, 1];
const SUPPORT_EMAIL = 'charlieonyii42@gmail.com';

const HomeMobileScaleStyle = () => (
  <style>{`
    /* Mobile-only 25% scale reduction. Desktop remains untouched. */
    @media (max-width: 639px) {
      .home-mobile-scale {
        zoom: 0.75;
      }
    }
    @supports not (zoom: 1) {
      @media (max-width: 639px) {
        .home-mobile-scale {
          width: 133.3333%;
          transform: scale(0.75);
          transform-origin: top left;
        }
      }
    }
  `}</style>
);

/* ─────────────────────────────── SEO ─────────────────────────────── */

const SEOMeta = () => {
  useEffect(() => {
    const setMeta = (name, content, prop = false) => {
      const attr = prop ? 'property' : 'name';
      let el = document.querySelector(`meta[${attr}="${name}"]`);
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, name);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };
    setMeta(
      'description',
      'Salva is your money, on-chain, in Naira. Send to a name, swap any supported token, borrow against your crypto and earn SANT just by using the network.'
    );
    setMeta('og:title', 'Salva: your money, on-chain, in Naira', true);
    setMeta(
      'og:description',
      'Send, swap, borrow and earn with Naira, dollars and more from one simple wallet.',
      true
    );
    setMeta('og:type', 'website', true);
    setMeta('twitter:card', 'summary_large_image');
    setMeta('twitter:site', '@salva_Nexus');
  }, []);
  return null;
};

/* ───────────────────────────── Helpers ───────────────────────────── */

const XLogo = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932 6.064-6.932zm-1.294 19.497h2.039L6.486 3.24H4.298l13.309 17.41z" />
  </svg>
);

/* ───────────────────────── Hero action card ───────────────────────── */

const Chip = ({ children }) => (
  <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-xs font-bold text-white">
    {children}
  </span>
);

const Field = ({ label, value, chip, sub }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
    <p className="text-xs font-medium text-white/45">{label}</p>
    <div className="mt-1 flex items-center justify-between gap-3">
      <p className="truncate text-2xl font-black tracking-tight text-white">{value}</p>
      {chip && <Chip>{chip}</Chip>}
    </div>
    {sub && <p className="mt-1 text-xs text-white/40">{sub}</p>}
  </div>
);

const SHOWCASE = [
  {
    id: 'send',
    label: 'Send',
    action: 'Send money',
    render: () => (
      <>
        <Field label="To" value="pay.ngns@myexchange" />
        <Field label="Amount" value="₦25,000" chip="NGNS" sub="Network fee: ₦0" />
      </>
    ),
  },
  {
    id: 'swap',
    label: 'Swap',
    action: 'Swap now',
    render: () => (
      <>
        <Field label="You pay" value="100,000" chip="NGNS" />
        <Field
          label="You get (about)"
          value="65.00"
          chip="USDC"
          sub="Priced from the live market"
        />
      </>
    ),
  },
  {
    id: 'borrow',
    label: 'Borrow',
    action: 'Borrow NGNS',
    render: () => (
      <>
        <Field label="You deposit" value="0.5" chip="ETH" />
        <Field label="You borrow" value="₦500,000" chip="NGNS" />
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.06] px-4 py-3">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-emerald-300">Your position looks healthy</span>
            <span className="text-white/40">Safe</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[72%] rounded-full bg-emerald-400" />
          </div>
        </div>
      </>
    ),
  },
  {
    id: 'earn',
    label: 'Earn',
    action: 'Start earning',
    render: () => (
      <>
        <Field label="Rewards earned" value="+24.5" chip="SANT" sub="Just for using Salva" />
        <div className="space-y-2 rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4">
          {['Sent money', 'Made a swap', 'Provided liquidity'].map((item) => (
            <div key={item} className="flex items-center gap-2.5 text-sm text-white/75">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-salvaGold/15 text-salvaGold">
                <Check size={12} strokeWidth={3} />
              </span>
              {item}
            </div>
          ))}
        </div>
      </>
    ),
  },
];

const HeroCard = ({ onAction }) => {
  const reduce = useReducedMotion();
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto || reduce) return undefined;
    const timer = setInterval(() => setActive((i) => (i + 1) % SHOWCASE.length), 4500);
    return () => clearInterval(timer);
  }, [auto, reduce]);

  const current = SHOWCASE[active];

  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 rounded-[3rem] bg-salvaGold/10 blur-3xl" />
      <div className="relative overflow-hidden rounded-[2rem] border border-salvaGold/20 bg-gradient-to-br from-zinc-950 via-zinc-900 to-zinc-950 p-4 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="What you can do with Salva"
            className="flex gap-1 rounded-full bg-white/[0.06] p-1"
          >
            {SHOWCASE.map((item, i) => (
              <button
                key={item.id}
                role="tab"
                type="button"
                aria-selected={active === i}
                onClick={() => {
                  setAuto(false);
                  setActive(i);
                }}
                className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-salvaGold/70 sm:px-4 ${
                  active === i ? 'bg-salvaGold text-black' : 'text-white/55 hover:text-white'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 min-h-[260px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={current.id}
              role="tabpanel"
              initial={reduce ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="space-y-2.5"
            >
              {current.render()}
            </motion.div>
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={onAction}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-salvaGold py-3.5 text-sm font-black text-black transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-[0.99]"
        >
          {current.action}
          <ArrowUpRight size={16} />
        </button>
      </div>
    </div>
  );
};

/* ───────────────────────────── Features ───────────────────────────── */

const FEATURES = [
  {
    id: 'explore-wallet',
    icon: Wallet,
    title: 'A wallet that feels like banking',
    body: 'Sign up with your email and a 4-digit PIN. Your wallet is ready in seconds, with no seed phrase to lose and no network fees to pay.',
    cta: 'Create wallet',
  },
  {
    id: 'explore-swap',
    icon: ArrowLeftRight,
    title: 'Swap any token in seconds',
    body: 'Trade ETH, stablecoins and more at live market prices from independent merchants. Want to earn? List your own market and keep the margin you set on every sale.',
    cta: 'Start swapping',
  },
  {
    id: 'explore-borrow',
    icon: Landmark,
    title: 'Borrow Naira against your crypto',
    body: 'Deposit supported crypto, borrow NGNS, and repay whenever you are ready to get your crypto back. Track your position from one screen.',
    cta: 'Start borrowing',
  },
  {
    id: 'explore-names',
    icon: AtSign,
    title: 'Send money to a name',
    body: 'Claim a short name like pay.usdc@mybusiness and share it like an email. Lookalike names are blocked, so nobody can pose as you.',
    cta: 'Claim your name',
  },
];

const FeatureCard = ({ feature, onClick }) => {
  const Icon = feature.icon;
  return (
    <article
      id={feature.id}
      className="group flex scroll-mt-28 flex-col rounded-[1.75rem] border border-black/[0.07] bg-black/[0.02] p-6 transition-colors hover:border-salvaGold/35 dark:border-white/[0.07] dark:bg-white/[0.025] sm:p-8"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-salvaGold/10 text-salvaGold">
        <Icon size={20} />
      </span>
      <h3 className="mt-6 text-xl font-black tracking-tight sm:text-2xl">{feature.title}</h3>
      <p className="mt-3 max-w-md text-sm leading-relaxed text-black/60 dark:text-white/55 sm:text-base">
        {feature.body}
      </p>
      <button
        type="button"
        onClick={onClick}
        className="mt-6 inline-flex w-fit items-center gap-1.5 text-sm font-bold text-salvaGold transition-all hover:gap-2.5 focus:outline-none focus-visible:underline"
      >
        {feature.cta}
        <ArrowUpRight size={15} />
      </button>
    </article>
  );
};

/* ──────────────────────────────── SANT ─────────────────────────────── */

const EARN_ROWS = [
  { label: 'Send and receive money', planned: false },
  { label: 'Swap tokens', planned: false },
  { label: 'Provide liquidity', planned: false },
  { label: 'Stake SANT', planned: true },
];

const SantSection = ({ onStart }) => (
  <section id="explore-sant" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-24">
    <div className="relative overflow-hidden rounded-[2rem] border border-salvaGold/20 bg-gradient-to-br from-zinc-950 via-[#0f0e0a] to-zinc-950 p-6 text-white sm:rounded-[3rem] sm:p-14">
      <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-salvaGold/10 blur-[110px]" />
      <div className="relative grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <p className="text-sm font-bold text-salvaGold">SANT token</p>
          <h2 className="mt-3 text-3xl font-black leading-[1.02] tracking-tighter sm:text-6xl">
            Use the network.
            <br />
            Earn the network.
          </h2>
          <div className="mt-8 flex flex-wrap items-end gap-x-10 gap-y-4">
            <button
              type="button"
              onClick={onStart}
              className="inline-flex items-center gap-2 rounded-2xl bg-salvaGold px-6 py-3.5 text-sm font-black text-black transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
            >
              Start earning <ArrowUpRight size={15} />
            </button>
          </div>
        </div>

        <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] p-2">
          {EARN_ROWS.map((row, i) => (
            <div
              key={row.label}
              className={`flex items-center justify-between gap-3 px-4 py-4 sm:px-5 ${
                i !== EARN_ROWS.length - 1 ? 'border-b border-white/[0.06]' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full ${
                    row.planned ? 'bg-white/[0.06] text-white/35' : 'bg-salvaGold/15 text-salvaGold'
                  }`}
                >
                  <Check size={13} strokeWidth={3} />
                </span>
                <span
                  className={`text-sm font-semibold sm:text-base ${
                    row.planned ? 'text-white/60' : ''
                  }`}
                >
                  {row.label}
                </span>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                  row.planned ? 'bg-white/[0.06] text-white/45' : 'bg-salvaGold/10 text-salvaGold'
                }`}
              >
                {row.planned ? 'Coming soon' : 'Earns SANT'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  </section>
);

/* ───────────────────────── How it works / FAQ ───────────────────────── */

const STEPS = [
  {
    title: 'Create your wallet',
    desc: 'Use your email and a 4-digit PIN. It takes under two minutes.',
  },
  {
    title: 'Claim your name',
    desc: 'Pick a name like yourname@yournamespace so friends can pay you easily.',
  },
  { title: 'Send and swap', desc: 'Send money to anyone, or swap between tokens.' },
  { title: 'Borrow and earn', desc: 'Borrow against your crypto and collect SANT as you go.' },
];

const FAQS = [
  {
    q: 'What is Salva?',
    a: 'Salva is a simple wallet for Naira, dollars and more. You can send money to a name, swap between tokens, borrow against your crypto and earn rewards for using it.',
  },
  {
    q: 'What is NGNS?',
    a: 'NGNS is a digital Naira. One NGNS is always worth one Naira. You can send it, swap it for other tokens, or borrow it against your crypto.',
  },
  {
    q: 'How does borrowing work?',
    a: 'You deposit supported crypto as collateral and borrow NGNS against it. Repay whenever you like to get your collateral back. Borrowing carries risk: if the value of your collateral falls too far, your position can be liquidated, so add collateral or repay if you see it getting close.',
  },
  {
    q: 'What is SANT and how do I get it?',
    a: 'SANT is Salva’s reward token. It is designed to be earned by using the network, such as sending, receiving, swapping and providing liquidity.',
  },
  {
    q: 'Who controls my money?',
    a: 'You do.',
  },
  {
    q: 'What is a Salva name?',
    a: 'A short name like yourname@yournamespace that points to your wallet. People can send you money using the name instead of a long wallet address.',
  },
];

const FAQItem = ({ question, answer }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-black/[0.07] last:border-0 dark:border-white/[0.07]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="group flex w-full items-center justify-between gap-4 py-5 text-left focus:outline-none focus-visible:text-salvaGold sm:py-6"
      >
        <span className="text-base font-bold tracking-tight transition-colors group-hover:text-salvaGold sm:text-lg">
          {question}
        </span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25 }}
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
            open
              ? 'border-salvaGold bg-salvaGold text-black'
              : 'border-black/20 text-black/50 dark:border-white/20 dark:text-white/50'
          }`}
        >
          <ChevronDown size={15} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden"
          >
            <p className="max-w-3xl pb-6 text-sm leading-relaxed text-black/60 dark:text-white/55 sm:text-base">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ─────────────────────────── Support modal ─────────────────────────── */

const SupportModal = ({ onClose }) => {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const inputClass =
    'w-full rounded-2xl border border-black/10 bg-black/[0.04] p-4 text-sm outline-none transition-colors placeholder:opacity-40 focus:border-salvaGold/50 dark:border-white/10 dark:bg-white/5';

  const handleSubmit = (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const subject = `SALVA SUPPORT: ${String(fd.get('topic') || '').trim()}`;
    const body = `Name: ${String(fd.get('name') || '').trim()}\nAccount: ${String(
      fd.get('account') || ''
    ).trim()}\nIssue: ${String(fd.get('message') || '').trim()}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Get help"
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
      />
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 24 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 24 }}
        transition={{ duration: 0.3, ease: EASE }}
        className="relative w-full max-w-lg rounded-[2rem] border border-black/10 bg-white p-7 shadow-2xl dark:border-white/10 dark:bg-zinc-950 sm:p-9"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-6 top-6 opacity-40 transition-opacity hover:opacity-100 focus:outline-none focus-visible:opacity-100"
        >
          <X size={22} />
        </button>
        <h2 className="text-2xl font-black tracking-tight sm:text-3xl">Get help</h2>
        <p className="mb-6 mt-1 text-sm text-black/50 dark:text-white/45">
          Tell us what is going on and our team will get back to you.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <input required autoFocus name="name" placeholder="Full name" className={inputClass} />
          <input
            required
            name="account"
            placeholder="Salva account or name"
            className={inputClass}
          />
          <input required name="topic" placeholder="What is this about?" className={inputClass} />
          <textarea
            required
            name="message"
            rows={4}
            placeholder="How can we help?"
            className={`${inputClass} resize-none`}
          />
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-salvaGold py-4 text-sm font-black text-black transition hover:brightness-110 active:scale-[0.98]"
          >
            <Mail size={16} /> Send request
          </button>
        </form>
      </motion.div>
    </div>
  );
};

/* ─────────────────────────────── Page ─────────────────────────────── */

const scrollToId = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });

const Home = () => {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);

  const goLogin = () => navigate('/login');

  // Signed-in users go straight to the dashboard.
  useEffect(() => {
    try {
      const saved = localStorage.getItem('salva_user');
      if (saved) {
        const u = JSON.parse(saved);
        if (u?.safeAddress && !u?.ownerKey) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }
    } catch {
      localStorage.removeItem('salva_user');
    } finally {
      setCheckingAuth(false);
    }
  }, [navigate]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <motion.div
          animate={reduce ? undefined : { opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-2xl font-black tracking-[0.4em] text-salvaGold"
        >
          SALVA
        </motion.div>
      </div>
    );
  }

  const heroItem = (delay) => ({
    initial: reduce ? false : { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, delay, ease: EASE },
  });

  return (
    <div className="home-mobile-scale min-h-screen overflow-x-hidden bg-white text-black transition-colors duration-300 dark:bg-[#0A0A0B] dark:text-white">
      <HomeMobileScaleStyle />
      <SEOMeta />
      <Stars />
      {/* ── Hero ── */}
      <section className="relative px-4 pb-14 pt-20 sm:px-6 sm:pb-20 sm:pt-24">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 right-[-10%] h-[520px] w-[520px] rounded-full bg-salvaGold/[0.07] blur-[120px]" />
          <div className="absolute bottom-0 left-[-10%] h-[380px] w-[380px] rounded-full bg-salvaGold/[0.04] blur-[110px]" />
        </div>

        <div className="relative z-10 mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          <div>
            <motion.h1
              {...heroItem(0.1)}
              className="text-[clamp(2.4rem,7vw,5.75rem)] font-black leading-[0.94] tracking-tighter"
            >
              ON-CHAIN
              <br />
              PAYMENT RAILS.
            </motion.h1>

            <motion.div {...heroItem(0.2)} className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-salvaGold px-7 py-4 text-sm font-black text-black shadow-lg shadow-salvaGold/20 transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-salvaGold/70 active:scale-95"
              >
                Create wallet <ArrowUpRight size={16} />
              </button>
              <button
                type="button"
                onClick={() => scrollToId('explore-wallet')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-black/10 px-7 py-4 text-sm font-bold transition hover:border-salvaGold/40 hover:bg-salvaGold/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-salvaGold/70 dark:border-white/10"
              >
                See what you can do
                <ChevronDown size={16} />
              </button>
            </motion.div>
          </div>

          <motion.div {...heroItem(0.25)}>
            <HeroCard onAction={goLogin} />
          </motion.div>
        </div>
      </section>
      {/* ── What you can do ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-black leading-[1.02] tracking-tighter sm:text-5xl">
            Everything you need to move money, in one place.
          </h2>
          <p className="mt-4 text-base text-black/60 dark:text-white/55 sm:text-lg">
            Payments, swaps, borrowing and rewards, all in one wallet.
          </p>
        </div>
        <div className="mt-10 grid gap-4 sm:mt-14 md:grid-cols-2">
          {FEATURES.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} onClick={goLogin} />
          ))}
        </div>
      </section>
      {/* ── SANT ── */}
      <SantSection onStart={goLogin} />
      {/* ── How it works ── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="max-w-xl text-3xl font-black leading-[1.02] tracking-tighter sm:text-5xl">
          Up and running in minutes.
        </h2>
        <ol className="mt-10 grid gap-4 sm:mt-14 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li
              key={step.title}
              className="rounded-[1.5rem] border border-black/[0.07] bg-black/[0.02] p-6 dark:border-white/[0.07] dark:bg-white/[0.025]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-salvaGold text-sm font-black text-black">
                {i + 1}
              </span>
              <h3 className="mt-5 text-lg font-black tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-black/60 dark:text-white/55">
                {step.desc}
              </p>
            </li>
          ))}
        </ol>
      </section>
      {/* ── FAQ ── */}
      <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <h2 className="text-center text-3xl font-black tracking-tighter sm:text-5xl">
          Questions, answered.
        </h2>
        <div className="mt-10 sm:mt-14">
          {FAQS.map((faq) => (
            <FAQItem key={faq.q} question={faq.q} answer={faq.a} />
          ))}
        </div>
      </section>
      {/* ── Closing call to action ── */}
      <section className="mx-auto max-w-5xl px-4 pb-24 sm:px-6 sm:pb-28">
        <div className="relative overflow-hidden rounded-[2rem] bg-salvaGold p-8 text-center sm:rounded-[3rem] sm:p-20">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.25),transparent_60%)]" />
          <div className="relative">
            <h2 className="text-3xl font-black leading-[0.95] tracking-tighter text-black sm:text-6xl">
              Take your money
              <br />
              on-chain today.
            </h2>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-relaxed text-black/65 sm:text-lg">
              Create your wallet, claim your name and start earning SANT. It’s free to start and
              takes less than two minutes.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={goLogin}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-black px-8 py-4 text-sm font-black text-salvaGold shadow-2xl shadow-black/30 transition hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 active:scale-95"
              >
                Get started free <ArrowUpRight size={15} />
              </button>
              <button
                type="button"
                onClick={() => scrollToId('explore-sant')}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-black/20 px-8 py-4 text-sm font-black text-black transition hover:border-black/40 hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-black/60 active:scale-95"
              >
                Learn about SANT
              </button>
            </div>
          </div>
        </div>
      </section>
      {/* ── Footer ── */}
      <footer className="mx-auto max-w-7xl border-t border-black/[0.06] px-4 py-14 dark:border-white/[0.06] sm:px-6">
        <div className="flex flex-col justify-between gap-12 md:flex-row">
          <div className="max-w-xs">
            <h2 className="text-2xl font-black tracking-tighter text-salvaGold">SALVA</h2>
            <p className="mt-3 text-sm leading-relaxed text-black/50 dark:text-white/40">
              Send, swap, borrow and earn with Naira, dollars and more. You stay in control of your
              money.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm sm:grid-cols-4">
            <div>
              <p className="mb-3 text-xs font-bold text-black/40 dark:text-white/35">Explore</p>
              <div className="space-y-2.5">
                {[
                  ['Wallet', 'explore-wallet'],
                  ['Swap', 'explore-swap'],
                  ['Borrow', 'explore-borrow'],
                  ['Names', 'explore-names'],
                  ['SANT', 'explore-sant'],
                ].map(([label, id]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => scrollToId(id)}
                    className="block text-left opacity-60 transition hover:text-salvaGold hover:opacity-100"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold text-black/40 dark:text-white/35">Community</p>
              <div className="space-y-2.5">
                <a
                  href="https://github.com/salva-Nexus"
                  target="_blank"
                  rel="noreferrer"
                  className="block opacity-60 transition hover:text-salvaGold hover:opacity-100"
                >
                  GitHub
                </a>
                <a
                  href="https://x.com/salva_Nexus"
                  target="_blank"
                  rel="noreferrer"
                  className="block opacity-60 transition hover:text-salvaGold hover:opacity-100"
                >
                  X (Twitter)
                </a>
              </div>
            </div>

            <div>
              <p className="mb-3 text-xs font-bold text-black/40 dark:text-white/35">Support</p>
              <button
                type="button"
                onClick={() => setSupportOpen(true)}
                className="block text-left opacity-60 transition hover:text-salvaGold hover:opacity-100"
              >
                Get help
              </button>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-black/[0.06] pt-8 dark:border-white/[0.06] sm:flex-row">
          <p className="text-xs text-black/40 dark:text-white/30">
            © {new Date().getFullYear()} Salva Nexus.
          </p>
          <div className="flex items-center gap-2">
            <a
              href="https://x.com/salva_Nexus"
              target="_blank"
              rel="noreferrer"
              aria-label="Salva on X"
              className="rounded-full border border-black/[0.08] bg-black/[0.04] p-3 opacity-60 transition hover:text-salvaGold hover:opacity-100 dark:border-white/10 dark:bg-white/5"
            >
              <XLogo size={14} />
            </a>
            <a
              href="https://github.com/salva-Nexus"
              target="_blank"
              rel="noreferrer"
              aria-label="Salva on GitHub"
              className="rounded-full border border-black/[0.08] bg-black/[0.04] p-3 opacity-60 transition hover:text-salvaGold hover:opacity-100 dark:border-white/10 dark:bg-white/5"
            >
              <Github size={14} />
            </a>
            <button
              type="button"
              onClick={() => setSupportOpen(true)}
              aria-label="Contact support"
              className="rounded-full border border-black/[0.08] bg-black/[0.04] p-3 opacity-60 transition hover:text-salvaGold hover:opacity-100 dark:border-white/10 dark:bg-white/5"
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
