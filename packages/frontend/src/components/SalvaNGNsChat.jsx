// Salva-Digital-Tech/packages/frontend/src/components/SalvaNGNsChat.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import NetworkReminder, { useNetworkReminder } from './NetworkReminder';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';

// ── Mobile content-scale helpers — see SalvaSellerChat.jsx for the full
// explanation. Container size is never touched; only content inside scales. ──
const px = (n) => `calc(${n}px * var(--cscale, 1))`;
const pxs = (...vals) => vals.map((v) => (typeof v === 'number' ? px(v) : v)).join(' ');

const ContentScaleStyle = () => (
  <style>{`
    .snc-scale { --cscale: 1; }
    @media (max-width: 639px) {
      .snc-scale { --cscale: 0.7; }
    }
  `}</style>
);

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

const CopyBtn = ({ value, label }) => {
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
        padding: pxs(3, 9),
        borderRadius: px(6),
        background: copied ? 'rgba(34,197,94,0.2)' : 'rgba(212,175,55,0.12)',
        border: `1px solid ${copied ? 'rgba(34,197,94,0.4)' : 'rgba(212,175,55,0.3)'}`,
        color: copied ? '#22c55e' : '#D4AF37',
        fontSize: px(9),
        fontWeight: '700',
        cursor: 'pointer',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        transition: 'all 0.2s',
        flexShrink: 0,
      }}
    >
      {copied ? '✓ Copied' : label || 'Copy'}
    </button>
  );
};

const MessageInput = memo(({ onSend, onImage, disabled, placeholder = 'Ask a question…' }) => {
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
        padding: pxs(7, 10),
        background: '#0d0d0e',
        borderTop: '1px solid rgba(212,175,55,0.15)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', gap: px(8), alignItems: 'flex-end' }}>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
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
          }}
          title="Upload image"
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
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            padding: pxs(9, 12),
            borderRadius: px(12),
            border: '1px solid rgba(212,175,55,0.2)',
            background: '#1a1a1b',
            color: '#f5f0e8',
            fontSize: px(13),
            outline: 'none',
            resize: 'none',
            overflowY: 'hidden',
            lineHeight: '1.5',
            fontFamily: 'inherit',
            minHeight: px(38),
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
            flexShrink: 0,
            width: px(36),
            height: px(36),
            borderRadius: px(10),
            background:
              disabled || !text.trim()
                ? 'rgba(212,175,55,0.2)'
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

const Bubble = memo(({ msg }) => {
  const isMe = msg.sender === 'user';

  if (msg.isMinted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: pxs(8, 0),
          padding: pxs(14, 16),
          borderRadius: px(16),
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))',
          border: '1px solid rgba(34,197,94,0.4)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: px(28), marginBottom: px(6) }}>🎉</div>
        <p
          style={{ color: '#22c55e', fontWeight: '900', fontSize: px(13), margin: `0 0 ${px(4)}` }}
        >
          NGNs Minted!
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: px(11),
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
          margin: pxs(8, 0),
          padding: pxs(14, 16),
          borderRadius: px(16),
          background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))',
          border: '1px solid rgba(239,68,68,0.35)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: px(28), marginBottom: px(6) }}>🔥</div>
        <p
          style={{ color: '#ef4444', fontWeight: '900', fontSize: px(13), margin: `0 0 ${px(4)}` }}
        >
          Sell Request Submitted
        </p>
        <p
          style={{
            color: 'rgba(255,255,255,0.6)',
            fontSize: px(11),
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
        gap: px(6),
      }}
    >
      {!isMe && (
        <div
          style={{
            width: px(26),
            height: px(26),
            borderRadius: px(8),
            flexShrink: 0,
            background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: px(10),
            fontWeight: '900',
            color: '#000',
          }}
        >
          ₦
        </div>
      )}
      <div
        style={{
          maxWidth: '78%',
          padding: pxs(10, 13),
          borderRadius: isMe ? pxs(16, 16, 4, 16) : pxs(16, 16, 16, 4),
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
              maxHeight: px(180),
              borderRadius: px(10),
              marginBottom: msg.text ? px(6) : 0,
              display: 'block',
              objectFit: 'contain',
            }}
          />
        )}
        {msg.text && (
          <p
            style={{
              fontSize: px(11),
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
            fontSize: px(9),
            color: isMe ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)',
            margin: `${px(4)} 0 0`,
            textAlign: 'right',
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {isMe && <span style={{ marginLeft: px(4) }}>✓</span>}
        </p>
      </div>
    </div>
  );
});

