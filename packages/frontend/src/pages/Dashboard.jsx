// Salva-Digital-Tech/packages/frontend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';
import AdminPanel from './AdminPanel';

// ── Helpers ──────────────────────────────────────────────────────────────────
const formatNumber = (num) =>
  parseFloat(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatAmountInput = (raw) => {
  const digits = raw.replace(/[^0-9.]/g, '');
  const parts = digits.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
};

// ── Main Dashboard ────────────────────────────────────────────────────────────
const Dashboard = () => {
  const [user, setUser] = useState(null);
  const [balance, setBalance] = useState('0.00');
  const [showBalance, setShowBalance] = useState(true);
  const [activeTab, setActiveTab] = useState('send');
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Send modal state
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [sendStep, setSendStep] = useState(1); // 1=input, 2=confirm
  const [registries, setRegistries] = useState([]);
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [recipientInput, setRecipientInput] = useState('');
  const [inputType, setInputType] = useState(null); // 'name' | 'number' | 'address'
  const [amountRaw, setAmountRaw] = useState('');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [feeConfig, setFeeConfig] = useState(null);
  const [feePreview, setFeePreview] = useState({ feeNGN: 0 });
  const [resolvedData, setResolvedData] = useState(null); // { weldedName/number, address }
  const [amountError, setAmountError] = useState(false);

  // PIN modal
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);

  // Alias registration state
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasStep, setAliasStep] = useState(1); // 1=choose, 2=input, 3=confirm, 4=success
  const [aliasChoice, setAliasChoice] = useState(null); // 'name' | 'number'
  const [aliasNameInput, setAliasNameInput] = useState('');
  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasCheckResult, setAliasCheckResult] = useState(null); // {taken, weldedName}

  // Account status
  const [noPinWarning, setNoPinWarning] = useState(false);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        fetchBalance(parsedUser.safeAddress);
        fetchMeta();
        checkAccountStatus(parsedUser);
        const interval = setInterval(() => fetchBalance(parsedUser.safeAddress), 30000);
        return () => clearInterval(interval);
      } catch (_) { window.location.href = '/login'; }
    } else {
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    if (notification.show) {
      const t = setTimeout(() => setNotification({ ...notification, show: false }), 4000);
      return () => clearTimeout(t);
    }
  }, [notification]);

  useEffect(() => {
    if (amountRaw && balance) {
      setAmountError(parseFloat(amountRaw) > parseFloat(balance));
    } else { setAmountError(false); }
  }, [amountRaw, balance]);

  // ── Detect input type as user types ────────────────────────────────────────
  useEffect(() => {
    const v = recipientInput.trim();
    if (!v) { setInputType(null); setSelectedRegistry(null); return; }
    if (v.startsWith('0x')) { setInputType('address'); setSelectedRegistry(null); return; }
    if (/^\d+$/.test(v)) { setInputType('number'); return; }
    // Has any letter → name
    setInputType('name');
  }, [recipientInput]);

  const showMsg = (msg, type = 'success') => setNotification({ show: true, message: msg, type });

  const fetchBalance = async (address) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      const data = await res.json();
      setBalance(parseFloat(data.balance || 0).toFixed(2));
    } catch (_) { setBalance('0.00'); }
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
    } catch (_) { }
  };

  const checkAccountStatus = async (parsedUser) => {
    try {
      const identifier = parsedUser.email || parsedUser.username;
      const res = await fetch(`${SALVA_API_URL}/api/user/pin-status/${identifier}`);
      const data = await res.json();
      if (!data.hasPin) setNoPinWarning(true);
      if (data.isLocked) {
        setIsAccountLocked(true);
        const hoursLeft = Math.ceil((new Date(data.lockedUntil) - new Date()) / (1000 * 60 * 60));
        setLockMessage(`Account locked for ${hoursLeft} more hours`);
      }
    } catch (_) { }
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

  // ── Send Flow ───────────────────────────────────────────────────────────────
  const handleSendClick = () => {
    if (isAccountLocked) return showMsg(lockMessage, 'error');
    if (noPinWarning) return showMsg('Set a transaction PIN in Account Settings first', 'error');
    setIsSendOpen(true);
    setSendStep(1);
    setRecipientInput('');
    setAmountRaw('');
    setAmountDisplay('');
    setSelectedRegistry(null);
    setResolvedData(null);
    setFeePreview({ feeNGN: 0 });
  };

  const handleResolveAndConfirm = async () => {
    if (!recipientInput.trim() || !amountRaw) return showMsg('Fill all fields', 'error');
    if (amountError) return showMsg('Insufficient balance', 'error');

    // For name/number input, registry must be selected
    if ((inputType === 'name' || inputType === 'number') && !selectedRegistry) {
      return showMsg('Select a wallet from the dropdown', 'error');
    }

    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/resolve-for-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: recipientInput.trim(),
          inputType,
          registryAddress: selectedRegistry?.registryAddress || null,
          namespace: selectedRegistry?.namespace || null,
        })
      });
      const data = await res.json();
      if (!data.found) { setLoading(false); return showMsg(data.message || 'Recipient not found', 'error'); }
      setResolvedData(data); // { address, displayIdentifier, weldedName, accountNumber }
      setSendStep(2);
    } catch (_) {
      showMsg('Failed to resolve recipient', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmSend = () => {
    setIsSendOpen(false);
    setIsPinModalOpen(true);
    setTransactionPin('');
    setPinAttempts(0);
  };

  const verifyPinAndSend = async () => {
    if (transactionPin.length !== 4) return showMsg('PIN must be 4 digits', 'error');
    setLoading(true);
    try {
      const identifier = user.email || user.username;
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: identifier, pin: transactionPin })
      });
      const data = await res.json();
      if (res.ok) {
        setIsPinModalOpen(false);
        executeTransfer(data.privateKey);
      } else {
        setPinAttempts(p => p + 1);
        if (pinAttempts >= 2) {
          showMsg('Too many failed attempts', 'error');
          setTimeout(() => navigate('/account-settings'), 2000);
        } else {
          showMsg(`Invalid PIN. ${3 - pinAttempts - 1} attempts remaining`, 'error');
        }
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setLoading(false); }
  };

  const executeTransfer = async (privateKey) => {
    setLoading(true);
    showMsg('Transaction queued...', 'info');
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: resolvedData.address, // always send resolved address
          amount: amountRaw,
          registryAddress: selectedRegistry?.registryAddress || null,
        })
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Transfer Successful!');
        setAmountRaw('');
        setAmountDisplay('');
        setRecipientInput('');
        setResolvedData(null);
        setTimeout(() => fetchBalance(user.safeAddress), 3500);
      } else {
        showMsg(data.message || 'Transfer failed', 'error');
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setLoading(false); }
  };

  // ── Alias Registration ──────────────────────────────────────────────────────
  const openAliasModal = () => {
    setShowAliasModal(true);
    setAliasStep(1);
    setAliasChoice(null);
    setAliasNameInput('');
    setAliasCheckResult(null);
  };

  const handleAliasChoose = (choice) => {
    setAliasChoice(choice);
    setAliasStep(2);
  };

  const handleNumberAlias = async () => {
    setAliasLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/register-number`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress: user.safeAddress, email: user.email || user.username })
      });
      const data = await res.json();
      if (res.ok) {
        // Update local user
        const updatedUser = { ...user, numberAlias: data.numberAlias };
        localStorage.setItem('salva_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        setAliasStep(4);
        showMsg(`Number alias ${data.numberAlias} registered!`);
      } else {
        showMsg(data.message || 'Failed to register number alias', 'error');
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setAliasLoading(false); }
  };

  const handleNameCheck = async () => {
    if (!aliasNameInput.trim()) return showMsg('Enter a name', 'error');
    setAliasLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: aliasNameInput.trim() })
      });
      const data = await res.json();
      if (res.ok) {
        setAliasCheckResult(data); // { taken, weldedName, name }
        if (data.taken) {
          showMsg('Name already taken, try another', 'error');
        } else {
          setAliasStep(3); // Confirm step
        }
      } else {
        showMsg(data.message || 'Failed to check name', 'error');
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setAliasLoading(false); }
  };

  const handleNameAlias = async () => {
    setAliasLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/register-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          email: user.email || user.username,
          name: aliasNameInput.trim()
        })
      });
      const data = await res.json();
      if (res.ok) {
        const updatedUser = { ...user, nameAlias: data.nameAlias };
        localStorage.setItem('salva_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
        setAliasStep(4);
        showMsg(`Name alias ${data.nameAlias}@salva registered!`);
      } else {
        showMsg(data.message || 'Failed to register name alias', 'error');
      }
    } catch (_) { showMsg('Network error', 'error'); }
    finally { setAliasLoading(false); }
  };

  // ── Alias still needed? ─────────────────────────────────────────────────────
  const aliasStillNeeded = !user?.nameAlias || !user?.numberAlias;

  // ── Tabs ────────────────────────────────────────────────────────────────────
  const tabs = user?.isValidator
    ? ['send', 'buyNGNs', 'adminPanel']
    : ['send', 'buyNGNs'];

  const tabLabels = { send: 'Send', buyNGNs: 'Buy NGNs', adminPanel: 'Admin Panel' };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-4xl mx-auto relative z-10">

        {/* ── Header ── */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-salvaGold font-bold">
              {user.isValidator ? '⚡ Validator · Salva Citizen' : 'Salva Citizen'}
            </p>
            <h2 className="text-3xl sm:text-4xl font-black truncate max-w-[220px] sm:max-w-none">{user.username}</h2>
          </div>
          {/* Alias info card */}
          <div className="bg-gray-100 dark:bg-white/5 p-4 rounded-2xl w-full sm:w-auto min-w-[200px]">
            <p className="text-[10px] uppercase opacity-40 font-bold mb-1">Your Aliases</p>
            <div className="space-y-1">
              {user.nameAlias ? (
                <p className="font-mono font-bold text-salvaGold text-sm">{user.nameAlias}@salva</p>
              ) : (
                <p className="font-mono text-xs opacity-30 italic">No name alias yet</p>
              )}
              {user.numberAlias ? (
                <p className="font-mono font-bold text-salvaGold text-sm">{showBalance ? user.numberAlias : '••••••••••'}</p>
              ) : (
                <p className="font-mono text-xs opacity-30 italic">No number alias yet</p>
              )}
            </div>
          </div>
        </header>

        {/* ── Register Alias CTA ── */}
        {aliasStillNeeded && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 sm:p-5 rounded-2xl border border-salvaGold/40 bg-salvaGold/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div>
              <p className="font-black text-sm text-salvaGold">🪪 Register Your Alias</p>
              <p className="text-xs opacity-60 mt-0.5">
                {!user.nameAlias && !user.numberAlias
                  ? 'Claim your name and number — so others can find you easily.'
                  : !user.nameAlias
                    ? 'Add a name alias — e.g. "charles@salva"'
                    : 'Add a number alias for easier transactions.'}
              </p>
            </div>
            <button
              onClick={openAliasModal}
              className="flex-shrink-0 px-5 py-2.5 bg-salvaGold text-black font-black text-xs uppercase tracking-widest rounded-xl hover:brightness-110 active:scale-95 transition-all"
            >
              Register Alias
            </button>
          </motion.div>
        )}

        {/* ── Balance Card ── */}
        <div className="rounded-3xl bg-gray-100 dark:bg-black p-6 sm:p-10 mb-8 border border-white/5 shadow-2xl overflow-hidden">
          <div className="flex justify-between items-center mb-4">
            <p className="uppercase text-[10px] sm:text-xs opacity-40 font-bold tracking-widest">Available Balance</p>
            <button onClick={() => setShowBalance(!showBalance)} className="hover:scale-110 transition-transform p-2">
              {showBalance ? '👁' : '👁‍🗨'}
            </button>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3 overflow-hidden mb-8">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tighter leading-none">
              {showBalance ? formatNumber(balance) : '••••••.••'}
            </h1>
            <span className="text-salvaGold text-xl sm:text-2xl font-black mt-1 sm:mt-0">NGNs</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4">
            <button onClick={handleSendClick}
              className="bg-salvaGold hover:bg-yellow-600 transition-colors text-black font-black py-4 rounded-2xl shadow-lg shadow-salvaGold/20 text-sm sm:text-base">
              SEND
            </button>
            <button onClick={() => { navigator.clipboard.writeText(user.numberAlias || user.safeAddress); showMsg('Copied!'); }}
              className="border border-salvaGold/30 hover:bg-white/5 transition-all py-4 rounded-2xl font-bold text-sm sm:text-base">
              RECEIVE
            </button>
          </div>
        </div>

        {/* ── Wallet Address ── */}
        <div onClick={() => { navigator.clipboard.writeText(user.safeAddress); showMsg('Wallet address copied!'); }}
          className="mb-8 p-4 bg-gray-50 dark:bg-white/5 rounded-2xl border border-white/5 cursor-pointer hover:border-salvaGold/30 transition-all">
          <p className="text-[10px] uppercase opacity-40 font-bold mb-1 tracking-widest">Smart Wallet Address (Base)</p>
          <p className="font-mono text-[10px] sm:text-xs text-salvaGold font-medium break-all">
            {showBalance ? user.safeAddress : '0x••••••••••••••••••••••••••••••••••••••••'}
          </p>
        </div>

        {/* ── Tabs ── */}
        <div className="flex border-b border-white/10 mb-6 gap-6 sm:gap-8 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`pb-3 text-[10px] uppercase tracking-widest font-black transition-all whitespace-nowrap ${activeTab === tab ? 'border-b-2 border-salvaGold text-salvaGold' : 'opacity-40 hover:opacity-100'}`}>
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* ── Send Tab ── */}
        {activeTab === 'send' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1">
            <div className="flex flex-col items-center justify-center py-16 gap-6 text-center">
              <div className="w-20 h-20 rounded-full bg-salvaGold/10 flex items-center justify-center">
                <span className="text-3xl">💸</span>
              </div>
              <div>
                <h3 className="text-2xl font-black mb-2">Ready to Send?</h3>
                <p className="opacity-50 text-sm">Transfer NGNs instantly to any Salva alias or wallet address.</p>
              </div>
              <button onClick={handleSendClick}
                className="px-8 py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-salvaGold/20 uppercase tracking-widest text-sm">
                Send NGNs
              </button>
            </div>
          </motion.section>
        )}

        {/* ── Buy NGNs Tab ── */}
        {activeTab === 'buyNGNs' && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-1">
            <div className="flex flex-col items-center justify-center py-20 gap-6 text-center">
              <div className="w-24 h-24 rounded-full bg-salvaGold/10 border-2 border-salvaGold/30 flex items-center justify-center">
                <span className="text-4xl">₦</span>
              </div>
              <div>
                <h3 className="text-2xl sm:text-3xl font-black mb-3 tracking-tight">Buy NGNs</h3>
                <p className="opacity-50 text-sm max-w-sm mx-auto leading-relaxed">
                  On-ramp Naira directly into your Salva wallet. Fund your balance with Nigerian Naira and start transacting on-chain instantly.
                </p>
              </div>
              <div className="relative">
                <button disabled
                  className="px-10 py-4 bg-salvaGold text-black font-black rounded-2xl opacity-50 cursor-not-allowed uppercase tracking-widest text-sm">
                  BUY NGNs
                </button>
                <div className="mt-3 flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-salvaGold/50 animate-pulse" />
                  <span className="text-[10px] uppercase tracking-[0.3em] opacity-40 font-bold">Coming Soon</span>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* ── Admin Panel Tab ── */}
        {activeTab === 'adminPanel' && user?.isValidator && (
          <motion.section initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <AdminPanel user={user} showMsg={showMsg} />
          </motion.section>
        )}
      </div>

      {/* ── SEND MODAL ── */}
      <AnimatePresence>
        {isSendOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div onClick={() => !loading && setIsSendOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div
              className="relative bg-white dark:bg-zinc-900 p-6 sm:p-10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg border-t sm:border border-white/10 shadow-2xl"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="w-12 h-1.5 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

              {sendStep === 1 && (
                <>
                  <h3 className="text-2xl sm:text-3xl font-black mb-1">Send NGNs</h3>
                  <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-8">Salva Secure Transfer</p>

                  <div className="space-y-5">
                    {/* Recipient input */}
                    <div className="space-y-3">
                      <label className="text-[10px] uppercase opacity-40 font-bold block">Recipient</label>
                      <input
                        type="text"
                        placeholder="Name, number, or 0x address"
                        value={recipientInput}
                        onChange={(e) => { setRecipientInput(e.target.value); setSelectedRegistry(null); setResolvedData(null); }}
                        className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold transition-all outline-none font-bold text-sm"
                      />

                      {/* Input type hint */}
                      {inputType && (
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-50">
                          {inputType === 'name' ? '📝 Name alias detected' : inputType === 'number' ? '🔢 Number alias detected' : '🔷 Wallet address detected'}
                        </p>
                      )}

                      {/* Registry dropdown — shown for name or number */}
                      {(inputType === 'name' || inputType === 'number') && registries.length > 0 && (
                        <div>
                          <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">Choose Wallet</label>
                          <select
                            value={selectedRegistry?.registryAddress || ''}
                            onChange={(e) => setSelectedRegistry(registries.find(r => r.registryAddress === e.target.value) || null)}
                            className="w-full p-4 bg-white dark:bg-black rounded-xl border border-white/10 text-sm outline-none focus:border-salvaGold font-bold text-black dark:text-white"
                          >
                            <option value="">— Select Wallet —</option>
                            {registries.map((reg) => (
                              <option key={reg.registryAddress} value={reg.registryAddress}>{reg.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>

                    {/* Amount */}
                    <div>
                      <label className="text-[10px] uppercase opacity-40 font-bold mb-2 block">Amount (NGN)</label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={amountDisplay}
                          onChange={(e) => {
                            const fmt = formatAmountInput(e.target.value);
                            setAmountDisplay(fmt);
                            const raw = fmt.replace(/,/g, '');
                            setAmountRaw(raw);
                            computeFeePreview(raw);
                          }}
                          className={`w-full p-4 rounded-xl text-lg font-bold bg-gray-100 dark:bg-white/5 outline-none transition-all ${amountError ? 'border border-red-500 text-red-500' : 'border border-transparent'}`}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">NGN</span>
                      </div>
                      {amountError && <p className="text-[10px] text-red-400 mt-1 font-bold uppercase">⚠️ Balance too low</p>}
                      {feePreview.feeNGN > 0 && amountRaw && !amountError && (
                        <div className="mt-2 p-3 rounded-xl bg-white/5 border border-white/10 flex justify-between text-[10px]">
                          <span className="opacity-50 font-bold uppercase">Network Fee</span>
                          <span className="text-red-400 font-black">-{formatNumber(feePreview.feeNGN)} NGNs</span>
                        </div>
                      )}
                    </div>

                    <button
                      disabled={loading || amountError || !recipientInput.trim() || !amountRaw}
                      onClick={handleResolveAndConfirm}
                      className="w-full py-5 rounded-2xl font-black transition-all text-sm uppercase tracking-widest bg-salvaGold text-black hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {loading ? 'RESOLVING...' : 'REVIEW TRANSACTION'}
                    </button>
                  </div>
                </>
              )}

              {sendStep === 2 && resolvedData && (
                <>
                  <h3 className="text-2xl font-black mb-2">Review Transaction</h3>
                  <p className="text-[10px] text-salvaGold uppercase tracking-widest font-bold mb-6">Confirm before sending</p>

                  {/* Caution card */}
                  <div className="mb-6 p-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/5">
                    <p className="text-xs font-black text-yellow-400 mb-2">⚠️ Double-check recipient details</p>
                    <p className="text-xs opacity-60 leading-relaxed">
                      Blockchain transactions are irreversible. Verify the identifier and address below are correct before confirming.
                    </p>
                  </div>

                  <div className="space-y-3 mb-6">
                    <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                      <p className="text-xs opacity-60 mb-1">Sending To</p>
                      <p className="font-black text-salvaGold break-all">{resolvedData.displayIdentifier}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                      <p className="text-xs opacity-60 mb-1">Resolved Address</p>
                      <p className="font-mono text-xs break-all opacity-70">{resolvedData.address}</p>
                    </div>
                    <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                      <p className="text-xs opacity-60 mb-1">Amount</p>
                      <p className="font-black text-xl">{formatNumber(amountRaw)} <span className="text-salvaGold">NGNs</span></p>
                    </div>
                    {feePreview.feeNGN > 0 && (
                      <div className="p-4 rounded-xl bg-gray-100 dark:bg-white/5">
                        <p className="text-xs opacity-60 mb-1">Network Fee</p>
                        <p className="font-black text-red-400">-{formatNumber(feePreview.feeNGN)} NGNs</p>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <button onClick={() => setSendStep(1)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5">Back</button>
                    <button onClick={handleConfirmSend} className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110">Confirm & Proceed</button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PIN Modal ── */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div onClick={() => !loading && setIsPinModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">🔐</span>
                </div>
                <h3 className="text-2xl font-black mb-2">Transaction PIN</h3>
                <p className="text-sm opacity-60">Enter your PIN to authorise this transfer</p>
              </div>
              <input
                type="password" inputMode="numeric" maxLength="4"
                value={transactionPin}
                onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••" autoFocus
                className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6"
              />
              {pinAttempts > 0 && <p className="text-xs text-red-500 text-center mb-4 font-bold">⚠️ {3 - pinAttempts} attempts remaining</p>}
              <div className="flex gap-3">
                <button onClick={() => setIsPinModalOpen(false)} disabled={loading}
                  className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold">Cancel</button>
                <button onClick={verifyPinAndSend} disabled={loading || transactionPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold disabled:opacity-50">
                  {loading ? 'VERIFYING...' : 'VERIFY'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── No PIN Warning ── */}
      <AnimatePresence>
        {noPinWarning && (
          <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            className="fixed right-0 top-1/2 -translate-y-1/2 z-50 bg-red-500 text-white p-5 rounded-l-3xl shadow-2xl max-w-xs">
            <h4 className="font-black text-base mb-2">🔐 Transaction PIN Required</h4>
            <p className="text-xs mb-4 opacity-90">Set a transaction PIN before performing any transactions.</p>
            <div className="flex gap-2">
              <button onClick={() => navigate('/account-settings')}
                className="flex-1 bg-white text-red-500 py-2 rounded-xl font-bold text-xs">Go to Settings</button>
              <button onClick={() => setNoPinWarning(false)}
                className="px-3 bg-red-600 py-2 rounded-xl font-bold text-xs">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Alias Registration Modal ── */}
      <AnimatePresence>
        {showAliasModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div onClick={() => !aliasLoading && setShowAliasModal(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()}
              className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>

              {/* Step 1: Choose type */}
              {aliasStep === 1 && (
                <>
                  <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-salvaGold/10 rounded-full flex items-center justify-center mx-auto mb-4">
                      <span className="text-2xl">🪪</span>
                    </div>
                    <h3 className="text-2xl font-black mb-2">Register an Alias</h3>
                    <p className="text-sm opacity-60">Choose what type of alias to register. You can register both.</p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      onClick={() => handleAliasChoose('name')}
                      disabled={!!user?.nameAlias}
                      className={`p-6 rounded-2xl border-2 text-center transition-all ${user?.nameAlias ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-salvaGold/30 hover:border-salvaGold hover:bg-salvaGold/5 cursor-pointer'}`}
                    >
                      <span className="text-2xl block mb-2">✏️</span>
                      <p className="font-black text-sm">Name Alias</p>
                      <p className="text-[10px] opacity-50 mt-1">e.g. charles@salva</p>
                      {user?.nameAlias && <p className="text-[9px] text-green-400 font-bold mt-2">✓ Already registered</p>}
                    </button>
                    <button
                      onClick={() => handleAliasChoose('number')}
                      disabled={!!user?.numberAlias}
                      className={`p-6 rounded-2xl border-2 text-center transition-all ${user?.numberAlias ? 'border-white/5 opacity-30 cursor-not-allowed' : 'border-salvaGold/30 hover:border-salvaGold hover:bg-salvaGold/5 cursor-pointer'}`}
                    >
                      <span className="text-2xl block mb-2">🔢</span>
                      <p className="font-black text-sm">Number Alias</p>
                      <p className="text-[10px] opacity-50 mt-1">Auto-assigned</p>
                      {user?.numberAlias && <p className="text-[9px] text-green-400 font-bold mt-2">✓ Already registered</p>}
                    </button>
                  </div>
                </>
              )}

              {/* Step 2: Input / confirm choice */}
              {aliasStep === 2 && aliasChoice === 'number' && (
                <>
                  <div className="text-center mb-6">
                    <span className="text-4xl block mb-3">🔢</span>
                    <h3 className="text-xl font-black mb-2">Register Number Alias</h3>
                    <p className="text-sm opacity-60">A unique account number will be assigned to you automatically from the Salva registry.</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-salvaGold/5 border border-salvaGold/20 mb-6">
                    <p className="text-xs text-salvaGold font-bold text-center">Your number will be registered on-chain and linked to your wallet address permanently.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setAliasStep(1)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold">Back</button>
                    <button onClick={handleNumberAlias} disabled={aliasLoading}
                      className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold disabled:opacity-50">
                      {aliasLoading ? <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'Register Number'}
                    </button>
                  </div>
                </>
              )}

              {aliasStep === 2 && aliasChoice === 'name' && (
                <>
                  <div className="text-center mb-6">
                    <span className="text-4xl block mb-3">✏️</span>
                    <h3 className="text-xl font-black mb-2">Register Name Alias</h3>
                    <p className="text-sm opacity-60 mb-4">Enter your desired name. Letters, digits (2-9), dot, dash, underscore only. Max 16 chars. No spaces.</p>
                  </div>
                  <div className="mb-6">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="e.g. charles"
                        value={aliasNameInput}
                        onChange={(e) => setAliasNameInput(e.target.value.toLowerCase().replace(/[^a-z2-9.\-_]/g, ''))}
                        maxLength={16}
                        className="w-full p-4 pr-24 rounded-xl bg-gray-100 dark:bg-white/5 border border-transparent focus:border-salvaGold outline-none font-bold"
                      />
                      <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-xs opacity-60">@salva</span>
                    </div>
                    <p className="text-[10px] opacity-40 mt-2 font-bold">Only lowercase letters, 2–9, dot, dash, underscore</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setAliasStep(1)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold">Back</button>
                    <button onClick={handleNameCheck} disabled={aliasLoading || !aliasNameInput.trim()}
                      className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold disabled:opacity-50">
                      {aliasLoading ? <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'Check Availability'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 3: Confirm name */}
              {aliasStep === 3 && aliasCheckResult && (
                <>
                  <div className="text-center mb-6">
                    <span className="text-4xl block mb-3">✅</span>
                    <h3 className="text-xl font-black mb-2">Name Available!</h3>
                    <p className="text-sm opacity-60">Double check before confirming — aliases are permanent and cannot be changed.</p>
                  </div>
                  <div className="p-5 rounded-2xl bg-salvaGold/10 border border-salvaGold/30 text-center mb-4">
                    <p className="text-2xl font-black text-salvaGold">{aliasNameInput}@salva</p>
                  </div>
                  <div className="p-4 rounded-2xl border border-red-500/20 bg-red-500/5 mb-6">
                    <p className="text-xs text-red-400 font-bold text-center">⚠️ Check for typos — this alias is permanent and cannot be changed after registration.</p>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setAliasStep(2)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold">Go Back</button>
                    <button onClick={handleNameAlias} disabled={aliasLoading}
                      className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold disabled:opacity-50">
                      {aliasLoading ? <span className="inline-block w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" /> : 'Confirm & Register'}
                    </button>
                  </div>
                </>
              )}

              {/* Step 4: Success */}
              {aliasStep === 4 && (
                <>
                  <div className="text-center py-4">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300 }}
                      className="w-20 h-20 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                      <span className="text-4xl">🎉</span>
                    </motion.div>
                    <h3 className="text-2xl font-black mb-2">Alias Registered!</h3>
                    <p className="text-sm opacity-60 mb-6">Your alias has been linked on-chain. Others can now find and send you NGNs by this alias.</p>
                    {user?.numberAlias && <p className="font-mono text-salvaGold font-black mb-1">{user.numberAlias}</p>}
                    {user?.nameAlias && <p className="font-mono text-salvaGold font-black">{user.nameAlias}@salva</p>}
                    <button onClick={() => { setShowAliasModal(false); if (aliasStillNeeded) openAliasModal(); }}
                      className="mt-6 w-full py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110">
                      {aliasStillNeeded ? 'Register Another Alias' : 'Done'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {notification.show && (
          <motion.div
            initial={{ y: 100, x: '-50%', opacity: 0 }}
            animate={{ y: 0, x: '-50%', opacity: 1 }}
            exit={{ y: 100, x: '-50%', opacity: 0 }}
            className={`fixed bottom-6 left-1/2 px-6 py-4 rounded-2xl z-[100] font-black text-[10px] uppercase tracking-widest shadow-2xl w-[90%] sm:w-auto text-center ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-salvaGold text-black'}`}
          >
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;