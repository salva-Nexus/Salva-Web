// Salva-Digital-Tech/packages/frontend/src/pages/Login.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import FloatingCoin from '../components/FloatingCoin';
import Stars from '../components/Stars';

const Login = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [regStep, setRegStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({ username: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [notif, setNotif] = useState({ show: false, msg: '', type: '' });
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const savedUser = localStorage.getItem('salva_user');
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        if (userData.safeAddress && userData.ownerKey) {
          navigate('/dashboard', { replace: true });
          return;
        }
      }
    } catch (_) { localStorage.removeItem('salva_user'); }
    finally { setCheckingAuth(false); }
  }, [navigate]);

  useEffect(() => {
    if (notif.show) {
      const t = setTimeout(() => setNotif({ ...notif, show: false }), 4000);
      return () => clearTimeout(t);
    }
  }, [notif]);

  const showMsg = (msg, type = 'success') => setNotif({ show: true, msg, type });
  const sanitizeInput = (input) => typeof input !== 'string' ? '' : input.trim().replace(/[<>]/g, '');
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (password) => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password);
  const validateUsername = (username) => /^[a-zA-Z0-9_]{3,20}$/.test(username);

  const handleStartRegistration = async (e) => {
    e.preventDefault();
    const sanitizedEmail = sanitizeInput(formData.email);
    if (!validateEmail(sanitizedEmail)) return showMsg("Invalid email format", "error");
    if (!validateUsername(sanitizeInput(formData.username))) return showMsg("Username must be 3-20 alphanumeric characters", "error");
    if (!validatePassword(formData.password)) return showMsg("Password must be 8+ chars with uppercase, lowercase, and number", "error");
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: sanitizedEmail })
      });
      if (res.ok) { setRegStep(2); showMsg("Verification code sent to your email!"); }
      else { const data = await res.json(); showMsg(data.message || "Failed to send code", "error"); }
    } catch { showMsg("Backend offline", "error"); }
    finally { setLoading(false); }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);

    if (!isLogin && regStep === 2) {
      if (!/^\d{6}$/.test(otp)) { setLoading(false); return showMsg("OTP must be 6 digits", "error"); }
      try {
        const verifyRes = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: sanitizeInput(formData.email), code: otp })
        });
        if (!verifyRes.ok) { setLoading(false); return showMsg("Invalid or expired code", "error"); }
      } catch { setLoading(false); return showMsg("Verification error", "error"); }
    }

    const endpoint = isLogin ? '/api/login' : '/api/register';
    try {
      const sanitizedData = {
        username: sanitizeInput(formData.username),
        email: sanitizeInput(formData.email),
        password: formData.password
      };
      const response = await fetch(`${SALVA_API_URL}${endpoint}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedData)
      });
      const data = await response.json();

      if (response.ok) {
        if (!data.safeAddress || !data.accountNumber || !data.ownerPrivateKey) throw new Error('Invalid server response');
        const userData = {
          username: sanitizeInput(data.username),
          email: sanitizeInput(formData.email),
          safeAddress: data.safeAddress,
          accountNumber: data.accountNumber,
          ownerKey: data.ownerPrivateKey,
          isValidator: data.isValidator || false,
          nameAlias: data.nameAlias || null,
          numberAlias: data.numberAlias || null,
        };
        localStorage.setItem('salva_user', JSON.stringify(userData));
        showMsg(isLogin ? "Access Granted!" : "Wallet Deployed!");

        try {
          const pinStatusRes = await fetch(`${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(sanitizeInput(formData.email))}`);
          const pinStatus = await pinStatusRes.json();
          if (!pinStatus.hasPin && !isLogin) {
            setTimeout(() => navigate('/set-transaction-pin'), 1500);
          } else {
            setTimeout(() => navigate('/dashboard'), 1500);
          }
        } catch {
          setTimeout(() => navigate('/dashboard'), 1500);
        }
      } else {
        showMsg(data.message || "Authentication failed", "error");
      }
    } catch (err) {
      console.error('Auth error:', err);
      showMsg("Backend offline", "error");
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
      <div className="text-salvaGold font-black text-2xl animate-pulse">LOADING...</div>
    </div>
  );

  return (
    <div className="relative min-h-screen flex items-center justify-center overflow-hidden bg-white dark:bg-[#0A0A0B] transition-colors duration-500">
      <Stars />
      <FloatingCoin x="10%" y="20%" size="100px" delay={0} blur="blur-sm" />
      <FloatingCoin x="80%" y="70%" size="150px" delay={1} blur="blur-md" />
      <FloatingCoin x="50%" y="10%" size="60px" delay={2} blur="none" />

      <AnimatePresence>
        {notif.show && (
          <motion.div initial={{ x: 400 }} animate={{ x: 0 }} exit={{ x: 400 }}
            className={`fixed top-10 right-10 z-[100] p-5 rounded-2xl border shadow-2xl ${notif.type === 'error' ? 'bg-red-500/20 border-red-500' : 'bg-zinc-900 border-salvaGold'}`}>
            <p className="text-sm font-bold text-white">{notif.msg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div className="z-10 w-full max-w-md p-10 rounded-[2.5rem] border border-gray-200 dark:border-white/10 bg-white/90 dark:bg-black/40 backdrop-blur-2xl shadow-2xl">
        <Link to="/" className="text-xs uppercase tracking-widest opacity-50 hover:opacity-100 flex items-center gap-2 mb-8 transition-opacity text-black dark:text-white font-bold">← Back to Home</Link>
        <h2 className="text-4xl font-black mb-2 text-black dark:text-white tracking-tighter">{isLogin ? 'Sign In' : 'Create Wallet'}</h2>
        {!isLogin && (
          <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-8">
            {regStep === 1 ? "Step 1: Account Details" : "Step 2: Email Verification"}
          </p>
        )}
        {isLogin && <div className="mb-8" />}

        <form onSubmit={isLogin ? handleSubmit : (regStep === 1 ? handleStartRegistration : handleSubmit)} className="space-y-4">
          {isLogin || regStep === 1 ? (
            <>
              {!isLogin && (
                <input type="text" placeholder="Username" value={formData.username}
                  onChange={(e) => setFormData({ ...formData, username: sanitizeInput(e.target.value) })}
                  required maxLength={20} pattern="[a-zA-Z0-9_]{3,20}"
                  className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold" />
              )}
              <input type="email" placeholder="Email" value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: sanitizeInput(e.target.value) })}
                required className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold" />
              <div className="space-y-2">
                <div className="relative">
                  <input type={showPassword ? "text" : "password"} placeholder="Password"
                    value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required minLength={8}
                    className="w-full p-4 pr-12 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-black dark:text-white font-bold" />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-salvaGold transition-colors">
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {isLogin && (
                  <div className="flex justify-end px-1">
                    <Link to="/forgot-password" className="text-[10px] uppercase text-salvaGold/60 hover:text-salvaGold transition-colors font-bold tracking-widest">Forgot Password?</Link>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="py-4">
              <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block text-center">Enter 6-Digit Code</label>
              <input type="text" maxLength="6" placeholder="000000" value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))} required pattern="\d{6}"
                className="w-full p-4 rounded-2xl bg-gray-100 dark:bg-white/5 border border-salvaGold text-center text-3xl tracking-[0.5em] font-black outline-none text-black dark:text-white" />
            </div>
          )}
          <button disabled={loading} type="submit"
            className="w-full py-5 rounded-2xl bg-salvaGold text-black font-black hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 disabled:opacity-50 disabled:cursor-not-allowed">
            {loading ? 'WAITING...' : isLogin ? 'ACCESS WALLET' : (regStep === 1 ? 'SEND VERIFICATION' : 'VERIFY & DEPLOY')}
          </button>
        </form>

        <div className="mt-6 flex flex-col items-center gap-4">
          <button onClick={() => { setIsLogin(!isLogin); setRegStep(1); setOtp(''); }} className="text-sm text-gray-600 dark:text-white/60 font-bold">
            {isLogin ? "New to Salva? " : "Already a citizen? "}
            <span className="text-salvaGold hover:underline">{isLogin ? 'Create Account' : 'Log In'}</span>
          </button>
          {isLogin && <Link to="/forgot-password" className="text-[10px] uppercase opacity-40 hover:opacity-100 transition-opacity font-bold tracking-widest">Forgot Password?</Link>}
        </div>
      </motion.div>
    </div>
  );
};

export default Login;