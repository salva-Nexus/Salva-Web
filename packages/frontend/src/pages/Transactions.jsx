// Salva-Digital-Tech/packages/frontend/src/pages/Transactions.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Stars from '../components/Stars';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { ChainLogo } from '../components/ChainBadge';
import { readWalletCache } from '../utils/walletCache';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';

const LOCAL_LOGOS = {
  NGNS: ngnLogo,
  SANT: santLogo,
};

// Builds "chain:SYMBOL" -> logo from the wallet caches (the same cache Dashboard fills).
// "*:SYMBOL" is a chain-agnostic fallback.
const buildTxLogoIndex = (email, txs) => {
  const index = new Map();
  if (!email) return index;

  const chains = new Set(txs.map((tx) => String(tx.chain || '').toLowerCase()).filter(Boolean));
  chains.add((localStorage.getItem('salva_chain') || 'base').toLowerCase());

  chains.forEach((chain) => {
    const snapshot = readWalletCache(email, chain, LOCAL_LOGOS);
    (snapshot?.assets || []).forEach((asset) => {
      const symbol = String(asset?.symbol || '').toUpperCase();
      if (!symbol || !asset?.logo) return;
      index.set(`${chain}:${symbol}`, asset.logo);
      if (!index.has(`*:${symbol}`)) index.set(`*:${symbol}`, asset.logo);
    });
  });

  // Locally owned logos always win
  Object.entries(LOCAL_LOGOS).forEach(([symbol, logo]) => {
    index.set(`*:${symbol}`, logo);
  });

  return index;
};

const findAssetLogo = (index, chain, symbol) => {
  if (!index || !symbol) return null;
  const c = String(chain || '').toLowerCase();
  return index.get(`${c}:${symbol}`) || index.get(`*:${symbol}`) || null;
};
// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const FILTERS = ['All', 'Sent', 'Received', 'Failed'];
const PAGE_SIZE = 20;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function getDisplayType(tx, user) {
  const meAddr = (user?.safeAddress || '').toLowerCase();
  const meName = (user?.username || '').toLowerCase();

  const from = (tx.fromAddress || '').toLowerCase();
  const to = (tx.toAddress || '').toLowerCase();

  if (tx.status === 'failed') return 'failed';
  if (from === meAddr || from === meName) return 'sent';
  if (to === meAddr || to === meName) return 'receive';

  return 'sent';
}

// Single source of truth for "did this transaction fail?" — the Transaction
// model's `status` field defaults to "success" (see
// backend/src/models/Transaction.js), not "successful". Everywhere in this
// file that needs a success/fail verdict must check `status !== 'failed'`,
// the same way getDisplayType does, so the card and the receipt can never
// disagree about the same transaction.
const isTxSuccessful = (tx) => tx.status !== 'failed';

function getTxDisplayNames(tx, user) {
  const dType = getDisplayType(tx, user);
  const isSentOrFailed = dType === 'sent' || dType === 'failed';

  if (tx.txType === 'swap') {
    return {
      fromLabel: tx.fromAddress || 'Unknown',
      toLabel: tx.toAddress || user?.safeAddress || '—',
    };
  }

  if (isSentOrFailed) {
    return {
      fromLabel: tx.fromAddress || user?.safeAddress || 'Unknown',
      toLabel: tx.toAddress || 'Unknown',
    };
  }

  return {
    fromLabel: tx.fromAddress || 'Unknown',
    toLabel: tx.toAddress || user?.safeAddress || 'Unknown',
  };
}

const formatNumber = (value, { minDecimals = 2, maxDecimals = 6 } = {}) => {
  if (value === null || value === undefined || value === '') return '0.00';

  const num = Number(value);
  if (!Number.isFinite(num)) return '0.00';

  const factor = 10 ** maxDecimals;
  const truncated = Math.trunc(num * factor) / factor;

  return truncated.toLocaleString('en-US', {
    minimumFractionDigits: minDecimals,
    maximumFractionDigits: maxDecimals,
  });
};

const coinLabel = (tx) => {
  if (tx.txType === 'swap') {
    return tx.tokenOut || tx.coin || 'NGNs';
  }

  return tx.coin === 'NGN' ? 'NGNs' : tx.coin || 'NGNs';
};

const feeCoinLabel = (tx) => {
  if (!tx.feeCoin) return coinLabel(tx);

  return tx.feeCoin === 'NGN' || tx.feeCoin === 'NGNS' ? 'NGNs' : tx.feeCoin;
};

const truncateAddr = (addr, start = 6, end = 4) => {
  if (!addr || typeof addr !== 'string') return addr || '—';

  if (/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    return `${addr.slice(0, start)}…${addr.slice(-end)}`;
  }

  if (addr.length > 24) {
    return `${addr.slice(0, 10)}…${addr.slice(-8)}`;
  }

  return addr;
};

