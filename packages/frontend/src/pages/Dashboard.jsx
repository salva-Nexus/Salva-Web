import { SALVA_API_URL } from '../config';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Stars from '../components/Stars';
import SantTab from './SantTab';
import Chains from './Chains';
import SendTransferModal from './SendTransferModal';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';
import {
  POLL_INTERVAL_MS,
  walletKey,
  readWalletCache,
  readSupportedChainsCache,
  writeSupportedChainsCache,
  fetchWalletSnapshot,
  writeWalletCache,
} from '../utils/walletCache';

const LOCAL_LOGOS = {
  NGNS: ngnLogo,
  SANT: santLogo,
};

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

/* ============================================================================
   HELPERS
============================================================================ */

const formatNumber = (value, { minDecimals = 0, maxDecimals = 6 } = {}) => {
  if (value === null || value === undefined || value === '') return '0';

  // Numeric strings are truncated directly (no float round trip). Numbers are
  // expanded with extra digits first so float noise (0.29 -> 0.28999…) never
  // causes an off-by-one, then sliced, never rounded.
  let str;
  if (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim())) {
    str = value.trim();
  } else {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0';
    str =
      Math.abs(n) >= 1e21
        ? n.toLocaleString('en-US', { useGrouping: false })
        : n.toFixed(Math.min(100, maxDecimals + 8));
  }

  const negative = str.startsWith('-');
  const [rawInt, rawDec = ''] = str.replace('-', '').split('.');

  const integer = rawInt.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  let decimal = rawDec.slice(0, maxDecimals).padEnd(maxDecimals, '0');
  while (decimal.length > minDecimals && decimal.endsWith('0')) {
    decimal = decimal.slice(0, -1);
  }

  const isZero = /^0*$/.test(rawInt) && /^0*$/.test(decimal);
  const sign = negative && !isZero ? '-' : '';

  return `${sign}${integer}${decimal ? `.${decimal}` : ''}`;
};

// Fiat sub-values: 2 decimals (truncated). Non-zero amounts below 0.01 show as "<$0.01".
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

const truncateAddress = (address, start = 7, end = 5) => {
  if (!address) return '—';

  if (address.length <= start + end + 1) {
    return address;
  }

  return `${address.slice(0, start)}…${address.slice(-end)}`;
};

/* ============================================================================
   ASSET PRICING
============================================================================ */

const getAssetUsdPrice = (asset) => {
  const n = Number(asset?.usdPrice);
  return Number.isFinite(n) ? n : 0;
};

const getAssetNgnRate = (asset) => {
  const n = Number(asset?.ngnRate);
  return Number.isFinite(n) ? n : 0;
};

const AssetValueLine = ({ asset, className = '' }) => {
  const usdPrice = getAssetUsdPrice(asset);

  if (usdPrice <= 0) {
    return <p className={className}>-</p>;
  }

  const balance = Number(asset?.balance) || 0;
  const usdValue = balance * usdPrice;
  const ngnValue = usdValue * getAssetNgnRate(asset);

  return (
    <p className={className}>
      {formatFiat(usdValue, '$')}
      <span className="text-white/35 mx-1">·</span>
      {formatFiat(ngnValue, '₦')}
    </p>
  );
};

const DEFAULT_FETCH_TIMEOUT_MS = 12000;

let overlayStack = [];
let pendingOverlayOps = { opened: [], closed: [] };
let overlayFlushScheduled = false;
let suppressPopCount = 0;
let poppedViaHistory = new Set();

function flushOverlayOps() {
  overlayFlushScheduled = false;

  const { opened, closed } = pendingOverlayOps;
  pendingOverlayOps = { opened: [], closed: [] };

  let historyClosedCount = 0;

  closed.forEach(({ id }) => {
    const idx = overlayStack.findIndex((layer) => layer.id === id);

    if (idx !== -1) overlayStack.splice(idx, 1);

    if (poppedViaHistory.has(id)) {
      poppedViaHistory.delete(id);
    } else {
      historyClosedCount += 1;
    }
  });

  // "Adopted" layers reuse the history entry the page is already on,
  // so they must not push a new one.
  const netAdded = opened.filter((layer) => !layer.adopt).length;
  const netRemoved = historyClosedCount;

  opened.forEach(({ id, close, adopt }) => {
    overlayStack = overlayStack.filter((layer) => layer.id !== id);
    overlayStack.push({ id, close });

    if (adopt) {
      window.history.replaceState({ ...(window.history.state || {}), salvaOverlay: true }, '');
    }
  });

  if (netAdded > netRemoved) {
    for (let i = 0; i < netAdded - netRemoved; i += 1) {
      window.history.pushState({ salvaOverlay: true }, '');
    }
  } else if (netRemoved > netAdded) {
    for (let i = 0; i < netRemoved - netAdded; i += 1) {
      if (window.history.state?.salvaOverlay) {
        suppressPopCount += 1;
        window.history.back();
      }
    }
  }

  if (overlayStack.length > 0) {
    document.body.classList.add('salva-overlay-open');
  } else {
    document.body.classList.remove('salva-overlay-open');
  }
}

function scheduleOverlayFlush() {
  if (overlayFlushScheduled) return;

  overlayFlushScheduled = true;
  queueMicrotask(flushOverlayOps);
}

// Used when the owning component unmounts while its overlay is still open
// (e.g. navigating from a service to /pools/... or /link-name). No history
// manipulation here: the route change already moved history on.
function dropOverlayLayer(id) {
  pendingOverlayOps.opened = pendingOverlayOps.opened.filter((layer) => layer.id !== id);
  overlayStack = overlayStack.filter((layer) => layer.id !== id);
  poppedViaHistory.delete(id);

  if (overlayStack.length === 0) {
    document.body.classList.remove('salva-overlay-open');
  }
}

export const useOverlayLayer = (id, isOpen, close, { adoptOnMount = false } = {}) => {
  const closeRef = useRef(close);
  closeRef.current = close;

  const wasOpenRef = useRef(false);
  const adoptRef = useRef(adoptOnMount);

  useEffect(() => {
    if (isOpen === wasOpenRef.current) return;

    wasOpenRef.current = isOpen;

    if (isOpen) {
      pendingOverlayOps.opened.push({
        id,
        close: () => closeRef.current(),
        adopt: adoptRef.current,
      });
    } else {
      adoptRef.current = false;
      pendingOverlayOps.closed.push({ id });
    }

    scheduleOverlayFlush();
  }, [id, isOpen]);

  // If the component unmounts while its overlay is open, release the layer.
  useEffect(
    () => () => {
      if (wasOpenRef.current) {
        wasOpenRef.current = false;
        dropOverlayLayer(id);
      }
    },
    [id]
  );
};

const fetchWithTimeout = (url, options = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) => {
  const controller = new AbortController();

  const timer = setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
    ...options,
    signal: controller.signal,
  }).finally(() => clearTimeout(timer));
};

