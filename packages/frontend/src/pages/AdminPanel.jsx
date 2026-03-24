// Salva-Digital-Tech/packages/frontend/src/pages/AdminPanel.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

// ── Countdown Timer Component ────────────────────────────────────────────────
const Countdown = ({ endsAt, onExpired }) => {
  const [remaining, setRemaining] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const tick = () => {
      const diff = new Date(endsAt) - new Date();
      if (diff <= 0) {
        setRemaining('00:00:00');
        setExpired(true);
        onExpired && onExpired();
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [endsAt, onExpired]);

  return (
    <span className={`font-mono text-sm font-black ${expired ? 'text-green-400' : 'text-salvaGold'}`}>
      {expired ? '✓ READY' : `⏱ ${remaining}`}
    </span>
  );
};

// ── Proposal Card ────────────────────────────────────────────────────────────
const ProposalCard = ({ proposal, userSafeAddress, onValidate, onExecute, onCancel, onDelete, loading }) => {
  const hasValidated = proposal.validatedBy?.includes(userSafeAddress?.toLowerCase());
  const remainingValidations = proposal.requiredValidationCount - proposal.validationCount;
  const timelockExpired = proposal.timelockEndsAt && new Date(proposal.timelockEndsAt) < new Date();
  const [timelockDone, setTimelockDone] = useState(timelockExpired);

  const isRegistryInit = proposal.type === 'registryInit';
  const actionColor = isRegistryInit ? 'text-blue-400' : (proposal.action ? 'text-green-400' : 'text-red-400');
  const actionLabel = isRegistryInit ? 'REGISTRY INIT' : (proposal.action ? 'ADD VALIDATOR' : 'REMOVE VALIDATOR');

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-5 sm:p-6 rounded-2xl border border-white/10 bg-white/5 space-y-4"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <span className={`text-[10px] font-black uppercase tracking-widest ${actionColor}`}>{actionLabel}</span>
          {isRegistryInit ? (
            <div className="mt-1">
              <p className="font-black text-base">{proposal.registryName}</p>
              <p className="text-salvaGold font-mono text-sm">{proposal.namespace}</p>
              <p className="font-mono text-[10px] opacity-40 break-all">{proposal.registryAddress}</p>
            </div>
          ) : (
            <div className="mt-1">
              <p className="font-mono text-xs opacity-60 break-all">{proposal.validatorAddress}</p>
            </div>
          )}
        </div>
        {/* Validation count badge */}
        <div className="text-right flex-shrink-0">
          {!proposal.isExecuted && !proposal.isCancelled && (
            <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${remainingValidations <= 0 ? 'bg-green-500/20 text-green-400' : 'bg-salvaGold/10 text-salvaGold'}`}>
              {remainingValidations <= 0 ? 'Quorum ✓' : `${remainingValidations} more needed`}
            </div>
          )}
          {proposal.isCancelled && <span className="text-[10px] text-red-400 font-black uppercase">Cancelled</span>}
          {proposal.isExecuted && (
            <span className={`text-[10px] font-black uppercase ${proposal.executionSuccess ? 'text-green-400' : 'text-red-400'}`}>
              {proposal.executionSuccess ? '✓ Executed' : '✗ Failed'}
            </span>
          )}
        </div>
      </div>

      {/* Timelock countdown — shown after quorum, before execute */}
      {proposal.isValidated && !proposal.isExecuted && !proposal.isCancelled && proposal.timelockEndsAt && (
        <div className="p-3 rounded-xl bg-black/20 border border-salvaGold/10 flex items-center justify-between">
          <span className="text-[10px] uppercase opacity-40 font-bold">Execute unlocks in</span>
          <Countdown endsAt={proposal.timelockEndsAt} onExpired={() => setTimelockDone(true)} />
        </div>
      )}

      {/* Actions */}
      {!proposal.isCancelled && !proposal.isExecuted && (
        <div className="flex flex-wrap gap-2">
          {/* Validate button — hidden if quorum reached */}
          {!proposal.isValidated && (
            <button
              onClick={() => onValidate(proposal)}
              disabled={loading || hasValidated}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${hasValidated ? 'bg-white/5 text-white/20 cursor-not-allowed' : 'bg-salvaGold text-black hover:brightness-110 active:scale-95'}`}
            >
              {hasValidated ? '✓ Validated' : 'Validate'}
            </button>
          )}

          {/* Execute button — only after timelock expired */}
          {proposal.isValidated && (timelockDone || timelockExpired) && (
            <button
              onClick={() => onExecute(proposal)}
              disabled={loading}
              className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-green-500 text-white hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
            >
              {loading ? 'Executing...' : 'Execute'}
            </button>
          )}

          {/* Cancel button — always available until executed */}
          <button
            onClick={() => onCancel(proposal)}
            disabled={loading}
            className="px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Delete button — only after execute (success or fail) */}
      {proposal.isExecuted && (
        <button
          onClick={() => onDelete(proposal._id)}
          disabled={loading}
          className="w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 text-white/30 hover:border-red-500/30 hover:text-red-400 transition-all"
        >
          Remove from list
        </button>
      )}
    </motion.div>
  );
};

