// packages/frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsRef = useRef(null);
  const isBNBPage = location.pathname === '/bnb';

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
            width: '52px',
            height: '52px',
            objectFit: 'contain',
            display: 'block',
            flexShrink: 0,
          }}
        />
        <span
          className="font-black tracking-tighter text-white"
          style={{
            fontSize: '1.1rem',
            lineHeight: 1,
            position: 'relative',
            left: '-1px',
            letterSpacing: '-0.04em',
          }}
        >
          SALVA<span style={{ color: '#D4AF37' }}>.</span>
        </span>
      </Link>

      {/* ── Right side ── */}

      <div className="flex items-center gap-3 sm:gap-4">
        {/* ── Settings / Login (non-L1 pages) ── */}
        {!isLoggedIn ? (
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
          )}
      </div>
    </nav>
  );
};

export default Navbar;
