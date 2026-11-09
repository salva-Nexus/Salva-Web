// src/pages/AdminStatsPage.jsx
// Validator-only analytics + multisig governance console.
//
// STATS  — GET  /api/data/stats                     (flat snapshot)
// GOVERNANCE:
//   Requests  — GET  /api/admin/proposalRequests     (off-chain "hey validators, we need this")
//               POST /api/admin/propose              { key, safeAddress, privateKey }
//               POST /api/admin/deleteProposalRequests { key }
//   Proposals — GET  /api/admin/proposals/:adminSafe (on-chain, with per-validator approval state)
//               POST /api/admin/approve              { proposalHash, adminSafe, privateKey }
//               POST /api/admin/execute              { proposalHash, adminSafe, privateKey }
//               POST /api/admin/deleteProposal        { proposalHash }
//
// All signing actions reuse /api/user/verify-pin (see Dashboard.jsx) to turn the
// validator's 4-digit PIN into the private key the admin endpoints require.

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';
import {
  ADMIN_POLL_INTERVAL_MS,
  NGN_ORACLE_KEY,
  readAdminCache,
  writeAdminCache,
  fetchOracleStatus,
} from '../utils/adminCache';
// ── Icons ──────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 16, stroke = 1.8, className = '' }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className,
  };
  const paths = {
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 7v5c0 4.7-3.1 7.9-8 9-4.9-1.1-8-4.3-8-9V7l8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </>
    ),
    inbox: (
      <>
        <path d="M22 12h-6l-2 3h-4l-2-3H2" />
        <path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11Z" />
      </>
    ),
    vote: (
      <>
        <path d="M12 2 3 7v2h18V7Z" />
        <path d="M5 11v7M10 11v7M14 11v7M19 11v7" />
        <path d="M3 21h18" />
      </>
    ),
    zap: <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />,
    copy: (
      <>
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    trash: (
      <>
        <path d="M3 6h18" />
        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <path d="M19 6v13a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 3" />
      </>
    ),
    alert: (
      <>
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
        <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      </>
    ),
    trend: (
      <>
        <polyline points="3 17 9 11 13 15 21 7" />
        <polyline points="15 7 21 7 21 13" />
      </>
    ),
    pause: <path d="M8 5v14M16 5v14" />,
    play: <path d="M7 4v16l13-8Z" />,
  };
  return <svg {...common}>{paths[name]}</svg>;
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtCompact = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0';
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const shortHash = (h) => (h ? `${h.slice(0, 8)}…${h.slice(-6)}` : '—');

const CHAIN_META = {
  base: { label: 'Base', color: '#0052FF', dot: 'bg-[#0052FF]' },
  bnb: { label: 'BNB Chain', color: '#F0B90B', dot: 'bg-[#F0B90B]' },
};
const chainMeta = (chain) =>
  CHAIN_META[(chain || '').toLowerCase()] || {
    label: chain || 'Unknown',
    color: '#9CA3AF',
    dot: 'bg-white/30',
  };

const ChainBadge = ({ chain }) => {
  const m = chainMeta(chain);
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1">
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      <span className="text-[7px] sm:text-[9px] font-black uppercase tracking-widest" style={{ color: m.color }}>
        {m.label}
      </span>
    </span>
  );
};

const copyToClipboard = (val, showMsg, label = 'Copied!') => {
  if (!val) return;
  navigator.clipboard.writeText(val);
  showMsg(label);
};

// ── Stat pill (network stats tab) ───────────────────────────────────────────
const StatPill = ({ label, value, color }) => (
  <div className="rounded-lg sm:rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5 sm:p-4">
    <p className="text-[6px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black mb-0.5 sm:mb-1">
      {label}
    </p>
    <p className="text-sm sm:text-2xl font-black" style={{ color }}>
      {fmtCompact(value)}
    </p>
  </div>
);

// ── Governance summary strip ────────────────────────────────────────────────
const GovStat = ({ label, value, accent }) => (
  <div className="flex-1 min-w-[90px] rounded-xl sm:rounded-2xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5 sm:px-4 sm:py-3.5">
    <p className="text-[6px] sm:text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-0.5 sm:mb-1">
      {label}
    </p>
    <p className={`text-base sm:text-2xl font-black ${accent}`}>{value}</p>
  </div>
);

