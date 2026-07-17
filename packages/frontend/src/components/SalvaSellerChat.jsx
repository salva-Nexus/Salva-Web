// Salva-Digital-Tech/packages/frontend/src/components/SalvaSellerChat.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';

// ── Mobile content-scale helpers ────────────────────────────────────────────
// Container size (card width/height/border) is NEVER touched by these — only
// font sizes, padding, gaps, icon/avatar boxes, and border radii use them.
// --cscale is defined once below via a <style> tag: 1 on desktop/tablet,
// 0.7 (30% smaller) under 640px. Every value below reads that variable live,
// so it's a pure CSS media-query response — no JS resize listeners needed.
const px = (n) => `calc(${n}px * var(--cscale, 1))`;
const pxs = (...vals) => vals.map((v) => (typeof v === 'number' ? px(v) : v)).join(' ');

const ContentScaleStyle = () => (
  <style>{`
    .ssc-scale { --cscale: 1; }
    @media (max-width: 639px) {
      .ssc-scale { --cscale: 0.7; }
    }
  `}</style>
);

// ── Status meta ────────────────────────────────────────────────────────────
const STATUS_META = {
  pending: {
    label: 'Pending',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.3)',
  },
  paid: {
    label: 'Paid·Receipt',
    color: '#D4AF37',
    bg: 'rgba(212,175,55,0.12)',
    border: 'rgba(212,175,55,0.35)',
  },
  minting: {
    label: 'Minting…',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,0.12)',
    border: 'rgba(59,130,246,0.3)',
  },
  minted: {
    label: 'Minted ✓',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.3)',
  },
  rejected: {
    label: 'Rejected',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
  },
  burned: {
    label: 'Burned 🔥',
    color: '#ef4444',
    bg: 'rgba(239,68,68,0.12)',
    border: 'rgba(239,68,68,0.3)',
  },
  sell_completed: {
    label: 'Completed ✓',
    color: '#22c55e',
    bg: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.3)',
  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      style={{
        padding: pxs(2, 8),
        borderRadius: px(8),
        background: m.bg,
        border: `1px solid ${m.border}`,
        color: m.color,
        fontSize: px(9),
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        flexShrink: 0,
      }}
    >
      {m.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const isSell = type === 'sell';
  return (
    <span
      style={{
        padding: pxs(1, 6),
        borderRadius: px(6),
        fontSize: px(8),
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        background: isSell ? 'rgba(239,68,68,0.15)' : 'rgba(212,175,55,0.15)',
        color: isSell ? '#ef4444' : '#D4AF37',
        border: `1px solid ${isSell ? 'rgba(239,68,68,0.3)' : 'rgba(212,175,55,0.3)'}`,
        flexShrink: 0,
      }}
    >
      {isSell ? 'SELL' : 'BUY'}
    </span>
  );
}

function ChainBadge({ chain, isL1 }) {
  const onL1 = isL1 === true || chain === 'bnb';
  if (!onL1) return null;
  return (
    <span
      style={{
        padding: pxs(1, 6),
        borderRadius: px(6),
        fontSize: px(8),
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        background: 'rgba(59,130,246,0.15)',
        color: '#60a5fa',
        border: '1px solid rgba(59,130,246,0.3)',
        flexShrink: 0,
      }}
    >
      BSC
    </span>
  );
}

function RichText({ text, isMine }) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: isMine ? 'rgba(0,0,0,0.85)' : '#D4AF37' }}>
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

