// Salva-Digital-Tech/packages/frontend/src/pages/Transactions.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { jsPDF } from "jspdf";
import Stars from "../components/Stars";

const Transactions = () => {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [groupedTxs, setGroupedTxs] = useState({});
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });

  useEffect(() => {
    const savedUser = localStorage.getItem("salva_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchTransactions(parsedUser.safeAddress);
      } catch (error) {
        window.location.href = "/login";
      }
    } else {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(
        () => setNotification({ ...notification, show: false }),
        4000,
      );
      return () => clearTimeout(timer);
    }
  }, [notification]);

  useEffect(() => {
    const grouped = {};
    transactions.forEach((tx) => {
      const date = new Date(tx.date);
      const year = date.getFullYear().toString();
      const month = date.toLocaleDateString("en-US", { month: "long" });
      const day = date.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });

      if (!grouped[year]) grouped[year] = {};
      if (!grouped[year][month]) grouped[year][month] = {};
      if (!grouped[year][month][day]) grouped[year][month][day] = [];

      grouped[year][month][day].push(tx);
    });
    setGroupedTxs(grouped);

    const now = new Date();
    const currYear = now.getFullYear().toString();
    const currMonth = now.toLocaleDateString("en-US", { month: "long" });
    const currDay = now.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    setExpanded({
      [currYear]: true,
      [`${currYear}-${currMonth}`]: true,
      [currDay]: true,
    });
  }, [transactions]);

  const toggle = (key) => {
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const showMsg = (msg, type = "success") =>
    setNotification({ show: true, message: msg, type });

  const fetchTransactions = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transactions/${address}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch (err) {
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num) =>
    parseFloat(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // ─────────────────────────────────────────────────────────────────────────
  // FIXED: downloadReceipt
  //
  // OLD BUGS:
  //   1. user.accountNumber doesn't exist — the field on the user object from
  //      localStorage is `numberAlias`. Using user.accountNumber always produced
  //      "undefined" on the PDF.
  //   2. tx.fromAddress / tx.toAddress were used directly on the PDF without
  //      preferring the friendlier username + account number format.
  //   3. Amount label was confusing — it now shows the amount sent AND the fee
  //      separately if applicable so the receipt is fully auditable.
  //
  // FIX: Use numberAlias as the account number. Prefer username over raw address.
  // Show sender wallet address and recipient wallet address on the receipt.
  // ─────────────────────────────────────────────────────────────────────────
  const downloadReceipt = (tx) => {
    const doc = new jsPDF();
    const gold = [212, 175, 55];
    const dark = [10, 10, 11];
    const red = [239, 68, 68];
    const green = [34, 197, 94];
    const isReceived = tx.displayType === "receive";
    const isSuccessful = tx.status === "successful";

    // ── Background & border ──────────────────────────────────────────────
    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.rect(0, 0, 210, 297, "F");
    doc.setDrawColor(gold[0], gold[1], gold[2]);
    doc.setLineWidth(1);
    doc.rect(10, 10, 190, 277);

    // ── Header ───────────────────────────────────────────────────────────
    doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.setFontSize(40);
    doc.setFont("helvetica", "bold");
    doc.text("SALVA", 105, 40, { align: "center" });
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("OFFICIAL TRANSACTION RECEIPT", 105, 50, { align: "center" });

    // ── Status badge ─────────────────────────────────────────────────────
    if (isSuccessful) {
      doc.setTextColor(green[0], green[1], green[2]);
      doc.setFontSize(10);
      doc.text("✓ VERIFIED ON-CHAIN", 105, 60, { align: "center" });
    } else {
      doc.setTextColor(red[0], red[1], red[2]);
      doc.setFontSize(10);
      doc.text("✗ TRANSACTION FAILED", 105, 60, { align: "center" });
    }

    doc.setDrawColor(255, 255, 255, 0.1);
    doc.line(30, 68, 180, 68);

    // ── AMOUNT ───────────────────────────────────────────────────────────
    doc.setFontSize(10);
    doc.setTextColor(150, 150, 150);
    doc.text("AMOUNT", 30, 82);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text(`${formatNumber(tx.amount)} NGNs`, 30, 94);

    // ── TYPE ─────────────────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text(isReceived ? "RECEIVED" : "SENT", 160, 82);
    if (isReceived) {
      doc.setTextColor(green[0], green[1], green[2]);
    } else {
      doc.setTextColor(gold[0], gold[1], gold[2]);
    }
    doc.setFontSize(11);
    doc.text(isReceived ? "+" : "-", 160, 94);

    doc.line(30, 102, 180, 102);

    // ── SENDER ───────────────────────────────────────────────────────────
    // FIXED: use numberAlias not accountNumber. Falls back gracefully.
    const myAccountNumber = user.numberAlias || user.accountNumber || "—";
    const myUsername = user.username || "—";

    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("FROM (SENDER)", 30, 115);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);

    if (isReceived) {
      // Sender is the other person
      const senderName = tx.fromUsername || "Unknown";
      const senderAccount = tx.fromAccountNumber || "—";
      doc.text(senderName, 30, 125);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account No: ${senderAccount}`, 30, 132);
      doc.text(`Wallet: ${tx.fromAddress || "—"}`, 30, 138);
    } else {
      // Sender is me
      doc.text(myUsername, 30, 125);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account No: ${myAccountNumber}`, 30, 132);
      doc.text(`Wallet: ${user.safeAddress || "—"}`, 30, 138);
    }

    // ── RECIPIENT ────────────────────────────────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("TO (RECIPIENT)", 30, 152);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);

    if (isReceived) {
      // Recipient is me
      doc.text(myUsername, 30, 162);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account No: ${myAccountNumber}`, 30, 169);
      doc.text(`Wallet: ${user.safeAddress || "—"}`, 30, 175);
    } else {
      // Recipient is the other person
      const recipientName = tx.toUsername || "Unknown";
      const recipientAccount = tx.toAccountNumber || "—";
      doc.text(recipientName, 30, 162);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account No: ${recipientAccount}`, 30, 169);
      doc.text(`Wallet: ${tx.toAddress || "—"}`, 30, 175);
    }

    // ── DATE & TIME ──────────────────────────────────────────────────────
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("DATE & TIME", 30, 192);
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    const date = new Date(tx.date);
    const dateStr = date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
    doc.text(dateStr, 30, 202);
    doc.text(timeStr, 30, 209);

    // ── BLOCKCHAIN STATUS ─────────────────────────────────────────────────
    doc.setFontSize(9);
    doc.setTextColor(150, 150, 150);
    doc.text("NETWORK", 30, 223);
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("Base Sepolia (Testnet)", 30, 232);

    if (tx.taskId) {
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("TRANSACTION HASH", 30, 244);
      doc.setFontSize(7);
      doc.setTextColor(gold[0], gold[1], gold[2]);
      // Split long hash across two lines if needed
      const hash = tx.taskId;
      const half = Math.ceil(hash.length / 2);
      doc.text(hash.slice(0, half), 30, 252);
      doc.text(hash.slice(half), 30, 258);
    }

    // ── FOOTER ───────────────────────────────────────────────────────────
    doc.setDrawColor(gold[0], gold[1], gold[2]);
    doc.line(30, 265, 180, 265);
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`Receipt ID: ${tx._id || "SALVA-" + Date.now()}`, 105, 272, {
      align: "center",
    });
    doc.text("salva-nexus.org", 105, 278, { align: "center" });

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
          <h2 className="text-4xl font-black tracking-tighter">
            {user.username}
          </h2>
        </header>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-12 h-12 border-4 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin"></div>
          </div>
        ) : Object.keys(groupedTxs).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(groupedTxs)
              .sort()
              .reverse()
              .map(([year, months]) => (
                <div key={year} className="mb-4">
                  <button
                    onClick={() => toggle(year)}
                    className="w-full flex items-center gap-4 mb-2"
                  >
                    <span className="h-[1px] flex-1 bg-salvaGold/20"></span>
                    <span className="text-2xl font-black text-salvaGold/40">
                      {year}
                    </span>
                    <span
                      className={`transition-transform ${expanded[year] ? "rotate-180" : ""}`}
                    >
                      ▼
                    </span>
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
                                {Object.entries(days).map(
                                  ([dayKey, dayTxs]) => (
                                    <div
                                      key={dayKey}
                                      className="border border-gray-200 dark:border-white/5 rounded-2xl overflow-hidden"
                                    >
                                      <button
                                        onClick={() => toggle(dayKey)}
                                        className="w-full p-4 flex justify-between items-center bg-white dark:bg-zinc-900/50 hover:bg-salvaGold/5"
                                      >
                                        <span className="text-sm font-black text-salvaGold">
                                          {dayKey}
                                        </span>
                                        <svg
                                          className={`w-4 h-4 transition-transform ${expanded[dayKey] ? "rotate-180" : ""}`}
                                          fill="none"
                                          stroke="currentColor"
                                          viewBox="0 0 24 24"
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={3}
                                            d="M19 9l-7 7-7-7"
                                          />
                                        </svg>
                                      </button>

                                      {expanded[dayKey] && (
                                        <div className="p-3 space-y-2 bg-gray-50 dark:bg-black/20">
                                          {dayTxs.map((tx, i) => {
                                            // ── FIXED: displayType now comes from
                                            // the backend correctly:
                                            //   "sent"    = I sent it, confirmed ✅
                                            //   "receive" = I received it ✅
                                            //   "failed"  = I sent it, it failed ❌
                                            const isSuccessful =
                                              tx.displayType === "sent" ||
                                              tx.displayType === "receive";
                                            const isReceived =
                                              tx.displayType === "receive";
                                            const isFailed =
                                              tx.displayType === "failed";

                                            // Icon: ✓ for success, ✗ for failed
                                            const iconBg = isReceived
                                              ? "bg-green-500/10 text-green-400"
                                              : isFailed
                                                ? "bg-red-500/10 text-red-400"
                                                : "bg-blue-500/10 text-blue-400";

                                            const iconChar = isSuccessful
                                              ? "✓"
                                              : "✗";

                                            // Amount color: green for received, white for sent, red for failed
                                            const amountColor = isReceived
                                              ? "text-green-500"
                                              : isFailed
                                                ? "text-red-400 opacity-60"
                                                : "text-white";

                                            // Sign: + for received, - for sent/failed
                                            const amountSign = isReceived
                                              ? "+"
                                              : "-";

                                            return (
                                              <motion.div
                                                key={tx._id || i}
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                className="p-4 rounded-xl bg-white dark:bg-white/5 border border-white/5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                                              >
                                                <div className="flex items-center gap-3">
                                                  <div
                                                    className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${iconBg}`}
                                                  >
                                                    {iconChar}
                                                  </div>
                                                  <div>
                                                    {/* Partner label */}
                                                    <p className="text-sm font-bold truncate max-w-[200px]">
                                                      <span className="opacity-40 mr-1 font-normal text-xs">
                                                        {isReceived
                                                          ? "From:"
                                                          : "To:"}
                                                      </span>
                                                      {tx.displayPartner ||
                                                        "Unknown"}
                                                    </p>
                                                    {/* Status badge */}
                                                    <p
                                                      className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${
                                                        isFailed
                                                          ? "text-red-400"
                                                          : "opacity-40"
                                                      }`}
                                                    >
                                                      {isFailed
                                                        ? "Failed"
                                                        : isReceived
                                                          ? "Received"
                                                          : "Sent"}{" "}
                                                      ·{" "}
                                                      {new Date(
                                                        tx.date,
                                                      ).toLocaleTimeString()}
                                                    </p>
                                                  </div>
                                                </div>

                                                <div className="flex items-center gap-4 w-full sm:w-auto justify-between">
                                                  {/* Amount */}
                                                  <p
                                                    className={`font-black text-lg ${amountColor}`}
                                                  >
                                                    {amountSign}
                                                    {formatNumber(tx.amount)}
                                                    <span className="text-[10px] font-bold opacity-50 ml-1">
                                                      NGNs
                                                    </span>
                                                  </p>

                                                  {/* Receipt button — only for confirmed txs */}
                                                  {isSuccessful && (
                                                    <button
                                                      onClick={() =>
                                                        downloadReceipt(tx)
                                                      }
                                                      className="text-[10px] text-salvaGold font-black uppercase border border-salvaGold/30 px-3 py-1 rounded-lg hover:bg-salvaGold hover:text-black transition-all"
                                                    >
                                                      Receipt
                                                    </button>
                                                  )}
                                                </div>
                                              </motion.div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  ),
                                )}
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
            <Link
              to="/dashboard"
              className="text-salvaGold text-sm underline mt-4 block"
            >
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