const SalvaNGNsChat = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [showNetworkReminder, setShowNetworkReminder] = useState(false);

  const [otcConfig, setOtcConfig] = useState({
    minNgn: 10000,
    maxNgn: 200000,
    feePercent: 0.2,
  });

  const [buyPhase, setBuyPhase] = useState('amount');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amountRaw, setAmountRaw] = useState(0);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState('');
  const [sellerInfo, setSellerInfo] = useState(null);

  const [sellPhase, setSellPhase] = useState('amount');
  const [sellAmountDisplay, setSellAmountDisplay] = useState('');
  const [sellAmountRaw, setSellAmountRaw] = useState(0);
  const [sellAmountError, setSellAmountError] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [sellError, setSellError] = useState('');
  const [sellInitiating, setSellInitiating] = useState(false);
  const [ngnBalance, setNgnBalance] = useState(0);

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
  const isBurning = status === 'burning' || status === 'pending_burn';
  const isMinted = status === 'minted';
  const isRejected = status === 'rejected';
  const isBurned = status === 'burned' || status === 'sell_completed';

  const buyValid = amountRaw >= otcConfig.minNgn && amountRaw <= otcConfig.maxNgn;
  const sellValid =
    sellAmountRaw >= otcConfig.minNgn && sellAmountRaw <= otcConfig.maxNgn && !sellAmountError;

  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMessageCount.current && isNearBottom.current) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  const loadRequest = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`);
      const data = await res.json();
      if (
        data.request &&
        ['pending', 'paid', 'minting', 'burning', 'pending_burn'].includes(data.request.status)
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
  }, [user?.safeAddress]);

  const fetchBalance = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`);
      const data = await res.json();
      setNgnBalance(parseFloat(data.ngnsBalance || 0));
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  const fetchSellerInfo = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/seller-info`);
      if (res.ok) {
        const data = await res.json();
        setSellerInfo(data);
      }
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
      fetchBalance();
      fetchSellerInfo();
      fetchOtcConfig();
    }
  }, [isOpen, loadRequest, fetchBalance, fetchSellerInfo, fetchOtcConfig]);

  useEffect(() => {
    const activeChat =
      (mode === 'buy' && buyPhase === 'chat') || (mode === 'sell' && sellPhase === 'chat');
    if (!activeChat || !mintRequest?._id || !isOpen) {
      clearTimeout(pollRef.current);
      return;
    }

    let failCount = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`);
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
      const next = failCount >= 3 ? 20000 : 8000;
      pollRef.current = setTimeout(poll, next);
    };

    pollRef.current = setTimeout(poll, 8000);
    return () => clearTimeout(pollRef.current);
  }, [mode, buyPhase, sellPhase, mintRequest?._id, isOpen, user?.safeAddress]);

  const handleBuyInitiate = async () => {
    setInitError('');
    setInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          amountNgn: amountRaw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInitError(data.message || 'Could not start your request. Please try again.');
        return;
      }
      await loadRequest();
    } catch {
      setInitError('Connection error. Check your network and try again.');
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
          safeAddress: user.safeAddress,
          amountNgn: sellAmountRaw,
          bankName,
          accountNumber,
          accountName,
        }),
      });
      const data = await res.json();

      if (res.status === 202 && data.pending) {
        await loadRequest();
        return;
      }

      if (!res.ok) {
        if (res.status === 409 && data.isPendingBurn) {
          setSellError(
            'A burn is already in progress for your account. Refresh the page to check the status before submitting again.'
          );
        } else {
          setSellError(data.message || 'Could not process your sell request. Please try again.');
        }
        return;
      }
      await loadRequest();
    } catch (err) {
      setSellError(
        'Connection failed. If you already tapped "Burn", refresh this page first before trying again — your tokens may already be burned.'
      );
    } finally {
      setSellInitiating(false);
    }
  };

  const handleSend = async (text) => {
    if (!mintRequest?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: 'user',
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
          requestId: mintRequest._id,
          safeAddress: user.safeAddress,
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
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: mintRequest._id,
          safeAddress: user.safeAddress,
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
            safeAddress: user.safeAddress,
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
        width: px(10),
        height: px(10),
        border: `2px solid ${color}30`,
        borderTopColor: color,
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'spin 0.6s linear infinite',
      }}
    />
  );

  if (!isOpen) {
    return (
      <>
        <div className="fixed bottom-2 right-2 sm:bottom-6 sm:right-6 z-[9000] scale-[1.2] sm:scale-100 origin-bottom-right">
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              setShowNetworkReminder(true);
            }}
            className="relative w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
              boxShadow: '0 0 28px rgba(212,175,55,0.45), 0 4px 20px rgba(0,0,0,0.5)',
            }}
          >
            <span className="text-xl font-black text-black">₦</span>
            <motion.div
              animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
              transition={{ repeat: Infinity, duration: 2 }}
              className="absolute inset-0 rounded-full border-2 border-salvaGold pointer-events-none"
            />
          </motion.button>
        </div>
        {showNetworkReminder && (
          <NetworkReminder
            chain="base"
            action="buy"
            onContinue={() => {
              setShowNetworkReminder(false);
              setIsOpen(true);
            }}
            onClose={() => setShowNetworkReminder(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ContentScaleStyle />
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
                boxShadow: '0 32px 80px rgba(0,0,0,0.8)',
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
                    border: `2px dashed ${
                      receiptPreview ? 'rgba(34,197,94,0.5)' : 'rgba(212,175,55,0.3)'
                    }`,
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

      <div
        className="fixed inset-0 z-[8999]"
        onClick={() => setIsOpen(false)}
        style={{ touchAction: 'none' }}
      />
      {/* Container — width/height/border/background fixed and NEVER scaled. */}
      <div
        className="fixed bottom-2 right-2 z-[9000] origin-bottom-right sm:bottom-6 sm:right-6"
        style={{ width: '320px' }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="snc-scale h-[520px] bg-[#0d0d0e] border border-salvaGold/20 rounded-[22px] overflow-hidden flex flex-col shadow-[0_28px_72px_rgba(0,0,0,0.8)]">
            {/* ── HEADER ── */}
            <div
              className="flex items-center flex-shrink-0"
              style={{
                gap: px(10),
                padding: pxs(10, 12),
                borderBottom: '1px solid rgba(212,175,55,0.25)',
                background: 'linear-gradient(135deg, #1a1500, #111100)',
              }}
            >
              {mode &&
                (buyPhase === 'amount' ||
                  buyPhase === 'confirm' ||
                  sellPhase === 'amount' ||
                  sellPhase === 'bank') && (
                  <button
                    onClick={() => {
                      if (mode === 'buy') {
                        if (buyPhase === 'amount') {
                          setMode(null);
                          setBuyPhase('amount');
                        } else setBuyPhase('amount');
                      } else {
                        if (sellPhase === 'amount') {
                          setMode(null);
                          setSellPhase('amount');
                        } else if (sellPhase === 'bank') setSellPhase('amount');
                      }
                    }}
                    className="text-salvaGold/60 cursor-pointer bg-transparent border-none flex-shrink-0 hover:text-salvaGold transition-colors"
                    style={{ fontSize: px(18), lineHeight: 1, paddingRight: px(4) }}
                  >
                    ←
                  </button>
                )}
              {((mode === 'buy' && buyPhase === 'chat') ||
                (mode === 'sell' && sellPhase === 'chat')) && (
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setBuyPhase('amount');
                    setSellPhase('amount');
                    setMode(null);
                  }}
                  className="text-salvaGold/60 cursor-pointer bg-transparent border-none flex-shrink-0 hover:text-salvaGold transition-colors"
                  style={{ fontSize: px(18), lineHeight: 1, paddingRight: px(4) }}
                >
                  ←
                </button>
              )}
              <div
                className="flex items-center justify-center flex-shrink-0 font-black"
                style={{
                  width: px(36),
                  height: px(36),
                  borderRadius: px(12),
                  fontSize: px(16),
                  background:
                    mode === 'sell'
                      ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                      : 'linear-gradient(135deg, #D4AF37, #b8941e)',
                  color: mode === 'sell' ? '#fff' : '#000',
                }}
              >
                ₦
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[#f5f0e8] font-black m-0 truncate" style={{ fontSize: px(13) }}>
                  {!mode ? 'NGNs Exchange' : mode === 'sell' ? 'Sell NGNs' : 'Buy NGNs'}
                </p>
                <p className="text-salvaGold/60 m-0 truncate" style={{ fontSize: px(10) }}>
                  {!mode
                    ? 'Choose an option'
                    : mode === 'buy'
                    ? buyPhase === 'chat'
                      ? status === 'pending'
                        ? 'Awaiting payment'
                        : status === 'paid'
                        ? 'Verifying…'
                        : status === 'minting'
                        ? 'Minting…'
                        : status === 'minted'
                        ? 'Complete ✓'
                        : 'Rejected'
                      : 'Salva · Online'
                    : sellPhase === 'chat'
                    ? 'Sell request active'
                    : 'Salva · Online'}
                </p>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="rounded-full bg-white/[0.07] border border-white/10 cursor-pointer text-white/50 flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-all"
                style={{ width: px(28), height: px(28), fontSize: px(16) }}
              >
                ×
              </button>
            </div>

            {/* ── MODE SELECTOR ── */}
            {!mode && (
              <div
                className="flex-1 flex flex-col items-center justify-center"
                style={{ padding: px(24), gap: px(16) }}
              >
                <div
                  className="bg-gradient-to-b from-transparent via-salvaGold/40 to-transparent"
                  style={{ width: '1px', height: px(32) }}
                />
                <div
                  className="flex items-center justify-center font-black text-black shadow-lg shadow-salvaGold/20"
                  style={{
                    width: px(56),
                    height: px(56),
                    borderRadius: px(16),
                    fontSize: px(24),
                    background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                  }}
                >
                  ₦
                </div>
                <div className="text-center">
                  <h3
                    className="text-[#f5f0e8] font-black m-0"
                    style={{ fontSize: px(18), marginBottom: px(4) }}
                  >
                    NGNs Exchange
                  </h3>
                  <p className="text-white/40 m-0" style={{ fontSize: px(11) }}>
                    Buy or sell Nigerian Naira stablecoin
                  </p>
                </div>
                <div className="flex w-full" style={{ gap: px(12) }}>
                  <button
                    onClick={() => {
                      setMintRequest(null);
                      setMessages([]);
                      setBuyPhase('amount');
                      setMode('buy');
                    }}
                    className="flex-1 font-black text-black cursor-pointer border-none transition-all hover:brightness-110 active:scale-[0.97]"
                    style={{
                      padding: px(16),
                      borderRadius: px(16),
                      fontSize: px(14),
                      background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                      boxShadow: '0 0 20px rgba(212,175,55,0.3)',
                    }}
                  >
                    🛒 Buy NGNs
                  </button>
                  <button
                    onClick={() => {
                      setMintRequest(null);
                      setMessages([]);
                      setSellPhase('amount');
                      setMode('sell');
                      fetchBalance();
                    }}
                    className="flex-1 font-black text-white cursor-pointer border-none transition-all hover:brightness-110 active:scale-[0.97]"
                    style={{
                      padding: px(16),
                      borderRadius: px(16),
                      fontSize: px(14),
                      background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                      boxShadow: '0 0 20px rgba(239,68,68,0.3)',
                    }}
                  >
                    💸 Sell NGNs
                  </button>
                </div>
                <div
                  className="w-full bg-white/[0.03] border border-white/[0.05]"
                  style={{ borderRadius: px(12), padding: px(12) }}
                >
                  <p
                    className="text-salvaGold/50 uppercase font-bold m-0"
                    style={{ fontSize: px(9), letterSpacing: '0.15em', marginBottom: px(8) }}
                  >
                    How it works
                  </p>
                  {[
                    'Buy: Transfer fiat → receive NGNs in wallet',
                    'Sell: Burn NGNs → receive fiat in bank account',
                  ].map((s, i) => (
                    <div
                      key={i}
                      className="flex items-center"
                      style={{ gap: px(8), marginBottom: i === 0 ? px(6) : 0 }}
                    >
                      <span
                        className="rounded-full bg-salvaGold/20 text-salvaGold font-black flex items-center justify-center flex-shrink-0"
                        style={{ width: px(16), height: px(16), fontSize: px(9) }}
                      >
                        {i + 1}
                      </span>
                      <span className="text-white/40" style={{ fontSize: px(11) }}>
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── BUY: AMOUNT ── */}
            {mode === 'buy' && buyPhase === 'amount' && (
              <div
                className="flex-1 flex flex-col justify-center overflow-y-auto"
                style={{ padding: `${px(24)} ${px(20)}`, gap: px(16) }}
              >
                <div className="text-center">
                  <div style={{ fontSize: px(36), marginBottom: px(8) }}>🛒</div>
                  <h3
                    className="text-[#f5f0e8] font-black m-0"
                    style={{ fontSize: px(17), marginBottom: px(4) }}
                  >
                    Buy NGNs
                  </h3>
                  <p className="text-white/40 m-0" style={{ fontSize: px(11) }}>
                    Enter the amount you want to purchase
                  </p>
                </div>
                <div>
                  <p
                    className="text-salvaGold/60 uppercase font-bold"
                    style={{ fontSize: px(9), letterSpacing: '0.15em', marginBottom: px(6) }}
                  >
                    Amount (NGNs)
                  </p>
                  <div className="relative">
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
                      className="w-full border border-salvaGold/25 bg-[#1a1a1b] text-[#f5f0e8] font-black outline-none focus:border-salvaGold/70 transition-colors box-border"
                      style={{
                        padding: `${px(12)} ${px(56)} ${px(12)} ${px(14)}`,
                        borderRadius: px(12),
                        fontSize: px(18),
                      }}
                    />
                    <span
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-salvaGold font-black"
                      style={{ fontSize: px(12) }}
                    >
                      NGNs
                    </span>
                  </div>
                  <p className="text-white/30" style={{ fontSize: px(10), marginTop: px(4) }}>
                    Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                    {otcConfig.maxNgn.toLocaleString()}
                  </p>
                </div>
                {buyValid && (
                  <div
                    className="bg-salvaGold/5 border border-salvaGold/15"
                    style={{ borderRadius: px(12), padding: px(14) }}
                  >
                    {[
                      ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`, '#f5f0e8'],
                      ['Fee', fee > 0 ? `-${fee} NGNs` : 'Free', fee > 0 ? '#ef4444' : '#22c55e'],
                      ['You Receive', `${mintAmt.toLocaleString()} NGNs`, '#D4AF37'],
                    ].map(([l, v, c], i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center"
                        style={{
                          paddingTop: i === 2 ? px(8) : 0,
                          borderTop: i === 2 ? '1px solid rgba(212,175,55,0.1)' : 'none',
                          marginTop: i === 1 ? px(6) : i === 2 ? px(6) : 0,
                        }}
                      >
                        <span className="text-white/45" style={{ fontSize: px(11) }}>
                          {l}
                        </span>
                        <span
                          className="font-black"
                          style={{ color: c, fontSize: i === 2 ? px(14) : px(11) }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {initError && (
                  <div
                    className="flex items-center bg-red-500/10 border border-red-500/25"
                    style={{ gap: px(8), padding: `${px(10)} ${px(14)}`, borderRadius: px(12) }}
                  >
                    <span style={{ fontSize: px(14), flexShrink: 0 }}>⚠️</span>
                    <p className="text-red-400 font-bold m-0" style={{ fontSize: px(11) }}>
                      {initError}
                    </p>
                  </div>
                )}
                <button
                  onClick={() => buyValid && setBuyPhase('confirm')}
                  disabled={!buyValid}
                  className={`w-full border-none font-black uppercase cursor-pointer transition-all active:scale-[0.98] ${
                    buyValid ? 'hover:brightness-110' : 'cursor-not-allowed'
                  }`}
                  style={{
                    padding: px(14),
                    borderRadius: px(12),
                    fontSize: px(14),
                    background: buyValid
                      ? 'linear-gradient(135deg, #D4AF37, #b8941e)'
                      : 'rgba(212,175,55,0.2)',
                    color: buyValid ? '#000' : 'rgba(212,175,55,0.4)',
                  }}
                >
                  Continue →
                </button>
              </div>
            )}

            {/* ── BUY: CONFIRM ── */}
            {mode === 'buy' && buyPhase === 'confirm' && (
              <div
                className="flex-1 flex flex-col justify-center overflow-y-auto"
                style={{ padding: `${px(24)} ${px(20)}`, gap: px(16) }}
              >
                <div className="text-center">
                  <div style={{ fontSize: px(36), marginBottom: px(8) }}>⚡</div>
                  <h3
                    className="text-[#f5f0e8] font-black m-0"
                    style={{ fontSize: px(17), marginBottom: px(4) }}
                  >
                    Confirm Purchase
                  </h3>
                  <p className="text-white/40 m-0" style={{ fontSize: px(11) }}>
                    Review before proceeding
                  </p>
                </div>
                <div
                  className="bg-salvaGold/[0.06] border border-salvaGold/20"
                  style={{ borderRadius: px(16), padding: px(16) }}
                >
                  {[
                    ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`, '#f5f0e8', 13],
                    ['Fee', fee > 0 ? `-${fee} NGNs` : 'Free', fee > 0 ? '#ef4444' : '#22c55e', 13],
                    ['You Receive', `${mintAmt.toLocaleString()} NGNs`, '#D4AF37', 16],
                  ].map(([l, v, c, fs], i) => (
                    <div
                      key={l}
                      className="flex justify-between items-center"
                      style={{ marginTop: i > 0 ? px(10) : 0 }}
                    >
                      <span className="text-white/50" style={{ fontSize: px(12) }}>
                        {l}
                      </span>
                      <span className="font-black" style={{ color: c, fontSize: px(fs) }}>
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
                {initError && (
                  <p className="text-red-400 text-center m-0" style={{ fontSize: px(11) }}>
                    {initError}
                  </p>
                )}
                <div className="flex" style={{ gap: px(8) }}>
                  <button
                    onClick={() => setBuyPhase('amount')}
                    className="flex-1 bg-white/5 border border-white/10 text-white/60 cursor-pointer hover:bg-white/10 transition-all"
                    style={{ padding: px(12), borderRadius: px(12), fontSize: px(12) }}
                  >
                    Back
                  </button>
                  <button
                    onClick={handleBuyInitiate}
                    disabled={initiating}
                    className="flex-[2] border-none text-black font-black cursor-pointer flex items-center justify-center hover:brightness-110 transition-all"
                    style={{
                      padding: px(12),
                      borderRadius: px(12),
                      fontSize: px(13),
                      gap: px(6),
                      background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
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
              <div className="flex-1 flex flex-col min-h-0">
                <div
                  className="flex-1 overflow-y-auto flex flex-col"
                  style={{ padding: `${px(20)} ${px(20)} ${px(12)}`, gap: px(14) }}
                >
                  <div className="text-center">
                    <div style={{ fontSize: px(36), marginBottom: px(8) }}>💸</div>
                    <h3
                      className="text-[#f5f0e8] font-black m-0"
                      style={{ fontSize: px(17), marginBottom: px(4) }}
                    >
                      Sell NGNs
                    </h3>
                    <p className="text-white/40 m-0" style={{ fontSize: px(11) }}>
                      Balance: {ngnBalance.toLocaleString()} NGNs
                    </p>
                  </div>
                  <div>
                    <p
                      className="text-salvaGold/60 uppercase font-bold"
                      style={{ fontSize: px(9), letterSpacing: '0.15em', marginBottom: px(6) }}
                    >
                      Amount to Burn (NGNs)
                    </p>
                    <div className="relative">
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
                            raw > ngnBalance
                              ? 'Insufficient NGNs balance'
                              : raw > 0 && raw < otcConfig.minNgn
                              ? `Minimum is ₦${otcConfig.minNgn.toLocaleString()}`
                              : raw > otcConfig.maxNgn
                              ? `Maximum is ₦${otcConfig.maxNgn.toLocaleString()}`
                              : ''
                          );
                        }}
                        className={`w-full bg-[#1a1a1b] font-black outline-none transition-colors box-border ${
                          sellAmountError
                            ? 'border-2 border-red-500 text-red-400'
                            : 'border border-salvaGold/25 text-[#f5f0e8] focus:border-salvaGold/70'
                        }`}
                        style={{
                          padding: `${px(12)} ${px(56)} ${px(12)} ${px(14)}`,
                          borderRadius: px(12),
                          fontSize: px(18),
                        }}
                      />
                      <span
                        className={`absolute right-3 top-1/2 -translate-y-1/2 font-black ${
                          sellAmountError ? 'text-red-400' : 'text-salvaGold'
                        }`}
                        style={{ fontSize: px(12) }}
                      >
                        NGNs
                      </span>
                    </div>
                    {sellAmountError && (
                      <p
                        className="text-red-400 font-bold m-0"
                        style={{ fontSize: px(10), marginTop: px(4) }}
                      >
                        ⚠️ {sellAmountError}
                      </p>
                    )}
                    <p className="text-white/30" style={{ fontSize: px(10), marginTop: px(4) }}>
                      Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                      {otcConfig.maxNgn.toLocaleString()}
                    </p>
                  </div>
                  {sellValid && (
                    <div
                      className="bg-salvaGold/5 border border-salvaGold/15"
                      style={{ borderRadius: px(12), padding: px(14) }}
                    >
                      {[
                        ['You Burn', `${sellAmountRaw.toLocaleString()} NGNs`, '#f5f0e8'],
                        ['Fee', `-${sellFee.toLocaleString()} NGNs`, '#ef4444'],
                        ['You Receive (fiat)', `₦${sellPayout.toLocaleString()}`, '#D4AF37'],
                      ].map(([l, v, c], i) => (
                        <div
                          key={l}
                          className="flex justify-between items-center"
                          style={{
                            paddingTop: i === 2 ? px(8) : 0,
                            borderTop: i === 2 ? '1px solid rgba(212,175,55,0.1)' : 'none',
                            marginTop: i > 0 ? px(6) : 0,
                          }}
                        >
                          <span className="text-white/45" style={{ fontSize: px(11) }}>
                            {l}
                          </span>
                          <span
                            className="font-black"
                            style={{ color: c, fontSize: i === 2 ? px(14) : px(11) }}
                          >
                            {v}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <div
                    className="bg-red-500/[0.06] border border-red-500/15"
                    style={{ borderRadius: px(12), padding: `${px(10)} ${px(12)}` }}
                  >
                    <p className="text-red-400 m-0" style={{ fontSize: px(10) }}>
                      ⚠️ NGNs are burned immediately on-chain. Cannot be undone.
                    </p>
                  </div>
                </div>
                <div
                  className="flex-shrink-0 border-t border-white/[0.06] bg-[#0d0d0e]"
                  style={{ padding: `${px(12)} ${px(20)}` }}
                >
                  <button
                    onClick={() => sellValid && setSellPhase('bank')}
                    disabled={!sellValid}
                    className={`w-full border-none font-black uppercase transition-all ${
                      sellValid
                        ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]'
                        : 'cursor-not-allowed'
                    }`}
                    style={{
                      padding: px(14),
                      borderRadius: px(12),
                      fontSize: px(14),
                      background: sellValid
                        ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                        : 'rgba(239,68,68,0.2)',
                      color: sellValid ? '#fff' : 'rgba(239,68,68,0.4)',
                    }}
                  >
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* ── SELL: BANK DETAILS ── */}
            {mode === 'sell' && sellPhase === 'bank' && (
              <div className="flex-1 flex flex-col min-h-0">
                <div
                  className="flex-1 overflow-y-auto flex flex-col"
                  style={{ padding: `${px(16)} ${px(20)} ${px(12)}`, gap: px(12) }}
                >
                  <div className="text-center">
                    <div style={{ fontSize: px(36), marginBottom: px(6) }}>🏦</div>
                    <h3
                      className="text-[#f5f0e8] font-black m-0"
                      style={{ fontSize: px(16), marginBottom: px(4) }}
                    >
                      Your Bank Details
                    </h3>
                    <p className="text-white/40 m-0" style={{ fontSize: px(11) }}>
                      Salva will pay ₦{sellPayout.toLocaleString()} here
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
                      <p
                        className="text-salvaGold/60 uppercase font-bold"
                        style={{ fontSize: px(9), letterSpacing: '0.15em', marginBottom: px(6) }}
                      >
                        {label}
                      </p>
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={value}
                        onChange={(e) => setter(e.target.value)}
                        className="w-full border border-salvaGold/20 bg-[#1a1a1b] text-[#f5f0e8] outline-none focus:border-salvaGold/60 transition-colors box-border"
                        style={{
                          padding: `${px(10)} ${px(14)}`,
                          borderRadius: px(12),
                          fontSize: px(13),
                        }}
                      />
                    </div>
                  ))}
                  {sellError && (
                    <div
                      className="flex items-center bg-red-500/10 border border-red-500/25"
                      style={{ gap: px(8), padding: `${px(10)} ${px(14)}`, borderRadius: px(12) }}
                    >
                      <span style={{ fontSize: px(14), flexShrink: 0 }}>⚠️</span>
                      <p className="text-red-400 font-bold m-0" style={{ fontSize: px(11) }}>
                        {sellError}
                      </p>
                    </div>
                  )}
                </div>
                <div
                  className="flex-shrink-0 border-t border-white/[0.06] bg-[#0d0d0e] flex"
                  style={{ padding: `${px(12)} ${px(20)}`, gap: px(8) }}
                >
                  <button
                    onClick={() => setSellPhase('amount')}
                    className="flex-1 bg-white/5 border border-white/10 text-white/60 cursor-pointer hover:bg-white/10 transition-all"
                    style={{ padding: px(12), borderRadius: px(12), fontSize: px(12) }}
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
                    className="flex-[2] border-none text-white font-black flex items-center justify-center transition-all hover:brightness-110"
                    style={{
                      padding: px(12),
                      borderRadius: px(12),
                      fontSize: px(13),
                      gap: px(6),
                      background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                      opacity:
                        !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? 0.5 : 1,
                      cursor:
                        sellInitiating ||
                        !bankName.trim() ||
                        !accountNumber.trim() ||
                        !accountName.trim()
                          ? 'not-allowed'
                          : 'pointer',
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
                  className="flex-1 overflow-y-auto flex flex-col bg-[#0a0a0b]"
                  style={{ padding: px(14), gap: px(8) }}
                >
                  {messages.length === 0 && (
                    <div className="flex-1 flex items-center justify-center opacity-40">
                      <p className="text-salvaGold m-0" style={{ fontSize: px(12) }}>
                        Loading messages…
                      </p>
                    </div>
                  )}

                  {messages.map((msg, i) => (
                    <Bubble key={msg._id || i} msg={msg} />
                  ))}

                  {mode === 'buy' && status === 'pending' && sellerInfo && (
                    <div
                      className="bg-salvaGold/[0.06] border border-salvaGold/20"
                      style={{
                        padding: `${px(12)} ${px(14)}`,
                        borderRadius: px(12),
                        margin: `${px(4)} 0`,
                      }}
                    >
                      <p
                        className="text-salvaGold/70 uppercase font-bold m-0"
                        style={{ fontSize: px(9), letterSpacing: '0.12em', marginBottom: px(10) }}
                      >
                        📤 Send your payment to:
                      </p>
                      <div className="flex flex-col" style={{ gap: px(8) }}>
                        {[
                          { label: 'Bank', value: sellerInfo.bankName },
                          { label: 'Account Name', value: sellerInfo.accountName },
                          { label: 'Account Number', value: sellerInfo.accountNumber },
                        ].map(({ label, value }) => (
                          <div
                            key={label}
                            className="flex justify-between items-center"
                            style={{ gap: px(8) }}
                          >
                            <span
                              className="text-white/35 flex-shrink-0"
                              style={{ fontSize: px(10) }}
                            >
                              {label}
                            </span>
                            <div className="flex items-center min-w-0" style={{ gap: px(6) }}>
                              <span
                                className="text-[#f5f0e8] font-bold truncate"
                                style={{ fontSize: px(12) }}
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
                        className="flex justify-end"
                      >
                        <button
                          onClick={() => setShowReceiptUpload(true)}
                          className="flex items-center border-none text-black font-black cursor-pointer hover:brightness-110 transition-all active:scale-[0.97]"
                          style={{
                            gap: px(6),
                            padding: `${px(10)} ${px(16)}`,
                            borderRadius: px(12),
                            fontSize: px(12),
                            background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                            boxShadow: '0 0 16px rgba(212,175,55,0.4)',
                          }}
                        >
                          ✅ I Have Paid
                        </button>
                      </motion.div>
                    )}

                  {isBurning && (
                    <div
                      className="bg-red-500/[0.06] border border-red-500/20 flex items-center"
                      style={{ padding: px(12), borderRadius: px(12), gap: px(10) }}
                    >
                      <div
                        className="border-2 border-red-500/30 border-t-red-500 flex-shrink-0"
                        style={{
                          width: px(16),
                          height: px(16),
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                      <p className="text-red-400 font-bold m-0" style={{ fontSize: px(12) }}>
                        ⚠️ Burn in progress — do NOT submit another request. Refresh if this takes
                        over 2 minutes.
                      </p>
                    </div>
                  )}
                  {status === 'minting' && (
                    <div
                      className="bg-salvaGold/[0.06] border border-salvaGold/20 flex items-center"
                      style={{ padding: px(12), borderRadius: px(12), gap: px(10) }}
                    >
                      <div
                        className="border-2 border-salvaGold/30 border-t-salvaGold flex-shrink-0"
                        style={{
                          width: px(16),
                          height: px(16),
                          borderRadius: '50%',
                          animation: 'spin 0.8s linear infinite',
                        }}
                      />
                      <p className="text-salvaGold font-bold m-0" style={{ fontSize: px(12) }}>
                        Minting on-chain… please wait.
                      </p>
                    </div>
                  )}

                  {(isMinted || isRejected || isBurned) && (
                    <button
                      onClick={resetAll}
                      className={`w-full font-bold cursor-pointer border transition-all hover:brightness-110 ${
                        isMinted
                          ? 'bg-green-500/15 border-green-500/30 text-green-400'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                      }`}
                      style={{ padding: px(10), borderRadius: px(12), fontSize: px(12) }}
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
              </>
            )}
          </div>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </motion.div>
      </div>
    </>
  );
};

export default SalvaNGNsChat;
