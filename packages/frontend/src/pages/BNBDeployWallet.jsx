// src/pages/BNBDeployWallet.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const BNBDeployWallet = ({ user, onDeployed }) => {
  const [step, setStep] = useState('pin'); // 'pin' | 'deploying'
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  const handleDeploy = async () => {
    if (pin.length !== 4) {
      setPinError('PIN must be 4 digits');
      return;
    }
    setPinError('');
    setError('');
    setDeploying(true);
    setStep('deploying');
    try {
      // 1. Verify Base PIN first — this gives us the decrypted private key
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        setPinError(pinData.message || 'Invalid PIN');
        setStep('pin');
        setDeploying(false);
        return;
      }

      // 2. Deploy BNB Safe — backend generates fresh keypair, PIN is passed so
      //    backend can encrypt the BNB private key with the same PIN as Base.
      const res = await fetch(`${SALVA_API_URL}/api/bnb/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Deployment failed');

      // username always from Base user — single source of truth
      const bnbUser = {
        username: user.username,
        email: user.email,
        safeAddress: data.safeAddress,
        nameAlias: null,
        isSeller: false,
      };
      localStorage.setItem('bnb_user', JSON.stringify(bnbUser));
      onDeployed(bnbUser);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS')) {
        setError('Network temporarily unavailable. Please try again shortly.');
      } else if (msg.includes('already deployed') || msg.includes('already registered')) {
        setError('Wallet already deployed. Refresh the page.');
      } else if (msg.includes('No Salva account')) {
        setError('No Salva account found. Please register first.');
      } else {
        setError(msg || 'Deployment failed. Please try again.');
      }
      setStep('pin');
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center px-4 relative overflow-hidden">
      <Stars />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full max-w-md bg-black/40 backdrop-blur-2xl p-10 rounded-[2.5rem] border border-white/10 shadow-2xl"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent mb-8" />

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <img
              src="https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png"
              className="w-9 h-9 rounded-full"
              alt="BNB"
            />
          </div>
          <h2 className="text-2xl font-black mb-2">Deploy BNB Chain Wallet</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            Create your Salva smart account on BNB Chain using your existing Salva PIN.
          </p>
        </div>

        {step === 'pin' && (
          <>
            <div className="mb-6 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/15">
              <p className="text-xs text-blue-400 font-black mb-1">🔐 Secured with your Base PIN</p>
              <p className="text-[11px] text-white/60 leading-relaxed">
                Your BNB wallet will use the <strong className="text-white">same transaction PIN</strong> as your Base wallet. The wallet addresses differ per chain — this is standard multi-chain behaviour.
              </p>
            </div>

            <div className="mb-6">
              <label className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-black block mb-3">
                Transaction PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={pin}
                onChange={(e) => {
                  setPin(e.target.value.replace(/\D/g, ''));
                  setPinError('');
                }}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-center text-3xl tracking-[1em] font-black text-white"
              />
              {pinError && (
                <p className="text-xs text-red-400 font-bold mt-2 text-center">{pinError}</p>
              )}
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400 font-bold text-center">{error}</p>
              </div>
            )}

            <button
              onClick={handleDeploy}
              disabled={pin.length !== 4}
              className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              style={{
                background: pin.length === 4 ? '#f59e0b' : '#3a3a3a',
                color: pin.length === 4 ? '#000' : '#666',
                boxShadow: pin.length === 4 ? '0 8px 24px rgba(245,158,11,0.3)' : 'none',
              }}
            >
              Deploy BNB Wallet →
            </button>
          </>
        )}

        {step === 'deploying' && (
          <div className="py-8 text-center space-y-5">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-2 border-yellow-500/20" />
              <div className="absolute inset-0 rounded-full border-2 border-t-yellow-500 animate-spin" />
              <div className="absolute inset-2 rounded-full bg-yellow-500/10 flex items-center justify-center">
                <img
                  src="https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png"
                  className="w-6 h-6 rounded-full"
                  alt="BNB"
                />
              </div>
            </div>
            <div>
              <p className="font-black text-white text-lg">Deploying BNB Wallet…</p>
              <p className="text-xs text-white/60 mt-1">Broadcasting to BNB Chain · 30–60 seconds</p>
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <a
            href="/dashboard"
            className="text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white/60 transition-colors"
          >
            ← Back to Base Dashboard
          </a>
        </div>
      </motion.div>
    </div>
  );
};

export default BNBDeployWallet;
