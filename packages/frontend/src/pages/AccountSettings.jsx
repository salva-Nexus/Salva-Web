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
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: '' });
  const [activeModal, setActiveModal] = useState(null); 
  const [modalStep, setModalStep] = useState(1); 
  const [otp, setOtp] = useState('');
  const [formData, setFormData] = useState({ oldPin: '', newValue: '', confirmValue: '' });
  const [pinStatus, setPinStatus] = useState({ hasPin: false, isLocked: false, lockedUntil: null });
  
  // New State for Modern Confirmation Cards
  const [confirmDialog, setConfirmDialog] = useState({ show: false, title: '', message: '', onConfirm: null });

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

  const confirmUnlink = () => {
    setConfirmDialog({
      show: true,
      title: 'Unlink Name Alias?',
      message: 'This will remove your human-readable identity. You can link a new name at any time, but someone else might claim this one.',
      onConfirm: executeUnlink
    });
  };

  const executeUnlink = async () => {
    setUnlinkLoading(true);
    setConfirmDialog({ ...confirmDialog, show: false });
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
            <p className="text-sm font-bold text-red-500 flex items-center gap-2">
              <Lock size={16} /> Account Locked: Transactions disabled until {new Date(pinStatus.lockedUntil).toLocaleString()}
            </p>
          </motion.div>
        )}

        <div className="space-y-4">
          {/* Username */}
          <div className="group bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Full Name</p>
                <p className="text-lg font-black">{user.username}</p>
              </div>
              <button onClick={() => openModal('username')} className="p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Edit2 size={18} />
              </button>
            </div>
          </div>

          {/* Email */}
          <div className="group bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Email Address</p>
                <p className="text-lg font-black">{user.email}</p>
              </div>
              <button onClick={() => openModal('email')} className="p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Mail size={18} />
              </button>
            </div>
          </div>

          {/* Password */}
          <button onClick={() => openModal('password')} className="w-full group bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Security</p>
                <p className="text-lg font-black">Reset Password</p>
              </div>
              <div className="p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Lock size={18} />
              </div>
            </div>
          </button>

          {/* PIN */}
          <button onClick={() => openModal('pin')} className="w-full group bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5 hover:border-salvaGold/30 transition-all text-left">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs uppercase opacity-40 font-bold mb-1">Transaction Security</p>
                <p className="text-lg font-black">{pinStatus.hasPin ? 'Reset' : 'Set'} Transaction PIN</p>
              </div>
              <div className="p-3 bg-white dark:bg-white/5 group-hover:bg-salvaGold group-hover:text-black rounded-xl transition-all shadow-sm">
                <Key size={18} />
              </div>
            </div>
          </button>

          {/* Name Alias */}
          {user.nameAlias && (
            <div className="bg-gray-50 dark:bg-white/5 p-6 rounded-2xl border border-gray-200 dark:border-white/5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-xs uppercase opacity-40 font-bold mb-1">Name Alias</p>
                  <p className="text-lg font-black text-salvaGold">{user.nameAlias}</p>
                  <p className="text-xs opacity-50 mt-1">Linked to your wallet address</p>
                </div>
                <button
                  onClick={confirmUnlink}
                  disabled={unlinkLoading}
                  className="px-6 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 font-black text-xs uppercase hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
                >
                  {unlinkLoading ? '...' : 'Unlink'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Dynamic Modals ── */}
      <AnimatePresence>
        {(activeModal || confirmDialog.show) && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div 
               onClick={() => { closeModal(); setConfirmDialog({ ...confirmDialog, show: false }); }} 
               className="absolute inset-0 bg-black/90 backdrop-blur-xl" 
               initial={{ opacity: 0 }} 
               animate={{ opacity: 1 }} 
               exit={{ opacity: 0 }} 
            />
            
            {/* Confirmation Dialogs (Unlink etc) */}
            {confirmDialog.show && (
               <motion.div 
                 onClick={(e) => e.stopPropagation()} 
                 className="relative bg-white dark:bg-[#121214] p-8 rounded-[2rem] w-full max-w-sm border border-gray-200 dark:border-white/10 shadow-2xl overflow-hidden" 
                 initial={{ opacity: 0, scale: 0.9, y: 20 }} 
                 animate={{ opacity: 1, scale: 1, y: 0 }} 
                 exit={{ opacity: 0, scale: 0.9, y: 20 }}
               >
                 <div className="flex flex-col items-center text-center">
                   <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-6">
                     <AlertTriangle className="text-red-500" size={32} />
                   </div>
                   <h3 className="text-2xl font-black mb-2">{confirmDialog.title}</h3>
                   <p className="text-sm opacity-60 mb-8">{confirmDialog.message}</p>
                   <div className="flex w-full gap-3">
                     <button 
                       onClick={() => setConfirmDialog({ ...confirmDialog, show: false })} 
                       className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold hover:bg-gray-200 dark:hover:bg-white/10 transition-all"
                     >
                       Go Back
                     </button>
                     <button 
                       onClick={confirmDialog.onConfirm} 
                       className="flex-1 py-4 rounded-2xl bg-red-500 text-white font-bold hover:brightness-110 transition-all shadow-lg shadow-red-500/20"
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
                className="relative bg-white dark:bg-[#121214] p-8 rounded-[2.5rem] w-full max-w-md border border-gray-200 dark:border-white/10 shadow-2xl" 
                initial={{ opacity: 0, scale: 0.95 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0, scale: 0.95 }}
              >
                
                {/* Step 1: Warning */}
                {modalStep === 1 && requiresOTP && !isFirstTimePin && (
                  <div className="text-center">
                    <div className="w-16 h-16 bg-salvaGold/10 rounded-full flex items-center justify-center mb-6 mx-auto">
                      <AlertTriangle className="text-salvaGold" size={32} />
                    </div>
                    <h3 className="text-2xl font-black mb-4">Security Protocol</h3>
                    <p className="text-sm opacity-80 mb-8 leading-relaxed">
                      Changing your <span className="text-salvaGold font-bold">{activeModal}</span> will trigger a security cooldown. Your account will be <strong className="text-white">locked for 24 hours</strong>.
                    </p>
                    <div className="flex gap-3">
                      <button onClick={closeModal} className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold hover:bg-gray-200 dark:hover:bg-white/10">Cancel</button>
                      <button onClick={sendOTP} disabled={loading} className="flex-1 py-4 rounded-2xl bg-salvaGold text-black font-bold hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all">
                        {loading ? 'Processing...' : 'I Understand'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 2: OTP */}
                {modalStep === 2 && (
                  <div className="text-center">
                    <h3 className="text-2xl font-black mb-2">Verify</h3>
                    <p className="text-sm opacity-60 mb-8">Verification code sent to <strong>{user.email}</strong></p>
                    <input 
                      type="text" 
                      maxLength="6" 
                      placeholder="••••••" 
                      value={otp} 
                      onChange={(e) => setOtp(e.target.value)} 
                      className="w-full p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-transparent focus:border-salvaGold outline-none text-center text-3xl tracking-[0.4em] font-black mb-8" 
                    />
                    <div className="flex gap-3">
                      <button onClick={closeModal} className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold">Cancel</button>
                      <button onClick={verifyOTP} disabled={loading || !otp} className="flex-1 py-4 rounded-2xl bg-salvaGold text-black font-bold disabled:opacity-50 transition-all">
                        {loading ? 'Verifying...' : 'Verify Identity'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Step 3: Input Fields */}
                {((modalStep === 3) || (isFirstTimePin && modalStep === 1)) && (
                  <>
                    <h3 className="text-2xl font-black mb-6 flex items-center gap-2">
                      <CheckCircle2 className="text-salvaGold" />
                      Update {activeModal}
                    </h3>

                    <div className="space-y-4 mb-8">
                      {isResetPin && (
                        <div className="space-y-2">
                          <label className="text-[10px] uppercase tracking-widest font-black opacity-40 ml-2">Current PIN</label>
                          <input
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="••••"
                            value={formData.oldPin}
                            onChange={(e) => setFormData({ ...formData, oldPin: e.target.value.replace(/\D/g, '') })}
                            className="w-full p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-black text-center text-2xl tracking-widest"
                          />
                        </div>
                      )}

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-black opacity-40 ml-2">New {activeModal}</label>
                        <input
                          type={['password', 'pin'].includes(activeModal) ? 'password' : 'text'}
                          inputMode={activeModal === 'pin' ? 'numeric' : 'text'}
                          maxLength={activeModal === 'pin' ? 4 : undefined}
                          placeholder={activeModal === 'pin' ? '••••' : `Enter new ${activeModal}`}
                          value={formData.newValue}
                          onChange={(e) => setFormData({ ...formData, newValue: activeModal === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                          className="w-full p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-bold placeholder:opacity-30"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-[10px] uppercase tracking-widest font-black opacity-40 ml-2">Confirm {activeModal}</label>
                        <input
                          type={['password', 'pin'].includes(activeModal) ? 'password' : 'text'}
                          inputMode={activeModal === 'pin' ? 'numeric' : 'text'}
                          maxLength={activeModal === 'pin' ? 4 : undefined}
                          placeholder={activeModal === 'pin' ? '••••' : `Confirm new ${activeModal}`}
                          value={formData.confirmValue}
                          onChange={(e) => setFormData({ ...formData, confirmValue: activeModal === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value })}
                          className="w-full p-5 rounded-2xl bg-gray-100 dark:bg-white/5 border border-gray-200 dark:border-white/5 focus:border-salvaGold outline-none font-bold placeholder:opacity-30"
                        />
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <button onClick={closeModal} className="flex-1 py-4 rounded-2xl bg-gray-100 dark:bg-white/5 font-bold">Cancel</button>
                      <button onClick={handleSubmit} disabled={loading || !formData.newValue} className="flex-1 py-4 rounded-2xl bg-salvaGold text-black font-bold hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all">
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
            initial={{ y: 100, x: "-50%", opacity: 0 }} 
            animate={{ y: 0, x: "-50%", opacity: 1 }} 
            exit={{ y: 100, x: "-50%", opacity: 0 }} 
            className={`fixed bottom-6 left-1/2 px-8 py-5 rounded-3xl z-[100] font-black text-[10px] uppercase tracking-[0.2em] shadow-2xl flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-600 text-white' : 'bg-salvaGold text-black'}`}
          >
            {notification.type === 'error' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AccountSettings;