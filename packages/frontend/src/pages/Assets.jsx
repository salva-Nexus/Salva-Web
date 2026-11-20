import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useNavigate } from 'react-router-dom';
import Stars from '../components/Stars';
import { AssetDetailsModal, Notification } from './Dashboard';
import SendTransferModal from './SendTransferModal';

import ngnLogo from '../assets/ngn-coin.png';
import santLogo from '../assets/icon-only.png';

import {
  POLL_INTERVAL_MS,
  walletKey,
  readWalletCache,
  fetchWalletSnapshot,
} from '../utils/walletCache';

const LOCAL_LOGOS = {
  NGNS: ngnLogo,
  SANT: santLogo,
};

const CHAIN_BADGE_COLORS = {
  base: '#0052FF',
  bnb: '#F0B90B',
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

// Fiat sub-values: 2 decimals (truncated). Non-zero amounts below 0.01 show as "<$0.01".
const formatFiat = (value, symbol) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return `${symbol}0.00`;
  if (n < 0.01) return `<${symbol}0.01`;
  return `${symbol}${formatNumber(n, { minDecimals: 2, maxDecimals: 2 })}`;
};

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
      <span className="text-white/15 mx-1">·</span>
      {formatFiat(ngnValue, '₦')}
    </p>
  );
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

    const timer = setTimeout(() => {
      setAttempt((current) => current + 1);
      setBroken(false);
    }, 1000 * (attempt + 1));

    return () => clearTimeout(timer);
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
          <span className="font-black text-[10px] sm:text-xs text-salvaGold">
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
            text-[6px] sm:text-[7px]
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

const Spinner = () => (
  <span className="w-3.5 h-3.5 border-2 border-salvaGold/25 border-t-salvaGold rounded-full animate-spin inline-block" />
);

