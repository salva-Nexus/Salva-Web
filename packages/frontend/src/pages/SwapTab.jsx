/* global BigInt */
// packages/frontend/src/pages/SwapTab.jsx
// Permissionless P2P market marketplace.
//  - Asset dropdown (from supported pairs) + symbol search + pool address / SNS search
//  - Listings read from utils/swapPoolCache.js (silent 10s poll, cache-first)
//  - "Proceed to swap": PIN gate -> live-priced swap card -> fee review -> execute

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowDown,
  BadgeCheck,
  Check,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { SALVA_API_URL, NODE_ENV } from '../config';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';
import PinModal from '../components/PinModal';
import { useOverlayLayer } from './Dashboard';
import { formatDisplayNumber, readWalletCache, fetchWalletSnapshot } from '../utils/walletCache';
import {
  DEFAULT_BUY_SYMBOL,
  SWAP_LIVE_POLL_INTERVAL_MS,
  SWAP_PAIRS_POLL_INTERVAL_MS,
  SWAP_POLL_INTERVAL_MS,
  buildAssetList,
  buildLogoIndex,
  classifyPoolInput,
  fetchListings,
  fetchLivePairListings,
  fetchSwapAssets,
  readListingsCache,
  readSwapAssetsCache,
  resolvePoolTarget,
  swapRequest,
  truncateDisplay,
} from '../utils/swapPoolCache';

/* ============================================================================
   CONSTANTS + HELPERS
============================================================================ */

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const DEFAULT_SLIPPAGE_PCT = '1';
const SLIPPAGE_PRESETS = ['0.1', '0.5', '1', '3'];
const MAX_SLIPPAGE_PCT = 50;

const LOCAL_LOGOS = { NGNS: ngnLogo, SANT: santLogo };

const getChain = () =>
  String(localStorage.getItem('salva_chain') || 'base')
    .trim()
    .toLowerCase();

const lc = (v) =>
  String(v ?? '')
    .trim()
    .toLowerCase();
const uc = (v) =>
  String(v ?? '')
    .trim()
    .toUpperCase();

const fmt = (value, max = 6) => formatDisplayNumber(value, max);

const fmtNgn = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n <= 0) return '₦0.00';
  if (n < 0.01) return '<₦0.01';
  const [i, d = ''] = n.toFixed(10).split('.');
  return `₦${Number(i).toLocaleString('en-US')}.${d.slice(0, 2)}`;
};

const shortAddr = (value) => (value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—');

const sanitizeAmount = (raw, maxDecimals = 18) => {
  const cleaned = String(raw ?? '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  let out = parts[0];
  if (parts.length > 1) out += `.${parts.slice(1).join('').slice(0, maxDecimals)}`;
  if (out.startsWith('.')) out = `0${out}`;
  return out;
};

const cleanAmount = (value) => String(value ?? '').replace(/\.$/, '');

const withCommas = (v) => {
  const [i, ...r] = String(v ?? '').split('.');
  const int = i.length >= 5 ? i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : i;
  return r.length ? `${int}.${r.join('')}` : int;
};

// Backend values may arrive as numbers in scientific notation; always return a plain decimal string.
const plainDecimal = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  if (!/e/i.test(raw)) return raw;
  const n = Number(raw);
  if (!Number.isFinite(n)) return '';
  return n.toFixed(18).replace(/\.?0+$/, '');
};

const decimalsOf = (value) => (String(value).split('.')[1] || '').length;

const toScaled = (value, d) => {
  const [i, f = ''] = String(value).split('.');
  return BigInt(`${i || '0'}${f.padEnd(d, '0').slice(0, d)}`);
};

const fromScaled = (value, d) => {
  const s = value.toString().padStart(d + 1, '0');
  if (d === 0) return s;
  const int = s.slice(0, -d);
  const frac = s.slice(-d).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
};

// direction 'min' => floor(value * (1 - bps)), direction 'max' => ceil(value * (1 + bps)).
// The result keeps the same number of decimals as the previewed value.
const applySlippage = (preview, bps, direction) => {
  const clean = plainDecimal(preview);
  if (!clean) return null;
  const d = Math.max(decimalsOf(clean), 6);
  const v = toScaled(clean, d);

  const result =
    direction === 'min'
      ? (v * BigInt(10000 - bps)) / 10000n
      : (v * BigInt(10000 + bps) + 9999n) / 10000n;

  return fromScaled(result, d);
};

const getLocalLogo = (symbol) => LOCAL_LOGOS[uc(symbol)] || null;

const pickLogo = (symbol, address, own, index) =>
  getLocalLogo(symbol) ||
  (own ? String(own).trim() : null) ||
  index.byAddress.get(lc(address)) ||
  index.bySymbol.get(uc(symbol)) ||
  null;

const findWalletAsset = (assets, address, symbol) => {
  const addr = lc(address);
  const isNative = !addr || addr === ZERO_ADDRESS;

  if (!isNative) {
    const byAddress = assets.find((a) => lc(a.contractAddress) === addr);
    if (byAddress) return byAddress;
  }

  return assets.find((a) => uc(a.symbol) === uc(symbol)) || null;
};

// User's balance of an asset, read from walletCache (same data the Dashboard shows).
const getUserBalance = (email, chain, address, symbol) => {
  const snapshot = readWalletCache(email, chain);
  if (!snapshot) return { known: false, balance: '0', decimals: 18 };

  const asset = findWalletAsset(snapshot.assets || [], address, symbol);

  return {
    known: true,
    balance: asset ? String(asset.balanceFull ?? asset.balance ?? '0') : '0',
    decimals: Number(asset?.decimals) || 18,
  };
};

const explorerTxUrl = (chain, hash) => {
  const dev = NODE_ENV === 'development';
  const base =
    chain === 'bnb'
      ? dev
        ? 'https://testnet.bscscan.com/tx/'
        : 'https://bscscan.com/tx/'
      : dev
      ? 'https://sepolia.basescan.org/tx/'
      : 'https://basescan.org/tx/';
  return `${base}${hash}`;
};

const inputCls =
  'w-full rounded-xl border border-white/[0.08] bg-white/[0.035] px-3 py-2.5 sm:py-3 text-[11px] sm:text-sm font-bold text-white placeholder:text-white/55 outline-none transition focus:border-salvaGold/40';

/* ============================================================================
   SMALL UI
============================================================================ */

const Spinner = ({ className = 'h-3.5 w-3.5' }) => (
  <span
    className={`inline-block ${className} animate-spin rounded-full border-2 border-salvaGold/25 border-t-salvaGold`}
  />
);

const AssetLogo = ({ symbol, logo, size = 'h-9 w-9', className = '' }) => {
  const [failed, setFailed] = useState(false);
  const resolved = getLocalLogo(symbol) || logo || null;
  const isNgns = uc(symbol) === 'NGNS';

  useEffect(() => {
    setFailed(false);
  }, [resolved]);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.055] ${size} ${className}`}
    >
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={symbol || 'Token'}
          className={`h-full w-full object-cover ${isNgns ? 'scale-[2]' : ''}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] font-black tracking-tight text-salvaGold">
          {uc(symbol || '?').slice(0, 3)}
        </span>
      )}
    </div>
  );
};

