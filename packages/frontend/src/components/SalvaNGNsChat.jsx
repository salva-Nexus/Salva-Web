// Salva-Digital-Tech/packages/frontend/src/components/SalvaNGNsChat.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SALVA_API_URL } from "../config";

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, "");
  const p = d.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return p.length > 1 ? p[0] + "." + p[1] : p[0];
};

function calcFee(amt) {
  if (amt >= 100000) return 20;
  if (amt >= 2000) return 10;
  return 0;
}

function RichText({ text }) {
  if (!text) return null;
  const parts = text.split(/\*\*(.*?)\*\*/g);
  return (
    <span>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <strong key={i} style={{ color: "#D4AF37" }}>
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

const MessageInput = memo(
  ({ onSend, onImage, disabled, placeholder = "Ask a question…" }) => {
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
      if (ref.current) {
        ref.current.style.height = "auto";
        ref.current.focus();
      }
    };

    const handleFile = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 6 * 1024 * 1024) {
        alert("Max 6MB");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => onImage(ev.target.result);
      reader.readAsDataURL(file);
      e.target.value = "";
    };

    return (
      <div
        style={{
          padding: "10px 12px",
          background: "#0d0d0e",
          borderTop: "1px solid rgba(212,175,55,0.15)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
          {/* Image upload button */}
          <button
            onClick={() => fileRef.current?.click()}
            disabled={disabled}
            style={{
              flexShrink: 0,
              width: "36px",
              height: "36px",
              borderRadius: "9px",
              background: "rgba(212,175,55,0.12)",
              border: "1px solid rgba(212,175,55,0.2)",
              cursor: disabled ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
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
            style={{ display: "none" }}
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
              padding: "9px 12px",
              borderRadius: "12px",
              border: "1px solid rgba(212,175,55,0.2)",
              background: "#1a1a1b",
              color: "#f5f0e8",
              fontSize: "13px",
              outline: "none",
              resize: "none",
              overflowY: "hidden",
              lineHeight: "1.5",
              fontFamily: "inherit",
              minHeight: "38px",
              maxHeight: "100px",
              transition: "border-color 0.2s",
            }}
            onFocus={(e) =>
              (e.target.style.borderColor = "rgba(212,175,55,0.6)")
            }
            onBlur={(e) =>
              (e.target.style.borderColor = "rgba(212,175,55,0.2)")
            }
          />
          <button
            onClick={submit}
            disabled={disabled || !text.trim()}
            style={{
              flexShrink: 0,
              width: "36px",
              height: "36px",
              borderRadius: "10px",
              background:
                disabled || !text.trim()
                  ? "rgba(212,175,55,0.2)"
                  : "linear-gradient(135deg, #D4AF37, #b8941e)",
              border: "none",
              cursor: disabled || !text.trim() ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
          >
            <svg
              width="14"
              height="14"
              fill={disabled || !text.trim() ? "rgba(212,175,55,0.4)" : "#000"}
              viewBox="0 0 24 24"
            >
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    );
  },
);

const Bubble = memo(({ msg }) => {
  const isMe = msg.sender === "user";

  if (msg.isMinted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: "8px 0",
          padding: "14px 16px",
          borderRadius: "16px",
          background:
            "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))",
          border: "1px solid rgba(34,197,94,0.4)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "28px", marginBottom: "6px" }}>🎉</div>
        <p
          style={{
            color: "#22c55e",
            fontWeight: "900",
            fontSize: "13px",
            margin: "0 0 4px",
          }}
        >
          NGNs Minted!
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "11px",
            margin: 0,
            whiteSpace: "pre-line",
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
          margin: "8px 0",
          padding: "14px 16px",
          borderRadius: "16px",
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))",
          border: "1px solid rgba(239,68,68,0.35)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: "28px", marginBottom: "6px" }}>🔥</div>
        <p
          style={{
            color: "#ef4444",
            fontWeight: "900",
            fontSize: "13px",
            margin: "0 0 4px",
          }}
        >
          Sell Request Submitted
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.6)",
            fontSize: "11px",
            margin: 0,
            whiteSpace: "pre-line",
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
        display: "flex",
        justifyContent: isMe ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: "6px",
      }}
    >
      {!isMe && (
        <div
          style={{
            width: "26px",
            height: "26px",
            borderRadius: "8px",
            flexShrink: 0,
            background: "linear-gradient(135deg, #D4AF37, #b8941e)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: "900",
            color: "#000",
          }}
        >
          ₦
        </div>
      )}
      <div
        style={{
          maxWidth: "78%",
          padding: "10px 13px",
          borderRadius: isMe ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
          background: isMe
            ? "linear-gradient(135deg, #D4AF37, #b8941e)"
            : "rgba(255,255,255,0.05)",
          border: isMe ? "none" : "1px solid rgba(212,175,55,0.15)",
        }}
      >
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="attachment"
            style={{
              maxWidth: "100%",
              maxHeight: "180px",
              borderRadius: "10px",
              marginBottom: msg.text ? "6px" : 0,
              display: "block",
              objectFit: "contain",
            }}
          />
        )}
        {msg.text && (
          <p
            style={{
              fontSize: "12.5px",
              color: isMe ? "#000" : "#f5f0e8",
              margin: 0,
              lineHeight: "1.55",
              wordBreak: "break-word",
              whiteSpace: "pre-line",
            }}
          >
            <RichText text={msg.text} />
          </p>
        )}
        <p
          style={{
            fontSize: "9px",
            color: isMe ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.35)",
            margin: "4px 0 0",
            textAlign: "right",
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {isMe && <span style={{ marginLeft: "4px" }}>✓</span>}
        </p>
      </div>
    </div>
  );
});

