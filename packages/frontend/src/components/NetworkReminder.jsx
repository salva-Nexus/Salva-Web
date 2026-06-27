import React from 'react';
import { motion } from 'framer-motion';

// ── Action registry ──────────────────────────────────────────────────────────
// Maps action keys to URL params for cross-chain navigation.
// When switching chains, we encode the desired action in the URL so the
// destination dashboard can auto-trigger it on load, bypassing the selector.
export const CHAIN_ACTION_PARAMS = {
  transfer: 'action=transfer',
  receive: 'action=receive',
  swap: 'action=swap',
  deploy: 'action=deploy',
  buy: 'action=buy',
  pool_swap: 'action=pool_swap', // specific pool swap — requires poolAddress param
};

// Hook: legacy compat — kept so existing callers don't break
export function useNetworkReminder() {
  const isDismissed = () => false;
  return { isDismissed };
}

// ─────────────────────────────────────────────────────────────────────────────
// NetworkReminder — Chain Selector
//
// Props:
//   chain        'base' | 'bnb'  — the CURRENT chain the user is on
//   onContinue   () => void       — called when user picks current chain
//   onClose      () => void       — called on backdrop click or Cancel
//   action       string           — action key from CHAIN_ACTION_PARAMS (optional)
//                                  used to build the cross-chain URL
//   actionParams string           — extra query params (e.g. 'poolAddress=0x…')
// ─────────────────────────────────────────────────────────────────────────────
const NetworkReminder = ({
  onContinue,
  onClose,
  chain = 'base',
  action = null,
  actionParams = '',
}) => {
  const isBase = chain === 'base';

  // Build the cross-chain URL with action encoded in query string
  const buildCrossChainUrl = (targetChain) => {
    const baseDash = targetChain === 'bnb' ? '/bnb' : '/dashboard';
    // Only encode action for transfer and receive — these auto-open modals on the other chain.
    // For deploy, swap, buy: just land on the dashboard root; user can navigate themselves.
    if (!action || !['transfer', 'receive'].includes(action)) {
      return baseDash;
    }
    const extra = actionParams ? `&${actionParams}` : '';
    return `${baseDash}?action=${action}${extra}`;
  };

  const handleSelectCurrentChain = () => {
    onContinue();
  };

  const handleSelectOtherChain = () => {
    const targetChain = isBase ? 'bnb' : 'base';
    const url = buildCrossChainUrl(targetChain);
    window.location.href = url;
  };

  const baseChain = {
    id: 'base',
    label: 'Base Chain',
    sublabel: 'ERC-20',
    color: '#0052FF',
    accentColor: '#D4AF37',
    textColor: '#D4AF37',
    borderColor: 'rgba(212,175,55,0.35)',
    bgColor: 'rgba(212,175,55,0.08)',
    ringColor: 'rgba(212,175,55,0.5)',
    icon: (
      <svg
        viewBox="0 0 111 111"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ width: 20, height: 20 }}
      >
        <path
          d="M54.921 110.034C85.359 110.034 110.034 85.359 110.034 54.921C110.034 24.4828 85.359 -0.192139 54.921 -0.192139C24.4828 -0.192139 -0.192139 24.4828 -0.192139 54.921C-0.192139 85.359 24.4828 110.034 54.921 110.034Z"
          fill="#0052FF"
        />
        <path
          d="M55.0117 86.2397C72.8728 86.2397 87.4453 71.7357 87.4453 53.9508C87.4453 36.1659 72.8728 21.6619 55.0117 21.6619C38.0973 21.6619 24.1269 34.7532 23.627 51.3438H69.0137V56.5578H23.627C24.1269 73.1483 38.0973 86.2397 55.0117 86.2397Z"
          fill="white"
        />
      </svg>
    ),
  };

  const bnbChain = {
    id: 'bnb',
    label: 'BNB Chain',
    sublabel: 'BEP-20',
    color: '#F0B90B',
    accentColor: '#3b82f6',
    textColor: '#60a5fa',
    borderColor: 'rgba(59,130,246,0.35)',
    bgColor: 'rgba(59,130,246,0.08)',
    ringColor: 'rgba(59,130,246,0.5)',
    icon: (
      <img
        src="https://s2.coinmarketcap.com/static/img/coins/64x64/1839.png"
        style={{ width: 20, height: 20, borderRadius: '50%' }}
        alt="BNB"
      />
    ),
  };

  const currentChain = isBase ? baseChain : bnbChain;
  const otherChain = isBase ? bnbChain : baseChain;

  const actionLabels = {
    transfer: 'Send',
    receive: 'Receive',
    swap: 'Swap',
    deploy: 'Deploy Pool',
    buy: 'Buy / Sell NGNs',
    pool_swap: 'Swap',
  };
  const actionLabel = action ? actionLabels[action] || 'Continue' : 'Continue';

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
        {/* Top accent line */}
        <div
          className="h-px"
          style={{
            background: `linear-gradient(to right, transparent, ${currentChain.accentColor}60, transparent)`,
          }}
        />

        <div className="p-6">
          {/* Header */}
          <div className="text-center mb-5">
            <p
              className="text-[9px] uppercase tracking-[0.45em] font-black mb-1.5"
              style={{ color: currentChain.accentColor + '99' }}
            >
              {actionLabel}
            </p>
            <h3 className="text-lg font-black text-white">Select Chain</h3>
            <p className="text-[11px] text-white/50 mt-1">Which network do you want to use?</p>
          </div>

          {/* Chain Options */}
          <div className="space-y-3 mb-5">
            {/* Current Chain */}
            <button
              onClick={handleSelectCurrentChain}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all hover:brightness-110 active:scale-[0.98] text-left"
              style={{
                borderColor: currentChain.borderColor,
                background: currentChain.bgColor,
                boxShadow: `0 0 0 0px ${currentChain.ringColor}`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 1px ${currentChain.ringColor}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 0px ${currentChain.ringColor}`;
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: currentChain.color + '20',
                  border: `1px solid ${currentChain.color}40`,
                }}
              >
                {currentChain.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-sm text-white">{currentChain.label}</p>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase"
                    style={{
                      background: currentChain.accentColor + '20',
                      color: currentChain.accentColor,
                    }}
                  >
                    Current
                  </span>
                </div>
                <p
                  className="text-[10px] font-bold mt-0.5"
                  style={{ color: currentChain.textColor }}
                >
                  {currentChain.sublabel}
                </p>
              </div>
              <svg
                className="w-4 h-4 text-white/40 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>

            {/* Other Chain */}
            <button
              onClick={handleSelectOtherChain}
              className="w-full flex items-center gap-4 p-4 rounded-2xl border transition-all hover:brightness-110 active:scale-[0.98] text-left"
              style={{
                borderColor: otherChain.borderColor,
                background: otherChain.bgColor,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 1px ${otherChain.ringColor}`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 0px ${otherChain.ringColor}`;
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: otherChain.color + '20',
                  border: `1px solid ${otherChain.color}40`,
                }}
              >
                {otherChain.icon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-black text-sm text-white">{otherChain.label}</p>
                  <span
                    className="px-1.5 py-0.5 rounded-md text-[8px] font-black uppercase"
                    style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' }}
                  >
                    Switch
                  </span>
                </div>
                <p className="text-[10px] font-bold mt-0.5" style={{ color: otherChain.textColor }}>
                  {otherChain.sublabel}
                </p>
              </div>
              <svg
                className="w-4 h-4 text-white/40 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
            </button>
          </div>

          {/* Cancel */}
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl border border-white/10 text-white/50 font-bold text-sm hover:text-white hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default NetworkReminder;
