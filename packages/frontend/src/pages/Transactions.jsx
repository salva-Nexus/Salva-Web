// Salva-Digital-Tech/packages/frontend/src/pages/Transactions.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import Stars from '../components/Stars';

// ── FROM/TO display logic ──────────────────────────────────────────────────
function getTxDisplayNames(tx, user) {
  const myAlias = user.nameAlias || null;
  const myName = user.username || user.safeAddress;
  const isReceived = tx.displayType === 'receive';
  const isSentOrFailed = tx.displayType === 'sent' || tx.displayType === 'failed';

  let fromLabel = '—';
  let toLabel = '—';

  if (isSentOrFailed) {
    // Did the sender type an address or a name alias as the recipient?
    const sdi = tx.senderDisplayIdentifier || '';
    const senderUsedAddress = sdi.startsWith('0x') || sdi === '';

    if (senderUsedAddress) {
      // Address input → show raw addresses on both sides
      fromLabel = tx.fromAddress || user.safeAddress || myName;
      toLabel = tx.toAddress || sdi || 'Unknown';
    } else {
      // Name alias input → show sender alias/username FROM, name alias TO
      fromLabel = myAlias || myName;
      toLabel = sdi || tx.toNameAlias || tx.toUsername || tx.toAddress || 'Unknown';
    }
  } else if (isReceived) {
    // For received: show who sent it and who received it
    fromLabel = tx.fromNameAlias || tx.fromUsername || tx.fromAddress || 'Unknown';
    toLabel = myAlias || myName;
  }

  return { fromLabel, toLabel };
}

// ── Helpers ────────────────────────────────────────────────────────────────
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

const coinLabel = (tx) => (tx.coin === 'NGN' ? 'NGNs' : tx.coin || 'NGNs');

const FILTERS = ['All', 'Pending', 'Sent', 'Received', 'Failed'];
const PAGE_SIZE = 20;

