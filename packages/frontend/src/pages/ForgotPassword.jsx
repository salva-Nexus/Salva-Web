// Salva-Digital-Tech/packages/frontend/src/pages/ForgotPassword.jsx
import { SALVA_API_URL } from '../config';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import Stars from '../components/Stars';

const ForgotPassword = () => {
  const [step, setStep] = useState(1); // 1: Email, 2: OTP, 3: New Password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showWarning, setShowWarning] = useState(false); // ✅ NEW STATE
  
  const navigate = useNavigate();

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      if (res.ok) {
        setStep(2);
        setMessage({ text: 'Verification code sent to your email!', type: 'success' });
      } else {
        setMessage({ text: 'User not found or error sending email.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Network error. Is the backend running?', type: 'error' });
    }
    setLoading(false);
  };

  // ✅ ENHANCED - Show warning instead of directly proceeding
  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp })
      });
      if (res.ok) {
        // ✅ Show warning instead of directly going to step 3
        setShowWarning(true);
        setMessage({ text: 'Code verified!', type: 'success' });
      } else {
        setMessage({ text: 'Invalid or expired code.', type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'Verification failed.', type: 'error' });
    }
    setLoading(false);
  };

  // ✅ NEW FUNCTION - Handle proceeding after warning acceptance
  const handleProceedToReset = () => {
    setShowWarning(false);
    setStep(3);
    setMessage({ text: 'Set your new password.', type: 'success' });
  };

  // ✅ FIXED - Added response parsing and validation
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return setMessage({ text: 'Passwords do not match!', type: 'error' });
    }

    // ✅ Validate password strength
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(newPassword)) {
      return setMessage({ 
        text: 'Password must be 8+ characters with uppercase, lowercase, and number', 
        type: 'error' 
      });
    }

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, newPassword })
      });

      const data = await res.json(); // ✅ FIX: Actually parse the response

      if (res.ok) {
        setMessage({ 
          text: 'Password reset successful! Account locked for 24 hours. Redirecting...', 
          type: 'success' 
        });
        setTimeout(() => navigate('/login'), 3000);
      } else {
        // ✅ FIX: Show actual error message from backend
        setMessage({ text: data.message || 'Failed to update password.', type: 'error' });
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
          {step === 1 && "Identify your account"}
          {step === 2 && "Check your inbox"}
          {step === 3 && "Secure your vault"}
        </p>

        <form onSubmit={step === 1 ? handleSendOTP : step === 2 ? handleVerifyOTP : handleResetPassword} className="space-y-6">
          {step === 1 && (
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">Email Address</label>
              <input 
                required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full p-4 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold transition-all"
                placeholder="charlie@salva.com"
              />
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">6-Digit Code</label>
              <input 
                required type="text" maxLength="6" value={otp} onChange={(e) => setOtp(e.target.value)}
                className="w-full p-4 rounded-2xl bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold text-center text-2xl tracking-[0.5em]"
                placeholder="000000"
              />
            </div>
          )}

          {step === 3 && (
            <>
              <div>
                <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">New Password</label>
                <div className="relative">
                  <input 
                    required 
                    type={showNewPassword ? "text" : "password"} 
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
                <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">Confirm Password</label>
                <div className="relative">
                  <input 
                    required 
                    type={showConfirmPassword ? "text" : "password"} 
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
            {loading ? "Processing..." : step === 1 ? "Send Code" : step === 2 ? "Verify Code" : "Update Password"}
          </button>
        </form>

        <div className="mt-8 text-center">
          <Link to="/login" className="text-[10px] uppercase opacity-40 hover:opacity-100 transition-opacity font-bold">
            Back to Login
          </Link>
        </div>

        <AnimatePresence>
          {message.text && (
            <motion.p 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className={`mt-4 text-[10px] uppercase font-bold text-center ${message.type === 'error' ? 'text-red-500' : 'text-salvaGold'}`}
            >
              {message.text}
            </motion.p>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ✅ WARNING MODAL */}
      <AnimatePresence>
        {showWarning && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div 
              onClick={() => setShowWarning(false)} 
              className="absolute inset-0 bg-black/95 backdrop-blur-md" 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }} 
            />
            <motion.div 
              onClick={(e) => e.stopPropagation()} 
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl z-10" 
              initial={{ opacity: 0, scale: 0.95 }} 
              animate={{ opacity: 1, scale: 1 }} 
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <h3 className="text-2xl font-black mb-4 text-black dark:text-white">⚠️ Security Warning</h3>
              <p className="text-sm opacity-80 mb-6 text-gray-700 dark:text-gray-300">
                Changing your password will <strong className="text-salvaGold">lock your account for 24 hours</strong>. 
                You won't be able to perform any transactions during this period.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowWarning(false)} 
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5 text-black dark:text-white"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleProceedToReset} 
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110"
                >
                  OK, PROCEED
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ForgotPassword;