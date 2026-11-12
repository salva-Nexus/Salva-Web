// src/pages/PoolInventories.jsx
// v3.0.1 merchant inventory management.
// Cache-first, silent 60s polling, PIN-gated actions.
// Full numeric values are kept separately from presentation values.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleDollarSign,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  Plus,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';
import PinModal from '../components/PinModal';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';
import {
  POLL_INTERVAL_MS,
  fetchPoolSnapshot,
  formatDisplayNumber,
  readPoolCache,
} from '../utils/walletCache';
import { truncateDisplay } from '../utils/swapPoolCache';

const API = {
  supportedPairs: (chain) =>
    `${SALVA_API_URL}/api/pool/supported-Pairs/${encodeURIComponent(chain)}`,
  assetPrice: (base, quote, chain) =>
    `${SALVA_API_URL}/api/pool/assets/price/${encodeURIComponent(base)}/${encodeURIComponent(
      quote
    )}/${encodeURIComponent(chain)}`,
  deployInventory: `${SALVA_API_URL}/api/pool/deploy-Inv`,
  estimateInventoryFee: `${SALVA_API_URL}/api/user/estimate-deploy-Inv-fee`,
  withdraw: `${SALVA_API_URL}/api/pool/withdraw`,
  estimateWithdrawFee: `${SALVA_API_URL}/api/user/estimate-withdraw-fee`,
  addLiquidity: `${SALVA_API_URL}/api/pool/add-liquidity`,
  estimateAddLiquidityFee: `${SALVA_API_URL}/api/user/estimate-add-liquidity-fee`,
  deleteInventory: `${SALVA_API_URL}/api/pool/delete-Inv`,
  updateSpread: `${SALVA_API_URL}/api/pool/update-spread`,
  estimateUpdateSpreadFee: `${SALVA_API_URL}/api/user/estimate-update-spread-fee`,
  upsertPair: `${SALVA_API_URL}/api/pool/pairs/upsert`,
};

const getUser = () => {
  try {
    const raw = localStorage.getItem('salva_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const getChain = (paramChain) =>
  String(paramChain || localStorage.getItem('salva_chain') || 'base')
    .trim()
    .toLowerCase();

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const display = (value) => formatDisplayNumber(value, 12);

const money = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n <= 0) return '₦0.00';
  if (n < 0.01) return '<₦0.01';
  const [i, d = ''] = n.toFixed(10).split('.');
  return `₦${Number(i).toLocaleString('en-US')}.${d.slice(0, 2)}`;
};

const usd2 = (value) => {
  const n = num(value);
  if (n <= 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  const [i, d = ''] = n.toFixed(10).split('.');
  return `$${Number(i).toLocaleString('en-US')}.${d.slice(0, 2)}`;
};

const shortAddress = (value) => (value ? `${value.slice(0, 7)}…${value.slice(-5)}` : '—');

const LOCAL_LOGOS = {
  NGNS: ngnLogo,
  SANT: santLogo,
};

const getLocalLogo = (symbol) => {
  const normalized = String(symbol || '')
    .trim()
    .toUpperCase();
  return LOCAL_LOGOS[normalized] || null;
};

const resolveAssetLogo = (symbol, logo) => getLocalLogo(symbol) || logo || null;

const normalizeLogo = (value) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized || null;
};

const normalizeAddress = (value) => {
  if (!value) return '';
  return String(value).trim().toLowerCase();
};

const buildAssetLogoIndex = (pairs) => {
  const byAddress = new Map();
  const bySymbol = new Map();

  (pairs || []).forEach((pair) => {
    const assets = [
      {
        symbol: pair?.baseSymbol,
        address: pair?.baseAddress,
        logo: pair?.baseLogo,
      },
      {
        symbol: pair?.quoteSymbol,
        address: pair?.quoteAddress,
        logo: pair?.quoteLogo,
      },
    ];

    assets.forEach(({ symbol, address, logo }) => {
      const normalizedSymbol = String(symbol || '')
        .trim()
        .toUpperCase();
      const normalizedAddress = normalizeAddress(address);
      const normalizedLogo = normalizeLogo(logo);

      if (!normalizedLogo) return;

      if (normalizedAddress && !byAddress.has(normalizedAddress)) {
        byAddress.set(normalizedAddress, normalizedLogo);
      }

      if (normalizedSymbol && !bySymbol.has(normalizedSymbol)) {
        bySymbol.set(normalizedSymbol, normalizedLogo);
      }
    });
  });

  return { byAddress, bySymbol };
};

const AssetLogo = ({ symbol, logo, address, size = 'h-9 w-9', className = '' }) => {
  const [failed, setFailed] = useState(false);
  const resolvedLogo = resolveAssetLogo(symbol, normalizeLogo(logo));
  const isNgNs = String(symbol || '').toUpperCase() === 'NGNS';

  useEffect(() => {
    setFailed(false);
  }, [resolvedLogo]);

  return (
    <div
      className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.10] bg-white/[0.055] shadow-[inset_0_0_12px_rgba(255,255,255,.04)] ${size} ${className}`}
    >
      {resolvedLogo && !failed ? (
        <img
          src={resolvedLogo}
          alt={symbol || 'Token'}
          className={`h-full w-full object-cover ${isNgNs ? 'scale-[2]' : ''}`}
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-[9px] font-black tracking-tight text-salvaGold">
          {String(symbol || '?')
            .slice(0, 3)
            .toUpperCase()}
        </span>
      )}
    </div>
  );
};

const PairLogo = ({
  baseSymbol,
  baseLogo,
  baseAddress,
  quoteSymbol,
  quoteLogo,
  quoteAddress,
  size = 'h-10 w-10',
}) => (
  <div className={`relative shrink-0 ${size}`}>
    <AssetLogo
      symbol={baseSymbol}
      logo={baseLogo}
      address={baseAddress}
      size="h-full w-full"
      className="relative z-10"
    />
    <div className="absolute -bottom-0.5 -right-0.5 z-20 flex h-[62%] w-[62%] items-center justify-center rounded-full bg-[#101116] p-[2px] shadow-lg">
      <AssetLogo
        symbol={quoteSymbol}
        logo={quoteLogo}
        address={quoteAddress}
        size="h-full w-full"
      />
    </div>
  </div>
);

const enrichInventoryAssets = (inventory, pairs) => {
  const baseAddress = normalizeAddress(
    inventory?.baseAddress ??
      inventory?.baseAssetAddress ??
      inventory?.baseTokenAddress ??
      inventory?.tokenAddress
  );
  const quoteAddress = normalizeAddress(
    inventory?.quoteAddress ?? inventory?.quoteAssetAddress ?? inventory?.quoteTokenAddress
  );

  const baseSymbol = String(inventory?.baseSymbol || inventory?.base || '')
    .trim()
    .toUpperCase();
  const quoteSymbol = String(inventory?.quoteSymbol || inventory?.quote || '')
    .trim()
    .toUpperCase();

  const { byAddress, bySymbol } = buildAssetLogoIndex(pairs);

  const baseLogo =
    getLocalLogo(baseSymbol) ||
    normalizeLogo(inventory?.baseLogo) ||
    byAddress.get(baseAddress) ||
    bySymbol.get(baseSymbol) ||
    null;

  const quoteLogo =
    getLocalLogo(quoteSymbol) ||
    normalizeLogo(inventory?.quoteLogo) ||
    byAddress.get(quoteAddress) ||
    bySymbol.get(quoteSymbol) ||
    null;

  return {
    ...inventory,
    baseSymbol,
    quoteSymbol,
    baseAddress:
      inventory?.baseAddress ?? inventory?.baseAssetAddress ?? inventory?.baseTokenAddress ?? null,
    quoteAddress:
      inventory?.quoteAddress ??
      inventory?.quoteAssetAddress ??
      inventory?.quoteTokenAddress ??
      null,
    baseLogo,
    quoteLogo,
  };
};

// Identity of an asset: lowercase address, or symbol for native assets.
const assetKey = (asset) =>
  asset?.address
    ? String(asset.address).trim().toLowerCase()
    : `native:${String(asset?.symbol || '').toUpperCase()}`;

// De-duplicates by identity and sorts by symbol.
const uniqueAssets = (list) => {
  const map = new Map();
  list.forEach((asset) => {
    if (!asset?.symbol) return;
    const key = assetKey(asset);
    if (!map.has(key)) map.set(key, asset);
  });
  return Array.from(map.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
};

const parseResponse = async (response) => {
  const text = await response.text();
  let data = null;

  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid server response (${response.status})`);
  }

  if (!response.ok || data?.status === false || data?.success === false) {
    throw new Error(
      data?.errorMsg || data?.message || data?.error || `Request failed (${response.status})`
    );
  }

  return data;
};

const verifyPin = async (email, pin) => {
  const response = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin }),
  });
  const data = await parseResponse(response);
  if (!data?.success) throw new Error('Invalid PIN');
  return pin;
};

const Modal = ({ children, onClose, danger = false, wide = false }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-2.5 sm:p-5">
    <motion.button
      aria-label="Close modal"
      className="absolute inset-0 bg-black/80 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    />
    <motion.div
      className={`relative w-full ${
        wide ? 'max-w-2xl' : 'max-w-md'
      } overflow-hidden rounded-[24px] border ${
        danger ? 'border-red-500/20' : 'border-white/[0.09]'
      } bg-[#0b0c10]/[.98] shadow-2xl`}
      initial={{ opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.985 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div
        className={`h-px bg-gradient-to-r from-transparent ${
          danger ? 'via-red-500/60' : 'via-salvaGold/70'
        } to-transparent`}
      />
      {children}
    </motion.div>
  </div>
);

const TxStatusModal = ({ title, message, detail, onDone }) => (
  <Modal onClose={onDone}>
    <motion.div
      className="p-6 text-center sm:p-7"
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.div
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.08, type: 'spring', stiffness: 380, damping: 22 }}
        className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10"
      >
        <Check className="h-7 w-7 text-emerald-400" strokeWidth={2.5} />
      </motion.div>
      <p className="mt-4 text-[8px] font-black uppercase tracking-[.32em] text-emerald-400/70">
        Transaction complete
      </p>
      <h3 className="mt-1.5 text-xl font-black tracking-tight">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-[11px] leading-relaxed text-white/45">{message}</p>
      {detail && <p className="mt-2 text-[9px] font-bold text-white/45">{detail}</p>}
      <button
        onClick={onDone}
        className="mt-6 w-full rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black transition hover:brightness-110"
      >
        Continue
      </button>
    </motion.div>
  </Modal>
);

const PinModal = ({ title, subtitle, loading, onCancel, onVerified }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    if (pin.length !== 4) return;
    setError('');
    try {
      await onVerified(pin);
    } catch (error) {
      setError(error?.message || 'PIN verification failed');
    }
  };

  return (
    <Modal onClose={() => !loading && onCancel()}>
      <div className="p-5 text-center sm:p-7">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-salvaGold/20 bg-salvaGold/10">
          <LockKeyhole className="h-5 w-5 text-salvaGold" />
        </div>
        <p className="text-[8px] font-black uppercase tracking-[.32em] text-salvaGold/65">
          Secure action
        </p>
        <h3 className="mt-1 text-lg font-black">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-[11px] leading-relaxed text-white/70">
          {subtitle}
        </p>

        <input
          autoFocus
          value={pin}
          type="password"
          inputMode="numeric"
          maxLength={4}
          placeholder="••••"
          onChange={(event) => {
            setError('');
            setPin(event.target.value.replace(/\D/g, ''));
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          className="mt-5 w-full rounded-xl border border-white/10 bg-white/[0.035] px-3 py-3 text-center text-2xl font-black tracking-[.65em] text-white outline-none transition focus:border-salvaGold/45"
        />

        {error && (
          <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2 text-[11px] font-bold text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl border border-white/10 py-3 text-xs font-black text-white/60 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading || pin.length !== 4}
            className="rounded-xl bg-salvaGold py-3 text-xs font-black text-black disabled:opacity-40"
          >
            {loading ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Verify PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

const FeeSummary = ({ fee, title = 'Estimated network fee', loading = false }) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <CircleDollarSign className="h-3.5 w-3.5 text-salvaGold" />
        <p className="text-[8px] font-black uppercase tracking-[.25em] text-white/65">{title}</p>
      </div>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-salvaGold" />}
    </div>
    <div className="mt-2 flex items-end justify-between">
      <p className="text-base font-black text-white">{money(fee?.feeNGN)}</p>
      <p className="text-[9px] font-bold text-emerald-400">≈ {usd2(fee?.feeUsd)}</p>
    </div>
  </div>
);

const PairSelect = ({ label, value, options, onChange, disabledKey }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = options.filter((option) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${option.symbol} ${option.address || ''}`.toLowerCase().includes(q);
  });

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <div>
      <label className="mb-1.5 block text-[8px] font-black uppercase tracking-[.25em] text-white/45">
        {label}
      </label>

      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-3 text-left transition duration-200 hover:border-salvaGold/30 hover:bg-white/[0.045]"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          {value ? (
            <AssetLogo
              symbol={value.symbol}
              logo={value.logo}
              address={value.address}
              size="h-8 w-8"
            />
          ) : (
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.035]">
              <WalletCards className="h-3.5 w-3.5 text-white/65" />
            </div>
          )}

          <div className="min-w-0">
            <p className="text-xs font-black text-white">
              {value?.symbol || `Select ${label.toLowerCase()}`}
            </p>
            {value?.address && (
              <p className="mt-0.5 truncate font-mono text-[8px] text-white/45">
                {shortAddress(value.address)}
              </p>
            )}
          </div>
        </div>

        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-white/45" />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-[260] flex items-center justify-center p-3 sm:p-5">
            <motion.button
              aria-label="Close asset picker"
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={close}
            />

            <motion.div
              className="relative flex max-h-[min(620px,88vh)] w-full max-w-md flex-col overflow-hidden rounded-[26px] border border-white/[0.09] bg-[#0b0c10] shadow-2xl"
              initial={{ opacity: 0, y: 18, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/70 to-transparent" />

              <div className="flex items-center justify-between gap-3 p-4 pb-3">
                <div>
                  <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/70">
                    Asset selector
                  </p>
                  <h3 className="mt-1 text-lg font-black">{label}</h3>
                </div>

                <button
                  type="button"
                  onClick={close}
                  className="rounded-lg border border-white/10 p-2 text-white/45 transition hover:text-white"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="px-4 pb-3">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2.5 focus-within:border-salvaGold/35">
                  <Search className="h-4 w-4 shrink-0 text-white/70" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search symbol or address…"
                    className="w-full bg-transparent text-xs font-bold text-white outline-none placeholder:text-white/65"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="text-white/70 hover:text-white"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                {filtered.length === 0 ? (
                  <div className="px-4 py-12 text-center text-[10px] font-bold text-white/70">
                    No assets match “{query}”
                  </div>
                ) : (
                  <motion.div layout className="space-y-1">
                    {filtered.map((option) => {
                      const disabled = Boolean(disabledKey) && assetKey(option) === disabledKey;
                      const selected = Boolean(value) && assetKey(value) === assetKey(option);

                      return (
                        <motion.button
                          layout
                          key={assetKey(option)}
                          type="button"
                          disabled={disabled}
                          onClick={() => {
                            if (!disabled) {
                              onChange(option);
                              close();
                            }
                          }}
                          className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition duration-150 hover:bg-white/[0.05] disabled:opacity-20"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <AssetLogo
                              symbol={option.symbol}
                              logo={option.logo}
                              address={option.address}
                              size="h-10 w-10"
                            />

                            <div className="min-w-0">
                              <p className="text-[11px] font-black text-white">{option.symbol}</p>
                              <p className="mt-0.5 truncate font-mono text-[8px] text-white/45">
                                {option.address ? shortAddress(option.address) : 'Native asset'}
                              </p>
                            </div>
                          </div>

                          {selected && <Check className="h-4 w-4 shrink-0 text-salvaGold" />}
                        </motion.button>
                      );
                    })}
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const InventoryCard = ({ inventory, onWithdraw, onAddLiquidity, onUpdateSpread, onDelete }) => {
  const change = num(inventory.priceChangePct);
  const hasChange = Number.isFinite(change) && inventory.priceChangePct !== null;
  const up = change > 0;
  const down = change < 0;

  // Display only the token symbols supplied by the pool API.
  const baseSymbol = String(inventory.baseSymbol || inventory.base || '')
    .trim()
    .toUpperCase();
  const quoteSymbol = String(inventory.quoteSymbol || inventory.quote || '')
    .trim()
    .toUpperCase();

  const baseAddress =
    inventory.baseAddress ?? inventory.baseAssetAddress ?? inventory.baseTokenAddress ?? null;

  const quoteAddress =
    inventory.quoteAddress ?? inventory.quoteAssetAddress ?? inventory.quoteTokenAddress ?? null;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="group overflow-hidden rounded-[20px] border border-white/[0.07] bg-[#101116]/85 transition hover:border-salvaGold/15"
    >
      <div className="p-3.5 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PairLogo
              baseSymbol={baseSymbol}
              baseLogo={inventory.baseLogo}
              baseAddress={baseAddress}
              quoteSymbol={quoteSymbol}
              quoteLogo={inventory.quoteLogo}
              quoteAddress={quoteAddress}
              size="h-11 w-11"
            />

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-black text-white">
                  {baseSymbol}
                  <span className="mx-1 text-white/65">/</span>
                  {quoteSymbol}
                </h3>
              </div>

              <p className="mt-0.5 text-[9px] font-medium text-white/65">
                Selling {baseSymbol} for {quoteSymbol}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onDelete}
            title="Delete inventory"
            className="rounded-lg border border-white/[0.07] p-2 text-white/70 transition hover:border-red-500/20 hover:bg-red-500/5 hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1.35fr_1fr]">
          <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[8px] font-black uppercase tracking-[.25em] text-white/45">
                  Live oracle price
                </p>

                <p className="mt-0.5 truncate text-xl font-black tracking-[-.03em]">
                  {truncateDisplay(inventory.currentPriceFull)}
                </p>

                <p className="mt-0.5 text-[9px] font-medium text-white/65">
                  {quoteSymbol} per 1 {baseSymbol}
                </p>
              </div>

              {hasChange && (
                <div
                  className={`shrink-0 rounded-lg px-2 py-1 text-[9px] font-black ${
                    up
                      ? 'bg-emerald-500/10 text-emerald-400'
                      : down
                      ? 'bg-red-500/10 text-red-400'
                      : 'bg-white/5 text-white/65'
                  }`}
                >
                  {up ? (
                    <TrendingUp className="mr-1 inline h-3 w-3" />
                  ) : down ? (
                    <TrendingDown className="mr-1 inline h-3 w-3" />
                  ) : null}
                  {change > 0 ? '+' : ''}
                  {change.toFixed(2)}%
                </div>
              )}
            </div>

            <div className="mt-2.5 grid gap-2 border-t border-white/[0.05] pt-2.5 sm:grid-cols-2">
              <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-2.5 py-2">
                <span className="text-[8px] font-bold text-white/45">Acquisition floor</span>
                <p className="mt-0.5 text-[9px] font-black text-salvaGold">
                  {inventory.floorDisplay || display(inventory.floorFull)} {quoteSymbol}/
                  {baseSymbol}
                </p>
              </div>

              <div className="rounded-lg border border-salvaGold/10 bg-salvaGold/[0.025] px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[8px] font-bold text-white/45">Spread</span>
                  <span className="text-[7px] font-black uppercase tracking-[.18em] text-salvaGold/55">
                    Pricing
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] font-black text-white">
                  {inventory.spread === null ||
                  inventory.spread === undefined ||
                  inventory.spread === ''
                    ? '—'
                    : `${inventory.spread}%`}
                </p>
              </div>
            </div>
          </div>

          {/* Side by side on mobile, stacked on larger screens. */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <AssetLogo
                  symbol={baseSymbol}
                  logo={inventory.baseLogo}
                  address={baseAddress}
                  size="h-6 w-6"
                />
                <p className="min-w-0 truncate text-[10px] font-black text-white">{baseSymbol}</p>
              </div>

              <p className="mt-2 truncate text-xs font-black text-white">
                {truncateDisplay(inventory.baseAssetBalanceFull)}
              </p>
            </div>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <AssetLogo
                  symbol={quoteSymbol}
                  logo={inventory.quoteLogo}
                  address={quoteAddress}
                  size="h-6 w-6"
                />
                <p className="min-w-0 truncate text-[10px] font-black text-white">{quoteSymbol}</p>
              </div>

              <p className="mt-2 truncate text-xs font-black text-white">
                {truncateDisplay(inventory.quoteAssetBalanceFull)}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex gap-2">
          <button
            type="button"
            onClick={onAddLiquidity}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-2.5 text-[10px] font-black text-black transition hover:brightness-110"
          >
            <Plus className="h-3.5 w-3.5" />
            Add liquidity
          </button>

          <button
            type="button"
            onClick={onWithdraw}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white/[0.055] py-2.5 text-[10px] font-black transition hover:bg-white/[0.09]"
          >
            <ArrowDownToLine className="h-3.5 w-3.5" />
            Withdraw
          </button>

          <button
            type="button"
            onClick={onUpdateSpread}
            title="Update spread"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-salvaGold/15 bg-salvaGold/5 px-3 py-2.5 text-[10px] font-black text-salvaGold transition hover:border-salvaGold/30 hover:bg-salvaGold/10"
          >
            <Pencil className="h-3.5 w-3.5" />
            Spread
          </button>

          <div className="hidden items-center rounded-xl border border-white/[0.06] px-2.5 text-[8px] font-black text-white/55 sm:flex">
            {inventory.allowedSwapBelowFloor ? 'Below floor: on' : 'Floor protected'}
          </div>
        </div>
      </div>
    </motion.article>
  );
};

const SpreadEditorModal = ({ inventory, onCancel, onSubmit, submitting }) => {
  const currentSpread = inventory?.spread ?? inventory?.spreadPct ?? inventory?.spreadPercent ?? '';
  const [spread, setSpread] = useState(
    currentSpread === null || currentSpread === undefined ? '' : String(currentSpread)
  );
  const [error, setError] = useState('');

  const submit = () => {
    const normalized = String(spread ?? '').trim();
    if (!normalized || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) {
      return setError('Enter a valid spread, e.g. -10, -0.5, 0.5 or 10.');
    }

    setError('');
    onSubmit(normalized);
  };

  const currentLabel =
    currentSpread === null || currentSpread === undefined || currentSpread === ''
      ? 'Not available'
      : `${currentSpread}%`;

  return (
    <Modal onClose={submitting ? undefined : onCancel}>
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
              Pricing control
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <PairLogo
                baseSymbol={inventory.baseSymbol}
                baseLogo={inventory.baseLogo}
                quoteSymbol={inventory.quoteSymbol}
                quoteLogo={inventory.quoteLogo}
                size="h-9 w-9"
              />
              <h3 className="truncate text-lg font-black">
                Edit {inventory.baseSymbol}/{inventory.quoteSymbol}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg border border-white/10 p-2 text-white/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/45">
                Current spread
              </p>
              <p className="mt-1 text-sm font-black text-white">{currentLabel}</p>
            </div>
            <div className="rounded-lg border border-salvaGold/15 bg-salvaGold/5 px-2.5 py-1.5 text-[8px] font-black uppercase tracking-widest text-salvaGold">
              Live pricing
            </div>
          </div>
          <p className="mt-2 text-[9px] leading-relaxed text-white/55">
            This changes the signed pricing adjustment for this inventory only. Your acquisition
            floor and liquidity remain untouched.
          </p>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
              New spread
            </label>
            <span className="text-[8px] font-bold text-white/35">% adjustment</span>
          </div>

          <div className="relative">
            <input
              autoFocus
              type="number"
              step="any"
              value={spread}
              onChange={(event) => {
                setError('');
                setSpread(event.target.value);
              }}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder="e.g. -0.5 or 1"
              className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 pr-10 text-sm font-black text-white outline-none focus:border-salvaGold/40"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/45">
              %
            </span>
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {['-10', '-1', '-0.5', '0', '0.5', '1', '10'].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setError('');
                  setSpread(value);
                }}
                className={`rounded-lg border px-2 py-1.5 text-[8px] font-black transition ${
                  String(spread) === value
                    ? 'border-salvaGold/30 bg-salvaGold/10 text-salvaGold'
                    : 'border-white/[0.07] bg-white/[0.02] text-white/55 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                {value}%
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[10px] font-bold text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:cursor-wait disabled:opacity-50"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Preparing update…
            </>
          ) : (
            <>
              Review spread update
              <ArrowUpRight className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>
    </Modal>
  );
};

const SpreadUpdateConfirmModal = ({
  inventory,
  spread,
  fee,
  estimating,
  updating,
  onCancel,
  onConfirm,
}) => (
  <Modal onClose={updating ? undefined : onCancel}>
    <div className="p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10">
          <TrendingUp className="h-4 w-4 text-salvaGold" />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
            Review pricing change
          </p>
          <h3 className="text-lg font-black">Update spread</h3>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="flex items-center gap-2.5">
          <PairLogo
            baseSymbol={inventory.baseSymbol}
            baseLogo={inventory.baseLogo}
            quoteSymbol={inventory.quoteSymbol}
            quoteLogo={inventory.quoteLogo}
            size="h-9 w-9"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-black">
              {inventory.baseSymbol}/{inventory.quoteSymbol}
            </p>
            <p className="mt-0.5 text-[8px] text-white/45">This inventory only</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-1.5">
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-2.5">
            <p className="text-[7px] font-black uppercase tracking-[.2em] text-white/40">Current</p>
            <p className="mt-1 text-sm font-black text-white/60">
              {inventory.spread === null ||
              inventory.spread === undefined ||
              inventory.spread === ''
                ? '—'
                : `${inventory.spread}%`}
            </p>
          </div>
          <div className="rounded-xl border border-salvaGold/15 bg-salvaGold/5 p-2.5">
            <p className="text-[7px] font-black uppercase tracking-[.2em] text-salvaGold/60">New</p>
            <p className="mt-1 text-sm font-black text-salvaGold">{spread}%</p>
          </div>
        </div>

        <p className="mt-3 text-[9px] leading-relaxed text-white/55">
          The update changes the inventory's pricing adjustment without moving its acquisition floor
          or transferring any tokens.
        </p>
      </div>

      <div className="mt-3">
        <FeeSummary fee={fee} title="Estimated update fee" loading={estimating} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={updating}
          className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60 disabled:opacity-40"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={updating || estimating || !fee}
          className="rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:opacity-40"
        >
          {updating ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Update spread'}
        </button>
      </div>
    </div>
  </Modal>
);

const InfoPopover = ({ title, children, onClose }) => (
  <div className="fixed inset-0 z-[280] flex items-center justify-center p-4">
    <button
      type="button"
      aria-label={`Close ${title} information`}
      className="absolute inset-0 bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    />
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-yellow-400/20 bg-[#0b0c10] shadow-2xl"
      initial={{ opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 10, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="h-px bg-gradient-to-r from-transparent via-yellow-400/60 to-transparent" />
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-400 text-black">
            <Info className="h-4 w-4" strokeWidth={2.5} />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-black text-white">{title}</h4>
            <div className="mt-1.5 text-[10px] leading-relaxed text-white/65">{children}</div>
          </div>
        </div>
      </div>
    </motion.div>
  </div>
);

const CHAINLINK_FEEDS_URL = 'https://docs.chain.link/data-feeds/price-feeds/addresses';

const ConfigField = ({
  label,
  required = false,
  value,
  onChange,
  placeholder,
  hint,
  mono = false,
  disabled = false,
  action = null,
}) => (
  <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex items-center gap-1.5">
      <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
        {label}
      </label>
      {required ? (
        <span className="text-[9px] font-black text-red-400">*</span>
      ) : (
        <span className="text-[8px] font-bold text-white/35">optional</span>
      )}
      {action}
    </div>
    <input
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck="false"
      autoComplete="off"
      className={`mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 text-xs font-black text-white outline-none placeholder:text-white/30 focus:border-salvaGold/40 disabled:opacity-50 ${
        mono ? 'font-mono text-[10px]' : ''
      }`}
    />
    {hint && <div className="mt-1.5 text-[8px] leading-relaxed text-white/45">{hint}</div>}
  </div>
);

const DeployInventoryModal = ({ pairs, loadingPairs, chain, onCancel, onSubmit, onConfigSave }) => {
  const [view, setView] = useState('market'); // 'market' | 'config'
  const [cfg, setCfg] = useState({
    baseSymbol: '',
    quoteSymbol: '',
    baseAddress: '',
    quoteAddress: '',
    baseLogo: '',
    quoteLogo: '',
    priceFeed: '',
  });
  const [cfgError, setCfgError] = useState('');
  const [cfgSaving, setCfgSaving] = useState(false);
  const setCfgField = (key) => (event) => {
    setCfgError('');
    setCfg((current) => ({ ...current, [key]: event.target.value }));
  };
  const [base, setBase] = useState(null);
  const [quote, setQuote] = useState(null);
  const [floor, setFloor] = useState('');
  const [spread, setSpread] = useState('');
  const [amount, setAmount] = useState('');
  const [allowSwapBelowFloor, setAllowSwapBelowFloor] = useState(false);
  const [infoOpen, setInfoOpen] = useState(null);
  const [error, setError] = useState('');
  const [marketPrice, setMarketPrice] = useState(null);
  const [marketPriceLoading, setMarketPriceLoading] = useState(false);

  // Every asset from every pair, whether it is a base or a quote, once each.
  // Both selectors use this same list.
  const assetOptions = useMemo(
    () =>
      uniqueAssets(
        pairs.flatMap((p) => [
          {
            symbol: p.baseSymbol,
            address: p.baseAddress,
            logo: p.baseLogo,
          },
          {
            symbol: p.quoteSymbol,
            address: p.quoteAddress,
            logo: p.quoteLogo,
          },
        ])
      ),
    [pairs]
  );

  // RECEIVE list: every quote asset, once. Once a sell asset is chosen,
  // only quotes that actually pair with it are shown.
  const receiveOptions = useMemo(() => {
    const source = base
      ? pairs.filter(
          (p) => assetKey({ symbol: p.baseSymbol, address: p.baseAddress }) === assetKey(base)
        )
      : pairs;
    return uniqueAssets(
      source.map((p) => ({
        symbol: p.quoteSymbol,
        address: p.quoteAddress,
        logo: p.quoteLogo,
      }))
    );
  }, [pairs, base]);

  // Changing the sell asset clears the receive asset if that pair doesn't exist.
  const handleBaseChange = (option) => {
    setBase(option);
    setQuote((current) => {
      if (!current) return null;
      const valid = pairs.some(
        (p) =>
          assetKey({ symbol: p.baseSymbol, address: p.baseAddress }) === assetKey(option) &&
          assetKey({ symbol: p.quoteSymbol, address: p.quoteAddress }) === assetKey(current)
      );
      return valid ? current : null;
    });
  };

  const priceReady =
    Boolean(base && quote) &&
    !marketPriceLoading &&
    marketPrice !== null &&
    Number.isFinite(marketPrice) &&
    marketPrice > 0;

  useEffect(() => {
    if (!base?.symbol || !quote?.symbol || assetKey(base) === assetKey(quote)) {
      setMarketPrice(null);
      setMarketPriceLoading(false);
      return undefined;
    }

    let cancelled = false;
    setMarketPrice(null);
    setMarketPriceLoading(true);

    fetch(API.assetPrice(base.symbol.toUpperCase(), quote.symbol.toUpperCase(), chain), {
      headers: { Accept: 'application/json' },
    })
      .then(parseResponse)
      .then((data) => {
        if (cancelled) return;
        const price = Number(data?.data?.price ?? data?.price);
        setMarketPrice(Number.isFinite(price) && price > 0 ? price : null);
      })
      .catch(() => {
        if (!cancelled) setMarketPrice(null);
      })
      .finally(() => {
        if (!cancelled) setMarketPriceLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [base, quote, chain]);

  const saveConfig = async () => {
    if (cfgSaving) return;

    const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
    const URL_RE = /^https?:\/\/\S+$/i;

    const baseSymbol = cfg.baseSymbol.trim().toUpperCase();
    const quoteSymbol = cfg.quoteSymbol.trim().toUpperCase();
    const baseAddress = cfg.baseAddress.trim();
    const quoteAddress = cfg.quoteAddress.trim();
    const priceFeed = cfg.priceFeed.trim();
    const baseLogo = cfg.baseLogo.trim();
    const quoteLogo = cfg.quoteLogo.trim();

    if (!baseSymbol || !quoteSymbol)
      return setCfgError('Enter both the asset to sell and the asset to buy.');
    if (baseSymbol === quoteSymbol)
      return setCfgError('The asset to sell and the asset to buy must be different.');
    if (!ADDRESS_RE.test(baseAddress))
      return setCfgError('Enter a valid base token address (0x followed by 40 characters).');
    if (!ADDRESS_RE.test(quoteAddress))
      return setCfgError('Enter a valid quote token address (0x followed by 40 characters).');
    if (baseAddress.toLowerCase() === quoteAddress.toLowerCase())
      return setCfgError('Base and quote addresses must be different.');
    if (!ADDRESS_RE.test(priceFeed))
      return setCfgError('Enter a valid price feed address.');
    if (baseLogo && !URL_RE.test(baseLogo))
      return setCfgError('Base logo must be a link starting with http:// or https://');
    if (quoteLogo && !URL_RE.test(quoteLogo))
      return setCfgError('Quote logo must be a link starting with http:// or https://');

    setCfgError('');
    setCfgSaving(true);

    try {
      await onConfigSave({
        baseSymbol,
        quoteSymbol,
        baseAddress,
        quoteAddress,
        priceFeed,
        baseLogo: baseLogo || undefined,
        quoteLogo: quoteLogo || undefined,
      });

      // Continue the normal Add market flow with the configured assets filled in.
      setBase({
        symbol: baseSymbol,
        address: baseAddress.toLowerCase(),
        logo: baseLogo || null,
      });
      setQuote({
        symbol: quoteSymbol,
        address: quoteAddress.toLowerCase(),
        logo: quoteLogo || null,
      });
      setError('');
      setCfg({
        baseSymbol: '',
        quoteSymbol: '',
        baseAddress: '',
        quoteAddress: '',
        baseLogo: '',
        quoteLogo: '',
        priceFeed: '',
      });
      setView('market');
    } catch (saveError) {
      setCfgError(saveError?.message || 'Could not save this configuration.');
    } finally {
      setCfgSaving(false);
    }
  };

  const submit = () => {
    if (!base || !quote) return setError('Select both assets.');
    if (assetKey(base) === assetKey(quote))
      return setError('Base and quote assets must be different.');
    if (!priceReady)
      return setError('Price is unavailable for this pair, so it cannot be published.');
    if (!floor || num(floor) <= 0) return setError('Enter a valid acquisition price.');
    if (!amount || num(amount) <= 0) return setError('Enter an inventory amount.');

    const normalizedSpread = String(spread ?? '').trim();
    if (!normalizedSpread || !/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalizedSpread)) {
      return setError('Enter a valid spread, e.g. -10, -0.5, 0.5 or 10.');
    }

    setError('');
    onSubmit({
      base,
      quote,
      floor,
      spread: String(normalizedSpread),
      amount,
      allowSwapBelowFloor,
    });
  };

  return (
    <Modal wide onClose={cfgSaving ? undefined : onCancel}>
      {view === 'config' ? (
        <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
                Custom market
              </p>
              <h3 className="mt-1 text-xl font-black">Add config</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-white/65">
                Register a trading pair that is not listed yet. When it is saved you will return to
                the market form with these assets already filled in.
              </p>
            </div>
            <button
              type="button"
              onClick={() => !cfgSaving && setView('market')}
              disabled={cfgSaving}
              className="rounded-lg border border-white/10 p-2 text-white/60 disabled:opacity-40"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ConfigField
              label="Asset to sell (base) symbol"
              required
              value={cfg.baseSymbol}
              onChange={setCfgField('baseSymbol')}
              placeholder="e.g. ETH"
              disabled={cfgSaving}
            />
            <ConfigField
              label="Asset to buy (quote) symbol"
              required
              value={cfg.quoteSymbol}
              onChange={setCfgField('quoteSymbol')}
              placeholder="e.g. NGNS"
              disabled={cfgSaving}
            />
            <ConfigField
              label="Base token address"
              required
              mono
              value={cfg.baseAddress}
              onChange={setCfgField('baseAddress')}
              placeholder="0x…"
              disabled={cfgSaving}
            />
            <ConfigField
              label="Quote token address"
              required
              mono
              value={cfg.quoteAddress}
              onChange={setCfgField('quoteAddress')}
              placeholder="0x…"
              disabled={cfgSaving}
            />
            <ConfigField
              label="Base logo URL"
              value={cfg.baseLogo}
              onChange={setCfgField('baseLogo')}
              placeholder="https://…"
              disabled={cfgSaving}
            />
            <ConfigField
              label="Quote logo URL"
              value={cfg.quoteLogo}
              onChange={setCfgField('quoteLogo')}
              placeholder="https://…"
              disabled={cfgSaving}
            />
            <div className="sm:col-span-2">
              <ConfigField
                label="price feed"
                required
                mono
                value={cfg.priceFeed}
                onChange={setCfgField('priceFeed')}
                placeholder="0x… feed contract address"
                disabled={cfgSaving}
                action={
                  <button
                    type="button"
                    aria-label="What is a price feed?"
                    onClick={() => setInfoOpen('feed')}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-black transition hover:scale-105"
                  >
                    <Info className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                }
                hint={
                  <>
                    Search the pair as{' '}
                    <span className="font-black text-white/70">BASE / QUOTE</span> (base = asset you
                    sell, quote = asset you buy) on{' '}
                    <a
                      href={CHAINLINK_FEEDS_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-black text-salvaGold underline underline-offset-2"
                    >
                      price feed addresses
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                    , then paste the feed address here.
                  </>
                }
              />
            </div>
          </div>

          {cfgError && (
            <p className="mt-3 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[10px] font-bold text-red-400">
              {cfgError}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setView('market')}
              disabled={cfgSaving}
              className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60 disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={saveConfig}
              disabled={cfgSaving}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:cursor-wait disabled:opacity-50"
            >
              {cfgSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  Save & continue
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
                New market
              </p>
              <h3 className="mt-1 text-xl font-black">Publish inventory</h3>
              <p className="mt-1 text-[10px] leading-relaxed text-white/65">
                Configure the asset you sell, the asset you receive and your cost basis.
              </p>
            </div>
            <button
              onClick={onCancel}
              className="rounded-lg border border-white/10 p-2 text-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-salvaGold/15 bg-salvaGold/[0.04] p-3">
            <p className="text-[9px] leading-relaxed text-white/65">
              Pair not listed? Register your own market first.
            </p>
            <button
              type="button"
              onClick={() => setView('config')}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-salvaGold px-3 py-2 text-[9px] font-black uppercase tracking-widest text-black transition hover:brightness-110"
            >
              <Plus className="h-3.5 w-3.5" />
              Add config
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <PairSelect
              label="You sell"
              value={base}
              options={assetOptions}
              onChange={setBase}
              disabledKey={quote ? assetKey(quote) : null}
            />
            <PairSelect
              label="You receive"
              value={quote}
              options={assetOptions}
              onChange={setQuote}
              disabledKey={base ? assetKey(base) : null}
            />
          </div>

          {loadingPairs ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-salvaGold" />
            </div>
          ) : (
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
                    Acquisition price
                  </label>
                  <button
                    type="button"
                    aria-label="What is acquisition price?"
                    onClick={() => setInfoOpen('acquisition')}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-black transition hover:scale-105"
                  >
                    <Info className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                </div>
                {base && quote && (
                  <p
                    className={`mt-1 text-[8px] font-bold ${
                      marketPriceLoading
                        ? 'text-white/70'
                        : priceReady
                        ? 'text-emerald-400'
                        : 'text-red-400'
                    }`}
                  >
                    {marketPriceLoading
                      ? 'Fetching market price…'
                      : priceReady
                      ? `Oracle ${display(marketPrice)} ${quote.symbol}`
                      : 'Price unavailable for this pair. You cannot continue.'}
                  </p>
                )}
                <div className="relative mt-2">
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={floor}
                    onChange={(event) => setFloor(event.target.value)}
                    placeholder="e.g. 1500"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 pr-16 text-xs font-black text-white outline-none focus:border-salvaGold/40"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-white/45">
                    QUOTE/BASE
                  </span>
                </div>
                <p className="mt-1.5 text-[8px] leading-relaxed text-white/45">
                  Your cost basis for one unit of the asset you sell.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <div className="flex items-center gap-1.5">
                  <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
                    Spread
                  </label>
                  <button
                    type="button"
                    aria-label="What is spread?"
                    onClick={() => setInfoOpen('spread')}
                    className="flex h-4 w-4 items-center justify-center rounded-full bg-yellow-400 text-black transition hover:scale-105"
                  >
                    <Info className="h-2.5 w-2.5" strokeWidth={3} />
                  </button>
                </div>
                <div className="relative mt-2">
                  <input
                    type="number"
                    step="any"
                    value={spread}
                    onChange={(event) => setSpread(event.target.value)}
                    placeholder="e.g. -0.5 or 1"
                    className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 pr-10 text-xs font-black text-white outline-none focus:border-salvaGold/40"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-white/45">
                    %
                  </span>
                </div>
                <p className="mt-1.5 text-[8px] leading-relaxed text-white/45">
                  Signed price adjustment. Positive values increase the spread; negative values
                  reduce it.
                </p>
              </div>

              <div className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
                <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
                  Inventory amount
                </label>
                <input
                  type="number"
                  min="0"
                  step="any"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="Amount to sell"
                  className="mt-2 w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 text-xs font-black text-white outline-none focus:border-salvaGold/40"
                />
                <p className="mt-1.5 text-[8px] leading-relaxed text-white/45">
                  This amount is transferred into the pool.
                </p>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setAllowSwapBelowFloor((value) => !value)}
            className={`mt-2 flex w-full items-center justify-between rounded-xl border p-3 text-left transition ${
              allowSwapBelowFloor
                ? 'border-emerald-500/20 bg-emerald-500/5'
                : 'border-white/[0.07] bg-white/[0.02]'
            }`}
          >
            <div className="pr-3">
              <p
                className={`text-[10px] font-black ${
                  allowSwapBelowFloor ? 'text-emerald-400' : 'text-white'
                }`}
              >
                Allow swaps below acquisition floor
              </p>
              <p className="mt-0.5 text-[8px] leading-relaxed text-white/55">
                {allowSwapBelowFloor
                  ? 'The pool continues quoting at your protected floor.'
                  : 'Trades are blocked below the protected floor.'}
              </p>
            </div>
            <span
              className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 ${
                allowSwapBelowFloor ? 'bg-emerald-500' : 'bg-white/10'
              }`}
            >
              <span
                className={`h-4 w-4 rounded-full bg-white transition ${
                  allowSwapBelowFloor ? 'translate-x-4' : ''
                }`}
              />
            </span>
          </button>

          {error && (
            <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[10px] font-bold text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={submit}
            disabled={loadingPairs || Boolean(base && quote && !priceReady)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:opacity-40"
          >
            Continue to review <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <AnimatePresence>
        {infoOpen === 'feed' && (
          <InfoPopover title="price feed" onClose={() => setInfoOpen(null)}>
            <p>
              A price feed is an on-chain oracle contract that publishes the live market
              price of one asset in terms of another. Salva reads it to price your market.
            </p>
            <p className="mt-2 font-black text-white/80">How to find it</p>
            <ol className="mt-1 list-decimal space-y-1 pl-4">
              <li>
                Open{' '}
                <a
                  href={CHAINLINK_FEEDS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-black text-salvaGold underline underline-offset-2"
                >
                  price feed addresses
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
                .
              </li>
              <li>
                Select the network that matches this market (currently{' '}
                <span className="font-black capitalize text-white/80">{chain}</span>).
              </li>
              <li>
                Search the pair as <span className="font-black text-white/80">BASE / QUOTE</span>.
                The base is the asset you sell and the quote is the asset you buy, for example ETH /
                USD.
              </li>
              <li>Copy the feed's contract address from that row and paste it into this field.</li>
            </ol>
          </InfoPopover>
        )}

        {infoOpen === 'acquisition' && (
          <InfoPopover title="Acquisition price" onClose={() => setInfoOpen(null)}>
            The acquisition price is your cost basis for one unit of the asset you sell. It is
            expressed in the quote asset per base asset and is used as the protected floor for this
            inventory.
          </InfoPopover>
        )}

        {infoOpen === 'spread' && (
          <InfoPopover title="Spread" onClose={() => setInfoOpen(null)}>
            Spread controls the signed price adjustment around your acquisition price. Use a
            positive value such as 0.5 or 10 to move the quoted price upward, or a negative value
            such as -0.5 or -10 to move it downward.
          </InfoPopover>
        )}
      </AnimatePresence>
    </Modal>
  );
};

const InventoryConfirmModal = ({ draft, fee, estimating, deploying, onCancel, onDeploy }) => (
  <Modal wide onClose={deploying ? undefined : onCancel}>
    <div className="p-4 sm:p-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10">
          <ShieldCheck className="h-4 w-4 text-salvaGold" />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
            Review market
          </p>
          <div>
            <h3 className="text-lg font-black">Ready to publish</h3>
            <div className="mt-2 flex items-center gap-2">
              <PairLogo
                baseSymbol={draft.base.symbol}
                baseLogo={draft.base.logo}
                quoteSymbol={draft.quote.symbol}
                quoteLogo={draft.quote.logo}
                size="h-9 w-9"
              />
              <span className="text-[11px] font-black text-white">
                {draft.base.symbol}/{draft.quote.symbol}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {[
          ['Sell', draft.base.symbol],
          ['Receive', draft.quote.symbol],
          ['Floor', `${display(draft.floor)} ${draft.quote.symbol}/${draft.base.symbol}`],
          ['Spread', `${draft.spread}%`],
          ['Inventory', `${display(draft.amount)} ${draft.base.symbol}`],
          ['Below floor', draft.allowSwapBelowFloor ? 'Allowed' : 'Blocked'],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-2.5">
            <p className="text-[7px] font-black uppercase tracking-[.2em] text-white/45">{label}</p>
            <p className="mt-1 text-[10px] font-black text-white">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-3">
        <FeeSummary fee={fee} loading={estimating} title="Deployment fee" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={onCancel}
          disabled={deploying}
          className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60"
        >
          Back
        </button>
        <button
          onClick={onDeploy}
          disabled={estimating || deploying || !fee}
          className="rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:opacity-40"
        >
          {deploying ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Publish inventory'}
        </button>
      </div>
    </div>
  </Modal>
);

const WithdrawModal = ({ inventory, onCancel, onSubmit, withdrawing }) => {
  const [asset, setAsset] = useState('base');
  const [assetOpen, setAssetOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');

  // CRITICAL: `full` is used for Max + validation. `shown` is presentation-only.
  const options = [
    {
      key: 'base',
      symbol: inventory.baseSymbol,
      logo: inventory.baseLogo,
      address: inventory.baseAddress,
      full: String(inventory.baseAssetBalanceFull ?? inventory.baseAssetBalance ?? '0'),
      shown: inventory.baseAssetBalanceDisplay ?? display(inventory.baseAssetBalanceFull),
    },
    {
      key: 'quote',
      symbol: inventory.quoteSymbol,
      logo: inventory.quoteLogo,
      address: inventory.quoteAddress,
      full: String(inventory.quoteAssetBalanceFull ?? inventory.quoteAssetBalance ?? '0'),
      shown: inventory.quoteAssetBalanceDisplay ?? display(inventory.quoteAssetBalanceFull),
    },
  ];
  const selected = options.find((option) => option.key === asset);
  const symbol = selected.symbol;
  const fullBalance = selected.full;
  const displayBalance = selected.shown;

  const submit = () => {
    if (!amount || num(amount) <= 0) return setError('Enter a valid withdrawal amount.');
    if (num(amount) > num(fullBalance))
      return setError(`Amount exceeds the pool's ${symbol} balance.`);
    setError('');
    onSubmit({ asset: symbol, amount });
  };

  return (
    <Modal onClose={withdrawing ? undefined : onCancel}>
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
              Withdraw liquidity
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <PairLogo
                baseSymbol={inventory.baseSymbol}
                baseLogo={inventory.baseLogo}
                quoteSymbol={inventory.quoteSymbol}
                quoteLogo={inventory.quoteLogo}
                size="h-9 w-9"
              />
              <h3 className="text-lg font-black">
                {inventory.baseSymbol}
                <span className="mx-1 text-white/65">/</span>
                {inventory.quoteSymbol}
              </h3>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={withdrawing}
            className="rounded-lg border border-white/10 p-2 text-white/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
          <label className="mb-1.5 block text-[8px] font-black uppercase tracking-[.25em] text-white/60">
            Asset to withdraw
          </label>
          <button
            type="button"
            onClick={() => setAssetOpen((open) => !open)}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.08] bg-black/20 px-3 py-2.5 text-left transition hover:border-salvaGold/30"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <AssetLogo
                symbol={selected.symbol}
                logo={selected.logo}
                address={selected.address}
                size="h-7 w-7"
              />
              <div className="min-w-0">
                <p className="text-xs font-black text-white">{selected.symbol}</p>
                <p className="mt-0.5 truncate text-[8px] text-white/45">
                  Available: {selected.shown}
                </p>
              </div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 text-white/45 transition ${
                assetOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {assetOpen && (
            <div className="mt-1 space-y-1 rounded-xl border border-white/[0.08] bg-[#101116] p-1">
              {options.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => {
                    setAsset(option.key);
                    setAmount('');
                    setError('');
                    setAssetOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left transition hover:bg-white/[0.05]"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AssetLogo
                      symbol={option.symbol}
                      logo={option.logo}
                      address={option.address}
                      size="h-7 w-7"
                    />
                    <div className="min-w-0">
                      <p className="text-[11px] font-black text-white">{option.symbol}</p>
                      <p className="mt-0.5 truncate text-[8px] text-white/45">
                        Available: {option.shown}
                      </p>
                    </div>
                  </div>
                  {option.key === asset && <Check className="h-4 w-4 shrink-0 text-salvaGold" />}
                </button>
              ))}
            </div>
          )}

          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
                Amount
              </label>
              <button
                type="button"
                onClick={() => {
                  setAmount(fullBalance);
                  setError('');
                }}
                disabled={num(fullBalance) <= 0}
                className="rounded-md border border-salvaGold/20 bg-salvaGold/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-salvaGold transition hover:bg-salvaGold/10 disabled:opacity-30"
              >
                Max
              </button>
            </div>

            <div className="relative">
              <input
                autoFocus
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => {
                  setError('');
                  setAmount(event.target.value);
                }}
                onKeyDown={(event) => event.key === 'Enter' && submit()}
                placeholder="0.00"
                className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 pr-16 text-sm font-black text-white outline-none focus:border-salvaGold/40"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/55">
                {symbol}
              </span>
            </div>
            <p className="mt-1.5 text-[8px] text-white/45">
              Available: {displayBalance} {symbol}
            </p>
          </div>
        </div>

        {error && (
          <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[10px] font-bold text-red-400">
            {error}
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            disabled={withdrawing}
            className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={withdrawing}
            className="rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:opacity-40"
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
};

const AddLiquidityAmountModal = ({ inventory, onCancel, onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const balance = num(
    inventory.baseWalletBalanceFull ?? inventory.baseWalletBalance ?? inventory.userBaseBalance ?? 0
  );

  const submit = async () => {
    if (submitting) return;

    const value = num(amount);
    if (!amount || !Number.isFinite(value) || value <= 0)
      return setError(`Enter a valid ${inventory.baseSymbol} amount.`);
    if (balance > 0 && value > balance)
      return setError(`Amount exceeds your ${inventory.baseSymbol} wallet balance.`);

    setError('');
    onSubmit({ amount });
  };

  return (
    <Modal onClose={submitting ? undefined : onCancel}>
      <div className="p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
              Add liquidity
            </p>
            <div className="mt-1 flex items-center gap-2.5">
              <PairLogo
                baseSymbol={inventory.baseSymbol}
                baseLogo={inventory.baseLogo}
                quoteSymbol={inventory.quoteSymbol}
                quoteLogo={inventory.quoteLogo}
                size="h-9 w-9"
              />
              <h3 className="text-lg font-black">
                Fund {inventory.baseSymbol}/{inventory.quoteSymbol}
              </h3>
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-white/65">
              Add {inventory.baseSymbol} liquidity to this pool.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded-lg border border-white/10 p-2 text-white/60"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <p className="text-[7px] font-black uppercase tracking-[.2em] text-white/45">
            Destination
          </p>
          <p className="mt-1 truncate font-mono text-[9px] font-bold text-white/55">
            {inventory.poolAddress || 'Pool address'}
          </p>
          <div className="mt-2 flex items-center gap-2">
            <AssetLogo symbol={inventory.baseSymbol} logo={inventory.baseLogo} size="h-6 w-6" />
            <p className="text-[9px] font-bold text-white/70">{inventory.baseSymbol}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-[8px] font-black uppercase tracking-[.25em] text-white/60">
              Amount
            </label>
            {balance > 0 && (
              <button
                type="button"
                onClick={() => {
                  setAmount(String(balance));
                  setError('');
                }}
                className="rounded-md border border-salvaGold/20 bg-salvaGold/5 px-2 py-1 text-[8px] font-black uppercase tracking-widest text-salvaGold hover:bg-salvaGold/10"
              >
                Max
              </button>
            )}
          </div>
          <div className="relative">
            <input
              autoFocus
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => {
                setError('');
                setAmount(event.target.value);
              }}
              onKeyDown={(event) => event.key === 'Enter' && submit()}
              placeholder="0.00"
              className="w-full rounded-xl border border-white/[0.08] bg-black/20 px-3 py-3 pr-16 text-sm font-black text-white outline-none focus:border-salvaGold/40"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black text-white/55">
              {inventory.baseSymbol}
            </span>
          </div>
          {balance > 0 && (
            <p className="mt-1.5 text-[8px] text-white/45">
              Wallet balance: {display(balance)} {inventory.baseSymbol}
            </p>
          )}
        </div>

        {error && (
          <p className="mt-2 rounded-xl border border-red-500/20 bg-red-500/5 p-2.5 text-[10px] font-bold text-red-400">
            {error}
          </p>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:cursor-wait disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Estimating fee…
            </>
          ) : (
            'continue'
          )}
        </button>
      </div>
    </Modal>
  );
};

const AddLiquidityConfirmModal = ({
  inventory,
  draft,
  fee,
  estimating,
  sending,
  onCancel,
  onConfirm,
}) => (
  <Modal onClose={sending ? undefined : onCancel}>
    <div className="p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10">
          <ShieldCheck className="h-4 w-4 text-salvaGold" />
        </div>
        <div>
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
            Final confirmation
          </p>
          <h3 className="text-lg font-black">Add liquidity</h3>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
        <div className="mb-3 flex items-center gap-2.5">
          <PairLogo
            baseSymbol={inventory.baseSymbol}
            baseLogo={inventory.baseLogo}
            quoteSymbol={inventory.quoteSymbol}
            quoteLogo={inventory.quoteLogo}
            size="h-9 w-9"
          />
          <span className="text-[11px] font-black text-white">
            {inventory.baseSymbol}/{inventory.quoteSymbol}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[8px] uppercase tracking-[.22em] text-white/55">Amount</span>
          <span className="flex items-center gap-1.5 text-sm font-black">
            <AssetLogo symbol={inventory.baseSymbol} logo={inventory.baseLogo} size="h-5 w-5" />
            {draft.amount} {inventory.baseSymbol}
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[8px] uppercase tracking-[.22em] text-white/55">Pool</span>
          <span className="max-w-[65%] truncate font-mono text-[9px] font-bold text-white/45">
            {inventory.poolAddress}
          </span>
        </div>
      </div>

      <div className="mt-3">
        <FeeSummary fee={fee} title="Add liquidity fee" loading={estimating} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          onClick={onCancel}
          disabled={sending}
          className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60 disabled:opacity-40"
        >
          Back
        </button>
        <button
          onClick={onConfirm}
          disabled={sending || estimating || !fee}
          className="rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black disabled:opacity-40"
        >
          {sending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Confirm & send'}
        </button>
      </div>
    </div>
  </Modal>
);

const DeleteInventoryModal = ({ inventory, onCancel, onDelete }) => {
  const hasBalance =
    num(inventory.baseAssetBalanceFull ?? inventory.baseAssetBalance) > 0 ||
    num(inventory.quoteAssetBalanceFull ?? inventory.quoteAssetBalance) > 0;

  return (
    <Modal danger onClose={onCancel}>
      <div className="p-5 sm:p-6">
        <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
          <AlertTriangle className="h-5 w-5 text-red-400" />
        </div>
        <div className="text-center">
          <p className="text-[8px] font-black uppercase tracking-[.3em] text-red-400/70">
            Destructive action
          </p>
          <div className="mt-1 flex items-center justify-center gap-2.5">
            <PairLogo
              baseSymbol={inventory.baseSymbol}
              baseLogo={inventory.baseLogo}
              quoteSymbol={inventory.quoteSymbol}
              quoteLogo={inventory.quoteLogo}
              size="h-10 w-10"
            />
            <h3 className="text-lg font-black">
              Delete {inventory.baseSymbol}/{inventory.quoteSymbol}?
            </h3>
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-white/70">
            The inventory record will be removed. Remaining pool balances are not automatically
            withdrawn.
          </p>
        </div>

        {hasBalance && (
          <div className="mt-4 rounded-xl border border-yellow-500/15 bg-yellow-500/5 p-3">
            <p className="text-[10px] font-black text-yellow-400">Funds detected</p>
            <p className="mt-0.5 text-[9px] leading-relaxed text-yellow-100/45">
              This market still has a base or quote balance.
            </p>
          </div>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={onCancel}
            className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60"
          >
            Cancel
          </button>
          <button
            onClick={onDelete}
            className="rounded-xl bg-red-500 py-3 text-[10px] font-black text-white"
          >
            Continue
          </button>
        </div>
      </div>
    </Modal>
  );
};

const CopyToast = ({ toast }) => (
  <motion.div
    initial={{ opacity: 0, y: -28 }}
    animate={{ opacity: 1, y: 0 }}
    exit={{ opacity: 0, y: -28 }}
    transition={{ type: 'spring', stiffness: 420, damping: 32 }}
    className="pointer-events-none fixed inset-x-0 top-4 z-[300] flex justify-center px-4"
  >
    <div
      className={`flex items-center gap-2.5 rounded-2xl border bg-[#0b0c10] px-4 py-3 shadow-2xl ${
        toast.type === 'error' ? 'border-red-500/30' : 'border-emerald-400/25'
      }`}
    >
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-full ${
          toast.type === 'error'
            ? 'bg-red-500/15 text-red-400'
            : 'bg-emerald-400/15 text-emerald-400'
        }`}
      >
        {toast.type === 'error' ? (
          <X className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        )}
      </div>
      <p className="text-[11px] font-black text-white">{toast.message}</p>
    </div>
  </motion.div>
);

const PoolInventories = () => {
  const { safeAddress, chain: routeChain, poolAddress: routePoolAddress } = useParams();
  const navigate = useNavigate();
  const user = getUser();
  const chain = getChain(routeChain);
  const poolAddress = String(routePoolAddress || '').toLowerCase();

  const cached = readPoolCache(user?.email, chain);
  const cachedPool = cached?.pools?.find(
    (pool) => String(pool.poolAddress || '').toLowerCase() === poolAddress
  );

  const [pool, setPool] = useState(cachedPool || null);
  const [loading, setLoading] = useState(!cachedPool);
  const [refreshing, setRefreshing] = useState(false);

  const [pairs, setPairs] = useState([]);
  const [pairsLoading, setPairsLoading] = useState(false);
  const [deployModal, setDeployModal] = useState(false);
  const [draft, setDraft] = useState(null);
  const [deployPinOpen, setDeployPinOpen] = useState(false);
  const [deployPinBusy, setDeployPinBusy] = useState(false);
  const [deployPkey, setDeployPkey] = useState(null);
  const [deployFee, setDeployFee] = useState(null);
  const [deployFeeLoading, setDeployFeeLoading] = useState(false);
  const [deployConfirmOpen, setDeployConfirmOpen] = useState(false);
  const [deploying, setDeploying] = useState(false);
  const [txResult, setTxResult] = useState(null);

  const [withdrawInventory, setWithdrawInventory] = useState(null);
  const [withdrawDraft, setWithdrawDraft] = useState(null);
  const [withdrawPinOpen, setWithdrawPinOpen] = useState(false);
  const [withdrawPinBusy, setWithdrawPinBusy] = useState(false);
  const [withdrawPkey, setWithdrawPkey] = useState(null);
  const [withdrawFee, setWithdrawFee] = useState(null);
  const [withdrawFeeLoading, setWithdrawFeeLoading] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const [addLiquidityInventory, setAddLiquidityInventory] = useState(null);
  const [addLiquidityPinOpen, setAddLiquidityPinOpen] = useState(false);
  const [addLiquidityPinBusy, setAddLiquidityPinBusy] = useState(false);
  const [addLiquidityPkey, setAddLiquidityPkey] = useState(null);
  const [addLiquidityDraft, setAddLiquidityDraft] = useState(null);
  const [addLiquidityFee, setAddLiquidityFee] = useState(null);
  const [addLiquidityFeeLoading, setAddLiquidityFeeLoading] = useState(false);
  const [addLiquidityConfirmOpen, setAddLiquidityConfirmOpen] = useState(false);
  const [addingLiquidity, setAddingLiquidity] = useState(false);

  const [deleteInventory, setDeleteInventory] = useState(null);
  const [deletePinOpen, setDeletePinOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const [spreadInventory, setSpreadInventory] = useState(null);
  const [spreadValue, setSpreadValue] = useState(null);
  const [spreadPinOpen, setSpreadPinOpen] = useState(false);
  const [spreadPinBusy, setSpreadPinBusy] = useState(false);
  const [spreadPkey, setSpreadPkey] = useState(null);
  const [spreadFee, setSpreadFee] = useState(null);
  const [spreadFeeLoading, setSpreadFeeLoading] = useState(false);
  const [spreadConfirmOpen, setSpreadConfirmOpen] = useState(false);
  const [updatingSpread, setUpdatingSpread] = useState(false);

  const mounted = useRef(true);
  const requestRef = useRef(null);

  const [copyToast, setCopyToast] = useState(null);
  const copyTimerRef = useRef(null);

  const copyText = useCallback(async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyToast({ message: `${label} copied`, type: 'success' });
    } catch {
      setCopyToast({ message: 'Could not copy', type: 'error' });
    }
    clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopyToast(null), 2200);
  }, []);

  useEffect(() => () => clearTimeout(copyTimerRef.current), []);

  const refreshPool = useCallback(
    async ({ force = false } = {}) => {
      if (!user?.email || !safeAddress) return;
      if (requestRef.current && !force) return;
      if (requestRef.current && force) requestRef.current.abort();

      const controller = new AbortController();
      requestRef.current = controller;
      if (force) setRefreshing(true);

      try {
        const snapshot = await fetchPoolSnapshot(user.email, safeAddress, chain, {
          signal: controller.signal,
        });
        const nextPool = snapshot?.pools?.find(
          (item) => String(item.poolAddress || '').toLowerCase() === poolAddress
        );

        if (mounted.current) {
          setPool(nextPool || null);
          setLoading(false);
        }
      } catch (error) {
        if (error?.name !== 'AbortError')
          console.warn('[PoolInventories] poll failed:', error?.message || error);
      } finally {
        if (requestRef.current === controller) requestRef.current = null;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [user?.email, safeAddress, chain, poolAddress]
  );

  const readPoolFromCache = useCallback(() => {
    const snapshot = readPoolCache(user?.email, chain);
    const nextPool = snapshot?.pools?.find(
      (item) => String(item.poolAddress || '').toLowerCase() === poolAddress
    );
    if (mounted.current) setPool(nextPool || null);
  }, [user?.email, chain, poolAddress]);

  useEffect(() => {
    mounted.current = true;
    readPoolFromCache();
    refreshPool();

    const tick = () => {
      if (document.visibilityState === 'visible') refreshPool();
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      mounted.current = false;
      requestRef.current?.abort();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [readPoolFromCache, refreshPool]);

  const loadPairs = useCallback(async () => {
    setPairsLoading(true);
    try {
      const response = await fetch(API.supportedPairs(chain), {
        headers: { Accept: 'application/json' },
      });
      const data = await parseResponse(response);

      const raw =
        data?.data?.pairs ??
        data?.data?.supportedPairs ??
        data?.pairs ??
        data?.supportedPairs ??
        data?.data ??
        data;

      const list = Array.isArray(raw) ? raw : [];
      const mySafe = String(safeAddress || '')
        .trim()
        .toLowerCase();

      // Visible: Salva pairs (owner missing / empty / zero address) or this merchant's own pairs.
      const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
      const visibleList = list.filter((pair) => {
        const owner = String(pair?.ownerSafeAddress || '')
          .trim()
          .toLowerCase();
        if (!owner || owner === ZERO_ADDRESS) return true;
        return Boolean(mySafe) && owner === mySafe;
      });

      const normalized = visibleList
        .map((pair) => ({
          baseSymbol: String(pair?.baseSymbol || pair?.base || '').toUpperCase(),
          quoteSymbol: String(pair?.quoteSymbol || pair?.quote || '').toUpperCase(),
          baseAddress: pair?.baseAddress ?? pair?.baseAssetAddress ?? null,
          quoteAddress: pair?.quoteAddress ?? pair?.quoteAssetAddress ?? null,
          baseLogo: normalizeLogo(pair?.baseLogo),
          quoteLogo: normalizeLogo(pair?.quoteLogo),
        }))
        .filter((pair) => pair.baseSymbol && pair.quoteSymbol);

      setPairs(normalized);
    } catch (error) {
      setPairs([]);
      console.warn('[PoolInventories] pair fetch failed:', error?.message || error);
    } finally {
      setPairsLoading(false);
    }
  }, [chain, safeAddress]);

  useEffect(() => {
    loadPairs();
  }, [loadPairs]);

  // Registers a user-defined pair in the DB, then refreshes the supported pairs list.
  // Throws on failure so the config card can show the server's message.
  const saveSupportedPair = async (payload) => {
    const response = await fetch(API.upsertPair, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, chain, ownerSafeAddress: safeAddress }),
    });
    await parseResponse(response);
    await loadPairs();
  };

  const estimateDeployFee = async (pkey, nextDraft) => {
    setDeployFeeLoading(true);
    try {
      const response = await fetch(API.estimateInventoryFee, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safe: safeAddress,
          pin: pkey,
          poolAddress,
          base: nextDraft.base.symbol.toUpperCase(),
          quote: nextDraft.quote.symbol.toUpperCase(),
          floor: nextDraft.floor,
          spread: String(nextDraft.spread),
          amount: nextDraft.amount,
          allowSwapBelowFloor: nextDraft.allowSwapBelowFloor,
          chain,
        }),
      });

      const data = await parseResponse(response);
      const fee = {
        feeNGN: data?.data?.feeNGN ?? data?.feeNGN,
        feeUsd: data?.data?.feeUsd ?? data?.data?.feeUSD ?? data?.feeUsd ?? data?.feeUSD,
      };

      if (fee.feeNGN === undefined && fee.feeUsd === undefined)
        throw new Error('Inventory fee estimate was not returned by the server');
      setDeployFee(fee);
      return fee;
    } finally {
      setDeployFeeLoading(false);
    }
  };

  const beginDeploy = (nextDraft) => {
    setDraft(nextDraft);
    setDeployModal(false);
    setDeployPinOpen(true);
  };

  const onDeployPinVerified = async (pin) => {
    setDeployPinBusy(true);
    try {
      const pkey = await verifyPin(user.email, pin);
      setDeployPkey(pkey);
      await estimateDeployFee(pkey, draft);
      setDeployPinOpen(false);
      setDeployConfirmOpen(true);
    } finally {
      setDeployPinBusy(false);
    }
  };

  const executeDeploy = async () => {
    if (!deployPkey || !draft) return;
    setDeploying(true);

    try {
      const response = await fetch(API.deployInventory, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: deployPkey,
          poolAddress,
          base: draft.base.symbol.toUpperCase(),
          quote: draft.quote.symbol.toUpperCase(),
          floor: draft.floor,
          spread: String(draft.spread),
          amount: draft.amount,
          allowSwapBelowFloor: draft.allowSwapBelowFloor,
          chain,
        }),
      });

      await parseResponse(response);
      setDeployConfirmOpen(false);
      setDeployPkey(null);
      setDraft(null);
      setDeployFee(null);
      setTxResult({
        title: 'Inventory published',
        message: 'Your market is now live and the inventory has been submitted successfully.',
        detail: `${draft.base.symbol}/${draft.quote.symbol}`,
      });
    } catch (error) {
      console.warn('[PoolInventories] inventory deployment failed:', error?.message || error);
    } finally {
      setDeploying(false);
    }
  };

  const beginWithdraw = (inventory) => {
    setWithdrawInventory(inventory);
    setWithdrawDraft(null);
    setWithdrawFee(null);
  };

  const submitWithdrawForm = (nextDraft) => {
    setWithdrawDraft(nextDraft);
    setWithdrawPinOpen(true);
  };

  const onWithdrawPinVerified = async (pin) => {
    setWithdrawPinBusy(true);
    setWithdrawFeeLoading(true);

    try {
      const pkey = await verifyPin(user.email, pin);
      setWithdrawPkey(pkey);

      const response = await fetch(API.estimateWithdrawFee, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safe: safeAddress,
          pin: pkey,
          poolAddress,
          base: withdrawInventory.baseSymbol.toUpperCase(),
          quote: withdrawInventory.quoteSymbol.toUpperCase(),
          assetOut: withdrawDraft.asset.toUpperCase(),
          amount: withdrawDraft.amount,
          chain,
        }),
      });

      const data = await parseResponse(response);
      const fee = {
        feeNGN: data?.data?.feeNGN ?? data?.feeNGN,
        feeUsd: data?.data?.feeUsd ?? data?.data?.feeUSD ?? data?.feeUsd ?? data?.feeUSD,
      };

      if (fee.feeNGN === undefined && fee.feeUsd === undefined)
        throw new Error('Withdrawal fee estimate was not returned by the server');

      setWithdrawFee(fee);
      setWithdrawPinOpen(false);
    } finally {
      setWithdrawPinBusy(false);
      setWithdrawFeeLoading(false);
    }
  };

  const executeWithdraw = async () => {
    if (!withdrawPkey || !withdrawDraft) return;
    setWithdrawing(true);

    try {
      const response = await fetch(API.withdraw, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: withdrawPkey,
          poolAddress,
          baseSymbol: withdrawInventory.baseSymbol.toUpperCase(),
          quoteSymbol: withdrawInventory.quoteSymbol.toUpperCase(),
          assetOutSymbol: withdrawDraft.asset.toUpperCase(),
          amount: withdrawDraft.amount,
          chain,
        }),
      });

      await parseResponse(response);
      setWithdrawPkey(null);
      setWithdrawFee(null);
      setWithdrawDraft(null);
      setWithdrawInventory(null);
      setTxResult({
        title: 'Withdrawal complete',
        message: 'Your withdrawal request was processed successfully.',
        detail: `${withdrawDraft.amount} ${withdrawDraft.asset}`,
      });
    } finally {
      setWithdrawing(false);
    }
  };

    const beginAddLiquidity = (inventory) => {
      setAddLiquidityInventory(inventory);
      setAddLiquidityDraft(null);
      setAddLiquidityFee(null);
      setAddLiquidityPkey(null);
      setAddLiquidityConfirmOpen(false);
      setAddLiquidityPinOpen(false);
    };

    const submitAddLiquidity = (nextDraft) => {
      if (!addLiquidityInventory) return;
      setAddLiquidityDraft(nextDraft);
      setAddLiquidityPinOpen(true);
    };

    const onAddLiquidityPinVerified = async (pin) => {
      if (!addLiquidityInventory || !addLiquidityDraft) return;
      setAddLiquidityPinBusy(true);
      setAddLiquidityFeeLoading(true);

      try {
        const pkey = await verifyPin(user.email, pin);
        setAddLiquidityPkey(pkey);

        const response = await fetch(API.estimateAddLiquidityFee, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safe: safeAddress,
            pin: pkey,
            poolAddress,
            base: addLiquidityInventory.baseSymbol.toUpperCase(),
            quote: addLiquidityInventory.quoteSymbol.toUpperCase(),
            amount: addLiquidityDraft.amount,
            chain,
          }),
        });

        const data = await parseResponse(response);
        const fee = {
          feeNGN: data?.data?.feeNGN ?? data?.feeNGN,
          feeUsd: data?.data?.feeUsd ?? data?.data?.feeUSD ?? data?.feeUsd ?? data?.feeUSD,
        };

        if (fee.feeNGN === undefined && fee.feeUsd === undefined)
          throw new Error('Add liquidity fee estimate was not returned by the server');

        setAddLiquidityFee(fee);
        setAddLiquidityPinOpen(false);
        setAddLiquidityConfirmOpen(true);
      } finally {
        setAddLiquidityPinBusy(false);
        setAddLiquidityFeeLoading(false);
      }
    };

    const executeAddLiquidity = async () => {
      if (!addLiquidityPkey || !addLiquidityDraft || !addLiquidityInventory) return;
      setAddingLiquidity(true);
      try {
        const response = await fetch(API.addLiquidity, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            pin: addLiquidityPkey,
            poolAddress,
            base: addLiquidityInventory.baseSymbol.toUpperCase(),
            quote: addLiquidityInventory.quoteSymbol.toUpperCase(),
            amount: addLiquidityDraft.amount,
            chain,
          }),
        });
        await parseResponse(response);
        const detail = `${addLiquidityDraft.amount} ${addLiquidityInventory.baseSymbol}`;
        setAddLiquidityConfirmOpen(false);
        setAddLiquidityPinOpen(false);
        setAddLiquidityPkey(null);
        setAddLiquidityDraft(null);
        setAddLiquidityFee(null);
        setAddLiquidityInventory(null);
        setTxResult({
          title: 'Liquidity added',
          message: 'Your liquidity has been added to this inventory successfully.',
          detail,
        });
      } catch (error) {
        clearTimeout(copyTimerRef.current);
        setCopyToast({ message: error?.message || 'Add liquidity failed', type: 'error' });
        copyTimerRef.current = setTimeout(() => setCopyToast(null), 2200);
      } finally {
        setAddingLiquidity(false);
      }
    };

  const beginUpdateSpread = (inventory) => {
    setSpreadInventory(inventory);
    setSpreadValue(null);
    setSpreadPkey(null);
    setSpreadFee(null);
    setSpreadConfirmOpen(false);
    setSpreadPinOpen(false);
  };

  const submitSpreadUpdate = (nextSpread) => {
    if (!spreadInventory) return;
    setSpreadValue(String(nextSpread));
    setSpreadPinOpen(true);
  };

  const onSpreadPinVerified = async (pin) => {
    if (!spreadInventory || spreadValue === null) return;
    setSpreadPinBusy(true);
    setSpreadFeeLoading(true);

    try {
      const pkey = await verifyPin(user.email, pin);
      setSpreadPkey(pkey);

      const response = await fetch(API.estimateUpdateSpreadFee, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safe: safeAddress,
          pin: pkey,
          poolAddress,
          base: spreadInventory.baseSymbol.toUpperCase(),
          quote: spreadInventory.quoteSymbol.toUpperCase(),
          spread: String(spreadValue),
          chain,
        }),
      });

      const data = await parseResponse(response);
      const fee = {
        feeNGN: data?.data?.feeNGN ?? data?.feeNGN,
        feeUsd: data?.data?.feeUsd ?? data?.data?.feeUSD ?? data?.feeUsd ?? data?.feeUSD,
      };

      if (fee.feeNGN === undefined && fee.feeUsd === undefined)
        throw new Error('Spread update fee estimate was not returned by the server');

      setSpreadFee(fee);
      setSpreadPinOpen(false);
      setSpreadConfirmOpen(true);
    } finally {
      setSpreadPinBusy(false);
      setSpreadFeeLoading(false);
    }
  };

  const executeSpreadUpdate = async () => {
    if (!spreadPkey || !spreadInventory || spreadValue === null) return;
    setUpdatingSpread(true);

    try {
      const response = await fetch(API.updateSpread, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: spreadPkey,
          poolAddress,
          base: spreadInventory.baseSymbol.toUpperCase(),
          quote: spreadInventory.quoteSymbol.toUpperCase(),
          spread: String(spreadValue),
          chain,
        }),
      });

      await parseResponse(response);

      const detail = `${spreadInventory.baseSymbol}/${spreadInventory.quoteSymbol} → ${spreadValue}%`;
      setSpreadConfirmOpen(false);
      setSpreadPinOpen(false);
      setSpreadPkey(null);
      setSpreadFee(null);
      setSpreadValue(null);
      setSpreadInventory(null);

      setTxResult({
        title: 'Spread updated',
        message: 'The inventory pricing adjustment has been updated successfully.',
        detail,
      });
    } finally {
      setUpdatingSpread(false);
    }
  };

  const executeDeleteInventory = async (pin) => {
    if (!deleteInventory) return;
    setDeleteBusy(true);

    try {
      const pkey = await verifyPin(user.email, pin);
      const response = await fetch(API.deleteInventory, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: pkey,
          poolAddress,
          base: deleteInventory.baseSymbol.toUpperCase(),
          quote: deleteInventory.quoteSymbol.toUpperCase(),
          chain,
        }),
      });

      await parseResponse(response);
      setDeletePinOpen(false);
      setDeleteInventory(null);
      setTxResult({
        title: 'Inventory removed',
        message: 'The inventory has been removed from this market successfully.',
      });
    } finally {
      setDeleteBusy(false);
    }
  };

  const currentInventories = useMemo(
    () =>
      Array.isArray(pool?.inventories)
        ? pool.inventories.map((inventory) => enrichInventoryAssets(inventory, pairs))
        : [],
    [pool?.inventories, pairs]
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#08090c] text-white">
      <Stars />

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 mx-auto max-w-4xl px-2.5 pb-24 pt-4 sm:px-6 sm:pt-8"
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              // Same as browser Back when there is history; fallback for direct links.
              if (window.history.state?.idx > 0) {
                navigate(-1);
              } else {
                navigate('/services', { state: { openService: 'deploy' }, replace: true });
              }
            }}
            className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.22em] text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Pools
          </button>

          <button
            onClick={() => refreshPool({ force: true })}
            disabled={refreshing}
            className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 text-white/60 hover:text-white disabled:opacity-40"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {loading ? (
          <div className="mt-5 space-y-2.5">
            <div className="h-28 animate-pulse rounded-[20px] bg-white/[0.025]" />
            <div className="h-52 animate-pulse rounded-[20px] bg-white/[0.025]" />
          </div>
        ) : !pool ? (
          <div className="mt-6 rounded-[22px] border border-dashed border-white/[0.08] px-5 py-14 text-center">
            <WalletCards className="mx-auto h-8 w-8 text-white/15" />
            <h2 className="mt-3 text-sm font-black">Pool not found</h2>
            <p className="mt-1.5 text-[10px] text-white/60">
              The cache and server do not currently contain this pool.
            </p>
          </div>
        ) : (
          <>
            <section className="relative mt-4 overflow-hidden rounded-[22px] border border-white/[0.07] bg-[#0d0f14]/90 p-4 sm:mt-6 sm:rounded-[28px] sm:p-6">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(245,183,60,.08),transparent_35%)]" />

              <div className="relative flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[8px] font-black uppercase tracking-[.32em] text-salvaGold/60">
                    Permissionless market
                  </p>
                  <button
                    onClick={() => copyText(pool.poolAddress, 'Address')}
                    className="mt-1 flex items-center gap-1.5 text-left"
                  >
                    <h1 className="truncate font-mono text-base font-black sm:text-xl">
                      {shortAddress(pool.poolAddress)}
                    </h1>
                    <Copy className="h-3.5 w-3.5 shrink-0 text-white/55" />
                  </button>
                  <p className="mt-1 text-[9px] text-white/55">
                    Configure inventory, liquidity and price protection for this venue.
                  </p>
                </div>

                <button
                  onClick={() => setDeployModal(true)}
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-salvaGold px-3 text-[9px] font-black uppercase tracking-widest text-black shadow-lg shadow-salvaGold/10"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add market
                </button>
              </div>

              <div className="relative mt-4 grid grid-cols-2 divide-x divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.06] bg-black/20">
                <div className="px-3 py-2.5">
                  <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/55">
                    Markets
                  </p>
                  <p className="mt-0.5 text-base font-black">{currentInventories.length}</p>
                </div>
                <div className="px-3 py-2.5">
                  <p className="text-[7px] font-black uppercase tracking-[.22em] text-white/55">
                    Chain
                  </p>
                  <p className="mt-0.5 text-base font-black capitalize">{chain}</p>
                </div>
              </div>
            </section>

            <section className="mt-5">
              <div className="mb-2 flex items-end justify-between">
                <div>
                  <h2 className="mt-0.5 text-base font-black">Published inventories</h2>
                </div>
              </div>

              {currentInventories.length === 0 ? (
                <div className="rounded-[20px] border border-dashed border-white/[0.08] px-5 py-14 text-center">
                  <WalletCards className="mx-auto h-8 w-8 text-white/15" />
                  <h3 className="mt-3 text-sm font-black">No inventory yet</h3>
                  <p className="mx-auto mt-1.5 max-w-sm text-[10px] leading-relaxed text-white/60">
                    Publish the first pair to make this market usable.
                  </p>
                  <button
                    onClick={() => setDeployModal(true)}
                    className="mt-4 rounded-lg bg-salvaGold px-3.5 py-2 text-[9px] font-black text-black"
                  >
                    Create inventory
                  </button>
                </div>
              ) : (
                <div className="grid gap-2.5">
                  <AnimatePresence initial={false}>
                    {currentInventories.map((inventory, index) => (
                      <InventoryCard
                        key={`${inventory.baseSymbol}-${inventory.quoteSymbol}-${index}`}
                        inventory={inventory}
                        onWithdraw={() => beginWithdraw(inventory)}
                        onAddLiquidity={() => beginAddLiquidity(inventory)}
                        onUpdateSpread={() => beginUpdateSpread(inventory)}
                        onDelete={() => setDeleteInventory(inventory)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </section>
          </>
        )}
      </motion.main>

      <AnimatePresence>
        {deployModal && (
          <DeployInventoryModal
            pairs={pairs}
            loadingPairs={pairsLoading}
            chain={chain}
            onCancel={() => setDeployModal(false)}
            onSubmit={beginDeploy}
            onConfigSave={saveSupportedPair}
          />
        )}

        {deployPinOpen && draft && (
          <PinModal
            title="Authorize inventory deployment"
            subtitle="Verify your PIN."
            loading={deployPinBusy || deployFeeLoading}
            onCancel={() => setDeployPinOpen(false)}
            onVerified={onDeployPinVerified}
          />
        )}

        {deployConfirmOpen && draft && (
          <InventoryConfirmModal
            draft={draft}
            fee={deployFee}
            estimating={deployFeeLoading}
            deploying={deploying}
            onCancel={() => {
              setDeployConfirmOpen(false);
              setDeployPkey(null);
            }}
            onDeploy={executeDeploy}
          />
        )}

        {withdrawInventory && !withdrawPinOpen && !withdrawFee && (
          <WithdrawModal
            inventory={withdrawInventory}
            withdrawing={withdrawing}
            onCancel={() => {
              setWithdrawInventory(null);
              setWithdrawDraft(null);
            }}
            onSubmit={submitWithdrawForm}
          />
        )}

        {withdrawPinOpen && withdrawInventory && (
          <PinModal
            title="Authorize withdrawal"
            subtitle="Verify your PIN."
            loading={withdrawPinBusy || withdrawFeeLoading}
            onCancel={() => setWithdrawPinOpen(false)}
            onVerified={onWithdrawPinVerified}
          />
        )}

        {withdrawFee && withdrawDraft && withdrawInventory && !withdrawPinOpen && (
          <Modal onClose={withdrawing ? undefined : () => setWithdrawFee(null)}>
            <div className="p-5 sm:p-6">
              <p className="text-[8px] font-black uppercase tracking-[.3em] text-salvaGold/60">
                Final confirmation
              </p>
              <h3 className="mt-1 text-lg font-black">
                Withdraw {withdrawDraft.amount} {withdrawDraft.asset}
              </h3>
              <div className="mt-2 flex items-center gap-2">
                <PairLogo
                  baseSymbol={withdrawInventory.baseSymbol}
                  baseLogo={withdrawInventory.baseLogo}
                  quoteSymbol={withdrawInventory.quoteSymbol}
                  quoteLogo={withdrawInventory.quoteLogo}
                  size="h-8 w-8"
                />
                <p className="text-[10px] font-bold text-white/75">
                  From {withdrawInventory.baseSymbol}/{withdrawInventory.quoteSymbol}
                </p>
              </div>

              <div className="mt-4">
                <FeeSummary fee={withdrawFee} title="Withdrawal fee" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  onClick={() => setWithdrawFee(null)}
                  disabled={withdrawing}
                  className="rounded-xl border border-white/10 py-3 text-[10px] font-black text-white/60"
                >
                  Back
                </button>
                <button
                  onClick={executeWithdraw}
                  disabled={withdrawing}
                  className="rounded-xl bg-salvaGold py-3 text-[10px] font-black text-black"
                >
                  {withdrawing ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : 'Withdraw'}
                </button>
              </div>
            </div>
          </Modal>
        )}

        {addLiquidityInventory && addLiquidityPinOpen && (
          <PinModal
            title={`Add ${addLiquidityInventory.baseSymbol} liquidity`}
            subtitle={`Verify your PIN to add ${addLiquidityInventory.baseSymbol} liquidity to this pool.`}
            loading={addLiquidityPinBusy || addLiquidityFeeLoading}
            onCancel={() => {
              if (addLiquidityPinBusy) return;
              setAddLiquidityPinOpen(false);
              setAddLiquidityPkey(null);
            }}
            onVerified={onAddLiquidityPinVerified}
          />
        )}

        {addLiquidityInventory && !addLiquidityPinOpen && !addLiquidityConfirmOpen && (
          <AddLiquidityAmountModal
            inventory={{ ...addLiquidityInventory, poolAddress }}
            onCancel={() => {
              setAddLiquidityInventory(null);
              setAddLiquidityPkey(null);
            }}
            onSubmit={submitAddLiquidity}
          />
        )}

        {addLiquidityInventory && addLiquidityConfirmOpen && (
          <AddLiquidityConfirmModal
            inventory={{ ...addLiquidityInventory, poolAddress }}
            draft={addLiquidityDraft}
            fee={addLiquidityFee}
            estimating={addLiquidityFeeLoading}
            sending={addingLiquidity}
            onCancel={() => setAddLiquidityConfirmOpen(false)}
            onConfirm={executeAddLiquidity}
          />
        )}

        {spreadInventory && !spreadPinOpen && !spreadConfirmOpen && (
          <SpreadEditorModal
            inventory={spreadInventory}
            submitting={false}
            onCancel={() => {
              setSpreadInventory(null);
              setSpreadValue(null);
              setSpreadFee(null);
              setSpreadPkey(null);
            }}
            onSubmit={submitSpreadUpdate}
          />
        )}

        {spreadPinOpen && spreadInventory && (
          <PinModal
            title="Authorize spread update"
            subtitle={`Verify your PIN to update the ${spreadInventory.baseSymbol}/${spreadInventory.quoteSymbol} pricing adjustment.`}
            loading={spreadPinBusy || spreadFeeLoading}
            onCancel={() => {
              if (spreadPinBusy || spreadFeeLoading) return;
              setSpreadPinOpen(false);
            }}
            onVerified={onSpreadPinVerified}
          />
        )}

        {spreadConfirmOpen && spreadInventory && spreadValue !== null && (
          <SpreadUpdateConfirmModal
            inventory={spreadInventory}
            spread={spreadValue}
            fee={spreadFee}
            estimating={spreadFeeLoading}
            updating={updatingSpread}
            onCancel={() => setSpreadConfirmOpen(false)}
            onConfirm={executeSpreadUpdate}
          />
        )}

        {deleteInventory && !deletePinOpen && (
          <DeleteInventoryModal
            inventory={deleteInventory}
            onCancel={() => setDeleteInventory(null)}
            onDelete={() => setDeletePinOpen(true)}
          />
        )}

        {deleteInventory && deletePinOpen && (
          <PinModal
            title="Authorize inventory deletion"
            subtitle="Verify your PIN to sign the inventory removal request."
            loading={deleteBusy}
            onCancel={() => setDeletePinOpen(false)}
            onVerified={executeDeleteInventory}
          />
        )}

        {txResult && (
          <TxStatusModal
            title={txResult.title}
            message={txResult.message}
            detail={txResult.detail}
            onDone={async () => {
              setTxResult(null);
              await refreshPool({ force: true });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {copyToast && <CopyToast key={copyToast.message} toast={copyToast} />}
      </AnimatePresence>
    </div>
  );
};

export default PoolInventories;
