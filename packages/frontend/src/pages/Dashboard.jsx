// Salva-Digital-Tech/packages/frontend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useAnimation } from "framer-motion";
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

// ── Notification ───────────────────────────────────────────────────────────
const SalvaNotification = ({ notification, onClose }) => {
  const cfgMap = {
    success: { icon: "✓", bar: "#D4AF37", btnBg: "#D4AF37", btnText: "#000" },
    error: { icon: "✕", bar: "#EF4444", btnBg: "#EF4444", btnText: "#fff" },
    info: {
      icon: "↻",
      bar: "#3B82F6",
      btnBg: "rgba(255,255,255,0.15)",
      btnText: "#fff",
    },
    warning: { icon: "⚠", bar: "#F59E0B", btnBg: "#F59E0B", btnText: "#000" },
  };
  const cfg = cfgMap[notification.type] || cfgMap.info;
  if (!notification.show) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-xs bg-white dark:bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: "spring", stiffness: 400, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ height: 4, background: cfg.bar }} />
        <div className="p-7 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: cfg.bar }}
          >
            <span className="text-xl font-black" style={{ color: cfg.btnText }}>
              {cfg.icon}
            </span>
          </div>
          <p className="font-black text-sm leading-relaxed mb-6 text-black dark:text-white">
            {notification.message}
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            style={{ background: cfg.btnBg, color: cfg.btnText }}
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Swipeable Balance Card ─────────────────────────────────────────────────
const BalanceCard = ({
  balance,
  usdtBalance,
  usdcBalance,
  showBalance,
  onToggleVisibility,
  onSend,
  onReceive,
}) => {
  const [activePanel, setActivePanel] = useState(0);
  const controls = useAnimation();

  const goTo = (panel) => {
    setActivePanel(panel);
    controls.start({
      x: panel === 0 ? "0%" : "-50%",
      transition: { type: "spring", stiffness: 300, damping: 30 },
    });
  };

  const handleDragEnd = (_, info) => {
    const offset = info.offset.x;
    if (offset < -50 && activePanel === 0) goTo(1);
    else if (offset > 50 && activePanel === 1) goTo(0);
    else goTo(activePanel);
  };

  const totalUsd = (
    parseFloat(usdtBalance || 0) + parseFloat(usdcBalance || 0)
  ).toFixed(2);

  return (
    <div className="rounded-3xl overflow-hidden bg-gray-100 dark:bg-black border border-white/5 shadow-2xl mb-8">
      <div className="relative overflow-hidden">
        <motion.div
          className="flex"
          style={{ width: "200%" }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.08}
          onDragEnd={handleDragEnd}
          animate={controls}
          initial={{ x: "0%" }}
        >
          {/* Panel 0: NGNs */}
          <div className="p-6 sm:p-10" style={{ width: "50%" }}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <p className="uppercase text-[10px] sm:text-xs opacity-40 font-bold tracking-widest">
                  NGNs Balance
                </p>
                <span
                  className="text-[10px] text-salvaGold/60 font-bold cursor-pointer"
                  onClick={() => goTo(1)}
                >
                  swipe → USD
                </span>
              </div>
              <button
                onClick={onToggleVisibility}
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
            <div className="flex gap-2 mt-4">
              <div className="w-5 h-1.5 bg-salvaGold rounded-full" />
              <div
                className="w-1.5 h-1.5 bg-white/20 rounded-full cursor-pointer"
                onClick={() => goTo(1)}
              />
            </div>
          </div>

          {/* Panel 1: USD */}
          <div className="p-6 sm:p-10" style={{ width: "50%" }}>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <p className="uppercase text-[10px] sm:text-xs opacity-40 font-bold tracking-widest">
                  USD Balance
                </p>
                <span
                  className="text-[10px] text-salvaGold/60 font-bold cursor-pointer"
                  onClick={() => goTo(0)}
                >
                  ← NGNs
                </span>
              </div>
              <button
                onClick={onToggleVisibility}
                className="hover:scale-110 transition-transform p-2"
              >
                {showBalance ? "👁" : "👁‍🗨"}
              </button>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 overflow-hidden">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter leading-none whitespace-nowrap">
                {showBalance ? formatNumber(totalUsd) : "••••••.••"}
              </h1>
              <span className="text-salvaGold text-xl sm:text-2xl font-black mt-1 sm:mt-0">
                USD
              </span>
            </div>
            <div className="mt-2">
              <p className="text-[10px] opacity-40 font-mono">
                USDT: {showBalance ? formatNumber(usdtBalance) : "••••"}
                &nbsp;·&nbsp; USDC:{" "}
                {showBalance ? formatNumber(usdcBalance) : "••••"}
              </p>
            </div>
            <div className="flex gap-2 mt-3">
              <div
                className="w-1.5 h-1.5 bg-white/20 rounded-full cursor-pointer"
                onClick={() => goTo(0)}
              />
              <div className="w-5 h-1.5 bg-salvaGold rounded-full" />
            </div>
          </div>
        </motion.div>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 px-6 sm:px-10 pb-6 sm:pb-10">
        <button
          onClick={onSend}
          className="bg-salvaGold hover:bg-yellow-600 transition-colors text-black font-black py-4 rounded-2xl shadow-lg shadow-salvaGold/20 text-sm sm:text-base"
        >
          SEND
        </button>
        <button
          onClick={onReceive}
          className="border border-salvaGold/30 hover:bg-white/5 transition-all py-4 rounded-2xl font-bold text-sm sm:text-base"
        >
          RECEIVE
        </button>
      </div>
    </div>
  );
};

