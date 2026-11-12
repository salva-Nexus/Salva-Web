// src/pages/SantTab.jsx
// SANT rewards panel. Rendered inside AssetDetailsModal IN ADDITION to the
// normal token details. SANT is a normal asset; this is just the extra
// claim surface. Points come in as a prop from meta.santPoints.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import PinModal from '../components/PinModal';

export function fmtSant(n) {
  const num = parseFloat(n || 0);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  if (num > 0 && num < 0.000001) return '<0.000001';

  if (num >= 1) {
    const truncated = Math.floor(num * 100) / 100;
    return truncated.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  const truncated6 = Math.floor(num * 1_000_000) / 1_000_000;
  const [intPart, decPart] = truncated6.toFixed(6).split('.');
  let trimmed = decPart;
  while (trimmed.length > 2 && trimmed.endsWith('0')) trimmed = trimmed.slice(0, -1);

  return `${Number(intPart).toLocaleString('en-US')}.${trimmed}`;
}

const SantTab = ({ user, showMsg, santPoints = 0, onClaimed }) => {
  // isLocked === false  -> claiming is open
  // isLocked === true / missing record / request failed -> claiming is closed
  const [isLocked, setIsLocked] = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);
  const [claimPinModal, setClaimPinModal] = useState(false);
  // idle | verifying | minting
  const [stage, setStage] = useState('idle');

  const busyRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // DB value x 100 for UI display only. Claims never use this number.
  const points = Number(santPoints) || 0;
  const displayPoints = fmtSant(points * 100);

  const busy = stage !== 'idle';

  const fetchClaimWindow = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/sant/points-record/${encodeURIComponent(user.email)}`
      );
      const data = await res.json();
      if (!mountedRef.current) return;
      setIsLocked(data?.data?.isLocked !== false);
    } catch {
      if (mountedRef.current) setIsLocked(true);
    } finally {
      if (mountedRef.current) setStatusLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchClaimWindow();
  }, [fetchClaimWindow]);

  const claimable = !isLocked && points > 0;

    const closeModal = useCallback(() => {
      if (busyRef.current) return;
      setClaimPinModal(false);
    }, []);

    // Verify PIN, then mint immediately. No extra input or confirmation step.
    const executeClaim = async (pin) => {
      if (busyRef.current || !/^\d{4}$/.test(pin)) return;
      busyRef.current = true;
      setStage('verifying');

      try {
        const verifyRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: user.email, pin }),
        });
        const verifyData = await verifyRes.json();

        if (!verifyData?.success) {
          showMsg('Incorrect PIN', 'error');
          return;
        }

        if (mountedRef.current) setStage('minting');

        const mintRes = await fetch(`${SALVA_API_URL}/api/user/mint-sant`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            address: user.safeAddress,
            pin,
          }),
        });
        const mintData = await mintRes.json();

        if (mintRes.ok && mintData?.status && mintData?.data) {
          showMsg(`🎉 Claimed ${displayPoints} SANT!`);
          if (mountedRef.current) setClaimPinModal(false);
          fetchClaimWindow();
          onClaimed?.();
        } else {
          showMsg(mintData?.errorMsg || mintData?.message || 'Claim failed', 'error');
        }
      } catch {
        showMsg('Network error', 'error');
      } finally {
        busyRef.current = false;
        if (mountedRef.current) setStage('idle');
      }
    };

  return (
    <div className="mb-5 sm:mb-6">
      <p className="text-[8px] sm:text-[9px] uppercase tracking-[.25em] text-salvaGold/60 font-black mb-2.5">
        Rewards
      </p>

      <div className="rounded-xl sm:rounded-2xl border border-salvaGold/15 bg-salvaGold/[0.04] p-3.5 sm:p-4">
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-[.3em] font-black text-white/60">
            SANT Points
          </p>
          <p className="font-black text-base sm:text-lg text-salvaGold">{displayPoints}</p>
        </div>

        <button
          onClick={() => {
            if (!claimable) return;
            setClaimPinModal(true);
          }}
          disabled={!claimable || statusLoading}
          className={`w-full py-2.5 sm:py-3 rounded-xl font-black text-[10px] sm:text-[11px] uppercase tracking-widest transition-all leading-tight ${
            claimable && !statusLoading
              ? 'bg-salvaGold text-black hover:brightness-110 active:scale-[0.98]'
              : 'bg-white/5 border border-white/10 text-white/25 cursor-not-allowed'
          }`}
        >
          {statusLoading
            ? 'Checking claim window…'
            : claimable
            ? `Claim ${displayPoints} SANT Points`
            : isLocked
            ? 'Claiming is locked'
            : 'Claim (earn points to unlock)'}
        </button>
      </div>

      <AnimatePresence>
        {claimPinModal && (
          <PinModal
            key="claim-pin"
            zClass="z-[95]"
            autoSubmit
            loading={busy}
            loadingLabel={stage === 'minting' ? 'Minting…' : 'Verifying…'}
            onCancel={closeModal}
            onVerified={executeClaim}
          />
        )}
      </AnimatePresence>
    </div>
  );
};

export default SantTab;
