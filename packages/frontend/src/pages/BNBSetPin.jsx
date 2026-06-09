// src/pages/BNBSetPin.jsx — identical to SetTransactionPin.jsx but uses /api/bnb/* and bnb_user
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const BNBSetPin = ({ onPinSet }) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = localStorage.getItem('bnb_user');
    const baseRaw = localStorage.getItem('salva_user');
    if (!saved || !baseRaw) {
      navigate('/bnb');
      return;
    }
    try {
      const u = JSON.parse(saved);
      const base = JSON.parse(baseRaw);
      if (!u.safeAddress) {
        navigate('/bnb');
        return;
      }
      // Ensure email is always present (comes from base account)
      if (!u.email && base.email) u.email = base.email;
      setUser(u);
    } catch {
      navigate('/bnb');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) return setError('PIN must be exactly 4 digits');
    if (pin !== confirmPin) return setError('PINs do not match');
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/bnb/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const data = await res.json();
      if (res.ok) {
        const updated = { ...user };
        delete updated.ownerPrivateKey;
        updated.transactionPin = true;
        localStorage.setItem('bnb_user', JSON.stringify(updated));
        if (onPinSet) {
          onPinSet();
        } else {
          navigate('/bnb');
        }
      } else {
        setError(data.message || 'Failed to set PIN');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center px-4 relative overflow-hidden">
      <Stars />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md bg-black/40 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent mb-8" />
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500/10 border border-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h2 className="text-2xl font-black mb-2">Set BNB Transaction PIN</h2>
          <p className="text-sm text-white/60">Secure your BNB Chain wallet with a 4-digit PIN</p>
          <div className="mt-3 p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <p className="text-[11px] text-blue-400 font-bold">
              ⚡ Recommendation: Use the same PIN as your Base wallet to avoid confusion.
            </p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs uppercase opacity-40 font-bold mb-2 block tracking-widest">
              Enter PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength="4"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              autoFocus
              required
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-center text-2xl tracking-[1em] font-black"
            />
          </div>
          <div>
            <label className="text-xs uppercase opacity-40 font-bold mb-2 block tracking-widest">
              Confirm PIN
            </label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength="4"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
              className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-center text-2xl tracking-[1em] font-black"
            />
          </div>
          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-xl text-sm font-bold text-center"
            >
              {error}
            </motion.div>
          )}
          <button
            type="submit"
            disabled={loading || pin.length !== 4 || confirmPin.length !== 4}
            className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50"
            style={{ background: '#3b82f6', color: '#fff' }}
          >
            {loading ? 'SECURING BNB WALLET…' : 'CONFIRM & ENTER BNB DASHBOARD'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default BNBSetPin;
