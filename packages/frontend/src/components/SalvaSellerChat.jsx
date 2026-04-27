// Salva-Digital-Tech/packages/frontend/src/components/SalvaSellerChat.jsx
import React, { useState, useEffect, useRef, useCallback, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SALVA_API_URL } from "../config";

// ── Status meta ────────────────────────────────────────────────────────────
const STATUS_META = {
  pending: {
    label: "Pending",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
    border: "rgba(245,158,11,0.3)",
  },
  paid: {
    label: "Paid·Receipt",
    color: "#D4AF37",
    bg: "rgba(212,175,55,0.12)",
    border: "rgba(212,175,55,0.35)",
  },
  minting: {
    label: "Minting…",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
    border: "rgba(59,130,246,0.3)",
  },
  minted: {
    label: "Minted ✓",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
  },
  rejected: {
    label: "Rejected",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
  },
  burned: {
    label: "Burned 🔥",
    color: "#ef4444",
    bg: "rgba(239,68,68,0.12)",
    border: "rgba(239,68,68,0.3)",
  },
  sell_completed: {
    label: "Completed ✓",
    color: "#22c55e",
    bg: "rgba(34,197,94,0.12)",
    border: "rgba(34,197,94,0.3)",
  },
};

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pending;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: "8px",
        background: m.bg,
        border: `1px solid ${m.border}`,
        color: m.color,
        fontSize: "9px",
        fontWeight: "700",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        flexShrink: 0,
      }}
    >
      {m.label}
    </span>
  );
}

function TypeBadge({ type }) {
  const isSell = type === "sell";
  return (
    <span
      style={{
        padding: "1px 6px",
        borderRadius: "6px",
        fontSize: "8px",
        fontWeight: "900",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: isSell ? "rgba(239,68,68,0.15)" : "rgba(212,175,55,0.15)",
        color: isSell ? "#ef4444" : "#D4AF37",
        border: `1px solid ${isSell ? "rgba(239,68,68,0.3)" : "rgba(212,175,55,0.3)"}`,
        flexShrink: 0,
      }}
    >
      {isSell ? "SELL" : "BUY"}
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
          <strong
            key={i}
            style={{ color: isMine ? "rgba(0,0,0,0.85)" : "#D4AF37" }}
          >
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </span>
  );
}

// ── Message Input (with image upload) ─────────────────────────────────────
const MessageInput = memo(({ onSend, onImage, disabled }) => {
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
        borderTop: "1px solid rgba(212,175,55,0.12)",
        flexShrink: 0,
      }}
    >
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        {/* Image upload */}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Upload image"
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
            transition: "all 0.2s",
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
          placeholder="Reply to user…"
          disabled={disabled}
          rows={1}
          style={{
            flex: 1,
            padding: "9px 12px",
            borderRadius: "10px",
            border: "1px solid rgba(212,175,55,0.2)",
            background: "#1a1a1b",
            color: "#f5f0e8",
            fontSize: "12.5px",
            outline: "none",
            resize: "none",
            overflowY: "hidden",
            lineHeight: "1.5",
            fontFamily: "inherit",
            minHeight: "36px",
            maxHeight: "100px",
            transition: "border-color 0.2s",
          }}
          onFocus={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.6)")}
          onBlur={(e) => (e.target.style.borderColor = "rgba(212,175,55,0.2)")}
        />

        <button
          onClick={submit}
          disabled={disabled || !text.trim()}
          style={{
            width: "36px",
            height: "36px",
            borderRadius: "9px",
            flexShrink: 0,
            background:
              disabled || !text.trim()
                ? "rgba(212,175,55,0.15)"
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
});

