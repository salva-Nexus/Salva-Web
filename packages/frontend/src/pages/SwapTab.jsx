import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import NetworkReminder, { useNetworkReminder } from '../components/NetworkReminder';

const POLL_MS = 60_000;

const fmt = (n, d = 3) => {
  const num = parseFloat(n || 0);
  if (!Number.isFinite(num) || num === 0) return '0.000';
  const fixed = num.toFixed(6);  // full precision, no rounding
  const [intPart, decPart] = fixed.split('.');
  const formattedInt = Number(intPart).toLocaleString('en-US');
  return `${formattedInt}.${decPart.slice(0, d)}`;  // slice, never round
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
        <div className="p-8 text-center">
          <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔐</span>
          </div>
          <h3 className="text-xl font-black mb-1 text-white">{title}</h3>
          <p className="text-xs text-white/60 mb-6 leading-relaxed">{subtitle}</p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-6 text-white transition-all"
          />
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => onConfirm(pin)}
              disabled={loading || pin.length !== 4}
              className="flex-1 py-3.5 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-2 shadow-lg shadow-salvaGold/20 transition-all"
            >
              {loading && (
                <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
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
      <div className="p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔓</span>
          </div>
          <h3 className="text-xl font-black text-white mb-1">Trust This Pool?</h3>
          <p className="text-xs text-white/60">
            <span className="text-salvaGold font-black">
              {pool.poolName || `${pool.poolAddress.slice(0, 12)}…`}
            </span>
          </p>
        </div>
        <div className="space-y-3 mb-6">
          <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-xs font-black text-white/60 mb-1">✅ This swap only — Recommended</p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Approve exact amount for this swap. You'll be asked again next time.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <p className="text-xs font-black text-yellow-400 mb-1">
              ⚠️ Trust Pool — Use with caution
            </p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Approve unlimited {tokenLabel} spending. Future swaps skip the approval step, but
              grants full spending access.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onSkip}
            className="py-3.5 px-4 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:bg-white/5 transition-all"
          >
            Skip
          </button>
          <button
            onClick={onTrust}
            className="flex-1 py-3.5 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
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
  <div className="flex gap-2">
    {options.map((t) => (
      <button
        key={t}
        onClick={() => onChange(t)}
        className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all"
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

  // ── User wallet balances ──────────────────────────────────────────────────
  const [userBal, setUserBal] = useState({});
  const [userBalLoading, setUserBalLoading] = useState(true);
  useEffect(() => {
    if (!user?.safeAddress) return;
    setUserBalLoading(true);
    fetch(`${SALVA_API_URL}/api/balance/${user.safeAddress}`)
      .then((r) => r.json())
      .then((d) =>
        setUserBal({
          NGNS: parseFloat(d.ngnsBalance || 0),
          CNGN: parseFloat(d.cNgnBalance || 0),
          USDT: parseFloat(d.usdtBalance || 0),
          USDC: parseFloat(d.usdcBalance || 0),
        })
      )
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

  const handleContinue = () => {
    if (amountRaw <= 0 || isBelowMin) return;
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
        ? Math.floor(parseFloat(quote) * 1e6).toString()
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
          className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
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

          <div className="p-6 sm:p-8">
            <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

            {/* ── INPUT ── */}
            {step === 'input' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Header */}
                <div className="mb-2">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <p
                      className="text-[9px] uppercase tracking-[0.45em] font-black"
                      style={{ color: accentColor }}
                    >
                      {section === 'buy' ? 'Buy USD Stablecoin' : 'Sell USD Stablecoin'}
                    </p>
                    {isTrusted && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black border border-green-500/30 bg-green-500/10 text-green-400">
                        Trusted ✓
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {pool.poolName || 'Anonymous Pool'}
                  </h3>
                  <p className="font-mono text-[10px] text-white/60 truncate mt-0.5">
                    {pool.poolAddress}
                  </p>
                </div>

                {/* Stablecoin selector */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    Stablecoin
                  </label>
                  <TokenPills
                    options={['USDT', 'USDC']}
                    value={stableToken}
                    onChange={setStableToken}
                    accentColor={accentColor}
                  />
                </div>

                {/* NGN token selector */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    Naira Token
                  </label>
                  <TokenPills
                    options={['NGNS', 'CNGN']}
                    value={ngnToken}
                    onChange={setNgnToken}
                    accentColor={accentColor}
                  />
                </div>

                {/* Mode selector */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    Mode
                  </label>
                  <div className="flex gap-2">
                    {[
                      { id: 'exact_in', label: 'Exact Input' },
                      { id: 'exact_out', label: 'Exact Output' },
                    ].map(({ id, label }) => (
                      <button
                        key={id}
                        onClick={() => {
                          setSwapType(id);
                          setAmountDisplay('');
                          setAmountRaw(0);
                          setQuote(null);
                        }}
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                          swapType === id
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'border-white/[0.06] bg-white/5 text-white/60 hover:text-white/70'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Demarcation ── */}
                <div className="relative flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <div className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.03]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px]" style={{ color: accentColor }}>
                        ↑
                      </span>
                      <span className="text-[9px] uppercase tracking-[0.25em] font-black text-white/40">
                        Send
                      </span>
                      <span className="text-[9px] font-black" style={{ color: accentColor }}>
                        {section === 'buy' ? ngnLabel : stableToken}
                      </span>
                    </div>
                    <span className="text-white/20 text-[9px]">·</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] text-green-400">↓</span>
                      <span className="text-[9px] uppercase tracking-[0.25em] font-black text-white/40">
                        Receive
                      </span>
                      <span className="text-[9px] font-black text-green-400">
                        {section === 'buy' ? stableToken : ngnLabel}
                      </span>
                    </div>
                  </div>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>

                {/* ── Send / Receive balance info ── */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="px-3 py-2.5 rounded-xl border border-white/[0.06] bg-white/[0.02]">
                    <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30 mb-1">
                      Your balance
                    </p>
                    {userBalLoading ? (
                      <span className="w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                    ) : (
                      <p
                        className={`text-xs font-black ${userCantAfford ? 'text-red-400' : 'text-white'}`}
                      >
                        {userSendBal !== null ? fmt(userSendBal) : '—'}{' '}
                        <span className="font-normal opacity-60">
                          {section === 'buy' ? ngnLabel : stableToken}
                        </span>
                      </p>
                    )}
                  </div>
                  <div
                    className={`px-3 py-2.5 rounded-xl border ${poolEmpty ? 'border-red-500/30 bg-red-500/5' : 'border-white/[0.06] bg-white/[0.02]'}`}
                  >
                    <p className="text-[9px] uppercase tracking-[0.2em] font-black text-white/30 mb-1">
                      Pool available
                    </p>
                    <p
                      className={`text-xs font-black ${poolEmpty || poolCantCover ? 'text-red-400' : 'text-green-400'}`}
                    >
                      {fmt(poolReceiveBal)}{' '}
                      <span className="font-normal opacity-60">
                        {section === 'buy' ? stableToken : ngnLabel}
                      </span>
                    </p>
                  </div>
                </div>
                {userCantAfford && (
                  <p className="text-[10px] text-red-400 font-bold -mt-2">
                    ⚠ Insufficient balance to send
                  </p>
                )}
                {(poolEmpty || poolCantCover) && (
                  <p className="text-[10px] text-red-400 font-bold -mt-2">
                    {poolEmpty
                      ? `⚠ Pool has no ${section === 'buy' ? stableToken : ngnLabel} liquidity`
                      : `⚠ Pool only has ${fmt(poolReceiveBal)} ${section === 'buy' ? stableToken : ngnLabel}`}
                  </p>
                )}

                {/* Amount input */}
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    {amountInputLabel}
                  </label>
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
                      className={`w-full p-4 rounded-xl bg-white/5 border outline-none text-xl font-black text-white transition-all pr-20 ${
                        isBelowMin ? 'border-red-500' : 'border-white/10 focus:border-salvaGold'
                      }`}
                    />
                    <span
                      className="absolute right-4 top-1/2 -translate-y-1/2 font-black text-sm"
                      style={{ color: accentColor }}
                    >
                      {amountInputSuffix}
                    </span>
                  </div>
                  {isBelowMin && (
                    <p className="text-[11px] text-red-400 font-bold mt-1.5 animate-pulse">
                      ⚠️ Minimum:{' '}
                      {section === 'buy'
                        ? `${fmt(minAmount, 0)} ${ngnLabel}`
                        : `${fmt(minAmount)} ${stableToken}`}
                    </p>
                  )}
                </div>

                {/* Quote */}
                {(quote !== null || quoteLoading) && amountRaw > 0 && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {quoteLabel}
                    </span>
                    {quoteLoading ? (
                      <span className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
                    ) : (
                      <span className="font-black text-sm" style={{ color: accentColor }}>
                        {fmt(quote)} {quoteSuffix}
                      </span>
                    )}
                  </div>
                )}

                {/* Rate */}
                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Exchange Rate
                  </span>
                  <span className="font-black text-sm text-white">
                    ₦{fmt(displayRate, 0)}
                    <span className="text-white/60 font-normal text-xs"> / USD</span>
                  </span>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
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
                      userBalLoading
                    }
                    className="flex-1 py-3.5 rounded-xl font-black text-sm disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
                    style={{
                      background: accentColor,
                      color: '#000',
                      boxShadow: `0 8px 24px ${accentColor}33`,
                    }}
                  >
                    {!trustChecked ? 'Checking…' : 'Continue →'}
                  </button>
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

            {/* ── DONE ── */}
            {step === 'done' && (
              <div className="text-center py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300 }}
                  className="w-16 h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                >
                  <span className="text-3xl">🎉</span>
                </motion.div>
                <h3 className="text-xl font-black mb-1 text-white">Swap Complete!</h3>
                {receivedAmount !== null && (
                  <p className="text-sm text-white/60 mb-4">
                    You received{' '}
                    <span className="font-black text-white">{fmt(receivedAmount)}</span>{' '}
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
                    className="text-[11px] font-black underline break-all block mb-2"
                    style={{ color: accentColor }}
                  >
                    View on Basescan ↗
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="w-full mt-5 py-3.5 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 shadow-lg shadow-salvaGold/20 transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>

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
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-white/[0.14] transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-5">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="font-black text-base text-white truncate">
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
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black mb-1">
                Rate
              </p>
              <p className="font-black text-sm text-salvaGold">
                ₦{fmt(rate, 0)}
                <span className="text-[10px] text-white/60 font-normal">/USD</span>
              </p>
              {parseFloat(pool.minNgnAmount || 0) > 0 && (
                <p className="text-[9px] text-yellow-400/70 mt-0.5 font-bold">
                  Min: {fmt(parseFloat(pool.minNgnAmount), 0)} NGN
                </p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-green-400/50 font-black mb-1">
                USDT
              </p>
              <p className="font-black text-sm text-green-400">${fmt(usdtAvail)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-blue-400/50 font-black mb-1">
                USDC
              </p>
              <p className="font-black text-sm text-blue-400">${fmt(usdcAvail)}</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black mb-1">
                Rate
              </p>
              <p className="font-black text-sm text-green-400">
                ₦{fmt(rate, 0)}
                <span className="text-[10px] text-white/60 font-normal">/USD</span>
              </p>
              {parseFloat(pool.minTokenAmount || 0) > 0 && (
                <p className="text-[9px] text-yellow-400/70 mt-0.5 font-bold">
                  Min: {fmt(parseFloat(pool.minTokenAmount))} USD
                </p>
              )}
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-salvaGold/50 font-black mb-1">
                NGNs
              </p>
              <p className="font-black text-sm text-salvaGold">{fmt(ngnsAvail)}</p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
              <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black mb-1">
                cNGN
              </p>
              <p className="font-black text-sm text-white/60">{fmt(cNgnAvail)}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => onSwap(pool)}
          className="w-full py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
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
  const [pendingPool, setPendingPool] = useState(null);
  const { isDismissed } = useNetworkReminder('salva_reminder_swap');
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5 relative">
      {/* ── THIS SECTION IS FOR LOCKING V3 POOL TABS ────────────────────────────── */}
      <div className="absolute inset-0 z-[999] flex items-center justify-center backdrop-blur-[2px] bg-black/50 pointer-events-auto rounded-3xl">
        <div className="flex flex-col items-center gap-3 px-8 py-8 rounded-3xl border border-white/[0.07] bg-zinc-950/90 shadow-2xl text-center">
          <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center">
            <span className="text-2xl">⚙️</span>
          </div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black">
            Salva V3 DEX
          </p>
          <p className="text-xl font-black text-white">Coming Soon</p>
          <p className="text-xs text-white/30 max-w-[200px] leading-relaxed">
            V3 smart contracts are under development and testing.
          </p>
        </div>
      </div>
      {/* ── THIS IS THE END OF THE SECTION ──────────────────────────────────────── */}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-1">
            Salva V3 DEX
          </p>
          <h2 className="text-3xl font-black tracking-tight">Naira Exchange</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          <a
            href="/l1"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-blue-500/30 bg-blue-500/[0.07] hover:bg-blue-500/[0.14] hover:border-blue-500/50 transition-all"
          >
            <span className="text-[8px] font-black uppercase tracking-widest text-blue-400">
              BSC
            </span>
            <span className="text-blue-400 text-[9px]">↗</span>
          </a>
          {lastTime && (
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest hidden sm:block">
              {lastTime.toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={() => fetchPools(true)}
            disabled={refreshing}
            className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            {refreshing ? (
              <span className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            ) : (
              <span className="text-salvaGold text-lg leading-none">↻</span>
            )}
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <svg
          className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/60"
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
          className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-salvaGold/30 transition-all"
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/80 transition-colors text-xs font-black"
          >
            ✕
          </button>
        )}
      </div>

      {/* Section toggle */}
      <div className="grid grid-cols-2 gap-3">
        {[
          {
            id: 'buy',
            label: 'NGN → USD',
            sub: 'Spend NGNs, get stablecoin',
            count: buyPools.length,
            color: '#D4AF37',
          },
          {
            id: 'sell',
            label: 'USD → NGN',
            sub: 'Spend stablecoin, get NGNs',
            count: sellPools.length,
            color: '#22c55e',
          },
        ].map(({ id, label, sub, count, color }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`py-4 px-4 rounded-2xl border transition-all text-left ${
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
                className="font-black text-sm"
                style={{
                  color: section === id ? color : 'rgba(255,255,255,0.5)',
                }}
              >
                {label}
              </span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
                style={
                  section === id
                    ? { background: `${color}20`, color }
                    : {
                        background: 'rgba(255,255,255,0.05)',
                        color: 'rgba(255,255,255,0.25)',
                      }
                }
              >
                {count}
              </span>
            </div>
            <p className="text-[10px] text-white/60">{sub}</p>
          </button>
        ))}
      </div>

      {/* Pool list */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
        </div>
      ) : activePools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 rounded-3xl border border-dashed border-white/[0.06] text-center"
        >
          <div className="w-14 h-14 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏊</span>
          </div>
          <p className="font-black text-white/60 text-sm">
            {search ? 'No pools match your search.' : 'No active pools in this section.'}
          </p>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="mt-3 text-[10px] font-black text-salvaGold/60 hover:text-salvaGold uppercase tracking-widest transition-colors"
            >
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          {activePools.map((pool, i) => (
            <PoolCard
              key={pool.poolAddress}
              pool={pool}
              section={section}
              onSwap={(pool) => {
                if (!isDismissed()) {
                  setPendingPool(pool);
                  setShowNetworkReminder(true);
                } else {
                  setSelected(pool);
                }
              }}
              index={i}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {showNetworkReminder && (
          <NetworkReminder
            storageKey="salva_reminder_swap"
            onContinue={() => {
              setShowNetworkReminder(false);
              setSelected(pendingPool);
              setPendingPool(null);
            }}
            onClose={() => {
              setShowNetworkReminder(false);
              setPendingPool(null);
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