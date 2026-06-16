import React, { useState } from 'react';
import { motion } from 'framer-motion';

export function useNetworkReminder() {
  const isDismissed = () => false;
  return { isDismissed };
}

const NetworkReminder = ({ onContinue, onClose, chain = 'base' }) => {
  const isBase = chain === 'base';

  const handleContinue = () => {
    onContinue();
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
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
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg border"
              style={
                isBase
                  ? { background: 'rgba(212,175,55,0.1)', borderColor: 'rgba(212,175,55,0.25)' }
                  : { background: 'rgba(59,130,246,0.1)', borderColor: 'rgba(59,130,246,0.25)' }
              }
            >
              ⛓
            </div>
            <div>
              <p
                className="text-[9px] uppercase tracking-[0.35em] font-black mb-0.5"
                style={{ color: isBase ? 'rgba(212,175,55,0.6)' : 'rgba(59,130,246,0.6)' }}
              >
                Network Notice
              </p>
              <p className="text-sm font-black text-white">
                You're on {isBase ? 'Base (ERC-20)' : 'BNB Chain (BEP-20)'}
              </p>
            </div>
          </div>

          <p className="text-xs text-white/55 leading-relaxed mb-4">
            {isBase ? (
              <>
                Tokens here are <span className="text-salvaGold font-black">ERC-20s on Base</span>.
                If you meant to do this on BNB Chain (BEP-20), switch first.
              </>
            ) : (
              <>
                Tokens here are{' '}
                <span className="text-blue-400 font-black">BEP-20s on BNB Chain</span>. If you meant
                to do this on Base (ERC-20), switch first.
              </>
            )}
          </p>

          <a
            href={isBase ? '/bnb' : '/dashboard'}
            className="flex items-center justify-between w-full px-4 py-3 rounded-xl border mb-4 transition-all hover:opacity-80"
            style={
              isBase
                ? { borderColor: 'rgba(59,130,246,0.3)', background: 'rgba(59,130,246,0.07)' }
                : { borderColor: 'rgba(212,175,55,0.3)', background: 'rgba(212,175,55,0.07)' }
            }
          >
            <span
              className="text-xs font-black uppercase tracking-widest"
              style={{ color: isBase ? '#3b82f6' : '#D4AF37' }}
            >
              Switch to {isBase ? 'BNB Chain' : 'Base Chain'}
            </span>
            <span style={{ color: isBase ? '#3b82f6' : '#D4AF37' }} className="text-sm">
              ↗
            </span>
          </a>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:text-white hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleContinue}
              className="flex-1 py-3 rounded-xl font-black text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg"
              style={
                isBase
                  ? {
                      background: '#D4AF37',
                      color: '#000',
                      boxShadow: '0 4px 20px rgba(212,175,55,0.2)',
                    }
                  : {
                      background: '#3b82f6',
                      color: '#fff',
                      boxShadow: '0 4px 20px rgba(59,130,246,0.2)',
                    }
              }
            >
              Continue anyway
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default NetworkReminder;