// ── Tab nav ──────────────────────────────────────────────────────────────
const TabNav = ({ tabs, active, onChange }) => (
  <div className="mb-5 sm:mb-6 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-1.5 backdrop-blur-xl">
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
      {tabs.map((t) => {
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className="relative flex items-center justify-center gap-1.5 sm:gap-2 rounded-xl px-2 py-2.5 sm:py-3 transition-colors"
          >
            {isActive && (
              <motion.span
                layoutId="admin-active-tab"
                className="absolute inset-0 rounded-xl bg-salvaGold"
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            )}
            <span className={`relative z-10 ${isActive ? 'text-black' : 'text-white/50'}`}>
              <Icon name={t.icon} size={13} />
            </span>
            <span
              className={`relative z-10 text-[7px] sm:text-[10px] font-black uppercase tracking-widest ${
                isActive ? 'text-black' : 'text-white/50'
              }`}
            >
              {t.label}
            </span>
            {typeof t.badge === 'number' && t.badge > 0 && (
              <span
                className={`relative z-10 ml-0.5 min-w-[16px] rounded-full px-1 py-0.5 text-[6px] sm:text-[8px] font-black leading-none ${
                  isActive ? 'bg-black/15 text-black' : 'bg-salvaGold/20 text-salvaGold'
                }`}
              >
                {t.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────────
const EmptyState = ({ icon, title, subtitle }) => (
  <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-10 sm:py-14 text-center">
    <div className="mx-auto mb-3 flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-2xl bg-salvaGold/10 text-salvaGold">
      <Icon name={icon} size={20} />
    </div>
    <p className="text-xs sm:text-sm font-bold text-white/70">{title}</p>
    {subtitle && <p className="mt-1 text-[10px] sm:text-xs text-white/35">{subtitle}</p>}
  </div>
);

// ── Skeleton row ─────────────────────────────────────────────────────────
const SkeletonCard = () => (
  <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4 sm:p-5 animate-pulse">
    <div className="h-3 w-1/3 rounded bg-white/10 mb-3" />
    <div className="h-2.5 w-2/3 rounded bg-white/[0.06] mb-2" />
    <div className="h-2.5 w-1/2 rounded bg-white/[0.06]" />
  </div>
);

// ── Proposal Request card ────────────────────────────────────────────────
const RequestCard = ({ req, onPropose, onDelete, busy, showMsg }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 sm:p-5"
  >
    <div className="flex items-start justify-between gap-3 mb-3">
      <div className="min-w-0">
        <p className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-salvaGold/60 mb-1">
          Proposal Request
        </p>
        <p className="text-xs sm:text-sm font-bold text-white leading-snug break-words">
          {req.description || 'No description provided'}
        </p>
      </div>
      <ChainBadge chain={req.chain} />
    </div>

    <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4">
      <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] px-2.5 py-2">
        <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
          Namespace / Key
        </p>
        <p className="font-mono text-[8px] sm:text-[10px] text-white/70 truncate">{req.key || '—'}</p>
      </div>
      <button
        onClick={() => copyToClipboard(req.target, showMsg, 'Target address copied!')}
        className="text-left rounded-xl bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 hover:border-salvaGold/30 transition-colors group"
      >
        <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
          Target Contract
        </p>
        <p className="font-mono text-[8px] sm:text-[10px] text-salvaGold/70 group-hover:text-salvaGold truncate">
          {shortAddr(req.target)}
        </p>
      </button>
    </div>

    <div className="flex items-center justify-between gap-2 mb-4">
      <button
        onClick={() => copyToClipboard(req.initiatorSafe, showMsg, 'Initiator address copied!')}
        className="flex items-center gap-1.5 text-[7px] sm:text-[9px] font-mono text-white/35 hover:text-white/60 transition-colors"
      >
        <Icon name="copy" size={10} />
        Initiated by {shortAddr(req.initiatorSafe)}
      </button>
    </div>

    <div className="flex gap-2 sm:gap-2.5">
      <button
        onClick={() => onDelete(req)}
        disabled={busy}
        className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all disabled:opacity-40"
      >
        <Icon name="trash" size={12} />
        Delete
      </button>
      <button
        onClick={() => onPropose(req)}
        disabled={busy}
        className="flex-[2] flex items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest text-black hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Icon name="zap" size={12} />
        Propose On-Chain
      </button>
    </div>
  </motion.div>
);

// ── Proposal card (on-chain, multisig) ───────────────────────────────────
const ProposalCard = ({ item, onApprove, onExecute, onDelete, busy, showMsg }) => {
  const { proposal, isApproved, hasApproved } = item;

  // Tracks the 24h post-quorum timelock (proposal.timeRemaining, set by the
  // backend once quorum is reached). Ticks every 30s only while a countdown
  // is actually running — Execute stays enabled the whole time regardless;
  // the contract itself enforces the timelock on-chain.
  const [now, setNow] = useState(() => Date.now());
  const unlockAt = proposal.timeRemaining ? new Date(proposal.timeRemaining).getTime() : null;
  useEffect(() => {
    if (!isApproved || !unlockAt || Date.now() >= unlockAt) return;
    const iv = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(iv);
  }, [isApproved, unlockAt]);
  const msLeft = unlockAt ? unlockAt - now : 0;
  const isTimelocked = isApproved && unlockAt && msLeft > 0;
  const formatCountdown = (ms) => {
    const totalMin = Math.max(0, Math.ceil(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };
  const badgeState = !isApproved
    ? {
        icon: 'clock',
        label: 'Awaiting Approval',
        cls: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
      }
    : isTimelocked
    ? {
        icon: 'clock',
        label: `Executable in ${formatCountdown(msLeft)}`,
        cls: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
      }
    : {
        icon: 'check',
        label: 'Ready to Execute',
        cls: 'bg-green-500/15 text-green-400 border border-green-500/25',
      };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-3.5 sm:p-5 ${
        isApproved
          ? 'border-green-500/25 bg-green-500/[0.03]'
          : 'border-white/[0.07] bg-white/[0.03]'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-salvaGold/60">
              Proposal
            </p>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[6px] sm:text-[8px] font-black uppercase tracking-widest ${badgeState.cls}`}
            >
              <Icon name={badgeState.icon} size={9} />
              {badgeState.label}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-bold text-white leading-snug break-words">
            {proposal.description || 'No description provided'}
          </p>
        </div>
        <ChainBadge chain={proposal.chain} />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-3">
        <button
          onClick={() => copyToClipboard(proposal.proposalHash, showMsg, 'Proposal hash copied!')}
          className="text-left rounded-xl bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 hover:border-salvaGold/30 transition-colors group"
        >
          <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
            Proposal Hash
          </p>
          <p className="font-mono text-[8px] sm:text-[10px] text-salvaGold/70 group-hover:text-salvaGold truncate">
            {shortHash(proposal.proposalHash)}
          </p>
        </button>
        <button
          onClick={() => copyToClipboard(proposal.target, showMsg, 'Target address copied!')}
          className="text-left rounded-xl bg-white/[0.02] border border-white/[0.05] px-2.5 py-2 hover:border-salvaGold/30 transition-colors group"
        >
          <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
            Target Contract
          </p>
          <p className="font-mono text-[8px] sm:text-[10px] text-white/60 group-hover:text-white/80 truncate">
            {shortAddr(proposal.target)}
          </p>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3">
          <p className="text-[7px] sm:text-[9px] font-mono text-white/35">
            Nonce <span className="text-white/55">{String(proposal.nonce ?? '—')}</span>
          </p>
          <p
            className={`text-[7px] sm:text-[9px] font-black uppercase tracking-widest ${
              proposal.remaining > 0 ? 'text-yellow-400/80' : 'text-green-400/80'
            }`}
          >
            {proposal.remaining ?? 0} {proposal.remaining === 1 ? 'vote' : 'votes'} left
          </p>
        </div>
        {hasApproved && (
          <span className="flex items-center gap-1 text-[7px] sm:text-[9px] font-black uppercase tracking-widest text-green-400">
            <Icon name="check" size={10} />
            You approved
          </span>
        )}
      </div>

      <div className="flex gap-2 sm:gap-2.5">
        <button
          onClick={() => onDelete(proposal)}
          disabled={busy}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all disabled:opacity-40"
        >
          <Icon name="trash" size={12} />
        </button>
        <button
          onClick={() => onApprove(proposal)}
          disabled={busy || hasApproved || isApproved}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all ${
            hasApproved || isApproved
              ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
              : 'border border-salvaGold/30 bg-salvaGold/[0.08] text-salvaGold hover:bg-salvaGold/[0.15] active:scale-[0.98]'
          } disabled:opacity-60`}
        >
          <Icon name="vote" size={12} />
          {hasApproved ? 'Approved' : 'Approve'}
        </button>
        <button
          onClick={() => onExecute(proposal)}
          disabled={busy || !isApproved}
          className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest transition-all ${
            !isApproved
              ? 'bg-white/5 text-white/30 cursor-not-allowed border border-white/5'
              : 'bg-salvaGold text-black hover:brightness-110 active:scale-[0.98]'
          } disabled:opacity-60`}
        >
          <Icon name="zap" size={12} />
          Execute
        </button>
      </div>
    </motion.div>
  );
};

// ── NGN oracle control card ───────────────────────────────────────────────
const OracleCard = ({ oracle, error, busy, onToggle }) => {
  const known = oracle !== null;
  const paused = known && oracle.paused;

  const badge = !known
    ? { label: 'Unknown', cls: 'bg-white/5 text-white/40 border border-white/10' }
    : paused
    ? { label: 'Paused', cls: 'bg-red-500/10 text-red-400 border border-red-500/20' }
    : { label: 'Active', cls: 'bg-green-500/15 text-green-400 border border-green-500/25' };

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <p className="text-[7px] sm:text-[9px] font-black uppercase tracking-[0.2em] text-salvaGold/60 mb-1">
            Oracle · Immediate
          </p>
          <p className="text-xs sm:text-sm font-bold text-white leading-snug">
            NGN Price Oracle Updates
          </p>
          <p className="mt-1 text-[10px] sm:text-xs text-white/35 leading-relaxed">
            Pauses or resumes the scheduled NGN price update. While paused, the on-chain price stays
            at its last updated value.
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[6px] sm:text-[8px] font-black uppercase tracking-widest ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {known && oracle.at && (
        <p className="mb-3 text-[7px] sm:text-[9px] font-mono text-white/30">
          Last checked {new Date(oracle.at).toLocaleTimeString()}
        </p>
      )}

      {error && known && (
        <p className="mb-3 text-[8px] sm:text-[10px] font-bold text-yellow-400/90">
          Showing last known status · retrying…
        </p>
      )}

      <div className="flex gap-2 sm:gap-2.5">
        <button
          onClick={() => onToggle(false)}
          disabled={busy || (known && paused)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/[0.06] py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest text-red-400 hover:bg-red-500/10 hover:border-red-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="pause" size={12} />
          Pause Updates
        </button>
        <button
          onClick={() => onToggle(true)}
          disabled={busy || (known && !paused)}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-2.5 text-[9px] sm:text-xs font-black uppercase tracking-widest text-black hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="play" size={12} />
          Resume Updates
        </button>
      </div>
    </motion.div>
  );
};

// ── PIN modal (generic — used for propose / approve / execute) ────────────
const PinModal = ({ open, title, subtitle, onCancel, onConfirm, loading }) => {
  const [pin, setPin] = useState('');
  useEffect(() => {
    if (open) setPin('');
  }, [open]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      <motion.div
        onClick={() => !loading && onCancel()}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-8 shadow-2xl"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="text-center mb-5 sm:mb-6">
          <div className="mx-auto mb-3.5 flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-salvaGold/20 bg-salvaGold/10 text-salvaGold">
            <Icon name="shield" size={20} />
          </div>
          <h3 className="text-base sm:text-xl font-black text-white">{title}</h3>
          {subtitle && (
            <p className="mt-1 text-[10px] sm:text-xs text-white/40 break-all px-2">{subtitle}</p>
          )}
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          placeholder="••••"
          className="w-full rounded-2xl border border-white/10 bg-white/5 py-3.5 sm:py-4 text-center text-2xl sm:text-3xl font-black tracking-[0.7em] sm:tracking-[1em] text-white outline-none transition focus:border-salvaGold/60"
        />
        <div className="mt-5 flex gap-2.5 sm:gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white/60 hover:bg-white/5 transition-all disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(pin)}
            disabled={loading || pin.length !== 4}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-salvaGold py-2.5 sm:py-3 text-xs sm:text-sm font-black text-black hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 transition-all"
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            )}
            {loading ? 'Signing…' : 'Confirm & Sign'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Confirm modal (delete actions — no browser confirm()) ─────────────────
const ConfirmModal = ({ open, title, subtitle, onCancel, onConfirm, loading }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
      <motion.div
        onClick={() => !loading && onCancel()}
        className="absolute inset-0 bg-black/85 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm rounded-3xl border border-white/10 bg-zinc-950 p-5 sm:p-7 shadow-2xl text-center"
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
      >
        <div className="mx-auto mb-3.5 flex h-11 w-11 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400">
          <Icon name="alert" size={20} />
        </div>
        <h3 className="text-base sm:text-lg font-black text-white">{title}</h3>
        {subtitle && <p className="mt-1.5 text-[11px] sm:text-xs text-white/40 break-words">{subtitle}</p>}
        <div className="mt-5 flex gap-2.5 sm:gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 rounded-xl border border-white/10 py-2.5 sm:py-3 text-xs sm:text-sm font-bold text-white/60 hover:bg-white/5 transition-all disabled:opacity-30"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-red-500 py-2.5 sm:py-3 text-xs sm:text-sm font-black text-white hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            )}
            {loading ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Notification ───────────────────────────────────────────────────────────
const Notif = ({ notification, onClose }) => {
  if (!notification.show) return null;
  const error = notification.type === 'error';
  const info = notification.type === 'info';
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <motion.div
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-xs rounded-[26px] border border-white/[0.08] bg-[#111113] p-6 sm:p-7 text-center shadow-2xl"
        initial={{ opacity: 0, scale: 0.9, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 16 }}
      >
        <div
          className={`mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border ${
            error
              ? 'border-red-500/25 bg-red-500/10 text-red-400'
              : info
              ? 'border-blue-500/25 bg-blue-500/10 text-blue-400'
              : 'border-salvaGold/25 bg-salvaGold/10 text-salvaGold'
          }`}
        >
          <Icon name={error ? 'x' : info ? 'clock' : 'check'} size={20} />
        </div>
        <p className="text-sm font-bold text-white/90 leading-relaxed mb-5">{notification.message}</p>
        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-salvaGold py-3 text-xs font-black uppercase tracking-widest text-black hover:brightness-110 transition-all"
        >
          Got it
        </button>
      </motion.div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════════════════
// ADMIN STATS PAGE — Main Component
// ══════════════════════════════════════════════════════════════════════════
const AdminStatsPage = () => {
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('salva_user') || 'null');
    } catch {
      return null;
    }
  });

  const [activeTab, setActiveTab] = useState('stats');

  // Network stats
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [statsError, setStatsError] = useState(null);

  // Proposal requests (off-chain)
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(null);

  // Proposals (on-chain)
  const [proposals, setProposals] = useState([]);
  const [proposalsLoading, setProposalsLoading] = useState(true);
  const [proposalsError, setProposalsError] = useState(null);

  // NGN oracle pause state (cache-first, silent 1-minute poll)
  const owner = user?.safeAddress;
  const [oracle, setOracle] = useState(() => readAdminCache(owner)?.oracle || null);
  const [oracleError, setOracleError] = useState(null);
  const oracleCtrlRef = useRef(null);
  // Notification
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const showMsg = useCallback(
    (message, type = 'success') => setNotification({ show: true, message, type }),
    []
  );
  const closeNotif = useCallback(() => setNotification((n) => ({ ...n, show: false })), []);

  // PIN modal — drives propose / approve / execute
  const [pinAction, setPinAction] = useState(null); // { type: 'propose'|'approve'|'execute', payload, title, subtitle }
  const [pinLoading, setPinLoading] = useState(false);

  // Confirm modal — drives delete request / delete proposal
  const [confirmAction, setConfirmAction] = useState(null); // { type: 'deleteRequest'|'deleteProposal', payload, title, subtitle }
  const [confirmLoading, setConfirmLoading] = useState(false);

  const [rowBusy, setRowBusy] = useState(false);

  // ── Fetchers ───────────────────────────────────────────────────────────
  const fetchStats = useCallback(async (silent = false) => {
    silent ? setStatsRefreshing(true) : setStatsLoading(true);
    setStatsError(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/data/stats`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        setStatsError(data.message || 'Access denied');
        setStats(null);
        return;
      }
      setStats(data.data || null);
    } catch {
      setStatsError('Network error — could not load stats');
    } finally {
      setStatsLoading(false);
      setStatsRefreshing(false);
    }
  }, []);

  const fetchRequests = useCallback(async () => {
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposalRequests`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        setRequestsError(data.errorMsg || 'Could not load proposal requests');
        setRequests([]);
        return;
      }
      setRequests(Array.isArray(data.proposalRequests) ? data.proposalRequests : []);
    } catch {
      setRequestsError('Network error — could not load proposal requests');
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  const fetchProposals = useCallback(async () => {
    if (!user?.safeAddress) return;
    setProposalsLoading(true);
    setProposalsError(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposals/${user.safeAddress}`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        setProposalsError(data.errorMsg || 'Could not load proposals');
        setProposals([]);
        return;
      }
      const list = Array.isArray(data.proposals) ? data.proposals : [];
      // proposals() service returns [{}] when none exist — filter empty shells
      setProposals(list.filter((p) => p?.proposal?.proposalHash));
    } catch {
      setProposalsError('Network error — could not load proposals');
    } finally {
      setProposalsLoading(false);
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    fetchStats();
    fetchRequests();
    fetchProposals();
  }, [fetchStats, fetchRequests, fetchProposals]);

  // Network -> cache -> UI
  const refreshOracle = useCallback(async () => {
    if (!owner) return;
    oracleCtrlRef.current?.abort();
    const controller = new AbortController();
    oracleCtrlRef.current = controller;

    try {
      await fetchOracleStatus(owner, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setOracle(readAdminCache(owner)?.oracle || null);
      setOracleError(null);
    } catch (e) {
      if (e?.name === 'AbortError') return;
      setOracleError(e?.message || 'Could not load oracle status');
    }
  }, [owner]);

  useEffect(() => {
    if (!owner) return undefined;

    setOracle(readAdminCache(owner)?.oracle || null);
    refreshOracle();

    const tick = () => {
      if (document.visibilityState === 'visible') refreshOracle();
    };

    const id = setInterval(tick, ADMIN_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      oracleCtrlRef.current?.abort();
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [owner, refreshOracle]);

  // ── Delete flows ───────────────────────────────────────────────────────
  const openDeleteRequest = (req) =>
    setConfirmAction({
      type: 'deleteRequest',
      payload: req,
      title: 'Delete this request?',
      subtitle: req.description || req.key,
    });

  const openDeleteProposal = (proposal) =>
    setConfirmAction({
      type: 'deleteProposal',
      payload: proposal,
      title: 'Delete this proposal?',
      subtitle: proposal.description || shortHash(proposal.proposalHash),
    });

  const runConfirmedDelete = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      if (confirmAction.type === 'deleteRequest') {
        const res = await fetch(`${SALVA_API_URL}/api/admin/deleteProposalRequests`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: confirmAction.payload.key }),
        });
        const data = await res.json();
        if (res.ok && data.status) {
          showMsg('Request deleted.');
          setRequests((r) => r.filter((x) => x.key !== confirmAction.payload.key));
        } else {
          showMsg(data.errorMsg || 'Could not delete request.', 'error');
        }
      } else {
        const res = await fetch(`${SALVA_API_URL}/api/admin/deleteProposal`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposalHash: confirmAction.payload.proposalHash }),
        });
        const data = await res.json();
        if (res.ok && data.status) {
          showMsg('Proposal deleted.');
          setProposals((p) =>
            p.filter((x) => x.proposal.proposalHash !== confirmAction.payload.proposalHash)
          );
        } else {
          showMsg(data.errorMsg || 'Could not delete proposal.', 'error');
        }
      }
    } catch {
      showMsg('Network error. Please try again.', 'error');
    } finally {
      setConfirmLoading(false);
      setConfirmAction(null);
    }
  };

  // ── Sign flows (propose / approve / execute) ──────────────────────────
  const openPropose = (req) =>
    setPinAction({
      type: 'propose',
      payload: req,
      title: 'Propose On-Chain',
      subtitle: req.description || req.key,
    });

  const openApprove = (proposal) =>
    setPinAction({
      type: 'approve',
      payload: proposal,
      title: 'Approve Proposal',
      subtitle: proposal.description || shortHash(proposal.proposalHash),
    });

  const openExecute = (proposal) =>
    setPinAction({
      type: 'execute',
      payload: proposal,
      title: 'Execute Proposal',
      subtitle: proposal.description || shortHash(proposal.proposalHash),
    });

  const openOracleToggle = (active) =>
    setPinAction({
      type: 'oracle',
      payload: { active },
      title: active ? 'Resume NGN Oracle' : 'Pause NGN Oracle',
      subtitle: active
        ? 'Scheduled NGN price updates will resume.'
        : 'Scheduled NGN price updates will stop until resumed.',
    });

  const runSignedAction = async (pin) => {
    if (!pinAction || !user?.email) return;
    if (pin.length !== 4) return showMsg('PIN must be 4 digits', 'error');

    setPinLoading(true);
    setRowBusy(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok || !pinData.success) {
        showMsg(pinData.message || 'Incorrect PIN', 'error');
        return;
      }
      if (pinAction.type === 'oracle') {
        const { active } = pinAction.payload;
        const res = await fetch(`${SALVA_API_URL}/api/admin/update-control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pin,
            safeAddress: user.safeAddress,
            key: NGN_ORACLE_KEY,
            active,
          }),
        });
        const data = await res.json();
        if (res.ok && (data.state === 'paused' || data.state === 'active')) {
          writeAdminCache(owner, { oracle: { paused: data.state === 'paused', at: Date.now() } });
          setOracle(readAdminCache(owner)?.oracle || null);
          showMsg(
            data.state === 'paused' ? 'NGN oracle updates paused.' : 'NGN oracle updates resumed.'
          );
        } else {
          showMsg(data.errorMsg || 'Could not update the oracle.', 'error');
        }
      } else if (pinAction.type === 'propose') {
        const res = await fetch(`${SALVA_API_URL}/api/admin/propose`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: pinAction.payload.key,
            safeAddress: user.safeAddress,
            pin,
          }),
        });
        const data = await res.json();
        if (res.ok && data.status) {
          showMsg('Proposal submitted on-chain!');
          setRequests((r) => r.filter((x) => x.key !== pinAction.payload.key));
          fetchProposals();
        } else {
          showMsg(data.errorMsg || 'Could not propose. Try again.', 'error');
        }
      } else if (pinAction.type === 'approve') {
        const res = await fetch(`${SALVA_API_URL}/api/admin/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalHash: pinAction.payload.proposalHash,
            adminSafe: user.safeAddress,
            pin,
          }),
        });
        const data = await res.json();
        if (res.ok && data.status) {
          showMsg(data.data?.isApproved ? 'Approved — quorum reached!' : 'Approval recorded.');
          fetchProposals();
        } else {
          showMsg(data.errorMsg || 'Could not approve. Try again.', 'error');
        }
      } else if (pinAction.type === 'execute') {
        const res = await fetch(`${SALVA_API_URL}/api/admin/execute`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            proposalHash: pinAction.payload.proposalHash,
            adminSafe: user.safeAddress,
            pin,
          }),
        });
        const data = await res.json();
        if (res.ok && data.status) {
          showMsg('Proposal executed successfully!');
          setProposals((p) =>
            p.filter((x) => x.proposal.proposalHash !== pinAction.payload.proposalHash)
          );
          fetchStats();
        } else {
          showMsg(data.errorMsg || 'Execution failed. Try again.', 'error');
        }
      }
    } catch {
      showMsg('Network error. Check your connection and try again.', 'error');
    } finally {
      setPinLoading(false);
      setRowBusy(false);
      setPinAction(null);
    }
  };

  const isApprovedCount = useMemo(() => proposals.filter((p) => p.isApproved).length, [proposals]);

  if (!user) return null;

  if (!user.isValidator) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Icon name="shield" size={28} className="text-red-400" />
          </div>
          <h2 className="text-xl font-black mb-2">Validator Access Only</h2>
          <p className="text-sm text-white/60">This page is restricted to Salva validators.</p>
          <a
            href="/dashboard"
            className="inline-block mt-6 text-[10px] font-black uppercase tracking-widest text-salvaGold hover:opacity-70 transition-opacity"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: 'stats', label: 'Network', icon: 'layers' },
    { id: 'requests', label: 'Requests', icon: 'inbox', badge: requests.length },
    { id: 'proposals', label: 'Proposals', icon: 'vote', badge: proposals.length },
    { id: 'oracle', label: 'Oracle', icon: 'trend' },
  ];

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white pt-16 px-4 pb-16 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-5xl mx-auto relative z-10">
        {/* ── Header ── */}
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[6px] sm:text-[8px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-white/25 hover:text-salvaGold transition-colors mb-3 sm:mb-5 font-black"
        >
          ← Dashboard
        </a>

        <header className="flex items-start justify-between gap-3 mb-5 sm:mb-8">
          <div>
            <p className="text-[6px] sm:text-[8px] uppercase tracking-[0.3em] text-salvaGold/60 font-black mb-0.5 sm:mb-1">
              Salva Network Intelligence
            </p>
            <h1 className="text-base sm:text-4xl font-black tracking-tight">
              Analytics & Governance
            </h1>
          </div>
          <button
            onClick={() => {
              if (activeTab === 'stats') fetchStats(true);
              else if (activeTab === 'requests') fetchRequests();
              else if (activeTab === 'oracle') refreshOracle();
              else fetchProposals();
            }}
            disabled={statsRefreshing || requestsLoading || proposalsLoading}
            className="flex-shrink-0 w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            <Icon
              name="refresh"
              size={14}
              className={`text-salvaGold ${
                statsRefreshing || requestsLoading || proposalsLoading ? 'animate-spin' : ''
              }`}
            />
          </button>
        </header>

        {/* ── Governance summary strip ── */}
        <div className="flex gap-2 sm:gap-3 mb-5 sm:mb-6">
          <GovStat label="Pending Requests" value={requests.length} accent="text-blue-400" />
          <GovStat label="Active Proposals" value={proposals.length} accent="text-yellow-400" />
          <GovStat label="Ready to Execute" value={isApprovedCount} accent="text-green-400" />
        </div>

        {/* ── Tabs ── */}
        <TabNav tabs={tabs} active={activeTab} onChange={setActiveTab} />

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          {activeTab === 'stats' && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
            >
              {statsLoading ? (
                <div className="flex justify-center py-24">
                  <div className="w-8 h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
                </div>
              ) : statsError ? (
                <EmptyState icon="alert" title={statsError} />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                  <StatPill label="Total Users" value={stats?.usersCount} color="#D4AF37" />
                  <StatPill
                    label="NGN Circulating"
                    value={stats?.ngnsCirculating}
                    color="#3b82f6"
                  />
                  <StatPill label="Treasury NGN" value={stats?.treasuryNGN} color="#22c55e" />
                  <StatPill label="Treasury USD" value={stats?.treasuryUSD} color="#f59e0b" />
                </div>
              )}
            </motion.div>
          )}

          {activeTab === 'requests' && (
            <motion.div
              key="requests"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3 sm:space-y-4"
            >
              {requestsLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : requestsError ? (
                <EmptyState icon="alert" title={requestsError} />
              ) : requests.length === 0 ? (
                <EmptyState
                  icon="inbox"
                  title="No pending requests"
                  subtitle="New proposal requests from users will appear here for review."
                />
              ) : (
                requests.map((req) => (
                  <RequestCard
                    key={req.key || req._id}
                    req={req}
                    busy={rowBusy}
                    showMsg={showMsg}
                    onPropose={openPropose}
                    onDelete={openDeleteRequest}
                  />
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'proposals' && (
            <motion.div
              key="proposals"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3 sm:space-y-4"
            >
              {proposalsLoading ? (
                <>
                  <SkeletonCard />
                  <SkeletonCard />
                </>
              ) : proposalsError ? (
                <EmptyState icon="alert" title={proposalsError} />
              ) : proposals.length === 0 ? (
                <EmptyState
                  icon="vote"
                  title="No active proposals"
                  subtitle="Once a request is proposed on-chain, it will appear here awaiting validator approval."
                />
              ) : (
                proposals.map((item) => (
                  <ProposalCard
                    key={item.proposal.proposalHash}
                    item={item}
                    busy={rowBusy}
                    showMsg={showMsg}
                    onApprove={openApprove}
                    onExecute={openExecute}
                    onDelete={openDeleteProposal}
                  />
                ))
              )}
            </motion.div>
          )}
          {activeTab === 'oracle' && (
            <motion.div
              key="oracle"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3 sm:space-y-4"
            >
              {oracleError && !oracle ? (
                <EmptyState icon="alert" title={oracleError} />
              ) : (
                <OracleCard
                  oracle={oracle}
                  error={oracleError}
                  busy={rowBusy}
                  onToggle={openOracleToggle}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── PIN modal (propose / approve / execute) ── */}
      <AnimatePresence>
        <PinModal
          open={!!pinAction}
          title={pinAction?.title}
          subtitle={pinAction?.subtitle}
          onCancel={() => !pinLoading && setPinAction(null)}
          onConfirm={runSignedAction}
          loading={pinLoading}
        />
      </AnimatePresence>

      {/* ── Confirm modal (delete request / delete proposal) ── */}
      <AnimatePresence>
        <ConfirmModal
          open={!!confirmAction}
          title={confirmAction?.title}
          subtitle={confirmAction?.subtitle}
          onCancel={() => !confirmLoading && setConfirmAction(null)}
          onConfirm={runConfirmedDelete}
          loading={confirmLoading}
        />
      </AnimatePresence>

      {/* ── Notification ── */}
      <AnimatePresence>
        {notification.show && <Notif notification={notification} onClose={closeNotif} />}
      </AnimatePresence>
    </div>
  );
};

export default AdminStatsPage;