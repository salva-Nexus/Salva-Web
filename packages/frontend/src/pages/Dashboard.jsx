// Salva-Digital-Tech/packages/frontend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate } from "react-router-dom";
import Stars from "../components/Stars";
import AdminPanel from "./AdminPanel";

// ── Helpers ────────────────────────────────────────────────────────────────
const formatNumber = (num) =>
  parseFloat(num).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatAmountInput = (raw) => {
  const digits = raw.replace(/[^0-9.]/g, "");
  const parts = digits.split(".");
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? parts[0] + "." + parts[1] : parts[0];
};

function detectInputType(val) {
  const t = val.trim();
  if (!t) return "empty";
  if (t.startsWith("0x")) return "address";
  return "name";
}

// ── Dashboard ──────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState("0.00");
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: "",
    type: "",
  });
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState("buy");
  const [registries, setRegistries] = useState([]);
  const [feeConfig, setFeeConfig] = useState(null);
  const [feePreview, setFeePreview] = useState({ feeNGN: 0 });
  const [amountError, setAmountError] = useState(false);
  const [aliasStatus, setAliasStatus] = useState(() => {
    try {
      const saved = localStorage.getItem("salva_user");
      if (saved) {
        const u = JSON.parse(saved);
        return {
          hasName: !!u.nameAlias,
          nameAlias: u.nameAlias || null,
        };
      }
    } catch {}
    return { hasName: false, nameAlias: null };
  });
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [pinAttempts, setPinAttempts] = useState(0);
  const [noPinWarning, setNoPinWarning] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState("");

  // Send form state
  const [recipientInput, setRecipientInput] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [transferAmountDisplay, setTransferAmountDisplay] = useState("");
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [inputType, setInputType] = useState("empty");

  const navigate = useNavigate();

  const refreshUserStatus = async (email, currentUser) => {
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/user/status/${encodeURIComponent(email)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (
        data.isValidator !== currentUser.isValidator ||
        data.nameAlias !== currentUser.nameAlias
      ) {
        const updatedUser = {
          ...currentUser,
          isValidator: data.isValidator,
          nameAlias: data.nameAlias,
        };
        localStorage.setItem("salva_user", JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
    } catch {}
  };

  // ── Init ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem("salva_user");
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchBalance(parsedUser.safeAddress);
        fetchAliasStatus(parsedUser.safeAddress);
        refreshUserStatus(parsedUser.email, parsedUser);
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
      const t = setTimeout(
        () => setNotification({ ...notification, show: false }),
        4000,
      );
      return () => clearTimeout(t);
    }
  }, [notification]);

  useEffect(() => {
    if (transferAmount && balance) {
      const amt = parseFloat(transferAmount);
      const bal = parseFloat(balance);
      setAmountError(!isNaN(amt) && amt > bal);
    } else {
      setAmountError(false);
    }
  }, [transferAmount, balance]);

  const showMsg = (msg, type = "success") =>
    setNotification({ show: true, message: msg, type });

  // ── Fetchers ────────────────────────────────────────────────────────────
  const fetchBalance = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      const data = await res.json();
      setBalance(parseFloat(data.balance || 0).toFixed(2));
    } catch {
      setBalance("0.00");
    }
  };

  const fetchAliasStatus = async (safeAddress) => {
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/alias/status/${safeAddress}`,
      );
      const data = await res.json();
      setAliasStatus({
        hasName: !!data.nameAlias,
        nameAlias: data.nameAlias || null,
      });
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
      const regsArray = Array.isArray(regData) ? regData : [];
      setRegistries(regsArray);
      setFeeConfig(feeData);
      if (regsArray.length === 1) {
        setSelectedRegistry(regsArray[0]);
      }
    } catch {}
  };

  const checkAccountStatus = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/user/pin-status/${user.email}`,
      );
      const data = await res.json();
      if (!data.hasPin) setNoPinWarning(true);
      if (data.isLocked) {
        setIsAccountLocked(true);
        const h = Math.ceil(
          (new Date(data.lockedUntil) - new Date()) / (1000 * 60 * 60),
        );
        setLockMessage(
          `Account locked for ${h} more hour${h !== 1 ? "s" : ""}`,
        );
      }
    } catch {}
  };

  const computeFeePreview = (amount) => {
    if (!feeConfig || !amount) return setFeePreview({ feeNGN: 0 });
    const amt = parseFloat(amount);
    if (isNaN(amt)) return;
    let fee = 0;
    if (amt >= feeConfig.tier2Min) fee = feeConfig.tier2Fee;
    else if (amt >= feeConfig.tier1Min && amt <= feeConfig.tier1Max)
      fee = feeConfig.tier1Fee;
    setFeePreview({ feeNGN: fee });
  };

  const handleRecipientChange = (val) => {
    setRecipientInput(val);
    const type = detectInputType(val);
    setInputType(type);
    // If user switches to address input, clear registry selection
    if (type === "address") {
      setSelectedRegistry(null);
    } else if (type === "name" && registries.length === 1) {
      // Auto-select if only one registry
      setSelectedRegistry(registries[0]);
    }
  };

  // ── Send flow ────────────────────────────────────────────────────────────
  const handleTransferClick = () => {
    if (isAccountLocked) return showMsg(lockMessage, "error");
    if (noPinWarning) return showMsg("Set your transaction PIN first", "error");
    setIsSendOpen(true);
  };

  const resetSendForm = () => {
    setRecipientInput("");
    setTransferAmount("");
    setTransferAmountDisplay("");
    setSelectedRegistry(registries.length === 1 ? registries[0] : null);
    setInputType("empty");
    setFeePreview({ feeNGN: 0 });
  };

  // ── Step 1: Resolve recipient and show confirmation card ─────────────────
  // For address inputs: no resolution needed, go straight to confirm.
  // For name inputs: call /api/resolve-recipient which welds name+namespace
  // and calls resolveAddress on REGISTRY_CONTRACT_ADDRESS from .env.
  const resolveAndConfirm = async () => {
    if (!recipientInput || !transferAmount)
      return showMsg("Fill all fields", "error");

    const type = detectInputType(recipientInput);

    if (type === "name" && !selectedRegistry) {
      return showMsg("Select a wallet to send to", "error");
    }

    setLoading(true);
    try {
      let resolvedAddress = null;
      let displayIdentifier = recipientInput.trim();

      if (type === "address") {
        // Raw 0x address — no resolution needed
        resolvedAddress = recipientInput.trim().toLowerCase();
        displayIdentifier = recipientInput.trim();
      } else {
        // Name alias — backend welds name + namespace, then resolves
        // against REGISTRY_CONTRACT_ADDRESS from .env
        const res = await fetch(`${SALVA_API_URL}/api/resolve-recipient`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: recipientInput.trim(),
            registryAddress: selectedRegistry.registryAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolvedAddress) {
          showMsg(data.message || "Recipient not found", "error");
          return;
        }
        resolvedAddress = data.resolvedAddress.toLowerCase();
        // Display as "charles@salva" style
        displayIdentifier = `${recipientInput.trim()}${selectedRegistry.nspace}`;
      }

      setConfirmationData({
        resolvedAddress,
        displayIdentifier,
        amount: transferAmount,
        registryAddress: selectedRegistry?.registryAddress || null,
        walletName: selectedRegistry?.name || null,
        inputType: type,
        rawInput: recipientInput.trim(),
        feeNGN: feePreview.feeNGN,
      });
      setIsConfirmModalOpen(true);
    } catch {
      showMsg("Failed to resolve recipient", "error");
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async (privateKey, capturedConfirmationData) => {
    setIsPinModalOpen(false);
    setIsConfirmModalOpen(false);
    setIsSendOpen(false);
    resetSendForm();

    showMsg("Transaction queued — sending...", "info");

    try {
      const res = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: capturedConfirmationData.rawInput,
          amount: capturedConfirmationData.amount,
          registryAddress: capturedConfirmationData.registryAddress || null,
          inputType: capturedConfirmationData.inputType,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        showMsg("✅ Transfer Successful!", "success");
        setTimeout(() => fetchBalance(user.safeAddress), 3500);
      } else {
        showMsg(data.message || "Transfer failed — please try again", "error");
      }
    } catch {
      showMsg("Network error — transfer may not have gone through", "error");
    }
  };

  const verifyPinAndProceed = async () => {
    if (transactionPin.length !== 4)
      return showMsg("PIN must be 4 digits", "error");

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin: transactionPin }),
      });
      const data = await res.json();

      if (res.ok) {
        const capturedData = { ...confirmationData };
        const privateKey = data.privateKey;
        setTransactionPin("");
        setPinAttempts(0);
        setLoading(false);
        await executeTransfer(privateKey, capturedData);
      } else {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        if (newAttempts >= 3) {
          showMsg(
            "Too many failed attempts — redirecting to settings",
            "error",
          );
          setLoading(false);
          setTimeout(() => navigate("/account-settings"), 2000);
        } else {
          showMsg(
            `Invalid PIN. ${3 - newAttempts} attempt${3 - newAttempts !== 1 ? "s" : ""} remaining`,
            "error",
          );
          setLoading(false);
        }
      }
    } catch {
      showMsg("Network error", "error");
      setLoading(false);
    }
  };

  // ── Alias Modal ─────────────────────────────────────────────────────────
  const AliasModal = () => {
    const [step, setStep] = useState("input"); // "input" | "confirm" | "linking" | "success"
    const [nameInput, setNameInput] = useState("");
    const [nameError, setNameError] = useState("");
    const [checking, setChecking] = useState(false);
    const [weldedName, setWeldedName] = useState("");

    const validateNameLocally = (val) => {
      if (!val) return "Name is required";
      if (val.includes("0") || val.includes("1"))
        return "Digits 0 and 1 are not allowed";
      if (!/^[a-z2-9._-]+$/.test(val))
        return "Only lowercase letters, digits 2–9, dots, dashes, underscores";
      if ((val.match(/_/g) || []).length > 1)
        return "Only one underscore allowed";
      if (val.length > 16) return "Max 16 characters";
      return "";
    };

    const handleCheckAvailability = async () => {
      const err = validateNameLocally(nameInput);
      if (err) {
        setNameError(err);
        return;
      }
      setNameError("");
      setChecking(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: nameInput }),
        });
        const data = await res.json();
        if (!res.ok) {
          setNameError(data.message || "Check failed");
          return;
        }
        if (!data.available) {
          setNameError("This name is already taken. Try another.");
          return;
        }
        setWeldedName(data.welded);
        setStep("confirm");
      } catch {
        setNameError("Failed to check availability");
      } finally {
        setChecking(false);
      }
    };

    const handleConfirmLink = async () => {
      setStep("linking");
      try {
        const res = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            safeAddress: user.safeAddress,
            name: nameInput,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setNameError(data.message || "Linking failed");
          setStep("confirm");
          return;
        }
        const updatedUser = { ...user, nameAlias: data.nameAlias };
        localStorage.setItem("salva_user", JSON.stringify(updatedUser));
        setUser(updatedUser);
        setAliasStatus({ hasName: true, nameAlias: data.nameAlias });
        setStep("success");
        showMsg("Name linked successfully!");
      } catch {
        setNameError("Network error");
        setStep("confirm");
      }
    };

    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
        <motion.div
          onClick={() => setShowAliasModal(false)}
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
          {/* ── Step: Input ── */}
          {step === "input" && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔗</span>
                </div>
                <h3 className="text-2xl font-black mb-2">
                  Link Name to Address
                </h3>
                <p className="text-sm opacity-60">
                  Register a human-readable name for your wallet
                </p>
              </div>

              <div className="mb-2">
                <label className="text-[10px] uppercase opacity-40 font-bold block mb-2">
                  Choose Your Name
                </label>
                <input
                  type="text"
                  placeholder="yourname"
                  value={nameInput}
                  onChange={(e) => {
                    const val = e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9._-]/g, "");
                    setNameInput(val);
                    setNameError("");
                  }}
                  maxLength={16}
                  className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold text-lg"
                />
              </div>

              {nameInput && (
                <p className="text-xs text-salvaGold font-bold mb-2 ml-1">
                  Will appear as:{" "}
                  <span className="opacity-70">{nameInput}@salva</span>
                </p>
              )}

              {nameError && (
                <p className="text-xs text-red-400 mb-3 font-bold">
                  {nameError}
                </p>
              )}

              <p className="text-[10px] opacity-40 mb-6">
                Lowercase letters, digits 2–9, dots, dashes, one underscore max.
                No 0 or 1. Max 16 chars.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowAliasModal(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCheckAvailability}
                  disabled={checking || !nameInput}
                  className="flex-1 py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {checking ? "Checking..." : "Check Availability"}
                </button>
              </div>
            </>
          )}

          {/* ── Step: Confirm ── */}
          {step === "confirm" && (
            <>
              <div className="text-center mb-8">
                <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">✅</span>
                </div>
                <h3 className="text-2xl font-black mb-2">Name is Available!</h3>
                <div className="mt-4 p-4 bg-salvaGold/5 border border-salvaGold/20 rounded-2xl">
                  <p className="text-2xl font-black text-salvaGold">
                    {weldedName}
                  </p>
                </div>
              </div>

              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl mb-6">
                <p className="text-xs text-yellow-400 font-bold">
                  ⚠️ Double-check for typos. This alias is permanent and cannot
                  be changed once registered.
                </p>
              </div>

              {nameError && (
                <p className="text-xs text-red-400 mb-3 font-bold">
                  {nameError}
                </p>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setStep("input");
                    setNameError("");
                  }}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5 transition-all"
                >
                  Go Back
                </button>
                <button
                  onClick={handleConfirmLink}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold text-sm hover:brightness-110"
                >
                  Confirm & Link
                </button>
              </div>
            </>
          )}

          {/* ── Step: Linking ── */}
          {step === "linking" && (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin mx-auto mb-4" />
              <p className="font-black">Linking on-chain...</p>
              <p className="text-xs opacity-40 mt-2">
                This may take a few seconds
              </p>
            </div>
          )}

          {/* ── Step: Success ── */}
          {step === "success" && (
            <div className="text-center py-8">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 300 }}
                className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <span className="text-3xl">🎉</span>
              </motion.div>
              <h3 className="text-2xl font-black mb-2">Name Linked!</h3>
              <p className="text-salvaGold font-black text-lg mb-2">
                {weldedName}
              </p>
              <p className="text-sm opacity-60 mb-6">
                Your alias is now live on-chain.
              </p>
              <button
                onClick={() => setShowAliasModal(false)}
                className="w-full py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all"
              >
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
    ? [
        { id: "buy", label: "Buy NGNs" },
        { id: "admin", label: "Admin Panel" },
      ]
    : [{ id: "buy", label: "Buy NGNs" }];

  const showRegistryDropdown = inputType === "name";

  // ── Notification style config ─────────────────────────────────────────
  const notifConfig = {
    success: {
      icon: "✓",
      iconBg: "bg-salvaGold",
      iconColor: "text-black",
      border: "border-salvaGold/40",
      btn: "bg-salvaGold text-black hover:brightness-110",
    },
    error: {
      icon: "✕",
      iconBg: "bg-red-500",
      iconColor: "text-white",
      border: "border-red-500/40",
      btn: "bg-red-500 text-white hover:bg-red-400",
    },
    info: {
      icon: "↻",
      iconBg: "bg-white/10",
      iconColor: "text-white",
      border: "border-white/20",
      btn: "bg-white/10 text-white hover:bg-white/20",
    },
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">
        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-salvaGold font-bold">
              Salva Citizen{user.isValidator ? " · Validator" : ""}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black truncate max-w-[220px] sm:max-w-none">
              {user.username}
            </h2>
          </div>
          {aliasStatus.hasName && (
            <div
              className="bg-gray-100 dark:bg-white/5 p-4 rounded-2xl w-full sm:w-auto cursor-pointer hover:border hover:border-salvaGold/30 transition-all"
              onClick={() => {
                navigator.clipboard.writeText(aliasStatus.nameAlias);
                showMsg("Name alias copied!");
              }}
              title="Click to copy"
            >
              <p className="text-[9px] uppercase opacity-40 font-bold mb-1">
                Name Alias
              </p>
              <p className="font-mono font-bold text-salvaGold text-sm">
                {aliasStatus.nameAlias}
              </p>
              <p className="text-[9px] opacity-30 mt-1">click to copy</p>
            </div>
          )}
        </header>

        {/* ── Link Name to Address Button ── */}
        {!aliasStatus.hasName && (
          <motion.button
            onClick={() => setShowAliasModal(true)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="w-full mb-6 p-4 rounded-2xl border border-dashed border-salvaGold/40 bg-salvaGold/5 hover:border-salvaGold hover:bg-salvaGold/10 transition-all flex items-center justify-between group"
          >
            <div className="text-left">
              <p className="font-black text-sm text-salvaGold">
                Link Name to Address
              </p>
              <p className="text-[10px] opacity-50 mt-0.5">
                Register a human-readable name to receive payments
              </p>
            </div>
            <span className="text-salvaGold text-xl group-hover:translate-x-1 transition-transform">
              →
            </span>
          </motion.button>
        )}

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
                navigator.clipboard.writeText(user.safeAddress);
                showMsg("Wallet address copied!");
              }}
              className="border border-salvaGold/30 hover:bg-white/5 transition-all py-4 rounded-2xl font-bold text-sm sm:text-base"
            >
              RECEIVE
            </button>
          </div>
        </div>

        {/* ── Wallet address ── */}
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

        {/* ── View Transactions ── */}
        <Link
          to="/transactions"
          className="block mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 hover:border-salvaGold/30 transition-all text-center"
        >
          <p className="text-xs font-black uppercase tracking-widest text-salvaGold">
            View Transaction History →
          </p>
        </Link>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/10 mb-8 gap-8 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-2 text-[10px] uppercase tracking-widest font-black transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "border-b-2 border-salvaGold text-salvaGold"
                  : "opacity-40 hover:opacity-100"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Buy NGNs Tab ── */}
        {activeTab === "buy" && (
          <motion.section
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[300px] text-center py-16"
          >
            <div className="w-20 h-20 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <span className="text-4xl font-black text-salvaGold">₦</span>
            </div>
            <h3 className="text-2xl font-black mb-2">Buy NGNs</h3>
            <p className="opacity-50 text-sm mb-8 max-w-xs">
              Purchase Nigerian Naira stablecoin directly into your wallet
            </p>
            <button
              disabled
              className="px-10 py-4 bg-salvaGold text-black font-black rounded-2xl text-sm uppercase tracking-widest opacity-50 cursor-not-allowed shadow-lg shadow-salvaGold/20"
            >
              BUY NGNs
            </button>
            <p className="text-[10px] uppercase tracking-[0.3em] opacity-30 font-bold mt-3">
              Coming Soon
            </p>
          </motion.section>
        )}

        {/* ── Admin Panel Tab ── */}
        {activeTab === "admin" && user.isValidator && (
          <AdminPanel user={user} showMsg={showMsg} />
        )}
      </div>

      {/* ── No PIN Warning ── */}
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
              Set a transaction PIN before sending.
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

      {/* ── Alias Modal ── */}
      <AnimatePresence>{showAliasModal && <AliasModal />}</AnimatePresence>

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
              <h3 className="text-2xl sm:text-3xl font-black mb-1">
                Send NGNs
              </h3>
              <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-8">
                Salva Secure Transfer
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resolveAndConfirm();
                }}
                className="space-y-5"
              >
                {/* Recipient input */}
                <div className="space-y-2">
                  <label className="text-[10px] uppercase opacity-40 font-bold block">
                    Recipient
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Name alias or 0x address"
                    value={recipientInput}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold transition-all outline-none font-bold text-sm"
                  />

                  {inputType !== "empty" && (
                    <p className="text-[10px] opacity-40 font-bold ml-1">
                      {inputType === "address"
                        ? "✓ Wallet address — sending directly"
                        : "Name alias — select a wallet below"}
                    </p>
                  )}

                  {/* Registry dropdown — only shown for name alias input */}
                  {showRegistryDropdown && registries.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">
                        Select Wallet
                      </label>
                      <select
                        required
                        value={selectedRegistry?.registryAddress || ""}
                        onChange={(e) =>
                          setSelectedRegistry(
                            registries.find(
                              (r) => r.registryAddress === e.target.value,
                            ) || null,
                          )
                        }
                        className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold text-black dark:text-white"
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

                {/* Amount */}
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-2">
                    Amount (NGNs)
                  </label>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      value={transferAmountDisplay}
                      onChange={(e) => {
                        const fmt = formatAmountInput(e.target.value);
                        setTransferAmountDisplay(fmt);
                        const raw = fmt.replace(/,/g, "");
                        setTransferAmount(raw);
                        computeFeePreview(raw);
                      }}
                      className={`w-full p-4 rounded-xl text-lg font-bold bg-gray-100 dark:bg-white/5 outline-none transition-all ${
                        amountError
                          ? "border border-red-500 text-red-500"
                          : "border border-transparent"
                      }`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">
                      NGNs
                    </span>
                  </div>
                  {amountError && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold animate-pulse">
                      ⚠️ Insufficient balance
                    </p>
                  )}
                  {feePreview.feeNGN > 0 && transferAmount && !amountError && (
                    <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-[10px]">
                      <div className="flex justify-between">
                        <span className="opacity-50 uppercase font-bold">
                          Network Fee
                        </span>
                        <span className="text-red-400 font-black">
                          -{formatNumber(feePreview.feeNGN)} NGNs
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  disabled={loading || amountError || !recipientInput}
                  type="submit"
                  className={`w-full py-5 rounded-2xl font-black transition-all text-sm uppercase tracking-widest ${
                    loading || amountError || !recipientInput
                      ? "bg-zinc-800 text-zinc-600 cursor-not-allowed"
                      : "bg-salvaGold text-black hover:brightness-110 active:scale-95"
                  }`}
                >
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
                <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-1">Verify Recipient</h3>
                <p className="text-sm opacity-60">
                  Double-check before sending. Blockchain transactions are
                  irreversible.
                </p>
              </div>
              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-xl bg-salvaGold/5 border border-salvaGold/20">
                  <p className="text-[10px] opacity-60 mb-1">Sending To</p>
                  <p className="font-black text-lg text-salvaGold">
                    {confirmationData.displayIdentifier}
                  </p>
                  {/* Always show the resolved wallet address so user can verify */}
                  <p className="font-mono text-[10px] opacity-40 mt-1 break-all">
                    {confirmationData.resolvedAddress}
                  </p>
                  {confirmationData.walletName && (
                    <p className="text-[10px] opacity-50 mt-1 font-bold">
                      via {confirmationData.walletName}
                    </p>
                  )}
                  <p className="text-[10px] text-yellow-400 font-bold mt-2">
                    ⚠️ Make sure this is the correct recipient
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                  <p className="text-[10px] opacity-60 mb-1">You Send</p>
                  <p className="font-black text-xl">
                    {formatNumber(confirmationData.amount)}{" "}
                    <span className="text-salvaGold">NGNs</span>
                  </p>
                </div>

                {confirmationData.feeNGN > 0 && (
                  <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <p className="text-[10px] opacity-60 mb-1">Network Fee</p>
                    <p className="font-black text-base text-red-400">
                      -{formatNumber(confirmationData.feeNGN)} NGNs
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                >
                  Go Back
                </button>
                <button
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setIsPinModalOpen(true);
                    setTransactionPin("");
                    setPinAttempts(0);
                  }}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 transition-all"
                >
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
                <h3 className="text-2xl font-black mb-2">
                  Enter Transaction PIN
                </h3>
                <p className="text-sm opacity-60">Verify identity to proceed</p>
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
                  ⚠️ {3 - pinAttempts} attempt
                  {3 - pinAttempts !== 1 ? "s" : ""} remaining
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPinModalOpen(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={verifyPinAndProceed}
                  disabled={loading || transactionPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50 transition-all"
                >
                  {loading ? "VERIFYING..." : "VERIFY"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Notification Box ── */}
      <AnimatePresence>
        {notification.show &&
          (() => {
            const cfg = notifConfig[notification.type] || notifConfig.info;
            return (
              <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
                <motion.div
                  className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() =>
                    setNotification({ ...notification, show: false })
                  }
                />
                <motion.div
                  className={`relative w-full max-w-xs bg-white dark:bg-zinc-900 rounded-3xl border ${cfg.border} shadow-2xl overflow-hidden`}
                  initial={{ opacity: 0, scale: 0.85, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.85, y: 20 }}
                  transition={{ type: "spring", stiffness: 400, damping: 28 }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className={`h-1 w-full ${cfg.iconBg}`} />
                  <div className="p-7 text-center">
                    <div
                      className={`w-12 h-12 ${cfg.iconBg} rounded-2xl flex items-center justify-center mx-auto mb-4`}
                    >
                      <span className={`text-xl font-black ${cfg.iconColor}`}>
                        {cfg.icon}
                      </span>
                    </div>
                    <p className="font-black text-sm leading-relaxed mb-6">
                      {notification.message}
                    </p>
                    <button
                      onClick={() =>
                        setNotification({ ...notification, show: false })
                      }
                      className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 ${cfg.btn}`}
                    >
                      OK
                    </button>
                  </div>
                </motion.div>
              </div>
            );
          })()}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;