/* ============================================================================
   SMALL UI
============================================================================ */

const Spinner = ({ small = false }) => (
  <span
    className={`${
      small ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'
    } border-2 border-salvaGold/25 border-t-salvaGold rounded-full animate-spin inline-block`}
  />
);

export const PleaseWaitOverlay = ({ message = 'Please wait…' }) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
    className="fixed inset-0 z-[150] flex items-center justify-center bg-black/80 backdrop-blur-md"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div className="flex flex-col items-center gap-4">
      <div className="relative w-14 h-14">
        <span className="absolute inset-0 rounded-full border-2 border-salvaGold/15" />
        <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-salvaGold animate-spin" />
        <span className="absolute inset-[14px] rounded-full bg-salvaGold/10 border border-salvaGold/20" />
      </div>

      <p className="text-[10px] sm:text-[11px] font-black uppercase tracking-[.3em] text-white/80">
        {message}
      </p>
    </div>
  </motion.div>
);

export const Notification = ({ notification, onClose }) => {
  useEffect(() => {
    if (!notification.show) return undefined;
    const t = setTimeout(onClose, 3000);
    return () => clearTimeout(t);
  }, [notification, onClose]);

  if (!notification.show) return null;

  const colors = {
    success: ['✓', '#D4AF37'],
    error: ['×', '#EF4444'],
    info: ['i', '#3B82F6'],
    warning: ['!', '#F59E0B'],
  };

  const [icon, accent] = colors[notification.type] || colors.info;

  return (
    <motion.div
      initial={{ opacity: 0, y: -18, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -18, scale: 0.97 }}
      className="fixed right-3 top-3 sm:right-4 sm:top-4 z-[200] w-[calc(100%-1.5rem)] sm:w-[calc(100%-2rem)] max-w-sm"
    >
      <div className="overflow-hidden rounded-xl sm:rounded-2xl border border-white/10 bg-[#101012]/95 shadow-2xl backdrop-blur-2xl">
        <div className="h-px" style={{ background: accent }} />

        <div className="flex items-start gap-2.5 sm:gap-3 p-3 sm:p-4">
          <div
            className="flex h-7 w-7 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg sm:rounded-xl font-black text-[0.9625rem]"
            style={{
              background: `${accent}12`,
              color: accent,
              border: `1px solid ${accent}28`,
            }}
          >
            {icon}
          </div>

          <div className="min-w-0 flex-1">
            <p
              className="text-[8.8px] sm:text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{ color: accent }}
            >
              {notification.type}
            </p>

            <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs leading-4 sm:leading-5 text-white/75">
              {notification.message}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-white/25 transition hover:bg-white/5 hover:text-white"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      </div>
    </motion.div>
  );
};

/* ============================================================================
   QR
============================================================================ */

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
        <div className="w-12 h-12 rounded-2xl border border-salvaGold/20 bg-salvaGold/10 flex items-center justify-center text-[1.375rem] text-salvaGold">
          🔔
        </div>
        <p className="mt-4 text-[9.9px] uppercase tracking-[.35em] text-salvaGold font-black">
          Stay informed
        </p>
        <h3 className="text-[1.375rem] sm:text-2xl font-black mt-1">Turn on transaction alerts</h3>
        <p className="text-[0.825rem] text-white/80 mt-2 leading-6">
          Get notified when your transfers, swaps and other transactions are confirmed or fail, even
          when Salva is closed.
        </p>

        <ul className="mt-4 space-y-2 text-[12.1px] text-white/80">
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            Instant status updates on every transaction.
          </li>
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            Know right away if something needs your attention.
          </li>
          <li className="flex gap-2">
            <span className="text-salvaGold">•</span>
            No marketing messages. You can turn this off in Account Settings.
          </li>
        </ul>

        <div className="flex gap-2 mt-6">
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl border border-white/10 text-[11px] font-black uppercase tracking-widest text-white disabled:opacity-40"
          >
            Not now
          </button>
          <button
            type="button"
            onClick={onEnable}
            disabled={busy}
            className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy && <Spinner small />}
            {busy ? 'Enabling…' : 'Enable alerts'}
          </button>
        </div>
      </div>
    </motion.div>
  </div>
);

const QRScannerModal = ({ onScan, onClose }) => {
  const scannerRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    let stopped = false;

    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');

        const scanner = new Html5Qrcode('salva-qr-scanner', {
          verbose: false,
        });

        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 180, height: 180 },
            aspectRatio: 1.333,
          },
          (text) => {
            if (stopped) return;

            stopped = true;

            onScan(
              text
                .replace(/^ethereum:/i, '')
                .split('?')[0]
                .trim()
            );
          },
          () => {}
        );

        startedRef.current = true;
      } catch (err) {
        console.error('Scanner start error:', err);
      }
    })();

    return () => {
      stopped = true;

      if (scannerRef.current && startedRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/95 backdrop-blur-md" onClick={onClose} />

      <motion.div
        className="
          relative w-full max-w-sm
          bg-zinc-950 border border-white/10
          p-4 sm:p-8
          rounded-t-[2rem] sm:rounded-3xl
        "
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{
          type: 'spring',
          damping: 25,
          stiffness: 200,
        }}
      >
        <div className="w-8 h-1 bg-white/10 rounded-full mx-auto mb-5 sm:hidden" />

        <div className="text-center mb-4 sm:mb-5">
          <p className="text-[8.8px] sm:text-[9px] uppercase tracking-[.4em] text-salvaGold/70 font-black mb-1">
            Scan to Pay
          </p>

          <h3 className="text-[1.2375rem] sm:text-xl font-black">Scan Wallet QR</h3>

          <p className="text-[11px] sm:text-xs text-white/80 mt-1">
            Hold the QR code steady in front of the camera
          </p>
        </div>

        <div className="relative h-[230px] sm:h-[260px] rounded-2xl overflow-hidden border border-white/10 bg-black mb-4">
          <div id="salva-qr-scanner" className="absolute inset-0" />
        </div>

        <p className="text-[9.9px] sm:text-[10px] text-white/70 text-center mb-4 font-bold">
          Keep the QR 15–30cm from camera
        </p>

        <button
          onClick={onClose}
          className="w-full py-3 rounded-xl sm:rounded-2xl border border-white/10 font-bold text-white/80 text-[0.825rem] uppercase tracking-widest"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
};

/* ============================================================================
   ASSET LOGO
============================================================================ */

const CHAIN_BADGE_COLORS = {
  base: '#0052FF',
  bnb: '#F0B90B',
};

