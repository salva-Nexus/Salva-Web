// Salva-Digital-Tech/packages/frontend/src/pages/AccountSettings.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Edit2, Lock, Mail, Key, ArrowLeft } from 'lucide-react';
import Stars from '../components/Stars';

const AccountSettings = () => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [activeModal, setActiveModal] = useState(null); // 'email' | 'password' | 'pin' | 'username'
  const [modalStep, setModalStep] = useState(1); // 1: Warning, 2: OTP, 3: New Value
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({ oldPin: '', newValue: '', confirmValue: '' });
  const [pinStatus, setPinStatus] = useState({ hasPin: false, isLocked: false, lockedUntil: null });
  const navigate = useNavigate();

  useEffect(() => {
    const savedUser = localStorage.getItem('salva_user');
    if (savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);
        checkPinStatus(parsedUser.email);
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
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/pin-status/${email}`);
      const data = await res.json();
      setPinStatus(data);
    } catch (err) {
      console.error('Failed to check PIN status');
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
        body: JSON.stringify({ email: user.email })
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
        body: JSON.stringify({ email: user.email, code: otp })
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

    if (activeModal === 'pin' && (formData.newValue.length !== 4 || !/^\d{4}$/.test(formData.newValue))) {
      showMsg('PIN must be exactly 4 digits', 'error');
      return;
    }

    if (activeModal === 'pin' && pinStatus.hasPin && (!formData.oldPin || formData.oldPin.length !== 4)) {
      showMsg('Old PIN must be exactly 4 digits', 'error');
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
        body: JSON.stringify(body)
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
          setPinStatus(prev => ({ ...prev, isLocked: true, lockedUntil: data.lockedUntil }));
        }

        closeModal();

        if (activeModal === 'pin' && !pinStatus.hasPin) {
          checkPinStatus(user.email);
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

  const handleUnlinkName = async () => {
    if (!window.confirm('Are you sure you want to unlink your name alias? You can re-link a new name afterwards.')) return;
    setUnlinkLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ safeAddress: user.safeAddress })
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Name alias unlinked successfully!');
        const updatedUser = { ...user, nameAlias: null };
        localStorage.setItem('salva_user', JSON.stringify(updatedUser));
        setUser(updatedUser);
      } else {
        showMsg(data.message || 'Unlink failed', 'error');
      }
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setUnlinkLoading(false);
    }
  };

  if (!user) return null;

  const requiresOTP = ['email', 'password', 'pin'].includes(activeModal);
  const isFirstTimePin = activeModal === 'pin' && !pinStatus.hasPin;
  const isResetPin = activeModal === 'pin' && pinStatus.hasPin;

  return (
    <div className="min-h-screen bg-white dark:bg-[#0A0A0B] text-black dark:text-white pt-24 px-4 pb-12 relative overflow-hidden">
      <Stars />

      <div className="max-w-2xl mx-auto relative z-10">
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-salvaGold hover:opacity-60 mb-8 font-bold">
          <ArrowLeft size={16} /> Back to Dashboard
        </Link>

        <header className="mb-12">
          <h1 className="text-4xl font-black mb-2">Account Settings</h1>
          <p className="text-sm opacity-60">Manage your Salva account preferences</p>
        </header>

        {pinStatus.isLocked && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 p-4 bg-red-500/10 border border-red-500 rounded-2xl"
          >
            <p className="text-sm font-bold text-red-500">
              🔒 Account Locked: Transactions disabled until {new Date(pinStatus.lockedUntil).toLocaleString()}
            </p>
          </motion.div>
        )}

        <div className="space-y-4">
          {/* ── Username ── */}
          <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Full Name</p>
                <p className="text-lg font-black">{user.username}</p>
              </div>
              <button onClick={() => openModal('username')} className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-full transition-colors">
                <Edit2 size={18} className="text-salvaGold" />
              </button>
            </div>
          </div>

          {/* ── Email ── */}
          <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Email Address</p>
                <p className="text-lg font-black">{user.email}</p>
              </div>
              <button onClick={() => openModal('email')} className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-full transition-colors">
                <Edit2 size={18} className="text-salvaGold" />
              </button>
            </div>
          </div>

          {/* ── Password ── */}
          <button onClick={() => openModal('password')} className="w-full bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Security</p>
                <p className="text-lg font-black">Reset Password</p>
              </div>
              <Lock size={18} className="text-salvaGold" />
            </div>
          </button>

          {/* ── PIN ── */}
          <button onClick={() => openModal('pin')} className="w-full bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Transaction Security</p>
                <p className="text-lg font-black">{pinStatus.hasPin ? 'Reset' : 'Set'} Transaction PIN</p>
              </div>
              <Key size={18} className="text-salvaGold" />
            </div>
          </button>

          {/* ── Name Alias / Unlink ── */}
          {user.nameAlias && (
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs uppercase opacity-40 font-bold mb-1">Name Alias</p>
                  <p className="text-lg font-black text-salvaGold">{user.nameAlias}</p>
                  <p className="text-xs opacity-50 mt-1">Linked to your wallet address</p>
                </div>
                <button
                  onClick={handleUnlinkName}
                  disabled={unlinkLoading}
                  className="px-4 py-2 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-black text-xs uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                >
                  {unlinkLoading ? 'Unlinking...' : 'Unlink'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Modal ── */}
      <AnimatePresence>
        {activeModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
            <motion.div onClick={closeModal} className="absolute inset-0 bg-black/95 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div onClick={(e) => e.stopPropagation()} className="relative bg-white dark:bg-zinc-900 p-8 rounded-3xl w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>

              {/* Step 1: Warning */}
              {modalStep === 1 && requiresOTP && !isFirstTimePin && (
                <>
                  <h3 className="text-2xl font-black mb-4">⚠️ Security Warning</h3>
                  <p className="text-sm opacity-80 mb-6">
                    Changing your {activeModal === 'email' ? 'email' : activeModal === 'password' ? 'password' : 'PIN'} will <strong className="text-salvaGold">lock your account for 24 hours</strong>. You won't be able to perform any transactions during this period.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
                    <button onClick={sendOTP} disabled={loading} className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110">{loading ? 'SENDING...' : 'OK, PROCEED'}</button>
                  </div>
                </>
              )}

              {/* Step 2: OTP */}
              {modalStep === 2 && (
                <>
                  <h3 className="text-2xl font-black mb-4">Verify Your Identity</h3>
                  <p className="text-sm opacity-60 mb-4">We sent a code to: <strong>{user.email}</strong></p>
                  <input type="text" maxLength="6" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value)} className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-2xl tracking-[0.5em] font-black mb-6" />
                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
                    <button onClick={verifyOTP} disabled={loading || !otp} className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50">{loading ? 'VERIFYING...' : 'VERIFY'}</button>
                  </div>
                </>
              )}

              {/* Step 3: New Values */}
              {((modalStep === 3 && requiresOTP) || (modalStep === 3 && activeModal === 'username') || (isFirstTimePin && modalStep === 1)) && (
                <>
                  <h3 className="text-2xl font-black mb-4">
                    {activeModal === 'email' ? 'New Email Address' :
                     activeModal === 'password' ? 'New Password' :
                     activeModal === 'pin' ? (isFirstTimePin ? 'Set Transaction PIN' : 'Reset Transaction PIN') :
                     'New Username'}
                  </h3>

                  <div className="space-y-4 mb-6">
                    {isResetPin && (
                      <>
                        <input
                          type="password"
                          inputMode="numeric"
                          maxLength={4}
                          placeholder="Old PIN (••••)"
                          value={formData.oldPin}
                          onChange={(e) => setFormData({ ...formData, oldPin: e.target.value.replace(/\D/g, '') })}
                          className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none font-bold text-center text-xl"
                        />
                        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/30 to-transparent"></div>
                      </>
                    )}

                    <input
                      type={activeModal === 'password' ? 'password' : activeModal === 'pin' ? 'password' : 'text'}
                      inputMode={activeModal === 'pin' ? 'numeric' : 'text'}
                      maxLength={activeModal === 'pin' ? 4 : undefined}
                      placeholder={activeModal === 'pin' ? 'New PIN (••••)' : `Enter new ${activeModal}`}
                      value={formData.newValue}
                      onChange={(e) => setFormData({ ...formData, newValue: activeModal === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                      className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none font-bold"
                    />

                    <input
                      type={activeModal === 'password' ? 'password' : activeModal === 'pin' ? 'password' : 'text'}
                      inputMode={activeModal === 'pin' ? 'numeric' : 'text'}
                      maxLength={activeModal === 'pin' ? 4 : undefined}
                      placeholder={activeModal === 'pin' ? 'Confirm PIN (••••)' : `Confirm new ${activeModal}`}
                      value={formData.confirmValue}
                      onChange={(e) => setFormData({ ...formData, confirmValue: activeModal === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                      className="w-full p-4 rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none font-bold"
                    />
                  </div>

                  {isResetPin && (
                    <div className="mb-6 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                      <p className="text-xs text-orange-500 font-bold">
                        ⚠️ If you've forgotten your old PIN, contact support. Without it, we cannot decrypt your wallet.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={closeModal} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-white/10 font-bold hover:bg-gray-100 dark:hover:bg-white/5">Cancel</button>
                    <button onClick={handleSubmit} disabled={loading || !formData.newValue || !formData.confirmValue || (isResetPin && !formData.oldPin)} className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50">{loading ? 'UPDATING...' : 'CONFIRM'}</button>
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
          <motion.div initial={{ y: 100, x: "-50%", opacity: 0 }} animate={{ y: 0, x: "-50%", opacity: 1 }} exit={{ y: 100, x: "-50%", opacity: 0 }} className={`fixed bottom-6 left-1/2 px-6 py-4 rounded-2xl z-[100] font-black text-xs uppercase tracking-widest shadow-2xl ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-salvaGold text-black'}`}>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountSettings;