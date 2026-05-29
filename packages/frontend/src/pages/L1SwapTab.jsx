// src/pages/L1SwapTab.jsx
/* eslint-env browser, es2020 */
/* global BigInt */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { SALVA_API_URL } from '../config';
import { useWallet, waitWithTimeout } from '../hooks/useWallet';
import { WalletGate, SwitchChainBanner, NoWalletCard } from '../components/WalletGate';

const POLL_MS = 60_000;

const fmt = (n, d = 2) =>
  parseFloat(n || 0).toLocaleString('en-US', {
    minimumFractionDigits: d,
    maximumFractionDigits: 2,
  });

const fmtInput = (raw) => {
  const d = raw.replace(/[^0-9.]/g, '');
  const p = d.split('.');
  p[0] = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return p.length > 1 ? p[0] + '.' + p[1] : p[0];
};

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

const POOL_VIEW_ABI = [
  'function getMinuimumNgnAmount() external view returns (uint256)',
  'function getMinuimumUSDAmount() external view returns (uint256)',
];

const POOL_ABI = [
  'function swapExactNGNAmountForUSD(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _ngnAmountIn) external returns (bool)',
  'function swapExactUSDAmountForNGN(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _usdAmountIn) external returns (bool)',
  'function swapForExactUSDAmount(address _receiver, address _usdTokenOut, address _ngnTokenIn, uint256 _usdAmountOut) external returns (bool)',
  'function swapForExactNGNAmount(address _receiver, address _usdTokenIn, address _ngnTokenOut, uint256 _ngnAmountOut) external returns (bool)',
];

// ── Token Pills ───────────────────────────────────────────────────────────────
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

// ── Trust Modal ───────────────────────────────────────────────────────────────
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
      <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
      <div className="p-8">
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🔓</span>
          </div>
          <h3 className="text-xl font-black text-white mb-1">Approve {tokenLabel}?</h3>
          <p className="text-xs text-white/60">
            <span className="text-blue-400 font-black">
              {pool.poolName || `${pool.poolAddress.slice(0, 12)}…`}
            </span>
          </p>
        </div>
        <div className="space-y-3 mb-6">
          <div className="p-4 rounded-xl bg-green-500/5 border border-green-500/20">
            <p className="text-xs font-black text-green-400 mb-1">
              ✅ Exact amount only — Recommended
            </p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Approve only what's needed now. You'll be asked again next swap.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
            <p className="text-xs font-black text-yellow-400 mb-1">
              ⚠️ Unlimited — Use with caution
            </p>
            <p className="text-[11px] text-white/60 leading-relaxed">
              Sign once, skip approvals forever. Grants full spending access to this pool.
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
            Exact
          </button>
          <button
            onClick={onTrust}
            className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
          >
            Unlimited
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

// ── Step indicator shown during tx ───────────────────────────────────────────
const TxStepRow = ({ active, done, label, sub }) => (
  <div
    className={`flex items-center gap-3 p-3 rounded-xl transition-all ${active ? 'bg-blue-500/10 border border-blue-500/20' : done ? 'opacity-50' : 'opacity-30'}`}
  >
    <div
      className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500' : active ? 'bg-blue-500' : 'bg-white/10'}`}
    >
      {done ? (
        <span className="text-[10px] text-white">✓</span>
      ) : active ? (
        <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin block" />
      ) : (
        <span className="w-2 h-2 rounded-full bg-white/30 block" />
      )}
    </div>
    <div>
      <p className="text-xs font-black text-white">{label}</p>
      {sub && <p className="text-[10px] text-white/60 mt-0.5">{sub}</p>}
    </div>
  </div>
);

