// Salva-Digital-Tech/packages/frontend/src/pages/AdminPanel.jsx
import { SALVA_API_URL } from "../config";
import React, { useState, useEffect, useCallback, Component } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Error Boundary ────────────────────────────────────────────────────────────
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
          <p className="text-red-400 font-black text-lg mb-2">
            ⚠️ Admin Panel Error
          </p>
          <p className="text-xs opacity-60 mb-4 font-mono">
            {this.state.error?.message}
          </p>
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

// ── Timelock Countdown ────────────────────────────────────────────────────────
const TimelockCountdown = ({ timeLockTimestamp }) => {
  const [remaining, setRemaining] = useState("");
  useEffect(() => {
    const calc = () => {
      const diff = timeLockTimestamp - Math.floor(Date.now() / 1000);
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
    <span
      className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${isReady ? "bg-green-500/10 text-green-400" : "bg-salvaGold/10 text-salvaGold"}`}
    >
      {isReady ? "✓ READY" : `⏱ ${remaining}`}
    </span>
  );
};

// ── Section Header ────────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, subtitle, accent = "salvaGold" }) => (
  <div className="flex items-start gap-3 mb-6">
    <div
      className={`w-10 h-10 rounded-2xl flex items-center justify-center text-lg flex-shrink-0 bg-${accent}/10`}
    >
      {icon}
    </div>
    <div>
      <p
        className={`text-[10px] uppercase tracking-[0.3em] font-black text-${accent} opacity-70`}
      >
        {subtitle}
      </p>
      <h3 className="text-xl font-black tracking-tight">{title}</h3>
    </div>
  </div>
);

// ── Proposal Card ─────────────────────────────────────────────────────────────
const ProposalCard = ({ children, borderColor = "white/10" }) => (
  <div
    className={`p-5 rounded-2xl border border-gray-200 dark:border-${borderColor} bg-white dark:bg-white/[0.03] space-y-4 shadow-sm dark:shadow-none`}
  >
    {children}
  </div>
);

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ label, color }) => {
  const colors = {
    green: "bg-green-500/10 text-green-400",
    red: "bg-red-500/10 text-red-400",
    gold: "bg-salvaGold/10 text-salvaGold",
    blue: "bg-blue-500/10 text-blue-400",
    gray: "bg-white/5 text-white/40",
  };
  return (
    <span
      className={`text-[10px] font-black uppercase px-2 py-1 rounded-lg tracking-widest ${colors[color] || colors.gray}`}
    >
      {label}
    </span>
  );
};

// ── Action Button ─────────────────────────────────────────────────────────────
const ActionBtn = ({
  label,
  onClick,
  disabled,
  variant = "default",
  spinning = false,
}) => {
  const variants = {
    default:
      "bg-salvaGold/10 border-2 border-salvaGold text-salvaGold hover:bg-salvaGold hover:text-black",
    danger:
      "bg-red-500/10 border-2 border-red-500 text-red-400 hover:bg-red-500 hover:text-white",
    green:
      "bg-green-500/10 border-2 border-green-500 text-green-400 hover:bg-green-500 hover:text-black",
    ghost:
      "bg-white/5 border-2 border-white/20 text-white/40 cursor-not-allowed",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-4 py-2 rounded-xl font-black text-[10px] uppercase border-2 transition-all flex items-center gap-1.5 ${disabled ? variants.ghost : variants[variant]} disabled:opacity-40`}
    >
      {spinning && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      {label}
    </button>
  );
};

// ── Input Field ───────────────────────────────────────────────────────────────
const Field = ({ label, children, hint }) => (
  <div>
    <label className="text-[10px] uppercase opacity-40 font-bold block mb-1.5">
      {label}
    </label>
    {children}
    {hint && <p className="text-[10px] opacity-30 mt-1 ml-1">{hint}</p>}
  </div>
);

const Input = ({ placeholder, value, onChange, mono = false, ...props }) => (
  <input
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`w-full p-3.5 rounded-xl bg-black/30 border border-white/10 focus:border-salvaGold outline-none text-sm font-bold ${mono ? "font-mono" : ""}`}
    {...props}
  />
);

// ══════════════════════════════════════════════════════════════════════════════
// MAIN INNER PANEL
// ══════════════════════════════════════════════════════════════════════════════

const AdminPanelInner = ({ user, showMsg }) => {
  // ── State ──────────────────────────────────────────────────────────────────
  const [proposals, setProposals] = useState({
    registryProposals: [],
    validatorProposals: [],
    upgradeProposals: [],
    signerUpdateProposals: [],
    baseRegistryImplProposals: [],
    unpauseProposals: [],
  });
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeSection, setActiveSection] = useState("overview");

  // Forms
  const [regForm, setRegForm] = useState({
    name: "",
    nspace: "@",
    isWallet: false,
  });
  const [valForm, setValForm] = useState({ address: "", action: true });
  const [upgradeForm, setUpgradeForm] = useState({
    proxy: "",
    newImpl: "",
    isMultisig: false,
  });
  const [signerForm, setSignerForm] = useState({ proxy: "", newSigner: "" });
  const [implForm, setImplForm] = useState({ proxy: "", newImpl: "" });
  const [feeForm, setFeeForm] = useState({ proxy: "", newFee: "" });
  const [pauseForm, setPauseForm] = useState({ proxy: "", mark: 1 });
  const [unpauseForm, setUnpauseForm] = useState({ proxy: "", mark: 1 });
  const [withdrawForm, setWithdrawForm] = useState({
    singleton: "",
    token: "",
    receiver: "",
  });
  const [recoveryForm, setRecoveryForm] = useState({
    address: "",
    action: true,
  });
  const [cancelForms, setCancelForms] = useState({
    registry: "",
    validator: "",
    upgrade: "",
    signer: "",
    impl: "",
    unpause: "",
  });
  const setCancel = (type, val) =>
    setCancelForms((p) => ({ ...p, [type]: val }));

  // PIN modal
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pendingAdminAction, setPendingAdminAction] = useState(null);

  // ── Fetch proposals ────────────────────────────────────────────────────────
  const fetchProposals = useCallback(async () => {
    setFetching(true);
    try {
      setFetchError(null);
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposals`);
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      setProposals({
        registryProposals: Array.isArray(data.registryProposals)
          ? data.registryProposals
          : [],
        validatorProposals: Array.isArray(data.validatorProposals)
          ? data.validatorProposals
          : [],
        upgradeProposals: Array.isArray(data.upgradeProposals)
          ? data.upgradeProposals
          : [],
        signerUpdateProposals: Array.isArray(data.signerUpdateProposals)
          ? data.signerUpdateProposals
          : [],
        baseRegistryImplProposals: Array.isArray(data.baseRegistryImplProposals)
          ? data.baseRegistryImplProposals
          : [],
        unpauseProposals: Array.isArray(data.unpauseProposals)
          ? data.unpauseProposals
          : [],
      });
    } catch (e) {
      setFetchError(e.message || "Failed to load proposals");
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
    const iv = setInterval(fetchProposals, 15000);
    return () => clearInterval(iv);
  }, [fetchProposals]);

  // ── PIN flow ───────────────────────────────────────────────────────────────
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
      if (!res.ok) {
        showMsg(data.message || "Invalid PIN", "error");
        return;
      }
      setAdminPin("");
      await pendingAdminAction(data.privateKey);
      await fetchProposals();
    } catch (e) {
      showMsg(e.message || "Action failed", "error");
    } finally {
      setLoading(false);
    }
  };

  // ── API helper ─────────────────────────────────────────────────────────────
  const callAdmin = async (privateKey, endpoint, body) => {
    const res = await fetch(`${SALVA_API_URL}/api/admin/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        privateKey,
        safeAddress: user.safeAddress,
        ...body,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `${endpoint} failed`);
    return data;
  };

  // ── Overview stats ─────────────────────────────────────────────────────────
  const totalProposals =
    proposals.registryProposals.length +
    proposals.validatorProposals.length +
    proposals.upgradeProposals.length +
    proposals.signerUpdateProposals.length +
    proposals.baseRegistryImplProposals.length +
    proposals.unpauseProposals.length;

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION RENDERERS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Overview ──────────────────────────────────────────────────────────────
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="🏛️"
        subtitle="Salva Protocol"
        title="MultiSig Control Center"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Active Proposals", value: totalProposals, icon: "📋" },
          {
            label: "Registry",
            value: proposals.registryProposals.length,
            icon: "🔗",
          },
          {
            label: "Validator",
            value: proposals.validatorProposals.length,
            icon: "🛡️",
          },
          {
            label: "Upgrades",
            value: proposals.upgradeProposals.length,
            icon: "⚡",
          },
          {
            label: "Signer Updates",
            value: proposals.signerUpdateProposals.length,
            icon: "🔑",
          },
          {
            label: "Unpause",
            value: proposals.unpauseProposals.length,
            icon: "▶️",
          },
        ].map((s) => (
          <div
            key={s.label}
            className="p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-gray-200 dark:border-white/5 shadow-sm dark:shadow-none"
          >
            <p className="text-xl mb-1">{s.icon}</p>
            <p className="text-2xl font-black text-salvaGold">{s.value}</p>
            <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest mt-0.5">
              {s.label}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { id: "registry", label: "Registry", icon: "🔗", color: "salvaGold" },
          {
            id: "validator",
            label: "Validators",
            icon: "🛡️",
            color: "salvaGold",
          },
          { id: "upgrades", label: "Upgrades", icon: "⚡", color: "blue-400" },
          {
            id: "signer",
            label: "Signer Update",
            icon: "🔑",
            color: "purple-400",
          },
          { id: "impl", label: "Registry Impl", icon: "📦", color: "teal-400" },
          { id: "fee", label: "Factory Fee", icon: "💰", color: "green-400" },
          {
            id: "pause",
            label: "Pause / Unpause",
            icon: "⏸️",
            color: "orange-400",
          },
          { id: "withdraw", label: "Withdraw", icon: "💸", color: "red-400" },
          { id: "recovery", label: "Recovery", icon: "🔐", color: "pink-400" },
        ].map((nav) => (
          <button
            key={nav.id}
            onClick={() => setActiveSection(nav.id)}
            className={`p-4 rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-white/[0.03] hover:border-salvaGold hover:bg-salvaGold/5 transition-all text-left group shadow-sm dark:shadow-none`}
          >
            <p className="text-xl mb-2">{nav.icon}</p>
            <p className="font-black text-sm">{nav.label}</p>
            <p className="text-[10px] opacity-30 mt-0.5 uppercase tracking-widest">
              → Manage
            </p>
          </button>
        ))}
      </div>
    </motion.div>
  );

  // ── Registry ──────────────────────────────────────────────────────────────
  const renderRegistry = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="🔗"
        subtitle="Namespace Management"
        title="Registry Initialization"
      />

      {/* Propose */}
      <div className="p-6 rounded-3xl border border-salvaGold/20 bg-salvaGold/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-salvaGold">
          Propose New Registry
        </p>
        <p className="text-[10px] opacity-50">
          Deploys a BaseRegistry clone via RegistryFactory and opens an
          initialization proposal in the MultiSig. Validators must then validate
          before the timelock and execute.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Registry Name">
            <Input
              placeholder="e.g. Trust Wallet"
              value={regForm.name}
              onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
            />
          </Field>
          <Field label="Namespace (must start with @)">
            <Input
              placeholder="@trustwallet"
              value={regForm.nspace}
              onChange={(e) =>
                setRegForm({ ...regForm, nspace: e.target.value })
              }
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 cursor-pointer group w-fit">
          <div
            onClick={() =>
              setRegForm({ ...regForm, isWallet: !regForm.isWallet })
            }
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${regForm.isWallet ? "bg-blue-500 border-blue-500" : "border-white/20 group-hover:border-white/40"}`}
          >
            {regForm.isWallet && <span className="text-white text-xs">✓</span>}
          </div>
          <div
            onClick={() =>
              setRegForm({ ...regForm, isWallet: !regForm.isWallet })
            }
          >
            <p className="text-xs font-black">This is a crypto wallet</p>
            <p className="text-[10px] opacity-40">
              {regForm.isWallet
                ? "Will appear in transfer wallet list"
                : "Will NOT appear in transfer wallet list"}
            </p>
          </div>
        </label>
        <ActionBtn
          spinning={loading}
          label={loading ? "Proposing…" : "Propose Registry"}
          disabled={loading || !regForm.name || !regForm.nspace.startsWith("@")}
          onClick={() =>
            requestPin(async (pk) => {
              const data = await callAdmin(pk, "propose-registry", {
                nspace: regForm.nspace,
                registryName: regForm.name,
                isWallet: regForm.isWallet,
              });
              showMsg(
                `Registry proposed! Clone: ${data.cloneAddress?.slice(0, 10)}…`,
              );
              setRegForm({ name: "", nspace: "@", isWallet: false });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel a Registry Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the clone address of the registry proposal to cancel it on-chain
          and clear from chain state.
        </p>
        <Field label="Registry Clone Address">
          <Input
            placeholder="0x…"
            value={cancelForms.registry}
            onChange={(e) => setCancel("registry", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.registry}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-registry", {
                registryAddress: cancelForms.registry,
              });
              showMsg("Registry proposal cancelled.");
              setCancel("registry", "");
            })
          }
        />
      </div>

      {/* Active proposals */}
      {proposals.registryProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Registry Proposals
          </p>
          <div className="space-y-3">
            {proposals.registryProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="space-y-1">
                    <StatusBadge label="Registry Init" color="gold" />
                    <p className="font-black text-salvaGold">{p.nspace}</p>
                    <p className="font-mono text-[10px] opacity-40 break-all">
                      {p.registry}
                    </p>
                    {p.isWallet && (
                      <StatusBadge label="Crypto Wallet" color="blue" />
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {p.remainingValidation !== null && (
                      <StatusBadge
                        label={
                          p.remainingValidation <= 0
                            ? "Quorum Reached"
                            : `${p.remainingValidation} Votes Needed`
                        }
                        color={p.remainingValidation <= 0 ? "green" : "gray"}
                      />
                    )}
                    {p.isValidated && p.timeLockTimestamp && (
                      <TimelockCountdown
                        timeLockTimestamp={p.timeLockTimestamp}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      variant="default"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-registry", {
                            registryAddress: p.registry,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-registry", {
                          registryAddress: p.registry,
                        });
                        showMsg("Registry initialized!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-registry", {
                          registryAddress: p.registry,
                        });
                        showMsg("Registry proposal cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Validator ─────────────────────────────────────────────────────────────
  const renderValidator = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="🛡️"
        subtitle="Governance"
        title="Validator Set Management"
      />

      <div className="p-6 rounded-3xl border border-white/10 bg-white/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-salvaGold">
          Propose Validator Update
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Target Wallet Address">
            <Input
              placeholder="0x…"
              value={valForm.address}
              onChange={(e) =>
                setValForm({ ...valForm, address: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="Action">
            <div className="flex gap-3">
              <button
                onClick={() => setValForm({ ...valForm, action: true })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${valForm.action ? "bg-green-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                Add
              </button>
              <button
                onClick={() => setValForm({ ...valForm, action: false })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${!valForm.action ? "bg-red-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                Remove
              </button>
            </div>
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Submitting…" : "Propose"}
          disabled={loading || !valForm.address}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "propose-validator", {
                targetAddress: valForm.address,
                action: valForm.action,
              });
              showMsg("Validator proposal submitted!");
              setValForm({ address: "", action: true });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel a Validator Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the target address of the validator proposal to cancel it
          on-chain.
        </p>
        <Field label="Target Wallet Address">
          <Input
            placeholder="0x…"
            value={cancelForms.validator}
            onChange={(e) => setCancel("validator", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.validator}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-validator", {
                targetAddress: cancelForms.validator,
              });
              showMsg("Validator proposal cancelled.");
              setCancel("validator", "");
            })
          }
        />
      </div>

      {proposals.validatorProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Validator Proposals
          </p>
          <div className="space-y-3">
            {proposals.validatorProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="space-y-1">
                    <StatusBadge
                      label={p.action ? "Add Validator" : "Remove Validator"}
                      color={p.action ? "green" : "red"}
                    />
                    <p className="font-mono text-[10px] opacity-40 break-all">
                      {p.addr}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {p.remainingValidation !== null && (
                      <StatusBadge
                        label={
                          p.remainingValidation <= 0
                            ? "Quorum Reached"
                            : `${p.remainingValidation} Votes Needed`
                        }
                        color={p.remainingValidation <= 0 ? "green" : "gray"}
                      />
                    )}
                    {p.isValidated && p.timeLockTimestamp && (
                      <TimelockCountdown
                        timeLockTimestamp={p.timeLockTimestamp}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-validator", {
                            targetAddress: p.addr,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-validator", {
                          targetAddress: p.addr,
                          action: p.action,
                        });
                        showMsg("Validator updated!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-validator", {
                          targetAddress: p.addr,
                        });
                        showMsg("Proposal cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Upgrades ──────────────────────────────────────────────────────────────
  const renderUpgrades = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader icon="⚡" subtitle="UUPS" title="Protocol Upgrades" />

      <div className="p-6 rounded-3xl border border-blue-500/20 bg-blue-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-blue-400">
          Propose Upgrade
        </p>
        <p className="text-[10px] opacity-50">
          Targets Singleton, Factory, or the MultiSig itself. If targeting
          MultiSig, check "Self-upgrade" and leave proxy empty.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field
            label="Proxy to Upgrade"
            hint="Leave empty if self-upgrading MultiSig"
          >
            <Input
              placeholder="0x…"
              value={upgradeForm.proxy}
              onChange={(e) =>
                setUpgradeForm({ ...upgradeForm, proxy: e.target.value })
              }
              mono
              disabled={upgradeForm.isMultisig}
            />
          </Field>
          <Field label="New Implementation Address">
            <Input
              placeholder="0x…"
              value={upgradeForm.newImpl}
              onChange={(e) =>
                setUpgradeForm({ ...upgradeForm, newImpl: e.target.value })
              }
              mono
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 cursor-pointer w-fit">
          <div
            onClick={() =>
              setUpgradeForm({
                ...upgradeForm,
                isMultisig: !upgradeForm.isMultisig,
              })
            }
            className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${upgradeForm.isMultisig ? "bg-blue-500 border-blue-500" : "border-white/20 hover:border-white/40"}`}
          >
            {upgradeForm.isMultisig && (
              <span className="text-white text-xs">✓</span>
            )}
          </div>
          <p className="text-xs font-black">Self-upgrade MultiSig proxy</p>
        </label>
        <ActionBtn
          spinning={loading}
          label={loading ? "Proposing…" : "Propose Upgrade"}
          disabled={
            loading ||
            !upgradeForm.newImpl ||
            (!upgradeForm.isMultisig && !upgradeForm.proxy)
          }
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "propose-upgrade", {
                proxyAddress: upgradeForm.proxy,
                newImplAddress: upgradeForm.newImpl,
                isMultisig: upgradeForm.isMultisig,
              });
              showMsg("Upgrade proposed!");
              setUpgradeForm({ proxy: "", newImpl: "", isMultisig: false });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel an Upgrade Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the new implementation address of the upgrade proposal to cancel
          it on-chain.
        </p>
        <Field label="New Implementation Address">
          <Input
            placeholder="0x…"
            value={cancelForms.upgrade}
            onChange={(e) => setCancel("upgrade", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.upgrade}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-upgrade", {
                newImplAddress: cancelForms.upgrade,
              });
              showMsg("Upgrade proposal cancelled.");
              setCancel("upgrade", "");
            })
          }
        />
      </div>

      {proposals.upgradeProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Upgrade Proposals
          </p>
          <div className="space-y-3">
            {proposals.upgradeProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="flex flex-col sm:flex-row justify-between gap-3">
                  <div className="space-y-1">
                    <StatusBadge
                      label={
                        p.isMultisig
                          ? "MultiSig Self-Upgrade"
                          : "External Upgrade"
                      }
                      color="blue"
                    />
                    <p className="text-[10px] opacity-40 font-bold">
                      New impl:
                    </p>
                    <p className="font-mono text-[10px] opacity-60 break-all">
                      {p.newImpl}
                    </p>
                    {!p.isMultisig && (
                      <p className="font-mono text-[10px] opacity-30 break-all">
                        Proxy: {p.proxy}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    {p.isValidated && p.timeLockTimestamp && (
                      <TimelockCountdown
                        timeLockTimestamp={p.timeLockTimestamp}
                      />
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-upgrade", {
                            newImplAddress: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-upgrade", {
                          newImplAddress: p.newImpl,
                        });
                        showMsg("Upgrade executed!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-upgrade", {
                          newImplAddress: p.newImpl,
                        });
                        showMsg("Upgrade cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Signer Update ─────────────────────────────────────────────────────────
  const renderSigner = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="🔑"
        subtitle="RegistryFactory"
        title="Backend Signer Update"
      />
      <p className="text-sm opacity-50">
        Updates the ECDSA signer the RegistryFactory uses to verify name link
        requests. Affects all registries immediately after execution.
      </p>

      <div className="p-6 rounded-3xl border border-purple-500/20 bg-purple-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-purple-400">
          Propose Signer Update
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="RegistryFactory Proxy Address">
            <Input
              placeholder="0x…"
              value={signerForm.proxy}
              onChange={(e) =>
                setSignerForm({ ...signerForm, proxy: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="New Signer Address">
            <Input
              placeholder="0x…"
              value={signerForm.newSigner}
              onChange={(e) =>
                setSignerForm({ ...signerForm, newSigner: e.target.value })
              }
              mono
            />
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Proposing…" : "Propose Signer Update"}
          disabled={loading || !signerForm.proxy || !signerForm.newSigner}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "propose-signer-update", {
                factoryProxy: signerForm.proxy,
                newSigner: signerForm.newSigner,
              });
              showMsg("Signer update proposed!");
              setSignerForm({ proxy: "", newSigner: "" });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel a Signer Update Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the new signer address of the proposal to cancel it on-chain.
        </p>
        <Field label="New Signer Address">
          <Input
            placeholder="0x…"
            value={cancelForms.signer}
            onChange={(e) => setCancel("signer", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.signer}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-signer-update", {
                newSigner: cancelForms.signer,
              });
              showMsg("Signer update proposal cancelled.");
              setCancel("signer", "");
            })
          }
        />
      </div>

      {proposals.signerUpdateProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Signer Update Proposals
          </p>
          <div className="space-y-3">
            {proposals.signerUpdateProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="space-y-1">
                  <StatusBadge label="Signer Update" color="gold" />
                  <p className="text-[10px] opacity-40 font-bold">
                    New signer:
                  </p>
                  <p className="font-mono text-[10px] opacity-60 break-all">
                    {p.newImpl}
                  </p>
                  <p className="font-mono text-[10px] opacity-30 break-all">
                    Factory: {p.proxy}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-signer-update", {
                            newSigner: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-signer-update", {
                          newSigner: p.newImpl,
                        });
                        showMsg("Signer updated!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-signer-update", {
                          newSigner: p.newImpl,
                        });
                        showMsg("Cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── BaseRegistry Impl ─────────────────────────────────────────────────────
  const renderImpl = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="📦"
        subtitle="RegistryFactory"
        title="BaseRegistry Implementation"
      />
      <p className="text-sm opacity-50">
        Updates the logic implementation address used for future BaseRegistry
        clone deployments. Existing clones are unaffected.
      </p>

      <div className="p-6 rounded-3xl border border-teal-500/20 bg-teal-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-teal-400">
          Propose Impl Update
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="RegistryFactory Proxy Address">
            <Input
              placeholder="0x…"
              value={implForm.proxy}
              onChange={(e) =>
                setImplForm({ ...implForm, proxy: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="New BaseRegistry Implementation">
            <Input
              placeholder="0x…"
              value={implForm.newImpl}
              onChange={(e) =>
                setImplForm({ ...implForm, newImpl: e.target.value })
              }
              mono
            />
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Proposing…" : "Propose Impl Update"}
          disabled={loading || !implForm.proxy || !implForm.newImpl}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "propose-base-registry-impl", {
                factoryProxy: implForm.proxy,
                newImplAddress: implForm.newImpl,
              });
              showMsg("Impl update proposed!");
              setImplForm({ proxy: "", newImpl: "" });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel a Registry Impl Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the new implementation address of the proposal to cancel it
          on-chain.
        </p>
        <Field label="New Implementation Address">
          <Input
            placeholder="0x…"
            value={cancelForms.impl}
            onChange={(e) => setCancel("impl", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.impl}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-base-registry-impl", {
                newImplAddress: cancelForms.impl,
              });
              showMsg("Registry impl proposal cancelled.");
              setCancel("impl", "");
            })
          }
        />
      </div>

      {proposals.baseRegistryImplProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Impl Update Proposals
          </p>
          <div className="space-y-3">
            {proposals.baseRegistryImplProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="space-y-1">
                  <StatusBadge label="Impl Update" color="gold" />
                  <p className="font-mono text-[10px] opacity-60 break-all">
                    New: {p.newImpl}
                  </p>
                  <p className="font-mono text-[10px] opacity-30 break-all">
                    Factory: {p.proxy}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-base-registry-impl", {
                            newImplAddress: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-base-registry-impl", {
                          newImplAddress: p.newImpl,
                        });
                        showMsg("Impl updated!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-base-registry-impl", {
                          newImplAddress: p.newImpl,
                        });
                        showMsg("Cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Factory Fee ───────────────────────────────────────────────────────────
  const renderFee = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="💰"
        subtitle="RegistryFactory"
        title="Protocol Link Fee"
      />
      <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30">
        <p className="text-xs text-yellow-400 font-bold">
          ⚡ Immediate — No Proposal Required
        </p>
        <p className="text-[10px] opacity-60 mt-1">
          Fee is denominated in NGNs base units (6 decimals). Enter
          human-readable amount (e.g. 500 = 500 NGNs).
        </p>
      </div>
      <div className="p-6 rounded-3xl border border-green-500/20 bg-green-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-green-400">
          Update Link Fee
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="RegistryFactory Proxy Address">
            <Input
              placeholder="0x…"
              value={feeForm.proxy}
              onChange={(e) =>
                setFeeForm({ ...feeForm, proxy: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="New Fee (NGNs)" hint="e.g. 500 → 500 NGNs">
            <Input
              type="number"
              placeholder="500"
              value={feeForm.newFee}
              onChange={(e) =>
                setFeeForm({ ...feeForm, newFee: e.target.value })
              }
            />
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Updating…" : "Update Fee"}
          disabled={loading || !feeForm.proxy || !feeForm.newFee}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "update-factory-fee", {
                factoryProxy: feeForm.proxy,
                newFee: feeForm.newFee,
              });
              showMsg(`Fee updated to ${feeForm.newFee} NGNs!`);
              setFeeForm({ proxy: "", newFee: "" });
            })
          }
        />
      </div>
    </motion.div>
  );

  // ── Pause / Unpause ───────────────────────────────────────────────────────
  const renderPause = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="⏸️"
        subtitle="Emergency Controls"
        title="Pause / Unpause"
      />

      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
        <p className="text-xs text-red-400 font-bold">
          ⚠️ Pause is immediate. Unpause requires proposal + timelock.
        </p>
        <p className="text-[10px] opacity-60 mt-1">
          Mark 0 = pause/unpause MultiSig itself. Mark 1 = pause/unpause
          external contract (Singleton or Factory).
        </p>
      </div>

      {/* Immediate Pause */}
      <div className="p-6 rounded-3xl border border-red-500/20 bg-red-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Immediate Pause
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Target Contract Address">
            <Input
              placeholder="0x…"
              value={pauseForm.proxy}
              onChange={(e) =>
                setPauseForm({ ...pauseForm, proxy: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="Mark">
            <div className="flex gap-3">
              <button
                onClick={() => setPauseForm({ ...pauseForm, mark: 0 })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${pauseForm.mark === 0 ? "bg-salvaGold text-black" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                MultiSig (0)
              </button>
              <button
                onClick={() => setPauseForm({ ...pauseForm, mark: 1 })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${pauseForm.mark === 1 ? "bg-salvaGold text-black" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                External (1)
              </button>
            </div>
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Pausing…" : "🚨 Pause Now"}
          variant="danger"
          disabled={loading || !pauseForm.proxy}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "pause-state", {
                proxyAddress: pauseForm.proxy,
                mark: pauseForm.mark,
              });
              showMsg("Contract paused.");
              setPauseForm({ proxy: "", mark: 1 });
            })
          }
        />
      </div>

      {/* Propose Unpause */}
      <div className="p-6 rounded-3xl border border-orange-500/20 bg-orange-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-orange-400">
          Propose Unpause
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Target Contract Address">
            <Input
              placeholder="0x…"
              value={unpauseForm.proxy}
              onChange={(e) =>
                setUnpauseForm({ ...unpauseForm, proxy: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="Mark">
            <div className="flex gap-3">
              <button
                onClick={() => setUnpauseForm({ ...unpauseForm, mark: 0 })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${unpauseForm.mark === 0 ? "bg-salvaGold text-black" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                MultiSig (0)
              </button>
              <button
                onClick={() => setUnpauseForm({ ...unpauseForm, mark: 1 })}
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${unpauseForm.mark === 1 ? "bg-salvaGold text-black" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                External (1)
              </button>
            </div>
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={loading ? "Proposing…" : "Propose Unpause"}
          disabled={loading || !unpauseForm.proxy}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "propose-unpause", {
                proxyAddress: unpauseForm.proxy,
                mark: unpauseForm.mark,
              });
              showMsg("Unpause proposal created!");
              setUnpauseForm({ proxy: "", mark: 1 });
            })
          }
        />
      </div>

      {/* Standalone Cancel */}
      <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 space-y-3">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Cancel an Unpause Proposal
        </p>
        <p className="text-[10px] opacity-50">
          Enter the proxy address of the unpause proposal to cancel it on-chain.
        </p>
        <Field label="Target Proxy Address">
          <Input
            placeholder="0x…"
            value={cancelForms.unpause}
            onChange={(e) => setCancel("unpause", e.target.value)}
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Cancelling…" : "Cancel Proposal"}
          variant="danger"
          disabled={loading || !cancelForms.unpause}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "cancel-unpause", {
                proxyAddress: cancelForms.unpause,
              });
              showMsg("Unpause proposal cancelled.");
              setCancel("unpause", "");
            })
          }
        />
      </div>

      {proposals.unpauseProposals.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] font-black opacity-40 mb-3">
            Active Unpause Proposals
          </p>
          <div className="space-y-3">
            {proposals.unpauseProposals.map((p, i) => (
              <ProposalCard key={p._id || i}>
                <div className="space-y-1">
                  <StatusBadge
                    label={
                      p.mark === 0 ? "MultiSig Unpause" : "External Unpause"
                    }
                    color="gold"
                  />
                  <p className="font-mono text-[10px] opacity-40 break-all">
                    Target: {p.proxy}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!p.isValidated && (
                    <ActionBtn
                      label="Validate"
                      disabled={loading}
                      onClick={() =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-unpause", {
                            proxyAddress: p.proxy,
                          });
                          showMsg("Vote cast!");
                        })
                      }
                    />
                  )}
                  <ActionBtn
                    label="Execute"
                    variant="green"
                    disabled={
                      loading ||
                      !p.isValidated ||
                      (p.timeLockTimestamp &&
                        Math.floor(Date.now() / 1000) < p.timeLockTimestamp)
                    }
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "execute-unpause", {
                          proxyAddress: p.proxy,
                        });
                        showMsg("Unpaused!");
                      })
                    }
                  />
                  <ActionBtn
                    label="Cancel"
                    variant="danger"
                    disabled={loading}
                    onClick={() =>
                      requestPin(async (pk) => {
                        await callAdmin(pk, "cancel-unpause", {
                          proxyAddress: p.proxy,
                        });
                        showMsg("Cancelled.");
                      })
                    }
                  />
                </div>
              </ProposalCard>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );

  // ── Withdraw ──────────────────────────────────────────────────────────────
  const renderWithdraw = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="💸"
        subtitle="Treasury"
        title="Withdraw From Singleton"
      />
      <p className="text-sm opacity-50">
        Pulls token balance accumulated from name link fees out of the Singleton
        contract to a designated receiver address.
      </p>
      <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30">
        <p className="text-xs text-yellow-400 font-bold">
          ⚡ Immediate — No Proposal Required
        </p>
      </div>
      <div className="p-6 rounded-3xl border border-red-500/20 bg-red-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-red-400">
          Execute Withdrawal
        </p>
        <Field label="Singleton Proxy Address">
          <Input
            placeholder="0x…"
            value={withdrawForm.singleton}
            onChange={(e) =>
              setWithdrawForm({ ...withdrawForm, singleton: e.target.value })
            }
            mono
          />
        </Field>
        <Field label="Token Address (NGNs / USDC / USDT)">
          <Input
            placeholder="0x…"
            value={withdrawForm.token}
            onChange={(e) =>
              setWithdrawForm({ ...withdrawForm, token: e.target.value })
            }
            mono
          />
        </Field>
        <Field label="Receiver Address">
          <Input
            placeholder="0x…"
            value={withdrawForm.receiver}
            onChange={(e) =>
              setWithdrawForm({ ...withdrawForm, receiver: e.target.value })
            }
            mono
          />
        </Field>
        <ActionBtn
          spinning={loading}
          label={loading ? "Withdrawing…" : "Withdraw"}
          variant="danger"
          disabled={
            loading ||
            !withdrawForm.singleton ||
            !withdrawForm.token ||
            !withdrawForm.receiver
          }
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "withdraw", {
                singletonAddress: withdrawForm.singleton,
                tokenAddress: withdrawForm.token,
                receiverAddress: withdrawForm.receiver,
              });
              showMsg("Withdrawal executed!");
              setWithdrawForm({ singleton: "", token: "", receiver: "" });
            })
          }
        />
      </div>
    </motion.div>
  );

  // ── Recovery ──────────────────────────────────────────────────────────────
  const renderRecovery = () => (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      <SectionHeader
        icon="🔐"
        subtitle="Emergency Access"
        title="Recovery Privileges"
      />
      <div className="p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
        <p className="text-xs text-red-400 font-bold">
          ⚠️ Grant sparingly — recovery addresses bypass quorum and timelock.
        </p>
        <p className="text-[10px] opacity-60 mt-1">
          Only existing recovery addresses can call this function.
        </p>
      </div>
      <div className="p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30">
        <p className="text-xs text-yellow-400 font-bold">
          ⚡ Immediate — No Proposal Required
        </p>
      </div>
      <div className="p-6 rounded-3xl border border-pink-500/20 bg-pink-500/5 space-y-4">
        <p className="text-xs uppercase tracking-widest font-black text-pink-400">
          Update Recovery Status
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Target Address">
            <Input
              placeholder="0x…"
              value={recoveryForm.address}
              onChange={(e) =>
                setRecoveryForm({ ...recoveryForm, address: e.target.value })
              }
              mono
            />
          </Field>
          <Field label="Action">
            <div className="flex gap-3">
              <button
                onClick={() =>
                  setRecoveryForm({ ...recoveryForm, action: true })
                }
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${recoveryForm.action ? "bg-green-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                Grant
              </button>
              <button
                onClick={() =>
                  setRecoveryForm({ ...recoveryForm, action: false })
                }
                className={`flex-1 py-3 rounded-xl font-black text-xs uppercase transition-all ${!recoveryForm.action ? "bg-red-500 text-white" : "border border-white/10 opacity-40 hover:opacity-70"}`}
              >
                Revoke
              </button>
            </div>
          </Field>
        </div>
        <ActionBtn
          spinning={loading}
          label={
            loading
              ? "Updating…"
              : `${recoveryForm.action ? "Grant" : "Revoke"} Recovery`
          }
          variant={recoveryForm.action ? "default" : "danger"}
          disabled={loading || !recoveryForm.address}
          onClick={() =>
            requestPin(async (pk) => {
              await callAdmin(pk, "update-recovery", {
                targetAddress: recoveryForm.address,
                action: recoveryForm.action,
              });
              showMsg(
                `Recovery ${recoveryForm.action ? "granted" : "revoked"} for ${recoveryForm.address.slice(0, 10)}…`,
              );
              setRecoveryForm({ address: "", action: true });
            })
          }
        />
      </div>
    </motion.div>
  );

  // ── Section Map ───────────────────────────────────────────────────────────
  const sections = {
    overview: renderOverview,
    registry: renderRegistry,
    validator: renderValidator,
    upgrades: renderUpgrades,
    signer: renderSigner,
    impl: renderImpl,
    fee: renderFee,
    pause: renderPause,
    withdraw: renderWithdraw,
    recovery: renderRecovery,
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* Top bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">
            Admin Panel · v2.1.0
          </p>
          <h3 className="text-2xl font-black">MultiSig Control</h3>
        </div>
        <div className="flex items-center gap-3">
          {activeSection !== "overview" && (
            <button
              onClick={() => setActiveSection("overview")}
              className="px-4 py-2 rounded-xl border border-white/10 font-bold text-xs uppercase hover:bg-white/5 transition-all"
            >
              ← Overview
            </button>
          )}
          <button
            onClick={fetchProposals}
            disabled={fetching}
            className="px-4 py-2 rounded-xl border border-white/10 font-bold text-xs uppercase hover:bg-white/5 transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <span
              className={
                fetching ? "animate-spin inline-block" : "inline-block"
              }
            >
              ⟳
            </span>
            {fetching ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Loading banner */}
      {loading && (
        <div className="p-4 rounded-2xl bg-salvaGold/10 border border-salvaGold/30 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs text-salvaGold font-bold">
            Submitting on-chain… this may take 30–60 seconds.
          </p>
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

      {/* Active section */}
      {(sections[activeSection] || sections.overview)()}

      {/* PIN Modal */}
      <AnimatePresence>
        {isPinOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
            <motion.div
              onClick={() => {
                setIsPinOpen(false);
                setAdminPin("");
              }}
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
                <p className="text-xs opacity-50">
                  Enter your transaction PIN to sign
                </p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) =>
                  e.key === "Enter" &&
                  adminPin.length === 4 &&
                  executePinnedAction()
                }
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsPinOpen(false);
                    setAdminPin("");
                  }}
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
