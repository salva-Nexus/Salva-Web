import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const LOCAL_LOGOS = {
  NGNS: ngnLogo,
  SANT: santLogo,
};

const formatNumber = (value, { minDecimals = 0, maxDecimals = 6 } = {}) => {
  if (value === null || value === undefined || value === '') return '0';

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

const formatAmountInput = (raw) => {
  const cleaned = String(raw ?? '').replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join('')}` : parts[0];
};

const getAssetBalance = (asset) =>
  asset?.balance ?? asset?.userBalance ?? asset?.balanceFormatted ?? asset?.tokenBalance ?? '0';

const getAssetAddress = (asset) =>
  asset?.contractAddress ?? asset?.tokenAddress ?? asset?.address ?? null;

const getAssetUsdPrice = (asset) => {
  const n = Number(asset?.usdPrice);
  return Number.isFinite(n) ? n : 0;
};

const getAssetNgnRate = (asset) => {
  const n = Number(asset?.ngnRate);
  return Number.isFinite(n) ? n : 0;
};

// Trims a fixed-decimal numeric string down to the shortest form that still
// round-trips, e.g. "12.50000000" -> "12.5", "12.00000000" -> "12".
const trimTrailingZeros = (str) => {
  if (!str.includes('.')) return str;
  return str.replace(/0+$/, '').replace(/\.$/, '');
};

const AssetLogo = ({ asset, size = 'w-10 h-10' }) => {
  const logo = LOCAL_LOGOS[asset?.symbol] || asset?.logo || asset?.logoURI || asset?.image;
  const [broken, setBroken] = useState(false);

  useEffect(() => setBroken(false), [logo]);

  return (
    <div
      className={`${size} rounded-full bg-white/[0.06] border border-white/10 flex items-center justify-center overflow-hidden shrink-0`}
    >
      {logo && !broken ? (
        <img
          src={logo}
          alt={asset?.symbol || 'Token'}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
          style={
            asset?.symbol === 'NGNS'
              ? { objectPosition: '48% 60%', transform: 'scale(2)' }
              : undefined
          }
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="text-[10px] font-black text-salvaGold">
          {asset?.symbol?.slice(0, 3) || 'TOK'}
        </span>
      )}
    </div>
  );
};

const Spinner = ({ small = false }) => (
  <span
    className={`${
      small ? 'w-3 h-3' : 'w-4 h-4'
    } border-2 border-salvaGold/25 border-t-salvaGold rounded-full animate-spin inline-block`}
  />
);

const StepHeader = ({ eyebrow, title, description, onBack }) => (
  <div className="mb-5 sm:mb-7">
    <div className="flex items-center justify-between gap-3 mb-4">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.03] flex items-center justify-center text-white/50 hover:text-white transition-colors"
          aria-label="Back"
        >
          ←
        </button>
      ) : (
        <span className="w-9 h-9" />
      )}

      <div className="flex items-center gap-1.5">
        <span className="w-1.5 h-1.5 rounded-full bg-salvaGold" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
        <span className="w-1.5 h-1.5 rounded-full bg-white/15" />
      </div>

      <span className="w-9 h-9" />
    </div>

    <p className="text-[8px] sm:text-[9px] uppercase tracking-[.35em] text-salvaGold/65 font-black">
      {eyebrow}
    </p>
    <h2 className="text-xl sm:text-2xl font-black tracking-tight mt-1">{title}</h2>
    <p className="text-[10px] sm:text-xs text-white/40 mt-1.5 leading-relaxed">{description}</p>
  </div>
);

const PinStep = ({ user, onVerified, onCancel, requestJson }) => {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);

  const verify = useCallback(async () => {
    if (!/^\d{4}$/.test(pin) || loading) return;

    setLoading(true);

    try {
      const data = await requestJson(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin,
        }),
      });

      if (!data?.success) {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        setPin('');

        if (nextAttempts >= 3) {
          onCancel('Too many failed attempts — redirecting to settings');
        }

        return;
      }

      onVerified(pin);
    } catch (error) {
      setPin('');
      onCancel(error?.message || 'Could not verify PIN');
    } finally {
      setLoading(false);
    }
  }, [attempts, loading, onCancel, onVerified, pin, requestJson, user?.email]);

  return (
    <div>
      <StepHeader
        eyebrow="Security"
        title="Verify your PIN"
        description="Your PIN is verified before any transfer details are entered."
      />

      <div className="rounded-[24px] border border-salvaGold/15 bg-salvaGold/[0.045] p-4 sm:p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-salvaGold/10 border border-salvaGold/20 flex items-center justify-center">
            <span className="text-salvaGold text-lg">⌁</span>
          </div>
          <div>
            <p className="text-xs font-black">Private signing access</p>
            <p className="text-[9px] sm:text-[10px] text-white/35 mt-0.5">
              Your signing key remains in memory for this transfer only.
            </p>
          </div>
        </div>
      </div>

      <label className="block text-[8px] uppercase tracking-[.25em] text-white/35 font-black mb-2">
        4-digit transaction PIN
      </label>

      <input
        autoFocus
        type="password"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(event) => setPin(event.target.value.replace(/\D/g, ''))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') verify();
        }}
        placeholder="••••"
        className="w-full h-14 sm:h-16 rounded-2xl bg-white/[0.04] border border-white/10 focus:border-salvaGold/50 outline-none text-center text-2xl sm:text-3xl tracking-[.65em] font-black transition-colors"
      />

      {attempts > 0 && attempts < 3 && (
        <p className="text-[9px] text-red-400 font-bold text-center mt-2">
          Incorrect PIN · {3 - attempts} attempt{3 - attempts === 1 ? '' : 's'} remaining
        </p>
      )}

      <div className="flex gap-2 mt-5">
        <button
          type="button"
          onClick={() => onCancel()}
          disabled={loading}
          className="flex-1 h-12 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/55 hover:text-white disabled:opacity-40"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={verify}
          disabled={loading || pin.length !== 4}
          className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-35 flex items-center justify-center gap-2"
        >
          {loading ? <Spinner small /> : null}
          {loading ? 'Verifying…' : 'Continue'}
        </button>
      </div>
    </div>
  );
};

const TokenPicker = ({ assets, showBalance, selectedChain, onSelect, onCancel }) => (
  <div>
    <StepHeader
      eyebrow="Send"
      title="Choose an asset"
      description={`Select the token you want to send on ${selectedChain}.`}
      onBack={onCancel}
    />

    <div className="space-y-2 max-h-[52vh] overflow-y-auto pr-0.5">
      {assets.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-white/[0.07] bg-white/[0.02]">
          <p className="text-sm font-black text-white/60">No assets available</p>
          <p className="text-[10px] text-white/25 mt-1">
            There are no transferable assets on this network.
          </p>
        </div>
      ) : (
        assets.map((asset) => (
          <button
            key={asset._key || `${asset.symbol}-${asset.contractAddress}`}
            type="button"
            onClick={() => onSelect(asset)}
            className="w-full flex items-center gap-3 p-3.5 sm:p-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] hover:border-salvaGold/25 hover:bg-salvaGold/[0.035] text-left transition-all group"
          >
            <AssetLogo asset={asset} size="w-10 h-10 sm:w-11 sm:h-11" />

            <div className="min-w-0 flex-1">
              <p className="font-black text-xs sm:text-sm">{asset.symbol}</p>
              <p className="text-[9px] text-white/30 capitalize mt-0.5">
                {asset.chain || selectedChain}
              </p>
            </div>

            <div className="text-right">
              <p className="font-black text-xs sm:text-sm">
                {showBalance ? formatNumber(getAssetBalance(asset), { maxDecimals: 8 }) : '••••'}
              </p>
              <p className="text-[8px] text-white/25 mt-0.5">{asset.symbol}</p>
            </div>

            <span className="text-white/15 group-hover:text-salvaGold transition-colors">›</span>
          </button>
        ))
      )}
    </div>

    <button
      type="button"
      onClick={onCancel}
      className="w-full mt-4 h-11 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/45 hover:text-white"
    >
      Cancel
    </button>
  </div>
);

const SendForm = ({
  asset,
  selectedChain,
  showBalance,
  privateKey,
  user,
  requestJson,
  onBack,
  onClose,
  showMsg,
  onSuccess,
  initialRecipient = '',
}) => {
  const [recipientInput, setRecipientInput] = useState('');
  const [recipientType, setRecipientType] = useState('empty');
  const [resolvedAddress, setResolvedAddress] = useState('');
  const [resolveState, setResolveState] = useState('idle');
  const [resolveMessage, setResolveMessage] = useState('');

  // `amount` is ALWAYS the underlying asset quantity (token units) — the
  // single source of truth used for balance checks, fee estimation, and the
  // transfer submission itself, no matter which unit the person is typing
  // in below. `amountDisplay` mirrors it for the legacy no-pricing path.
  const [amount, setAmount] = useState('');
  const [amountDisplay, setAmountDisplay] = useState('');

  // MetaMask-style unit toggle. Only meaningful when the asset has a known
  // USD price — 'asset' | 'ngn' | 'usd'. `fieldValue`/`fieldDisplay` hold
  // whatever the person is actually typing, in the CURRENT mode's unit.
  const [amountMode, setAmountMode] = useState('asset');
  const [fieldValue, setFieldValue] = useState('');
  const [fieldDisplay, setFieldDisplay] = useState('');

  const [fee, setFee] = useState({
    feeNGN: 0,
    feeUsd: 0,
    loading: false,
    error: false,
  });

  const [showConfirmation, setShowConfirmation] = useState(false);
  const [sendLoading, setSendLoading] = useState(false);

  const resolveSeqRef = useRef(0);
  const resolveTimerRef = useRef(null);
  const feeTimerRef = useRef(null);
  const feeControllerRef = useRef(null);
  const mountedRef = useRef(true);

  const balance = Number(getAssetBalance(asset)) || 0;
  const balanceFull = String(asset?.balanceFull ?? getAssetBalance(asset) ?? '0');
  const tokenAddress = getAssetAddress(asset);
  const usdPrice = getAssetUsdPrice(asset);
  const ngnRate = getAssetNgnRate(asset);
  const hasPricing = usdPrice > 0;
  const assetDecimals = Math.min(8, Number(asset?.decimals) || 8);

  const AMOUNT_MODES = ['asset', 'ngn', 'usd'];

  const assetToUsd = useCallback((assetAmt) => assetAmt * usdPrice, [usdPrice]);
  const assetToNgn = useCallback((assetAmt) => assetAmt * usdPrice * ngnRate, [usdPrice, ngnRate]);
  const usdToAsset = useCallback((usdAmt) => (usdPrice > 0 ? usdAmt / usdPrice : 0), [usdPrice]);
  const ngnToAsset = useCallback(
    (ngnAmt) => (usdPrice > 0 && ngnRate > 0 ? ngnAmt / (usdPrice * ngnRate) : 0),
    [usdPrice, ngnRate]
  );

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);
      if (feeTimerRef.current) clearTimeout(feeTimerRef.current);
      feeControllerRef.current?.abort();
    };
  }, []);

  const setRecipient = useCallback(
    (value) => {
      // Every input change invalidates any lookup still pending or in flight.
      const seq = ++resolveSeqRef.current;
      if (resolveTimerRef.current) clearTimeout(resolveTimerRef.current);

      setRecipientInput(value);
      setResolvedAddress('');
      setResolveMessage('');
      setFee((current) => ({ ...current, feeNGN: 0, feeUsd: 0, error: false }));

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
          setResolveMessage('');
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

      // Wait 3 seconds after the last keystroke before calling the endpoint.
      resolveTimerRef.current = setTimeout(async () => {
        try {
          const data = await requestJson(
            `${SALVA_API_URL}/api/name/isAvail/${encodeURIComponent(trimmed)}`
          );

          console.log('[resolve]', trimmed, data);

          if (seq !== resolveSeqRef.current) return;

          const address = String(data?.address || '');

          if (!address) {
            throw new Error(data?.errorMsg || 'Could not resolve this name.');
          }

          if (address.toLowerCase() === ZERO_ADDRESS) {
            setResolvedAddress(ZERO_ADDRESS);
            setResolveState('zero');
            setResolveMessage('This name currently resolves to the zero address.');
            return;
          }

          if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
            throw new Error('Resolver returned an invalid wallet address.');
          }

          setResolvedAddress(address);
          setResolveState('resolved');
          setResolveMessage('');
        } catch (error) {
          if (seq !== resolveSeqRef.current) return;
          setResolvedAddress('');
          setResolveState('error');
          setResolveMessage(error?.message || 'Could not resolve this name.');
        }
      }, 3000);
    },
    [requestJson]
  );

  // Token-unit amount implied by whatever is currently typed, regardless of
  // display mode. This — not the raw field — is what the rest of the form
  // (balance checks, fee estimate, submission) is built on.
  const fieldNumber = Number(fieldValue) || 0;

  const tokenAmount = useMemo(() => {
    if (!hasPricing) return Number(amount) || 0;
    if (!fieldValue || fieldNumber <= 0) return 0;

    if (amountMode === 'asset') return fieldNumber;
    if (amountMode === 'usd') return usdToAsset(fieldNumber);
    if (amountMode === 'ngn') return ngnToAsset(fieldNumber);
    return 0;
  }, [amount, amountMode, fieldNumber, fieldValue, hasPricing, ngnToAsset, usdToAsset]);

  // Keep `amount` (token units, unformatted) as the single source of truth
  // the rest of the form and the transfer submission read from.
  useEffect(() => {
    if (!hasPricing) return; // legacy path sets `amount` directly.

    if (amountMode === 'asset') {
      setAmount(fieldValue);
      return;
    }

    if (!fieldValue || tokenAmount <= 0) {
      setAmount('');
      return;
    }

    setAmount(trimTrailingZeros(tokenAmount.toFixed(assetDecimals)));
  }, [amountMode, assetDecimals, fieldValue, hasPricing, tokenAmount]);

  const amountNumber = Number(amount);

  const amountError = Number.isFinite(amountNumber) && amountNumber > 0 && amountNumber > balance;

  const amountInvalid = amount.length > 0 && (!Number.isFinite(amountNumber) || amountNumber <= 0);

  const recipientReady =
    /^0x[a-fA-F0-9]{40}$/.test(resolvedAddress) && resolvedAddress.toLowerCase() !== ZERO_ADDRESS;

  const canEstimate =
    recipientReady &&
    Number.isFinite(amountNumber) &&
    amountNumber > 0 &&
    !amountError &&
    Boolean(privateKey) &&
    Boolean(tokenAddress);

  useEffect(() => {
    if (!initialRecipient) return;
    setRecipient(initialRecipient);
  }, [initialRecipient, setRecipient]);

  useEffect(() => {
    if (feeTimerRef.current) clearTimeout(feeTimerRef.current);
    feeControllerRef.current?.abort();

    if (!canEstimate) {
      setFee({ feeNGN: 0, feeUsd: 0, loading: false, error: false });
      return undefined;
    }

    const controller = new AbortController();
    feeControllerRef.current = controller;

    setFee((current) => ({ ...current, loading: true, error: false }));

    feeTimerRef.current = setTimeout(async () => {
      try {
        const response = await requestJson(
          `${SALVA_API_URL}/api/user/transfer/estimate-fee`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              pin: privateKey,
              safeAddress: user.safeAddress,
              toAddress: resolvedAddress,
              amount: amount.replace(/\.$/, ''),
              tokenAddress,
              chain: selectedChain,
            }),
          },
          { signal: controller.signal }
        );

        const feeData = response?.data;

        if (!feeData) {
          throw new Error('Fee estimation failed.');
        }

        if (!mountedRef.current || controller.signal.aborted) return;

        setFee({
          feeNGN: Number(feeData.feeNGN) || 0,
          feeUsd: Number(feeData.feeUsd) || 0,
          loading: false,
          error: false,
        });
      } catch (error) {
        if (error?.name === 'AbortError' || !mountedRef.current) return;

        setFee({
          feeNGN: 0,
          feeUsd: 0,
          loading: false,
          error: true,
        });
      } finally {
        if (feeControllerRef.current === controller) {
          feeControllerRef.current = null;
        }
      }
    }, 250);

    return () => {
      clearTimeout(feeTimerRef.current);
      controller.abort();
    };
  }, [
    amountNumber,
    canEstimate,
    privateKey,
    requestJson,
    resolvedAddress,
    selectedChain,
    tokenAddress,
    user?.safeAddress,
  ]);

  // Legacy path — used only for assets with no USD price, where the field
  // always represents the asset amount directly.
  const handleAmountChange = useCallback((event) => {
    const formatted = formatAmountInput(event.target.value);
    setAmountDisplay(formatted);
    setAmount(formatted.replace(/,/g, ''));
  }, []);

  // Priced path — the field represents whatever `amountMode` currently is.
  const handleFieldChange = useCallback((event) => {
    const formatted = formatAmountInput(event.target.value);
    setFieldDisplay(formatted);
    setFieldValue(formatted.replace(/,/g, ''));
  }, []);

  // Cycles asset -> ngn -> usd -> asset, converting whatever is currently
  // typed into the next unit so the person never loses their place —
  // exactly how MetaMask's crypto/fiat toggle behaves.
  const cycleAmountMode = useCallback(() => {
    if (!hasPricing) return;

    const currentIdx = AMOUNT_MODES.indexOf(amountMode);
    const nextMode = AMOUNT_MODES[(currentIdx + 1) % AMOUNT_MODES.length];

    let nextNumber = 0;
    if (tokenAmount > 0) {
      if (nextMode === 'asset') nextNumber = tokenAmount;
      else if (nextMode === 'usd') nextNumber = assetToUsd(tokenAmount);
      else if (nextMode === 'ngn') nextNumber = assetToNgn(tokenAmount);
    }

    setAmountMode(nextMode);

    if (!fieldValue || nextNumber <= 0) {
      setFieldValue('');
      setFieldDisplay('');
      return;
    }

    const decimals = nextMode === 'asset' ? assetDecimals : nextMode === 'usd' ? 4 : 2;
    const str = trimTrailingZeros(nextNumber.toFixed(decimals));
    setFieldValue(str);
    setFieldDisplay(formatAmountInput(str));
  }, [amountMode, assetDecimals, assetToNgn, assetToUsd, fieldValue, hasPricing, tokenAmount]);

  const setMax = useCallback(() => {
    const raw = balanceFull;
    if (hasPricing) {
      setAmountMode('asset');
      setFieldValue(raw);
      setFieldDisplay(formatAmountInput(raw));
    } else {
      setAmount(raw);
      setAmountDisplay(formatAmountInput(raw));
    }
  }, [balanceFull, hasPricing]);

  const review = useCallback(
    (event) => {
      event.preventDefault();

      if (!recipientReady) return;
      if (!amount || amountError || amountInvalid || fee.loading || fee.error) return;

      setShowConfirmation(true);
    },
    [amount, amountError, amountInvalid, fee.error, fee.loading, recipientReady]
  );

  const execute = useCallback(async () => {
    if (sendLoading || !recipientReady || !privateKey) return;

    setSendLoading(true);

    try {
      const response = await requestJson(`${SALVA_API_URL}/api/user/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          pin: privateKey,
          safeAddress: user.safeAddress,
          toAddress: resolvedAddress,
          amount,
          tokenSymbol: asset.symbol,
          tokenAddress,
          chain: selectedChain,
        }),
      });

      if (!response?.status) {
        throw new Error(response?.message || response?.errorMsg || 'Transaction failed');
      }

      setShowConfirmation(false);

      // The modal stays open until the person clicks OK on the success card.
      showMsg('Transfer successful!', 'success', onClose);

      // Refresh balances in the background while the card is showing.
      await onSuccess();
    } catch (error) {
      showMsg(error?.message || 'Transaction failed', 'error');
    } finally {
      if (mountedRef.current) setSendLoading(false);
    }
  }, [
    amount,
    asset?.symbol,
    onClose,
    onSuccess,
    privateKey,
    recipientReady,
    requestJson,
    resolvedAddress,
    selectedChain,
    sendLoading,
    showMsg,
    tokenAddress,
    user?.email,
    user?.safeAddress,
  ]);

  const recipientStatus = useMemo(() => {
    if (recipientType === 'empty') return null;

    if (recipientType === 'address') {
      if (resolveState === 'resolved') return { type: 'success', text: 'Valid wallet address' };
      return { type: 'error', text: resolveMessage };
    }

    if (resolveState === 'loading') return { type: 'loading', text: 'Resolving recipient…' };
    if (resolveState === 'resolved') return { type: 'success', text: 'Resolved recipient' };
    if (resolveState === 'zero') return { type: 'error', text: resolveMessage };
    return { type: 'error', text: resolveMessage };
  }, [recipientType, resolveMessage, resolveState]);

  const unitLabel = amountMode === 'asset' ? asset.symbol : amountMode === 'usd' ? 'USD' : 'NGN';

  // Preview chips shown below the input once pricing is available — always
  // the two representations NOT currently being typed, so the person can
  // see at a glance what their input is worth in every unit.
  const showPreview = hasPricing && Boolean(fieldValue) && tokenAmount > 0;

  return (
    <>
      <div className="p-4 sm:p-7">
        <StepHeader
          eyebrow="Send"
          title={`Send ${asset.symbol}`}
          description="Review the recipient and amount before signing the transaction."
          onBack={onBack}
        />

        <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.025] border border-white/[0.07] mb-5">
          <AssetLogo asset={asset} size="w-10 h-10" />
          <div className="min-w-0 flex-1">
            <p className="font-black text-xs sm:text-sm">{asset.symbol}</p>
            <p className="text-[9px] text-white/30 mt-0.5">
              Balance {showBalance ? formatNumber(balance, { maxDecimals: 8 }) : '••••'}
            </p>
          </div>
          <span className="text-[8px] uppercase tracking-widest text-white/25 font-black">
            {selectedChain}
          </span>
        </div>

        <form onSubmit={review} className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[8px] uppercase tracking-[.25em] text-white/35 font-black">
                Recipient
              </label>
              <span className="text-[8px] text-white/20">name@namespace or 0x</span>
            </div>

            <input
              autoFocus
              value={recipientInput}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="pay.sant@alice or 0x…"
              className={`w-full h-14 px-4 rounded-2xl bg-white/[0.035] border ${
                recipientStatus?.type === 'error'
                  ? 'border-red-500/50'
                  : recipientStatus?.type === 'success'
                  ? 'border-emerald-500/25'
                  : 'border-white/10'
              } focus:border-salvaGold/50 outline-none font-bold text-xs sm:text-sm transition-colors`}
            />

            {recipientStatus && (
              <div className="mt-2">
                <p
                  className={`text-[9px] sm:text-[10px] font-bold ${
                    recipientStatus.type === 'error'
                      ? 'text-red-400'
                      : recipientStatus.type === 'success'
                      ? 'text-emerald-400'
                      : 'text-white/40'
                  }`}
                >
                  {recipientStatus.type === 'loading' && <Spinner small />}
                  <span className={recipientStatus.type === 'loading' ? 'ml-1.5' : ''}>
                    {recipientStatus.text}
                  </span>
                </p>

                {recipientStatus.type === 'success' && resolvedAddress && (
                  <p className="mt-1 px-3 py-2 rounded-xl bg-emerald-500/[0.045] border border-emerald-500/10 text-[8px] sm:text-[9px] font-mono text-emerald-300/70 break-all">
                    {resolvedAddress}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-[8px] uppercase tracking-[.25em] text-white/35 font-black">
                Amount
              </label>

              <button
                type="button"
                onClick={setMax}
                className="px-2.5 py-1 rounded-lg bg-salvaGold/10 border border-salvaGold/20 text-[8px] uppercase tracking-widest text-salvaGold font-black"
              >
                Max
              </button>
            </div>

            <div
              className={`relative rounded-2xl border ${
                amountError || amountInvalid
                  ? 'border-red-500/50'
                  : fee.error
                  ? 'border-red-500/35'
                  : 'border-white/10'
              } bg-white/[0.035]`}
            >
              <input
                value={hasPricing ? fieldDisplay : amountDisplay}
                inputMode="decimal"
                onChange={hasPricing ? handleFieldChange : handleAmountChange}
                placeholder="0.00"
                className={`w-full h-14 sm:h-16 px-4 bg-transparent outline-none font-black text-lg sm:text-xl ${
                  hasPricing ? 'pr-28 sm:pr-32' : 'pr-24'
                }`}
              />

              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                <span className="text-salvaGold text-[10px] sm:text-xs font-black uppercase tracking-wide">
                  {unitLabel}
                </span>

                {hasPricing && (
                  <button
                    type="button"
                    onClick={cycleAmountMode}
                    aria-label="Switch amount currency"
                    title="Switch amount currency"
                    className="w-7 h-7 rounded-lg bg-white/[0.05] border border-white/10 flex items-center justify-center text-white/45 hover:text-salvaGold hover:border-salvaGold/30 transition-colors"
                  >
                    <span className="text-[11px] leading-none">⇅</span>
                  </button>
                )}
              </div>
            </div>

            {showPreview && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 px-0.5">
                {amountMode !== 'asset' && (
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[9px] sm:text-[10px] font-bold text-white/55">
                    ≈ {formatNumber(tokenAmount, { maxDecimals: 8 })} {asset.symbol}
                  </span>
                )}
                {amountMode !== 'usd' && (
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[9px] sm:text-[10px] font-bold text-white/55">
                    ≈ ${formatNumber(assetToUsd(tokenAmount), { minDecimals: 2, maxDecimals: 4 })}
                  </span>
                )}
                {amountMode !== 'ngn' && (
                  <span className="px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.07] text-[9px] sm:text-[10px] font-bold text-white/55">
                    ≈ ₦{formatNumber(assetToNgn(tokenAmount), { minDecimals: 2, maxDecimals: 2 })}
                  </span>
                )}
              </div>
            )}

            {amountError && (
              <p className="mt-2 text-[9px] text-red-400 font-bold">
                ⚠ Insufficient {asset.symbol} balance.
              </p>
            )}

            {amountInvalid && !amountError && (
              <p className="mt-2 text-[9px] text-red-400 font-bold">
                ⚠ Enter an amount greater than zero.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3.5 sm:p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-[8px] uppercase tracking-[.25em] text-white/30 font-black">
                  Network fee
                </p>
                <p className="text-[9px] text-white/25 mt-0.5">Estimated before signing</p>
              </div>

              {fee.loading && <Spinner small />}
            </div>

            {fee.loading ? (
              <p className="text-[9px] text-white/40">Simulating transaction…</p>
            ) : fee.error ? (
              <div className="rounded-xl border border-red-500/20 bg-red-500/[0.045] p-3">
                <p className="text-[9px] sm:text-[10px] text-red-400 font-black">
                  ⚠ This transaction is likely to revert.
                </p>
                <p className="text-[8px] text-red-400/60 mt-1 leading-relaxed">
                  Fee estimation failed because the transfer simulation returned an error. Check the
                  recipient, amount and token balance.
                </p>
              </div>
            ) : fee.feeNGN || fee.feeUsd ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/40">Estimated fee</span>
                  <span className="text-[10px] font-black text-salvaGold">
                    {fee.feeNGN ? `₦${formatNumber(fee.feeNGN, { maxDecimals: 2 })}` : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/40">USD equivalent</span>
                  <span className="text-[10px] font-black text-white/70">
                    {fee.feeUsd ? `$${formatNumber(fee.feeUsd, { maxDecimals: 4 })}` : '—'}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[9px] text-white/25">
                Enter a valid recipient and amount to estimate the fee.
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={
              sendLoading ||
              !recipientReady ||
              !amount ||
              amountError ||
              amountInvalid ||
              fee.loading ||
              fee.error
            }
            className="w-full h-14 rounded-2xl bg-salvaGold text-black font-black text-[10px] sm:text-xs uppercase tracking-[.15em] disabled:opacity-30 transition-all hover:brightness-105 active:scale-[.99]"
          >
            Review transfer
          </button>
        </form>
      </div>

      {createPortal(
        <AnimatePresence>
          {showConfirmation && (
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center px-0 sm:px-4">
              <div
                className="absolute inset-0 bg-black/90 backdrop-blur-xl"
                onClick={() => !sendLoading && setShowConfirmation(false)}
              />

              <motion.div
                initial={{ opacity: 0, y: '8%', scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: '8%', scale: 0.98 }}
                className="relative w-full sm:max-w-md rounded-t-[30px] sm:rounded-[30px] border border-white/10 bg-[#0b0b0d] shadow-2xl overflow-hidden"
              >
                <div className="h-1 bg-gradient-to-r from-transparent via-salvaGold to-transparent" />

                <div className="p-5 sm:p-7">
                  <p className="text-[8px] uppercase tracking-[.35em] text-salvaGold/65 font-black">
                    Final review
                  </p>
                  <h3 className="text-xl sm:text-2xl font-black mt-1">Confirm transfer</h3>
                  <p className="text-[10px] text-white/35 mt-1.5">
                    Confirm the details below before the transaction is submitted.
                  </p>

                  <div className="mt-5 space-y-2">
                    <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
                      <p className="text-[8px] uppercase tracking-[.25em] text-white/25 font-black">
                        Sending
                      </p>
                      <p className="text-lg sm:text-xl font-black mt-1">
                        {formatNumber(amount, { maxDecimals: 8 })}{' '}
                        <span className="text-salvaGold">{asset.symbol}</span>
                      </p>
                      {hasPricing && (
                        <p className="text-[9px] sm:text-[10px] text-white/35 font-bold mt-1">
                          ≈ $
                          {formatNumber(assetToUsd(amountNumber), {
                            minDecimals: 2,
                            maxDecimals: 4,
                          })}
                          <span className="text-white/15 mx-1">·</span>₦
                          {formatNumber(assetToNgn(amountNumber), {
                            minDecimals: 2,
                            maxDecimals: 2,
                          })}
                        </p>
                      )}
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
                      <p className="text-[8px] uppercase tracking-[.25em] text-white/25 font-black">
                        Recipient
                      </p>
                      <p className="text-xs font-black text-salvaGold mt-1 break-all">
                        {recipientInput.trim()}
                      </p>
                      <p className="text-[8px] font-mono text-white/35 mt-1 break-all">
                        {resolvedAddress}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-white/[0.025] border border-white/[0.07]">
                      <div className="flex justify-between gap-3 text-[9px]">
                        <span className="text-white/35">Network fee</span>
                        <span className="font-black text-white/75">
                          {fee.feeNGN ? `₦${formatNumber(fee.feeNGN, { maxDecimals: 2 })}` : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between gap-3 text-[9px] mt-2">
                        <span className="text-white/35">USD equivalent</span>
                        <span className="font-black text-white/55">
                          {fee.feeUsd ? `$${formatNumber(fee.feeUsd, { maxDecimals: 4 })}` : '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-5">
                    <button
                      type="button"
                      onClick={() => setShowConfirmation(false)}
                      disabled={sendLoading}
                      className="flex-1 h-12 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest text-white/50 hover:text-white disabled:opacity-40"
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={execute}
                      disabled={sendLoading}
                      className="flex-1 h-12 rounded-2xl bg-salvaGold text-black text-[10px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {sendLoading && <Spinner small />}
                      {sendLoading ? 'Sending…' : 'Confirm & Send'}
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};

const SendTransferModal = ({
  user,
  assets,
  selectedChain,
  showBalance,
  initialAsset = null,
  initialRecipient = '',
  onClose,
  showMsg,
  onSuccess,
}) => {
  const [stage, setStage] = useState(initialAsset ? 'pin' : 'select');
  const [asset, setAsset] = useState(initialAsset);
  const [privateKey, setPrivateKey] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const requestJson = useCallback(async (url, options = {}, { signal } = {}) => {
    const controller = new AbortController();

    const onAbort = () => controller.abort();

    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

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
      signal?.removeEventListener('abort', onAbort);
    }
  }, []);

  useEffect(() => {
    if (initialAsset) {
      setAsset(initialAsset);
      setStage('pin');
    }
  }, [initialAsset]);

  const selectAsset = useCallback((nextAsset) => {
    setAsset(nextAsset);
    setErrorMessage('');
    setStage('pin');
  }, []);

  const verified = useCallback((key) => {
    setPrivateKey(key);
    setErrorMessage('');
    setStage('form');
  }, []);

  const cancel = useCallback(
    (message = '') => {
      setPrivateKey('');

      if (message) {
        setErrorMessage(message);
        showMsg(message, 'error');

        if (message.startsWith('Too many failed')) {
          window.setTimeout(() => {
            window.location.assign('/account-settings');
          }, 900);
        }
      } else {
        onClose();
      }
    },
    [onClose, showMsg]
  );

  const goBack = useCallback(() => {
    if (stage === 'form') {
      setPrivateKey('');
      setStage('pin');
      return;
    }

    if (stage === 'pin') {
      if (initialAsset) {
        onClose();
      } else {
        setStage('select');
        setAsset(null);
      }
      return;
    }

    onClose();
  }, [initialAsset, onClose, stage]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <div className="absolute inset-0 bg-black/90 backdrop-blur-xl" onClick={onClose} />

      <motion.div
        initial={{ opacity: 0, y: '8%', scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: '8%', scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
        className="relative w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-[30px] sm:rounded-[30px] border border-white/10 bg-[#0b0b0d] shadow-[0_35px_120px_rgba(0,0,0,.65)]"
      >
        <div className="h-1 bg-gradient-to-r from-transparent via-salvaGold to-transparent" />

        <div className="p-4 sm:p-7">
          {stage === 'select' && (
            <TokenPicker
              assets={assets}
              showBalance={showBalance}
              selectedChain={selectedChain}
              onSelect={selectAsset}
              onCancel={onClose}
            />
          )}

          {stage === 'pin' && asset && (
            <PinStep
              user={user}
              requestJson={requestJson}
              onVerified={verified}
              onCancel={cancel}
            />
          )}

          {stage === 'form' && asset && privateKey && (
            <SendForm
              asset={asset}
              selectedChain={selectedChain}
              showBalance={showBalance}
              privateKey={privateKey}
              user={user}
              requestJson={requestJson}
              onBack={goBack}
              onClose={onClose}
              showMsg={showMsg}
              onSuccess={onSuccess}
            />
          )}

          {errorMessage && (
            <p className="mt-3 text-[9px] text-red-400 text-center font-bold">{errorMessage}</p>
          )}
        </div>
      </motion.div>
    </div>
  );
};

export default SendTransferModal;