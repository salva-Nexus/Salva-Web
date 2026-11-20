import { SALVA_API_URL } from '../config';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLocation, useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';
import ChainBadge from '../components/ChainBadge';

/* ============================================================================
   MANAGE ASSETS — SALVA
   Production-focused UI. Mobile sizing is ~20% smaller than desktop;
   `sm:` breakpoint classes restore the original desktop scale.
   API behaviour and payloads are unchanged.
============================================================================ */

const SEARCH_DEBOUNCE_MS = 450;

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

const truncateAddress = (address, start = 7, end = 5) => {
  if (!address) return '—';
  const value = String(address);
  if (value.length <= start + end + 1) return value;
  return `${value.slice(0, start)}…${value.slice(-end)}`;
};

const rowKey = (chain, tokenAddress) =>
  `${String(chain || '')
    .toLowerCase()
    .trim()}:${String(tokenAddress || '')
    .toLowerCase()
    .trim()}`;

const isValidAddress = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || '').trim());

/* ============================================================================
   ICONS — sized purely via className (w-/h- utilities), so every usage can
   carry its own mobile → sm: size pair.
============================================================================ */

const Icon = ({
  name,
  className = 'w-[14px] h-[14px] sm:w-[18px] sm:h-[18px]',
  strokeWidth = 1.8,
}) => {
  const paths = {
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4.2 4.2" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    arrowLeft: <path d="m15 18-6-6 6-6" />,
    arrowRight: <path d="m9 18 6-6-6-6" />,
    refresh: (
      <>
        <path d="M20 11a8.1 8.1 0 0 0-14.7-4.5L4 9" />
        <path d="M4 4v5h5" />
        <path d="M4 13a8.1 8.1 0 0 0 14.7 4.5L20 15" />
        <path d="M20 20v-5h-5" />
      </>
    ),
    x: <path d="M6 6l12 12M18 6 6 18" />,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M10 11v5M14 11v5" />
        <path d="M6 7l.8 12h10.4L18 7" />
        <path d="M9 7V4h6v3" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5.2-3.4 8.3-8 10-4.6-1.7-8-4.8-8-10V6l8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
};

/* ============================================================================
   MICRO UI
============================================================================ */

const Spinner = ({ small = false }) => (
  <span
    className={[
      'inline-block rounded-full border-2 border-white/15 border-t-salvaGold animate-spin',
      small ? 'h-2.5 w-2.5 sm:h-3 sm:w-3' : 'h-3 w-3 sm:h-4 sm:w-4',
    ].join(' ')}
    aria-hidden="true"
  />
);


const ModalShell = ({ open, children, onClose, mobileSheet = false }) => (
  <AnimatePresence>
    {open && (
      <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center">
        <motion.button
          type="button"
          aria-label="Close modal"
          className="absolute inset-0 cursor-default bg-black/80 backdrop-blur-xl"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        />

        <motion.div
          initial={mobileSheet ? { y: '100%', opacity: 0.8 } : { y: 18, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={mobileSheet ? { y: '100%', opacity: 0.8 } : { y: 18, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className={[
            'relative w-full overflow-hidden border border-white/10 bg-[#0d0d0f] shadow-[0_30px_100px_rgba(0,0,0,.65)]',
            mobileSheet
              ? 'rounded-t-[22px] sm:max-w-lg sm:rounded-[28px]'
              : 'max-w-md rounded-[22px] sm:rounded-[28px]',
          ].join(' ')}
        >
          {children}
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

const Notification = ({ notification, onClose }) => {
  const config = {
    success: { icon: 'check', label: 'Success', accent: '#D4AF37' },
    error: { icon: 'x', label: 'Error', accent: '#F87171' },
    info: { icon: 'shield', label: 'Notice', accent: '#60A5FA' },
    warning: { icon: 'shield', label: 'Warning', accent: '#FBBF24' },
  };

  useEffect(() => {
    if (!notification.show) return undefined;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [notification, onClose]);

  const current = config[notification.type] || config.info;

  return (
    <AnimatePresence>
      {notification.show && (
        <motion.div
          initial={{ opacity: 0, y: -18, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -18, scale: 0.97 }}
          className="fixed right-3 top-3 sm:right-4 sm:top-4 z-[180] w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 bg-[#101012]/95 shadow-2xl backdrop-blur-2xl">
            <div className="h-px" style={{ background: current.accent }} />

            <div className="flex items-start gap-2.5 sm:gap-3 p-3 sm:p-4">
              <div
                className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl"
                style={{
                  background: `${current.accent}12`,
                  color: current.accent,
                  border: `1px solid ${current.accent}28`,
                }}
              >
                <Icon name={current.icon} className="w-[13px] h-[13px] sm:w-[16px] sm:h-[16px]" />
              </div>

              <div className="min-w-0 flex-1">
                <p
                  className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: current.accent }}
                >
                  {current.label}
                </p>

                <p className="mt-0.5 sm:mt-1 text-[10px] sm:text-xs leading-4 sm:leading-5 text-white/75">
                  {notification.message}
                </p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1 text-white/25 transition hover:bg-white/5 hover:text-white"
                aria-label="Dismiss notification"
              >
                <Icon name="x" className="w-[12px] h-[12px] sm:w-[15px] sm:h-[15px]" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const ConfirmModal = ({
  open,
  title,
  message,
  confirmLabel,
  danger,
  loading,
  onConfirm,
  onCancel,
}) => (
  <ModalShell open={open} onClose={() => !loading && onCancel()}>
    <div className="p-5 sm:p-7">
      <div
        className={[
          'mb-4 sm:mb-5 flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl sm:rounded-2xl border',
          danger
            ? 'border-red-400/20 bg-red-400/10 text-red-400'
            : 'border-salvaGold/20 bg-salvaGold/10 text-salvaGold',
        ].join(' ')}
      >
        <Icon
          name={danger ? 'trash' : 'shield'}
          className="w-[15px] h-[15px] sm:w-[19px] sm:h-[19px]"
        />
      </div>

      <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">{title}</h3>

      <p className="mt-1.5 sm:mt-2 text-xs sm:text-sm leading-5 sm:leading-6 text-white/80">
        {message}
      </p>

      <div className="mt-5 sm:mt-7 grid grid-cols-2 gap-2.5 sm:gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={loading}
          className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] py-2.5 sm:py-3 text-xs sm:text-sm font-medium text-white/75 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className={[
            'flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl py-2.5 sm:py-3 text-xs sm:text-sm font-semibold transition disabled:opacity-40',
            danger
              ? 'bg-red-500 text-white hover:bg-red-400'
              : 'bg-salvaGold text-black hover:brightness-105',
          ].join(' ')}
        >
          {loading ? <Spinner small /> : confirmLabel}
        </button>
      </div>
    </div>
  </ModalShell>
);

const AssetLogo = ({ logo, symbol, chain, size = 'h-10 w-10 sm:h-12 sm:w-12' }) => {
  const [failed, setFailed] = useState(false);
  const localLogo = getLocalLogo(symbol);
  const resolvedLogo = localLogo || logo;
  const isNgNs = String(symbol || '').toUpperCase() === 'NGNS';

  useEffect(() => {
    setFailed(false);
  }, [resolvedLogo]);

  return (
    <div className={`relative shrink-0 ${size}`}>
      <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.055] shadow-inner">
        {resolvedLogo && !failed ? (
          <img
            src={resolvedLogo}
            alt={symbol || 'Token'}
            className={`h-full w-full object-cover ${isNgNs ? 'scale-[2]' : ''}`}
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="text-[10px] sm:text-xs font-bold tracking-tight text-salvaGold">
            {String(symbol || '?')
              .slice(0, 3)
              .toUpperCase()}
          </span>
        )}
      </div>

      {chain && <ChainBadge chain={chain} className="w-3 h-3 sm:w-4 sm:h-4" ringColor="#0b0b0d" />}
    </div>
  );
};

/* ============================================================================
   ASSET ROW
============================================================================ */

const AssetRow = ({ asset, chain, busy, onAdd, onRemove }) => {
  const owned = Boolean(asset._owned);
  const removable = Boolean(asset._removable);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="group flex items-center gap-2.5 sm:gap-3 border-b border-white/[0.055] px-3 py-3 sm:px-5 sm:py-4 transition hover:bg-white/[0.025]"
    >
      <AssetLogo logo={asset.logo} symbol={asset.tokenSymbol} chain={chain} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-xs sm:text-sm font-semibold text-white">
            {asset.tokenSymbol || 'Unknown'}
          </p>

          {owned && (
            <span className="hidden rounded-full border border-emerald-400/15 bg-emerald-400/[0.06] px-1.5 py-0.5 sm:px-2 text-[7px] sm:text-[8px] font-semibold tracking-wide text-emerald-400 sm:inline-flex">
              In wallet
            </span>
          )}
        </div>

        <p className="mt-1 flex items-center gap-1.5 truncate font-mono text-[9px] sm:text-[10px] text-white/65">
          {truncateAddress(asset.tokenAddress, 9, 7)}

          <button
            type="button"
            className="shrink-0 text-white/35 opacity-0 transition hover:text-white group-hover:opacity-100"
            onClick={() => navigator.clipboard?.writeText(asset.tokenAddress)}
            title="Copy contract address"
            aria-label="Copy contract address"
          >
            <Icon name="copy" className="w-[9px] h-[9px] sm:w-[11px] sm:h-[11px]" />
          </button>
        </p>
      </div>

      <div className="shrink-0">
        {owned ? (
          removable ? (
            <button
              type="button"
              onClick={() => onRemove(asset)}
              disabled={busy}
              className="flex items-center gap-1.5 rounded-lg sm:rounded-xl border border-red-400/15 bg-red-400/[0.04] px-2.5 py-1.5 sm:px-3 sm:py-2 text-[8px] sm:text-[9px] font-semibold text-red-400 transition hover:bg-red-400/10 disabled:opacity-40"
            >
              {busy ? (
                <Spinner small />
              ) : (
                <Icon name="trash" className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px]" />
              )}
              <span className="hidden sm:inline">Remove</span>
            </button>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg sm:rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] px-2.5 py-1.5 sm:px-3 sm:py-2 text-[8px] sm:text-[9px] font-semibold text-emerald-400">
              <Icon name="check" className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px]" />
              <span className="hidden sm:inline">Added</span>
            </span>
          )
        ) : (
          <button
            type="button"
            onClick={() => onAdd(asset)}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg sm:rounded-xl bg-salvaGold px-2.5 py-1.5 sm:px-3 sm:py-2 text-[8px] sm:text-[9px] font-semibold text-black transition hover:brightness-105 disabled:opacity-40"
          >
            {busy ? (
              <Spinner small />
            ) : (
              <Icon name="plus" className="w-[10px] h-[10px] sm:w-[12px] sm:h-[12px]" />
            )}
            Add
          </button>
        )}
      </div>
    </motion.div>
  );
};

/* ============================================================================
   ADD CUSTOM ASSET
============================================================================ */

const AddAssetModal = ({ open, chain, onClose, onSubmit, requestJson, showMsg }) => {
  const [step, setStep] = useState(1);
  const [tokenAddress, setTokenAddress] = useState('');
  const [tokenDetails, setTokenDetails] = useState(null);
  const [feedAddress, setFeedAddress] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);

  const reset = useCallback(() => {
    setStep(1);
    setTokenAddress('');
    setTokenDetails(null);
    setFeedAddress('');
    setLogoUrl('');
    setLookupLoading(false);
    setSubmitLoading(false);
  }, []);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const lookupToken = useCallback(async () => {
    const address = tokenAddress.trim();

    if (!isValidAddress(address)) {
      showMsg('Enter a valid token contract address.', 'error');
      return;
    }

    setLookupLoading(true);

    try {
      const data = await requestJson(
        `${SALVA_API_URL}/api/user/token-details/${encodeURIComponent(chain)}/${encodeURIComponent(
          address
        )}`
      );

      if (!data?.status || !data?.data) {
        throw new Error(data?.errorMsg || 'Could not fetch token details.');
      }

      setTokenDetails(data.data);
      setStep(2);
    } catch (error) {
      showMsg(error?.message || 'Could not fetch token details.', 'error');
    } finally {
      setLookupLoading(false);
    }
  }, [chain, requestJson, showMsg, tokenAddress]);

  const submit = useCallback(async () => {
    if (!tokenDetails) return;

    setSubmitLoading(true);

    try {
      await onSubmit({
        tokenAddress: tokenDetails.address,
        feedAddress: feedAddress.trim() || null,
        logo: logoUrl.trim() || null,
      });

      onClose();
    } catch {
      // onSubmit surfaces the API error. Keep this modal open.
    } finally {
      setSubmitLoading(false);
    }
  }, [feedAddress, logoUrl, onClose, onSubmit, tokenDetails]);

  return (
    <ModalShell
      open={open}
      onClose={() => !lookupLoading && !submitLoading && onClose()}
      mobileSheet
    >
      <div className="max-h-[92vh] overflow-y-auto">
        <div className="border-b border-white/[0.06] px-4 pb-4 pt-4 sm:px-7 sm:pb-5 sm:pt-7">
          <div className="mx-auto mb-3 sm:mb-4 h-1 w-8 sm:w-10 rounded-full bg-white/10 sm:hidden" />

          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-1.5 sm:mb-2 flex items-center gap-2">
                <span className="rounded-full border border-salvaGold/20 bg-salvaGold/[0.07] px-2 py-0.5 sm:px-2.5 sm:py-1 text-[7px] sm:text-[8px] font-bold uppercase tracking-[0.15em] text-salvaGold">
                  Step {step} / 2
                </span>
              </div>

              <h3 className="text-base sm:text-xl font-semibold tracking-tight text-white">
                {step === 1 ? 'Add custom asset' : 'Asset details'}
              </h3>

              <p className="mt-1 text-[10px] sm:text-xs leading-4 sm:leading-5 text-white/75">
                {step === 1
                  ? 'Enter a contract address to identify the token on this network.'
                  : 'Review the token and optionally configure pricing metadata.'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => !lookupLoading && !submitLoading && onClose()}
              className="rounded-lg sm:rounded-xl border border-white/10 bg-white/[0.03] p-1.5 sm:p-2 text-white/70 transition hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              <Icon name="x" className="w-[13px] h-[13px] sm:w-[16px] sm:h-[16px]" />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-7">
          {step === 1 ? (
            <div className="space-y-4 sm:space-y-5">
              <div>
                <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Contract address
                </label>

                <div className="relative">
                  <input
                    autoFocus
                    value={tokenAddress}
                    onChange={(e) => setTokenAddress(e.target.value.trim())}
                    onKeyDown={(e) => e.key === 'Enter' && lookupToken()}
                    placeholder="0x…"
                    spellCheck="false"
                    autoComplete="off"
                    className="w-full rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-3 sm:px-4 sm:py-3.5 font-mono text-[11px] sm:text-xs text-white outline-none transition placeholder:text-white/45 focus:border-salvaGold/40 focus:bg-white/[0.05] focus:ring-4 focus:ring-salvaGold/[0.05]"
                  />
                </div>

                <p className="mt-1.5 sm:mt-2 text-[9px] sm:text-[10px] text-white/70">
                  The contract is queried directly for its token metadata.
                </p>
              </div>

              <button
                type="button"
                onClick={lookupToken}
                disabled={lookupLoading || !tokenAddress}
                className="flex w-full items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-salvaGold py-3 sm:py-3.5 text-[11px] sm:text-xs font-bold text-black transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {lookupLoading ? (
                  <Spinner />
                ) : (
                  <Icon name="search" className="w-[12px] h-[12px] sm:w-[15px] sm:h-[15px]" />
                )}

                {lookupLoading ? 'Fetching token…' : 'Continue'}
              </button>
            </div>
          ) : (
            <div className="space-y-4 sm:space-y-5">
              <div className="flex items-center gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3 sm:p-4">
                <AssetLogo logo={null} symbol={tokenDetails?.symbol} chain={chain} />

                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm font-semibold text-white">
                    {tokenDetails?.symbol || 'Unknown token'}
                  </p>

                  <p className="mt-0.5 sm:mt-1 truncate font-mono text-[9px] sm:text-[10px] text-white/65">
                    {tokenDetails?.address}
                  </p>

                  <p className="mt-0.5 sm:mt-1 text-[9px] sm:text-[10px] text-white/60">
                    {tokenDetails?.decimals} decimals
                  </p>
                </div>

                <Icon
                  name="check"
                  className="w-[14px] h-[14px] sm:w-[17px] sm:h-[17px] text-emerald-400"
                />
              </div>

              <div>
                <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Chainlink price feed <span className="normal-case text-white/55">(optional)</span>
                </label>

                <input
                  value={feedAddress}
                  onChange={(e) => setFeedAddress(e.target.value)}
                  placeholder="0x…"
                  spellCheck="false"
                  className="w-full rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-3 sm:px-4 sm:py-3.5 font-mono text-[11px] sm:text-xs text-white outline-none transition placeholder:text-white/45 focus:border-salvaGold/40 focus:ring-4 focus:ring-salvaGold/[0.05]"
                />
              </div>

              <div>
                <label className="mb-1.5 sm:mb-2 block text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.14em] text-white/70">
                  Logo URL <span className="normal-case text-white/55">(optional)</span>
                </label>

                <input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://…"
                  className="w-full rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.035] px-3.5 py-3 sm:px-4 sm:py-3.5 text-[11px] sm:text-xs text-white outline-none transition placeholder:text-white/45 focus:border-salvaGold/40 focus:ring-4 focus:ring-salvaGold/[0.05]"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={submitLoading}
                  className="rounded-xl sm:rounded-2xl border border-white/10 bg-white/[0.03] py-3 sm:py-3.5 text-[11px] sm:text-xs font-medium text-white/75 transition hover:bg-white/[0.06] disabled:opacity-40"
                >
                  Back
                </button>

                <button
                  type="button"
                  onClick={submit}
                  disabled={submitLoading}
                  className="flex items-center justify-center gap-2 rounded-xl sm:rounded-2xl bg-salvaGold py-3 sm:py-3.5 text-[11px] sm:text-xs font-bold text-black transition hover:brightness-105 disabled:opacity-40"
                >
                  {submitLoading ? (
                    <Spinner small />
                  ) : (
                    <Icon name="plus" className="w-[11px] h-[11px] sm:w-[14px] sm:h-[14px]" />
                  )}
                  Add asset
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </ModalShell>
  );
};

/* ============================================================================
   PAGE
============================================================================ */

const ManageAssets = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = useCallback(() => {
    navigate(location.state?.from || '/dashboard');
  }, [location.state?.from, navigate]);

  const [user] = useState(() => {
    try {
      const raw = localStorage.getItem('salva_user');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.safeAddress ? parsed : null;
    } catch {
      return null;
    }
  });

  const [chain] = useState(() => localStorage.getItem('salva_chain') || 'base');

  const [globalAssets, setGlobalAssets] = useState([]);
  const [userAssets, setUserAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);

  const [searchInput, setSearchInput] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResult, setSearchResult] = useState(undefined);

  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [busyKeys, setBusyKeys] = useState(() => new Set());
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'info',
  });

  const mountedRef = useRef(true);
  const searchDebounceRef = useRef(null);
  const searchAbortRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }

      searchAbortRef.current?.abort();
    };
  }, []);

  const showMsg = useCallback((message, type = 'success') => {
    setNotification({
      show: true,
      message,
      type,
    });
  }, []);

  const closeMsg = useCallback(() => {
    setNotification((current) => ({
      ...current,
      show: false,
    }));
  }, []);

  const requestJson = useCallback(async (url, options = {}, signal) => {
    try {
      const response = await fetch(url, {
        ...options,
        signal,
        headers: {
          Accept: 'application/json',
          ...(options.headers || {}),
        },
      });

      const text = await response.text();
      let data = null;

      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Invalid JSON response (${response.status})`);
      }

      if (!response.ok && !data) {
        throw new Error(`Request failed (${response.status})`);
      }

      return data;
    } catch (error) {
      throw error;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  const fetchAssets = useCallback(
    async ({ silent = false } = {}) => {
      if (!user?.safeAddress || !chain) return;

      if (silent) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const data = await requestJson(
          `${SALVA_API_URL}/api/user/assets/supported-and-user/${encodeURIComponent(
            user.safeAddress
          )}/${encodeURIComponent(chain)}`
        );

        if (!data?.status) {
          throw new Error(data?.errorMsg || 'Could not load assets.');
        }

        if (!mountedRef.current) return;

        setGlobalAssets(Array.isArray(data.data?.globalAssets) ? data.data.globalAssets : []);

        setUserAssets(Array.isArray(data.data?.userAssets) ? data.data.userAssets : []);

        setLoadError(null);
      } catch (error) {
        if (!mountedRef.current) return;

        setLoadError(error?.message || 'Could not load assets.');
      } finally {
        if (!mountedRef.current) return;

        setLoading(false);
        setRefreshing(false);
      }
    },
    [chain, requestJson, user?.safeAddress]
  );

  useEffect(() => {
    fetchAssets();
  }, [fetchAssets]);

  const mergedList = useMemo(() => {
    const userMap = new Map(userAssets.map((a) => [rowKey(chain, a.tokenAddress), a]));

    const globalKeys = new Set(globalAssets.map((a) => rowKey(chain, a.tokenAddress)));

    const globalRows = globalAssets.map((asset) => {
      const key = rowKey(chain, asset.tokenAddress);

      return {
        ...asset,
        _key: key,
        _owned: userMap.has(key),
        _removable: false,
      };
    });

    const customRows = userAssets
      .filter((asset) => !globalKeys.has(rowKey(chain, asset.tokenAddress)))
      .map((asset) => ({
        ...asset,
        _key: rowKey(chain, asset.tokenAddress),
        _owned: true,
        _removable: true,
      }));

    return [...globalRows, ...customRows].sort((a, b) =>
      String(a.tokenSymbol || '').localeCompare(String(b.tokenSymbol || ''))
    );
  }, [chain, globalAssets, userAssets]);

  const displayList =
    searchResult !== undefined ? (searchResult ? [searchResult] : []) : mergedList;

  /* --------------------------------------------------------------------------
     AUTO-SEARCH — debounced, fires as the user types. No manual button.
  -------------------------------------------------------------------------- */
  const runSearch = useCallback(
    async (target) => {
      if (!target) {
        setSearchResult(undefined);
        setSearchLoading(false);
        return;
      }

      searchAbortRef.current?.abort();

      const controller = new AbortController();
      searchAbortRef.current = controller;

      setSearchLoading(true);

      try {
        const data = await requestJson(
          `${SALVA_API_URL}/api/user/assets/find/${encodeURIComponent(
            user.safeAddress
          )}/${encodeURIComponent(chain)}/${encodeURIComponent(target)}`,
          {},
          controller.signal
        );

        if (!mountedRef.current || controller.signal.aborted) {
          return;
        }

        if (!data?.status || !data?.data) {
          setSearchResult(null);
          return;
        }

        const key = rowKey(chain, data.data.tokenAddress);

        const owned = userAssets.some((a) => rowKey(chain, a.tokenAddress) === key);

        const inGlobal = globalAssets.some((a) => rowKey(chain, a.tokenAddress) === key);

        setSearchResult({
          ...data.data,
          _key: key,
          _owned: owned,
          _removable: owned && !inGlobal,
        });
      } catch (error) {
        if (error?.name === 'AbortError') return;

        showMsg(error?.message || 'Search failed.', 'error');

        setSearchResult(null);
      } finally {
        if (mountedRef.current && searchAbortRef.current === controller) {
          setSearchLoading(false);
        }
      }
    },
    [chain, globalAssets, requestJson, showMsg, user?.safeAddress, userAssets]
  );

  const handleSearchChange = useCallback(
    (value) => {
      setSearchInput(value);

      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current);
      }

      const trimmed = value.trim();

      if (!trimmed) {
        searchAbortRef.current?.abort();
        setSearchResult(undefined);
        setSearchLoading(false);
        return;
      }

      searchDebounceRef.current = setTimeout(() => {
        runSearch(trimmed);
      }, SEARCH_DEBOUNCE_MS);
    },
    [runSearch]
  );

  const clearSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    searchAbortRef.current?.abort();

    setSearchInput('');
    setSearchResult(undefined);
    setSearchLoading(false);
  }, []);

  const setBusy = useCallback((key, busy) => {
    setBusyKeys((current) => {
      const next = new Set(current);

      if (busy) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  }, []);

  const addAsset = useCallback(
    async ({ tokenAddress, feedAddress, logo }) => {
      const key = rowKey(chain, tokenAddress);

      setBusy(key, true);

      try {
        const data = await requestJson(`${SALVA_API_URL}/api/user/add-asset`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            safe: user.safeAddress,
            chain,
            tokenAddress,
            feedAddress: feedAddress || undefined,
            logo: logo || undefined,
          }),
        });

        if (!data?.status) {
          throw new Error(data?.errorMsg || 'Could not add asset.');
        }

        showMsg(data?.message || 'Asset added successfully.');

        await fetchAssets({ silent: true });

        if (searchResult !== undefined) {
          setSearchResult(undefined);
        }
      } catch (error) {
        showMsg(error?.message || 'Could not add asset.', 'error');

        throw error;
      } finally {
        setBusy(key, false);
      }
    },
    [chain, fetchAssets, requestJson, searchResult, setBusy, showMsg, user?.safeAddress]
  );

  const quickAdd = useCallback(
    (asset) => {
      addAsset({
        tokenAddress: asset.tokenAddress,
        feedAddress: asset.chainlinkFeedAddress,
        logo: asset.logo || null,
      }).catch(() => {});
    },
    [addAsset]
  );

  const confirmRemove = useCallback(async () => {
    if (!removeTarget) return;

    const key = rowKey(chain, removeTarget.tokenAddress);

    setRemoveLoading(true);

    try {
      const data = await requestJson(`${SALVA_API_URL}/api/user/remove-asset`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          safe: user.safeAddress,
          chain,
          tokenAddress: removeTarget.tokenAddress,
        }),
      });

      if (!data?.status) {
        throw new Error(data?.errorMsg || 'Could not remove asset.');
      }

      showMsg('Asset removed.');
      setRemoveTarget(null);

      await fetchAssets({ silent: true });

      if (searchResult !== undefined) {
        setSearchResult(undefined);
      }
    } catch (error) {
      showMsg(error?.message || 'Could not remove asset.', 'error');
    } finally {
      if (mountedRef.current) {
        setRemoveLoading(false);
      }
    }

    void key;
  }, [chain, fetchAssets, removeTarget, requestJson, searchResult, showMsg, user?.safeAddress]);

  const ownedCount = userAssets.length;
  const totalCount = mergedList.length;

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#08080a]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[40] overflow-y-auto bg-[#08080a] text-white selection:bg-salvaGold/30">
      <Stars />

      {/* Subtle app chrome */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-0 h-56 sm:h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(212,175,55,.09),transparent_58%)]" />

      <main className="relative z-10 mx-auto w-full max-w-4xl px-3 pb-14 pt-3 sm:px-6 sm:pb-16 sm:pt-8">
        {/* Header */}
        <header className="mb-6 flex items-center justify-between gap-4 sm:mb-9">
          <button
            type="button"
            onClick={handleBack}
            className="group inline-flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 sm:px-3 sm:py-2 text-[11px] sm:text-xs font-medium text-white/75 transition hover:border-white/10 hover:bg-white/[0.05] hover:text-white"
          >
            <Icon
              name="arrowLeft"
              className="w-[12px] h-[12px] sm:w-[15px] sm:h-[15px] transition-transform group-hover:-translate-x-0.5"
            />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="text-right">
              <p className="text-[8px] sm:text-[9px] font-bold uppercase tracking-[0.2em] text-white/65">
                Asset management
              </p>

              <h1 className="mt-0.5 text-sm sm:text-lg font-semibold tracking-tight">
                Your assets
              </h1>
            </div>
          </div>
        </header>

        {/* Hero / stats */}
        <section className="mb-4 sm:mb-5 overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/[0.07] bg-white/[0.025]">
          <div className="relative p-4 sm:p-6">
            <div className="pointer-events-none absolute -right-20 -top-20 h-40 w-40 sm:-right-24 sm:-top-24 sm:h-48 sm:w-48 rounded-full bg-salvaGold/[0.045] blur-3xl" />

            <div className="relative flex flex-col justify-between gap-5 sm:gap-6 sm:flex-row sm:items-end">
              <div>
                <p className="text-[8px] sm:text-[10px] font-bold uppercase tracking-[0.2em] text-salvaGold/65">
                  Portfolio assets
                </p>

                <div className="mt-1.5 sm:mt-2 flex items-end gap-2.5 sm:gap-3">
                  <span className="text-3xl sm:text-5xl font-semibold tracking-[-0.04em] text-white">
                    {loading ? '—' : ownedCount}
                  </span>

                  <span className="mb-1 sm:mb-1.5 text-[10px] sm:text-xs text-white/75">
                    currently enabled
                  </span>
                </div>

                <p className="mt-1.5 sm:mt-2 max-w-md text-[10px] sm:text-xs leading-4 sm:leading-5 text-white/75">
                  Manage the tokens displayed across your Salva wallet on{' '}
                  {String(chain).toUpperCase()}.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Search + add — search is automatic, no button */}
        <section className="mb-4 sm:mb-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Icon
                name="search"
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-[13px] h-[13px] sm:left-4 sm:w-[16px] sm:h-[16px] text-white/25"
              />

              <input
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search by token symbol or contract address"
                className="h-10 sm:h-12 w-full rounded-xl sm:rounded-2xl border border-white/[0.08] bg-white/[0.035] pl-9 pr-9 sm:pl-11 sm:pr-11 text-[11px] sm:text-xs text-white outline-none transition placeholder:text-white/45 hover:border-white/10 focus:border-salvaGold/35 focus:bg-white/[0.05] focus:ring-4 focus:ring-salvaGold/[0.04]"
              />

              {searchLoading ? (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Spinner small />
                </span>
              ) : (
                searchInput && (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 rounded-lg p-1 sm:p-1.5 text-white/25 transition hover:bg-white/5 hover:text-white"
                    aria-label="Clear search"
                  >
                    <Icon name="x" className="w-[11px] h-[11px] sm:w-[14px] sm:h-[14px]" />
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={() => setAddAssetOpen(true)}
              className="flex h-10 sm:h-12 items-center justify-center gap-1.5 sm:gap-2 rounded-xl sm:rounded-2xl bg-salvaGold px-4 sm:px-5 text-[11px] sm:text-xs font-bold text-black transition hover:brightness-105 active:scale-[0.99]"
            >
              <Icon name="plus" className="w-[12px] h-[12px] sm:w-[15px] sm:h-[15px]" />

              <span className="hidden sm:inline">Add custom</span>

              <span className="sm:hidden">Add asset</span>
            </button>
          </div>
        </section>

        {/* Main list */}
        <section className="overflow-hidden rounded-[20px] sm:rounded-[26px] border border-white/[0.07] bg-[#0d0d0f]/90 shadow-[0_18px_70px_rgba(0,0,0,.2)]">
          <div className="flex items-center justify-between border-b border-white/[0.06] px-3.5 py-3 sm:px-5 sm:py-3.5">
            <div>
              <p className="text-[11px] sm:text-xs font-semibold text-white/80">
                {searchResult !== undefined ? 'Search result' : 'Supported tokens'}
              </p>

              <p className="mt-0.5 text-[8px] sm:text-[9px] text-white/65">
                {searchResult !== undefined
                  ? 'Matching asset'
                  : `${totalCount} token${totalCount === 1 ? '' : 's'} available on this network`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchAssets({ silent: true })}
              disabled={refreshing || loading}
              className="flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-1.5 sm:px-3 sm:py-2 text-[9px] sm:text-[10px] font-medium text-white/70 transition hover:bg-white/[0.05] hover:text-white/85 disabled:opacity-35"
              title="Refresh assets"
            >
              <Icon
                name="refresh"
                className={`w-[11px] h-[11px] sm:w-[13px] sm:h-[13px] ${
                  refreshing ? 'animate-spin' : ''
                }`}
              />

              <span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span>
            </button>
          </div>

          {loading ? (
            <div className="flex min-h-[270px] sm:min-h-[330px] flex-col items-center justify-center px-6">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl border border-white/[0.07] bg-white/[0.03]">
                <Spinner />
              </div>

              <p className="mt-3 sm:mt-4 text-[11px] sm:text-xs font-medium text-white/75">
                Loading your assets
              </p>

              <p className="mt-1 text-[9px] sm:text-[10px] text-white/65">
                Fetching the latest wallet configuration
              </p>
            </div>
          ) : loadError && displayList.length === 0 ? (
            <div className="flex min-h-[270px] sm:min-h-[330px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl border border-red-400/15 bg-red-400/[0.06] text-red-400">
                <Icon name="refresh" className="w-[15px] h-[15px] sm:w-[18px] sm:h-[18px]" />
              </div>

              <p className="mt-3 sm:mt-4 text-xs sm:text-sm font-semibold text-white/85">
                Couldn't load assets
              </p>

              <p className="mt-1 max-w-sm text-[9px] sm:text-[10px] leading-4 sm:leading-5 text-white/70">
                {loadError}
              </p>

              <button
                type="button"
                onClick={() => fetchAssets()}
                className="mt-4 sm:mt-5 rounded-lg sm:rounded-xl bg-salvaGold px-3.5 py-2 sm:px-4 sm:py-2.5 text-[9px] sm:text-[10px] font-bold text-black transition hover:brightness-105"
              >
                Try again
              </button>
            </div>
          ) : displayList.length === 0 ? (
            <div className="flex min-h-[270px] sm:min-h-[330px] flex-col items-center justify-center px-6 text-center">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-xl sm:rounded-2xl border border-white/[0.07] bg-white/[0.03] text-white/25">
                <Icon
                  name={searchResult !== undefined ? 'search' : 'plus'}
                  className="w-[16px] h-[16px] sm:w-[19px] sm:h-[19px]"
                />
              </div>

              <p className="mt-3 sm:mt-4 text-xs sm:text-sm font-semibold text-white/80">
                {searchResult !== undefined ? 'No matching asset' : 'No assets found'}
              </p>

              <p className="mt-1 max-w-xs text-[9px] sm:text-[10px] leading-4 sm:leading-5 text-white/70">
                {searchResult !== undefined
                  ? 'Try a different symbol or verify the contract address.'
                  : 'Add a custom token to start building your asset list.'}
              </p>

              {searchResult === undefined && (
                <button
                  type="button"
                  onClick={() => setAddAssetOpen(true)}
                  className="mt-4 sm:mt-5 inline-flex items-center gap-1.5 sm:gap-2 rounded-lg sm:rounded-xl border border-salvaGold/20 bg-salvaGold/[0.06] px-3.5 py-2 sm:px-4 sm:py-2.5 text-[9px] sm:text-[10px] font-semibold text-salvaGold transition hover:bg-salvaGold/[0.1]"
                >
                  <Icon name="plus" className="w-[11px] h-[11px] sm:w-[13px] sm:h-[13px]" />
                  Add custom asset
                </button>
              )}
            </div>
          ) : (
            <div>
              {displayList.map((asset) => (
                <AssetRow
                  key={asset._key}
                  asset={asset}
                  chain={chain}
                  busy={busyKeys.has(asset._key)}
                  onAdd={quickAdd}
                  onRemove={setRemoveTarget}
                />
              ))}
            </div>
          )}
        </section>

        <footer className="flex items-center justify-center gap-2 py-5 sm:py-6 text-[8px] sm:text-[9px] text-white/45">
          <Icon name="shield" className="w-[9px] h-[9px] sm:w-[11px] sm:h-[11px]" />
          <span>Asset configuration · {String(chain).toUpperCase()}</span>
        </footer>
      </main>

      <AddAssetModal
        open={addAssetOpen}
        chain={chain}
        onClose={() => setAddAssetOpen(false)}
        onSubmit={addAsset}
        requestJson={requestJson}
        showMsg={showMsg}
      />

      <ConfirmModal
        open={Boolean(removeTarget)}
        title="Remove custom asset?"
        message={`This will remove ${
          removeTarget?.tokenSymbol || 'this token'
        } from your wallet's asset list. You can add it again later.`}
        confirmLabel="Remove asset"
        danger
        loading={removeLoading}
        onConfirm={confirmRemove}
        onCancel={() => !removeLoading && setRemoveTarget(null)}
      />

      <Notification notification={notification} onClose={closeMsg} />
    </div>
  );
};

export default ManageAssets;
