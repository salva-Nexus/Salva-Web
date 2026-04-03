// Salva-Digital-Tech/packages/frontend/src/pages/AdminPanel.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useCallback, Component } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Error Boundary ──────────────────────────────────────────────────────────
class AdminErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("AdminPanel crashed:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 rounded-3xl border border-red-500/30 bg-red-500/5 text-center">
          <p className="text-red-400 font-black text-lg mb-2">⚠️ Admin Panel Error</p>
          <p className="text-sm opacity-60 mb-4">Something went wrong.</p>
          <p className="text-xs text-red-400/60 font-mono mb-4">{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2 bg-salvaGold text-black font-black rounded-xl text-xs uppercase"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Live countdown timer ────────────────────────────────────────────────────
const TimelockCountdown = ({ timeLockTimestamp }) => {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const calc = () => {
      const now = Math.floor(Date.now() / 1000);
      const diff = timeLockTimestamp - now;
      if (diff <= 0) {
        setRemaining("READY");
        return;
      }
      const h = Math.floor(diff / 3600);
      const m = Math.floor((diff % 3600) / 60);
      const s = diff % 60;
      setRemaining(`${h}h ${m}m ${s}s`);
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [timeLockTimestamp]);

  const isReady = remaining === "READY";
  return (
    <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
      isReady ? "bg-green-500/10 text-green-400" : "bg-salvaGold/10 text-salvaGold"
    }`}>
      {isReady ? "✓ READY TO EXECUTE" : `⏱ ${remaining}`}
    </span>
  );
};

const isTimelockReady = (ts) => {
  if (!ts) return false;
  return Math.floor(Date.now() / 1000) >= ts;
};

// ── Registry proposal card ──────────────────────────────────────────────────
const RegistryCard = ({ p, i, hasVoted, loading, onValidate, onExecute, onCancel }) => {
  const timelockReady = isTimelockReady(p.timeLockTimestamp);
  const canExecute = p.isValidated && timelockReady;
  const quorumReached = p.remainingValidation === 0 || p.isValidated;

  return (
    <motion.div
      key={p._id || i}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06 }}
      className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4"
    >
      {/* Info row */}
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
        <div className="space-y-1 min-w-0">
          <p className="font-black text-lg text-white truncate">
            {p.registryName || p.nspace}
          </p>
          <p className="text-salvaGold font-black text-sm">{p.nspace}</p>
          <p className="font-mono text-[10px] opacity-40 break-all">{p.registry}</p>
          {/* isWallet badge */}
          <span className={`inline-block text-[10px] font-black uppercase px-2 py-0.5 rounded-lg ${
            p.isWallet
              ? "bg-blue-500/10 text-blue-400"
              : "bg-white/5 text-white/30"
          }`}>
            {p.isWallet ? "🔵 Crypto Wallet" : "⚙️ Non-Wallet Registry"}
          </span>
        </div>

        {/* Vote remaining + timelock badges */}
        <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
          {p.remainingValidation !== null && p.remainingValidation !== undefined ? (
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
              quorumReached
                ? "bg-green-500/10 text-green-400"
                : "bg-white/5 text-white/60"
            }`}>
              {quorumReached
                ? "✓ QUORUM REACHED"
                : `${p.remainingValidation} VOTE${p.remainingValidation !== 1 ? "S" : ""} REMAINING`}
            </span>
          ) : (
            <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-white/5 text-white/40">
              READING VOTES...
            </span>
          )}

          {p.isValidated && p.timeLockTimestamp && (
            <TimelockCountdown timeLockTimestamp={p.timeLockTimestamp} />
          )}

          {p.isValidated && !p.timeLockTimestamp && (
            <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-salvaGold/10 text-salvaGold">
              ⏳ TIMELOCK STARTING...
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {!quorumReached && (
          hasVoted ? (
            <span className="px-4 py-2 rounded-xl bg-white/5 text-white/30 font-black text-[10px] uppercase">
              ✓ Voted
            </span>
          ) : (
            <button
              onClick={() => onValidate(p)}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-salvaGold/10 border border-salvaGold/30 text-salvaGold font-black text-[10px] uppercase hover:bg-salvaGold hover:text-black transition-all disabled:opacity-40"
            >
              Validate
            </button>
          )
        )}

        {quorumReached && (
          <button
            onClick={() => canExecute ? onExecute(p) : null}
            disabled={loading || !canExecute}
            title={!canExecute ? "48-hour security timelock must expire first" : "Execute registry initialization"}
            className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase transition-all border ${
              canExecute
                ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500 hover:text-white cursor-pointer"
                : "bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {canExecute ? "⚡ Execute" : "🔒 Locked"}
          </button>
        )}

        <button
          onClick={() => onCancel(p)}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
};

// ── Validator proposal card ─────────────────────────────────────────────────
const ValidatorCard = ({ p, i, hasVoted, loading, onValidate, onExecute, onCancel }) => {
  const timelockReady = isTimelockReady(p.timeLockTimestamp);
  const canExecute = p.isValidated && timelockReady;
  const quorumReached = p.remainingValidation === 0 || p.isValidated;

  return (
    <motion.div
      key={p._id || i}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06 }}
      className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-4"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
        <div className="space-y-2 min-w-0">
          <span className={`text-xs font-black uppercase px-2 py-1 rounded-lg ${
            p.action ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
          }`}>
            {p.action ? "ADD VALIDATOR" : "REMOVE VALIDATOR"}
          </span>
          <p className="font-mono text-[10px] opacity-40 break-all">{p.addr}</p>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-2 flex-shrink-0">
          {p.remainingValidation !== null && p.remainingValidation !== undefined ? (
            <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg ${
              quorumReached
                ? "bg-green-500/10 text-green-400"
                : "bg-white/5 text-white/60"
            }`}>
              {quorumReached
                ? "✓ QUORUM REACHED"
                : `${p.remainingValidation} VOTE${p.remainingValidation !== 1 ? "S" : ""} REMAINING`}
            </span>
          ) : (
            <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-white/5 text-white/40">
              READING VOTES...
            </span>
          )}

          {p.isValidated && p.timeLockTimestamp && (
            <TimelockCountdown timeLockTimestamp={p.timeLockTimestamp} />
          )}

          {p.isValidated && !p.timeLockTimestamp && (
            <span className="text-[10px] font-black uppercase px-2 py-1 rounded-lg bg-salvaGold/10 text-salvaGold">
              ⏳ TIMELOCK STARTING...
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {!quorumReached && (
          hasVoted ? (
            <span className="px-4 py-2 rounded-xl bg-white/5 text-white/30 font-black text-[10px] uppercase">
              ✓ Voted
            </span>
          ) : (
            <button
              onClick={() => onValidate(p)}
              disabled={loading}
              className="px-4 py-2 rounded-xl bg-salvaGold/10 border border-salvaGold/30 text-salvaGold font-black text-[10px] uppercase hover:bg-salvaGold hover:text-black transition-all disabled:opacity-40"
            >
              Validate
            </button>
          )
        )}

        {quorumReached && (
          <button
            onClick={() => canExecute ? onExecute(p) : null}
            disabled={loading || !canExecute}
            title={!canExecute ? "48-hour security timelock must expire first" : "Execute validator update"}
            className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase transition-all border ${
              canExecute
                ? "bg-green-500/10 border-green-500/30 text-green-400 hover:bg-green-500 hover:text-white cursor-pointer"
                : "bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
            } disabled:opacity-50`}
          >
            {canExecute ? "⚡ Execute" : "🔒 Locked"}
          </button>
        )}

        <button
          onClick={() => onCancel(p)}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-black text-[10px] uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-40"
        >
          Cancel
        </button>
      </div>
    </motion.div>
  );
};

