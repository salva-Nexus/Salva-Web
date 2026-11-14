import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';
import { AtSign, Droplets, ArrowLeftRight, RefreshCw, Landmark } from 'lucide-react';
import Stars from '../components/Stars';
import DeployPool from './DeployPool';
import SwapTab from './SwapTab';
import { POLL_INTERVAL_MS, readWalletCache, fetchWalletSnapshot } from '../utils/walletCache';
import { useOverlayLayer } from './Dashboard';
import LinkNamePage from './LinkNamePage';
import CDP from './CDP';

const ServicePage = ({ title, onBack, children }) => (
  <div className="fixed inset-0 z-[120] bg-[#080809] overflow-y-auto">
    <Stars />

    <div className="relative z-10 max-w-3xl mx-auto px-3 sm:px-6 pt-5 sm:pt-10 pb-20">
      <div className="flex items-center justify-between mb-6 sm:mb-9">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-white/75 hover:text-white text-[9px] sm:text-xs font-black uppercase tracking-widest"
        >
          ← Back
        </button>

        <div className="text-right">
          <p className="text-[7px] sm:text-[9px] uppercase tracking-[.35em] text-salvaGold/60 font-black">
            Services
          </p>
          <p className="text-sm sm:text-xl font-black mt-0.5">{title}</p>
        </div>
      </div>

      {children}
    </div>
  </div>
);

