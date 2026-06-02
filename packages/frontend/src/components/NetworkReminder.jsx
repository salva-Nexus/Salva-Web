import React, { useState } from 'react';
import { motion } from 'framer-motion';

export function useNetworkReminder(storageKey = 'salva-network-reminder') {
  const isDismissed = () => {
    try {
      return localStorage.getItem(storageKey) === 'true';
    } catch {
      return false;
    }
  };
  return { isDismissed };
}

const NetworkReminder = ({ onContinue, onClose, storageKey }) => {
  const [doNotShow, setDoNotShow] = useState(false);

  const handleContinue = () => {
    if (doNotShow) {
      try { localStorage.setItem(storageKey, 'true'); } catch {}
    }
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 16 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/25 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl">
            ⛓
          </div>
          <p className="text-[9px] uppercase tracking-[0.35em] text-salvaGold/50 font-black mb-1.5">
            Network Notice
          </p>
          <h3 className="text-xl font-black text-white mb-3">You're on Base Chain</h3>
          <p className="text-xs text-white/55 leading-relaxed mb-5">
            All tokens here are ERC-20s on <span className="text-salvaGold font-black">Base</span> —
            a Layer 2 network. Pools, swaps, and transfers run on Base, not Ethereum Mainnet.
          </p>
          <div className="bg-blue-500/[0.07] border border-blue-500/20 rounded-2xl p-4 mb-5 text-left">
            <p className="text-[9px] uppercase tracking-[0.3em] text-blue-400/60 font-black mb-1.5">
              Want BSC Mainnet?
            </p>
            <p className="text-[11px] text-white/55 leading-relaxed mb-3">
              To interact with BEP-20 tokens on BNB CHAIN, use the BSC dashboard.
            </p>
            <a
              href="/l1"
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors"
            >
              Go to BSC <span className="text-sm">↗</span>
            </a>
          </div>
          <label className="flex items-center justify-center gap-2.5 cursor-pointer mb-5 group">
            <div
              onClick={() => setDoNotShow((v) => !v)}
              className={`flex items-center justify-center flex-shrink-0 transition-all border ${
                doNotShow
                  ? 'bg-salvaGold border-salvaGold'
                  : 'border-white/20 bg-white/5 group-hover:border-white/30'
              }`}
              style={{ width: 18, height: 18, borderRadius: 5 }}
            >
              {doNotShow && (
                <span className="text-black font-black" style={{ fontSize: 11, lineHeight: 1 }}>✓</span>
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40 group-hover:text-white/55 transition-colors">
              Do not show again
            </span>
          </label>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border border-white/10 text-white/60 font-bold text-sm hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleContinue}
              className="flex-1 py-3.5 rounded-2xl bg-salvaGold text-black font-black text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-salvaGold/20"
            >
              Got it, continue
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NetworkReminder;