const SalvaNGNsChat = ({ user }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(null); // null | "buy" | "sell"

  // ── Buy state ──────────────────────────────────────────────────────────
  const [buyPhase, setBuyPhase] = useState("amount"); // amount | confirm | chat
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amountRaw, setAmountRaw] = useState(0);
  const [initiating, setInitiating] = useState(false);
  const [initError, setInitError] = useState("");

  // ── Sell state ─────────────────────────────────────────────────────────
  const [sellPhase, setSellPhase] = useState("amount"); // amount | bank | confirming | chat
  const [sellAmountDisplay, setSellAmountDisplay] = useState("");
  const [sellAmountRaw, setSellAmountRaw] = useState(0);
  const [sellAmountError, setSellAmountError] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [accountName, setAccountName] = useState("");
  const [sellError, setSellError] = useState("");
  const [sellInitiating, setSellInitiating] = useState(false);
  const [ngnBalance, setNgnBalance] = useState(0);

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

  const fee = calcFee(amountRaw);
  const mintAmt = amountRaw - fee;
  const status = mintRequest?.status;
  const canChat = status === "pending" || status === "paid";
  const isMinted = status === "minted";
  const isRejected = status === "rejected";
  const isBurned = status === "burned";

  const isNearBottom = useRef(true);
  const chatContainerRef = useRef(null);
  const prevMessageCount = useRef(0);

  useEffect(() => {
    const newCount = messages.length;
    if (newCount > prevMessageCount.current && isNearBottom.current) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  const loadRequest = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`,
      );
      const data = await res.json();
      if (
        data.request &&
        ["pending", "paid", "minting"].includes(data.request.status)
      ) {
        setMintRequest(data.request);
        setMessages(data.request.messages || []);
        setMode(data.request.type || "buy");
        setBuyPhase("chat");
        setSellPhase("chat");
      }
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  const fetchBalance = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/balance/${user.safeAddress}`,
      );
      const data = await res.json();
      setNgnBalance(parseFloat(data.balance || 0));
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    if (isOpen) {
      loadRequest();
      fetchBalance();
    }
  }, [isOpen, loadRequest, fetchBalance]);

  useEffect(() => {
    const activeChat =
      (mode === "buy" && buyPhase === "chat") ||
      (mode === "sell" && sellPhase === "chat");
    if (!activeChat || !mintRequest?._id || !isOpen) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(
          `${SALVA_API_URL}/api/buy-ngns/my-request/${user.safeAddress}`,
        );
        const data = await res.json();
        if (data.request) {
          setMintRequest(data.request);
          setMessages(data.request.messages || []);
        }
      } catch {
        /* ignore */
      }
    }, 3000);
    return () => clearInterval(pollRef.current);
  }, [mode, buyPhase, sellPhase, mintRequest?._id, isOpen, user?.safeAddress]);

  // ── Buy initiate ───────────────────────────────────────────────────────
  const handleBuyInitiate = async () => {
    setInitError("");
    setInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          amountNgn: amountRaw,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setInitError(data.message || "Failed");
        return;
      }
      await loadRequest();
    } catch {
      setInitError("Network error. Please try again.");
    } finally {
      setInitiating(false);
    }
  };

  // ── Sell initiate ──────────────────────────────────────────────────────
  const handleSellInitiate = async () => {
    setSellError("");
    setSellInitiating(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/initiate-sell`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          amountNgn: sellAmountRaw,
          bankName,
          accountNumber,
          accountName,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSellError(data.message || "Failed");
        return;
      }
      await loadRequest();
    } catch {
      setSellError("Network error. Please try again.");
    } finally {
      setSellInitiating(false);
    }
  };

  // ── Send text message ──────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (!mintRequest?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: "user",
      text,
      createdAt: new Date(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    setSending(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: mintRequest._id,
          safeAddress: user.safeAddress,
          text,
          sender: "user",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message } : m)),
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
    setSending(false);
  };

  // ── Send image ─────────────────────────────────────────────────────────
  const handleSendImage = async (imageBase64) => {
    if (!mintRequest?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: "user",
      imageUrl: imageBase64,
      createdAt: new Date(),
      _optimistic: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: mintRequest._id,
          safeAddress: user.safeAddress,
          imageBase64,
          sender: "user",
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? { ...data.message } : m)),
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
  };

  // ── Receipt upload (buy only) ──────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) {
      alert("File must be under 6MB");
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
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
    setBuyPhase("amount");
    setAmountDisplay("");
    setAmountRaw(0);
    setInitError("");
    setSellPhase("amount");
    setSellAmountDisplay("");
    setSellAmountRaw(0);
    setBankName("");
    setAccountNumber("");
    setAccountName("");
    setSellError("");
    setMintRequest(null);
    setMessages([]);
  };

  // ──────────────────────────────────────────────────────────────────────
  // FAB
  // ──────────────────────────────────────────────────────────────────────
  if (!isOpen) {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9000,
        }}
      >
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setIsOpen(true)}
          style={{
            width: "54px",
            height: "54px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #D4AF37, #b8941e)",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 0 28px rgba(212,175,55,0.45), 0 4px 20px rgba(0,0,0,0.5)",
            position: "relative",
          }}
        >
          <span style={{ fontSize: "20px", color: "#000", fontWeight: "900" }}>
            ₦
          </span>
          <motion.div
            animate={{ scale: [1, 1.6], opacity: [0.6, 0] }}
            transition={{ repeat: Infinity, duration: 2 }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "50%",
              border: "2px solid #D4AF37",
              pointerEvents: "none",
            }}
          />
        </motion.button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // WINDOW
  // ──────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Receipt upload overlay */}
      <AnimatePresence>
        {showReceiptUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) =>
              e.target === e.currentTarget && setShowReceiptUpload(false)
            }
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 10001,
              background: "rgba(0,0,0,0.8)",
              backdropFilter: "blur(8px)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "16px",
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              style={{
                width: "100%",
                maxWidth: "360px",
                background: "#111112",
                border: "1px solid rgba(212,175,55,0.3)",
                borderRadius: "20px",
                overflow: "hidden",
                boxShadow: "0 32px 80px rgba(0,0,0,0.8)",
              }}
            >
              <div
                style={{
                  padding: "16px 20px",
                  borderBottom: "1px solid rgba(212,175,55,0.15)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <p
                  style={{
                    color: "#f5f0e8",
                    fontSize: "13px",
                    fontWeight: "700",
                    margin: 0,
                  }}
                >
                  Upload Receipt
                </p>
                <button
                  onClick={() => setShowReceiptUpload(false)}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "20px",
                    cursor: "pointer",
                  }}
                >
                  ×
                </button>
              </div>
              <div style={{ padding: "20px" }}>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${receiptPreview ? "rgba(34,197,94,0.5)" : "rgba(212,175,55,0.3)"}`,
                    borderRadius: "14px",
                    padding: "24px",
                    cursor: "pointer",
                    textAlign: "center",
                    marginBottom: "14px",
                  }}
                >
                  {receiptPreview ? (
                    <img
                      src={receiptPreview}
                      alt="Preview"
                      style={{
                        maxHeight: "140px",
                        borderRadius: "10px",
                        margin: "0 auto",
                        display: "block",
                      }}
                    />
                  ) : (
                    <>
                      <div style={{ fontSize: "28px", marginBottom: "8px" }}>
                        📎
                      </div>
                      <p
                        style={{
                          color: "rgba(212,175,55,0.7)",
                          fontSize: "12px",
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
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div style={{ display: "flex", gap: "8px" }}>
                  <button
                    onClick={() => {
                      setShowReceiptUpload(false);
                      setReceiptFile(null);
                      setReceiptPreview(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "11px",
                      borderRadius: "12px",
                      background: "rgba(255,255,255,0.05)",
                      border: "1px solid rgba(255,255,255,0.1)",
                      color: "rgba(255,255,255,0.6)",
                      fontSize: "12px",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={
                      receiptFile
                        ? handleClaimPaid
                        : () => fileInputRef.current?.click()
                    }
                    disabled={claimingPaid}
                    style={{
                      flex: 1,
                      padding: "11px",
                      borderRadius: "12px",
                      background: receiptFile
                        ? "linear-gradient(135deg, #D4AF37, #b8941e)"
                        : "rgba(212,175,55,0.2)",
                      border: "none",
                      color: receiptFile ? "#000" : "rgba(212,175,55,0.6)",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    {claimingPaid && (
                      <span
                        style={{
                          width: "10px",
                          height: "10px",
                          border: "2px solid rgba(0,0,0,0.3)",
                          borderTopColor: "#000",
                          borderRadius: "50%",
                          display: "inline-block",
                          animation: "spin 0.6s linear infinite",
                        }}
                      />
                    )}
                    {claimingPaid
                      ? "Sending…"
                      : receiptFile
                        ? "Submit"
                        : "Choose File"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9000,
          width: "360px",
          maxWidth: "calc(100vw - 2rem)",
        }}
      >
        <div
          style={{
            height: "560px",
            background: "#0d0d0e",
            border: "1px solid rgba(212,175,55,0.2)",
            borderRadius: "22px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 28px 72px rgba(0,0,0,0.8)",
          }}
        >
          {/* HEADER */}
          <div
            style={{
              background: "linear-gradient(135deg, #1a1500, #111100)",
              borderBottom: "1px solid rgba(212,175,55,0.25)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexShrink: 0,
            }}
          >
            {mode &&
              (buyPhase === "confirm" ||
                sellPhase === "bank" ||
                sellPhase === "confirm") && (
                <button
                  onClick={() => {
                    if (mode === "buy") setBuyPhase("amount");
                    else setSellPhase("amount");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "rgba(212,175,55,0.6)",
                    fontSize: "18px",
                    cursor: "pointer",
                    padding: "2px 6px 2px 0",
                    lineHeight: 1,
                  }}
                >
                  ←
                </button>
              )}
            {mode === "buy" && buyPhase === "chat" && (
              <button
                onClick={() => {
                  setMintRequest(null);
                  setMessages([]);
                  setBuyPhase("amount");
                  setSellPhase("amount");
                  setMode(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(212,175,55,0.6)",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "2px 6px 2px 0",
                  lineHeight: 1,
                }}
              >
                ←
              </button>
            )}
            {mode === "sell" && sellPhase === "chat" && (
              <button
                onClick={() => {
                  setMintRequest(null);
                  setMessages([]);
                  setBuyPhase("amount");
                  setSellPhase("amount");
                  setMode(null);
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(212,175,55,0.6)",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "2px 6px 2px 0",
                  lineHeight: 1,
                }}
              >
                ←
              </button>
            )}
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background:
                  mode === "sell"
                    ? "linear-gradient(135deg, #ef4444, #b91c1c)"
                    : "linear-gradient(135deg, #D4AF37, #b8941e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                fontSize: "16px",
                fontWeight: "900",
                color: "#fff",
              }}
            >
              ₦
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  color: "#f5f0e8",
                  fontSize: "13px",
                  fontWeight: "900",
                  margin: 0,
                }}
              >
                {mode === "sell" ? "Sell NGNs" : "Buy NGNs"}
              </p>
              <p
                style={{
                  color: "rgba(212,175,55,0.6)",
                  fontSize: "10px",
                  margin: 0,
                }}
              >
                {!mode
                  ? "Choose an option"
                  : mode === "buy"
                    ? buyPhase === "chat"
                      ? status === "pending"
                        ? "Awaiting payment"
                        : status === "paid"
                          ? "Verifying…"
                          : status === "minting"
                            ? "Minting…"
                            : status === "minted"
                              ? "Complete ✓"
                              : "Rejected"
                      : "Salva · Online"
                    : sellPhase === "chat"
                      ? "Sell request active"
                      : "Salva · Online"}
              </p>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                width: "28px",
                height: "28px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.07)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                color: "rgba(255,255,255,0.5)",
                fontSize: "16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* MODE SELECTOR */}
          {!mode && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                gap: "16px",
              }}
            >
              <div style={{ fontSize: "40px" }}>₦</div>
              <h3
                style={{
                  color: "#f5f0e8",
                  fontSize: "18px",
                  fontWeight: "900",
                  margin: 0,
                }}
              >
                NGNs Exchange
              </h3>
              <p
                style={{
                  color: "rgba(255,255,255,0.4)",
                  fontSize: "11px",
                  margin: 0,
                  textAlign: "center",
                }}
              >
                Buy NGNs with fiat or sell NGNs for fiat
              </p>
              <div style={{ display: "flex", gap: "12px", width: "100%" }}>
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setBuyPhase("amount");
                    setSellPhase("amount");
                    setMode("buy");
                  }}
                  style={{
                    flex: 1,
                    padding: "16px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #D4AF37, #b8941e)",
                    border: "none",
                    color: "#000",
                    fontSize: "14px",
                    fontWeight: "900",
                    cursor: "pointer",
                    boxShadow: "0 0 20px rgba(212,175,55,0.3)",
                  }}
                >
                  🛒 Buy NGNs
                </button>
                <button
                  onClick={() => {
                    setMintRequest(null);
                    setMessages([]);
                    setBuyPhase("amount");
                    setSellPhase("amount");
                    setMode("sell");
                    fetchBalance();
                  }}
                  style={{
                    flex: 1,
                    padding: "16px",
                    borderRadius: "14px",
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    border: "none",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: "900",
                    cursor: "pointer",
                    boxShadow: "0 0 20px rgba(239,68,68,0.3)",
                  }}
                >
                  💸 Sell NGNs
                </button>
              </div>
              <div
                style={{
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: "10px",
                  padding: "12px",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <p
                  style={{
                    color: "rgba(212,175,55,0.5)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    margin: "0 0 8px",
                    fontWeight: "700",
                  }}
                >
                  How it works
                </p>
                {[
                  "Buy: Transfer NGN → receive NGNs in wallet",
                  "Sell: Burn NGNs → receive NGN in bank",
                ].map((s, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: "8px",
                      marginBottom: "5px",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        width: "16px",
                        height: "16px",
                        borderRadius: "50%",
                        background: "rgba(212,175,55,0.2)",
                        color: "#D4AF37",
                        fontSize: "9px",
                        fontWeight: "900",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "11px",
                      }}
                    >
                      {s}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── BUY FLOW ── */}
          {mode === "buy" && buyPhase === "amount" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "24px 20px",
                gap: "16px",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🛒</div>
                <h3
                  style={{
                    color: "#f5f0e8",
                    fontSize: "17px",
                    fontWeight: "900",
                    margin: "0 0 4px",
                  }}
                >
                  Buy NGNs
                </h3>
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "11px",
                    margin: 0,
                  }}
                >
                  Enter amount to purchase
                </p>
              </div>
              <div>
                <label
                  style={{
                    color: "rgba(212,175,55,0.6)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Amount (NGNs)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 10,000"
                    value={amountDisplay}
                    onChange={(e) => {
                      const f = fmtInput(e.target.value);
                      setAmountDisplay(f);
                      setAmountRaw(parseFloat(f.replace(/,/g, "")) || 0);
                      setInitError("");
                    }}
                    style={{
                      width: "100%",
                      padding: "13px 48px 13px 14px",
                      borderRadius: "12px",
                      border: "1px solid rgba(212,175,55,0.25)",
                      background: "#1a1a1b",
                      color: "#f5f0e8",
                      fontSize: "18px",
                      fontWeight: "900",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "rgba(212,175,55,0.7)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "rgba(212,175,55,0.25)")
                    }
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "#D4AF37",
                      fontWeight: "900",
                      fontSize: "12px",
                    }}
                  >
                    NGNs
                  </span>
                </div>
              </div>
              {amountRaw >= 100 && (
                <div
                  style={{
                    background: "rgba(212,175,55,0.05)",
                    border: "1px solid rgba(212,175,55,0.15)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  {[
                    ["You Send", `₦${amountRaw.toLocaleString()}`],
                    ["Fee", fee > 0 ? `-${fee} NGNs` : "Free"],
                    ["You Receive", `${mintAmt.toLocaleString()} NGNs`],
                  ].map(([l, v], i) => (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: i < 2 ? "6px" : 0,
                        paddingTop: i === 2 ? "8px" : 0,
                        borderTop:
                          i === 2 ? "1px solid rgba(212,175,55,0.1)" : "none",
                      }}
                    >
                      <span
                        style={{
                          color: "rgba(255,255,255,0.45)",
                          fontSize: "11px",
                        }}
                      >
                        {l}
                      </span>
                      <span
                        style={{
                          color:
                            i === 1 && fee > 0
                              ? "#ef4444"
                              : i === 2
                                ? "#D4AF37"
                                : "#f5f0e8",
                          fontWeight: i === 2 ? "900" : "700",
                          fontSize: i === 2 ? "14px" : "11px",
                        }}
                      >
                        {v}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {initError && (
                <p
                  style={{
                    color: "#ef4444",
                    fontSize: "11px",
                    textAlign: "center",
                    margin: 0,
                  }}
                >
                  {initError}
                </p>
              )}
              <button
                onClick={() => amountRaw >= 100 && setBuyPhase("confirm")}
                disabled={amountRaw < 100}
                style={{
                  width: "100%",
                  padding: "13px",
                  background:
                    amountRaw >= 100
                      ? "linear-gradient(135deg, #D4AF37, #b8941e)"
                      : "rgba(212,175,55,0.2)",
                  border: "none",
                  borderRadius: "12px",
                  color: amountRaw >= 100 ? "#000" : "rgba(212,175,55,0.4)",
                  fontSize: "13px",
                  fontWeight: "900",
                  cursor: amountRaw >= 100 ? "pointer" : "not-allowed",
                  textTransform: "uppercase",
                }}
              >
                Continue →
              </button>
            </div>
          )}

          {mode === "buy" && buyPhase === "confirm" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "24px 20px",
                gap: "14px",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>⚡</div>
                <h3
                  style={{
                    color: "#f5f0e8",
                    fontSize: "17px",
                    fontWeight: "900",
                    margin: "0 0 4px",
                  }}
                >
                  Confirm Purchase
                </h3>
              </div>
              <div
                style={{
                  background: "rgba(212,175,55,0.06)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  borderRadius: "14px",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "10px",
                }}
              >
                {[
                  ["You Send", `₦${amountRaw.toLocaleString()}`, "#f5f0e8"],
                  [
                    "Fee",
                    fee > 0 ? `-${fee} NGNs` : "Free",
                    fee > 0 ? "#ef4444" : "#22c55e",
                  ],
                  [
                    "You Receive",
                    `${mintAmt.toLocaleString()} NGNs`,
                    "#D4AF37",
                  ],
                ].map(([l, v, c]) => (
                  <div
                    key={l}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        color: "rgba(255,255,255,0.5)",
                        fontSize: "12px",
                      }}
                    >
                      {l}
                    </span>
                    <span
                      style={{
                        color: c,
                        fontWeight: "900",
                        fontSize: l === "You Receive" ? "16px" : "13px",
                      }}
                    >
                      {v}
                    </span>
                  </div>
                ))}
              </div>
              <div
                style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <p style={{ color: "#f59e0b", fontSize: "11px", margin: 0 }}>
                  ⚠️ You'll receive bank details. Transfer then upload receipt.
                </p>
              </div>
              {initError && (
                <p
                  style={{
                    color: "#ef4444",
                    fontSize: "11px",
                    textAlign: "center",
                  }}
                >
                  {initError}
                </p>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setBuyPhase("amount")}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "12px",
                    cursor: "pointer",
                  }}
                >
                  Back
                </button>
                <button
                  onClick={handleBuyInitiate}
                  disabled={initiating}
                  style={{
                    flex: 2,
                    padding: "12px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #D4AF37, #b8941e)",
                    border: "none",
                    color: "#000",
                    fontSize: "13px",
                    fontWeight: "900",
                    cursor: initiating ? "wait" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                  }}
                >
                  {initiating && (
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        border: "2px solid rgba(0,0,0,0.3)",
                        borderTopColor: "#000",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.6s linear infinite",
                      }}
                    />
                  )}
                  {initiating ? "Starting…" : "Confirm & Start"}
                </button>
              </div>
            </div>
          )}

          {/* ── SELL FLOW ── */}
          {mode === "sell" && sellPhase === "amount" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "24px 20px",
                gap: "16px",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>💸</div>
                <h3
                  style={{
                    color: "#f5f0e8",
                    fontSize: "17px",
                    fontWeight: "900",
                    margin: "0 0 4px",
                  }}
                >
                  Sell NGNs
                </h3>
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "11px",
                    margin: 0,
                  }}
                >
                  Balance: {ngnBalance.toLocaleString()} NGNs
                </p>
              </div>
              <div>
                <label
                  style={{
                    color: "rgba(212,175,55,0.6)",
                    fontSize: "9px",
                    textTransform: "uppercase",
                    letterSpacing: "0.15em",
                    fontWeight: "700",
                    display: "block",
                    marginBottom: "6px",
                  }}
                >
                  Amount to Sell (NGNs)
                </label>
                <div style={{ position: "relative" }}>
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="e.g. 5,000"
                    value={sellAmountDisplay}
                    onChange={(e) => {
                      const f = fmtInput(e.target.value);
                      setSellAmountDisplay(f);
                      const raw = parseFloat(f.replace(/,/g, "")) || 0;
                      setSellAmountRaw(raw);
                      setSellAmountError(
                        raw > ngnBalance ? "Insufficient NGNs balance" : "",
                      );
                    }}
                    style={{
                      width: "100%",
                      padding: "13px 48px 13px 14px",
                      borderRadius: "12px",
                      border: `1px solid ${sellAmountError ? "#ef4444" : "rgba(212,175,55,0.25)"}`,
                      background: "#1a1a1b",
                      color: sellAmountError ? "#ef4444" : "#f5f0e8",
                      fontSize: "18px",
                      fontWeight: "900",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) => {
                      if (!sellAmountError)
                        e.target.style.borderColor = "rgba(212,175,55,0.7)";
                    }}
                    onBlur={(e) => {
                      if (!sellAmountError)
                        e.target.style.borderColor = "rgba(212,175,55,0.25)";
                    }}
                  />
                  <span
                    style={{
                      position: "absolute",
                      right: "12px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: sellAmountError ? "#ef4444" : "#D4AF37",
                      fontWeight: "900",
                      fontSize: "12px",
                    }}
                  >
                    NGNs
                  </span>
                </div>
                {sellAmountError && (
                  <p
                    style={{
                      color: "#ef4444",
                      fontSize: "10px",
                      margin: "4px 0 0",
                      fontWeight: "700",
                    }}
                  >
                    ⚠️ {sellAmountError}
                  </p>
                )}
              </div>
              {sellAmountRaw > 0 && !sellAmountError && (
                <div
                  style={{
                    background: "rgba(239,68,68,0.06)",
                    border: "1px solid rgba(239,68,68,0.2)",
                    borderRadius: "12px",
                    padding: "12px 14px",
                  }}
                >
                  <div
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <span
                      style={{
                        color: "rgba(255,255,255,0.45)",
                        fontSize: "11px",
                      }}
                    >
                      NGNs to Burn
                    </span>
                    <span
                      style={{
                        color: "#ef4444",
                        fontWeight: "900",
                        fontSize: "13px",
                      }}
                    >
                      {sellAmountRaw.toLocaleString()} NGNs
                    </span>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: "6px",
                      paddingTop: "6px",
                      borderTop: "1px solid rgba(239,68,68,0.1)",
                    }}
                  ></div>
                </div>
              )}
              <button
                onClick={() =>
                  sellAmountRaw > 0 && !sellAmountError && setSellPhase("bank")
                }
                disabled={!sellAmountRaw || !!sellAmountError}
                style={{
                  width: "100%",
                  padding: "13px",
                  background:
                    !sellAmountRaw || sellAmountError
                      ? "rgba(239,68,68,0.2)"
                      : "linear-gradient(135deg, #ef4444, #b91c1c)",
                  border: "none",
                  borderRadius: "12px",
                  color:
                    !sellAmountRaw || sellAmountError
                      ? "rgba(239,68,68,0.4)"
                      : "#fff",
                  fontSize: "13px",
                  fontWeight: "900",
                  cursor:
                    !sellAmountRaw || sellAmountError
                      ? "not-allowed"
                      : "pointer",
                  textTransform: "uppercase",
                }}
              >
                Continue →
              </button>
            </div>
          )}

          {mode === "sell" && sellPhase === "bank" && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: "24px 20px",
                gap: "14px",
                overflowY: "auto",
              }}
            >
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "36px", marginBottom: "8px" }}>🏦</div>
                <h3
                  style={{
                    color: "#f5f0e8",
                    fontSize: "17px",
                    fontWeight: "900",
                    margin: "0 0 4px",
                  }}
                >
                  Bank Details
                </h3>
                <p
                  style={{
                    color: "rgba(255,255,255,0.4)",
                    fontSize: "11px",
                    margin: 0,
                  }}
                >
                  Where should we send ₦{sellAmountRaw.toLocaleString()}?
                </p>
              </div>
              {[
                {
                  label: "Bank Name",
                  value: bankName,
                  setter: setBankName,
                  placeholder: "e.g. OPay",
                },
                {
                  label: "Account Number",
                  value: accountNumber,
                  setter: setAccountNumber,
                  placeholder: "10-digit account number",
                },
                {
                  label: "Account Name",
                  value: accountName,
                  setter: setAccountName,
                  placeholder: "Full account name",
                },
              ].map(({ label, value, setter, placeholder }) => (
                <div key={label}>
                  <label
                    style={{
                      color: "rgba(212,175,55,0.6)",
                      fontSize: "9px",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      fontWeight: "700",
                      display: "block",
                      marginBottom: "5px",
                    }}
                  >
                    {label}
                  </label>
                  <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => setter(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "11px 14px",
                      borderRadius: "10px",
                      border: "1px solid rgba(212,175,55,0.2)",
                      background: "#1a1a1b",
                      color: "#f5f0e8",
                      fontSize: "13px",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                    onFocus={(e) =>
                      (e.target.style.borderColor = "rgba(212,175,55,0.6)")
                    }
                    onBlur={(e) =>
                      (e.target.style.borderColor = "rgba(212,175,55,0.2)")
                    }
                  />
                </div>
              ))}
              <div
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.2)",
                  borderRadius: "10px",
                  padding: "10px 12px",
                }}
              >
                <p style={{ color: "#ef4444", fontSize: "11px", margin: 0 }}>
                  ⚠️ {sellAmountRaw.toLocaleString()} NGNs will be burned
                  immediately on-chain when you confirm.
                </p>
              </div>
              {sellError && (
                <p
                  style={{
                    color: "#ef4444",
                    fontSize: "11px",
                    textAlign: "center",
                  }}
                >
                  {sellError}
                </p>
              )}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() => setSellPhase("amount")}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: "12px",
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.6)",
                    fontSize: "12px",
                    cursor: "pointer",
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
                    padding: "12px",
                    borderRadius: "12px",
                    background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                    border: "none",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: "900",
                    cursor:
                      sellInitiating ||
                      !bankName.trim() ||
                      !accountNumber.trim() ||
                      !accountName.trim()
                        ? "not-allowed"
                        : "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "6px",
                    opacity:
                      !bankName.trim() ||
                      !accountNumber.trim() ||
                      !accountName.trim()
                        ? 0.5
                        : 1,
                  }}
                >
                  {sellInitiating && (
                    <span
                      style={{
                        width: "10px",
                        height: "10px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        display: "inline-block",
                        animation: "spin 0.6s linear infinite",
                      }}
                    />
                  )}
                  {sellInitiating ? "Burning…" : "🔥 Burn & Submit"}
                </button>
              </div>
            </div>
          )}

          {/* ── SHARED CHAT VIEW ── */}
          {((mode === "buy" && buyPhase === "chat") ||
            (mode === "sell" && sellPhase === "chat")) && (
            <>
              <div
                ref={chatContainerRef}
                onScroll={(e) => {
                  const el = e.currentTarget;
                  isNearBottom.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "14px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "8px",
                  background: "#0a0a0b",
                }}
              >
                {messages.length === 0 && (
                  <div
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: 0.4,
                    }}
                  >
                    <p style={{ color: "#D4AF37", fontSize: "12px" }}>
                      Loading messages…
                    </p>
                  </div>
                )}
                {messages.map((msg, i) => (
                  <Bubble key={msg._id || i} msg={msg} />
                ))}

                {/* I Have Paid — buy only, pending */}
                {mode === "buy" &&
                  status === "pending" &&
                  messages.length > 0 &&
                  !showReceiptUpload && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{ display: "flex", justifyContent: "flex-end" }}
                    >
                      <button
                        onClick={() => setShowReceiptUpload(true)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "12px",
                          background:
                            "linear-gradient(135deg, #D4AF37, #b8941e)",
                          border: "none",
                          color: "#000",
                          fontSize: "12px",
                          fontWeight: "900",
                          cursor: "pointer",
                          boxShadow: "0 0 16px rgba(212,175,55,0.4)",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        <span>✅</span> I Have Paid
                      </button>
                    </motion.div>
                  )}

                {/* Minting indicator */}
                {status === "minting" && (
                  <div
                    style={{
                      padding: "12px",
                      background: "rgba(212,175,55,0.06)",
                      border: "1px solid rgba(212,175,55,0.2)",
                      borderRadius: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "16px",
                        height: "16px",
                        border: "2px solid rgba(212,175,55,0.3)",
                        borderTopColor: "#D4AF37",
                        borderRadius: "50%",
                        animation: "spin 0.8s linear infinite",
                        flexShrink: 0,
                      }}
                    />
                    <p
                      style={{
                        color: "#D4AF37",
                        fontSize: "12px",
                        margin: 0,
                        fontWeight: "700",
                      }}
                    >
                      Minting on-chain… please wait.
                    </p>
                  </div>
                )}

                {/* New buy/sell button after completion */}
                {(isMinted || isRejected || isBurned) && (
                  <button
                    onClick={resetAll}
                    style={{
                      padding: "11px",
                      borderRadius: "12px",
                      background: isMinted
                        ? "rgba(34,197,94,0.15)"
                        : isBurned
                          ? "rgba(239,68,68,0.1)"
                          : "rgba(239,68,68,0.1)",
                      border: `1px solid ${isMinted ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: isMinted ? "#22c55e" : "#ef4444",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    {isMinted
                      ? "Buy More NGNs →"
                      : isBurned
                        ? "New Transaction →"
                        : "Start New Request →"}
                  </button>
                )}

                <div ref={chatEndRef} />
              </div>

              {canChat && (
                <MessageInput
                  onSend={handleSend}
                  onImage={handleSendImage}
                  disabled={sending}
                />
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