// ── Link a Name Tab ────────────────────────────────────────────────────────
const LinkNameTab = ({ user, registries, showMsg }) => {
  const [linkedNames, setLinkedNames] = useState([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [nameInput, setNameInput] = useState("");
  const [walletInput, setWalletInput] = useState("");
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [nameCheckResult, setNameCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [nameError, setNameError] = useState("");
  const [linkStep, setLinkStep] = useState("form");
  const [reservedEmail, setReservedEmail] = useState("");
  const [reservedSubmitting, setReservedSubmitting] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [pinLoading, setPinLoading] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkPinInput, setUnlinkPinInput] = useState("");
  const [unlinkPinStep, setUnlinkPinStep] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const fetchLinkedNames = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/alias/list/${user.safeAddress}`,
      );
      const data = await res.json();
      setLinkedNames(data.aliases || []);
    } catch {
      setLinkedNames([]);
    } finally {
      setLoadingNames(false);
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    fetchLinkedNames();
  }, [fetchLinkedNames]);

  const validateNameLocally = (val) => {
    if (!val) return "Name is required";
    if (val.includes("0") || val.includes("1"))
      return "Digits 0 and 1 are not allowed";
    if (!/^[a-z2-9_]+$/.test(val))
      return "Only lowercase a–z, digits 2–9, one underscore";
    if ((val.match(/_/g) || []).length > 1)
      return "Only one underscore allowed";
    if (val.startsWith("_") || val.endsWith("_"))
      return "Cannot start or end with underscore";
    if (val.length > 32) return "Max 32 characters";
    if (val.length < 2) return "At least 2 characters required";
    return "";
  };

const handleCheckName = async () => {
  const err = validateNameLocally(nameInput);
  if (err) {
    setNameError(err);
    return;
  }
  if (
    !walletInput ||
    !walletInput.startsWith("0x") ||
    walletInput.length !== 42
  ) {
    setNameError("Enter a valid 0x wallet address to link to");
    return;
  }
  if (!selectedRegistry) {
    setNameError("Select which wallet service this name belongs to");
    return;
  }

  setNameError("");
  setChecking(true);
  setNameCheckResult(null);

  try {
    const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // UPDATED: Added registryAddress to the payload
      body: JSON.stringify({
        name: nameInput,
        registryAddress: selectedRegistry.registryAddress,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setNameError(data.message || "Check failed");
      return;
    }

    setNameCheckResult(data);

    if (data.reserved) {
      setLinkStep("reserved");
    } else if (!data.available) {
      // This will now correctly report 'Taken' because the backend
      // finally knows to check 'name@suffix' instead of just 'name'
      setNameError("This name is already taken. Try another.");
    } else {
      setLinkStep("confirm");
    }
  } catch {
    setNameError("Network error. Please try again.");
  } finally {
    setChecking(false);
  }
};

  const handleSendReservedNotification = async () => {
    if (!reservedEmail) return;
    setReservedSubmitting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/notify-reserved`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput,
          requesterEmail: reservedEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("Your request has been sent to our team!");
        setLinkStep("form");
        setNameInput("");
        setWalletInput("");
        setReservedEmail("");
      } else showMsg(data.message || "Failed to send", "error");
    } catch {
      showMsg("Network error", "error");
    } finally {
      setReservedSubmitting(false);
    }
  };

  const handleExecuteLink = async () => {
    if (pinInput.length !== 4) return;
    setPinLoading(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin: pinInput }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        showMsg(pinData.message || "Invalid PIN", "error");
        setPinLoading(false);
        return;
      }

      setLinkStep("linking");

      const prepRes = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          name: nameInput,
          walletToLink: walletInput,
          registryAddress: selectedRegistry.registryAddress,
        }),
      });
      const prepData = await prepRes.json();

      if (prepData.reserved) {
        setLinkStep("reserved");
        return;
      }
      if (prepData.lowBalance) {
        showMsg(prepData.message, "warning");
        setLinkStep("form");
        return;
      }
      if (!prepRes.ok) {
        showMsg(prepData.message || "Preparation failed", "error");
        setLinkStep("confirm");
        return;
      }

      const execRes = await fetch(`${SALVA_API_URL}/api/alias/execute-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          pureName: prepData.pureName,
          weldedName: prepData.weldedName,
          walletToLink: prepData.walletToLink,
          registryAddress: prepData.registryAddress,
          signature: prepData.signature,
          ethFee: prepData.ethFee,
          feeTokenAddress: prepData.feeTokenAddress,
          userPrivateKey: pinData.privateKey,
        }),
      });
      const execData = await execRes.json();
      if (!execRes.ok) {
        showMsg(execData.message || "Linking failed", "error");
        setLinkStep("confirm");
        return;
      }

      setLinkStep("success");
      await fetchLinkedNames();
      try {
        const savedUser = JSON.parse(
          localStorage.getItem("salva_user") || "{}",
        );
        savedUser.nameAlias = execData.alias?.name || savedUser.nameAlias;
        localStorage.setItem("salva_user", JSON.stringify(savedUser));
      } catch {
        /* ignore localStorage errors */
      }
    } catch (err) {
      showMsg(err.message || "Failed to link name", "error");
      setLinkStep("confirm");
    } finally {
      setPinLoading(false);
    }
  };

  const handleExecuteUnlink = async () => {
    if (unlinkPinInput.length !== 4 || !unlinkTarget) return;
    setUnlinkLoading(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin: unlinkPinInput }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        showMsg(pinData.message || "Invalid PIN", "error");
        setUnlinkLoading(false);
        return;
      }
      const res = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          weldedName: unlinkTarget.name,
          registryAddress: unlinkTarget.registryAddress,
          userPrivateKey: pinData.privateKey,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(`"${unlinkTarget.name}" unlinked successfully!`);
        setUnlinkPinStep(false);
        setUnlinkTarget(null);
        await fetchLinkedNames();
      } else showMsg(data.message || "Unlink failed", "error");
    } catch {
      showMsg("Network error during unlink", "error");
    } finally {
      setUnlinkLoading(false);
    }
  };

  const resetLinkForm = () => {
    setLinkStep("form");
    setNameInput("");
    setWalletInput("");
    setNameError("");
    setNameCheckResult(null);
    setPinInput("");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8"
    >
      {/* Linked Names List */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-4">
          Your Linked Names
        </p>
        {loadingNames ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : linkedNames.length === 0 ? (
          <div className="p-6 rounded-2xl border border-dashed border-white/10 text-center">
            <p className="text-sm opacity-40 font-bold">No names linked yet.</p>
            <p className="text-[10px] opacity-30 mt-1">
              Link your first name below.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {linkedNames.map((alias, i) => (
              <motion.div
                key={alias.name + i}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                className="p-4 rounded-2xl bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p
                      className="font-black text-salvaGold text-base truncate cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(alias.name);
                        showMsg("Name copied!");
                      }}
                      title="Click to copy"
                    >
                      {alias.name}
                    </p>
                    <p
                      className="font-mono text-[10px] opacity-40 truncate mt-0.5 cursor-pointer"
                      onClick={() => {
                        navigator.clipboard.writeText(alias.wallet);
                        showMsg("Wallet address copied!");
                      }}
                      title="Click to copy wallet"
                    >
                      {alias.wallet}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setUnlinkTarget(alias);
                      setShowUnlinkConfirm(true);
                      setUnlinkPinInput("");
                      setUnlinkPinStep(false);
                    }}
                    className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all"
                  >
                    Unlink
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Register New Name */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-4">
          Register a New Name
        </p>

        {linkStep === "form" && (
          <div className="p-6 rounded-3xl border border-salvaGold/20 bg-salvaGold/5 space-y-4">
            <p className="text-xs font-black text-salvaGold uppercase tracking-widest">
              Link Name to Address
            </p>
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">
                Name (lowercase a–z, 2–9, one _ max, no 0 or 1)
              </label>
              <input
                type="text"
                placeholder="yourname"
                value={nameInput}
                onChange={(e) => {
                  setNameInput(
                    e.target.value.toLowerCase().replace(/[^a-z2-9_]/g, ""),
                  );
                  setNameError("");
                }}
                maxLength={32}
                className="w-full p-4 rounded-xl bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 focus:border-salvaGold outline-none font-bold text-base"
              />
              {nameInput && (
                <p className="text-[10px] text-salvaGold font-bold mt-1 ml-1">
                  Preview:{" "}
                  <span className="opacity-70">
                    {nameInput}
                    {selectedRegistry ? selectedRegistry.nspace : "@salva"}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">
                Wallet Address to Link This Name To
              </label>
              <input
                type="text"
                placeholder="0x..."
                value={walletInput}
                onChange={(e) => {
                  setWalletInput(e.target.value.trim());
                  setNameError("");
                }}
                className="w-full p-4 rounded-xl bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 focus:border-salvaGold outline-none font-mono text-sm"
              />
              <p className="text-[10px] opacity-30 mt-1 ml-1">
                ⚠️ Select the wallet service that manages this address below.
              </p>
            </div>
            <div>
              <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">
                Which Wallet Service Does This Address Belong To?
              </label>
              <select
                value={selectedRegistry?.registryAddress || ""}
                onChange={(e) => {
                  setSelectedRegistry(
                    registries.find(
                      (r) => r.registryAddress === e.target.value,
                    ) || null,
                  );
                  setNameError("");
                }}
                className="w-full p-4 bg-white dark:bg-black/40 rounded-xl border border-gray-200 dark:border-white/10 text-sm outline-none focus:border-salvaGold font-bold text-black dark:text-white"
              >
                <option value="">-- Select Wallet Service --</option>
                {registries.map((reg) => (
                  <option key={reg.registryAddress} value={reg.registryAddress}>
                    {reg.name} ({reg.nspace})
                  </option>
                ))}
              </select>
            </div>
            {nameError && (
              <p className="text-xs text-red-400 font-bold">{nameError}</p>
            )}
            <button
              onClick={handleCheckName}
              disabled={
                checking || !nameInput || !walletInput || !selectedRegistry
              }
              className="w-full py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-40 uppercase tracking-widest text-sm"
            >
              {checking ? "Checking…" : "Check & Link"}
            </button>
          </div>
        )}

        {linkStep === "reserved" && (
          <div className="p-6 rounded-3xl border border-yellow-500/30 bg-yellow-500/5 space-y-5">
            <div className="text-center">
              <span className="text-4xl mb-3 block">⚠️</span>
              <h3 className="text-xl font-black mb-2">Whitelisted Name</h3>
              <p className="text-sm opacity-70 leading-relaxed">
                <strong className="text-salvaGold">{nameInput}</strong> is a
                reserved name. Enter your email and we will reach out to verify
                your eligibility.
              </p>
            </div>
            <input
              type="email"
              placeholder="your@email.com"
              value={reservedEmail}
              onChange={(e) => setReservedEmail(e.target.value)}
              className="w-full p-4 rounded-xl bg-white dark:bg-black/40 border border-yellow-500/30 focus:border-yellow-500 outline-none font-bold text-base"
            />
            <div className="flex gap-3">
              <button
                onClick={resetLinkForm}
                className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5"
              >
                Go Back
              </button>
              <button
                onClick={handleSendReservedNotification}
                disabled={reservedSubmitting || !reservedEmail}
                className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-bold text-sm hover:brightness-110 disabled:opacity-50"
              >
                {reservedSubmitting ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        )}

        {linkStep === "confirm" && nameCheckResult && (
          <div className="p-6 rounded-3xl border border-green-500/30 bg-green-500/5 space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <span className="text-2xl">✅</span>
              </div>
              <h3 className="text-xl font-black mb-2">Name Available!</h3>
              <div className="p-4 bg-salvaGold/10 border border-salvaGold/30 rounded-2xl">
                <p className="text-2xl font-black text-salvaGold">
                  {nameCheckResult.welded}
                </p>
              </div>
            </div>
            <div className="p-4 bg-white/5 rounded-xl space-y-2">
              <p className="text-[10px] uppercase opacity-40 font-bold">
                Links to wallet
              </p>
              <p className="font-mono text-xs text-white break-all">
                {walletInput}
              </p>
              <p className="text-[10px] uppercase opacity-40 font-bold mt-2">
                Via registry
              </p>
              <p className="text-xs font-bold text-salvaGold">
                {selectedRegistry?.name}
              </p>
            </div>
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <p className="text-xs text-yellow-400 font-bold">
                ⚠️ A fee of <strong>1 USDT or 1 USDC</strong> will be charged.
                This is permanent — double-check the name and wallet address.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={resetLinkForm}
                className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5"
              >
                Go Back
              </button>
              <button
                onClick={() => {
                  setLinkStep("pin");
                  setPinInput("");
                }}
                className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold text-sm hover:brightness-110"
              >
                Confirm & Enter PIN
              </button>
            </div>
          </div>
        )}

        {linkStep === "pin" && (
          <div className="p-6 rounded-3xl border border-white/10 bg-white/5 space-y-5 text-center">
            <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto">
              <span className="text-2xl">🔐</span>
            </div>
            <h3 className="text-xl font-black">Enter Transaction PIN</h3>
            <p className="text-sm opacity-60">
              Verify identity to sign and broadcast on-chain
            </p>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength="4"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ""))}
              placeholder="••••"
              autoFocus
              className="w-full p-4 rounded-xl bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black"
            />
            <div className="flex gap-3">
              <button
                onClick={resetLinkForm}
                disabled={pinLoading}
                className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteLink}
                disabled={pinLoading || pinInput.length !== 4}
                className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold text-sm hover:brightness-110 disabled:opacity-50"
              >
                {pinLoading ? "Signing…" : "Confirm"}
              </button>
            </div>
          </div>
        )}

        {linkStep === "linking" && (
          <div className="p-12 rounded-3xl border border-white/10 bg-white/5 text-center space-y-4">
            <div className="w-12 h-12 border-4 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin mx-auto" />
            <p className="font-black text-lg">Linking on-chain…</p>
            <p className="text-xs opacity-40">
              Broadcasting to Base. This may take 30–60 seconds.
            </p>
          </div>
        )}

        {linkStep === "success" && (
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="p-8 rounded-3xl border border-green-500/30 bg-green-500/5 text-center space-y-4"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, delay: 0.1 }}
              className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto"
            >
              <span className="text-3xl">🎉</span>
            </motion.div>
            <h3 className="text-2xl font-black">Name Linked!</h3>
            <p className="text-sm opacity-60">
              Your alias is now live on Base.
            </p>
            <button
              onClick={resetLinkForm}
              className="w-full py-4 bg-salvaGold text-black font-black rounded-xl hover:brightness-110 transition-all"
            >
              Link Another Name
            </button>
          </motion.div>
        )}
      </div>

      {/* Unlink Confirm Modal */}
      <AnimatePresence>
        {showUnlinkConfirm && unlinkTarget && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              onClick={() => setShowUnlinkConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center">
                <span className="text-4xl mb-4 block">⚠️</span>
                <h3 className="text-xl font-black mb-2">Unlink Name?</h3>
                <p className="text-salvaGold font-black mb-2">
                  {unlinkTarget.name}
                </p>
                <p className="text-sm opacity-60 mb-6">
                  This removes the link on-chain. Someone else could claim this
                  name after.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowUnlinkConfirm(false);
                      setUnlinkPinStep(true);
                      setUnlinkPinInput("");
                    }}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:brightness-110"
                  >
                    Yes, Unlink
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Unlink PIN Modal */}
      <AnimatePresence>
        {unlinkPinStep && unlinkTarget && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              onClick={() => {
                setUnlinkPinStep(false);
                setUnlinkPinInput("");
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-gray-200 dark:border-white/10 shadow-2xl text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="w-14 h-14 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🔐</span>
              </div>
              <h3 className="text-xl font-black mb-1">Enter PIN to Unlink</h3>
              <p className="text-sm opacity-60 mb-5">
                Confirm you are unlinking{" "}
                <strong className="text-red-400">{unlinkTarget.name}</strong>
              </p>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={unlinkPinInput}
                onChange={(e) =>
                  setUnlinkPinInput(e.target.value.replace(/\D/g, ""))
                }
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/10 focus:border-red-400 outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setUnlinkPinStep(false);
                    setUnlinkPinInput("");
                  }}
                  disabled={unlinkLoading}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteUnlink}
                  disabled={unlinkLoading || unlinkPinInput.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-bold text-sm hover:brightness-110 disabled:opacity-50"
                >
                  {unlinkLoading ? "Unlinking…" : "Unlink"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Dashboard ──────────────────────────────────────────────────────────────
const Dashboard = () => {
  const navigate = useNavigate();

  // ── FIX 1: Initialize user from localStorage SYNCHRONOUSLY using lazy state init.
  // The OLD broken code used a useEffect to set user from localStorage.
  // The problem: when Login.jsx calls navigate("/dashboard"), React Router
  // mounts the Dashboard component. The component renders with user=null
  // (shows nothing). Then the useEffect fires asynchronously and calls setUser().
  // BUT — if React Router had already pre-rendered this route (common with
  // createBrowserRouter or Outlet-based layouts), the useEffect with [] deps
  // already ran ONCE with user=null and will NOT run again on navigation.
  // Result: user stays null forever → the page just shows blank / nothing,
  // giving the appearance of being "stuck" on login (login page is still visible
  // underneath or user sees a blank page and navigates back).
  //
  // THE FIX: Use useState lazy initialization (a function passed to useState)
  // to read localStorage SYNCHRONOUSLY on first render. This means user is
  // populated immediately on mount — no async gap, no stale effect problem.
  // ──────────────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem("salva_user");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      // Safety check: must have a safeAddress to be a valid session
      if (!parsed || !parsed.safeAddress) return null;
      return parsed;
    } catch {
      // If localStorage is corrupted, clear it and return null
      localStorage.removeItem("salva_user");
      return null;
    }
  });

  const [balance, setBalance] = useState("0.00");
  const [usdtBalance, setUsdtBalance] = useState("0.00");
  const [usdcBalance, setUsdcBalance] = useState("0.00");
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
  const [feePreview, setFeePreview] = useState({ feeNGN: 0, feeUsd: 0 });
  const [amountError, setAmountError] = useState(false);
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
  // Coin selection: "NGN" | "USDT" | "USDC"
  const [selectedCoin, setSelectedCoin] = useState("NGN");

  const showMsg = useCallback(
    (msg, type = "success") =>
      setNotification({ show: true, message: msg, type }),
    [],
  );
  const closeNotif = useCallback(
    () => setNotification((n) => ({ ...n, show: false })),
    [],
  );

  // ── FIX 2: Redirect to login if no valid user session.
  // This runs after the synchronous state init above.
  // If user is null (no localStorage, corrupted data, or missing safeAddress),
  // redirect to login. We use useNavigate (React Router) instead of
  // window.location.href so the redirect is handled cleanly by the router.
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      navigate("/login", { replace: true });
    }
  }, [user, navigate]);

  // ── FIX 3: Refresh user validator/alias status from server on mount.
  // Only run when we have a valid user. We also removed the overly strict
  // condition that only updated localStorage when isValidator changed —
  // now we also sync nameAlias properly (matching old dashboard behavior).
  // ──────────────────────────────────────────────────────────────────────────
  const refreshUserStatus = useCallback(async (email, currentUser) => {
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/user/status/${encodeURIComponent(email)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      // Update if either isValidator or nameAlias has changed (restored old behavior)
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
    } catch {
      // Silently ignore — not critical
    }
  }, []);

  // ── Fetch balance, meta, and account status when user is available ────────
  useEffect(() => {
    if (!user?.safeAddress) return;
    fetchBalance(user.safeAddress);
    refreshUserStatus(user.email, user);
  }, [user?.safeAddress, refreshUserStatus]);

  useEffect(() => {
    if (!user?.email) return;
    checkAccountStatus();
    fetchMeta();
  }, [user?.email]);

  // ── Poll balance every 30 seconds ─────────────────────────────────────────
  useEffect(() => {
    if (!user?.safeAddress) return;
    const interval = setInterval(() => fetchBalance(user.safeAddress), 30000);
    return () => clearInterval(interval);
  }, [user?.safeAddress]);

  // ── Amount error check ────────────────────────────────────────────────────
  useEffect(() => {
    if (transferAmount) {
      const amt = parseFloat(transferAmount);
      if (selectedCoin === "NGN") {
        setAmountError(!isNaN(amt) && amt > parseFloat(balance));
      } else if (selectedCoin === "USDT") {
        setAmountError(!isNaN(amt) && amt > parseFloat(usdtBalance));
      } else {
        setAmountError(!isNaN(amt) && amt > parseFloat(usdcBalance));
      }
    } else {
      setAmountError(false);
    }
  }, [transferAmount, balance, usdtBalance, usdcBalance, selectedCoin]);

  // ── Fetchers ────────────────────────────────────────────────────────────────
  const fetchBalance = async (address) => {
    if (!address) return; // Guard: don't fetch without an address
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setBalance(parseFloat(data.balance || 0).toFixed(2));
      setUsdtBalance(parseFloat(data.usdtBalance || 0).toFixed(2));
      setUsdcBalance(parseFloat(data.usdcBalance || 0).toFixed(2));
    } catch {
      // Keep existing balances on error — don't reset to 0
    }
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
      if (regsArray.length === 1) setSelectedRegistry(regsArray[0]);
    } catch {}
  };

  const checkAccountStatus = async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(user.email)}`,
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

  const computeFeePreview = (amount, coin) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || !amount) {
      setFeePreview({ feeNGN: 0, feeUsd: 0 });
      return;
    }
    if (coin === "NGN" && feeConfig) {
      let fee = 0;
      if (amt >= feeConfig.tier2Min) fee = feeConfig.tier2Fee;
      else if (amt >= feeConfig.tier1Min && amt <= feeConfig.tier1Max)
        fee = feeConfig.tier1Fee;
      setFeePreview({ feeNGN: fee, feeUsd: 0 });
    } else if (coin === "USDT" || coin === "USDC") {
      setFeePreview({ feeNGN: 0, feeUsd: amt >= 5 ? 0.015 : 0 });
    }
  };

  const handleRecipientChange = (val) => {
    setRecipientInput(val);
    const type = detectInputType(val);
    setInputType(type);
    if (type === "address") setSelectedRegistry(null);
    else if (type === "name" && registries.length === 1)
      setSelectedRegistry(registries[0]);
  };

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
    setFeePreview({ feeNGN: 0, feeUsd: 0 });
    setSelectedCoin("NGN");
  };

  const resolveAndConfirm = async () => {
    if (!recipientInput || !transferAmount)
      return showMsg("Fill all fields", "error");
    const type = detectInputType(recipientInput);
    if (type === "name" && !selectedRegistry)
      return showMsg("Select a wallet service", "error");

    setLoading(true);
    try {
      let resolvedAddress = null;
      let displayIdentifier = recipientInput.trim();

      if (type === "address") {
        resolvedAddress = recipientInput.trim().toLowerCase();
      } else {
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
        feeUsd: feePreview.feeUsd,
        coin: selectedCoin,
      });
      setIsConfirmModalOpen(true);
    } catch {
      showMsg("Failed to resolve recipient", "error");
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async (privateKey, capturedData) => {
    setIsPinModalOpen(false);
    setIsConfirmModalOpen(false);
    setIsSendOpen(false);
    resetSendForm();
    showMsg("Transaction queued — sending…", "info");
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: capturedData.rawInput,
          amount: capturedData.amount,
          registryAddress: capturedData.registryAddress || null,
          inputType: capturedData.inputType,
          coin: capturedData.coin,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg("✅ Transfer Successful!");
        setTimeout(() => fetchBalance(user.safeAddress), 3500);
      } else showMsg(data.message || "Transfer failed", "error");
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
        setTransactionPin("");
        setPinAttempts(0);
        setLoading(false);
        await executeTransfer(data.privateKey, capturedData);
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

  // ── FIX 4: While user is null (before lazy init resolves or redirect fires),
  // show a loading spinner instead of null / blank white screen.
  // This prevents the jarring blank flash and gives users feedback.
  // ──────────────────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#0A0A0B]">
        <div className="text-salvaGold font-black text-2xl animate-pulse">
          LOADING...
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "buy", label: "Buy NGNs" },
    { id: "names", label: "Link a Name" },
    ...(user.isValidator ? [{ id: "admin", label: "Admin Panel" }] : []),
  ];

  const showRegistryDropdown = inputType === "name";
  const currentCoinBalance =
    selectedCoin === "NGN"
      ? balance
      : selectedCoin === "USDT"
        ? usdtBalance
        : usdcBalance;
  const coinSymbol = selectedCoin === "NGN" ? "NGNs" : selectedCoin;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">
        {/* Header */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-salvaGold font-bold">
              Salva Citizen{user.isValidator ? " · Validator" : ""}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black truncate max-w-[220px] sm:max-w-none">
              {user.username}
            </h2>
          </div>
        </header>

        {/* Balance Card */}
        <BalanceCard
          balance={balance}
          usdtBalance={usdtBalance}
          usdcBalance={usdcBalance}
          showBalance={showBalance}
          onToggleVisibility={() => setShowBalance(!showBalance)}
          onSend={handleTransferClick}
          onReceive={() => {
            navigator.clipboard.writeText(user.safeAddress);
            showMsg("Wallet address copied!");
          }}
        />

        {/* Wallet Address */}
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

        {/* View Transactions */}
        <Link
          to="/transactions"
          className="block mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 hover:border-salvaGold/30 transition-all text-center"
        >
          <p className="text-xs font-black uppercase tracking-widest text-salvaGold">
            View Transaction History →
          </p>
        </Link>

        {/* Tabs */}
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

        {/* Buy NGNs Tab */}
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

        {/* Link a Name Tab */}
        {activeTab === "names" && (
          <LinkNameTab user={user} registries={registries} showMsg={showMsg} />
        )}

        {/* Admin Panel Tab */}
        {activeTab === "admin" && user.isValidator && (
          <AdminPanel user={user} showMsg={showMsg} />
        )}
      </div>

      {/* No PIN Warning */}
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

      {/* Send Modal */}
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
              <h3 className="text-2xl sm:text-3xl font-black mb-1">Send</h3>
              <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-6">
                Salva Secure Transfer
              </p>

              {/* Coin Selector */}
              <div className="mb-5">
                <label className="text-[10px] uppercase opacity-40 font-bold block mb-2">
                  Select Token
                </label>
                <div className="flex gap-2">
                  {["NGN", "USDT", "USDC"].map((coin) => (
                    <button
                      key={coin}
                      onClick={() => {
                        setSelectedCoin(coin);
                        setTransferAmount("");
                        setTransferAmountDisplay("");
                        setFeePreview({ feeNGN: 0, feeUsd: 0 });
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all border ${
                        selectedCoin === coin
                          ? "bg-salvaGold text-black border-salvaGold"
                          : "border-white/10 opacity-50 hover:opacity-80"
                      }`}
                    >
                      {coin === "NGN" ? "NGNs" : coin}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] opacity-30 mt-1.5">
                  Balance:{" "}
                  {showBalance ? formatNumber(currentCoinBalance) : "••••"}{" "}
                  {coinSymbol}
                </p>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resolveAndConfirm();
                }}
                className="space-y-5"
              >
                {/* Recipient */}
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
                    Amount ({coinSymbol})
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
                        computeFeePreview(raw, selectedCoin);
                      }}
                      className={`w-full p-4 rounded-xl text-lg font-bold bg-gray-100 dark:bg-white/5 outline-none transition-all ${
                        amountError
                          ? "border border-red-500 text-red-500"
                          : "border border-transparent"
                      }`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">
                      {coinSymbol}
                    </span>
                  </div>
                  {amountError && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold animate-pulse">
                      ⚠️ Insufficient balance
                    </p>
                  )}
                  {/* NGN fee preview */}
                  {selectedCoin === "NGN" &&
                    feePreview.feeNGN > 0 &&
                    transferAmount &&
                    !amountError && (
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
                  {/* USD fee preview */}
                  {(selectedCoin === "USDT" || selectedCoin === "USDC") &&
                    transferAmount &&
                    !amountError && (
                      <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 text-[10px]">
                        <div className="flex justify-between">
                          <span className="opacity-50 uppercase font-bold">
                            Network Fee
                          </span>
                          <span
                            className={
                              feePreview.feeUsd > 0
                                ? "text-red-400 font-black"
                                : "text-green-400 font-black"
                            }
                          >
                            {feePreview.feeUsd > 0
                              ? `-${feePreview.feeUsd} ${selectedCoin}`
                              : "Free"}
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

      {/* Confirmation Modal */}
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
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-lg border border-gray-200 dark:border-white/10 shadow-2xl"
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
                  <p className="font-black text-sm sm:text-base text-salvaGold break-all leading-snug">
                    {confirmationData.displayIdentifier}
                  </p>
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
                    <span className="text-salvaGold">
                      {confirmationData.coin === "NGN"
                        ? "NGNs"
                        : confirmationData.coin}
                    </span>
                  </p>
                </div>
                {(confirmationData.feeNGN > 0 ||
                  confirmationData.feeUsd > 0) && (
                  <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10">
                    <p className="text-[10px] opacity-60 mb-1">Network Fee</p>
                    <p className="font-black text-base text-red-400">
                      {confirmationData.feeNGN > 0
                        ? `-${formatNumber(confirmationData.feeNGN)} NGNs`
                        : `-${confirmationData.feeUsd} ${confirmationData.coin}`}
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

      {/* PIN Modal */}
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
                  ⚠️ {3 - pinAttempts} attempt{3 - pinAttempts !== 1 ? "s" : ""}{" "}
                  remaining
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

      {/* Notification */}
      <AnimatePresence>
        {notification.show && (
          <SalvaNotification notification={notification} onClose={closeNotif} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
