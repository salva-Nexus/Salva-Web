// packages/frontend/src/pages/BNBSwapTab.jsx (NEW)

import React, { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SALVA_API_URL, NODE_ENV } from '../config';

const CHAIN = "bnb";
const POLL_MS = 60_000;
const EXPLORER_TX_BASE =
  NODE_ENV === "development"
    ? "https://testnet.bscscan.com/tx/"
    : "https://bscscan.com/tx/";
const _poolsCache = { buyPools: null, sellPools: null, lastTime: null };

// ── Helpers ──────────────────────────────────────────────────────────────
const fmt = (n) => {
  const num = parseFloat(n || 0);
  if (!Number.isFinite(num) || num === 0) return "0.00";
  if (num > 0 && num < 0.01) return "<0.01";
  const fixed = num.toFixed(2);
  const [intPart, decPart] = fixed.split(".");
  return `${Number(intPart).toLocaleString("en-US")}.${decPart}`;
};

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, "");
  const p = d.split(".");
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return p.length > 1 ? `${p[0]}.${p[1]}` : p[0];
};

function detectSearchType(v) {
  const t = v.trim();
  if (!t) return "empty";
  if (t.toLowerCase().startsWith("0x")) return "address";
  if (t.includes("@")) return "fullname";
  return "invalid";
}

// Resolves a full SNS name (name@nspace) or 0x address to a target address,
// via registry namespace lookup + isAvail — same flow for pool search AND
// receiver resolution.
async function resolveFullNameOrAddress(input) {
  const type = detectSearchType(input);
  if (type === "address") return input.trim();
  if (type === "fullname") {
    const name = input.trim();
    const at = name.indexOf("@");
    const nspace = name.slice(at);
    const regRes = await fetch(
      `${SALVA_API_URL}/api/registry/findByNamespace/${encodeURIComponent(nspace)}`,
    );
    const regData = await regRes.json();
    if (!regRes.ok || !regData?.registryAddress)
      throw new Error("Wallet service not found");
    const availRes = await fetch(
      `${SALVA_API_URL}/api/name/isAvail/${encodeURIComponent(name)}/${regData.registryAddress}`,
    );
    const availData = await availRes.json();
    if (!availRes.ok || !availData.status || !availData.address)
      throw new Error("Name not found");
    return availData.address;
  }
  throw new Error("Enter a full name (name@namespace) or a 0x address");
}

// Attaches live balance + rate data to a bare pool record.
async function hydratePool(pool) {
  const [balRes, rateRes] = await Promise.all([
    fetch(`${SALVA_API_URL}/api/user/${CHAIN}/balance/${pool.poolAddress}`),
    fetch(`${SALVA_API_URL}/api/pool/rate/${pool.poolAddress}/${CHAIN}`),
  ]);
  const bal = await balRes.json();
  const rateJson = await rateRes.json();
  const rate = rateJson?.rate || {};
  return {
    ...pool,
    ngnsLiquidity: bal.ngnsBalance ?? "0",
    cNgnLiquidity: bal.cNgnBalance ?? "0",
    usdtLiquidity: bal.usdtBalance ?? "0",
    usdcLiquidity: bal.usdcBalance ?? "0",
    buyRate: rate.buyRate ?? "0",
    sellRate: rate.sellRate ?? "0",
  };
}

// ── PIN Modal ────────────────────────────────────────────────────────────
const PinModal = ({
  title,
  subtitle,
  onConfirm,
  onCancel,
  loading,
  feeInfo,
}) => {
  const [pin, setPin] = useState("");
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
        transition={{ type: "spring", stiffness: 380, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="p-5 sm:p-8 text-center">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔐</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black mb-1 text-white">
            {title}
          </h3>
          <p className="text-[9px] sm:text-xs text-white/60 mb-4 sm:mb-6 leading-relaxed">
            {subtitle}
          </p>
          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            placeholder="••••"
            autoFocus
            className="w-full p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-center text-xl sm:text-3xl tracking-[0.7em] sm:tracking-[1em] font-black mb-4 sm:mb-6 text-white transition-all"
          />
          <div className="-mt-2 mb-4 sm:-mt-3 sm:mb-6 px-2.5 py-2 sm:px-3 sm:py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-between text-[9px] sm:text-xs">
            <span className="uppercase tracking-widest text-white/60 font-black">
              Network Fee
            </span>
            {feeInfo.loading ? (
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 border border-blue-500/30 border-t-blue-400 rounded-full animate-spin inline-block" />
            ) : feeInfo.feeNGN != null ? (
              <span className="text-red-400 font-black">
                ₦{fmt(feeInfo.feeNGN)} ($
                {Number(feeInfo.feeUsd || 0).toFixed(4)})
              </span>
            ) : (
              <span className="text-white/30">—</span>
            )}
          </div>
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
              className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-sm hover:brightness-110 disabled:opacity-40 flex items-center justify-center gap-1.5 sm:gap-2 shadow-lg shadow-blue-500/20 transition-all"
            >
              {loading && (
                <span className="w-2 h-2 sm:w-3 sm:h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {loading ? "Verifying…" : "Confirm"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// ── Trust Modal ──────────────────────────────────────────────────────────
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
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      <div className="p-5 sm:p-8">
        <div className="text-center mb-4 sm:mb-6">
          <div className="w-10 h-10 sm:w-14 sm:h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
            <span className="text-base sm:text-2xl">🔓</span>
          </div>
          <h3 className="text-sm sm:text-xl font-black text-white mb-1">
            Trust This Pool?
          </h3>
          <p className="text-[9px] sm:text-xs text-white/60">
            <span className="text-blue-400 font-black">
              {pool.poolName || `${pool.poolAddress.slice(0, 12)}…`}
            </span>
          </p>
        </div>
        <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
          <div className="p-3 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <p className="text-[9px] sm:text-xs font-black text-white/60 mb-1">
              ✅ This swap only — Recommended
            </p>
            <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
              Approve exact amount for this swap. You'll be asked again next
              time.
            </p>
          </div>
          <div className="p-3 sm:p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <p className="text-[9px] sm:text-xs font-black text-yellow-400 mb-1">
              ⚠️ Trust Pool — Use with caution
            </p>
            <p className="text-[8px] sm:text-[11px] text-white/60 leading-relaxed">
              Approve unlimited {tokenLabel} spending. Future swaps skip the
              approval step.
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
            className="flex-1 py-2.5 sm:py-3.5 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
          >
            Trust
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

// ── Token Pills ──────────────────────────────────────────────────────────
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
                color: "#fff",
                borderColor: accentColor,
                boxShadow: `0 4px 16px ${accentColor}33`,
              }
            : {
                borderColor: "rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.03)",
                color: "rgba(255,255,255,0.3)",
              }
        }
      >
        {t}
      </button>
    ))}
  </div>
);