// ── Seller Bubble ──────────────────────────────────────────────────────────
const SellerBubble = memo(({ msg }) => {
  const isMine = msg.sender === "seller";

  if (msg.isMinted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        style={{
          margin: "6px 0",
          padding: "12px 14px",
          borderRadius: "14px",
          textAlign: "center",
          background:
            "linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.05))",
          border: "1px solid rgba(34,197,94,0.35)",
        }}
      >
        <span style={{ fontSize: "22px" }}>🎉</span>
        <div
          style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}
        >
          <TypeBadge type="buy" />
        </div>
        <p
          style={{
            color: "#22c55e",
            fontWeight: "900",
            fontSize: "12px",
            margin: "0 0 3px",
          }}
        >
          Minted Successfully
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "10px",
            margin: 0,
            whiteSpace: "pre-line",
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
          margin: "6px 0",
          padding: "12px 14px",
          borderRadius: "14px",
          textAlign: "center",
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.05))",
          border: "1px solid rgba(239,68,68,0.35)",
        }}
      >
        <span style={{ fontSize: "22px" }}>🔥</span>
        <div
          style={{ display: "flex", justifyContent: "center", margin: "4px 0" }}
        >
          <TypeBadge type="sell" />
        </div>
        <p
          style={{
            color: "#ef4444",
            fontWeight: "900",
            fontSize: "12px",
            margin: "0 0 3px",
          }}
        >
          Sell Request
        </p>
        <p
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: "10px",
            margin: 0,
            whiteSpace: "pre-line",
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
        display: "flex",
        justifyContent: isMine ? "flex-end" : "flex-start",
        alignItems: "flex-end",
        gap: "5px",
      }}
    >
      {!isMine && (
        <div
          style={{
            width: "24px",
            height: "24px",
            borderRadius: "7px",
            flexShrink: 0,
            background: "rgba(212,175,55,0.15)",
            border: "1px solid rgba(212,175,55,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "10px",
            fontWeight: "900",
            color: "#D4AF37",
          }}
        >
          U
        </div>
      )}
      <div
        style={{
          maxWidth: "78%",
          padding: "9px 12px",
          borderRadius: isMine ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
          background: isMine
            ? "linear-gradient(135deg, #D4AF37, #b8941e)"
            : "rgba(255,255,255,0.05)",
          border: isMine ? "none" : "1px solid rgba(212,175,55,0.12)",
        }}
      >
        {msg.imageUrl && (
          <img
            src={msg.imageUrl}
            alt="attachment"
            style={{
              maxWidth: "100%",
              maxHeight: "160px",
              borderRadius: "8px",
              marginBottom: msg.text ? "6px" : 0,
              display: "block",
              objectFit: "contain",
            }}
          />
        )}
        {msg.isReceipt && (
          <div
            style={{
              padding: "4px 8px",
              borderRadius: "6px",
              background: "rgba(212,175,55,0.15)",
              border: "1px solid rgba(212,175,55,0.3)",
              color: "#D4AF37",
              fontSize: "9px",
              fontWeight: "700",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "6px",
              display: "inline-block",
            }}
          >
            📎 Payment Receipt
          </div>
        )}
        {msg.text && (
          <p
            style={{
              fontSize: "12px",
              color: isMine ? "#000" : "#f5f0e8",
              margin: 0,
              lineHeight: "1.5",
              wordBreak: "break-word",
              whiteSpace: "pre-line",
            }}
          >
            <RichText text={msg.text} isMine={isMine} />
          </p>
        )}
        <p
          style={{
            fontSize: "9px",
            color: isMine ? "rgba(0,0,0,0.5)" : "rgba(255,255,255,0.3)",
            margin: "3px 0 0",
            textAlign: "right",
          }}
        >
          {new Date(msg.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
          {isMine && <span style={{ marginLeft: "4px" }}>✓✓</span>}
        </p>
      </div>
    </div>
  );
});