const AssetLogo = ({ asset, size = 'w-9 h-9 sm:w-11 sm:h-11', showChainBadge = false }) => {
  const chain = (asset?.chain || '').toLowerCase();

  const badgeColor = CHAIN_BADGE_COLORS[chain] || '#6B7280';

  const [attempt, setAttempt] = useState(0);
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setAttempt(0);
    setBroken(false);
  }, [asset?.logo]);

  useEffect(() => {
    if (!broken || attempt >= 2) return undefined;

    const t = setTimeout(() => {
      setAttempt((a) => a + 1);
      setBroken(false);
    }, 1000 * (attempt + 1));

    return () => clearTimeout(t);
  }, [broken, attempt]);

  const showImg = Boolean(asset?.logo) && !broken;

  return (
    <div className={`relative ${size} flex-shrink-0`}>
      <div className="w-full h-full rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden">
        {showImg ? (
          <img
            key={attempt}
            src={asset.logo}
            alt={asset.symbol}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
            style={
              asset.symbol === 'NGNS'
                ? {
                    objectPosition: '48% 60%',
                    transform: 'scale(2)',
                  }
                : undefined
            }
            onError={() => setBroken(true)}
          />
        ) : (
          <span className="font-black text-[11px] sm:text-xs text-salvaGold">
            {asset?.symbol?.slice(0, 3)}
          </span>
        )}
      </div>

      {showChainBadge && chain && (
        <span
          className="
            absolute -bottom-0.5 -right-0.5
            w-3.5 h-3.5 sm:w-4 sm:h-4
            rounded-full
            border-2 border-[#0A0A0B]
            flex items-center justify-center
            text-[6.6px] sm:text-[7px]
            font-black text-white
          "
          style={{ background: badgeColor }}
        >
          {chain[0].toUpperCase()}
        </span>
      )}
    </div>
  );
};

/* ============================================================================
   ASSET DETAILS
============================================================================ */

