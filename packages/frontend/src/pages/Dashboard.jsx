// Salva-Digital-Tech/packages/frontend/src/pages/Dashboard.jsx
import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';
import AdminPanel from './AdminPanel';
import SalvaNGNsChat from '../components/SalvaNGNsChat';
import SalvaSellerChat from '../components/SalvaSellerChat';
import DeployPool from './DeployPool';
import SwapTab from './SwapTab';
import { QRCodeSVG } from 'qrcode.react';

// ── Helpers ────────────────────────────────────────────────────────────────
const formatNumber = (value, { minDecimals = 0, maxDecimals = 6 } = {}) => {
  if (value === null || value === undefined || value === '') return '0';
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  if (num === 0) return '0';

  // Convert to fixed at maxDecimals to get all digits, no rounding issues
  const fixed = num.toFixed(maxDecimals);
  const [intPart, decPart = ''] = fixed.split('.');

  // Smart trim: strip trailing zeros, but keep at least minDecimals
  let trimmed = decPart;
  while (trimmed.length > minDecimals && trimmed.endsWith('0')) {
    trimmed = trimmed.slice(0, -1);
  }

  const formattedInt = Number(intPart).toLocaleString('en-US');

  return trimmed.length > 0 ? `${formattedInt}.${trimmed}` : formattedInt;
};
// Safe decimal string addition — no float garbage
const addDecimals = (a, b) => {
  const ai = Number(a || 0);
  const bi = Number(b || 0);

  const sum = ai + bi;

  // preserve precision safely
  return sum.toFixed(6).replace(/\.?0+$/, '');
};

const formatAmountInput = (raw) => {
  const digits = raw.replace(/[^0-9.]/g, '');
  const parts = digits.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? parts[0] + '.' + parts[1] : parts[0];
};

function detectInputType(val) {
  const t = val.trim();
  if (!t) return 'empty';
  if (t.startsWith('0x')) return 'address';
  if (t.includes('@')) return 'fullname';
  return 'name';
}

// ── QR Scanner Modal ───────────────────────────────────────────────────────
const QRScannerModal = ({ onScan, onClose }) => {
  const hasScanned = useRef(false);
  const scannerInstanceRef = useRef(null);
  const isStarted = useRef(false);

  useEffect(() => {
    let scanner;
    let stopped = false;

    const startScanner = async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        scanner = new Html5Qrcode('qr-scanner-container', { verbose: false });
        scannerInstanceRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          {
            fps: 15,
            qrbox: { width: 200, height: 200 },
            aspectRatio: 1.333,
            disableFlip: false,
          },
          (decodedText) => {
            if (hasScanned.current || stopped) return;
            hasScanned.current = true;
            stopped = true;
            const clean = decodedText
              .replace(/^ethereum:/i, '')
              .split('?')[0]
              .trim();
            onScan(clean);
          },
          () => {}
        );

        isStarted.current = true;

        setTimeout(() => {
          const video = document.querySelector('#qr-scanner-container video');
          if (video) {
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.objectFit = 'cover';
            video.style.position = 'absolute';
            video.style.top = '0';
            video.style.left = '0';
          }
          const canvases = document.querySelectorAll('#qr-scanner-container canvas');
          canvases.forEach((c) => {
            if (!c.id.includes('qr')) c.style.display = 'none';
          });
          const shadedRegion = document.querySelector('#qr-shaded-region');
          if (shadedRegion) shadedRegion.style.display = 'none';
        }, 500);
      } catch (err) {
        console.error('Scanner start error:', err);
      }
    };

    startScanner();

    return () => {
      // Only stop if not already stopped by scan callback
      if (!stopped && scannerInstanceRef.current && isStarted.current) {
        stopped = true;
        scannerInstanceRef.current.stop().catch(() => {});
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <motion.div
        onClick={onClose}
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-sm shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      >
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />

        <div className="text-center mb-5">
          <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/50 font-black mb-1">
            Scan to Pay
          </p>
          <h3 className="text-xl font-black text-white">Scan Wallet QR</h3>
          <p className="text-xs text-white/60 mt-1">
            Hold the QR code steady in front of the camera
          </p>
        </div>

        <div
          className="relative rounded-2xl overflow-hidden mb-5 border border-white/10 bg-black"
          style={{ height: '260px' }}
        >
          <div
            id="qr-scanner-container"
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
            }}
          />
          <div className="absolute inset-0 pointer-events-none z-10">
            <div className="absolute top-4 left-4 w-8 h-8 border-t-2 border-l-2 border-salvaGold rounded-tl-lg" />
            <div className="absolute top-4 right-4 w-8 h-8 border-t-2 border-r-2 border-salvaGold rounded-tr-lg" />
            <div className="absolute bottom-4 left-4 w-8 h-8 border-b-2 border-l-2 border-salvaGold rounded-bl-lg" />
            <div className="absolute bottom-4 right-4 w-8 h-8 border-b-2 border-r-2 border-salvaGold rounded-br-lg" />
          </div>
          <motion.div
            className="absolute left-4 right-4 h-0.5 bg-salvaGold/60 z-10 pointer-events-none"
            style={{ boxShadow: '0 0 8px #D4AF37' }}
            animate={{ top: ['20%', '80%', '20%'] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <p className="text-[10px] text-white/60 text-center mb-4 font-bold">
          💡 Keep the QR 15–30cm from camera · good lighting helps
        </p>

        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl border border-white/10 font-bold text-white/60 hover:text-white hover:border-white/20 transition-all text-sm uppercase tracking-widest"
        >
          Cancel
        </button>
      </motion.div>
    </div>
  );
};

// ── Balance Spinner ────────────────────────────────────────────────────────
const BalanceSpinner = () => (
  <span className="inline-flex items-center gap-1.5">
    <span className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin inline-block flex-shrink-0" />
    <span className="text-sm opacity-30 font-bold">—</span>
  </span>
);
// ── Split Balance Display ──────────────────────────────────────────────────
// Shows all 6 decimals; digits beyond the 3rd decimal position are dimmed
const SplitBalance = ({ value, isusd = false, inline = false }) => {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return <span>0</span>;

  const fixed = num.toFixed(6);
  const [intPart, decPart] = fixed.split('.');

  const formattedInt = Number(intPart).toLocaleString('en-US');

  // For USD show 2 solid + 4 dim, for NGN show 3 solid + 3 dim
  const solidCount = isusd ? 2 : 3;
  const solidDec = decPart.slice(0, solidCount);
  const dimDec = decPart.slice(solidCount); // always 3 chars

  if (inline) {
    return (
      <span>
        {formattedInt}.{solidDec}<span style={{ opacity: 0.3 }}>{dimDec}</span>
      </span>
    );
  }

  return (
    <span>
      {formattedInt}.{solidDec}<span style={{ opacity: 0.28, fontSize: '0.88em' }}>{dimDec}</span>
    </span>
  );
};

