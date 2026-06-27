// src/pages/CrossChainAction.jsx
// Intercepts cross-chain navigation from NetworkReminder.
// Reads ?chain=&action= from URL ONCE at module level (before React touches anything),
// writes to sessionStorage, then redirects to the target dashboard.
// The target dashboard reads sessionStorage and opens the correct card.
// RECEIVE is handled here directly — no dashboard needed.

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';

// ── Read URL params synchronously at module evaluation time ──────────────────
// This runs before ANY React render or effect, so React Router cannot interfere.
const _p = new URLSearchParams(window.location.search);
const TARGET = _p.get('chain') || 'base'; // 'base' | 'bnb'
const ACTION = _p.get('action') || '';
const POOL_ADDR = _p.get('poolAddress') || '';
const IS_BASE = TARGET === 'base';
const DASH_URL = IS_BASE ? '/dashboard' : '/bnb';
const ACCENT = IS_BASE ? '#D4AF37' : '#3b82f6';


// ── Helpers ───────────────────────────────────────────────────────────────────
const Spinner = ({ color = '#fff', size = 32 }) => (
  <span
    style={{
      display: 'inline-block',
      width: size,
      height: size,
      border: `2.5px solid ${color}30`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin .65s linear infinite',
      flexShrink: 0,
    }}
  />
);

const goToDash = () => {
  if (ACTION && ACTION !== 'receive') {
    const extra = POOL_ADDR ? `&poolAddress=${POOL_ADDR}` : '';
    window.location.href = `${DASH_URL}?action=${ACTION}${extra}`;
  } else {
    window.location.href = DASH_URL;
  }
};

// ── Receive card (self-contained, no dashboard needed) ────────────────────────
const ReceiveCard = ({ user, onClose }) => {
  const [copiedKey, setCopiedKey] = useState(null);

  const copy = (val, key) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1500);
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center px-0 sm:px-4">
      {/* backdrop */}
      <motion.div
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-sm shadow-2xl z-[91]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* accent line */}
        <div
          style={{
            height: 1,
            background: `linear-gradient(90deg,transparent,${ACCENT}60,transparent)`,
            marginBottom: 24,
          }}
        />

        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

        <div className="text-center mb-6">
          <p
            className="text-[9px] uppercase tracking-[0.45em] font-black mb-1"
            style={{ color: `${ACCENT}80` }}
          >
            Receive · {IS_BASE ? 'Base Chain' : 'BNB Chain'}
          </p>
          <h3 className="text-2xl font-black text-white">{user.username}</h3>
        </div>

        {/* QR */}
        <div className="flex justify-center mb-5">
          <div
            onClick={() => copy(user.safeAddress, 'qr')}
            className="relative group cursor-pointer"
          >
            <div
              className="absolute -inset-1 rounded-2xl blur-md group-hover:blur-lg transition-all"
              style={{ background: `linear-gradient(135deg,${ACCENT}40,transparent)` }}
            />
            <div
              className="relative p-4 rounded-2xl bg-white border-2 transition-all"
              style={{ borderColor: `${ACCENT}40` }}
            >
              <QRCodeSVG
                value={user.safeAddress}
                size={180}
                bgColor="#FFFFFF"
                fgColor="#0A0A0B"
                level="M"
              />
            </div>
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
              <span className="bg-black/80 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                {copiedKey === 'qr' ? '✓ Copied' : 'Tap to copy'}
              </span>
            </div>
          </div>
        </div>

        {/* Address row */}
        <button
          onClick={() => copy(user.safeAddress, 'addr')}
          className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all group mb-3"
        >
          <div className="min-w-0 text-left">
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/50 font-black mb-1">
              Wallet Address
            </p>
            <p className="font-mono text-[10px] truncate" style={{ color: `${ACCENT}90` }}>
              {user.safeAddress}
            </p>
          </div>
          <span
            className="text-[10px] font-black flex-shrink-0"
            style={{ color: copiedKey === 'addr' ? '#22c55e' : `${ACCENT}60` }}
          >
            {copiedKey === 'addr' ? '✓' : '⧉'}
          </span>
        </button>

        {/* Name alias row */}
        {user.nameAlias && (
          <button
            onClick={() => copy(user.nameAlias, 'alias')}
            className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all group mb-3"
          >
            <div className="min-w-0 text-left">
              <p className="text-[9px] uppercase tracking-[0.35em] text-white/50 font-black mb-1">
                Name Alias
              </p>
              <p className="font-black text-sm" style={{ color: ACCENT }}>
                {user.nameAlias}
              </p>
            </div>
            <span
              className="text-[10px] font-black flex-shrink-0"
              style={{ color: copiedKey === 'alias' ? '#22c55e' : `${ACCENT}60` }}
            >
              {copiedKey === 'alias' ? '✓' : '⧉'}
            </span>
          </button>
        )}

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl border border-white/10 font-bold text-white/60 hover:text-white hover:border-white/20 transition-all text-sm uppercase tracking-widest"
        >
          Go to Dashboard
        </button>
      </motion.div>
    </div>
  );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const CrossChainAction = () => {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Load the correct user object for the target chain
    const key = IS_BASE ? 'salva_user' : 'bnb_user';
    try {
      const saved = localStorage.getItem(key);
      if (!saved) throw new Error('no user');
      const parsed = JSON.parse(saved);
      if (!parsed?.safeAddress) throw new Error('invalid');
      setUser(parsed);
    } catch {
      // No user data for this chain — go to dashboard to handle auth
      goToDash();
      return;
    }
    setReady(true);
  }, []);

  // For non-receive actions: sessionStorage was already written at module level.
  // Just redirect to the dashboard — it will read sessionStorage and open the card.
  useEffect(() => {
    if (!ready || !user) return;
    if (ACTION !== 'receive') {
      goToDash();
    }
  }, [ready, user]);

  // Loading / redirect states
  if (!ready || !user || ACTION !== 'receive') {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex items-center justify-center gap-3">
        <Spinner color={ACCENT} size={28} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  // Receive: render inline without loading any dashboard
  return (
    <>
      <div className="min-h-screen bg-[#0A0A0B]" />
      <ReceiveCard user={user} onClose={goToDash} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
};

export default CrossChainAction;
