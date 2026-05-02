// Salva-Digital-Tech/packages/frontend/src/components/SalvaNGNsChat.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SALVA_API_URL } from "../config";

const MIN_REDEMPTION = 45;

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, "");
  const p = d.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return p.length > 1 ? p[0] + "." + p[1] : p[0];
};

function calcFee(amt) {
  if (amt >= 10000) return 50;
  if (amt >= 5000) return 25;
  return 0;
}

function RichText({ text }) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: "#D4AF37" }}>{p}</strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

// ── Copy button ────────────────────────────────────────────────────────────
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
        padding: "3px 9px",
        borderRadius: "6px",
        background: copied ? "rgba(34,197,94,0.2)" : "rgba(212,175,55,0.12)",
        border: `1px solid ${copied ? "rgba(34,197,94,0.4)" : "rgba(212,175,55,0.3)"}`,
        color: copied ? "#22c55e" : "#D4AF37",
        fontSize: "9px",
        fontWeight: "700",
        cursor: "pointer",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        transition: "all 0.2s",
        flexShrink: 0,
      }}
    >
      {copied ? "✓ Copied" : label || "Copy"}
    </button>
  );
};

// ── Message Input ──────────────────────────────────────────────────────────
const MessageInput = memo(({ onSend, onImage, disabled, placeholder = "Ask a question…" }) => {
  const [text, setText] = useState("");
  const ref = useRef(null);
  const fileRef = useRef(null);

  const resize = () => {
    if (!ref.current) return;
    ref.current.style.height = "auto";
    ref.current.style.height = Math.min(ref.current.scrollHeight, 100) + "px";
  };

  const submit = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t);
    setText("");
    if (ref.current) { ref.current.style.height = "auto"; ref.current.focus(); }
  };

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { alert("Max 6MB"); return; }
    const reader = new FileReader();
    reader.onload = (ev) => onImage(ev.target.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div style={{ padding: "10px 12px", background: "#0d0d0e", borderTop: "1px solid rgba(212,175,55,0.15)", flexShrink: 0 }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <button onClick={() => fileRef.current?.click()} disabled={disabled}
          style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "9px", background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.2)", cursor: disabled ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
          title="Upload image"
        >
          <svg width="14" height="14" fill="none" stroke="#D4AF37" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="m21 15-5-5L5 21" />
          </svg>
        </button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
        <textarea ref={ref} value={text}
          onChange={(e) => { setText(e.target.value); resize(); }}
          placeholder={placeholder} disabled={disabled} rows={1}
          style={{ flex: 1, padding: "9px 12px", borderRadius: "12px", border: "1px solid rgba(212,175,55,0.2)", background: "#1a1a1b", color: "#f5f0e8", fontSize: "13px", outline: "none", resize: "none", overflowY: "hidden", lineHeight: "1.5", fontFamily: "inherit", minHeight: "38px", maxHeight: "100px", transition: "border-color 0.2s" }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.6)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.2)")}
        />
        <button onClick={submit} disabled={disabled || !text.trim()}
          style={{ flexShrink: 0, width: "36px", height: "36px", borderRadius: "10px", background: disabled || !text.trim() ? "rgba(212,175,55,0.2)" : "linear-gradient(135deg, #D4AF37, #b8941e)", border: "none", cursor: disabled || !text.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}
        >
          <svg width="14" height="14" fill={disabled || !text.trim() ? "rgba(212,175,55,0.4)" : "#000"} viewBox="0 0 24 24">
            <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
          </svg>
        </button>
      </div>
    </div>
  );
});

