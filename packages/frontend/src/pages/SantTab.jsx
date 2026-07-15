// src/pages/SantTab.jsx
// $SANT wallet tab — Base Dashboard only. Send flow is an exact mirror of the
// main Dashboard Send modal (recipient resolution, registry dropdown, confirm
// card, PIN modal) — restricted to the SANT token only. Network fee is real:
// paid automatically in whatever NGN/USD token the user holds, resolved
// server-side, never hardcoded to zero.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import { QRCodeSVG } from 'qrcode.react';

function detectInputType(val) {
  const t = val.trim();
  if (!t) return 'empty';
  if (t.startsWith('0x')) return 'address';
  if (t.includes('@')) return 'fullname';
  return 'name';
}

// SANT is not a stablecoin — no fixed 2-decimal display makes sense for
// small amounts, but once the balance crosses 1 SANT, precision below the
// 3rd decimal stops being meaningful to look at. Rules:
//   0                → "0.00"
//   0 < x < 1e-6      → "<0.000001" (MetaMask-style dust display)
//   1e-6 <= x < 1      → up to 6 decimals, trailing zeros trimmed (min 2 shown)
//   x >= 1             → TRUNCATED (never rounded) to exactly 2 decimals
const fmtSant = (n) => {
  const num = parseFloat(n || 0);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  if (num > 0 && num < 0.000001) return '<0.000001';

  if (num >= 1) {
    // Truncate, don't round — e.g. 500001029.999999 → "500,001,029.99"
    // never "500,001,030.00".
    const truncated = Math.floor(num * 100) / 100;
    return truncated.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  // Sub-1 balances: TRUNCATE to 6 decimals, never round — toFixed(6) rounds
  // (e.g. 0.0000027 → "0.000003"), which can display/fill an amount LARGER
  // than the real on-chain balance and cause false "Insufficient balance"
  // errors. Math.floor at the 6th decimal guarantees the displayed number
  // is never more than what the wallet actually holds.
  const truncated6 = Math.floor(num * 1_000_000) / 1_000_000;
  const fixed = truncated6.toFixed(6);
  const [intPart, decPart] = fixed.split('.');
  let trimmed = decPart;
  while (trimmed.length > 2 && trimmed.endsWith('0')) trimmed = trimmed.slice(0, -1);

  const formattedInt = Number(intPart).toLocaleString('en-US');
  return `${formattedInt}.${trimmed}`;
};

const formatNumber = (value, { minDecimals = 0, maxDecimals = 6 } = {}) => {
  if (value === null || value === undefined || value === '') return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (num === 0) return '0';
  const fixed = num.toFixed(maxDecimals);
  const [intPart, decPart = ''] = fixed.split('.');
  let trimmed = decPart;
  while (trimmed.length > minDecimals && trimmed.endsWith('0')) trimmed = trimmed.slice(0, -1);
  const formattedInt = Number(intPart).toLocaleString('en-US');
  return trimmed.length > 0 ? `${formattedInt}.${trimmed}` : formattedInt;
};

const darkInput =
  'w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-sm text-white placeholder:text-white/60 transition-all';

// ── Searchable Registry Dropdown — identical pattern used on Dashboard ──────
const RegistryDropdown = ({
  registries,
  value,
  onChange,
  placeholder = 'Search wallet service…',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = registries.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.nspace || '').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={
          value
            ? undefined
            : () => {
                setOpen(true);
                setQuery('');
                setTimeout(() => inputRef.current?.focus(), 50);
              }
        }
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
          open
            ? 'border-salvaGold bg-salvaGold/5 ring-1 ring-salvaGold/30'
            : value
              ? 'border-salvaGold/40 bg-salvaGold/5'
              : 'border-white/10 bg-white/5 hover:border-salvaGold/40'
        }`}
      >
        {value ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-salvaGold/20 flex items-center justify-center flex-shrink-0">
              <span className="text-salvaGold text-xs font-black">
                {value.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm truncate text-white">{value.name}</p>
              <p className="text-[10px] opacity-40 font-mono truncate">{value.nspace}</p>
            </div>
          </div>
        ) : (
          <span className="text-sm font-bold text-white/60">{placeholder}</span>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange(null);
                setQuery('');
              }}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            >
              <span className="text-[10px] text-red-400 font-black leading-none">✕</span>
            </button>
          )}
          <svg
            className={`w-3 h-3 opacity-40 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] bottom-full mb-2 w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="p-3 border-b border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search…"
                  className="flex-1 bg-transparent outline-none text-xs font-bold placeholder:opacity-30 text-white"
                />
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs opacity-40 font-bold">No wallet services found</p>
                </div>
              ) : (
                filtered.map((reg) => (
                  <button
                    key={reg.registryAddress}
                    type="button"
                    onClick={() => {
                      onChange(reg);
                      setOpen(false);
                      setQuery('');
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-salvaGold/5 transition-colors text-left ${value?.registryAddress === reg.registryAddress ? 'bg-salvaGold/10' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-salvaGold/15 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-salvaGold text-sm font-black">
                        {reg.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm text-white">{reg.name}</p>
                      <p className="text-[10px] font-mono opacity-40">{reg.nspace}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SantTab = ({ user, registries, showMsg }) => {
  const [santBalance, setSantBalance] = useState('0.00');
  const [balanceLoading, setBalanceLoading] = useState(true);

  const [claim, setClaim] = useState({ totalPoints: 0, visible: true, active: false });
  const [claimLoading, setClaimLoading] = useState(true);
  const [claimPinModal, setClaimPinModal] = useState(false);
  const [claimPin, setClaimPin] = useState('');
  const [claiming, setClaiming] = useState(false);

  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [recipientInput, setRecipientInput] = useState('');
  const [inputType, setInputType] = useState('empty');
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferAmountDisplay, setTransferAmountDisplay] = useState('');
  const [amountError, setAmountError] = useState(false);
  const [feePreview, setFeePreview] = useState({ feeNGN: 0, feeUsd: 0, loading: false });
  const [loading, setLoading] = useState(false);

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);

  const fetchBalance = useCallback(async () => {
    if (!user?.safeAddress) return;
    setBalanceLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/sant/balance/${user.safeAddress}`);
      const data = await res.json();
      setSantBalance(data.santBalance ?? '0.00');
    } catch {
      /* keep existing */
    } finally {
      setBalanceLoading(false);
    }
  }, [user?.safeAddress]);

  const fetchClaimStatus = useCallback(async () => {
    if (!user?.email) return;
    setClaimLoading(true);
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/sant/claim-status/${encodeURIComponent(user.email)}`
      );
      const data = await res.json();
      if (res.ok) setClaim(data);
    } catch {
      /* keep existing */
    } finally {
      setClaimLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchBalance();
    fetchClaimStatus();
  }, [fetchBalance, fetchClaimStatus]);

  // ── Fee preview — real gas-oracle fee, same endpoint everything else uses ──
  const feeEstimateCache = useRef(null);
  const computeFeePreview = useCallback(async () => {
    const cached = feeEstimateCache.current;
    if (cached && Date.now() - cached.fetchedAt < 30_000) {
      setFeePreview({ ...cached.data, loading: false });
      return;
    }
    setFeePreview((p) => ({ ...p, loading: true }));
    try {
      const res = await fetch(`${SALVA_API_URL}/api/estimate-fee?chain=base&coin=NGN`);
      const data = await res.json();
      const preview = { feeNGN: data.feeNGN ?? 0, feeUsd: data.feeUsd ?? 0, loading: false };
      feeEstimateCache.current = { data: preview, fetchedAt: Date.now() };
      setFeePreview(preview);
    } catch {
      setFeePreview({ feeNGN: 0, feeUsd: 0, loading: false });
    }
  }, []);

  useEffect(() => {
    if (isSendOpen) computeFeePreview();
  }, [isSendOpen, computeFeePreview]);

  // ── Recipient input — identical detection logic to Dashboard Send ──────────
  const handleRecipientChange = (val) => {
    let cleaned = val.toLowerCase();
    if (cleaned.startsWith('0x') || val.startsWith('0x')) {
      setRecipientInput(val);
      setInputType('address');
      setSelectedRegistry(null);
      return;
    }
    if (cleaned.includes('@')) {
      cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
      const atIndex = cleaned.indexOf('@');
      if (atIndex !== -1)
        cleaned = cleaned.slice(0, atIndex + 1) + cleaned.slice(atIndex + 1).replace(/@/g, '');
      setRecipientInput(cleaned);
      setInputType('fullname');
      setSelectedRegistry(null);
      return;
    }
    cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1)
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    setRecipientInput(cleaned);
    const type = detectInputType(cleaned);
    setInputType(type);
    if (type === 'address') setSelectedRegistry(null);
    else if (type === 'fullname') setSelectedRegistry(null);
    else if (type === 'name' && registries.length === 1) setSelectedRegistry(registries[0]);
  };

  useEffect(() => {
    const amt = parseFloat(transferAmount);
    setAmountError(!isNaN(amt) && amt > parseFloat(santBalance ?? '0'));
  }, [transferAmount, santBalance]);

  const resetSendForm = () => {
    setRecipientInput('');
    setTransferAmount('');
    setTransferAmountDisplay('');
    setSelectedRegistry(registries.length === 1 ? registries[0] : null);
    setInputType('empty');
  };

  // ── Resolve recipient exactly like Dashboard Send, then show confirm card ──
  const resolveAndConfirm = async () => {
    if (!recipientInput || !transferAmount) return showMsg('Fill all fields', 'error');
    const type = detectInputType(recipientInput);
    if (type === 'name' && !selectedRegistry) return showMsg('Select a wallet service', 'error');
    if (type === 'fullname') {
      const parts = recipientInput.trim().split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1])
        return showMsg('Invalid name format. Use name@wallet (e.g. charles@salva)', 'error');
    }
    setLoading(true);
    try {
      let resolvedAddress = null;
      let displayIdentifier = recipientInput.trim();
      if (type === 'address') {
        resolvedAddress = recipientInput.trim().toLowerCase();
      } else if (type === 'fullname') {
        const res = await fetch(`${SALVA_API_URL}/api/resolve-full-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fullName: recipientInput.trim() }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolvedAddress) {
          showMsg(data.message || 'Recipient not found. Check the name or address.', 'error');
          return;
        }
        resolvedAddress = data.resolvedAddress.toLowerCase();
        displayIdentifier = recipientInput.trim();
      } else {
        const res = await fetch(`${SALVA_API_URL}/api/resolve-recipient`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: recipientInput.trim(),
            registryAddress: selectedRegistry.registryAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolvedAddress) {
          showMsg('Recipient not found. Check the name or address.', 'error');
          return;
        }
        resolvedAddress = data.resolvedAddress.toLowerCase();
        displayIdentifier = `${recipientInput.trim()}${selectedRegistry.nspace}`;
      }
      setConfirmationData({
        resolvedAddress,
        displayIdentifier,
        amount: transferAmount,
        walletName: selectedRegistry?.name || null,
        feeNGN: feePreview.feeNGN,
        feeUsd: feePreview.feeUsd,
      });
      setIsSendOpen(false);
      setIsConfirmModalOpen(true);
    } catch {
      showMsg('Could not find that recipient. Double-check and try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async (privateKey) => {
    setIsPinModalOpen(false);
    setIsConfirmModalOpen(false);
    resetSendForm();
    showMsg('Sending SANT…', 'info');
    try {
      const res = await fetch(`${SALVA_API_URL}/api/sant/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          userPrivateKey: privateKey,
          recipientAddress: confirmationData.resolvedAddress,
          amount: confirmationData.amount,
          senderDisplayIdentifier: confirmationData.displayIdentifier,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('✅ SANT sent successfully!');
        fetchBalance();
      } else {
        showMsg(data.message || 'Transfer failed', 'error');
      }
    } catch {
      showMsg('Connection error. Check your network and try again.', 'error');
    }
  };

  const verifyPinAndProceed = async () => {
    if (transactionPin.length !== 4) return showMsg('PIN must be 4 digits', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: transactionPin }),
      });
      const data = await res.json();
      if (res.ok) {
        setTransactionPin('');
        setPinAttempts(0);
        setLoading(false);
        await executeTransfer(data.privateKey);
      } else {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        showMsg(
          `Incorrect PIN — ${3 - newAttempts} attempt${3 - newAttempts !== 1 ? 's' : ''} left`,
          'error'
        );
        setLoading(false);
      }
    } catch {
      showMsg('Network error', 'error');
      setLoading(false);
    }
  };

  const handleClaimClick = () => {
    if (!claim.active) return;
    setClaimPinModal(true);
    setClaimPin('');
  };

  const executeClaim = async () => {
    if (claimPin.length !== 4) return;
    setClaiming(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/sant/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: claimPin }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(`🎉 Claimed ${data.claimedAmount} SANT!`);
        setClaimPinModal(false);
        fetchBalance();
        fetchClaimStatus();
      } else {
        showMsg(data.message || 'Claim failed', 'error');
      }
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setClaiming(false);
    }
  };

  const showRegistryDropdown = inputType === 'name';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* ── SANT Balance Card ── */}
      <div className="rounded-2xl sm:rounded-3xl overflow-hidden border border-salvaGold/[0.15] bg-gradient-to-b from-salvaGold/[0.06] to-white/[0.02] shadow-2xl">
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/50 to-transparent" />
        <div className="px-5 sm:px-7 pt-6 sm:pt-8 pb-6 sm:pb-8">
          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-9 h-9 rounded-full bg-black border border-salvaGold/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
              <img
                src="/salva-logo.png"
                alt="Salva"
                className="w-full h-full object-contain scale-150"
              />
            </span>
            <p className="text-[9px] uppercase tracking-[0.35em] text-salvaGold/70 font-black">
              SANT · Base Chain
            </p>
          </div>

          {balanceLoading ? (
            <div className="flex items-center gap-2 py-2">
              <span className="w-5 h-5 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            </div>
          ) : (
            <p
              className="font-black text-white tracking-tight break-all leading-none"
              style={{ fontSize: 'clamp(0.95rem, 4.5vw, 1.875rem)' }}
            >
              {fmtSant(santBalance)}{' '}
              <span className="text-salvaGold text-[0.55em] align-middle">SNT</span>
            </p>
          )}

          <div className="flex items-center gap-4 mt-2 text-[11px] font-mono text-white/40">
            <span>₦0.00</span>
            <span className="opacity-40">·</span>
            <span>$0.00</span>
          </div>
          <p className="text-[9px] text-white/30 mt-1">No market price yet. Earn by using Salva.</p>

          <div className="grid grid-cols-2 gap-3 mt-6">
            <button
              onClick={() => setIsSendOpen(true)}
              className="bg-salvaGold hover:brightness-110 active:scale-[0.98] transition-all text-black font-black py-2.5 rounded-xl text-xs uppercase tracking-widest shadow-lg shadow-salvaGold/20"
            >
              ↑ Send
            </button>
            <button
              onClick={() => setIsReceiveOpen(true)}
              className="border border-white/10 hover:border-salvaGold/40 hover:bg-white/5 active:scale-[0.98] transition-all font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest"
            >
              ↓ Receive
            </button>
          </div>
        </div>
      </div>

      {/* ── Claim Card — combined points only, no chain breakdown ── */}
      {claimLoading ? (
        <div className="flex justify-center py-6">
          <span className="w-6 h-6 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
        </div>
      ) : claim.visible ? (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-5">
          <div className="flex items-center justify-between mb-4 gap-2">
            <p className="text-[9px] sm:text-[10px] uppercase tracking-[0.3em] font-black text-white/60">
              SANT Points
            </p>
            <p className="font-black text-lg sm:text-2xl text-salvaGold">
              {claim.totalPoints.toLocaleString('en-US')}
            </p>
          </div>
          <button
            onClick={handleClaimClick}
            disabled={!claim.active}
            className={`w-full py-3 sm:py-3.5 rounded-xl font-black text-[11px] sm:text-sm uppercase tracking-widest transition-all leading-tight ${
              claim.active
                ? 'bg-salvaGold text-black hover:brightness-110 active:scale-[0.98] shadow-lg shadow-salvaGold/20'
                : 'bg-white/5 border border-white/10 text-white/25 cursor-not-allowed opacity-50'
            }`}
          >
            {claim.active
              ? `Claim ${claim.totalPoints.toLocaleString('en-US')} SANT`
              : 'Claim (earn points to unlock)'}
          </button>
        </div>
      ) : null}

      {/* ── Send Modal — mirrors Dashboard Send exactly ── */}
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
              className="relative bg-zinc-950 border border-white/10 p-6 sm:p-10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />
              <h3 className="text-2xl sm:text-3xl font-black text-white mb-1">Send SANT</h3>
              <p className="text-[10px] text-salvaGold/60 uppercase tracking-[0.35em] font-black mb-6">
                Salva Secure Transfer
              </p>
              <p className="text-[10px] text-white/60 mb-5">
                Balance: {balanceLoading ? '…' : fmtSant(santBalance)} SANT
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resolveAndConfirm();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-white/60 font-bold block">
                    Recipient
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Name alias or 0x address"
                    value={recipientInput}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className={darkInput}
                  />
                  {inputType !== 'empty' && (
                    <p className="text-[10px] text-white/60 font-bold ml-1">
                      {inputType === 'address'
                        ? '✓ Wallet address — sending directly'
                        : inputType === 'fullname'
                          ? '✓ Full name detected — resolving directly'
                          : 'Name alias — select a wallet below'}
                    </p>
                  )}
                  {showRegistryDropdown && registries.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase text-white/60 font-bold block mb-2">
                        Select Wallet Service
                      </label>
                      <RegistryDropdown
                        registries={registries}
                        value={selectedRegistry}
                        onChange={setSelectedRegistry}
                      />
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase text-white/60 font-bold">
                      Amount (SANT)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        // No math, no parseFloat, no toFixed — those all
                        // introduce float-precision drift or rounding on a
                        // value like "0.0000027" (JS floats can't represent
                        // that exactly). santBalance IS the exact decimal
                        // string the blockchain returned via
                        // ethers.formatUnits — just paste it through as-is.
                        const exact = santBalance || '0';
                        setTransferAmountDisplay(exact);
                        setTransferAmount(exact);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-salvaGold hover:opacity-80 transition-opacity px-2 py-0.5 rounded-lg bg-salvaGold/10 border border-salvaGold/20 hover:bg-salvaGold/20"
                    >
                      Max
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      value={transferAmountDisplay}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, '');
                        setTransferAmountDisplay(v);
                        setTransferAmount(v);
                      }}
                      className={`${darkInput} text-lg pr-16 ${amountError ? 'border-red-500' : ''}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">
                      SANT
                    </span>
                  </div>
                  {amountError && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold animate-pulse">
                      ⚠️ Insufficient balance
                    </p>
                  )}
                  <div className="mt-2 p-3 rounded-xl text-[10px] space-y-1 border bg-white/[0.03] border-white/[0.06]">
                    <div className="flex justify-between items-center">
                      <span className="text-white/60 uppercase font-bold">Network Fee</span>
                      {feePreview.loading ? (
                        <span className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                      ) : (
                        <span className="text-red-400 font-black">
                          ~₦{formatNumber(feePreview.feeNGN)} or ${feePreview.feeUsd?.toFixed(4)}
                        </span>
                      )}
                    </div>
                    <p className="text-white/30 font-medium">
                      Paid automatically in NGNs, cNGN, USDT, or USDC — whichever you hold
                    </p>
                  </div>
                </div>
                <button
                  disabled={loading || amountError || !recipientInput}
                  type="submit"
                  className={`w-full py-4 rounded-2xl font-black transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 ${
                    loading || amountError || !recipientInput
                      ? 'bg-white/5 text-white/60 cursor-not-allowed border border-white/5'
                      : 'bg-salvaGold text-black hover:brightness-110 active:scale-[0.98] shadow-lg shadow-salvaGold/20'
                  }`}
                >
                  {loading && (
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {loading ? 'Processing…' : 'Review & Send'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Confirm Modal ── */}
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
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-1 text-white">Verify Recipient</h3>
                <p className="text-sm text-white/60">
                  Double-check before sending. Blockchain transactions are irreversible.
                </p>
              </div>
              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-2xl bg-salvaGold/5 border border-salvaGold/15">
                  <p className="text-[10px] text-white/60 mb-1">Sending To</p>
                  <p className="font-black text-sm text-salvaGold break-all leading-snug">
                    {confirmationData.displayIdentifier}
                  </p>
                  <p className="font-mono text-[10px] text-white/60 mt-1 break-all">
                    {confirmationData.resolvedAddress}
                  </p>
                  {confirmationData.walletName && (
                    <p className="text-[10px] text-white/60 mt-1 font-bold">
                      to {confirmationData.walletName}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[10px] text-white/60 mb-1">You Send</p>
                  <p className="font-black text-xl text-white">
                    {formatNumber(confirmationData.amount, { minDecimals: 0, maxDecimals: 6 })}{' '}
                    <span className="text-salvaGold">SANT</span>
                  </p>
                </div>
                <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                  <p className="text-[10px] text-white/60 mb-1">Network Fee</p>
                  <p className="font-black text-base text-red-400">
                    ~₦{formatNumber(confirmationData.feeNGN)} or $
                    {confirmationData.feeUsd?.toFixed(4)}
                  </p>
                  <p className="text-[10px] text-white/30 mt-1">
                    Paid automatically in whichever token you hold
                  </p>
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-white hover:bg-white/5 transition-all"
                >
                  Go Back
                </button>
                <button
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setIsPinModalOpen(true);
                    setTransactionPin('');
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
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔐</span>
                </div>
                <h3 className="text-2xl font-black mb-1 text-white">Transaction PIN</h3>
                <p className="text-sm text-white/60">Verify identity to proceed</p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength="4"
                value={transactionPin}
                onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-5 text-white"
              />
              {pinAttempts > 0 && (
                <p className="text-xs text-red-400 text-center mb-4 font-bold">
                  ⚠️ {3 - pinAttempts} attempt{3 - pinAttempts !== 1 ? 's' : ''} remaining
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPinModalOpen(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={verifyPinAndProceed}
                  disabled={loading || transactionPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading && (
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Claim PIN Modal ── */}
      <AnimatePresence>
        {claimPinModal && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div
              onClick={() => !claiming && setClaimPinModal(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-salvaGold/20 p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <span className="text-2xl">🎁</span>
              </div>
              <h3 className="text-xl font-black text-white mb-1">
                Claim {claim.totalPoints.toLocaleString('en-US')} SANT
              </h3>
              <p className="text-sm text-white/60 mb-5">Minted directly to your Base wallet</p>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={claimPin}
                onChange={(e) => setClaimPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-5 text-white"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setClaimPinModal(false)}
                  disabled={claiming}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={executeClaim}
                  disabled={claiming || claimPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {claiming && (
                    <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {claiming ? 'Minting…' : 'Claim'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Receive Modal ── */}
      <AnimatePresence>
        {isReceiveOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              onClick={() => setIsReceiveOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-sm shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-7 sm:hidden" />
              <div className="text-center mb-7">
                <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/50 font-black mb-1">
                  Receive SANT
                </p>
                <h3 className="text-2xl font-black text-white">{user.username}</h3>
              </div>
              <div className="flex justify-center mb-6">
                <div
                  onClick={() => {
                    navigator.clipboard.writeText(user.safeAddress);
                    showMsg('Address copied!');
                  }}
                  className="p-4 rounded-2xl bg-white border-2 border-salvaGold/30 cursor-pointer"
                >
                  <QRCodeSVG value={user.safeAddress} size={188} level="M" />
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(user.safeAddress);
                  showMsg('Address copied!');
                }}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/30 transition-all mb-3 group"
              >
                <div className="min-w-0 text-left">
                  <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black mb-1">
                    Wallet Address
                  </p>
                  <p className="font-mono text-[10px] text-salvaGold/70 truncate">
                    {user.safeAddress}
                  </p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 group-hover:border-salvaGold/30 group-hover:bg-salvaGold/10 flex items-center justify-center flex-shrink-0 transition-all">
                  <svg
                    className="w-3 h-3 text-white/60 group-hover:text-salvaGold transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </button>
              {user.nameAlias && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user.nameAlias);
                    showMsg('Name alias copied!');
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/30 transition-all mb-3 group"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black mb-1">
                      Name Alias
                    </p>
                    <p className="font-black text-sm text-salvaGold">{user.nameAlias}</p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 group-hover:border-salvaGold/30 group-hover:bg-salvaGold/10 flex items-center justify-center flex-shrink-0 transition-all">
                    <svg
                      className="w-3 h-3 text-white/60 group-hover:text-salvaGold transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                </button>
              )}
              <button
                onClick={() => setIsReceiveOpen(false)}
                className="w-full py-3.5 rounded-2xl border border-white/10 font-bold text-white/60 hover:text-white transition-all text-sm uppercase tracking-widest"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SantTab;