const PairLogo = ({ baseSymbol, baseLogo, quoteSymbol, quoteLogo, size = 'h-11 w-11' }) => (
  <div className={`relative shrink-0 ${size}`}>
    <AssetLogo symbol={baseSymbol} logo={baseLogo} size="h-full w-full" className="relative z-10" />
    <div className="absolute -bottom-0.5 -right-0.5 z-20 flex h-[58%] w-[58%] items-center justify-center rounded-full bg-[#0b0c10] p-[2px]">
      <AssetLogo symbol={quoteSymbol} logo={quoteLogo} size="h-full w-full" />
    </div>
  </div>
);

/* ============================================================================
   ASSET DROPDOWN  (select asset to buy)
============================================================================ */

const AssetDropdown = ({ assets, value, onChange, logoIndex }) => {
  const [open, setOpen] = useState(false);
  const current = assets.find((a) => a.symbol === value) || { symbol: value };

  return (
    <div className="relative z-30">
      <p className="mb-1.5 text-[7px] sm:text-[9px] font-black uppercase tracking-[.28em] text-white/72">
        Asset to buy
      </p>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full min-w-[150px] items-center justify-between gap-2 rounded-2xl border border-white/[0.09] bg-white/[0.04] px-3 py-2 sm:py-2.5 transition hover:border-salvaGold/30"
      >
        <span className="flex items-center gap-2">
          <AssetLogo
            symbol={current.symbol}
            logo={pickLogo(current.symbol, current.address, current.logo, logoIndex)}
            size="h-7 w-7"
          />
          <span className="text-xs sm:text-sm font-black">{current.symbol}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-white/74 transition ${open ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <button
              type="button"
              aria-label="Close asset list"
              className="fixed inset-0 z-40 cursor-default"
              onClick={() => setOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              className="absolute left-0 top-full z-50 mt-2 w-64 max-w-[80vw] overflow-hidden rounded-2xl border border-white/[0.09] bg-[#0b0c10] shadow-2xl"
            >
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/60 to-transparent" />
              <div className="max-h-72 overflow-y-auto p-1.5">
                {assets.map((asset) => {
                  const selected = asset.symbol === value;
                  return (
                    <button
                      key={`${asset.symbol}:${asset.address || 'native'}`}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onChange(asset.symbol);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-2.5 text-left transition hover:bg-white/[0.05] ${
                        selected ? 'bg-white/[0.04]' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <AssetLogo
                          symbol={asset.symbol}
                          logo={pickLogo(asset.symbol, asset.address, asset.logo, logoIndex)}
                          size="h-8 w-8"
                        />
                        <span className="text-xs font-black">{asset.symbol}</span>
                      </span>
                      {selected && <Check className="h-4 w-4 text-salvaGold" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

/* ============================================================================
   PIN GATE  (must pass before the swap card opens)
============================================================================ */

const PinGateModal = ({ email, onVerified, onCancel }) => {
  const verify = async (pin) => {
    const data = await swapRequest(`${SALVA_API_URL}/api/user/verify-pin`, {
      method: 'POST',
      body: { email, pin },
    });

    if (!data?.success) throw new Error('Invalid PIN');
    onVerified(pin);
  };

  return <PinModal zClass="z-[150]" onVerified={verify} onCancel={onCancel} />;
};

/* ============================================================================
   LISTING CARD
============================================================================ */

const UnverifiedPairWarning = ({ listing, onContinue, onCancel }) => (
  <div className="fixed inset-0 z-[150] flex items-center justify-center px-4">
    <motion.button
      aria-label="Close"
      className="absolute inset-0 bg-black/85 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onCancel}
    />
    <motion.div
      className="relative w-full max-w-sm overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#0b0c10] shadow-2xl"
      initial={{ opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 14, scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    >
      <div className="h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent" />
      <div className="p-5 sm:p-7">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-amber-400/25 bg-amber-400/10">
          <ShieldAlert className="h-5 w-5 text-amber-400" />
        </div>

        <p className="text-center text-[8px] font-black uppercase tracking-[.32em] text-amber-400/80">
          Not verified by Salva
        </p>
        <h3 className="mt-1 text-center text-lg font-black">Individually configured pair</h3>

        <p className="mt-3 text-center text-[10px] sm:text-[11px] leading-relaxed text-white/85">
          {listing.baseSymbol}/{listing.quoteSymbol} was set up by an independent pool owner. Salva
          has not reviewed this pair, its pool or its pricing, so we can't vouch for it.
        </p>
        <p className="mt-2 text-center text-[10px] sm:text-[11px] leading-relaxed text-white/85">
          That doesn't mean it's unsafe. Many individual pairs are perfectly legitimate, but you
          would be swapping at your own risk.
        </p>

        <div className="mt-4 divide-y divide-white/[0.05] rounded-2xl border border-white/[0.07] bg-white/[0.025] px-3">
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.18em] text-white/74">
              Rate
            </span>
            <span className="text-right text-[10px] sm:text-xs font-black">
              1 {listing.baseSymbol} = {truncateDisplay(listing.price)} {listing.quoteSymbol}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 py-2">
            <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.18em] text-white/74">
              Pool
            </span>
            <span className="font-mono text-[10px] sm:text-xs font-black text-white/90">
              {shortAddr(listing.poolAddress)}
            </span>
          </div>
        </div>

        <ul className="mt-4 space-y-1.5 text-[10px] sm:text-[11px] leading-relaxed text-white/85">
          <li>• Compare the rate with the current market price.</li>
          <li>• Only continue if you trust the pool owner.</li>
          <li>• Try a small amount first. Swaps can't be reversed once confirmed.</li>
        </ul>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/80"
          >
            Cancel
          </button>
          <button
            onClick={onContinue}
            className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black transition hover:brightness-110"
          >
            I understand, continue
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

const ListingCard = ({ listing, index, logoIndex, verified, onProceed }) => {
  const baseLogo = pickLogo(listing.baseSymbol, listing.baseAddress, listing.baseLogo, logoIndex);
  const quoteLogo = pickLogo(
    listing.quoteSymbol,
    listing.quoteAddress,
    listing.quoteLogo,
    logoIndex
  );

  const priceOk = Number(listing.price) > 0;
  const liquidityOk = Number(listing.baseBalance) > 0;
  const disabled = !priceOk || !liquidityOk;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index, 8) * 0.03, duration: 0.25 }}
      className="group overflow-hidden rounded-[22px] border border-white/[0.08] bg-[#101217]/95 shadow-[0_12px_35px_rgba(0,0,0,0.16)] transition duration-200 hover:-translate-y-0.5 hover:border-salvaGold/25 hover:shadow-[0_18px_45px_rgba(0,0,0,0.24)]"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-3.5 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
            <PairLogo
              baseSymbol={listing.baseSymbol}
              baseLogo={baseLogo}
              quoteSymbol={listing.quoteSymbol}
              quoteLogo={quoteLogo}
              size="h-10 w-10 sm:h-12 sm:w-12"
            />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-xs sm:text-sm font-black">
                  Buy {listing.baseSymbol}
                  <span className="mx-1 text-white/60">·</span>
                  <span className="text-white/88">pay {listing.quoteSymbol}</span>
                </p>
                {verified && (
                  <BadgeCheck
                    aria-label="Verified by Salva"
                    className="h-3.5 w-3.5 shrink-0 text-salvaGold sm:h-4 sm:w-4"
                  />
                )}
              </div>
              <p className="mt-0.5 truncate font-mono text-[8px] sm:text-[10px] text-white/72">
                Pool {shortAddr(listing.poolAddress)}
              </p>
            </div>
          </div>

          <span
            className={`hidden shrink-0 rounded-lg border px-2 py-1 text-[8px] font-black uppercase tracking-widest sm:block ${
              disabled
                ? 'border-white/10 text-white/60'
                : 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-400'
            }`}
          >
            {disabled ? 'Inactive' : 'Live'}
          </span>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-2.5 sm:p-3">
            <p className="text-[7px] sm:text-[8px] font-black uppercase tracking-[.22em] text-white/72">
              Rate
            </p>
            <p className="mt-1 truncate text-sm sm:text-lg font-black tracking-tight">
              {priceOk ? truncateDisplay(listing.price) : '—'}
            </p>
            <p className="mt-0.5 truncate text-[8px] sm:text-[10px] text-white/76">
              {listing.quoteSymbol} per 1 {listing.baseSymbol}
            </p>
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-black/25 p-2.5 sm:p-3">
            <p className="text-[7px] sm:text-[8px] font-black uppercase tracking-[.22em] text-white/72">
              Available
            </p>
            <p className="mt-1 truncate text-sm sm:text-lg font-black tracking-tight">
              {truncateDisplay(listing.baseBalance)}
            </p>
            <p className="mt-0.5 truncate text-[8px] sm:text-[10px] text-white/76">
              {listing.baseSymbol} in pool
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={disabled}
          onClick={() => onProceed(listing)}
          className="mt-3 w-full rounded-2xl bg-salvaGold py-2.5 sm:py-3 text-[9px] sm:text-xs font-black uppercase tracking-widest text-black shadow-lg shadow-salvaGold/10 transition hover:brightness-110 active:scale-[.99] disabled:cursor-not-allowed disabled:opacity-35"
        >
          {!liquidityOk ? 'No liquidity' : !priceOk ? 'Price unavailable' : 'Proceed to swap →'}
        </button>
      </div>
    </motion.article>
  );
};

/* ============================================================================
   SWAP SHEET  (live-priced swap card)
============================================================================ */

const SwapSheet = ({
  listing,
  pin,
  user,
  chain,
  logoIndex,
  walletTick,
  onClose,
  onSwapComplete,
}) => {
  const [mode, setMode] = useState('exact_in'); // exact_in | exact_out
  const [amount, setAmount] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [slippage, setSlippage] = useState('');
  const [live, setLive] = useState(listing);
  const [missing, setMissing] = useState(false);
  const [localTick, setLocalTick] = useState(0);
  const [preview, setPreview] = useState({ value: null, loading: false, error: '' });
  const [step, setStep] = useState('input'); // input | review | processing | done
  const [feeLoading, setFeeLoading] = useState(false);
  const [fee, setFee] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [result, setResult] = useState(null);
  const [actionError, setActionError] = useState('');

  const openPriceRef = useRef(Number(listing.price));
  const reviewPriceRef = useRef(null);
  const stepRef = useRef(step);
  stepRef.current = step;

  const inv = live;
  const baseSymbol = inv.baseSymbol;
  const quoteSymbol = inv.quoteSymbol;
  const baseLogo = pickLogo(baseSymbol, inv.baseAddress, inv.baseLogo, logoIndex);
  const quoteLogo = pickLogo(quoteSymbol, inv.quoteAddress, inv.quoteLogo, logoIndex);

  /* ---------- LIVE PRICE POLL (never cached) ---------- */
  useEffect(() => {
    let stopped = false;
    let controller = null;

    const tick = async () => {
      if (stopped || document.visibilityState !== 'visible') return;

      controller?.abort();
      controller = new AbortController();

      try {
        const list = await fetchLivePairListings(chain, listing.baseSymbol, listing.quoteSymbol, {
          signal: controller.signal,
        });
        if (stopped) return;

        const match = list.find((l) => l.key === listing.key);

        if (match) {
          setLive((prev) => ({
            ...match,
            baseLogo: match.baseLogo || prev.baseLogo,
            quoteLogo: match.quoteLogo || prev.quoteLogo,
          }));
          setMissing(false);
        } else {
          setMissing(true);
        }

        setLocalTick((t) => t + 1);
      } catch {
        // keep the last good price; the next tick will retry
      }
    };

    tick();
    const id = setInterval(tick, SWAP_LIVE_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      stopped = true;
      controller?.abort();
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [chain, listing.key, listing.baseSymbol, listing.quoteSymbol]);

  /* ---------- DERIVED ---------- */
  const userBal = useMemo(
    () => getUserBalance(user.email, chain, inv.quoteAddress, quoteSymbol),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.email, chain, inv.quoteAddress, quoteSymbol, walletTick, localTick]
  );

  const amountDecimals = mode === 'exact_in' ? userBal.decimals || 18 : 18;
  const amountNum = Number(amount) || 0;
  const priceNum = Number(inv.price);
  const priceOk = priceNum > 0;
  const poolBase = Number(inv.baseBalance) || 0;
  const previewNum = preview.value ? Number(preview.value) : 0;

  const payAmt = mode === 'exact_in' ? amountNum : previewNum;
  const recvAmt = mode === 'exact_in' ? previewNum : amountNum;

  const insufficientUser = userBal.known && payAmt > 0 && payAmt > Number(userBal.balance);
  const poolShort = recvAmt > 0 && recvAmt > poolBase;

  // Nothing selected / empty custom field => default 1%.
  const effectiveSlippage = slippage === '' ? DEFAULT_SLIPPAGE_PCT : slippage;
  const slipNum = Number(effectiveSlippage);
  const slipInvalid = !Number.isFinite(slipNum) || slipNum > MAX_SLIPPAGE_PCT;
  const bps = slipInvalid ? 0 : Math.round(slipNum * 100);

  // exact_in  -> minAmountOut = preview - slippage (default 1%)
  // exact_out -> maxAmountIn  = preview + slippage (default 1%)
  const protection = useMemo(() => {
    if (!preview.value || slipInvalid) return null;
    return applySlippage(preview.value, bps, mode === 'exact_in' ? 'min' : 'max');
  }, [preview.value, mode, bps, slipInvalid]);

  const movePct =
    openPriceRef.current > 0 ? ((priceNum - openPriceRef.current) / openPriceRef.current) * 100 : 0;
  const showMove = Math.abs(movePct) >= 0.01;
  const priceMovedSinceReview =
    step === 'review' && reviewPriceRef.current !== null && inv.price !== reviewPriceRef.current;

  /* ---------- PREVIEW ---------- */
  useEffect(() => {
    if (!(amountNum > 0) || !priceOk) {
      setPreview({ value: null, loading: false, error: '' });
      return undefined;
    }

    let cancelled = false;
    setPreview((p) => ({ ...p, loading: true, error: '' }));

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          poolAddress: inv.poolAddress,
          assetIn: quoteSymbol,
          assetOut: baseSymbol,
          amount: cleanAmount(amount),
          chain,
        });

        const endpoint = mode === 'exact_in' ? 'amount-out' : 'amount-in';
        const data = await swapRequest(`${SALVA_API_URL}/api/user/swap/${endpoint}?${params}`);
        if (cancelled) return;

        const value = plainDecimal(mode === 'exact_in' ? data?.amountOut : data?.amountIn);
        if (!value) throw new Error('Quote unavailable');

        setPreview({ value, loading: false, error: '' });
      } catch (err) {
        if (!cancelled) {
          setPreview({ value: null, loading: false, error: err?.message || 'Quote unavailable' });
        }
      }
    }, 450);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    amount,
    amountNum,
    mode,
    priceOk,
    inv.price,
    inv.poolAddress,
    quoteSymbol,
    baseSymbol,
    chain,
  ]);

  /* ---------- ACTIONS ---------- */
  const switchMode = (next) => {
    if (next === mode) return;
    setMode(next);
    setAmount('');
    setPreview({ value: null, loading: false, error: '' });
    setActionError('');
  };

  const handleMax = () => {
    if (mode === 'exact_in') {
      if (!userBal.known) return;
      setAmount(sanitizeAmount(userBal.balance, amountDecimals));
    } else {
      setAmount(sanitizeAmount(inv.baseBalance, 18));
    }
  };

  const canReview =
    step === 'input' &&
    amountNum > 0 &&
    Boolean(preview.value) &&
    !preview.loading &&
    !preview.error &&
    priceOk &&
    !missing &&
    !slipInvalid &&
    !insufficientUser &&
    !poolShort &&
    !feeLoading;

  const estimateFeeAndReview = async () => {
    if (!canReview) return;
    setActionError('');
    setFeeLoading(true);

    const payAmount = mode === 'exact_in' ? cleanAmount(amount) : preview.value;
    const receiveAmount = mode === 'exact_in' ? preview.value : cleanAmount(amount);

    try {
      const body =
        mode === 'exact_in'
          ? {
              safe: user.safeAddress,
              pin,
              poolAddress: inv.poolAddress,
              assetIn: quoteSymbol,
              assetOut: baseSymbol,
              amountIn: payAmount,
              minAmountOut: protection,
              chain,
            }
          : {
              safe: user.safeAddress,
              pin,
              poolAddress: inv.poolAddress,
              assetIn: quoteSymbol,
              assetOut: baseSymbol,
              amountOut: receiveAmount,
              maxAmountIn: protection,
              chain,
            };

      const endpoint =
        mode === 'exact_in' ? 'estimate-exact-input-fee' : 'estimate-exact-output-fee';

      const data = await swapRequest(`${SALVA_API_URL}/api/user/swap/${endpoint}`, {
        method: 'POST',
        body,
      });

      const feeNGN = data?.data?.feeNGN;
      const feeUsd = data?.data?.feeUsd;
      if (feeNGN === undefined && feeUsd === undefined) {
        throw new Error('Fee estimate was not returned by the server');
      }

      setFee({ feeNGN, feeUsd });
      setSnapshot({ mode, payAmount, receiveAmount, protection, bps });
      reviewPriceRef.current = inv.price;
      setStep('review');
    } catch (err) {
      setActionError(err?.message || 'Could not estimate the network fee');
    } finally {
      setFeeLoading(false);
    }
  };

  const executeSwap = async () => {
    if (!snapshot || priceMovedSinceReview) return;
    setActionError('');
    setStep('processing');

    try {
      const body =
        snapshot.mode === 'exact_in'
          ? {
              email: user.email,
              pin,
              poolAddress: inv.poolAddress,
              assetIn: quoteSymbol,
              assetOut: baseSymbol,
              amountIn: snapshot.payAmount,
              minAmountOut: snapshot.protection,
              chain,
            }
          : {
              email: user.email,
              pin,
              poolAddress: inv.poolAddress,
              assetIn: quoteSymbol,
              assetOut: baseSymbol,
              amountOut: snapshot.receiveAmount,
              maxAmountIn: snapshot.protection,
              chain,
            };

      const endpoint =
        snapshot.mode === 'exact_in' ? 'execute-exact-input' : 'execute-exact-output';

      const data = await swapRequest(`${SALVA_API_URL}/api/user/swap/${endpoint}`, {
        method: 'POST',
        body,
      });

      const receipt = data?.receipt || {};
      setResult({
        hash: receipt.transactionHash || receipt.hash || receipt.blockHash || null,
        paid: snapshot.payAmount,
        received: snapshot.receiveAmount,
        approx: snapshot.mode === 'exact_in' ? 'received' : 'paid',
      });
      setStep('done');
      onSwapComplete?.();
    } catch (err) {
      setActionError(err?.message || 'Swap failed. Please try again.');
      setStep('review');
    }
  };

  const guardedClose = () => {
    if (stepRef.current === 'processing') return;
    onClose();
  };

  useOverlayLayer('swapSheet', true, guardedClose);

  /* ---------- RENDER HELPERS ---------- */
  const rateLine = `1 ${baseSymbol} = ${priceOk ? truncateDisplay(inv.price) : '—'} ${quoteSymbol}`;

  const amountSymbol = mode === 'exact_in' ? quoteSymbol : baseSymbol;
  const amountLabel =
    mode === 'exact_in' ? `You pay (${quoteSymbol})` : `You receive (${baseSymbol})`;
  const previewLabel = mode === 'exact_in' ? `You receive (est.)` : `You pay (est.)`;
  const previewSymbol = mode === 'exact_in' ? baseSymbol : quoteSymbol;

  const protectionLabel = mode === 'exact_in' ? 'Minimum to receive' : 'Maximum to pay';
  const protectionSymbol = mode === 'exact_in' ? baseSymbol : quoteSymbol;
  const protectionValue = protection ? `${fmt(protection, 8)} ${protectionSymbol}` : '—';

  const Row = ({ label, children }) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.18em] text-white/74">
        {label}
      </span>
      <span className="text-right text-[10px] sm:text-xs font-black">{children}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[140] flex items-end justify-center sm:items-center sm:px-4">
      <motion.button
        aria-label="Close swap"
        className="absolute inset-0 bg-black/85 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={guardedClose}
      />

      <motion.div
        className="relative flex max-h-[94vh] w-full max-w-md flex-col overflow-hidden rounded-t-[26px] border border-white/[0.10] bg-[#0b0d11] shadow-[0_30px_90px_rgba(0,0,0,0.55)] sm:rounded-[26px]"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 240 }}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/70 to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-6 sm:pt-5">
          <div className="flex min-w-0 items-center gap-3">
            <PairLogo
              baseSymbol={baseSymbol}
              baseLogo={baseLogo}
              quoteSymbol={quoteSymbol}
              quoteLogo={quoteLogo}
              size="h-10 w-10"
            />
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/65">
                P2P swap
              </p>
              <h3 className="truncate text-base sm:text-lg font-black">
                {baseSymbol}
                <span className="mx-1 text-white/60">/</span>
                {quoteSymbol}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={guardedClose}
            disabled={step === 'processing'}
            className="rounded-lg border border-white/10 p-2 text-white/76 transition hover:text-white disabled:opacity-30"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-3 sm:px-6">
          {/* Live rate strip */}
          {(step === 'input' || step === 'review') && (
            <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-white/[0.06] bg-black/25 px-3 py-2.5">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[7px] sm:text-[8px] font-black uppercase tracking-[.22em] text-white/72">
                  <span className="relative flex h-1.5 w-1.5">
                    <span
                      className={`absolute inline-flex h-full w-full animate-ping rounded-full ${
                        missing ? 'bg-red-400' : 'bg-emerald-400'
                      } opacity-60`}
                    />
                    <span
                      className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                        missing ? 'bg-red-400' : 'bg-emerald-400'
                      }`}
                    />
                  </span>
                  {missing ? 'Market unavailable' : 'Live rate'}
                </p>
                <p className="mt-1 truncate text-xs sm:text-sm font-black">{rateLine}</p>
              </div>

              {showMove && (
                <span
                  className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${
                    movePct > 0
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-emerald-500/10 text-emerald-400'
                  }`}
                >
                  {movePct > 0 ? '▲' : '▼'} {Math.abs(movePct).toFixed(2)}%
                </span>
              )}
            </div>
          )}

          {/* ---------------- INPUT STEP ---------------- */}
          {step === 'input' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/[0.06] bg-white/[0.03] p-1">
                {[
                  { id: 'exact_in', label: 'Exact input' },
                  { id: 'exact_out', label: 'Exact output' },
                ].map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => switchMode(id)}
                    className={`rounded-lg py-2 text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition ${
                      mode === id ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white/80'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="rounded-[20px] border border-white/[0.08] bg-[#11141a] p-3.5 shadow-inner shadow-white/[0.015]">
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.2em] text-white/80">
                    {amountLabel}
                  </label>
                  <button
                    type="button"
                    onClick={handleMax}
                    disabled={mode === 'exact_in' && !userBal.known}
                    className="rounded-md border border-salvaGold/25 bg-salvaGold/[0.07] px-2 py-1 text-[8px] font-black uppercase tracking-widest text-salvaGold transition hover:bg-salvaGold/15 disabled:opacity-30"
                  >
                    Max
                  </button>
                </div>

                <div className="relative">
                  <input
                    autoFocus
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={withCommas(amount)}
                    onChange={(e) => {
                      setActionError('');
                      setAmount(sanitizeAmount(e.target.value, amountDecimals));
                    }}
                    className="w-full rounded-2xl border border-white/[0.09] bg-black/30 px-3.5 py-3.5 pr-20 text-base sm:text-xl font-black text-white outline-none transition focus:border-salvaGold/40"
                  />
                  <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
                    <AssetLogo
                      symbol={amountSymbol}
                      logo={mode === 'exact_in' ? quoteLogo : baseLogo}
                      size="h-5 w-5"
                    />
                    <span className="text-[10px] sm:text-xs font-black text-salvaGold">
                      {amountSymbol}
                    </span>
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-2 text-[8px] sm:text-[10px]">
                  <p className={insufficientUser ? 'font-bold text-red-400' : 'text-white/76'}>
                    Your {quoteSymbol}:{' '}
                    <span className="font-black text-white/85">
                      {userBal.known ? fmt(userBal.balance, 6) : '—'}
                    </span>
                  </p>
                  <p
                    className={`text-right ${
                      poolShort ? 'font-bold text-red-400' : 'text-white/76'
                    }`}
                  >
                    Pool {baseSymbol}:{' '}
                    <span className="font-black text-white/85">
                      {truncateDisplay(inv.baseBalance)}
                    </span>
                  </p>
                </div>
              </div>

              <div className="flex justify-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-white/[0.09] bg-white/[0.04]">
                  <ArrowDown className="h-3.5 w-3.5 text-white/76" />
                </div>
              </div>

              <div className="rounded-[20px] border border-white/[0.08] bg-[#11141a] p-3.5 shadow-inner shadow-white/[0.015]">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.2em] text-white/80">
                    {previewLabel}
                  </p>
                  {preview.loading && <Spinner />}
                </div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="truncate text-lg sm:text-2xl font-black tracking-tight text-white">
                    {preview.value ? fmt(preview.value, 8) : '—'}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <AssetLogo
                      symbol={previewSymbol}
                      logo={mode === 'exact_in' ? baseLogo : quoteLogo}
                      size="h-5 w-5"
                    />
                    <span className="text-[10px] sm:text-xs font-black">{previewSymbol}</span>
                  </span>
                </div>
                {preview.error && (
                  <p className="mt-1.5 text-[9px] sm:text-[10px] font-bold text-red-400">
                    {preview.error}
                  </p>
                )}
              </div>

              {(insufficientUser || poolShort) && (
                <p className="text-[9px] sm:text-[10px] font-bold text-red-400">
                  {insufficientUser
                    ? `Insufficient ${quoteSymbol} balance for this swap.`
                    : `This pool only has ${truncateDisplay(inv.baseBalance)} ${baseSymbol}.`}
                </p>
              )}

              {/* Advanced */}
              <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.02]">
                <button
                  type="button"
                  onClick={() => setAdvancedOpen((o) => !o)}
                  className="flex w-full items-center justify-between px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-[9px] sm:text-[11px] font-black uppercase tracking-widest text-white/88">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-salvaGold" />
                    Advanced
                    <span className="rounded-md bg-salvaGold/10 px-1.5 py-0.5 text-[8px] text-salvaGold">
                      {effectiveSlippage}% slippage
                    </span>
                  </span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 text-white/72 transition ${
                      advancedOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {advancedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-white/[0.06] px-3 pb-3 pt-3">
                        <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.2em] text-white/76">
                          Slippage tolerance
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {SLIPPAGE_PRESETS.map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => setSlippage((s) => (s === p ? '' : p))}
                              className={`rounded-lg border px-2.5 py-1.5 text-[9px] sm:text-[10px] font-black transition ${
                                effectiveSlippage === p
                                  ? 'border-salvaGold/40 bg-salvaGold/10 text-salvaGold'
                                  : 'border-white/[0.08] bg-white/[0.03] text-white/80 hover:text-white'
                              }`}
                            >
                              {p}%
                            </button>
                          ))}

                          <div className="relative min-w-[84px] flex-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Custom"
                              value={slippage}
                              onChange={(e) => setSlippage(sanitizeAmount(e.target.value, 2))}
                              className="w-full rounded-lg border border-white/[0.08] bg-black/25 py-1.5 pl-2.5 pr-6 text-[10px] font-black text-white outline-none focus:border-salvaGold/40"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/72">
                              %
                            </span>
                          </div>
                        </div>

                        {slipInvalid ? (
                          <p className="mt-2 text-[9px] font-bold text-red-400">
                            Slippage cannot exceed {MAX_SLIPPAGE_PCT}%.
                          </p>
                        ) : (
                          <p className="mt-2 text-[8px] sm:text-[10px] leading-relaxed text-white/72">
                            {mode === 'exact_in'
                              ? 'Sets the minimum amount you will accept to receive. Defaults to 1% below the quote.'
                              : 'Sets the maximum amount you are willing to pay. Defaults to 1% above the quote.'}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {preview.value && (
                <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3">
                  <Row label="Rate">{rateLine}</Row>
                  <Row label={protectionLabel}>{protectionValue}</Row>
                </div>
              )}

              {missing && (
                <p className="text-[9px] sm:text-[10px] font-bold text-red-400">
                  This market is no longer available in the pool.
                </p>
              )}
              {actionError && (
                <p className="text-[9px] sm:text-[10px] font-bold text-red-400">{actionError}</p>
              )}
            </div>
          )}

          {/* ---------------- REVIEW STEP ---------------- */}
          {step === 'review' && snapshot && fee && (
            <div className="space-y-3">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3 sm:p-4">
                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.2em] text-white/74">
                  You pay{snapshot.mode === 'exact_out' ? ' (est.)' : ''}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="truncate text-lg sm:text-2xl font-black">
                    {fmt(snapshot.payAmount, 8)}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <AssetLogo symbol={quoteSymbol} logo={quoteLogo} size="h-6 w-6" />
                    <span className="text-xs font-black">{quoteSymbol}</span>
                  </span>
                </div>

                <div className="my-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-white/[0.07]" />
                  <ArrowDown className="h-3.5 w-3.5 text-white/72" />
                  <div className="h-px flex-1 bg-white/[0.07]" />
                </div>

                <p className="text-[8px] sm:text-[10px] font-black uppercase tracking-[.2em] text-white/74">
                  You receive{snapshot.mode === 'exact_in' ? ' (est.)' : ''}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <p className="truncate text-lg sm:text-2xl font-black text-salvaGold">
                    {fmt(snapshot.receiveAmount, 8)}
                  </p>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <AssetLogo symbol={baseSymbol} logo={baseLogo} size="h-6 w-6" />
                    <span className="text-xs font-black">{baseSymbol}</span>
                  </span>
                </div>
              </div>

              <div className="divide-y divide-white/[0.05] rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3">
                <Row label="Rate">{rateLine}</Row>
                <Row label={snapshot.mode === 'exact_in' ? 'Minimum received' : 'Maximum paid'}>
                  {`${fmt(snapshot.protection, 8)} ${
                    snapshot.mode === 'exact_in' ? baseSymbol : quoteSymbol
                  }`}
                </Row>
                <Row label="Network fee">
                  <span className="text-red-400">
                    {fmtNgn(fee.feeNGN)}{' '}
                    <span className="text-white/72">(${Number(fee.feeUsd || 0).toFixed(4)})</span>
                  </span>
                </Row>
                <Row label="Receiver">
                  <span className="font-mono text-white/90">
                    {shortAddr(user.safeAddress)} · You
                  </span>
                </Row>
                <Row label="Pool">
                  <span className="font-mono text-white/90">{shortAddr(inv.poolAddress)}</span>
                </Row>
              </div>

              {priceMovedSinceReview && (
                <div className="rounded-xl border border-salvaGold/25 bg-salvaGold/[0.06] px-3 py-2.5">
                  <p className="text-[10px] sm:text-xs font-black text-salvaGold">
                    The rate just moved
                  </p>
                  <p className="mt-0.5 text-[9px] sm:text-[10px] leading-relaxed text-white/82">
                    New rate: {rateLine}. Update the quote to continue.
                  </p>
                </div>
              )}

              {actionError && (
                <p className="text-[9px] sm:text-[10px] font-bold text-red-400">{actionError}</p>
              )}
            </div>
          )}

          {/* ---------------- PROCESSING ---------------- */}
          {step === 'processing' && (
            <div className="py-14 text-center">
              <div className="relative mx-auto mb-5 h-14 w-14">
                <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
                <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-salvaGold" />
                <div className="absolute inset-2 flex items-center justify-center rounded-full bg-salvaGold/10">
                  <span className="text-sm font-black text-salvaGold">⇄</span>
                </div>
              </div>
              <p className="text-base sm:text-lg font-black">Executing swap…</p>
              <p className="mt-1.5 text-[10px] sm:text-xs text-white/76">
                Broadcasting through your Safe. Please keep this open.
              </p>
            </div>
          )}

          {/* ---------------- DONE ---------------- */}
          {step === 'done' && result && (
            <div className="py-8 text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10"
              >
                <Check className="h-7 w-7 text-emerald-400" strokeWidth={2.5} />
              </motion.div>
              <p className="mt-4 text-[8px] font-black uppercase tracking-[.32em] text-emerald-400/70">
                Swap complete
              </p>
              <h3 className="mt-1.5 text-xl font-black">
                {fmt(result.received, 8)} {baseSymbol}
              </h3>
              <p className="mt-1.5 text-[10px] sm:text-xs text-white/76">
                for {fmt(result.paid, 8)} {quoteSymbol}
              </p>

              {result.hash && (
                <a
                  href={explorerTxUrl(chain, result.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 text-[10px] font-black text-salvaGold underline underline-offset-2"
                >
                  View on explorer <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'input' && (
          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-[#0b0c10] px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            <button
              onClick={guardedClose}
              className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/82 transition hover:bg-white/[0.04]"
            >
              Cancel
            </button>
            <button
              onClick={estimateFeeAndReview}
              disabled={!canReview}
              className="flex items-center justify-center gap-2 rounded-xl bg-salvaGold py-3 text-xs font-black text-black shadow-lg shadow-salvaGold/15 transition hover:brightness-110 disabled:opacity-40"
            >
              {feeLoading ? (
                <>
                  <Spinner className="h-3.5 w-3.5" /> …
                </>
              ) : (
                'Review swap →'
              )}
            </button>
          </div>
        )}

        {step === 'review' && (
          <div className="grid grid-cols-2 gap-2 border-t border-white/[0.06] bg-[#0b0c10] px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            <button
              onClick={() => {
                setActionError('');
                setStep('input');
              }}
              className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/82 transition hover:bg-white/[0.04]"
            >
              Back
            </button>
            {priceMovedSinceReview ? (
              <button
                onClick={() => {
                  setActionError('');
                  setStep('input');
                }}
                className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black transition hover:brightness-110"
              >
                Update quote
              </button>
            ) : (
              <button
                onClick={executeSwap}
                className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black shadow-lg shadow-salvaGold/15 transition hover:brightness-110"
              >
                Confirm swap
              </button>
            )}
          </div>
        )}

        {step === 'done' && (
          <div className="border-t border-white/[0.06] bg-[#0b0c10] px-4 pb-4 pt-3 sm:px-6 sm:pb-5">
            <button
              onClick={onClose}
              className="w-full rounded-xl bg-salvaGold py-3 text-xs font-black text-black shadow-lg shadow-salvaGold/15 transition hover:brightness-110"
            >
              Done
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

/* ============================================================================
   MAIN SWAP TAB
============================================================================ */

const SwapTab = ({ user }) => {
  const chain = useMemo(() => getChain(), []);

  const [swapAssets, setSwapAssets] = useState(() => readSwapAssetsCache(chain)?.assets || []);
  const [dropdownAsset, setDropdownAsset] = useState(DEFAULT_BUY_SYMBOL);
  const [query, setQuery] = useState({ mode: 'base', base: DEFAULT_BUY_SYMBOL });

  const [listings, setListings] = useState([]);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [buyInput, setBuyInput] = useState('');
  const [sellInput, setSellInput] = useState('');
  const [assetSearchError, setAssetSearchError] = useState('');
  const [poolInput, setPoolInput] = useState('');
  const [poolSearchError, setPoolSearchError] = useState('');
  const [poolResolving, setPoolResolving] = useState(false);

  const [pinListing, setPinListing] = useState(null);
  const [warnListing, setWarnListing] = useState(null);
  const [session, setSession] = useState(null); // { listing, pkey }
  const [walletTick, setWalletTick] = useState(0);

  const mountedRef = useRef(true);
  const requestRef = useRef(null);
  const resolveRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      resolveRef.current?.abort();
    };
  }, []);

  const assets = useMemo(() => {
    const list = buildAssetList(swapAssets);
    return list.length ? list : [{ symbol: DEFAULT_BUY_SYMBOL, address: null, logo: null }];
  }, [swapAssets]);

  const logoIndex = useMemo(() => buildLogoIndex(swapAssets), [swapAssets]);

  /* ---------- SUPPORTED PAIRS ---------- */
  const refreshPairs = useCallback(async () => {
    try {
      const result = await fetchSwapAssets(chain);
      if (mountedRef.current && result) setSwapAssets(result.assets);
    } catch {
      // keep cached pairs
    }
  }, [chain]);

  useEffect(() => {
    refreshPairs();
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') refreshPairs();
    }, SWAP_PAIRS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refreshPairs]);

  /* ---------- LISTINGS: fetch -> cache -> UI ---------- */
  const fetchActive = useCallback(
    async (activeQuery, { manual = false } = {}) => {
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

      if (manual) setRefreshing(true);

      try {
        const result = await fetchListings(chain, activeQuery, { signal: controller.signal });
        if (controller.signal.aborted || !mountedRef.current) return;

        setListings(result.listings);
        setUpdatedAt(result.at);
        setError('');
      } catch (err) {
        if (err?.name === 'AbortError' || !mountedRef.current) return;
        setError(err?.message || 'Could not load pools');
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          if (mountedRef.current) {
            setLoading(false);
            setRefreshing(false);
          }
        }
      }
    },
    [chain]
  );

  useEffect(() => {
    const cached = readListingsCache(chain, query);

    if (cached) {
      setListings(cached.listings);
      setUpdatedAt(cached.at);
      setLoading(false);
    } else {
      setListings([]);
      setUpdatedAt(null);
      setLoading(true);
    }
    setError('');

    fetchActive(query);

    const tick = () => {
      if (document.visibilityState === 'visible') fetchActive(query);
    };

    const id = setInterval(tick, SWAP_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
      requestRef.current?.abort();
    };
  }, [chain, query, fetchActive]);

  /* ---------- HANDLERS ---------- */
  const handleDropdownChange = (symbol) => {
    setDropdownAsset(symbol);
    setBuyInput('');
    setSellInput('');
    setPoolInput('');
    setAssetSearchError('');
    setPoolSearchError('');
    setQuery({ mode: 'base', base: symbol });
  };

  const submitAssetSearch = () => {
    const buy = uc(buyInput);
    const sell = uc(sellInput);

    // Asset to buy is mandatory. Without it, searching silently does nothing.
    if (!buy) return;

    if (buy.startsWith('0X') || sell.startsWith('0X')) {
      setAssetSearchError('Use token symbols here. Use pool lookup for addresses.');
      return;
    }

    setAssetSearchError('');
    setPoolSearchError('');
    setPoolInput('');

    if (sell) setQuery({ mode: 'pair', base: buy, quote: sell });
    else setQuery({ mode: 'base', base: buy });
  };

  const submitPoolSearch = async () => {
    const type = classifyPoolInput(poolInput);
    if (type === 'empty') return;

    if (type === 'invalid') {
      setPoolSearchError('Enter a 0x pool address or a name containing @');
      return;
    }

    setPoolSearchError('');
    setAssetSearchError('');
    resolveRef.current?.abort();
    const controller = new AbortController();
    resolveRef.current = controller;
    setPoolResolving(true);

    try {
      const { address, label } = await resolvePoolTarget(poolInput, { signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      setBuyInput('');
      setSellInput('');
      setQuery({ mode: 'address', poolAddress: address, label });
    } catch (err) {
      if (err?.name === 'AbortError' || !mountedRef.current) return;
      setPoolSearchError(err?.message || 'Pool not found');
    } finally {
      if (mountedRef.current && resolveRef.current === controller) setPoolResolving(false);
    }
  };

  const resetSearch = () => {
    setBuyInput('');
    setSellInput('');
    setPoolInput('');
    setAssetSearchError('');
    setPoolSearchError('');
    setQuery({ mode: 'base', base: dropdownAsset });
  };

  const handleManualRefresh = () => {
    setWalletTick((t) => t + 1);
    refreshPairs();
    fetchActive(query, { manual: true });
  };

  const handleProceed = (listing) => {
    if (listing.isVerified) {
      setPinListing(listing);
    } else {
      setWarnListing(listing);
    }
  };

  const handleWarnContinue = () => {
    setPinListing(warnListing);
    setWarnListing(null);
  };

  const handlePinVerified = (verifiedPin) => {
    setSession({ listing: pinListing, pin: verifiedPin });
    setPinListing(null);
  };

  const closeSession = useCallback(() => setSession(null), []);

  const handleSwapComplete = useCallback(async () => {
    await Promise.allSettled([
      fetchActive(query),
      user?.email ? fetchWalletSnapshot(user.email, chain, { logoMap: LOCAL_LOGOS }) : null,
    ]);
    if (mountedRef.current) setWalletTick((t) => t + 1);
  }, [fetchActive, query, user?.email, chain]);

  useOverlayLayer('swapWarn', Boolean(warnListing), () => setWarnListing(null));
  useOverlayLayer('swapPin', Boolean(pinListing), () => setPinListing(null));

  /* ---------- RENDER ---------- */
  const isDefaultQuery = query.mode === 'base' && query.base === dropdownAsset;

  const queryTitle =
    query.mode === 'pair'
      ? `Buying ${query.base} with ${query.quote}`
      : query.mode === 'address'
      ? `Pool ${
          query.label && query.label.includes('@') ? query.label : shortAddr(query.poolAddress)
        }`
      : `Buying ${query.base}`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="relative space-y-3 sm:space-y-5 max-sm:[zoom:0.9]"
    >
      {/* Header + dropdown */}
      <div className="flex items-end justify-between gap-3">
        <AssetDropdown
          assets={assets}
          value={dropdownAsset}
          onChange={handleDropdownChange}
          logoIndex={logoIndex}
        />

        <div className="flex items-center gap-2">
          <div className="hidden text-right sm:block">
            <p className="text-[7px] font-black uppercase tracking-[.3em] text-white/55">Updated</p>
            <p className="mt-0.5 text-[10px] font-black text-white/88">
              {updatedAt
                ? new Date(updatedAt).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })
                : '—'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={refreshing}
            aria-label="Refresh pools"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/80 transition hover:border-salvaGold/30 hover:text-white disabled:opacity-60 sm:h-10 sm:w-10"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${refreshing ? 'animate-spin' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="space-y-2.5 rounded-[20px] border border-white/[0.07] bg-white/[0.025] p-3 sm:p-4">
        <div>
          <p className="mb-1.5 text-[7px] sm:text-[9px] font-black uppercase tracking-[.28em] text-white/72">
            Search inventory
          </p>
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <input
              value={buyInput}
              onChange={(e) => {
                setAssetSearchError('');
                setBuyInput(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitAssetSearch()}
              placeholder="Buy e.g. NGNS"
              className={inputCls}
            />
            <input
              value={sellInput}
              onChange={(e) => {
                setAssetSearchError('');
                setSellInput(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitAssetSearch()}
              placeholder="Pay with (optional)"
              className={inputCls}
            />
            <button
              type="button"
              onClick={submitAssetSearch}
              aria-label="Search Inventory"
              className="flex items-center justify-center rounded-xl bg-salvaGold px-3.5 text-black transition hover:brightness-110"
            >
              <Search className="h-4 w-4" />
            </button>
          </div>
          {assetSearchError && (
            <p className="mt-1.5 text-[9px] sm:text-[10px] font-bold text-red-400">
              {assetSearchError}
            </p>
          )}
        </div>

        <div className="border-t border-white/[0.05] pt-2.5">
          <p className="mb-1.5 text-[7px] sm:text-[9px] font-black uppercase tracking-[.28em] text-white/72">
            Pool lookup
          </p>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <input
              value={poolInput}
              onChange={(e) => {
                setPoolSearchError('');
                setPoolInput(e.target.value);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitPoolSearch()}
              placeholder="0x pool address or name@namespace"
              className={`${inputCls} font-mono`}
            />
            <button
              type="button"
              onClick={submitPoolSearch}
              disabled={poolResolving}
              aria-label="Search pool"
              className="flex w-11 items-center justify-center rounded-xl bg-salvaGold text-black transition hover:brightness-110 disabled:opacity-60"
            >
              {poolResolving ? (
                <Spinner className="h-4 w-4 border-black/30 border-t-black" />
              ) : (
                <Search className="h-4 w-4" />
              )}
            </button>
          </div>
          {poolSearchError && (
            <p className="mt-1.5 text-[9px] sm:text-[10px] font-bold text-red-400">
              {poolSearchError}
            </p>
          )}
        </div>
      </div>

      {/* Active query bar */}
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.018] px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[7px] sm:text-[9px] font-black uppercase tracking-[.3em] text-salvaGold/60">
            Marketplace
          </p>
          <h2 className="mt-0.5 truncate text-sm sm:text-lg font-black">{queryTitle}</h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {listings.length > 0 && (
            <span className="rounded-md bg-white/[0.06] px-2 py-1 text-[8px] sm:text-[10px] font-black text-white/82">
              {listings.length} {listings.length === 1 ? 'market' : 'markets'}
            </span>
          )}
          {!isDefaultQuery && (
            <button
              type="button"
              onClick={resetSearch}
              className="rounded-md border border-white/10 px-2 py-1 text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-white/80 transition hover:text-white"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {error && listings.length > 0 && (
        <p className="-mt-2 px-0.5 text-[9px] sm:text-[10px] font-bold text-yellow-400/90">
          Showing last update · reconnecting…
        </p>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-44 animate-pulse rounded-[20px] bg-white/[0.025]" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-[22px] border border-dashed border-white/[0.10] bg-white/[0.015] px-5 py-14 text-center"
        >
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Search className="h-5 w-5 text-white/65" />
          </div>
          <p className="text-xs sm:text-sm font-black text-white/80">
            {error ? 'Could not load pools' : 'No pools found'}
          </p>
          <p className="mx-auto mt-1.5 max-w-xs text-[10px] sm:text-xs leading-relaxed text-white/74">
            {error ||
              (query.mode === 'pair'
                ? `No pool is currently selling ${query.base} for ${query.quote}.`
                : query.mode === 'address'
                ? 'This pool has no published inventories.'
                : `No pool is currently selling ${query.base}.`)}
          </p>
          {error && (
            <button
              onClick={handleManualRefresh}
              className="mt-4 rounded-xl bg-salvaGold px-4 py-2 text-[9px] font-black uppercase tracking-widest text-black"
            >
              Try again
            </button>
          )}
        </motion.div>
      ) : (
        <div className="grid gap-2.5 sm:gap-3">
          {listings.map((listing, i) => (
            <ListingCard
              key={listing.key}
              listing={listing}
              index={i}
              logoIndex={logoIndex}
              verified={listing.isVerified}
              onProceed={handleProceed}
            />
          ))}
        </div>
      )}

      <AnimatePresence>
        {warnListing && (
          <UnverifiedPairWarning
            listing={warnListing}
            onContinue={handleWarnContinue}
            onCancel={() => setWarnListing(null)}
          />
        )}
      </AnimatePresence>

      {/* PIN gate -> swap sheet */}
      <AnimatePresence>
        {pinListing && (
          <PinGateModal
            listing={pinListing}
            email={user?.email}
            onVerified={handlePinVerified}
            onCancel={() => setPinListing(null)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {session && (
          <SwapSheet
            key={session.listing.key}
            listing={session.listing}
            pin={session.pin}
            user={user}
            chain={chain}
            logoIndex={logoIndex}
            walletTick={walletTick}
            onClose={closeSession}
            onSwapComplete={handleSwapComplete}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default SwapTab;
