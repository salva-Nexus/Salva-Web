import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Layers3, History, Settings, LogIn, LogOut, BarChart3 } from 'lucide-react';
import { motion } from 'framer-motion';

const NAV_ITEMS = [
  {
    label: 'Home',
    shortLabel: 'Home',
    icon: Home,
    path: '/dashboard',
  },
  {
    label: 'Services',
    shortLabel: 'Services',
    icon: Layers3,
    path: '/services',
  },
  {
    label: 'History',
    shortLabel: 'History',
    icon: History,
    path: '/transactions',
  },
  {
    label: 'Settings',
    shortLabel: 'Settings',
    icon: Settings,
    path: '/account-settings',
  },
];

const VALIDATOR_NAV_ITEM = {
  label: 'Stats',
  shortLabel: 'Stats',
  icon: BarChart3,
  path: '/stats',
};

const Navbar = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isValidator, setIsValidator] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');

    if (!savedUser) {
      setIsLoggedIn(false);
      setIsValidator(false);
      return;
    }

    try {
      const user = JSON.parse(savedUser);

      if (user?.username && user?.safeAddress) {
        setIsLoggedIn(true);
        setIsValidator(Boolean(user.isValidator));
      } else {
        localStorage.removeItem('salva_user');
        setIsLoggedIn(false);
        setIsValidator(false);
      }
    } catch {
      localStorage.removeItem('salva_user');
      setIsLoggedIn(false);
      setIsValidator(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('salva_user');
    setIsLoggedIn(false);
    navigate('/');
  };

  // Validators get a 5th tab on mobile. Desktop keeps its dedicated
  // Stats button, so this list is mobile-only.
  const mobileNavItems = isValidator ? [...NAV_ITEMS, VALIDATOR_NAV_ITEM] : NAV_ITEMS;

  // Tailwind can't see interpolated class names, so both variants are literal.
  const mobileGridClass = isValidator ? 'grid grid-cols-6 gap-0.5' : 'grid grid-cols-5 gap-1';

  const path = location.pathname;

  // No navbar on Home or Login
  if (path === '/' || path === '/login') return null;

  if (!isLoggedIn) {
    // Logged-out nav only shows on public pages
    if (path !== '/' && path !== '/login') return null;

    return (
      <nav className="salva-nav fixed top-0 left-0 right-0 z-[100] px-4 py-4">
        <div className="max-w-6xl mx-auto flex justify-end">
          <button
            onClick={() => navigate(path === '/login' ? '/' : '/login')}
            className="
              flex items-center gap-2
              px-4 py-2.5
              rounded-2xl
              border border-white/[0.08]
              bg-[#111113]/80
              backdrop-blur-xl
              text-xs font-black
              text-white/70
              hover:text-white
              hover:border-white/[0.16]
              transition-all
            "
          >
            <LogIn className="w-4 h-4" />
            {path === '/login' ? 'Home' : 'Login'}
          </button>
        </div>
      </nav>
    );
  }

  // Logged-in nav is shown ONLY on the Dashboard. Every other page
  // (Services included) is navbar-free and must supply its own way back.
  if (path !== '/dashboard') return null;

  return (
    <>
      {/* =========================================================
          DESKTOP NAV
         ========================================================= */}
      <nav className="salva-nav hidden md:block fixed top-0 left-0 right-0 z-[100] px-6 py-5 pointer-events-none">
        <div
          className="
            max-w-5xl mx-auto
            flex items-center justify-center
            pointer-events-auto
          "
        >
          <div
            className="
              flex items-center gap-1
              p-1.5
              rounded-[22px]
              border border-white/[0.08]
              bg-[#101012]/85
              backdrop-blur-2xl
              shadow-[0_20px_60px_rgba(0,0,0,.35)]
            "
          >
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink key={item.path} to={item.path} className="relative">
                  {({ isActive }) => (
                    <div
                      className={`
                        relative
                        flex items-center gap-2
                        px-5 py-2.5
                        rounded-[16px]
                        text-xs font-black
                        transition-all duration-200
                        ${isActive ? 'text-white' : 'text-white/40 hover:text-white/75'}
                      `}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="desktop-nav-active"
                          className="
                            absolute inset-0
                            rounded-[16px]
                            bg-white/[0.07]
                            border border-white/[0.07]
                          "
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}

                      <Icon
                        className={`
                          relative z-10 w-4 h-4
                          ${isActive ? 'text-salvaGold' : 'text-white/40'}
                        `}
                        strokeWidth={2}
                      />

                      <span className="relative z-10">{item.label}</span>
                    </div>
                  )}
                </NavLink>
              );
            })}

            {isValidator && (
              <button
                onClick={() => navigate('/stats')}
                className="
                  ml-1
                  flex items-center gap-2
                  px-4 py-2.5
                  rounded-[16px]
                  text-xs font-black
                  text-salvaGold/60
                  hover:text-salvaGold
                  hover:bg-salvaGold/[0.05]
                  transition-all
                "
              >
                <BarChart3 className="w-4 h-4" />
                Stats
              </button>
            )}

            <div className="w-px h-6 bg-white/[0.07] mx-1" />

            <button
              onClick={handleLogout}
              className="
                px-3 py-2.5
                rounded-[16px]
                text-[10px]
                font-black
                uppercase
                tracking-widest
                text-white/25
                hover:text-red-400
                transition-colors
              "
            >
              Log Out
            </button>
          </div>
        </div>
      </nav>

      {/* =========================================================
          MOBILE NAV
         ========================================================= */}
      <nav
        className="
          salva-nav
          md:hidden
          fixed
          bottom-0
          left-0
          right-0
          z-[100]
          px-3
          pb-[calc(10px+env(safe-area-inset-bottom))]
          pt-2
          pointer-events-none
        "
      >
        <div
          className="
            max-w-md mx-auto
            pointer-events-auto
            p-1.5
            rounded-[24px]
            border border-white/[0.09]
            bg-[#101012]/90
            backdrop-blur-2xl
            shadow-[0_-15px_50px_rgba(0,0,0,.45)]
          "
        >
          <div className={mobileGridClass}>
            {mobileNavItems.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink key={item.path} to={item.path} className="relative">
                  {({ isActive }) => (
                    <div
                      className={`
                        relative
                        h-[58px]
                        rounded-[18px]
                        flex flex-col
                        items-center
                        justify-center
                        gap-1
                        transition-all
                        ${isActive ? 'text-white' : 'text-white/35'}
                      `}
                    >
                      {isActive && (
                        <motion.div
                          layoutId="mobile-nav-active"
                          className="
                            absolute inset-0
                            rounded-[18px]
                            bg-white/[0.07]
                            border border-white/[0.06]
                          "
                          transition={{
                            type: 'spring',
                            stiffness: 400,
                            damping: 30,
                          }}
                        />
                      )}

                      <Icon
                        className={`
                          relative z-10
                          ${isValidator ? 'w-[17px] h-[17px]' : 'w-[19px] h-[19px]'}
                          ${isActive ? 'text-salvaGold' : 'text-white/35'}
                        `}
                        strokeWidth={isActive ? 2.3 : 1.8}
                      />

                      <span
                        className={`
                          relative z-10
                          ${isValidator ? 'text-[8px] tracking-normal' : 'text-[9px] tracking-wide'}
                          font-black
                          ${isActive ? 'text-white' : 'text-white/35'}
                        `}
                      >
                        {item.shortLabel}
                      </span>

                      {isActive && (
                        <motion.span
                          layoutId="mobile-nav-dot"
                          className="
                            absolute
                            bottom-1
                            w-1
                            h-1
                            rounded-full
                            bg-salvaGold
                          "
                        />
                      )}
                    </div>
                  )}
                </NavLink>
              );
            })}

            <button
              onClick={handleLogout}
              className="
                relative
                h-[58px]
                rounded-[18px]
                flex flex-col
                items-center
                justify-center
                gap-1
                text-white/35
                active:text-red-400
                hover:text-red-400
                transition-all
              "
            >
              <LogOut
                className={isValidator ? 'w-[17px] h-[17px]' : 'w-[19px] h-[19px]'}
                strokeWidth={1.8}
              />
              <span
                className={`font-black ${
                  isValidator ? 'text-[8px] tracking-normal' : 'text-[9px] tracking-wide'
                }`}
              >
                Log Out
              </span>
            </button>
          </div>
        </div>
      </nav>
    </>
  );
};

export default Navbar;