const chainDisplayName = (chain) => {
  const s = String(chain || 'Unknown');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const getNetwork = (tx) => ({ name: chainDisplayName(tx.chain) });

const getStatus = (tx, user) => {
  const type = getDisplayType(tx, user);

  if (type === 'failed') {
    return {
      label: 'Failed',
      icon: '×',
      color: 'text-red-400',
      bg: 'bg-red-500/[0.08]',
      border: 'border-red-500/15',
      dot: 'bg-red-400',
    };
  }

  return {
    label: 'Confirmed',
    icon: '✓',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/[0.08]',
    border: 'border-emerald-500/15',
    dot: 'bg-emerald-400',
  };
};

const getTimeAgo = (dateValue) => {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return 'Unknown time';

  const diff = Date.now() - date.getTime();
  const seconds = Math.floor(diff / 1000);

  if (seconds < 60) return 'Just now';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;

  return `${Math.floor(months / 12)}y ago`;
};

const getTxAmount = (tx) => tx.amount ?? tx.swapAmount ?? tx.amountIn ?? 0;

const copyText = async (text) => {
  if (!text) return;

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ICONS
// ─────────────────────────────────────────────────────────────────────────────

const Icon = ({ name, size = 18, strokeWidth = 1.8, className = '' }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
  };

  const paths = {
    arrowUp: (
      <>
        <path d="M12 19V5" />
        <path d="m6 11 6-6 6 6" />
      </>
    ),
    arrowDown: (
      <>
        <path d="M12 5v14" />
        <path d="m18 13-6 6-6-6" />
      </>
    ),
    swap: (
      <>
        <path d="M7 7h12l-3-3" />
        <path d="M17 17H5l3 3" />
      </>
    ),
    copy: (
      <>
        <rect x="9" y="9" width="11" height="11" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7" />
        <path d="M10 14 21 3" />
        <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-4-4" />
      </>
    ),
    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <path d="M21 3v6h-6" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
    clock: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>
    ),
    gas: (
      <>
        <path d="M5 21h10" />
        <path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16" />
        <path d="M15 7h3l2 2v7a2 2 0 0 0 4 0v-4" />
        <path d="M9 7h4" />
      </>
    ),
    filter: (
      <>
        <path d="M4 6h16" />
        <path d="M7 12h10" />
        <path d="M10 18h4" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
};

// ─────────────────────────────────────────────────────────────────────────────
// ASSET ICON
// ─────────────────────────────────────────────────────────────────────────────

const AssetIcon = ({ tx, logoIndex, size = 'md' }) => {
  const coin = coinLabel(tx).toUpperCase();
  const symbol = coin === 'NGN' ? 'NGNS' : coin;
  const logo = findAssetLogo(logoIndex, tx.chain, symbol);

  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [logo]);

  const dimensions =
    size === 'lg'
      ? 'w-12 h-12 sm:w-14 sm:h-14'
      : size === 'sm'
      ? 'w-8 h-8'
      : 'w-10 h-10 sm:w-11 sm:h-11';

  const showImg = Boolean(logo) && !broken;

  return (
    <div
      className={`${dimensions} rounded-full flex items-center justify-center flex-shrink-0 relative overflow-hidden border border-white/10 bg-white/[0.06]`}
    >
      {showImg ? (
        <img
          src={logo}
          alt={symbol}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          style={
            symbol === 'NGNS' ? { objectPosition: '48% 60%', transform: 'scale(2)' } : undefined
          }
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="relative text-salvaGold text-[8px] font-black">{symbol.slice(0, 4)}</span>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// TRANSACTION ICON
// ─────────────────────────────────────────────────────────────────────────────

const TxTypeIcon = ({ type }) => {
  if (type === 'receive') {
    return (
      <div className="w-8 h-8 rounded-full bg-emerald-400/[0.08] border border-emerald-400/10 flex items-center justify-center">
        <Icon name="arrowDown" size={14} className="text-emerald-400" />
      </div>
    );
  }

  if (type === 'failed') {
    return (
      <div className="w-8 h-8 rounded-full bg-red-400/[0.08] border border-red-400/10 flex items-center justify-center">
        <span className="text-red-400 font-black text-sm">×</span>
      </div>
    );
  }

  return (
    <div className="w-8 h-8 rounded-full bg-salvaGold/[0.08] border border-salvaGold/10 flex items-center justify-center">
      <Icon name="arrowUp" size={14} className="text-salvaGold" />
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// DETAIL ROW
// ─────────────────────────────────────────────────────────────────────────────

const DetailRow = ({ label, value, mono = false, gold = false, copyable = false, onCopy }) => (
  <div className="group flex items-center justify-between gap-4 py-3 border-b border-white/[0.045] last:border-0">
    <span className="text-[9px] uppercase tracking-[0.18em] text-white/70 font-black flex-shrink-0">
      {label}
    </span>

    <div className="flex items-center gap-2 min-w-0">
      <span
        className={`text-right text-[10px] sm:text-[11px] font-bold truncate ${
          mono ? 'font-mono' : ''
        } ${gold ? 'text-salvaGold' : 'text-white/70'}`}
      >
        {value || '—'}
      </span>

      {copyable && value && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onCopy?.(value);
          }}
          className="opacity-40 group-hover:opacity-100 transition-opacity text-white/50 hover:text-salvaGold"
          aria-label={`Copy ${label}`}
        >
          <Icon name="copy" size={12} />
        </button>
      )}
    </div>
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// TX CARD
// ─────────────────────────────────────────────────────────────────────────────

const TxCard = ({ tx, user, index, onDownload, showMsg, logoIndex }) => {
  const [expanded, setExpanded] = useState(false);

  const dType = getDisplayType(tx, user);
  const isReceived = dType === 'receive';
  const isFailed = dType === 'failed';
  const network = getNetwork(tx);
  const status = getStatus(tx, user);
  const coin = coinLabel(tx);

  const { fromLabel, toLabel } = getTxDisplayNames(tx, user);

  const date = new Date(tx.date || tx.createdAt);
  const amount = getTxAmount(tx);
  const hasFee = tx.fee && parseFloat(tx.fee) > 0;
  const isSwap = tx.txType === 'swap';

  const amountPrefix = isReceived ? '+' : isFailed ? '' : '−';

  const amountColor = isReceived ? 'text-emerald-400' : isFailed ? 'text-white/30' : 'text-white';

  const actionLabel = isSwap ? 'Swap' : isReceived ? 'Received' : isFailed ? 'Failed' : 'Sent';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: index * 0.025,
        duration: 0.22,
        ease: 'easeOut',
      }}
      className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
        expanded
          ? 'border-salvaGold/20 bg-white/[0.045]'
          : 'border-white/[0.065] bg-white/[0.018] hover:bg-white/[0.035] hover:border-white/[0.12]'
      }`}
    >
      {/* Subtle hover glow */}
      <div className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity bg-[radial-gradient(circle_at_15%_50%,rgba(212,175,55,.045),transparent_35%)]" />

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="relative w-full text-left px-3 py-3.5 sm:px-5 sm:py-4"
      >
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Type icon */}
          <TxTypeIcon type={dType} />

          {/* Main identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] sm:text-sm font-black text-white">{actionLabel}</span>

              {isSwap && (
                <span className="text-[7px] sm:text-[8px] px-1.5 py-0.5 rounded-full bg-purple-400/[0.08] border border-purple-400/10 text-purple-300 font-black uppercase tracking-wider">
                  Swap
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-[8px] sm:text-[10px] text-white/75 font-medium">
              <span>
                {isReceived ? `From ${truncateAddr(fromLabel)}` : `To ${truncateAddr(toLabel)}`}
              </span>

              <span className="text-white/10">•</span>

              <span>{getTimeAgo(date)}</span>
            </div>
          </div>

          {/* Amount */}
          <div className="text-right flex-shrink-0">
            <div
              className={`text-[12px] sm:text-base font-black tabular-nums tracking-tight ${amountColor}`}
            >
              {amountPrefix}
              {formatNumber(amount)}
            </div>

            <div className="mt-0.5 flex items-center justify-end gap-1.5">
              <span className="text-[8px] sm:text-[9px] text-white/70 font-black uppercase">
                {coin}
              </span>

              <span
                className={`hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-wider ${status.bg} ${status.border} ${status.color}`}
              >
                <span className={`w-1 h-1 rounded-full mr-1 ${status.dot}`} />
                {status.label}
              </span>
            </div>
          </div>

          {/* Chevron */}
          <div
            className={`w-6 h-6 rounded-full border border-white/[0.06] flex items-center justify-center text-white/20 transition-all duration-300 ${
              expanded
                ? 'rotate-180 border-salvaGold/20 text-salvaGold'
                : 'group-hover:text-white/50'
            }`}
          >
            <Icon name="chevron" size={12} />
          </div>
        </div>

        {/* Mobile status / network strip */}
        <div className="flex items-center gap-2 mt-3 pl-[88px] sm:hidden">
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-wider ${status.bg} ${status.border} ${status.color}`}
          >
            <span className={`w-1 h-1 rounded-full ${status.dot}`} />
            {status.label}
          </span>

          <ChainLogo chain={tx.chain} className="w-4 h-4" />
        </div>

        {/* Desktop metadata */}
        <div className="hidden sm:flex items-center gap-2 mt-3 pl-[92px]">
          <ChainLogo chain={tx.chain} className="w-4 h-4" />

          <span className="text-[8px] text-white/70">
            {date.toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>

          <span className="text-white/10">•</span>

          <span className="text-[8px] text-white/70 font-mono">
            {date.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })}
          </span>
        </div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="relative border-t border-white/[0.06] px-3 pb-4 pt-4 sm:px-5 sm:pb-5">
              {/* Detail header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[8px] uppercase tracking-[0.22em] text-salvaGold/50 font-black">
                    Transaction details
                  </p>
                  <p className="text-[10px] text-white/70 mt-1">Full transaction metadata</p>
                </div>

                <div
                  className={`px-2 py-1 rounded-lg border text-[7px] font-black uppercase tracking-wider ${status.bg} ${status.border} ${status.color}`}
                >
                  {status.icon} {status.label}
                </div>
              </div>

              {/* Summary */}
              <div className="rounded-xl border border-white/[0.055] bg-black/20 p-3 sm:p-4 mb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AssetIcon tx={tx} logoIndex={logoIndex} size="sm" />

                    <div>
                      <p className="text-[8px] uppercase tracking-[0.16em] text-white/70 font-black">
                        Asset
                      </p>
                      <p className="text-sm font-black text-white mt-0.5">{coin}</p>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-[8px] uppercase tracking-[0.16em] text-white/70 font-black">
                      Amount
                    </p>
                    <p
                      className={`text-base sm:text-lg font-black tabular-nums mt-0.5 ${amountColor}`}
                    >
                      {amountPrefix}
                      {formatNumber(amount)}
                    </p>
                  </div>
                </div>
              </div>

              {/* From / To */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <div className="rounded-xl border border-white/[0.055] bg-black/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center">
                      <Icon name="arrowUp" size={11} className="text-white/40" />
                    </div>

                    <span className="text-[8px] uppercase tracking-[0.18em] text-white/70 font-black">
                      From
                    </span>
                  </div>

                  <p className="text-[10px] sm:text-[11px] font-mono text-white/70 break-all">
                    {fromLabel || 'Unknown'}
                  </p>
                </div>

                <div className="rounded-xl border border-white/[0.055] bg-black/20 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-white/[0.05] flex items-center justify-center">
                      <Icon name="arrowDown" size={11} className="text-white/40" />
                    </div>

                    <span className="text-[8px] uppercase tracking-[0.18em] text-white/70 font-black">
                      To
                    </span>
                  </div>

                  <p className="text-[10px] sm:text-[11px] font-mono text-white/70 break-all">
                    {toLabel || 'Unknown'}
                  </p>
                </div>
              </div>

              {/* Metadata */}
              <div className="rounded-xl border border-white/[0.055] bg-black/20 px-3 sm:px-4">
                <DetailRow label="Network" value={network.name} />

                <DetailRow
                  label="Date"
                  value={
                    Number.isNaN(date.getTime())
                      ? 'Unknown'
                      : date.toLocaleString('en-US', {
                          weekday: 'short',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                  }
                />

                <DetailRow
                  label="Time"
                  value={
                    Number.isNaN(date.getTime())
                      ? 'Unknown'
                      : date.toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                          hour12: true,
                        })
                  }
                />

                {hasFee && (
                  <DetailRow
                    label="Network Fee"
                    value={`${formatNumber(tx.fee, {
                      minDecimals: tx.feeCoin === 'NGN' || tx.feeCoin === 'NGNS' ? 0 : 2,
                      maxDecimals: tx.feeCoin === 'NGN' || tx.feeCoin === 'NGNS' ? 0 : 12,
                    })} ${feeCoinLabel(tx)}`}
                    mono
                  />
                )}

                {tx.txType && (
                  <DetailRow label="Transaction Type" value={tx.txType.toUpperCase()} />
                )}

                {tx.taskId && (
                  <DetailRow
                    label="Transaction Hash"
                    value={tx.taskId}
                    mono
                    gold
                    copyable
                    onCopy={async (value) => {
                      await copyText(value);
                      showMsg('Transaction hash copied');
                    }}
                  />
                )}
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {tx.taskId && (
                  <button
                    type="button"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await copyText(tx.taskId);
                      showMsg('Transaction hash copied');
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-white/[0.08] bg-white/[0.025] text-white/45 hover:text-white hover:border-white/15 transition-all text-[8px] uppercase tracking-[0.15em] font-black"
                  >
                    <Icon name="copy" size={12} />
                    Copy Hash
                  </button>
                )}

                {!isFailed && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(tx);
                    }}
                    className="flex items-center justify-center gap-2 py-2.5 rounded-xl border border-salvaGold/20 bg-salvaGold/[0.04] text-salvaGold hover:bg-salvaGold/[0.09] transition-all text-[8px] uppercase tracking-[0.15em] font-black"
                  >
                    <span>↓</span>
                    Download Receipt
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

const Transactions = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState({
    show: false,
    message: '',
    type: 'success',
  });
  const [refreshing, setRefreshing] = useState(false);

  const pollRef = useRef(null);

  useEffect(() => {
    // Chain is per-transaction data (tx.chain, returned by the API) — this
    // page is not scoped to one chain, so it no longer reads a ?chain=
    // query param or switches between separate localStorage user objects.
    // There is exactly one signed-in user, stored under 'salva_user'.
    const saved = localStorage.getItem('salva_user');

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        fetchTransactions(parsed.safeAddress);
      } catch {
        window.location.href = '/login';
      }
    } else {
      window.location.href = '/login';
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  useEffect(() => {
    if (!toast.show) return;

    const timeout = setTimeout(() => {
      setToast((current) => ({
        ...current,
        show: false,
      }));
    }, 3500);

    return () => clearTimeout(timeout);
  }, [toast.show]);

  const fetchTransactions = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/transactions/${address}`);

      const data = await res.json();
      const txList = Array.isArray(data) ? data : [];

      setTransactions(txList);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (message, type = 'success') => {
    setToast({
      show: true,
      message,
      type,
    });
  };

  const handleManualRefresh = useCallback(async () => {
    if (!user?.safeAddress || refreshing) return;

    setRefreshing(true);

    try {
      await fetchTransactions(user.safeAddress);
      showMsg('Transaction history updated');
    } finally {
      setRefreshing(false);
    }
  }, [user?.safeAddress, refreshing]);

  const filtered = useMemo(() => {
    let list = [...transactions].sort(
      (a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)
    );

    if (filter !== 'All') {
      const map = {
        Sent: 'sent',
        Received: 'receive',
        Failed: 'failed',
      };

      list = list.filter((tx) => getDisplayType(tx, user) === map[filter]);
    }

    if (search.trim()) {
      const q = search.toLowerCase();

      list = list.filter((tx) => {
        if (!user) return false;

        const { fromLabel, toLabel } = getTxDisplayNames(tx, user);

        return (
          String(fromLabel || '')
            .toLowerCase()
            .includes(q) ||
          String(toLabel || '')
            .toLowerCase()
            .includes(q) ||
          String(tx.taskId || '')
            .toLowerCase()
            .includes(q) ||
          String(tx.coin || '')
            .toLowerCase()
            .includes(q) ||
          String(tx.chain || '')
            .toLowerCase()
            .includes(q) ||
          String(tx.amount ?? '').includes(q)
        );
      });
    }

    return list;
  }, [transactions, filter, search, user]);

  const logoIndex = useMemo(
    () => buildTxLogoIndex(user?.email, transactions),
    [user?.email, transactions]
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filter, search]);

  // ─────────────────────────────────────────────────────────────────────────
  // RECEIPT GENERATION
  // ─────────────────────────────────────────────────────────────────────────

  const downloadReceipt = async (tx) => {
    if (!user) return;

    const { fromLabel, toLabel } = getTxDisplayNames(tx, user);
    const isReceived = getDisplayType(tx, user) === 'receive';
    // BUG FIX: the Transaction model's `status` field defaults to "success"
    // (see backend/src/models/Transaction.js), never "successful". Comparing
    // against "successful" here meant isSuccessful was false for every
    // normal transaction, so the receipt always rendered the red "TRANSACTION
    // FAILED" badge even for confirmed transfers. Use the same "failed" check
    // the rest of the page already uses (getDisplayType / isTxSuccessful) so
    // the card and the receipt can never disagree.
    const isSuccessful = isTxSuccessful(tx);
    // BUG FIX: the network printed on the receipt must come from THIS
    // transaction's own `chain` field (returned by GET
    // /api/user/transactions/:from — see backend Transaction model, which
    // defaults `chain` to "base"). This page has no single "current chain"
    // of its own — a user's transaction history spans every chain they've
    // used — so there is no page-level BNB/Base flag to fall back on here,
    // by design.
    const txNetworkName = chainDisplayName(tx.chain);
    const coin = coinLabel(tx);
    const hasFee = tx.fee && parseFloat(tx.fee) > 0;

    const W = 640;
    const H = 960;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;

    const ctx = canvas.getContext('2d');

    const GOLD = '#D4AF37';
    const GREEN = '#22C55E';
    const RED = '#EF4444';
    const DARK = '#0A0A0B';

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
    }

    function label(text, x, y, size = 11, color = 'rgba(255,255,255,0.35)', weight = '600') {
      ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = color;
      ctx.fillText(text.toUpperCase(), x, y);
    }

    function value(text, x, y, size = 15, color = '#ffffff', weight = '700') {
      ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      ctx.fillStyle = color;

      const maxW = W - x - 40;
      let t = String(text ?? '');

      while (ctx.measureText(t).width > maxW && t.length > 8) {
        t = t.slice(0, -1);
      }

      if (t !== String(text ?? '')) {
        t = t.slice(0, -1) + '…';
      }

      ctx.fillText(t, x, y);
    }

    function divider(y) {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(W - 40, y);
      ctx.stroke();
    }

    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(212,175,55,0.3)';
    ctx.lineWidth = 1.5;

    roundRect(20, 20, W - 40, H - 40, 20);
    ctx.stroke();

    const grad = ctx.createLinearGradient(20, 20, W - 20, 20);

    grad.addColorStop(0, 'rgba(212,175,55,0)');
    grad.addColorStop(0.5, GOLD);
    grad.addColorStop(1, 'rgba(212,175,55,0)');

    ctx.fillStyle = grad;

    roundRect(20, 20, W - 40, 4, 2);
    ctx.fill();

    ctx.font = "800 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.fillText('SALVA', W / 2, 105);

    ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText('OFFICIAL TRANSACTION RECEIPT', W / 2, 128);

    const badgeY = 148;
    const badgeH = 32;
    const badgeW = isSuccessful ? 280 : 230;
    const badgeX = (W - badgeW) / 2;

    const badgeColor = isSuccessful ? GREEN : RED;

    roundRect(badgeX, badgeY, badgeW, badgeH, 8);

    ctx.fillStyle = isSuccessful ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
    ctx.fill();

    ctx.strokeStyle = isSuccessful ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
    ctx.stroke();

    ctx.font = "700 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = badgeColor;

    const badgeText = isSuccessful
      ? `✓ VERIFIED · ${txNetworkName.toUpperCase()} ${IS_PRODUCTION ? 'MAINNET' : 'TESTNET'}`
      : '✗ TRANSACTION FAILED';

    ctx.fillText(badgeText, W / 2, badgeY + 21);

    ctx.textAlign = 'left';

    const amtY = 220;

    divider(amtY - 20);
    label('Amount', 40, amtY);

    ctx.font = "800 40px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = '#ffffff';

    const amtStr = formatNumber(tx.amount);

    ctx.fillText(amtStr, 40, amtY + 48);

    const amtW = ctx.measureText(amtStr).width;

    ctx.font = "700 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = GOLD;

    ctx.fillText(coin, 40 + amtW + 10, amtY + 48);

    const typeColor = isReceived ? GREEN : GOLD;

    ctx.font = "800 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = typeColor;
    ctx.textAlign = 'right';

    ctx.fillText(isReceived ? 'RECEIVED' : 'SENT', W - 40, amtY + 48);

    ctx.textAlign = 'left';

    if (hasFee) {
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

      ctx.fillStyle = 'rgba(239,68,68,0.7)';

      ctx.fillText(
        `NETWORK FEE: ${formatNumber(tx.fee, {
          minDecimals: tx.feeCoin === 'NGN' || tx.feeCoin === 'NGNS' ? 0 : 2,
          maxDecimals: tx.feeCoin === 'NGN' || tx.feeCoin === 'NGNS' ? 0 : 12,
        })} ${feeCoinLabel(tx)}`,
        40,
        amtY + 72
      );
    }

    const fromY = hasFee ? 340 : 320;

    divider(fromY - 20);

    label('From', 40, fromY);
    value(fromLabel, 40, fromY + 24, 15, '#ffffff', '700');

    if (!isReceived && user.safeAddress) {
      value(user.safeAddress, 40, fromY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    } else if (isReceived && tx.fromAddress) {
      value(tx.fromAddress, 40, fromY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    }

    const toY = fromY + 80;

    label('To', 40, toY);
    value(toLabel, 40, toY + 24, 15, '#ffffff', '700');

    if (isReceived && user.safeAddress) {
      value(user.safeAddress, 40, toY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    } else if (!isReceived && tx.toAddress) {
      value(tx.toAddress, 40, toY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    }

    const dateY = toY + 100;

    divider(dateY - 20);

    const d = new Date(tx.date);

    label('Date & Time', 40, dateY);

    value(
      d.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      40,
      dateY + 24,
      14,
      '#ffffff',
      '700'
    );

    value(
      d.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      }),
      40,
      dateY + 44,
      12,
      'rgba(255,255,255,0.45)',
      '500'
    );

    const netY = dateY + 82;

    label('Network', 40, netY);

    value(
      `${txNetworkName} ${IS_PRODUCTION ? 'Mainnet' : 'Testnet'}`,
      40,
      netY + 24,
      14,
      '#ffffff',
      '700'
    );

    if (tx.taskId) {
      const hashY = netY + 70;

      divider(hashY - 16);

      label('Transaction Hash', 40, hashY);

      const half = Math.ceil(tx.taskId.length / 2);

      ctx.font = '500 10px monospace';
      ctx.fillStyle = 'rgba(212,175,55,0.55)';

      ctx.fillText(tx.taskId.slice(0, half), 40, hashY + 22);

      ctx.fillText(tx.taskId.slice(half), 40, hashY + 38);
    }

    divider(H - 72);

    ctx.font = "500 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';

    ctx.fillText(`Receipt ID: ${tx._id || 'SALVA-' + Date.now()}`, W / 2, H - 52);

    ctx.fillText('salva-nexus.org', W / 2, H - 34);

    const botGrad = ctx.createLinearGradient(20, 0, W - 20, 0);

    botGrad.addColorStop(0, 'rgba(212,175,55,0)');
    botGrad.addColorStop(0.5, GOLD);
    botGrad.addColorStop(1, 'rgba(212,175,55,0)');

    ctx.fillStyle = botGrad;

    ctx.fillRect(20, H - 24, W - 40, 3);

    ctx.textAlign = 'left';

    const fileName = `Salva_Receipt_${Date.now()}.png`;
    const dataUrl = canvas.toDataURL('image/png');

    if (Capacitor.isNativePlatform()) {
      try {
        const base64Data = dataUrl.split(',')[1];

        const writeResult = await Filesystem.writeFile({
          path: fileName,
          data: base64Data,
          directory: Directory.Cache,
        });

        await Share.share({
          title: 'Salva Transaction Receipt',
          text: 'Your Salva transaction receipt',
          url: writeResult.uri,
          dialogTitle: 'Save or share your receipt',
        });

        showMsg('Receipt ready — choose "Save Image" to add it to your gallery');
      } catch (err) {
        const cancelled =
          err?.message?.toLowerCase().includes('cancel') ||
          err?.message?.toLowerCase().includes('dismiss');

        if (!cancelled) {
          console.error('Receipt save failed:', err);

          showMsg('Could not save receipt. Please try again.', 'error');
        }
      }

      return;
    }

    const link = document.createElement('a');

    link.download = fileName;
    link.href = dataUrl;
    link.click();

    showMsg('Receipt saved as image');
  };

  if (!user) return null;

  const successfulCount = transactions.filter((tx) => getDisplayType(tx, user) !== 'failed').length;

  const failedCount = transactions.filter((tx) => getDisplayType(tx, user) === 'failed').length;

  return (
    <div className="min-h-screen bg-[#070708] text-white pt-16 pb-16 px-3 sm:px-6 relative overflow-hidden">
      {/* Background atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[650px] h-[350px] rounded-full bg-salvaGold/[0.035] blur-[120px]" />

        <div className="absolute top-[35%] -left-40 w-[350px] h-[350px] rounded-full bg-purple-500/[0.025] blur-[120px]" />

        <div className="absolute bottom-0 right-0 w-[400px] h-[300px] rounded-full bg-blue-500/[0.02] blur-[120px]" />
      </div>

      <Stars />

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Back */}
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[8px] uppercase tracking-[0.22em] text-white/25 hover:text-salvaGold transition-colors mb-6 font-black"
        >
          ← Dashboard
        </a>

        {/* Hero */}
        <header className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-salvaGold shadow-[0_0_12px_rgba(212,175,55,.6)]" />

                <p className="text-[8px] uppercase tracking-[0.28em] text-salvaGold/60 font-black">
                  DeFi Activity
                </p>
              </div>

              <h1 className="text-2xl sm:text-4xl font-black tracking-[-0.04em]">
                Transaction History
              </h1>

              <p className="text-[10px] sm:text-xs text-white/75 mt-2">
                Your complete on-chain activity, across every network you've used.
              </p>
            </div>
          </div>
        </header>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] px-3 py-3 sm:px-4 sm:py-4">
            <p className="text-[7px] sm:text-[8px] uppercase tracking-[0.18em] text-white/70 font-black">
              Total
            </p>

            <p className="text-lg sm:text-xl font-black mt-1">{transactions.length}</p>

            <p className="text-[7px] text-white/70 mt-0.5">Transactions</p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] px-3 py-3 sm:px-4 sm:py-4">
            <p className="text-[7px] sm:text-[8px] uppercase tracking-[0.18em] text-white/70 font-black">
              Confirmed
            </p>

            <p className="text-lg sm:text-xl font-black text-emerald-400 mt-1">{successfulCount}</p>

            <p className="text-[7px] text-white/70 mt-0.5">Successful</p>
          </div>

          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] px-3 py-3 sm:px-4 sm:py-4">
            <p className="text-[7px] sm:text-[8px] uppercase tracking-[0.18em] text-white/70 font-black">
              Failed
            </p>

            <p
              className={`text-lg sm:text-xl font-black mt-1 ${
                failedCount ? 'text-red-400' : 'text-white/30'
              }`}
            >
              {failedCount}
            </p>

            <p className="text-[7px] text-white/70 mt-0.5">Unsuccessful</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] p-2 sm:p-2.5 mb-4">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Filters */}
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide">
              {FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={`flex-shrink-0 px-3 py-2 rounded-xl text-[7px] sm:text-[8px] font-black uppercase tracking-[0.16em] transition-all ${
                    filter === f
                      ? 'bg-salvaGold text-black shadow-[0_4px_20px_rgba(212,175,55,.12)]'
                      : 'text-white/30 hover:text-white/70 hover:bg-white/[0.04]'
                  }`}
                >
                  {f}
                </button>
              ))}

              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={refreshing || loading}
                aria-label="Refresh transactions"
                className="ml-auto flex-shrink-0 w-9 h-9 rounded-xl border border-white/[0.07] text-white/25 hover:text-salvaGold hover:border-salvaGold/25 transition-all flex items-center justify-center disabled:opacity-30"
              >
                <Icon name="refresh" size={14} className={refreshing ? 'animate-spin' : ''} />
              </button>
            </div>

            {/* Search */}
            <div className="relative sm:w-64 sm:ml-auto">
              <Icon
                name="search"
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20"
              />

              <input
                type="text"
                placeholder="Search address, hash, asset..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/[0.07] bg-black/20 text-[9px] sm:text-[10px] text-white placeholder:text-white/20 focus:outline-none focus:border-salvaGold/25 transition-all"
              />
            </div>
          </div>
        </div>

        {/* Results count */}
        {!loading && filtered.length > 0 && (
          <div className="flex items-center justify-between px-1 mb-2">
            <p className="text-[8px] text-white/70 uppercase tracking-[0.16em] font-black">
              {filter === 'All' ? 'All activity' : `${filter} activity`}
            </p>

            <p className="text-[8px] text-white/70 font-medium">
              {filtered.length} result
              {filtered.length === 1 ? '' : 's'}
            </p>
          </div>
        )}

        {/* Content */}
        {loading ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] py-24 flex flex-col items-center justify-center">
            <div className="w-8 h-8 border-2 border-salvaGold/15 border-t-salvaGold rounded-full animate-spin" />

            <p className="text-[8px] uppercase tracking-[0.2em] text-white/70 font-black mt-4">
              Loading activity
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.018] py-24 px-6 text-center">
            <div className="w-14 h-14 rounded-full mx-auto border border-white/[0.07] bg-white/[0.025] flex items-center justify-center">
              {search ? (
                <Icon name="search" size={20} className="text-white/20" />
              ) : (
                <span className="text-xl opacity-40">◌</span>
              )}
            </div>

            <p className="font-black text-white/50 text-sm mt-4">No transactions found</p>

            <p className="text-[9px] text-white/70 mt-1.5">
              {search ? 'Try a different search term.' : 'Your on-chain activity will appear here.'}
            </p>

            {(search || filter !== 'All') && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  setFilter('All');
                }}
                className="mt-4 text-salvaGold text-[8px] uppercase tracking-[0.18em] font-black hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {paginated.map((tx, i) => (
                <TxCard
                  key={tx._id || i}
                  tx={tx}
                  user={user}
                  index={i}
                  onDownload={downloadReceipt}
                  showMsg={showMsg}
                  logoIndex={logoIndex}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-5 px-1">
                <p className="text-[8px] text-white/70 font-medium">
                  Showing <span className="text-white/70">{(page - 1) * PAGE_SIZE + 1}</span> –{' '}
                  <span className="text-white/70">
                    {Math.min(page * PAGE_SIZE, filtered.length)}
                  </span>{' '}
                  of <span className="text-white/70">{filtered.length}</span>
                </p>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="w-9 h-9 rounded-xl border border-white/[0.07] text-white/30 hover:text-white hover:border-white/15 disabled:opacity-20 transition-all flex items-center justify-center text-xs"
                  >
                    ←
                  </button>

                  <div className="min-w-9 h-9 px-2 rounded-xl border border-salvaGold/15 bg-salvaGold/[0.04] text-salvaGold flex items-center justify-center text-[8px] font-black">
                    {page} / {totalPages}
                  </div>

                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="w-9 h-9 rounded-xl border border-white/[0.07] text-white/30 hover:text-white hover:border-white/15 disabled:opacity-20 transition-all flex items-center justify-center text-xs"
                  >
                    →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{
              y: 20,
              opacity: 0,
              scale: 0.96,
            }}
            animate={{
              y: 0,
              opacity: 1,
              scale: 1,
            }}
            exit={{
              y: 20,
              opacity: 0,
              scale: 0.96,
            }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-4 py-3 rounded-2xl font-black text-[8px] uppercase tracking-[0.14em] z-[100] shadow-2xl backdrop-blur-xl border ${
              toast.type === 'error'
                ? 'bg-red-500/90 text-white border-red-400/20 shadow-red-500/20'
                : 'bg-salvaGold/95 text-black border-white/10 shadow-salvaGold/20'
            }`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Transactions;