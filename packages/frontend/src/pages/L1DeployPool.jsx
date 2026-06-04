// src/pages/L1DeployPool.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ethers } from 'ethers';
import { SALVA_API_URL } from '../config';
import { useWallet, waitWithTimeout } from '../hooks/useWallet';
import { SwitchChainBanner, NoWalletCard } from '../components/WalletGate';

// ── ABIs ──────────────────────────────────────────────────────────────────────
const FACTORY_ABI = [
  'function deployPool() external returns (address pool)',
  'event PoolDeployed(address indexed deployer, address indexed pool)',
];

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

const POOL_ABI = [
  'function removeLiquidity(address asset, uint256 amount) external returns (bool)',
  'function updateBuyRate(uint256 _exRate) external returns (bool)',
  'function updateSellRate(uint256 _exRate) external returns (bool)',
  'function pause() external returns (bool)',
  'function unpause() external returns (bool)',
  'function setMinimumNgnAmount(uint256 amount) external returns (bool)',
  'function setMinimumTokenAmount(uint256 amount) external returns (bool)',
  'function availableLiquidity(address asset) external view returns (uint256)',
  'function getMinuimumNgnAmount() external view returns (uint256)',
  'function getMinuimumUSDAmount() external view returns (uint256)',
];

const POOL_PROVIDE_ABI = [
  'function provideLiquidity(address asset, uint256 amount) external returns (bool)',
];

// ── Shared helpers ────────────────────────────────────────────────────────────
const darkInput =
  'w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 outline-none font-bold text-sm text-white placeholder:text-white/60 transition-all';

// Parse raw pool value to a clean float — never touches formatted strings
const toNum = (v) => parseFloat(v || 0) || 0;

// Format a number for display — responsive: abbreviate when >= 1M or >= 10K
const smartFmt = (n) => {
  const num = toNum(n);
  if (isNaN(num)) return '0';
  const str = num.toString();
  if (!str.includes('.')) return num.toLocaleString('en-US');
  const decimals = str.split('.')[1].replace(/0+$/, '').length;
  return num.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

// Compact display for tight spaces (token pills, stat cells on small screens)
const compactFmt = (n) => {
  const num = toNum(n);
  if (num >= 1_000_000)
    return (num / 1_000_000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'M';
  if (num >= 100_000)
    return (num / 1_000).toLocaleString('en-US', { maximumFractionDigits: 1 }) + 'K';
  if (num >= 10_000)
    return (num / 1_000).toLocaleString('en-US', { maximumFractionDigits: 2 }) + 'K';
  // For smaller numbers keep up to 4 significant decimals
  if (num === Math.floor(num)) return num.toLocaleString('en-US');
  return num.toLocaleString('en-US', { maximumFractionDigits: 4 });
};

// ── Robust tx executor ────────────────────────────────────────────────────────
async function execTx(txPromise, timeoutMs = 90_000) {
  const tx = await txPromise;
  const receipt = await waitWithTimeout(tx, 1, timeoutMs);
  if (!receipt || receipt.status === 0) {
    throw new Error('Transaction reverted on-chain');
  }
  return { txHash: tx.hash, receipt };
}

// ── RegistryDropdown ──────────────────────────────────────────────────────────
const RegistryDropdown = ({
  registries,
  value,
  onChange,
  placeholder = 'Search wallet service…',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = React.useRef(null);
  const triggerRef = React.useRef(null);
  const inputRef = React.useRef(null);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });

  const filtered = registries.filter(
    (r) =>
      r.name.toLowerCase().includes(query.toLowerCase()) ||
      (r.nspace || '').toLowerCase().includes(query.toLowerCase())
  );

  const handleOpen = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setDropPos({
        top: rect.top - 8,
        left: rect.left,
        width: rect.width,
      });
    }
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  React.useEffect(() => {
    const h = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

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
    <div ref={ref} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={value ? undefined : handleOpen}
        className={`w-full flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border transition-all text-left ${
          open
            ? 'border-blue-400 bg-blue-500/5 ring-1 ring-blue-400/30'
            : value
              ? 'border-blue-400/40 bg-blue-500/5'
              : 'border-white/10 bg-white/5 hover:border-blue-400/40'
        }`}
      >
        {value ? (
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
              <span className="text-blue-400 text-xs font-black">
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
            onClick={
              open
                ? () => {
                    setOpen(false);
                    setQuery('');
                  }
                : handleOpen
            }
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
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              top: dropPos.top,
              left: dropPos.left,
              width: dropPos.width,
              transform: 'translateY(-100%)',
              zIndex: 9999,
            }}
            className="bg-zinc-900 border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden"
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
                    className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors text-left ${value?.registryAddress === reg.registryAddress ? 'bg-blue-500/10' : ''}`}
                  >
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <span className="text-blue-400 text-sm font-black">
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
                      <span className="text-blue-400 text-sm">✓</span>
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

// ── SubBadge ──────────────────────────────────────────────────────────────────
const SubBadge = ({ pool }) => {
  const now = new Date();
  const expiry = pool.subscriptionExpiresAt ? new Date(pool.subscriptionExpiresAt) : null;
  const active = expiry && expiry > now;

  if (!active) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-white/10 bg-white/5 text-white/60">
        Unpublished
      </span>
    );
  }

  const msLeft = expiry - now;
  const mins = Math.ceil(msLeft / 60_000);
  const hours = Math.ceil(msLeft / 3_600_000);
  const days = Math.ceil(msLeft / 864e5);
  const timeLabel = mins < 60 ? `${mins}m` : hours < 24 ? `${hours}h` : `${days}d`;

  if (pool.isPaused) {
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">
        Paused · {timeLabel} left
      </span>
    );
  }

  return (
    <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase border border-green-500/30 bg-green-500/10 text-green-400">
      Live · {timeLabel} left
    </span>
  );
};

// ── Stat Cell — shows accumulated total, responsive ───────────────────────────
const StatCell = ({ label, value, color }) => (
  <div className="p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center min-w-0">
    <p className="text-[9px] uppercase tracking-[0.2em] text-white/60 font-black mb-1 truncate">
      {label}
    </p>
    <p className="font-black text-xs sm:text-sm truncate" style={{ color }} title={smartFmt(value)}>
      {compactFmt(value)}
    </p>
  </div>
);

const SectionTabs = ({ active, onChange }) => (
  <div className="flex gap-1.5">
    {['liquidity', 'rates', 'controls'].map((s) => (
      <button
        key={s}
        onClick={() => onChange(s)}
        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
          active === s
            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20'
            : 'bg-white/5 border border-white/[0.06] text-white/60 hover:text-white/80'
        }`}
      >
        {s}
      </button>
    ))}
  </div>
);

