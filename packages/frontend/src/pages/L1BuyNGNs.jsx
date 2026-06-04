// src/pages/L1BuyNGNs.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';

const isValidAddr = (a) => /^0x[0-9a-fA-F]{40}$/.test(a);
const truncAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, '');
  const p = d.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return p.length > 1 ? p[0] + '.' + p[1] : p[0];
};

function calcFee(amt, feePercent = 0.5) {
  return Math.round(amt * (feePercent / 100));
}

function RichText({ text }) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: '#D4AF37' }}>
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </span>
  );
}

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
        padding: '3px 9px',
        borderRadius: '6px',
        background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(212,175,55,0.12)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(212,175,55,0.3)'}`,
        color: copied ? '#22c55e' : '#D4AF37',
        fontSize: '9px',
        fontWeight: '700',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  );
};

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
        padding: '10px 12px',
        background: '#0d0d0e',
        borderTop: '1px solid rgba(212,175,55,0.15)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-end' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            borderRadius: '9px',
            background: 'rgba(212,175,55,0.12)',
            border: '1px solid rgba(212,175,55,0.2)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="14"
            height="14"
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
          placeholder="Ask a question…"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: '12px',
            border: '1px solid rgba(212,175,55,0.2)',
            background: '#1a1a1b',
            color: '#f5f0e8',
            fontSize: '13px',
            outline: 'none',
            resize: 'none',
            overflowY: 'hidden',
            lineHeight: '1.5',
            fontFamily: 'inherit',
            minHeight: '38px',
            maxHeight: '100px',
          }}
          onFocus={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.6)')}
          onBlur={(e) => (e.target.style.borderColor = 'rgba(212,175,55,0.2)')}
        />
        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            background:
              disabled || !text.trim()
                ? 'rgba(212,175,55,0.2)'
                : 'linear-gradient(135deg, #D4AF37, #b8941e)',
            border: 'none',
            cursor: disabled || !text.trim() ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="14"
            height="14"
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

const Bubble = memo(({ msg }) => {
  const isMe = msg.sender === 'user';

  if (msg.isMinted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: '8px 0',
          padding: '14px 16px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
          border: '1px solid rgba(34,197,94,0.4)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '28px', marginBottom: '6px' }}>🎉</div>
        <p style={{ color: '#22c55e', fontWeight: '900', fontSize: '13px', margin: '0 0 4px' }}>
          NGNs Minted on BNB CHAIN!
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '11px',
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          <RichText text={msg.text} />
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
          margin: '8px 0',
          padding: '14px 16px',
          borderRadius: '16px',
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))',
          border: '1px solid rgba(239,68,68,0.35)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '28px', marginBottom: '6px' }}>🔥</div>
        <p style={{ color: '#ef4444', fontWeight: '900', fontSize: '13px', margin: '0 0 4px' }}>
          Sell Request Submitted (L1)
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: '11px',
            margin: 0,
            whiteSpace: 'pre-line',
          }}
        >
          <RichText text={msg.text} />
        </p>
      </motion.div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isMe ? 'flex-end' : 'flex-start',
        alignItems: 'flex-end',
        gap: '6px',
      }}
    >
      {!isMe && (
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '8px',
            flexShrink: 0,
            background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
            fontWeight: '900',
            color: '#fff',
          }}
        >
          ₦
        </div>
      )}
      <div
        style={{
          maxWidth: '78%',
          padding: '10px 13px',
          borderRadius: isMe ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          background: isMe ? 'linear-gradient(135deg, #D4AF37, #b8941e)' : 'rgba(255,255,255,0.05)',
          border: isMe ? 'none' : '1px solid rgba(212,175,55,0.15)',
        }}
      >
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="attachment"
            style={{
              maxWidth: '100%',
              maxHeight: '180px',
              borderRadius: '10px',
              marginBottom: msg.text ? '6px' : 0,
              display: 'block',
              objectFit: 'contain',
            }}
          />
        )}
        {msg.text && (
          <p
            style={{
              fontSize: '12.5px',
              color: isMe ? '#000' : '#f5f0e8',
              margin: 0,
              lineHeight: '1.55',
              wordBreak: 'break-word',
              whiteSpace: 'pre-line',
            }}
          >
            <RichText text={msg.text} />
          </p>
        )}
        <p
          style={{
            fontSize: '9px',
            color: isMe ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)',
            margin: '4px 0 0',
            textAlign: 'right',
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          {isMe && <span style={{ marginLeft: '4px' }}>✓</span>}
        </p>
      </div>
    </div>
  );
});