// ── Swap Modal ───────────────────────────────────────────────────────────
const SwapModal = ({
  pool,
  section,
  user,
  onClose,
  showMsg,
  onSwapComplete,
}) => {
  const [swapType, setSwapType] = useState("exact_in");
  const [amountDisplay, setAmountDisplay] = useState("");
  const [amountRaw, setAmountRaw] = useState(0);

  const hasUSDT = parseFloat(pool.usdtLiquidity || 0) > 0;
  const hasNGNs = parseFloat(pool.ngnsLiquidity || 0) > 0;
  const [stableToken, setStableToken] = useState(hasUSDT ? "USDT" : "USDC");
  const [ngnToken, setNgnToken] = useState(hasNGNs ? "NGNS" : "CNGN");
  const ngnLabel = ngnToken === "CNGN" ? "cNGN" : "NGNs";

  const tokenIn = section === "buy" ? ngnToken : stableToken;
  const tokenOut = section === "buy" ? stableToken : ngnToken;
  const inputLabelTok = section === "buy" ? ngnLabel : stableToken;
  const outputLabelTok = section === "buy" ? stableToken : ngnLabel;
  const rate = section === "buy" ? pool.buyRate : pool.sellRate;
  const accentColor = section === "buy" ? "#3b82f6" : "#22c55e";

  const [trustChecked, setTrustChecked] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [showTrust, setShowTrust] = useState(false);
  const [pinVisible, setPinVisible] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [step, setStep] = useState("input");
  const [receipt, setReceipt] = useState(null);
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const quoteTimer = useRef(null);
  const [receivedAmount, setReceivedAmount] = useState(null);
  const pendingTrustRef = useRef(false);

  const defaultReceiver = user?.safeAddress || "";
  const [receiverRaw, setReceiverRaw] = useState(defaultReceiver);
  const [receiverInputType, setReceiverInputType] = useState("address");
  const [receiverError, setReceiverError] = useState("");
  const [receiverResolved, setReceiverResolved] = useState(defaultReceiver);
  const [receiverResolving, setReceiverResolving] = useState(false);
  const receiverResolveTimer = useRef(null);
  const [showReceiverConfirm, setShowReceiverConfirm] = useState(false);
  const [receiverConfirmed, setReceiverConfirmed] = useState(false);

  const handleReceiverChange = (val) => {
    setReceiverError("");
    setReceiverConfirmed(false);
    if (val.toLowerCase().startsWith("0x")) {
      setReceiverRaw(val);
      setReceiverInputType("address");
      setReceiverResolved(val.trim());
      return;
    }
    let cleaned = val.toLowerCase().replace(/[^a-z2-9.@]/g, "");
    if (!cleaned) {
      setReceiverRaw("");
      setReceiverInputType("empty");
      setReceiverResolved(defaultReceiver);
      return;
    }
    if (!cleaned.includes("@")) {
      setReceiverRaw(cleaned);
      setReceiverInputType("invalid");
      setReceiverResolved("");
      setReceiverError(
        "Must use full SNS name (e.g. charles@salva) or a 0x address",
      );
      return;
    }
    setReceiverRaw(cleaned);
    setReceiverInputType("fullname");
    setReceiverResolved("");
    clearTimeout(receiverResolveTimer.current);
    receiverResolveTimer.current = setTimeout(async () => {
      setReceiverResolving(true);
      try {
        const addr = await resolveFullNameOrAddress(cleaned);
        setReceiverResolved(addr);
        setShowReceiverConfirm(true);
      } catch (err) {
        setReceiverResolved("");
        setReceiverError(err.message || "Name not found");
      } finally {
        setReceiverResolving(false);
      }
    }, 600);
  };

  // ── User balance ──
  const [userBal, setUserBal] = useState({});
  const [userBalRaw, setUserBalRaw] = useState({});
  const [userBalLoading, setUserBalLoading] = useState(true);
  useEffect(() => {
    if (!user?.safeAddress) return;
    setUserBalLoading(true);
    fetch(`${SALVA_API_URL}/api/user/${CHAIN}/balance/${user.safeAddress}`)
      .then((r) => r.json())
      .then((d) => {
        setUserBal({
          NGNS: parseFloat(d.ngnsBalance || 0),
          CNGN: parseFloat(d.cNgnBalance || 0),
          USDT: parseFloat(d.usdtBalance || 0),
          USDC: parseFloat(d.usdcBalance || 0),
        });
        setUserBalRaw({
          NGNS: String(d.ngnsBalance ?? "0"),
          CNGN: String(d.cNgnBalance ?? "0"),
          USDT: String(d.usdtBalance ?? "0"),
          USDC: String(d.usdcBalance ?? "0"),
        });
      })
      .catch(() => {})
      .finally(() => setUserBalLoading(false));
  }, [user?.safeAddress]);

  const userSendBal = userBal[tokenIn] ?? null;
  const poolReceiveBal =
    tokenOut === "USDT"
      ? parseFloat(pool.usdtLiquidity || 0)
      : tokenOut === "USDC"
        ? parseFloat(pool.usdcLiquidity || 0)
        : tokenOut === "CNGN"
          ? parseFloat(pool.cNgnLiquidity || 0)
          : parseFloat(pool.ngnsLiquidity || 0);
  const poolReceiveBalRaw =
    tokenOut === "USDT"
      ? String(pool.usdtLiquidity ?? "0")
      : tokenOut === "USDC"
        ? String(pool.usdcLiquidity ?? "0")
        : tokenOut === "CNGN"
          ? String(pool.cNgnLiquidity ?? "0")
          : String(pool.ngnsLiquidity ?? "0");

  const handleMaxClick = () => {
    const raw =
      swapType === "exact_in"
        ? (userBalRaw[tokenIn] ?? "0")
        : poolReceiveBalRaw;
    setAmountDisplay(fmtInput(raw));
    setAmountRaw(parseFloat(raw) || 0);
  };
  const maxDisabled = swapType === "exact_in" && userBalLoading;

  // ── Trust check ──
  useEffect(() => {
    setTrustChecked(false);
    setIsTrusted(false);
    fetch(
      `${SALVA_API_URL}/api/user/swap/isTrusted/${user.safeAddress}/${pool.poolAddress}/${tokenIn}/${CHAIN}`,
    )
      .then((r) => r.json())
      .then((d) => {
        setIsTrusted(!!d.isTrusted);
        setTrustChecked(true);
      })
      .catch(() => setTrustChecked(true));
  }, [pool.poolAddress, tokenIn, user.safeAddress]);

  // ── Quote ──
  useEffect(() => {
    if (amountRaw <= 0) {
      setQuote(null);
      return;
    }
    clearTimeout(quoteTimer.current);
    quoteTimer.current = setTimeout(async () => {
      setQuoteLoading(true);
      try {
        if (swapType === "exact_in") {
          const url = `${SALVA_API_URL}/api/user/swap/amount-Out?poolAddress=${pool.poolAddress}&tokenOut=${tokenOut}&tokenIn=${tokenIn}&amount=${amountRaw}&rate=${rate}&chain=${CHAIN}`;
          const res = await fetch(url);
          const data = await res.json();
          setQuote(res.ok && data.status ? String(data.amountOut) : null);
        } else {
          const url = `${SALVA_API_URL}/api/user/swap/amount-In?poolAddress=${pool.poolAddress}&usdToken=${stableToken}&inToken=${tokenIn}&outToken=${tokenOut}&outAmount=${amountRaw}&rate=${rate}&chain=${CHAIN}`;
          const res = await fetch(url);
          const data = await res.json();
          setQuote(res.ok && data.status ? String(data.amountIn) : null);
        }
      } catch {
        setQuote(null);
      } finally {
        setQuoteLoading(false);
      }
    }, 500);
    return () => clearTimeout(quoteTimer.current);
  }, [
    amountRaw,
    swapType,
    pool.poolAddress,
    tokenIn,
    tokenOut,
    stableToken,
    rate,
  ]);

  const sendAmt =
    swapType === "exact_in" ? amountRaw : quote ? parseFloat(quote) : 0;
  const receiveAmt =
    swapType === "exact_out" ? amountRaw : quote ? parseFloat(quote) : 0;
  const userCantAfford =
    userSendBal !== null && sendAmt > 0 && userSendBal < sendAmt;
  const poolCantCover = receiveAmt > 0 && poolReceiveBal < receiveAmt;
  const poolEmpty = poolReceiveBal <= 0;

  // ── Fee estimate (only fetched once PIN modal opens) ──
  const [swapFee, setSwapFee] = useState({
    feeNGN: null,
    feeUsd: null,
    loading: false,
  });
  const fetchFeeForPin = useCallback((trustedFlag) => {
    setSwapFee({ feeNGN: null, feeUsd: null, loading: true });
    fetch(
      `${SALVA_API_URL}/api/user/swap/estimate-swap-fee/${CHAIN}/${trustedFlag}`,
    )
      .then((r) => r.json())
      .then((d) =>
        setSwapFee({
          feeNGN: d?.fee?.feeNGN ?? null,
          feeUsd: d?.fee?.feeUsd ?? null,
          loading: false,
        }),
      )
      .catch(() => setSwapFee({ feeNGN: null, feeUsd: null, loading: false }));
  }, []);

  const swapTypeParam = (() => {
    if (section === "buy")
      return swapType === "exact_in"
        ? "swapExactNGNAmountForUSD"
        : "swapForExactUSDAmount";
    return swapType === "exact_in"
      ? "swapExactUSDAmountForNGN"
      : "swapForExactNGNAmount";
  })();

  const handleContinue = () => {
    if (amountRaw <= 0) return;
    if (!isTrusted) {
      setShowTrust(true);
      return;
    }
    pendingTrustRef.current = false;
    fetchFeeForPin(isTrusted);
    setPinVisible(true);
  };

  const handlePinConfirm = async (pin) => {
    setPinLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, pin }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showMsg(data.message || "Invalid PIN", "error");
        return;
      }
      setPinVisible(false);
      setStep("loading");
      await executeSwap(data.privateKey, pendingTrustRef.current);
    } catch {
      showMsg("Network error", "error");
    } finally {
      setPinLoading(false);
    }
  };

  const executeSwap = async (pkey, trustPool) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/swap/execute-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: user.email,
          pkey,
          poolAddress: pool.poolAddress,
          receiver: receiverResolved || user.safeAddress,
          usdToken: stableToken,
          ngnToken,
          amount: String(amountRaw),
          chain: CHAIN,
          trustPool,
          type: swapTypeParam,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.status)
        throw new Error(data.message || "Swap failed");
      if (trustPool) setIsTrusted(true);
      setReceipt(data.receipt || null);
      const outAmt =
        swapType === "exact_in"
          ? quote !== null
            ? parseFloat(quote)
            : null
          : amountRaw;
      setReceivedAmount(outAmt);
      setStep("done");
      onSwapComplete?.();
    } catch (err) {
      showMsg(err.message || "Swap failed — please try again", "error");
      setStep("input");
    }
  };

  const amountLabel =
    swapType === "exact_in"
      ? `${inputLabelTok} to spend`
      : `${outputLabelTok} to receive`;
  const amountSuffix = swapType === "exact_in" ? inputLabelTok : outputLabelTok;
  const quoteLabel =
    swapType === "exact_in" ? "You receive" : "You need to send";
  const quoteSuffix = swapType === "exact_in" ? outputLabelTok : inputLabelTok;

  return (
    <>
      <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
        <motion.div
          className="absolute inset-0 bg-black/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={step !== "loading" ? onClose : undefined}
        />
        <motion.div
          className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-md shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]"
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)`,
            }}
          />
          <div className="overflow-y-auto flex-1 overscroll-contain px-3 pt-3 pb-2 sm:px-6 sm:pt-5">
            <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-3 sm:mb-4 sm:hidden" />

            {step === "input" && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <div className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02]">
                  <div
                    className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xs sm:text-base font-black"
                    style={{
                      background: `${accentColor}1A`,
                      color: accentColor,
                    }}
                  >
                    {section === "buy" ? "↑$" : "$↑"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                      <p className="font-black text-[10px] sm:text-sm text-white truncate">
                        {pool.poolName || "Anonymous Pool"}
                      </p>
                      {trustChecked && isTrusted && (
                        <span className="px-1.5 py-0.5 sm:px-2 rounded-full text-[7px] sm:text-[9px] font-black border border-green-500/30 bg-green-500/10 text-green-400 flex-shrink-0">
                          ✓ Trusted
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[7px] sm:text-[9px] text-white/40 truncate mt-0.5">
                      {pool.poolAddress.slice(0, 18)}…
                      {pool.poolAddress.slice(-6)}
                    </p>
                  </div>
                </div>

                <div className="flex items-stretch gap-2 sm:gap-3">
                  {section === "buy" ? (
                    <>
                      <div className="flex-1 min-w-0">
                        <label className="text-[7px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black block mb-1 sm:mb-1.5">
                          NGN to Send
                        </label>
                        <TokenPills
                          options={["NGNS", "CNGN"]}
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
                          options={["USDT", "USDC"]}
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
                          options={["USDT", "USDC"]}
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
                          options={["NGNS", "CNGN"]}
                          value={ngnToken}
                          onChange={setNgnToken}
                          accentColor={accentColor}
                        />
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-1.5 sm:gap-2 p-0.5 sm:p-1 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                  {[
                    { id: "exact_in", label: "Exact Input" },
                    { id: "exact_out", label: "Exact Output" },
                  ].map(({ id, label }) => (
                    <button
                      key={id}
                      onClick={() => {
                        setSwapType(id);
                        setAmountDisplay("");
                        setAmountRaw(0);
                        setQuote(null);
                      }}
                      className={`flex-1 py-1.5 sm:py-2 rounded-lg text-[7px] sm:text-[10px] font-black uppercase tracking-widest transition-all ${swapType === id ? "bg-white/10 text-white shadow-sm" : "text-white/30 hover:text-white/50"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                  <div
                    className={`px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl border ${userCantAfford ? "border-red-500/30 bg-red-500/5" : "border-white/[0.06] bg-white/[0.02]"}`}
                  >
                    <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
                      Your Balance
                    </p>
                    {userBalLoading ? (
                      <span className="w-2 h-2 sm:w-3 sm:h-3 border border-white/20 border-t-white/60 rounded-full animate-spin inline-block" />
                    ) : (
                      <p
                        className={`text-[9px] sm:text-xs font-black truncate ${userCantAfford ? "text-red-400" : "text-white"}`}
                      >
                        {userSendBal !== null ? fmt(userSendBal) : "—"}{" "}
                        <span className="text-white/40 font-normal text-[7px] sm:text-[9px]">
                          {inputLabelTok}
                        </span>
                      </p>
                    )}
                  </div>
                  <div
                    className={`px-2 py-1.5 sm:px-3 sm:py-2.5 rounded-xl border ${poolEmpty || poolCantCover ? "border-red-500/30 bg-red-500/5" : "border-white/[0.06] bg-white/[0.02]"}`}
                  >
                    <p className="text-[6px] sm:text-[8px] uppercase tracking-widest text-white/30 font-black mb-0.5">
                      Pool Has
                    </p>
                    <p
                      className={`text-[9px] sm:text-xs font-black truncate ${poolEmpty || poolCantCover ? "text-red-400" : "text-white"}`}
                    >
                      {fmt(poolReceiveBal)}{" "}
                      <span className="text-white/40 font-normal text-[7px] sm:text-[9px]">
                        {outputLabelTok}
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
                      ? `⚠ Pool has no ${outputLabelTok} liquidity`
                      : `⚠ Pool only has ${fmt(poolReceiveBal)} ${outputLabelTok}`}
                  </p>
                )}

                <div>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {amountLabel}
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
                        setAmountRaw(parseFloat(f.replace(/,/g, "")) || 0);
                      }}
                      className="w-full p-3 sm:p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-500 outline-none text-sm sm:text-xl font-black text-white transition-all pr-16 sm:pr-20"
                    />
                    <span
                      className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 font-black text-[10px] sm:text-sm"
                      style={{ color: accentColor }}
                    >
                      {amountSuffix}
                    </span>
                  </div>
                </div>

                {(quote !== null || quoteLoading) && amountRaw > 0 && (
                  <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {quoteLabel}
                    </span>
                    {quoteLoading ? (
                      <span className="w-4 h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                    ) : (
                      <span
                        className="font-black text-sm"
                        style={{ color: accentColor }}
                      >
                        {quote !== null ? fmt(quote) : "—"} {quoteSuffix}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between p-2.5 sm:p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Exchange Rate
                  </span>
                  <span className="font-black text-[9px] sm:text-sm text-white">
                    ₦{fmt(rate)}
                    <span className="text-white/60 font-normal text-[8px] sm:text-xs">
                      {" "}
                      / USD
                    </span>
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                    <label className="text-[7px] sm:text-[10px] uppercase tracking-widest text-white/60 font-black">
                      Receiver
                    </label>
                    {receiverRaw !== defaultReceiver && (
                      <button
                        onClick={() => {
                          setReceiverRaw(defaultReceiver);
                          setReceiverInputType("address");
                          setReceiverResolved(defaultReceiver);
                          setReceiverError("");
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
                          ? "border-red-500/60"
                          : receiverInputType === "fullname" &&
                              receiverResolved &&
                              receiverConfirmed
                            ? "border-green-500/40"
                            : receiverInputType === "fullname" &&
                                receiverResolved &&
                                !receiverConfirmed
                              ? "border-yellow-500/40"
                              : "border-white/10 focus:border-blue-500"
                      }`}
                    />
                    {receiverResolving && (
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 border border-white/20 border-t-white/60 rounded-full animate-spin" />
                    )}
                  </div>
                  {receiverError && (
                    <p className="text-[7px] sm:text-[10px] text-red-400 font-bold mt-1 sm:mt-1.5">
                      ⚠ {receiverError}
                    </p>
                  )}
                  {receiverInputType === "fullname" &&
                    receiverResolved &&
                    !receiverConfirmed &&
                    !receiverError && (
                      <button
                        onClick={() => setShowReceiverConfirm(true)}
                        className="text-[10px] text-yellow-400 underline underline-offset-2 mt-1.5"
                      >
                        ⚠ Tap to confirm recipient
                      </button>
                    )}
                  {receiverInputType === "fullname" &&
                    receiverResolved &&
                    receiverConfirmed && (
                      <p className="text-[10px] text-green-400 font-bold mt-1.5">
                        ✓ Confirmed → {receiverResolved.slice(0, 10)}…
                        {receiverResolved.slice(-8)}
                      </p>
                    )}
                </div>
              </motion.div>
            )}

            {step === "loading" && (
              <div className="text-center py-9 sm:py-14">
                <div className="relative w-10 h-10 sm:w-14 sm:h-14 mx-auto mb-4 sm:mb-6">
                  <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
                  <div className="absolute inset-0 rounded-full border-2 border-t-blue-500 animate-spin" />
                  <div className="absolute inset-2 rounded-full bg-blue-500/10 flex items-center justify-center">
                    <span className="text-blue-400 text-[9px] sm:text-sm font-black">
                      ₦
                    </span>
                  </div>
                </div>
                <p className="font-black text-sm sm:text-lg text-white">
                  Executing swap…
                </p>
                <p className="text-[9px] sm:text-xs text-white/60 mt-1.5 sm:mt-2">
                  Broadcasting via your BNB Safe. Please wait.
                </p>
              </div>
            )}

            {step === "done" && (
              <div className="text-center py-5 sm:py-8">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                  className="w-11 h-11 sm:w-16 sm:h-16 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3.5 sm:mb-5"
                >
                  <span className="text-xl sm:text-3xl">🎉</span>
                </motion.div>
                <h3 className="text-sm sm:text-xl font-black mb-1 text-white">
                  Swap Complete!
                </h3>
                {receivedAmount !== null && (
                  <p className="text-[9px] sm:text-sm text-white/60 mb-3 sm:mb-4">
                    You received{" "}
                    <span className="font-black text-white">
                      {fmt(receivedAmount)}
                    </span>{" "}
                    <span className="font-black" style={{ color: accentColor }}>
                      {outputLabelTok}
                    </span>
                  </p>
                )}
                {receipt?.blockHash && (
                  <a
                    href={`${EXPLORER_TX_BASE}${receipt.blockHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-[8px] sm:text-[11px] font-mono break-all text-blue-400 underline underline-offset-2 hover:text-blue-400/80 transition-colors mb-2"
                  >
                    View on Explorer ↗
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="w-full mt-3.5 sm:mt-5 py-2.5 sm:py-3.5 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {step === "input" && (
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
                    userCantAfford ||
                    poolCantCover ||
                    poolEmpty ||
                    userBalLoading ||
                    !!receiverError ||
                    receiverResolving ||
                    (receiverInputType === "fullname" && !receiverResolved) ||
                    (receiverInputType === "fullname" &&
                      receiverResolved &&
                      !receiverConfirmed) ||
                    receiverInputType === "invalid"
                  }
                  className="flex-1 py-2.5 sm:py-3.5 rounded-xl font-black text-xs sm:text-sm disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
                  style={{
                    background: accentColor,
                    color: "#fff",
                    boxShadow: `0 8px 24px ${accentColor}33`,
                  }}
                >
                  {!trustChecked ? "Checking…" : "Continue →"}
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
              transition={{ type: "spring", stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="p-5 sm:p-7 text-center">
                <div className="w-10 h-10 sm:w-14 sm:h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <span className="text-base sm:text-2xl">🔍</span>
                </div>
                <h3 className="text-sm sm:text-lg font-black text-white mb-1">
                  Confirm Recipient
                </h3>
                <p className="text-[8px] sm:text-[11px] text-white/50 mb-3.5 sm:mb-5 leading-relaxed">
                  SNS resolved successfully. Verify this is the correct
                  recipient before swapping.
                </p>
                <div className="p-2.5 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] mb-2 text-left space-y-2 sm:space-y-3">
                  <div>
                    <p className="text-[6px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black mb-1">
                      SNS Name
                    </p>
                    <p className="font-black text-blue-400 text-[9px] sm:text-sm">
                      {receiverRaw}
                    </p>
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
                <div className="flex gap-2 sm:gap-3 mt-4">
                  <button
                    onClick={() => setShowReceiverConfirm(false)}
                    className="flex-1 py-2 sm:py-3 rounded-xl border border-white/10 text-white/60 font-bold text-xs sm:text-sm hover:bg-white/5 transition-all"
                  >
                    Go Back
                  </button>
                  <button
                    onClick={() => {
                      setReceiverConfirmed(true);
                      setShowReceiverConfirm(false);
                    }}
                    className="flex-1 py-2 sm:py-3 rounded-xl bg-blue-500 text-white font-black text-xs sm:text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
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
            tokenLabel={inputLabelTok}
            onTrust={() => {
              pendingTrustRef.current = true;
              setShowTrust(false);
              fetchFeeForPin(true);
              setPinVisible(true);
            }}
            onSkip={() => {
              pendingTrustRef.current = false;
              setShowTrust(false);
              fetchFeeForPin(false);
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
            subtitle="Enter your PIN to authorize this transaction via your BNB Safe"
            onConfirm={handlePinConfirm}
            onCancel={() => setPinVisible(false)}
            loading={pinLoading}
            feeInfo={swapFee}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ── Pool Card ────────────────────────────────────────────────────────────
const PoolCard = ({ pool, section, onSwap, index }) => {
  const rate = section === "buy" ? pool.buyRate : pool.sellRate;
  const accentColor = section === "buy" ? "#3b82f6" : "#22c55e";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-white/[0.14] transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-2.5 sm:p-3.5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="min-w-0">
            <p className="font-black text-sm text-white truncate">
              {pool.poolName || "Anonymous Pool"}
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
            {section === "buy" ? "GET USD" : "GET NGN"}
          </div>
        </div>
        <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06] mb-3">
          <p className="text-[9px] uppercase tracking-[0.3em] text-white/60 font-black">
            Rate
          </p>
          <span className="font-black text-sm text-white">
            ₦{fmt(rate)}
            <span className="text-[10px] text-white/40 font-normal">/USD</span>
          </span>
        </div>
        {section === "buy" ? (
          <div className="flex flex-col gap-1.5 mb-4">
            {parseFloat(pool.usdtLiquidity) > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  USDT
                </p>
                <span className="font-black text-sm text-white">
                  {fmt(pool.usdtLiquidity)}
                </span>
              </div>
            )}
            {parseFloat(pool.usdcLiquidity) > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  USDC
                </p>
                <span className="font-black text-sm text-white">
                  {fmt(pool.usdcLiquidity)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 mb-4">
            {parseFloat(pool.ngnsLiquidity) > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  NGNs
                </p>
                <span className="font-black text-sm text-white">
                  {fmt(pool.ngnsLiquidity)}
                </span>
              </div>
            )}
            {parseFloat(pool.cNgnLiquidity) > 0 && (
              <div className="flex items-center justify-between px-2 py-1.5 sm:px-3 sm:py-2 rounded-xl bg-white/[0.04] border border-white/[0.06]">
                <p className="text-[9px] uppercase tracking-[0.3em] text-white/50 font-black">
                  cNGN
                </p>
                <span className="font-black text-sm text-white">
                  {fmt(pool.cNgnLiquidity)}
                </span>
              </div>
            )}
          </div>
        )}
        <button
          onClick={() => onSwap(pool)}
          className="w-full py-2.5 sm:py-3.5 rounded-xl font-black text-[9px] sm:text-xs uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.98]"
          style={{
            background: accentColor,
            color: "#fff",
            boxShadow: `0 4px 16px ${accentColor}33`,
          }}
        >
          Proceed to Swap →
        </button>
      </div>
    </motion.div>
  );
};

// ── Main BNBSwapTab ───────────────────────────────────────────────────────
const BNBSwapTab = ({ user, showMsg }) => {
  const [section, setSection] = useState("buy");
  const [buyPools, setBuyPools] = useState(_poolsCache.buyPools || []);
  const [sellPools, setSellPools] = useState(_poolsCache.sellPools || []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(_poolsCache.buyPools === null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastTime, setLastTime] = useState(_poolsCache.lastTime);
  const [selected, setSelected] = useState(null);
  const pollRef = useRef(null);

  const [searchPool, setSearchPool] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");

  // Auto-list of subscribed pools — polled every 60s.
  const fetchPools = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/all-pools/${CHAIN}`);
      const data = await res.json();
      const rawPools = data.pools || [];
      const hydrated = (
        await Promise.all(rawPools.map((p) => hydratePool(p).catch(() => null)))
      ).filter(Boolean);
      const buys = hydrated
        .filter(
          (p) =>
            (parseFloat(p.usdtLiquidity) > 0 ||
              parseFloat(p.usdcLiquidity) > 0) &&
            parseFloat(p.buyRate) > 0,
        )
        .sort((a, b) => parseFloat(a.buyRate) - parseFloat(b.buyRate));
      const sells = hydrated
        .filter(
          (p) =>
            (parseFloat(p.ngnsLiquidity) > 0 ||
              parseFloat(p.cNgnLiquidity) > 0) &&
            parseFloat(p.sellRate) > 0,
        )
        .sort((a, b) => parseFloat(b.sellRate) - parseFloat(a.sellRate));
      setBuyPools(buys);
      setSellPools(sells);
      setLastTime(new Date());
      _poolsCache.buyPools = buys;
      _poolsCache.sellPools = sells;
      _poolsCache.lastTime = new Date();
    } catch {
      /* keep existing */
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPools(_poolsCache.buyPools !== null);
    pollRef.current = setInterval(() => fetchPools(true), POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [fetchPools]);

  // Search — resolves a full name (name@wallet) or 0x address to a single pool.
  useEffect(() => {
    if (!search.trim()) {
      setSearchPool(null);
      setSearchError("");
      return;
    }
    const type = detectSearchType(search);
    if (type === "invalid") {
      setSearchPool(null);
      setSearchError("Enter a full name (name@namespace) or a 0x address");
      return;
    }
    setSearchError("");
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const addr = await resolveFullNameOrAddress(search);
        const sRes = await fetch(
          `${SALVA_API_URL}/api/user/swap/single-pool/${addr}/${CHAIN}`,
        );
        const sData = await sRes.json();
        if (!sRes.ok || !sData.status || !sData.pool)
          throw new Error("Pool not found");
        const hydrated = await hydratePool(sData.pool);
        setSearchPool(hydrated);
      } catch (err) {
        setSearchPool(null);
        setSearchError(err.message || "Pool not found");
      } finally {
        setSearchLoading(false);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [search]);

  const isSearching = !!search.trim();
  const activePools = isSearching
    ? searchPool
      ? section === "buy"
        ? (parseFloat(searchPool.usdtLiquidity) > 0 ||
            parseFloat(searchPool.usdcLiquidity) > 0) &&
          parseFloat(searchPool.buyRate) > 0
          ? [searchPool]
          : []
        : (parseFloat(searchPool.ngnsLiquidity) > 0 ||
              parseFloat(searchPool.cNgnLiquidity) > 0) &&
            parseFloat(searchPool.sellRate) > 0
          ? [searchPool]
          : []
      : []
    : section === "buy"
      ? buyPools
      : sellPools;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-3.5 sm:space-y-5 relative"
    >
      <div className="flex items-start justify-between gap-3 sm:gap-4">
        <div>
          <h2 className="text-sm sm:text-xl font-black tracking-tight">
            Liquidity Marketplace
          </h2>
          <p className="text-[7px] sm:text-[10px] text-white/40 font-bold uppercase tracking-widest mt-0.5">
            BNB Chain
          </p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 mt-1">
          <a
            href="/dashboard"
            className="flex items-center gap-0.5 sm:gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-salvaGold/30 bg-salvaGold/[0.07] hover:bg-salvaGold/[0.14] hover:border-salvaGold/50 transition-all"
          >
            <span className="text-[6px] sm:text-[8px] font-black uppercase tracking-widest text-salvaGold">
              Base
            </span>
            <span className="text-blue-500 text-[6px] sm:text-[9px]">↗</span>
          </a>
          {lastTime && (
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest hidden sm:block">
              {lastTime.toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={() => fetchPools(true)}
            disabled={refreshing}
            className="w-7 h-7 sm:w-10 sm:h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-blue-500/30 transition-all"
          >
            {refreshing ? (
              <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
            ) : (
              <span className="text-blue-400 text-xs sm:text-lg leading-none">
                ↻
              </span>
            )}
          </button>
        </div>
      </div>

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
          placeholder="Search by full name (name@namespace) or 0x address…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-8 sm:pl-11 pr-8 sm:pr-10 py-2.5 sm:py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] sm:text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-blue-500/30 transition-all"
        />
        {searchLoading && (
          <span className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-3 h-3 border border-white/20 border-t-blue-500 rounded-full animate-spin" />
        )}
        {!searchLoading && search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-white/60 hover:text-white/80 transition-colors text-[9px] sm:text-xs font-black"
          >
            ✕
          </button>
        )}
      </div>
      {isSearching && searchError && (
        <p className="text-[10px] text-red-400 font-bold -mt-2">
          ⚠ {searchError}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {[
          {
            id: "buy",
            label: "NGN → USD",
            sub: "Spend NGN, get USD",
            count: buyPools.length,
            color: "#3b82f6",
          },
          {
            id: "sell",
            label: "USD → NGN",
            sub: "Spend USD, get NGN",
            count: sellPools.length,
            color: "#22c55e",
          },
        ].map(({ id, label, sub, count, color }) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`py-2.5 px-3 sm:py-4 sm:px-4 rounded-2xl border transition-all text-left ${section === id ? "border-transparent" : "border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]"}`}
            style={
              section === id
                ? { background: `${color}18`, borderColor: `${color}40` }
                : {}
            }
          >
            <div className="flex items-center justify-between mb-0.5">
              <span
                className="font-black text-[10px] sm:text-sm"
                style={{
                  color: section === id ? color : "rgba(255,255,255,0.85)",
                }}
              >
                {label}
              </span>
              {!isSearching && (
                <span
                  className="text-[7px] sm:text-[9px] font-black px-1 py-0.5 sm:px-1.5 rounded-md"
                  style={
                    section === id
                      ? { background: `${color}20`, color }
                      : {
                          background: "rgba(255,255,255,0.07)",
                          color: "rgba(255,255,255,0.5)",
                        }
                  }
                >
                  {count}
                </span>
              )}
            </div>
            <p className="text-[7px] sm:text-[10px] text-white/60">{sub}</p>
          </button>
        ))}
      </div>

      {loading && !isSearching ? (
        <div className="flex justify-center py-14 sm:py-20">
          <div className="w-6 h-6 sm:w-8 sm:h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
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
            {isSearching
              ? "No matching pool for this section."
              : "No active pools in this section."}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2 sm:space-y-3">
          {activePools.map((pool, i) => (
            <PoolCard
              key={pool.poolAddress}
              pool={pool}
              section={section}
              onSwap={setSelected}
              index={i}
            />
          ))}
        </div>
      )}

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

export default BNBSwapTab;