// ── Pool Manage Panel ─────────────────────────────────────────────────────────
const L1PoolManagePanel = ({ pool, l1Config, wallet, showMsg, onClose, onRefresh }) => {
  const [activeSection, setActiveSection] = useState('liquidity');
  const [liqAsset, setLiqAsset] = useState('NGNS');
  const [liqAmount, setLiqAmount] = useState('');
  const [liqMode, setLiqMode] = useState('provide');
  const [buyRate, setBuyRate] = useState(toNum(pool.buyRate).toString());
  const [sellRate, setSellRate] = useState(toNum(pool.sellRate).toString());
  const [minNgn, setMinNgn] = useState('');
  const [minToken, setMinToken] = useState('');
  const [txLoading, setTxLoading] = useState(false);
  const [txMsg, setTxMsg] = useState('');
  // On-chain min amounts (authoritative — not from cached pool object)
  const [onChainMinNgn, setOnChainMinNgn] = useState(null);
  const [onChainMinUsd, setOnChainMinUsd] = useState(null);
  const [minsLoading, setMinsLoading] = useState(true);
  const [assetDecimals, setAssetDecimals] = useState({});

  useEffect(() => {
    if (!l1Config) return;
    const tokenMap = {
      NGNS: l1Config.ngnsTokenAddress,
      CNGN: l1Config.cngnContractAddress,
      USDT: l1Config.usdtContractAddress,
      USDC: l1Config.usdcContractAddress,
    };
    Object.entries(tokenMap).forEach(([sym, addr]) => {
      if (!addr) return;
      fetch(`${SALVA_API_URL}/api/pool/token-decimals?address=${addr}`)
        .then((r) => r.json())
        .then((d) => setAssetDecimals((prev) => ({ ...prev, [sym]: d.decimals ?? 6 })))
        .catch(() => setAssetDecimals((prev) => ({ ...prev, [sym]: 6 })));
    });
  }, [l1Config]);

  useEffect(() => {
    let cancelled = false;
    const fetchMins = async () => {
      setMinsLoading(true);
      try {
        const provider = new ethers.BrowserProvider(window.ethereum);
        const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, provider);
        const [rawNgn, rawUsd] = await Promise.all([
          poolC.getMinuimumNgnAmount(),
          poolC.getMinuimumUSDAmount(),
        ]);
        if (!cancelled) {
          // Both stored as 6-decimal fixed-point on-chain
          setOnChainMinNgn(Number(rawNgn) / 1e6);
          setOnChainMinUsd(Number(rawUsd) / 1e6);
        }
      } catch {
        if (!cancelled) {
          // Fall back to cached pool values
          setOnChainMinNgn(toNum(pool.minNgnAmount));
          setOnChainMinUsd(toNum(pool.minTokenAmount));
        }
      } finally {
        if (!cancelled) setMinsLoading(false);
      }
    };
    fetchMins();
    return () => {
      cancelled = true;
    };
  }, [pool.poolAddress, pool.minNgnAmount, pool.minTokenAmount]);

  const assets = ['NGNS', 'CNGN', 'USDT', 'USDC'];

  const resolveToken = (sym) => {
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

  // Returns raw float — never a formatted string (fixes the parseFloat-on-comma bug)
  const rawBalanceForAsset = (a) => {
    if (a === 'NGNS') return toNum(pool.ngnsLiquidity);
    if (a === 'CNGN') return toNum(pool.cNgnLiquidity);
    if (a === 'USDT') return toNum(pool.usdtLiquidity);
    if (a === 'USDC') return toNum(pool.usdcLiquidity);
    return 0;
  };

  const withTx = async (label, fn) => {
    setTxLoading(true);
    setTxMsg(label);
    try {
      await fn();
    } catch (err) {
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        showMsg('Transaction cancelled.', 'info');
      } else {
        showMsg('Transaction failed', 'error');
      }
      wallet.bustCache();
    } finally {
      setTxLoading(false);
      setTxMsg('');
    }
  };

  const getSigner = () => wallet.getSigner();

  const handleProvideLiquidity = () =>
    withTx('Step 1/2: Approving — confirm in wallet…', async () => {
      if (!liqAmount || parseFloat(liqAmount) <= 0) return;
      const signer = await getSigner();
      const tokenAddr = resolveToken(liqAsset);
      if (!tokenAddr) throw new Error(`Unknown asset: ${liqAsset}`);
      const dec = assetDecimals[liqAsset] ?? 6;
      const amtWei = ethers.parseUnits(String(liqAmount), dec);
      const poolAddr = ethers.getAddress(pool.poolAddress);

      const token = new ethers.Contract(ethers.getAddress(tokenAddr), ERC20_ABI, signer);
      await execTx(token.approve(poolAddr, amtWei, { gasLimit: 60_000 }));

      setTxMsg('Step 2/2: Providing liquidity — confirm in wallet…');
      const poolContract = new ethers.Contract(poolAddr, POOL_PROVIDE_ABI, signer);
      await execTx(
        poolContract.provideLiquidity(ethers.getAddress(tokenAddr), amtWei, {
          gasLimit: 150_000,
        })
      );

      showMsg(`${liqAmount} ${liqAsset} added to pool!`);
      setLiqAmount('');
      onRefresh();
    });

  const handleRemoveLiquidity = () =>
    withTx('Removing — confirm in wallet…', async () => {
      if (!liqAmount || parseFloat(liqAmount) <= 0) return;
      const signer = await getSigner();
      const tokenAddr = resolveToken(liqAsset);
      if (!tokenAddr) throw new Error(`Unknown asset: ${liqAsset}`);
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      const dec = assetDecimals[liqAsset] ?? 6;
      await execTx(
        poolC.removeLiquidity(
          ethers.getAddress(tokenAddr),
          ethers.parseUnits(String(liqAmount), dec),
          { gasLimit: 150_000 }
        )
      );
      showMsg(`${liqAmount} ${liqAsset} withdrawn!`);
      setLiqAmount('');
      onRefresh();
    });

  const handleUpdateBuyRate = () =>
    withTx('Updating buy rate — confirm in wallet…', async () => {
      const signer = await getSigner();
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      await execTx(poolC.updateBuyRate(ethers.parseUnits(parseFloat(buyRate).toFixed(6), 6)));
      showMsg('Buy rate updated!');
      onRefresh();
    });

  const handleUpdateSellRate = () =>
    withTx('Updating sell rate — confirm in wallet…', async () => {
      const signer = await getSigner();
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      await execTx(poolC.updateSellRate(ethers.parseUnits(parseFloat(sellRate).toFixed(6), 6)));
      showMsg('Sell rate updated!');
      onRefresh();
    });

  const handlePause = (pause) =>
    withTx(`${pause ? 'Pausing' : 'Unpausing'} — confirm in wallet…`, async () => {
      const signer = await getSigner();
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      await execTx(pause ? poolC.pause() : poolC.unpause());
      showMsg(pause ? 'Pool paused.' : 'Pool unpaused.');
      onRefresh();
    });

  const handleSetMinNgn = () =>
    withTx('Setting min NGNs — confirm in wallet…', async () => {
      if (!minNgn || parseFloat(minNgn) < 0) return;
      const signer = await getSigner();
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      const ngnDec = assetDecimals['NGNS'] ?? 6;
      await execTx(poolC.setMinimumNgnAmount(ethers.parseUnits(String(minNgn), ngnDec)));
      showMsg('Min NGN updated!');
      setOnChainMinNgn(parseFloat(minNgn));
      setMinNgn('');
      onRefresh();
    });

  const handleSetMinToken = () =>
    withTx('Setting min token — confirm in wallet…', async () => {
      if (!minToken || parseFloat(minToken) < 0) return;
      const signer = await getSigner();
      const poolC = new ethers.Contract(ethers.getAddress(pool.poolAddress), POOL_ABI, signer);
      // Use USDT decimals as the reference for stable minimum (same precision as USDC)
      const usdDec = assetDecimals['USDT'] ?? 6;
      await execTx(poolC.setMinimumTokenAmount(ethers.parseUnits(String(minToken), usdDec)));
      showMsg('Min USD updated!');
      setOnChainMinUsd(parseFloat(minToken));
      setMinToken('');
      onRefresh();
    });

  // Accumulated totals for the header summary
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity);

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
      <motion.div
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        onClick={onClose}
      />
      <motion.div
        className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[92vh] flex flex-col overflow-hidden"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
        <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />

        {/* Header */}
        <div className="px-6 pt-5 pb-4 border-b border-white/[0.05]">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0">
              <p className="text-[9px] uppercase tracking-[0.35em] text-blue-400/60 font-black mb-0.5">
                Manage Pool · BNB CHAIN
              </p>
              <p className="font-black text-lg text-white truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <p className="font-mono text-[10px] text-white/60 truncate mt-0.5">
                {pool.poolAddress}
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors flex-shrink-0 mt-1"
            >
              ✕
            </button>
          </div>
          {/* Accumulated totals — numeric addition, not string concat */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center min-w-0">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/60 font-black mb-1">
                NGN Total
              </p>
              <p className="font-black text-sm text-yellow-400 truncate" title={smartFmt(totalNgn)}>
                {compactFmt(totalNgn)}
              </p>
            </div>
            <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06] text-center min-w-0">
              <p className="text-[9px] uppercase tracking-[0.2em] text-white/60 font-black mb-1">
                USD Total
              </p>
              <p className="font-black text-sm text-green-400 truncate" title={smartFmt(totalUsd)}>
                {compactFmt(totalUsd)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-3 border-b border-white/[0.05]">
          <SectionTabs active={activeSection} onChange={setActiveSection} />
        </div>

        {txLoading && (
          <div className="px-6 py-3 border-b border-blue-500/15 bg-blue-500/5 flex items-center gap-3">
            <span className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
            <p className="text-xs font-bold text-blue-400 truncate">{txMsg}</p>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ── LIQUIDITY ── */}
          {activeSection === 'liquidity' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex gap-2">
                {['provide', 'remove'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setLiqMode(m)}
                    className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest border transition-all ${
                      liqMode === m
                        ? m === 'provide'
                          ? 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/20'
                          : 'bg-red-500/10 border-red-500/30 text-red-400'
                        : 'border-white/10 bg-white/5 text-white/60 hover:text-white/70'
                    }`}
                  >
                    {m === 'provide' ? '↑ Add Liquidity' : '↓ Remove Liquidity'}
                  </button>
                ))}
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                  Token
                </label>
                {/* 4 columns — raw balance shown compact below label */}
                <div className="grid grid-cols-4 gap-1.5">
                  {assets.map((a) => {
                    const raw = rawBalanceForAsset(a);
                    return (
                      <button
                        key={a}
                        onClick={() => {
                          setLiqAsset(a);
                          setLiqAmount('');
                        }}
                        className={`py-2.5 rounded-xl border transition-all flex flex-col items-center gap-0.5 min-w-0 ${
                          liqAsset === a
                            ? 'bg-blue-500/10 border-blue-500/40 text-blue-400'
                            : 'border-white/[0.06] bg-white/5 text-white/60 hover:text-white/80'
                        }`}
                      >
                        <span className="text-xs font-black uppercase">{a}</span>
                        {/* compactFmt on the raw float — never on a formatted string */}
                        <span className="text-[9px] text-white/60 truncate w-full text-center px-1">
                          {compactFmt(raw)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[10px] uppercase tracking-widest text-white/60 font-black">
                    Amount
                  </label>
                  {liqMode === 'remove' && (
                    <button
                      type="button"
                      onClick={() => setLiqAmount(String(rawBalanceForAsset(liqAsset)))}
                      className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20"
                    >
                      Max
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={liqAmount}
                    onChange={(e) => setLiqAmount(e.target.value)}
                    className={`${darkInput} text-xl pr-16`}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-blue-400 font-black text-sm">
                    {liqAsset}
                  </span>
                </div>
              </div>

              <button
                onClick={liqMode === 'provide' ? handleProvideLiquidity : handleRemoveLiquidity}
                disabled={!liqAmount || parseFloat(liqAmount) <= 0 || txLoading}
                className={`w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg ${
                  liqMode === 'provide'
                    ? 'bg-blue-500 text-white shadow-blue-500/20'
                    : 'bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white'
                }`}
              >
                {txLoading && (
                  <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                )}
                {txLoading
                  ? 'Processing…'
                  : liqMode === 'provide'
                    ? `Add ${liqAsset}`
                    : `Remove ${liqAsset}`}
              </button>
            </motion.div>
          )}

          {/* ── RATES ── */}
          {activeSection === 'rates' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="px-4 py-3 rounded-xl bg-white/5 border border-white/10">
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Rates in <span className="font-black text-blue-400">NGN per USD</span>. Each saves
                  as a separate on-chain tx.
                </p>
              </div>
              {[
                {
                  label: 'Buy Rate',
                  color: 'green',
                  current: pool.buyRate,
                  value: buyRate,
                  setValue: setBuyRate,
                  action: handleUpdateBuyRate,
                },
                {
                  label: 'Sell Rate',
                  color: 'blue',
                  current: pool.sellRate,
                  value: sellRate,
                  setValue: setSellRate,
                  action: handleUpdateSellRate,
                },
              ].map(({ label, color, current, value, setValue, action }) => (
                <div
                  key={label}
                  className={`rounded-2xl border border-${color}-500/20 bg-${color}-500/[0.02] overflow-hidden`}
                >
                  <div
                    className={`h-px bg-gradient-to-r from-transparent via-${color}-500/30 to-transparent`}
                  />
                  <div className="p-5 space-y-3">
                    <div>
                      <p className={`text-xs font-black text-${color}-400`}>{label}</p>
                      <p className="text-[10px] text-white/60 mt-0.5">
                        Current: ₦{toNum(current).toLocaleString()}
                      </p>
                    </div>
                    <div className="relative">
                      <input
                        type="number"
                        placeholder="e.g. 1490"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        className={`w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-${color}-400 outline-none text-xl font-black text-white transition-all pr-16`}
                      />
                      <span
                        className={`absolute right-4 top-1/2 -translate-y-1/2 text-${color}-400 font-black text-sm`}
                      >
                        NGN
                      </span>
                    </div>
                    <button
                      onClick={action}
                      disabled={txLoading || !value}
                      className={`w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all disabled:opacity-40 flex items-center justify-center gap-2 bg-${color}-500/10 border border-${color}-500/25 text-${color}-400 hover:bg-${color}-500 hover:text-${color === 'green' ? 'black' : 'white'} hover:border-${color}-500`}
                    >
                      {txLoading && (
                        <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                      )}
                      Set {label} On-Chain
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          {/* ── CONTROLS ── */}
          {activeSection === 'controls' && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="px-4 py-3 rounded-xl bg-yellow-500/5 border border-yellow-500/15">
                <p className="text-xs font-black text-yellow-400 mb-0.5">Emergency Controls</p>
                <p className="text-[11px] text-white/60 leading-relaxed">
                  Pausing stops all swaps. Confirm each in your wallet.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => handlePause(true)}
                  disabled={txLoading}
                  className="py-3.5 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 font-black text-xs uppercase tracking-widest hover:bg-yellow-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ⏸ Pause
                </button>
                <button
                  onClick={() => handlePause(false)}
                  disabled={txLoading}
                  className="py-3.5 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 font-black text-xs uppercase tracking-widest hover:bg-green-500 hover:text-black transition-all disabled:opacity-40"
                >
                  ▶ Unpause
                </button>
              </div>
              {[
                {
                  label: 'Min NGN Per Swap',
                  current: minsLoading
                    ? 'Loading…'
                    : onChainMinNgn > 0
                      ? `${onChainMinNgn.toLocaleString('en-US', { maximumFractionDigits: 2 })} NGN`
                      : 'Not set',
                  placeholder: 'e.g. 1000',
                  value: minNgn,
                  setValue: setMinNgn,
                  action: handleSetMinNgn,
                  actionLabel: 'Set Min NGN',
                },
                {
                  label: 'Min USD Per Swap',
                  current: minsLoading
                    ? 'Loading…'
                    : onChainMinUsd > 0
                      ? `${onChainMinUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`
                      : 'Not set',
                  placeholder: 'e.g. 5',
                  value: minToken,
                  setValue: setMinToken,
                  action: handleSetMinToken,
                  actionLabel: 'Set Min USD',
                },
              ].map(({ label, current, placeholder, value, setValue, action, actionLabel }) => (
                <div
                  key={label}
                  className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.02] overflow-hidden"
                >
                  <div className="h-px bg-gradient-to-r from-transparent via-blue-500/30 to-transparent" />
                  <div className="p-5 space-y-3">
                    <div>
                      <p className="text-xs font-black text-blue-400">{label}</p>
                      <p className="text-[10px] text-white/60 mt-0.5">Current: {current}</p>
                    </div>
                    <input
                      type="number"
                      placeholder={placeholder}
                      value={value}
                      onChange={(e) => setValue(e.target.value)}
                      className={darkInput}
                    />
                    <button
                      onClick={action}
                      disabled={txLoading || !value}
                      className="w-full py-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400 font-black text-xs uppercase tracking-widest hover:bg-blue-500 hover:text-white hover:border-blue-500 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                    >
                      {txLoading && (
                        <span className="w-3 h-3 border-2 border-current/40 border-t-current rounded-full animate-spin" />
                      )}
                      {actionLabel}
                    </button>
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  );
};

// ── Pool Card ─────────────────────────────────────────────────────────────────
const L1PoolCard = ({ pool, index, onManage, onPublish, onRename, onDelete }) => {
  // Numeric addition of both NGN tokens, both USD tokens
  const totalNgn = toNum(pool.ngnsLiquidity) + toNum(pool.cNgnLiquidity);
  const totalUsd = toNum(pool.usdtLiquidity) + toNum(pool.usdcLiquidity);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] overflow-hidden hover:border-blue-500/20 transition-all"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="p-5 space-y-4">
        {/* Identity */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <p className="font-black text-blue-400 text-base truncate">
                {pool.poolName || 'Unnamed Pool'}
              </p>
              <SubBadge pool={pool} />
            </div>
            <p className="font-mono text-[10px] text-white/60 truncate">{pool.poolAddress}</p>
            {pool.subscriptionExpiresAt && new Date(pool.subscriptionExpiresAt) > new Date() && (
              <p className="text-[9px] text-white/60 mt-0.5">
                Expires{' '}
                {new Date(pool.subscriptionExpiresAt).toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </p>
            )}
          </div>
        </div>

        {/* ── Liquidity stats: 4 cells — NGNs, cNGN, USDT, USDC ── */}
        <div className="grid grid-cols-4 gap-1.5">
          <StatCell label="NGNs" value={toNum(pool.ngnsLiquidity)} color="#D4AF37" />
          <StatCell label="cNGN" value={toNum(pool.cNgnLiquidity)} color="#b59030" />
          <StatCell label="USDT" value={toNum(pool.usdtLiquidity)} color="#22c55e" />
          <StatCell label="USDC" value={toNum(pool.usdcLiquidity)} color="#3b82f6" />
        </div>

        {/* Accumulated summary row */}
        <div className="grid grid-cols-2 gap-1.5">
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-between gap-2 min-w-0">
            <span className="text-[9px] uppercase tracking-widest text-yellow-400/60 font-black flex-shrink-0">
              NGN Total
            </span>
            <span
              className="text-xs font-black text-yellow-400 truncate"
              title={smartFmt(totalNgn)}
            >
              {compactFmt(totalNgn)}
            </span>
          </div>
          <div className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.05] flex items-center justify-between gap-2 min-w-0">
            <span className="text-[9px] uppercase tracking-widest text-green-400/60 font-black flex-shrink-0">
              USD Total
            </span>
            <span className="text-xs font-black text-green-400 truncate" title={smartFmt(totalUsd)}>
              {compactFmt(totalUsd)}
            </span>
          </div>
        </div>

        {/* Rate stats */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[9px] uppercase tracking-widest text-green-400/50 font-black mb-1">
              Buy Rate
            </p>
            <p className="font-black text-sm text-green-400">
              ₦{toNum(pool.buyRate).toLocaleString()}
              <span className="text-[10px] text-white/60 font-normal">/USD</span>
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.06]">
            <p className="text-[9px] uppercase tracking-widest text-blue-400/50 font-black mb-1">
              Sell Rate
            </p>
            <p className="font-black text-sm text-blue-400">
              ₦{toNum(pool.sellRate).toLocaleString()}
              <span className="text-[10px] text-white/60 font-normal">/USD</span>
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onManage}
            className="flex-1 py-2.5 rounded-xl bg-white/5 border border-white/[0.07] text-white font-black text-xs uppercase tracking-widest hover:bg-white/10 transition-all"
          >
            ⚙ Manage
          </button>
          <button
            onClick={onPublish}
            className="flex-1 py-2.5 rounded-xl bg-blue-500 text-white font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-lg shadow-blue-500/20"
          >
            {pool.isPublished ? 'Extend' : 'Publish'}
          </button>
          <button
            onClick={onRename}
            className="py-2.5 px-3.5 rounded-xl border border-blue-500/25 text-blue-400 font-black text-xs uppercase hover:bg-blue-500/10 transition-all"
          >
            {pool.poolName ? '✎' : 'Name'}
          </button>
          <button
            onClick={onDelete}
            className="py-2.5 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 font-black text-xs uppercase hover:bg-red-500 hover:text-white transition-all"
          >
            🗑
          </button>
        </div>
      </div>
    </motion.div>
  );
};

// ── Wallet bar for deploy page ─────────────────────────────────────────────────
const DeployWalletSection = ({ wallet, showNoWallet, onShowNoWallet }) => {
  if (showNoWallet) return null;

  if (!wallet.isConnected) {
    return (
      <div className="p-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] space-y-3">
        <p className="text-xs text-white/60 font-bold">
          Connect your Ethereum wallet to deploy & manage pools
        </p>
        <button
          onClick={wallet.connect}
          disabled={wallet.status === 'connecting'}
          className="w-full py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {wallet.status === 'connecting' ? (
            <>
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Connecting…
            </>
          ) : (
            <>🔗 Connect Wallet</>
          )}
        </button>
        {wallet.error && (
          <p className="text-[11px] text-red-400 font-bold text-center">{wallet.error}</p>
        )}
        <button
          onClick={onShowNoWallet}
          className="w-full text-[10px] text-white/30 font-bold hover:text-white/50 transition-colors"
        >
          Don't have a wallet?
        </button>
      </div>
    );
  }

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

// ── Main L1DeployPool ─────────────────────────────────────────────────────────
const L1DeployPool = ({ l1Config, configLoading, showMsg }) => {
  const wallet = useWallet();

  const [pools, setPools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [subFees, setSubFees] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [managingPool, setManagingPool] = useState(null);
  const [showSubModal, setShowSubModal] = useState(false);
  const [selectedPool, setSelectedPool] = useState(null);
  const [subTier, setSubTier] = useState(1);
  const [subscribing, setSubscribing] = useState(false);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [newlyDeployedPool, setNewlyDeployedPool] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingPool, setDeletingPool] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [registries, setRegistries] = useState([]);
  const [showNoWallet, setShowNoWallet] = useState(false);

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamingPool, setRenamingPool] = useState(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameRegistry, setRenameRegistry] = useState(null);
  const [renameStep, setRenameStep] = useState('form');
  const [renameCheckResult, setRenameCheckResult] = useState(null);
  const [renamePrepared, setRenamePrepared] = useState(null);
  const [renameError, setRenameError] = useState('');
  const [renameChecking, setRenameChecking] = useState(false);
  const [renameLoading, setRenameLoading] = useState(false);
  const [renameFee, setRenameFee] = useState(null);
  const [renameFeeLoading, setRenameFeeLoading] = useState(false);
  const [renamePin, setRenamePin] = useState('');
  const [renamePinLoading, setRenamePinLoading] = useState(false);

  const l1Account = wallet.account;

  const l2User = (() => {
    try {
      return JSON.parse(localStorage.getItem('salva_user') || '{}');
    } catch {
      return {};
    }
  })();

  const fetchMyPools = useCallback(
    async (silent = false) => {
      if (!l1Account) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const res = await fetch(`${SALVA_API_URL}/api/pool/l1/my/${l1Account}`);
        const data = await res.json();
        setPools(data.pools || []);
      } catch {
        setPools([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [l1Account]
  );

  const fetchSubFees = useCallback(async () => {
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/subscription-fee`);
      const data = await res.json();
      setSubFees(data);
    } catch {}
  }, []);

  useEffect(() => {
    if (l1Account) fetchMyPools();
    fetchSubFees();
    fetch(`${SALVA_API_URL}/api/registries`)
      .then((r) => r.json())
      .then((d) => setRegistries(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [fetchMyPools, fetchSubFees, l1Account]);

  useEffect(() => {
    if (wallet.status === 'no_wallet') setShowNoWallet(true);
  }, [wallet.status]);

  // ── Deploy ────────────────────────────────────────────────────────────────
  const handleDeploy = async () => {
    if (!wallet.isConnected) {
      showMsg('Connect your wallet first.', 'error');
      return;
    }
    if (wallet.wrongChain) {
      showMsg('Switch to BSC first.', 'error');
      return;
    }
    if (!l1Config?.poolFactoryAddress) {
      showMsg('Config not loaded yet — please refresh.', 'error');
      return;
    }

    setDeploying(true);
    try {
      const signer = await wallet.getSigner();
      const factory = new ethers.Contract(
        ethers.getAddress(l1Config.poolFactoryAddress),
        FACTORY_ABI,
        signer
      );

      const tx = await factory.deployPool({ gasLimit: 500_000 });
      showMsg('Pool deployment submitted — waiting for confirmation…', 'info');

      const receipt = await waitWithTimeout(tx, 1, 120_000);
      if (!receipt || receipt.status === 0) throw new Error('Deploy transaction reverted');

      const TOPIC = ethers.id('PoolDeployed(address,address)');
      let poolAddress = null;
      for (const log of receipt.logs) {
        try {
          if (!log.topics || log.topics.length < 3) continue;
          if (log.topics[0].toLowerCase() !== TOPIC.toLowerCase()) continue;
          poolAddress = ethers.getAddress('0x' + log.topics[2].slice(-40));
          break;
        } catch {}
      }

      if (!poolAddress) {
        showMsg('Pool deployed but address not found in event — check Etherscan', 'warning');
        return;
      }

      await fetch(`${SALVA_API_URL}/api/pool/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ poolAddress, ownerSafeAddress: l1Account }),
      }).catch(() => {});

      showMsg('Pool deployed! 🎉');
      await fetchMyPools();
      setNewlyDeployedPool(poolAddress);
      setShowNamePrompt(true);
    } catch (err) {
      wallet.bustCache();
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        showMsg('Deployment cancelled.', 'info');
      } else {
        showMsg('Pool deployment failed — please try again', 'error');
      }
    } finally {
      setDeploying(false);
    }
  };

  // ── Subscribe ─────────────────────────────────────────────────────────────
  const handleSubscribe = async () => {
    if (!wallet.isConnected) {
      showMsg('Connect your wallet first.', 'error');
      return;
    }
    if (wallet.wrongChain) {
      showMsg('Switch to BSC first.', 'error');
      return;
    }
    if (!selectedPool || !l1Config?.ngnsTokenAddress || !l1Config?.treasuryAddress) return;

    setSubscribing(true);
    try {
      const monthly = subFees?.monthly || 5000;
      const total = monthly * subTier;
      // Fetch NGNs decimals from the factory before computing wei amounts
      let ngnsDec = 6;
      try {
        const decRes = await fetch(
          `${SALVA_API_URL}/api/pool/token-decimals?address=${l1Config.ngnsTokenAddress}`
        );
        const decData = await decRes.json();
        ngnsDec = decData.decimals ?? 6;
      } catch {
        // fallback to 6 if fetch fails — better than crashing
      }

      const totalWei = ethers.parseUnits(String(total), ngnsDec);
      const signer = await wallet.getSigner();

      const ngnToken = new ethers.Contract(
        ethers.getAddress(l1Config.ngnsTokenAddress),
        ERC20_ABI,
        signer
      );

      const bal = await ngnToken.balanceOf(ethers.getAddress(l1Account));
      if (bal < totalWei) {
        showMsg(`Insufficient NGNs. You need ${total.toLocaleString()} NGNs.`, 'error');
        return;
      }

      const { txHash } = await execTx(
        ngnToken.transfer(ethers.getAddress(l1Config.treasuryAddress), totalWei, {
          gasLimit: 100_000,
        }),
        120_000
      );

      await fetch(`${SALVA_API_URL}/api/pool/subscribe-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: selectedPool.poolAddress,
          ownerSafeAddress: l1Account,
          months: subTier,
          txHash,
        }),
      });

      showMsg(`Pool published! ${subTier} month(s) added. 🎉`);
      await fetchMyPools();
    } catch (err) {
      wallet.bustCache();
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        showMsg('Subscription cancelled.', 'info');
      } else {
        showMsg('Could not publish pool — please try again', 'error');
      }
    } finally {
      setSubscribing(false);
      setShowSubModal(false);
      setSelectedPool(null);
    }
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deletingPool) return;
    setDeleting(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/pool/delete-direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: deletingPool.poolAddress,
          ownerSafeAddress: l1Account,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      showMsg(
        deletingPool.poolName
          ? `Pool deleted & "${deletingPool.poolName}" unlinked.`
          : 'Pool removed.'
      );
      await fetchMyPools();
    } catch (err) {
      showMsg('Could not remove pool — please try again', 'error');
    } finally {
      setDeleting(false);
      setShowDeleteConfirm(false);
      setDeletingPool(null);
    }
  };

  // ── Rename helpers ────────────────────────────────────────────────────────
  const resetRenameModal = () => {
    setRenameInput('');
    setRenameRegistry(null);
    setRenameStep('form');
    setRenameCheckResult(null);
    setRenamePrepared(null);
    setRenameError('');
    setRenameFee(null);
    setRenameFeeLoading(false);
  };

  const handleRenameCheck = async () => {
    if (!renameInput || !renameRegistry || !renamingPool) return;
    setRenameError('');
    setRenameChecking(true);
    setRenameCheckResult(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/check-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: renameInput,
          registryAddress: renameRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.message || 'Check failed');
        return;
      }
      if (data.reserved) {
        setRenameError('This name is reserved. Choose another.');
        return;
      }
      if (!data.available) {
        setRenameError('Name already taken. Try another.');
        return;
      }
      setRenameCheckResult(data);
      setRenameFee(null);
      setRenameFeeLoading(true);
      try {
        const feeRes = await fetch(`${SALVA_API_URL}/api/registry-fee`);
        const feeData = await feeRes.json();
        setRenameFee(feeRes.ok ? (feeData.fee ?? 0) : 0);
      } catch {
        setRenameFee(0);
      } finally {
        setRenameFeeLoading(false);
      }
      setRenameStep('confirm');
    } catch {
      setRenameError('Network error. Try again.');
    } finally {
      setRenameChecking(false);
    }
  };

  const handleRenamePrepare = async () => {
    if (!renamingPool || !renameRegistry || !renameInput) return;
    setRenameLoading(true);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/alias/link-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: l2User.safeAddress,
          name: renameInput,
          walletToLink: renamingPool.poolAddress,
          registryAddress: renameRegistry.registryAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRenameError(data.message || 'Preparation failed');
        setRenameStep('confirm');
        return;
      }
      if (data.reserved) {
        setRenameError('Name is reserved.');
        return;
      }
      if (data.lowBalance) {
        setRenameError(data.message || 'Insufficient NGNs for registration fee.');
        return;
      }
      setRenamePrepared(data);
      setRenameStep('pin');
    } catch {
      setRenameError('Network error during preparation.');
    } finally {
      setRenameLoading(false);
    }
  };

  const handleRenameExecute = async (pin) => {
    if (!renamingPool || !renamePrepared) return;
    setRenameLoading(true);
    try {
      const pinRes = await fetch(`${SALVA_API_URL}/api/user/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: l2User.email, pin }),
      });
      const pinData = await pinRes.json();
      if (!pinRes.ok) {
        setRenameError(pinData.message || 'Invalid PIN');
        setRenameLoading(false);
        return;
      }

      setRenameStep('renaming');
      setShowRenameModal(false);

      if (renamingPool.poolName) {
        const unlinkRes = await fetch(`${SALVA_API_URL}/api/alias/unlink-name`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            safeAddress: l2User.safeAddress,
            weldedName: renamingPool.poolName.trim(),
            registryAddress: renamePrepared.registryAddress,
            userPrivateKey: pinData.privateKey,
          }),
        });
        if (!unlinkRes.ok) {
          showMsg('Failed to unlink old name', 'error');
          resetRenameModal();
          setRenameLoading(false);
          return;
        }
      }

      const execRes = await fetch(`${SALVA_API_URL}/api/alias/execute-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          safeAddress: l2User.safeAddress,
          ...renamePrepared,
          userPrivateKey: pinData.privateKey,
        }),
      });
      if (!execRes.ok) {
        showMsg('Failed to link new name', 'error');
        resetRenameModal();
        setRenameLoading(false);
        return;
      }

      await fetch(`${SALVA_API_URL}/api/pool/l1/set-name`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          poolAddress: renamingPool.poolAddress,
          ownerSafeAddress: l1Account,
          poolName: renamePrepared.weldedName,
        }),
      }).catch(() => {});

      showMsg(`Pool named "${renamePrepared.weldedName}"! 🎉`);
      await fetchMyPools();
    } catch {
      showMsg('Rename failed', 'error');
    } finally {
      resetRenameModal();
      setRenamingPool(null);
      setRenameLoading(false);
    }
  };

  const handleRenamePinConfirm = async () => {
    if (renamePin.length !== 4) return;
    setRenamePinLoading(true);
    await handleRenameExecute(renamePin);
    setRenamePin('');
    setRenamePinLoading(false);
  };

  const openRenameModal = (pool) => {
    setRenamingPool(pool);
    setRenameInput('');
    setRenameRegistry(registries.length === 1 ? registries[0] : null);
    setRenameStep('form');
    setRenameCheckResult(null);
    setRenamePrepared(null);
    setRenameError('');
    setRenamePin('');
    setShowRenameModal(true);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-shrink-0">
            <h2 className="text-xl sm:text-3xl font-black tracking-tight">My Pools</h2>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <a
              href="/dashboard"
              className="flex items-center gap-1 px-2 py-1.5 rounded-xl border border-salvaGold/30 bg-salvaGold/[0.07] hover:bg-salvaGold/[0.14] transition-all"
            >
              <span className="text-[8px] font-black uppercase tracking-widest text-salvaGold">
                Base
              </span>
              <span className="text-salvaGold text-[9px]">↗</span>
            </a>
            <button
              onClick={() => fetchMyPools(true)}
              disabled={loading || refreshing}
              className="w-9 h-9 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-blue-400/30 transition-all flex-shrink-0"
            >
              {loading || refreshing ? (
                <span className="w-3.5 h-3.5 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin" />
              ) : (
                <span className="text-blue-400 text-base leading-none">↻</span>
              )}
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying || !wallet.isConnected || wallet.wrongChain || configLoading}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-500 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:brightness-110 transition-all disabled:opacity-50 shadow-lg shadow-blue-500/20 flex-shrink-0"
            >
              {deploying && (
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              {deploying ? 'Deploying…' : '+ Deploy'}
            </button>
          </div>
        </div>
      </div>

      {wallet.isConnected && wallet.wrongChain && (
        <SwitchChainBanner
          onSwitch={wallet.switchChain}
          chainName={process.env.NODE_ENV === 'production' ? 'BNB Smart Chain' : 'BNB Testnet'}
        />
      )}

      {/* Info */}
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.06]">
        <p className="text-xs font-black text-blue-400 mb-1">How it works on BNB CHAIN</p>
        <p className="text-[11px] text-white/60 leading-relaxed">
          Deploy your pool directly from your wallet. Add liquidity, set rates, then publish it. A
          subscription of{' '}
          <span className="font-black text-blue-400">
            {subFees?.monthly?.toLocaleString() || '5,000'} NGN/month
          </span>{' '}
          keeps it visible. Your MetaMask wallet signs pool txs. Naming uses your Salva Wallet via
          relay.
        </p>
      </div>

      {/* Pool list */}
      {!wallet.isConnected ? (
        <div className="py-16 rounded-3xl border border-dashed border-white/[0.06] text-center">
          <p className="font-black text-white/40 text-sm">Connect your wallet to see your pools</p>
        </div>
      ) : loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-2 border-blue-400/20 border-t-blue-400 rounded-full animate-spin" />
        </div>
      ) : pools.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-20 rounded-3xl border border-dashed border-white/[0.06] text-center"
        >
          <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl">🏊</span>
          </div>
          <p className="font-black text-white/60 text-sm mb-1">No pools yet</p>
          <p className="text-[11px] text-white/60">
            Deploy your first pool to start earning as an LP on Ethereum Chain
          </p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {pools.map((pool, i) => (
            <L1PoolCard
              key={pool.poolAddress}
              pool={pool}
              index={i}
              onManage={() => setManagingPool(pool)}
              onPublish={() => {
                setSelectedPool(pool);
                setShowSubModal(true);
              }}
              onRename={() => openRenameModal(pool)}
              onDelete={() => {
                setDeletingPool(pool);
                setShowDeleteConfirm(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Manage Panel */}
      <AnimatePresence>
        {managingPool && (
          <L1PoolManagePanel
            pool={managingPool}
            l1Config={l1Config}
            wallet={wallet}
            showMsg={showMsg}
            onClose={() => setManagingPool(null)}
            onRefresh={async () => {
              await fetchMyPools(true);
              const res = await fetch(`${SALVA_API_URL}/api/pool/l1/my/${l1Account}`);
              const data = await res.json();
              const fresh = (data.pools || []).find(
                (p) => p.poolAddress === managingPool.poolAddress
              );
              if (fresh) setManagingPool(fresh);
            }}
          />
        )}
      </AnimatePresence>

      {/* Subscribe Modal */}
      <AnimatePresence>
        {showSubModal && selectedPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSubModal(false)}
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
                <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-1">
                  Marketplace · BNB CHAIN
                </p>
                <h3 className="text-xl font-black mb-1 text-white">Publish Pool</h3>
                <p className="text-xs text-white/60 mb-5 leading-relaxed">
                  List your pool on the market place, Confirm in MetaMask.
                  {selectedPool.isPublished && ' Remaining time is preserved.'}
                </p>
                <div className="space-y-2 mb-5">
                  {subFees?.tiers?.map((tier) => (
                    <button
                      key={tier.months}
                      onClick={() => setSubTier(tier.months)}
                      className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                        subTier === tier.months
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-white/10 bg-white/5 hover:border-blue-500/30'
                      }`}
                    >
                      <span className="font-black text-sm text-white">{tier.label}</span>
                      <span
                        className={`font-black text-sm ${subTier === tier.months ? 'text-blue-400' : 'text-white/60'}`}
                      >
                        {tier.total.toLocaleString()} NGNs
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowSubModal(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSubscribe}
                    disabled={subscribing}
                    className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                  >
                    {subscribing && (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {subscribing ? 'Subscribing…' : 'Subscribe'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Name Prompt after deploy */}
      <AnimatePresence>
        {showNamePrompt && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowNamePrompt(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="p-8">
                <div className="w-14 h-14 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🏷️</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">Name Your Pool?</h3>
                <p className="text-xs text-white/60 mb-2 leading-relaxed">
                  Give it a human-readable identity like{' '}
                  <span className="text-blue-400 font-black">mypool@salva</span>
                </p>
                <p className="font-mono text-[10px] text-white/60 mb-6 break-all">
                  {newlyDeployedPool}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowNamePrompt(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => {
                      setShowNamePrompt(false);
                      const newPool = pools.find(
                        (p) => p.poolAddress.toLowerCase() === newlyDeployedPool?.toLowerCase()
                      ) || { poolAddress: newlyDeployedPool, poolName: null };
                      openRenameModal(newPool);
                    }}
                    className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 shadow-lg shadow-blue-500/20 transition-all"
                  >
                    Proceed
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {showDeleteConfirm && deletingPool && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteConfirm(false)}
            />
            <motion.div
              className="relative bg-zinc-950 border border-red-500/20 rounded-3xl w-full max-w-sm shadow-2xl overflow-hidden text-center"
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
              <div className="p-8">
                <div className="w-14 h-14 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">⚠️</span>
                </div>
                <h3 className="text-xl font-black mb-2 text-white">Remove Pool?</h3>
                <p className="text-xs text-white/60 mb-1 leading-relaxed">
                  Removes from the Salva registry. Contract stays on-chain.
                </p>
                <p className="text-xs text-red-400 font-bold mb-4">
                  Must have &lt;1,000 NGNs/cNGN and &lt;$1 in stablecoins.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteConfirm(false)}
                    className="flex-1 py-3.5 rounded-xl border border-white/10 text-white font-bold text-sm hover:bg-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-3.5 rounded-xl bg-red-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  >
                    {deleting && (
                      <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    )}
                    {deleting ? 'Removing…' : 'Yes, Remove'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Rename Modal */}
      <AnimatePresence>
        {showRenameModal && renamingPool && (
          <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center px-0 sm:px-4">
            <motion.div
              className="absolute inset-0 bg-black/95 backdrop-blur-md"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setShowRenameModal(false);
                resetRenameModal();
              }}
            />
            <motion.div
              className="relative bg-zinc-950 border border-white/10 rounded-t-[2.5rem] sm:rounded-3xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-px bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
              <div className="w-10 h-1 bg-white/10 rounded-full mx-auto mt-4 mb-1 sm:hidden" />
              <div className="px-6 pt-5 pb-4 border-b border-white/[0.05] flex items-center justify-between">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.45em] text-blue-400/60 font-black mb-0.5">
                    Salva NS · BASE CHAIN
                  </p>
                  <h3 className="text-xl font-black text-white">
                    {renamingPool.poolName ? 'Rename Pool' : 'Name Pool'}
                  </h3>
                  <p className="font-mono text-[10px] text-white/60 truncate mt-0.5">
                    {renamingPool.poolAddress}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowRenameModal(false);
                    resetRenameModal();
                  }}
                  className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="flex-1 overflow-y-auto overflow-x-visible p-6 space-y-5">
                {!l2User?.email && (
                  <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20">
                    <p className="text-xs font-black text-yellow-400 mb-1">Salva Wallet Required</p>
                    <p className="text-[11px] text-white/60 leading-relaxed">
                      Naming uses your Salva wallet via relay. Please{' '}
                      <a href="/login" className="text-yellow-400 underline">
                        log in to your Salva Wallet (Base)
                      </a>{' '}
                      first.
                    </p>
                  </div>
                )}
                {renamingPool.poolName && (
                  <div className="flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <span className="text-[10px] uppercase font-black text-white/60 tracking-widest flex-shrink-0">
                      Current
                    </span>
                    <span className="text-blue-400 font-black text-sm truncate flex-1">
                      {renamingPool.poolName}
                    </span>
                    <span className="text-[9px] text-white/60 font-bold flex-shrink-0">
                      will unlink
                    </span>
                  </div>
                )}

                {renameStep === 'form' && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div>
                      <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                        Name
                      </label>
                      <input
                        type="text"
                        placeholder="poolname"
                        value={renameInput}
                        onChange={(e) => {
                          setRenameInput(e.target.value.toLowerCase().replace(/[^a-z2-9.]/g, ''));
                          setRenameError('');
                        }}
                        maxLength={32}
                        className={darkInput}
                      />
                      {renameInput && renameRegistry && (
                        <p className="text-[10px] text-blue-400/60 font-bold mt-1.5 ml-1">
                          Preview: {renameInput}
                          {renameRegistry.nspace}
                        </p>
                      )}
                    </div>
                    <div className="pb-48">
                      <label className="text-[10px] uppercase tracking-widest text-white/60 font-black block mb-2">
                        Wallet Service
                      </label>
                      <RegistryDropdown
                        registries={registries}
                        value={renameRegistry}
                        onChange={(r) => {
                          setRenameRegistry(r);
                          setRenameError('');
                        }}
                      />
                    </div>
                    {renameError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-xs">⚠</span>
                        <p className="text-xs text-red-400 font-bold">{renameError}</p>
                      </div>
                    )}
                    <button
                      onClick={handleRenameCheck}
                      disabled={renameChecking || !renameInput || !renameRegistry || !l2User?.email}
                      className="w-full py-4 bg-blue-500 text-white font-black rounded-xl hover:brightness-110 transition-all disabled:opacity-40 uppercase tracking-widest text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
                    >
                      {renameChecking && (
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      )}
                      {renameChecking ? 'Checking…' : 'Check Availability'}
                    </button>
                  </motion.div>
                )}

                {renameStep === 'confirm' && renameCheckResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-4"
                  >
                    <div className="p-5 rounded-2xl bg-blue-500/8 border border-blue-500/20 text-center">
                      <p className="text-[9px] uppercase tracking-[0.3em] font-black text-blue-400/50 mb-2">
                        Name Available
                      </p>
                      <p className="text-2xl font-black text-blue-400">
                        {renameCheckResult.welded}
                      </p>
                    </div>
                    {renameFeeLoading ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                        <div className="w-4 h-4 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin flex-shrink-0" />
                        <p className="text-xs text-blue-400 font-bold">
                          Fetching registration fee…
                        </p>
                      </div>
                    ) : renameFee !== null && renameFee > 0 ? (
                      <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
                        <p className="text-[10px] uppercase font-black text-white/60 tracking-widest">
                          Registration Fee
                        </p>
                        <p className="font-black text-white text-sm">
                          {renameFee?.toLocaleString()}{' '}
                          <span className="text-blue-400 text-xs">NGNs</span>
                        </p>
                      </div>
                    ) : renameFee === 0 ? (
                      <div className="flex items-center gap-3 p-4 rounded-xl bg-green-500/8 border border-green-500/15">
                        <p className="text-xs font-black text-green-400">✦ Free Registration</p>
                      </div>
                    ) : null}
                    {renameError && (
                      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/8 border border-red-500/20">
                        <span className="text-red-400 text-xs">⚠</span>
                        <p className="text-xs text-red-400 font-bold">{renameError}</p>
                      </div>
                    )}
                    <div className="flex gap-3 pt-1">
                      <button
                        onClick={() => setRenameStep('form')}
                        className="flex-1 py-3.5 rounded-xl border border-white/10 font-bold text-sm text-white hover:bg-white/5 transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRenamePrepare}
                        disabled={renameLoading || renameFeeLoading}
                        className="flex-1 py-3.5 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                      >
                        {renameLoading && (
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {renameLoading ? 'Preparing…' : 'Confirm & Enter PIN'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {renameStep === 'pin' && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-6 rounded-2xl border border-white/[0.07] bg-white/[0.02] space-y-5 text-center"
                  >
                    <div className="w-12 h-12 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-center justify-center mx-auto">
                      <span className="text-xl">🔐</span>
                    </div>
                    <div>
                      <p className="font-black text-white text-lg">Salva Wallet PIN</p>
                      <p className="text-[11px] text-white/60 mt-1">
                        Authorise the on-chain name link via your Base Chain Wallet
                      </p>
                    </div>
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="\d{4}"
                      maxLength="4"
                      value={renamePin}
                      onChange={(e) => setRenamePin(e.target.value.replace(/\D/g, ''))}
                      placeholder="••••"
                      autoFocus
                      className="w-full p-4 rounded-xl bg-white/5 border border-white/10 focus:border-blue-400 outline-none text-center text-3xl tracking-[1em] font-black text-white"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => setRenameStep('confirm')}
                        disabled={renamePinLoading}
                        className="flex-1 py-3 rounded-xl border border-white/10 font-bold text-sm text-white/60 hover:text-white transition-all"
                      >
                        Back
                      </button>
                      <button
                        onClick={handleRenamePinConfirm}
                        disabled={renamePinLoading || renamePin.length !== 4}
                        className="flex-1 py-3 rounded-xl bg-blue-500 text-white font-black text-sm hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                      >
                        {renamePinLoading && (
                          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        )}
                        {renamePinLoading ? 'Signing…' : 'Confirm'}
                      </button>
                    </div>
                  </motion.div>
                )}

                {renameStep === 'renaming' && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="py-16 rounded-2xl border border-white/[0.06] bg-white/[0.02] text-center space-y-4"
                  >
                    <div className="relative w-14 h-14 mx-auto">
                      <div className="absolute inset-0 rounded-full border-2 border-blue-400/20" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-blue-400 animate-spin" />
                      <div className="absolute inset-2 rounded-full bg-blue-500/10 flex items-center justify-center">
                        <span className="text-blue-400 text-sm font-black">₦</span>
                      </div>
                    </div>
                    <p className="font-black text-white">Naming on-chain…</p>
                    <p className="text-xs text-white/60">
                      Broadcasting via Base relay · 30–90 seconds
                    </p>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default L1DeployPool;
