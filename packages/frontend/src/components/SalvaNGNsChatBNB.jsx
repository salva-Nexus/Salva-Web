// Salva-Digital-Tech/packages/frontend/src/components/SalvaNGNsChatBNB.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import NetworkReminder, { useNetworkReminder } from './NetworkReminder';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';

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
        padding: '7px 10px',
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
          title="Upload image"
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
          placeholder={placeholder}
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
            transition: 'all 0.2s',
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
        <p
          style={{
            color: '#22c55e',
            fontWeight: '900',
            fontSize: '13px',
            margin: '0 0 4px',
          }}
        >
          NGNs Minted!
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
        <p
          style={{
            color: '#ef4444',
            fontWeight: '900',
            fontSize: '13px',
            margin: '0 0 4px',
          }}
        >
          Sell Request Submitted
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
            background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '10px',
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
              fontSize: '11px',
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
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          })}
          {isMe && <span style={{ marginLeft: '4px' }}>✓</span>}
        </p>
      </div>
    </div>
  );
});

const SalvaNGNsChat = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null);
  const [showNetworkReminder, setShowNetworkReminder] = useState(false);

  // ── OTC Config ────────────────────────────────────────────────────────────
  const [otcConfig, setOtcConfig] = useState({
    minNgn: 10000,
    maxNgn: 200000,
    feePercent: 0.2,
  });

  // ── Buy state ────────────────────────────────────────────────────────────
  const [buyPhase, setBuyPhase] = useState('amount');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amountRaw, setAmountRaw] = useState(0);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState('');
  const [sellerInfo, setSellerInfo] = useState(null);

  // ── Sell state ───────────────────────────────────────────────────────────
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

  // ── Shared chat state ─────────────────────────────────────────────────────
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
      const res = await fetch(`${SALVA_API_URL}/api/l1-balance/${user.safeAddress}`);
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
          isL1: true,
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
          isL1: true,
          burnFromAddress: user.safeAddress,
        }),
      });
      const data = await res.json();

      // 202 = burn submitted but confirmation pending (slow network)
      if (res.status === 202 && data.pending) {
        // Force-load the request so UI shows the pending state
        await loadRequest();
        return;
      }

      if (!res.ok) {
        // 409 with isPendingBurn = burn already in progress, show special message
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
      // Network totally down BEFORE the request was sent
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

  const SectionLabel = ({ children, color = 'rgba(212,175,55,0.6)' }) => (
    <label
      style={{
        color,
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
            chain="bnb"
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
                <p
                  style={{
                    color: '#f5f0e8',
                    fontSize: '13px',
                    fontWeight: '700',
                    margin: 0,
                  }}
                >
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
                      <p
                        style={{
                          color: 'rgba(212,175,55,0.7)',
                          fontSize: '12px',
                          margin: 0,
                        }}
                      >
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
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="fixed bottom-2 right-2 z-[9000] origin-bottom-right scale-[0.6] sm:scale-100 sm:bottom-6 sm:right-6 sm:w-[320px]"
        style={{ width: '320px' }}
      >
        <div className="h-[520px] bg-[#0d0d0e] border border-salvaGold/20 rounded-[22px] overflow-hidden flex flex-col shadow-[0_28px_72px_rgba(0,0,0,0.8)]">
          {/* ── HEADER ── */}
          <div
            className="flex items-center gap-2.5 px-3 py-2.5 border-b border-salvaGold/25 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #1a1500, #111100)' }}
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
                  className="text-salvaGold/60 text-lg leading-none cursor-pointer bg-transparent border-none pr-1 flex-shrink-0 hover:text-salvaGold transition-colors"
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
                className="text-salvaGold/60 text-lg leading-none cursor-pointer bg-transparent border-none pr-1 flex-shrink-0 hover:text-salvaGold transition-colors"
              >
                ←
              </button>
            )}
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-base font-black"
              style={{
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
              <p className="text-[#f5f0e8] text-[13px] font-black m-0 truncate">
                {!mode ? 'NGNs Exchange' : mode === 'sell' ? 'Sell NGNs' : 'Buy NGNs'}
              </p>
              <p className="text-salvaGold/60 text-[10px] m-0 truncate">
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
              className="w-7 h-7 rounded-full bg-white/[0.07] border border-white/10 cursor-pointer text-white/50 text-base flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-all"
            >
              ×
            </button>
          </div>

          {/* ── MODE SELECTOR ── */}
          {!mode && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 gap-4">
              {/* Gold accent line */}
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-salvaGold/40 to-transparent" />
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-black text-black shadow-lg shadow-salvaGold/20"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #b8941e)' }}
              >
                ₦
              </div>
              <div className="text-center">
                <h3 className="text-[#f5f0e8] text-lg font-black m-0 mb-1">NGNs Exchange</h3>
                <p className="text-white/40 text-[11px] m-0">
                  Buy or sell Nigerian Naira stablecoin
                </p>
              </div>
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setBuyPhase('amount');
                    setMode('buy');
                  }}
                  className="flex-1 py-4 rounded-2xl text-sm font-black text-black cursor-pointer border-none transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{
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
                  className="flex-1 py-4 rounded-2xl text-sm font-black text-white cursor-pointer border-none transition-all hover:brightness-110 active:scale-[0.97]"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444, #b91c1c)',
                    boxShadow: '0 0 20px rgba(239,68,68,0.3)',
                  }}
                >
                  💸 Sell NGNs
                </button>
              </div>
              <div className="w-full rounded-xl p-3 bg-white/[0.03] border border-white/[0.05]">
                <p className="text-salvaGold/50 text-[9px] uppercase tracking-[0.15em] font-bold m-0 mb-2">
                  How it works
                </p>
                {[
                  'Buy: Transfer fiat → receive NGNs in wallet',
                  'Sell: Burn NGNs → receive fiat in bank account',
                ].map((s, i) => (
                  <div key={i} className="flex gap-2 items-center mb-1.5 last:mb-0">
                    <span className="w-4 h-4 rounded-full bg-salvaGold/20 text-salvaGold text-[9px] font-black flex items-center justify-center flex-shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-white/40 text-[11px]">{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BUY: AMOUNT ── */}
          {mode === 'buy' && buyPhase === 'amount' && (
            <div className="flex-1 flex flex-col justify-center px-5 py-6 gap-4 overflow-y-auto">
              <div className="text-center">
                <div className="text-4xl mb-2">🛒</div>
                <h3 className="text-[#f5f0e8] text-[17px] font-black m-0 mb-1">Buy NGNs</h3>
                <p className="text-white/40 text-[11px] m-0">
                  Enter the amount you want to purchase
                </p>
              </div>
              <div>
                <p className="text-salvaGold/60 text-[9px] uppercase tracking-[0.15em] font-bold mb-1.5">
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
                    className="w-full py-3 pl-3.5 pr-14 rounded-xl border border-salvaGold/25 bg-[#1a1a1b] text-[#f5f0e8] text-lg font-black outline-none focus:border-salvaGold/70 transition-colors box-border"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-salvaGold font-black text-xs">
                    NGNs
                  </span>
                </div>
                <p className="text-white/30 text-[10px] mt-1">
                  Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                  {otcConfig.maxNgn.toLocaleString()}
                </p>
              </div>
              {buyValid && (
                <div className="rounded-xl p-3.5 bg-salvaGold/5 border border-salvaGold/15 space-y-1.5">
                  {[
                    ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`, '#f5f0e8'],
                    ['Fee', fee > 0 ? `-${fee} NGNs` : 'Free', fee > 0 ? '#ef4444' : '#22c55e'],
                    ['You Receive', `${mintAmt.toLocaleString()} NGNs`, '#D4AF37'],
                  ].map(([l, v, c], i) => (
                    <div
                      key={i}
                      className={`flex justify-between items-center ${i === 2 ? 'pt-2 border-t border-salvaGold/10' : ''}`}
                    >
                      <span className="text-white/45 text-[11px]">{l}</span>
                      <span
                        className={`font-black ${i === 2 ? 'text-sm' : 'text-[11px]'}`}
                        style={{ color: c }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {initError && (
                <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
                  <span className="text-sm flex-shrink-0">⚠️</span>
                  <p className="text-red-400 text-[11px] font-bold m-0">{initError}</p>
                </div>
              )}
              <button
                onClick={() => buyValid && setBuyPhase('confirm')}
                disabled={!buyValid}
                className={`w-full py-3.5 rounded-xl border-none text-sm font-black uppercase cursor-pointer transition-all active:scale-[0.98] ${buyValid ? 'hover:brightness-110' : 'cursor-not-allowed'}`}
                style={{
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
            <div className="flex-1 flex flex-col justify-center px-5 py-6 gap-4 overflow-y-auto">
              <div className="text-center">
                <div className="text-4xl mb-2">⚡</div>
                <h3 className="text-[#f5f0e8] text-[17px] font-black m-0 mb-1">Confirm Purchase</h3>
                <p className="text-white/40 text-[11px] m-0">Review before proceeding</p>
              </div>
              <div className="rounded-2xl p-4 bg-salvaGold/[0.06] border border-salvaGold/20 space-y-2.5">
                {[
                  ['You Send (fiat)', `₦${amountRaw.toLocaleString()}`, '#f5f0e8', '13px'],
                  [
                    'Fee',
                    fee > 0 ? `-${fee} NGNs` : 'Free',
                    fee > 0 ? '#ef4444' : '#22c55e',
                    '13px',
                  ],
                  ['You Receive', `${mintAmt.toLocaleString()} NGNs`, '#D4AF37', '16px'],
                ].map(([l, v, c, fs]) => (
                  <div key={l} className="flex justify-between items-center">
                    <span className="text-white/50 text-[12px]">{l}</span>
                    <span className="font-black" style={{ color: c, fontSize: fs }}>
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              {initError && <p className="text-red-400 text-[11px] text-center m-0">{initError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => setBuyPhase('amount')}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[12px] cursor-pointer hover:bg-white/10 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={handleBuyInitiate}
                  disabled={initiating}
                  className="flex-[2] py-3 rounded-xl border-none text-black text-[13px] font-black cursor-pointer flex items-center justify-center gap-1.5 hover:brightness-110 transition-all"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #b8941e)' }}
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
              <div className="flex-1 overflow-y-auto px-5 pt-5 pb-3 flex flex-col gap-3.5">
                <div className="text-center">
                  <div className="text-4xl mb-2">💸</div>
                  <h3 className="text-[#f5f0e8] text-[17px] font-black m-0 mb-1">Sell NGNs</h3>
                  <p className="text-white/40 text-[11px] m-0">
                    Balance: {ngnBalance.toLocaleString()} NGNs
                  </p>
                </div>
                <div>
                  <p className="text-salvaGold/60 text-[9px] uppercase tracking-[0.15em] font-bold mb-1.5">
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
                      className={`w-full py-3 pl-3.5 pr-14 rounded-xl bg-[#1a1a1b] text-lg font-black outline-none transition-colors box-border ${sellAmountError ? 'border-2 border-red-500 text-red-400' : 'border border-salvaGold/25 text-[#f5f0e8] focus:border-salvaGold/70'}`}
                    />
                    <span
                      className={`absolute right-3 top-1/2 -translate-y-1/2 font-black text-xs ${sellAmountError ? 'text-red-400' : 'text-salvaGold'}`}
                    >
                      NGNs
                    </span>
                  </div>
                  {sellAmountError && (
                    <p className="text-red-400 text-[10px] font-bold mt-1 m-0">
                      ⚠️ {sellAmountError}
                    </p>
                  )}
                  <p className="text-white/30 text-[10px] mt-1">
                    Min: ₦{otcConfig.minNgn.toLocaleString()} · Max: ₦
                    {otcConfig.maxNgn.toLocaleString()}
                  </p>
                </div>
                {sellValid && (
                  <div className="rounded-xl p-3.5 bg-salvaGold/5 border border-salvaGold/15 space-y-1.5">
                    {[
                      ['You Burn', `${sellAmountRaw.toLocaleString()} NGNs`, '#f5f0e8'],
                      ['Fee', `-${sellFee.toLocaleString()} NGNs`, '#ef4444'],
                      ['You Receive (fiat)', `₦${sellPayout.toLocaleString()}`, '#D4AF37'],
                    ].map(([l, v, c], i) => (
                      <div
                        key={l}
                        className={`flex justify-between items-center ${i === 2 ? 'pt-2 border-t border-salvaGold/10' : ''}`}
                      >
                        <span className="text-white/45 text-[11px]">{l}</span>
                        <span
                          className={`font-black ${i === 2 ? 'text-sm' : 'text-[11px]'}`}
                          style={{ color: c }}
                        >
                          {v}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-3 py-2.5 rounded-xl bg-red-500/[0.06] border border-red-500/15">
                  <p className="text-red-400 text-[10px] m-0">
                    ⚠️ NGNs are burned immediately on-chain. Cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex-shrink-0 px-5 py-3 border-t border-white/[0.06] bg-[#0d0d0e]">
                <button
                  onClick={() => sellValid && setSellPhase('bank')}
                  disabled={!sellValid}
                  className={`w-full py-3.5 rounded-xl border-none text-sm font-black uppercase transition-all ${sellValid ? 'cursor-pointer hover:brightness-110 active:scale-[0.98]' : 'cursor-not-allowed'}`}
                  style={{
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
              <div className="flex-1 overflow-y-auto px-5 pt-4 pb-3 flex flex-col gap-3">
                <div className="text-center">
                  <div className="text-4xl mb-1.5">🏦</div>
                  <h3 className="text-[#f5f0e8] text-[16px] font-black m-0 mb-1">
                    Your Bank Details
                  </h3>
                  <p className="text-white/40 text-[11px] m-0">
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
                    <p className="text-salvaGold/60 text-[9px] uppercase tracking-[0.15em] font-bold mb-1.5">
                      {label}
                    </p>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => setter(e.target.value)}
                      className="w-full py-2.5 px-3.5 rounded-xl border border-salvaGold/20 bg-[#1a1a1b] text-[#f5f0e8] text-[13px] outline-none focus:border-salvaGold/60 transition-colors box-border"
                    />
                  </div>
                ))}
                {sellError && (
                  <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-red-500/10 border border-red-500/25">
                    <span className="text-sm flex-shrink-0">⚠️</span>
                    <p className="text-red-400 text-[11px] font-bold m-0">{sellError}</p>
                  </div>
                )}
              </div>
              <div className="flex-shrink-0 px-5 py-3 border-t border-white/[0.06] bg-[#0d0d0e] flex gap-2">
                <button
                  onClick={() => setSellPhase('amount')}
                  className="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-white/60 text-[12px] cursor-pointer hover:bg-white/10 transition-all"
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
                  className="flex-[2] py-3 rounded-xl border-none text-white text-[13px] font-black flex items-center justify-center gap-1.5 transition-all hover:brightness-110"
                  style={{
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
                className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-2 bg-[#0a0a0b]"
              >
                {messages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center opacity-40">
                    <p className="text-salvaGold text-[12px] m-0">Loading messages…</p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <Bubble key={msg._id || i} msg={msg} />
                ))}

                {mode === 'buy' && status === 'pending' && sellerInfo && (
                  <div className="px-3.5 py-3 rounded-xl bg-salvaGold/[0.06] border border-salvaGold/20 my-1">
                    <p className="text-salvaGold/70 text-[9px] uppercase tracking-[0.12em] font-bold m-0 mb-2.5">
                      📤 Send your payment to:
                    </p>
                    <div className="flex flex-col gap-2">
                      {[
                        { label: 'Bank', value: sellerInfo.bankName },
                        { label: 'Account Name', value: sellerInfo.accountName },
                        { label: 'Account Number', value: sellerInfo.accountNumber },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex justify-between items-center gap-2">
                          <span className="text-white/35 text-[10px] flex-shrink-0">{label}</span>
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="text-[#f5f0e8] text-[12px] font-bold truncate">
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
                        className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border-none text-black text-[12px] font-black cursor-pointer hover:brightness-110 transition-all active:scale-[0.97]"
                        style={{
                          background: 'linear-gradient(135deg, #D4AF37, #b8941e)',
                          boxShadow: '0 0 16px rgba(212,175,55,0.4)',
                        }}
                      >
                        ✅ I Have Paid
                      </button>
                    </motion.div>
                  )}

                {isBurning && (
                  <div className="p-3 rounded-xl bg-red-500/[0.06] border border-red-500/20 flex items-center gap-2.5">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-red-500/30 border-t-red-500 flex-shrink-0"
                      style={{ animation: 'spin 0.8s linear infinite' }}
                    />
                    <p className="text-red-400 text-[12px] font-bold m-0">
                      ⚠️ Burn in progress — do NOT submit another request. Refresh if this takes
                      over 2 minutes.
                    </p>
                  </div>
                )}
                {status === 'minting' && (
                  <div className="p-3 rounded-xl bg-salvaGold/[0.06] border border-salvaGold/20 flex items-center gap-2.5">
                    <div
                      className="w-4 h-4 rounded-full border-2 border-salvaGold/30 border-t-salvaGold flex-shrink-0"
                      style={{ animation: 'spin 0.8s linear infinite' }}
                    />
                    <p className="text-salvaGold text-[12px] font-bold m-0">
                      Minting on-chain… please wait.
                    </p>
                  </div>
                )}

                {(isMinted || isRejected || isBurned) && (
                  <button
                    onClick={resetAll}
                    className={`w-full py-2.5 rounded-xl text-[12px] font-bold cursor-pointer border transition-all hover:brightness-110 ${isMinted ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}
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
    </>
  );
};

export default SalvaNGNsChat;
