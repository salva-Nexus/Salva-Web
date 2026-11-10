// Salva-Digital-Tech/packages/frontend/src/pages/AccountSettings.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import {
  Edit2,
  Lock,
  Mail,
  Key,
  ArrowLeft,
  AlertTriangle,
  X,
  CheckCircle2,
  Eye,
  EyeOff,
} from 'lucide-react';
import Stars from '../components/Stars';
import { readWalletCache, writeWalletCache } from '../utils/walletCache';

const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';

const urlBase64ToUint8Array = (b64) => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};


const AccountSettings = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: '',
  });
  const [activeModal, setActiveModal] = useState(null);
  const [modalStep, setModalStep] = useState(1);
  const [formData, setFormData] = useState({
    oldPin: '',
    newValue: '',
    confirmValue: '',
  });
  const [visibility, setVisibility] = useState({
    old: false,
    new: false,
    confirm: false,
  });

  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [denomBusy, setDenomBusy] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpBusy, setOtpBusy] = useState(false);

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

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        const cached = readWalletCache(
          parsedUser.email,
          (localStorage.getItem('salva_chain') || 'base').toLowerCase()
        );
        setPushOn(Boolean(cached?.pushSubscription));
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

  const isUsd = String(user?.denomination || 'NGN').toUpperCase() === 'USD';

  const toggleDenomination = async () => {
    if (denomBusy || !user) return;
    const next = isUsd ? 'NGN' : 'USD';
    setDenomBusy(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/data/update-denomination`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, denomination: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.status) {
        throw new Error(data.errorMsg || 'Could not update display currency');
      }
      const updatedUser = { ...user, denomination: next };
      localStorage.setItem('salva_user', JSON.stringify(updatedUser));
      setUser(updatedUser);
      showMsg(`Balance now shown in ${next}`);
    } catch (err) {
      showMsg(err?.message || 'Could not update display currency', 'error');
    } finally {
      setDenomBusy(false);
    }
  };



  const togglePush = async () => {
    if (pushBusy || !user) return;
    setPushBusy(true);

    const chain = (localStorage.getItem('salva_chain') || 'base').toLowerCase();
    const post = async (path, body) => {
      const res = await fetch(`${SALVA_API_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.status === false) throw new Error(data.errorMsg || 'Request failed');
      return data;
    };
    const syncCache = (sub) => {
      const c = readWalletCache(user.email, chain);
      if (c) writeWalletCache(user.email, chain, { ...c, pushSubscription: sub }, {});
    };

    try {
      if (!pushOn) {
        if (!VAPID_PUBLIC_KEY || !('serviceWorker' in navigator) || !('PushManager' in window)) {
          throw new Error('Push notifications are not supported on this device');
        }
        const permission = await window.Notification.requestPermission();
        if (permission !== 'granted') {
          throw new Error('Notifications are blocked in your browser settings');
        }

        await navigator.serviceWorker.register('/sw.js');
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ||
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          }));

        const subscription = sub.toJSON();
        await post('/api/save-subscription', { email: user.email, subscription });
        syncCache(subscription);
        setPushOn(true);
        showMsg('Push notifications enabled');
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        if (sub) await sub.unsubscribe();

        await post('/api/remove-subscription', { email: user.email });
        syncCache(null);
        setPushOn(false);
        showMsg('Push notifications disabled');
      }
    } catch (err) {
      showMsg(err?.message || 'Could not update notifications', 'error');
    } finally {
      setPushBusy(false);
    }
  };

    const sendChangeOtp = async () => {
      if (otpBusy) return;
      setOtpBusy(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/auth/send-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to send verification code');
        }
        setOtpCode('');
        setModalStep(2);
        showMsg('Verification code sent to your email');
      } catch (err) {
        showMsg(err?.message || 'Failed to send verification code', 'error');
      } finally {
        setOtpBusy(false);
      }
    };

    const verifyChangeOtp = async () => {
      if (otpBusy || !/^\d{6}$/.test(otpCode)) return;
      setOtpBusy(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, code: otpCode }),
        });
        if (!res.ok) {
          setOtpCode('');
          return showMsg('Invalid or expired verification code', 'error');
        }
        setModalStep(3);
      } catch {
        showMsg('Network error', 'error');
      } finally {
        setOtpBusy(false);
      }
    };

  const openModal = (type) => {
    setOtpCode('');
    setActiveModal(type);
    setModalStep(type === 'username' ? 3 : 2);
    if (type !== 'username') sendChangeOtp();
    setFormData({ oldPin: '', newValue: '', confirmValue: '' });
    setVisibility({ old: false, new: false, confirm: false });
  };

  const closeModal = () => {
    setOtpCode('');
    setActiveModal(null);
    setModalStep(1);
    setFormData({ oldPin: '', newValue: '', confirmValue: '' });
    setVisibility({ old: false, new: false, confirm: false });
  };

  const handleSubmit = async () => {
    if (formData.newValue !== formData.confirmValue) {
      showMsg('Values do not match', 'error');
      return;
    }

    if (
      activeModal === 'pin' &&
      (formData.newValue.length !== 4 || !/^\d{4}$/.test(formData.newValue))
    ) {
      showMsg('PIN must be exactly 4 digits', 'error');
      return;
    }

    if (activeModal === 'pin' && (!formData.oldPin || formData.oldPin.length !== 4)) {
      showMsg('Old PIN must be exactly 4 digits', 'error');
      return;
    }

    setLoading(true);

    let endpoint, body;
    switch (activeModal) {
      case 'email':
        endpoint = '/api/data/update-email';
        body = {
          email: user.email,
          newEmail: formData.newValue,
        };
        break;
      case 'password':
        endpoint = '/api/data/update-password';
        body = {
          email: user.email,
          newPassword: formData.newValue,
        };
        break;
      case 'pin':
        // Unified PIN — same endpoint, same lock, for both Base and BNB.
        endpoint = '/api/data/update-pin';
        body = {
          email: user.email,
          oldPin: formData.oldPin,
          newPin: formData.newValue,
        };
        break;
      case 'username':
        endpoint = '/api/data/update-username';
        body = { email: user.email, newusername: formData.newValue };
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

      if (res.ok && data.status) {
        showMsg('Updated successfully!');

        if (activeModal === 'email') {
          const updatedUser = { ...user, email: formData.newValue };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        } else if (activeModal === 'username') {
          const updatedUser = { ...user, username: formData.newValue };
          localStorage.setItem('salva_user', JSON.stringify(updatedUser));
          setUser(updatedUser);
        }

        closeModal();
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

  const requiresWarning = ['email', 'password', 'pin'].includes(activeModal);
  // PIN is unified across Base and BNB — always requires the old PIN.
  const isPinModal = activeModal === 'pin';

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

          {/* Transaction PIN — unified across Base and BNB */}
          <button
            onClick={() => openModal('pin')}
            className="w-full group bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left"
          >
            <div className="flex justify-between items-center">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Transaction Security
                </p>
                <p className="text-sm sm:text-lg font-black">Reset Transaction PIN</p>
              </div>
              <div className="p-2 sm:p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Key size={13} className="sm:hidden" />
                <Key size={18} className="hidden sm:block" />
              </div>
            </div>
          </button>

          {/* Display currency */}
          <div className="bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5">
            <div className="flex justify-between items-center gap-3">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Display
                </p>
                <p className="text-sm sm:text-lg font-black">
                  Show Balance in {isUsd ? 'NGN' : 'USD'}
                </p>
                <p className="text-[9px] sm:text-xs opacity-50 mt-0.5">
                  Currently showing {isUsd ? 'USD' : 'NGN'}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={isUsd}
                onClick={toggleDenomination}
                disabled={denomBusy}
                className={`relative w-11 h-6 sm:w-14 sm:h-8 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  isUsd ? 'bg-salvaGold' : 'bg-gray-300 dark:bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-white shadow transition-transform ${
                    isUsd ? 'translate-x-5 sm:translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Push notifications */}
          <div className="bg-gray-50 dark:bg-white/5 p-4 sm:p-6 rounded-2xl border border-gray-200 dark:border-white/5">
            <div className="flex justify-between items-center gap-3">
              <div>
                <p className="text-[8px] sm:text-xs uppercase opacity-40 font-bold mb-0.5 sm:mb-1">
                  Notifications
                </p>
                <p className="text-sm sm:text-lg font-black">Push Notifications</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={pushOn}
                onClick={togglePush}
                disabled={pushBusy}
                className={`relative w-11 h-6 sm:w-14 sm:h-8 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                  pushOn ? 'bg-salvaGold' : 'bg-gray-300 dark:bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 sm:w-7 sm:h-7 rounded-full bg-white shadow transition-transform ${
                    pushOn ? 'translate-x-5 sm:translate-x-6' : ''
                  }`}
                />
              </button>
            </div>
          </div>
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
                {/* Step 2: OTP verification */}
                {modalStep === 2 && requiresWarning && (
                  <div className="text-center">
                    <div className="w-11 h-11 sm:w-16 sm:h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mb-4 sm:mb-6 mx-auto">
                      <Mail className="text-salvaGold" size={22} />
                    </div>
                    <h3 className="text-base sm:text-2xl font-black mb-2">Verify it's you</h3>
                    <p className="text-[10px] sm:text-sm opacity-70 mb-5 sm:mb-6">
                      Enter the 6-digit code sent to {user.email}.
                    </p>
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="000000"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                      onKeyDown={(e) => e.key === 'Enter' && verifyChangeOtp()}
                      className="w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black text-center text-lg sm:text-2xl tracking-widest mb-3"
                      autoComplete="one-time-code"
                    />
                    <button
                      type="button"
                      onClick={sendChangeOtp}
                      disabled={otpBusy}
                      className="text-[10px] sm:text-xs text-salvaGold font-bold mb-5 disabled:opacity-40"
                    >
                      Resend code
                    </button>
                    <div className="flex gap-2 sm:gap-3">
                      <button
                        onClick={closeModal}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold text-xs sm:text-base"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={verifyChangeOtp}
                        disabled={otpBusy || otpCode.length !== 6}
                        className="flex-1 py-2.5 sm:py-4 rounded-2xl bg-salvaGold text-black font-bold text-xs sm:text-base disabled:opacity-40"
                      >
                        {otpBusy ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Input Fields */}
                {modalStep === 3 && (
                  <>
                    <h3 className="text-base sm:text-2xl font-black mb-4 sm:mb-6 flex items-center gap-1.5 sm:gap-2">
                      <CheckCircle2 className="text-salvaGold" size={16} />
                      {activeModal === 'pin' ? 'Update Transaction PIN' : `Update ${activeModal}`}
                    </h3>

                    <div className="space-y-3 sm:space-y-4 mb-5 sm:mb-8">
                      {isPinModal && (
                        <div className="space-y-1.5 sm:space-y-2">
                          <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                            Current PIN
                          </label>
                          <div className="relative">
                            <input
                              type={visibility.old ? 'text' : 'password'}
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
                            <button
                              type="button"
                              onClick={() =>
                                setVisibility({
                                  ...visibility,
                                  old: !visibility.old,
                                })
                              }
                              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity"
                              tabIndex={-1}
                            >
                              {visibility.old ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                          New {isPinModal ? 'PIN' : activeModal}
                        </label>
                        <div className="relative">
                          <input
                            type={
                              visibility.new
                                ? 'text'
                                : isPinModal || activeModal === 'password'
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
                            className={`w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black placeholder:opacity-30 text-xs sm:text-base ${
                              isPinModal
                                ? 'text-center text-lg sm:text-2xl tracking-widest'
                                : 'font-bold'
                            }`}
                          />
                          {(isPinModal || activeModal === 'password') && (
                            <button
                              type="button"
                              onClick={() =>
                                setVisibility({
                                  ...visibility,
                                  new: !visibility.new,
                                })
                              }
                              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity"
                              tabIndex={-1}
                            >
                              {visibility.new ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1.5 sm:space-y-2">
                        <label className="text-[7px] sm:text-[10px] uppercase tracking-widest font-black opacity-40 ml-1.5 sm:ml-2">
                          Confirm {isPinModal ? 'PIN' : activeModal}
                        </label>
                        <div className="relative">
                          <input
                            type={
                              visibility.confirm
                                ? 'text'
                                : isPinModal || activeModal === 'password'
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
                            className={`w-full p-3 sm:p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black placeholder:opacity-30 text-xs sm:text-base ${
                              isPinModal
                                ? 'text-center text-lg sm:text-2xl tracking-widest'
                                : 'font-bold'
                            }`}
                          />
                          {(isPinModal || activeModal === 'password') && (
                            <button
                              type="button"
                              onClick={() =>
                                setVisibility({
                                  ...visibility,
                                  confirm: !visibility.confirm,
                                })
                              }
                              className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 opacity-40 hover:opacity-100 transition-opacity"
                              tabIndex={-1}
                            >
                              {visibility.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          )}
                        </div>
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
            className={`fixed bottom-4 sm:bottom-6 left-1/2 px-5 py-3.5 sm:px-8 sm:py-5 rounded-2xl sm:rounded-3xl z-[100] font-black text-[7px] sm:text-[10px] uppercase tracking-[0.2em] shadow-2xl flex items-center gap-2 sm:gap-3 ${
              notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-salvaGold text-black'
            }`}
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