// ── Network label — driven by NODE_ENV ────────────────────────────────────────
const NETWORK_LABEL = process.env.NODE_ENV === 'production' ? 'Base Mainnet' : 'Base Testnet';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// ── TX Row Card ────────────────────────────────────────────────────────────
const TxCard = ({ tx, user, index, onDownload, showMsg, setTransactions }) => {
  const [expanded, setExpanded] = useState(false);

  const isPending = tx.displayType === 'pending';
  const isReceived = tx.displayType === 'receive';
  const isFailed = tx.displayType === 'failed';
  const isSuccess = tx.displayType === 'sent' || isReceived;
  const coin = coinLabel(tx);
  const hasFee = tx.fee && parseFloat(tx.fee) > 0;
  const { fromLabel, toLabel } = isPending
    ? { fromLabel: user.username || user.safeAddress, toLabel: tx.displayPartner || '—' }
    : getTxDisplayNames(tx, user);
  const d = new Date(tx.date);

  const typeLabel = isPending ? 'Pending' : isReceived ? 'Received' : isFailed ? 'Failed' : 'Sent';
  const dotColor = isPending
    ? 'bg-yellow-400 animate-pulse'
    : isReceived
      ? 'bg-green-500'
      : isFailed
        ? 'bg-red-500'
        : 'bg-blue-500';
  const typeColor = isPending
    ? 'text-yellow-400'
    : isReceived
      ? 'text-green-400'
      : isFailed
        ? 'text-red-400'
        : 'text-blue-400';
  const amtColor = isPending
    ? 'text-yellow-400/70'
    : isReceived
      ? 'text-green-400'
      : isFailed
        ? 'text-white/25'
        : 'text-white';
  const amtPrefix = isReceived ? '+' : isFailed ? '' : isPending ? '~' : '−';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.015, duration: 0.15 }}
      className="border border-white/[0.07] bg-white/[0.02] rounded-2xl overflow-hidden hover:border-white/[0.14] transition-colors"
    >
      {/* Main row — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 sm:gap-4 px-4 py-4 text-left"
      >
        {/* status dot */}
        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />

        {/* date */}
        <div className="w-[72px] flex-shrink-0 hidden sm:block">
          <p className="text-[10px] font-black text-white/50">
            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
          <p className="text-[9px] font-mono text-white/20 mt-0.5">
            {d.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })}
          </p>
        </div>

        {/* type pill */}
        <span
          className={`text-[9px] font-black uppercase tracking-widest w-[58px] flex-shrink-0 ${typeColor}`}
        >
          {typeLabel}
        </span>

        {/* counterparty */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-black text-white truncate">
            {(() => {
              const label = isPending ? toLabel : isReceived ? fromLabel : toLabel;
              if (label && label.startsWith('0x') && label.length > 14) {
                return `${label.slice(0, 6)}...${label.slice(-4)}`;
              }
              return label;
            })()}
          </p>
          {/* mobile date */}
          <p className="text-[9px] font-mono text-white/20 mt-0.5 sm:hidden">
            {d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} ·{' '}
            {d.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            })}
          </p>
        </div>

        {/* amount + cancel */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className={`text-sm font-black tabular-nums ${amtColor}`}>
              {amtPrefix}
              {formatNumber(tx.amount)}
            </p>
            <p className="text-[9px] text-white/25 font-bold">{coin}</p>
          </div>
        </div>

        {/* chevron */}
        <svg
          className={`w-3 h-3 text-white/20 flex-shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 border-t border-white/[0.06] space-y-3">
              {/* From / To */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 font-black mb-1">
                    From
                  </p>
                  <p className="text-xs font-black text-salvaGold break-all">{fromLabel}</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <p className="text-[9px] uppercase tracking-[0.3em] text-white/25 font-black mb-1">
                    To
                  </p>
                  <p className="text-xs font-black text-white break-all">{toLabel}</p>
                </div>
              </div>

              {/* Fee + hash row */}
              <div className="flex items-center gap-3 flex-wrap">
                {hasFee && (
                  <div className="px-3 py-1.5 rounded-lg bg-red-500/5 border border-red-500/15">
                    <p className="text-[9px] uppercase text-white/25 font-black">Fee</p>
                    <p className="text-xs font-black text-red-400/70">
                      −{parseFloat(tx.fee).toFixed(tx.coin === 'NGN' ? 0 : 3)} {coin}
                    </p>
                  </div>
                )}
                {tx.taskId && (
                  <div className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05]">
                    <p className="text-[9px] uppercase text-white/25 font-black">Tx Hash</p>
                    <p className="text-[9px] font-mono text-salvaGold/50 truncate">{tx.taskId}</p>
                  </div>
                )}
              </div>

              {/* Receipt button */}
              {isSuccess && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(tx);
                  }}
                  className="w-full py-2.5 rounded-xl border border-salvaGold/25 text-salvaGold font-black text-[10px] uppercase tracking-widest hover:bg-salvaGold/10 transition-all"
                >
                  Download Receipt
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Component ──────────────────────────────────────────────────────────────
const Transactions = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [toast, setToast] = useState({ show: false, message: '' });

  const pollRef = useRef(null);

  useEffect(() => {
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
    if (toast.show) {
      const t = setTimeout(() => setToast((n) => ({ ...n, show: false })), 3500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const fetchTransactions = async (address, prevTxs = null) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transactions/${address}`);
      const data = await res.json();
      const txList = Array.isArray(data) ? data : [];

      // Detect transitions: pending → sent (success)
      if (prevTxs !== null) {
        const prevPendingIds = new Set(
          prevTxs.filter((t) => t.displayType === 'pending').map((t) => String(t._id))
        );
        const nowSuccessful = txList.filter(
          (t) => t.displayType === 'sent' && new Date(t.date) > new Date(Date.now() - 300_000)
        );
        // If something that was pending is now successful
        if (prevPendingIds.size > 0 && nowSuccessful.length > 0) {
          showMsg('✅ Transfer Successful!');
        }
        // If something was pending and is now failed
        const wasOnlyFailed =
          prevPendingIds.size > 0 &&
          txList.every((t) => t.displayType !== 'pending') &&
          txList.some(
            (t) => t.displayType === 'failed' && new Date(t.date) > new Date(Date.now() - 300_000)
          );
        if (wasOnlyFailed) {
          showMsg('❌ Transaction failed on-chain', 'error');
        }
      }

      setTransactions(txList);

      // Trigger queue processor
      fetch(`${SALVA_API_URL}/api/queue/process/${address}`, {
        method: 'POST',
      }).catch(() => {});

      // Start or stop polling based on whether pending txs exist
      const hasPending = txList.some((t) => t.displayType === 'pending');
      if (hasPending) {
        if (!pollRef.current) {
          pollRef.current = setInterval(() => {
            setTransactions((current) => {
              // pass current as prevTxs so we can detect changes
              fetchTransactions(address, current);
              return current;
            });
          }, 8000);
        }
      } else {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const showMsg = (msg, type = 'success') => setToast({ show: true, message: msg, type });

  const filtered = useMemo(() => {
    let list = [...transactions];
    if (filter !== 'All') {
      const map = {
        Pending: 'pending',
        Sent: 'sent',
        Received: 'receive',
        Failed: 'failed',
      };
      list = list.filter((tx) => tx.displayType === map[filter]);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((tx) => {
        if (!user) return false;
        const { fromLabel, toLabel } = getTxDisplayNames(tx, user);
        return (
          fromLabel.toLowerCase().includes(q) ||
          toLabel.toLowerCase().includes(q) ||
          (tx.taskId || '').toLowerCase().includes(q) ||
          String(tx.amount).includes(q)
        );
      });
    }
    return list;
  }, [transactions, filter, search, user]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, search]);

  // ── Receipt — Canvas → PNG image download ─────────────────────────────
  const downloadReceipt = (tx) => {
    if (!user) return;

    const { fromLabel, toLabel } = getTxDisplayNames(tx, user);
    const isReceived = tx.displayType === 'receive';
    const isSuccessful = tx.status === 'successful';
    const coin = coinLabel(tx);
    const hasFee = tx.fee && parseFloat(tx.fee) > 0;

    // Canvas dimensions — portrait receipt card
    const W = 640,
      H = 960;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // ── Helpers ──────────────────────────────────────────────────────────
    const GOLD = '#D4AF37';
    const GREEN = '#22C55E';
    const RED = '#EF4444';
    const DARK = '#0A0A0B';
    const GREY = '#3F3F46';

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
      // Truncate long strings to fit
      const maxW = W - x - 40;
      let t = text;
      while (ctx.measureText(t).width > maxW && t.length > 8) t = t.slice(0, -1);
      if (t !== text) t = t.slice(0, -1) + '…';
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

    // ── Background ────────────────────────────────────────────────────────
    ctx.fillStyle = DARK;
    ctx.fillRect(0, 0, W, H);

    // Outer border
    ctx.strokeStyle = 'rgba(212,175,55,0.3)';
    ctx.lineWidth = 1.5;
    roundRect(20, 20, W - 40, H - 40, 20);
    ctx.stroke();

    // Gold top accent bar
    const grad = ctx.createLinearGradient(20, 20, W - 20, 20);
    grad.addColorStop(0, 'rgba(212,175,55,0)');
    grad.addColorStop(0.5, GOLD);
    grad.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = grad;
    roundRect(20, 20, W - 40, 4, 2);
    ctx.fill();

    // ── SALVA wordmark ────────────────────────────────────────────────────
    ctx.font = "800 52px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = GOLD;
    ctx.textAlign = 'center';
    ctx.fillText('SALVA', W / 2, 105);

    ctx.font = "500 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.letterSpacing = '0.2em';
    ctx.fillText('OFFICIAL TRANSACTION RECEIPT', W / 2, 128);
    ctx.letterSpacing = '0';

    // ── Verified / Failed badge ───────────────────────────────────────────
    const badgeY = 148;
    const badgeH = 32;
    const badgeW = isSuccessful ? 280 : 230;
    const badgeX = (W - badgeW) / 2;
    const badgeColor = isSuccessful ? GREEN : RED;

    roundRect(badgeX, badgeY, badgeW, badgeH, 8);
    ctx.fillStyle = isSuccessful ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)';
    ctx.fill();
    ctx.strokeStyle = isSuccessful ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.font = "700 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = badgeColor;
    ctx.textAlign = 'center';
    const badgeText = isSuccessful
      ? `✓  VERIFIED  ·  ${NETWORK_LABEL.toUpperCase()}`
      : '✗  TRANSACTION FAILED';
    ctx.fillText(badgeText, W / 2, badgeY + 21);

    ctx.textAlign = 'left';

    // ── Amount block ──────────────────────────────────────────────────────
    const amtY = 220;
    divider(amtY - 20);

    label('Amount', 40, amtY);

    ctx.font = `800 40px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`;
    ctx.fillStyle = '#ffffff';
    const amtStr = formatNumber(tx.amount);
    ctx.fillText(amtStr, 40, amtY + 48);
    // coin label in gold next to amount
    const amtW = ctx.measureText(amtStr).width;
    ctx.font = "700 18px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = GOLD;
    ctx.fillText(coin, 40 + amtW + 10, amtY + 48);

    // Type badge (right side)
    const typeColor = isReceived ? GREEN : GOLD;
    ctx.font = "800 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = typeColor;
    ctx.textAlign = 'right';
    ctx.fillText(isReceived ? 'RECEIVED' : 'SENT', W - 40, amtY + 48);
    ctx.textAlign = 'left';

    // Fee
    if (hasFee) {
      ctx.font = "600 11px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      ctx.fillStyle = 'rgba(239,68,68,0.7)';
      ctx.fillText(
        `NETWORK FEE: ${parseFloat(tx.fee).toFixed(tx.coin === 'NGN' ? 0 : 3)} ${coin}`,
        40,
        amtY + 72
      );
    }

    // ── FROM / TO ─────────────────────────────────────────────────────────
    const fromY = hasFee ? 340 : 320;
    divider(fromY - 20);

    // FROM
    label('From', 40, fromY);
    value(fromLabel, 40, fromY + 24, 15, '#ffffff', '700');
    // wallet address below
    if (!isReceived && user.safeAddress) {
      value(user.safeAddress, 40, fromY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    } else if (isReceived && tx.fromAddress) {
      value(tx.fromAddress, 40, fromY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    }

    // TO
    const toY = fromY + 80;
    label('To', 40, toY);
    value(toLabel, 40, toY + 24, 15, '#ffffff', '700');
    if (isReceived && user.safeAddress) {
      value(user.safeAddress, 40, toY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    } else if (!isReceived && tx.toAddress) {
      value(tx.toAddress, 40, toY + 44, 10, 'rgba(255,255,255,0.25)', '500');
    }

    // ── Date / Time ───────────────────────────────────────────────────────
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

    // ── Network ───────────────────────────────────────────────────────────
    const netY = dateY + 82;
    label('Network', 40, netY);
    value(NETWORK_LABEL, 40, netY + 24, 14, '#ffffff', '700');

    // ── Tx Hash ───────────────────────────────────────────────────────────
    if (tx.taskId) {
      const hashY = netY + 70;
      divider(hashY - 16);
      label('Transaction Hash', 40, hashY);
      // split hash into two lines
      const half = Math.ceil(tx.taskId.length / 2);
      ctx.font = '500 10px monospace';
      ctx.fillStyle = 'rgba(212,175,55,0.55)';
      ctx.fillText(tx.taskId.slice(0, half), 40, hashY + 22);
      ctx.fillText(tx.taskId.slice(half), 40, hashY + 38);
    }

    // ── Footer ────────────────────────────────────────────────────────────
    divider(H - 72);

    // Receipt ID
    ctx.font = "500 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.textAlign = 'center';
    ctx.fillText(`Receipt ID: ${tx._id || 'SALVA-' + Date.now()}`, W / 2, H - 52);
    ctx.fillText('salva-nexus.org', W / 2, H - 34);

    // Bottom gold bar
    const botGrad = ctx.createLinearGradient(20, 0, W - 20, 0);
    botGrad.addColorStop(0, 'rgba(212,175,55,0)');
    botGrad.addColorStop(0.5, GOLD);
    botGrad.addColorStop(1, 'rgba(212,175,55,0)');
    ctx.fillStyle = botGrad;
    ctx.fillRect(20, H - 24, W - 40, 3);

    ctx.textAlign = 'left';

    // ── Download as PNG ───────────────────────────────────────────────────
    const link = document.createElement('a');
    link.download = `Salva_Receipt_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showMsg('Receipt saved as image');
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white pt-16 px-2 pb-12 relative overflow-hidden">
      <Stars />

      <div className="max-w-2xl mx-auto relative z-10">
        {/* ── Back ── */}
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-[8px] uppercase tracking-[0.3em] text-white/25 hover:text-salvaGold transition-colors mb-5 font-black"
        >
          ← Dashboard
        </Link>

        {/* ── Header ── */}
        <header className="mb-5">
          <p className="text-[8px] uppercase tracking-[0.35em] text-salvaGold/60 font-black mb-1">
            Transaction History
          </p>
          <h1 className="text-xl sm:text-4xl font-black tracking-tight">{user.username}</h1>
        </header>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          {/* Filter pills */}
          <div className="flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest border transition-all ${
                  filter === f
                    ? 'bg-salvaGold text-black border-salvaGold'
                    : 'border-white/10 text-white/30 hover:text-white/60 hover:border-white/20'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/20"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs border border-white/10 bg-white/[0.03] text-white placeholder:text-white/20 focus:outline-none focus:border-salvaGold/40 transition-all"
            />
          </div>
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-3xl mb-3">📭</p>
            <p className="font-black text-white/40 text-sm">No transactions found</p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="text-salvaGold text-xs font-black mt-3 underline underline-offset-4"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Column headers — desktop only */}
            <div className="hidden sm:flex items-center gap-3 sm:gap-4 px-4 mb-2">
              <div className="w-2 flex-shrink-0" />
              <div className="w-[72px] flex-shrink-0">
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/20 font-black">
                  Date
                </p>
              </div>
              <div className="w-[58px] flex-shrink-0">
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/20 font-black">
                  Type
                </p>
              </div>
              <div className="flex-1">
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/20 font-black">
                  Counterparty
                </p>
              </div>
              <div className="text-right flex-shrink-0 pr-6">
                <p className="text-[8px] uppercase tracking-[0.3em] text-white/20 font-black">
                  Amount
                </p>
              </div>
            </div>

            {/* Feed */}
            <div className="space-y-2">
              {paginated.map((tx, i) => (
                <TxCard
                  key={tx._id || i}
                  tx={tx}
                  user={user}
                  index={i}
                  onDownload={downloadReceipt}
                  showMsg={showMsg}
                  setTransactions={setTransactions}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 px-1">
                <p className="text-[9px] text-white/25 font-bold">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of{' '}
                  {filtered.length}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest disabled:opacity-20 hover:border-salvaGold/40 transition-all"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg border border-white/10 text-[9px] font-black uppercase tracking-widest disabled:opacity-20 hover:border-salvaGold/40 transition-all"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast.show && (
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-2.5 rounded-2xl font-black text-[10px] uppercase tracking-widest z-[100] shadow-2xl ${toast.type === 'error' ? 'bg-red-500 text-white shadow-red-500/20' : 'bg-salvaGold text-black shadow-salvaGold/20'}`}
          >
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Transactions;
