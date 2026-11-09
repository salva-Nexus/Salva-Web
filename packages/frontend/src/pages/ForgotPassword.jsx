// Salva-Digital-Tech/packages/frontend/src/pages/ForgotPassword.jsx
import { SALVA_API_URL } from '../config';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Stars from '../components/Stars';

const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [otp, setOtp] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);


  const navigate = useNavigate();

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setMessage({ text: '', type: '' });
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return setMessage({
          text: data.message || 'Failed to send verification code',
          type: 'error',
        });
      }
      setOtp('');
      setStep(2);
      setMessage({ text: 'Verification code sent to your email.', type: 'success' });
    } catch {
      setMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      return setMessage({ text: 'Enter the 6-digit verification code', type: 'error' });
    }
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      if (!res.ok) {
        return setMessage({ text: 'Invalid or expired verification code', type: 'error' });
      }
      setStep(3);
      setMessage({ text: 'Email verified. Set your new password.', type: 'success' });
    } catch {
      setMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setMessage({ text: 'Passwords do not match!', type: 'error' });
    }

    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return setMessage({
        text: 'Password must be 8+ characters with uppercase, lowercase, and number',
        type: 'error',
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/data/update-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword }),
      });

      const data = await res.json();

      if (res.ok && data.status) {
        setMessage({
          text: 'Password reset successful! Redirecting...',
          type: 'success',
        });
        setTimeout(() => navigate('/login'), 3000);
      } else {
        setMessage({
          text: data.message || 'Failed to update password.',
          type: 'error',
        });
      }
    } catch (err) {
      console.error('Reset error:', err);
      setMessage({ text: 'Network error. Please try again.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center px-4 relative overflow-hidden">
      <Stars />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl p-8 rounded-[2.5rem] border border-white/10 relative z-10"
      >
        <h2 className="text-3xl font-black mb-2 tracking-tighter">RESET PASSWORD</h2>
        <p className="text-xs text-salvaGold uppercase tracking-[0.3em] font-bold mb-8">
          {step === 1 && 'Identify your account'}
          {step === 2 && 'Verify your email'}
          {step === 3 && 'Secure your vault'}
        </p>

        <form
          onSubmit={
            step === 1 ? handleEmailSubmit : step === 2 ? handleVerifyOtp : handleResetPassword
          }
          className="space-y-6"
        >
          {step === 1 && (
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                Email Address
              </label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold transition-all"
                placeholder="charlie@salva.com"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                6-digit verification code sent to {email}
              </label>
              <input
                required
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className="w-full p-4 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-black text-center text-2xl tracking-[0.5em]"
                placeholder="000000"
                autoComplete="one-time-code"
              />
            </div>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                  New Password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full p-4 pr-12 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-salvaGold transition-colors"
                  >
                    {showNewPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full p-4 pr-12 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-salvaGold transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            disabled={loading}
            className="w-full py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 transition-all uppercase tracking-widest text-sm"
          >
            {loading
              ? 'Processing...'
              : step === 1
              ? 'Continue'
              : step === 2
              ? 'Verify Code'
              : 'Update Password'}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link
            to="/login"
            className="text-[10px] uppercase opacity-40 hover:opacity-100 transition-opacity font-bold"
          >
            Back to Login
          </Link>
        </div>

        <AnimatePresence>
          {message.text && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className={`mt-4 text-[10px] uppercase font-bold text-center ${
                message.type === 'error' ? 'text-red-500' : 'text-salvaGold'
              }`}
            >
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};

export default ForgotPassword;