// ── Confirm Mint Modal ─────────────────────────────────────────────────────
const ConfirmModal = memo(({ request, onConfirm, onClose, loading }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    onClick={(e) => e.target === e.currentTarget && onClose()}
    style={{
      position: "fixed",
      inset: 0,
      zIndex: 10002,
      background: "rgba(0,0,0,0.85)",
      backdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "16px",
    }}
  >
    <motion.div
      initial={{ scale: 0.88, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.88, opacity: 0 }}
      style={{
        width: "100%",
        maxWidth: "340px",
        background: "#111112",
        border: "1px solid rgba(212,175,55,0.3)",
        borderRadius: "20px",
        overflow: "hidden",
        boxShadow: "0 32px 80px rgba(0,0,0,0.9)",
      }}
    >
      <div
        style={{
          height: "3px",
          background: "linear-gradient(90deg, #D4AF37, #b8941e)",
        }}
      />
      <div style={{ padding: "24px 20px", textAlign: "center" }}>
        <div style={{ fontSize: "36px", marginBottom: "10px" }}>🪙</div>
        <h3
          style={{
            color: "#f5f0e8",
            fontSize: "16px",
            fontWeight: "900",
            margin: "0 0 6px",
          }}
        >
          Confirm Mint
        </h3>
        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "11px",
            margin: "0 0 18px",
          }}
        >
          This will call ERC20.mint() directly on-chain. Gas is paid by the
          backend wallet.
        </p>
        <div
          style={{
            background: "rgba(212,175,55,0.07)",
            border: "1px solid rgba(212,175,55,0.2)",
            borderRadius: "12px",
            padding: "14px",
            marginBottom: "18px",
          }}
        >
          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "11px",
              margin: "0 0 4px",
            }}
          >
            Recipient
          </p>
          <p
            style={{
              color: "#D4AF37",
              fontWeight: "700",
              fontSize: "12px",
              margin: "0 0 10px",
              fontFamily: "monospace",
            }}
          >
            {request?.userSafeAddress?.slice(0, 10)}…
            {request?.userSafeAddress?.slice(-8)}
          </p>
          <p
            style={{
              color: "rgba(255,255,255,0.5)",
              fontSize: "11px",
              margin: "0 0 4px",
            }}
          >
            Amount
          </p>
          <p
            style={{
              color: "#22c55e",
              fontWeight: "900",
              fontSize: "20px",
              margin: 0,
            }}
          >
            {(request?.mintAmountNgn || 0).toLocaleString()} NGNs
          </p>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: "11px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.5)",
              fontSize: "12px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 2,
              padding: "11px",
              borderRadius: "12px",
              background: "linear-gradient(135deg, #22c55e, #16a34a)",
              border: "none",
              color: "#fff",
              fontSize: "13px",
              fontWeight: "900",
              cursor: loading ? "wait" : "pointer",
              boxShadow: "0 0 16px rgba(34,197,94,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            {loading && (
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
            {loading ? "Minting…" : "✅ Mint NGNs"}
          </button>
        </div>
      </div>
    </motion.div>
  </motion.div>
));

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
const SalvaSellerChat = ({ user }) => {
  const [view, setView] = useState("closed"); // closed | list | chat
  const [requests, setRequests] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [totalUnread, setTotalUnread] = useState(0);
  const [sending, setSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [rejecting, setRejecting] = useState(false);

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
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = newCount;
  }, [messages]);

  // ── Badge polling ──────────────────────────────────────────────────────
  const fetchBadge = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/unread-count?safeAddress=${user.safeAddress}`,
      );
      const d = await res.json();
      setTotalUnread((p) => (p !== d.unreadCount ? d.unreadCount : p));
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    fetchBadge();
    badgePollRef.current = setInterval(fetchBadge, 5000);
    return () => clearInterval(badgePollRef.current);
  }, [fetchBadge]);

  // ── List polling ───────────────────────────────────────────────────────
  const fetchList = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/all-requests?safeAddress=${user.safeAddress}`,
      );
      const d = await res.json();
      setRequests((prev) => {
        const prevKey = prev
          .map((r) => r._id + r.status + r.updatedAt + r.sellerRead)
          .join();
        const nextKey = (d.requests || [])
          .map((r) => r._id + r.status + r.updatedAt + r.sellerRead)
          .join();
        if (prevKey === nextKey) return prev;
        return d.requests || [];
      });
      setTotalUnread(
        (d.requests || []).filter((r) => !r.sellerRead && r.status !== "minted")
          .length,
      );
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    if (view === "list") {
      fetchList();
      listPollRef.current = setInterval(fetchList, 4000);
    } else {
      clearInterval(listPollRef.current);
    }
    return () => clearInterval(listPollRef.current);
  }, [view, fetchList]);

  // ── Chat polling ───────────────────────────────────────────────────────
  const fetchChat = useCallback(async () => {
    const sel = selectedRef.current;
    if (!sel?._id || !user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/request/${sel._id}?safeAddress=${user.safeAddress}`,
      );
      const d = await res.json();
      if (d.request) {
        setSelected((prev) => {
          const prevKey = (prev?.messages || []).map((m) => m._id).join();
          const nextKey = (d.request.messages || []).map((m) => m._id).join();
          if (prevKey === nextKey && prev?.status === d.request.status)
            return prev;
          return d.request;
        });
        setMessages(d.request.messages || []);
      }
    } catch {
      /* ignore */
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    if (view === "chat" && selected?._id) {
      fetchChat();
      pollRef.current = setInterval(fetchChat, 3000);
    } else {
      clearInterval(pollRef.current);
    }
    return () => clearInterval(pollRef.current);
  }, [view, selected?._id, fetchChat]);

  // ── Open request ───────────────────────────────────────────────────────
  const openRequest = async (req) => {
    setSelected(req);
    setMessages(req.messages || []);
    setMintError("");
    setView("chat");
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/request/${req._id}?safeAddress=${user.safeAddress}`,
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

  // ── Send text ──────────────────────────────────────────────────────────
  const handleSend = async (text) => {
    if (!selected?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: "seller",
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
          requestId: selected._id,
          safeAddress: user.safeAddress,
          text,
          sender: "seller",
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? d.message : m)),
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
    if (!selected?._id) return;
    const optimistic = {
      _id: `tmp-${Date.now()}`,
      sender: "seller",
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
          requestId: selected._id,
          safeAddress: user.safeAddress,
          imageBase64,
          sender: "seller",
        }),
      });
      const d = await res.json();
      if (res.ok) {
        setMessages((prev) =>
          prev.map((m) => (m._id === optimistic._id ? d.message : m)),
        );
      } else {
        setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m._id !== optimistic._id));
    }
  };

  // ── Confirm mint ───────────────────────────────────────────────────────
  const handleConfirmMint = async () => {
    setMinting(true);
    setMintError("");
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/confirm-mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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
        setMintError(d.message || "Mint failed");
        setShowConfirm(false);
      }
    } catch (err) {
      setMintError(err.message || "Network error");
      setShowConfirm(false);
    }
    setMinting(false);
  };

  // ── Reject ─────────────────────────────────────────────────────────────
  const handleReject = async () => {
    if (!selected?._id) return;
    setRejecting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

  const isBuyRequest = selected?.type !== "sell";
  const canMint = selected?.status === "paid" && isBuyRequest;
  const isSellPaid = selected?.status === "paid" && selected?.type === "sell";

  // ──────────────────────────────────────────────────────────────────────
  // FAB
  // ──────────────────────────────────────────────────────────────────────
  if (view === "closed") {
    return (
      <div
        style={{
          position: "fixed",
          bottom: "24px",
          left: "24px",
          zIndex: 9000,
        }}
      >
        <motion.button
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setView("list")}
          style={{
            width: "54px",
            height: "54px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #1a1500, #2d2500)",
            border: "1.5px solid rgba(212,175,55,0.5)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow:
              "0 0 28px rgba(212,175,55,0.25), 0 4px 20px rgba(0,0,0,0.6)",
            position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <span
              style={{ fontSize: "18px", color: "#D4AF37", fontWeight: "900" }}
            >
              ₦
            </span>
            <span
              style={{
                position: "absolute",
                top: "-4px",
                right: "-6px",
                fontSize: "9px",
                color: "#22c55e",
              }}
            >
              ✓
            </span>
          </div>
          {totalUnread > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              style={{
                position: "absolute",
                top: "-4px",
                right: "-4px",
                minWidth: "20px",
                height: "20px",
                borderRadius: "10px",
                background: "#ef4444",
                color: "white",
                fontSize: "10px",
                fontWeight: "700",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 4px",
                border: "2px solid #0a0a0b",
              }}
            >
              {totalUnread > 9 ? "9+" : totalUnread}
            </motion.span>
          )}
        </motion.button>
      </div>
    );
  }

  // ──────────────────────────────────────────────────────────────────────
  // WINDOW
  // ──────────────────────────────────────────────────────────────────────
  return (
    <>
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

      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 20 }}
        style={{
          position: "fixed",
          bottom: "24px",
          left: "24px",
          zIndex: 9000,
          width: "370px",
          maxWidth: "calc(100vw - 2rem)",
        }}
      >
        <div
          style={{
            height: "560px",
            background: "#0d0d0e",
            border: "1px solid rgba(212,175,55,0.18)",
            borderRadius: "22px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow:
              "0 28px 72px rgba(0,0,0,0.85), 0 0 0 1px rgba(212,175,55,0.04)",
          }}
        >
          {/* HEADER */}
          <div
            style={{
              background: "linear-gradient(135deg, #1a1500, #111100)",
              borderBottom: "1px solid rgba(212,175,55,0.2)",
              padding: "13px 16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              flexShrink: 0,
            }}
          >
            {view === "chat" && (
              <button
                onClick={() => {
                  setView("list");
                  setSelected(null);
                  setMessages([]);
                  setMintError("");
                }}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(212,175,55,0.6)",
                  fontSize: "18px",
                  cursor: "pointer",
                  padding: "2px 6px 2px 0",
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                ←
              </button>
            )}
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "9px",
                flexShrink: 0,
                background: "linear-gradient(135deg, #D4AF37, #b8941e)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                style={{ fontSize: "14px", color: "#000", fontWeight: "900" }}
              >
                ₦
              </span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {view === "list" ? (
                <>
                  <p
                    style={{
                      color: "#f5f0e8",
                      fontSize: "13px",
                      fontWeight: "900",
                      margin: 0,
                    }}
                  >
                    NGNs Requests
                  </p>
                  <p
                    style={{
                      color: "rgba(212,175,55,0.5)",
                      fontSize: "10px",
                      margin: 0,
                    }}
                  >
                    {requests.length} conversation
                    {requests.length !== 1 ? "s" : ""}
                  </p>
                </>
              ) : (
                <>
                  <p
                    style={{
                      color: "#f5f0e8",
                      fontSize: "13px",
                      fontWeight: "900",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {selected?.username}
                  </p>
                  <p
                    style={{
                      color: "rgba(212,175,55,0.5)",
                      fontSize: "10px",
                      margin: 0,
                    }}
                  >
                    {selected?.userEmail}
                  </p>
                </>
              )}
            </div>
            {view === "chat" && selected?.status && (
              <StatusBadge status={selected.status} />
            )}
            <button
              onClick={() => {
                setView("closed");
                setSelected(null);
                setMessages([]);
              }}
              style={{
                width: "26px",
                height: "26px",
                borderRadius: "50%",
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)",
                cursor: "pointer",
                color: "rgba(255,255,255,0.4)",
                fontSize: "15px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              ×
            </button>
          </div>

          {/* LIST VIEW */}
          {view === "list" && (
            <div style={{ flex: 1, overflowY: "auto", background: "#0a0a0b" }}>
              {requests.length === 0 ? (
                <div
                  style={{
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "10px",
                    padding: "60px 20px",
                  }}
                >
                  <span style={{ fontSize: "32px", opacity: 0.3 }}>₦</span>
                  <p
                    style={{
                      color: "rgba(212,175,55,0.4)",
                      fontSize: "12px",
                      margin: 0,
                      fontWeight: "700",
                    }}
                  >
                    No requests yet
                  </p>
                  <p
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      fontSize: "10px",
                      margin: 0,
                    }}
                  >
                    Buy/sell requests will appear here
                  </p>
                </div>
              ) : (
                requests.map((req) => {
                  const lastMsg = req.messages?.[req.messages.length - 1];
                  const isUnread =
                    !req.sellerRead &&
                    req.status !== "minted" &&
                    req.status !== "burned" &&
                    req.status !== "sell_completed";
                  const isPaid = req.status === "paid";
                  const isSell = req.type === "sell";
                  return (
                    <button
                      key={req._id}
                      onClick={() => openRequest(req)}
                      style={{
                        width: "100%",
                        padding: "12px 14px",
                        background:
                          isPaid && isUnread ? "rgba(212,175,55,0.04)" : "none",
                        border: "none",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        textAlign: "left",
                        cursor: "pointer",
                        transition: "background 0.15s",
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background =
                          "rgba(212,175,55,0.07)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background =
                          isPaid && isUnread ? "rgba(212,175,55,0.04)" : "none")
                      }
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}
                      >
                        {/* Avatar */}
                        <div
                          style={{
                            width: "40px",
                            height: "40px",
                            borderRadius: "11px",
                            flexShrink: 0,
                            background: isSell
                              ? "rgba(239,68,68,0.15)"
                              : isPaid
                                ? "rgba(212,175,55,0.2)"
                                : "rgba(255,255,255,0.06)",
                            border: `1px solid ${isSell ? "rgba(239,68,68,0.35)" : isPaid ? "rgba(212,175,55,0.4)" : "rgba(255,255,255,0.08)"}`,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: isSell
                              ? "#ef4444"
                              : isPaid
                                ? "#D4AF37"
                                : "rgba(255,255,255,0.4)",
                            fontWeight: "900",
                            fontSize: "15px",
                          }}
                        >
                          {req.username?.charAt(0)?.toUpperCase() || "?"}
                        </div>
                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "baseline",
                              marginBottom: "2px",
                            }}
                          >
                            <p
                              style={{
                                color: isUnread
                                  ? "#f5f0e8"
                                  : "rgba(255,255,255,0.7)",
                                fontSize: "13px",
                                fontWeight: isUnread ? "700" : "500",
                                margin: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                            >
                              {req.username}
                            </p>
                            <p
                              style={{
                                color: "rgba(255,255,255,0.25)",
                                fontSize: "9px",
                                margin: 0,
                                flexShrink: 0,
                                marginLeft: "8px",
                              }}
                            >
                              {new Date(req.updatedAt).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </p>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "6px",
                              marginBottom: "4px",
                            }}
                          >
                            <p
                              style={{
                                color: "rgba(255,255,255,0.35)",
                                fontSize: "11px",
                                margin: 0,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flex: 1,
                              }}
                            >
                              {lastMsg?.isReceipt
                                ? "📎 Receipt uploaded"
                                : lastMsg?.isBurned
                                  ? "🔥 Sell request"
                                  : lastMsg?.text
                                      ?.replace(/\*\*/g, "")
                                      ?.slice(0, 45) || "No messages"}
                            </p>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "5px",
                                flexShrink: 0,
                              }}
                            >
                              <span
                                style={{
                                  color: isSell ? "#ef4444" : "#D4AF37",
                                  fontSize: "10px",
                                  fontWeight: "700",
                                }}
                              >
                                ₦{(req.amountNgn || 0).toLocaleString()}
                              </span>
                              {isUnread && (
                                <span
                                  style={{
                                    width: "8px",
                                    height: "8px",
                                    borderRadius: "50%",
                                    background: "#D4AF37",
                                    display: "inline-block",
                                    boxShadow: "0 0 6px rgba(212,175,55,0.6)",
                                  }}
                                />
                              )}
                            </div>
                          </div>
                          <div
                            style={{
                              display: "flex",
                              gap: "4px",
                              alignItems: "center",
                            }}
                          >
                            <TypeBadge type={req.type} />
                            <StatusBadge status={req.status} />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          )}

          {/* CHAT VIEW */}
          {view === "chat" && selected && (
            <>
              {/* Summary bar */}
              <div
                style={{
                  padding: "8px 14px",
                  background: "rgba(212,175,55,0.05)",
                  borderBottom: "1px solid rgba(212,175,55,0.1)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                {selected.type === "sell" &&
                selected.status !== "sell_completed" ? (
                  <>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "10px",
                      }}
                    >
                      Sell: {(selected.amountNgn || 0).toLocaleString()} NGNs
                      burned
                    </span>
                    <span
                      style={{
                        color: "#ef4444",
                        fontWeight: "900",
                        fontSize: "12px",
                      }}
                    >
                      Pay: ₦{(selected.amountNgn || 0).toLocaleString()}
                    </span>
                  </>
                ) : selected.type !== "sell" ? (
                  <>
                    <span
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "10px",
                      }}
                    >
                      Buy: ₦{(selected.amountNgn || 0).toLocaleString()} · Fee:{" "}
                      {selected.feeNgn} NGNs
                    </span>
                    <span
                      style={{
                        color: "#D4AF37",
                        fontWeight: "900",
                        fontSize: "12px",
                      }}
                    >
                      Mint: {(selected.mintAmountNgn || 0).toLocaleString()}{" "}
                      NGNs
                    </span>
                  </>
                ) : null}
              </div>

              {/* Sell bank details bar */}
              {selected.type === "sell" &&
                selected.status !== "sell_completed" &&
                selected.bankDetails?.accountNumber && (
                  <div
                    style={{
                      padding: "8px 14px",
                      background: "rgba(239,68,68,0.05)",
                      borderBottom: "1px solid rgba(239,68,68,0.1)",
                      flexShrink: 0,
                    }}
                  >
                    <p
                      style={{
                        color: "rgba(255,255,255,0.4)",
                        fontSize: "9px",
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                        margin: "0 0 3px",
                        fontWeight: "700",
                      }}
                    >
                      Payout Details
                    </p>
                    <p
                      style={{ color: "#f5f0e8", fontSize: "11px", margin: 0 }}
                    >
                      🏦 {selected.bankDetails.bankName} · 👤{" "}
                      {selected.bankDetails.accountName} · 🔢{" "}
                      {selected.bankDetails.accountNumber}
                    </p>
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
    overflowY: "auto",
    padding: "12px 12px 8px",
    background: "#0a0a0b",
    display: "flex",
    flexDirection: "column",
    gap: "7px",
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
                    padding: "8px 14px",
                    background: "rgba(239,68,68,0.1)",
                    borderTop: "1px solid rgba(239,68,68,0.2)",
                  }}
                >
                  <p style={{ color: "#ef4444", fontSize: "11px", margin: 0 }}>
                    ❌ {mintError}
                  </p>
                </div>
              )}

              {/* Buy: confirm mint when paid */}
              {canMint && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#0d0d0e",
                    borderTop: "1px solid rgba(212,175,55,0.1)",
                    display: "flex",
                    gap: "8px",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={handleReject}
                    disabled={rejecting}
                    style={{
                      flex: 1,
                      padding: "10px",
                      borderRadius: "10px",
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      color: "#ef4444",
                      fontSize: "11px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background =
                        "rgba(239,68,68,0.18)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "rgba(239,68,68,0.1)")
                    }
                  >
                    {rejecting ? "…" : "❌ Reject"}
                  </button>
                  <button
                    onClick={() => setShowConfirm(true)}
                    style={{
                      flex: 2,
                      padding: "10px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      border: "none",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: "900",
                      cursor: "pointer",
                      boxShadow: "0 0 14px rgba(34,197,94,0.3)",
                    }}
                  >
                    ✅ Confirm Payment & Mint
                  </button>
                </div>
              )}

              {/* Sell: paid means burn confirmed, seller needs to send fiat */}
              {isSellPaid && (
                <div
                  style={{
                    padding: "10px 12px",
                    background: "#0d0d0e",
                    borderTop: "1px solid rgba(239,68,68,0.15)",
                    flexShrink: 0,
                  }}
                >
                  <div
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      marginBottom: "8px",
                    }}
                  >
                    <p
                      style={{
                        color: "#ef4444",
                        fontSize: "11px",
                        fontWeight: "700",
                        margin: 0,
                      }}
                    >
                      🔥 NGNs burned on-chain. Send ₦
                      {(selected.amountNgn || 0).toLocaleString()} to user's
                      bank account above, then click SENT when done.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!selected?._id) return;
                      try {
                        await fetch(
                          `${SALVA_API_URL}/api/buy-ngns/complete-sell`,
                          {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              requestId: selected._id,
                              safeAddress: user.safeAddress,
                            }),
                          },
                        );
                        await fetchChat();
                        await fetchList();
                      } catch {
                        /* ignore */
                      }
                    }}
                    style={{
                      width: "100%",
                      padding: "11px",
                      borderRadius: "10px",
                      background: "linear-gradient(135deg, #22c55e, #16a34a)",
                      border: "none",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: "900",
                      cursor: "pointer",
                      boxShadow: "0 0 14px rgba(34,197,94,0.3)",
                    }}
                  >
                    ✅ SENT — Mark as Complete
                  </button>
                </div>
              )}

              {/* Reject when pending */}
              {selected?.status === "pending" && (
                <div
                  style={{
                    padding: "8px 12px",
                    background: "#0d0d0e",
                    borderTop: "1px solid rgba(255,255,255,0.05)",
                    flexShrink: 0,
                  }}
                >
                  <button
                    onClick={handleReject}
                    disabled={rejecting}
                    style={{
                      width: "100%",
                      padding: "9px",
                      borderRadius: "10px",
                      background: "rgba(239,68,68,0.08)",
                      border: "1px solid rgba(239,68,68,0.2)",
                      color: "rgba(239,68,68,0.7)",
                      fontSize: "11px",
                      cursor: "pointer",
                    }}
                  >
                    {rejecting ? "Rejecting…" : "Cancel / Reject Request"}
                  </button>
                </div>
              )}

              {/* Input */}
              {["pending", "paid"].includes(selected?.status) && (
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

export default SalvaSellerChat;
