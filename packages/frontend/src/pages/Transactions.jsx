// Salva-Digital-Tech/packages/frontend/src/pages/Transactions.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import Stars from "../components/Stars";

// ── FROM/TO display logic ──────────────────────────────────────────────────
//
// SENDER VIEW ("sent" / "failed"):
//   FROM: my @salva alias (user.nameAlias) → fallback: my username
//   TO:   tx.senderDisplayIdentifier (exactly what was typed + welded, e.g.
//         "cboi@metamask" or "0x1234…") → fallback: tx.toNameAlias → tx.toUsername → tx.toAddress
//
// RECEIVER VIEW ("receive"):
//   FROM: tx.fromNameAlias (sender's @salva alias saved at tx time) →
//         tx.fromUsername (sender's salva username if salva user) →
//         tx.fromAddress  (raw address if external wallet / not salva)
//   TO:   my @salva alias (user.nameAlias) → fallback: my username
//
// The backend saves fromNameAlias / toNameAlias at tx-save time (index.js transfer route).
// senderDisplayIdentifier is the welded identifier the sender used.

function getTxDisplayNames(tx, user) {
  const myAlias = user.nameAlias || null;
  const myName  = user.username  || user.safeAddress;

  const isReceived = tx.displayType === "receive";
  const isSentOrFailed = tx.displayType === "sent" || tx.displayType === "failed";

  let fromLabel = "—";
  let toLabel   = "—";

  if (isSentOrFailed) {
    // FROM = me
    fromLabel = myAlias || myName;
    // TO = what I typed (senderDisplayIdentifier), else fallback chain
    toLabel =
      tx.senderDisplayIdentifier ||
      tx.toNameAlias ||
      tx.toUsername  ||
      tx.toAddress   ||
      "Unknown";
  } else if (isReceived) {
    // FROM = sender — prefer their @salva alias, then username, then raw address
    fromLabel =
      tx.fromNameAlias ||
      tx.fromUsername  ||
      tx.fromAddress   ||
      "Unknown";
    // TO = me
    toLabel = myAlias || myName;
  }

  return { fromLabel, toLabel };
}