export const AssetDetailsModal = ({
  asset,
  onClose,
  showBalance,
  onSend,
  onReceive,
  user,
  showMsg,
  onSantClaimed,
}) =>
  asset && (
    <div className="fixed inset-0 z-[50] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{
          type: 'spring',
          damping: 28,
          stiffness: 220,
        }}
        className="
          relative w-full sm:max-w-md
          rounded-t-[1.5rem] sm:rounded-3xl
          bg-zinc-950 border border-white/10
          p-4 sm:p-7
          shadow-2xl
          max-h-[88vh] overflow-y-auto
        "
      >
        <div className="w-7 h-1 bg-white/10 rounded-full mx-auto mb-4 sm:hidden" />

        <div className="flex items-center justify-between mb-5 sm:mb-6">
          <button onClick={onClose} className="text-white/75 hover:text-white text-[1.2375rem]">
            ‹
          </button>

          <p className="text-[8.8px] sm:text-[9px] uppercase tracking-[.3em] text-white/70 font-black">
            Token
          </p>

          <span className="w-5" />
        </div>

        <div className="flex flex-col items-center text-center mb-6 sm:mb-7">
          <AssetLogo asset={asset} size="w-14 h-14 sm:w-16 sm:h-16" showChainBadge />

          <h3 className="font-black text-[1.2375rem] sm:text-xl mt-3">{asset.symbol}</h3>

          <p className="text-[9.9px] sm:text-[10px] text-white/75 capitalize mt-0.5">
            {asset.chain || 'Unknown chain'}
          </p>

          <p className="font-black text-[1.65rem] sm:text-3xl mt-3">
            {showBalance ? formatNumber(asset.balance, { maxDecimals: 8 }) : '••••'}
          </p>

          <p className="text-[11px] sm:text-[11px] text-white/75 mt-1">{asset.symbol}</p>

          <AssetValueLine
            asset={asset}
            className="text-[11px] sm:text-[11px] text-white/75 font-bold mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-2 mb-6 sm:mb-7">
          <button
            onClick={onSend}
            className="
              flex flex-col items-center gap-1
              py-3 sm:py-3.5
              rounded-xl sm:rounded-2xl
              bg-salvaGold text-black
              font-black text-[9.9px] sm:text-[10px]
              uppercase tracking-widest
            "
          >
            <span className="text-[0.9625rem] sm:text-base leading-none">↑</span>
            Send
          </button>

          <button
            onClick={onReceive}
            className="
              flex flex-col items-center gap-1
              py-3 sm:py-3.5
              rounded-xl sm:rounded-2xl
              border border-white/10
              font-bold text-[9.9px] sm:text-[10px]
              uppercase tracking-widest text-white
            "
          >
            <span className="text-[0.9625rem] sm:text-base leading-none">↓</span>
            Receive
          </button>
        </div>

        {asset.isSant && (
          <SantTab
            user={user}
            showMsg={showMsg}
            santPoints={user?.santPoints ?? 0}
            onClaimed={onSantClaimed}
          />
        )}

        <p className="text-[8.8px] sm:text-[9px] uppercase tracking-[.25em] text-white/70 font-black mb-2.5">
          Token details
        </p>

        <div className="space-y-1.5 sm:space-y-2">
          {[
            ['Decimals', asset.decimals],
            ['Contract', asset.contractAddress],
            ['Chainlink Price Feed', asset.chainlinkFeedAddress],
          ].map(([label, value]) => (
            <div
              key={label}
              className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white/[0.03] border border-white/[0.06]"
            >
              <p className="text-[7.7px] sm:text-[8px] uppercase tracking-[.25em] text-white/65 font-black mb-1">
                {label}
              </p>

              <p
                className={`text-[11px] sm:text-xs font-bold break-all ${
                  label === 'Contract' || label.includes('URL') || label.includes('Feed')
                    ? 'font-mono text-white/85'
                    : 'text-white/90'
                }`}
              >
                {value || '—'}
              </p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );

/* ============================================================================
   REWARDS
============================================================================ */

const RewardsBar = ({ user, showMsg, refreshKey }) => {
  const [pointsRecord, setPointsRecord] = useState(null);

  useEffect(() => {
    if (!user?.email) return;
    fetch(`${SALVA_API_URL}/api/sant/points-record/${encodeURIComponent(user.email)}`)
      .then((r) => r.json())
      .then((d) => setPointsRecord(d.data || null))
      .catch(() => {});
  }, [refreshKey, user?.email]);

  const santPoints = Number(user?.santPoints) || 0;
  const referralCode = user?.referralCode;

  const referralLink = referralCode ? `https://salva-nexus.org/login?ref=${referralCode}` : null;

  const isFullyRedeemed = pointsRecord?.isLocked === true && santPoints <= 0;

  const showPointsRow = santPoints > 0 && !isFullyRedeemed;

  const showReferral = referralLink && !isFullyRedeemed;

  if (!showPointsRow && !showReferral) {
    return null;
  }

  return (
    <div
      className={`mb-2.5 sm:mb-5 rounded-xl sm:rounded-2xl border border-white/[0.06] bg-white/[0.03] overflow-hidden ${
        showPointsRow && showReferral ? 'grid grid-cols-2 divide-x divide-white/[0.05]' : ''
      }`}
    >
      {showPointsRow && (
        <div className="flex items-center justify-between gap-1.5 px-2 py-2 sm:px-4 sm:py-3.5 min-w-0">
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <span className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-salvaGold/15 border border-salvaGold/25 flex items-center justify-center flex-shrink-0">
              <span className="text-salvaGold text-[6.6px] sm:text-[10px] font-black">S</span>
            </span>

            <p className="min-w-0 text-[6.6px] sm:text-[10px] font-black text-white/85 uppercase tracking-wider truncate whitespace-nowrap">
              SANT Points
            </p>
          </div>

          <p className="shrink-0 font-black text-[8.8px] sm:text-sm text-salvaGold">
            {(santPoints * 100).toLocaleString('en-US')}
          </p>
        </div>
      )}

      {showReferral && (
        <button
          onClick={() => {
            navigator.clipboard.writeText(referralLink);
            showMsg('Referral link copied!');
          }}
          className="flex items-center justify-between gap-1.5 px-2 py-2 sm:px-4 sm:py-3.5 min-w-0 text-left hover:bg-white/[0.02] transition-all group"
        >
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <span className="w-3.5 h-3.5 sm:w-6 sm:h-6 rounded-full bg-blue-500/15 border border-blue-500/25 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 text-[6.6px] sm:text-[10px] font-black">↗</span>
            </span>

            <p className="min-w-0 text-[6.6px] sm:text-[10px] font-black text-white/85 uppercase tracking-wider truncate whitespace-nowrap">
              Referral Link
            </p>
          </div>

          <span className="shrink-0 font-mono text-[6.6px] sm:text-[10px] text-blue-400 truncate whitespace-nowrap max-w-[45%]">
            {referralCode}
          </span>
        </button>
      )}
    </div>
  );
};

/* ============================================================================
   DASHBOARD
============================================================================ */

const DASHBOARD_TIMEOUT_MS = 30000;

const Dashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      const raw = localStorage.getItem('salva_user');
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed?.safeAddress ? parsed : null;
    } catch {
      return null;
    }
  });

  const [selectedChain, setSelectedChain] = useState(
    () => localStorage.getItem('salva_chain') || 'base'
  );

  const initialCache = readWalletCache(user?.email, selectedChain, LOCAL_LOGOS);

  const [wallet, setWallet] = useState(() => ({
    assets: initialCache?.assets || [],
    totalNgn: initialCache?.totalNgn ?? null,
    updatedAt: initialCache?.at || null,
    error: null,
    hasSnapshot: Boolean(initialCache),
    initialLoading: !initialCache,
  }));

  const cachedChains = readSupportedChainsCache(user?.email);

  const [chains, setChains] = useState(() => cachedChains?.chains || []);
  const [chainPage, setChainPage] = useState(false);
  const [chainMetadataRefreshing, setChainMetadataRefreshing] = useState(false);

  const [showBalance, setShowBalance] = useState(
    () => localStorage.getItem('salva_show_balance') !== 'false'
  );

  const [detailsAsset, setDetailsAsset] = useState(null);
  const [sendAsset, setSendAsset] = useState(null);
  const [sendRecipient, setSendRecipient] = useState('');
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [receiveAsset, setReceiveAsset] = useState(null);
  const [isScanOpen, setIsScanOpen] = useState(false);

  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: 'info',
  });

  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [rewardsRefreshKey, setRewardsRefreshKey] = useState(0);
  const [govCount, setGovCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const [pushMeta, setPushMeta] = useState(() => ({
    known: Boolean(initialCache),
    sub: initialCache?.pushSubscription ?? null,
    seen: Boolean(initialCache?.seenPushNotification),
  }));
  const [pushPromptOpen, setPushPromptOpen] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const pushPromptShownRef = useRef(false);

  const walletRequestsRef = useRef(new Map());
  const walletGenerationRef = useRef(new Map());
  const pollTimerRef = useRef(null);
  const selectedChainRef = useRef(selectedChain);

  const mountedRef = useRef(true);

  useEffect(() => {
    selectedChainRef.current = selectedChain;
  }, [selectedChain]);

  const prevEmailRef = useRef(user?.email);

  useEffect(() => {
    if (prevEmailRef.current === user?.email) return;

    prevEmailRef.current = user?.email;

    const cache = readWalletCache(user?.email, selectedChain, LOCAL_LOGOS);

    setWallet({
      assets: cache?.assets || [],
      totalNgn: cache?.totalNgn ?? null,
      updatedAt: cache?.at || null,
      error: null,
      hasSnapshot: Boolean(cache),
      initialLoading: !cache,
    });
  }, [user?.email, selectedChain]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      walletRequestsRef.current.forEach(({ controller }) => controller?.abort());

      walletRequestsRef.current.clear();

      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
      }

      pollTimerRef.current = null;
    };
  }, []);

  const notificationRef = useRef(notification);
  notificationRef.current = notification;

  const showMsg = useCallback((message, type = 'success', onDismiss = null) => {
    setNotification({
      show: true,
      message,
      type,
      onDismiss,
    });
  }, []);

  const closeMsg = useCallback(() => {
    const onDismiss = notificationRef.current.onDismiss;

    setNotification((n) => ({
      ...n,
      show: false,
      onDismiss: null,
    }));

    if (typeof onDismiss === 'function') {
      onDismiss();
    }
  }, []);

  const requestJson = useCallback(
    async (url, options = {}, { timeout = DASHBOARD_TIMEOUT_MS, signal } = {}) => {
      const controller = new AbortController();

      const onAbort = () => controller.abort();

      if (signal) {
        if (signal.aborted) {
          controller.abort();
        } else {
          signal.addEventListener('abort', onAbort, {
            once: true,
          });
        }
      }

      const timer = timeout ? setTimeout(() => controller.abort(), timeout) : null;

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
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

        if (!response.ok) {
          throw new Error(
            data?.message || data?.errorMsg || data?.error || `Request failed (${response.status})`
          );
        }

        return data;
      } finally {
        if (timer) clearTimeout(timer);

        signal?.removeEventListener('abort', onAbort);
      }
    },
    []
  );

  useEffect(() => {
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  /* --------------------------------------------------------------------------
     GOVERNANCE
  -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!user?.isValidator || !user?.safeAddress) {
      setGovCount(0);
      return;
    }

    const controller = new AbortController();

    Promise.all([
      requestJson(
        `${SALVA_API_URL}/api/admin/proposalRequests`,
        {},
        {
          signal: controller.signal,
          timeout: 10000,
        }
      ),
      requestJson(
        `${SALVA_API_URL}/api/admin/proposals/${encodeURIComponent(user.safeAddress)}`,
        {},
        {
          signal: controller.signal,
          timeout: 10000,
        }
      ),
    ])
      .then(([requests, proposals]) => {
        if (!mountedRef.current) return;

        const a = Array.isArray(requests?.proposalRequests) ? requests.proposalRequests.length : 0;

        const b = Array.isArray(proposals?.proposals)
          ? proposals.proposals.filter((p) => p?.proposal?.proposalHash).length
          : 0;

        setGovCount(a + b);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') {
          console.warn('[Dashboard] governance refresh failed');
        }
      });

    return () => controller.abort();
  }, [requestJson, user?.isValidator, user?.safeAddress]);

  /* --------------------------------------------------------------------------
     CHAIN METADATA REFRESH
     Dashboard is the only component that talks to supportedChains. The result
     is persisted in walletCache so Chains.jsx never starts its own polling loop.
  -------------------------------------------------------------------------- */

  const refreshChainMetadata = useCallback(
    async ({ silent = true } = {}) => {
      if (!user?.email) return false;

      if (!silent) setChainMetadataRefreshing(true);

      try {
        const chainsData = await requestJson(
          `${SALVA_API_URL}/api/user/supportedChains`,
          {},
          { timeout: 12000 }
        );

        const list = Array.isArray(chainsData?.data)
          ? chainsData.data
          : Array.isArray(chainsData?.data?.chains)
          ? chainsData.data.chains
          : [];

        writeSupportedChainsCache(user.email, list);

        if (mountedRef.current) {
          setChains(list);
        }

        return true;
      } catch (error) {
        if (error?.name !== 'AbortError') {
          console.warn('[Dashboard] chain metadata refresh failed:', error?.message || error);
          if (!silent) {
            showMsg(error?.message || 'Could not load supported chains', 'error');
          }
        }
        return false;
      } finally {
        if (!silent && mountedRef.current) {
          setChainMetadataRefreshing(false);
        }
      }
    },
    [requestJson, showMsg, user?.email]
  );

  /* --------------------------------------------------------------------------
     CACHE -> REACT
  -------------------------------------------------------------------------- */

  const readSnapshotIntoUI = useCallback(
    (chain, { preserveError = false } = {}) => {
      if (!user?.email || !chain || !mountedRef.current) {
        return null;
      }

      const snapshot = readWalletCache(user.email, chain, LOCAL_LOGOS);

      if (!snapshot) {
        setWallet((current) => ({
          assets: [],
          totalNgn: null,
          updatedAt: null,
          error: preserveError ? current.error : null,
          hasSnapshot: false,
          initialLoading: true,
        }));

        return null;
      }

      setPushMeta({
        known: true,
        sub: snapshot.pushSubscription ?? null,
        seen: Boolean(snapshot.seenPushNotification),
      });

      setWallet((current) => ({
        assets: snapshot.assets || [],
        totalNgn: snapshot.totalNgn ?? null,
        updatedAt: snapshot.at,
        error: preserveError ? current.error : null,
        hasSnapshot: true,
        initialLoading: false,
      }));

      return snapshot;
    },
    [user?.email]
  );

  /* --------------------------------------------------------------------------
     SERVER POLL -> CACHE -> UI
  -------------------------------------------------------------------------- */

  const pollWallet = useCallback(
    async (chain, { force = false, reason = 'poll' } = {}) => {
      if (!user?.email || !chain) return false;

      const normalizedChain = String(chain).toLowerCase();

      const key = walletKey(user.email, normalizedChain);

      const existing = walletRequestsRef.current.get(key);

      if (existing && !force) {
        return existing.promise;
      }

      if (existing && force) {
        existing.controller?.abort();
        walletRequestsRef.current.delete(key);
      }

      const generation = (walletGenerationRef.current.get(key) || 0) + 1;

      walletGenerationRef.current.set(key, generation);

      const controller = new AbortController();

      const promise = (async () => {
        try {
          const { meta } = await fetchWalletSnapshot(user.email, normalizedChain, {
            signal: controller.signal,
            logoMap: LOCAL_LOGOS,
            timeout: null,
          });

          if (
            mountedRef.current &&
            selectedChainRef.current === normalizedChain &&
            walletGenerationRef.current.get(key) === generation
          ) {
            readSnapshotIntoUI(normalizedChain);
          }

          if (meta && mountedRef.current) {
            const lockedUntil = meta.accountLockedUntil ? new Date(meta.accountLockedUntil) : null;

            if (lockedUntil && lockedUntil.getTime() > Date.now()) {
              const hours = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 3600000));
              setIsAccountLocked(true);
              setLockMessage(`Account locked for ${hours} more hour${hours !== 1 ? 's' : ''}`);
            } else {
              setIsAccountLocked(false);
              setLockMessage('');
            }

            const safeMeta = {
              username: meta.username,
              safeAddress: meta.safeAddress,
              santPoints: meta.santPoints,
              referralCode: meta.referralCode,
              isValidator: meta.isValidator,
              isSeller: meta.isSeller,
              isNewUser: meta.isNewUser,
              pinSetupCompleted: meta.pinSetupCompleted,
              denomination: meta.denomination,
            };

            setUser((current) => {
              if (!current) return current;

              let changed = false;
              const updated = { ...current };

              Object.entries(safeMeta).forEach(([field, value]) => {
                if (value !== undefined && updated[field] !== value) {
                  updated[field] = value;
                  changed = true;
                }
              });

              if (!changed) return current;

              localStorage.setItem('salva_user', JSON.stringify(updated));

              return updated;
            });
          }

          console.debug(`[Dashboard] wallet cache updated: ${normalizedChain} (${reason})`);

          return true;
        } catch (error) {
          if (error?.name === 'AbortError') {
            return false;
          }

          console.error(
            `[Dashboard] wallet poll failed for ${normalizedChain}:`,
            error?.message || error
          );

          if (
            mountedRef.current &&
            selectedChainRef.current === normalizedChain &&
            walletGenerationRef.current.get(key) === generation
          ) {
            const cached = readWalletCache(user.email, normalizedChain, LOCAL_LOGOS);

            setWallet((current) => ({
              ...current,
              error: error?.message || 'Could not refresh wallet',
              hasSnapshot: Boolean(cached),
              initialLoading: !cached,
            }));
          }

          return false;
        } finally {
          const entry = walletRequestsRef.current.get(key);

          if (entry?.promise === promise) {
            walletRequestsRef.current.delete(key);
          }
        }
      })();

      walletRequestsRef.current.set(key, {
        promise,
        controller,
        generation,
      });

      return promise;
    },
    [readSnapshotIntoUI, user?.email]
  );

  /* --------------------------------------------------------------------------
     WALLET LIFECYCLE
  -------------------------------------------------------------------------- */

  useEffect(() => {
    if (!user?.email || !selectedChain) {
      return undefined;
    }

    const chain = String(selectedChain).toLowerCase();
    selectedChainRef.current = chain;

    readSnapshotIntoUI(chain);

    pollWallet(chain, {
      reason: 'initial',
    });

    const tick = () => {
      if (document.visibilityState !== 'visible') return;

      pollWallet(chain, {
        reason: 'interval',
      });
    };

    pollTimerRef.current = setInterval(tick, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
      }

      pollTimerRef.current = null;
      document.removeEventListener('visibilitychange', tick);

      const key = walletKey(user.email, chain);
      const request = walletRequestsRef.current.get(key);

      request?.controller?.abort();
      walletRequestsRef.current.delete(key);
    };
  }, [pollWallet, readSnapshotIntoUI, selectedChain, user?.email]);

  useEffect(() => {
    if (!user?.email) return undefined;

    const cachedChainsSnapshot = readSupportedChainsCache(user.email);

    setChains(cachedChainsSnapshot?.chains || []);

    let stopped = false;

    const refresh = () => {
      if (stopped || document.visibilityState !== 'visible') return;
      refreshChainMetadata({ silent: true });
    };

    refresh();
    const timer = setInterval(refresh, POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', refresh);

    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [refreshChainMetadata, user?.email]);

  /* --------------------------------------------------------------------------
     CHAIN NAVIGATION
     Chains.jsx owns the selector/deployment presentation. Dashboard only
     changes the active chain and keeps the server/cache refresh cadence.
  -------------------------------------------------------------------------- */

  const selectChain = useCallback(
    (chain) => {
      const name = String(chain?.chainName || chain?.name || '').toLowerCase();
      if (!name) return;

      localStorage.setItem('salva_chain', name);
      selectedChainRef.current = name;
      setSelectedChain(name);
      setChainPage(false);
      readSnapshotIntoUI(name);
    },
    [readSnapshotIntoUI]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setRewardsRefreshKey((key) => key + 1);

    try {
      await pollWallet(selectedChain, {
        force: true,
        reason: 'manual',
      });

      await refreshChainMetadata({ silent: true });
    } finally {
      if (mountedRef.current) {
        setRefreshing(false);
      }
    }
  }, [pollWallet, refreshChainMetadata, selectedChain]);

  /* --------------------------------------------------------------------------
     SEND
  -------------------------------------------------------------------------- */

  const assets = wallet.assets;
  const totalNgn = wallet.totalNgn;

  // NGN denomination -> show totalNgnValue as-is.
  // USD denomination -> show totalNgnValue / ngnRate (ngnRate = NGN per 1 USD),
  // read from the cached assets.
  const cachedNgnRate = assets.find((asset) => Number(asset?.ngnRate) > 0)?.ngnRate;
  const ngnRate = Number(cachedNgnRate) || 0;
  const wantsUsd = String(user?.denomination || 'NGN').toUpperCase() === 'USD';
  const totalDisplay =
    wantsUsd && ngnRate > 0
      ? { symbol: '$', value: Number(totalNgn ?? 0) / ngnRate }
      : { symbol: '₦', value: Number(totalNgn ?? 0) };
  const assetsLoading = wallet.initialLoading && !wallet.hasSnapshot;

  const loadError = wallet.error;
  const displayedAssets = assets.slice(0, 7);

  const showAllAssetsLink = assets.length > 0;

  const openSend = useCallback(
    (asset = null) => {
      if (isAccountLocked) {
        showMsg(lockMessage || 'Account is locked', 'error');
        return;
      }

      if (!asset && assets.length === 0) {
        showMsg('No assets available on this chain', 'error');
        return;
      }

      setSendAsset(asset);
      setIsSendOpen(true);
    },
    [assets.length, isAccountLocked, lockMessage, showMsg]
  );

  const closeSend = useCallback(() => {
    setIsSendOpen(false);
    setSendAsset(null);
    setSendRecipient('');
  }, []);

  
  const handleCopyAddress = useCallback(
    async (message = 'Address copied!') => {
      try {
        await navigator.clipboard.writeText(user.safeAddress);
        showMsg(message);
      } catch {
        showMsg('Could not copy address. Copy it manually.', 'error');
      }
    },
    [user, showMsg]
  );

  useEffect(() => {
    if (pushPromptShownRef.current) return;
    if (!pushMeta.known || pushMeta.seen) return;
    if (!VAPID_PUBLIC_KEY || !pushSupported() || window.Notification.permission === 'denied') {
      return;
    }
    pushPromptShownRef.current = true;
    setPushPromptOpen(true);
  }, [pushMeta]);

  const postPush = (path, body) =>
    requestJson(`${SALVA_API_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  const markPushSeen = async (sub = null) => {
    try {
      await postPush('/api/seen-push-notification', { email: user.email });
    } catch {}

    const c = readWalletCache(user.email, selectedChain, LOCAL_LOGOS);
    if (c) {
      writeWalletCache(
        user.email,
        selectedChain,
        {
          ...c,
          pushSubscription: sub ?? c.pushSubscription ?? null,
          seenPushNotification: true,
        },
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
          'Notifications were not allowed. You can enable them in Account Settings.',
          'error'
        );
        await markPushSeen();
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
      await postPush('/api/save-subscription', { email: user.email, subscription });

      await markPushSeen(subscription);
      setPushPromptOpen(false);
      showMsg('Transaction alerts enabled');
    } catch (error) {
      showMsg(error?.message || 'Could not enable alerts', 'error');
    } finally {
      if (mountedRef.current) setPushBusy(false);
    }
  };

  const activeChainData = useMemo(
    () =>
      chains.find(
        (chain) => String(chain.chainName || chain.name || '').toLowerCase() === selectedChain
      ),
    [chains, selectedChain]
  );

  useOverlayLayer('chainPage', chainPage, () => setChainPage(false));

  useOverlayLayer('detailsAsset', Boolean(detailsAsset), () => setDetailsAsset(null));

  useOverlayLayer('isSendOpen', isSendOpen, closeSend);

  useOverlayLayer('isReceiveOpen', isReceiveOpen, () => setIsReceiveOpen(false));

  useOverlayLayer('isScanOpen', isScanOpen, () => setIsScanOpen(false));

  useEffect(() => {
    if (overlayStack.length === 0) {
      document.body.classList.remove('salva-overlay-open');
    }
  }, []);

  useEffect(() => {
    const onPopState = () => {
      if (suppressPopCount > 0) {
        suppressPopCount -= 1;
        return;
      }

      const top = overlayStack.pop();

      if (overlayStack.length === 0) {
        document.body.classList.remove('salva-overlay-open');
      }

      if (top) {
        poppedViaHistory.add(top.id);
        top.close();
      }
    };

    window.addEventListener('popstate', onPopState);

    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080809]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080809] text-white relative overflow-x-hidden pb-24 sm:pb-28 md:pb-10 pt-5 sm:pt-7 md:pt-24">
      <Stars />

      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute top-[-180px] left-1/2 -translate-x-1/2 w-[520px] h-[420px] rounded-full bg-salvaGold/[0.03] blur-[120px]" />
        <div className="absolute bottom-[-200px] right-[-150px] w-[400px] h-[400px] rounded-full bg-blue-500/[0.02] blur-[120px]" />
      </div>

      <div className="max-w-4xl mx-auto px-3 sm:px-5 md:px-6 relative z-10">
        <header className="flex items-center justify-between mb-4 sm:mb-6 md:mb-10">
          <div>
            <div className="flex items-center gap-1.5 mb-1.5 sm:mb-2">
              <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-salvaGold" />

              <p className="text-[7.7px] sm:text-[9px] uppercase tracking-[.26em] text-white/70 font-black">
                {user.isValidator ? 'Salva Validator' : 'Salva Wallet'}
              </p>
            </div>

            <h1 className="text-[1.265rem] sm:text-2xl md:text-4xl font-black tracking-[-0.04em]">
              {user.username}
            </h1>
          </div>

          {user.isValidator && (
            <button
              onClick={() => navigate('/stats')}
              className="hidden sm:flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border border-salvaGold/15 bg-salvaGold/[0.045] text-[11px] font-black uppercase tracking-widest text-salvaGold"
            >
              <span>Validator</span>

              {govCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[8.8px] flex items-center justify-center">
                  {govCount > 99 ? '99+' : govCount}
                </span>
              )}
            </button>
          )}
        </header>

        <section className="relative overflow-hidden rounded-[22px] sm:rounded-[28px] border border-white/[0.08] bg-gradient-to-br from-white/[0.05] to-white/[0.015] shadow-[0_20px_60px_rgba(0,0,0,.25)] mb-3 sm:mb-4">
          <div className="absolute -top-28 -right-20 w-72 h-72 rounded-full bg-salvaGold/[0.05] blur-[90px] pointer-events-none" />

          <div className="relative p-4 sm:p-5 md:p-8">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-1.5 sm:gap-2 mb-2 sm:mb-3">
                  <span className="text-[8.8px] sm:text-[9px] uppercase tracking-[.28em] text-white/75 font-black">
                    Total Portfolio
                  </span>

                  <span className="w-1 h-1 rounded-full bg-salvaGold/60" />
                </div>

                <div className="flex items-baseline gap-2 min-h-[38px] sm:min-h-[52px]">
                  {!wallet.hasSnapshot && assetsLoading ? (
                    <Spinner />
                  ) : loadError && totalNgn === null ? (
                    <span className="text-[1.21rem] sm:text-[1.4rem] font-black text-red-400/90 leading-tight">
                      Balance unavailable
                    </span>
                  ) : showBalance ? (
                    <span className="text-[1.98rem] sm:text-[2.35rem] md:text-[3.25rem] font-black tracking-[-0.055em] leading-none">
                      {formatFiat(totalDisplay.value, totalDisplay.symbol)}
                    </span>
                  ) : (
                    <span className="text-[1.98rem] sm:text-[2.35rem] md:text-[3.25rem] font-black tracking-[.08em] leading-none">
                      ••••••••
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 mt-2 sm:mt-3">
                  <p
                    className={`text-[8.8px] sm:text-[10px] ${
                      loadError ? 'text-yellow-400/90' : 'text-white/70'
                    }`}
                  >
                    {loadError
                      ? wallet.updatedAt
                        ? `Showing last update from ${new Date(wallet.updatedAt).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )} · retrying…`
                        : 'Reconnecting…'
                      : wallet.updatedAt
                      ? `Updated ${new Date(wallet.updatedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}`
                      : 'Across your networks'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-0.5 sm:gap-1">
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.05] disabled:opacity-60 transition-all"
                  aria-label="Refresh portfolio"
                >
                  <span className={refreshing ? 'inline-block animate-spin' : ''}>↻</span>
                </button>

                <button
                  onClick={() => {
                    const value = !showBalance;

                    setShowBalance(value);

                    localStorage.setItem('salva_show_balance', String(value));
                  }}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl flex items-center justify-center text-white/70 hover:text-white hover:bg-white/[0.05] transition-all"
                  aria-label="Toggle balance"
                >
                  {showBalance ? '◉' : '○'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5 sm:mt-7">
              <button
                onClick={() => openSend(null)}
                className="h-10 sm:h-12 rounded-xl sm:rounded-2xl bg-salvaGold text-black font-black text-[11px] sm:text-xs uppercase tracking-[.13em] hover:brightness-105 active:scale-[.98] transition-all"
              >
                ↑ Send
              </button>

              <button
                onClick={() => {
                  setReceiveAsset(null);
                  setIsReceiveOpen(true);
                }}
                className="h-10 sm:h-12 rounded-xl sm:rounded-2xl border border-white/[0.09] bg-white/[0.025] text-white font-black text-[11px] sm:text-xs uppercase tracking-[.13em] hover:bg-white/[0.055] transition-all"
              >
                ↓ Receive
              </button>
            </div>
          </div>
        </section>

        <RewardsBar user={user} showMsg={showMsg} refreshKey={rewardsRefreshKey} />

        <section className="rounded-[18px] sm:rounded-[24px] border border-white/[0.07] bg-white/[0.025] overflow-hidden mb-4 sm:mb-5">
          <div className="grid grid-cols-2 divide-x divide-white/[0.055]">
            <div className="flex items-center justify-between gap-1.5 px-2.5 py-2 sm:gap-2 sm:px-4 sm:py-3.5 min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-white/[0.05] border border-white/[0.07] flex items-center justify-center overflow-hidden flex-shrink-0">
                  {activeChainData?.logo ? (
                    <img
                      src={activeChainData.logo}
                      alt={activeChainData.chainName || activeChainData.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="font-black text-[11px] sm:text-sm text-salvaGold">
                      {selectedChain[0]?.toUpperCase()}
                    </span>
                  )}
                </div>

                <div className="min-w-0">
                  <p className="text-[5.5px] sm:text-[8px] uppercase tracking-[.3em] text-white/65 font-black">
                    Network
                  </p>

                  <p className="font-black text-[9.9px] sm:text-sm capitalize truncate">
                    {activeChainData?.chainName || selectedChain}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setChainPage(true)}
                disabled={chainMetadataRefreshing}
                className="shrink-0 px-1.5 py-1 sm:px-3 sm:py-2 rounded-lg sm:rounded-xl border border-white/10 text-[5.5px] sm:text-[9px] uppercase tracking-widest font-black text-white/75 hover:text-white disabled:opacity-50"
              >
                {chainMetadataRefreshing ? '…' : 'Switch'}
              </button>
            </div>

            <div className="flex flex-col justify-center px-2.5 py-2 sm:px-4 sm:py-3.5 min-w-0">
              <p className="text-[6.6px] sm:text-[8px] uppercase tracking-[.3em] text-white/65 font-black">
                Wallet
              </p>

              <button
                onClick={() => handleCopyAddress('Wallet address copied!')}
                className="mt-1 font-mono text-[7.7px] sm:text-[10px] text-white/80 hover:text-salvaGold text-left"
              >
                <span className="block truncate max-w-full sm:hidden">
                  {truncateAddress(user.safeAddress)}
                </span>

                <span className="hidden sm:block break-all">{user.safeAddress}</span>
              </button>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between mb-2.5 sm:mb-3 px-0.5">
            <div>
              <p className="text-[8.8px] sm:text-[9px] uppercase tracking-[.3em] text-white/65 font-black">
                Portfolio
              </p>

              <h2 className="text-[1.2375rem] sm:text-xl font-black mt-0.5 sm:mt-1">Assets</h2>
            </div>

            {showAllAssetsLink && (
              <button
                onClick={() => navigate('/dashboard/assets')}
                className="text-[8.8px] sm:text-[9px] uppercase tracking-widest text-salvaGold font-black"
              >
                View all →
              </button>
            )}
          </div>

          <div className="rounded-[20px] sm:rounded-[24px] border border-white/[0.07] bg-white/[0.025] overflow-hidden divide-y divide-white/[0.055]">
            {!wallet.hasSnapshot && assetsLoading ? (
              <div className="py-12 sm:py-16 flex flex-col items-center justify-center gap-3">
                <Spinner />

                <p className="text-[8.8px] uppercase tracking-widest text-white/70 font-black">
                  Loading {selectedChain}
                </p>
              </div>
            ) : assets.length === 0 ? (
              <div className="py-12 sm:py-16 text-center px-6">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <span className="text-white/35 text-[1.1rem] sm:text-lg">◈</span>
                </div>

                <p className="text-[0.825rem] sm:text-sm font-black text-white/85">
                  {loadError ? 'Could not load assets' : 'No assets yet'}
                </p>

                <p className="text-[9.9px] sm:text-[10px] text-white/75 mt-1">
                  {loadError || `Assets on ${selectedChain} will appear here.`}
                </p>

                {loadError && (
                  <button
                    onClick={refresh}
                    className="mt-4 px-4 py-2 rounded-xl bg-salvaGold text-black text-[9.9px] font-black uppercase tracking-widest"
                  >
                    Try again
                  </button>
                )}
              </div>
            ) : (
              <>
                {displayedAssets.map((asset) => (
                  <button
                    key={asset._key}
                    onClick={() => setDetailsAsset(asset)}
                    className="w-full flex items-center gap-2.5 sm:gap-3.5 px-3 sm:px-4 py-3 sm:py-4 text-left hover:bg-white/[0.035] transition-all group"
                  >
                    <AssetLogo asset={asset} size="w-9 h-9 sm:w-11 sm:h-11" showChainBadge />

                    <div className="flex-1 min-w-0">
                      <p className="font-black text-[0.825rem] sm:text-sm text-white">
                        {asset.symbol}
                      </p>

                      <p className="text-[8.8px] sm:text-[10px] text-white/75 capitalize mt-0.5">
                        {asset.chain || selectedChain}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="font-black text-[0.825rem] sm:text-sm text-white">
                        {showBalance
                          ? formatNumber(asset.balance, {
                              maxDecimals: 6,
                            })
                          : '••••'}
                      </p>

                      <AssetValueLine
                        asset={asset}
                        className="text-[8.8px] sm:text-[10px] text-white/70 mt-0.5"
                      />
                    </div>

                    <span className="text-white/30 group-hover:text-salvaGold transition-colors">
                      ›
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        </section>
      </div>

      <AnimatePresence>
        {chainPage && (
          <Chains
            user={user}
            selectedChain={selectedChain}
            onSelect={selectChain}
            onClose={() => setChainPage(false)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {detailsAsset && (
          <AssetDetailsModal
            asset={detailsAsset}
            showBalance={showBalance}
            user={user}
            showMsg={showMsg}
            onSantClaimed={refresh}
            onClose={() => setDetailsAsset(null)}
            onSend={() => {
              setDetailsAsset(null);
              openSend(detailsAsset);
            }}
            onReceive={() => {
              setReceiveAsset(detailsAsset);
              setDetailsAsset(null);
              setIsReceiveOpen(true);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isSendOpen && (
          <SendTransferModal
            user={user}
            assets={assets}
            selectedChain={selectedChain}
            showBalance={showBalance}
            initialAsset={sendAsset}
            onClose={closeSend}
            showMsg={showMsg}
            onSuccess={async () => {
              setRewardsRefreshKey((key) => key + 1);

              await pollWallet(selectedChain, {
                force: true,
                reason: 'transaction',
              });

              await refreshChainMetadata({ silent: true });
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isReceiveOpen && (
          <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-0 sm:px-4">
            <div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              onClick={() => setIsReceiveOpen(false)}
            />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="relative w-full max-w-sm bg-zinc-950 border border-white/10 p-3 sm:p-8 rounded-t-[1.5rem] sm:rounded-3xl"
            >
              <div className="w-7 h-1 bg-white/10 rounded-full mx-auto mb-4 sm:hidden" />

              <div className="text-center mb-4 sm:mb-5">
                <p className="text-[7.7px] sm:text-[8px] uppercase tracking-[.35em] text-salvaGold/70 font-black">
                  Receive Funds
                </p>

                <h3 className="text-[0.9625rem] sm:text-2xl font-black mt-1">{user.username}</h3>

                <p className="text-[8.8px] sm:text-[9px] text-white/75 mt-1">
                  {selectedChain} wallet
                  {receiveAsset ? ` · ${receiveAsset.symbol}` : ''}
                </p>
              </div>

              <div className="flex justify-center mb-4 sm:mb-5">
                <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white border-2 border-salvaGold/30">
                  <QRCodeSVG value={user.safeAddress} size={132} bgColor="#fff" fgColor="#0A0A0B" />
                </div>
              </div>

              <button
                onClick={() => handleCopyAddress('Address copied!')}
                className="w-full p-2.5 sm:p-4 rounded-xl sm:rounded-2xl bg-white/[.03] border border-white/[.06] text-left"
              >
                <p className="text-[7.7px] sm:text-[8px] uppercase tracking-[.25em] text-white/70 font-black">
                  Wallet Address
                </p>

                <p className="font-mono text-[8.8px] sm:text-[10px] text-salvaGold break-all mt-1">
                  {user.safeAddress}
                </p>
              </button>

              <button
                onClick={() => setIsReceiveOpen(false)}
                className="w-full mt-2.5 sm:mt-3 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/10 text-[11px] sm:text-xs font-black uppercase tracking-widest text-white/80"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isScanOpen && (
          <QRScannerModal
            onScan={(address) => {
              setIsScanOpen(false);
              setSendAsset(null);
              setSendRecipient(address);
              setIsSendOpen(true);
            }}
            onClose={() => setIsScanOpen(false)}
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
              markPushSeen();
            }}
          />
        )}

        {notification.show && <Notification notification={notification} onClose={closeMsg} />}
      </AnimatePresence>
    </div>
  );
};

export default Dashboard;