// ── Main Admin Panel ─────────────────────────────────────────────────────────
const AdminPanel = ({ user, showMsg }) => {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [fetchingProposals, setFetchingProposals] = useState(true);

  // Propose Registry Init form
  const [showRegistryForm, setShowRegistryForm] = useState(false);
  const [registryForm, setRegistryForm] = useState({ name: '', namespace: '@', address: '' });

  // Propose Validator Update form
  const [showValidatorForm, setShowValidatorForm] = useState(false);
  const [validatorForm, setValidatorForm] = useState({ address: '', action: true });

  // PIN modal for signing
  const [isPinOpen, setIsPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [pendingAction, setPendingAction] = useState(null); // { type, payload }

  const fetchProposals = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposals`);
      const data = await res.json();
      setProposals(Array.isArray(data) ? data : []);
    } catch (_) { } finally { setFetchingProposals(false); }
  }, []);

  useEffect(() => {
    fetchProposals();
    const interval = setInterval(fetchProposals, 15000);
    return () => clearInterval(interval);
  }, [fetchProposals]);

  const openPin = (actionType, payload) => {
    setPendingAction({ type: actionType, payload });
    setPin('');
    setIsPinOpen(true);
  };

  const verifyPinAndAct = async () => {
    if (pin.length !== 4) return showMsg('PIN must be 4 digits', 'error');
    setLoading(true);
    setIsPinOpen(false);
    try {
      // Verify pin + get private key
      const identifier = user.email || user.username;
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, pin })
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) { showMsg('Invalid PIN', 'error'); setLoading(false); return; }

      const privateKey = pinData.privateKey;
      const { type, payload } = pendingAction;

      let endpoint, body;
      if (type === 'proposeRegistry') {
        endpoint = '/api/admin/propose-registry';
        body = { ...payload, privateKey, proposerAddress: user.safeAddress };
      } else if (type === 'proposeValidator') {
        endpoint = '/api/admin/propose-validator';
        body = { ...payload, privateKey, proposerAddress: user.safeAddress };
      } else if (type === 'validate') {
        endpoint = '/api/admin/validate';
        body = { ...payload, privateKey, validatorAddress: user.safeAddress };
      } else if (type === 'execute') {
        endpoint = '/api/admin/execute';
        body = { ...payload, privateKey, executorAddress: user.safeAddress };
      } else if (type === 'cancel') {
        endpoint = '/api/admin/cancel';
        body = { ...payload, privateKey };
      }

      const res = await fetch(`${SALVA_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      if (res.ok) {
        showMsg(data.message || 'Action successful!');
        await fetchProposals();
        setShowRegistryForm(false);
        setShowValidatorForm(false);
        setRegistryForm({ name: '', namespace: '@', address: '' });
        setValidatorForm({ address: '', action: true });
      } else {
        showMsg(data.message || 'Action failed', 'error');
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (proposalId) => {
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/admin/proposals/${proposalId}`, { method: 'DELETE' });
      if (res.ok) { showMsg('Proposal removed'); await fetchProposals(); }
      else showMsg('Failed to remove', 'error');
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setLoading(false); }
  };

  const activeProposals = proposals.filter(p => !p.isCancelled || p.isExecuted);
  const registryProposals = activeProposals.filter(p => p.type === 'registryInit');
  const validatorProposals = activeProposals.filter(p => p.type === 'validatorUpdate');

  return (
    <div className="space-y-8 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">MultiSig Admin</p>
          <h3 className="text-xl sm:text-2xl font-black mt-1">Governance Panel</h3>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-salvaGold/10 border border-salvaGold/20">
          <div className="w-2 h-2 rounded-full bg-salvaGold animate-pulse" />
          <span className="text-[10px] text-salvaGold font-black uppercase">Validator</span>
        </div>
      </div>

      {/* ── PROPOSE ACTIONS ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Propose Registry Init */}
        <div className="space-y-3">
          <button
            onClick={() => { setShowRegistryForm(!showRegistryForm); setShowValidatorForm(false); }}
            className="w-full p-5 rounded-2xl border border-salvaGold/20 bg-salvaGold/5 hover:border-salvaGold/40 hover:bg-salvaGold/10 transition-all text-left"
          >
            <p className="text-[10px] uppercase tracking-widest opacity-50 font-bold mb-1">Propose</p>
            <p className="font-black text-base">Registry Initialization</p>
            <p className="text-xs opacity-50 mt-1">Add a new wallet/registry to Salva protocol</p>
          </button>

          <AnimatePresence>
            {showRegistryForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-3">
                  <h4 className="text-sm font-black text-salvaGold uppercase tracking-widest">Registry Details</h4>
                  <input
                    placeholder="Registry Name (e.g. Coinbase)"
                    value={registryForm.name}
                    onChange={(e) => setRegistryForm({ ...registryForm, name: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-sm outline-none focus:border-salvaGold font-bold"
                  />
                  <div className="relative">
                    <input
                      placeholder="@namespace"
                      value={registryForm.namespace}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (!val.startsWith('@')) val = '@' + val.replace('@', '');
                        setRegistryForm({ ...registryForm, namespace: val });
                      }}
                      className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-sm outline-none focus:border-salvaGold font-bold font-mono"
                    />
                    <p className="text-[9px] opacity-40 mt-1 font-bold">Must start with @ · max 16 chars</p>
                  </div>
                  <input
                    placeholder="Registry Contract Address (0x...)"
                    value={registryForm.address}
                    onChange={(e) => setRegistryForm({ ...registryForm, address: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-sm outline-none focus:border-salvaGold font-bold font-mono"
                  />
                  <button
                    disabled={loading || !registryForm.name || !registryForm.namespace || !registryForm.address}
                    onClick={() => openPin('proposeRegistry', { registryName: registryForm.name, namespace: registryForm.namespace, registryAddress: registryForm.address })}
                    className="w-full py-3 rounded-xl bg-salvaGold text-black font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Submitting...' : 'Submit Proposal'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Propose Validator Update */}
        <div className="space-y-3">
          <button
            onClick={() => { setShowValidatorForm(!showValidatorForm); setShowRegistryForm(false); }}
            className="w-full p-5 rounded-2xl border border-salvaGold/20 bg-salvaGold/5 hover:border-salvaGold/40 hover:bg-salvaGold/10 transition-all text-left"
          >
            <p className="text-[10px] uppercase tracking-widest opacity-50 font-bold mb-1">Propose</p>
            <p className="font-black text-base">Validator Update</p>
            <p className="text-xs opacity-50 mt-1">Add or remove a validator from the MultiSig</p>
          </button>

          <AnimatePresence>
            {showValidatorForm && (
              <motion.div
                initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-5 rounded-2xl border border-white/10 bg-white/5 space-y-3">
                  <h4 className="text-sm font-black text-salvaGold uppercase tracking-widest">Validator Details</h4>
                  <input
                    placeholder="Validator Address (0x...)"
                    value={validatorForm.address}
                    onChange={(e) => setValidatorForm({ ...validatorForm, address: e.target.value })}
                    className="w-full p-3 rounded-xl bg-black/30 border border-white/10 text-sm outline-none focus:border-salvaGold font-bold font-mono"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    {[{ label: 'Add Validator', value: true, color: 'border-green-500/40 text-green-400' }, { label: 'Remove Validator', value: false, color: 'border-red-500/40 text-red-400' }].map((opt) => (
                      <button key={String(opt.value)}
                        onClick={() => setValidatorForm({ ...validatorForm, action: opt.value })}
                        className={`py-2.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${validatorForm.action === opt.value ? `${opt.color} bg-white/5` : 'border-white/10 opacity-40'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <button
                    disabled={loading || !validatorForm.address}
                    onClick={() => openPin('proposeValidator', { targetAddress: validatorForm.address, action: validatorForm.action })}
                    className="w-full py-3 rounded-xl bg-salvaGold text-black font-black text-xs uppercase tracking-widest hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? 'Submitting...' : 'Submit Proposal'}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── PROPOSALS LIST ── */}
      <div className="space-y-6">
        {/* Registry Proposals */}
        {registryProposals.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">Registry Proposals</h4>
            {registryProposals.map((p) => (
              <ProposalCard
                key={p._id}
                proposal={p}
                userSafeAddress={user.safeAddress}
                loading={loading}
                onValidate={(proposal) => openPin('validate', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.registryAddress })}
                onExecute={(proposal) => openPin('execute', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.registryAddress })}
                onCancel={(proposal) => openPin('cancel', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.registryAddress })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* Validator Proposals */}
        {validatorProposals.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-[10px] uppercase tracking-[0.3em] text-salvaGold font-black">Validator Proposals</h4>
            {validatorProposals.map((p) => (
              <ProposalCard
                key={p._id}
                proposal={p}
                userSafeAddress={user.safeAddress}
                loading={loading}
                onValidate={(proposal) => openPin('validate', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.validatorAddress })}
                onExecute={(proposal) => openPin('execute', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.validatorAddress })}
                onCancel={(proposal) => openPin('cancel', { proposalId: proposal._id, proposalType: proposal.type, targetAddress: proposal.validatorAddress })}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {fetchingProposals && (
          <div className="flex items-center justify-center py-12 gap-3 opacity-30">
            <div className="w-5 h-5 border-2 border-salvaGold border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold uppercase tracking-widest">Loading proposals...</span>
          </div>
        )}

        {!fetchingProposals && proposals.length === 0 && (
          <div className="text-center py-16 opacity-20">
            <p className="text-4xl mb-3">🏛️</p>
            <p className="text-xs uppercase font-bold tracking-widest">No active proposals</p>
          </div>
        )}
      </div>

      {/* ── PIN Modal ── */}
      <AnimatePresence>
        {isPinOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            <motion.div onClick={() => setIsPinOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-900 p-8 rounded-3xl w-full max-w-sm border border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔐</span>
                </div>
                <h3 className="text-xl font-black mb-1">Confirm Action</h3>
                <p className="text-xs opacity-50">Enter your transaction PIN to sign this on-chain action</p>
              </div>
              <input
                type="password" inputMode="numeric" maxLength="4"
                value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••" autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-transparent focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />
              <div className="flex gap-3">
                <button onClick={() => setIsPinOpen(false)} className="flex-1 py-3 rounded-xl border border-white/10 font-bold">Cancel</button>
                <button onClick={verifyPinAndAct} disabled={pin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold disabled:opacity-50">
                  Confirm
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AdminPanel;