const Transactions = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [groupedTxs, setGroupedTxs] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({ show: false, message: "", type: "" });

  useEffect(() => {
    const savedUser = localStorage.getItem("salva_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchTransactions(parsedUser.safeAddress);
      } catch {
        window.location.href = "/login";
      }
    } else {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => setNotification((n) => ({ ...n, show: false })), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const grouped = {};
    transactions.forEach((tx) => {
      const date  = new Date(tx.date);
      const year  = date.getFullYear().toString();
      const month = date.toLocaleDateString("en-US", { month: "long" });
      const day   = date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });

      if (!grouped[year])              grouped[year]              = {};
      if (!grouped[year][month])       grouped[year][month]       = {};
      if (!grouped[year][month][day])  grouped[year][month][day]  = [];

      grouped[year][month][day].push(tx);
    });
    setGroupedTxs(grouped);

    const now      = new Date();
    const currYear  = now.getFullYear().toString();
    const currMonth = now.toLocaleDateString("en-US", { month: "long" });
    const currDay   = now.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
    setExpanded({ [currYear]: true, [`${currYear}-${currMonth}`]: true, [currDay]: true });
  }, [transactions]);

  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const showMsg = (msg, type = "success") => setNotification({ show: true, message: msg, type });

  const fetchTransactions = async (address) => {
    try {
      const res  = await fetch(`${SALVA_API_URL}/api/transactions/${address}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) =>
    parseFloat(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // ── Receipt PDF ──────────────────────────────────────────────────────────
  // Fixes:
  //   • Removed ALL fromAccountNumber / toAccountNumber references
  //   • Network: "Base Mainnet" (not Sepolia)
  //   • FROM / TO use the same getTxDisplayNames() logic as the list view
  //   • Fee row is only shown when fee > 0
  //   • Coin label comes from tx.coin (NGNs / USDT / USDC)
  // ─────────────────────────────────────────────────────────────────────────
  const downloadReceipt = (tx) => {
    if (!user) return;
    const doc   = new jsPDF();
    const gold  = [212, 175, 55];
    const dark  = [10,  10,  11];
    const red   = [239, 68,  68];
    const green = [34,  197, 94];

    const isReceived   = tx.displayType === "receive";
    const isSuccessful = tx.status === "successful";
    const coinLabel    = tx.coin === "NGN" ? "NGNs" : (tx.coin || "NGNs");
    const hasFee       = tx.fee && parseFloat(tx.fee) > 0;

    const { fromLabel, toLabel } = getTxDisplayNames(tx, user);

    // ── Background & border ──
    doc.setFillColor(...dark);
    doc.rect(0, 0, 210, 297, "F");
    doc.setDrawColor(...gold);
    doc.setLineWidth(1);
    doc.rect(10, 10, 190, 277);

    // ── Decorative top accent ──
    doc.setFillColor(...gold);
    doc.rect(10, 10, 190, 4, "F");

    // ── Header ──
    doc.setTextColor(...gold);
    doc.setFontSize(38);
    doc.setFont("helvetica", "bold");
    doc.text("SALVA", 105, 38, { align: "center" });

    doc.setFontSize(8);
    doc.setTextColor(180, 180, 180);
    doc.setFont("helvetica", "normal");
    doc.text("OFFICIAL TRANSACTION RECEIPT", 105, 46, { align: "center" });

    // ── Status ──
    if (isSuccessful) {
      doc.setTextColor(...green);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("✓  VERIFIED · BASE MAINNET", 105, 57, { align: "center" });
    } else {
      doc.setTextColor(...red);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("✗  TRANSACTION FAILED", 105, 57, { align: "center" });
    }

    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    doc.line(30, 64, 180, 64);

    // ── Amount ──
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("AMOUNT", 30, 76);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatNumber(tx.amount)} ${coinLabel}`, 30, 88);

    // ── Direction badge ──
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.setFont("helvetica", "normal");
    doc.text("TYPE", 155, 76, { align: "right" });
    if (isReceived) {
      doc.setTextColor(...green);
    } else {
      doc.setTextColor(...gold);
    }
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(isReceived ? "RECEIVED" : "SENT", 180, 88, { align: "right" });

    // ── Fee (only if non-zero) ──
    let yAfterAmount = 96;
    if (hasFee) {
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 130);
      doc.text(`NETWORK FEE: ${parseFloat(tx.fee).toFixed(tx.coin === "NGN" ? 0 : 3)} ${coinLabel}`, 30, yAfterAmount);
      yAfterAmount += 8;
    }

    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    doc.line(30, yAfterAmount, 180, yAfterAmount);

    // ── FROM ──
    const fromY = yAfterAmount + 12;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("FROM", 30, fromY);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    // Truncate long addresses to fit
    const fromDisplay = fromLabel.length > 38 ? fromLabel.slice(0, 36) + "…" : fromLabel;
    doc.text(fromDisplay, 30, fromY + 10);

    // Raw address below if it's a wallet address display
    if (!isReceived && user.safeAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(user.safeAddress, 30, fromY + 17);
    } else if (isReceived && tx.fromAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(tx.fromAddress, 30, fromY + 17);
    }

    // ── TO ──
    const toY = fromY + 28;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("TO", 30, toY);

    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    const toDisplay = toLabel.length > 38 ? toLabel.slice(0, 36) + "…" : toLabel;
    doc.text(toDisplay, 30, toY + 10);

    // Raw address below
    if (isReceived && user.safeAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(user.safeAddress, 30, toY + 17);
    } else if (!isReceived && tx.toAddress) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(80, 80, 80);
      doc.text(tx.toAddress, 30, toY + 17);
    }

    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.3);
    const divY = toY + 26;
    doc.line(30, divY, 180, divY);

    // ── Date & Time ──
    const dateY = divY + 12;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("DATE & TIME", 30, dateY);

    const date    = new Date(tx.date);
    const dateStr = date.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const timeStr = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });

    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text(dateStr, 30, dateY + 9);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(180, 180, 180);
    doc.text(timeStr, 30, dateY + 17);

    // ── Network ──
    const netY = dateY + 28;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(130, 130, 130);
    doc.text("NETWORK", 30, netY);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Base Mainnet", 30, netY + 9);

    // ── Transaction Hash ──
    if (tx.taskId) {
      const hashY = netY + 20;
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(130, 130, 130);
      doc.text("TRANSACTION HASH", 30, hashY);

      doc.setFontSize(7);
      doc.setTextColor(...gold);
      const hash = tx.taskId;
      const half = Math.ceil(hash.length / 2);
      doc.text(hash.slice(0, half), 30, hashY + 8);
      doc.text(hash.slice(half), 30, hashY + 14);
    }

    // ── Footer ──
    doc.setFillColor(...gold);
    doc.rect(10, 273, 190, 4, "F");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text(`Receipt ID: ${tx._id || "SALVA-" + Date.now()}`, 105, 270, { align: "center" });
    doc.text("salva-nexus.org", 105, 280, { align: "center" });

    doc.save(`Salva_Receipt_${Date.now()}.pdf`);
    showMsg("Receipt downloaded!");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-32 px-6 relative overflow-hidden font-sans">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-salvaGold hover:opacity-60 mb-8 font-bold"
        >
          ← Back to Dashboard
        </Link>

        <header className="mb-12">
          <h1 className="text-sm uppercase tracking-[0.4em] text-salvaGold font-bold mb-2">
            Transaction Vault
          </h1>
          <h2 className="text-4xl font-black tracking-tighter">{user.username}</h2>
        </header>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : Object.keys(groupedTxs).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(groupedTxs)
              .sort()
              .reverse()
              .map(([year, months]) => (
                <div key={year} className="mb-4">
                  <button onClick={() => toggle(year)} className="w-full flex items-center gap-4 mb-2">
                    <span className="h-[1px] flex-1 bg-salvaGold/20" />
                    <span className="text-2xl font-black text-salvaGold/40">{year}</span>
                    <span className={`transition-transform ${expanded[year] ? "rotate-180" : ""}`}>▼</span>
                  </button>

                  {expanded[year] && (
                    <div className="pl-2 sm:pl-6 space-y-4 border-l border-salvaGold/10 ml-2">
                      {Object.entries(months).map(([month, days]) => {
                        const monthKey = `${year}-${month}`;
                        return (
                          <div key={monthKey}>
                            <button
                              onClick={() => toggle(monthKey)}
                              className="w-full flex justify-between items-center p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 hover:border-salvaGold/20"
                            >
                              <h3 className="text-lg font-bold">{month}</h3>
                              <span className="text-xs opacity-40">
                                {Object.values(days).flat().length} TXs
                              </span>
                            </button>

                            {expanded[monthKey] && (
                              <div className="mt-3 space-y-3 pl-2 sm:pl-4">
                                {Object.entries(days).map(([dayKey, dayTxs]) => (
                                  <div key={dayKey} className="border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden">
                                    <button
                                      onClick={() => toggle(dayKey)}
                                      className="w-full p-4 flex justify-between items-center bg-white dark:bg-zinc-900/50 hover:bg-salvaGold/5"
                                    >
                                      <span className="text-sm font-black text-salvaGold">{dayKey}</span>
                                      <svg
                                        className={`w-4 h-4 transition-transform ${expanded[dayKey] ? "rotate-180" : ""}`}
                                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>

                                    {expanded[dayKey] && (
                                      <div className="p-3 space-y-2 bg-gray-50 dark:bg-black/20">
                                        {dayTxs.map((tx, i) => {
                                          const isSuccessful = tx.displayType === "sent" || tx.displayType === "receive";
                                          const isReceived   = tx.displayType === "receive";
                                          const isFailed     = tx.displayType === "failed";

                                          const { fromLabel, toLabel } = getTxDisplayNames(tx, user);
                                          const coinLabel = tx.coin === "NGN" ? "NGNs" : (tx.coin || "NGNs");
                                          const hasFee    = tx.fee && parseFloat(tx.fee) > 0;

                                          const iconBg = isReceived
                                            ? "bg-green-500/10 text-green-400"
                                            : isFailed
                                              ? "bg-red-500/10 text-red-400"
                                              : "bg-blue-500/10 text-blue-400";

                                          const amountColor = isReceived
                                            ? "text-green-500"
                                            : isFailed
                                              ? "text-red-400 opacity-60"
                                              : "text-white";

                                          return (
                                            <motion.div
                                              key={tx._id || i}
                                              initial={{ opacity: 0 }}
                                              animate={{ opacity: 1 }}
                                              className="p-4 rounded-xl bg-white dark:bg-white/5 border border-white/5 flex flex-col gap-3"
                                            >
                                              {/* Top row: icon + from/to + amount */}
                                              <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${iconBg}`}>
                                                    {isSuccessful ? "✓" : "✗"}
                                                  </div>
                                                  <div className="min-w-0 flex-1">
                                                    {/* FROM */}
                                                    <div className="flex items-baseline gap-1.5 min-w-0">
                                                      <span className="text-[9px] uppercase opacity-40 font-bold flex-shrink-0">From</span>
                                                      <p className="text-xs font-black text-salvaGold truncate">{fromLabel}</p>
                                                    </div>
                                                    {/* TO */}
                                                    <div className="flex items-baseline gap-1.5 min-w-0 mt-0.5">
                                                      <span className="text-[9px] uppercase opacity-40 font-bold flex-shrink-0">To</span>
                                                      <p className="text-xs font-bold opacity-70 truncate">{toLabel}</p>
                                                    </div>
                                                    {/* Status + time */}
                                                    <p className={`text-[9px] font-bold uppercase tracking-widest mt-1 ${isFailed ? "text-red-400" : "opacity-30"}`}>
                                                      {isFailed ? "Failed" : isReceived ? "Received" : "Sent"}
                                                      {" · "}
                                                      {new Date(tx.date).toLocaleTimeString()}
                                                    </p>
                                                  </div>
                                                </div>

                                                {/* Amount */}
                                                <div className="flex-shrink-0 text-right">
                                                  <p className={`font-black text-lg leading-tight ${amountColor}`}>
                                                    {isReceived ? "+" : "-"}{formatNumber(tx.amount)}
                                                  </p>
                                                  <p className="text-[9px] font-bold opacity-40">{coinLabel}</p>
                                                </div>
                                              </div>

                                              {/* Fee row — only if fee > 0 */}
                                              {hasFee && (
                                                <div className="flex items-center justify-between px-1">
                                                  <span className="text-[9px] uppercase opacity-30 font-bold">Network fee</span>
                                                  <span className="text-[9px] text-red-400/70 font-black">
                                                    -{parseFloat(tx.fee).toFixed(tx.coin === "NGN" ? 0 : 3)} {coinLabel}
                                                  </span>
                                                </div>
                                              )}

                                              {/* Receipt button */}
                                              {isSuccessful && (
                                                <button
                                                  onClick={() => downloadReceipt(tx)}
                                                  className="w-full py-2 text-[10px] text-salvaGold font-black uppercase border border-salvaGold/20 rounded-xl hover:bg-salvaGold hover:text-black transition-all"
                                                >
                                                  Download Receipt
                                                </button>
                                              )}
                                            </motion.div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ) : (
          <div className="text-center py-24">
            <span className="text-4xl mb-4 block">📭</span>
            <h3 className="text-xl font-bold">No Records Found</h3>
            <Link to="/dashboard" className="text-salvaGold text-sm underline mt-4 block">
              Return to Dashboard
            </Link>
          </div>
        )}
      </div>

      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 50, opacity: 0 }}
            className="fixed bottom-10 right-10 bg-salvaGold text-black p-4 rounded-xl font-black text-xs uppercase z-[100] shadow-2xl"
          >
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Transactions;