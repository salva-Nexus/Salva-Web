// Salva-Digital-Tech/packages/frontend/src/pages/AccountSettings.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Edit2, Lock, Mail, Key, ArrowLeft, AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import Stars from '../components/Stars';

const AccountSettings = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [activeModal, setActiveModal] = useState(null);
  const [modalStep, setModalStep] = useState(1);
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({ oldPin: '', newValue: '', confirmValue: '' });
  const [pinStatus, setPinStatus] = useState({
    hasPin: false,
    isLocked: false,
    lockedUntil: null,
    loading: true,
    error: false,
  });
  const [bnbPinStatus, setBnbPinStatus] = useState({
    hasPin: false,
    isLocked: false,
    lockedUntil: null,
    loading: true,
    error: false,
  });

  // New State for Modern Confirmation Cards
  const [confirmDialog, setConfirmDialog] = useState({
    show: false,
    title: '',
    message: '',
    onConfirm: null,
  });

  const navigate = useNavigate();
  const [location] = React.useState(() => {
    try {
      return new URLSearchParams(window.location.search).get('from') || 'base';
    } catch {
      return 'base';
    }
  });
  const backPath = location === 'bnb' ? '/bnb' : '/dashboard';

  // Retries transient network/server hiccups before giving up — prevents a
  // single dropped request from permanently mislabeling PIN status.
  const fetchJsonWithRetry = async (url, { retries = 2, delayMs = 700 } = {}) => {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        return await res.json();
      } catch (err) {
        lastErr = err;
        if (attempt < retries) {
          await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        }
      }
    }
    throw lastErr;
  };

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        checkPinStatus(parsedUser.email);
        checkBnbPinStatus(parsedUser.email);
      } catch (error) {
        navigate('/login');
      }
    } else {
      navigate('/login');
    }
  }, [navigate]);

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => setNotification({ ...notification, show: false }), 4000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showMsg = (msg, type = 'success') => setNotification({ show: true, message: msg, type });

  const checkPinStatus = async (email) => {
    setPinStatus((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const data = await fetchJsonWithRetry(
        `${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(email)}`
      );
      setPinStatus({
        hasPin: !!data.hasPin,
        isLocked: !!data.isLocked,
        lockedUntil: data.lockedUntil || null,
        loading: false,
        error: false,
      });
    } catch (err) {
      console.error('❌ Failed to check Base PIN status:', err.message);
      setPinStatus((prev) => ({ ...prev, loading: false, error: true }));
    }
  };

  const checkBnbPinStatus = async (email) => {
    setBnbPinStatus((prev) => ({ ...prev, loading: true, error: false }));
    try {
      const data = await fetchJsonWithRetry(
        `${SALVA_API_URL}/api/bnb/pin-status/${encodeURIComponent(email)}`
      );
      setBnbPinStatus({
        hasPin: !!data.hasPin,
        isLocked: !!data.isLocked,
        lockedUntil: data.lockedUntil || null,
        loading: false,
        error: false,
      });
    } catch (err) {
      console.error('❌ Failed to check BNB PIN status:', err.message);
      setBnbPinStatus((prev) => ({ ...prev, loading: false, error: true }));
    }
  };

  const openModal = (type) => {
    setActiveModal(type);
    setModalStep(type === 'username' ? 3 : 1);
    setOtp('');
    setFormData({ oldPin: '', newValue: '', confirmValue: '' });
  };

  const closeModal = () => {
    setActiveModal(null);
    setModalStep(1);
    setOtp('');
    setFormData({ oldPin: '', newValue: '', confirmValue: '' });
  };

  const sendOTP = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      });
      if (res.ok) {
        setModalStep(2);
        showMsg('Verification code sent!');
      } else {
        showMsg('Failed to send code', 'error');
      }
    } catch (err) {
      showMsg('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, code: otp }),
      });
      if (res.ok) {
        setModalStep(3);
        showMsg('Code verified!');
      } else {
        showMsg('Invalid or expired code', 'error');
      }
    } catch (err) {
      showMsg('Verification failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (formData.newValue !== formData.confirmValue) {
      showMsg('Values do not match', 'error');
      return;
    }

    if (
      (activeModal === 'pin' || activeModal === 'bnbpin') &&
      (formData.newValue.length !== 4 || !/^\d{4}$/.test(formData.newValue))
    ) {
      showMsg('PIN must be exactly 4 digits', 'error');
      return;
    }

    if (
      activeModal === 'pin' &&
      pinStatus.hasPin &&
      (!formData.oldPin || formData.oldPin.length !== 4)
    ) {
      showMsg('Old Base PIN must be exactly 4 digits', 'error');
      return;
    }

    if (
      activeModal === 'bnbpin' &&
      bnbPinStatus.hasPin &&
      (!formData.oldPin || formData.oldPin.length !== 4)
    ) {
      showMsg('Old BNB PIN must be exactly 4 digits', 'error');
      return;
    }

    setLoading(true);

    let endpoint, body;
    switch (activeModal) {
      case 'email':
        endpoint = '/api/user/update-email';
        body = { oldEmail: user.email, newEmail: formData.newValue };
        break;
      case 'password':
        endpoint = '/api/user/update-password';
        body = { email: user.email, newPassword: formData.newValue };
        break;
      case 'pin':
        endpoint = pinStatus.hasPin ? '/api/user/reset-pin' : '/api/user/set-pin';
        body = pinStatus.hasPin
          ? { email: user.email, oldPin: formData.oldPin, newPin: formData.newValue }
          : { email: user.email, pin: formData.newValue };
        break;
      case 'bnbpin':
        // BNB PIN is completely independent from Base PIN
        endpoint = bnbPinStatus.hasPin ? '/api/bnb/reset-pin' : '/api/bnb/set-pin';
        body = bnbPinStatus.hasPin
          ? { email: user.email, oldPin: formData.oldPin, newPin: formData.newValue }
          : { email: user.email, pin: formData.newValue };
        break;
      case 'username':
        endpoint = '/api/user/update-username';
        body = { email: user.email, newUsername: formData.newValue };
        break;
      default:
        return;
    }

    try {
      const res = await fetch(`${SALVA_API_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (res.ok) {
        showMsg(data.message || 'Updated successfully!');

        if (activeModal === 'email') {
          const updatedUser = { ...user, email: formData.newValue };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        } else if (activeModal === 'username') {
          const updatedUser = { ...user, username: formData.newValue };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        }

        if (data.lockedUntil) {
          if (activeModal === 'pin') {
            setPinStatus((prev) => ({ ...prev, isLocked: true, lockedUntil: data.lockedUntil }));
          } else if (activeModal === 'bnbpin') {
            setBnbPinStatus((prev) => ({ ...prev, isLocked: true, lockedUntil: data.lockedUntil }));
          }
        }

        closeModal();

        if (activeModal === 'pin' && !pinStatus.hasPin) {
          checkPinStatus(user.email);
        }
        if (activeModal === 'bnbpin' && !bnbPinStatus.hasPin) {
          checkBnbPinStatus(user.email);
        }
      } else {
        showMsg(data.message || 'Update failed', 'error');
      }
    } catch (err) {
      showMsg('Network error', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const requiresOTP = ['email', 'password', 'pin', 'bnbpin'].includes(activeModal);
  const isFirstTimePin = activeModal === 'pin' && !pinStatus.hasPin;
  const isResetPin = activeModal === 'pin' && pinStatus.hasPin;
  const isFirstTimeBnbPin = activeModal === 'bnbpin' && !bnbPinStatus.hasPin;
  const isResetBnbPin = activeModal === 'bnbpin' && bnbPinStatus.hasPin;
  // PIN modals always show old PIN field if resetting — lockdown doesn't block PIN change
  const isPinModal = activeModal === 'pin' || activeModal === 'bnbpin';
  const isAnyFirstTimePin = isFirstTimePin || isFirstTimeBnbPin;
  const isAnyResetPin = isResetPin || isResetBnbPin;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-16 sm:pt-24 px-3 sm:px-4 pb-8 sm:pb-12 relative overflow-hidden">
      <Stars />

      <div className="max-w-2xl mx-auto relative z-10">
        <Link
          to={backPath}
          className="inline-flex items-center gap-1.5 sm:gap-2 text-[9px] sm:text-xs uppercase tracking-widest text-salvaGold hover:opacity-60 mb-5 sm:mb-8 font-bold"
        >
          <ArrowLeft size={12} className="sm:hidden" />
          <ArrowLeft size={16} className="hidden sm:block" />
          Back to Dashboard
        </Link>

        <header className="mb-7 sm:mb-12">
          <h1 className="text-2xl sm:text-4xl font-black mb-1 sm:mb-2">Account Settings</h1>
          <p className="text-[10px] sm:text-sm opacity-60">Manage your Salva account preferences</p>
        </header>

        {pinStatus.isLocked && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 sm:mb-6 p-2.5 sm:p-4 bg-red-500/10 border border-red-500 rounded-2xl"
          >
            <p className="text-[10px] sm:text-sm font-bold text-red-500 flex items-center gap-1.5 sm:gap-2">
              <Lock size={11} className="sm:hidden flex-shrink-0" />
              <Lock size={16} className="hidden sm:block flex-shrink-0" />
              Base Chain Locked: Transactions disabled until{' '}
              {new Date(pinStatus.lockedUntil).toLocaleString()}
            </p>
          </motion.div>
        )}

        {bnbPinStatus.isLocked && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 sm:mb-6 p-2.5 sm:p-4 bg-yellow-500/10 border border-yellow-500 rounded-2xl"
          >
            <p className="text-[10px] sm:text-sm font-bold text-yellow-500 flex items-center gap-1.5 sm:gap-2">
              <Lock size={11} className="sm:hidden flex-shrink-0" />
              <Lock size={16} className="hidden sm:block flex-shrink-0" />
              BNB Chain Locked: Transactions disabled until{' '}
              {new Date(bnbPinStatus.lockedUntil).toLocaleString()}
            </p>
          </motion.div>
        )}

        <div className="space-y-3 sm:space-y-4">
          {/* Username */}
          <div className="group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Full Name
                </p>
                <p className="text-sm sm:text-lg font-black">{user.username}</p>
              </div>
              <button
                onClick={() => openModal('username')}
                className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm"
              >
                <Edit2 size={13} className="sm:hidden" />
                <Edit2 size={18} className="hidden sm:block" />
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Email Address
                </p>
                <p className="text-sm sm:text-lg font-black">{user.email}</p>
              </div>
              <button
                onClick={() => openModal('email')}
                className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm"
              >
                <Mail size={13} className="sm:hidden" />
                <Mail size={18} className="hidden sm:block" />
              </button>
            </div>
          </div>

          {/* Password */}
          <button
            onClick={() => openModal('password')}
            className="w-full group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Security
                </p>
                <p className="text-sm sm:text-lg font-black">Reset Password</p>
              </div>
              <div className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Lock size={13} className="sm:hidden" />
                <Lock size={18} className="hidden sm:block" />
              </div>
            </div>
          </button>

          {/* PIN — Base Chain */}
          <button
            onClick={() => (pinStatus.error ? checkPinStatus(user.email) : openModal('pin'))}
            disabled={pinStatus.loading}
            className="w-full group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Base Chain Security
                </p>
                {pinStatus.loading ? (
                  <p className="text-sm sm:text-lg font-black opacity-50">Checking PIN status…</p>
                ) : pinStatus.error ? (
                  <p className="text-sm sm:text-lg font-black text-red-500">
                    Couldn't check status — tap to retry
                  </p>
                ) : (
                  <p className="text-sm sm:text-lg font-black">
                    {pinStatus.hasPin ? 'Reset' : 'Set'} Base Transaction PIN
                  </p>
                )}
              </div>
              <div className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Key size={13} className="sm:hidden" />
                <Key size={18} className="hidden sm:block" />
              </div>
            </div>
          </button>

          {/* PIN — BNB Chain */}
          <button
            onClick={() =>
              bnbPinStatus.error ? checkBnbPinStatus(user.email) : openModal('bnbpin')
            }
            disabled={bnbPinStatus.loading}
            className="w-full group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-yellow-500/30 transition-all text-left disabled:opacity-60 disabled:cursor-wait"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  BNB Chain Security
                </p>
                {bnbPinStatus.loading ? (
                  <p className="text-sm sm:text-lg font-black opacity-50">Checking PIN status…</p>
                ) : bnbPinStatus.error ? (
                  <p className="text-sm sm:text-lg font-black text-red-500">
                    Couldn't check status — tap to retry
                  </p>
                ) : (
                  <p className="text-sm sm:text-lg font-black">
                    {bnbPinStatus.hasPin ? 'Reset' : 'Set'} BNB Transaction PIN
                  </p>
                )}
              </div>
              <div className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-yellow-500 group-hover:text-black rounded-xl transition-all shadow-sm">
                <Key size={13} className="sm:hidden" />
                <Key size={18} className="hidden sm:block" />
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* ── Dynamic Modals ── */}
      <AnimatePresence>
        {(activeModal || confirmDialog.show) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-3 sm:px-4">
            <motion.div
              onClick={() => {
                closeModal();
                setConfirmDialog({ ...confirmDialog, show: false });
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />

            {/* Confirmation Dialogs (Unlink etc) */}
            {confirmDialog.show && (
              <motion.div
                onClick={(e) => e.stopPropagation()}
                className="relative bg-white dark:bg-[#121214] p-5 sm:p-8 rounded-[1.75rem] sm:rounded-[2rem] w-full max-w-sm border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden"
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
              >
                <div className="flex flex-col items-center text-center">
                  <div className="w-11 h-11 sm:w-16 sm:h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4 sm:mb-6">
                    <AlertTriangle className="text-red-500" size={22} />
                  </div>
                  <h3 className="text-base sm:text-2xl font-black mb-1.5 sm:mb-2">
                    {confirmDialog.title}
                  </h3>
                  <p className="text-[10px] sm:text-sm opacity-60 mb-5 sm:mb-8">
                    {confirmDialog.message}
                  </p>
                  <div className="flex w-full gap-2 sm:gap-3">
                    <button
                      onClick={() => setConfirmDialog({ ...confirmDialog, show: false })}
                      className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold text-xs sm:text-base hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                    >
                      Go Back
                    </button>
                    <button
                      onClick={confirmDialog.onConfirm}
                      className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-red-500 text-white font-bold text-xs sm:text-base hover:brightness-110 transition-all shadow-lg shadow-red-500/20"
                    >
                      Unlink Now
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* Account Settings Forms */}
            {activeModal && (
              <motion.div
                onClick={(e) => e.stopPropagation()}
                className="relative bg-white dark:bg-[#121214] p-5 sm:p-8 rounded-[1.75rem] sm:rounded-[2.5rem] w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                {/* Step 1: Warning */}
                {modalStep === 1 && requiresOTP && !isAnyFirstTimePin && (
                  <div className="text-center">
                    <div className="w-11 h-11 sm:w-16 sm:h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 mx-auto">
                      <AlertTriangle className="text-salvaGold" size={22} />
                    </div>
                    <h3 className="text-base sm:text-2xl font-black mb-2.5 sm:mb-4">
                      Security Protocol
                    </h3>
                    <p className="text-[10px] sm:text-sm opacity-80 mb-5 sm:mb-8 leading-relaxed">
                      Changing your <span className="text-salvaGold font-bold">{activeModal}</span>{' '}
                      will trigger a security cooldown. Your account will be{' '}
                      <strong className="text-white">locked for 24 hours</strong>.
                    </p>
                    <div className="flex gap-2 sm:gap-3">
                      <button
                        onClick={closeModal}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold text-xs sm:text-base hover:bg-gray-200 dark:hover:bg-white/10"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={sendOTP}
                        disabled={loading}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-salvaGold text-black font-bold text-xs sm:text-base hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                      >
                        {loading ? 'Processing...' : 'I Understand'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: OTP */}
                {modalStep === 2 && (
                  <div className="text-center">
                    <h3 className="text-base sm:text-2xl font-black mb-1.5 sm:mb-2">Verify</h3>
                    <p className="text-[10px] sm:text-sm opacity-60 mb-5 sm:mb-8">
                      Verification code sent to <strong>{user.email}</strong>
                    </p>
                    <input
                      type="text"
                      maxLength="6"
                      placeholder="••••••"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      className="w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-xl sm:text-3xl tracking-[0.3em] sm:tracking-[0.4em] font-black mb-5 sm:mb-8"
                    />
                    <div className="flex gap-2 sm:gap-3">
                      <button
                        onClick={closeModal}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold text-xs sm:text-base"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={verifyOTP}
                        disabled={loading || !otp}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-salvaGold text-black font-bold text-xs sm:text-base disabled:opacity-50 transition-all"
                      >
                        {loading ? 'Verifying...' : 'Verify Identity'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Input Fields */}
                {(modalStep === 3 || (isAnyFirstTimePin && modalStep === 1)) && (
                  <>
                    <h3 className="text-base sm:text-2xl font-black mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2">
                      <CheckCircle2 className="text-salvaGold" size={16} />
                      {activeModal === 'bnbpin'
                        ? 'Update BNB PIN'
                        : activeModal === 'pin'
                          ? 'Update Base PIN'
                          : `Update ${activeModal}`}
                    </h3>

                    <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8">
                      {isAnyResetPin && (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                            Current {activeModal === 'bnbpin' ? 'BNB' : 'Base'} PIN
                          </label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="••••"
                            value={formData.oldPin}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                oldPin: e.target.value.replace(/\D/g, ''),
                              })
                            }
                            className="w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black text-center text-lg sm:text-2xl tracking-widest"
                          />
                        </div>
                      )}

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                          New{' '}
                          {activeModal === 'bnbpin' ? 'BNB' : activeModal === 'pin' ? 'Base' : ''}{' '}
                          PIN
                        </label>
                        <input
                          type={
                            isPinModal
                              ? 'password'
                              : activeModal === 'password'
                                ? 'password'
                                : 'text'
                          }
                          inputMode={isPinModal ? 'numeric' : 'text'}
                          maxLength={isPinModal ? 4 : undefined}
                          placeholder={isPinModal ? '••••' : `Enter new ${activeModal}`}
                          value={formData.newValue}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              newValue: isPinModal
                                ? e.target.value.replace(/\D/g, '')
                                : e.target.value,
                            })
                          }
                          className={`w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black placeholder:opacity-30 text-xs sm:text-base ${isPinModal ? 'text-center text-lg sm:text-2xl tracking-widest' : 'font-bold'}`}
                        />
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                          Confirm{' '}
                          {activeModal === 'bnbpin' ? 'BNB' : activeModal === 'pin' ? 'Base' : ''}{' '}
                          PIN
                        </label>
                        <input
                          type={
                            isPinModal
                              ? 'password'
                              : activeModal === 'password'
                                ? 'password'
                                : 'text'
                          }
                          inputMode={isPinModal ? 'numeric' : 'text'}
                          maxLength={isPinModal ? 4 : undefined}
                          placeholder={isPinModal ? '••••' : `Confirm new ${activeModal}`}
                          value={formData.confirmValue}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              confirmValue: isPinModal
                                ? e.target.value.replace(/\D/g, '')
                                : e.target.value,
                            })
                          }
                          className={`w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black placeholder:opacity-30 text-xs sm:text-base ${isPinModal ? 'text-center text-lg sm:text-2xl tracking-widest' : 'font-bold'}`}
                        />
                      </div>
                    </div>

                    <div className="flex gap-2 sm:gap-3">
                      <button
                        onClick={closeModal}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold text-xs sm:text-base"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmit}
                        disabled={loading || !formData.newValue}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-salvaGold text-black font-bold text-xs sm:text-base hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                      >
                        {loading ? 'Updating...' : 'Save Changes'}
                      </button>
                    </div>
                  </>
                )}
              </motion.div>
            )}
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
            className={`fixed bottom-4 sm:bottom-6 left-1/2 px-5 py-3.5 sm:px-8 sm:py-5 rounded-2xl sm:rounded-3xl z-[100] font-black text-[7px] sm:text-[10px] uppercase tracking-[0.2em] shadow-2xl flex items-center gap-2 sm:gap-3 ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-salvaGold text-black'}`}
          >
            {notification.type === 'error' ? (
              <AlertTriangle size={11} />
            ) : (
              <CheckCircle2 size={11} />
            )}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountSettings;