const ServiceNotice = ({ notice, onClose }) => {
  if (!notice.show) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[220] flex items-center justify-center px-3 sm:px-4">
        <motion.div
          className="absolute inset-0 bg-black/80 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        <motion.div
          className="relative w-full max-w-[280px] sm:max-w-xs overflow-hidden rounded-[22px] sm:rounded-[28px] border border-white/[0.07] bg-zinc-950 shadow-2xl"
          initial={{ opacity: 0, scale: 0.88, y: 18 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.88, y: 18 }}
          transition={{ type: 'spring', stiffness: 420, damping: 30 }}
        >
          <div className="px-5 sm:px-7 pt-6 sm:pt-8 pb-5 sm:pb-7 text-center">
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-xl sm:rounded-2xl mx-auto mb-4 sm:mb-5 flex items-center justify-center bg-salvaGold/10 border border-salvaGold/30">
              <span className="text-xl sm:text-2xl font-black text-salvaGold">
                {notice.type === 'error' ? '×' : '✓'}
              </span>
            </div>

            <p className="font-black text-xs sm:text-sm leading-relaxed mb-5 text-white/90">
              {notice.message}
            </p>

            <button
              onClick={onClose}
              className="w-full py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-salvaGold text-black font-black text-[10px] sm:text-xs uppercase tracking-widest"
            >
              Got it
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

const Services = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [user] = useState(() => {
    try {
      const raw = localStorage.getItem('salva_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  // Same chain Dashboard last polled — Services never runs its own selector,
  // it just reads the same cached snapshot.
  const [selectedChain] = useState(() => localStorage.getItem('salva_chain') || 'base');

  const initialWalletCache = readWalletCache(user?.email, selectedChain);
  const [portfolio, setPortfolio] = useState({
    totalNgn: initialWalletCache?.totalNgn ?? null,
    updatedAt: initialWalletCache?.at || null,
  });
  const [snsData, setSnsData] = useState({
    namespaces: initialWalletCache?.namespaces || [],
    nameAliases: initialWalletCache?.nameAliases || [],
  });
  const [refreshing, setRefreshing] = useState(false);

  const mountedRef = useRef(true);
  const pollTimerRef = useRef(null);
  const activeRequestRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestRef.current?.abort();
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  // Cache -> UI. Synchronous, local, no network — identical role to
  // Dashboard's readSnapshotIntoUI.
  const readPortfolioFromCache = useCallback(() => {
    if (!mountedRef.current) return;

    const snapshot = readWalletCache(user?.email, selectedChain);

    setPortfolio({
      totalNgn: snapshot?.totalNgn ?? null,
      updatedAt: snapshot?.at || null,
    });

    setSnsData({
      namespaces: snapshot?.namespaces || [],
      nameAliases: snapshot?.nameAliases || [],
    });
  }, [selectedChain, user?.email]);

  // Server -> cache -> UI. Failures are swallowed silently: Services never
  // shows a spinner or error state for this background figure — whatever
  // was last cached simply stays on screen.
  const pollPortfolio = useCallback(
    async ({ force = false } = {}) => {
      if (!user?.email) return;
      if (activeRequestRef.current && !force) return;
      if (activeRequestRef.current && force) activeRequestRef.current.abort();

      const controller = new AbortController();
      activeRequestRef.current = controller;

      try {
        await fetchWalletSnapshot(user.email, selectedChain, { signal: controller.signal });
        readPortfolioFromCache();
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('[Services] portfolio poll failed:', error?.message || error);
        }
      } finally {
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
      }
    },
    [readPortfolioFromCache, selectedChain, user?.email]
  );

  // Paint the cached figure immediately, then silently refresh on the same
  // interval Dashboard uses.
  useEffect(() => {
    if (!user?.email) return undefined;

    readPortfolioFromCache();
    pollPortfolio();

    const tick = () => {
      if (document.visibilityState === 'visible') pollPortfolio();
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [pollPortfolio, readPortfolioFromCache, user?.email]);

  // The one manual refresh — spins only the button, never blocks the page.
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await pollPortfolio({ force: true });
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [pollPortfolio]);

  const navType = useNavigationType();

  // Coming back via Back (POP) restores whichever service was open before
  // we navigated away (e.g. Pools -> pool page -> Back).
  const [activeService, setActiveService] = useState(() => {
    if (location.state?.openService) return location.state.openService;

    const qs = new URLSearchParams(location.search).get('open');
    if (qs) return qs;

    if (navType === 'POP') {
      try {
        return sessionStorage.getItem('salva_active_service') || null;
      } catch {
        return null;
      }
    }

    return null;
  });

  const restoredRef = useRef(Boolean(activeService));

  useEffect(() => {
    try {
      if (activeService) {
        sessionStorage.setItem('salva_active_service', activeService);
      } else {
        sessionStorage.removeItem('salva_active_service');
      }
    } catch {}
  }, [activeService]);
  const [notice, setNotice] = useState({
    show: false,
    message: '',
    type: 'info',
  });

  const showMsg = useCallback((message, type = 'info') => {
    setNotice({
      show: true,
      message,
      type,
    });
  }, []);

  const closeMsg = useCallback(() => {
    setNotice((current) => ({ ...current, show: false }));
  }, []);

  useOverlayLayer('activeService', Boolean(activeService), () => setActiveService(null), {
    adoptOnMount: restoredRef.current,
  });
  useOverlayLayer('notice', notice.show, closeMsg);

  return (
    <div className="min-h-screen bg-[#080809] text-white">
      <Stars />

      <main className="relative z-10 max-w-3xl mx-auto px-3 sm:px-6 pt-8 sm:pt-14 pb-28 md:pb-16">
        <div className="flex items-start justify-between gap-3 mb-7 sm:mb-9">
          <div>
            <button
              onClick={() => navigate('/dashboard')}
              className="flex items-center gap-1.5 text-white/75 hover:text-white text-[9px] sm:text-xs font-black uppercase tracking-widest mb-2.5"
            >
              ← Dashboard
            </button>
            <p className="text-[8px] sm:text-[9px] uppercase tracking-[.3em] text-salvaGold/60 font-black">
              Salva
            </p>
            <h1 className="text-xl sm:text-3xl font-black mt-1">Services</h1>
            <p className="text-[9px] sm:text-xs text-white/80 mt-1">Access Salva's services.</p>
          </div>

          <div className="flex items-center gap-2 shrink-0 pt-0.5">
            <div className="text-right hidden sm:block">
              <p className="text-[7px] uppercase tracking-[.3em] text-white/75 font-black">
                Portfolio
              </p>
              <p className="text-xs font-black text-white mt-0.5">
                {portfolio.totalNgn === null
                  ? '—'
                  : `₦${portfolio.totalNgn.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`}
              </p>
            </div>

            <button
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label="Refresh portfolio"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl border border-white/[0.08] flex items-center justify-center text-white/80 hover:text-white hover:bg-white/[0.05] disabled:opacity-60 transition-all"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${refreshing ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        <section>
          <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
            <button
              onClick={() => setActiveService('swap')}
              className="group relative overflow-hidden text-left p-3 sm:p-4 min-h-[105px] sm:min-h-[125px] rounded-[18px] sm:rounded-[22px] border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] transition-all"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-blue-500/10 border border-blue-500/15 flex items-center justify-center mb-4 sm:mb-5">
                <ArrowLeftRight className="w-4 h-4 sm:w-5 sm:h-5 text-blue-400" />
              </div>
              <p className="font-black text-xs sm:text-sm">Swap</p>
              <p className="text-[8px] sm:text-[9px] text-white/80 mt-1">Exchange assets</p>
              <span className="absolute right-2.5 bottom-2.5 text-white/15 group-hover:text-blue-400">
                ↗
              </span>
            </button>

            <button
              onClick={() => setActiveService('deploy')}
              className="group relative overflow-hidden text-left p-3 sm:p-4 min-h-[105px] sm:min-h-[125px] rounded-[18px] sm:rounded-[22px] border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] transition-all"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-purple-500/10 border border-purple-500/15 flex items-center justify-center mb-4 sm:mb-5">
                <Droplets className="w-4 h-4 sm:w-5 sm:h-5 text-purple-400" />
              </div>
              <p className="font-black text-xs sm:text-sm">Pools</p>
              <p className="text-[8px] sm:text-[9px] text-white/80 mt-1">Provide liquidity</p>
              <span className="absolute right-2.5 bottom-2.5 text-white/15 group-hover:text-purple-400">
                ↗
              </span>
            </button>

            <button
              onClick={() => setActiveService('sns')}
              className="group relative overflow-hidden text-left p-3 sm:p-4 min-h-[105px] sm:min-h-[125px] rounded-[18px] sm:rounded-[22px] border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] transition-all"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-salvaGold/10 border border-salvaGold/15 flex items-center justify-center mb-4 sm:mb-5">
                <AtSign className="w-4 h-4 sm:w-5 sm:h-5 text-salvaGold" />
              </div>
              <p className="font-black text-xs sm:text-sm">SNS</p>
              <p className="text-[8px] sm:text-[9px] text-white/80 mt-1">Salva Naming Service</p>
              <span className="absolute right-2.5 bottom-2.5 text-white/15 group-hover:text-salvaGold">
                ↗
              </span>
            </button>

            <button
              onClick={() => setActiveService('cdp')}
              className="group relative overflow-hidden text-left p-3 sm:p-4 min-h-[105px] sm:min-h-[125px] rounded-[18px] sm:rounded-[22px] border border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] transition-all"
            >
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-emerald-500/10 border border-emerald-500/15 flex items-center justify-center mb-4 sm:mb-5">
                <Landmark className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              </div>
              <p className="font-black text-xs sm:text-sm">Vaults</p>
              <p className="text-[8px] sm:text-[9px] text-white/80 mt-1">Borrow NGNS</p>
              <span className="absolute right-2.5 bottom-2.5 text-white/15 group-hover:text-emerald-400">
                ↗
              </span>
            </button>
          </div>
        </section>
      </main>

      <AnimatePresence>
        {activeService === 'swap' && (
          <ServicePage title="Swap" onBack={() => setActiveService(null)}>
            <SwapTab user={user} showMsg={showMsg} />
          </ServicePage>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeService === 'deploy' && (
          <ServicePage title="Deploy Pool" onBack={() => setActiveService(null)}>
            <DeployPool
              user={user}
              showMsg={showMsg}
              onSwitchToLinkName={() => navigate('/link-name')}
            />
          </ServicePage>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeService === 'sns' && (
          <ServicePage title="SNS" onBack={() => setActiveService(null)}>
            <LinkNamePage
              user={user}
              namespaces={snsData.namespaces}
              nameAliases={snsData.nameAliases}
              showMsg={showMsg}
            />
          </ServicePage>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeService === 'cdp' && (
          <ServicePage title="Vaults" onBack={() => setActiveService(null)}>
            <CDP />
          </ServicePage>
        )}
      </AnimatePresence>

      <ServiceNotice notice={notice} onClose={closeMsg} />
    </div>
  );
};

export default Services;
