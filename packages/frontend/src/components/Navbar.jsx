// Salva-Digital-Tech/packages/frontend/src/components/Navbar.jsx
import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings } from 'lucide-react';

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const settingsRef = useRef(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const user = JSON.parse(savedUser);
        if (user.username && user.safeAddress && user.accountNumber) {
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('theme', JSON.stringify(darkMode));
  }, [darkMode]);

  // Close settings menu when clicking outside
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
    <nav className="fixed top-0 w-full z-50 px-8 py-6 flex justify-between items-center backdrop-blur-md border-b border-gray-200/10 dark:border-white/5">
      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '12px', textDecoration: 'none' }}>
        <svg
          className="salva-nav-logo"
          width="44"
          height="44"
          viewBox="0 0 80 80"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <style>{`
      .salva-nav-logo .nr { stroke:#C9A84C; fill:none; stroke-width:2.5; stroke-dasharray:56; stroke-dashoffset:56; animation: drawR 0.5s ease forwards 0.1s; }
      .salva-nav-logo .nnr { stroke:#1a3a6e; fill:none; stroke-width:2.5; stroke-dasharray:56; stroke-dashoffset:56; animation: drawR 0.5s ease forwards 0.6s; }
      .salva-nav-logo .nd { fill:#C9A84C; animation: popD 0.3s ease forwards 0.55s; r:0; }
      .salva-nav-logo .nnd { fill:#1a3a6e; animation: popD 0.3s ease forwards 1.05s; r:0; }
      .salva-nav-logo .at { stroke:#C9A84C; fill:none; stroke-width:2; stroke-linecap:round; stroke-dasharray:22; stroke-dashoffset:22; animation: drawR 0.4s ease forwards 1.1s; }
      .salva-nav-logo .ab { stroke:#1a3a6e; fill:none; stroke-width:2; stroke-linecap:round; stroke-dasharray:22; stroke-dashoffset:22; animation: drawR 0.4s ease forwards 1.3s; }
      .salva-nav-logo .pg { fill:none; stroke:#C9A84C; stroke-width:1.2; opacity:0; animation: pR 2s ease-out infinite 2s; }
      .salva-nav-logo .pn { fill:none; stroke:#1a3a6e; stroke-width:1.2; opacity:0; animation: pR 2s ease-out infinite 2.6s; }
      @keyframes drawR { to { stroke-dashoffset:0; } }
      @keyframes popD { 0%{r:0} 60%{r:5px} 100%{r:3.5px} }
      @keyframes pR { 0%{r:9px;opacity:0.7} 100%{r:20px;opacity:0} }
      .salva-nav-logo .ta {
        offset-path: path('M31 40 C40 28, 49 28, 58 40');
        animation: tG 1.4s ease-in-out infinite 1.8s;
        fill: #C9A84C;
      }
      .salva-nav-logo .tb {
        offset-path: path('M31 40 C40 52, 49 52, 58 40');
        animation: tN 1.4s ease-in-out infinite 2.5s;
        fill: #8ab4d4;
      }
      @keyframes tG {
        0%{offset-distance:0%;opacity:0}
        5%{opacity:1}
        95%{opacity:1}
        100%{offset-distance:100%;opacity:0}
      }
      @keyframes tN {
        0%{offset-distance:100%;opacity:0}
        5%{opacity:1}
        95%{opacity:1}
        100%{offset-distance:0%;opacity:0}
      }
    `}</style>

          <circle className="pg" cx="22" cy="40" />
          <circle className="pn" cx="58" cy="40" />
          <circle className="nr" cx="22" cy="40" r="9" />
          <circle className="nnr" cx="58" cy="40" r="9" />
          <circle className="nd" cx="22" cy="40" />
          <circle className="nnd" cx="58" cy="40" />
          <path className="at" d="M31 40 C40 28, 49 28, 58 40" />
          <path className="ab" d="M31 40 C40 52, 49 52, 58 40" />
          <circle className="ta" r="3" />
          <circle className="tb" r="2.5" />
        </svg>

        <span className="text-2xl font-black tracking-tighter text-black dark:text-white">
          SALVA<span className="text-salvaGold">.</span>
        </span>
      </Link>

      <div className="flex items-center gap-8">
        {!isLoggedIn ? (
          <Link
            to="/login"
            className="text-xs font-bold uppercase tracking-[0.2em] text-black dark:text-white opacity-60 hover:opacity-100 transition-opacity"
          >
            Login
          </Link>
        ) : (
          <>
            {/* Settings Icon with Dropdown */}
            <div className="relative" ref={settingsRef}>
              <motion.button
                onClick={() => setShowSettingsMenu(!showSettingsMenu)}
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.95 }}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                aria-label="Settings"
              >
                <Settings className="w-5 h-5 text-black dark:text-white opacity-60 hover:opacity-100" />
              </motion.button>

              <AnimatePresence>
                {showSettingsMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 mt-2 w-48 bg-white dark:bg-zinc-900 rounded-2xl border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
                  >
                    <Link
                      to="/account-settings"
                      onClick={() => setShowSettingsMenu(false)}
                      className="block px-4 py-3 text-sm font-bold text-black dark:text-white hover:bg-gray-100 dark:hover:bg-white/5 transition-colors"
                    >
                      Account Settings
                    </Link>
                    <button
                      onClick={() => {
                        setShowSettingsMenu(false);
                        handleLogout();
                      }}
                      className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 transition-colors border-t border-gray-200 dark:border-white/10"
                    >
                      Logout
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}

        <div className="flex items-center gap-4 pl-6 border-l border-gray-200 dark:border-white/10">
          <span className="text-[10px] uppercase tracking-widest opacity-40 font-black hidden sm:block text-black dark:text-white">
            {darkMode ? 'Dark' : 'Light'}
          </span>

          <motion.button
            onClick={() => setDarkMode(!darkMode)}
            aria-label="Toggle Theme"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300"
          >
            <motion.svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              animate={{ rotate: darkMode ? 0 : 180 }}
              transition={{ duration: 0.5, ease: "easeInOut" }}
            >
              <motion.circle
                cx="12"
                cy="12"
                animate={{
                  r: darkMode ? 4 : 5,
                  fill: darkMode ? "#ffffff" : "#000000"
                }}
                transition={{ duration: 0.3 }}
              />
              <motion.rect x="11" y="1" width="2" rx="1" animate={{ height: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} transition={{ duration: 0.3 }} />
              <motion.rect animate={{ y: darkMode ? 20 : 18, height: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} x="11" width="2" rx="1" transition={{ duration: 0.3 }} />
              <motion.rect y="11" x="1" height="2" rx="1" animate={{ width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} transition={{ duration: 0.3 }} />
              <motion.rect animate={{ x: darkMode ? 20 : 18, width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} y="11" height="2" rx="1" transition={{ duration: 0.3 }} />
              <motion.rect animate={{ x: darkMode ? 17.5 : 16.5, y: darkMode ? 4.3 : 3.5, width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} height="2" rx="1" transform="rotate(45 19 5)" transition={{ duration: 0.3 }} />
              <motion.rect animate={{ x: darkMode ? 3.5 : 2.5, y: darkMode ? 4.3 : 3.5, width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} height="2" rx="1" transform="rotate(-45 5 5)" transition={{ duration: 0.3 }} />
              <motion.rect animate={{ x: darkMode ? 17.5 : 16.5, y: darkMode ? 17.7 : 16.5, width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} height="2" rx="1" transform="rotate(-45 19 19)" transition={{ duration: 0.3 }} />
              <motion.rect animate={{ x: darkMode ? 3.5 : 2.5, y: darkMode ? 17.7 : 16.5, width: darkMode ? 3 : 5, fill: darkMode ? "#ffffff" : "#000000" }} height="2" rx="1" transform="rotate(45 5 19)" transition={{ duration: 0.3 }} />
            </motion.svg>
            {darkMode && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 rounded-full" style={{ boxShadow: '0 0 20px rgba(255, 255, 255, 0.4), 0 0 40px rgba(255, 255, 255, 0.2)', filter: 'blur(8px)', zIndex: -1 }} />
            )}
          </motion.button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;