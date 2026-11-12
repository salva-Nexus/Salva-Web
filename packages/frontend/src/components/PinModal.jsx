import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

const Spinner = () => (
  <span className="w-3 h-3 border-2 border-salvaGold/25 border-t-salvaGold rounded-full animate-spin inline-block" />
);

/*
 * Shared PIN card. Same markup as the SendTransferModal PIN step.
 *
 * onVerified(pin)  async. Throw an Error to show its message under the input
 *                  (the PIN is cleared automatically).
 * onCancel()       called by Cancel and by the backdrop.
 * loading          optional external busy flag (e.g. fee estimation after the PIN).
 * loadingLabel     button text while busy.
 * autoSubmit       submit as soon as the 4th digit is typed.
 * embedded         render only the card content (no overlay / sheet), for use
 *                  inside a modal that already provides its own shell.
 * zClass           z-index class for the overlay, e.g. "z-[200]".
 */
const PinModal = ({
  onVerified,
  onCancel,
  loading = false,
  loadingLabel = 'Verifying…',
  autoSubmit = false,
  embedded = false,
  zClass = 'z-[200]',
}) => {
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const mountedRef = useRef(true);
  const busyRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const working = loading || busy;

  const submit = useCallback(
    async (value) => {
      if (busyRef.current || loading || !/^\d{4}$/.test(value)) return;

      busyRef.current = true;
      setBusy(true);
      setError('');

      try {
        await onVerified(value);
      } catch (err) {
        if (mountedRef.current) setError(err?.message || 'PIN verification failed');
      } finally {
        busyRef.current = false;
        if (mountedRef.current) {
          setBusy(false);
          setPin('');
        }
      }
    },
    [loading, onVerified]
  );

  const content = (
    <div>
      <div className="mb-5 sm:mb-7">
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="w-9 h-9" />

          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-salvaGold" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
            <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
          </div>

          <span className="w-9 h-9" />
        </div>

        <p className="text-[8px] sm:text-[9px] uppercase tracking-[.35em] text-salvaGold/65 font-black">
          Security
        </p>
        <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1">Verify your PIN</h2>
        <p className="text-[10px] sm:text-xs text-white/40 mt-1.5 leading-relaxed">
          Your PIN is verified before any transaction details are entered.
        </p>
      </div>

      <div className="rounded-[24px] border border-salvaGold/15 bg-salvaGold/[0.045] p-4 sm:p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-salvaGold/10 border border-salvaGold/20 flex items-center justify-center">
            <span className="text-salvaGold text-lg">⌁</span>
          </div>
          <div>
            <p className="text-xs font-black">Private signing access</p>
            <p className="text-[9px] sm:text-[10px] text-white/35 mt-0.5">
              Your signing key remains in memory for this transfer only.
            </p>
          </div>
        </div>
      </div>

      <label className="block text-[8px] uppercase tracking-[.25em] text-white/35 font-black mb-2">
        4-digit transaction PIN
      </label>

      <input
        autoFocus
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        readOnly={working}
        onChange={(event) => {
          const value = event.target.value.replace(/\D/g, '').slice(0, 4);
          setError('');
          setPin(value);
          if (autoSubmit && value.length === 4) submit(value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit(pin);
        }}
        placeholder="••••"
        className="w-full h-14 sm:h-16 rounded-2xl bg-white/[0.04] border border-white/10 focus:border-salvaGold/50 outline-none text-center text-2xl sm:text-3xl tracking-[.65em] font-black transition-colors"
      />

      {error && <p className="text-[9px] text-red-400 font-bold text-center mt-2">{error}</p>}

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={() => onCancel()}
          disabled={working}
          className="flex-1 h-12 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/55 hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => submit(pin)}
          disabled={working || pin.length !== 4}
          className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-35 flex items-center justify-center gap-2"
        >
          {working ? <Spinner /> : null}
          {working ? loadingLabel : 'Continue'}
        </button>
      </div>
    </div>
  );

  if (embedded) return content;

  return (
    <div
      className={`fixed inset-0 ${zClass} flex items-end sm:items-center justify-center px-0 sm:px-4`}
    >
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={() => !working && onCancel()}
      />

      <motion.div
        initial={{ opacity: 0, y: '8%', scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: '8%', scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[30px] sm:rounded-[30px] border border-white/10 bg-[#0b0b0d] shadow-[0_35px_120px_rgba(0,0,0,.65)]"
      >
        <div className="h-1 bg-gradient-to-r from-transparent via-salvaGold to-transparent" />
        <div className="p-4 sm:p-7">{content}</div>
      </motion.div>
    </div>
  );
};

export default PinModal;