const L1BuyNGNs = ({ l1Account, l1Config, configLoading, showMsg }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null);

  // ── OTC Config ─────────────────────────────────────────────────────────
  const [otcConfig, setOtcConfig] = useState({ minNgn: 10000, maxNgn: 200000, feePercent: 0.2 });

  // ── Buy state ──────────────────────────────────────────────────────────
  const [buyPhase, setBuyPhase] = useState('amount');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amountRaw, setAmountRaw] = useState(0);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState('');
  const [sellerInfo, setSellerInfo] = useState(null);

  // ── Recipient ──────────────────────────────────────────────────────────
  const [recipient, setRecipient] = useState(l1Account || '');
  const [editingRecipient, setEditingRecipient] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState('');

  // ── Sell state ─────────────────────────────────────────────────────────
  const [sellPhase, setSellPhase] = useState('amount');
  const [sellAmountDisplay, setSellAmountDisplay] = useState('');
  const [sellAmountRaw, setSellAmountRaw] = useState(0);
  const [sellAmountError, setSellAmountError] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sellError, setSellError] = useState('');
  const [sellInitiating, setSellInitiating] = useState(false);

  // ── Shared chat state ──────────────────────────────────────────────────
  const [mintRequest, setMintRequest] = useState(null);
  const [messages, setMessages] = useState([]);
  const [sending, setSending] = useState(false);
  const [showReceiptUpload, setShowReceiptUpload] = useState(false);
  const [receiptFile, setReceiptFile] = useState(null);
  const [receiptPreview, setReceiptPreview] = useState(null);
  const [claimingPaid, setClaimingPaid] = useState(false);

  const chatEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const pollRef = useRef(null);
  const isNearBottom = useRef(true);
  const chatContainerRef = useRef(null);
  const prevMessageCount = useRef(0);

  const fee = calcFee(amountRaw, otcConfig.feePercent);
  const mintAmt = amountRaw - fee;
  const sellFee = calcFee(sellAmountRaw, otcConfig.feePercent);
  const sellPayout = sellAmountRaw - sellFee;
  const status = mintRequest?.status;
  const canChat = status === 'pending' || status === 'paid';
  const isMinted = status === 'minted';
  const isRejected = status === 'rejected';
  const isBurned = status === 'burned' || status === 'sell_completed';

  const buyValid = amountRaw >= otcConfig.minNgn && amountRaw <= otcConfig.maxNgn;
  const sellValid =
    sellAmountRaw >= otcConfig.minNgn && sellAmountRaw <= otcConfig.maxNgn && !sellAmountError;

  useEffect(() => {
    if (l1Account && !recipient) setRecipient(l1Account);
  }, [l1Account]);

  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMessageCount.current && isNearBottom.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  const loadRequest = useCallback(async () => {
    if (!l1Account) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/my-request/${l1Account.toLowerCase()}`
      );
      const data = await res.json();
      if (
        data.request &&
        data.request.isL1 &&
        ['pending', 'paid', 'minting'].includes(data.request.status)
      ) {
        setMintRequest(data.request);
        setMessages(data.request.messages || []);
        setMode(data.request.type || 'buy');
        setBuyPhase('chat');
        setSellPhase('chat');
      }
    } catch {
      /* ignore */
    }
  }, [l1Account]);

  const fetchSellerInfo = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/seller-info`);
      if (res.ok) setSellerInfo(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  const fetchOtcConfig = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/otc-config`);
      if (res.ok) setOtcConfig(await res.json());
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRequest();
      fetchSellerInfo();
      fetchOtcConfig();
    }
  }, [isOpen, loadRequest, fetchSellerInfo, fetchOtcConfig]);

  useEffect(() => {
    const activeChat =
      (mode === 'buy' && buyPhase === 'chat') || (mode === 'sell' && sellPhase === 'chat');
    if (!activeChat || !mintRequest?._id || !isOpen) return;
    let failCount = 0;
    const poll = async () => {
      try {
        const res = await fetch(
          `${SALVA_API_URL}/api/buy-ngns/my-request/${l1Account.toLowerCase()}`
        );
        if (!res.ok) throw new Error('bad response');
        const data = await res.json();
        if (data.request) {
          setMintRequest(data.request);
          setMessages(data.request.messages || []);
        }
        failCount = 0;
      } catch {
        failCount++;
      }
      pollRef.current = setTimeout(poll, failCount >= 3 ? 20000 : 8000);
    };
    pollRef.current = setTimeout(poll, 8000);
    return () => clearTimeout(pollRef.current);
  }, [mode, buyPhase, sellPhase, mintRequest?._id, isOpen, l1Account]);

  const handleBuyInitiate = async () => {
    if (!isValidAddr(recipient)) {
      setInitError('Invalid recipient address');
      return;
    }
    setInitError('');
    setInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: l1Account,
          amountNgn: amountRaw,
          isL1: true,
          recipientAddress: recipient,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInitError(data.message || 'Could not start your request.');
        return;
      }
      await loadRequest();
    } catch {
      setInitError('Connection error. Check your network.');
    } finally {
      setInitiating(false);
    }
  };

  const handleSellInitiate = async () => {
    setSellError('');
    setSellInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate-sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: l1Account,
          amountNgn: sellAmountRaw,
          bankName,
          accountNumber,
          accountName,
          isL1: true,
          burnFromAddress: l1Account,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSellError(data.message || 'Could not process sell request.');
        return;
      }
      await loadRequest();
    } catch {
      setSellError('Network error. Please try again.');
    } finally {
      setSellInitiating(false);
    }
  };

  const handleSend = async (text) => {
    if (!mintRequest?._id) return;
    const optimistic = { _id: `tmp-${Date.now()}`, sender: 'user', text, createdAt: new Date() };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: mintRequest._id,
          safeAddress: l1Account,
          text,
          sender: 'user',
        }),
      });
      const data = await res.json();
      if (res.ok)
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message } : m))
        );
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
    setSending(false);
  };

  const handleSendImage = async (imageBase64) => {
    if (!mintRequest?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: 'user',
      imageUrl: imageBase64,
      createdAt: new Date(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: mintRequest._id,
          safeAddress: l1Account,
          imageBase64,
          sender: 'user',
        }),
      });
      const data = await res.json();
      if (res.ok)
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message } : m))
        );
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      alert('File must be under 6MB');
      return;
    }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleClaimPaid = async () => {
    if (!receiptFile) {
      fileInputRef.current?.click();
      return;
    }
    setClaimingPaid(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/claim-paid`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requestId: mintRequest._id,
            safeAddress: l1Account,
            receiptBase64: ev.target.result,
          }),
        });
        if (res.ok) {
          setShowReceiptUpload(false);
          setReceiptFile(null);
          setReceiptPreview(null);
          await loadRequest();
        }
      } catch {
        /* ignore */
      }
      setClaimingPaid(false);
    };
    reader.readAsDataURL(receiptFile);
  };

  const handleRecipientSave = () => {
    if (!isValidAddr(recipientDraft)) {
      showMsg('Invalid BNB address', 'error');
      return;
    }
    setRecipient(recipientDraft);
    setEditingRecipient(false);
    setRecipientDraft('');
  };

  const resetAll = () => {
    setMode(null);
    setBuyPhase('amount');
    setAmountDisplay('');
    setAmountRaw(0);
    setInitError('');
    setSellPhase('amount');
    setSellAmountDisplay('');
    setSellAmountRaw(0);
    setBankName('');
    setAccountNumber('');
    setAccountName('');
    setSellError('');
    setMintRequest(null);
    setMessages([]);
  };

  const Spinner = ({ color = '#000' }) => (
    <span
      style={{
        width: '10px',
        height: '10px',
        border: `2px solid ${color}30`,
        borderTopColor: color,
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );

  const SectionLabel = ({ children }) => (
    <label
      style={{
        color: 'rgba(212,175,55,0.6)',
        fontSize: '9px',
        textTransform: 'uppercase',
        letterSpacing: '0.15em',
        fontWeight: '700',
        display: 'block',
        marginBottom: '6px',
      }}
    >
      {children}
    </label>
  );

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-1">
              BNB CHAIN · OTC Desk
            </p>
            <h2 className="text-3xl font-black tracking-tight">Buy / Sell NGNs</h2>
          </div>
          <a
            href="/dashboard"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-salvaGold/30 bg-salvaGold/[0.07] hover:bg-salvaGold/[0.14] transition-all flex-shrink-0 mt-1"
          >
            <span className="text-[8px] font-black uppercase tracking-widest text-salvaGold">
              Base Chain
            </span>
            <span className="text-salvaGold text-[9px]">↗</span>
          </a>
        </div>

        {/* Info */}
        <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
          <p className="text-xs font-black text-blue-400 mb-1">OTC Exchange</p>
          <p className="text-[11px] text-white/60 leading-relaxed">
            Buy NGNs with fiat (minted to any BNB address) or sell NGNs for fiat (burned from
            your connected wallet). Tap the ₦ button below to start.
          </p>
        </div>

        {/* Recipient chip */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.06]">
          <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-blue-400 text-[10px]">⛓</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">
              Mint-to Address · BNB CHAIN
            </p>
            {editingRecipient ? (
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="text"
                  value={recipientDraft}
                  onChange={(e) => setRecipientDraft(e.target.value)}
                  placeholder="0x…"
                  autoFocus
                  className="flex-1 bg-transparent border-b border-blue-400/40 outline-none text-xs font-mono text-white py-0.5 min-w-0"
                />
                <button
                  onClick={handleRecipientSave}
                  className="text-[9px] font-black uppercase text-green-400 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 flex-shrink-0"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingRecipient(false);
                    setRecipientDraft('');
                  }}
                  className="text-[9px] font-black uppercase text-white/60 flex-shrink-0"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <p className="font-mono text-[10px] text-blue-400/70 truncate flex-1">
                  {recipient || 'Not set'}
                </p>
                <button
                  onClick={() => {
                    setRecipientDraft(recipient);
                    setEditingRecipient(true);
                  }}
                  className="flex-shrink-0 w-5 h-5 rounded-md bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-blue-400 transition-all"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    className="w-2.5 h-2.5"
                  >
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Instruction */}
        <div className="py-8 rounded-3xl border border-dashed border-white/[0.06] text-center">
          <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-black text-salvaGold">₦</span>
          </div>
          <p className="font-black text-white/60 text-sm mb-1">OTC Chat</p>
          <p className="text-[11px] text-white/60 max-w-[240px] mx-auto leading-relaxed">
            Tap the <strong className="text-salvaGold">₦</strong> button at the bottom-right to open
            the exchange chat.
          </p>
        </div>
      </motion.div>

      {/* FAB */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 70,
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg,#D4AF37,#b8960c)',
          border: '2px solid rgba(212,175,55,0.4)',
          boxShadow: '0 8px 32px rgba(212,175,55,0.35)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          color: '#000',
          fontWeight: '900',
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
        onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
      >
        ₦
      </button>

      {/* Receipt upload overlay */}
      <AnimatePresence>
        {showReceiptUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setShowReceiptUpload(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 10001,
              background: 'rgba(0,0,0,0.8)',
              backdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              style={{
                width: '100%',
                maxWidth: '360px',
                background: '#111112',
                border: '1px solid rgba(212,175,55,0.3)',
                borderRadius: '20px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid rgba(212,175,55,0.15)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <p style={{ color: '#f5f0e8', fontSize: '13px', fontWeight: '700', margin: 0 }}>
                  Upload Payment Receipt
                </p>
                <button
                  onClick={() => setShowReceiptUpload(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: '20px',
                    cursor: 'pointer',
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: '20px' }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${receiptPreview ? 'rgba(34,197,94,0.5)' : 'rgba(212,175,55,0.3)'}`,
                    borderRadius: '14px',
                    padding: '24px',
                    cursor: 'pointer',
                    textAlign: 'center',
                    marginBottom: '14px',
                  }}
                >
                  {receiptPreview ? (
                    <img
                      src={receiptPreview}
                      alt="Preview"
                      style={{
                        maxHeight: '140px',
                        borderRadius: '10px',
                        margin: '0 auto',
                        display: 'block',
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: '28px', marginBottom: '8px' }}>📎</div>
                      <p style={{ color: 'rgba(212,175,55,0.7)', fontSize: '12px', margin: 0 }}>
                        Tap to select receipt
                      </p>
                    </>
                  )}
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      setShowReceiptUpload(false);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={receiptFile ? handleClaimPaid : () => fileInputRef.current?.click()}
                    disabled={claimingPaid}
                    style={{
                      flex: 1,
                      padding: '11px',
                      borderRadius: '12px',
                      background: receiptFile
                        ? 'linear-gradient(135deg, #D4AF37, #b8941e)'
                        : 'rgba(212,175,55,0.2)',
                      border: 'none',
                      color: receiptFile ? '#000' : 'rgba(212,175,55,0.6)',
                      fontSize: '12px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {claimingPaid && <Spinner />}
                    {claimingPaid ? 'Sending…' : receiptFile ? 'Submit' : 'Choose File'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat widget */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 16 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            style={{
              position: 'fixed',
              bottom: '90px',
              right: '16px',
              zIndex: 75,
              width: 'min(390px, calc(100vw - 32px))',
              height: 'min(560px, calc(100vh - 110px))',
              background: '#0D0D0D',
              border: '1px solid rgba(212,175,55,0.2)',
              borderRadius: '20px',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 20px 60px rgba(0,0,0,0.7)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                background: 'linear-gradient(135deg,#1a1500,#111100)',
                borderBottom: '1px solid rgba(212,175,55,0.25)',
                padding: '12px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                flexShrink: 0,
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'rgba(212,175,55,0.15)',
                  border: '1px solid rgba(212,175,55,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '16px',
                  fontWeight: '900',
                  color: '#D4AF37',
                  flexShrink: 0,
                }}
              >
                ₦
              </div>
              {mode && buyPhase !== 'chat' && sellPhase !== 'chat' && (
                <button
                  onClick={() => {
                    if (mode === 'buy') {
                      if (buyPhase === 'confirm') setBuyPhase('amount');
                      else {
                        setMode(null);
                        setBuyPhase('amount');
                      }
                    } else {
                      if (sellPhase === 'bank') setSellPhase('amount');
                      else {
                        setMode(null);
                        setSellPhase('amount');
                      }
                    }
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(212,175,55,0.6)',
                    fontSize: '18px',
                    cursor: 'pointer',
                    padding: '2px 6px 2px 0',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                >
                  ←
                </button>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: '900', color: '#D4AF37' }}>
                  NGNs Exchange
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: '9px',
                    color: 'rgba(255,255,255,0.3)',
                    fontWeight: '700',
                  }}
                >
                  {mode
                    ? mode === 'buy'
                      ? 'Buying NGNs · BNB CHAIN'
                      : 'Selling NGNs · BNB CHAIN'
                    : 'Choose an option'}
                </p>
              </div>
              <span
                style={{
                  fontSize: '8px',
                  fontWeight: '900',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#60a5fa',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  border: '1px solid rgba(96,165,250,0.35)',
                  background: 'rgba(96,165,250,0.08)',
                  flexShrink: 0,
                }}
              >
                BNB CHAIN
              </span>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  cursor: 'pointer',
                  color: 'rgba(255,255,255,0.5)',
                  fontSize: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                ×
              </button>
            </div>

            {/* ── MODE SELECTOR ── */}
            {!mode && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  gap: '12px',
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '16px',
                      margin: '0 auto 12px',
                      background: 'rgba(212,175,55,0.12)',
                      border: '1px solid rgba(212,175,55,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '24px',
                      fontWeight: '900',
                      color: '#D4AF37',
                    }}
                  >
                    ₦
                  </div>
                  <p style={{ margin: 0, fontSize: '15px', fontWeight: '900', color: '#fff' }}>
                    NGNs Exchange
                  </p>
                  <p
                    style={{ margin: '4px 0 0', fontSize: '11px', color: 'rgba(255,255,255,0.3)' }}
                  >
                    Buy NGNs with fiat or sell NGNs for fiat
                  </p>
                </div>
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setBuyPhase('amount');
                    setMode('buy');
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg,#D4AF37,#b8960c)',
                    border: 'none',
                    color: '#000',
                    fontWeight: '900',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  🏦 Buy NGNs
                </button>
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setSellPhase('amount');
                    setMode('sell');
                  }}
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'rgba(239,68,68,0.12)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    color: '#f87171',
                    fontWeight: '900',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  🔥 Sell NGNs
                </button>
                <div
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    borderRadius: '10px',
                    padding: '12px',
                    width: '100%',
                  }}
                >
                  <p
                    style={{
                      color: 'rgba(212,175,55,0.5)',
                      fontSize: '9px',
                      textTransform: 'uppercase',
                      letterSpacing: '0.15em',
                      margin: '0 0 8px',
                      fontWeight: '700',
                    }}
                  >
                    How it works on BNB CHAIN
                  </p>
                  <p
                    style={{ margin: '0 0 4px', fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}
                  >
                    <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Buy:</strong> Transfer fiat →
                    NGNs minted to your address on BNB
                  </p>
                  <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255,255,255,0.35)' }}>
                    <strong style={{ color: 'rgba(255,255,255,0.5)' }}>Sell:</strong> NGNs burned
                    from your wallet → receive fiat in bank
                  </p>
                </div>
              </div>
            )}

            {/* ── BUY: AMOUNT ── */}
            {mode === 'buy' && buyPhase === 'amount' && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '24px 20px',
                  gap: '16px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>🛒</div>
                  <h3
                    style={{
                      color: '#f5f0e8',
                      fontSize: '17px',
                      fontWeight: '900',
                      margin: '0 0 4px',
                    }}
                  >
                    Buy NGNs · BNB CHAIN
                  </h3>
                  <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                    Enter the amount you want to purchase
                  </p>
                </div>
                <div>
                  <SectionLabel>Amount (NGNs)</SectionLabel>
                  <div style={{ position: 'relative' }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder={`e.g. ${otcConfig.minNgn.toLocaleString()}`}
                      value={amountDisplay}
                      onChange={(e) => {
                        const f = fmtInput(e.target.value);
                        setAmountDisplay(f);
                        setAmountRaw(parseFloat(f.replace(/,/g, '')) || 0);
                        setInitError('');
                      }}
                      style={{
                        width: '100%',
                        padding: '13px 52px 13px 14px',
                        borderRadius: '12px',
                        border: '1px solid rgba(212,175,55,0.25)',
                        background: '#1a1a1b',
                        color: '#f5f0e8',
                        fontSize: '18px',
                        fontWeight: '900',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#D4AF37',
                        fontWeight: '900',
                        fontSize: '12px',
                      }}
                    >
                      NGNs
                    </span>
                  </div>
                  <p
                    style={{ color: 'rgba(255,255,255,0.3)', fontSize: '10px', margin: '5px 0 0' }}
                  >
                    Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                    {otcConfig.maxNgn.toLocaleString()}
                  </p>
                </div>
                {buyValid && (
                  <div
                    style={{
                      background: 'rgba(212,175,55,0.05)',
                      border: '1px solid rgba(212,175,55,0.15)',
                      borderRadius: '12px',
                      padding: '12px 14px',
                    }}
                  >
                    {[
                      ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`],
                      ['Fee', fee > 0 ? `-${fee} NGNs` : 'Free'],
                      ['You Receive', `${mintAmt.toLocaleString()} NGNs`],
                    ].map(([l, v], i) => (
                      <div
                        key={l}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          marginBottom: i < 2 ? '6px' : 0,
                          paddingTop: i === 2 ? '8px' : 0,
                          borderTop: i === 2 ? '1px solid rgba(212,175,55,0.1)' : 'none',
                        }}
                      >
                        <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px' }}>
                          {l}
                        </span>
                        <span
                          style={{
                            color: i === 1 && fee > 0 ? '#ef4444' : i === 2 ? '#D4AF37' : '#f5f0e8',
                            fontWeight: i === 2 ? '900' : '700',
                            fontSize: i === 2 ? '14px' : '11px',
                          }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {initError && (
                  <p style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', margin: 0 }}>
                    ⚠️ {initError}
                  </p>
                )}
                <button
                  onClick={() => buyValid && setBuyPhase('confirm')}
                  disabled={!buyValid}
                  style={{
                    width: '100%',
                    padding: '13px',
                    background: buyValid
                      ? 'linear-gradient(135deg, #D4AF37, #b8941e)'
                      : 'rgba(212,175,55,0.2)',
                    border: 'none',
                    borderRadius: '12px',
                    color: buyValid ? '#000' : 'rgba(212,175,55,0.4)',
                    fontSize: '13px',
                    fontWeight: '900',
                    cursor: buyValid ? 'pointer' : 'not-allowed',
                    textTransform: 'uppercase',
                  }}
                >
                  Continue →
                </button>
              </div>
            )}

            {/* ── BUY: CONFIRM ── */}
            {mode === 'buy' && buyPhase === 'confirm' && (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  padding: '24px 20px',
                  gap: '14px',
                  overflowY: 'auto',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '36px', marginBottom: '8px' }}>⚡</div>
                  <h3
                    style={{
                      color: '#f5f0e8',
                      fontSize: '17px',
                      fontWeight: '900',
                      margin: '0 0 4px',
                    }}
                  >
                    Confirm Purchase
                  </h3>
                </div>
                <div
                  style={{
                    background: 'rgba(212,175,55,0.06)',
                    border: '1px solid rgba(212,175,55,0.2)',
                    borderRadius: '14px',
                    padding: '16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                  }}
                >
                  {[
                    ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`, '#f5f0e8'],
                    ['Fee', fee > 0 ? `-${fee} NGNs` : 'Free', fee > 0 ? '#ef4444' : '#22c55e'],
                    ['You Receive', `${mintAmt.toLocaleString()} NGNs`, '#D4AF37'],
                    ['Mint To', truncAddr(recipient), '#60a5fa'],
                  ].map(([l, v, c]) => (
                    <div
                      key={l}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: '12px' }}>{l}</span>
                      <span
                        style={{
                          color: c,
                          fontWeight: '900',
                          fontSize: l === 'You Receive' ? '16px' : '13px',
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                {initError && (
                  <p style={{ color: '#ef4444', fontSize: '11px', textAlign: 'center' }}>
                    {initError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setBuyPhase('amount')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleBuyInitiate}
                    disabled={initiating}
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                      border: 'none',
                      color: '#000',
                      fontSize: '13px',
                      fontWeight: '900',
                      cursor: initiating ? 'wait' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                    }}
                  >
                    {initiating && <Spinner />}
                    {initiating ? 'Starting…' : 'Confirm & Start'}
                  </button>
                </div>
              </div>
            )}

            {/* ── SELL: AMOUNT ── */}
            {mode === 'sell' && sellPhase === 'amount' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '20px 20px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '36px', marginBottom: '8px' }}>💸</div>
                    <h3
                      style={{
                        color: '#f5f0e8',
                        fontSize: '17px',
                        fontWeight: '900',
                        margin: '0 0 4px',
                      }}
                    >
                      Sell NGNs · BNB CHAIN
                    </h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                      NGNs will be burned from: {truncAddr(l1Account)}
                    </p>
                  </div>
                  <div>
                    <SectionLabel>Amount to Burn (NGNs)</SectionLabel>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder={`e.g. ${otcConfig.minNgn.toLocaleString()}`}
                        value={sellAmountDisplay}
                        onChange={(e) => {
                          const f = fmtInput(e.target.value);
                          setSellAmountDisplay(f);
                          const raw = parseFloat(f.replace(/,/g, '')) || 0;
                          setSellAmountRaw(raw);
                          setSellAmountError(
                            raw > 0 && raw < otcConfig.minNgn
                              ? `Minimum is ₦${otcConfig.minNgn.toLocaleString()}`
                              : raw > otcConfig.maxNgn
                                ? `Maximum is ₦${otcConfig.maxNgn.toLocaleString()}`
                                : ''
                          );
                        }}
                        style={{
                          width: '100%',
                          padding: '13px 52px 13px 14px',
                          borderRadius: '12px',
                          border: `2px solid ${sellAmountError ? '#ef4444' : 'rgba(212,175,55,0.25)'}`,
                          background: '#1a1a1b',
                          color: sellAmountError ? '#ef4444' : '#f5f0e8',
                          fontSize: '18px',
                          fontWeight: '900',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                      <span
                        style={{
                          position: 'absolute',
                          right: '12px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          color: sellAmountError ? '#ef4444' : '#D4AF37',
                          fontWeight: '900',
                          fontSize: '12px',
                        }}
                      >
                        NGNs
                      </span>
                    </div>
                    {sellAmountError && (
                      <p
                        style={{
                          color: '#ef4444',
                          fontSize: '10px',
                          margin: '4px 0 0',
                          fontWeight: '700',
                        }}
                      >
                        ⚠️ {sellAmountError}
                      </p>
                    )}
                    <p
                      style={{
                        color: 'rgba(255,255,255,0.3)',
                        fontSize: '10px',
                        margin: '5px 0 0',
                      }}
                    >
                      Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                      {otcConfig.maxNgn.toLocaleString()}
                    </p>
                  </div>

                  {sellValid && (
                    <div
                      style={{
                        background: 'rgba(212,175,55,0.05)',
                        border: '1px solid rgba(212,175,55,0.15)',
                        borderRadius: '12px',
                        padding: '12px 14px',
                      }}
                    >
                      {[
                        ['You Burn', `${sellAmountRaw.toLocaleString()} NGNs`],
                        ['Fee', `-${sellFee.toLocaleString()} NGNs`],
                        ['You Receive (fiat)', `₦${sellPayout.toLocaleString()}`],
                      ].map(([l, v], i) => (
                        <div
                          key={l}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            marginBottom: i < 2 ? '6px' : 0,
                            paddingTop: i === 2 ? '8px' : 0,
                            borderTop: i === 2 ? '1px solid rgba(212,175,55,0.1)' : 'none',
                          }}
                        >
                          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '11px' }}>
                            {l}
                          </span>
                          <span
                            style={{
                              color: i === 1 ? '#ef4444' : i === 2 ? '#D4AF37' : '#f5f0e8',
                              fontWeight: i === 2 ? '900' : '700',
                              fontSize: i === 2 ? '14px' : '11px',
                            }}
                          >
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div
                    style={{
                      padding: '10px 12px',
                      borderRadius: '10px',
                      background: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.15)',
                    }}
                  >
                    <p style={{ color: '#ef4444', fontSize: '10px', margin: 0 }}>
                      ⚠️ NGNs are burned immediately on-chain from your connected wallet. Cannot be
                      undone.
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    padding: '12px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: '#0d0d0e',
                  }}
                >
                  <button
                    onClick={() => sellValid && setSellPhase('bank')}
                    disabled={!sellValid}
                    style={{
                      width: '100%',
                      padding: '13px',
                      background: !sellValid
                        ? 'rgba(239,68,68,0.2)'
                        : 'linear-gradient(135deg, #ef4444, #b91c1c)',
                      border: 'none',
                      borderRadius: '12px',
                      color: !sellValid ? 'rgba(239,68,68,0.4)' : '#fff',
                      fontSize: '13px',
                      fontWeight: '900',
                      cursor: !sellValid ? 'not-allowed' : 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ── SELL: BANK DETAILS ── */}
            {mode === 'sell' && sellPhase === 'bank' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '16px 20px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                  }}
                >
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '6px' }}>🏦</div>
                    <h3
                      style={{
                        color: '#f5f0e8',
                        fontSize: '16px',
                        fontWeight: '900',
                        margin: '0 0 3px',
                      }}
                    >
                      Your Bank Details
                    </h3>
                    <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px', margin: 0 }}>
                      Seller will pay ₦{sellPayout.toLocaleString()} here
                    </p>
                  </div>
                  {[
                    {
                      label: 'Bank Name',
                      value: bankName,
                      setter: setBankName,
                      placeholder: 'e.g. OPay, GTBank',
                    },
                    {
                      label: 'Account Number',
                      value: accountNumber,
                      setter: setAccountNumber,
                      placeholder: '10-digit account number',
                    },
                    {
                      label: 'Account Name',
                      value: accountName,
                      setter: setAccountName,
                      placeholder: 'Full account name',
                    },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label}>
                      <SectionLabel>{label}</SectionLabel>
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '11px 14px',
                          borderRadius: '10px',
                          border: '1px solid rgba(212,175,55,0.2)',
                          background: '#1a1a1b',
                          color: '#f5f0e8',
                          fontSize: '13px',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  ))}
                  <div
                    style={{
                      background: 'rgba(239,68,68,0.08)',
                      border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                    }}
                  >
                    <p style={{ color: '#ef4444', fontSize: '11px', margin: 0 }}>
                      ⚠️ {sellAmountRaw.toLocaleString()} NGNs will be burned immediately. You
                      receive ₦{sellPayout.toLocaleString()}. Double-check details.
                    </p>
                  </div>
                  {sellError && (
                    <p style={{ color: '#ef4444', fontSize: '11px', fontWeight: '700', margin: 0 }}>
                      ⚠️ {sellError}
                    </p>
                  )}
                </div>
                <div
                  style={{
                    flexShrink: 0,
                    padding: '12px 20px',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    background: '#0d0d0e',
                    display: 'flex',
                    gap: '8px',
                  }}
                >
                  <button
                    onClick={() => setSellPhase('amount')}
                    style={{
                      flex: 1,
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: 'rgba(255,255,255,0.6)',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSellInitiate}
                    disabled={
                      sellInitiating ||
                      !bankName.trim() ||
                      !accountNumber.trim() ||
                      !accountName.trim()
                    }
                    style={{
                      flex: 2,
                      padding: '12px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                      border: 'none',
                      color: '#fff',
                      fontSize: '13px',
                      fontWeight: '900',
                      cursor:
                        sellInitiating ||
                        !bankName.trim() ||
                        !accountNumber.trim() ||
                        !accountName.trim()
                          ? 'not-allowed'
                          : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      opacity:
                        !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? 0.5 : 1,
                    }}
                  >
                    {sellInitiating && <Spinner color="#fff" />}
                    {sellInitiating ? 'Burning…' : '🔥 Burn & Submit'}
                  </button>
                </div>
              </div>
            )}

            {/* ── SHARED CHAT ── */}
            {((mode === 'buy' && buyPhase === 'chat') ||
              (mode === 'sell' && sellPhase === 'chat')) && (
              <>
                <div
                  ref={chatContainerRef}
                  onScroll={(e) => {
                    const el = e.currentTarget;
                    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                  }}
                  style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    background: '#0a0a0b',
                  }}
                >
                  {messages.length === 0 && (
                    <div
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        opacity: 0.4,
                      }}
                    >
                      <p style={{ color: '#D4AF37', fontSize: '12px' }}>Loading messages…</p>
                    </div>
                  )}
                  {messages.map((msg, i) => (
                    <Bubble key={msg._id || i} msg={msg} />
                  ))}

                  {mode === 'buy' && status === 'pending' && sellerInfo && (
                    <div
                      style={{
                        padding: '12px 14px',
                        background: 'rgba(212,175,55,0.06)',
                        border: '1px solid rgba(212,175,55,0.2)',
                        borderRadius: '12px',
                        margin: '4px 0',
                      }}
                    >
                      <p
                        style={{
                          color: 'rgba(212,175,55,0.7)',
                          fontSize: '9px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em',
                          fontWeight: '700',
                          margin: '0 0 10px',
                        }}
                      >
                        📤 Send your payment to:
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {[
                          { label: 'Bank', value: sellerInfo.bankName },
                          { label: 'Account Name', value: sellerInfo.accountName },
                          { label: 'Account Number', value: sellerInfo.accountNumber },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: '8px',
                            }}
                          >
                            <span
                              style={{
                                color: 'rgba(255,255,255,0.35)',
                                fontSize: '10px',
                                flexShrink: 0,
                              }}
                            >
                              {label}
                            </span>
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                minWidth: 0,
                              }}
                            >
                              <span
                                style={{
                                  color: '#f5f0e8',
                                  fontSize: '12px',
                                  fontWeight: '700',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                {value || '—'}
                              </span>
                              {value && <CopyBtn value={value} />}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {mode === 'buy' &&
                    status === 'pending' &&
                    messages.length > 0 &&
                    !showReceiptUpload && (
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        style={{ display: 'flex', justifyContent: 'flex-end' }}
                      >
                        <button
                          onClick={() => setShowReceiptUpload(true)}
                          style={{
                            padding: '10px 16px',
                            borderRadius: '12px',
                            background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                            border: 'none',
                            color: '#000',
                            fontSize: '12px',
                            fontWeight: '900',
                            cursor: 'pointer',
                            boxShadow: '0 0 16px rgba(212,175,55,0.4)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                          }}
                        >
                          <span>✅</span> I Have Paid
                        </button>
                      </motion.div>
                    )}

                  {status === 'minting' && (
                    <div
                      style={{
                        padding: '12px',
                        background: 'rgba(212,175,55,0.06)',
                        border: '1px solid rgba(212,175,55,0.2)',
                        borderRadius: '12px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                      }}
                    >
                      <div
                        style={{
                          width: '16px',
                          height: '16px',
                          border: '2px solid rgba(212,175,55,0.3)',
                          borderTopColor: '#D4AF37',
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                          flexShrink: 0,
                        }}
                      />
                      <p
                        style={{ color: '#D4AF37', fontSize: '12px', margin: 0, fontWeight: '700' }}
                      >
                        Minting on BNB Chain… please wait.
                      </p>
                    </div>
                  )}

                  {(isMinted || isRejected || isBurned) && (
                    <button
                      onClick={resetAll}
                      style={{
                        padding: '11px',
                        borderRadius: '12px',
                        background: isMinted ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.1)',
                        border: `1px solid ${isMinted ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        color: isMinted ? '#22c55e' : '#ef4444',
                        fontSize: '12px',
                        fontWeight: '700',
                        cursor: 'pointer',
                      }}
                    >
                      {isMinted
                        ? 'Buy More NGNs →'
                        : isBurned
                          ? 'New Transaction →'
                          : 'Start New Request →'}
                    </button>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {canChat && (
                  <MessageInput onSend={handleSend} onImage={handleSendImage} disabled={sending} />
                )}

                <div
                  style={{
                    padding: '8px 12px',
                    borderTop: '1px solid rgba(255,255,255,0.04)',
                    display: 'flex',
                    justifyContent: 'center',
                  }}
                >
                  <button
                    onClick={() => {
                      setMintRequest(null);
                      setMessages([]);
                      setBuyPhase('amount');
                      setSellPhase('amount');
                      setMode(null);
                    }}
                    style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      color: 'rgba(255,255,255,0.2)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                    }}
                  >
                    ← Switch Mode
                  </button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </>
  );
};

export default L1BuyNGNs;
