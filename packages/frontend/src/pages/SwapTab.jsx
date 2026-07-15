import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import NetworkReminder from '../components/NetworkReminder';

const POLL_MS = 60_000;

const fmt = (n, tokenType = 'ngn') => {
  const num = parseFloat(n || 0);
  if (!Number.isFinite(num) || num === 0) return '0.00';
  // Sub-threshold: greater than zero but less than 0.01
  if (num > 0 && num < 0.01) return '<0.01';
  // Normal display — always 2 decimals regardless of token type
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = Number(intPart).toLocaleString('en-US');
  return `${formattedInt}.${decPart}`;
};

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, '');
  const p = d.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return p.length > 1 ? p[0] + '.' + p[1] : p[0];
};

// ─── PIN Modal ────────────────────────────────────────────────────────────────
const PinModal = ({ title, subtitle, onConfirm, onCancel, loading }) => {
  const [pin, setPin] = useState('');
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={() => !loading && onCancel()}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
        initial={{ opacity: 0, scale: 0.92, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
        <div className="p-5 sm:p-8 text-center">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔐</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black mb-1 text-white">{title}</h3>
          <p className="text-[9px] sm:text-xs text-white/60 mb-4 sm:mb-6 leading-relaxed">{subtitle}</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
            className="w-full p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-xl sm:text-3xl tracking-[0.7em] sm:tracking-[1em] font-black mb-4 sm:mb-6 text-white transition-all"
          />
          <div className="flex gap-2 sm:gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(pin)}
              disabled={loading || pin.length !== 4}
              className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-salvaGold/20 transition-all"
            >
              {loading && (
                <span className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              {loading ? 'Verifying…' : 'Confirm'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ─── Trust Modal ──────────────────────────────────────────────────────────────
const TrustModal = ({ pool, tokenLabel, onTrust, onSkip, onCancel }) => (
  <div className="fixed inset-0 z-[85] flex items-center justify-center px-4">
    <motion.div
      className="absolute inset-0 bg-black/95 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onCancel}
    />
    <motion.div
      className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
      initial={{ opacity: 0, scale: 0.92, y: 16 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
      <div className="p-5 sm:p-8">
        <div className="text-center mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔓</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black text-white mb-1">Trust This Pool?</h3>
          <p className="text-[9px] sm:text-xs text-white/60">
            <span className="text-salvaGold font-black">
              {pool.poolName || `${pool.poolAddress.slice(0, 12)}…`}
            </span>
          </p>
        </div>
        <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
          <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-[9px] sm:text-xs font-black text-white/60 mb-1">✅ This swap only — Recommended</p>
            <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
              Approve exact amount for this swap. You'll be asked again next time.
            </p>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <p className="text-[9px] sm:text-xs font-black text-yellow-400 mb-1">
              ⚠️ Trust Pool — Use with caution
            </p>
            <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
              Approve unlimited {tokenLabel} spending. Future swaps skip the approval step, but
              grants full spending access.
            </p>
          </div>
        </div>
        <div className="flex gap-1.5 sm:gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSkip}
            className="py-2.5 px-3 sm:py-3.5 sm:px-4 rounded-xl border border-white/10 text-white/60 font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
          >
            Skip
          </button>
          <button
            onClick={onTrust}
            className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
          >
            Trust
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

// ─── Token Pill Selector ──────────────────────────────────────────────────────
const TokenPills = ({ options, value, onChange, accentColor }) => (
  <div className="flex gap-1.5 sm:gap-2">
    {options.map((t) => (
      <button
        key={t}
        onClick={() => onChange(t)}
        className="flex-1 py-1.5 sm:py-2.5 rounded-xl text-[9px] sm:text-xs font-black uppercase tracking-widest border transition-all"
        style={
          value === t
            ? {
                background: accentColor,
                color: '#000',
                borderColor: accentColor,
                boxShadow: `0 4px 16px ${accentColor}33`,
              }
            : {
                borderColor: 'rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: 'rgba(255,255,255,0.3)',
              }
        }
      >
        {t}
      </button>
    ))}
  </div>
);

// ─── Swap Modal ───────────────────────────────────────────────────────────────
const SwapModal = ({ pool, section, user, onClose, showMsg, onSwapComplete }) => {
  const [swapType, setSwapType] = useState('exact_in');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amountRaw, setAmountRaw] = useState(0);

  const [onChainMinNgn, setOnChainMinNgn] = useState(parseFloat(pool.minNgnAmount || 0));
  const [onChainMinUsd, setOnChainMinUsd] = useState(parseFloat(pool.minTokenAmount || 0));

  useEffect(() => {
    let cancelled = false;
    fetch(`${SALVA_API_URL}/api/pool/mins?poolAddress=${pool.poolAddress}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) {
          if (d.minNgnAmount != null) setOnChainMinNgn(parseFloat(d.minNgnAmount) || 0);
          if (d.minTokenAmount != null) setOnChainMinUsd(parseFloat(d.minTokenAmount) || 0);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [pool.poolAddress]);

  const minAmount = section === 'buy' ? onChainMinNgn : onChainMinUsd;
  const isBelowMin =
    swapType === 'exact_in' && amountRaw > 0 && minAmount > 0 && amountRaw < minAmount;

  const hasUSDT = parseFloat(pool.usdtLiquidity || 0) > 0;
  const hasUSDC = parseFloat(pool.usdcLiquidity || 0) > 0;
  const hasNGNs = parseFloat(pool.ngnsLiquidity || 0) > 0;
  const hasCNGN = parseFloat(pool.cNgnLiquidity || 0) > 0;
  const [stableToken, setStableToken] = useState(hasUSDT ? 'USDT' : 'USDC');
  const [ngnToken, setNgnToken] = useState(hasNGNs ? 'NGNS' : 'CNGN');

  const tokenIn = section === 'buy' ? ngnToken : stableToken;
  const ngnLabel = ngnToken === 'CNGN' ? 'cNGN' : 'NGNs';
  const tokenOut = section === 'buy' ? stableToken : ngnLabel;
  const displayRate =
    section === 'buy' ? parseFloat(pool.buyRate || 0) : parseFloat(pool.sellRate || 0);
  const accentColor = section === 'buy' ? '#D4AF37' : '#22c55e';

  const [swapFee, setSwapFee] = useState({ feeNGN: null, feeUSD: null, loading: true });
  useEffect(() => {
    fetch(`${SALVA_API_URL}/api/estimate-pool-fee?chain=base`)
      .then((r) => r.json())
      .then((d) => setSwapFee({ feeNGN: d.feeNGN, feeUSD: d.feeUSD, loading: false }))
      .catch(() => setSwapFee({ feeNGN: null, feeUSD: null, loading: false }));
  }, []);

  const [trustChecked, setTrustChecked] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [trustLoading, setTrustLoading] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [step, setStep] = useState('input');
  const [txHash, setTxHash] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteTimer = useRef(null);
  const [receivedAmount, setReceivedAmount] = useState(null);
  const [receivedToken, setReceivedToken] = useState(null);
  const defaultReceiver = user?.safeAddress || '';
  const [receiverRaw, setReceiverRaw] = useState(defaultReceiver);
  const [receiverInputType, setReceiverInputType] = useState('address');
  const [receiverError, setReceiverError] = useState('');
  const [receiverResolved, setReceiverResolved] = useState(defaultReceiver);
  const [receiverResolving, setReceiverResolving] = useState(false);
  const receiverResolveTimer = useRef(null);
  const [showReceiverConfirm, setShowReceiverConfirm] = useState(false);
  const [receiverConfirmed, setReceiverConfirmed] = useState(false);

  // ── User wallet balances ──────────────────────────────────────────────────
  const [userBal, setUserBal] = useState({});
  // Raw (unparsed) balance strings — used by the Max button so it never truncates or rounds
  const [userBalRaw, setUserBalRaw] = useState({});
  const [userBalLoading, setUserBalLoading] = useState(true);
  useEffect(() => {
    if (!user?.safeAddress) return;
    setUserBalLoading(true);
    fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`)
      .then((r) => r.json())
      .then((d) => {
        setUserBal({
          NGNS: parseFloat(d.ngnsBalance || 0),
          CNGN: parseFloat(d.cNgnBalance || 0),
          USDT: parseFloat(d.usdtBalance || 0),
          USDC: parseFloat(d.usdcBalance || 0),
        });
        setUserBalRaw({
          NGNS: String(d.ngnsBalance ?? '0'),
          CNGN: String(d.cNgnBalance ?? '0'),
          USDT: String(d.usdtBalance ?? '0'),
          USDC: String(d.usdcBalance ?? '0'),
        });
      })
      .catch(() => {})
      .finally(() => setUserBalLoading(false));
  }, [user?.safeAddress]);

  const userSendBal = userBal[tokenIn] ?? null;
  const poolReceiveBal =
    tokenOut === 'USDT'
      ? parseFloat(pool.usdtLiquidity || 0)
      : tokenOut === 'USDC'
        ? parseFloat(pool.usdcLiquidity || 0)
        : tokenOut === 'cNGN'
          ? parseFloat(pool.cNgnLiquidity || 0)
          : parseFloat(pool.ngnsLiquidity || 0);
  // Raw string version — Max button source for exact_out mode, no precision loss
  const poolReceiveBalRaw =
    tokenOut === 'USDT'
      ? String(pool.usdtLiquidity ?? '0')
      : tokenOut === 'USDC'
        ? String(pool.usdcLiquidity ?? '0')
        : tokenOut === 'cNGN'
          ? String(pool.cNgnLiquidity ?? '0')
          : String(pool.ngnsLiquidity ?? '0');

  // Max button: exact_in → user's balance of the token they're SENDING (tokenIn)
  //             exact_out → pool's balance of the token they're RECEIVING (tokenOut)
  // Always uses the raw string as-is — never parseFloat/toFixed round-tripped.
  const handleMaxClick = () => {
    const raw = swapType === 'exact_in' ? (userBalRaw[tokenIn] ?? '0') : poolReceiveBalRaw;
    setAmountDisplay(fmtInput(raw));
    setAmountRaw(parseFloat(raw) || 0);
  };
  const maxDisabled = swapType === 'exact_in' && userBalLoading;

  useEffect(() => {
    setTrustChecked(false);
    setIsTrusted(false);
    const sym = tokenIn;
    fetch(
      `${SALVA_API_URL}/api/pool/trust-status?userSafeAddress=${user.safeAddress}&poolAddress=${pool.poolAddress}&tokenSymbol=${sym}`
    )
      .then((r) => r.json())
      .then((d) => {
        setIsTrusted(!!d.trusted);
        setTrustChecked(true);
      })
      .catch(() => setTrustChecked(true));
  }, [pool.poolAddress, tokenIn, user.safeAddress]);

  const swapFn = (() => {
    if (section === 'buy')
      return swapType === 'exact_in' ? 'swapExactNGNAmountForUSD' : 'swapForExactUSDAmount';
    return swapType === 'exact_in' ? 'swapExactUSDAmountForNGN' : 'swapForExactNGNAmount';
  })();

  useEffect(() => {
    if (amountRaw <= 0) {
      setQuote(null);
      return;
    }
    clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/pool/quote`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: pool.poolAddress,
            swapFn,
            amount: amountRaw,
            stableToken,
          }),
        });
        const data = await res.json();
        setQuote(res.ok ? data.quoteHuman : null);
      } catch {
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 500);
    return () => clearTimeout(quoteTimer.current);
  }, [amountRaw, swapFn, pool.poolAddress]);

  const amountWei = amountRaw > 0 ? Math.floor(amountRaw * 1e6).toString() : '0';

  const sendAmt = swapType === 'exact_in' ? amountRaw : quote ? parseFloat(quote) : 0;
  const receiveAmt = swapType === 'exact_out' ? amountRaw : quote ? parseFloat(quote) : 0;
  const userCantAfford = userSendBal !== null && sendAmt > 0 && userSendBal < sendAmt;
  const poolCantCover = receiveAmt > 0 && poolReceiveBal < receiveAmt;
  const poolEmpty = poolReceiveBal <= 0;

const handleReceiverChange = (val) => {
  setReceiverError('');
  setReceiverConfirmed(false);

  // 0x address — pass through directly
  if (val.toLowerCase().startsWith('0x')) {
    setReceiverRaw(val);
    setReceiverInputType('address');
    setReceiverResolved(val.trim());
    return;
  }

  let cleaned = val.toLowerCase();

  // Full name with @ — resolve via SNS
  if (cleaned.includes('@')) {
    cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
    const atIndex = cleaned.indexOf('@');
    if (atIndex !== -1) {
      cleaned = cleaned.slice(0, atIndex + 1) + cleaned.slice(atIndex + 1).replace(/@/g, '');
    }
    setReceiverRaw(cleaned);
    setReceiverInputType('fullname');
    setReceiverResolved('');
    const parts = cleaned.split('@');
    if (parts[0] && parts[1]) {
      clearTimeout(receiverResolveTimer.current);
      receiverResolveTimer.current = setTimeout(async () => {
        setReceiverResolving(true);
        setReceiverError('');
        try {
          const res = await fetch(`${SALVA_API_URL}/api/resolve-full-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fullName: cleaned }),
          });
          const data = await res.json();
          if (
            res.ok &&
            data.resolvedAddress &&
            data.resolvedAddress !== '0x0000000000000000000000000000000000000000'
          ) {
            setReceiverResolved(data.resolvedAddress);
            setShowReceiverConfirm(true);
          } else {
            setReceiverResolved('');
            setReceiverError(data.message || 'Name not found on SNS');
          }
        } catch {
          setReceiverResolved('');
          setReceiverError('Network error — could not resolve name');
        } finally {
          setReceiverResolving(false);
        }
      }, 600);
    } else {
      setReceiverResolved('');
    }
    return;
  }

  // Plain name chars without @ — block, must use full SNS
  cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
  const firstDot = cleaned.indexOf('.');
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
  }
  setReceiverRaw(cleaned);

  if (!cleaned) {
    setReceiverInputType('empty');
    setReceiverResolved(defaultReceiver);
    return;
  }

  setReceiverInputType('invalid');
  setReceiverResolved('');
  if (cleaned.length > 0) {
    setReceiverError('Must use full SNS name (e.g. charles@salva) or a 0x address');
  }
};

  const handleContinue = async () => {
    if (amountRaw <= 0 || isBelowMin) return;
    // ── Security lockdown check ──────────────────────────────────────────────
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(user.email)}`);
      const pinData = await pinRes.json();
      if (pinData.isLocked) {
        const h = Math.ceil((new Date(pinData.lockedUntil) - new Date()) / (1000 * 60 * 60));
        showMsg(`Account locked for ${h} more hour${h !== 1 ? 's' : ''} — swaps disabled during security lockdown`, 'error');
        return;
      }
    } catch {
      // non-fatal — proceed if check fails
    }
    // ────────────────────────────────────────────────────────────────────────
    if (!isTrusted) {
      setShowTrust(true);
      return;
    }
    pendingTrustRef.current = false;
    setPinVisible(true);
  };

const pendingTrustRef = React.useRef(false);

  const handlePinConfirm = async (pin) => {
  setPinLoading(true);
  try {
    const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, pin }),
    });
    const data = await res.json();
    if (!res.ok) {
      showMsg(data.message || 'Invalid PIN', 'error');
      return;
    }
    setPinVisible(false);
    setStep('loading');
    await executeSwap(data.privateKey, pendingTrustRef.current);
  } catch (err) {
    console.error(err);
    showMsg('Network error', 'error');
  } finally {
    setPinLoading(false);
  }
};

const executeSwap = async (privateKey, doApproveMax = false) => {
  try {
    const approveAmountWei = doApproveMax
      ? '115792089237316195423570985008687907853269984665640564039457584007913129639935'
      : swapType === 'exact_out' && quote
        ? Math.ceil(parseFloat(quote) * 1e6).toString()   // ceil not floor — never under-approve
        : amountWei;

    const swapRes = await fetch(`${SALVA_API_URL}/api/pool/swap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userSafeAddress: user.safeAddress,
        userPrivateKey: privateKey,
        poolAddress: pool.poolAddress,
        stableToken,
        ngnToken,
        swapFn,
        amountWei,
        approveAmountWei,
        trusted: isTrusted,
        tokenIn,
        doApproveMax,
        receiverAddress: receiverResolved || user.safeAddress,
        // Pass the quote so backend saves correct output amount in tx history
        quoteHuman:
          swapType === 'exact_in'
            ? quote !== null
              ? String(parseFloat(quote))
              : null
            : String(amountRaw), // exact_out: amountRaw IS the output
      }),
    });

    const swapData = await swapRes.json();
    if (!swapRes.ok) throw new Error(swapData.message || 'Swap failed');

    if (doApproveMax) {
      setIsTrusted(true);
    }

    setTxHash(swapData.txHash);
    const outToken = tokenOut;
    const outAmt =
      swapType === 'exact_in' ? (quote !== null ? parseFloat(quote) : null) : amountRaw;
    setReceivedAmount(outAmt);
    setReceivedToken(outToken);
    setStep('done');
    onSwapComplete?.();
  } catch {
    showMsg('Swap failed — please try again', 'error');
    setStep('input');
  }
};

  const inputTokenLabel = section === 'buy' ? ngnLabel : stableToken;
  const outputTokenLabel = section === 'buy' ? stableToken : ngnLabel;
  const amountInputLabel =
    swapType === 'exact_in' ? `${inputTokenLabel} to spend` : `${outputTokenLabel} to receive`;
  const amountInputSuffix = swapType === 'exact_in' ? inputTokenLabel : outputTokenLabel;
  const quoteLabel = swapType === 'exact_in' ? 'You receive' : 'You need to send';
  const quoteSuffix = swapType === 'exact_in' ? outputTokenLabel : inputTokenLabel;

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
        <motion.div
          className="absolute inset-0 bg-black/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={step !== 'loading' ? onClose : undefined}
        />
        <motion.div
          className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Accent top line using the section's accent color */}
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)`,
            }}
          />

          <div className="overflow-y-auto flex-1 overscroll-contain px-3 pt-3 pb-2 sm:px-6 sm:pt-5">
            <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-3 sm:mb-4 sm:hidden" />

            {/* ── INPUT ── */}
            {step === 'input' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                {/* ── Pool Identity Header ── */}
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <div
                    className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs sm:text-base font-black"
                    style={{ background: `${accentColor}1A`, color: accentColor }}
                  >
                    {section === 'buy' ? '↑$' : '$↑'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="font-black text-[10px] sm:text-sm text-white truncate">
                        {pool.poolName || 'Anonymous Pool'}
                      </p>
                      {isTrusted && (
                        <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black border border-green-500/30 bg-green-500/10 text-green-400 flex-shrink-0">
                          ✓ Trusted
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[7px] sm:text-[9px] text-white/40 truncate mt-0.5">
                      {pool.poolAddress.slice(0, 18)}…{pool.poolAddress.slice(-6)}
                    </p>
                  </div>
                  <div
                    className="flex-shrink-0 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg border text-[7px] sm:text-[9px] font-black uppercase tracking-widest"
                    style={{
                      borderColor: `${accentColor}40`,
                      color: accentColor,
                      background: `${accentColor}0D`,
                    }}
                  >
                    {section === 'buy' ? '₦→$' : '$→₦'}
                  </div>
                </div>

                {/* ── Token Config Row — Send side always left, Receive side always right ── */}
                <div className="flex items-stretch gap-2 sm:gap-3">
                  {section === 'buy' ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <label className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black block mb-1 sm:mb-1.5">
                          NGN to Send
                        </label>
                        <TokenPills
                          options={['NGNS', 'CNGN']}
                          value={ngnToken}
                          onChange={setNgnToken}
                          accentColor={accentColor}
                        />
                      </div>
                      <div className="w-px bg-white/10 self-stretch flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black block mb-1 sm:mb-1.5">
                          USD to Receive
                        </label>
                        <TokenPills
                          options={['USDT', 'USDC']}
                          value={stableToken}
                          onChange={setStableToken}
                          accentColor={accentColor}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <label className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black block mb-1 sm:mb-1.5">
                          USD to Send
                        </label>
                        <TokenPills
                          options={['USDT', 'USDC']}
                          value={stableToken}
                          onChange={setStableToken}
                          accentColor={accentColor}
                        />
                      </div>
                      <div className="w-px bg-white/10 self-stretch flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <label className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black block mb-1 sm:mb-1.5">
                          NGN to Receive
                        </label>
                        <TokenPills
                          options={['NGNS', 'CNGN']}
                          value={ngnToken}
                          onChange={setNgnToken}
                          accentColor={accentColor}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* ── Mode toggle ── */}
                <div className="flex gap-1.5 sm:gap-2 p-0.5 sm:p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {[
                    { id: 'exact_in', label: 'Exact Input', hint: 'Set what you send' },
                    { id: 'exact_out', label: 'Exact Output', hint: 'Set what you get' },
                  ].map(({ id, label, hint }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setSwapType(id);
                        setAmountDisplay('');
                        setAmountRaw(0);
                        setQuote(null);
                      }}
                      className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${
                        swapType === id
                          ? 'bg-white/10 text-white shadow-sm'
                          : 'text-white/30 hover:text-white/50'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {/* ── Flow banner ── */}
                <div
                  className="flex items-center justify-between px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl border"
                  style={{ borderColor: `${accentColor}25`, background: `${accentColor}08` }}
                >
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs sm:text-sm" style={{ color: accentColor }}>
                      ↑
                    </span>
                    <div>
                      <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/40 font-black">
                        You Send
                      </p>
                      <p
                        className="text-[9px] sm:text-xs font-black"
                        style={{ color: accentColor }}
                      >
                        {section === 'buy' ? ngnLabel : stableToken}
                      </p>
                    </div>
                  </div>
                  <div className="text-white/20 text-sm sm:text-lg font-black">→</div>
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <div className="text-right">
                      <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/40 font-black">
                        You Get
                      </p>
                      <p className="text-[9px] sm:text-xs font-black text-green-400">
                        {section === 'buy' ? stableToken : ngnLabel}
                      </p>
                    </div>
                    <span className="text-xs sm:text-sm text-green-400">↓</span>
                  </div>
                </div>

                {/* ── Balance strip ── */}
                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <div
                    className={`px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl border ${userCantAfford ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
                      Your Balance
                    </p>
                    {userBalLoading ? (
                      <span className="w-2 h-2 sm:w-3 sm:h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                    ) : (
                      <p
                        className={`text-[9px] sm:text-xs font-black truncate ${userCantAfford ? 'text-red-400' : 'text-white'}`}
                      >
                        {userSendBal !== null
                          ? fmt(userSendBal, section === 'buy' ? 'ngn' : 'usd')
                          : '—'}
                        <span className="text-white/40 font-normal text-[7px] sm:text-[9px]">
                          {' '}
                          {section === 'buy' ? ngnLabel : stableToken}
                        </span>
                      </p>
                    )}
                  </div>
                  <div
                    className={`px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl border ${poolEmpty || poolCantCover ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
                      Pool Has
                    </p>
                    <p
                      className={`text-[9px] sm:text-xs font-black truncate ${poolEmpty || poolCantCover ? 'text-red-400' : 'text-white'}`}
                    >
                      {fmt(poolReceiveBal, section === 'buy' ? 'usd' : 'ngn')}
                      <span className="text-white/40 font-normal text-[7px] sm:text-[9px]">
                        {' '}
                        {section === 'buy' ? stableToken : ngnLabel}
                      </span>
                    </p>
                  </div>
                </div>
                {userCantAfford && (
                  <p className="text-[7px] sm:text-[10px] text-red-400 font-bold -mt-1">
                    ⚠ Insufficient balance to send
                  </p>
                )}
                {(poolEmpty || poolCantCover) && (
                  <p className="text-[7px] sm:text-[10px] text-red-400 font-bold -mt-1">
                    {poolEmpty
                      ? `⚠ Pool has no ${section === 'buy' ? stableToken : ngnLabel} liquidity`
                      : `⚠ Pool only has ${fmt(poolReceiveBal, section === 'buy' ? 'usd' : 'ngn')} ${section === 'buy' ? stableToken : ngnLabel}`}
                  </p>
                )}

                {/* Amount input */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {amountInputLabel}
                    </label>
                    <button
                      type="button"
                      onClick={handleMaxClick}
                      disabled={maxDisabled}
                      className="text-[7px] sm:text-[10px] font-black uppercase tracking-widest hover:opacity-80 transition-opacity px-1.5 py-0.5 sm:px-2 rounded-lg border disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        color: accentColor,
                        borderColor: `${accentColor}33`,
                        background: `${accentColor}1A`,
                      }}
                    >
                      Max
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={amountDisplay}
                      onChange={(e) => {
                        const f = fmtInput(e.target.value);
                        setAmountDisplay(f);
                        setAmountRaw(parseFloat(f.replace(/,/g, '')) || 0);
                      }}
                      className={`w-full p-3 sm:p-4 rounded-xl bg-white/5 border outline-none text-sm sm:text-xl font-black text-white transition-all pr-16 sm:pr-20 ${
                        isBelowMin ? 'border-red-500' : 'border-white/10 focus:border-salvaGold'
                      }`}
                    />
                    <span
                      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 font-black text-[10px] sm:text-sm"
                      style={{ color: accentColor }}
                    >
                      {amountInputSuffix}
                    </span>
                  </div>
                  {isBelowMin && (
                    <p className="text-[8px] sm:text-[11px] text-red-400 font-bold mt-1 sm:mt-1.5 animate-pulse">
                      ⚠️ Minimum:{' '}
                      {section === 'buy'
                        ? `${fmt(minAmount, 'ngn')} ${ngnLabel}`
                        : `${fmt(minAmount, 'usd')} ${stableToken}`}
                    </p>
                  )}
                </div>

                {/* Quote */}
                {(quote !== null || quoteLoading) && amountRaw > 0 && (
                  <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {quoteLabel}
                    </span>
                    {quoteLoading ? (
                      <span className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
                    ) : (
                      <span className="font-black text-sm" style={{ color: accentColor }}>
                        {fmt(
                          quote,
                          swapType === 'exact_in'
                            ? section === 'buy'
                              ? 'usd'
                              : 'ngn'
                            : section === 'buy'
                              ? 'ngn'
                              : 'usd'
                        )}{' '}
                        {quoteSuffix}
                      </span>
                    )}
                  </div>
                )}

                {/* Rate */}
                <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Exchange Rate
                  </span>
                  <span className="font-black text-[9px] sm:text-sm text-white">
                    ₦{fmt(displayRate, 'ngn')}
                    <span className="text-white/60 font-normal text-[8px] sm:text-xs"> / USD</span>
                  </span>
                </div>

                {/* Network Fee */}
                <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Network Fee
                  </span>
                  {swapFee.loading ? (
                    <span className="w-2 h-2 sm:w-3 sm:h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                  ) : swapFee.feeNGN !== null ? (
                    <span className="text-red-400 font-black text-[7px] sm:text-[10px]">
                      ₦{swapFee.feeNGN?.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-white/30 text-[7px] sm:text-[10px]">—</span>
                  )}
                </div>

                {/* ── Receiver ── */}
                <div>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      Receiver
                    </label>
                    {receiverRaw !== defaultReceiver && (
                      <button
                        onClick={() => {
                          setReceiverRaw(defaultReceiver);
                          setReceiverInputType('address');
                          setReceiverResolved(defaultReceiver);
                          setReceiverError('');
                          setReceiverConfirmed(false);
                        }}
                        className="text-[6px] sm:text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
                      >
                        Reset ↺
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={receiverRaw}
                      onChange={(e) => handleReceiverChange(e.target.value)}
                      placeholder="0x… or charles@salva"
                      className={`w-full p-2 sm:p-3 rounded-xl bg-white/5 border outline-none text-[9px] sm:text-xs font-mono text-white/80 placeholder:text-white/30 transition-all pr-8 ${
                        receiverError
                          ? 'border-red-500/60'
                          : receiverInputType === 'fullname' &&
                              receiverResolved &&
                              receiverConfirmed
                            ? 'border-green-500/40'
                            : receiverInputType === 'fullname' &&
                                receiverResolved &&
                                !receiverConfirmed
                              ? 'border-yellow-500/40'
                              : 'border-white/10 focus:border-salvaGold'
                      }`}
                    />
                    {receiverResolving && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                    )}
                    {!receiverResolving &&
                      receiverInputType === 'fullname' &&
                      receiverResolved &&
                      receiverConfirmed && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-green-400 text-[10px]">
                          ✓
                        </span>
                      )}
                    {!receiverResolving &&
                      receiverInputType === 'fullname' &&
                      receiverResolved &&
                      !receiverConfirmed && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-yellow-400 text-[10px]">
                          !
                        </span>
                      )}
                  </div>
                  {receiverRaw === defaultReceiver && (
                    <p className="text-[7px] sm:text-[10px] text-white/30 font-bold mt-1 sm:mt-1.5">
                      Default: your Safe wallet
                    </p>
                  )}
                  {receiverRaw !== defaultReceiver && !receiverError && (
                    <p className="text-[7px] sm:text-[10px] mt-1 sm:mt-1.5 font-bold">
                      {receiverInputType === 'address' && (
                        <span className="text-blue-400">↗ Custom address</span>
                      )}
                      {receiverInputType === 'fullname' &&
                        receiverResolved &&
                        receiverConfirmed && (
                          <span className="text-green-400">
                            ✓ Confirmed → {receiverResolved.slice(0, 10)}…
                            {receiverResolved.slice(-8)}
                          </span>
                        )}
                      {receiverInputType === 'fullname' &&
                        receiverResolved &&
                        !receiverConfirmed && (
                          <button
                            onClick={() => setShowReceiverConfirm(true)}
                            className="text-yellow-400 underline underline-offset-2"
                          >
                            ⚠ Tap to confirm recipient
                          </button>
                        )}
                      {receiverInputType === 'fullname' &&
                        !receiverResolved &&
                        !receiverResolving && (
                          <span className="text-white/30">
                            Complete the name — e.g. charles@salva
                          </span>
                        )}
                      {receiverInputType === 'invalid' && (
                        <span className="text-red-400">
                          Must use full SNS (e.g. charles@salva) or 0x address
                        </span>
                      )}
                    </p>
                  )}
                  {receiverError && (
                    <p className="text-[7px] sm:text-[10px] text-red-400 font-bold mt-1 sm:mt-1.5">
                      ⚠ {receiverError}
                    </p>
                  )}
                  {receiverRaw !== defaultReceiver &&
                    !receiverError &&
                    receiverResolved &&
                    receiverConfirmed && (
                      <div className="mt-1.5 sm:mt-2 flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                        <span className="text-yellow-400 text-[7px] sm:text-[10px] flex-shrink-0">
                          ⚠
                        </span>
                        <p className="text-[7px] sm:text-[10px] text-yellow-400/80 font-bold">
                          Funds go to a different address — double-check before continuing.
                        </p>
                      </div>
                    )}
                </div>
              </motion.div>
            )}

            {/* ── LOADING ── */}
            {step === 'loading' && (
              <div className="text-center py-14">
                <div className="relative w-14 h-14 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-salvaGold animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-salvaGold/10 flex items-center justify-center">
                    <span className="text-salvaGold text-sm font-black">₦</span>
                  </div>
                </div>
                <p className="font-black text-lg text-white">
                  {trustLoading ? 'Trusting pool…' : 'Executing swap…'}
                </p>
                <p className="text-xs text-white/60 mt-2">
                  Broadcasting via your Safe wallet. Please wait.
                </p>
              </div>
            )}

            {/* ── LOADING ── */}
            {step === 'loading' && (
              <div className="text-center py-9 sm:py-14">
                <div className="relative w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-salvaGold animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-salvaGold/10 flex items-center justify-center">
                    <span className="text-salvaGold text-[9px] sm:text-sm font-black">₦</span>
                  </div>
                </div>
                <p className="font-black text-sm sm:text-lg text-white">
                  {trustLoading ? 'Trusting pool…' : 'Executing swap…'}
                </p>
                <p className="text-[9px] sm:text-xs text-white/60 mt-1.5 sm:mt-2">
                  Broadcasting via your Safe wallet. Please wait.
                </p>
              </div>
            )}

            {/* ── DONE ── */}
            {step === 'done' && (
              <div className="text-center py-5 sm:py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="w-11 h-11 sm:w-16 sm:h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 sm:mb-5"
                >
                  <span className="text-xl sm:text-3xl">🎉</span>
                </motion.div>
                <h3 className="text-sm sm:text-xl font-black mb-1 text-white">Swap Complete!</h3>
                {receivedAmount !== null && (
                  <p className="text-[9px] sm:text-sm text-white/60 mb-3 sm:mb-4">
                    You received{' '}
                    <span className="font-black text-white">
                      {fmt(receivedAmount, section === 'buy' ? 'usd' : 'ngn')}
                    </span>{' '}
                    <span className="font-black" style={{ color: accentColor }}>
                      {receivedToken}
                    </span>
                  </p>
                )}
                {txHash && (
                  <a
                    href={`https://${process.env.NODE_ENV === 'production' ? '' : 'sepolia.'}basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[8px] sm:text-[11px] font-black underline break-all block mb-2"
                    style={{ color: accentColor }}
                  >
                    View on Basescan ↗
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="w-full mt-3.5 sm:mt-5 py-2.5 sm:py-3.5 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {step === 'input' && (
            <div className="flex-shrink-0 px-3 pb-4 pt-2.5 sm:px-6 sm:pb-5 sm:pt-3 border-t border-white/[0.06] bg-zinc-950">
              <div className="flex gap-2 sm:gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 sm:py-3.5 rounded-xl border border-white/10 text-white font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleContinue}
                  disabled={
                    amountRaw <= 0 ||
                    !trustChecked ||
                    isBelowMin ||
                    userCantAfford ||
                    poolCantCover ||
                    poolEmpty ||
                    userBalLoading ||
                    !!receiverError ||
                    receiverResolving ||
                    (receiverInputType === 'fullname' && !receiverResolved) ||
                    (receiverInputType === 'fullname' && receiverResolved && !receiverConfirmed) ||
                    receiverInputType === 'invalid'
                  }
                  className="flex-1 py-2.5 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: accentColor,
                    color: '#000',
                    boxShadow: `0 8px 24px ${accentColor}33`,
                  }}
                >
                  {!trustChecked ? 'Checking…' : 'Continue →'}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      <AnimatePresence>
        {showReceiverConfirm && receiverResolved && (
          <div className="fixed inset-0 z-[95] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowReceiverConfirm(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />
              <div className="p-5 sm:p-7 text-center">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <span className="text-base sm:text-2xl">🔍</span>
                </div>
                <h3 className="text-sm sm:text-lg font-black text-white mb-1">Confirm Recipient</h3>
                <p className="text-[8px] sm:text-[11px] text-white/50 mb-3.5 sm:mb-5 leading-relaxed">
                  SNS resolved successfully. Verify this is the correct recipient before swapping.
                </p>
                <div className="p-2.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-2 text-left space-y-2 sm:space-y-3">
                  <div>
                    <p className="text-[6px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black mb-1">
                      SNS Name
                    </p>
                    <p className="font-black text-salvaGold text-[9px] sm:text-sm">{receiverRaw}</p>
                  </div>
                  <div>
                    <p className="text-[6px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black mb-1">
                      Resolved Address
                    </p>
                    <p className="font-mono text-[8px] sm:text-[11px] text-white/70 break-all">
                      {receiverResolved}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-yellow-500/5 border border-yellow-500/20 mb-3.5 sm:mb-5">
                  <span className="text-yellow-400 text-[7px] sm:text-[10px] flex-shrink-0">⚠</span>
                  <p className="text-[7px] sm:text-[10px] text-yellow-400/80 font-bold text-left">
                    Swap output will go to this address. This cannot be undone.
                  </p>
                </div>
                <div className="flex gap-2 sm:gap-3">
                  <button
                    onClick={() => {
                      setShowReceiverConfirm(false);
                    }}
                    className="flex-1 py-2 sm:py-3 rounded-xl border border-white/10 text-white/60 font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => {
                      setReceiverConfirmed(true);
                      setShowReceiverConfirm(false);
                    }}
                    className="flex-1 py-2 sm:py-3 rounded-xl bg-salvaGold text-black font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                  >
                    ✓ Confirm
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTrust && (
          <TrustModal
            pool={pool}
            tokenLabel={tokenIn === 'NGNS' ? 'NGNs' : tokenIn === 'CNGN' ? 'cNGN' : tokenIn}
            onTrust={() => {
              pendingTrustRef.current = true;
              setShowTrust(false);
              setPinVisible(true);
            }}
            onSkip={() => {
              pendingTrustRef.current = false;
              setShowTrust(false);
              setPinVisible(true);
            }}
            onCancel={() => setShowTrust(false)}
          />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {pinVisible && (
          <PinModal
            title="Confirm Swap"
            subtitle="Enter your PIN to authorize this transaction via your Safe"
            onConfirm={handlePinConfirm}
            onCancel={() => setPinVisible(false)}
            loading={pinLoading}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ─── Pool Card ────────────────────────────────────────────────────────────────
const PoolCard = ({ pool, section, onSwap, index }) => {
  const rate = section === 'buy' ? parseFloat(pool.buyRate || 0) : parseFloat(pool.sellRate || 0);
  const ngnsAvail = parseFloat(pool.ngnsLiquidity || 0);
  const cNgnAvail = parseFloat(pool.cNgnLiquidity || 0);
  const usdtAvail = parseFloat(pool.usdtLiquidity || 0);
  const usdcAvail = parseFloat(pool.usdcLiquidity || 0);
  const accentColor = section === 'buy' ? '#D4AF37' : '#22c55e';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-white/[0.14] transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-2.5 sm:p-3.5">
        {/* Identity */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-black text-sm text-white truncate">
              {pool.poolName || 'Anonymous Pool'}
            </p>
            <p className="font-mono text-[10px] text-white/60 truncate mt-0.5">
              {pool.poolAddress}
            </p>
          </div>
          <div
            className="flex-shrink-0 px-2.5 py-1 rounded-lg border text-[9px] font-black uppercase tracking-widest"
            style={{
              borderColor: `${accentColor}40`,
              color: accentColor,
              background: `${accentColor}0D`,
            }}
          >
            {section === 'buy' ? 'GET USD' : 'GET NGN'}
          </div>
        </div>

        {/* Stats */}
        {section === 'buy' ? (
          <div className="flex flex-col gap-1.5 mb-4">
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black flex-shrink-0 mr-3">
                Rate
              </p>
              <div className="text-right min-w-0">
                <span className="font-black text-sm text-white">
                  ₦{fmt(rate, 'ngn')}
                  <span className="text-[10px] text-white/40 font-normal">/USD</span>
                </span>
                {parseFloat(pool.minNgnAmount || 0) > 0 && (
                  <p className="text-[6px] sm:text-[9px] text-yellow-400/70 font-bold mt-0.5">
                    Min: {fmt(parseFloat(pool.minNgnAmount), 'ngn')} NGN
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="flex flex-col flex-shrink-0 mr-3">
                <p className="text-[6px] sm:text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  USDT
                </p>
                <p className="text-[5px] sm:text-[7px] uppercase tracking-widest text-white/40 font-bold">
                  ERC-20
                </p>
              </div>
              <span className="font-black text-[9px] sm:text-sm text-white truncate ">
                {fmt(usdtAvail, 'usd')}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="flex flex-col flex-shrink-0 mr-3">
                <p className="text-[6px] sm:text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  USDC
                </p>
                <p className="text-[5px] sm:text-[7px] uppercase tracking-widest text-white/40 font-bold">
                  ERC-20
                </p>
              </div>
              <span className="font-black text-[9px] sm:text-sm text-white truncate ">
                {fmt(usdcAvail, 'usd')}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-4">
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[6px] sm:text-[9px] uppercase tracking-[0.3em] text-white/60 font-black">
                Rate
              </p>
              <div className="text-right min-w-0">
                <span className="font-black text-[9px] sm:text-sm text-white">
                  ₦{fmt(rate, 'ngn')}
                  <span className="text-[7px] sm:text-[10px] text-white/40 font-normal">/USD</span>
                </span>
                {parseFloat(pool.minTokenAmount || 0) > 0 && (
                  <p className="text-[6px] sm:text-[9px] text-yellow-400/70 font-bold mt-0.5">
                    Min: {fmt(parseFloat(pool.minTokenAmount), 'usd')} USD
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="flex flex-col flex-shrink-0 mr-3">
                <p className="text-[6px] sm:text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  NGNs
                </p>
                <p className="text-[5px] sm:text-[7px] uppercase tracking-widest text-white/40 font-bold">
                  ERC-20
                </p>
              </div>
              <span className="font-black text-[9px] sm:text-sm text-white truncate ">
                {fmt(ngnsAvail, 'ngn')}
              </span>
            </div>
            <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <div className="flex flex-col flex-shrink-0 mr-3">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black">
                  cNGN
                </p>
                <p className="text-[5px] sm:text-[7px] uppercase tracking-widest text-white/40 font-bold">
                  ERC-20
                </p>
              </div>
              <span className="font-black text-[9px] sm:text-sm text-white truncate">
                {fmt(cNgnAvail, 'ngn')}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => onSwap(pool)}
          className="w-full py-2.5 sm:py-3.5 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
          style={{
            background: accentColor,
            color: '#000',
            boxShadow: `0 4px 16px ${accentColor}33`,
          }}
        >
          Proceed to Swap →
        </button>
      </div>
    </motion.div>
  );
};

// ─── Main SwapTab ─────────────────────────────────────────────────────────────
const SwapTab = ({ user, showMsg }) => {
  const [section, setSection] = useState('buy');
  const [buyPools, setBuyPools] = useState([]);
  const [sellPools, setSellPools] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastTime, setLastTime] = useState(null);
  const [selected, setSelected] = useState(null);
  const [showNetworkReminder, setShowNetworkReminder] = useState(false);
  const pendingPool = useRef(null);
  const pollRef = useRef(null);

  const fetchPools = useCallback(
    async (silent = false) => {
      silent ? setRefreshing(true) : setLoading(true);
      try {
        const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
        const res = await fetch(`${SALVA_API_URL}/api/pool/published${q}`);
        const d = await res.json();
        setBuyPools(d.buyPools || []);
        setSellPools(d.sellPools || []);
        setLastTime(new Date());
      } catch {
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [search]
  );

  useEffect(() => {
    fetchPools();
    pollRef.current = setInterval(() => fetchPools(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchPools]);

  useEffect(() => {
    const t = setTimeout(() => fetchPools(true), 400);
    return () => clearTimeout(t);
  }, [search, fetchPools]);

  const activePools = section === 'buy' ? buyPools : sellPools;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3.5 sm:space-y-5 relative"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-sm sm:text-xl font-black tracking-tight">Naira Exchange</h2>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 mt-1">
          <a
            href="/bnb"
            className="flex items-center gap-0.5 sm:gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/[0.07] hover:bg-blue-500/[0.14] hover:border-blue-500/50 transition-all"
          >
            <span className="text-[6px] sm:text-[8px] font-black uppercase tracking-widest text-blue-400">
              BSC
            </span>
            <span className="text-blue-400 text-[6px] sm:text-[9px]">↗</span>
          </a>
          {lastTime && (
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest hidden sm:block">
              {lastTime.toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={() => fetchPools(true)}
            disabled={refreshing}
            className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            {refreshing ? (
              <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            ) : (
              <span className="text-salvaGold text-xs sm:text-lg leading-none">↻</span>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-3 h-3 sm:w-4 sm:h-4 text-white/60"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <circle cx="11" cy="11" r="8" strokeWidth="2" />
          <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search pools by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 sm:pl-11 pr-3 sm:pr-4 py-2.5 sm:py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] sm:text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-salvaGold/30 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/80 transition-colors text-[9px] sm:text-xs font-black"
          >
            ✕
          </button>
        )}
      </div>

      {/* Section toggle */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          {
            id: 'buy',
            label: 'NGN → USD',
            sub: 'Spend NGN, get USD',
            count: buyPools.length,
            color: '#D4AF37',
          },
          {
            id: 'sell',
            label: 'USD → NGN',
            sub: 'Spend USD, get NGN',
            count: sellPools.length,
            color: '#22c55e',
          },
        ].map(({ id, label, sub, count, color }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`py-2.5 px-3 sm:py-4 sm:px-4 rounded-2xl border transition-all text-left ${
              section === id
                ? 'border-transparent'
                : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]'
            }`}
            style={
              section === id
                ? {
                    background: `${color}18`,
                    borderColor: `${color}40`,
                  }
                : {}
            }
          >
            <div className="flex items-center justify-between mb-0.5">
              <span
                className="font-black text-[10px] sm:text-sm"
                style={{
                  color: section === id ? color : 'rgba(255,255,255,0.85)',
                }}
              >
                {label}
              </span>
              <span
                className="text-[7px] sm:text-[9px] font-black px-1 py-0.5 sm:px-1.5 rounded-md"
                style={
                  section === id
                    ? { background: `${color}20`, color }
                    : {
                        background: 'rgba(255,255,255,0.07)',
                        color: 'rgba(255,255,255,0.5)',
                      }
                }
              >
                {count}
              </span>
            </div>
            <p className="text-[7px] sm:text-[10px] text-white/60">{sub}</p>
          </button>
        ))}
      </div>

      {/* Pool list */}
      {loading ? (
        <div className="flex justify-center py-14 sm:py-20">
          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
        </div>
      ) : activePools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-14 sm:py-20 rounded-3xl border border-dashed border-white/[0.06] text-center"
        >
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🏊</span>
          </div>
          <p className="font-black text-white/60 text-[10px] sm:text-sm">
            {search ? 'No pools match your search.' : 'No active pools in this section.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-2 sm:mt-3 text-[7px] sm:text-[10px] font-black text-salvaGold/60 hover:text-salvaGold uppercase tracking-widest transition-colors"
            >
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {activePools.map((pool, i) => (
            <PoolCard
              key={pool.poolAddress}
              pool={pool}
              section={section}
              onSwap={(p) => {
                pendingPool.current = p;
                setShowNetworkReminder(true);
              }}
              index={i}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showNetworkReminder && (
          <NetworkReminder
            chain="base"
            action="pool_swap"
            onContinue={() => {
              const pool = pendingPool.current;
              pendingPool.current = null;
              setShowNetworkReminder(false);
              if (pool) setSelected(pool);
            }}
            onClose={() => {
              pendingPool.current = null;
              setShowNetworkReminder(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selected && (
          <SwapModal
            pool={selected}
            section={section}
            user={user}
            showMsg={showMsg}
            onClose={() => setSelected(null)}
            onSwapComplete={() => fetchPools(true)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SwapTab;