// ── Main inner panel ────────────────────────────────────────────────────────
const AdminPanelInner = ({ user, showMsg }) => {
  const [proposals, setProposals] = useState({ registryProposals: [], validatorProposals: [] });
  const [loading, setLoading] = useState(false);
  const [fetchingProposals, setFetchingProposals] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [showRegForm, setShowRegForm] = useState(false);
  const [showValForm, setShowValForm] = useState(false);
  // isWallet added to regForm state
  const [regForm, setRegForm] = useState({ name: "", nspace: "@", address: "", isWallet: false });
  const [valForm, setValForm] = useState({ address: "", action: true });

  const [isPinOpen, setIsPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pendingAdminAction, setPendingAdminAction] = useState(null);

  const VOTE_KEY = `salva_votes_v2_${user.safeAddress}`;
  const [myVotes, setMyVotes] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VOTE_KEY) || "{}"); }
    catch { return {}; }
  });

  const persistVote = (proposalId) => {
    const updated = { ...myVotes, [proposalId]: true };
    setMyVotes(updated);
    localStorage.setItem(VOTE_KEY, JSON.stringify(updated));
  };

  const patchProposal = (updated) => {
    if (!updated) return;
    setProposals((prev) => {
      if (updated.type === "registry") {
        return {
          ...prev,
          registryProposals: prev.registryProposals.map((p) =>
            p._id === updated._id ? { ...p, ...updated } : p
          ),
        };
      }
      return {
        ...prev,
        validatorProposals: prev.validatorProposals.map((p) =>
          p._id === updated._id ? { ...p, ...updated } : p
        ),
      };
    });
  };

  const fetchProposals = useCallback(async () => {
    try {
      setFetchError(null);
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposals`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setProposals({
        registryProposals: Array.isArray(data.registryProposals) ? data.registryProposals : [],
        validatorProposals: Array.isArray(data.validatorProposals) ? data.validatorProposals : [],
      });
    } catch (e) {
      setFetchError(e.message || "Failed to load proposals");
    } finally {
      setFetchingProposals(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 15000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  const requestPin = (actionFn) => {
    setPendingAdminAction(() => actionFn);
    setAdminPin("");
    setIsPinOpen(true);
  };

  const executePinnedAction = async () => {
    if (adminPin.length !== 4) return showMsg("PIN must be 4 digits", "error");
    setLoading(true);
    setIsPinOpen(false);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin: adminPin }),
      });
      const data = await res.json();
      if (!res.ok) { showMsg(data.message || "Invalid PIN", "error"); return; }
      setAdminPin("");
      await pendingAdminAction(data.privateKey);
    } catch (e) {
      showMsg(e.message || "Action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Actions ────────────────────────────────────────────────────────────
  const handleProposeRegistry = () => {
    if (!regForm.name || !regForm.nspace.startsWith("@") || !regForm.address)
      return showMsg("Fill all fields. Namespace must start with @", "error");
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/propose-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // isWallet passed to backend
        body: JSON.stringify({
          privateKey,
          nspace: regForm.nspace,
          registry: regForm.address,
          registryName: regForm.name,
          isWallet: regForm.isWallet,
          safeAddress: user.safeAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to propose registry");
      showMsg("Registry proposal submitted!");
      setShowRegForm(false);
      setRegForm({ name: "", nspace: "@", address: "", isWallet: false });
      await fetchProposals();
    });
  };

  const handleProposeValidator = () => {
    if (!valForm.address) return showMsg("Enter target address", "error");
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/propose-validator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, targetAddress: valForm.address, action: valForm.action, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to propose validator");
      showMsg("Validator update proposal submitted!");
      setShowValForm(false);
      setValForm({ address: "", action: true });
      await fetchProposals();
    });
  };

  const handleValidateRegistry = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/validate-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, registry: proposal.registry, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to validate registry");
      persistVote(proposal._id);
      showMsg("Validation cast!");
      if (data.proposal) patchProposal(data.proposal);
      else await fetchProposals();
    });
  };

  const handleValidateValidator = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/validate-validator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, targetAddress: proposal.addr, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to validate validator");
      persistVote(proposal._id);
      showMsg("Validation cast!");
      if (data.proposal) patchProposal(data.proposal);
      else await fetchProposals();
    });
  };

  const handleCancelRegistry = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/cancel-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, registry: proposal.registry, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel");
      showMsg("Proposal cancelled and removed");
      await fetchProposals();
    });
  };

  const handleCancelValidator = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/cancel-validator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, targetAddress: proposal.addr, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to cancel");
      showMsg("Proposal cancelled and removed");
      await fetchProposals();
    });
  };

  const handleExecuteRegistry = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/execute-registry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          privateKey,
          registry: proposal.registry,
          registryName: proposal.registryName || proposal.nspace,
          nspace: proposal.nspace,
          safeAddress: user.safeAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to execute registry");
      showMsg(
        proposal.isWallet
          ? "Registry initialized and live on Salva!"
          : "Registry initialized on-chain (not a wallet, not added to transfer list).",
      );
      await fetchProposals();
    });
  };

  const handleExecuteValidator = (proposal) => {
    requestPin(async (privateKey) => {
      const res = await fetch(`${SALVA_API_URL}/api/admin/execute-validator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ privateKey, targetAddress: proposal.addr, action: proposal.action, safeAddress: user.safeAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to execute validator update");
      showMsg("Validator updated!");
      await fetchProposals();
    });
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">Admin Panel</p>
          <h3 className="text-2xl font-black">MultiSig Control</h3>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setShowRegForm(!showRegForm); setShowValForm(false); }}
            disabled={loading}
            className="px-4 py-2 bg-salvaGold text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50"
          >
            + Registry
          </button>
          <button
            onClick={() => { setShowValForm(!showValForm); setShowRegForm(false); }}
            disabled={loading}
            className="px-4 py-2 border border-salvaGold text-salvaGold font-black text-xs uppercase tracking-widest rounded-xl hover:bg-salvaGold hover:text-black transition-all disabled:opacity-50"
          >
            + Validator
          </button>
        </div>
      </div>

      {/* Loading banner */}
      {loading && (
        <div className="p-4 rounded-2xl bg-salvaGold/10 border border-salvaGold/30 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-salvaGold font-bold">Submitting on-chain… this may take 30–60 seconds.</p>
        </div>
      )}

      {/* Fetch error */}
      {fetchError && (
        <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-between gap-4">
          <p className="text-xs text-red-400 font-bold">⚠️ {fetchError}</p>
          <button
            onClick={fetchProposals}
            className="text-[10px] text-salvaGold font-black uppercase tracking-widest border border-salvaGold/30 px-3 py-1 rounded-lg hover:bg-salvaGold hover:text-black transition-all"
          >
            Retry
          </button>
        </div>
      )}

      {/* Propose Registry Form */}
      <AnimatePresence>
        {showRegForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 rounded-3xl border border-salvaGold/30 bg-salvaGold/5 space-y-4">
              <p className="text-xs uppercase tracking-widest font-black text-salvaGold">
                Propose Registry Initialization
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Registry Name</label>
                  <input
                    placeholder="e.g. Trust Wallet"
                    value={regForm.name}
                    onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-salvaGold outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Namespace (must start with @)</label>
                  <input
                    placeholder="@trustwallet"
                    value={regForm.nspace}
                    onChange={(e) => setRegForm({ ...regForm, nspace: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-salvaGold outline-none text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Registry Contract Address</label>
                  <input
                    placeholder="0x..."
                    value={regForm.address}
                    onChange={(e) => setRegForm({ ...regForm, address: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-salvaGold outline-none text-sm font-bold font-mono"
                  />
                </div>
              </div>

              {/* ── isWallet checkbox ── */}
              <label className="flex items-center gap-3 cursor-pointer group w-fit">
                <div
                  onClick={() => setRegForm({ ...regForm, isWallet: !regForm.isWallet })}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${
                    regForm.isWallet
                      ? "bg-blue-500 border-blue-500"
                      : "border-white/20 bg-black/20 group-hover:border-white/40"
                  }`}
                >
                  {regForm.isWallet && (
                    <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                <div onClick={() => setRegForm({ ...regForm, isWallet: !regForm.isWallet })}>
                  <p className="text-xs font-black text-white">This is a crypto wallet</p>
                  <p className="text-[10px] opacity-40">
                    {regForm.isWallet
                      ? "Will be added to the transfer wallet list for Salva users"
                      : "Will not appear in the transfer wallet list"}
                  </p>
                </div>
              </label>

              <div className="flex gap-3">
                <button
                  onClick={() => setShowRegForm(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl border border-white/10 font-bold text-xs uppercase hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProposeRegistry}
                  disabled={loading}
                  className="px-6 py-2 rounded-xl bg-salvaGold text-black font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {loading ? "Submitting…" : "Submit Proposal"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Propose Validator Form */}
      <AnimatePresence>
        {showValForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 rounded-3xl border border-white/10 bg-white/5 space-y-4">
              <p className="text-xs uppercase tracking-widest font-black text-salvaGold">Propose Validator Update</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Target Wallet Address</label>
                  <input
                    placeholder="0x..."
                    value={valForm.address}
                    onChange={(e) => setValForm({ ...valForm, address: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 focus:border-salvaGold outline-none text-sm font-bold font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase opacity-40 font-bold block mb-1">Action</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setValForm({ ...valForm, action: true })}
                      className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${
                        valForm.action ? "bg-green-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"
                      }`}
                    >
                      Add Validator
                    </button>
                    <button
                      onClick={() => setValForm({ ...valForm, action: false })}
                      className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${
                        !valForm.action ? "bg-red-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"
                      }`}
                    >
                      Remove Validator
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowValForm(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl border border-white/10 font-bold text-xs uppercase hover:bg-white/5 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleProposeValidator}
                  disabled={loading}
                  className="px-6 py-2 rounded-xl bg-salvaGold text-black font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
                >
                  {loading ? "Submitting…" : "Submit Proposal"}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Registry Proposals */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-4">Registry Proposals</p>
        {fetchingProposals ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : proposals.registryProposals.length === 0 ? (
          <div className="text-center py-8 opacity-20">
            <p className="text-xs uppercase font-bold tracking-widest">No active registry proposals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.registryProposals.map((p, i) =>
              p && p.registry ? (
                <RegistryCard
                  key={p._id || i}
                  p={p}
                  i={i}
                  hasVoted={!!myVotes[p._id]}
                  loading={loading}
                  onValidate={handleValidateRegistry}
                  onExecute={handleExecuteRegistry}
                  onCancel={handleCancelRegistry}
                />
              ) : null
            )}
          </div>
        )}
      </div>

      {/* Validator Proposals */}
      <div>
        <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-4">Validator Proposals</p>
        {fetchingProposals ? (
          <div className="flex justify-center py-8">
            <div className="w-8 h-8 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : proposals.validatorProposals.length === 0 ? (
          <div className="text-center py-8 opacity-20">
            <p className="text-xs uppercase font-bold tracking-widest">No active validator proposals</p>
          </div>
        ) : (
          <div className="space-y-4">
            {proposals.validatorProposals.map((p, i) =>
              p && p.addr ? (
                <ValidatorCard
                  key={p._id || i}
                  p={p}
                  i={i}
                  hasVoted={!!myVotes[p._id]}
                  loading={loading}
                  onValidate={handleValidateValidator}
                  onExecute={handleExecuteValidator}
                  onCancel={handleCancelValidator}
                />
              ) : null
            )}
          </div>
        )}
      </div>

      {/* PIN Modal */}
      <AnimatePresence>
        {isPinOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <motion.div
              onClick={() => { setIsPinOpen(false); setAdminPin(""); }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-white/10 shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-2xl">🔐</span>
                </div>
                <h3 className="text-xl font-black mb-1">Admin Verification</h3>
                <p className="text-xs opacity-50">Enter your transaction PIN to sign</p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && adminPin.length === 4 && executePinnedAction()}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => { setIsPinOpen(false); setAdminPin(""); }}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm hover:bg-white/5"
                >
                  Cancel
                </button>
                <button
                  onClick={executePinnedAction}
                  disabled={adminPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold text-sm hover:brightness-110 disabled:opacity-50"
                >
                  Sign
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const AdminPanel = (props) => (
  <AdminErrorBoundary>
    <AdminPanelInner {...props} />
  </AdminErrorBoundary>
);

export default AdminPanel;