// ── Swap Modal ────────────────────────────────────────────────────────────────
const L1SwapModal = ({ pool, section, wallet, l1Config, onClose, showMsg, onSwapComplete }) => {
  const [swapType, setSwapType] = useState('exact_in');
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amountRaw, setAmountRaw] = useState(0);
  const [stableToken, setStableToken] = useState(
    parseFloat(pool.usdtLiquidity || 0) > 0 ? 'USDT' : 'USDC'
  );
  const [ngnToken, setNgnToken] = useState(
    parseFloat(pool.ngnsLiquidity || 0) > 0 ? 'NGNS' : 'CNGN'
  );
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [isTrusted, setIsTrusted] = useState(false);
  const [trustChecked, setTrustChecked] = useState(false);
  const [showTrust, setShowTrust] = useState(false);

  // ── Granular step state (never gets stuck) ────────────────────────────────
  // steps: idle | checking_allowance | approving | waiting_approve |
  //        swapping | waiting_swap | done | error
  const [step, setStep] = useState('idle');
  const [stepMsg, setStepMsg] = useState('');
  const [txHash, setTxHash] = useState(null);
  const [receivedAmount, setReceivedAmount] = useState(null);
  const [receivedToken, setReceivedToken] = useState(null);
  const [swapError, setSwapError] = useState(null);

  const quoteTimer = useRef(null);
  const l1Account = wallet.account;

  const accentColor = section === 'buy' ? '#D4AF37' : '#22c55e';
  const ngnLabel = ngnToken === 'CNGN' ? 'cNGN' : 'NGNs';
  const tokenIn = section === 'buy' ? ngnToken : stableToken;
  const tokenOut = section === 'buy' ? stableToken : ngnLabel;

  const [onChainMinNgn, setOnChainMinNgn] = useState(parseFloat(pool.minNgnAmount || 0));
  const [onChainMinUsd, setOnChainMinUsd] = useState(parseFloat(pool.minTokenAmount || 0));
  const [minsLoaded, setMinsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchMins = async () => {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const poolC = new ethers.Contract(
          ethers.getAddress(pool.poolAddress),
          POOL_VIEW_ABI,
          provider
        );
        const [rawNgn, rawUsd] = await Promise.all([
          poolC.getMinuimumNgnAmount(),
          poolC.getMinuimumUSDAmount(),
        ]);
        if (!cancelled) {
          setOnChainMinNgn(Number(rawNgn) / 1e6);
          setOnChainMinUsd(Number(rawUsd) / 1e6);
          setMinsLoaded(true);
        }
      } catch {
        if (!cancelled) setMinsLoaded(true); // use fallback values already set
      }
    };
    fetchMins();
    return () => {
      cancelled = true;
    };
  }, [pool.poolAddress]);

  const minAmount = section === 'buy' ? onChainMinNgn : onChainMinUsd;
  const isBelowMin =
    swapType === 'exact_in' && amountRaw > 0 && minAmount > 0 && amountRaw < minAmount;
  const displayRate =
    section === 'buy' ? parseFloat(pool.buyRate || 0) : parseFloat(pool.sellRate || 0);

  const swapFn = (() => {
    if (section === 'buy')
      return swapType === 'exact_in' ? 'swapExactNGNAmountForUSD' : 'swapForExactUSDAmount';
    return swapType === 'exact_in' ? 'swapExactUSDAmountForNGN' : 'swapForExactNGNAmount';
  })();

  const resolveTokenAddress = (sym) => {
    if (!l1Config) return null;
    switch (sym.toUpperCase()) {
      case 'NGNS':
        return l1Config.ngnsTokenAddress;
      case 'CNGN':
        return l1Config.cngnContractAddress;
      case 'USDT':
        return l1Config.usdtContractAddress;
      case 'USDC':
        return l1Config.usdcContractAddress;
      default:
        return null;
    }
  };

  // ── User balances ─────────────────────────────────────────────────────────
  const [userBal, setUserBal] = useState({});
  const [userBalLoading, setUserBalLoading] = useState(true);

  useEffect(() => {
    if (!l1Account) return;
    setUserBalLoading(true);
    fetch(`${SALVA_API_URL}/api/l1-balance/${l1Account}`)
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
  }, [l1Account]);

  // ── Trust check ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!l1Account) return;
    setTrustChecked(false);
    const sym = tokenIn === 'NGNS' ? 'NGN' : tokenIn;
    fetch(
      `${SALVA_API_URL}/api/pool/l1/trust-status?userSafeAddress=${l1Account}&poolAddress=${pool.poolAddress}&tokenSymbol=${sym}`
    )
      .then((r) => r.json())
      .then((d) => {
        setIsTrusted(!!d.trusted);
        setTrustChecked(true);
      })
      .catch(() => setTrustChecked(true));
  }, [pool.poolAddress, tokenIn, l1Account]);

  // ── Quote ─────────────────────────────────────────────────────────────────
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
            isL1: true,
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
  const userSendBal = userBal[tokenIn] ?? null;
  const poolReceiveBal =
    tokenOut === 'USDT'
      ? parseFloat(pool.usdtLiquidity || 0)
      : tokenOut === 'USDC'
        ? parseFloat(pool.usdcLiquidity || 0)
        : tokenOut === 'cNGN'
          ? parseFloat(pool.cNgnLiquidity || 0)
          : parseFloat(pool.ngnsLiquidity || 0);

  const userCantAfford = userSendBal !== null && sendAmt > 0 && userSendBal < sendAmt;
  const poolCantCover = receiveAmt > 0 && poolReceiveBal < receiveAmt;
  const poolEmpty = poolReceiveBal <= 0;

  const canProceed =
    amountRaw > 0 &&
    minsLoaded &&
    !isBelowMin &&
    trustChecked &&
    !userCantAfford &&
    !poolCantCover &&
    !poolEmpty &&
    !userBalLoading &&
    step === 'idle';

  // ── Core swap executor — runs ONCE per user intent ────────────────────────
  const executeSwap = async (doApproveMax) => {
    if (!l1Config) {
      showMsg('Config not loaded — please refresh', 'error');
      return;
    }

    setSwapError(null);
    setStep('checking_allowance');

    try {
      // Get signer from hook — already cached, won't re-prompt
      const signer = await wallet.getSigner();

      const tokenInAddr = resolveTokenAddress(tokenIn);
      const ngnAddr = resolveTokenAddress('NGNS');
      const stableAddr = resolveTokenAddress(stableToken);

      if (!tokenInAddr) throw new Error(`Token address not found for ${tokenIn}`);
      if (!ngnAddr) throw new Error('NGN token address not found');
      if (!stableAddr) throw new Error(`${stableToken} address not found`);

      const poolAddr = ethers.getAddress(pool.poolAddress);
      const tokenContract = new ethers.Contract(ethers.getAddress(tokenInAddr), ERC20_ABI, signer);

      // ── Step 1: Approve (only if needed) ─────────────────────────────────
      const neededWei = BigInt(
        swapType === 'exact_out' && quote
          ? Math.floor(parseFloat(quote) * 1e6).toString()
          : amountWei
      );
      let approvedAlready = isTrusted;
      if (!isTrusted) {
        setStep('approving');
        setStepMsg(
          doApproveMax
            ? 'Approve unlimited spending in your wallet…'
            : 'Approve exact amount in your wallet…'
        );

        const approveAmt = doApproveMax ? ethers.MaxUint256 : neededWei;
        const approveTx = await tokenContract.approve(poolAddr, approveAmt, { gasLimit: 60_000 });

        setStep('waiting_approve');
        setStepMsg('Waiting for approval to confirm on-chain…');

        await waitWithTimeout(approveTx, 1, 90_000);

        if (doApproveMax) {
          const sym = tokenIn === 'NGNS' ? 'NGN' : tokenIn;
          fetch(`${SALVA_API_URL}/api/pool/l1/trust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userSafeAddress: l1Account,
              poolAddress: pool.poolAddress,
              tokenSymbol: sym,
              txHash: approveTx.hash,
            }),
          }).catch(() => {});
          setIsTrusted(true);
        }
      }

      // ── Step 2: Swap ──────────────────────────────────────────────────────
      setStep('swapping');
      setStepMsg('Confirm the swap in your wallet…');

      const poolContract = new ethers.Contract(poolAddr, POOL_ABI, signer);
      const receiver = ethers.getAddress(l1Account);
      const amtBn = BigInt(amountWei);
      const swapArgs = [receiver, ethers.getAddress(stableAddr), ethers.getAddress(ngnAddr), amtBn];

      // Single wallet prompt — user signs once here
      let swapTx;
      switch (swapFn) {
        case 'swapExactNGNAmountForUSD':
          swapTx = await poolContract.swapExactNGNAmountForUSD(...swapArgs, {
            gasLimit: 200_000,
          });
          break;
        case 'swapExactUSDAmountForNGN':
          swapTx = await poolContract.swapExactUSDAmountForNGN(...swapArgs, {
            gasLimit: 200_000,
          });
          break;
        case 'swapForExactUSDAmount':
          swapTx = await poolContract.swapForExactTokenAmount(...swapArgs, { gasLimit: 200_000 });
          break;
        case 'swapForExactNGNAmount':
          swapTx = await poolContract.swapForExactNGNAmount(...swapArgs, { gasLimit: 200_000 });
          break;
        default:
          throw new Error(`Unknown swapFn: ${swapFn}`);
      }

      setStep('waiting_swap');
      setTxHash(swapTx.hash);
      setStepMsg('Waiting for swap to confirm on-chain…');

      await waitWithTimeout(swapTx, 1, 120_000);

      const outAmt = swapType === 'exact_in' && quote !== null ? parseFloat(quote) : amountRaw;
      setReceivedAmount(outAmt);
      setReceivedToken(tokenOut);
      setStep('done');
      onSwapComplete?.();
    } catch (err) {
      console.error('L1 swap error:', err);
      wallet.bustCache();

      // User rejected → go back to input, not an "error" screen
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setStep('idle');
        showMsg('Transaction cancelled.', 'info');
        return;
      }

      setSwapError('Swap could not be completed. Please try again.');
      setStep('error');
    }
  };

  const handleContinue = () => {
    if (!canProceed) return;
    if (!isTrusted) {
      setShowTrust(true);
      return;
    }
    executeSwap(false);
  };

  const isProcessing = [
    'checking_allowance',
    'approving',
    'waiting_approve',
    'swapping',
    'waiting_swap',
  ].includes(step);

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
          onClick={isProcessing ? undefined : onClose}
        />
        <motion.div
          className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-md shadow-2xl overflow-hidden"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="h-px"
            style={{
              background: `linear-gradient(90deg, transparent, ${accentColor}66, transparent)`,
            }}
          />
          <div className="p-6 sm:p-8">
            <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

            {/* ── INPUT ── */}
            {step === 'idle' && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
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
                        Approved ✓
                      </span>
                    )}
                  </div>
                  <h3 className="text-xl font-black text-white">
                    {pool.poolName || 'Anonymous Pool'}
                  </h3>
                  <p className="font-mono text-[10px] text-white/50 truncate mt-0.5">
                    {pool.poolAddress}
                  </p>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    USD Stablecoin
                  </label>
                  <TokenPills
                    options={['USDT', 'USDC']}
                    value={stableToken}
                    onChange={setStableToken}
                    accentColor={accentColor}
                  />
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                    Naira Stablecoin
                  </label>
                  <TokenPills
                    options={['NGNS', 'CNGN']}
                    value={ngnToken}
                    onChange={setNgnToken}
                    accentColor={accentColor}
                  />
                </div>

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
                        className={`flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${swapType === id ? 'bg-white/10 border-white/20 text-white' : 'border-white/[0.06] bg-white/5 text-white/60 hover:text-white/70'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Flow indicator ── */}
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

                {/* ── Balances ── */}
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
                  <p className="text-[10px] text-red-400 font-bold -mt-2">⚠ Insufficient balance</p>
                )}
                {(poolEmpty || poolCantCover) && (
                  <p className="text-[10px] text-red-400 font-bold -mt-2">
                    {poolEmpty
                      ? `⚠ No ${section === 'buy' ? stableToken : ngnLabel} liquidity in pool`
                      : `⚠ Pool only has ${fmt(poolReceiveBal)} ${section === 'buy' ? stableToken : ngnLabel}`}
                  </p>
                )}

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
                      className={`w-full p-4 rounded-xl bg-white/5 border outline-none text-xl font-black text-white transition-all pr-20 ${isBelowMin ? 'border-red-500' : 'border-white/10 focus:border-blue-400'}`}
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

                {(quote !== null || quoteLoading) && amountRaw > 0 && (
                  <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                    <span className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                      {quoteLabel}
                    </span>
                    {quoteLoading ? (
                      <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
                    ) : (
                      <span className="font-black text-sm" style={{ color: accentColor }}>
                        {fmt(quote)} {quoteSuffix}
                      </span>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  <span className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Exchange Rate
                  </span>
                  <span className="font-black text-sm text-white">
                    ₦{fmt(displayRate, 0)}
                    <span className="text-white/60 font-normal text-xs"> / USD</span>
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
                  <p className="text-[10px] text-blue-400/80 font-bold leading-relaxed">
                    ⚡ Your wallet signs all transactions.
                    {!isTrusted && ' You may need to approve spending once before swapping.'}
                  </p>
                </div>

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!canProceed}
                    className="flex-1 py-3.5 rounded-xl font-black text-sm disabled:opacity-40 transition-all hover:brightness-110 active:scale-[0.98]"
                    style={{
                      background: accentColor,
                      color: '#000',
                      boxShadow: `0 8px 24px ${accentColor}33`,
                    }}
                  >
                    {!minsLoaded ? 'Loading…' : !trustChecked ? 'Checking…' : 'Continue →'}
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── PROCESSING (approval + swap steps) ── */}
            {isProcessing && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="py-6 space-y-5"
              >
                <div className="text-center mb-2">
                  <div className="relative w-14 h-14 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full border-2 border-blue-500/20" />
                    <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 animate-spin" />
                    <div className="absolute inset-2 rounded-full bg-blue-500/10 flex items-center justify-center">
                      <span className="text-blue-400 text-sm font-black">₦</span>
                    </div>
                  </div>
                  <p className="font-black text-lg text-white">Processing Swap</p>
                  <p className="text-xs text-white/60 mt-1 max-w-[260px] mx-auto leading-relaxed">
                    {stepMsg}
                  </p>
                </div>

                <div className="space-y-2">
                  <TxStepRow
                    active={['approving', 'waiting_approve'].includes(step)}
                    done={['swapping', 'waiting_swap'].includes(step)}
                    label="Approve Token Spending"
                    sub={
                      step === 'waiting_approve'
                        ? 'Confirming on-chain…'
                        : step === 'approving'
                          ? 'Check your wallet'
                          : isTrusted
                            ? 'Already approved'
                            : ''
                    }
                  />
                  <TxStepRow
                    active={['swapping', 'waiting_swap'].includes(step)}
                    done={false}
                    label="Execute Swap"
                    sub={
                      step === 'waiting_swap'
                        ? 'Confirming on-chain…'
                        : step === 'swapping'
                          ? 'Check your wallet'
                          : ''
                    }
                  />
                </div>

                {txHash && (
                  <a
                    href={`https://${process.env.NODE_ENV === 'production' ? '' : 'sepolia.'}etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="block text-[10px] font-black text-blue-400 underline break-all text-center"
                  >
                    Track on Etherscan ↗
                  </a>
                )}
              </motion.div>
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
                    href={`https://${process.env.NODE_ENV === 'production' ? '' : 'sepolia.'}etherscan.io/tx/${txHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] font-black underline break-all block mb-2 text-blue-400"
                  >
                    View on Etherscan ↗
                  </a>
                )}
                <button
                  onClick={onClose}
                  className="w-full mt-5 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── ERROR ── */}
            {step === 'error' && (
              <div className="text-center py-8">
                <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <span className="text-3xl">❌</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">Swap Failed</h3>
                <p className="text-xs text-red-400 mb-6 leading-relaxed max-w-[280px] mx-auto">
                  {swapError}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={onClose}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => {
                      setStep('idle');
                      setSwapError(null);
                    }}
                    className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 transition-all"
                  >
                    Try Again
                  </button>
                </div>
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
              setShowTrust(false);
              executeSwap(true);
            }}
            onSkip={() => {
              setShowTrust(false);
              executeSwap(false);
            }}
            onCancel={() => setShowTrust(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
};

// ── Pool Card ─────────────────────────────────────────────────────────────────
const L1PoolCard = ({ pool, section, onSwap, index }) => {
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

// ── Wallet status bar ─────────────────────────────────────────────────────────
const WalletBar = ({ wallet }) => {
  if (!wallet.isConnected) return null;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06]">
      <span className="w-1.5 h-1.5 rounded-full bg-green-400 block flex-shrink-0" />
      <span className="font-mono text-[10px] text-white/60 truncate flex-1">
        {wallet.account.slice(0, 8)}…{wallet.account.slice(-6)}
      </span>
      <span className="text-[9px] font-black uppercase tracking-widest text-white/40">
        {wallet.walletType || 'wallet'}
      </span>
    </div>
  );
};

// ── Main L1SwapTab ─────────────────────────────────────────────────────────────
const L1SwapTab = ({ l1Config, configLoading, showMsg }) => {
  const wallet = useWallet();

  const [section, setSection] = useState('buy');
  const [buyPools, setBuyPools] = useState([]);
  const [sellPools, setSellPools] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastTime, setLastTime] = useState(null);
  const [selected, setSelected] = useState(null);
  const pollRef = useRef(null);
  const [showNoWallet, setShowNoWallet] = useState(false);

  const fetchPools = useCallback(
    async (silent = false) => {
      silent ? setRefreshing(true) : setLoading(true);
      try {
        const q = search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
        const res = await fetch(`${SALVA_API_URL}/api/pool/l1/published${q}`);
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

  // Watch for wallet status going to no_wallet
  useEffect(() => {
    if (wallet.status === 'no_wallet') setShowNoWallet(true);
  }, [wallet.status]);

  const activePools = section === 'buy' ? buyPools : sellPools;
  const accentColor = section === 'buy' ? '#D4AF37' : '#22c55e';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-1">
            Salva V3 · Ethereum Chain
          </p>
          <h2 className="text-3xl font-black tracking-tight">Naira Exchange</h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0 mt-1">
          <a
            href="/dashboard"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-salvaGold/30 bg-salvaGold/[0.07] hover:bg-salvaGold/[0.14] transition-all"
          >
            <span className="text-[8px] font-black uppercase tracking-widest text-salvaGold">
              Base Chain
            </span>
            <span className="text-salvaGold text-[9px]">↗</span>
          </a>
          {lastTime && (
            <p className="text-[9px] text-white/60 font-bold uppercase tracking-widest hidden sm:block">
              {lastTime.toLocaleTimeString()}
            </p>
          )}
          <button
            onClick={() => fetchPools(true)}
            disabled={refreshing}
            className="w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-blue-400/30 transition-all"
          >
            {refreshing ? (
              <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
            ) : (
              <span className="text-blue-400 text-lg leading-none">↻</span>
            )}
          </button>
        </div>
      </div>

      {wallet.isConnected && wallet.wrongChain && (
        <SwitchChainBanner
          onSwitch={wallet.switchChain}
          chainName={process.env.NODE_ENV === 'production' ? 'Ethereum Mainnet' : 'Sepolia Testnet'}
        />
      )}

      {/* Info */}
      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15">
        <p className="text-[10px] text-blue-400/80 font-bold">
          ⚡ Your external wallet signs swap transactions directly.
        </p>
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
          className="w-full pl-11 pr-4 py-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-sm text-white placeholder:text-white/60 focus:outline-none focus:border-blue-400/30 transition-all"
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
            className={`py-4 px-4 rounded-2xl border transition-all text-left ${section === id ? 'border-transparent' : 'border-white/[0.06] bg-white/[0.03] hover:border-white/[0.12]'}`}
            style={section === id ? { background: `${color}18`, borderColor: `${color}40` } : {}}
          >
            <div className="flex items-center justify-between mb-0.5">
              <span
                className="font-black text-sm"
                style={{ color: section === id ? color : 'rgba(255,255,255,0.5)' }}
              >
                {label}
              </span>
              <span
                className="text-[9px] font-black px-1.5 py-0.5 rounded-md"
                style={
                  section === id
                    ? { background: `${color}20`, color }
                    : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.25)' }
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
          <div className="w-8 h-8 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
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
              className="mt-3 text-[10px] font-black text-blue-400/60 hover:text-blue-400 uppercase tracking-widest transition-colors"
            >
              Clear search
            </button>
          )}
        </motion.div>
      ) : (
        <div className="space-y-3">
          {activePools.map((pool, i) => (
            <L1PoolCard
              key={pool.poolAddress}
              pool={pool}
              section={section}
              onSwap={(p) => {
                if (!wallet.isConnected) {
                  showMsg('Connect your wallet first to swap.', 'error');
                  return;
                }
                if (wallet.wrongChain) {
                  showMsg('Switch to Ethereum Mainnet first.', 'error');
                  return;
                }
                setSelected(p);
              }}
              index={i}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {selected && wallet.isConnected && !wallet.wrongChain && (
          <L1SwapModal
            pool={selected}
            section={section}
            wallet={wallet}
            l1Config={l1Config}
            showMsg={showMsg}
            onClose={() => setSelected(null)}
            onSwapComplete={() => fetchPools(true)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default L1SwapTab;
