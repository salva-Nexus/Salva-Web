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
        <div className="p-8 rounded-3xl border border-red-500/20 bg-red-500/5 text-center space-y-4">
          <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-xl">⚠</span>
          </div>
          <p className="text-red-400 font-black text-lg">Panel Error</p>
          <p className="text-xs text-white/30 font-mono">
            {this.state.error?.message}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="px-6 py-2.5 bg-salvaGold text-black font-black rounded-xl text-xs uppercase tracking-widest hover:brightness-110 transition-all"
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
      className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${isReady ? "bg-green-500/10 border-green-500/20 text-green-400" : "bg-salvaGold/10 border-salvaGold/20 text-salvaGold"}`}
    >
      {isReady ? "✓ Ready" : `⏱ ${remaining}`}
    </span>
  );
};

// ── Status Badge ──────────────────────────────────────────────────────────────
const StatusBadge = ({ label, color = "gray" }) => {
  const colors = {
    green: "bg-green-500/10 border-green-500/20 text-green-400",
    red: "bg-red-500/10 border-red-500/20 text-red-400",
    gold: "bg-salvaGold/10 border-salvaGold/20 text-salvaGold",
    blue: "bg-blue-500/10 border-blue-500/20 text-blue-400",
    purple: "bg-purple-500/10 border-purple-500/20 text-purple-400",
    gray: "bg-white/5 border-white/10 text-white/40",
    orange: "bg-orange-500/10 border-orange-500/20 text-orange-400",
    teal: "bg-teal-500/10 border-teal-500/20 text-teal-400",
  };
  return (
    <span
      className={`inline-flex text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border ${colors[color] || colors.gray}`}
    >
      {label}
    </span>
  );
};

// ── Proposal Card ─────────────────────────────────────────────────────────────
const ProposalCard = ({ children }) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-salvaGold/20 hover:bg-salvaGold/[0.02] transition-all space-y-4"
  >
    {children}
  </motion.div>
);

// ── Dark Input ────────────────────────────────────────────────────────────────
const darkInput =
  "w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-sm text-white placeholder:text-white/20 transition-all";

const Input = ({
  placeholder,
  value,
  onChange,
  mono = false,
  type = "text",
  disabled = false,
  ...props
}) => (
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    disabled={disabled}
    className={`${darkInput} ${mono ? "font-mono text-xs" : ""} ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    {...props}
  />
);

const Field = ({ label, hint, children }) => (
  <div>
    <label className="text-[10px] uppercase tracking-[0.25em] text-white/30 font-black block mb-2">
      {label}
    </label>
    {children}
    {hint && <p className="text-[10px] text-white/20 mt-1.5 ml-1">{hint}</p>}
  </div>
);

// ── Action Button ─────────────────────────────────────────────────────────────
const ActionBtn = ({
  label,
  onClick,
  disabled,
  variant = "gold",
  spinning = false,
  fullWidth = false,
}) => {
  const base =
    "flex items-center justify-center gap-2 font-black text-[10px] uppercase tracking-widest px-5 py-3 rounded-xl transition-all active:scale-[0.97]";
  const variants = {
    gold: "bg-salvaGold text-black hover:brightness-110 shadow-lg shadow-salvaGold/20",
    danger:
      "bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500",
    green:
      "bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500 hover:text-black hover:border-green-500",
    ghost: "border border-white/10 text-white/40 cursor-not-allowed",
    outline:
      "border border-white/10 text-white/60 hover:text-white hover:border-white/20 hover:bg-white/5",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${disabled ? variants.ghost : variants[variant]} disabled:opacity-40 disabled:cursor-not-allowed ${fullWidth ? "w-full py-4 text-sm" : ""}`}
    >
      {spinning && (
        <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin flex-shrink-0" />
      )}
      {label}
    </button>
  );
};

// ── Toggle ────────────────────────────────────────────────────────────────────
const Toggle = ({ label, hint, checked, onChange }) => (
  <button
    type="button"
    onClick={onChange}
    className="flex items-center gap-3 group w-fit"
  >
    <div
      className={`w-10 h-6 rounded-full border-2 flex items-center transition-all px-0.5 ${checked ? "bg-salvaGold border-salvaGold" : "bg-white/5 border-white/20 group-hover:border-white/30"}`}
    >
      <motion.div
        animate={{ x: checked ? 16 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className={`w-4 h-4 rounded-full flex-shrink-0 ${checked ? "bg-black" : "bg-white/40"}`}
      />
    </div>
    <div>
      <p className="text-xs font-black text-white">{label}</p>
      {hint && <p className="text-[10px] text-white/30">{hint}</p>}
    </div>
  </button>
);

// ── Mark Selector ─────────────────────────────────────────────────────────────
const MarkSelector = ({ value, onChange }) => (
  <div className="flex gap-2">
    {[
      { v: 0, label: "MultiSig" },
      { v: 1, label: "External" },
    ].map((opt) => (
      <button
        key={opt.v}
        type="button"
        onClick={() => onChange(opt.v)}
        className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border ${value === opt.v ? "bg-salvaGold text-black border-salvaGold shadow-lg shadow-salvaGold/20" : "border-white/10 text-white/40 hover:border-white/20 hover:text-white/60"}`}
      >
        {opt.label} ({opt.v})
      </button>
    ))}
  </div>
);

