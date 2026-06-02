// packages/frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';

const Navbar = ({ l1Account, l1Connecting, onL1Connect, onL1Disconnect, l1ChainId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showL1Menu, setShowL1Menu] = useState(false);
  const settingsRef = useRef(null);
  const l1Ref = useRef(null);
  const isL1Page = location.pathname === '/l1';

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user.username && user.safeAddress) {
          setIsLoggedIn(true);
        } else {
          localStorage.removeItem('salva_user');
          setIsLoggedIn(false);
        }
      } catch (error) {
        localStorage.removeItem('salva_user');
        setIsLoggedIn(false);
      }
    } else {
      setIsLoggedIn(false);
    }
  }, [location]);

  useEffect(() => {
    // Always enforce dark mode — toggle removed
    document.documentElement.classList.add('dark');
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target)) {
        setShowSettingsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (l1Ref.current && !l1Ref.current.contains(event.target)) {
        setShowL1Menu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('salva_user');
    setIsLoggedIn(false);
    navigate('/');
  };

  return (
    <nav className="fixed top-0 w-full z-50 px-2 sm:px-4 py-1 flex justify-between items-center backdrop-blur-md border-b border-white/5">
      {/* ── Logo ── */}
      <Link
        to="/"
        className="flex items-center gap-0 select-none"
        style={{ textDecoration: 'none' }}
      >
        <img
          src="/salva-logo.png"
          alt="Salva"
          style={{
            width: '72px',
            height: '72px',
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
        <span
          className="font-black tracking-tighter text-white"
          style={{
            fontSize: '1.45rem',
            lineHeight: 1,
            position: 'relative',
            left: '-14px',
            letterSpacing: '-0.04em',
          }}
        >
          SALVA<span style={{ color: '#D4AF37' }}>.</span>
        </span>
      </Link>

      {/* ── Right side ── */}

      <div className="flex items-center gap-3 sm:gap-4">
        {/* ── L1 Connect Wallet (only on /l1) ── */}
        {isL1Page && (
          <div className="relative" ref={l1Ref}>
            {!l1Account ? (
              <motion.button
                onClick={onL1Connect}
                disabled={l1Connecting}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl font-black text-[11px] uppercase tracking-widest transition-all disabled:opacity-50"
                style={{ background: '#D4AF37', color: '#000' }}
              >
                {l1Connecting && (
                  <span className="w-3 h-3 border-2 border-black/25 border-t-black rounded-full animate-spin" />
                )}
                {l1Connecting ? 'Connecting…' : 'Connect Wallet'}
              </motion.button>
            ) : (
              <motion.button
                onClick={() => setShowL1Menu((o) => !o)}
                whileHover={{ scale: 1.02 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 bg-white/[0.04] hover:border-yellow-500/30 transition-all"
              >
                <span
                  className="w-2 h-2 rounded-full animate-pulse"
                  style={{
                    background: l1ChainId === 56 || l1ChainId === 97 ? '#D4AF37' : '#f97316',
                  }}
                />
                <span className="font-mono font-black text-[11px] text-white">
                  {l1Account.slice(0, 6)}…{l1Account.slice(-4)}
                </span>
                <svg
                  className={`w-3 h-3 text-white/25 transition-transform ${showL1Menu ? 'rotate-180' : ''}`}
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
              </motion.button>
            )}

            <AnimatePresence>
              {showL1Menu && l1Account && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 mt-2 w-64 bg-zinc-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
                >
                  <div
                    className="h-px"
                    style={{
                      background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
                    }}
                  />
                  <div className="p-4 flex flex-col gap-2">
                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                      <p className="text-[9px] uppercase font-black text-white/25 tracking-widest mb-1">
                        BNB Wallet
                      </p>
                      <p
                        className="font-mono text-[11px] break-all leading-relaxed"
                        style={{ color: '#D4AF37' }}
                      >
                        {l1Account}
                      </p>
                    </div>
                    {l1ChainId !== 56 && l1ChainId !== 97 && (
                      <div className="p-2.5 rounded-xl bg-orange-500/[0.07] border border-orange-500/20">
                        <p className="text-[10px] font-black text-orange-400">⚠ Not on BNB Chain</p>
                        <p className="text-[10px] text-white/30 mt-0.5">
                          Switch to BNB Smart Chain in your wallet.
                        </p>
                      </div>
                    )}
                    <button
                      onClick={() => {
                        setShowL1Menu(false);
                        onL1Disconnect();
                      }}
                      className="w-full py-2.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] text-red-400 font-black text-[10px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all"
                    >
                      Disconnect
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Settings / Login (non-L1 pages) ── */}
        {!isL1Page &&
          (!isLoggedIn ? (
            <Link
              to="/login"
              className="text-xs font-bold uppercase tracking-[0.2em] text-white opacity-60 hover:opacity-100 transition-opacity"
            >
              Login
            </Link>
          ) : (
            <div className="relative" ref={settingsRef}>
              <motion.button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-full hover:bg-white/5 transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-white opacity-60 hover:opacity-100" />
              </motion.button>

              <AnimatePresence>
                {showSettingsMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-2 w-48 bg-zinc-900 rounded-2xl border border-white/10 shadow-2xl overflow-hidden"
                  >
                    <Link
                      to="/account-settings"
                      onClick={() => setShowSettingsMenu(false)}
                      className="block px-4 py-3 text-sm font-bold text-white hover:bg-white/5 transition-colors"
                    >
                      Account Settings
                    </Link>
                    <button
                      onClick={() => {
                        setShowSettingsMenu(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 transition-colors border-t border-white/10"
                    >
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
      </div>
    </nav>
  );
};

export default Navbar;
