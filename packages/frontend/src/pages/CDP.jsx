import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { SALVA_API_URL } from '../config';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';
import { readWalletCache, writeWalletCache } from '../utils/walletCache';
import { CDP_POLL_INTERVAL_MS, fetchCdpSnapshot, readCdpCache } from '../utils/cdpCache';
import { useOverlayLayer } from './Dashboard';
import PinModal from '../components/PinModal';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const LOCAL_LOGOS = { NGNS: ngnLogo, SANT: santLogo };
const LIQUIDATION_RATIO = 115;

// Public VAPID key (safe to expose). CRA: REACT_APP_VAPID_PUBLIC_KEY.
// If you use Vite, change this line to: import.meta.env.VITE_VAPID_PUBLIC_KEY
const VAPID_PUBLIC_KEY = process.env.REACT_APP_VAPID_PUBLIC_KEY || '';
const urlBase64ToUint8Array = (b64) => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
};

const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window &&
  typeof window.Notification.requestPermission === 'function';

/* ============================== HELPERS ============================== */

const num = (x) => {
  const n = Number(x);
  return Number.isFinite(n) ? n : 0;
};

const formatNumber = (value, { minDecimals = 0, maxDecimals } = {}) => {
  if (value === null || value === undefined || value === '') return '0';
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  if (n === 0) return minDecimals ? n.toFixed(minDecimals) : '0';

  // Values >= 1 use at most 4 decimals; fractional values use up to 12.
  const precision = Math.abs(n) >= 1 ? 4 : 12;
  const decimals = maxDecimals === undefined ? precision : Math.min(maxDecimals, precision);
  if (Math.abs(n) < 1e-12) return n < 0 ? '-<0.000000000001' : '<0.000000000001';

  // Truncate (never round). Numeric strings are sliced directly.
  const str =
    typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())
      ? value.trim()
      : n.toFixed(Math.min(100, decimals + 8));

  const negative = str.startsWith('-');
  const [rawInt, rawDec = ''] = str.replace('-', '').split('.');
  const i = rawInt.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  let d = rawDec.slice(0, decimals).padEnd(decimals, '0');
  while (d.length > minDecimals && d.endsWith('0')) d = d.slice(0, -1);

  const isZero = /^0*$/.test(rawInt) && /^0*$/.test(d);
  const sign = negative && !isZero ? '-' : '';
  return `${sign}${i}${d ? `.${d}` : ''}`;
};

const formatFiat = (value, symbol) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return `${symbol}0.00`;
  if (n < 0.01) return `<${symbol}0.01`;
  return `${symbol}${formatNumber(n, { minDecimals: 2, maxDecimals: 2 })}`;
};

const formatAmountInput = (raw) => {
  const cleaned = String(raw ?? '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
};

const truncate = (a, s = 6, e = 4) =>
  !a ? '—' : a.length <= s + e + 1 ? a : `${a.slice(0, s)}…${a.slice(-e)}`;

const deriveVault = (v) => {
  if (!v || !v.registered) {
    return {
      status: 'none',
      collateral: 0,
      debt: 0,
      ratio: 0,
      health: null,
      collateralNgn: 0,
      maxBorrow: 0,
    };
  }
  const collateral = num(v.collateral);
  const debt = num(v.debt);
  const ratio = v.ratioBps / 100;
  const health = v.health != null ? Number(v.health) / 100 : null;
  const collateralNgn = num(v.collateralNgn);
  const maxBorrow =
    v.ratioBps > 0
      ? Math.max(0, Math.floor(((collateralNgn * 10000) / v.ratioBps - debt) * 0.995 * 1e4) / 1e4)
      : 0;

  let status = 'empty';
  if (collateral > 0 && debt === 0) status = 'collateral';
  else if (debt > 0) {
    if (health === null) status = 'healthy';
    else if (health < LIQUIDATION_RATIO) status = 'liquidatable';
    else if (health < LIQUIDATION_RATIO * 1.1) status = 'risk';
    else status = 'healthy';
  }
  return { status, collateral, debt, ratio, health, collateralNgn, maxBorrow };
};

const STATUS = {
  none: {
    label: 'Not opened',
    cls: 'text-white border-white/25 bg-white/10',
    msg: 'No vault yet. Deposit collateral to open one.',
  },
  empty: {
    label: 'Empty',
    cls: 'text-white border-white/25 bg-white/10',
    msg: 'Vault is open with no collateral and no debt.',
  },
  collateral: {
    label: 'Collateral only',
    cls: 'text-salvaGold border-salvaGold/30 bg-salvaGold/10',
    msg: 'Collateral is deposited with no debt. You can borrow NGNS against it.',
  },
  healthy: {
    label: 'Healthy',
    cls: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/10',
    msg: 'Your position is safely collateralized.',
  },
  risk: {
    label: 'At risk',
    cls: 'text-amber-400 border-amber-400/30 bg-amber-400/10',
    msg: 'Close to the 115% liquidation ratio. Add collateral or repay NGNS.',
  },
  liquidatable: {
    label: 'Liquidatable',
    cls: 'text-red-400 border-red-400/30 bg-red-400/10',
    msg: 'Below the 115% liquidation ratio. Add collateral or repay now.',
  },
};

const requestJson = async (url, options = {}, { signal } = {}) => {
  const res = await fetch(url, {
    ...options,
    signal,
    headers: { Accept: 'application/json', ...(options.headers || {}) },
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Invalid JSON response (${res.status})`);
  }
  if (!res.ok)
    throw new Error(
      data?.message || data?.errorMsg || data?.error || `Request failed (${res.status})`
    );
  return data;
};

const postJson = (url, body, opts) =>
  requestJson(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    opts
  );

/* ============================== SMALL UI ============================== */

const Spinner = ({ small = false }) => (
  <span
    className={`${
      small ? 'w-3 h-3' : 'w-4 h-4'
    } border-2 border-salvaGold/25 border-t-salvaGold rounded-full animate-spin inline-block`}
  />
);

const TokenIcon = ({ symbol, walletAssets = [], size = 'w-10 h-10' }) => {
  const logo = LOCAL_LOGOS[symbol] || walletAssets.find((a) => a.symbol === symbol)?.logo;
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [logo]);
  return (
    <div
      className={`${size} rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden shrink-0`}
    >
      {logo && !broken ? (
        <img
          src={logo}
          alt={symbol}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          style={
            symbol === 'NGNS' ? { objectPosition: '48% 60%', transform: 'scale(2)' } : undefined
          }
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-[10px] font-black text-salvaGold">{symbol?.slice(0, 3)}</span>
      )}
    </div>
  );
};

const Select = ({
  value,
  options,
  onChange,
  renderValue,
  renderOption,
  placeholder = 'Select',
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    document.addEventListener('touchstart', h);
    return () => {
      document.removeEventListener('mousedown', h);
      document.removeEventListener('touchstart', h);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-3.5 py-3 rounded-2xl border border-white/10 bg-white/[0.04] hover:border-salvaGold/30 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          {selected ? (
            renderValue(selected)
          ) : (
            <span className="text-xs font-bold text-white">{placeholder}</span>
          )}
        </div>
        <span className={`text-white text-xs transition-transform ${open ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute z-30 left-0 right-0 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0e0e10] shadow-2xl p-1.5"
          >
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full px-3 py-2.5 rounded-xl text-left transition-colors ${
                  o.value === value ? 'bg-salvaGold/10' : 'hover:bg-white/[0.05]'
                }`}
              >
                {renderOption(o, o.value === value)}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const Gauge = ({ health, ratio, status }) => {
  if (!ratio) return null;
  const h = health ?? 0;
  const scaleMax = Math.max(ratio * 2, h * 1.05, 1);
  const fill = health === null ? 100 : Math.min(100, (h / scaleMax) * 100);
  const mark = (LIQUIDATION_RATIO / scaleMax) * 100;
  const color =
    status === 'liquidatable'
      ? 'bg-red-400'
      : status === 'risk'
      ? 'bg-amber-400'
      : 'bg-emerald-400';
  return (
    <div>
      <div className="relative h-2 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${fill}%` }}
        />
      </div>
      <div className="relative h-3 mt-1">
        <span
          className="absolute -translate-x-1/2 w-px h-2.5 bg-white"
          style={{ left: `${mark}%` }}
        />
      </div>
    </div>
  );
};

