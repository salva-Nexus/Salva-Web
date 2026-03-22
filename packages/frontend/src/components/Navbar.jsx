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

      <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
        <img
          src="/salva-logo.png"
          alt="Salva"
          style={{ width: '80px', height: '80px', objectFit: 'contain', display: 'block', flexShrink: 0 }}
        />
        <span className="text-1.5xl font-black tracking-tighter text-black dark:text-white">
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
                    onClick={() => { setShowSettingsMenu(false); handleLogout(); }}
                    className="w-full text-left px-4 py-3 text-sm font-bold text-red-500 hover:bg-red-500/10 transition-colors border-t border-gray-200 dark:border-white/10"
                  >
                    Logout
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
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
                animate={{ r: darkMode ? 4 : 5, fill: darkMode ? "#ffffff" : "#000000" }}
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
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 rounded-full"
                style={{ boxShadow: '0 0 20px rgba(255,255,255,0.4), 0 0 40px rgba(255,255,255,0.2)', filter: 'blur(8px)', zIndex: -1 }}
              />
            )}
          </motion.button>
        </div>
      </div>

    </nav>
  );
};

export default Navbar;