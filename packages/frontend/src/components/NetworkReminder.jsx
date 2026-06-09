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

const NetworkReminder = ({ onContinue, onClose, storageKey, chain = 'base' }) => {
  const [doNotShow, setDoNotShow] = useState(false);
  const isBase = chain === 'base';

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
        <div
          className="h-px"
          style={{
            background: isBase
              ? 'linear-gradient(to right, transparent, rgba(212,175,55,0.4), transparent)'
              : 'linear-gradient(to right, transparent, rgba(59,130,246,0.4), transparent)',
          }}
        />
        <div className="p-8 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5 text-2xl border"
            style={
              isBase
                ? { background: 'rgba(212,175,55,0.1)', borderColor: 'rgba(212,175,55,0.25)' }
                : { background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)' }
            }
          >
            ⛓
          </div>
          <p
            className="text-[9px] uppercase tracking-[0.35em] font-black mb-1.5"
            style={{ color: isBase ? 'rgba(212,175,55,0.5)' : 'rgba(59,130,246,0.5)' }}
          >
            Network Notice
          </p>
          <h3 className="text-xl font-black text-white mb-3">
            You're on {isBase ? 'Base Chain' : 'BNB Chain'}
          </h3>
          <p className="text-xs text-white/55 leading-relaxed mb-5">
            {isBase ? (
              <>
                All tokens here are ERC-20s on{' '}
                <span className="text-salvaGold font-black">Base</span> — a Layer 2 network. Pools,
                swaps, and transfers run on Base.
              </>
            ) : (
              <>
                All tokens here are BEP-20s on{' '}
                <span className="text-blue-400 font-black">BNB Chain</span> — a Layer 1 network.
                Pools, swaps, and transfers run on BNB Chain.
              </>
            )}
          </p>
          <div
            className="rounded-2xl p-4 mb-5 text-left border"
            style={
              isBase
                ? { background: 'rgba(59,130,246,0.07)', borderColor: 'rgba(59,130,246,0.2)' }
                : {
                    background: 'rgba(212,175,55,0.07)',
                    borderColor: 'rgba(212,175,55,0.2)',
                  }
            }
          >
            <p
              className="text-[9px] uppercase tracking-[0.3em] font-black mb-1.5"
              style={{ color: isBase ? 'rgba(59,130,246,0.6)' : 'rgba(212,175,55,0.6)' }}
            >
              {isBase ? 'Want BNB Chain?' : 'Want Base Chain?'}
            </p>
            <p className="text-[11px] text-white/55 leading-relaxed mb-3">
              {isBase
                ? "Use the chain switcher below your balance card to switch to BNB Chain. If you don't have a BNB wallet yet, it will guide you through deployment."
                : "Use the chain switcher below your balance card to switch to Base Chain (L2). Faster and cheaper transactions powered by Ethereum."}
            </p>
            <a
              href={isBase ? '/bnb' : '/dashboard'}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest transition-colors"
              style={{ color: isBase ? '#3b82f6' : '#D4AF37' }}
            >
              Switch to {isBase ? 'BNB Chain' : 'Base Chain'}{' '}
              <span className="text-sm">↗</span>
            </a>
          </div>
          <label className="flex items-center justify-center gap-2.5 cursor-pointer mb-5 group">
            <div
              onClick={() => setDoNotShow((v) => !v)}
              className="flex items-center justify-center flex-shrink-0 transition-all border"
              style={{
                width: 18,
                height: 18,
                borderRadius: 5,
                background: doNotShow
                  ? isBase
                    ? '#D4AF37'
                    : '#3b82f6'
                  : 'rgba(255,255,255,0.05)',
                borderColor: doNotShow
                  ? isBase
                    ? '#D4AF37'
                    : '#3b82f6'
                  : 'rgba(255,255,255,0.2)',
              }}
            >
              {doNotShow && (
                <span className="text-black font-black" style={{ fontSize: 11, lineHeight: 1 }}>
                  ✓
                </span>
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
              className="flex-1 py-3.5 rounded-2xl font-black text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
              style={
                isBase
                  ? { background: '#D4AF37', color: '#000', boxShadow: '0 4px 20px rgba(212,175,55,0.2)' }
                  : { background: '#3b82f6', color: '#fff', boxShadow: '0 4px 20px rgba(59,130,246,0.2)' }
              }
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