const Notification = ({ notification, onClose }) => {
  useEffect(() => {
    if (!notification.show) return undefined;
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [notification, onClose]);
  if (!notification.show) return null;
  const accent = notification.type === 'error' ? '#EF4444' : '#D4AF37';
  return (
    <motion.div
      initial={{ opacity: 0, y: -18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      className="fixed right-3 top-3 sm:right-4 sm:top-4 z-[200] w-[calc(100%-1.5rem)] max-w-sm"
    >
      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#101012]/95 shadow-2xl backdrop-blur-2xl">
        <div className="h-px" style={{ background: accent }} />
        <div className="flex items-start gap-3 p-3.5">
          <p className="flex-1 text-xs leading-5 text-white">{notification.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="text-white text-sm"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ============================== PIN ============================== */

const PinStep = ({ user, onVerified, onCancel }) => {
  const [attempts, setAttempts] = useState(0);

  const verify = useCallback(
    async (pin) => {
      let data;
      try {
        data = await postJson(`${SALVA_API_URL}/api/user/verify-pin`, {
          email: user.email,
          pin,
        });
      } catch (error) {
        onCancel(error?.message || 'Could not verify PIN');
        return;
      }

      if (!data?.success) {
        const next = attempts + 1;
        setAttempts(next);

        if (next >= 3) {
          onCancel('Too many failed attempts — redirecting to settings');
          return;
        }

        throw new Error(
          `Incorrect PIN · ${3 - next} attempt${3 - next === 1 ? '' : 's'} remaining`
        );
      }

      onVerified(pin);
    },
    [attempts, onCancel, onVerified, user?.email]
  );

  return <PinModal embedded onVerified={verify} onCancel={() => onCancel()} />;
};

/* ============================== ACTION MODAL ============================== */

const ACTIONS = {
  deposit: { title: 'Deposit collateral', cta: 'Deposit', unitIsNgns: false },
  borrow: { title: 'Borrow NGNS', cta: 'Borrow', unitIsNgns: true },
  repay: { title: 'Repay NGNS', cta: 'Repay', unitIsNgns: true },
  withdraw: { title: 'Withdraw collateral', cta: 'Withdraw', unitIsNgns: false },
};

const Row = ({ label, value, accent }) => (
  <div className="flex items-center justify-between gap-3 text-[11px]">
    <span className="text-white">{label}</span>
    <span className={`font-black text-right ${accent || 'text-white'}`}>{value}</span>
  </div>
);

const ActionModal = ({
  action,
  manager,
  positions,
  initialSymbol,
  registerOnly,
  user,
  chain,
  walletAssets,
  onClose,
  showMsg,
  onSuccess,
}) => {
  const cfg = ACTIONS[action];
  const tokens = registerOnly
    ? manager.whitelistedTokens.filter((t) => !positions?.[t.symbol]?.registered)
    : manager.whitelistedTokens;

  const [stage, setStage] = useState('pin');
  const [privateKey, setPrivateKey] = useState('');
  const [symbol, setSymbol] = useState(initialSymbol || tokens[0]?.symbol);
  const [amountDisplay, setAmountDisplay] = useState('');
  const [amount, setAmount] = useState('');
  const [ratioPct, setRatioPct] = useState('200');

  const [recipientInput, setRecipientInput] = useState('');
  const [recipientType, setRecipientType] = useState('empty');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [resolveState, setResolveState] = useState('idle');
  const [resolveMessage, setResolveMessage] = useState('');

  const [fee, setFee] = useState({ feeNGN: 0, feeUsd: 0, loading: false, error: false });
  const [submitting, setSubmitting] = useState(false);

  const mountedRef = useRef(true);
  const resolveSeqRef = useRef(0);
  const resolveTimerRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
    };
  }, []);

  const vault = positions?.[symbol];
  const d = deriveVault(vault);
  const registered = Boolean(vault?.registered);
  const unit = cfg.unitIsNgns ? 'NGNS' : symbol;
  const walletBal = (sym) => {
    const a = walletAssets.find((x) => x.symbol === sym);
    return a ? num(a.balanceFull ?? a.balance) : null;
  };

  const maxStr = useMemo(() => {
    if (action === 'deposit') {
      const b = walletBal(symbol);
      return b === null ? null : String(b);
    }
    if (action === 'borrow') return String(d.maxBorrow);
    if (action === 'repay') {
      const b = walletBal('NGNS');
      return b !== null && b < d.debt ? String(b) : vault?.debt ?? '0';
    }
    return vault?.withdrawable ?? '0';
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, symbol, d.maxBorrow, d.debt, vault, walletAssets]);

  const amountNum = num(amount);
  const maxNum = maxStr === null ? null : num(maxStr);
  const amountError = maxNum !== null && amountNum > maxNum * (1 + 1e-12);
  const ratioNum = num(ratioPct);
  const needsRatio = action === 'deposit' && !registered;
  const ratioInvalid = needsRatio && ratioNum <= 0;

  const projectedHealth =
    action === 'borrow' && amountNum > 0 && d.collateralNgn > 0
      ? (d.collateralNgn / (d.debt + amountNum)) * 100
      : null;
  const borrowUnsafe = projectedHealth !== null && d.ratio > 0 && projectedHealth < d.ratio;

  const recipientReady =
    action !== 'withdraw' ||
    (/^0x[a-fA-F0-9]{40}$/.test(resolvedAddress) && resolvedAddress.toLowerCase() !== ZERO_ADDRESS);

  const setRecipient = useCallback((value) => {
    const seq = ++resolveSeqRef.current;
    if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);

    setRecipientInput(value);
    setResolvedAddress('');
    setResolveMessage('');

    const trimmed = value.trim();
    if (!trimmed) {
      setRecipientType('empty');
      setResolveState('idle');
      return;
    }

    if (/^0x/i.test(trimmed)) {
      setRecipientType('address');
      if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
        setResolvedAddress(trimmed);
        setResolveState('resolved');
      } else {
        setResolveState('error');
        setResolveMessage('Enter a valid 0x wallet address.');
      }
      return;
    }

    setRecipientType('fullname');
    if (!trimmed.includes('@')) {
      setResolveState('error');
      setResolveMessage('A name must include @, for example pay.ngns@alice.');
      return;
    }

    setResolveState('loading');
    resolveTimerRef.current = setTimeout(async () => {
      try {
        const data = await requestJson(
          `${SALVA_API_URL}/api/name/isAvail/${encodeURIComponent(trimmed)}`
        );
        if (seq !== resolveSeqRef.current) return;
        const address = String(data?.address || '');
        if (!address) throw new Error(data?.errorMsg || 'Could not resolve this name.');
        if (address.toLowerCase() === ZERO_ADDRESS) {
          setResolvedAddress(ZERO_ADDRESS);
          setResolveState('zero');
          setResolveMessage('This name currently resolves to the zero address.');
          return;
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(address))
          throw new Error('Resolver returned an invalid wallet address.');
        setResolvedAddress(address);
        setResolveState('resolved');
      } catch (error) {
        if (seq !== resolveSeqRef.current) return;
        setResolveState('error');
        setResolveMessage(error?.message || 'Could not resolve this name.');
      }
    }, 3000);
  }, []);

  // Withdraw defaults to the user's own Safe as the receiver.
  useEffect(() => {
    if (action === 'withdraw' && user?.safeAddress) setRecipient(user.safeAddress);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const recipientStatus = useMemo(() => {
    if (recipientType === 'empty') return null;
    if (resolveState === 'loading') return { type: 'loading', text: 'Resolving receiver…' };
    if (resolveState === 'resolved')
      return {
        type: 'success',
        text: recipientType === 'address' ? 'Valid wallet address' : 'Resolved receiver',
      };
    return { type: 'error', text: resolveMessage };
  }, [recipientType, resolveMessage, resolveState]);

  /* ---- request building ---- */
  const { estimatePath, submitPath, body } = useMemo(() => {
    const base = {
      safe: user.safeAddress,
      pin: privateKey,
      collateralTokenSymbol: symbol,
      chain,
      version: manager.version,
    };
    if (action === 'deposit') {
      const reg = !registered;
      return {
        estimatePath: reg
          ? '/api/user/cdp/estimate-register-deposit-fee'
          : '/api/user/cdp/estimate-deposit-fee',
        submitPath: reg ? '/api/cdp/register-deposit' : '/api/cdp/deposit',
        body: { ...base, amount, ...(reg ? { ratioBps: Math.round(ratioNum * 100) } : {}) },
      };
    }
    if (action === 'borrow') {
      return {
        estimatePath: '/api/user/cdp/estimate-open-position-fee',
        submitPath: '/api/cdp/open-position',
        body: { ...base, symbol, ngnsAmount: amount },
      };
    }
    if (action === 'repay') {
      return {
        estimatePath: '/api/user/cdp/estimate-settle-position-fee',
        submitPath: '/api/cdp/settle-position',
        body: { ...base, symbol, ngnsAmount: amount },
      };
    }
    return {
      estimatePath: '/api/user/cdp/estimate-withdraw-fee',
      submitPath: '/api/cdp/withdraw',
      body: { ...base, receiver: resolvedAddress, amount },
    };
  }, [
    action,
    amount,
    chain,
    manager.version,
    privateKey,
    ratioNum,
    registered,
    resolvedAddress,
    symbol,
    user.safeAddress,
  ]);

  const canEstimate =
    stage !== 'pin' &&
    Boolean(privateKey) &&
    amountNum > 0 &&
    !amountError &&
    !ratioInvalid &&
    !borrowUnsafe &&
    recipientReady &&
    (action !== 'withdraw' || resolvedAddress);

  const payloadKey = canEstimate ? JSON.stringify([estimatePath, body]) : null;

  useEffect(() => {
    if (!payloadKey) {
      setFee({ feeNGN: 0, feeUsd: 0, loading: false, error: false });
      return undefined;
    }
    const controller = new AbortController();
    setFee((c) => ({ ...c, loading: true, error: false }));
    const t = setTimeout(async () => {
      try {
        const res = await postJson(`${SALVA_API_URL}${estimatePath}`, body, {
          signal: controller.signal,
        });
        if (!res?.status || !res?.data) throw new Error('Fee estimation failed.');
        if (!mountedRef.current || controller.signal.aborted) return;
        setFee({
          feeNGN: num(res.data.feeNGN),
          feeUsd: num(res.data.feeUsd),
          loading: false,
          error: false,
        });
      } catch (error) {
        if (error?.name === 'AbortError' || !mountedRef.current) return;
        setFee({ feeNGN: 0, feeUsd: 0, loading: false, error: true });
      }
    }, 400);
    return () => {
      clearTimeout(t);
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  const resetAmount = () => {
    setAmount('');
    setAmountDisplay('');
  };

  const handleAmount = (e) => {
    const f = formatAmountInput(e.target.value);
    setAmountDisplay(f);
    setAmount(f.replace(/,/g, ''));
  };

  const setMax = () => {
    if (maxStr === null) return;
    setAmount(maxStr);
    setAmountDisplay(formatAmountInput(maxStr));
  };

  const cancel = useCallback(
    (message = '') => {
      setPrivateKey('');
      if (message) {
        showMsg(message, 'error');
        if (message.startsWith('Too many failed')) {
          window.setTimeout(() => window.location.assign('/account-settings'), 900);
        }
      } else {
        onClose();
      }
    },
    [onClose, showMsg]
  );

  const submit = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await postJson(`${SALVA_API_URL}${submitPath}`, body);
      if (!res?.status) throw new Error(res?.errorMsg || res?.message || 'Transaction failed');
      showMsg(`${cfg.title} successful`, 'success');
      onClose();
      await onSuccess();
    } catch (error) {
      showMsg(error?.message || 'Transaction failed', 'error');
      setStage('form');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const feeReady = !fee.loading && !fee.error && (fee.feeNGN || fee.feeUsd);
  const canReview = canEstimate && feeReady && !submitting;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div
        className="absolute inset-0 bg-black/90 backdrop-blur-xl"
        onClick={() => !submitting && onClose()}
      />

      <motion.div
        initial={{ opacity: 0, y: '8%', scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: '8%', scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[30px] sm:rounded-[30px] border border-white/10 bg-[#0b0b0d] shadow-[0_35px_120px_rgba(0,0,0,.65)]"
      >
        <div className="h-1 bg-gradient-to-r from-transparent via-salvaGold to-transparent" />

        <div className="p-4 sm:p-7">
          {stage === 'pin' && (
            <PinStep
              user={user}
              onCancel={cancel}
              onVerified={(key) => {
                setPrivateKey(key);
                setStage('form');
              }}
            />
          )}

          {stage === 'form' && (
            <div>
              <div className="flex items-center justify-between mb-5">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.03] text-white"
                  aria-label="Close"
                >
                  ←
                </button>
                <span className="text-[9px] uppercase tracking-[.3em] text-white font-black">
                  {manager.version}
                </span>
              </div>

              <p className="text-[9px] uppercase tracking-[.35em] text-salvaGold font-black">
                {cfg.cta}
              </p>
              <h2 className="text-xl sm:text-2xl font-black mt-1">{cfg.title}</h2>

              <div className="mt-5 space-y-5">
                <div>
                  <label className="block text-[9px] uppercase tracking-[.25em] text-white font-black mb-2">
                    Collateral token
                  </label>
                  <Select
                    value={symbol}
                    options={tokens.map((t) => ({ value: t.symbol, token: t }))}
                    onChange={(v) => {
                      setSymbol(v);
                      resetAmount();
                    }}
                    renderValue={(o) => (
                      <div className="flex items-center gap-3">
                        <TokenIcon symbol={o.value} walletAssets={walletAssets} size="w-8 h-8" />
                        <span className="text-sm font-black">{o.value}</span>
                      </div>
                    )}
                    renderOption={(o) => (
                      <div className="flex items-center gap-3">
                        <TokenIcon symbol={o.value} walletAssets={walletAssets} size="w-8 h-8" />
                        <div>
                          <p className="text-sm font-black">{o.value}</p>
                          <p className="text-[9px] font-mono text-white">
                            {truncate(o.token.tokenAddress, 8, 6)}
                          </p>
                        </div>
                      </div>
                    )}
                  />
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 space-y-2">
                  <Row
                    label="Collateral"
                    value={`${formatNumber(vault?.collateral, { maxDecimals: 8 })} ${symbol}`}
                  />
                  <Row label="Collateral value" value={formatFiat(vault?.collateralNgn, '₦')} />
                  <Row
                    label="Debt"
                    value={`${formatNumber(vault?.debt, { maxDecimals: 4 })} NGNS`}
                  />
                  {registered && (
                    <Row
                      label="Collateral ratio"
                      value={`${formatNumber(d.ratio, { maxDecimals: 2 })}%`}
                    />
                  )}
                </div>

                {action === 'withdraw' && (
                  <div>
                    <label className="block text-[9px] uppercase tracking-[.25em] text-white font-black mb-2">
                      Receiver{' '}
                      <span className="normal-case tracking-normal">(name@namespace or 0x)</span>
                    </label>
                    <div className="flex items-stretch gap-2">
                      <input
                        value={recipientInput}
                        onChange={(e) => setRecipient(e.target.value)}
                        placeholder="pay.sant@alice or 0x…"
                        className={`flex-1 min-w-0 h-14 px-4 rounded-2xl bg-white/[0.035] border ${
                          recipientStatus?.type === 'error'
                            ? 'border-red-500/50'
                            : recipientStatus?.type === 'success'
                            ? 'border-emerald-500/30'
                            : 'border-white/10'
                        } focus:border-salvaGold/50 outline-none font-bold text-sm transition-colors`}
                      />
                      <button
                        type="button"
                        onClick={() => setRecipient(user.safeAddress)}
                        disabled={
                          !user?.safeAddress ||
                          recipientInput.trim().toLowerCase() ===
                            String(user.safeAddress).toLowerCase()
                        }
                        title="Reset to your Safe address"
                        className="shrink-0 h-14 px-3.5 rounded-2xl border border-salvaGold/25 bg-salvaGold/10 text-[9px] font-black uppercase tracking-widest text-salvaGold hover:bg-salvaGold/15 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        ↺ Reset
                      </button>
                    </div>
                    {recipientStatus && (
                      <div className="mt-2">
                        <p
                          className={`text-[10px] font-bold ${
                            recipientStatus.type === 'error'
                              ? 'text-red-400'
                              : recipientStatus.type === 'success'
                              ? 'text-emerald-400'
                              : 'text-white'
                          }`}
                        >
                          {recipientStatus.type === 'loading' && <Spinner small />}
                          <span className={recipientStatus.type === 'loading' ? 'ml-1.5' : ''}>
                            {recipientStatus.text}
                          </span>
                        </p>
                        {recipientStatus.type === 'success' && resolvedAddress && (
                          <p className="mt-1 px-3 py-2 rounded-xl bg-emerald-500/[0.05] border border-emerald-500/15 text-[9px] font-mono text-emerald-300 break-all">
                            {resolvedAddress}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {needsRatio && (
                  <div>
                    <label className="block text-[9px] uppercase tracking-[.25em] text-white font-black mb-2">
                      Collateral ratio (%){' '}
                      <span className="normal-case tracking-normal">
                        · first deposit opens your vault
                      </span>
                    </label>
                    <div className="flex gap-2">
                      {['150', '200', '300'].map((p) => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setRatioPct(p)}
                          className={`px-3 h-11 rounded-xl border text-xs font-black ${
                            ratioPct === p
                              ? 'border-salvaGold/50 bg-salvaGold/10 text-salvaGold'
                              : 'border-white/10 text-white'
                          }`}
                        >
                          {p}%
                        </button>
                      ))}
                      <input
                        value={ratioPct}
                        inputMode="decimal"
                        onChange={(e) => setRatioPct(e.target.value.replace(/[^0-9.]/g, ''))}
                        className="flex-1 min-w-0 h-11 px-3 rounded-xl bg-white/[0.035] border border-white/10 focus:border-salvaGold/50 outline-none font-black text-sm text-center"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[9px] uppercase tracking-[.25em] text-white font-black">
                      Amount
                    </label>
                    <div className="flex items-center gap-2">
                      {maxStr !== null && (
                        <span className="text-[9px] text-white font-bold">
                          Max {formatNumber(maxStr, { maxDecimals: 6 })} {unit}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={setMax}
                        className="px-2.5 py-1 rounded-lg bg-salvaGold/10 border border-salvaGold/20 text-[9px] uppercase tracking-widest text-salvaGold font-black"
                      >
                        Max
                      </button>
                    </div>
                  </div>

                  <div
                    className={`relative rounded-2xl border ${
                      amountError || borrowUnsafe ? 'border-red-500/50' : 'border-white/10'
                    } bg-white/[0.035]`}
                  >
                    <input
                      value={amountDisplay}
                      inputMode="decimal"
                      onChange={handleAmount}
                      placeholder="0.00"
                      className="w-full h-16 px-4 pr-24 bg-transparent outline-none font-black text-xl"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold text-xs font-black uppercase">
                      {unit}
                    </span>
                  </div>

                  {amountError && (
                    <p className="mt-2 text-[10px] text-red-400 font-bold">
                      ⚠ Amount exceeds the maximum available.
                    </p>
                  )}
                  {projectedHealth !== null && (
                    <p
                      className={`mt-2 text-[10px] font-bold ${
                        borrowUnsafe
                          ? 'text-red-400'
                          : projectedHealth < d.ratio * 1.1
                          ? 'text-amber-400'
                          : 'text-white'
                      }`}
                    >
                      {borrowUnsafe
                        ? `⚠ Would drop your ratio to ${formatNumber(projectedHealth, {
                            maxDecimals: 1,
                          })}%, below your ${formatNumber(d.ratio, {
                            maxDecimals: 1,
                          })}% collateral ratio.`
                        : `Projected ratio: ${formatNumber(projectedHealth, {
                            maxDecimals: 1,
                          })}% (your collateral ratio ${formatNumber(d.ratio, {
                            maxDecimals: 1,
                          })}%, liquidation at ${LIQUIDATION_RATIO}%)`}
                    </p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[9px] uppercase tracking-[.25em] text-white font-black">
                      Network fee
                    </p>
                    {fee.loading && <Spinner small />}
                  </div>
                  {fee.loading ? (
                    <p className="text-[10px] text-white">Simulating transaction…</p>
                  ) : fee.error ? (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/[0.05] p-3">
                      <p className="text-[10px] text-red-400 font-black">
                        ⚠ This transaction is likely to revert.
                      </p>
                      <p className="text-[9px] text-red-300 mt-1">
                        Fee estimation failed. Check the amount, ratio and receiver.
                      </p>
                    </div>
                  ) : feeReady ? (
                    <div className="space-y-2">
                      <Row
                        label="Estimated fee"
                        value={fee.feeNGN ? formatFiat(fee.feeNGN, '₦') : '—'}
                        accent="text-salvaGold"
                      />
                      <Row
                        label="USD equivalent"
                        value={
                          fee.feeUsd ? `$${formatNumber(fee.feeUsd, { maxDecimals: 4 })}` : '—'
                        }
                      />
                    </div>
                  ) : (
                    <p className="text-[10px] text-white">
                      Enter a valid amount to estimate the fee.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!canReview}
                  onClick={() => setStage('confirm')}
                  className="w-full h-14 rounded-2xl bg-salvaGold text-black font-black text-xs uppercase tracking-[.15em] disabled:opacity-30 transition-all hover:brightness-105 active:scale-[.99]"
                >
                  Review {cfg.cta.toLowerCase()}
                </button>
              </div>
            </div>
          )}

          {stage === 'confirm' && (
            <div>
              <p className="text-[9px] uppercase tracking-[.35em] text-salvaGold font-black">
                Final review
              </p>
              <h3 className="text-xl sm:text-2xl font-black mt-1">
                Confirm {cfg.cta.toLowerCase()}
              </h3>

              <div className="mt-5 space-y-2">
                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                  <p className="text-[9px] uppercase tracking-[.25em] text-white font-black">
                    {cfg.cta}
                  </p>
                  <p className="text-xl font-black mt-1">
                    {formatNumber(amount, { maxDecimals: 8 })}{' '}
                    <span className="text-salvaGold">{unit}</span>
                  </p>
                  <p className="text-[10px] text-white mt-1">
                    {manager.version} · {symbol} vault
                  </p>
                </div>

                {needsRatio && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                    <Row
                      label="Collateral ratio"
                      value={`${formatNumber(ratioNum, { maxDecimals: 2 })}%`}
                    />
                  </div>
                )}

                {action === 'withdraw' && (
                  <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                    <p className="text-[9px] uppercase tracking-[.25em] text-white font-black">
                      Receiver
                    </p>
                    <p className="text-xs font-black text-salvaGold mt-1 break-all">
                      {recipientInput.trim()}
                    </p>
                    <p className="text-[9px] font-mono text-white mt-1 break-all">
                      {resolvedAddress}
                    </p>
                  </div>
                )}

                <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] space-y-2">
                  <Row
                    label="Network fee"
                    value={fee.feeNGN ? `₦${formatNumber(fee.feeNGN, { maxDecimals: 2 })}` : '—'}
                  />
                  <Row
                    label="USD equivalent"
                    value={fee.feeUsd ? `$${formatNumber(fee.feeUsd, { maxDecimals: 4 })}` : '—'}
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  type="button"
                  onClick={() => setStage('form')}
                  disabled={submitting}
                  className="flex-1 h-12 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={submitting}
                  className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  {submitting && <Spinner small />}
                  {submitting ? 'Submitting…' : `Confirm ${cfg.cta}`}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

/* ============================== VAULT CARD ============================== */

const VaultCard = ({ symbol, vault, walletAssets, onAction }) => {
  const [expanded, setExpanded] = useState(false);
  const d = deriveVault(vault);
  const st = STATUS[d.status];
  const oracleStale = Boolean(vault?.oracleStale);
  const hasCollateral = d.collateral > 0;
  const hasDebt = d.debt > 0;
  const health = d.health;
  const healthLabel = !hasDebt
    ? 'Debt-free'
    : health === null
    ? 'Unavailable'
    : `${formatNumber(health, { maxDecimals: 1 })}%`;

  // The requested health bands are based on the configured minimum collateral ratio,
  // with 125% as the hard red/yellow boundary.
  const healthBand =
    !hasDebt || health === null
      ? 'neutral'
      : health < 125
      ? 'red'
      : health < d.ratio
      ? 'yellow'
      : 'green';
  const healthTone =
    healthBand === 'red'
      ? 'text-red-400'
      : healthBand === 'yellow'
      ? 'text-amber-300'
      : healthBand === 'green'
      ? 'text-emerald-300'
      : 'text-white/85';
  const fillColor =
    healthBand === 'red'
      ? 'bg-red-500'
      : healthBand === 'yellow'
      ? 'bg-amber-400'
      : healthBand === 'green'
      ? 'bg-emerald-400'
      : 'bg-white/20';
  const btn =
    'inline-flex items-center justify-center gap-2 min-w-0 flex-1 h-10 sm:h-11 px-2 sm:px-3 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-[.08em] sm:tracking-[.12em] transition-all disabled:opacity-30';
  const primary = `${btn} bg-salvaGold text-[#101010] shadow-[0_5px_18px_rgba(212,175,55,.12)] hover:brightness-110`;
  const ghost = `${btn} border border-white/[0.11] bg-white/[0.025] text-white/80 hover:border-salvaGold/35 hover:bg-salvaGold/[0.06] hover:text-white`;

  // Put the health value and both reference thresholds on one consistent scale.
  const scaleMax = Math.max(150, d.ratio * 1.15, health || 0, 125) * 1.08;
  const healthFill = health == null ? 0 : Math.max(0, Math.min(100, (health / scaleMax) * 100));
  const liquidationMark = Math.min(100, (115 / scaleMax) * 100);
  const warningMark = Math.min(100, (125 / scaleMax) * 100);
  const minimumMark = Math.min(100, (d.ratio / scaleMax) * 100);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="group relative isolate overflow-hidden rounded-2xl sm:rounded-[28px] border border-white/[0.085] bg-[linear-gradient(145deg,rgba(24,24,27,.98),rgba(11,11,13,.98)_68%)] shadow-[0_18px_55px_rgba(0,0,0,.2)] transition-all duration-300 hover:border-salvaGold/25"
    >
      <div className="pointer-events-none absolute -right-16 -top-20 h-40 sm:h-52 w-40 sm:w-52 rounded-full bg-salvaGold/[0.055] blur-[65px] sm:blur-[75px]" />

      {/* Always-visible compact preview: click anywhere in this header to expand. */}
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={`vault-details-${symbol}`}
        onClick={() => setExpanded((open) => !open)}
        className="relative w-full text-left p-3 sm:p-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-salvaGold/60"
      >
        <div className="flex items-center gap-2.5 sm:gap-3.5">
          <div className="rounded-xl sm:rounded-2xl border border-white/[0.08] bg-black/25 p-1 sm:p-1.5 shrink-0">
            <TokenIcon symbol={symbol} walletAssets={walletAssets} size="w-7 h-7 sm:w-10 sm:h-10" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <h3 className="text-sm sm:text-[17px] font-black tracking-tight">{symbol}</h3>
              <span className="text-[8px] sm:text-[9px] rounded-md border border-white/[0.09] bg-white/[0.035] px-1.5 py-0.5 font-bold tracking-wide text-white/75">
                COLLATERAL
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[8px] sm:text-[9px] font-extrabold ${st.cls}`}
              >
                {st.label}
              </span>
            </div>
            <p className="mt-0.5 text-[9px] sm:text-[11px] text-white/75">
              {vault?.registered
                ? `Minimum collateral ratio: ${formatNumber(d.ratio, { maxDecimals: 1 })}%`
                : 'Vault not initialized'}
            </p>
          </div>
          <span
            className={`shrink-0 text-white/80 text-base sm:text-lg transition-transform duration-200 ${
              expanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          >
            ⌄
          </span>
        </div>

        <div className="mt-3 sm:mt-5 grid grid-cols-3 gap-2 sm:gap-3">
          <div className="min-w-0 rounded-xl sm:rounded-2xl border border-salvaGold/[0.13] bg-salvaGold/[0.045] p-2 sm:p-3.5">
            <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.08em] sm:tracking-[.16em] text-white/75">
              Collateral
            </p>
            <p className="mt-1 text-[11px] sm:text-sm font-black break-words">
              {formatNumber(d.collateral, { maxDecimals: 6 })}
            </p>
            <p className="mt-0.5 text-[8px] sm:text-[10px] text-white/75">{symbol}</p>
            <p className="mt-1 text-[9px] sm:text-[11px] font-bold text-salvaGold break-words">
              {formatFiat(d.collateralNgn, '₦')}
            </p>
          </div>
          <div className="min-w-0 rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-2 sm:p-3.5">
            <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.08em] sm:tracking-[.16em] text-white/75">
              NGNS debt
            </p>
            <p className="mt-1 text-[11px] sm:text-sm font-black break-words">
              {formatNumber(d.debt, { maxDecimals: 4 })}
            </p>
            <p className="mt-0.5 text-[8px] sm:text-[10px] text-white/75">NGNS outstanding</p>
          </div>
          <div className="min-w-0 rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-2 sm:p-3.5">
            <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.08em] sm:tracking-[.16em] text-white/75">
              Health ratio
            </p>
            <p className={`mt-1 text-[11px] sm:text-sm font-black break-words ${healthTone}`}>
              {healthLabel}
            </p>
            <p className="mt-0.5 text-[8px] sm:text-[10px] text-white/75">
              {hasDebt ? 'Collateral / debt' : 'No debt'}{' '}
            </p>
          </div>
        </div>

        {/* Health tracker remains visible in the collapsed preview. */}
        {vault?.registered && hasDebt && (
          <div className="mt-3 sm:mt-4">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.12em] text-white/80">
                Position health tracker
              </span>
              <span className={`text-[9px] sm:text-[10px] font-black ${healthTone}`}>
                {health === null ? 'Unavailable' : `${formatNumber(health, { maxDecimals: 1 })}%`}
              </span>
            </div>
            <div className="relative h-2 sm:h-2.5 rounded-full bg-white/[0.07] overflow-hidden">
              <div
                className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${fillColor}`}
                style={{ width: `${healthFill}%` }}
              />
              <div
                className="absolute inset-y-0 w-px bg-red-300"
                style={{ left: `${liquidationMark}%` }}
              />
              <div
                className="absolute inset-y-0 w-px bg-amber-200"
                style={{ left: `${warningMark}%` }}
              />
              <div
                className="absolute inset-y-0 w-[2px] bg-white"
                style={{ left: `${minimumMark}%` }}
              />
            </div>
            <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[8px] sm:text-[9px] text-white/80">
              <span className="text-red-300">115% liquidation</span>
              <span className="text-amber-300">125% warning</span>
              <span className="text-white">
                {formatNumber(d.ratio, { maxDecimals: 1 })}% minimum
              </span>
            </div>
          </div>
        )}
        <div className="mt-2 sm:mt-3 flex items-center justify-between gap-3 border-t border-white/[0.07] pt-2 sm:pt-3">
          <span className="text-[9px] sm:text-[10px] font-bold text-white/75">
            {expanded
              ? 'Tap to collapse position details'
              : 'Tap to view position details and actions'}
          </span>
          <span className="text-[8px] sm:text-[9px] font-black uppercase tracking-widest text-salvaGold">
            {expanded ? 'Hide details' : 'View details'} ↘
          </span>
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={`vault-details-${symbol}`}
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="relative overflow-hidden"
          >
            <div className="border-t border-white/[0.08] p-3 sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-[.17em] text-salvaGold">
                    Position breakdown
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] leading-5 text-white/80">
                    This collateral position is isolated: its collateral, debt, health and
                    withdrawable balance are calculated independently.
                  </p>
                </div>
                {vault?.stale && (
                  <span className="shrink-0 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-2 py-1 text-[8px] font-bold text-amber-300">
                    Stale data
                  </span>
                )}
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3">
                <div className="rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-3 sm:p-4">
                  <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.13em] text-white/75">
                    Deposited collateral
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base font-black break-words">
                    {formatNumber(d.collateral, { maxDecimals: 8 })}{' '}
                    <span className="text-[9px] sm:text-[10px] text-white/75">{symbol}</span>
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-white/80">
                    Oracle value: {formatFiat(d.collateralNgn, '₦')}
                  </p>
                </div>
                <div className="rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-3 sm:p-4">
                  <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.13em] text-white/75">
                    Withdrawable collateral
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base font-black break-words">
                    {formatNumber(vault?.withdrawable, { maxDecimals: 8 })}{' '}
                    <span className="text-[9px] sm:text-[10px] text-white/75">{symbol}</span>
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-white/80">
                    Amount currently reported as withdrawable
                  </p>
                </div>
                <div className="rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-3 sm:p-4">
                  <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.13em] text-white/75">
                    Outstanding debt
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base font-black break-words">
                    {formatNumber(d.debt, { maxDecimals: 8 })}{' '}
                    <span className="text-[9px] sm:text-[10px] text-white/75">NGNS</span>
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-white/80">
                    NGNS minted against this position
                  </p>
                </div>
                <div className="rounded-xl sm:rounded-2xl border border-white/[0.065] bg-black/20 p-3 sm:p-4">
                  <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.13em] text-white/75">
                    Additional borrow capacity
                  </p>
                  <p className="mt-1.5 text-sm sm:text-base font-black break-words">
                    {formatNumber(d.maxBorrow, { maxDecimals: 4 })}{' '}
                    <span className="text-[9px] sm:text-[10px] text-white/75">NGNS</span>
                  </p>
                  <p className="mt-1 text-[10px] sm:text-[11px] text-white/80">
                    Estimated capacity while respecting the configured minimum ratio and buffer
                  </p>
                </div>
              </div>

              {vault?.registered && (
                <section className="mt-3 sm:mt-4 rounded-xl sm:rounded-2xl border border-white/[0.08] bg-black/20 p-3 sm:p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.17em] text-white/75">
                        Detailed health assessment
                      </p>
                      <p
                        className={`mt-1 text-xl sm:text-2xl font-black tracking-tight ${healthTone}`}
                      >
                        {healthLabel}
                      </p>
                      <p className="mt-1 text-[10px] sm:text-[11px] text-white/80">
                        Current collateral health ratio compared with the vault's required minimum.
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-[8px] sm:text-[9px] font-black ${
                        healthBand === 'red'
                          ? 'border-red-400/30 bg-red-400/10 text-red-300'
                          : healthBand === 'yellow'
                          ? 'border-amber-400/30 bg-amber-400/10 text-amber-300'
                          : healthBand === 'green'
                          ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
                          : 'border-white/15 bg-white/5 text-white/80'
                      }`}
                    >
                      {healthBand === 'red'
                        ? 'Critical · below 125%'
                        : healthBand === 'yellow'
                        ? 'Warning · below minimum'
                        : healthBand === 'green'
                        ? 'Healthy · at/above minimum'
                        : 'No debt / unavailable'}
                    </span>
                  </div>

                  <div className="mt-4 relative h-3 rounded-full bg-white/[0.07] overflow-hidden">
                    <div
                      className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${fillColor}`}
                      style={{ width: `${healthFill}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-[2px] bg-red-300"
                      style={{ left: `${liquidationMark}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-[2px] bg-amber-200"
                      style={{ left: `${warningMark}%` }}
                    />
                    <div
                      className="absolute inset-y-0 w-[2px] bg-white"
                      style={{ left: `${minimumMark}%` }}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1.5 sm:gap-2 text-[9px] sm:text-[10px]">
                    <div className="flex items-center gap-2 rounded-lg bg-red-400/[0.06] px-2.5 py-2">
                      <span className="h-2 w-2 rounded-full bg-red-400 shrink-0" />
                      <span className="text-white/80">Liquidation boundary</span>
                      <strong className="ml-auto text-red-300">115%</strong>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-amber-400/[0.06] px-2.5 py-2">
                      <span className="h-2 w-2 rounded-full bg-amber-400 shrink-0" />
                      <span className="text-white/80">Warning boundary</span>
                      <strong className="ml-auto text-amber-300">125%</strong>
                    </div>
                    <div className="flex items-center gap-2 rounded-lg bg-white/[0.035] px-2.5 py-2">
                      <span className="h-2 w-2 rounded-full bg-white shrink-0" />
                      <span className="text-white/80">Your minimum</span>
                      <strong className="ml-auto text-white">
                        {formatNumber(d.ratio, { maxDecimals: 1 })}%
                      </strong>
                    </div>
                  </div>
                  <div
                    className={`mt-3 rounded-xl border p-3 text-[10px] sm:text-[11px] leading-5 ${
                      healthBand === 'red'
                        ? 'border-red-400/20 bg-red-400/[0.055] text-red-200'
                        : healthBand === 'yellow'
                        ? 'border-amber-400/20 bg-amber-400/[0.055] text-amber-100'
                        : healthBand === 'green'
                        ? 'border-emerald-400/20 bg-emerald-400/[0.045] text-emerald-100'
                        : 'border-white/10 bg-white/[0.025] text-white/80'
                    }`}
                  >
                    {healthBand === 'red'
                      ? `Critical: health is below 125%. This position is below the warning boundary; add collateral or repay NGNS promptly. The protocol's liquidation boundary is ${LIQUIDATION_RATIO}%.`
                      : healthBand === 'yellow'
                      ? `Warning: health is at least 125% but below your ${formatNumber(d.ratio, {
                          maxDecimals: 1,
                        })}% minimum collateral ratio. The position is under its configured target; add collateral or repay NGNS to restore the target.`
                      : healthBand === 'green'
                      ? `Healthy: health is at or above your ${formatNumber(d.ratio, {
                          maxDecimals: 1,
                        })}% minimum collateral ratio. Continue monitoring the oracle-valued collateral and debt as market prices change.`
                      : !hasDebt
                      ? 'This position has no outstanding NGNS debt, so a debt health ratio is not currently applicable.'
                      : 'The health ratio is unavailable in the latest position snapshot. Refresh the page and check the oracle / position data.'}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] sm:text-[11px]">
                    <div className="rounded-lg border border-white/[0.06] p-2.5">
                      <p className="text-white/75">Configured minimum</p>
                      <p className="mt-1 font-black">
                        {formatNumber(d.ratio, { maxDecimals: 2 })}%
                      </p>
                    </div>
                    <div className="rounded-lg border border-white/[0.06] p-2.5">
                      <p className="text-white/75">Current health</p>
                      <p className={`mt-1 font-black ${healthTone}`}>
                        {health === null
                          ? 'Unavailable'
                          : `${formatNumber(health, { maxDecimals: 2 })}%`}
                      </p>
                    </div>
                  </div>
                </section>
              )}

              <p
                className={`mt-3 text-[10px] sm:text-[11px] leading-5 ${
                  d.status === 'liquidatable'
                    ? 'text-red-300'
                    : d.status === 'risk'
                    ? 'text-amber-200'
                    : 'text-white/75'
                }`}
              >
                {st.msg}
              </p>
              {vault?.stale && (
                <p className="mt-2 flex items-center gap-2 text-[9px] sm:text-[10px] font-bold text-amber-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  Showing last known data · retrying
                </p>
              )}
              <div className="mt-4 border-t border-white/[0.07] pt-3 sm:pt-4">
                <p className="mb-2 text-[8px] sm:text-[9px] font-extrabold uppercase tracking-[.18em] text-white/75">
                  Position actions
                </p>
                {oracleStale && (
                  <p className="mb-3 flex items-start gap-2 text-[9px] sm:text-[10px] font-bold leading-4 text-amber-300">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
                    Price feed is stale. Values shown are estimates. Deposit and Borrow resume
                    automatically once the feed updates.
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!vault?.registered ? (
                    <button
                      type="button"
                      className={`${primary} w-full`}
                      onClick={() => onAction('deposit', symbol)}
                    >
                      Open vault <span aria-hidden="true">↗</span>
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={`${primary} disabled:cursor-not-allowed`}
                        disabled={oracleStale}
                        title={
                          oracleStale ? 'Unavailable while the price feed is stale' : undefined
                        }
                        onClick={() => onAction('deposit', symbol)}
                      >
                        ＋ Deposit
                      </button>
                      {hasCollateral && (
                        <button
                          type="button"
                          className={`${ghost} disabled:cursor-not-allowed`}
                          disabled={oracleStale}
                          title={
                            oracleStale ? 'Unavailable while the price feed is stale' : undefined
                          }
                          onClick={() => onAction('borrow', symbol)}
                        >
                          ↗ Borrow
                        </button>
                      )}
                      {hasDebt && (
                        <button
                          type="button"
                          className={ghost}
                          onClick={() => onAction('repay', symbol)}
                        >
                          ↘ Repay
                        </button>
                      )}
                      {hasCollateral && (
                        <button
                          type="button"
                          className={ghost}
                          onClick={() => onAction('withdraw', symbol)}
                        >
                          ↑ Withdraw
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  );
};

/* ============================== PUSH PROMPT ============================== */

const PushPrompt = ({ busy, onEnable, onDismiss }) => (
  <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center px-0 sm:px-4">
    <div
      className="absolute inset-0 bg-black/90 backdrop-blur-xl"
      onClick={() => !busy && onDismiss()}
    />
    <motion.div
      initial={{ opacity: 0, y: '8%', scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: '8%', scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 280, damping: 28 }}
      className="relative w-full sm:max-w-md overflow-hidden rounded-t-[30px] sm:rounded-[30px] border border-white/10 bg-[#0b0b0d] shadow-[0_35px_120px_rgba(0,0,0,.65)]"
    >
      <div className="h-1 bg-gradient-to-r from-transparent via-salvaGold to-transparent" />
      <div className="p-5 sm:p-7">
        <div className="w-12 h-12 rounded-2xl border border-salvaGold/20 bg-salvaGold/10 flex items-center justify-center text-xl text-salvaGold">
          🔔
        </div>
        <p className="mt-4 text-[9px] uppercase tracking-[.35em] text-salvaGold font-black">
          Protect your vault
        </p>
        <h3 className="text-xl sm:text-2xl font-black mt-1">Turn on position alerts</h3>
        <p className="text-xs text-white/80 mt-2 leading-6">
          Your collateral is valued by a live price oracle, so your position's health changes as the
          market moves. If it falls close to the {LIQUIDATION_RATIO}% liquidation ratio, your
          collateral can be liquidated.
        </p>

        <ul className="mt-4 space-y-2 text-[11px] text-white/80">
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            Get warned when your position's health drops, even if Salva is closed.
          </li>
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            Time to add collateral or repay NGNS before it becomes critical.
          </li>
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            Only about your vault. No marketing messages.
          </li>
        </ul>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white disabled:opacity-40"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy && <Spinner small />}
            {busy ? 'Enabling…' : 'Enable alerts'}
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

/* ============================== PAGE ============================== */

const CDP = () => {
  const navigate = useNavigate();

  const [user] = useState(() => {
    try {
      const raw = localStorage.getItem('salva_user');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.safeAddress ? parsed : null;
    } catch {
      return null;
    }
  });
  const [chain] = useState(() => (localStorage.getItem('salva_chain') || 'base').toLowerCase());

  const [snap, setSnap] = useState(() => (user ? readCdpCache(user.email, chain) : null));
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [version, setVersion] = useState(() => localStorage.getItem('salva_cdp_manager') || '');
  const [modal, setModal] = useState(null);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const mountedRef = useRef(true);
  const inflightRef = useRef(null);

  const readPushMeta = () => {
    const c = user ? readWalletCache(user.email, chain) : null;
    return {
      known: Boolean(c),
      sub: c?.pushSubscription ?? null,
      seen: Boolean(c?.seenPushNotification),
    };
  };
  const [pushMeta, setPushMeta] = useState(readPushMeta);
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushPromptShownRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inflightRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const showMsg = useCallback(
    (message, type = 'success') => setNotification({ show: true, message, type }),
    []
  );
  const closeMsg = useCallback(() => setNotification((n) => ({ ...n, show: false })), []);

  const closeModal = useCallback(() => setModal(null), []);
  useOverlayLayer('cdpModal', Boolean(modal), closeModal);

  const readIntoUI = useCallback(() => {
    if (!user?.email || !mountedRef.current) return;
    setSnap(readCdpCache(user.email, chain));
    setPushMeta(readPushMeta());
  }, [chain, user?.email]);

  const poll = useCallback(
    async ({ force = false } = {}) => {
      if (!user?.email) return false;
      if (inflightRef.current && !force) return false;
      if (inflightRef.current && force) inflightRef.current.abort();

      const controller = new AbortController();
      inflightRef.current = controller;
      try {
        await fetchCdpSnapshot(user.email, user.safeAddress, chain, { signal: controller.signal });
        if (mountedRef.current) {
          readIntoUI();
          setLoadError(null);
        }
        return true;
      } catch (error) {
        if (error?.name === 'AbortError') return false;
        if (mountedRef.current) setLoadError(error?.message || 'Could not refresh vaults');
        return false;
      } finally {
        if (inflightRef.current === controller) inflightRef.current = null;
      }
    },
    [chain, readIntoUI, user?.email, user?.safeAddress]
  );

  useEffect(() => {
    if (!user?.email) return undefined;
    readIntoUI();
    poll();

    const tick = () => {
      if (document.visibilityState === 'visible') poll();
    };
    const timer = setInterval(tick, CDP_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [poll, readIntoUI, user?.email]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await poll({ force: true });
    } finally {
      if (mountedRef.current) setRefreshing(false);
    }
  }, [poll]);

  const walletAssets = useMemo(
    () => (user ? readWalletCache(user.email, chain, LOCAL_LOGOS)?.assets || [] : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, user?.email, chain]
  );

  const managers = snap?.managers || [];
  const manager = managers.find((m) => m.version === version) || managers[0] || null;
  const positions = useMemo(
    () => (manager ? snap?.positions?.[manager.version] || {} : {}),
    [manager, snap]
  );

  const selectManager = (v) => {
    setVersion(v);
    localStorage.setItem('salva_cdp_manager', v);
  };

  const activePositions = Object.values(positions).filter(
    (v) => v?.registered && (num(v.collateral) > 0 || num(v.debt) > 0)
  ).length;

  const hasAnyCollateral = Object.values(positions).some((v) => num(v?.collateral) > 0);
  const hasAnyDebt = Object.values(positions).some((v) => num(v?.debt) > 0);
  const depositedCollateralTokens = manager
    ? manager.whitelistedTokens.filter((token) => num(positions[token.symbol]?.collateral) > 0)
    : [];
    const unregisteredTokens = manager
    ? manager.whitelistedTokens.filter((token) => !positions[token.symbol]?.registered)
    : [];
  // A position = any registered vault, on any manager, holding collateral or debt.
  const hasPosition = useMemo(
    () =>
      Object.values(snap?.positions || {}).some((byToken) =>
        Object.values(byToken || {}).some(
          (v) => v?.registered && (num(v.collateral) > 0 || num(v.debt) > 0)
        )
      ),
    [snap]
  );

  // Ask once per visit: has a position AND is not subscribed.
  useEffect(() => {
    if (pushPromptShownRef.current) return;
    if (!pushMeta.known || !hasPosition || pushMeta.seen || pushMeta.sub) return;
    if (!VAPID_PUBLIC_KEY || !pushSupported() || window.Notification.permission === 'denied')
      return;
    pushPromptShownRef.current = true;
    setPushPromptOpen(true);
  }, [hasPosition, pushMeta]);

  const markSeen = async (sub = null) => {
    try {
      await postJson(`${SALVA_API_URL}/api/seen-push-notification`, { email: user.email });
    } catch {}
    const c = readWalletCache(user.email, chain);
    if (c) {
      writeWalletCache(
        user.email,
        chain,
        { ...c, pushSubscription: sub ?? c.pushSubscription ?? null, seenPushNotification: true },
        LOCAL_LOGOS
      );
    }
    if (mountedRef.current) setPushMeta((m) => ({ ...m, seen: true, sub: sub ?? m.sub }));
  };

  const enablePush = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        showMsg(
          'Notifications were not allowed. You can enable them in your browser settings.',
          'error'
        );
        await markSeen();
        setPushPromptOpen(false);
        return;
      }

      await navigator.serviceWorker.register('/sw.js');
      const reg = await navigator.serviceWorker.ready;

      const sub =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        }));

      const subscription = sub.toJSON();
      await postJson(`${SALVA_API_URL}/api/save-subscription`, {
        email: user.email,
        subscription,
      });

      // Keep the local copy in sync so the prompt never returns.
      try {
        const raw = localStorage.getItem('salva_user');
        if (raw) {
          const stored = JSON.parse(raw);
          stored.pushSubscription = subscription;
          localStorage.setItem('salva_user', JSON.stringify(stored));
        }
      } catch {}

      await markSeen(subscription);
      setPushPromptOpen(false);
      showMsg('Position alerts enabled');
    } catch (error) {
      showMsg(error?.message || 'Could not enable alerts', 'error');
    } finally {
      if (mountedRef.current) setPushBusy(false);
    }
  };

  const openAction = (action, symbol, registerOnly = false) =>
    setModal({ action, symbol, registerOnly });
  const firstSymbol = (pred) =>
    manager?.whitelistedTokens.find((t) => pred(positions[t.symbol]))?.symbol ||
    manager?.whitelistedTokens[0]?.symbol;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080809]">
        <Spinner />
      </div>
    );
  }

  const heroBtn =
    'h-11 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-30';

  return (
    <div className="cdp-mobile-scale text-white relative mx-auto w-full max-w-6xl px-1 sm:px-2 pb-10">
      <style>{`@media (max-width: 639px) { .cdp-mobile-scale { zoom: 0.8; } }`}</style>
      <div className="pointer-events-none absolute -top-20 left-1/3 h-72 w-72 rounded-full bg-salvaGold/[0.035] blur-[100px]" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-7 sm:mb-9">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[.24em] text-salvaGold font-extrabold">
              <span className="h-1.5 w-1.5 rounded-full bg-salvaGold shadow-[0_0_12px_rgba(212,175,55,.8)]" />
              Salva Protocol <span className="text-white/80">/</span> {chain}
            </div>
            <h1 className="text-3xl sm:text-5xl font-black tracking-[-.045em] mt-2">
              Borrow against your assets.
            </h1>
            <p className="text-sm text-white/80 mt-2 max-w-xl leading-6">
              Manage collateral, mint NGNS and monitor your vault health from one place.
            </p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            aria-label="Refresh vaults"
            className="w-11 h-11 shrink-0 rounded-2xl border border-white/10 bg-white/[0.025] flex items-center justify-center text-white/85 hover:text-salvaGold hover:border-salvaGold/30 hover:bg-salvaGold/[0.06] transition-all disabled:opacity-60"
          >
            <span className={refreshing ? 'inline-block animate-spin' : ''}>↻</span>
          </button>
        </div>

        {!snap && !loadError ? (
          <div className="py-24 flex flex-col items-center gap-3">
            <Spinner />
            <p className="text-[10px] uppercase tracking-widest font-black text-white">
              Loading vaults
            </p>
          </div>
        ) : !snap && loadError ? (
          <div className="py-20 text-center rounded-3xl border border-white/10 bg-white/[0.03] px-6">
            <p className="text-sm font-black">Could not load vaults</p>
            <p className="text-xs text-white mt-1">{loadError}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-5 px-5 py-2.5 rounded-xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest"
            >
              Try again
            </button>
          </div>
        ) : managers.length === 0 ? (
          <div className="py-20 text-center rounded-3xl border border-white/10 bg-white/[0.03] px-6">
            <p className="text-sm font-black">No position managers on {chain}</p>
            <p className="text-xs text-white mt-1">
              Switch network from the dashboard to see other vaults.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5 flex flex-col gap-3 rounded-[24px] border border-white/[0.07] bg-white/[0.018] p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-salvaGold">
                  Market deployment
                </p>
                <p className="mt-1 text-sm font-extrabold tracking-tight">
                  Choose a position manager
                </p>
                <p className="mt-1 text-[11px] text-white/75">
                  Each collateral asset is managed as an isolated position.
                </p>
              </div>
              <div className="w-full sm:max-w-[330px]">
                <label className="mb-2 block text-[9px] uppercase tracking-[.2em] text-white/75 font-extrabold">
                  Position manager
                </label>
                <Select
                  value={manager?.version}
                  options={managers.map((m) => ({ value: m.version, m }))}
                  onChange={selectManager}
                  renderValue={(o) => (
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black">{o.value}</span>
                      <span className="text-[10px] font-mono text-white">
                        {truncate(o.m.contractAddress, 8, 6)}
                      </span>
                    </div>
                  )}
                  renderOption={(o) => (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-black">{o.value}</p>
                        <p className="text-[9px] font-mono text-white">
                          {truncate(o.m.contractAddress, 8, 6)}
                        </p>
                      </div>
                      <span className="text-[10px] font-bold text-white">
                        {o.m.whitelistedTokens.length} collateral
                      </span>
                    </div>
                  )}
                />
              </div>
            </div>

            {activePositions === 0 && (
              <section className="relative mb-5 overflow-hidden rounded-[30px] border border-salvaGold/[0.17] bg-[radial-gradient(ellipse_at_top_right,rgba(212,175,55,.12),transparent_44%),linear-gradient(135deg,#171719,#0b0b0d_75%)] p-5 sm:p-7 shadow-[0_24px_80px_rgba(0,0,0,.25)]">
                <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-salvaGold/[0.07] blur-[90px]" />
                <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="max-w-2xl">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-salvaGold/20 bg-salvaGold/10 text-salvaGold">
                        ◈
                      </span>
                      <p className="text-[10px] font-extrabold uppercase tracking-[.2em] text-salvaGold">
                        Salva CDP · {chain}
                      </p>
                      <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.07] px-2 py-1 text-[9px] font-bold text-emerald-300">
                        Isolated positions
                      </span>
                    </div>
                    <h2 className="mt-4 text-2xl font-black tracking-[-.04em] sm:text-3xl">
                      Your collateral. Your borrowing power.
                    </h2>
                    <p className="mt-2 max-w-xl text-xs leading-6 text-white/80">
                      Deposit supported assets, mint NGNS against each collateral position, and keep
                      an eye on the health of every vault independently.
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] font-semibold text-white/75">
                      <span>
                        {activePositions} active position{activePositions === 1 ? '' : 's'}
                      </span>
                      <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
                      <span>
                        {depositedCollateralTokens.length} collateral asset
                        {depositedCollateralTokens.length === 1 ? '' : 's'} deposited
                      </span>
                      <span className="hidden h-1 w-1 rounded-full bg-white/20 sm:block" />
                      <span>
                        {snap?.at
                          ? `Updated ${new Date(snap.at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`
                          : 'Waiting for first update'}
                      </span>
                      {loadError && <span className="text-amber-300">Refresh retrying…</span>}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 lg:w-[290px] lg:shrink-0">
                    <button
                      type="button"
                      className={`${heroBtn} col-span-2 h-12 bg-salvaGold text-black shadow-[0_6px_22px_rgba(212,175,55,.14)] hover:brightness-110`}
                      onClick={() => openAction('deposit', manager.whitelistedTokens[0]?.symbol)}
                    >
                      ＋ Deposit collateral
                    </button>
                    <button
                      type="button"
                      disabled={!hasAnyCollateral}
                      className={`${heroBtn} border border-white/[0.12] bg-white/[0.025] text-white/80 hover:border-salvaGold/25 hover:bg-white/[0.05]`}
                      onClick={() =>
                        openAction(
                          'borrow',
                          firstSymbol((v) => num(v?.collateral) > 0)
                        )
                      }
                    >
                      Borrow NGNS
                    </button>
                    <button
                      type="button"
                      disabled={!hasAnyDebt}
                      className={`${heroBtn} border border-white/[0.12] bg-white/[0.025] text-white/80 hover:border-salvaGold/25 hover:bg-white/[0.05]`}
                      onClick={() =>
                        openAction(
                          'repay',
                          firstSymbol((v) => num(v?.debt) > 0)
                        )
                      }
                    >
                      Repay debt
                    </button>
                  </div>
                </div>

                <div className="relative mt-5 flex flex-wrap gap-2 border-t border-white/[0.08] pt-4">
                  <span className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] font-semibold text-white/75">
                    Health checked per vault
                  </span>
                  <span className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] font-semibold text-white/75">
                    Oracle-valued collateral
                  </span>
                  <span className="rounded-lg border border-white/[0.07] bg-black/20 px-3 py-2 text-[10px] font-semibold text-white/75">
                    Withdrawable balance per asset
                  </span>
                </div>
              </section>
            )}

            <div className="flex items-end justify-between gap-3 mt-7 mb-3">
              <div>
                <h2 className="text-xl sm:text-2xl font-black tracking-tight">Your positions</h2>
                <p className="mt-1 text-[11px] text-white/75">
                  Each asset has its own collateral value, debt, health and withdrawable amount.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {activePositions > 0 && unregisteredTokens.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      openAction('deposit', unregisteredTokens[0].symbol, true)
                    }
                    className="rounded-full bg-salvaGold px-3.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-black hover:brightness-110"
                  >
                    ＋ Deposit collateral
                  </button>
                )}
                <span className="rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5 text-[10px] font-bold text-white/75">
                  {depositedCollateralTokens.length} position
                  {depositedCollateralTokens.length === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            {depositedCollateralTokens.length > 0 ? (
              <div className="grid grid-cols-1 gap-4">
                {depositedCollateralTokens.map((t) => (
                  <VaultCard
                    key={`${manager.version}:${t.symbol}`}
                    symbol={t.symbol}
                    vault={positions[t.symbol]}
                    walletAssets={walletAssets}
                    onAction={openAction}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-5 py-10 text-center">
                <p className="text-sm font-black">No deposited collateral</p>
                <p className="mt-2 text-xs leading-5 text-white/75">
                  This position manager has no collateral deposited yet. Deposit a supported asset
                  to see its position here.
                </p>
                <button
                  type="button"
                  onClick={() => openAction('deposit', manager.whitelistedTokens[0]?.symbol)}
                  className="mt-4 rounded-xl bg-salvaGold px-4 py-3 text-[10px] font-black uppercase tracking-widest text-black hover:brightness-110"
                >
                  ＋ Deposit collateral
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <AnimatePresence>
        {modal && manager && (
          <ActionModal
            key={`${modal.action}:${manager.version}`}
            action={modal.action}
            manager={manager}
            positions={positions}
            initialSymbol={modal.symbol}
            registerOnly={modal.registerOnly}
            user={user}
            chain={chain}
            walletAssets={walletAssets}
            onClose={closeModal}
            showMsg={showMsg}
            onSuccess={() => poll({ force: true })}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pushPromptOpen && (
          <PushPrompt
            key="push-prompt"
            busy={pushBusy}
            onEnable={enablePush}
            onDismiss={() => {
              setPushPromptOpen(false);
              markSeen();
            }}
          />
        )}
        {notification.show && <Notification notification={notification} onClose={closeMsg} />}
      </AnimatePresence>
    </div>
  );
};

export default CDP;
