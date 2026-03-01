// Salva-Digital-Tech/packages/frontend/src/pages/SetTransactionPin.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Stars from '../components/Stars';

const SetTransactionPin = () => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (!savedUser) {
      navigate('/login');
      return;
    }
    
    try {
      const userData = JSON.parse(savedUser);
      setUser(userData);
    } catch (err) {
      navigate('/login');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
      setError('PIN must be exactly 4 digits');
      return;
    }

    if (pin !== confirmPin) {
      setError('PINs do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${SALVA_API_URL}/api/user/set-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email || user.username, // Use email if available
          pin: pin
        })
      });

      const data = await response.json();

      if (response.ok) {
        // PIN set successfully, navigate to dashboard
        navigate('/dashboard');
      } else {
        setError(data.message || 'Failed to set PIN');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white flex items-center justify-center px-4 relative overflow-hidden">
      <Stars />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md bg-white/90 dark:bg-black/40 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-gray-200 dark:border-white/10 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h2 className="text-3xl font-black mb-2">Set Transaction PIN</h2>
          <p className="text-sm opacity-60">Secure your wallet with a 4-digit PIN</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="text-xs uppercase opacity-40 font-bold mb-2 block">Enter PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength="4"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
              className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-2xl tracking-[1em] font-black"
            />
          </div>

          <div>
            <label className="text-xs uppercase opacity-40 font-bold mb-2 block">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength="4"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              required
              className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-2xl tracking-[1em] font-black"
            />
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded-xl text-sm font-bold text-center"
            >
              {error}
            </motion.div>
          )}

          <button
            type="submit"
            disabled={loading || !pin || !confirmPin}
            className="w-full py-5 rounded-2xl bg-salvaGold text-black font-black hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'SETTING PIN...' : 'CONFIRM & CONTINUE'}
          </button>
        </form>

        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
          <p className="text-xs text-center opacity-80">
            <span className="font-bold">Important:</span> Your PIN encrypts your private key. Never share it with anyone.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default SetTransactionPin;