// ── Copy button with feedback ──────────────────────────────────────────────
const CopyBtn = ({ value }) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      style={{
        padding: pxs(4, 10),
        borderRadius: px(7),
        background: copied ? 'rgba(34,197,94,0.18)' : 'rgba(212,175,55,0.12)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(212,175,55,0.3)'}`,
        color: copied ? '#22c55e' : '#D4AF37',
        fontSize: px(9),
        fontWeight: '700',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        flexShrink: 0,
        transition: 'all 0.2s',
      }}
      onMouseEnter={(e) => {
        if (!copied) e.currentTarget.style.background = 'rgba(212,175,55,0.22)';
      }}
      onMouseLeave={(e) => {
        if (!copied) e.currentTarget.style.background = 'rgba(212,175,55,0.12)';
      }}
    >
      {copied ? '✓ Copied!' : 'Copy'}
    </button>
  );
};

// ── Message Input ──────────────────────────────────────────────────────────
const MessageInput = memo(({ onSend, onImage, disabled }) => {
  const [text, setText] = useState('');
  const ref = useRef(null);
  const fileRef = useRef(null);

  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = Math.min(ref.current.scrollHeight, 100) + 'px';
  };

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText('');
    if (ref.current) {
      ref.current.style.height = 'auto';
      ref.current.focus();
    }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      alert('Max 6MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => onImage(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div
      style={{
        padding: pxs(10, 12),
        background: '#0d0d0e',
        borderTop: '1px solid rgba(212,175,55,0.12)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: px(8), alignItems: 'flex-end' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Upload image"
          style={{
            flexShrink: 0,
            width: px(36),
            height: px(36),
            borderRadius: px(9),
            background: 'rgba(212,175,55,0.12)',
            border: '1px solid rgba(212,175,55,0.2)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <svg
            style={{ width: px(14), height: px(14) }}
            fill="none"
            stroke="#D4AF37"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          placeholder="Reply to user…"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            padding: pxs(9, 12),
            borderRadius: px(10),
            border: '1px solid rgba(212,175,55,0.2)',
            background: '#1a1a1b',
            color: '#f5f0e8',
            fontSize: px(12.5),
            outline: 'none',
            resize: 'none',
            overflowY: 'hidden',
            lineHeight: '1.5',
            fontFamily: 'inherit',
            minHeight: px(36),
            maxHeight: '100px',
            transition: 'border-color 0.2s',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.2)')}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={{
            width: px(36),
            height: px(36),
            borderRadius: px(9),
            flexShrink: 0,
            background:
              disabled || !text.trim()
                ? 'rgba(212,175,55,0.15)'
                : 'linear-gradient(135deg, #D4AF37, #b8941e)',
            border: 'none',
            cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s',
          }}
        >
          <svg
            style={{ width: px(14), height: px(14) }}
            fill={disabled || !text.trim() ? 'rgba(212,175,55,0.4)' : '#000'}
            viewBox="0 0 24 24"
          >
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
});

// ── Seller Bubble ──────────────────────────────────────────────────────────
const SellerBubble = memo(({ msg }) => {
  const isMine = msg.sender === 'seller';

  if (msg.isMinted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: pxs(6, 0),
          padding: pxs(12, 14),
          borderRadius: px(14),
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.05))',
          border: '1px solid rgba(34,197,94,0.35)',
        }}
      >
        <span style={{ fontSize: px(22) }}>🎉</span>
        <div style={{ display: 'flex', justifyContent: 'center', margin: pxs(4, 0) }}>
          <TypeBadge type="buy" />
        </div>
        <p
          style={{
            color: '#22c55e',
            fontWeight: '900',
            fontSize: px(12),
            margin: `0 0 ${px(3)}`,
          }}
        >
          Minted Successfully
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: px(10),
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          <RichText text={msg.text} isMine={false} />
        </p>
      </motion.div>
    );
  }

  if (msg.isBurned) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: pxs(6, 0),
          padding: pxs(12, 14),
          borderRadius: px(14),
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))',
          border: '1px solid rgba(239,68,68,0.35)',
        }}
      >
        <span style={{ fontSize: px(22) }}>🔥</span>
        <div style={{ display: 'flex', justifyContent: 'center', margin: pxs(4, 0) }}>
          <TypeBadge type="sell" />
        </div>
        <p
          style={{
            color: '#ef4444',
            fontWeight: '900',
            fontSize: px(12),
            margin: `0 0 ${px(3)}`,
          }}
        >
          Sell Request
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.5)',
            fontSize: px(10),
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          <RichText text={msg.text} isMine={false} />
        </p>
      </motion.div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isMine ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: px(5),
      }}
    >
      {!isMine && (
        <div
          style={{
            width: px(24),
            height: px(24),
            borderRadius: px(7),
            flexShrink: 0,
            background: 'rgba(212,175,55,0.15)',
            border: '1px solid rgba(212,175,55,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: px(10),
            fontWeight: '900',
            color: '#D4AF37',
          }}
        >
          U
        </div>
      )}
      <div
        style={{
          maxWidth: '78%',
          padding: pxs(9, 12),
          borderRadius: isMine ? pxs(14, 14, 4, 14) : pxs(14, 14, 14, 4),
          background: isMine
            ? 'linear-gradient(135deg, #D4AF37, #b8941e)'
            : 'rgba(255,255,255,0.05)',
          border: isMine ? 'none' : '1px solid rgba(212,175,55,0.12)',
        }}
      >
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="attachment"
            style={{
              maxWidth: '100%',
              maxHeight: px(160),
              borderRadius: px(8),
              marginBottom: msg.text ? px(6) : 0,
              display: 'block',
              objectFit: 'contain',
            }}
          />
        )}
        {msg.isReceipt && (
          <div
            style={{
              padding: pxs(4, 8),
              borderRadius: px(6),
              background: 'rgba(212,175,55,0.15)',
              border: '1px solid rgba(212,175,55,0.3)',
              color: '#D4AF37',
              fontSize: px(9),
              fontWeight: '700',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              marginBottom: px(6),
              display: 'inline-block',
            }}
          >
            📎 Payment Receipt
          </div>
        )}
        {msg.text && (
          <p
            style={{
              fontSize: px(11),
              color: isMine ? '#000' : '#f5f0e8',
              margin: 0,
              lineHeight: '1.5',
              wordBreak: 'break-word',
              whiteSpace: 'pre-line',
            }}
          >
            <RichText text={msg.text} isMine={isMine} />
          </p>
        )}
        <p
          style={{
            fontSize: px(9),
            color: isMine ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.3)',
            margin: `${px(3)} 0 0`,
            textAlign: 'right',
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {isMine && <span style={{ marginLeft: px(4) }}>✓✓</span>}
        </p>
      </div>
    </div>
  );
});

// ── Confirm Mint Modal ─────────────────────────────────────────────────────
// Modal is a separate overlay, not the chat card — kept at its own
// natural, comfortable size on all devices (not part of the "clustered
// card" complaint), so no content-scale applied here.
const ConfirmModal = memo(({ request, onConfirm, onClose, loading }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
    style={{
      position: 'fixed',
      inset: 0,
      zIndex: 10002,
      background: 'rgba(0,0,0,0.85)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
    }}
  >
    <motion.div
      initial={{ scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.88, opacity: 0 }}
      style={{
        width: '100%',
        maxWidth: '340px',
        background: '#111112',
        border: '1px solid rgba(212,175,55,0.3)',
        borderRadius: '20px',
        overflow: 'hidden',
        boxShadow: '0 32px 80px rgba(0,0,0,0.9)',
      }}
    >
      <div
        style={{
          height: '3px',
          background: 'linear-gradient(90deg, #D4AF37, #b8941e)',
        }}
      />
      <div style={{ padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🪙</div>
        <h3
          style={{
            color: '#f5f0e8',
            fontSize: '16px',
            fontWeight: '900',
            margin: '0 0 6px',
          }}
        >
          Confirm Mint
        </h3>
        <p
          style={{
            color: 'rgba(255,255,255,0.45)',
            fontSize: '11px',
            margin: '0 0 18px',
          }}
        >
          This calls mint() on-chain.
        </p>
        <div
          style={{
            background: 'rgba(212,175,55,0.07)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '12px',
            padding: '14px',
            marginBottom: '18px',
          }}
        >
          <p
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '11px',
              margin: '0 0 4px',
            }}
          >
            Recipient
          </p>
          <p
            style={{
              color: '#D4AF37',
              fontWeight: '700',
              fontSize: '12px',
              margin: '0 0 10px',
              fontFamily: 'monospace',
            }}
          >
            {(request?.mintToAddress || request?.userSafeAddress)?.slice(0, 10)}…
            {(request?.mintToAddress || request?.userSafeAddress)?.slice(-8)}
          </p>
          <p
            style={{
              color: 'rgba(255,255,255,0.5)',
              fontSize: '11px',
              margin: '0 0 4px',
            }}
          >
            Amount to Mint
          </p>
          <p
            style={{
              color: '#22c55e',
              fontWeight: '900',
              fontSize: '20px',
              margin: 0,
            }}
          >
            {(request?.mintAmountNgn || 0).toLocaleString()} NGNs
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '11px',
              borderRadius: '12px',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(255,255,255,0.5)',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 2,
              padding: '11px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '900',
              cursor: loading ? 'wait' : 'pointer',
              boxShadow: '0 0 16px rgba(34,197,94,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            {loading && (
              <span
                style={{
                  width: '10px',
                  height: '10px',
                  border: '2px solid rgba(255,255,255,0.3)',
                  borderTopColor: '#fff',
                  borderRadius: '50%',
                  display: 'inline-block',
                  animation: 'spin 0.6s linear infinite',
                }}
              />
            )}
            {loading ? 'Minting…' : '✅ Mint NGNs'}
          </button>
        </div>
      </div>
    </motion.div>
  </motion.div>
));

// ── Ethereum L1 Banner ─────────────────────────────────────────────────────
const EthL1Banner = memo(({ selected }) => {
  const isL1 = selected?.isL1 === true || selected?.chain === 'ethereum';
  if (!isL1) return null;

  const hasMintTo = selected?.mintToAddress && selected.mintToAddress !== selected.userSafeAddress;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: px(8),
        padding: pxs(6, 14),
        background: 'linear-gradient(90deg, rgba(59,130,246,0.1), rgba(59,130,246,0.04))',
        borderBottom: '1px solid rgba(59,130,246,0.18)',
        flexShrink: 0,
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: px(4),
          padding: pxs(2, 8),
          borderRadius: '20px',
          background: 'rgba(59,130,246,0.15)',
          border: '1px solid rgba(59,130,246,0.35)',
          color: '#60a5fa',
          fontSize: px(9),
          fontWeight: '800',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        ⚡ BSC · BNB Chain
      </span>

      {hasMintTo && (
        <span
          style={{
            color: 'rgba(96,165,250,0.65)',
            fontSize: px(9.5),
            fontFamily: 'monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
            flex: 1,
          }}
          title={selected.mintToAddress}
        >
          Mint → {selected.mintToAddress.slice(0, 10)}…{selected.mintToAddress.slice(-6)}
        </span>
      )}
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const SalvaSellerChat = ({ user }) => {
  const [view, setView] = useState('closed'); // closed | list | chat
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [completingSell, setCompletingSell] = useState(false);

  const chatEndRef = useRef(null);
  const chatContainerRef = useRef(null);
  const isNearBottom = useRef(true);
  const prevMessageCount = useRef(0);
  const pollRef = useRef(null);
  const listPollRef = useRef(null);
  const badgePollRef = useRef(null);
  const selectedRef = useRef(null);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMessageCount.current && isNearBottom.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  // ── Badge polling ──────────────────────────────────────────────────────────
  const fetchBadge = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/unread-count?safeAddress=${user.safeAddress}`
      );
      const d = await res.json();
      setTotalUnread((p) => (p !== d.unreadCount ? d.unreadCount : p));
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    fetchBadge();
    badgePollRef.current = setInterval(fetchBadge, 20000);
    return () => clearInterval(badgePollRef.current);
  }, [fetchBadge]);

  // ── List polling ───────────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/all-requests?safeAddress=${user.safeAddress}`
      );
      const d = await res.json();
      setRequests((prev) => {
        const prevKey = prev.map((r) => r._id + r.status + r.updatedAt + r.sellerRead).join();
        const nextKey = (d.requests || [])
          .map((r) => r._id + r.status + r.updatedAt + r.sellerRead)
          .join();
        if (prevKey === nextKey) return prev;
        return d.requests || [];
      });
      setTotalUnread(
        (d.requests || []).filter((r) => !r.sellerRead && r.status !== 'minted').length
      );
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    clearInterval(listPollRef.current);
    if (view === 'list') {
      fetchList();
      listPollRef.current = setInterval(fetchList, 30000);
    }
    return () => clearInterval(listPollRef.current);
  }, [view, fetchList]);

  // ── Chat polling ───────────────────────────────────────────────────────────
  const fetchChat = useCallback(async () => {
    const sel = selectedRef.current;
    if (!sel?._id || !user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/request/${sel._id}?safeAddress=${user.safeAddress}`
      );
      const d = await res.json();
      if (d.request) {
        setSelected((prev) => {
          const prevKey = (prev?.messages || []).map((m) => m._id).join();
          const nextKey = (d.request.messages || []).map((m) => m._id).join();
          if (prevKey === nextKey && prev?.status === d.request.status) return prev;
          return d.request;
        });
        setMessages(d.request.messages || []);
      }
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    clearTimeout(pollRef.current);
    if (view === 'chat' && selected?._id) {
      let failCount = 0;
      let cancelled = false;
      const poll = async () => {
        if (cancelled) return;
        try {
          await fetchChat();
          failCount = 0;
        } catch {
          failCount++;
        }
        if (!cancelled) {
          const next = failCount >= 3 ? 20000 : 8000;
          pollRef.current = setTimeout(poll, next);
        }
      };
      fetchChat();
      pollRef.current = setTimeout(poll, 8000);
      return () => {
        cancelled = true;
        clearTimeout(pollRef.current);
      };
    }
  }, [view, selected?._id, fetchChat]);

  // ── Open request ───────────────────────────────────────────────────────────
  const openRequest = async (req) => {
    setSelected(req);
    setMessages(req.messages || []);
    setMintError('');
    setView('chat');
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/request/${req._id}?safeAddress=${user.safeAddress}`
      );
      const d = await res.json();
      if (d.request) {
        setSelected(d.request);
        setMessages(d.request.messages || []);
      }
    } catch {
      /* ignore */
    }
  };

  // ── Send text ──────────────────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (!selected?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: 'seller',
      text,
      createdAt: new Date(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
          text,
          sender: 'seller',
        }),
      });
      const d = await res.json();
      if (res.ok)
        setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? d.message : m)));
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
    setSending(false);
  };

  // ── Send image ─────────────────────────────────────────────────────────────
  const handleSendImage = async (imageBase64) => {
    if (!selected?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: 'seller',
      imageUrl: imageBase64,
      createdAt: new Date(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
          imageBase64,
          sender: 'seller',
        }),
      });
      const d = await res.json();
      if (res.ok)
        setMessages((prev) => prev.map((m) => (m._id === optimistic._id ? d.message : m)));
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
  };

  // ── Confirm mint ───────────────────────────────────────────────────────────
  const handleConfirmMint = async () => {
    setMinting(true);
    setMintError('');
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/confirm-mint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setShowConfirm(false);
        await fetchChat();
        await fetchList();
      } else {
        setMintError('Mint failed');
        setShowConfirm(false);
      }
    } catch {
      setMintError('Connection error. Try again.');
      setShowConfirm(false);
    }
    setMinting(false);
  };

  // ── Reject ─────────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!selected?._id) return;
    setRejecting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
        }),
      });
      if (res.ok) {
        await fetchChat();
        await fetchList();
      }
    } catch {
      /* ignore */
    }
    setRejecting(false);
  };

  const isBuyRequest = selected?.type !== 'sell';
  const canMint = selected?.status === 'paid' && isBuyRequest;
  const isSellPaid = selected?.status === 'paid' && selected?.type === 'sell';
  const hasRedemption =
    selected?.pointsRedemption?.requested && selected?.pointsRedemption?.pointsToRedeem > 0;

  // ── FAB ─────────────────────────────────────────────────────────────────────
  if (view === 'closed') {
    return (
      <div className="fixed bottom-2 left-2 sm:bottom-6 sm:left-6 z-[9000] scale-[1.2] sm:scale-100 origin-bottom-left">
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setView('list')}
          className="relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: 'linear-gradient(135deg, #1a1500, #2d2500)',
            border: '1.5px solid rgba(212,175,55,0.5)',
            boxShadow: '0 0 28px rgba(212,175,55,0.25), 0 4px 20px rgba(0,0,0,0.6)',
          }}
        >
          <div className="relative">
            <span className="text-lg font-black text-salvaGold">₦</span>
            <span className="absolute -top-1 -right-1.5 text-[9px] text-green-400">✓</span>
          </div>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-[10px] bg-red-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
              style={{ border: '2px solid #0a0a0b' }}
            >
              {totalUnread > 9 ? '9+' : totalUnread}
            </motion.span>
          )}
        </motion.button>
      </div>
    );
  }

  // ── WINDOW ─────────────────────────────────────────────────────────────────
  return (
    <>
      <ContentScaleStyle />
      <AnimatePresence>
        {showConfirm && (
          <ConfirmModal
            request={selected}
            onConfirm={handleConfirmMint}
            onClose={() => setShowConfirm(false)}
            loading={minting}
          />
        )}
      </AnimatePresence>

      <div
        className="fixed inset-0 z-[8999]"
        onClick={() => {
          setView('closed');
          setSelected(null);
          setMessages([]);
        }}
      />
      {/* Container — width/height/border/background are fixed and NEVER
          scaled. Only the .ssc-scale content inside responds to mobile. */}
      <div
        className="fixed bottom-2 left-2 z-[9000] origin-bottom-left sm:bottom-6 sm:left-6"
        style={{ width: '320px' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="ssc-scale h-[520px] bg-[#0d0d0e] border border-salvaGold/[0.18] rounded-[22px] overflow-hidden flex flex-col"
            style={{ boxShadow: '0 28px 72px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.04)' }}
          >
            {/* ── HEADER ── */}
            <div
              className="flex items-center flex-shrink-0"
              style={{
                gap: px(10),
                padding: pxs(10, 12),
                borderBottom: '1px solid rgba(212,175,55,0.2)',
                background: 'linear-gradient(135deg, #1a1500, #111100)',
              }}
            >
              {view === 'chat' && (
                <button
                  onClick={() => {
                    setView('list');
                    setSelected(null);
                    setMessages([]);
                    setMintError('');
                  }}
                  className="text-salvaGold/60 cursor-pointer bg-transparent border-none flex-shrink-0 hover:text-salvaGold transition-colors"
                  style={{ fontSize: px(18), lineHeight: 1, paddingRight: px(4) }}
                >
                  ←
                </button>
              )}
              <div
                className="flex-shrink-0 flex items-center justify-center font-black text-black"
                style={{
                  width: px(34),
                  height: px(34),
                  borderRadius: px(9),
                  fontSize: px(14),
                  background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                }}
              >
                ₦
              </div>
              <div className="flex-1 min-w-0">
                {view === 'list' ? (
                  <>
                    <p className="text-[#f5f0e8] font-black m-0" style={{ fontSize: px(13) }}>
                      NGNs Requests
                    </p>
                    <p className="text-salvaGold/50 m-0" style={{ fontSize: px(10) }}>
                      {requests.length} conversation{requests.length !== 1 ? 's' : ''}
                    </p>
                  </>
                ) : (
                  <>
                    <p
                      className="text-[#f5f0e8] font-black m-0 truncate"
                      style={{ fontSize: px(13) }}
                    >
                      {selected?.username}
                    </p>
                    <p className="text-salvaGold/50 m-0 truncate" style={{ fontSize: px(10) }}>
                      {selected?.userEmail}
                    </p>
                  </>
                )}
              </div>
              {view === 'chat' && selected?.status && <StatusBadge status={selected.status} />}
              <button
                onClick={() => {
                  setView('closed');
                  setSelected(null);
                  setMessages([]);
                }}
                className="rounded-full bg-white/[0.06] border border-white/10 cursor-pointer text-white/40 flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-all"
                style={{ width: px(24), height: px(24), fontSize: px(15) }}
              >
                ×
              </button>
            </div>

            {/* ── LIST VIEW ── */}
            {view === 'list' && (
              <div className="flex-1 overflow-y-auto bg-[#0a0a0b]">
                {requests.length === 0 ? (
                  <div
                    className="h-full flex flex-col items-center justify-center"
                    style={{ gap: px(10), padding: `${px(64)} ${px(20)}` }}
                  >
                    <span style={{ fontSize: px(36), opacity: 0.3 }}>₦</span>
                    <p className="text-salvaGold/40 font-bold m-0" style={{ fontSize: px(12) }}>
                      No requests yet
                    </p>
                    <p className="text-white/20 m-0" style={{ fontSize: px(10) }}>
                      Buy/sell requests will appear here
                    </p>
                  </div>
                ) : (
                  requests.map((req) => {
                    const lastMsg = req.messages?.[req.messages.length - 1];
                    const isUnread =
                      !req.sellerRead &&
                      req.status !== 'minted' &&
                      req.status !== 'burned' &&
                      req.status !== 'sell_completed';
                    const isPaid = req.status === 'paid';
                    const isSell = req.type === 'sell';
                    const hasRedeem =
                      req.pointsRedemption?.requested && req.pointsRedemption?.pointsToRedeem > 0;
                    return (
                      <button
                        key={req._id}
                        onClick={() => openRequest(req)}
                        className="w-full border-none border-b border-white/[0.04] text-left cursor-pointer transition-colors hover:bg-salvaGold/[0.07]"
                        style={{
                          padding: pxs(12, 14),
                          background: isPaid && isUnread ? 'rgba(212,175,55,0.04)' : 'transparent',
                        }}
                      >
                        <div className="flex items-center" style={{ gap: px(10) }}>
                          <div
                            className="flex-shrink-0 flex items-center justify-center font-black"
                            style={{
                              width: px(40),
                              height: px(40),
                              borderRadius: px(11),
                              fontSize: px(15),
                              background: isSell
                                ? 'rgba(239,68,68,0.15)'
                                : isPaid
                                ? 'rgba(212,175,55,0.2)'
                                : 'rgba(255,255,255,0.06)',
                              border: `1px solid ${
                                isSell
                                  ? 'rgba(239,68,68,0.35)'
                                  : isPaid
                                  ? 'rgba(212,175,55,0.4)'
                                  : 'rgba(255,255,255,0.08)'
                              }`,
                              color: isSell
                                ? '#ef4444'
                                : isPaid
                                ? '#D4AF37'
                                : 'rgba(255,255,255,0.4)',
                            }}
                          >
                            {req.username?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div
                              className="flex justify-between items-baseline"
                              style={{ marginBottom: px(2) }}
                            >
                              <p
                                className={`m-0 truncate flex-1 ${
                                  isUnread
                                    ? 'text-[#f5f0e8] font-bold'
                                    : 'text-white/70 font-medium'
                                }`}
                                style={{ fontSize: px(13) }}
                              >
                                {req.username}
                              </p>
                              <p
                                className="text-white/25 m-0 flex-shrink-0"
                                style={{ fontSize: px(9), marginLeft: px(8) }}
                              >
                                {new Date(req.updatedAt).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </p>
                            </div>
                            <div
                              className="flex items-center justify-between"
                              style={{ gap: px(6), marginBottom: px(4) }}
                            >
                              <p
                                className="text-white/35 m-0 truncate flex-1"
                                style={{ fontSize: px(11) }}
                              >
                                {lastMsg?.isReceipt
                                  ? '📎 Receipt uploaded'
                                  : lastMsg?.isBurned
                                  ? '🔥 Sell request'
                                  : lastMsg?.text?.replace(/\*\*/g, '')?.slice(0, 45) ||
                                    'No messages'}
                              </p>
                              <div
                                className="flex items-center flex-shrink-0"
                                style={{ gap: px(4) }}
                              >
                                <span
                                  className={`font-bold ${
                                    isSell ? 'text-red-400' : 'text-salvaGold'
                                  }`}
                                  style={{ fontSize: px(10) }}
                                >
                                  ₦{(req.amountNgn || 0).toLocaleString()}
                                </span>
                                {isUnread && (
                                  <span
                                    className="rounded-full bg-salvaGold inline-block"
                                    style={{
                                      width: px(8),
                                      height: px(8),
                                      boxShadow: '0 0 6px rgba(212,175,55,0.6)',
                                    }}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="flex items-center flex-wrap" style={{ gap: px(4) }}>
                              <TypeBadge type={req.type} />
                              <ChainBadge chain={req.chain} isL1={req.isL1} />
                              <StatusBadge status={req.status} />
                              {hasRedeem && (
                                <span
                                  className="rounded-[5px] bg-purple-500/15 border border-purple-500/30 text-purple-400 font-bold"
                                  style={{ padding: pxs(2, 6), fontSize: px(8) }}
                                >
                                  ⭐ {req.pointsRedemption.pointsToRedeem.toLocaleString()} pts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}

            {/* ── CHAT VIEW ── */}
            {view === 'chat' && selected && (
              <>
                <EthL1Banner selected={selected} />

                {/* ── Summary bar ── */}
                <div
                  className="flex justify-between items-center flex-shrink-0"
                  style={{
                    padding: pxs(8, 14),
                    background: 'rgba(212,175,55,0.05)',
                    borderBottom: '1px solid rgba(212,175,55,0.1)',
                    gap: px(8),
                    minWidth: 0,
                    overflow: 'hidden',
                  }}
                >
                  {selected.type === 'sell' && selected.status !== 'sell_completed' ? (
                    <>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: px(10),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Sell: {(selected.amountNgn || 0).toLocaleString()} NGNs burned
                      </span>
                      <span
                        style={{
                          color: '#ef4444',
                          fontWeight: '900',
                          fontSize: px(12),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Pay: ₦{(selected.mintAmountNgn || 0).toLocaleString()}
                      </span>
                    </>
                  ) : selected.type !== 'sell' ? (
                    <>
                      <span
                        style={{
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: px(10),
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        Buy: ₦{(selected.amountNgn || 0).toLocaleString()} · Fee: {selected.feeNgn}{' '}
                        NGNs
                      </span>
                      <span
                        style={{
                          color: '#D4AF37',
                          fontWeight: '900',
                          fontSize: px(12),
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Mint: {(selected.mintAmountNgn || 0).toLocaleString()} NGNs
                      </span>
                    </>
                  ) : null}
                </div>

                {/* ── SELL: Bank payout details ── */}
                {selected.type === 'sell' &&
                  selected.status !== 'sell_completed' &&
                  selected.bankDetails?.accountNumber && (
                    <div
                      className="flex-shrink-0"
                      style={{
                        padding: pxs(8, 14),
                        background: 'rgba(239,68,68,0.05)',
                        borderBottom: '1px solid rgba(239,68,68,0.1)',
                      }}
                    >
                      <p
                        style={{
                          color: 'rgba(255,255,255,0.4)',
                          fontSize: px(9),
                          textTransform: 'uppercase',
                          letterSpacing: '0.1em',
                          margin: `0 0 ${px(6)}`,
                          fontWeight: '700',
                        }}
                      >
                        Payout Details
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: px(5) }}>
                        {[
                          { label: 'Bank', value: selected.bankDetails.bankName },
                          { label: 'Account Name', value: selected.bankDetails.accountName },
                          { label: 'Account Number', value: selected.bankDetails.accountNumber },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: px(8),
                            }}
                          >
                            <span
                              style={{
                                color: 'rgba(255,255,255,0.35)',
                                fontSize: px(10),
                                flexShrink: 0,
                              }}
                            >
                              {label}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: px(6),
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  color: '#f5f0e8',
                                  fontSize: px(11),
                                  fontWeight: '700',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {value}
                              </span>
                              {value && <CopyBtn value={value} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                {/* ── SELL: Points redemption ── */}
                {selected.type === 'sell' && hasRedemption && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      padding: pxs(8, 14),
                      background: 'rgba(168,85,247,0.06)',
                      borderBottom: '1px solid rgba(168,85,247,0.2)',
                    }}
                  >
                    <p
                      style={{
                        color: '#a855f7',
                        fontSize: px(9),
                        textTransform: 'uppercase',
                        letterSpacing: '0.1em',
                        margin: `0 0 ${px(5)}`,
                        fontWeight: '700',
                      }}
                    >
                      ⭐ Points Redemption
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: px(3) }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: px(10) }}>
                          Points redeemed
                        </span>
                        <span style={{ color: '#a855f7', fontWeight: '700', fontSize: px(11) }}>
                          {selected.pointsRedemption.pointsToRedeem.toLocaleString()} pts
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: px(10) }}>
                          Extra payout
                        </span>
                        <span style={{ color: '#a855f7', fontWeight: '700', fontSize: px(11) }}>
                          +₦{selected.pointsRedemption.pointsToRedeem.toLocaleString()}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          paddingTop: px(4),
                          borderTop: '1px solid rgba(168,85,247,0.15)',
                          marginTop: px(2),
                        }}
                      >
                        <span
                          style={{
                            color: 'rgba(255,255,255,0.6)',
                            fontSize: px(10),
                            fontWeight: '700',
                          }}
                        >
                          TOTAL to pay user
                        </span>
                        <span style={{ color: '#22c55e', fontWeight: '900', fontSize: px(13) }}>
                          ₦
                          {(
                            (selected.amountNgn || 0) +
                            (selected.pointsRedemption.pointsToRedeem || 0)
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Messages */}
                <div
                  ref={chatContainerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  }}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: `${px(12)} ${px(12)} ${px(8)}`,
                    background: '#0a0a0b',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: px(7),
                  }}
                >
                  {messages.map((msg, i) => (
                    <SellerBubble key={msg._id || i} msg={msg} />
                  ))}
                  <div ref={chatEndRef} />
                </div>

                {/* Error */}
                {mintError && (
                  <div
                    style={{
                      padding: pxs(10, 14),
                      background: 'rgba(239,68,68,0.1)',
                      borderTop: '1px solid rgba(239,68,68,0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: px(8),
                    }}
                  >
                    <span style={{ fontSize: px(14), flexShrink: 0 }}>⚠️</span>
                    <p style={{ color: '#ef4444', fontSize: px(11), fontWeight: '700', margin: 0 }}>
                      Mint failed. Please try again.
                    </p>
                  </div>
                )}

                {/* BUY: Confirm mint when paid */}
                {canMint && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      padding: pxs(10, 12),
                      background: '#0d0d0e',
                      borderTop: '1px solid rgba(212,175,55,0.1)',
                      display: 'flex',
                      gap: px(8),
                    }}
                  >
                    <button
                      onClick={handleReject}
                      disabled={rejecting}
                      style={{
                        flex: 1,
                        padding: px(10),
                        borderRadius: px(10),
                        background: 'rgba(239,68,68,0.1)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        color: '#ef4444',
                        fontSize: px(11),
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = 'rgba(239,68,68,0.18)')
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = 'rgba(239,68,68,0.1)')
                      }
                    >
                      {rejecting ? '…' : '❌ Reject'}
                    </button>
                    <button
                      onClick={() => setShowConfirm(true)}
                      style={{
                        flex: 2,
                        padding: px(10),
                        borderRadius: px(10),
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                        border: 'none',
                        color: '#fff',
                        fontSize: px(12),
                        fontWeight: '900',
                        cursor: 'pointer',
                        boxShadow: '0 0 14px rgba(34,197,94,0.3)',
                      }}
                    >
                      ✅ Confirm Payment & Mint
                    </button>
                  </div>
                )}

                {/* SELL: NGNs burned — pay user */}
                {isSellPaid && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      padding: pxs(10, 12),
                      background: '#0d0d0e',
                      borderTop: '1px solid rgba(239,68,68,0.15)',
                    }}
                  >
                    <div
                      style={{
                        padding: pxs(10, 12),
                        borderRadius: px(10),
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        marginBottom: px(8),
                      }}
                    >
                      <p
                        style={{
                          color: '#ef4444',
                          fontSize: px(11),
                          fontWeight: '700',
                          margin: `0 0 ${px(4)}`,
                        }}
                      >
                        🔥 NGNs burned on-chain. Send ₦
                        {(
                          (selected.mintAmountNgn || 0) +
                          (hasRedemption ? selected.pointsRedemption.pointsToRedeem : 0)
                        ).toLocaleString()}{' '}
                        to user's bank account above.
                      </p>
                      {hasRedemption && (
                        <p style={{ color: '#a855f7', fontSize: px(10), margin: 0 }}>
                          Includes ₦{selected.pointsRedemption.pointsToRedeem.toLocaleString()}{' '}
                          points redemption payout.
                        </p>
                      )}
                    </div>
                    <button
                      onClick={async () => {
                        if (!selected?._id || completingSell) return;
                        setCompletingSell(true);
                        try {
                          await fetch(`${SALVA_API_URL}/api/buy-ngns/complete-sell`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              requestId: selected._id,
                              safeAddress: user.safeAddress,
                            }),
                          });
                          await fetchChat();
                          await fetchList();
                        } catch {
                          /* ignore */
                        }
                        setCompletingSell(false);
                      }}
                      disabled={completingSell}
                      style={{
                        width: '100%',
                        padding: px(11),
                        borderRadius: px(10),
                        background: completingSell
                          ? 'rgba(34,197,94,0.4)'
                          : 'linear-gradient(135deg, #22c55e, #16a34a)',
                        border: 'none',
                        color: '#fff',
                        fontSize: px(13),
                        fontWeight: '900',
                        cursor: completingSell ? 'wait' : 'pointer',
                        boxShadow: completingSell ? 'none' : '0 0 14px rgba(34,197,94,0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: px(6),
                      }}
                    >
                      {completingSell && (
                        <span
                          style={{
                            width: px(12),
                            height: px(12),
                            border: '2px solid rgba(255,255,255,0.3)',
                            borderTopColor: '#fff',
                            borderRadius: '50%',
                            display: 'inline-block',
                            animation: 'spin 0.6s linear infinite',
                          }}
                        />
                      )}
                      {completingSell ? 'Completing…' : '✅ SENT — Mark as Complete'}
                    </button>
                  </div>
                )}

                {/* Reject when pending */}
                {selected?.status === 'pending' && (
                  <div
                    className="flex-shrink-0"
                    style={{
                      padding: pxs(8, 12),
                      background: '#0d0d0e',
                      borderTop: '1px solid rgba(255,255,255,0.05)',
                    }}
                  >
                    <button
                      onClick={handleReject}
                      disabled={rejecting}
                      style={{
                        width: '100%',
                        padding: px(9),
                        borderRadius: px(10),
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        color: 'rgba(239,68,68,0.7)',
                        fontSize: px(11),
                        cursor: 'pointer',
                      }}
                    >
                      {rejecting ? 'Rejecting…' : 'Cancel / Reject Request'}
                    </button>
                  </div>
                )}

                {/* Input */}
                {['pending', 'paid'].includes(selected?.status) && (
                  <MessageInput onSend={handleSend} onImage={handleSendImage} disabled={sending} />
                )}
              </>
            )}
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </motion.div>
      </div>
    </>
  );
};

export default SalvaSellerChat;
