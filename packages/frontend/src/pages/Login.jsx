// Salva-Digital-Tech/packages/frontend/src/pages/Login.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import FloatingCoin from '../components/FloatingCoin';
import Stars from '../components/Stars';

// ── Mobile content-scale helpers ────────────────────────────────────────────
// Same pattern used across the app's chat widgets and Seller Mint Panel:
// container size (card padding/border-radius/width) is NOT touched here —
// only inner content (font sizes, gaps, input padding) scales down 30% under
// 640px via a CSS custom property, so it responds to real device width
// without any JS resize listeners.
const loginPx = (n) => `calc(${n}px * var(--login-scale, 1))`;
const loginPxs = (...vals) => vals.map((v) => (typeof v === 'number' ? loginPx(v) : v)).join(' ');

const LoginScaleStyle = () => (
  <style>{`
    .login-scale { --login-scale: 1; }
    @media (max-width: 639px) {
      .login-scale { --login-scale: 0.7; }
    }
  `}</style>
);

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [regStep, setRegStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState({ show: false, msg: '', type: '' });
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // ── Are we running inside the native (Play Store / App Store) app? ────────
  // On native, there's no marketing "Home" page to go back to — the app opens
  // straight into Login/Dashboard — so the link is only useful/valid on web.
  const isNativeApp = Capacitor.isNativePlatform();

  // ── Read referral code from URL ?ref=CODE ──────────────────────────────────
  const referredByCode =
    new URLSearchParams(location.search).get('ref')?.trim().toUpperCase() || null;

  useEffect(() => {
    // If there's a ref code, switch to register tab automatically
    if (referredByCode) setIsLogin(false);
  }, [referredByCode]);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('salva_user');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.safeAddress) {
          if (userData.ownerKey) {
            navigate('/set-transaction-pin', { replace: true });
          } else {
            navigate('/dashboard', { replace: true });
          }
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
    if (notif.show) {
      const t = setTimeout(() => setNotif({ ...notif, show: false }), 4000);
      return () => clearTimeout(t);
    }
  }, [notif]);

  const showMsg = (msg, type = 'success') => setNotif({ show: true, msg, type });
  const sanitizeInput = (input) =>
    typeof input !== 'string' ? '' : input.trim().replace(/[<>]/g, '');
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  const validateUsername = (username) => /^[a-zA-Z0-9_]{3,20}$/.test(username);

  const handleStartRegistration = async (e) => {
    e.preventDefault();
    const sanitizedEmail = sanitizeInput(formData.email);
    if (!validateEmail(sanitizedEmail)) return showMsg('Invalid email format', 'error');
    if (!validateUsername(sanitizeInput(formData.username)))
      return showMsg('Username must be 3-20 alphanumeric characters', 'error');
    if (!validatePassword(formData.password))
      return showMsg('Password must be 8+ chars with uppercase, lowercase, and number', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail }),
      });
      if (res.ok) {
        setRegStep(2);
        showMsg('Verification code sent to your email!');
      } else {
        const data = await res.json();
        showMsg(data.message || 'Failed to send code', 'error');
      }
    } catch {
      showMsg('Backend offline', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);

    if (!isLogin && regStep === 2) {
      if (!/^\d{6}$/.test(otp)) {
        setLoading(false);
        return showMsg('OTP must be 6 digits', 'error');
      }
      try {
        const verifyRes = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: sanitizeInput(formData.email),
            code: otp,
          }),
        });
        if (!verifyRes.ok) {
          setLoading(false);
          return showMsg('Invalid or expired code', 'error');
        }
      } catch {
        setLoading(false);
        return showMsg('Verification error', 'error');
      }
      showMsg('Code verified! Deploying your wallet...');
    }

    const endpoint = isLogin ? '/api/login' : '/api/register';
    try {
      const sanitizedData = {
        username: sanitizeInput(formData.username),
        email: sanitizeInput(formData.email),
        password: formData.password,
        // ── Include referral code on register ───────────────────────────────
        ...(!isLogin && referredByCode ? { referredByCode } : {}),
      };

      console.log(
        `📝 ${isLogin ? 'Login' : 'Register'} — referredByCode: ${referredByCode || 'none'}`
      );

      const response = await fetch(`${SALVA_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedData),
      });
      const data = await response.json();

      if (response.ok) {
        if (!data.safeAddress) throw new Error('Invalid server response');

        const userData = {
          username: sanitizeInput(data.username),
          email: sanitizeInput(formData.email),
          safeAddress: data.safeAddress,
          accountNumber: data.accountNumber || null,
          ownerKey: data.ownerPrivateKey,
          isValidator: data.isValidator || false,
          nameAlias: data.nameAlias || null,
          numberAlias: data.numberAlias || null,
        };
        localStorage.setItem('salva_user', JSON.stringify(userData));

        if (!isLogin) {
          showMsg('Wallet Deployed! Setting up security...');
          setTimeout(() => navigate('/set-transaction-pin'), 1500);
        } else {
          showMsg('Access Granted!');
          try {
            const pinStatusRes = await fetch(
              `${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(
                sanitizeInput(formData.email)
              )}`
            );
            const pinStatus = await pinStatusRes.json();
            if (!pinStatus.hasPin) {
              setTimeout(() => navigate('/set-transaction-pin'), 1500);
            } else {
              const cleanUser = { ...userData };
              delete cleanUser.ownerKey;
              localStorage.setItem('salva_user', JSON.stringify(cleanUser));
              setTimeout(() => navigate('/dashboard'), 1500);
            }
          } catch {
            setTimeout(() => navigate('/set-transaction-pin'), 1500);
          }
        }
      } else {
        showMsg(data.message || 'Authentication failed', 'error');
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (!isLogin) {
        localStorage.removeItem('salva_user');
        showMsg('Wallet deployment failed. Please try again.', 'error');
        setRegStep(1);
        setOtp('');
      } else {
        showMsg('Backend offline', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth)
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <div className="text-salvaGold font-black text-2xl animate-pulse">LOADING...</div>
      </div>
    );

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white dark:bg-[#0A0A0B] transition-colors duration-500">
      <LoginScaleStyle />
      <Stars />
      <FloatingCoin x="10%" y="20%" size="100px" delay={0} blur="blur-sm" />
      <FloatingCoin x="80%" y="70%" size="150px" delay={1} blur="blur-md" />
      <FloatingCoin x="50%" y="10%" size="60px" delay={2} blur="none" />

      <AnimatePresence>
        {notif.show && (
          <motion.div
            initial={{ x: 400 }}
            animate={{ x: 0 }}
            exit={{ x: 400 }}
            className={`login-scale fixed z-[100] rounded-2xl border shadow-2xl ${
              notif.type === 'error'
                ? 'bg-red-500/20 border-red-500'
                : 'bg-zinc-900 border-salvaGold'
            }`}
            style={{ top: loginPx(40), right: loginPx(40), padding: loginPx(20) }}
          >
            <p className="font-bold text-white" style={{ fontSize: loginPx(14) }}>
              {notif.msg}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card container — width/padding/border-radius NEVER scaled. Only the
          .login-scale content inside responds to mobile. */}
      <motion.div className="login-scale z-10 w-full max-w-md p-10 rounded-[2.5rem] border border-gray-200 dark:border-white/10 bg-white/90 dark:bg-black/40 backdrop-blur-2xl shadow-2xl">
        {/* "Back to Home" only makes sense on web — the native app has no
            marketing home page, it opens straight into Login/Dashboard. */}
        {!isNativeApp && (
          <Link
            to="/"
            className="uppercase opacity-50 hover:opacity-100 flex items-center transition-opacity text-black dark:text-white font-bold"
            style={{
              fontSize: loginPx(12),
              letterSpacing: '0.1em',
              gap: loginPx(8),
              marginBottom: loginPx(32),
            }}
          >
            ← Back to Home
          </Link>
        )}
        <h2
          className="font-black text-black dark:text-white tracking-tighter"
          style={{ fontSize: loginPx(36), marginBottom: loginPx(8) }}
        >
          {isLogin ? 'Sign In' : 'Create Wallet'}
        </h2>
        {!isLogin && (
          <p
            className="text-salvaGold uppercase tracking-widest font-bold"
            style={{ fontSize: loginPx(10), marginBottom: loginPx(32) }}
          >
            {regStep === 1 ? 'Step 1: Account Details' : 'Step 2: Email Verification'}
          </p>
        )}
        {/* Show referral badge if coming from a referral link */}
        {!isLogin && referredByCode && (
          <div
            className="rounded-xl bg-salvaGold/10 border border-salvaGold/30 flex items-center"
            style={{ marginBottom: loginPx(16), padding: loginPxs(8, 16), gap: loginPx(8) }}
          >
            <span className="text-salvaGold" style={{ fontSize: loginPx(14) }}>
              🎁
            </span>
            <p className="font-black text-salvaGold" style={{ fontSize: loginPx(12) }}>
              Referred by: <span className="tracking-widest">{referredByCode}</span>
            </p>
          </div>
        )}
        {isLogin && <div style={{ marginBottom: loginPx(32) }} />}

        <form
          onSubmit={isLogin ? handleSubmit : regStep === 1 ? handleStartRegistration : handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: loginPx(16) }}
        >
          {isLogin || regStep === 1 ? (
            <>
              {!isLogin && (
                <input
                  type="text"
                  placeholder="Username"
                  value={formData.username}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      username: sanitizeInput(e.target.value),
                    })
                  }
                  required
                  maxLength={20}
                  pattern="[a-zA-Z0-9_]{3,20}"
                  className="w-full rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold"
                  style={{ padding: loginPx(16), fontSize: loginPx(16) }}
                />
              )}
              <input
                type="email"
                placeholder="Email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    email: sanitizeInput(e.target.value),
                  })
                }
                required
                className="w-full rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold"
                style={{ padding: loginPx(16), fontSize: loginPx(16) }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: loginPx(8) }}>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    minLength={8}
                    className="w-full rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold"
                    style={{
                      padding: loginPx(16),
                      paddingRight: loginPx(48),
                      fontSize: loginPx(16),
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-salvaGold transition-colors"
                  >
                    {showPassword ? (
                      <EyeOff style={{ width: loginPx(20), height: loginPx(20) }} />
                    ) : (
                      <Eye style={{ width: loginPx(20), height: loginPx(20) }} />
                    )}
                  </button>
                </div>
                {isLogin && (
                  <div className="flex justify-end px-1">
                    <Link
                      to="/forgot-password"
                      className="uppercase text-salvaGold/60 hover:text-salvaGold transition-colors font-bold tracking-widest"
                      style={{ fontSize: loginPx(10) }}
                    >
                      Forgot Password?
                    </Link>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div style={{ paddingTop: loginPx(16), paddingBottom: loginPx(16) }}>
              <label
                className="uppercase opacity-40 font-bold block text-center"
                style={{ fontSize: loginPx(10), marginBottom: loginPx(8) }}
              >
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                maxLength="6"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                pattern="\d{6}"
                className="w-full rounded-2xl bg-gray-100 dark:bg-white/5 border border-salvaGold text-center font-black outline-none text-black dark:text-white"
                style={{
                  padding: loginPx(16),
                  fontSize: loginPx(30),
                  letterSpacing: '0.5em',
                }}
              />
              <p
                className="opacity-40 text-center font-bold"
                style={{ fontSize: loginPx(10), marginTop: loginPx(12) }}
              >
                After verification, your wallet will be deployed automatically
              </p>
            </div>
          )}
          <button
            disabled={loading}
            type="submit"
            className="w-full rounded-2xl bg-salvaGold text-black font-black hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ padding: loginPx(20), fontSize: loginPx(14) }}
          >
            {loading
              ? !isLogin && regStep === 2
                ? 'DEPLOYING WALLET...'
                : 'WAITING...'
              : isLogin
              ? 'ACCESS WALLET'
              : regStep === 1
              ? 'SEND VERIFICATION'
              : 'VERIFY & DEPLOY'}
          </button>
        </form>

        <div
          className="flex flex-col items-center"
          style={{ marginTop: loginPx(24), gap: loginPx(16) }}
        >
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setRegStep(1);
              setOtp('');
            }}
            className="text-gray-600 dark:text-white/60 font-bold"
            style={{ fontSize: loginPx(14) }}
          >
            {isLogin ? 'New to Salva? ' : 'Already a citizen? '}
            <span className="text-salvaGold hover:underline">
              {isLogin ? 'Create Account' : 'Log In'}
            </span>
          </button>
          {isLogin && (
            <Link
              to="/forgot-password"
              className="uppercase opacity-40 hover:opacity-100 transition-opacity font-bold tracking-widest"
              style={{ fontSize: loginPx(10) }}
            >
              Forgot Password?
            </Link>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
