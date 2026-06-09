// src/pages/BNBDeployWallet.jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const BNBDeployWallet = ({ user, onDeployed }) => {
  const [deploying, setDeploying] = useState(false);
  const [error, setError] = useState('');

  const handleDeploy = async () => {
    setError('');
    setDeploying(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/bnb/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Deployment failed');

      const bnbUser = {
        username: data.username,
        email: user.email,
        safeAddress: data.safeAddress,
      };
      localStorage.setItem('bnb_user', JSON.stringify(bnbUser));
      onDeployed(bnbUser);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('insufficient funds') || msg.includes('INSUFFICIENT_FUNDS')) {
        setError('Network temporarily unavailable. Please try again shortly.');
      } else if (msg.includes('already deployed') || msg.includes('already registered')) {
        setError('Safe already deployed');
      } else if (msg.includes('No Salva account')) {
        setError('No Salva account found. Please register first.');
      } else {
        setError('Deployment failed. Please try again.');
      }
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
            Create your Salva smart account on BNB Chain. No extra password needed — your Salva
            identity is all you need.
          </p>
        </div>

        <div className="mb-6 p-4 rounded-2xl bg-yellow-500/5 border border-yellow-500/15">
          <p className="text-xs text-yellow-400 font-black mb-1">💡 PIN Recommendation</p>
          <p className="text-[11px] text-white/60 leading-relaxed">
            After deployment, you'll set a PIN for your BNB wallet. We strongly recommend using the{' '}
            <strong className="text-white">same PIN as your Base wallet</strong> to avoid confusion.
          </p>
        </div>

        {error && <p className="text-sm text-red-400 font-bold text-center mb-4">{error}</p>}

        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
          style={{
            background: '#f59e0b',
            color: '#000',
            boxShadow: '0 8px 24px rgba(245,158,11,0.3)',
          }}
        >
          {deploying && (
            <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          )}
          {deploying ? 'Deploying BNB Wallet…' : 'Deploy BNB Wallet →'}
        </button>

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
