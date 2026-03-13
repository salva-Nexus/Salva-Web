// Salva-Digital-Tech/packages/backend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import Stars from "../components/Stars";

const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [transactions, setTransactions] = useState([]);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [transferData, setTransferData] = useState({ to: "", amount: "" });
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });
  const [amountError, setAmountError] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState("activity");
  const [approveData, setApproveData] = useState({ spender: "", amount: "" });
  const [transferFromData, setTransferFromData] = useState({
    from: "",
    to: "",
    amount: "",
  });
  const [approvals, setApprovals] = useState([]);
  const [incomingAllowances, setIncomingAllowances] = useState([]);
  const [isRefreshingApprovals, setIsRefreshingApprovals] = useState(false);

  // Confirmation modal state
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  // Registry dropdown state
  const [registries, setRegistries] = useState([]);
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [showRegistryDropdown, setShowRegistryDropdown] = useState(false);
  // Approve registry
  const [approveRegistry, setApproveRegistry] = useState(null);
  const [showApproveRegistryDropdown, setShowApproveRegistryDropdown] = useState(false);
  // TransferFrom registries
  const [fromRegistry, setFromRegistry] = useState(null);
  const [showFromRegistryDropdown, setShowFromRegistryDropdown] = useState(false);
  const [toRegistry, setToRegistry] = useState(null);
  const [showToRegistryDropdown, setShowToRegistryDropdown] = useState(false);
  // Fee preview
  const [feePreview, setFeePreview] = useState({ feeNGN: 0, recipientReceives: null });
  const [feeConfig, setFeeConfig] = useState(null);

  // PIN VERIFICATION STATE
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [pendingTransaction, setPendingTransaction] = useState(null);
  const [decryptedPrivateKey, setDecryptedPrivateKey] = useState(null);
  const [noPinWarning, setNoPinWarning] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");

  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem("salva_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchBalance(parsedUser.safeAddress);
        fetchTransactions(parsedUser.safeAddress);
        fetchApprovals(parsedUser.safeAddress);
        fetchIncomingAllowances(parsedUser.safeAddress);
        const interval = setInterval(() => {
          fetchTransactions(parsedUser.safeAddress);
          fetchApprovals(parsedUser.safeAddress, true);
          fetchIncomingAllowances(parsedUser.safeAddress, true);
        }, 30000);
        return () => clearInterval(interval);
      } catch (error) {
        window.location.href = "/login";
      }
    } else {
      window.location.href = "/login";
    }
  }, []);

  // Check PIN status and account lock on mount
  useEffect(() => {
    const checkAccountStatus = async () => {
      if (user && (user.email || user.username)) {
        try {
          const identifier = user.email || user.username;
          const res = await fetch(
            `${SALVA_API_URL}/api/user/pin-status/${identifier}`,
          );
          const data = await res.json();

          if (!data.hasPin) {
            setNoPinWarning(true);
          }

          if (data.isLocked) {
            setIsAccountLocked(true);
            const hoursLeft = Math.ceil(
              (new Date(data.lockedUntil) - new Date()) / (1000 * 60 * 60),
            );
            setLockMessage(`Account locked for ${hoursLeft} more hours`);
          }
        } catch (err) {
          console.error("Failed to check account status");
        }
      }
    };

    if (user) {
      checkAccountStatus();
    }
  }, [user]);

  // Fetch registries and fee config on mount
  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const [regRes, feeRes] = await Promise.all([
          fetch(`${SALVA_API_URL}/api/registries`),
          fetch(`${SALVA_API_URL}/api/fee-config`),
        ]);
        const regData = await regRes.json();
        const feeData = await feeRes.json();
        setRegistries(Array.isArray(regData) ? regData : []);
        setFeeConfig(feeData);
      } catch (err) {
        console.error("Failed to fetch registries/fee config");
      }
    };
    fetchMeta();
  }, []);

  // Compute fee preview whenever amount changes
  const computeFeePreview = (amount) => {
    if (!feeConfig || !amount)
      return setFeePreview({ feeNGN: 0, recipientReceives: null });
    const amt = parseFloat(amount);
    if (isNaN(amt)) return;
    let fee = 0;
    if (amt >= feeConfig.tier2Min) fee = feeConfig.tier2Fee;
    else if (amt >= feeConfig.tier1Min && amt <= feeConfig.tier1Max)
      fee = feeConfig.tier1Fee;
    setFeePreview({ feeNGN: fee, recipientReceives: fee > 0 ? amt - fee : amt });
  };

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
    if (transferData.amount && balance) {
      const amt = parseFloat(transferData.amount);
      const bal = parseFloat(balance);
      setAmountError(amt > bal);
    } else {
      setAmountError(false);
    }
  }, [transferData.amount, balance]);

  const showMsg = (msg, type = "success") =>
    setNotification({ show: true, message: msg, type });

  const fetchBalance = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      const data = await res.json();
      setBalance(parseFloat(data.balance || 0).toFixed(2));
    } catch {
      setBalance("0.00");
    }
  };

  const fetchTransactions = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transactions/${address}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data : []);
    } catch {
      setTransactions([]);
    }
  };

  const fetchApprovals = async (address, silent = false) => {
    if (!silent) setIsRefreshingApprovals(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/approvals/${address}`);
      const data = await res.json();
      setApprovals(data);
    } catch (err) {
      console.error("Failed to load list");
    } finally {
      setIsRefreshingApprovals(false);
    }
  };

  const fetchIncomingAllowances = async (address, silent = false) => {
    if (!silent) setIsRefreshingApprovals(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/allowances-for/${address}`);
      const data = await res.json();
      setIncomingAllowances(data);
    } catch (err) {
      console.error("Failed to load incoming allowances");
    } finally {
      setIsRefreshingApprovals(false);
    }
  };

  const formatNumber = (num) =>
    parseFloat(num).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const downloadReceipt = (e, tx) => {
    e.stopPropagation();
    const doc = new jsPDF();
    const gold = [212, 175, 55];
    const dark = [10, 10, 11];
    const red = [239, 68, 68];
    const isReceived = tx.displayType === "receive";
    const isSuccessful = tx.status === "successful";

    doc.setFillColor(dark[0], dark[1], dark[2]);
    doc.rect(0, 0, 210, 297, "F");
    doc.setDrawColor(gold[0], gold[1], gold[2]);
    doc.setLineWidth(1);
    doc.rect(10, 10, 190, 277);
    doc.setTextColor(gold[0], gold[1], gold[2]);
    doc.setFontSize(40);
    doc.setFont("helvetica", "bold");
    doc.text("SALVA", 105, 45, { align: "center" });
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("OFFICIAL TRANSACTION RECEIPT", 105, 55, { align: "center" });
    doc.setDrawColor(255, 255, 255, 0.1);
    doc.line(30, 65, 180, 65);

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text("AMOUNT TRANSFERRED", 40, 90);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.text(`${formatNumber(tx.amount)} NGNs`, 40, 102);

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text("FROM (SENDER)", 40, 125);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);

    if (isReceived) {
      const senderName = tx.fromUsername || "Unknown";
      const senderAccount = tx.fromAccountNumber || tx.fromAddress;
      doc.text(senderName, 40, 135);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account: ${senderAccount}`, 40, 142);
    } else {
      doc.text(user.username, 40, 135);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account: ${user.accountNumber}`, 40, 142);
    }

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text("TO (RECIPIENT)", 40, 160);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);

    if (isReceived) {
      doc.text(user.username, 40, 170);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account: ${user.accountNumber}`, 40, 177);
    } else {
      const recipientName = tx.toUsername || "Unknown";
      const recipientAccount = tx.toAccountNumber || tx.toAddress;
      doc.text(recipientName, 40, 170);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Account: ${recipientAccount}`, 40, 177);
    }

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text("DATE & TIME", 40, 195);
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    const date = new Date(tx.date);
    const dateStr = date.toLocaleDateString();
    const timeStr = date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    doc.text(`${dateStr} ${timeStr}`, 40, 205);

    doc.setFontSize(12);
    doc.setTextColor(150, 150, 150);
    doc.text("BLOCKCHAIN STATUS", 40, 225);
    doc.setFontSize(14);

    if (isSuccessful) {
      doc.setTextColor(gold[0], gold[1], gold[2]);
      doc.text("VERIFIED ON-CHAIN (BASE SEPOLIA)", 40, 237);
    } else {
      doc.setTextColor(red[0], red[1], red[2]);
      doc.text("FAILED ON-CHAIN", 40, 237);
    }

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`REF: ${tx._id || "SALVA-TX"}`, 105, 270, { align: "center" });

    doc.save(`Salva_Receipt_${Date.now()}.pdf`);
    showMsg("Professional receipt downloaded!");
  };

  const resolveAndConfirm = async (accountInput, amount, action, registryAddr = null) => {
    if (!accountInput || !amount) {
      return showMsg("Please fill all fields", "error");
    }

    if (/^\d+$/.test(accountInput.trim()) && !registryAddr) {
      return showMsg("Please select a wallet from the dropdown", "error");
    }

    setLoading(true);

    try {
      const response = await fetch(`${SALVA_API_URL}/api/resolve-account-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumberOrAddress: accountInput }),
      });

      const data = await response.json();

      if (!data.found) {
        setLoading(false);
        return showMsg("Account not found or invalid", "error");
      }

      setConfirmationData({
        username: data.username,
        accountNumber: data.accountNumber,
        amount: amount,
        originalInput: accountInput,
        registryAddress: registryAddr,
        feeNGN: feePreview.feeNGN,
        recipientReceives: feePreview.recipientReceives ?? parseFloat(amount),
      });
      setPendingAction(action);
      setIsConfirmModalOpen(true);
    } catch (err) {
      showMsg("Failed to resolve account", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleTransferClick = () => {
    if (isAccountLocked) return showMsg(lockMessage, "error");
    if (noPinWarning) return;
    setIsSendOpen(true);
  };

  const verifyPinAndProceed = async () => {
    if (transactionPin.length !== 4) {
      return showMsg("PIN must be 4 digits", "error");
    }

    setLoading(true);

    try {
      const identifier = user.email || user.username;

      const response = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: identifier, pin: transactionPin }),
      });

      const data = await response.json();

      if (response.ok) {
        setDecryptedPrivateKey(data.privateKey);
        setIsPinModalOpen(false);

        if (pendingTransaction === "send") {
          executeTransfer(data.privateKey);
        } else if (pendingTransaction === "approve") {
          executeApproval(data.privateKey);
        } else if (pendingTransaction === "transferFrom") {
          executeTransferFrom(data.privateKey);
        }
      } else {
        setPinAttempts((prev) => prev + 1);

        if (pinAttempts >= 2) {
          showMsg("Too many failed attempts. Redirecting to settings...", "error");
          setTimeout(() => navigate("/account-settings"), 2000);
        } else {
          showMsg(`Invalid PIN. ${3 - pinAttempts - 1} attempts remaining`, "error");
        }
      }
    } catch (err) {
      showMsg("Network error", "error");
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async (privateKey) => {
    if (amountError) return showMsg("Insufficient balance", "error");

    setLoading(true);
    showMsg("Transaction queued, waiting for confirmation...", "info");

    try {
      const response = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: transferData.to,
          amount: transferData.amount,
          registryAddress: confirmationData?.registryAddress || null,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showMsg("Transfer Successful!");
        setIsSendOpen(false);
        setTransferData({ to: "", amount: "" });
        setSelectedRegistry(null);
        setShowRegistryDropdown(false);
        setTimeout(() => {
          fetchBalance(user.safeAddress);
          fetchTransactions(user.safeAddress);
        }, 3500);
      } else {
        showMsg(data.message || "Transfer failed", "error");
      }
    } catch (err) {
      showMsg("Network error", "error");
    } finally {
      setLoading(false);
      setPendingTransaction(null);
    }
  };

  const executeApproval = async (privateKey) => {
    setLoading(true);

    try {
      const response = await fetch(`${SALVA_API_URL}/api/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          spenderInput: approveData.spender,
          amount: approveData.amount,
          registryAddress: approveRegistry?.registryAddress || null,
        }),
      });

      if (response.ok) {
        showMsg("Approval updated on-chain!");
        setApproveData({ spender: "", amount: "" });
        setApproveRegistry(null);
        setShowApproveRegistryDropdown(false);
        setTimeout(() => {
          fetchApprovals(user.safeAddress);
          fetchIncomingAllowances(user.safeAddress, true);
        }, 4000);
      } else {
        showMsg("Approval failed", "error");
      }
    } catch (err) {
      showMsg("Connection error", "error");
    } finally {
      setLoading(false);
      setPendingTransaction(null);
    }
  };

  const executeTransferFrom = async (privateKey) => {
    setLoading(true);

    try {
      const response = await fetch(`${SALVA_API_URL}/api/transferFrom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          fromInput: transferFromData.from,
          toInput: transferFromData.to,
          amount: transferFromData.amount,
          fromRegistry: fromRegistry?.registryAddress || null,
          toRegistry: toRegistry?.registryAddress || null,
        }),
      });

      const result = await response.json();

      if (response.ok) {
        showMsg("Pull queued, waiting for confirmation...");
        setTransferFromData({ from: "", to: "", amount: "" });
        setFromRegistry(null);
        setToRegistry(null);
        setShowFromRegistryDropdown(false);
        setShowToRegistryDropdown(false);
        setTimeout(() => {
          fetchBalance(user.safeAddress);
          fetchTransactions(user.safeAddress);
          fetchApprovals(user.safeAddress, true);
          fetchIncomingAllowances(user.safeAddress, true);
        }, 7000);
      } else {
        showMsg(result.message || "TransferFrom REVERTED", "error");
      }
    } catch (err) {
      showMsg("Network Error: Pull failed", "error");
    } finally {
      setLoading(false);
      setPendingTransaction(null);
    }
  };

  const handleAutofillFromAllowance = (allowance) => {
    setTransferFromData({
      from: allowance.allower,
      to: allowance.spenderDisplay,
      amount: allowance.amount,
    });
    showMsg("Form autofilled from allowance", "success");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-12">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-salvaGold font-bold">
              Salva Citizen
            </p>
            <h2 className="text-3xl sm:text-4xl font-black truncate max-w-[200px] sm:max-w-none">
              {user.username}
            </h2>
          </div>
          <div className="bg-gray-100 dark:bg-white/5 p-4 rounded-2xl w-full sm:w-auto">
            <p className="text-[10px] uppercase opacity-40 font-bold">
              Account Number
            </p>
            <p className="font-mono font-bold text-salvaGold text-sm sm:text-base">
              {showBalance ? user.accountNumber : "••••••••••"}
            </p>
          </div>
        </header>

        {/* ── Balance Card ── */}
        <div className="rounded-3xl bg-gray-100 dark:bg-black p-6 sm:p-10 mb-8 border border-white/5 shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <p className="uppercase text-[10px] sm:text-xs opacity-40 font-bold tracking-widest">
              Available Balance
            </p>
            <button
              onClick={() => setShowBalance(!showBalance)}
              className="hover:scale-110 transition-transform p-2"
            >
              {showBalance ? "👁" : "👁‍🗨"}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 overflow-hidden">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter leading-none whitespace-nowrap">
              {showBalance ? formatNumber(balance) : "••••••.••"}
            </h1>
            <span className="text-salvaGold text-xl sm:text-2xl font-black mt-1 sm:mt-0">
              NGNs
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-8 sm:mt-10">
            <button
              onClick={handleTransferClick}
              className="bg-salvaGold hover:bg-yellow-600 transition-colors text-black font-black py-4 rounded-2xl shadow-lg shadow-salvaGold/20 text-sm sm:text-base"
            >
              SEND
            </button>
            <button
              onClick={() => {
                navigator.clipboard.writeText(user.accountNumber);
                showMsg("Account number copied!");
              }}
              className="border border-salvaGold/30 hover:bg-white/5 transition-all py-4 rounded-2xl font-bold text-sm sm:text-base"
            >
              RECEIVE
            </button>
          </div>
        </div>

        {/* ── Wallet Address ── */}
        <div
          onClick={() => {
            navigator.clipboard.writeText(user.safeAddress);
            showMsg("Wallet address copied!");
          }}
          className="mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:border-salvaGold/30 transition-all"
        >
          <p className="text-[10px] uppercase opacity-40 font-bold mb-1 tracking-widest">
            Smart Wallet Address (Base)
          </p>
          <p className="font-mono text-[10px] sm:text-xs text-salvaGold font-medium break-all truncate">
            {showBalance
              ? user.safeAddress
              : "0x••••••••••••••••••••••••••••••••••••••••"}
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/10 mb-6 gap-8 overflow-x-auto no-scrollbar">
          {["activity", "approve", "transferFrom"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-2 text-[10px] uppercase tracking-widest font-black transition-all whitespace-nowrap ${
                activeTab === tab
                  ? "border-b-2 border-salvaGold text-salvaGold"
                  : "opacity-40 hover:opacity-100"
              }`}
            >
              {tab === "activity"
                ? "Recent Activity"
                : tab.replace(/([A-Z])/g, " $1")}
            </button>
          ))}
        </div>

        {/* ── Activity Tab ── */}
        {activeTab === "activity" && (
          <section className="px-1">
            <div className="flex justify-between items-end mb-6">
              <h3 className="uppercase tracking-widest text-salvaGold text-[10px] sm:text-xs font-bold">
                History
              </h3>
              <Link
                to="/transactions"
                className="text-[10px] uppercase tracking-tighter opacity-50 hover:opacity-100 transition-opacity font-bold underline"
              >
                View All
              </Link>
            </div>
            <div className="space-y-3">
              {transactions.length > 0 ? (
                transactions.slice(0, 5).map((tx, i) => (
                  <div
                    key={i}
                    onClick={() => navigate("/transactions")}
                    className="flex justify-between items-center p-4 border border-white/5 bg-white/5 rounded-2xl hover:border-salvaGold/40 cursor-pointer transition-all gap-4"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-sm sm:text-base truncate">
                        {tx.displayType === "receive"
                          ? `From: ${tx.fromUsername || tx.displayPartner}`
                          : `To: ${tx.toUsername || tx.displayPartner}`}
                      </p>
                      <p className="text-[10px] sm:text-xs opacity-40 font-medium uppercase">
                        {tx.displayType || "Transfer"}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p
                        className={`font-black text-sm sm:text-base ${
                          tx.displayType === "receive"
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {tx.displayType === "receive" ? "+" : "-"}
                        {formatNumber(tx.amount)}
                      </p>
                      <button
                        onClick={(e) => downloadReceipt(e, tx)}
                        className="relative z-20 text-[10px] text-salvaGold hover:underline font-bold uppercase tracking-tighter"
                      >
                        Receipt ↓
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-center py-10 opacity-30 text-xs font-medium uppercase tracking-widest">
                  Vault is empty
                </p>
              )}
            </div>
          </section>
        )}

        {/* ── Approve Tab ── */}
        {activeTab === "approve" && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
          >
            {/* Approve Form */}
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-white/5">
              <h4 className="text-salvaGold font-black text-xs mb-4 uppercase tracking-widest">
                Update Permission
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isAccountLocked) return showMsg(lockMessage, "error");
                  if (noPinWarning)
                    return showMsg(
                      "Please set transaction PIN in Account Settings",
                      "error",
                    );
                  resolveAndConfirm(
                    approveData.spender,
                    approveData.amount,
                    "approve",
                    approveRegistry?.registryAddress || null,
                  );
                }}
                className="space-y-4"
              >
                <input
                  required
                  placeholder="Spender Account or Address"
                  value={approveData.spender}
                  className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                  onChange={(e) => {
                    const val = e.target.value;
                    setApproveData({ ...approveData, spender: val });
                    setShowApproveRegistryDropdown(
                      /^\d+$/.test(val.trim()) && val.trim().length > 0,
                    );
                    if (!/^\d+$/.test(val.trim())) setApproveRegistry(null);
                  }}
                />
                {/* Approve Registry Dropdown */}
                {showApproveRegistryDropdown && registries.length > 0 && (
                  <select
                    value={approveRegistry?.registryAddress || ""}
                    onChange={(e) =>
                      setApproveRegistry(
                        registries.find(
                          (r) => r.registryAddress === e.target.value,
                        ) || null,
                      )
                    }
                    className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                  >
                    <option value="">-- Choose Wallet --</option>
                    {registries.map((reg) => (
                      <option key={reg.registryAddress} value={reg.registryAddress}>
                        {reg.name}
                      </option>
                    ))}
                  </select>
                )}
                <input
                  required
                  placeholder="Amount to Limit"
                  type="number"
                  value={approveData.amount}
                  className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                  onChange={(e) =>
                    setApproveData({ ...approveData, amount: e.target.value })
                  }
                />
                <button
                  disabled={loading}
                  className="w-full py-4 bg-salvaGold text-black font-black rounded-xl text-xs uppercase tracking-widest hover:brightness-110 transition-all"
                >
                  {loading ? "PROCESSING..." : "UPDATE PERMISSION"}
                </button>
              </form>
            </div>

            {/* Active Permissions List */}
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col h-full min-h-[350px]">
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h4 className="text-salvaGold font-black text-xs uppercase tracking-widest">
                  Active Permissions
                </h4>
                <button
                  onClick={() => fetchApprovals(user.safeAddress)}
                  className={`text-[10px] font-bold text-salvaGold hover:opacity-70 transition-all flex items-center gap-1 ${
                    isRefreshingApprovals ? "animate-pulse" : ""
                  }`}
                >
                  {isRefreshingApprovals ? "SYNCING..." : "REFRESH ↻"}
                </button>
              </div>
              <div
                className="flex-1 overflow-y-auto pr-2 no-scrollbar"
                style={{ maxHeight: "250px" }}
              >
                {approvals.length > 0 ? (
                  <div className="space-y-3">
                    {approvals.map((app, i) => (
                      <div
                        key={i}
                        className="flex justify-between items-center p-3 bg-black/20 rounded-xl border border-white/5"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-mono text-[10px] text-salvaGold truncate">
                            {app.displaySpender || app.spender}
                          </p>
                          <p className="text-[8px] uppercase opacity-40 font-bold">
                            Authorized Spender
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="font-black text-xs">
                            {formatNumber(app.amount)}
                          </p>
                          <button
                            onClick={() =>
                              setApproveData({
                                spender: app.displaySpender || app.spender,
                                amount: "0",
                              })
                            }
                            className="text-[8px] text-red-500 font-bold uppercase hover:underline"
                          >
                            Revoke
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-10 opacity-20">
                    <p className="text-center text-[10px] uppercase font-bold tracking-widest leading-loose">
                      No active
                      <br />
                      approvals found
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {/* ── TransferFrom Tab ── */}
        {activeTab === "transferFrom" && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start"
          >
            {/* TransferFrom Form */}
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-white/5 min-h-[350px]">
              <h4 className="text-salvaGold font-black text-xs mb-4 uppercase tracking-widest">
                Execute Approved Pull
              </h4>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (isAccountLocked) return showMsg(lockMessage, "error");
                  if (noPinWarning)
                    return showMsg(
                      "Please set transaction PIN in Account Settings",
                      "error",
                    );
                  resolveAndConfirm(
                    transferFromData.from,
                    transferFromData.amount,
                    "transferFrom",
                    fromRegistry?.registryAddress || null,
                  );
                }}
                className="space-y-4"
              >
                {/* From Input + Registry Dropdown */}
                <div className="space-y-2">
                  <input
                    required
                    placeholder="From (Account or Address)"
                    value={transferFromData.from}
                    className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransferFromData({ ...transferFromData, from: val });
                      setShowFromRegistryDropdown(
                        /^\d+$/.test(val.trim()) && val.trim().length > 0,
                      );
                      if (!/^\d+$/.test(val.trim())) setFromRegistry(null);
                    }}
                  />
                  {showFromRegistryDropdown && registries.length > 0 && (
                    <select
                      value={fromRegistry?.registryAddress || ""}
                      onChange={(e) =>
                        setFromRegistry(
                          registries.find(
                            (r) => r.registryAddress === e.target.value,
                          ) || null,
                        )
                      }
                      className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                    >
                      <option value="">-- Choose Wallet (From) --</option>
                      {registries.map((reg) => (
                        <option key={reg.registryAddress} value={reg.registryAddress}>
                          {reg.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* To Input + Registry Dropdown */}
                <div className="space-y-2">
                  <input
                    required
                    placeholder="To (Account or Address)"
                    value={transferFromData.to}
                    className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransferFromData({ ...transferFromData, to: val });
                      setShowToRegistryDropdown(
                        /^\d+$/.test(val.trim()) && val.trim().length > 0,
                      );
                      if (!/^\d+$/.test(val.trim())) setToRegistry(null);
                    }}
                  />
                  {showToRegistryDropdown && registries.length > 0 && (
                    <select
                      value={toRegistry?.registryAddress || ""}
                      onChange={(e) =>
                        setToRegistry(
                          registries.find(
                            (r) => r.registryAddress === e.target.value,
                          ) || null,
                        )
                      }
                      className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                    >
                      <option value="">-- Choose Wallet (To) --</option>
                      {registries.map((reg) => (
                        <option key={reg.registryAddress} value={reg.registryAddress}>
                          {reg.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <input
                  required
                  placeholder="Amount"
                  type="number"
                  value={transferFromData.amount}
                  className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                  onChange={(e) =>
                    setTransferFromData({
                      ...transferFromData,
                      amount: e.target.value,
                    })
                  }
                />
                <button
                  disabled={loading}
                  className="w-full py-4 border border-salvaGold text-salvaGold font-black rounded-xl text-xs uppercase tracking-widest hover:bg-salvaGold hover:text-black transition-all"
                >
                  {loading ? "EXECUTING..." : "CONFIRM PULL"}
                </button>
              </form>
            </div>

            {/* Allowances For Me List */}
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-3xl border border-white/5 flex flex-col h-full min-h-[350px]">
              <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h4 className="text-salvaGold font-black text-xs uppercase tracking-widest">
                  Allowances For Me
                </h4>
                <button
                  onClick={() => fetchIncomingAllowances(user.safeAddress)}
                  className={`text-[10px] font-bold text-salvaGold hover:opacity-70 transition-all flex items-center gap-1 ${
                    isRefreshingApprovals ? "animate-pulse" : ""
                  }`}
                >
                  {isRefreshingApprovals ? "SYNCING..." : "REFRESH ↻"}
                </button>
              </div>
              <div
                className="flex-1 overflow-y-auto pr-2 no-scrollbar"
                style={{ maxHeight: "250px" }}
              >
                {incomingAllowances.length > 0 ? (
                  <div className="space-y-3">
                    {incomingAllowances.map((app, i) => (
                      <div
                        key={i}
                        onClick={() => handleAutofillFromAllowance(app)}
                        className="p-3 bg-black/20 rounded-xl border border-white/5 cursor-pointer hover:border-salvaGold/40 transition-all"
                      >
                        <div className="flex justify-between items-center">
                          <div className="min-w-0 pr-2">
                            <p className="font-mono text-[10px] text-salvaGold truncate">
                              {app.allower}
                            </p>
                            <p className="text-[8px] uppercase opacity-40 font-bold">
                              Authorized Me
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="font-black text-xs text-green-400">
                              {formatNumber(app.amount)}
                            </p>
                            <p className="text-[8px] opacity-40 uppercase font-bold">
                              Available
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                    <p className="text-[8px] text-center opacity-30 uppercase font-bold mt-2 italic">
                      Tap an item to autofill form
                    </p>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center py-10 opacity-20">
                    <p className="text-center text-[10px] uppercase font-bold tracking-widest leading-loose">
                      No one has
                      <br />
                      authorized you
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        )}
      </div>

      {/* ── No PIN Warning Slide-in ── */}
      <AnimatePresence>
        {noPinWarning && (
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-red-500 text-white p-6 rounded-l-3xl shadow-2xl max-w-sm"
          >
            <h4 className="font-black text-lg mb-2">
              🔐 Transaction PIN Required
            </h4>
            <p className="text-sm mb-4">
              You must set a transaction PIN before performing any transactions.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => navigate("/account-settings")}
                className="flex-1 bg-white text-red-500 py-2 rounded-xl font-bold text-sm"
              >
                Go to Settings
              </button>
              <button
                onClick={() => setNoPinWarning(false)}
                className="px-4 bg-red-600 py-2 rounded-xl font-bold text-sm"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Confirmation Modal ── */}
      <AnimatePresence>
        {isConfirmModalOpen && confirmationData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div
              onClick={() => setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">✓</span>
                </div>
                <h3 className="text-2xl font-black mb-2">Confirm Transaction</h3>
                <p className="text-sm opacity-60">Please verify the details below</p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                  <p className="text-xs opacity-60 mb-1">Recipient Name</p>
                  <p className="font-black text-lg text-salvaGold">
                    {confirmationData.username}
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                  <p className="text-xs opacity-60 mb-1">Account Number</p>
                  <p className="font-mono font-bold">{confirmationData.accountNumber}</p>
                </div>

                {/* ── Fee-aware amount display ── */}
                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                  <p className="text-xs opacity-60 mb-1">You Send</p>
                  <p className="font-black text-xl">
                    {formatNumber(confirmationData.amount)}{" "}
                    <span className="text-salvaGold">NGNs</span>
                  </p>
                </div>

                {confirmationData.feeNGN > 0 && (
                  <>
                    <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                      <p className="text-xs opacity-60 mb-1">Network Fee</p>
                      <p className="font-black text-base text-red-400">
                        -{formatNumber(confirmationData.feeNGN)} NGNs
                      </p>
                    </div>
                    <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
                      <p className="text-xs opacity-60 mb-1">Recipient Receives</p>
                      <p className="font-black text-xl text-green-400">
                        {formatNumber(confirmationData.recipientReceives)}{" "}
                        <span className="text-salvaGold">NGNs</span>
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setConfirmationData(null);
                  }}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    if (pendingAction === "send") setIsSendOpen(false);
                    setPendingTransaction(pendingAction);
                    setIsPinModalOpen(true);
                    setTransactionPin("");
                    setPinAttempts(0);
                  }}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110"
                >
                  Confirm & Proceed
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIN Verification Modal ── */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div
              onClick={() => !loading && setIsPinModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔐</span>
                </div>
                <h3 className="text-2xl font-black mb-2">Enter Transaction PIN</h3>
                <p className="text-sm opacity-60">Verify your identity to proceed</p>
              </div>

              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength="4"
                value={transactionPin}
                onChange={(e) =>
                  setTransactionPin(e.target.value.replace(/\D/g, ""))
                }
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />

              {pinAttempts > 0 && (
                <p className="text-xs text-red-500 text-center mb-4 font-bold">
                  ⚠️ {3 - pinAttempts} attempts remaining
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setIsPinModalOpen(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={verifyPinAndProceed}
                  disabled={loading || transactionPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50"
                >
                  {loading ? "VERIFYING..." : "VERIFY"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Send Modal ── */}
      <AnimatePresence>
        {isSendOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              onClick={() => !loading && setIsSendOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative bg-white dark:bg-zinc-900 p-6 sm:p-12 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg border-t sm:border border-white/10 shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />
              <h3 className="text-2xl sm:text-3xl font-black mb-1">Send NGNs</h3>
              <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-8">
                Salva Secure Transfer
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resolveAndConfirm(
                    transferData.to,
                    transferData.amount,
                    "send",
                    selectedRegistry?.registryAddress || null,
                  );
                }}
                className="space-y-5"
              >
                {/* Recipient Input + Registry Dropdown */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                    Recipient
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Enter Account Number or Address"
                    value={transferData.to}
                    onChange={(e) => {
                      const val = e.target.value;
                      setTransferData({ ...transferData, to: val });
                      if (/^\d+$/.test(val.trim()) && val.trim().length > 0) {
                        setShowRegistryDropdown(true);
                      } else {
                        setShowRegistryDropdown(false);
                        setSelectedRegistry(null);
                      }
                    }}
                    className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold transition-all outline-none font-bold text-sm"
                  />
                  {showRegistryDropdown && registries.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                        Choose Wallet
                      </label>
                      <select
                        required
                        value={selectedRegistry?.registryAddress || ""}
                        onChange={(e) => {
                          const reg = registries.find(
                            (r) => r.registryAddress === e.target.value,
                          );
                          setSelectedRegistry(reg || null);
                        }}
                        className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold transition-all outline-none font-bold text-sm"
                      >
                        <option value="">-- Select Wallet --</option>
                        {registries.map((reg) => (
                          <option
                            key={reg.registryAddress}
                            value={reg.registryAddress}
                          >
                            {reg.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Amount Input */}
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">
                    Amount (NGN)
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="number"
                      step="0.01"
                      value={transferData.amount}
                      onChange={(e) => {
                        setTransferData({
                          ...transferData,
                          amount: e.target.value,
                        });
                        computeFeePreview(e.target.value);
                      }}
                      className={`w-full p-4 rounded-xl text-lg font-bold bg-gray-100 dark:bg-white/5 outline-none transition-all ${
                        amountError
                          ? "border border-red-500 text-red-500"
                          : "border border-transparent"
                      }`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">
                      NGN
                    </span>
                  </div>
                  {amountError && (
                    <p className="text-[10px] text-red-400 mt-2 font-bold animate-pulse uppercase tracking-tight">
                      ⚠️ Balance too low.
                    </p>
                  )}
                  {/* Live fee preview below amount input */}
                  {feePreview.feeNGN > 0 && transferData.amount && !amountError && (
                    <div className="mt-3 p-3 rounded-xl bg-white/5 border border-white/10 text-[10px] space-y-1">
                      <div className="flex justify-between">
                        <span className="opacity-50 uppercase font-bold">Network Fee</span>
                        <span className="text-red-400 font-black">
                          -{formatNumber(feePreview.feeNGN)} NGNs
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="opacity-50 uppercase font-bold">Recipient Gets</span>
                        <span className="text-green-400 font-black">
                          {formatNumber(feePreview.recipientReceives)} NGNs
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  disabled={loading || amountError}
                  type="submit"
                  className={`w-full py-5 rounded-2xl font-black transition-all text-sm uppercase tracking-widest ${
                    loading || amountError
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-salvaGold text-black hover:brightness-110 active:scale-95"
                  }`}
                >
                  {loading ? "PROCESSING…" : "CONFIRM SEND"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Notification Toast ── */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ y: 100, x: "-50%", opacity: 0 }}
            animate={{ y: 0, x: "-50%", opacity: 1 }}
            exit={{ y: 100, x: "-50%", opacity: 0 }}
            className={`fixed bottom-6 left-1/2 px-6 py-4 rounded-2xl z-[100] font-black text-[10px] uppercase tracking-widest shadow-2xl w-[90%] sm:w-auto text-center ${
              notification.type === "error"
                ? "bg-red-600 text-white"
                : "bg-salvaGold text-black"
            }`}
          >
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;