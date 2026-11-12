// Salva-Digital-Tech/packages/frontend/src/pages/LinkNamePage.jsx
// SNS v2.1.1 — Namespace + Name Linking

import { SALVA_API_URL } from '../config';
import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';
import PinModal from '../components/PinModal';
import { SNS_POLL_INTERVAL_MS, fetchSnsSnapshot, readSnsCache } from '../utils/snsCache';

const weld = (name, namespace) => {
  if (!name || !namespace) return '';

  const n = name.trim();
  const ns = namespace.trim();

  if (n.includes('@')) return n;

  return `${n}${ns.startsWith('@') ? ns : `@${ns}`}`;
};

const isFullName = (val) => val.trim().includes('@');

const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');

const Icon = ({ name, size = 18, stroke = 1.8, className = '' }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: stroke,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
    className,
  };

  const paths = {
    arrow: (
      <>
        <path d="M5 12h14" />
        <path d="m13 6 6 6-6 6" />
      </>
    ),

    back: (
      <>
        <path d="m15 18-6-6 6-6" />
      </>
    ),

    refresh: (
      <>
        <path d="M21 12a9 9 0 1 1-2.64-6.36" />
        <polyline points="21 3 21 9 15 9" />
      </>
    ),

    chevron: <path d="m6 9 6 6 6-6" />,

    copy: (
      <>
        <rect x="9" y="9" width="10" height="10" rx="2" />
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
      </>
    ),

    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),

    x: (
      <>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </>
    ),

    check: <path d="m5 12 4 4L19 6" />,

    shield: (
      <>
        <path d="M12 3 20 7v5c0 4.7-3.1 7.9-8 9-4.9-1.1-8-4.3-8-9V7l8-4Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),

    link: (
      <>
        <path d="M10 13a5 5 0 0 0 7.07.07l2-2A5 5 0 0 0 12 4" />
        <path d="M14 11a5 5 0 0 0-7.07-.07l-2 2A5 5 0 0 0 12 20" />
      </>
    ),

    layers: (
      <>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </>
    ),

    external: (
      <>
        <path d="M14 5h5v5" />
        <path d="m19 5-8 8" />
        <path d="M19 13v4a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
};

const Hint = ({ children }) => (
  <p className="mt-2 text-[9px] leading-4 text-white/45 sm:text-[10px] sm:leading-5">{children}</p>
);

const SectionHeader = ({ eyebrow, title, description, action }) => (
  <div className="mb-4 flex items-start justify-between gap-3 sm:mb-6">
    <div className="min-w-0">
      {eyebrow && (
        <div className="mb-1 text-[8px] font-semibold uppercase tracking-[.2em] text-salvaGold sm:text-[9px]">
          {eyebrow}
        </div>
      )}

      <h2 className="text-[17px] font-semibold tracking-[-0.025em] text-white sm:text-[25px]">
        {title}
      </h2>

      {description && (
        <p className="mt-1 text-[10px] leading-4 text-white/65 sm:text-[13px] sm:leading-5">
          {description}
        </p>
      )}
    </div>

    {action}
  </div>
);

const Notif = ({ notification, onClose }) => {
  if (!notification.show) return null;

  const error = notification.type === 'error';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.button
        aria-label="Close notification"
        className="absolute inset-0 bg-black/75 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      />

      <motion.div
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-[0_30px_100px_rgba(0,0,0,.7)]"
        initial={{ opacity: 0, y: 20, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{
          type: 'spring',
          stiffness: 380,
          damping: 28,
        }}
      >
        <div className={`h-px w-full ${error ? 'bg-red-500' : 'bg-salvaGold'}`} />

        <div className="p-5 text-center sm:p-6">
          <div
            className={`mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full border sm:mb-5 sm:h-12 sm:w-12 ${
              error
                ? 'border-red-500/25 bg-red-500/10 text-red-400'
                : 'border-salvaGold/25 bg-salvaGold/10 text-salvaGold'
            }`}
          >
            <Icon name={error ? 'x' : 'check'} size={19} />
          </div>

          <p className="text-[11px] font-medium leading-5 text-white sm:text-[13px] sm:leading-6">
            {notification.message}
          </p>

          <button
            onClick={onClose}
            className={`mt-5 w-full rounded-xl py-2.5 text-[10px] font-semibold transition-all active:scale-[.98] sm:mt-6 sm:py-3 sm:text-xs ${
              error
                ? 'bg-red-500 text-white hover:bg-red-400'
                : 'bg-salvaGold text-black hover:brightness-110'
            }`}
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
};

const PinModal = ({ open, title, subtitle, onCancel, onConfirm, loading }) => {
  const [pin, setPin] = useState('');

  useEffect(() => {
    if (open) setPin('');
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.button
        aria-label="Close"
        onClick={() => !loading && onCancel()}
        className="absolute inset-0 bg-black/80 backdrop-blur-xl"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      <motion.div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-[#111113] shadow-[0_30px_100px_rgba(0,0,0,.7)]"
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
      >
        <div className="border-b border-white/[.07] px-4 py-4 sm:px-7 sm:py-5">
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div>
              <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-salvaGold/10 text-salvaGold sm:mb-3 sm:h-9 sm:w-9">
                <Icon name="shield" size={16} />
              </div>

              <h3 className="text-sm font-semibold text-white sm:text-base">{title}</h3>

              {subtitle && (
                <p className="mt-1 break-all font-mono text-[9px] text-white/60 sm:text-[11px]">
                  {subtitle}
                </p>
              )}
            </div>

            <button
              onClick={onCancel}
              disabled={loading}
              className="rounded-lg p-1 text-white/45 transition hover:bg-white/5 hover:text-white disabled:opacity-30 sm:p-1.5"
            >
              <Icon name="x" size={15} />
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-7">
          <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:text-[10px]">
            Transaction PIN
          </label>

          <input
            type="password"
            inputMode="numeric"
            maxLength="4"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••"
            className="h-12 w-full rounded-xl border border-white/10 bg-white/[.035] text-center text-xl font-semibold tracking-[.7em] text-white outline-none transition focus:border-salvaGold/60 focus:bg-white/[.05] sm:h-14 sm:text-2xl"
          />

          <div className="mt-3 flex gap-2.5 sm:mt-4 sm:gap-3">
            <button
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-white/10 py-2.5 text-[10px] font-medium text-white/65 transition hover:bg-white/5 hover:text-white disabled:opacity-30 sm:py-3 sm:text-xs"
            >
              Cancel
            </button>

            <button
              onClick={() => onConfirm(pin)}
              disabled={loading || pin.length !== 4}
              className="flex-1 rounded-xl bg-salvaGold py-2.5 text-[10px] font-semibold text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35 sm:py-3 sm:text-xs"
            >
              {loading ? 'Signing…' : 'Confirm'}
            </button>
          </div>

          <p className="mt-3 text-center text-[9px] text-white/55 sm:mt-4 sm:text-[11px]">
            Your PIN authorizes this on-chain action.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

const OwnersField = ({ owners, setOwners }) => {
  const update = (i, val) => setOwners(owners.map((o, idx) => (idx === i ? val : o)));

  const remove = (i) =>
    setOwners(owners.length === 1 ? [''] : owners.filter((_, idx) => idx !== i));

  const add = () => setOwners([...owners, '']);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label className="block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:text-[10px]">
          Owners
        </label>

        <span className="text-[9px] text-white/55 sm:text-[10px]">
          {owners.filter(Boolean).length} added
        </span>
      </div>

      <div className="space-y-2">
        {owners.map((owner, i) => (
          <div key={i} className="group flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="0x owner address"
                value={owner}
                onChange={(e) => update(i, e.target.value.trim())}
                className="h-10 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 pr-9 font-mono text-[10px] text-white outline-none transition placeholder:text-white/30 focus:border-salvaGold/50 focus:bg-white/[.05] sm:h-12 sm:px-4 sm:text-xs"
              />

              {owner && (
                <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-salvaGold sm:right-3">
                  <Icon name="check" size={12} />
                </span>
              )}
            </div>

            {owners.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="h-10 w-9 flex-shrink-0 rounded-xl border border-white/10 text-white/40 transition hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 sm:h-12 sm:w-11"
              >
                <Icon name="x" size={14} className="mx-auto" />
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[9px] font-semibold text-white/70 transition hover:border-salvaGold/30 hover:bg-salvaGold/5 hover:text-salvaGold sm:mt-3 sm:gap-2 sm:px-3 sm:py-2 sm:text-[11px]"
      >
        <Icon name="plus" size={12} />
        Add owner
      </button>

      <Hint>Owners control names issued under this namespace.</Hint>
    </div>
  );
};

const NamespaceSelect = ({ namespaces, value, onChange }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selected = namespaces.find((n) => n.namespace === value) || namespaces[0];

  useEffect(() => {
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutside);

    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:text-[10px]">
        Namespace
      </label>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 w-full items-center justify-between rounded-xl border px-3 text-left transition sm:h-14 sm:px-4 ${
          open
            ? 'border-salvaGold/55 bg-white/[.05]'
            : 'border-white/10 bg-white/[.035] hover:border-white/20'
        }`}
      >
        <span className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-salvaGold/10 text-salvaGold sm:h-8 sm:w-8">
            <Icon name="layers" size={14} />
          </span>

          <span className="min-w-0">
            <span className="block truncate font-mono text-[11px] font-semibold text-white sm:text-sm">
              {selected?.namespace || 'Select namespace'}
            </span>

            <span className="mt-0.5 block text-[8px] text-white/60 sm:text-[10px]">
              Namespace you control
            </span>
          </span>
        </span>

        <span
          className={`flex-shrink-0 text-white/45 transition-transform ${
            open ? 'rotate-180 text-salvaGold' : ''
          }`}
        >
          <Icon name="chevron" size={15} />
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{
              opacity: 0,
              y: 5,
              scale: 0.99,
            }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
            }}
            exit={{
              opacity: 0,
              y: 5,
              scale: 0.99,
            }}
            className="absolute left-0 right-0 top-[calc(100%+7px)] z-50 overflow-hidden rounded-xl border border-white/10 bg-[#151517] p-1.5 shadow-[0_25px_70px_rgba(0,0,0,.65)]"
          >
            {namespaces.map((n, i) => {
              const active = n.namespace === value;

              return (
                <button
                  type="button"
                  key={n.namespace + i}
                  onClick={() => {
                    onChange(n.namespace);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2.5 text-left transition sm:px-3 sm:py-3 ${
                    active
                      ? 'bg-salvaGold/10 text-salvaGold'
                      : 'text-white/75 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2 sm:gap-3">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        active ? 'bg-salvaGold' : 'bg-white/20'
                      }`}
                    />

                    <span className="font-mono text-[10px] font-semibold sm:text-xs">
                      {n.namespace}
                    </span>
                  </span>

                  {active && <Icon name="check" size={13} />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <Hint>Only namespaces you control are available.</Hint>
    </div>
  );
};

// Set to false to bring the page back.
const COMING_SOON = true;

const ComingSoon = () => {
  const navigate = useNavigate();

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const goBack = () => {
    if (window.history.state?.idx > 0) {
      navigate(-1);
    } else {
      navigate('/dashboard', { replace: true });
    }
  };

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label="Coming soon"
      className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-[#08090c]/95 p-6 backdrop-blur-xl"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-salvaGold/[0.08] blur-[110px]" />

      <motion.div
        className="relative w-full max-w-sm text-center"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-salvaGold/25 bg-salvaGold/10 text-salvaGold">
          <Icon name="layers" size={26} />
        </div>

        <h2 className="mt-7 text-3xl font-semibold tracking-[-0.03em] text-white sm:text-4xl">
          Coming soon
        </h2>

        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/60">
          Names and namespaces are on the way. Check back shortly.
        </p>

        <button
          type="button"
          onClick={goBack}
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-salvaGold px-6 py-3 text-xs font-semibold text-black transition hover:brightness-110 active:scale-[.98]"
        >
          <Icon name="back" size={14} />
          Go back
        </button>
      </motion.div>
    </motion.div>
  );
};

const LinkNamePage = () => {
  const navigate = useNavigate();

  const [user] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('salva_user') || 'null');

      return saved?.email ? saved : null;
    } catch {
      return null;
    }
  });

  const chain = 'base';

  // Painted straight from cache on first render. No spinner when a cache exists.
  const [snap, setSnap] = useState(() => (user?.email ? readSnsCache(user.email, chain) : null));
  const [loadingRecord, setLoadingRecord] = useState(() => !snap);
  const [refreshingRecord, setRefreshingRecord] = useState(false);

  const [notification, setNotification] = useState({
    show: false,
    message: '',
    type: '',
  });

  const showMsg = useCallback(
    (message, type = 'success') =>
      setNotification({
        show: true,
        message,
        type,
      }),
    []
  );

  const closeNotif = useCallback(
    () =>
      setNotification((n) => ({
        ...n,
        show: false,
      })),
    []
  );

  const [activeSection, setActiveSection] = useState('overview');

  useEffect(() => {
    if (!user?.email) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  const mountedRef = useRef(true);
  const inflightRef = useRef(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      inflightRef.current?.abort();
    };
  }, []);

  // UI state is ONLY ever filled from the cache.
  const readIntoUI = useCallback(() => {
    if (!user?.email || !mountedRef.current) return;
    setSnap(readSnsCache(user.email, chain));
  }, [user?.email]);

  // Network -> cache -> UI. Silent unless `manual` (the refresh button).
  const fetchRecord = useCallback(
    async ({ force = false, manual = false } = {}) => {
      if (!user?.email) return false;
      if (inflightRef.current && !force) return false;
      if (inflightRef.current && force) inflightRef.current.abort();

      const controller = new AbortController();
      inflightRef.current = controller;
      if (manual) setRefreshingRecord(true);

      try {
        await fetchSnsSnapshot(user.email, chain, { signal: controller.signal });
        if (mountedRef.current) readIntoUI();
        return true;
      } catch {
        // Keep showing the cached data; the next poll retries.
        return false;
      } finally {
        const isLatest = inflightRef.current === controller;
        if (isLatest) inflightRef.current = null;
        if (mountedRef.current && isLatest) {
          setLoadingRecord(false);
          setRefreshingRecord(false);
        }
      }
    },
    [user?.email, readIntoUI]
  );

  // Initial read from cache, then silent poll every 20s (only while the tab is visible).
  useEffect(() => {
    if (!user?.email) return undefined;

    readIntoUI();
    fetchRecord();

    const tick = () => {
      if (document.visibilityState === 'visible') fetchRecord();
    };

    const timer = setInterval(tick, SNS_POLL_INTERVAL_MS);
    document.addEventListener('visibilitychange', tick);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [fetchRecord, readIntoUI, user?.email]);

  const namespaces = useMemo(() => snap?.namespaces || [], [snap?.namespaces]);

  const nameAliases = useMemo(() => snap?.nameAliases || [], [snap?.nameAliases]);

  const [nsInput, setNsInput] = useState('@');
  const [owners, setOwners] = useState(['']);
  const [nsIsReinit, setNsIsReinit] = useState(false);
  const [nsSubmitting, setNsSubmitting] = useState(false);

  const submitNamespaceRequest = async () => {
    const namespace = nsInput.trim();

    const cleanedOwners = owners.map((o) => o.trim()).filter(Boolean);

    if (!namespace || namespace === '@') {
      return showMsg('Enter the namespace you want to initialize', 'error');
    }

    if (!namespace.startsWith('@')) {
      return showMsg('Namespace must start with "@" (e.g. @yourname)', 'error');
    }

    if (cleanedOwners.length === 0) {
      return showMsg('Add at least one owner address', 'error');
    }

    setNsSubmitting(true);

    try {
      const res = await fetch(`${SALVA_API_URL}/api/user/namespaceInitRequest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: nsIsReinit ? 'reinit' : 'init',
          safeAddress: user.safeAddress,
          namespace,
          owners: cleanedOwners,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status) {
        showMsg('Request submitted. Your namespace will appear here once approved.');

        setNsInput('@');
        setOwners(['']);
        setNsIsReinit(false);
      } else {
        showMsg(data.errorMsg || 'Could not submit request. Try again.', 'error');
      }
    } catch {
      showMsg('Network error submitting request', 'error');
    } finally {
      setNsSubmitting(false);
    }
  };

  const [nameInput, setNameInput] = useState('');
  const [addressInput, setAddressInput] = useState('');
  const [selectedNs, setSelectedNs] = useState('');
  const [checking, setChecking] = useState(false);
  const [linkStep, setLinkStep] = useState('form');
  const [pinLoading, setPinLoading] = useState(false);

  const [pendingLink, setPendingLink] = useState({
    name: '',
    address: '',
  });

  useEffect(() => {
    if (!selectedNs && namespaces[0]?.namespace) {
      setSelectedNs(namespaces[0].namespace);
    }
  }, [namespaces, selectedNs]);

  const usingFullName = isFullName(nameInput);

  const effectiveWelded = usingFullName ? nameInput.trim() : weld(nameInput, selectedNs);

  const handleCheckAndContinue = async () => {
    const welded = usingFullName ? nameInput.trim() : weld(nameInput, selectedNs);

    const address = addressInput.trim();

    if (!welded || !welded.includes('@')) {
      return showMsg('Enter a name and select a namespace', 'error');
    }

    if (!usingFullName && !selectedNs) {
      return showMsg('Select which of your namespaces this name belongs to', 'error');
    }

    if (!address) {
      return showMsg('Enter the address this name should link to', 'error');
    }

    setChecking(true);

    try {
      const res = await fetch(`${SALVA_API_URL}/api/name/isAvail/${encodeURIComponent(welded)}`);

      const data = await res.json();

      const zero = '0x0000000000000000000000000000000000000000';

      if (data.status && data.address && data.address.toLowerCase() !== zero) {
        showMsg(`"${welded}" is already linked to an address.`, 'error');
        return;
      }

      setPendingLink({
        name: welded,
        address,
      });

      setLinkStep('pin');
    } catch (err) {
      showMsg(err.message || 'Could not check availability. Try again.', 'error');
    } finally {
      setChecking(false);
    }
  };

  const executeLink = async (pin) => {
    setPinLoading(true);

    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          pin,
        }),
      });

      const pinData = await pinRes.json();

      if (!pinRes.ok || !pinData.success) {
        showMsg(pinData.message || 'Invalid PIN', 'error');

        setPinLoading(false);
        return;
      }

      setLinkStep('linking');

      console.log(pendingLink);

      const res = await fetch(`${SALVA_API_URL}/api/user/link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          safeAddress: user.safeAddress,
          pin,
          name: pendingLink.name,
          address: pendingLink.address,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status) {
        showMsg(`"${pendingLink.name}" linked successfully!`);

        setNameInput('');
        setAddressInput('');

        setPendingLink({
          name: '',
          address: '',
        });

        setLinkStep('form');

        await fetchRecord({ force: true });
      } else {
        showMsg(data.errorMsg || 'Linking failed', 'error');

        setLinkStep('form');
      }
    } catch (err) {
      showMsg(err.message || 'Network error while linking', 'error');

      setLinkStep('form');
    } finally {
      setPinLoading(false);
    }
  };

  const [unlinkTarget, setUnlinkTarget] = useState(null);
  const [unlinkLoading, setUnlinkLoading] = useState(false);

  const executeUnlink = async (pin) => {
    if (!unlinkTarget) return;

    setUnlinkLoading(true);

    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          pin,
        }),
      });

      const pinData = await pinRes.json();

      if (!pinRes.ok || !pinData.success) {
        showMsg(pinData.message || 'Invalid PIN', 'error');

        setUnlinkLoading(false);
        return;
      }

      const res = await fetch(`${SALVA_API_URL}/api/user/unlink`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: user.email,
          safeAddress: user.safeAddress,
          fullName: unlinkTarget.name,
          pin,
        }),
      });

      const data = await res.json();

      if (res.ok && data.status) {
        showMsg(`"${unlinkTarget.name}" unlinked.`);

        setUnlinkTarget(null);

        await fetchRecord({ force: true });
      } else {
        showMsg(data.errorMsg || 'Unlink failed', 'error');
      }
    } catch {
      showMsg('Network error during unlink', 'error');
    } finally {
      setUnlinkLoading(false);
    }
  };

  if (!user) return null;

  const inputClass =
    'w-full rounded-xl border border-white/[.10] bg-white/[.035] px-3 text-[11px] font-medium text-white outline-none transition placeholder:text-white/30 focus:border-salvaGold/55 focus:bg-white/[.05] sm:px-4 sm:text-sm';

  const actionClass =
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-salvaGold px-4 py-2.5 text-[10px] font-semibold text-black transition hover:brightness-110 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-35 sm:gap-2 sm:px-5 sm:py-3 sm:text-xs';

  return (
    <div className="relative min-h-screen overflow-x-hidden text-white">
      <Stars />
      {COMING_SOON && <ComingSoon />}

      <main
        className="
          relative
          z-10
          mx-auto
          -mt-1
          w-full
          max-w-5xl
          px-2.5
          pb-16
          pt-1
          sm:-mt-4
          sm:px-6
          sm:pb-20
          sm:pt-8
          lg:-mt-5
        "
      >
        {/* HEADER */}
        <header className="mb-4 sm:mb-6">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[7px] font-semibold uppercase tracking-[.2em] text-salvaGold sm:text-[9px]">
                Salva Naming Service
              </span>

              <span className="h-1 w-1 rounded-full bg-white/20" />

              <span className="font-mono text-[7px] text-white/45 sm:text-[9px]">v2.1.1</span>
            </div>

            <h1 className="mt-0.5 text-[17px] font-semibold tracking-[-.03em] text-white sm:mt-1 sm:text-[26px]">
              Names & namespaces
            </h1>
          </div>
        </header>

        {/* NAV */}
        <div className="mb-5 border-b border-white/[.08] sm:mb-7">
          <div className="flex gap-4 sm:gap-7">
            {[
              {
                id: 'overview',
                label: 'Overview',
              },
              {
                id: 'request',
                label: 'Get namespace',
              },
              {
                id: 'link',
                label: 'Link a name',
              },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                className={`relative pb-2.5 text-[9px] font-semibold transition sm:pb-3 sm:text-xs ${
                  activeSection === s.id ? 'text-white' : 'text-white/50 hover:text-white/80'
                }`}
              >
                {s.label}

                {activeSection === s.id && (
                  <motion.span
                    layoutId="active-tab"
                    className="absolute bottom-[-1px] left-0 right-0 h-px bg-salvaGold"
                    transition={{
                      type: 'spring',
                      stiffness: 400,
                      damping: 32,
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* OVERVIEW */}
          {activeSection === 'overview' && (
            <motion.section
              key="overview"
              initial={{
                opacity: 0,
                y: 6,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: -6,
              }}
              transition={{ duration: 0.16 }}
            >
              <SectionHeader
                eyebrow="Identity"
                title="Your SNS identity"
                description="Namespaces and names controlled by your account."
                action={
                  <button
                    onClick={() => fetchRecord({ force: true, manual: true })}
                    disabled={refreshingRecord}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[.025] px-2.5 py-1.5 text-[8px] font-semibold text-white/60 transition hover:border-white/20 hover:text-white sm:gap-2 sm:px-3 sm:py-2 sm:text-[10px]"
                  >
                    <Icon name="refresh" size={11} />

                    <span className="hidden sm:inline">
                      {refreshingRecord ? 'Refreshing' : 'Refresh'}
                    </span>
                  </button>
                }
              />

              <div className="grid gap-3 lg:grid-cols-[.85fr_1.15fr] lg:gap-4">
                {/* NAMESPACES */}
                <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#101012]/90 shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl">
                  <div className="flex items-center justify-between border-b border-white/[.07] px-3 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-salvaGold/10 text-salvaGold sm:h-8 sm:w-8">
                        <Icon name="layers" size={14} />
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold text-white sm:text-xs">
                          Namespaces
                        </p>

                        <p className="mt-0.5 text-[8px] text-white/60 sm:text-[10px]">
                          Namespace ownership
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-[8px] text-white/55 sm:text-[10px]">
                      {namespaces.length}
                    </span>
                  </div>

                  <div className="p-3 sm:p-5">
                    {loadingRecord ? (
                      <div className="space-y-2">
                        <div className="h-9 animate-pulse rounded-xl bg-white/5 sm:h-11" />
                        <div className="h-9 animate-pulse rounded-xl bg-white/5 sm:h-11" />
                      </div>
                    ) : namespaces.length === 0 ? (
                      <div className="py-6 text-center sm:py-7">
                        <p className="text-[11px] font-medium text-white sm:text-sm">
                          No namespace yet
                        </p>

                        <p className="mt-1 text-[9px] text-white/60 sm:text-xs">
                          Request one to start issuing names.
                        </p>

                        <button
                          onClick={() => setActiveSection('request')}
                          className="mt-3 text-[9px] font-semibold text-salvaGold hover:underline sm:mt-4 sm:text-xs"
                        >
                          Get a namespace →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {namespaces.map((n, i) => (
                          <motion.div
                            key={n.namespace + i}
                            initial={{
                              opacity: 0,
                              y: 4,
                            }}
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            transition={{
                              delay: i * 0.035,
                            }}
                            className="flex items-center justify-between rounded-lg border border-white/[.07] bg-white/[.025] px-3 py-2.5 transition hover:border-salvaGold/20 hover:bg-salvaGold/[.025] sm:rounded-xl sm:px-3.5 sm:py-3"
                          >
                            <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-salvaGold shadow-[0_0_8px_rgba(212,175,55,.45)]" />

                              <span className="truncate font-mono text-[11px] font-semibold text-white sm:text-sm">
                                {n.namespace}
                              </span>
                            </div>

                            <span className="text-[8px] text-white/50 sm:text-[10px]">
                              namespace
                            </span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* LINKED NAMES */}
                <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#101012]/90 shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl">
                  <div className="flex items-center justify-between border-b border-white/[.07] px-3 py-3 sm:px-5 sm:py-4">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-white/70 sm:h-8 sm:w-8">
                        <Icon name="link" size={14} />
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold text-white sm:text-xs">
                          Linked names
                        </p>

                        <p className="mt-0.5 text-[8px] text-white/60 sm:text-[10px]">
                          Human-readable addresses
                        </p>
                      </div>
                    </div>

                    <span className="font-mono text-[8px] text-white/55 sm:text-[10px]">
                      {nameAliases.length}
                    </span>
                  </div>

                  <div className="p-3 sm:p-5">
                    {loadingRecord ? (
                      <div className="space-y-2">
                        <div className="h-11 animate-pulse rounded-xl bg-white/5 sm:h-14" />
                        <div className="h-11 animate-pulse rounded-xl bg-white/5 sm:h-14" />
                      </div>
                    ) : nameAliases.length === 0 ? (
                      <div className="py-6 text-center sm:py-7">
                        <p className="text-[11px] font-medium text-white sm:text-sm">
                          No names linked yet
                        </p>

                        <p className="mt-1 text-[9px] text-white/60 sm:text-xs">
                          Link your first name to an address.
                        </p>

                        <button
                          onClick={() => setActiveSection('link')}
                          className="mt-3 text-[9px] font-semibold text-salvaGold hover:underline sm:mt-4 sm:text-xs"
                        >
                          Link a name →
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {nameAliases.map((alias, i) => (
                          <motion.div
                            key={alias.name + i}
                            initial={{
                              opacity: 0,
                              y: 4,
                            }}
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            transition={{
                              delay: i * 0.035,
                            }}
                            className="group flex items-center justify-between gap-2.5 rounded-lg border border-white/[.07] bg-white/[.025] px-3 py-2.5 transition hover:border-white/[.14] hover:bg-white/[.04] sm:gap-3 sm:rounded-xl sm:px-3.5 sm:py-3"
                          >
                            <div className="min-w-0">
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(alias.name);
                                  showMsg('Name copied!');
                                }}
                                className="block max-w-full truncate text-left font-mono text-[11px] font-semibold text-salvaGold hover:opacity-80 sm:text-sm"
                              >
                                {alias.name}
                              </button>

                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(alias.wallet);
                                  showMsg('Wallet address copied!');
                                }}
                                className="mt-1 flex max-w-full items-center gap-1 font-mono text-[8px] text-white/60 hover:text-white/80 sm:gap-1.5 sm:text-[10px]"
                              >
                                {shortAddr(alias.wallet)}
                                <Icon name="copy" size={9} />
                              </button>
                            </div>

                            <button
                              onClick={() => setUnlinkTarget(alias)}
                              className="shrink-0 rounded-lg border border-white/[.08] px-2 py-1 text-[8px] font-semibold text-white/55 transition hover:border-red-500/25 hover:bg-red-500/10 hover:text-red-400 sm:px-2.5 sm:py-1.5 sm:text-[10px]"
                            >
                              Unlink
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </motion.section>
          )}

          {/* REQUEST NAMESPACE */}
          {activeSection === 'request' && (
            <motion.section
              key="request"
              initial={{
                opacity: 0,
                y: 6,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: -6,
              }}
              transition={{ duration: 0.16 }}
            >
              <SectionHeader
                eyebrow="Namespace"
                title="Get a namespace"
                description="Create a namespace you control and issue names beneath it."
              />

              <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#101012]/90 shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl">
                <div className="border-b border-white/[.07] px-3 py-3 sm:px-6 sm:py-4">
                  <div className="flex items-center gap-2.5 sm:gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-salvaGold/10 text-salvaGold sm:h-9 sm:w-9">
                      <Icon name="layers" size={15} />
                    </div>

                    <div>
                      <p className="text-[11px] font-semibold text-white sm:text-sm">
                        Namespace ownership
                      </p>

                      <p className="mt-0.5 text-[9px] text-white/65 sm:text-[11px]">
                        Choose the namespace and addresses that control it.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-5 p-3 sm:space-y-6 sm:p-6">
                  {/* NAMESPACE */}
                  <div>
                    <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:mb-2.5 sm:text-[10px]">
                      Namespace
                    </label>

                    <input
                      type="text"
                      value={nsInput}
                      onChange={(e) => {
                        let v = e.target.value;

                        if (!v.startsWith('@')) {
                          v = `@${v.replace(/@/g, '')}`;
                        } else {
                          v = `@${v.slice(1).replace(/@/g, '')}`;
                        }

                        setNsInput(v.slice(0, 32));
                      }}
                      placeholder="@yourbrand"
                      className={`${inputClass} h-12 sm:h-14`}
                    />

                    <Hint>Must start with @ and be 32 characters or fewer.</Hint>
                  </div>

                  <OwnersField owners={owners} setOwners={setOwners} />

                  <div className="border-t border-white/[.07] pt-4 sm:pt-5">
                    <label className="flex cursor-pointer items-start gap-2.5 sm:gap-3">
                      <input
                        type="checkbox"
                        checked={nsIsReinit}
                        onChange={(e) => setNsIsReinit(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-salvaGold sm:h-4 sm:w-4"
                      />

                      <span>
                        <span className="block text-[10px] font-semibold text-white sm:text-xs">
                          Re-initialize an existing namespace
                        </span>

                        <span className="mt-1 block text-[9px] leading-4 text-white/60 sm:text-[11px] sm:leading-5">
                          Only use this if you already own the exact namespace. Re-initialization
                          clears existing records.
                        </span>
                      </span>
                    </label>
                  </div>

                  <button
                    onClick={submitNamespaceRequest}
                    disabled={nsSubmitting}
                    className={`${actionClass} w-full py-3 sm:py-3.5`}
                  >
                    {nsSubmitting
                      ? 'Submitting…'
                      : nsIsReinit
                      ? 'Submit re-initialization request'
                      : 'Request namespace'}
                  </button>

                  <p className="text-center text-[9px] text-white/60 sm:text-[11px]">
                    Requests are reviewed before a namespace appears in your account.
                  </p>
                </div>
              </div>
            </motion.section>
          )}

          {/* LINK NAME */}
          {activeSection === 'link' && (
            <motion.section
              key="link"
              initial={{
                opacity: 0,
                y: 6,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              exit={{
                opacity: 0,
                y: -6,
              }}
              transition={{ duration: 0.16 }}
            >
              <SectionHeader
                eyebrow="Name registry"
                title="Link a name"
                description="Point a human-readable name to any wallet address."
              />

              {namespaces.length === 0 ? (
                <div className="rounded-xl border border-white/[.08] bg-[#101012]/90 p-8 text-center shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl sm:p-12">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-salvaGold/10 text-salvaGold sm:h-12 sm:w-12">
                    <Icon name="layers" size={17} />
                  </div>

                  <h3 className="mt-4 text-[11px] font-semibold text-white sm:mt-5 sm:text-sm">
                    No namespace available
                  </h3>

                  <p className="mx-auto mt-1.5 max-w-sm text-[9px] leading-4 text-white/65 sm:mt-2 sm:text-xs sm:leading-5">
                    You need a namespace before you can link names.
                  </p>

                  <button
                    onClick={() => setActiveSection('request')}
                    className={`${actionClass} mt-4 sm:mt-5`}
                  >
                    Get namespace
                    <Icon name="arrow" size={12} />
                  </button>
                </div>
              ) : linkStep === 'form' ? (
                <div className="overflow-hidden rounded-xl border border-white/[.08] bg-[#101012]/90 shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl">
                  <div className="border-b border-white/[.07] px-3 py-3 sm:px-6 sm:py-4">
                    <div className="flex items-center gap-2.5 sm:gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-salvaGold/10 text-salvaGold sm:h-9 sm:w-9">
                        <Icon name="link" size={14} />
                      </div>

                      <div>
                        <p className="text-[11px] font-semibold text-white sm:text-sm">
                          Create a name record
                        </p>

                        <p className="mt-0.5 text-[9px] text-white/65 sm:text-[11px]">
                          Link a name to the address you want it to resolve to.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 p-3 sm:space-y-5 sm:p-6">
                    {/* NAME */}
                    <div>
                      <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:mb-2.5 sm:text-[10px]">
                        Name
                      </label>

                      <input
                        type="text"
                        value={nameInput}
                        onChange={(e) => setNameInput(e.target.value)}
                        placeholder="alice or alice@yourbrand"
                        className={`${inputClass} h-11 font-mono sm:h-14`}
                      />

                      <Hint>
                        Enter a name only, or provide the complete name including @namespace.
                      </Hint>
                    </div>

                    {/* NAMESPACE */}
                    {!usingFullName && (
                      <NamespaceSelect
                        namespaces={namespaces}
                        value={selectedNs}
                        onChange={setSelectedNs}
                      />
                    )}

                    {/* ADDRESS */}
                    <div>
                      <label className="mb-2 block text-[9px] font-semibold uppercase tracking-[.18em] text-white/55 sm:mb-2.5 sm:text-[10px]">
                        Address
                      </label>

                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => setAddressInput(e.target.value)}
                        placeholder="0x wallet address"
                        className={`${inputClass} h-11 font-mono sm:h-14`}
                      />

                      <Hint>The wallet address this name will resolve to.</Hint>
                    </div>

                    {/* PREVIEW */}
                    <AnimatePresence mode="wait">
                      {effectiveWelded && (
                        <motion.div
                          key={effectiveWelded}
                          initial={{
                            opacity: 0,
                            y: -4,
                          }}
                          animate={{
                            opacity: 1,
                            y: 0,
                          }}
                          exit={{
                            opacity: 0,
                            y: -4,
                          }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden rounded-xl border border-salvaGold/15 bg-salvaGold/[.035]"
                        >
                          <div className="border-b border-salvaGold/10 px-3 py-2 sm:px-4 sm:py-2.5">
                            <span className="text-[8px] font-semibold uppercase tracking-[.18em] text-white/55 sm:text-[9px]">
                              Resolution preview
                            </span>
                          </div>

                          <div className="px-3 py-3 sm:px-4 sm:py-4">
                            <p className="break-all font-mono text-base font-semibold tracking-tight text-salvaGold sm:text-xl">
                              {effectiveWelded}
                            </p>

                            {addressInput && (
                              <div className="mt-1.5 flex items-start gap-1.5 sm:mt-2 sm:gap-2">
                                <span className="mt-0.5 text-white/45">→</span>

                                <p className="break-all font-mono text-[9px] leading-4 text-white/70 sm:text-[11px] sm:leading-5">
                                  {addressInput}
                                </p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* SUBMIT */}
                    <button
                      onClick={handleCheckAndContinue}
                      disabled={checking || !effectiveWelded || !addressInput.trim()}
                      className={`${actionClass} w-full py-3 sm:py-3.5`}
                    >
                      {checking ? (
                        <>
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                          Checking availability…
                        </>
                      ) : (
                        <>
                          Check availability
                          <Icon name="arrow" size={12} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-white/[.08] bg-[#101012]/90 p-8 text-center shadow-[0_12px_45px_rgba(0,0,0,.16)] sm:rounded-2xl sm:p-12">
                  <div className="relative mx-auto h-12 w-12 sm:h-14 sm:w-14">
                    <div className="absolute inset-0 rounded-full border border-salvaGold/10" />

                    <div className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-salvaGold" />
                  </div>

                  <h3 className="mt-5 text-[11px] font-semibold text-white sm:mt-6 sm:text-sm">
                    Linking on-chain…
                  </h3>

                  <p className="mt-1.5 break-all font-mono text-[9px] text-white/65 sm:mt-2 sm:text-[11px]">
                    {pendingLink.name}
                  </p>

                  <p className="mt-1 text-[9px] text-white/50 sm:text-[11px]">
                    Usually takes 30–60 seconds
                  </p>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {linkStep === 'pin' && (
          <PinModal
            key="link-pin"
            zClass="z-[100]"
            loading={pinLoading}
            onCancel={() => setLinkStep('form')}
            onVerified={executeLink}
          />
        )}

        {unlinkTarget && (
          <PinModal
            key="unlink-pin"
            zClass="z-[100]"
            loading={unlinkLoading}
            onCancel={() => setUnlinkTarget(null)}
            onVerified={executeUnlink}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification.show && <Notif notification={notification} onClose={closeNotif} />}
      </AnimatePresence>
    </div>
  );
};

export default LinkNamePage;