// ── Searchable Registry Dropdown ───────────────────────────────────────────
const RegistryDropdown = ({
  registries,
  value,
  onChange,
  placeholder = 'Search wallet service…',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  const filtered = registries.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.nspace || '').toLowerCase().includes(query.toLowerCase()) ||
      (r.description || '').toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const handleSelect = (reg) => {
    onChange(reg);
    setOpen(false);
    setQuery('');
  };
  const handleClear = (e) => {
    e.stopPropagation();
    onChange(null);
    setQuery('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={value ? undefined : handleOpen}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border transition-all text-left
          ${
            open
              ? 'border-salvaGold bg-salvaGold/5 ring-1 ring-salvaGold/30'
              : value
                ? 'border-salvaGold/40 bg-salvaGold/5'
                : 'border-white/10 bg-white/5 hover:border-salvaGold/40'
          }`}
      >
        {value ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-salvaGold/20 flex items-center justify-center flex-shrink-0">
              <span className="text-salvaGold text-xs font-black">
                {value.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="font-black text-sm truncate text-white">{value.name}</p>
              <p className="text-[10px] opacity-40 font-mono truncate">{value.nspace}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 opacity-40">
            <svg
              className="w-4 h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle cx="11" cy="11" r="8" strokeWidth="2" />
              <path d="m21 21-4.35-4.35" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-bold">{placeholder}</span>
          </div>
        )}
        <div className="flex items-center gap-2 flex-shrink-0">
          {value && (
            <button
              type="button"
              onClick={handleClear}
              className="w-5 h-5 rounded-full bg-white/10 hover:bg-red-500/20 flex items-center justify-center transition-colors"
            >
              <span className="text-[10px] text-red-400 font-black leading-none">✕</span>
            </button>
          )}
          <button
            type="button"
            onClick={open ? () => setOpen(false) : handleOpen}
            className="w-5 h-5 flex items-center justify-center"
          >
            <svg
              className={`w-3 h-3 opacity-40 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] bottom-full mb-2 w-full bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
          >
            <div className="p-3 border-b border-white/5">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
                <svg
                  className="w-3.5 h-3.5 opacity-40 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <circle cx="11" cy="11" r="8" strokeWidth="2.5" />
                  <path d="m21 21-4.35-4.35" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type to search…"
                  className="flex-1 bg-transparent outline-none text-xs font-bold placeholder:opacity-30 text-white"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="opacity-40 hover:opacity-80"
                  >
                    <span className="text-[10px]">✕</span>
                  </button>
                )}
              </div>
            </div>
            <div className="max-h-56 overflow-y-auto">
              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs opacity-40 font-bold">No wallet services found</p>
                </div>
              ) : (
                filtered.map((reg) => (
                  <button
                    key={reg.registryAddress}
                    type="button"
                    onClick={() => handleSelect(reg)}
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-salvaGold/5 transition-colors text-left ${value?.registryAddress === reg.registryAddress ? 'bg-salvaGold/10' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-salvaGold/15 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-salvaGold text-sm font-black">
                        {reg.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-black text-sm text-white">{reg.name}</p>
                      <p className="text-[10px] font-mono opacity-40">{reg.nspace}</p>
                      {reg.description && (
                        <p className="text-[10px] opacity-30 truncate">{reg.description}</p>
                      )}
                    </div>
                    {value?.registryAddress === reg.registryAddress && (
                      <span className="text-salvaGold text-sm">✓</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ── Notification ───────────────────────────────────────────────────────────
const SalvaNotification = ({ notification, onClose }) => {
  const cfgMap = {
    success: { icon: '✓', bar: '#D4AF37', btnBg: '#D4AF37', btnText: '#000' },
    error: { icon: '✕', bar: '#EF4444', btnBg: '#EF4444', btnText: '#fff' },
    info: {
      icon: '↻',
      bar: '#3B82F6',
      btnBg: 'rgba(255,255,255,0.15)',
      btnText: '#fff',
    },
    warning: { icon: '⚠', bar: '#F59E0B', btnBg: '#F59E0B', btnText: '#000' },
  };
  const cfg = cfgMap[notification.type] || cfgMap.info;
  if (!notification.show) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4">
      <motion.div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />
      <motion.div
        className="relative w-full max-w-xs bg-zinc-900 rounded-3xl overflow-hidden shadow-2xl"
        initial={{ opacity: 0, scale: 0.85, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.85, y: 20 }}
        transition={{ type: 'spring', stiffness: 400, damping: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ height: 4, background: cfg.bar }} />
        <div className="p-7 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: cfg.bar }}
          >
            <span className="text-xl font-black" style={{ color: cfg.btnText }}>
              {cfg.icon}
            </span>
          </div>
          <p className="font-black text-sm leading-relaxed mb-6 text-white">
            {notification.message}
          </p>
          <button
            onClick={onClose}
            className="w-full py-3 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95"
            style={{ background: cfg.btnBg, color: cfg.btnText }}
          >
            OK
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// ── Dual Balance Card ─────────────────────────────────────────────────────────
const BalanceCard = ({
  ngnsBalance,
  cNgnBalance,
  usdtBalance,
  usdcBalance,
  showBalance,
  balanceLoading,
  onToggleVisibility,
  onSend,
  onReceive,
}) => {
  const totalNgn = addDecimals(ngnsBalance, cNgnBalance);
  const totalUsd = addDecimals(usdtBalance, usdcBalance);
  const MASK = '••••••';

  return (
    <div className="rounded-3xl overflow-hidden border border-white/[0.07] bg-white/[0.03] shadow-2xl mb-5">
      <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/40 to-transparent" />

      {/* NGN — TOP */}
      <div className="px-5 sm:px-7 pt-5 sm:pt-7 pb-4 border-b border-white/[0.06]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 2.5 }}
              className="w-1.5 h-1.5 rounded-full bg-salvaGold block"
            />
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">NGN</p>
          </div>
          <button
            onClick={onToggleVisibility}
            className="text-white/60 hover:text-white/70 transition-colors text-sm leading-none"
          >
            {showBalance ? '👁' : '👁‍🗨'}
          </button>
        </div>

        <div className="min-h-[44px] flex items-baseline gap-1.5 flex-wrap overflow-hidden">
          {balanceLoading ? (
            <BalanceSpinner />
          ) : (
            <span
              className="font-black text-white tracking-tight break-all leading-none"
              style={{
                fontSize: 'clamp(0.95rem, 4.5vw, 1.875rem)',
              }}
            >
              {showBalance ? <SplitBalance value={totalNgn} /> : MASK}
            </span>
          )}
        </div>

        {!balanceLoading && (
          <div className="text-[10px] text-white/60 font-mono mt-2 truncate">
            {showBalance
              ? <><SplitBalance value={ngnsBalance} inline /> <span className="opacity-60">NGNs</span> · <SplitBalance value={cNgnBalance} inline /> <span className="opacity-60">cNGN</span></>
              : '•••• NGNs · •••• cNGN'}
          </div>
        )}
      </div>

      {/* USD — BOTTOM */}
      <div className="px-5 sm:px-7 pt-4 pb-5 sm:pb-6">
        <div className="flex items-center gap-1.5 mb-3">
          <motion.span
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ repeat: Infinity, duration: 2.5, delay: 0.8 }}
            className="w-1.5 h-1.5 rounded-full bg-green-400 block"
          />
          <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">USD</p>
        </div>

        <div className="min-h-[36px] flex items-baseline gap-1.5 flex-wrap overflow-hidden">
          {balanceLoading ? (
            <BalanceSpinner />
          ) : (
            <span
              className="font-black text-white tracking-tight break-all leading-none"
              style={{
                fontSize: 'clamp(0.85rem, 4vw, 1.5rem)',
              }}
            >
              {showBalance ? <SplitBalance value={totalUsd} isusd /> : MASK}
            </span>
          )}
        </div>

        {!balanceLoading && (
          <div className="text-[10px] text-white/60 font-mono mt-2 truncate">
            {showBalance
              ? <><SplitBalance value={usdtBalance} inline /> <span className="opacity-60">USDT</span> · <SplitBalance value={usdcBalance} inline /> <span className="opacity-60">USDC</span></>
              : '•••• USDT · •••• USDC'}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-3 px-5 sm:px-7 pb-5 sm:pb-7">
        <button
          onClick={onSend}
          className="bg-salvaGold hover:brightness-110 active:scale-[0.98] transition-all text-black font-black py-3.5 rounded-2xl text-sm uppercase tracking-widest shadow-lg shadow-salvaGold/20 flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">↑</span> Send
        </button>
        <button
          onClick={onReceive}
          className="border border-white/10 hover:border-salvaGold/40 hover:bg-white/5 active:scale-[0.98] transition-all font-bold py-3.5 rounded-2xl text-sm uppercase tracking-widest flex items-center justify-center gap-2"
        >
          <span className="text-base leading-none">↓</span> Receive
        </button>
      </div>
    </div>
  );
};

// ── Link a Name Tab ────────────────────────────────────────────────────────
const LinkNameTab = ({ user, registries, showMsg, onSwitchToBuy }) => {
  const [linkedNames, setLinkedNames] = useState([]);
  const [loadingNames, setLoadingNames] = useState(true);
  const [nameInput, setNameInput] = useState('');
  const [walletInput, setWalletInput] = useState(() => {
    const pre = window.__salva_pool_prefill || '';
    window.__salva_pool_prefill = null;
    return pre;
  });
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [nameCheckResult, setNameCheckResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [nameError, setNameError] = useState('');
  const [linkStep, setLinkStep] = useState('form');
  const [reservedEmail, setReservedEmail] = useState('');
  const [reservedSubmitting, setReservedSubmitting] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [showUnlinkConfirm, setShowUnlinkConfirm] = useState(false);
  const [unlinkPinInput, setUnlinkPinInput] = useState('');
  const [unlinkPinStep, setUnlinkPinStep] = useState(false);
  const [unlinkLoading, setUnlinkLoading] = useState(false);
  const [registryFee, setRegistryFee] = useState(null);
  const [feeLoading, setFeeLoading] = useState(false);

  const fetchLinkedNames = useCallback(async () => {
    if (!user?.safeAddress) return;
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/list/${user.safeAddress}`);
      const data = await res.json();
      setLinkedNames(data.aliases || []);
    } catch {
      setLinkedNames([]);
    } finally {
      setLoadingNames(false);
    }
  }, [user?.safeAddress]);

  useEffect(() => {
    fetchLinkedNames();
  }, [fetchLinkedNames]);

  const validateNameLocally = (val) => {
    if (!val) return 'Name is required';
    if (val.includes('0') || val.includes('1')) return 'Digits 0 and 1 are not allowed';
    if (!/^[a-z2-9.]+$/.test(val)) return 'Only lowercase a–z, digits 2–9, one dot';
    if ((val.match(/\./g) || []).length > 1) return 'Only one dot allowed';
    if (val.startsWith('.') || val.endsWith('.')) return 'Cannot start or end with a dot';
    if (val.length > 32) return 'Max 32 characters';
    if (val.length < 2) return 'At least 2 characters required';
    return '';
  };

  const handleCheckName = async () => {
    const err = validateNameLocally(nameInput);
    if (err) {
      setNameError(err);
      return;
    }
    if (!walletInput || !walletInput.startsWith('0x') || walletInput.length !== 42) {
      setNameError('Enter a valid 0x wallet address to link to');
      return;
    }
    if (!selectedRegistry) {
      setNameError('Select which wallet service this name belongs to');
      return;
    }
    setNameError('');
    setChecking(true);
    setNameCheckResult(null);
    setRegistryFee(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput,
          registryAddress: selectedRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setNameError(data.message || 'Check failed');
        return;
      }
      setNameCheckResult(data);
      if (data.reserved) {
        setLinkStep('reserved');
        return;
      }
      if (!data.available) {
        setNameError('This name is already taken. Try another.');
        return;
      }
      setFeeLoading(true);
      try {
        const feeRes = await fetch(`${SALVA_API_URL}/api/registry-fee`);
        const feeData = await feeRes.json();
        setRegistryFee(feeRes.ok ? (feeData.fee ?? 0) : 0);
      } catch {
        setRegistryFee(0);
      } finally {
        setFeeLoading(false);
      }
      setLinkStep('confirm');
    } catch {
      setNameError('Network error. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleSendReservedNotification = async () => {
    if (!reservedEmail) return;
    setReservedSubmitting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/notify-reserved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nameInput,
          requesterEmail: reservedEmail,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Your request has been sent to our team!');
        resetLinkForm();
      } else showMsg(data.message || 'Failed to send', 'error');
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setReservedSubmitting(false);
    }
  };

  const handleExecuteLink = async () => {
    if (pinInput.length !== 4) return;
    setPinLoading(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: pinInput }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        showMsg(pinData.message || 'Invalid PIN', 'error');
        setPinLoading(false);
        return;
      }
      setLinkStep('linking');
      const prepRes = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          name: nameInput,
          walletToLink: walletInput,
          registryAddress: selectedRegistry.registryAddress,
        }),
      });
      const prepData = await prepRes.json();
      if (prepData.reserved) {
        setLinkStep('reserved');
        return;
      }
      if (prepData.lowBalance) {
        showMsg(prepData.message || 'Insufficient NGNs', 'error');
        setTimeout(() => onSwitchToBuy?.(), 1500);
        setLinkStep('form');
        return;
      }
      if (!prepRes.ok) {
        showMsg(prepData.message || 'Preparation failed', 'error');
        setLinkStep('confirm');
        return;
      }
      const execRes = await fetch(`${SALVA_API_URL}/api/alias/execute-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          pureName: prepData.pureName,
          weldedName: prepData.weldedName,
          walletToLink: prepData.walletToLink,
          registryAddress: prepData.registryAddress,
          signature: prepData.signature,
          feeWei: prepData.feeWei,
          userPrivateKey: pinData.privateKey,
        }),
      });
      const execData = await execRes.json();
      if (!execRes.ok) {
        showMsg(execData.message || 'Linking failed', 'error');
        setLinkStep('confirm');
        return;
      }
      if (walletInput && execData.alias?.name) {
        fetch(`${SALVA_API_URL}/api/pool/set-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            poolAddress: walletInput,
            ownerSafeAddress: user.safeAddress,
            poolName: execData.alias.name,
          }),
        }).catch(() => {});
      }
      setLinkStep('success');
      await fetchLinkedNames();
      try {
        const saved = JSON.parse(localStorage.getItem('salva_user') || '{}');
        saved.nameAlias = execData.alias?.name || saved.nameAlias;
        localStorage.setItem('salva_user', JSON.stringify(saved));
      } catch {
        /* ignore */
      }
    } catch (err) {
      showMsg(err.message || 'Failed to link name', 'error');
      setLinkStep('confirm');
    } finally {
      setPinLoading(false);
    }
  };

  const handleExecuteUnlink = async () => {
    if (unlinkPinInput.length !== 4 || !unlinkTarget) return;
    setUnlinkLoading(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: unlinkPinInput }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        showMsg(pinData.message || 'Invalid PIN', 'error');
        setUnlinkLoading(false);
        return;
      }
      const res = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: user.safeAddress,
          weldedName: unlinkTarget.name,
          registryAddress: unlinkTarget.registryAddress,
          userPrivateKey: pinData.privateKey,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg(`"${unlinkTarget.name}" unlinked successfully!`);
        setUnlinkPinStep(false);
        setUnlinkTarget(null);
        await fetchLinkedNames();
      } else showMsg(data.message || 'Unlink failed', 'error');
    } catch {
      showMsg('Network error during unlink', 'error');
    } finally {
      setUnlinkLoading(false);
    }
  };

  const resetLinkForm = () => {
    setLinkStep('form');
    setNameInput('');
    setWalletInput('');
    setNameError('');
    setNameCheckResult(null);
    setPinInput('');
    setSelectedRegistry(null);
    setRegistryFee(null);
    setReservedEmail('');
  };

  const feeActive = registryFee !== null && registryFee > 0;
  const darkInput =
    'w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-sm text-white placeholder:text-white/60 transition-all';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* ── Linked Names ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60">
            Your Linked Names
          </p>
          <button
            onClick={fetchLinkedNames}
            className="text-[10px] uppercase font-black text-salvaGold/60 hover:text-salvaGold transition-colors"
          >
            Refresh
          </button>
        </div>

        {loadingNames ? (
          <div className="flex justify-center py-10">
            <div className="w-7 h-7 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : linkedNames.length === 0 ? (
          <div className="relative overflow-hidden p-6 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02] text-center">
            <div className="w-10 h-10 rounded-2xl bg-salvaGold/10 border border-salvaGold/20 flex items-center justify-center mx-auto mb-3">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.75}
                className="w-5 h-5 text-salvaGold/60"
              >
                <path d="M12 2H6a2 2 0 0 0-2 2v6.17a2 2 0 0 0 .59 1.42l7.83 7.83a2 2 0 0 0 2.83 0l5.17-5.17a2 2 0 0 0 0-2.83L12.41 2.59A2 2 0 0 0 12 2z" />
                <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
              </svg>
            </div>
            <p className="text-sm font-black text-white/60">No names linked yet</p>
            <p className="text-[10px] text-white/60 mt-1">Register a name below to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {linkedNames.map((alias, i) => (
              <motion.div
                key={alias.name + i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/25 hover:bg-salvaGold/[0.03] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-salvaGold/15 border border-salvaGold/25 flex items-center justify-center flex-shrink-0">
                    <span className="text-salvaGold text-xs font-black">
                      {alias.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p
                      className="font-black text-salvaGold text-sm truncate cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        navigator.clipboard.writeText(alias.name);
                        showMsg('Name copied!');
                      }}
                      title="Click to copy"
                    >
                      {alias.name}
                    </p>
                    <p
                      className="font-mono text-[10px] text-white/60 truncate mt-0.5 cursor-pointer hover:text-white/50 transition-colors"
                      onClick={() => {
                        navigator.clipboard.writeText(alias.wallet);
                        showMsg('Wallet address copied!');
                      }}
                      title="Click to copy wallet"
                    >
                      {alias.wallet.slice(0, 10)}…{alias.wallet.slice(-8)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setUnlinkTarget(alias);
                    setShowUnlinkConfirm(true);
                    setUnlinkPinInput('');
                    setUnlinkPinStep(false);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-[10px] uppercase hover:bg-red-500 hover:text-white hover:border-red-500 transition-all"
                >
                  Unlink
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* ── Divider ── */}
      <div className="relative flex items-center">
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
        <span className="mx-3 text-[9px] uppercase tracking-[0.3em] font-black text-white/60">
          Register New
        </span>
        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />
      </div>

      {/* ── FORM ── */}
      {linkStep === 'form' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Name input */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-black block mb-2">
              Name
            </label>
            <div className="relative">
              <input
                type="text"
                placeholder="yourname"
                value={nameInput}
                onChange={(e) => {
                  let cleaned = e.target.value.toLowerCase().replace(/[^a-z2-9.]/g, '');
                  // Allow only one dot
                  const firstDot = cleaned.indexOf('.');
                  if (firstDot !== -1) {
                    cleaned =
                      cleaned.slice(0, firstDot + 1) +
                      cleaned.slice(firstDot + 1).replace(/\./g, '');
                  }
                  setNameInput(cleaned);
                  setNameError('');
                }}
                maxLength={32}
                className={darkInput}
              />
              {nameInput && selectedRegistry && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-1 pointer-events-none">
                  <span className="text-salvaGold/50 text-[10px] font-black">
                    {selectedRegistry.nspace}
                  </span>
                </div>
              )}
            </div>
            {nameInput && (
              <div className="mt-2 px-3 py-2 rounded-xl bg-salvaGold/5 border border-salvaGold/15 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-salvaGold block flex-shrink-0" />
                <p className="text-[10px] text-salvaGold font-black">
                  {nameInput}
                  {selectedRegistry ? selectedRegistry.nspace : '@salva'}
                </p>
              </div>
            )}
          </div>

          {/* Wallet input */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-black block mb-2">
              Wallet Address
            </label>
            <input
              type="text"
              placeholder="0x…"
              value={walletInput}
              onChange={(e) => {
                setWalletInput(e.target.value.trim());
                setNameError('');
              }}
              className={`${darkInput} font-mono text-xs`}
            />
          </div>

          {/* Registry dropdown */}
          <div>
            <label className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-black block mb-2">
              Wallet Service
            </label>
            <RegistryDropdown
              registries={registries}
              value={selectedRegistry}
              onChange={(reg) => {
                setSelectedRegistry(reg);
                setNameError('');
              }}
              placeholder="Select wallet service…"
            />
          </div>

          {nameError && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
              <span className="text-red-400 text-xs flex-shrink-0">⚠</span>
              <p className="text-xs text-red-400 font-bold">{nameError}</p>
            </div>
          )}

          <button
            onClick={handleCheckName}
            disabled={checking || !nameInput || !walletInput || !selectedRegistry}
            className="w-full py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-lg shadow-salvaGold/20"
          >
            {checking && (
              <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
            )}
            {checking ? 'Checking…' : 'Check Availability'}
          </button>
        </motion.div>
      )}

      {/* ── RESERVED ── */}
      {linkStep === 'reserved' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/5 space-y-5"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/15 border border-yellow-500/25 flex items-center justify-center flex-shrink-0">
              <span className="text-lg">⭐</span>
            </div>
            <div>
              <p className="font-black text-white text-sm">Reserved Name</p>
              <p className="text-[11px] text-white/60 mt-0.5 leading-relaxed">
                <span className="text-salvaGold font-black">{nameInput}</span> is reserved. Share
                your email and we'll reach out about eligibility.
              </p>
            </div>
          </div>
          <input
            type="email"
            placeholder="your@email.com"
            value={reservedEmail}
            onChange={(e) => setReservedEmail(e.target.value)}
            className={darkInput}
          />
          <div className="flex gap-3">
            <button
              onClick={resetLinkForm}
              className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              Back
            </button>
            <button
              onClick={handleSendReservedNotification}
              disabled={reservedSubmitting || !reservedEmail}
              className="flex-1 py-3 rounded-xl bg-yellow-500 text-black font-black text-sm hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {reservedSubmitting ? 'Sending…' : 'Send Request'}
            </button>
          </div>
        </motion.div>
      )}

      {/* ── CONFIRM ── */}
      {linkStep === 'confirm' && nameCheckResult && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Name badge */}
          <div className="p-5 rounded-2xl bg-salvaGold/6 border border-salvaGold/20 text-center">
            <p className="text-[9px] uppercase tracking-[0.3em] font-black text-salvaGold/50 mb-2">
              Name Available
            </p>
            <p className="text-2xl font-black text-salvaGold">{nameCheckResult.welded}</p>
          </div>

          {/* Fee */}
          {feeLoading ? (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin flex-shrink-0" />
              <p className="text-xs text-white/60 font-bold">Fetching fee…</p>
            </div>
          ) : feeActive ? (
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 block" />
                <p className="text-[10px] uppercase font-black text-white/60 tracking-widest">
                  Registration Fee
                </p>
              </div>
              <p className="font-black text-white text-sm">
                {registryFee?.toLocaleString()} <span className="text-salvaGold text-xs">NGNs</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/15">
              <span className="text-green-400 text-sm flex-shrink-0">✦</span>
              <p className="text-xs font-black text-green-400">
                Free Registration — no fee required
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={resetLinkForm}
              className="flex-1 py-3.5 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white hover:bg-white/5 transition-all"
            >
              Back
            </button>
            <button
              onClick={() => {
                setLinkStep('pin');
                setPinInput('');
              }}
              disabled={feeLoading}
              className="flex-2 flex-1 py-3.5 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all shadow-lg shadow-salvaGold/20"
            >
              Continue →
            </button>
          </div>
        </motion.div>
      )}

      {/* ── PIN ── */}
      {linkStep === 'pin' && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] space-y-5 text-center"
        >
          <div className="w-12 h-12 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto">
            <span className="text-xl">🔐</span>
          </div>
          <div>
            <p className="font-black text-white text-lg">Transaction PIN</p>
            <p className="text-[11px] text-white/60 mt-1">Authorise the on-chain name link</p>
          </div>
          <input
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength="4"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            autoFocus
            className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black text-white"
          />
          <div className="flex gap-3">
            <button
              onClick={() => setLinkStep('confirm')}
              disabled={pinLoading}
              className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white transition-all"
            >
              Back
            </button>
            <button
              onClick={handleExecuteLink}
              disabled={pinLoading || pinInput.length !== 4}
              className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            >
              {pinLoading && (
                <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              {pinLoading ? 'Signing…' : 'Confirm'}
            </button>
          </div>
        </motion.div>
      )}

      {/* ── LINKING ── */}
      {linkStep === 'linking' && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-4"
        >
          <div className="relative w-14 h-14 mx-auto">
            <div className="absolute inset-0 rounded-full border-2 border-salvaGold/20" />
            <div className="absolute inset-0 rounded-full border-2 border-t-salvaGold animate-spin" />
            <div className="absolute inset-2 rounded-full bg-salvaGold/10 flex items-center justify-center">
              <span className="text-salvaGold text-sm font-black">₦</span>
            </div>
          </div>
          <p className="font-black text-white">Linking on-chain…</p>
          <p className="text-xs text-white/60">Broadcasting to Base · 30–60 seconds</p>
        </motion.div>
      )}

      {/* ── SUCCESS ── */}
      {linkStep === 'success' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="py-12 px-6 rounded-2xl border border-salvaGold/20 bg-salvaGold/[0.04] text-center space-y-5"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 280, delay: 0.1 }}
            className="w-16 h-16 bg-salvaGold/15 border border-salvaGold/30 rounded-2xl flex items-center justify-center mx-auto"
          >
            <span className="text-3xl">✓</span>
          </motion.div>
          <div>
            <p className="text-xl font-black text-white">Name Linked</p>
            <p className="text-[11px] text-white/60 mt-1">Your name is now live on Base</p>
          </div>
          <button
            onClick={resetLinkForm}
            className="w-full py-4 bg-salvaGold text-black font-black rounded-2xl hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-salvaGold/20 uppercase tracking-widest text-sm"
          >
            Link Another Name
          </button>
        </motion.div>
      )}

      {/* ── UNLINK CONFIRM MODAL ── */}
      <AnimatePresence>
        {showUnlinkConfirm && unlinkTarget && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              onClick={() => setShowUnlinkConfirm(false)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center space-y-3">
                <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
                  <span className="text-xl">⚠️</span>
                </div>
                <p className="font-black text-white text-lg">Unlink Name?</p>
                <p className="text-salvaGold font-black">{unlinkTarget.name}</p>
                <p className="text-sm text-white/60">
                  This removes the on-chain link and cannot be undone.
                </p>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowUnlinkConfirm(false)}
                    className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      setShowUnlinkConfirm(false);
                      setUnlinkPinStep(true);
                      setUnlinkPinInput('');
                    }}
                    className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-sm hover:brightness-110 transition-all"
                  >
                    Unlink
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── UNLINK PIN MODAL ── */}
      <AnimatePresence>
        {unlinkPinStep && unlinkTarget && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              onClick={() => {
                setUnlinkPinStep(false);
                setUnlinkPinInput('');
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-sm shadow-2xl text-center space-y-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-xl">🔐</span>
              </div>
              <div>
                <p className="font-black text-white text-lg">Enter PIN</p>
                <p className="text-[11px] text-white/60 mt-1">
                  Confirm unlinking{' '}
                  <span className="text-red-400 font-black">{unlinkTarget.name}</span>
                </p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                maxLength="4"
                value={unlinkPinInput}
                onChange={(e) => setUnlinkPinInput(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-red-400 outline-none text-center text-3xl tracking-[1em] font-black text-white"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setUnlinkPinStep(false);
                    setUnlinkPinInput('');
                  }}
                  disabled={unlinkLoading}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleExecuteUnlink}
                  disabled={unlinkLoading || unlinkPinInput.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-red-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {unlinkLoading && (
                    <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  {unlinkLoading ? 'Unlinking…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// ── Seller Mint Requests Panel ─────────────────────────────────────────────
const SellerMintPanel = ({ user, showMsg }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [actioning, setActioning] = useState(false);

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/all-requests?safeAddress=${user.safeAddress}`
      );
      const data = await res.json();
      setRequests(data.requests || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  useEffect(() => {
    if (!selected) return;
    const iv = setInterval(async () => {
      const res = await fetch(
        `${SALVA_API_URL}/api/buy-ngns/all-requests?safeAddress=${user.safeAddress}`
      );
      const data = await res.json();
      const updated = (data.requests || []).find((r) => r._id === selected._id);
      if (updated) setSelected(updated);
      setRequests(data.requests || []);
    }, 5000);
    return () => clearInterval(iv);
  }, [selected?._id]);

  const sendSellerMessage = async () => {
    if (!replyText.trim() || !selected) return;
    setSending(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/send-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
          text: replyText.trim(),
          sender: 'seller',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSelected((prev) => ({
          ...prev,
          messages: [...(prev.messages || []), data.message],
        }));
        setReplyText('');
      } else showMsg(data.message || 'Failed', 'error');
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setSending(false);
    }
  };

  const handleMinted = async () => {
    if (!selected) return;
    setActioning(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/mark-minted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Marked as minted!');
        fetchRequests();
        setSelected(null);
      } else showMsg(data.message || 'Failed', 'error');
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setActioning(false);
    }
  };

  const handleReject = async () => {
    if (!selected) return;
    setActioning(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/buy-ngns/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selected._id,
          safeAddress: user.safeAddress,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showMsg('Request rejected');
        fetchRequests();
        setSelected(null);
      } else showMsg(data.message || 'Failed', 'error');
    } catch {
      showMsg('Network error', 'error');
    } finally {
      setActioning(false);
    }
  };

  const statusColor = (s) =>
    ({
      pending: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
      paid: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
      minted: 'text-green-400 bg-green-500/10 border-green-500/20',
      rejected: 'text-red-400 bg-red-500/10 border-red-500/20',
    })[s] || 'text-white/60';

  if (selected)
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
        <button
          onClick={() => setSelected(null)}
          className="text-xs text-white/60 hover:text-white font-bold transition-colors"
        >
          ← All Requests
        </button>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-black text-lg text-white">{selected.username}</p>
            <p className="text-xs text-white/60 font-mono">{selected.userEmail}</p>
          </div>
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${statusColor(selected.status)}`}
          >
            {selected.status}
          </span>
        </div>
        <div className="p-4 rounded-2xl bg-salvaGold/5 border border-salvaGold/20 flex justify-between">
          <div>
            <p className="text-[10px] text-white/60">Requested</p>
            <p className="font-black text-white">
              {(selected.amountNgn || 0).toLocaleString()} NGN
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/60">Fee</p>
            <p className="font-black text-red-400">{selected.feeNgn} NGNs</p>
          </div>
          <div>
            <p className="text-[10px] text-white/60">To Mint</p>
            <p className="font-black text-salvaGold">
              {(selected.mintAmountNgn || 0).toLocaleString()} NGNs
            </p>
          </div>
        </div>
        {selected.receiptImageBase64 && (
          <div className="p-3 rounded-2xl border border-white/10">
            <p className="text-[10px] uppercase font-black text-white/60 mb-2">Payment Receipt</p>
            <img
              src={selected.receiptImageBase64}
              alt="Receipt"
              className="max-h-48 rounded-xl object-contain"
            />
          </div>
        )}
        <div className="rounded-2xl border border-white/10 overflow-hidden">
          <div className="h-64 overflow-y-auto p-3 space-y-2 bg-white/[0.02]">
            {(selected.messages || []).map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.sender === 'seller' ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-2.5 text-xs ${msg.sender === 'seller' ? 'bg-white/5 border border-white/10 text-white' : 'bg-salvaGold text-black'}`}
                >
                  {msg.text}
                  {msg.imageUrl && (
                    <img src={msg.imageUrl} alt="" className="mt-1 max-h-24 rounded-lg" />
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 p-2 flex gap-2">
            <input
              type="text"
              placeholder="Reply to user…"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendSellerMessage()}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none text-white placeholder:text-white/60"
            />
            <button
              onClick={sendSellerMessage}
              disabled={sending || !replyText.trim()}
              className="px-3 py-2 bg-salvaGold text-black font-black rounded-xl text-xs disabled:opacity-50"
            >
              Send
            </button>
          </div>
        </div>
        {selected.status === 'paid' && (
          <div className="flex gap-3">
            <button
              onClick={handleReject}
              disabled={actioning}
              className="flex-1 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 font-black text-sm hover:bg-red-500 hover:text-white transition-all disabled:opacity-50"
            >
              Reject
            </button>
            <button
              onClick={handleMinted}
              disabled={actioning}
              className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-black text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actioning && (
                <span className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />
              )}
              ✅ Mark as Minted
            </button>
          </div>
        )}
      </motion.div>
    );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60">
          Mint Requests
        </p>
        <button
          onClick={fetchRequests}
          disabled={loading}
          className="text-[10px] uppercase font-black text-salvaGold hover:opacity-70 flex items-center gap-1"
        >
          {loading && (
            <span className="w-3 h-3 border border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
          )}
          Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <div className="w-8 h-8 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
        </div>
      ) : requests.length === 0 ? (
        <div className="p-8 rounded-2xl border border-dashed border-white/10 text-center">
          <p className="text-sm text-white/60 font-bold">No requests yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((r) => (
            <button
              key={r._id}
              onClick={() => setSelected(r)}
              className="w-full p-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] hover:border-salvaGold/30 transition-all text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-black text-sm truncate text-white">{r.username}</p>
                  <p className="text-xs text-white/60 font-mono truncate">{r.userEmail}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="font-black text-salvaGold text-sm">
                    {(r.mintAmountNgn || 0).toLocaleString()} NGNs
                  </p>
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase border mt-1 ${statusColor(r.status)}`}
                  >
                    {r.status}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
};

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD — Main Component
// ══════════════════════════════════════════════════════════════════════════════
const Dashboard = () => {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('salva_user');
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      if (!parsed || !parsed.safeAddress) return null;
      return parsed;
    } catch {
      localStorage.removeItem('salva_user');
      return null;
    }
  });

  const [ngnsBalance, setBalance] = useState(null);
  const [cNgnBalance, setCNgnBalance] = useState(null);
  const [usdtBalance, setUsdtBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: '',
  });

  const [showBalance, setShowBalance] = useState(() => {
    try {
      const saved = localStorage.getItem('salva_show_balance');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleShowBalance = useCallback(() => {
    setShowBalance((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('salva_show_balance', String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const [activeTab, setActiveTab] = useState('buy');
  const [registries, setRegistries] = useState([]);
  const [feeConfig, setFeeConfig] = useState(null);
  const [feePreview, setFeePreview] = useState({ feeNGN: 0, feeUsd: 0 });
  const [amountError, setAmountError] = useState(false);
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [confirmationData, setConfirmationData] = useState(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState('');
  const [pinAttempts, setPinAttempts] = useState(0);
  const [isAccountLocked, setIsAccountLocked] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [recipientInput, setRecipientInput] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferAmountDisplay, setTransferAmountDisplay] = useState('');
  const [selectedRegistry, setSelectedRegistry] = useState(null);
  const [inputType, setInputType] = useState('empty');
  const [selectedCoin, setSelectedCoin] = useState('NGN');

  const showMsg = useCallback(
    (msg, type = 'success') => setNotification({ show: true, message: msg, type }),
    []
  );
  const closeNotif = useCallback(() => setNotification((n) => ({ ...n, show: false })), []);

  useEffect(() => {
    if (!user) navigate('/login', { replace: true });
  }, [user, navigate]);

  const refreshUserStatus = useCallback(async (email, currentUser) => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/status/${encodeURIComponent(email)}`);
      if (!res.ok) return;
      const data = await res.json();
      const updated = {
        ...currentUser,
        isValidator: data.isValidator,
        nameAlias: data.nameAlias,
        isSeller: data.isSeller,
      };
      localStorage.setItem('salva_user', JSON.stringify(updated));
      setUser(updated);
    } catch {
      /* silently ignore */
    }
  }, []);

  const checkAccountLockStatus = useCallback(async () => {
    if (!user?.email) return;
    try {
      const res = await fetch(
        `${SALVA_API_URL}/api/user/pin-status/${encodeURIComponent(user.email)}`
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data.isLocked) {
        setIsAccountLocked(true);
        const h = Math.ceil((new Date(data.lockedUntil) - new Date()) / (1000 * 60 * 60));
        setLockMessage(`Account locked for ${h} more hour${h !== 1 ? 's' : ''}`);
      }
    } catch {
      /* ignore */
    }
  }, [user?.email]);

  const fetchBalance = useCallback(async (address, showSpinner = false) => {
    if (!address) return;
    if (showSpinner) setBalanceLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/balance/${address}`);
      if (!res.ok) return;
      const data = await res.json();
      setBalance(data.ngnsBalance ?? '0');
      setCNgnBalance(data.cNgnBalance ?? '0');
      setUsdtBalance(data.usdtBalance ?? '0');
      setUsdcBalance(data.usdcBalance ?? '0');
      // Silently trigger queue processor on every balance poll
      fetch(`${SALVA_API_URL}/api/queue/process/${address}`, {
        method: 'POST',
      }).catch(() => {});
    } catch {
      /* keep existing */
    } finally {
      if (showSpinner) setBalanceLoading(false);
    }
  }, []);
  const syncIncoming = useCallback(async (address) => {
    if (!address) return;
    try {
      await fetch(`${SALVA_API_URL}/api/sync-incoming/${address}`);
    } catch {
      /* silently ignore */
    }
  }, []);

  useEffect(() => {
    if (!user?.safeAddress) return;
    fetchBalance(user.safeAddress, true);
    refreshUserStatus(user.email, user);
  }, [user?.safeAddress, refreshUserStatus, fetchBalance]);

  useEffect(() => {
    if (!user?.email) return;
    checkAccountLockStatus();
    fetchMeta();
  }, [user?.email, checkAccountLockStatus]);

  useEffect(() => {
    if (!user?.safeAddress) return;
    syncIncoming(user.safeAddress);
    const tick = () => {
      if (document.visibilityState === 'visible') {
        fetchBalance(user.safeAddress);
        syncIncoming(user.safeAddress);
      }
    };
    const iv = setInterval(tick, 45000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(iv);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [user?.safeAddress, fetchBalance]);

  useEffect(() => {
    if (transferAmount) {
      const amt = parseFloat(transferAmount);
      if (selectedCoin === 'NGN')
        setAmountError(!isNaN(amt) && amt > parseFloat(ngnsBalance ?? '0'));
      else if (selectedCoin === 'CNGN')
        setAmountError(!isNaN(amt) && amt > parseFloat(cNgnBalance ?? '0'));
      else if (selectedCoin === 'USDT')
        setAmountError(!isNaN(amt) && amt > parseFloat(usdtBalance ?? '0'));
      else setAmountError(!isNaN(amt) && amt > parseFloat(usdcBalance ?? '0'));
    } else {
      setAmountError(false);
    }
  }, [transferAmount, ngnsBalance, cNgnBalance, usdtBalance, usdcBalance, selectedCoin]);

  const fetchMeta = async () => {
    try {
      const [regRes, feeRes] = await Promise.all([
        fetch(`${SALVA_API_URL}/api/registries`),
        fetch(`${SALVA_API_URL}/api/fee-config`),
      ]);
      const regData = await regRes.json();
      const feeData = await feeRes.json();
      const regsArray = Array.isArray(regData) ? regData : [];
      setRegistries(regsArray);
      setFeeConfig(feeData);
      if (regsArray.length === 1) setSelectedRegistry(regsArray[0]);
    } catch {}
  };

  const computeFeePreview = (amount, coin) => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || !amount) {
      setFeePreview({ feeNGN: 0, feeUsd: 0 });
      return;
    }
    if ((coin === 'NGN' || coin === 'CNGN') && feeConfig) {
      let fee = 0;
      if (amt >= (feeConfig.tier2Min ?? 10000)) fee = feeConfig.tier2Fee ?? 20;
      else if (amt >= (feeConfig.tier1Min ?? 1000) && amt <= (feeConfig.tier1Max ?? 9999))
        fee = feeConfig.tier1Fee ?? 10;
      setFeePreview({ feeNGN: fee, feeUsd: 0 });
    } else if (coin === 'USDT' || coin === 'USDC') {
      setFeePreview({ feeNGN: 0, feeUsd: amt >= 5 ? 0.015 : 0 });
    }
  };

  const handleRecipientChange = (val) => {
    // 1. Lowercase everything
    let cleaned = val.toLowerCase();
    // Don't filter 0x wallet addresses
    if (cleaned.startsWith('0x') || val.startsWith('0x')) {
      setRecipientInput(val);
      setInputType('address');
      setSelectedRegistry(null);
      return;
    }
    // ── Early-exit: full name with @ detected (handles paste) ──
    // Check BEFORE stripping — if the raw lowercased value already contains @,
    // treat it as a fullname immediately without waiting for char-by-char typing
    if (cleaned.includes('@')) {
      // Still sanitize but preserve the @ and valid chars
      cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
      // Collapse multiple @'s to the first one only
      const atIndex = cleaned.indexOf('@');
      if (atIndex !== -1) {
        cleaned = cleaned.slice(0, atIndex + 1) + cleaned.slice(atIndex + 1).replace(/@/g, '');
      }
      setRecipientInput(cleaned);
      setInputType('fullname');
      setSelectedRegistry(null);
      return;
    }
    // 2. Block 0, 1, and any symbol except a-z, 2-9, _, @
    cleaned = cleaned.replace(/[^a-z2-9.@]/g, '');
    // 3. Allow only one underscore
    const firstDot = cleaned.indexOf('.');
    if (firstDot !== -1) {
      cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
    }
    // 4. Allow only one @
    const firstAt = cleaned.indexOf('@');
    if (firstAt !== -1) {
      cleaned = cleaned.slice(0, firstAt + 1) + cleaned.slice(firstAt + 1).replace(/@/g, '');
    }
    setRecipientInput(cleaned);
    const type = detectInputType(cleaned);
    setInputType(type);
    if (type === 'address') setSelectedRegistry(null);
    else if (type === 'fullname') setSelectedRegistry(null);
    else if (type === 'name' && registries.length === 1) setSelectedRegistry(registries[0]);
  };

  const handleTransferClick = () => {
    if (isAccountLocked) return showMsg(lockMessage, 'error');
    setIsSendOpen(true);
  };

  const resetSendForm = () => {
    setRecipientInput('');
    setTransferAmount('');
    setTransferAmountDisplay('');
    setSelectedRegistry(registries.length === 1 ? registries[0] : null);
    setInputType('empty');
    setFeePreview({ feeNGN: 0, feeUsd: 0 });
    setSelectedCoin('NGN');
  };

  const resolveAndConfirm = async () => {
    if (!recipientInput || !transferAmount) return showMsg('Fill all fields', 'error');
    const type = detectInputType(recipientInput);
    if (type === 'name' && !selectedRegistry) return showMsg('Select a wallet service', 'error');
    // fullname: validate it has a non-empty namespace after "@"
    if (type === 'fullname') {
      const parts = recipientInput.trim().split('@');
      if (parts.length !== 2 || !parts[0] || !parts[1])
        return showMsg('Invalid name format. Use name@wallet (e.g. charles@salva)', 'error');
    }
    setLoading(true);
    try {
      let resolvedAddress = null;
      let displayIdentifier = recipientInput.trim();
      if (type === 'address') {
        resolvedAddress = recipientInput.trim().toLowerCase();
      } else if (type === 'fullname') {
        // Full name: pass as-is, backend resolves using REGISTRY_CONTRACT_ADDRESS
        // No welding needed — the full welded name is already in the input
        const res = await fetch(`${SALVA_API_URL}/api/resolve-full-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fullName: recipientInput.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolvedAddress) {
          showMsg(data.message || 'Recipient not found. Check the name or address.', 'error');
          return;
        }
        resolvedAddress = data.resolvedAddress.toLowerCase();
        displayIdentifier = recipientInput.trim();
      } else {
        // type === "name": existing flow — weld with selected registry namespace
        const res = await fetch(`${SALVA_API_URL}/api/resolve-recipient`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: recipientInput.trim(),
            registryAddress: selectedRegistry.registryAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.resolvedAddress) {
          showMsg('Recipient not found. Check the name or address.', 'error');
          return;
        }
        resolvedAddress = data.resolvedAddress.toLowerCase();
        displayIdentifier = `${recipientInput.trim()}${selectedRegistry.nspace}`;
      }
      setConfirmationData({
        resolvedAddress,
        displayIdentifier,
        amount: transferAmount,
        registryAddress: selectedRegistry?.registryAddress || null,
        walletName: selectedRegistry?.name || null,
        inputType: type,
        rawInput: recipientInput.trim(),
        feeNGN: feePreview.feeNGN,
        feeUsd: feePreview.feeUsd,
        coin: selectedCoin,
      });
      setIsConfirmModalOpen(true);
    } catch {
      showMsg('Could not find that recipient. Double-check and try again.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const executeTransfer = async (privateKey, capturedData) => {
    setIsPinModalOpen(false);
    setIsConfirmModalOpen(false);
    setIsSendOpen(false);
    resetSendForm();
    showMsg('Transaction queued — sending…', 'info');
    try {
      const res = await fetch(`${SALVA_API_URL}/api/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userPrivateKey: privateKey,
          safeAddress: user.safeAddress,
          toInput: capturedData.rawInput,
          amount: capturedData.amount,
          registryAddress: capturedData.registryAddress || null,
          inputType: capturedData.inputType,
          coin: capturedData.coin,
          senderDisplayIdentifier: capturedData.displayIdentifier,
        }),
      });
      const data = await res.json();
      if (res.ok && data.queued) {
        showMsg('⏳ Transaction queued — processing…', 'info');
        // Poll for completion — check every 6s, up to ~3 minutes
        let attempts = 0;
        const maxAttempts = 30;
        const pollInterval = setInterval(async () => {
          attempts++;
          try {
            // Trigger processor
            await fetch(`${SALVA_API_URL}/api/queue/process/${user.safeAddress}`, {
              method: 'POST',
            }).catch(() => {});
            // Check tx history for a new successful tx
            const txRes = await fetch(`${SALVA_API_URL}/api/transactions/${user.safeAddress}`);
            const txData = await txRes.json();
            const hasPending =
              Array.isArray(txData) && txData.some((tx) => tx.displayType === 'pending');
            const hasNewSuccess =
              Array.isArray(txData) &&
              txData.some(
                (tx) =>
                  tx.displayType === 'sent' && new Date(tx.date) > new Date(Date.now() - 300_000) // within last 5 min
              );
            if (!hasPending && hasNewSuccess) {
              clearInterval(pollInterval);
              showMsg('✅ Transfer Successful!');
              fetchBalance(user.safeAddress);
            } else if (attempts >= maxAttempts) {
              clearInterval(pollInterval);
              // Still show balance refresh even if we timed out polling
              fetchBalance(user.safeAddress);
            }
          } catch {
            // ignore poll errors
          }
        }, 6000);
      } else if (res.ok) {
        showMsg('✅ Transfer Successful!');
        fetchBalance(user.safeAddress);
      } else {
        showMsg('Transaction failed. Please try again.', 'error');
      }
    } catch {
      showMsg('Connection error. Check your network and try again.', 'error');
    }
  };

  const verifyPinAndProceed = async () => {
    if (transactionPin.length !== 4) return showMsg('PIN must be 4 digits', 'error');
    setLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, pin: transactionPin }),
      });
      const data = await res.json();
      if (res.ok) {
        const capturedData = { ...confirmationData };
        setTransactionPin('');
        setPinAttempts(0);
        setLoading(false);
        await executeTransfer(data.privateKey, capturedData);
      } else {
        const newAttempts = pinAttempts + 1;
        setPinAttempts(newAttempts);
        if (newAttempts >= 3) {
          showMsg('Too many failed attempts — redirecting to settings', 'error');
          setLoading(false);
          setTimeout(() => navigate('/account-settings'), 2000);
        } else {
          showMsg(
            `Incorrect PIN — ${3 - newAttempts} attempt${3 - newAttempts !== 1 ? 's' : ''} left`,
            'error'
          );
          setLoading(false);
        }
      }
    } catch {
      showMsg('Network error', 'error');
      setLoading(false);
    }
  };

  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B]">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 2 }}
          className="text-salvaGold font-black text-2xl uppercase tracking-[0.5em]"
        >
          Salva
        </motion.div>
      </div>
    );

  const tabs = [
    { id: 'buy', label: 'Buy / Sell NGNs' },
    { id: 'swap', label: 'Swap' },
    { id: 'deploy', label: 'Deploy Pool' },
    { id: 'names', label: 'Link a Name' },
    ...(user.isValidator ? [{ id: 'admin', label: 'Admin' }] : []),
    ...(user.isSeller ? [{ id: 'seller', label: 'Mint Requests' }] : []),
  ];

  // ── Icon map for the Bybit-style grid nav ─────────────────────────────────
  const TAB_ICONS = {
    buy: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <text
          x="12"
          y="17"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          stroke="none"
          fill="currentColor"
          fontFamily="sans-serif"
        >
          ₦
        </text>
      </svg>
    ),
    swap: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 16V4m0 0L4 7m3-3 3 3" />
        <path d="M17 8v12m0 0 3-3m-3 3-3-3" />
      </svg>
    ),
    deploy: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="2" y="7" width="20" height="14" rx="2" />
        <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2" />
        <line x1="12" y1="12" x2="12" y2="16" />
        <line x1="10" y1="14" x2="14" y2="14" />
      </svg>
    ),
    names: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Tag/label shape with a dot hole — universally means "name label" */}
        <path d="M12 2H6a2 2 0 0 0-2 2v6.17a2 2 0 0 0 .59 1.42l7.83 7.83a2 2 0 0 0 2.83 0l5.17-5.17a2 2 0 0 0 0-2.83L12.41 2.59A2 2 0 0 0 12 2z" />
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
      </svg>
    ),
    admin: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <polyline points="9 12 11 14 15 10" />
      </svg>
    ),
    seller: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.75}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        <circle cx="9" cy="10" r="0.5" fill="currentColor" />
        <circle cx="12" cy="10" r="0.5" fill="currentColor" />
        <circle cx="15" cy="10" r="0.5" fill="currentColor" />
      </svg>
    ),
  };

  const TAB_SHORT_LABELS = {
    buy: 'Buy / Sell',
    swap: 'Swap',
    deploy: 'Deploy Pool',
    names: 'Link Name',
    admin: 'Admin',
    seller: 'Requests',
  };

  const showRegistryDropdown = inputType === 'name';
  const currentCoinBalance =
    selectedCoin === 'NGN'
      ? (ngnsBalance ?? '0.00')
      : selectedCoin === 'CNGN'
        ? (cNgnBalance ?? '0.00')
        : selectedCoin === 'USDT'
          ? (usdtBalance ?? '0.00')
          : (usdcBalance ?? '0.00');
  const coinSymbol =
    selectedCoin === 'NGN' ? 'NGNs' : selectedCoin === 'CNGN' ? 'cNGN' : selectedCoin;
  const recipientNameError = false;
  const darkInput =
    'w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none font-bold text-sm text-white placeholder:text-white/60 transition-all';

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white pt-28 px-4 pb-16 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-2xl mx-auto relative z-10">
        {/* ── Header ── */}
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/60 font-black mb-1">
              {user.isValidator ? 'Salva Validator' : 'Salva Citizen'}
            </p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight leading-none">
              {user.username}
            </h1>
          </div>
        </header>

        {/* ── Balance Card ── */}
        <BalanceCard
          ngnsBalance={ngnsBalance ?? '0.00'}
          cNgnBalance={cNgnBalance ?? '0.00'}
          usdtBalance={usdtBalance ?? '0.00'}
          usdcBalance={usdcBalance ?? '0.00'}
          showBalance={showBalance}
          balanceLoading={balanceLoading}
          onToggleVisibility={toggleShowBalance}
          onSend={handleTransferClick}
          onReceive={() => setIsReceiveOpen(true)}
        />

        {/* ── Wallet address chip ── */}
        <div
          onClick={() => {
            navigator.clipboard.writeText(user.safeAddress);
            showMsg('Wallet address copied!');
          }}
          className="mb-4 px-4 py-3 bg-white/[0.03] rounded-2xl border border-white/[0.06] cursor-pointer hover:border-salvaGold/20 transition-all flex items-center gap-3"
        >
          <div className="w-7 h-7 rounded-lg bg-salvaGold/10 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
            <span className="text-salvaGold text-[10px]">⛓</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black">
              Smart Wallet · Base
            </p>
            <p className="font-mono text-[10px] text-salvaGold/60 truncate mt-0.5">
              {showBalance ? user.safeAddress : '0x••••••••••••••••••••••••••••••••••••••••'}
            </p>
          </div>
          <span className="text-[10px] text-white/60 flex-shrink-0">Copy</span>
        </div>

        {/* ── Transaction History link ── */}
        <Link
          to="/transactions"
          className="flex items-center justify-between mb-6 px-4 py-3.5 bg-white/[0.03] rounded-2xl border border-white/[0.06] hover:border-salvaGold/20 transition-all group"
        >
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center">
              <span className="text-white/60 text-xs">↗</span>
            </div>
            <p className="text-xs font-black uppercase tracking-widest text-white/50 group-hover:text-white transition-colors">
              Transaction History
            </p>
          </div>
          <span className="text-salvaGold text-sm group-hover:translate-x-0.5 transition-transform">
            →
          </span>
        </Link>

        {/* ── Account locked banner ── */}
        {isAccountLocked && (
          <div className="mb-5 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl">
            <p className="text-sm font-bold text-red-400">
              🔒 {lockMessage} — Transactions are disabled.
            </p>
          </div>
        )}

        {/* ══ BYBIT-STYLE ICON GRID NAV ══════════════════════════════════════ */}
        <div className="mb-7">
          {/* ── Top separator ── */}
          <div className="relative flex items-center mb-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/30 to-transparent" />
            <div className="mx-3 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-salvaGold/40 block" />
              <span className="w-1.5 h-1.5 rounded-full bg-salvaGold/60 block" />
              <span className="w-1 h-1 rounded-full bg-salvaGold/40 block" />
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/30 to-transparent" />
          </div>
          <div
            className={`grid gap-x-1 gap-y-5 ${tabs.length <= 4 ? 'grid-cols-4' : tabs.length === 5 ? 'grid-cols-5' : 'grid-cols-4'}`}
          >
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  data-tab={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex flex-col items-center gap-2 group focus:outline-none"
                >
                  {/* Circle icon */}
                  <div
                    className={`
                      relative w-14 h-14 rounded-full flex items-center justify-center
                      transition-all duration-200 active:scale-95
                      ${
                        isActive
                          ? 'bg-[#1C1C1E] ring-2 ring-salvaGold shadow-[0_0_18px_rgba(212,175,55,0.18)]'
                          : 'bg-[#1C1C1E] ring-1 ring-white/[0.05] hover:ring-white/15 hover:bg-[#232325]'
                      }
                    `}
                  >
                    <span
                      className={`w-[22px] h-[22px] transition-colors duration-200 ${
                        isActive ? 'text-salvaGold' : 'text-white/60 group-hover:text-white/65'
                      }`}
                    >
                      {TAB_ICONS[tab.id]}
                    </span>
                    {/* Active indicator dot beneath circle */}
                    {isActive && (
                      <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-salvaGold" />
                    )}
                  </div>
                  {/* Short label */}
                  <span
                    className={`
                      text-[9px] font-black uppercase tracking-[0.1em] leading-tight
                      text-center max-w-[64px] break-words transition-colors duration-200
                      ${isActive ? 'text-salvaGold' : 'text-white/60 group-hover:text-white/50'}
                    `}
                  >
                    {TAB_SHORT_LABELS[tab.id] || tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          {/* ── Bottom separator ── */}
          <div className="relative flex items-center mt-6">
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/20 to-transparent" />
            <div className="mx-3 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-salvaGold/30 block" />
              <span className="w-1.5 h-1.5 rounded-full bg-salvaGold/40 block" />
              <span className="w-1 h-1 rounded-full bg-salvaGold/30 block" />
            </div>
            <div className="flex-1 h-px bg-gradient-to-r from-transparent via-salvaGold/20 to-transparent" />
          </div>
        </div>
        {/* ══ END ICON GRID NAV ══════════════════════════════════════════════ */}

        {/* ── Tab content ── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'buy' && (
              <div className="flex flex-col items-center justify-center min-h-[280px] text-center py-12">
                <motion.div
                  animate={{ y: [0, -6, 0] }}
                  transition={{
                    repeat: Infinity,
                    duration: 3,
                    ease: 'easeInOut',
                  }}
                  className="w-16 h-16 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-5"
                >
                  <span className="text-2xl font-black text-salvaGold">₦</span>
                </motion.div>
                <h3 className="text-xl font-black mb-2">Buy / Sell NGNs</h3>
                <p className="text-white/60 text-sm mb-5 max-w-xs leading-relaxed">
                  Purchase or sell Nigerian Naira stablecoin via our OTC desk.
                </p>
                <div className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-salvaGold/10 border border-salvaGold/20">
                  <span className="text-salvaGold">₦</span>
                  <p className="text-[10px] font-black text-salvaGold uppercase tracking-widest">
                    Tap the ₦ button · bottom right
                  </p>
                </div>
                <a
                  href="/l1"
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-blue-500/30 bg-blue-500/[0.07] hover:bg-blue-500/[0.14] hover:border-blue-500/50 transition-all"
                >
                  <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">
                    Buy/Sell on BNB CHAIN
                  </span>
                  <span className="text-blue-400 text-[11px]">↗</span>
                </a>
              </div>
            )}

            {activeTab === 'names' && (
              <LinkNameTab
                user={user}
                registries={registries}
                showMsg={showMsg}
                onSwitchToBuy={() => setActiveTab('buy')}
              />
            )}

            {activeTab === 'swap' && <SwapTab user={user} showMsg={showMsg} />}

            {activeTab === 'deploy' && (
              <DeployPool
                user={user}
                showMsg={showMsg}
                onSwitchToLinkName={(poolAddress) => {
                  window.__salva_pool_prefill = poolAddress;
                  setActiveTab('names');
                }}
              />
            )}

            {activeTab === 'admin' && user.isValidator && (
              <AdminPanel user={user} showMsg={showMsg} />
            )}
            {activeTab === 'seller' && user.isSeller && (
              <SellerMintPanel user={user} showMsg={showMsg} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ══ SEND MODAL ═══════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isSendOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              onClick={() => !loading && setIsSendOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 p-6 sm:p-10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-6 sm:hidden" />
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-2xl sm:text-3xl font-black text-white">Send</h3>
                  <p className="text-[10px] text-salvaGold/60 uppercase tracking-[0.35em] font-black mt-0.5">
                    Salva Secure Transfer
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScanOpen(true)}
                  className="flex-shrink-0 w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 hover:border-salvaGold/40 hover:bg-salvaGold/[0.06] transition-all flex items-center justify-center group mt-1"
                >
                  <svg
                    className="w-5 h-5 text-white/60 group-hover:text-salvaGold transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"
                    />
                    <rect x="7" y="7" width="4" height="4" rx="0.5" strokeWidth={1.8} />
                    <rect x="13" y="7" width="4" height="4" rx="0.5" strokeWidth={1.8} />
                    <rect x="7" y="13" width="4" height="4" rx="0.5" strokeWidth={1.8} />
                    <path
                      strokeLinecap="round"
                      strokeWidth={1.8}
                      d="M13 13h1v1M17 13v1h-1M13 17h4v-2"
                    />
                  </svg>
                </button>
              </div>
              <div className="mb-5">
                <label className="text-[10px] uppercase text-white/60 font-bold block mb-2">
                  Select Token
                </label>
                <div className="flex gap-2">
                  {['NGN', 'CNGN', 'USDT', 'USDC'].map((coin) => (
                    <button
                      key={coin}
                      onClick={() => {
                        setSelectedCoin(coin);
                        setTransferAmount('');
                        setTransferAmountDisplay('');
                        setFeePreview({ feeNGN: 0, feeUsd: 0 });
                      }}
                      className={`flex-1 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all border ${selectedCoin === coin ? 'bg-salvaGold text-black border-salvaGold' : 'border-white/10 text-white/60 hover:text-white/80'}`}
                    >
                      {coin === 'NGN' ? 'NGNs' : coin}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-white/60 mt-1.5">
                  Balance:{' '}
                  {balanceLoading
                    ? '…'
                    : showBalance
                      ? formatNumber(currentCoinBalance, {
                          minDecimals: 3,
                          maxDecimals: 6,
                        })
                      : '••••'}{' '}
                  {coinSymbol}
                </p>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  resolveAndConfirm();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-[10px] uppercase text-white/60 font-bold block">
                    Recipient
                  </label>
                  <input
                    required
                    type="text"
                    placeholder="Name alias or 0x address"
                    value={recipientInput}
                    onChange={(e) => handleRecipientChange(e.target.value)}
                    className={`${darkInput} ${recipientNameError ? 'border-red-500' : ''}`}
                  />
                  {inputType !== 'empty' && (
                    <p className="text-[10px] text-white/60 font-bold ml-1">
                      {inputType === 'address'
                        ? '✓ Wallet address — sending directly'
                        : inputType === 'fullname'
                          ? '✓ Full name detected — resolving directly'
                          : 'Name alias — select a wallet below'}
                    </p>
                  )}

                  {showRegistryDropdown && registries.length > 0 && (
                    <div>
                      <label className="text-[10px] uppercase text-white/60 font-bold block mb-2">
                        Select Wallet Service
                      </label>
                      <RegistryDropdown
                        registries={registries}
                        value={selectedRegistry}
                        onChange={setSelectedRegistry}
                        placeholder="Search wallet service…"
                      />
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] uppercase text-white/60 font-bold">
                      Amount ({coinSymbol})
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const raw = parseFloat(currentCoinBalance) || 0;
                        const fmt = raw
                          .toLocaleString('en-US', { maximumFractionDigits: 6 })
                          .replace(/,/g, ',');
                        setTransferAmountDisplay(formatAmountInput(String(raw)));
                        setTransferAmount(String(raw));
                        computeFeePreview(String(raw), selectedCoin);
                      }}
                      className="text-[10px] font-black uppercase tracking-widest text-salvaGold hover:opacity-80 transition-opacity px-2 py-0.5 rounded-lg bg-salvaGold/10 border border-salvaGold/20 hover:bg-salvaGold/20"
                    >
                      Max
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      required
                      type="text"
                      inputMode="decimal"
                      value={transferAmountDisplay}
                      onChange={(e) => {
                        const fmt = formatAmountInput(e.target.value);
                        setTransferAmountDisplay(fmt);
                        const raw = fmt.replace(/,/g, '');
                        setTransferAmount(raw);
                        computeFeePreview(raw, selectedCoin);
                      }}
                      className={`${darkInput} text-lg pr-16 ${amountError ? 'border-red-500' : ''}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-salvaGold font-black text-sm">
                      {coinSymbol}
                    </span>
                  </div>
                  {amountError && (
                    <p className="text-[10px] text-red-400 mt-1 font-bold animate-pulse">
                      ⚠️ Insufficient balance
                    </p>
                  )}
                  {(selectedCoin === 'NGN' || selectedCoin === 'CNGN') &&
                    transferAmount &&
                    !amountError && (
                      <div className="mt-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px] space-y-1">
                        <div className="flex justify-between">
                          <span className="text-white/60 uppercase font-bold">Network Fee</span>
                          <span
                            className={
                              feePreview.feeNGN > 0
                                ? 'text-red-400 font-black'
                                : 'text-green-400 font-black'
                            }
                          >
                            {feePreview.feeNGN > 0
                              ? `-${formatNumber(feePreview.feeNGN)} NGNs`
                              : 'Free'}
                          </span>
                        </div>
                      </div>
                    )}
                  {(selectedCoin === 'USDT' || selectedCoin === 'USDC') &&
                    transferAmount &&
                    !amountError && (
                      <div className="mt-2 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-[10px]">
                        <div className="flex justify-between">
                          <span className="text-white/60 uppercase font-bold">Network Fee</span>
                          <span
                            className={
                              feePreview.feeUsd > 0
                                ? 'text-red-400 font-black'
                                : 'text-green-400 font-black'
                            }
                          >
                            {feePreview.feeUsd > 0
                              ? `-${feePreview.feeUsd} ${selectedCoin}`
                              : 'Free'}
                          </span>
                        </div>
                      </div>
                    )}
                </div>
                <button
                  disabled={loading || amountError || !recipientInput || recipientNameError}
                  type="submit"
                  className={`w-full py-4 rounded-2xl font-black transition-all text-sm uppercase tracking-widest flex items-center justify-center gap-2 ${
                    loading || amountError || !recipientInput
                      ? 'bg-white/5 text-white/60 cursor-not-allowed border border-white/5'
                      : 'bg-salvaGold text-black hover:brightness-110 active:scale-[0.98] shadow-lg shadow-salvaGold/20'
                  }`}
                >
                  {loading && (
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {loading ? 'Processing…' : 'Review & Send'}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ CONFIRM MODAL ════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isConfirmModalOpen && confirmationData && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <motion.div
              onClick={() => setIsConfirmModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-lg shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-yellow-500/10 border border-yellow-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-1 text-white">Verify Recipient</h3>
                <p className="text-sm text-white/60">
                  Double-check before sending. Blockchain transactions are irreversible.
                </p>
              </div>
              <div className="space-y-3 mb-6">
                <div className="p-4 rounded-2xl bg-salvaGold/5 border border-salvaGold/15">
                  <p className="text-[10px] text-white/60 mb-1">Sending To</p>
                  <p className="font-black text-sm text-salvaGold break-all leading-snug">
                    {confirmationData.displayIdentifier}
                  </p>
                  <p className="font-mono text-[10px] text-white/60 mt-1 break-all">
                    {confirmationData.resolvedAddress}
                  </p>
                  {confirmationData.walletName && (
                    <p className="text-[10px] text-white/60 mt-1 font-bold">
                      via {confirmationData.walletName}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
                  <p className="text-[10px] text-white/60 mb-1">You Send</p>
                  <p className="font-black text-xl text-white">
                    {formatNumber(confirmationData.amount, {
                      minDecimals: 0,
                      maxDecimals: 6,
                    })}{' '}
                    <span className="text-salvaGold">
                      {confirmationData.coin === 'NGN' ? 'NGNs' : confirmationData.coin}
                    </span>
                  </p>
                </div>
                {(confirmationData.feeNGN > 0 || confirmationData.feeUsd > 0) && (
                  <div className="p-4 rounded-2xl bg-red-500/5 border border-red-500/10">
                    <p className="text-[10px] text-white/60 mb-1">Network Fee</p>
                    <p className="font-black text-base text-red-400">
                      {confirmationData.feeNGN > 0
                        ? `-${formatNumber(confirmationData.feeNGN)} NGNs`
                        : `-${confirmationData.feeUsd} ${confirmationData.coin}`}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setIsConfirmModalOpen(false)}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-white hover:bg-white/5 transition-all"
                >
                  Go Back
                </button>
                <button
                  onClick={() => {
                    setIsConfirmModalOpen(false);
                    setIsPinModalOpen(true);
                    setTransactionPin('');
                    setPinAttempts(0);
                  }}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 transition-all"
                >
                  Confirm & Sign
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ PIN MODAL ═════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isPinModalOpen && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
            <motion.div
              onClick={() => !loading && setIsPinModalOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              onClick={(e) => e.stopPropagation()}
              className="relative bg-zinc-950 border border-white/10 p-8 rounded-3xl w-full max-w-md shadow-2xl"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <div className="text-center mb-6">
                <div className="w-14 h-14 bg-salvaGold/10 border border-salvaGold/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔐</span>
                </div>
                <h3 className="text-2xl font-black mb-1 text-white">Transaction PIN</h3>
                <p className="text-sm text-white/60">Verify identity to proceed</p>
              </div>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength="4"
                value={transactionPin}
                onChange={(e) => setTransactionPin(e.target.value.replace(/\D/g, ''))}
                placeholder="••••"
                autoFocus
                className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-salvaGold outline-none text-center text-3xl tracking-[1em] font-black mb-5 text-white"
              />
              {pinAttempts > 0 && (
                <p className="text-xs text-red-400 text-center mb-4 font-bold">
                  ⚠️ {3 - pinAttempts} attempt{3 - pinAttempts !== 1 ? 's' : ''} remaining
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsPinModalOpen(false)}
                  disabled={loading}
                  className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-white hover:bg-white/5 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={verifyPinAndProceed}
                  disabled={loading || transactionPin.length !== 4}
                  className="flex-1 py-3 rounded-xl bg-salvaGold text-black font-bold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                >
                  {loading && (
                    <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  )}
                  {loading ? 'Verifying…' : 'Verify'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Notification ── */}
      <AnimatePresence>
        {notification.show && (
          <SalvaNotification notification={notification} onClose={closeNotif} />
        )}
      </AnimatePresence>

      {/* ══ RECEIVE MODAL ════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isReceiveOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              onClick={() => setIsReceiveOpen(false)}
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 p-6 sm:p-8 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-sm shadow-2xl"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mb-7 sm:hidden" />
              <div className="text-center mb-7">
                <p className="text-[9px] uppercase tracking-[0.45em] text-salvaGold/50 font-black mb-1">
                  Receive Funds
                </p>
                <h3 className="text-2xl font-black text-white">{user.username}</h3>
              </div>
              <div className="flex justify-center mb-6">
                <div
                  onClick={() => {
                    navigator.clipboard.writeText(user.safeAddress);
                    showMsg('Address copied!');
                  }}
                  className="relative group cursor-pointer"
                >
                  <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-salvaGold/40 via-salvaGold/10 to-transparent blur-md group-hover:blur-lg transition-all" />
                  <div className="relative p-4 rounded-2xl bg-white border-2 border-salvaGold/30 group-hover:border-salvaGold/60 transition-all shadow-2xl shadow-black">
                    <QRCodeSVG
                      value={user.safeAddress}
                      size={188}
                      bgColor="#FFFFFF"
                      fgColor="#0A0A0B"
                      level="M"
                      includeMargin={false}
                    />
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
                    <div className="bg-black/80 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full">
                      Tap to copy
                    </div>
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(user.safeAddress);
                  showMsg('Address copied!');
                }}
                className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/30 hover:bg-salvaGold/[0.03] transition-all group mb-3"
              >
                <div className="min-w-0 text-left">
                  <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black mb-1">
                    Wallet Address
                  </p>
                  <p className="font-mono text-[10px] text-salvaGold/70 truncate">
                    {user.safeAddress}
                  </p>
                </div>
                <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 group-hover:border-salvaGold/30 group-hover:bg-salvaGold/10 flex items-center justify-center flex-shrink-0 transition-all">
                  <svg
                    className="w-3 h-3 text-white/60 group-hover:text-salvaGold transition-colors"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                    <path
                      d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                      strokeWidth="2"
                    />
                  </svg>
                </div>
              </button>
              {user.nameAlias && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(user.nameAlias);
                    showMsg('Name alias copied!');
                  }}
                  className="w-full flex items-center justify-between gap-3 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-salvaGold/30 hover:bg-salvaGold/[0.03] transition-all group mb-3"
                >
                  <div className="min-w-0 text-left">
                    <p className="text-[9px] uppercase tracking-[0.35em] text-white/60 font-black mb-1">
                      Name Alias
                    </p>
                    <p className="font-black text-sm text-salvaGold">{user.nameAlias}</p>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 group-hover:border-salvaGold/30 group-hover:bg-salvaGold/10 flex items-center justify-center flex-shrink-0 transition-all">
                    <svg
                      className="w-3 h-3 text-white/60 group-hover:text-salvaGold transition-colors"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <rect x="9" y="9" width="13" height="13" rx="2" strokeWidth="2" />
                      <path
                        d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                        strokeWidth="2"
                      />
                    </svg>
                  </div>
                </button>
              )}
              <button
                onClick={() => setIsReceiveOpen(false)}
                className="w-full py-3.5 rounded-2xl border border-white/10 font-bold text-white/60 hover:text-white hover:border-white/20 hover:bg-white/[0.03] transition-all text-sm uppercase tracking-widest mt-1"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ══ QR SCANNER MODAL ══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {isScanOpen && (
          <QRScannerModal
            onScan={(address) => {
              setIsScanOpen(false);
              setTimeout(() => {
                setRecipientInput(address);
                handleRecipientChange(address);
                if (!isSendOpen) setIsSendOpen(true);
              }, 350);
            }}
            onClose={() => setIsScanOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* ── Floating Buy NGNs Chat ── */}
      {!user.isSeller && activeTab === 'buy' && <SalvaNGNsChat user={user} />}

      {/* ── Seller Mint Inbox ── */}
      {user.isSeller && activeTab === 'buy' && <SalvaSellerChat user={user} />}
    </div>
  );
};

export default Dashboard;