const Assets = () => {
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

  const [selectedChain, setSelectedChain] = useState(
    () => localStorage.getItem('salva_chain') || 'base'
  );

  const [assets, setAssets] = useState(() => {
    if (!user?.email) return [];

    const cache = readWalletCache(user.email, localStorage.getItem('salva_chain') || 'base');

    return cache?.assets || [];
  });

  const [loading, setLoading] = useState(() => {
    if (!user?.email) return true;

    const cache = readWalletCache(user.email, localStorage.getItem('salva_chain') || 'base');

    return !cache;
  });

  const [showBalance] = useState(() => localStorage.getItem('salva_show_balance') !== 'false');

  const [search, setSearch] = useState('');
  const searchQuery = search.trim().toLowerCase();
  const filteredAssets = searchQuery
    ? assets.filter((a) =>
        `${a.symbol || ''} ${a.name || ''} ${a.contractAddress || ''}`
          .toLowerCase()
          .includes(searchQuery)
      )
    : assets;

  const ngnValueOf = (asset) => {
    const usd = getAssetUsdPrice(asset);
    const rate = getAssetNgnRate(asset);
    if (usd <= 0 || rate <= 0) return null;
    return (Number(asset?.balance) || 0) * usd * rate;
  };

  const assetRank = (asset) => {
    if (String(asset?.symbol || '').toUpperCase() === 'NGNS') return 0;
    if (asset?.isSant || String(asset?.symbol || '').toUpperCase() === 'SANT') return 1;
    return 2;
  };

  const sortedAssets = [...filteredAssets].sort((a, b) => {
    const ra = assetRank(a);
    const rb = assetRank(b);
    if (ra !== rb) return ra - rb;

    const va = ngnValueOf(a);
    const vb = ngnValueOf(b);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return vb - va;
  });

  const renderAssetRow = (asset) => (
    <button
      key={asset._key}
      onClick={() => setDetailsAsset(asset)}
      className="
        w-full flex items-center gap-2.5 sm:gap-3.5
        px-3 sm:px-4
        py-3 sm:py-4
        text-left
        hover:bg-white/[0.035]
        transition-all
      "
    >
      <AssetLogo asset={asset} size="w-9 h-9 sm:w-11 sm:h-11" showChainBadge />

      <div className="flex-1 min-w-0">
        <p className="font-black text-xs sm:text-sm text-white">{asset.symbol}</p>

        <p className="text-[8px] sm:text-[10px] text-white/70 capitalize mt-0.5">
          {asset.chain || selectedChain}
        </p>
      </div>

      <div className="text-right">
        <p className="font-black text-xs sm:text-sm text-white">
          {showBalance ? formatNumber(asset.balance, { maxDecimals: 6 }) : '••••'}
        </p>

        <AssetValueLine asset={asset} className="text-[8px] sm:text-[10px] text-white/70 mt-0.5" />
      </div>

      <span className="text-white/15 ml-1">›</span>
    </button>
  );

  const [detailsAsset, setDetailsAsset] = useState(null);
  const [sendAsset, setSendAsset] = useState(null);
  const [isSendOpen, setIsSendOpen] = useState(false);
  const [receiveAsset, setReceiveAsset] = useState(null);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [notification, setNotification] = useState({ show: false, message: '', type: 'info' });

  const notificationRef = useRef(notification);
  notificationRef.current = notification;

  const showMsg = useCallback((message, type = 'success', onDismiss = null) => {
    setNotification({ show: true, message, type, onDismiss });
  }, []);

  const closeMsg = useCallback(() => {
    const onDismiss = notificationRef.current.onDismiss;
    setNotification((n) => ({ ...n, show: false, onDismiss: null }));
    if (typeof onDismiss === 'function') onDismiss();
  }, []);

  const refreshAssets = useCallback(async () => {
    try {
      await fetchWalletSnapshot(user?.email, selectedChain, {
        logoMap: LOCAL_LOGOS,
        timeout: null,
      });
      const refreshed = readWalletCache(user?.email, selectedChain);
      if (refreshed) setAssets(refreshed.assets || []);
    } catch {}
  }, [user?.email, selectedChain]);

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
    if (!user) {
      navigate('/login', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (!user?.email || !selectedChain) return undefined;

    let stopped = false;

    const loadAssets = async () => {
      const chain = String(selectedChain).toLowerCase();

      /*
       * Paint cached data immediately.
       */
      const cached = readWalletCache(user.email, chain);

      if (cached) {
        setAssets(cached.assets || []);
        setLoading(false);
      } else {
        setLoading(true);
      }

      /*
       * Refresh through the SAME wallet cache pipeline used by Dashboard.
       */
      try {
        await fetchWalletSnapshot(user.email, chain, {
          logoMap: LOCAL_LOGOS,
          timeout: null,
        });

        if (stopped) return;

        const refreshed = readWalletCache(user.email, chain);

        if (refreshed) {
          setAssets(refreshed.assets || []);
        }

        setLoading(false);
      } catch (error) {
        if (stopped) return;

        console.error('[Assets] wallet refresh failed:', error);
        setLoading(false);
      }
    };

    loadAssets();

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;

      loadAssets();
    }, POLL_INTERVAL_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        loadAssets();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user?.email, selectedChain]);

  /*
   * Keep the page synchronized if Dashboard changed the selected chain
   * before navigating here.
   */
  useEffect(() => {
    const handleStorage = () => {
      const chain = localStorage.getItem('salva_chain');

      if (chain && chain !== selectedChain) {
        setSelectedChain(chain);
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => window.removeEventListener('storage', handleStorage);
  }, [selectedChain]);

  const handleBack = () => {
    /*
     * This is a REAL route now.
     *
     * /dashboard/assets -> /dashboard
     */
    navigate('/dashboard');
  };

  const handleManageAssets = () => {
    /*
     * Preserve the real route we came from.
     *
     * Manage Assets can therefore return here instead of guessing
     * that it should always return to Dashboard.
     */
    navigate('/manage-assets', {
      state: {
        from: '/dashboard/assets',
      },
    });
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080809]">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080809] text-white overflow-y-auto">
      <Stars />

      <AnimatePresence>
        {detailsAsset && (
          <AssetDetailsModal
            asset={detailsAsset}
            showBalance={showBalance}
            user={user}
            showMsg={showMsg}
            onSantClaimed={refreshAssets}
            onClose={() => setDetailsAsset(null)}
            onSend={() => {
              setSendAsset(detailsAsset);
              setDetailsAsset(null);
              setIsSendOpen(true);
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
            onClose={() => {
              setIsSendOpen(false);
              setSendAsset(null);
            }}
            showMsg={showMsg}
            onSuccess={refreshAssets}
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
                <p className="text-[7px] sm:text-[8px] uppercase tracking-[.35em] text-salvaGold/70 font-black">
                  Receive Funds
                </p>

                <h3 className="text-sm sm:text-2xl font-black mt-1">{user.username}</h3>

                <p className="text-[8px] sm:text-[9px] text-white/75 mt-1">
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
                <p className="text-[7px] sm:text-[8px] uppercase tracking-[.25em] text-white/70 font-black">
                  Wallet Address
                </p>

                <p className="font-mono text-[8px] sm:text-[10px] text-salvaGold break-all mt-1">
                  {user.safeAddress}
                </p>
              </button>

              <button
                onClick={() => setIsReceiveOpen(false)}
                className="w-full mt-2.5 sm:mt-3 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-white/10 text-[10px] sm:text-xs font-black uppercase tracking-widest text-white/80"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {notification.show && <Notification notification={notification} onClose={closeMsg} />}
      </AnimatePresence>

      <div className="relative z-10 max-w-3xl mx-auto px-3 sm:px-6 pt-5 sm:pt-10 pb-20">
        <div className="flex items-center justify-between mb-6 sm:mb-9">
          <button
            onClick={handleBack}
            className="
              flex items-center gap-1.5
              text-white/75
              hover:text-white
              text-[9px] sm:text-xs
              font-black uppercase tracking-widest
              transition-colors
            "
          >
            ← Back
          </button>

          <div className="text-right">
            <p className="text-[7px] sm:text-[9px] uppercase tracking-[.35em] text-salvaGold/60 font-black">
              Portfolio
            </p>

            <p className="text-sm sm:text-xl font-black mt-0.5">All Assets</p>
          </div>
        </div>

        <div className="flex justify-end mb-4 sm:mb-6 -mt-2 sm:-mt-4">
          <button
            onClick={handleManageAssets}
            className="
              text-[8px] sm:text-[9px]
              uppercase tracking-widest
              text-salvaGold
              font-black
              hover:text-salvaGold/80
              transition-colors
            "
          >
            Update Asset →
          </button>
        </div>

        <div className="mb-4 sm:mb-6">
          <p className="text-[8px] sm:text-[9px] uppercase tracking-[.3em] text-white/65 font-black">
            {selectedChain}
          </p>

          <h1 className="text-xl sm:text-3xl font-black mt-1">Your assets</h1>

          <p className="text-[9px] sm:text-xs text-white/75 mt-1">
            Every token currently available in this wallet.
          </p>
        </div>

        <div className="relative mb-3 sm:mb-4">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search symbol, name or address…"
            className="w-full h-11 sm:h-12 pl-4 pr-10 rounded-xl sm:rounded-2xl bg-white/[0.035] border border-white/10 focus:border-salvaGold/50 outline-none text-[11px] sm:text-sm font-bold text-white placeholder:text-white/40 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/60 hover:text-white text-base leading-none"
            >
              ×
            </button>
          )}
        </div>

        <div className="rounded-2xl sm:rounded-[24px] border border-white/[0.07] bg-white/[0.025] overflow-hidden divide-y divide-white/[0.055]">
          {loading ? (
            <div className="py-14 flex justify-center">
              <Spinner />
            </div>
          ) : assets.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-xs sm:text-sm font-black text-white/80">No assets found</p>

              <p className="text-[9px] sm:text-[10px] text-white/70 mt-1">
                Assets on {selectedChain} will appear here.
              </p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-xs sm:text-sm font-black text-white/80">No matching assets</p>

              <p className="text-[9px] sm:text-[10px] text-white/70 mt-1">
                Nothing matches “{search.trim()}”.
              </p>
            </div>
          ) : (
            sortedAssets.map(renderAssetRow)
          )}
        </div>
      </div>
    </div>
  );
};

export default Assets;
