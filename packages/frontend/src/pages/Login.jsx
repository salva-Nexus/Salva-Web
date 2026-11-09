// Salva-Digital-Tech/packages/frontend/src/pages/Login.jsx
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Fingerprint,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const EASE = [0.16, 1, 0.3, 1];

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [regStep, setRegStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({ username: '', email: '', password: '', pin: '' });
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState({ show: false, msg: '', type: '' });
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const reduce = useReducedMotion();
  const isNativeApp = Capacitor.isNativePlatform();
  const referralCode =
    new URLSearchParams(location.search).get('ref')?.trim().toUpperCase() || null;

  useEffect(() => {
    if (referralCode) setIsLogin(false);
  }, [referralCode]);

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('salva_user');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.safeAddress) {
          navigate(userData.ownerKey ? '/set-transaction-pin' : '/dashboard', { replace: true });
          return;
        }
      }
    } catch {
      localStorage.removeItem('salva_user');
    } finally {
      setCheckingAuth(false);
    }
  }, [navigate]);

  useEffect(() => {
    if (!notif.show) return undefined;
    const t = setTimeout(() => setNotif((n) => ({ ...n, show: false })), 4000);
    return () => clearTimeout(t);
  }, [notif.show, notif.msg]);

  const showMsg = (msg, type = 'success') => setNotif({ show: true, msg, type });
  const sanitizeInput = (input) =>
    typeof input !== 'string' ? '' : input.trim().replace(/[<>]/g, '');
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  const validateUsername = (username) => /^[a-zA-Z0-9_]{3,20}$/.test(username);

  const handleStartRegistration = async (e) => {
    e.preventDefault();
    const email = sanitizeInput(formData.email);
    if (!validateEmail(email)) return showMsg('Invalid email format', 'error');
    if (!validateUsername(sanitizeInput(formData.username)))
      return showMsg('Username must be 3–20 letters, numbers, or underscores', 'error');
    if (!validatePassword(formData.password))
      return showMsg(
        'Password must be 8+ characters with uppercase, lowercase, and a number',
        'error'
      );

    if (!/^\d{4}$/.test(formData.pin))
      return showMsg('Transaction PIN must be exactly 4 digits', 'error');

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setRegStep(2);
        showMsg('Verification code sent to your email');
      } else {
        const data = await res.json();
        showMsg(data.message || 'Failed to send verification code', 'error');
      }
    } catch {
      showMsg('Unable to reach Salva. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    if (!isLogin && regStep === 2) {
      if (!/^\d{6}$/.test(otp)) {
        setLoading(false);
        return showMsg('Enter the 6-digit verification code', 'error');
      }
      try {
        const verifyRes = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: sanitizeInput(formData.email), code: otp }),
        });
        if (!verifyRes.ok) {
          setLoading(false);
          return showMsg('Invalid or expired verification code', 'error');
        }
      } catch {
        setLoading(false);
        return showMsg('Could not verify the code. Check your connection.', 'error');
      }
      showMsg('Email verified. Setting up your wallet…');
    }

    const endpoint = isLogin ? '/api/user/login' : '/api/user/register';
    try {
      const sanitizedData = {
        username: sanitizeInput(formData.username),
        email: sanitizeInput(formData.email),
        password: formData.password,
        ...(!isLogin && referralCode ? { referralCode } : {}),
        ...(!isLogin ? { pin: formData.pin } : {}),
      };
      const response = await fetch(`${SALVA_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedData),
      });
      const data = await response.json();

      if (!response.ok) {
        showMsg(data.message || 'Authentication failed', 'error');
        return;
      }
      if (!data.safeAddress) throw new Error('Invalid server response');

      if (!isLogin) {
        const userData = {
          username: sanitizeInput(data.username),
          email: sanitizeInput(formData.email),
          safeAddress: data.safeAddress,
          isValidator: data.isValidator || false,
          nameAlias: data.nameAlias || null,
        };
        localStorage.setItem('salva_user', JSON.stringify(userData));
        showMsg('Wallet created');
        setTimeout(() => navigate('/dashboard'), 1000);
      } else {
        const userData = {
          username: sanitizeInput(data.username),
          email: sanitizeInput(formData.email),
          safeAddress: data.safeAddress,
          isValidator: data.isValidator || false,
          isSeller: data.isSeller || false,
          nameAlias: data.nameAlias || null,
        };
        localStorage.setItem('salva_user', JSON.stringify(userData));
        showMsg('Welcome back');
        try {
          const pinRes = await fetch(
            `${SALVA_API_URL}/api/user/base/status/${encodeURIComponent(
              sanitizeInput(formData.email)
            )}`
          );
          const pinStatus = await pinRes.json();
          setTimeout(
            () => navigate(!pinStatus.hasPin ? '/set-transaction-pin' : '/dashboard'),
            1000
          );
        } catch {
          setTimeout(() => navigate('/dashboard'), 1000);
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      if (!isLogin) {
        localStorage.removeItem('salva_user');
        showMsg('Wallet setup failed. Please try again.', 'error');
        setRegStep(1);
        setOtp('');
      } else {
        showMsg('Network error. Please try again.', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08090b] text-[#e8bd59]">
        <div className="animate-pulse text-sm font-black tracking-[0.35em]">SALVA</div>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-[#e8bd59]/70 focus:bg-white/[0.065] focus:ring-4 focus:ring-[#e8bd59]/[0.08]';
  const fieldLabel = 'mb-2 block text-xs font-semibold tracking-wide text-white/60';

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#08090b] px-4 py-8 text-white selection:bg-[#e8bd59]/30 sm:px-6">
      <Stars />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-40 top-[-10rem] h-[28rem] w-[28rem] rounded-full bg-[#e8bd59]/[0.09] blur-[120px]" />
        <div className="absolute -bottom-48 -right-24 h-[32rem] w-[32rem] rounded-full bg-indigo-500/[0.08] blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#08090b_75%)]" />
      </div>

      <AnimatePresence>
        {notif.show && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`fixed right-4 top-4 z-[100] max-w-sm rounded-xl border px-4 py-3 text-sm font-semibold shadow-2xl sm:right-6 ${
              notif.type === 'error'
                ? 'border-red-400/30 bg-red-950/95 text-red-100'
                : 'border-[#e8bd59]/30 bg-zinc-950/95 text-white'
            }`}
            role="status"
          >
            {notif.msg}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`@media (max-width: 639px) { .salva-login-card { zoom: 0.8; } }`}</style>
      <div className="salva-login-card relative z-10 grid w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-[#0d0f12]/90 shadow-[0_30px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl lg:min-h-[620px] lg:grid-cols-[1fr_0.88fr]">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-white/[0.07] bg-gradient-to-br from-[#17150f] via-[#101114] to-[#0b0c0e] p-10 lg:flex xl:p-12">
          <div className="pointer-events-none absolute -right-20 top-20 h-72 w-72 rounded-full bg-[#e8bd59]/10 blur-[90px]" />
          <div className="relative">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-black tracking-[0.25em] text-[#e8bd59]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#e8bd59]/25 bg-[#e8bd59]/10">
                <Wallet size={18} />
              </span>
              SALVA
            </Link>
            <div className="mt-24 max-w-md">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8bd59]/20 bg-[#e8bd59]/[0.07] px-3 py-1.5 text-xs font-semibold text-[#e8bd59]">
                <Sparkles size={13} /> Money, moving forward
              </div>
              <h1 className="text-5xl font-black leading-[1.02] tracking-[-0.06em] xl:text-6xl">
                Your money.
                <br />
                <span className="text-[#e8bd59]">Your on-chain</span>
                <br />
                world.
              </h1>
              <p className="mt-6 max-w-sm text-base leading-7 text-white/50">
                Send by name, swap supported assets, and explore a more connected financial
                experience.
              </p>
            </div>
          </div>
          <div className="relative flex items-center gap-3 border-t border-white/[0.08] pt-6 text-xs text-white/40">
            <ShieldCheck size={16} className="text-[#e8bd59]" />
            Built for a simpler way to use on-chain finance
          </div>
        </section>

        <section className="p-5 sm:p-8 md:p-10 lg:p-12">
          <div className="mb-8 flex items-center justify-between lg:mb-10">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm font-black tracking-[0.2em] text-[#e8bd59] lg:hidden"
            >
              <Wallet size={18} /> SALVA
            </Link>
            {!isNativeApp && (
              <Link
                to="/"
                className="ml-auto inline-flex items-center gap-2 text-xs font-semibold text-white/45 transition hover:text-white"
              >
                <ArrowLeft size={14} /> Back to home
              </Link>
            )}
          </div>

          <div className="mx-auto max-w-md">
            <div className="mb-7">
              <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-[#e8bd59]/20 bg-[#e8bd59]/10 text-[#e8bd59]">
                {isLogin ? <LockKeyhole size={20} /> : <Fingerprint size={20} />}
              </div>
              <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#e8bd59]">
                {isLogin ? 'Welcome back' : regStep === 1 ? 'Get started' : 'Verify your email'}
              </p>
              <h2 className="mt-2 text-3xl font-black tracking-[-0.045em] sm:text-4xl">
                {isLogin
                  ? 'Sign in to Salva'
                  : regStep === 1
                  ? 'Create your wallet'
                  : 'Check your inbox'}
              </h2>
              <p className="mt-3 text-sm leading-6 text-white/45">
                {isLogin
                  ? 'Access your wallet and continue where you left off.'
                  : regStep === 1
                  ? 'Set up your account in a few simple steps.'
                  : `Enter the 6-digit code sent to ${sanitizeInput(formData.email)}.`}
              </p>
            </div>

            {!isLogin && (
              <div className="mb-6 flex items-center gap-2">
                {[1, 2].map((step) => (
                  <div
                    key={step}
                    className={`h-1 flex-1 rounded-full ${
                      regStep >= step ? 'bg-[#e8bd59]' : 'bg-white/10'
                    }`}
                  />
                ))}
                <span className="ml-2 text-xs font-semibold text-white/40">
                  Step {regStep} of 2
                </span>
              </div>
            )}

            {!isLogin && referralCode && (
              <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#e8bd59]/20 bg-[#e8bd59]/[0.07] px-3 py-2.5 text-xs font-semibold text-[#e8bd59]">
                <CheckCircle2 size={15} /> Referred by{' '}
                <span className="tracking-wider">{referralCode}</span>
              </div>
            )}

            <form
              onSubmit={
                isLogin ? handleSubmit : regStep === 1 ? handleStartRegistration : handleSubmit
              }
              className="space-y-4"
            >
              {isLogin || regStep === 1 ? (
                <>
                  {!isLogin && (
                    <div>
                      <label className={fieldLabel}>Username</label>
                      <input
                        className={inputClass}
                        type="text"
                        placeholder="Choose a username"
                        value={formData.username}
                        onChange={(e) =>
                          setFormData({ ...formData, username: sanitizeInput(e.target.value) })
                        }
                        required
                        maxLength={20}
                        pattern="[a-zA-Z0-9_]{3,20}"
                        autoComplete="username"
                      />
                    </div>
                  )}
                  <div>
                    <label className={fieldLabel}>Email address</label>
                    <div className="relative">
                      <Mail
                        size={16}
                        className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                      />
                      <input
                        className={`${inputClass} pl-11`}
                        type="email"
                        placeholder="you@example.com"
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: sanitizeInput(e.target.value) })
                        }
                        required
                        autoComplete="email"
                      />
                    </div>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-xs font-semibold tracking-wide text-white/60">
                        Password
                      </label>
                      {isLogin && (
                        <Link
                          to="/forgot-password"
                          className="text-xs font-semibold text-[#e8bd59]/80 transition hover:text-[#e8bd59]"
                        >
                          Forgot password?
                        </Link>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        className={`${inputClass} pr-12`}
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        required
                        minLength={8}
                        autoComplete={isLogin ? 'current-password' : 'new-password'}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-white/35 transition hover:text-white"
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                    {!isLogin && (
                      <p className="mt-2 text-[11px] leading-5 text-white/35">
                        Use 8+ characters, including uppercase, lowercase, and a number.
                      </p>
                    )}
                  </div>
                  {!isLogin && (
                    <div>
                      <label className={fieldLabel}>Transaction PIN</label>
                      <input
                        className={`${inputClass} text-center tracking-[0.5em]`}
                        type="password"
                        inputMode="numeric"
                        maxLength={4}
                        placeholder="••••"
                        value={formData.pin}
                        onChange={(e) =>
                          setFormData({ ...formData, pin: e.target.value.replace(/\D/g, '') })
                        }
                        required
                        pattern="\d{4}"
                        autoComplete="off"
                      />
                      <p className="mt-2 text-[11px] leading-5 text-white/35">
                        4 digits. Authorizes your transactions and cannot be recovered if lost.
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <label className={fieldLabel}>6-digit verification code</label>
                  <input
                    className={`${inputClass} py-5 text-center text-2xl font-black tracking-[0.5em]`}
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    required
                    pattern="[0-9]{6}"
                    autoComplete="one-time-code"
                  />
                  <p className="mt-3 text-center text-xs text-white/35">
                    Your wallet setup begins after verification.
                  </p>
                </div>
              )}

              <button
                disabled={loading}
                type="submit"
                className="group mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#e8bd59] px-5 py-4 text-sm font-black text-[#17140b] shadow-lg shadow-[#e8bd59]/10 transition hover:bg-[#f0ca72] focus:outline-none focus:ring-4 focus:ring-[#e8bd59]/20 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'PLEASE WAIT…'
                  : isLogin
                  ? 'Sign in'
                  : regStep === 1
                  ? 'Send verification code'
                  : 'Verify & create wallet'}
                {!loading && (
                  <ArrowUpRight
                    size={17}
                    className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                )}
              </button>
            </form>

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={() => {
                  setIsLogin((v) => !v);
                  setRegStep(1);
                  setOtp('');
                }}
                className="text-sm text-white/45 transition hover:text-white"
              >
                {isLogin ? 'New to Salva?' : 'Already have an account?'}{' '}
                <span className="font-bold text-[#e8bd59]">
                  {isLogin ? 'Create an account' : 'Sign in'}
                </span>
              </button>
            </div>

            <div className="mt-8 flex items-center justify-center gap-2 border-t border-white/[0.07] pt-5 text-[11px] text-white/30">
              <ShieldCheck size={14} /> Keep your account details private
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export default Login;