// ── Add / Remove Selector ─────────────────────────────────────────────────────
const ActionSelector = ({ value, onChange }) => (
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() => onChange(true)}
      className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border ${value ? "bg-green-500 text-white border-green-500" : "border-white/10 text-white/40 hover:border-white/20"}`}
    >
      Add
    </button>
    <button
      type="button"
      onClick={() => onChange(false)}
      className={`flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all border ${!value ? "bg-red-500 text-white border-red-500" : "border-white/10 text-white/40 hover:border-white/20"}`}
    >
      Remove
    </button>
  </div>
);

// ── Section navigation icons ──────────────────────────────────────────────────
const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "🏛", color: "gold" },
  { id: "registry", label: "Registry", icon: "🔗", color: "gold" },
  { id: "validator", label: "Validators", icon: "🛡", color: "green" },
  { id: "upgrades", label: "Upgrades", icon: "⚡", color: "blue" },
  { id: "signer", label: "Signer", icon: "🔑", color: "purple" },
  { id: "impl", label: "Impl", icon: "📦", color: "teal" },
  { id: "fee", label: "Fee", icon: "💰", color: "green" },
  { id: "pause", label: "Pause", icon: "⏸", color: "orange" },
  { id: "withdraw", label: "Withdraw", icon: "💸", color: "red" },
  { id: "recovery", label: "Recovery", icon: "🔐", color: "red" },
];

// ══════════════════════════════════════════════════════════════════════════════
// INNER PANEL
// ══════════════════════════════════════════════════════════════════════════════
const AdminPanelInner = ({ user, showMsg }) => {
  const [proposals, setProposals] = useState({
    registryProposals: [],
    validatorProposals: [],
    upgradeProposals: [],
    signerUpdateProposals: [],
    implUpdateProposals: [],
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

  // PIN
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [adminPin, setAdminPin] = useState("");
  const [pendingAdminAction, setPendingAdminAction] = useState(null);

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
        implUpdateProposals: Array.isArray(data.implUpdateProposals)
          ? data.implUpdateProposals
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

  const totalProposals =
    proposals.registryProposals.length +
    proposals.validatorProposals.length +
    proposals.upgradeProposals.length +
    proposals.signerUpdateProposals.length +
    proposals.implUpdateProposals.length +
    proposals.unpauseProposals.length;

  // ── SECTION: Overview ─────────────────────────────────────────────────────
  const renderOverview = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "Total Active",
            value: totalProposals,
            accent: "text-salvaGold",
          },
          {
            label: "Registry",
            value: proposals.registryProposals.length,
            accent: "text-salvaGold",
          },
          {
            label: "Validators",
            value: proposals.validatorProposals.length,
            accent: "text-green-400",
          },
          {
            label: "Upgrades",
            value: proposals.upgradeProposals.length,
            accent: "text-blue-400",
          },
          {
            label: "Signer",
            value: proposals.signerUpdateProposals.length,
            accent: "text-purple-400",
          },
          {
            label: "Unpause",
            value: proposals.unpauseProposals.length,
            accent: "text-orange-400",
          },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/20 transition-all"
          >
            <p className={`text-2xl font-black ${s.accent}`}>{s.value}</p>
            <p className="text-[9px] uppercase tracking-[0.25em] text-white/25 font-black mt-0.5">
              {s.label}
            </p>
          </motion.div>
        ))}
      </div>

      {/* Nav grid */}
      <div>
        <div className="relative flex items-center mb-5">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/20 to-transparent" />
          <span className="mx-3 text-[9px] uppercase tracking-[0.3em] font-black text-white/20">
            Sections
          </span>
          <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/20 to-transparent" />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {NAV_ITEMS.filter((n) => n.id !== "overview").map((nav, i) => (
            <motion.button
              key={nav.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setActiveSection(nav.id)}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/30 hover:bg-salvaGold/[0.03] transition-all group active:scale-95"
            >
              <span className="text-xl leading-none">{nav.icon}</span>
              <span className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30 group-hover:text-white/60 transition-colors">
                {nav.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  );

  // ── SECTION: Registry ─────────────────────────────────────────────────────
  const renderRegistry = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Propose */}
      <div className="rounded-3xl overflow-hidden border border-salvaGold/20 bg-salvaGold/[0.03]">
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-salvaGold/60 font-black">
              Propose
            </p>
            <h4 className="text-lg font-black">New Registry</h4>
            <p className="text-[11px] text-white/30 mt-1 leading-relaxed">
              Deploys a BaseRegistry clone via RegistryFactory and opens an
              initialization proposal in the MultiSig.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Registry Name">
              <Input
                placeholder="e.g. Trust Wallet"
                value={regForm.name}
                onChange={(e) =>
                  setRegForm({ ...regForm, name: e.target.value })
                }
              />
            </Field>
            <Field label="Namespace">
              <Input
                placeholder="@trustwallet"
                value={regForm.nspace}
                onChange={(e) =>
                  setRegForm({ ...regForm, nspace: e.target.value })
                }
              />
            </Field>
          </div>
          <Toggle
            label="This is a crypto wallet"
            hint={
              regForm.isWallet
                ? "Will appear in transfer wallet list"
                : "Will NOT appear in transfer wallet list"
            }
            checked={regForm.isWallet}
            onChange={() =>
              setRegForm({ ...regForm, isWallet: !regForm.isWallet })
            }
          />
          <ActionBtn
            spinning={loading}
            label={loading ? "Proposing…" : "Propose Registry"}
            disabled={
              loading || !regForm.name || !regForm.nspace.startsWith("@")
            }
            fullWidth
            onClick={() =>
              requestPin(async (pk) => {
                await callAdmin(pk, "propose-registry", {
                  nspace: regForm.nspace,
                  registryName: regForm.name,
                  isWallet: regForm.isWallet,
                });
                showMsg("Registry proposed!");
                setRegForm({ name: "", nspace: "@", isWallet: false });
              })
            }
          />
        </div>
      </div>

      {/* Cancel */}
      <CancelBlock
        title="Cancel Registry Proposal"
        hint="Enter the clone address of the registry proposal to cancel."
        label="Registry Clone Address"
        value={cancelForms.registry}
        onChange={(v) => setCancel("registry", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-registry", {
              registryAddress: cancelForms.registry,
            });
            showMsg("Registry proposal cancelled.");
            setCancel("registry", "");
          })
        }
      />

      {/* Active proposals */}
      {proposals.registryProposals.length > 0 && (
        <ActiveSection title="Active Registry Proposals">
          {proposals.registryProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2 min-w-0">
                  <StatusBadge label="Registry Init" color="gold" />
                  <p className="font-black text-salvaGold">{p.nspace}</p>
                  <p className="font-mono text-[10px] text-white/30 break-all">
                    {p.registry}
                  </p>
                  {p.isWallet && (
                    <StatusBadge label="Crypto Wallet" color="blue" />
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-registry", {
                            registryAddress: p.registry,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-registry", {
                      registryAddress: p.registry,
                    });
                    showMsg("Registry initialized!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-registry", {
                      registryAddress: p.registry,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Validator ────────────────────────────────────────────────────
  const renderValidator = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="rounded-3xl overflow-hidden border border-green-500/20 bg-green-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-green-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-green-400/70 font-black">
              Propose
            </p>
            <h4 className="text-lg font-black">Validator Update</h4>
          </div>
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
              <ActionSelector
                value={valForm.action}
                onChange={(v) => setValForm({ ...valForm, action: v })}
              />
            </Field>
          </div>
          <ActionBtn
            spinning={loading}
            label={loading ? "Submitting…" : "Propose"}
            disabled={loading || !valForm.address}
            fullWidth
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
      </div>

      <CancelBlock
        title="Cancel Validator Proposal"
        hint="Enter the target address to cancel on-chain."
        label="Target Wallet Address"
        value={cancelForms.validator}
        onChange={(v) => setCancel("validator", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-validator", {
              targetAddress: cancelForms.validator,
            });
            showMsg("Cancelled.");
            setCancel("validator", "");
          })
        }
      />

      {proposals.validatorProposals.length > 0 && (
        <ActiveSection title="Active Validator Proposals">
          {proposals.validatorProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2">
                  <StatusBadge
                    label={p.action ? "Add Validator" : "Remove Validator"}
                    color={p.action ? "green" : "red"}
                  />
                  <p className="font-mono text-[10px] text-white/30 break-all">
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
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-validator", {
                            targetAddress: p.addr,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-validator", {
                      targetAddress: p.addr,
                      action: p.action,
                    });
                    showMsg("Validator updated!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-validator", {
                      targetAddress: p.addr,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Upgrades ─────────────────────────────────────────────────────
  const renderUpgrades = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="rounded-3xl overflow-hidden border border-blue-500/20 bg-blue-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-blue-400/70 font-black">
              UUPS · Propose
            </p>
            <h4 className="text-lg font-black">Protocol Upgrade</h4>
            <p className="text-[11px] text-white/30 mt-1 leading-relaxed">
              Targets Singleton, Factory, or MultiSig itself. Enable
              Self-Upgrade and leave proxy empty for MultiSig.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              label="Proxy to Upgrade"
              hint={
                upgradeForm.isMultisig
                  ? "Disabled — self-upgrade mode"
                  : "Leave empty if self-upgrading"
              }
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
            <Field label="New Implementation">
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
          <Toggle
            label="Self-upgrade MultiSig proxy"
            checked={upgradeForm.isMultisig}
            onChange={() =>
              setUpgradeForm({
                ...upgradeForm,
                isMultisig: !upgradeForm.isMultisig,
              })
            }
          />
          <ActionBtn
            spinning={loading}
            label={loading ? "Proposing…" : "Propose Upgrade"}
            fullWidth
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
      </div>

      <CancelBlock
        title="Cancel Upgrade Proposal"
        hint="Enter the new implementation address to cancel."
        label="New Implementation Address"
        value={cancelForms.upgrade}
        onChange={(v) => setCancel("upgrade", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-upgrade", {
              newImplAddress: cancelForms.upgrade,
            });
            showMsg("Cancelled.");
            setCancel("upgrade", "");
          })
        }
      />

      {proposals.upgradeProposals.length > 0 && (
        <ActiveSection title="Active Upgrade Proposals">
          {proposals.upgradeProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-2 min-w-0">
                  <StatusBadge
                    label={
                      p.isMultisig
                        ? "MultiSig Self-Upgrade"
                        : "External Upgrade"
                    }
                    color="blue"
                  />
                  <p className="text-[10px] text-white/30 font-bold">
                    New impl:
                  </p>
                  <p className="font-mono text-[10px] text-white/50 break-all">
                    {p.newImpl}
                  </p>
                  {!p.isMultisig && (
                    <p className="font-mono text-[10px] text-white/25 break-all">
                      Proxy: {p.proxy}
                    </p>
                  )}
                </div>
                <div>
                  {p.isValidated && p.timeLockTimestamp && (
                    <TimelockCountdown
                      timeLockTimestamp={p.timeLockTimestamp}
                    />
                  )}
                </div>
              </div>
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-upgrade", {
                            newImplAddress: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-upgrade", {
                      newImplAddress: p.newImpl,
                    });
                    showMsg("Upgrade executed!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-upgrade", {
                      newImplAddress: p.newImpl,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Signer ───────────────────────────────────────────────────────
  const renderSigner = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <p className="text-[11px] text-white/30 leading-relaxed">
        Updates the ECDSA signer the RegistryFactory uses to verify name link
        requests. Affects all registries immediately after execution.
      </p>
      <div className="rounded-3xl overflow-hidden border border-purple-500/20 bg-purple-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-purple-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-purple-400/70 font-black">
              Propose
            </p>
            <h4 className="text-lg font-black">Signer Update</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="RegistryFactory Proxy">
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
            fullWidth
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
      </div>

      <CancelBlock
        title="Cancel Signer Update Proposal"
        hint="Enter the new signer address to cancel."
        label="New Signer Address"
        value={cancelForms.signer}
        onChange={(v) => setCancel("signer", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-signer-update", {
              newSigner: cancelForms.signer,
            });
            showMsg("Cancelled.");
            setCancel("signer", "");
          })
        }
      />

      {proposals.signerUpdateProposals.length > 0 && (
        <ActiveSection title="Active Signer Proposals">
          {proposals.signerUpdateProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="space-y-1.5">
                <StatusBadge label="Signer Update" color="purple" />
                <p className="font-mono text-[10px] text-white/50 break-all">
                  New: {p.newImpl}
                </p>
                <p className="font-mono text-[10px] text-white/25 break-all">
                  Factory: {p.proxy}
                </p>
              </div>
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-signer-update", {
                            newSigner: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-signer-update", {
                      newSigner: p.newImpl,
                    });
                    showMsg("Signer updated!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-signer-update", {
                      newSigner: p.newImpl,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Impl ─────────────────────────────────────────────────────────
  const renderImpl = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <p className="text-[11px] text-white/30 leading-relaxed">
        Updates the logic implementation address used for future
        clone deployments. Existing clones are unaffected.
      </p>
      <div className="rounded-3xl overflow-hidden border border-teal-500/20 bg-teal-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-teal-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-teal-400/70 font-black">
              Propose
            </p>
            <h4 className="text-lg font-black">Implementation Update</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="RegistryFactory Proxy">
              <Input
                placeholder="0x…"
                value={implForm.proxy}
                onChange={(e) =>
                  setImplForm({ ...implForm, proxy: e.target.value })
                }
                mono
              />
            </Field>
            <Field label="New Implementation">
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
            fullWidth
            disabled={loading || !implForm.proxy || !implForm.newImpl}
            onClick={() =>
              requestPin(async (pk) => {
                await callAdmin(pk, "propose-impl-update", {
                  factoryProxy: implForm.proxy,
                  newImplAddress: implForm.newImpl,
                });
                showMsg("Impl update proposed!");
                setImplForm({ proxy: "", newImpl: "" });
              })
            }
          />
        </div>
      </div>

      <CancelBlock
        title="Cancel Impl Update Proposal"
        hint="Enter the new implementation address to cancel."
        label="New Implementation Address"
        value={cancelForms.impl}
        onChange={(v) => setCancel("impl", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-impl-update", {
              newImplAddress: cancelForms.impl,
            });
            showMsg("Cancelled.");
            setCancel("impl", "");
          })
        }
      />

      {proposals.implUpdateProposals.length > 0 && (
        <ActiveSection title="Active Impl Proposals">
          {proposals.implUpdateProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="space-y-1.5">
                <StatusBadge label="Impl Update" color="teal" />
                <p className="font-mono text-[10px] text-white/50 break-all">
                  New: {p.newImpl}
                </p>
                <p className="font-mono text-[10px] text-white/25 break-all">
                  Factory: {p.proxy}
                </p>
              </div>
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-impl-update", {
                            newImplAddress: p.newImpl,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-impl-update", {
                      newImplAddress: p.newImpl,
                    });
                    showMsg("Impl updated!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-impl-update", {
                      newImplAddress: p.newImpl,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Fee ──────────────────────────────────────────────────────────
  const renderFee = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <ImmediateBadge />
      <p className="text-[11px] text-white/30 leading-relaxed">
        Fee denominated in NGNs base units (6 decimals). Enter human-readable
        amount — e.g. 500 = 500 NGNs.
      </p>
      <div className="rounded-3xl overflow-hidden border border-green-500/20 bg-green-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-green-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-green-400/70 font-black">
              Update · Immediate
            </p>
            <h4 className="text-lg font-black">Protocol Link Fee</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="RegistryFactory Proxy">
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
            fullWidth
            variant="gold"
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
      </div>
    </motion.div>
  );

  // ── SECTION: Pause ────────────────────────────────────────────────────────
  const renderPause = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
        <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
        <div>
          <p className="text-xs text-red-400 font-black">
            Pause is immediate. Unpause requires proposal + timelock.
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            Mark 0 = MultiSig itself · Mark 1 = external contract
          </p>
        </div>
      </div>

      {/* Pause */}
      <div className="rounded-3xl overflow-hidden border border-red-500/20 bg-red-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-red-400/70 font-black">
              Emergency · Immediate
            </p>
            <h4 className="text-lg font-black">Pause Contract</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Target Contract">
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
              <MarkSelector
                value={pauseForm.mark}
                onChange={(v) => setPauseForm({ ...pauseForm, mark: v })}
              />
            </Field>
          </div>
          <ActionBtn
            spinning={loading}
            label={loading ? "Pausing…" : "🚨 Pause Now"}
            fullWidth
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
      </div>

      {/* Unpause */}
      <div className="rounded-3xl overflow-hidden border border-orange-500/20 bg-orange-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-orange-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-orange-400/70 font-black">
              Propose · Timelock
            </p>
            <h4 className="text-lg font-black">Unpause Contract</h4>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Target Contract">
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
              <MarkSelector
                value={unpauseForm.mark}
                onChange={(v) => setUnpauseForm({ ...unpauseForm, mark: v })}
              />
            </Field>
          </div>
          <ActionBtn
            spinning={loading}
            label={loading ? "Proposing…" : "Propose Unpause"}
            fullWidth
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
      </div>

      <CancelBlock
        title="Cancel Unpause Proposal"
        hint="Enter the proxy address to cancel."
        label="Target Proxy Address"
        value={cancelForms.unpause}
        onChange={(v) => setCancel("unpause", v)}
        loading={loading}
        onCancel={() =>
          requestPin(async (pk) => {
            await callAdmin(pk, "cancel-unpause", {
              proxyAddress: cancelForms.unpause,
            });
            showMsg("Cancelled.");
            setCancel("unpause", "");
          })
        }
      />

      {proposals.unpauseProposals.length > 0 && (
        <ActiveSection title="Active Unpause Proposals">
          {proposals.unpauseProposals.map((p, i) => (
            <ProposalCard key={p._id || i}>
              <div className="space-y-1.5">
                <StatusBadge
                  label={p.mark === 0 ? "MultiSig Unpause" : "External Unpause"}
                  color="orange"
                />
                <p className="font-mono text-[10px] text-white/30 break-all">
                  Target: {p.proxy}
                </p>
              </div>
              <ProposalActions
                loading={loading}
                isValidated={p.isValidated}
                timeLockTimestamp={p.timeLockTimestamp}
                onValidate={
                  !p.isValidated
                    ? () =>
                        requestPin(async (pk) => {
                          await callAdmin(pk, "validate-unpause", {
                            proxyAddress: p.proxy,
                          });
                          showMsg("Vote cast!");
                        })
                    : null
                }
                onExecute={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "execute-unpause", {
                      proxyAddress: p.proxy,
                    });
                    showMsg("Unpaused!");
                  })
                }
                onCancel={() =>
                  requestPin(async (pk) => {
                    await callAdmin(pk, "cancel-unpause", {
                      proxyAddress: p.proxy,
                    });
                    showMsg("Cancelled.");
                  })
                }
              />
            </ProposalCard>
          ))}
        </ActiveSection>
      )}
    </motion.div>
  );

  // ── SECTION: Withdraw ─────────────────────────────────────────────────────
  const renderWithdraw = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <ImmediateBadge />
      <p className="text-[11px] text-white/30 leading-relaxed">
        Pulls token balance accumulated from name link fees out of the Singleton
        contract to a designated receiver address.
      </p>
      <div className="rounded-3xl overflow-hidden border border-red-500/20 bg-red-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-red-400/70 font-black">
              Treasury · Immediate
            </p>
            <h4 className="text-lg font-black">Withdraw From Singleton</h4>
          </div>
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
            label={loading ? "Withdrawing…" : "Execute Withdrawal"}
            fullWidth
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
      </div>
    </motion.div>
  );

  // ── SECTION: Recovery ─────────────────────────────────────────────────────
  const renderRecovery = () => (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <ImmediateBadge />
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/5 border border-red-500/20">
        <span className="text-red-400 text-lg flex-shrink-0">⚠</span>
        <div>
          <p className="text-xs text-red-400 font-black">
            Grant sparingly — recovery addresses bypass quorum and timelock.
          </p>
          <p className="text-[10px] text-white/30 mt-0.5">
            Only existing recovery addresses can call this function.
          </p>
        </div>
      </div>
      <div className="rounded-3xl overflow-hidden border border-red-500/20 bg-red-500/[0.02]">
        <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
        <div className="p-6 space-y-5">
          <div>
            <p className="text-[9px] uppercase tracking-[0.35em] text-red-400/70 font-black">
              Emergency Access · Immediate
            </p>
            <h4 className="text-lg font-black">Recovery Privileges</h4>
          </div>
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
              <ActionSelector
                value={recoveryForm.action}
                onChange={(v) =>
                  setRecoveryForm({ ...recoveryForm, action: v })
                }
              />
            </Field>
          </div>
          <ActionBtn
            spinning={loading}
            label={
              loading
                ? "Updating…"
                : `${recoveryForm.action ? "Grant" : "Revoke"} Recovery`
            }
            fullWidth
            variant={recoveryForm.action ? "gold" : "danger"}
            disabled={loading || !recoveryForm.address}
            onClick={() =>
              requestPin(async (pk) => {
                await callAdmin(pk, "update-recovery", {
                  targetAddress: recoveryForm.address,
                  action: recoveryForm.action,
                });
                showMsg(
                  `Recovery ${recoveryForm.action ? "granted" : "revoked"}!`,
                );
                setRecoveryForm({ address: "", action: true });
              })
            }
          />
        </div>
      </div>
    </motion.div>
  );

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

  const activeNav = NAV_ITEMS.find((n) => n.id === activeSection);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-1">
            MultiSig Control · v2.1.0
          </p>
          <h3 className="text-2xl font-black tracking-tight">
            {activeSection === "overview" ? "Admin Panel" : activeNav?.label}
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {activeSection !== "overview" && (
            <button
              onClick={() => setActiveSection("overview")}
              className="px-4 py-2.5 rounded-xl border border-white/10 font-bold text-xs uppercase tracking-widest text-white/50 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all"
            >
              ← Back
            </button>
          )}
          <button
            onClick={fetchProposals}
            disabled={fetching}
            className="px-4 py-2.5 rounded-xl border border-white/10 font-bold text-xs uppercase tracking-widest text-white/50 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all disabled:opacity-40 flex items-center gap-2"
          >
            <span
              className={
                fetching ? "animate-spin inline-block" : "inline-block"
              }
            >
              ⟳
            </span>
            {fetching ? "…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Loading banner ── */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-3 p-4 rounded-2xl bg-salvaGold/8 border border-salvaGold/20"
          >
            <div className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
            <p className="text-xs text-salvaGold font-bold">
              Submitting on-chain… this may take 30–60 seconds.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Fetch error ── */}
      <AnimatePresence>
        {fetchError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-red-500/5 border border-red-500/20"
          >
            <p className="text-xs text-red-400 font-bold">⚠ {fetchError}</p>
            <button
              onClick={fetchProposals}
              className="text-[10px] text-salvaGold font-black uppercase tracking-widest border border-salvaGold/30 px-3 py-1.5 rounded-lg hover:bg-salvaGold hover:text-black transition-all"
            >
              Retry
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Section content ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18 }}
        >
          {(sections[activeSection] || sections.overview)()}
        </motion.div>
      </AnimatePresence>

      {/* ── PIN Modal ── */}
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
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 16 }}
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center space-y-5"
            >
              <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-2xl">🔐</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-white">
                  Admin Verification
                </h3>
                <p className="text-xs text-white/30 mt-1">
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
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black text-white"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setIsPinOpen(false);
                    setAdminPin("");
                  }}
                  className="flex-1 py-3.5 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={executePinnedAction}
                  disabled={adminPin.length !== 4}
                  className="flex-1 py-3.5 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 disabled:opacity-40 transition-all"
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

// ── Shared sub-components ─────────────────────────────────────────────────────

const ImmediateBadge = () => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-salvaGold/8 border border-salvaGold/20 w-fit">
    <motion.span
      animate={{ opacity: [1, 0.3, 1] }}
      transition={{ repeat: Infinity, duration: 2 }}
      className="w-1.5 h-1.5 rounded-full bg-salvaGold block flex-shrink-0"
    />
    <p className="text-[10px] font-black text-salvaGold uppercase tracking-widest">
      Immediate — No Proposal Required
    </p>
  </div>
);

const ActiveSection = ({ title, children }) => (
  <div>
    <div className="relative flex items-center mb-4">
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      <span className="mx-3 text-[9px] uppercase tracking-[0.3em] font-black text-white/20">
        {title}
      </span>
      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
    </div>
    <div className="space-y-3">{children}</div>
  </div>
);

const CancelBlock = ({
  title,
  hint,
  label,
  value,
  onChange,
  loading,
  onCancel,
}) => (
  <div className="p-5 rounded-2xl border border-red-500/15 bg-red-500/[0.02] space-y-4">
    <div>
      <p className="text-[9px] uppercase tracking-[0.35em] text-red-400/70 font-black">
        {title}
      </p>
      {hint && <p className="text-[10px] text-white/25 mt-1">{hint}</p>}
    </div>
    <Field label={label}>
      <Input
        placeholder="0x…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        mono
      />
    </Field>
    <ActionBtn
      spinning={loading}
      label={loading ? "Cancelling…" : "Cancel Proposal"}
      variant="danger"
      disabled={loading || !value}
      onClick={onCancel}
    />
  </div>
);

const ProposalActions = ({
  loading,
  isValidated,
  timeLockTimestamp,
  onValidate,
  onExecute,
  onCancel,
}) => {
  const timelockActive =
    timeLockTimestamp && Math.floor(Date.now() / 1000) < timeLockTimestamp;
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {onValidate && (
        <ActionBtn label="Validate" disabled={loading} onClick={onValidate} />
      )}
      <ActionBtn
        label="Execute"
        variant="green"
        disabled={loading || !isValidated || timelockActive}
        onClick={onExecute}
      />
      <ActionBtn
        label="Cancel"
        variant="danger"
        disabled={loading}
        onClick={onCancel}
      />
      {isValidated && timeLockTimestamp && (
        <TimelockCountdown timeLockTimestamp={timeLockTimestamp} />
      )}
    </div>
  );
};

const AdminPanel = (props) => (
  <AdminErrorBoundary>
    <AdminPanelInner {...props} />
  </AdminErrorBoundary>
);

export default AdminPanel;
