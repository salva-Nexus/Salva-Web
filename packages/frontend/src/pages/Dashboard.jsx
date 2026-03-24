// Salva-Digital-Tech/packages/frontend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import { jsPDF } from "jspdf";
import Stars from "../components/Stars";
import AdminPanel from "./AdminPanel";

// ── Helpers ────────────────────────────────────────────────────────────────
const formatNumber = (num) =>
  parseFloat(num).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatAmountInput = (raw) => {
  const digits = raw.replace(/[^0-9.]/g, "");
  const parts = digits.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? parts[0] + "." + parts[1] : parts[0];
};

// ── Dashboard ──────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: "", type: "" });
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState("buy");
  const [registries, setRegistries] = useState([]);
  const [feeConfig, setFeeConfig] = useState(null);
  const [feePreview, setFeePreview] = useState({ feeNGN: 0 });
  const [amountError, setAmountError] = useState(false);
  const [aliasStatus, setAliasStatus] = useState({ hasName: false, hasNumber: false, nameAlias: null, numberAlias: null });
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [noPinWarning, setNoPinWarning] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");

  // Send form
  const [transferData, setTransferData] = useState({ to: "", amount: "" });
  const [transferAmountDisplay, setTransferAmountDisplay] = useState("");
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [showRegistryDropdown, setShowRegistryDropdown] = useState(false);

  const navigate = useNavigate();

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem("salva_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchBalance(parsedUser.safeAddress);
        fetchAliasStatus(parsedUser.safeAddress);
      } catch {
        window.location.href = "/login";
      }
    } else {
      window.location.href = "/login";
    }
  }, []);

  useEffect(() => {
    if (user) {
      checkAccountStatus();
      fetchMeta();
    }
  }, [user]);

  useEffect(() => {
    if (notification.show) {
      const t = setTimeout(() => setNotification({ ...notification, show: false }), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  useEffect(() => {
    if (transferData.amount && balance) {
      const amt = parseFloat(transferData.amount);
      const bal = parseFloat(balance);
      setAmountError(!isNaN(amt) && amt > bal);
    } else {
      setAmountError(false);
    }
  }, [transferData.amount, balance]);

  const showMsg = (msg, type = "success") => setNotification({ show: true, message: msg, type });

  // ── Fetchers ────────────────────────────────────────────────────────────
  const fetchBalance = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      const data = await res.json();
      setBalance(parseFloat(data.balance || 0).toFixed(2));
    } catch { setBalance("0.00"); }
  };

  const fetchAliasStatus = async (safeAddress) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/status/${safeAddress}`);
      const data = await res.json();
      setAliasStatus(data);
    } catch {}
  };

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
    } catch {}
  };

  const checkAccountStatus = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/pin-status/${user.email}`);
      const data = await res.json();
      if (!data.hasPin) setNoPinWarning(true);
      if (data.isLocked) {
        setIsAccountLocked(true);
        const h = Math.ceil((new Date(data.lockedUntil) - new Date()) / (1000 * 60 * 60));
        setLockMessage(`Account locked for ${h} more hour${h !== 1 ? 's' : ''}`);
      }
    } catch {}
  };

  const computeFeePreview = (amount) => {
    if (!feeConfig || !amount) return setFeePreview({ feeNGN: 0 });
    const amt = parseFloat(amount);
    if (isNaN(amt)) return;
    let fee = 0;
    if (amt >= feeConfig.tier2Min) fee = feeConfig.tier2Fee;
    else if (amt >= feeConfig.tier1Min && amt <= feeConfig.tier1Max) fee = feeConfig.tier1Fee;
    setFeePreview({ feeNGN: fee });
  };

  // ── Send flow ────────────────────────────────────────────────────────────
  const handleTransferClick = () => {
    if (isAccountLocked) return showMsg(lockMessage, "error");
    if (noPinWarning) return showMsg("Set your transaction PIN first", "error");
    setIsSendOpen(true);
  };

  const resolveAndConfirm = async () => {
    const { to, amount } = transferData;
    if (!to || !amount) return showMsg("Fill all fields", "error");

    // If input is a number, require registry selection
    if (/^\d+$/.test(to.trim()) && !selectedRegistry) {
      return showMsg("Select a wallet from the dropdown", "error");
    }

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/resolve-account-info`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountNumberOrAddress: to }),
      });
      const data = await res.json();
      if (!data.found) { showMsg("Account not found", "error"); return; }

      // Determine display for confirmation card
      const isNumber = /^\d+$/.test(to.trim());
      const isName = /[a-zA-Z]/.test(to.trim());
      let resolvedDisplay = '';
      if (isNumber) {
        resolvedDisplay = `${to}@${selectedRegistry?.name?.toLowerCase().replace(/\s/g, '') || 'salva'}`;
      } else if (isName && !to.startsWith('0x')) {
        const ns = selectedRegistry?.name?.toLowerCase().replace(/\s/g, '') || 'salva';
        resolvedDisplay = `${to}@${ns}`;
      } else {
        resolvedDisplay = to; // raw address
      }

      setConfirmationData({
        resolvedDisplay,
        resolvedAddress: data.safeAddress,
        amount,
        registryAddress: selectedRegistry?.registryAddress || null,
        feeNGN: feePreview.feeNGN,
      });
      setIsConfirmModalOpen(true);
    } catch { showMsg("Failed to resolve account", "error"); }
    finally { setLoading(false); }
  };

  const executeTransfer = async (privateKey) => {
    setLoading(true);
    showMsg("Transaction queued...", "info");
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: transferData.to,
          amount: transferData.amount,
          registryAddress: confirmationData?.registryAddress || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("Transfer Successful!");
        setIsSendOpen(false);
        setTransferData({ to: "", amount: "" });
        setTransferAmountDisplay("");
        setSelectedRegistry(null);
        setTimeout(() => fetchBalance(user.safeAddress), 3500);
      } else {
        showMsg(data.message || "Transfer failed", "error");
      }
    } catch { showMsg("Network error", "error"); }
    finally { setLoading(false); }
  };

  const verifyPinAndProceed = async () => {
    if (transactionPin.length !== 4) return showMsg("PIN must be 4 digits", "error");
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin: transactionPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setIsPinModalOpen(false);
        await executeTransfer(data.privateKey);
      } else {
        setPinAttempts((p) => p + 1);
        if (pinAttempts >= 2) {
          showMsg("Too many failed attempts", "error");
          setTimeout(() => navigate("/account-settings"), 2000);
        } else {
          showMsg(`Invalid PIN. ${2 - pinAttempts} attempts remaining`, "error");
        }
      }
    } catch { showMsg("Network error", "error"); }
    finally { setLoading(false); }
  };

  // ── Alias Registration ───────────────────────────────────────────────────
  const AliasModal = () => {
    const [step, setStep] = useState('choose'); // choose | name-input | name-confirm | loading | success
    const [nameInput, setNameInput] = useState('');
    const [nameError, setNameError] = useState('');
    const [checkingName, setCheckingName] = useState(false);
    const [resolvedAlias, setResolvedAlias] = useState('');
    const [localLoading, setLocalLoading] = useState(false);

    const handleChooseName = async () => {
      const name = nameInput.toLowerCase().trim();
      if (!/^[a-z0-9._-]{1,16}$/.test(name)) {
        setNameError('Lowercase letters, digits, dots, dashes, underscores. Max 16 chars.');
        return;
      }
      setNameError('');
      setCheckingName(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.taken) { setNameError('This name is already taken. Try another.'); return; }
        setResolvedAlias(`${name}@salva`);
        setStep('name-confirm');
      } catch { setNameError('Failed to check availability'); }
      finally { setCheckingName(false); }
    };

    const handleLinkName = async () => {
      setLocalLoading(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ safeAddress: user.safeAddress, name: nameInput.toLowerCase().trim() })
        });
        const data = await res.json();
        if (res.ok) {
          setAliasStatus(prev => ({ ...prev, hasName: true, nameAlias: nameInput.toLowerCase().trim() }));
          const updatedUser = { ...user, nameAlias: nameInput.toLowerCase().trim() };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
          setStep('success');
          showMsg('Name alias registered!');
        } else {
          setNameError(data.message || 'Failed to register');
          setStep('name-input');
        }
      } catch { setNameError('Network error'); setStep('name-input'); }
      finally { setLocalLoading(false); }
    };

    const handleLinkNumber = async () => {
      setStep('loading');
      try {
        const res = await fetch(`${SALVA_API_URL}/api/alias/link-number`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ safeAddress: user.safeAddress })
        });
        const data = await res.json();
        if (res.ok) {
          setAliasStatus(prev => ({ ...prev, hasNumber: true, numberAlias: data.numberAlias }));
          const updatedUser = { ...user, numberAlias: data.numberAlias };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
          setStep('success');
          showMsg('Account number registered!');
        } else {
          showMsg(data.message || 'Failed to register number', 'error');
          setStep('choose');
        }
      } catch { showMsg('Network error', 'error'); setStep('choose'); }
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
        <motion.div onClick={() => setShowAliasModal(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
        <motion.div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>

          {step === 'choose' && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-2xl">🔖</span></div>
                <h3 className="text-2xl font-black mb-2">Register an Alias</h3>
                <p className="text-sm opacity-60">Choose what to register. You can have both.</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {!aliasStatus.hasName && (
                  <button onClick={() => setStep('name-input')}
                    className="p-5 rounded-2xl border border-salvaGold/30 bg-salvaGold/5 hover:border-salvaGold transition-all text-left">
                    <p className="text-2xl mb-2">✍️</p>
                    <p className="font-black text-sm">Name Alias</p>
                    <p className="text-xs opacity-50 mt-1">e.g. charles@salva</p>
                  </button>
                )}
                {!aliasStatus.hasNumber && (
                  <button onClick={handleLinkNumber}
                    className="p-5 rounded-2xl border border-white/10 bg-white/5 hover:border-salvaGold/30 transition-all text-left">
                    <p className="text-2xl mb-2">🔢</p>
                    <p className="font-black text-sm">Account Number</p>
                    <p className="text-xs opacity-50 mt-1">Assigned automatically</p>
                  </button>
                )}
              </div>
              <button onClick={() => setShowAliasModal(false)} className="w-full mt-4 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5 transition-all">Cancel</button>
            </>
          )}

          {step === 'name-input' && (
            <>
              <button onClick={() => setStep('choose')} className="text-[10px] uppercase tracking-widest text-salvaGold font-black mb-6">← Back</button>
              <h3 className="text-2xl font-black mb-2">Choose Your Name</h3>
              <p className="text-sm opacity-60 mb-6">Will be registered as <span className="text-salvaGold font-bold">{nameInput || 'yourname'}@salva</span></p>
              <input type="text" placeholder="yourname" value={nameInput}
                onChange={(e) => { setNameInput(e.target.value.toLowerCase()); setNameError(''); }}
                className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold text-lg mb-2" />
              {nameError && <p className="text-xs text-red-400 mb-3 font-bold">{nameError}</p>}
              <p className="text-[10px] opacity-40 mb-6">Lowercase letters, digits, dots, dashes, underscores. Max 16 chars.</p>
              <button onClick={handleChooseName} disabled={checkingName || !nameInput}
                className="w-full py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50">
                {checkingName ? 'Checking...' : 'Check Availability'}
              </button>
            </>
          )}

          {step === 'name-confirm' && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-2xl">✅</span></div>
                <h3 className="text-2xl font-black mb-2">Name is Available!</h3>
                <div className="mt-4 p-4 bg-salvaGold/5 border border-salvaGold/20 rounded-2xl">
                  <p className="text-2xl font-black text-salvaGold">{resolvedAlias}</p>
                </div>
              </div>
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mb-6">
                <p className="text-xs text-yellow-400 font-bold">⚠️ Double-check for typos. This alias is permanent and cannot be changed once registered.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep('name-input')} className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5 transition-all">Go Back</button>
                <button onClick={handleLinkName} disabled={localLoading}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold text-sm hover:brightness-110 disabled:opacity-50">
                  {localLoading ? 'Registering...' : 'Confirm & Register'}
                </button>
              </div>
            </>
          )}

          {step === 'loading' && (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin mx-auto mb-4" />
              <p className="font-black">Registering on-chain...</p>
              <p className="text-xs opacity-40 mt-2">This may take a few seconds</p>
            </div>
          )}

          {step === 'success' && (
            <div className="text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
                className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">🎉</span>
              </motion.div>
              <h3 className="text-2xl font-black mb-2">Alias Registered!</h3>
              <p className="text-sm opacity-60 mb-6">Your alias is now live on-chain.</p>
              <button onClick={() => {
                setShowAliasModal(false);
                // Re-check if more aliases can be registered
                fetchAliasStatus(user.safeAddress);
              }} className="w-full py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all">
                Done
              </button>
            </div>
          )}
        </motion.div>
      </div>
    );
  };

  if (!user) return null;

  const tabs = user.isValidator
    ? [{ id: 'buy', label: 'Buy NGNs' }, { id: 'admin', label: 'Admin Panel' }]
    : [{ id: 'buy', label: 'Buy NGNs' }];

  const bothAliasLinked = aliasStatus.hasName && aliasStatus.hasNumber;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-salvaGold font-bold">Salva Citizen{user.isValidator ? ' · Validator' : ''}</p>
            <h2 className="text-3xl sm:text-4xl font-black truncate max-w-[220px] sm:max-w-none">{user.username}</h2>
          </div>
          {/* Alias display — only shows if at least one alias registered */}
          {(aliasStatus.hasName || aliasStatus.hasNumber) && (
            <div className="bg-gray-100 dark:bg-white/5 p-4 rounded-2xl w-full sm:w-auto space-y-1">
              {aliasStatus.hasName && (
                <div>
                  <p className="text-[9px] uppercase opacity-40 font-bold">Name Alias</p>
                  <p className="font-mono font-bold text-salvaGold text-sm">{aliasStatus.nameAlias}@salva</p>
                </div>
              )}
              {aliasStatus.hasNumber && (
                <div>
                  <p className="text-[9px] uppercase opacity-40 font-bold">Account Number</p>
                  <p className="font-mono font-bold text-salvaGold text-sm">{aliasStatus.numberAlias}</p>
                </div>
              )}
            </div>
          )}
        </header>

        {/* ── Register Alias Button ── */}
        {!bothAliasLinked && (
          <motion.button
            onClick={() => setShowAliasModal(true)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full mb-6 p-4 rounded-2xl border border-dashed border-salvaGold/40 bg-salvaGold/5 hover:border-salvaGold hover:bg-salvaGold/10 transition-all flex items-center justify-between group"
          >
            <div className="text-left">
              <p className="font-black text-sm text-salvaGold">Register an Alias</p>
              <p className="text-[10px] opacity-50 mt-0.5">
                {!aliasStatus.hasName && !aliasStatus.hasNumber ? 'Register a name or account number to receive payments' :
                  !aliasStatus.hasName ? 'Add a name alias (number already registered)' :
                  'Add an account number (name already registered)'}
              </p>
            </div>
            <span className="text-salvaGold text-xl group-hover:translate-x-1 transition-transform">→</span>
          </motion.button>
        )}

        {/* ── Balance Card ── */}
        <div className="rounded-3xl bg-gray-100 dark:bg-black p-6 sm:p-10 mb-8 border border-white/5 shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <p className="uppercase text-[10px] sm:text-xs opacity-40 font-bold tracking-widest">Available Balance</p>
            <button onClick={() => setShowBalance(!showBalance)} className="hover:scale-110 transition-transform p-2">
              {showBalance ? "👁" : "👁‍🗨"}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 overflow-hidden">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter leading-none whitespace-nowrap">
              {showBalance ? formatNumber(balance) : "••••••.••"}
            </h1>
            <span className="text-salvaGold text-xl sm:text-2xl font-black mt-1 sm:mt-0">NGNs</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mt-8 sm:mt-10">
            <button onClick={handleTransferClick}
              className="bg-salvaGold hover:bg-yellow-600 transition-colors text-black font-black py-4 rounded-2xl shadow-lg shadow-salvaGold/20 text-sm sm:text-base">
              SEND
            </button>
            <button onClick={() => {
              const copyText = aliasStatus.hasNumber ? aliasStatus.numberAlias : user.safeAddress;
              navigator.clipboard.writeText(copyText);
              showMsg(aliasStatus.hasNumber ? "Account number copied!" : "Wallet address copied!");
            }}
              className="border border-salvaGold/30 hover:bg-white/5 transition-all py-4 rounded-2xl font-bold text-sm sm:text-base">
              RECEIVE
            </button>
          </div>
        </div>

        {/* ── Smart wallet address ── */}
        <div onClick={() => { navigator.clipboard.writeText(user.safeAddress); showMsg("Wallet address copied!"); }}
          className="mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:border-salvaGold/30 transition-all">
          <p className="text-[10px] uppercase opacity-40 font-bold mb-1 tracking-widest">Smart Wallet Address (Base)</p>
          <p className="font-mono text-[10px] sm:text-xs text-salvaGold font-medium break-all truncate">
            {showBalance ? user.safeAddress : "0x••••••••••••••••••••••••••••••••••••••••"}
          </p>
        </div>

        {/* ── View Transactions button ── */}
        <Link to="/transactions"
          className="block mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 hover:border-salvaGold/30 transition-all text-center">
          <p className="text-xs font-black uppercase tracking-widest text-salvaGold">View Transaction History →</p>
        </Link>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/10 mb-8 gap-8 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-[10px] uppercase tracking-widest font-black transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-b-2 border-salvaGold text-salvaGold' : 'opacity-40 hover:opacity-100'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Buy NGNs Tab ── */}
        {activeTab === 'buy' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center min-h-[300px] text-center py-16">
            <div className="w-20 h-20 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl font-black text-salvaGold">₦</span>
            </div>
            <h3 className="text-2xl font-black mb-2">Buy NGNs</h3>
            <p className="opacity-50 text-sm mb-8 max-w-xs">Purchase Nigerian Naira stablecoin directly into your wallet</p>
            <button disabled
              className="px-10 py-4 bg-salvaGold text-black font-black rounded-2xl text-sm uppercase tracking-widest opacity-50 cursor-not-allowed shadow-lg shadow-salvaGold/20">
              BUY NGNs
            </button>
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-30 font-bold mt-3">Coming Soon</p>
          </motion.section>
        )}

        {/* ── Admin Panel Tab ── */}
        {activeTab === 'admin' && user.isValidator && (
          <AdminPanel user={user} showMsg={showMsg} />
        )}
      </div>

      {/* ── No PIN Warning ── */}
      <AnimatePresence>
        {noPinWarning && (
          <motion.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-red-500 text-white p-6 rounded-l-3xl shadow-2xl max-w-sm">
            <h4 className="font-black text-lg mb-2">🔐 Transaction PIN Required</h4>
            <p className="text-sm mb-4">Set a transaction PIN before sending.</p>
            <div className="flex gap-2">
              <button onClick={() => navigate("/account-settings")} className="flex-1 bg-white text-red-500 py-2 rounded-xl font-bold text-sm">Go to Settings</button>
              <button onClick={() => setNoPinWarning(false)} className="px-4 bg-red-600 py-2 rounded-xl font-bold text-sm">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Alias Modal ── */}
      <AnimatePresence>
        {showAliasModal && <AliasModal />}
      </AnimatePresence>

      {/* ── Send Modal ── */}
      <AnimatePresence>
        {isSendOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div onClick={() => !loading && setIsSendOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div className="relative bg-white dark:bg-zinc-900 p-6 sm:p-12 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg border-t sm:border border-white/10 shadow-2xl"
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }}>
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />
              <h3 className="text-2xl sm:text-3xl font-black mb-1">Send NGNs</h3>
              <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-8">Salva Secure Transfer</p>

              <form onSubmit={(e) => { e.preventDefault(); resolveAndConfirm(); }} className="space-y-5">
                {/* Recipient */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase opacity-40 font-bold block">Recipient</label>
                  <input required type="text" placeholder="Name, account number, or 0x address"
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
                    className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold transition-all outline-none font-bold text-sm" />

                  {/* Registry dropdown — shown for number inputs OR when multiple registries exist */}
                  {(showRegistryDropdown || (registries.length > 1 && transferData.to && !transferData.to.startsWith('0x'))) && registries.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Select Wallet</label>
                      <select required value={selectedRegistry?.registryAddress || ""}
                        onChange={(e) => setSelectedRegistry(registries.find(r => r.registryAddress === e.target.value) || null)}
                        className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold text-black dark:text-white">
                        <option value="">-- Select Wallet --</option>
                        {registries.map((reg) => (
                          <option key={reg.registryAddress} value={reg.registryAddress}>{reg.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-2">Amount (NGNs)</label>
                  <div className="relative">
                    <input required type="text" inputMode="decimal" value={transferAmountDisplay}
                      onChange={(e) => {
                        const fmt = formatAmountInput(e.target.value);
                        setTransferAmountDisplay(fmt);
                        const raw = fmt.replace(/,/g, "");
                        setTransferData({ ...transferData, amount: raw });
                        computeFeePreview(raw);
                      }}
                      className={`w-full p-4 rounded-xl text-lg font-bold bg-gray-100 dark:bg-white/5 outline-none transition-all ${amountError ? 'border border-red-500 text-red-500' : 'border border-transparent'}`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">NGNs</span>
                  </div>
                  {amountError && <p className="text-[10px] text-red-400 mt-1 font-bold animate-pulse">⚠️ Insufficient balance</p>}
                  {feePreview.feeNGN > 0 && transferData.amount && !amountError && (
                    <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-[10px]">
                      <div className="flex justify-between">
                        <span className="opacity-50 uppercase font-bold">Network Fee</span>
                        <span className="text-red-400 font-black">-{formatNumber(feePreview.feeNGN)} NGNs</span>
                      </div>
                    </div>
                  )}
                </div>

                <button disabled={loading || amountError} type="submit"
                  className={`w-full py-5 rounded-2xl font-black transition-all text-sm uppercase tracking-widest ${loading || amountError ? 'bg-zinc-800 text-zinc-600 cursor-not-allowed' : 'bg-salvaGold text-black hover:brightness-110 active:scale-95'}`}>
                  {loading ? "PROCESSING…" : "REVIEW & SEND"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirmation Modal ── */}
      <AnimatePresence>
        {isConfirmModalOpen && confirmationData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div onClick={() => setIsConfirmModalOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>

              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-1">Verify Recipient</h3>
                <p className="text-sm opacity-60">Double-check before sending. Blockchain transactions are irreversible.</p>
              </div>

              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-xl bg-salvaGold/5 border border-salvaGold/20">
                  <p className="text-[10px] opacity-60 mb-1">Sending To</p>
                  <p className="font-black text-lg text-salvaGold">{confirmationData.resolvedDisplay}</p>
                  <p className="font-mono text-[10px] opacity-40 mt-1 break-all">{confirmationData.resolvedAddress}</p>
                  <p className="text-[10px] text-yellow-400 font-bold mt-2">⚠️ Make sure this is the correct recipient</p>
                </div>
                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                  <p className="text-[10px] opacity-60 mb-1">You Send</p>
                  <p className="font-black text-xl">{formatNumber(confirmationData.amount)} <span className="text-salvaGold">NGNs</span></p>
                </div>
                {confirmationData.feeNGN > 0 && (
                  <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <p className="text-[10px] opacity-60 mb-1">Network Fee</p>
                    <p className="font-black text-base text-red-400">-{formatNumber(confirmationData.feeNGN)} NGNs</p>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={() => setIsConfirmModalOpen(false)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5 transition-all">Go Back</button>
                <button onClick={() => {
                  setIsConfirmModalOpen(false);
                  setIsPinModalOpen(true);
                  setTransactionPin("");
                  setPinAttempts(0);
                }}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 transition-all">
                  Confirm & Sign
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIN Modal ── */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            <motion.div onClick={() => !loading && setIsPinModalOpen(false)} className="absolute inset-0 bg-black/95 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4"><span className="text-3xl">🔐</span></div>
                <h3 className="text-2xl font-black mb-2">Enter Transaction PIN</h3>
                <p className="text-sm opacity-60">Verify identity to proceed</p>
              </div>
              <input type="password" inputMode="numeric" pattern="\d{4}" maxLength="4"
                value={transactionPin} onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••" autoFocus
                className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6" />
              {pinAttempts > 0 && <p className="text-xs text-red-500 text-center mb-4 font-bold">⚠️ {3 - pinAttempts} attempts remaining</p>}
              <div className="flex gap-3">
                <button onClick={() => setIsPinModalOpen(false)} disabled={loading} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5 transition-all">Cancel</button>
                <button onClick={verifyPinAndProceed} disabled={loading || transactionPin.length !== 4} className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50 transition-all">
                  {loading ? "VERIFYING..." : "VERIFY"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {notification.show && (
          <motion.div initial={{ y: 100, x: "-50%", opacity: 0 }} animate={{ y: 0, x: "-50%", opacity: 1 }} exit={{ y: 100, x: "-50%", opacity: 0 }}
            className={`fixed bottom-6 left-1/2 px-6 py-4 rounded-2xl z-[100] font-black text-[10px] uppercase tracking-widest shadow-2xl w-[90%] sm:w-auto text-center ${notification.type === "error" ? "bg-red-600 text-white" : "bg-salvaGold text-black"}`}>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;