// ── Bubble ─────────────────────────────────────────────────────────────────
const Bubble = memo(({ msg }) => {
  const isMe = msg.sender === "user";

  if (msg.isMinted) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        style={{ margin: "8px 0", padding: "14px 16px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))", border: "1px solid rgba(34,197,94,0.4)", textAlign: "center" }}
      >
        <div style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</div>
        <p style={{ color: "#22c55e", fontWeight: "900", fontSize: "13px", margin: "0 0 4px" }}>NGNs Minted!</p>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", margin: 0, whiteSpace: "pre-line" }}><RichText text={msg.text} /></p>
      </motion.div>
    );
  }

  if (msg.isBurned) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
        style={{ margin: "8px 0", padding: "14px 16px", borderRadius: "16px", background: "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))", border: "1px solid rgba(239,68,68,0.35)", textAlign: "center" }}
      >
        <div style={{ fontSize: "28px", marginBottom: "6px" }}>🔥</div>
        <p style={{ color: "#ef4444", fontWeight: "900", fontSize: "13px", margin: "0 0 4px" }}>Sell Request Submitted</p>
        <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", margin: 0, whiteSpace: "pre-line" }}><RichText text={msg.text} /></p>
      </motion.div>
    );
  }

  return (
    <div style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start", alignItems: "flex-end", gap: "6px" }}>
      {!isMe && (
        <div style={{ width: "26px", height: "26px", borderRadius: "8px", flexShrink: 0, background: "linear-gradient(135deg, #D4AF37, #b8941e)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", fontWeight: "900", color: "#000" }}>₦</div>
      )}
      <div style={{ maxWidth: "78%", padding: "10px 13px", borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px", background: isMe ? "linear-gradient(135deg, #D4AF37, #b8941e)" : "rgba(255,255,255,0.05)", border: isMe ? "none" : "1px solid rgba(212,175,55,0.15)" }}>
        {msg.imageUrl && <img src={msg.imageUrl} alt="attachment" style={{ maxWidth: "100%", maxHeight: "180px", borderRadius: "10px", marginBottom: msg.text ? "6px" : 0, display: "block", objectFit: "contain" }} />}
        {msg.text && (
          <p style={{ fontSize: "12.5px", color: isMe ? "#000" : "#f5f0e8", margin: 0, lineHeight: "1.55", wordBreak: "break-word", whiteSpace: "pre-line" }}>
            <RichText text={msg.text} />
          </p>
        )}
        <p style={{ fontSize: "9px", color: isMe ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.35)", margin: "4px 0 0", textAlign: "right" }}>
          {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {isMe && <span style={{ marginLeft: "4px" }}>✓</span>}
        </p>
      </div>
    </div>
  );
});

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const SalvaNGNsChat = ({ user, userPoints }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "buy" | "sell"

  // ── Buy state ────────────────────────────────────────────────────────────
  const [buyPhase, setBuyPhase] = useState("amount"); // amount | confirm | chat
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amountRaw, setAmountRaw] = useState(0);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState("");
  const [sellerInfo, setSellerInfo] = useState(null);

  // ── Sell state ───────────────────────────────────────────────────────────
  // sellPhase: "amount" → "redemption" → "bank" → "chat"
  const [sellPhase, setSellPhase] = useState("amount");
  const [sellAmountDisplay, setSellAmountDisplay] = useState("");
  const [sellAmountRaw, setSellAmountRaw] = useState(0);
  const [sellAmountError, setSellAmountError] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [sellError, setSellError] = useState("");
  const [sellInitiating, setSellInitiating] = useState(false);
  const [ngnBalance, setNgnBalance] = useState(0);

  // ── Redemption state (completely separate from sell amount) ───────────────
  // User first inputs sell amount, then on redemption screen inputs points to redeem
  const [redemptionInput, setRedemptionInput] = useState(""); // display string e.g. "2,500"
  const [redemptionRaw, setRedemptionRaw] = useState(0);      // numeric
  const [redemptionValidating, setRedemptionValidating] = useState(false);
  const [redemptionError, setRedemptionError] = useState("");
  const [redemptionValid, setRedemptionValid] = useState(null); // { pointsToRedeem, equivalentNGN }
  const [skipRedemption, setSkipRedemption] = useState(false);

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

  const fee = calcFee(amountRaw);
  const mintAmt = amountRaw - fee;
  const status = mintRequest?.status;
  const canChat = status === "pending" || status === "paid";
  const isMinted = status === "minted";
  const isRejected = status === "rejected";
  const isBurned = status === "burned";

  // Points from parent
  const totalPoints = userPoints?.totalPoints ?? 0;

  // Redemption input validation helpers
  const redemptionTooLow = redemptionRaw > 0 && redemptionRaw < MIN_REDEMPTION;
  const redemptionTooHigh = redemptionRaw > totalPoints;
  const redemptionValid_ = redemptionRaw >= MIN_REDEMPTION && redemptionRaw <= totalPoints;

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMessageCount.current && isNearBottom.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  // ── Load active request + seller info on open ─────────────────────────────
  const loadRequest = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`);
      const data = await res.json();
      if (data.request && ["pending", "paid", "minting"].includes(data.request.status)) {
        setMintRequest(data.request);
        setMessages(data.request.messages || []);
        setMode(data.request.type || "buy");
        setBuyPhase("chat");
        setSellPhase("chat");
      }
    } catch { /* ignore */ }
  }, [user?.safeAddress]);

  const fetchBalance = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`);
      const data = await res.json();
      setNgnBalance(parseFloat(data.balance || 0));
    } catch { /* ignore */ }
  }, [user?.safeAddress]);

  const fetchSellerInfo = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/seller-info`);
      if (res.ok) {
        const data = await res.json();
        setSellerInfo(data);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadRequest();
      fetchBalance();
      fetchSellerInfo();
    }
  }, [isOpen, loadRequest, fetchBalance, fetchSellerInfo]);

  // ── Chat polling ───────────────────────────────────────────────────────────
  useEffect(() => {
    const activeChat = (mode === "buy" && buyPhase === "chat") || (mode === "sell" && sellPhase === "chat");
    if (!activeChat || !mintRequest?._id || !isOpen) return;

    let failCount = 0;
    const poll = async () => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`);
        if (!res.ok) throw new Error("bad response");
        const data = await res.json();
        if (data.request) { setMintRequest(data.request); setMessages(data.request.messages || []); }
        failCount = 0; // reset on success
      } catch {
        failCount++;
        // back off: after 3 failures slow down significantly
      }
      // Dynamic interval: normal=8s, degraded=20s after 3 failures
      const next = failCount >= 3 ? 20000 : 8000;
      pollRef.current = setTimeout(poll, next);
    };

    pollRef.current = setTimeout(poll, 8000);
    return () => clearTimeout(pollRef.current);
  }, [mode, buyPhase, sellPhase, mintRequest?._id, isOpen, user?.safeAddress]);

  // ── Buy: initiate ─────────────────────────────────────────────────────────
  const handleBuyInitiate = async () => {
    setInitError("");
    setInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safeAddress: user.safeAddress, amountNgn: amountRaw }),
      });
      const data = await res.json();
      if (!res.ok) { setInitError(data.message || "Failed"); return; }
      await loadRequest();
    } catch { setInitError("Network error. Please try again."); }
    finally { setInitiating(false); }
  };

  // ── Sell: validate redemption ─────────────────────────────────────────────
  // Called when user taps "Redeem & Continue" on the redemption screen
  const validateAndProceedWithRedemption = async () => {
    if (!redemptionValid_) return;
    setRedemptionError("");
    setRedemptionValidating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/points/validate-redemption`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safeAddress: user.safeAddress, pointsToRedeem: redemptionRaw }),
      });
      const data = await res.json();
      if (res.ok && data.valid) {
        setRedemptionValid({ pointsToRedeem: redemptionRaw, equivalentNGN: data.equivalentNGN });
        setSkipRedemption(false);
        setSellPhase("bank");
      } else {
        setRedemptionError(data.message || "Validation failed");
      }
    } catch { setRedemptionError("Network error. Please try again."); }
    finally { setRedemptionValidating(false); }
  };

  // ── Sell: initiate ─────────────────────────────────────────────────────────
  const handleSellInitiate = async () => {
    setSellError("");
    setSellInitiating(true);
    try {
      const body = {
        safeAddress: user.safeAddress,
        amountNgn: sellAmountRaw,
        bankName,
        accountNumber,
        accountName,
      };
      // Attach redemption only if user opted in AND validation passed
      if (!skipRedemption && redemptionValid) {
        body.pointsRedemption = {
          requested: true,
          pointsToRedeem: redemptionValid.pointsToRedeem,
          equivalentNGN: redemptionValid.equivalentNGN,
        };
      }
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate-sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) { setSellError(data.message || "Failed"); return; }
      await loadRequest();
    } catch { setSellError("Network error. Please try again."); }
    finally { setSellInitiating(false); }
  };

  // ── Chat: send text ───────────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (!mintRequest?._id) return;
    const optimistic = { _id: `tmp-${Date.now()}`, sender: "user", text, createdAt: new Date(), _optimistic: true };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: mintRequest._id, safeAddress: user.safeAddress, text, sender: "user" }),
      });
      const data = await res.json();
      if (res.ok) setMessages((prev) => prev.map((m) => m._id === optimistic._id ? { ...data.message } : m));
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch { setMessages((prev) => prev.filter((m) => m._id !== optimistic._id)); }
    setSending(false);
  };

  const handleSendImage = async (imageBase64) => {
    if (!mintRequest?._id) return;
    const optimistic = { _id: `tmp-${Date.now()}`, sender: "user", imageUrl: imageBase64, createdAt: new Date(), _optimistic: true };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: mintRequest._id, safeAddress: user.safeAddress, imageBase64, sender: "user" }),
      });
      const data = await res.json();
      if (res.ok) setMessages((prev) => prev.map((m) => m._id === optimistic._id ? { ...data.message } : m));
      else setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    } catch { setMessages((prev) => prev.filter((m) => m._id !== optimistic._id)); }
  };

  // ── Receipt upload ─────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { alert("File must be under 6MB"); return; }
    setReceiptFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setReceiptPreview(ev.target.result);
    reader.readAsDataURL(file);
  };

  const handleClaimPaid = async () => {
    if (!receiptFile) { fileInputRef.current?.click(); return; }
    setClaimingPaid(true);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/claim-paid`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: mintRequest._id, safeAddress: user.safeAddress, receiptBase64: ev.target.result }),
        });
        if (res.ok) { setShowReceiptUpload(false); setReceiptFile(null); setReceiptPreview(null); await loadRequest(); }
      } catch { /* ignore */ }
      setClaimingPaid(false);
    };
    reader.readAsDataURL(receiptFile);
  };

  // ── Reset all state ────────────────────────────────────────────────────────
  const resetAll = () => {
    setMode(null);
    setBuyPhase("amount"); setAmountDisplay(""); setAmountRaw(0); setInitError("");
    setSellPhase("amount"); setSellAmountDisplay(""); setSellAmountRaw(0);
    setBankName(""); setAccountNumber(""); setAccountName(""); setSellError("");
    setRedemptionInput(""); setRedemptionRaw(0); setRedemptionError("");
    setRedemptionValid(null); setSkipRedemption(false);
    setMintRequest(null); setMessages([]);
  };

  // ── Spinner ────────────────────────────────────────────────────────────────
  const Spinner = ({ color = "#000" }) => (
    <span style={{ width: "10px", height: "10px", border: `2px solid ${color}30`, borderTopColor: color, borderRadius: "50%", display: "inline-block", animation: "spin 0.6s linear infinite" }} />
  );

  // ── Section label helper ───────────────────────────────────────────────────
  const SectionLabel = ({ children, color = "rgba(212,175,55,0.6)" }) => (
    <label style={{ color, fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: "700", display: "block", marginBottom: "6px" }}>
      {children}
    </label>
  );

  // ── FAB ────────────────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9000 }}>
        <motion.button whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.95 }} onClick={() => setIsOpen(true)}
          style={{ width: "54px", height: "54px", borderRadius: "50%", background: "linear-gradient(135deg, #D4AF37, #b8941e)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 28px rgba(212,175,55,0.45), 0 4px 20px rgba(0,0,0,0.5)", position: "relative" }}
        >
          <span style={{ fontSize: "20px", color: "#000", fontWeight: "900" }}>₦</span>
          <motion.div animate={{ scale: [1, 1.6], opacity: [0.6, 0] }} transition={{ repeat: Infinity, duration: 2 }}
            style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "2px solid #D4AF37", pointerEvents: "none" }} />
        </motion.button>
      </div>
    );
  }

  // ── Main Window ────────────────────────────────────────────────────────────
  return (
    <>
      {/* Receipt upload overlay */}
      <AnimatePresence>
        {showReceiptUpload && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={(e) => e.target === e.currentTarget && setShowReceiptUpload(false)}
            style={{ position: "fixed", inset: 0, zIndex: 10001, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}
          >
            <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
              style={{ width: "100%", maxWidth: "360px", background: "#111112", border: "1px solid rgba(212,175,55,0.3)", borderRadius: "20px", overflow: "hidden", boxShadow: "0 32px 80px rgba(0,0,0,0.8)" }}
            >
              <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(212,175,55,0.15)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <p style={{ color: "#f5f0e8", fontSize: "13px", fontWeight: "700", margin: 0 }}>Upload Payment Receipt</p>
                <button onClick={() => setShowReceiptUpload(false)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: "20px", cursor: "pointer" }}>×</button>
              </div>
              <div style={{ padding: "20px" }}>
                <div onClick={() => fileInputRef.current?.click()}
                  style={{ border: `2px dashed ${receiptPreview ? "rgba(34,197,94,0.5)" : "rgba(212,175,55,0.3)"}`, borderRadius: "14px", padding: "24px", cursor: "pointer", textAlign: "center", marginBottom: "14px" }}
                >
                  {receiptPreview
                    ? <img src={receiptPreview} alt="Preview" style={{ maxHeight: "140px", borderRadius: "10px", margin: "0 auto", display: "block" }} />
                    : <><div style={{ fontSize: "28px", marginBottom: "8px" }}>📎</div><p style={{ color: "rgba(212,175,55,0.7)", fontSize: "12px", margin: 0 }}>Tap to select receipt</p></>
                  }
                </div>
                <input ref={fileInputRef} type="file" accept="image/*,application/pdf" style={{ display: "none" }} onChange={handleFileChange} />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button onClick={() => { setShowReceiptUpload(false); setReceiptFile(null); setReceiptPreview(null); }}
                    style={{ flex: 1, padding: "11px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontSize: "12px", cursor: "pointer" }}>
                    Cancel
                  </button>
                  <button onClick={receiptFile ? handleClaimPaid : () => fileInputRef.current?.click()} disabled={claimingPaid}
                    style={{ flex: 1, padding: "11px", borderRadius: "12px", background: receiptFile ? "linear-gradient(135deg, #D4AF37, #b8941e)" : "rgba(212,175,55,0.2)", border: "none", color: receiptFile ? "#000" : "rgba(212,175,55,0.6)", fontSize: "12px", fontWeight: "700", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                    {claimingPaid && <Spinner />}
                    {claimingPaid ? "Sending…" : receiptFile ? "Submit" : "Choose File"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        style={{ position: "fixed", bottom: "24px", right: "24px", zIndex: 9000, width: "360px", maxWidth: "calc(100vw - 2rem)" }}
      >
        <div style={{ height: "580px", background: "#0d0d0e", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "22px", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 28px 72px rgba(0,0,0,0.8)" }}>

          {/* ── HEADER ── */}
          <div style={{ background: "linear-gradient(135deg, #1a1500, #111100)", borderBottom: "1px solid rgba(212,175,55,0.25)", padding: "14px 16px", display: "flex", alignItems: "center", gap: "10px", flexShrink: 0 }}>
            {/* Back arrow */}
            {mode && (buyPhase === "confirm" || sellPhase === "redemption" || sellPhase === "bank") && (
              <button
                onClick={() => {
                  if (mode === "buy") setBuyPhase("amount");
                  else if (sellPhase === "bank") setSellPhase("redemption");
                  else if (sellPhase === "redemption") setSellPhase("amount");
                }}
                style={{ background: "none", border: "none", color: "rgba(212,175,55,0.6)", fontSize: "18px", cursor: "pointer", padding: "2px 6px 2px 0", lineHeight: 1 }}
              >←</button>
            )}
            {((mode === "buy" && buyPhase === "chat") || (mode === "sell" && sellPhase === "chat")) && (
              <button onClick={() => { setMintRequest(null); setMessages([]); setBuyPhase("amount"); setSellPhase("amount"); setMode(null); }}
                style={{ background: "none", border: "none", color: "rgba(212,175,55,0.6)", fontSize: "18px", cursor: "pointer", padding: "2px 6px 2px 0", lineHeight: 1 }}>←</button>
            )}
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: mode === "sell" ? "linear-gradient(135deg, #ef4444, #b91c1c)" : "linear-gradient(135deg, #D4AF37, #b8941e)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: "16px", fontWeight: "900", color: "#fff" }}>₦</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ color: "#f5f0e8", fontSize: "13px", fontWeight: "900", margin: 0 }}>
                {!mode ? "NGNs Exchange" : mode === "sell" ? "Sell NGNs" : "Buy NGNs"}
              </p>
              <p style={{ color: "rgba(212,175,55,0.6)", fontSize: "10px", margin: 0 }}>
                {!mode ? "Choose an option"
                  : mode === "buy"
                    ? buyPhase === "chat" ? (status === "pending" ? "Awaiting payment" : status === "paid" ? "Verifying…" : status === "minting" ? "Minting…" : status === "minted" ? "Complete ✓" : "Rejected") : "Salva · Online"
                    : sellPhase === "chat" ? "Sell request active" : "Salva · Online"}
              </p>
            </div>
            <button onClick={() => setIsOpen(false)}
              style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: "16px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
          </div>

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* MODE SELECTOR                                                 */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {!mode && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", gap: "16px" }}>
              <div style={{ fontSize: "40px" }}>₦</div>
              <h3 style={{ color: "#f5f0e8", fontSize: "18px", fontWeight: "900", margin: 0 }}>NGNs Exchange</h3>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0, textAlign: "center" }}>Buy NGNs with fiat or sell NGNs for fiat</p>
              <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                <button onClick={() => { setMintRequest(null); setMessages([]); setBuyPhase("amount"); setMode("buy"); }}
                  style={{ flex: 1, padding: "16px", borderRadius: "14px", background: "linear-gradient(135deg, #D4AF37, #b8941e)", border: "none", color: "#000", fontSize: "14px", fontWeight: "900", cursor: "pointer", boxShadow: "0 0 20px rgba(212,175,55,0.3)" }}>
                  🛒 Buy NGNs
                </button>
                <button onClick={() => { setMintRequest(null); setMessages([]); setSellPhase("amount"); setMode("sell"); fetchBalance(); }}
                  style={{ flex: 1, padding: "16px", borderRadius: "14px", background: "linear-gradient(135deg, #ef4444, #b91c1c)", border: "none", color: "#fff", fontSize: "14px", fontWeight: "900", cursor: "pointer", boxShadow: "0 0 20px rgba(239,68,68,0.3)" }}>
                  💸 Sell NGNs
                </button>
              </div>
              {totalPoints > 0 && (
                <div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "12px", padding: "10px 14px", width: "100%", boxSizing: "border-box" }}>
                  <p style={{ color: "#a855f7", fontSize: "10px", fontWeight: "700", margin: "0 0 3px", textTransform: "uppercase", letterSpacing: "0.1em" }}>⭐ {totalPoints.toLocaleString()} points available</p>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0 }}>Redeem when selling NGNs for extra ₦ payout</p>
                </div>
              )}
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: "10px", padding: "12px", width: "100%", boxSizing: "border-box" }}>
                <p style={{ color: "rgba(212,175,55,0.5)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.15em", margin: "0 0 8px", fontWeight: "700" }}>How it works</p>
                {["Buy: Transfer fiat → receive NGNs in wallet", "Sell: Burn NGNs → receive fiat in bank account"].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "5px", alignItems: "center" }}>
                    <span style={{ width: "16px", height: "16px", borderRadius: "50%", background: "rgba(212,175,55,0.2)", color: "#D4AF37", fontSize: "9px", fontWeight: "900", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</span>
                    <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>{s}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* BUY: AMOUNT                                                   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {mode === "buy" && buyPhase === "amount" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", gap: "16px", overflowY: "auto" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🛒</div>
                <h3 style={{ color: "#f5f0e8", fontSize: "17px", fontWeight: "900", margin: "0 0 4px" }}>Buy NGNs</h3>
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0 }}>Enter the amount you want to purchase</p>
              </div>
              <div>
                <SectionLabel>Amount (NGNs)</SectionLabel>
                <div style={{ position: "relative" }}>
                  <input type="text" inputMode="decimal" placeholder="e.g. 10,000" value={amountDisplay}
                    onChange={(e) => { const f = fmtInput(e.target.value); setAmountDisplay(f); setAmountRaw(parseFloat(f.replace(/,/g, "")) || 0); setInitError(""); }}
                    style={{ width: "100%", padding: "13px 52px 13px 14px", borderRadius: "12px", border: "1px solid rgba(212,175,55,0.25)", background: "#1a1a1b", color: "#f5f0e8", fontSize: "18px", fontWeight: "900", outline: "none", boxSizing: "border-box" }}
                    onFocus={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.7)")}
                    onBlur={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.25)")}
                  />
                  <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: "#D4AF37", fontWeight: "900", fontSize: "12px" }}>NGNs</span>
                </div>
              </div>
              {amountRaw >= 100 && (
                <div style={{ background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.15)", borderRadius: "12px", padding: "12px 14px" }}>
                  {[["You Send (fiat)", `₦${amountRaw.toLocaleString()}`], ["Fee", fee > 0 ? `-${fee} NGNs` : "Free"], ["You Receive", `${mintAmt.toLocaleString()} NGNs`]].map(([l, v], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: i < 2 ? "6px" : 0, paddingTop: i === 2 ? "8px" : 0, borderTop: i === 2 ? "1px solid rgba(212,175,55,0.1)" : "none" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px" }}>{l}</span>
                      <span style={{ color: i === 1 && fee > 0 ? "#ef4444" : i === 2 ? "#D4AF37" : "#f5f0e8", fontWeight: i === 2 ? "900" : "700", fontSize: i === 2 ? "14px" : "11px" }}>{v}</span>
                    </div>
                  ))}
                </div>
              )}
              {initError && <p style={{ color: "#ef4444", fontSize: "11px", textAlign: "center", margin: 0 }}>{initError}</p>}
              <button onClick={() => amountRaw >= 100 && setBuyPhase("confirm")} disabled={amountRaw < 100}
                style={{ width: "100%", padding: "13px", background: amountRaw >= 100 ? "linear-gradient(135deg, #D4AF37, #b8941e)" : "rgba(212,175,55,0.2)", border: "none", borderRadius: "12px", color: amountRaw >= 100 ? "#000" : "rgba(212,175,55,0.4)", fontSize: "13px", fontWeight: "900", cursor: amountRaw >= 100 ? "pointer" : "not-allowed", textTransform: "uppercase" }}>
                Continue →
              </button>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* BUY: CONFIRM                                                  */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {mode === "buy" && buyPhase === "confirm" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "24px 20px", gap: "14px", overflowY: "auto" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚡</div>
                <h3 style={{ color: "#f5f0e8", fontSize: "17px", fontWeight: "900", margin: "0 0 4px" }}>Confirm Purchase</h3>
              </div>
              <div style={{ background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "14px", padding: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
                {[["You Send (fiat)", `₦${amountRaw.toLocaleString()}`, "#f5f0e8"], ["Fee", fee > 0 ? `-${fee} NGNs` : "Free", fee > 0 ? "#ef4444" : "#22c55e"], ["You Receive", `${mintAmt.toLocaleString()} NGNs`, "#D4AF37"]].map(([l, v, c]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "12px" }}>{l}</span>
                    <span style={{ color: c, fontWeight: "900", fontSize: l === "You Receive" ? "16px" : "13px" }}>{v}</span>
                  </div>
                ))}
              </div>
              {initError && <p style={{ color: "#ef4444", fontSize: "11px", textAlign: "center" }}>{initError}</p>}
              <div style={{ display: "flex", gap: "8px" }}>
                <button onClick={() => setBuyPhase("amount")} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontSize: "12px", cursor: "pointer" }}>Back</button>
                <button onClick={handleBuyInitiate} disabled={initiating}
                  style={{ flex: 2, padding: "12px", borderRadius: "12px", background: "linear-gradient(135deg, #D4AF37, #b8941e)", border: "none", color: "#000", fontSize: "13px", fontWeight: "900", cursor: initiating ? "wait" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                  {initiating && <Spinner />}
                  {initiating ? "Starting…" : "Confirm & Start"}
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SELL: AMOUNT                                                  */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {mode === "sell" && sellPhase === "amount" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 12px", display: "flex", flexDirection: "column", gap: "14px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "36px", marginBottom: "8px" }}>💸</div>
                  <h3 style={{ color: "#f5f0e8", fontSize: "17px", fontWeight: "900", margin: "0 0 4px" }}>Sell NGNs</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0 }}>Balance: {ngnBalance.toLocaleString()} NGNs</p>
                </div>
                <div>
                  <SectionLabel>Amount to Burn (NGNs)</SectionLabel>
                  <div style={{ position: "relative" }}>
                    <input type="text" inputMode="decimal" placeholder="e.g. 5,000" value={sellAmountDisplay}
                      onChange={(e) => {
                        const f = fmtInput(e.target.value);
                        setSellAmountDisplay(f);
                        const raw = parseFloat(f.replace(/,/g, "")) || 0;
                        setSellAmountRaw(raw);
                        setSellAmountError(raw > ngnBalance ? "Insufficient NGNs balance" : "");
                      }}
                      style={{ width: "100%", padding: "13px 52px 13px 14px", borderRadius: "12px", border: `2px solid ${sellAmountError ? "#ef4444" : "rgba(212,175,55,0.25)"}`, background: "#1a1a1b", color: sellAmountError ? "#ef4444" : "#f5f0e8", fontSize: "18px", fontWeight: "900", outline: "none", boxSizing: "border-box" }}
                      onFocus={(e) => { if (!sellAmountError) e.target.style.borderColor = "rgba(212,175,55,0.7)"; }}
                      onBlur={(e) => { if (!sellAmountError) e.target.style.borderColor = "rgba(212,175,55,0.25)"; }}
                    />
                    <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: sellAmountError ? "#ef4444" : "#D4AF37", fontWeight: "900", fontSize: "12px" }}>NGNs</span>
                  </div>
                  {sellAmountError && <p style={{ color: "#ef4444", fontSize: "10px", margin: "4px 0 0", fontWeight: "700" }}>⚠️ {sellAmountError}</p>}
                  <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "9px", margin: "5px 0 0" }}>This exact amount will be burned on-chain immediately</p>
                </div>
                <div style={{ padding: "10px 12px", borderRadius: "10px", background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
                  <p style={{ color: "#ef4444", fontSize: "10px", margin: 0 }}>⚠️ NGNs are burned immediately on-chain. Cannot be undone.</p>
                </div>
              </div>
              <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0d0d0e" }}>
                <button onClick={() => sellAmountRaw > 0 && !sellAmountError && setSellPhase("redemption")} disabled={!sellAmountRaw || !!sellAmountError}
                  style={{ width: "100%", padding: "13px", background: !sellAmountRaw || sellAmountError ? "rgba(239,68,68,0.2)" : "linear-gradient(135deg, #ef4444, #b91c1c)", border: "none", borderRadius: "12px", color: !sellAmountRaw || sellAmountError ? "rgba(239,68,68,0.4)" : "#fff", fontSize: "13px", fontWeight: "900", cursor: !sellAmountRaw || sellAmountError ? "not-allowed" : "pointer", textTransform: "uppercase" }}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SELL: REDEMPTION                                              */}
          {/* Completely separate from sell amount above.                   */}
          {/* User enters how many points they want to redeem here.        */}
          {/* Red border if pts entered < MIN_REDEMPTION.                  */}
          {/* Skip button goes straight to bank details with no redemption. */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {mode === "sell" && sellPhase === "redemption" && (
            // Outer wrapper: flex col, fills remaining space, NO overflow here
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

              {/* ── SCROLLABLE CONTENT ── */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "28px", marginBottom: "4px" }}>⭐</div>
                  <h3 style={{ color: "#f5f0e8", fontSize: "15px", fontWeight: "900", margin: "0 0 3px" }}>Redeem Points?</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0 }}>Optionally add a points redemption to this sell</p>
                </div>

                {/* Summary of sell amount */}
                <div style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Burning on-chain</span>
                  <span style={{ color: "#ef4444", fontWeight: "900", fontSize: "14px" }}>{sellAmountRaw.toLocaleString()} NGNs</span>
                </div>

                {/* Points balance display */}
                <div style={{ background: "rgba(168,85,247,0.06)", border: "1px solid rgba(168,85,247,0.2)", borderRadius: "10px", padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "11px" }}>Your points balance</span>
                  <span style={{ color: "#a855f7", fontWeight: "900", fontSize: "14px" }}>{totalPoints.toLocaleString()} pts</span>
                </div>

                {/* ── REDEMPTION AMOUNT INPUT ── */}
                <div>
                  <SectionLabel color={redemptionTooLow ? "rgba(239,68,68,0.8)" : "rgba(168,85,247,0.8)"}>
                    Points to Redeem (min {MIN_REDEMPTION.toLocaleString()}, optional)
                  </SectionLabel>
                  <div style={{ position: "relative" }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder={totalPoints === 0 ? "No points yet" : `Min ${MIN_REDEMPTION.toLocaleString()} pts`}
                      value={redemptionInput}
                      disabled={totalPoints === 0}
                      onChange={(e) => {
                        const raw = e.target.value.replace(/[^0-9]/g, "");
                        const num = parseInt(raw) || 0;
                        setRedemptionInput(raw ? Number(raw).toLocaleString() : "");
                        setRedemptionRaw(num);
                        setRedemptionError("");
                      }}
                      style={{
                        width: "100%",
                        padding: "13px 52px 13px 14px",
                        borderRadius: "12px",
                        border: `2px solid ${
                          totalPoints === 0
                            ? "rgba(255,255,255,0.08)"
                            : redemptionTooLow
                              ? "#ef4444"
                              : redemptionTooHigh
                                ? "#ef4444"
                                : redemptionRaw >= MIN_REDEMPTION
                                  ? "rgba(168,85,247,0.6)"
                                  : "rgba(168,85,247,0.25)"
                        }`,
                        background: totalPoints === 0 ? "rgba(255,255,255,0.02)" : "#1a1a1b",
                        color: (redemptionTooLow || redemptionTooHigh) ? "#ef4444" : "#f5f0e8",
                        fontSize: "18px",
                        fontWeight: "900",
                        outline: "none",
                        boxSizing: "border-box",
                        opacity: totalPoints === 0 ? 0.4 : 1,
                      }}
                      onFocus={(e) => { if (totalPoints > 0 && !redemptionTooLow && !redemptionTooHigh) e.target.style.borderColor = "rgba(168,85,247,0.7)"; }}
                      onBlur={(e) => {
                        if (redemptionTooLow || redemptionTooHigh) { e.target.style.borderColor = "#ef4444"; return; }
                        e.target.style.borderColor = redemptionRaw >= MIN_REDEMPTION ? "rgba(168,85,247,0.6)" : "rgba(168,85,247,0.25)";
                      }}
                    />
                    <span style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: redemptionTooLow || redemptionTooHigh ? "#ef4444" : "#a855f7", fontWeight: "900", fontSize: "11px" }}>pts</span>
                  </div>

                  {totalPoints === 0 && <p style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px", margin: "4px 0 0" }}>Make transfers to earn points first</p>}
                  {redemptionTooLow && redemptionRaw > 0 && <p style={{ color: "#ef4444", fontSize: "10px", margin: "4px 0 0", fontWeight: "700" }}>⚠️ Minimum is {MIN_REDEMPTION.toLocaleString()} pts</p>}
                  {redemptionTooHigh && <p style={{ color: "#ef4444", fontSize: "10px", margin: "4px 0 0", fontWeight: "700" }}>⚠️ You only have {totalPoints.toLocaleString()} pts</p>}
                  {redemptionValid_ && <p style={{ color: "#a855f7", fontSize: "10px", margin: "4px 0 0", fontWeight: "700" }}>= ₦{redemptionRaw.toLocaleString()} extra payout from seller (1 pt = ₦1)</p>}
                  {redemptionError && <p style={{ color: "#ef4444", fontSize: "10px", margin: "4px 0 0", fontWeight: "700" }}>⚠️ {redemptionError}</p>}
                </div>

                {/* Total payout summary */}
                {redemptionValid_ && (
                  <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: "10px", padding: "10px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px" }}>Burn payout</span>
                      <span style={{ color: "#f5f0e8", fontSize: "11px", fontWeight: "700" }}>₦{sellAmountRaw.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                      <span style={{ color: "rgba(255,255,255,0.45)", fontSize: "11px" }}>Points redemption</span>
                      <span style={{ color: "#a855f7", fontSize: "11px", fontWeight: "700" }}>+₦{redemptionRaw.toLocaleString()}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingTop: "6px", borderTop: "1px solid rgba(34,197,94,0.15)" }}>
                      <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", fontWeight: "700" }}>Total seller pays you</span>
                      <span style={{ color: "#22c55e", fontWeight: "900", fontSize: "14px" }}>₦{(sellAmountRaw + redemptionRaw).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── STICKY BOTTOM BUTTONS — always visible, never scrolled away ── */}
              <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0d0d0e", display: "flex", gap: "8px" }}>
                <button
                  onClick={() => {
                    setRedemptionInput("");
                    setRedemptionRaw(0);
                    setRedemptionError("");
                    setRedemptionValid(null);
                    setSkipRedemption(true);
                    setSellPhase("bank");
                  }}
                  style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontSize: "12px", cursor: "pointer" }}>
                  Skip
                </button>
                <button
                  onClick={validateAndProceedWithRedemption}
                  disabled={!redemptionValid_ || redemptionValidating}
                  style={{
                    flex: 2, padding: "12px", borderRadius: "12px",
                    background: redemptionValid_ ? "linear-gradient(135deg, #a855f7, #7c3aed)" : "rgba(168,85,247,0.15)",
                    border: "none", color: "#fff", fontSize: "13px", fontWeight: "900",
                    cursor: redemptionValid_ && !redemptionValidating ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
                    opacity: redemptionValid_ ? 1 : 0.5,
                  }}>
                  {redemptionValidating && <Spinner color="#fff" />}
                  {redemptionValidating ? "Validating…" : "⭐ Redeem & Continue"}
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SELL: BANK DETAILS                                            */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {mode === "sell" && sellPhase === "bank" && (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 12px", display: "flex", flexDirection: "column", gap: "12px" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "32px", marginBottom: "6px" }}>🏦</div>
                  <h3 style={{ color: "#f5f0e8", fontSize: "16px", fontWeight: "900", margin: "0 0 3px" }}>Your Bank Details</h3>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: 0 }}>
                    Seller will pay ₦{(sellAmountRaw + (redemptionValid?.pointsToRedeem || 0)).toLocaleString()} here
                  </p>
                </div>
                {!skipRedemption && redemptionValid && (
                  <div style={{ background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "10px", padding: "10px 12px" }}>
                    <p style={{ color: "#a855f7", fontSize: "10px", fontWeight: "700", margin: "0 0 3px", textTransform: "uppercase" }}>⭐ Points Redemption Active</p>
                    <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "11px", margin: 0 }}>
                      {redemptionValid.pointsToRedeem.toLocaleString()} pts → +₦{redemptionValid.equivalentNGN.toLocaleString()} extra payout
                    </p>
                  </div>
                )}
                {[
                  { label: "Bank Name", value: bankName, setter: setBankName, placeholder: "e.g. OPay, GTBank" },
                  { label: "Account Number", value: accountNumber, setter: setAccountNumber, placeholder: "10-digit account number" },
                  { label: "Account Name", value: accountName, setter: setAccountName, placeholder: "Full account name" },
                ].map(({ label, value, setter, placeholder }) => (
                  <div key={label}>
                    <SectionLabel>{label}</SectionLabel>
                    <input type="text" placeholder={placeholder} value={value} onChange={(e) => setter(e.target.value)}
                      style={{ width: "100%", padding: "11px 14px", borderRadius: "10px", border: "1px solid rgba(212,175,55,0.2)", background: "#1a1a1b", color: "#f5f0e8", fontSize: "13px", outline: "none", boxSizing: "border-box", transition: "border-color 0.2s" }}
                      onFocus={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.6)")}
                      onBlur={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.2)")}
                    />
                  </div>
                ))}
                <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "10px", padding: "10px 12px" }}>
                  <p style={{ color: "#ef4444", fontSize: "11px", margin: 0 }}>⚠️ {sellAmountRaw.toLocaleString()} NGNs will be burned immediately. Double-check details.</p>
                </div>
                {sellError && <p style={{ color: "#ef4444", fontSize: "11px", textAlign: "center", margin: 0 }}>{sellError}</p>}
              </div>
              <div style={{ flexShrink: 0, padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0d0d0e", display: "flex", gap: "8px" }}>
                <button onClick={() => setSellPhase("redemption")} style={{ flex: 1, padding: "12px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.6)", fontSize: "12px", cursor: "pointer" }}>Back</button>
                <button onClick={handleSellInitiate} disabled={sellInitiating || !bankName.trim() || !accountNumber.trim() || !accountName.trim()}
                  style={{ flex: 2, padding: "12px", borderRadius: "12px", background: "linear-gradient(135deg, #ef4444, #b91c1c)", border: "none", color: "#fff", fontSize: "13px", fontWeight: "900", cursor: sellInitiating || !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", opacity: !bankName.trim() || !accountNumber.trim() || !accountName.trim() ? 0.5 : 1 }}>
                  {sellInitiating && <Spinner color="#fff" />}
                  {sellInitiating ? "Burning…" : "🔥 Burn & Submit"}
                </button>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════ */}
          {/* SHARED CHAT                                                   */}
          {/* ══════════════════════════════════════════════════════════════ */}
          {((mode === "buy" && buyPhase === "chat") || (mode === "sell" && sellPhase === "chat")) && (
            <>
              <div ref={chatContainerRef}
                onScroll={(e) => { const el = e.currentTarget; isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
                style={{ flex: 1, overflowY: "auto", padding: "14px", display: "flex", flexDirection: "column", gap: "8px", background: "#0a0a0b" }}
              >
                {messages.length === 0 && (
                  <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.4 }}>
                    <p style={{ color: "#D4AF37", fontSize: "12px" }}>Loading messages…</p>
                  </div>
                )}

                {messages.map((msg, i) => <Bubble key={msg._id || i} msg={msg} />)}

                {/* ── BUY: Seller bank details so user knows where to pay ── */}
                {mode === "buy" && status === "pending" && sellerInfo && (
                  <div style={{ padding: "12px 14px", background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "12px", margin: "4px 0" }}>
                    <p style={{ color: "rgba(212,175,55,0.7)", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: "700", margin: "0 0 10px" }}>📤 Send your payment to:</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {[
                        { label: "Bank", value: sellerInfo.bankName },
                        { label: "Account Name", value: sellerInfo.accountName },
                        { label: "Account Number", value: sellerInfo.accountNumber },
                      ].map(({ label, value }) => (
                        <div key={label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "8px" }}>
                          <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "10px", flexShrink: 0 }}>{label}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", minWidth: 0 }}>
                            <span style={{ color: "#f5f0e8", fontSize: "12px", fontWeight: "700", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value || "—"}</span>
                            {value && <CopyBtn value={value} />}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* ── BUY: I Have Paid button ── */}
                {mode === "buy" && status === "pending" && messages.length > 0 && !showReceiptUpload && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button onClick={() => setShowReceiptUpload(true)}
                      style={{ padding: "10px 16px", borderRadius: "12px", background: "linear-gradient(135deg, #D4AF37, #b8941e)", border: "none", color: "#000", fontSize: "12px", fontWeight: "900", cursor: "pointer", boxShadow: "0 0 16px rgba(212,175,55,0.4)", display: "flex", alignItems: "center", gap: "6px" }}>
                      <span>✅</span> I Have Paid
                    </button>
                  </motion.div>
                )}

                {/* ── Minting indicator ── */}
                {status === "minting" && (
                  <div style={{ padding: "12px", background: "rgba(212,175,55,0.06)", border: "1px solid rgba(212,175,55,0.2)", borderRadius: "12px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: "16px", height: "16px", border: "2px solid rgba(212,175,55,0.3)", borderTopColor: "#D4AF37", borderRadius: "50%", animation: "spin 0.8s linear infinite", flexShrink: 0 }} />
                    <p style={{ color: "#D4AF37", fontSize: "12px", margin: 0, fontWeight: "700" }}>Minting on-chain… please wait.</p>
                  </div>
                )}

                {/* ── Done ── */}
                {(isMinted || isRejected || isBurned) && (
                  <button onClick={resetAll}
                    style={{ padding: "11px", borderRadius: "12px", background: isMinted ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.1)", border: `1px solid ${isMinted ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, color: isMinted ? "#22c55e" : "#ef4444", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>
                    {isMinted ? "Buy More NGNs →" : isBurned ? "New Transaction →" : "Start New Request →"}
                  </button>
                )}

                <div ref={chatEndRef} />
              </div>

              {canChat && <MessageInput onSend={handleSend} onImage={handleSendImage} disabled={sending} />}
            </>
          )}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </motion.div>
    </>
  );
};

export default SalvaNGNsChat;