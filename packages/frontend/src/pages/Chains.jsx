import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Stars from '../components/Stars';
import { readSupportedChainsCache } from '../utils/walletCache';

const normalizeChain = (chain) =>
  String(chain?.chainName || chain?.name || chain || '')
    .trim()
    .toLowerCase();

const displayChainName = (chain) =>
  String(chain?.chainName || chain?.name || 'Unknown network').toUpperCase();

const ChainLogo = ({ chain }) => {
  const name = displayChainName(chain);

  return (
    <div className="relative w-11 h-11 sm:w-12 sm:h-12 shrink-0 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.045] flex items-center justify-center shadow-inner">
      {chain?.logo ? (
        <img
          src={chain.logo}
          alt=""
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span className="text-sm sm:text-base font-black text-salvaGold">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  );
};

const Chains = ({ user, selectedChain, onSelect, onClose }) => {
  const [chains, setChains] = useState([]);

  const readCache = useCallback(() => {
    if (!user?.email) return;

    const supported = readSupportedChainsCache(user.email);

    setChains(Array.isArray(supported?.chains) ? supported.chains : []);
  }, [user?.email]);

  useEffect(() => {
    readCache();

    const handleCacheUpdate = () => readCache();

    window.addEventListener('salva:chain-cache-updated', handleCacheUpdate);
    window.addEventListener('storage', handleCacheUpdate);

    return () => {
      window.removeEventListener('salva:chain-cache-updated', handleCacheUpdate);
      window.removeEventListener('storage', handleCacheUpdate);
    };
  }, [readCache]);

  const selected = useMemo(() => normalizeChain(selectedChain), [selectedChain]);

  const chooseChain = useCallback(
    (chain) => {
      if (!normalizeChain(chain)) return;
      onSelect(chain);
    },
    [onSelect]
  );

  return (
    <div className="fixed inset-0 z-[40] bg-[#080809] text-white overflow-y-auto">
      <Stars />

      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 h-[460px] w-[460px] -translate-x-1/2 rounded-full bg-salvaGold/[0.045] blur-[120px]" />
        <div className="absolute bottom-[-180px] right-[-100px] h-[380px] w-[380px] rounded-full bg-blue-500/[0.025] blur-[120px]" />
      </div>

      <div className="relative z-10 mx-auto min-h-screen w-full max-w-2xl px-3 pb-20 pt-5 sm:px-5 sm:pt-14">
        <header className="mb-7 flex items-center justify-between sm:mb-9">
          <button
            type="button"
            onClick={onClose}
            className="group inline-flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2 text-[9px] font-black uppercase tracking-[0.18em] text-white/65 transition hover:border-white/15 hover:text-white"
          >
            <span className="text-sm transition-transform group-hover:-translate-x-0.5">←</span>
            Back
          </button>

          <div className="text-right">
            <p className="text-[8px] font-black uppercase tracking-[0.4em] text-salvaGold/70">
              Salva Wallet
            </p>
            <p className="mt-1 text-[9px] text-white/35">
              {chains.length} supported network{chains.length === 1 ? '' : 's'}
            </p>
          </div>
        </header>

        <div className="mb-6 sm:mb-8">
          <p className="mb-2 text-[8px] font-black uppercase tracking-[0.4em] text-salvaGold">
            Networks
          </p>
          <h1 className="text-2xl font-black tracking-[-0.04em] sm:text-4xl">Switch chain</h1>
          <p className="mt-2 max-w-md text-[10px] leading-relaxed text-white/45 sm:text-xs">
            Choose the network where you want Salva to operate.
          </p>
        </div>

        <div className="overflow-hidden rounded-[28px] border border-white/[0.07] bg-white/[0.025] shadow-[0_30px_100px_rgba(0,0,0,.25)]">
          {chains.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.035]">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-salvaGold/20 border-t-salvaGold" />
              </div>
              <p className="text-xs font-black">Loading networks</p>
              <p className="mt-1 text-[9px] text-white/35">
                Supported chains are loaded by Dashboard and read here from cache.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.055]">
              {chains.map((chain) => {
                const name = displayChainName(chain);
                const normalized = normalizeChain(chain);
                const active = normalized === selected;

                return (
                  <button
                    key={chain.chainId || normalized}
                    type="button"
                    onClick={() => chooseChain(chain)}
                    className={`group flex w-full items-center gap-3.5 px-4 py-4 text-left transition-all sm:px-5 sm:py-5 ${
                      active ? 'bg-salvaGold/[0.055]' : 'hover:bg-white/[0.025]'
                    }`}
                  >
                    <ChainLogo chain={chain} />

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-black sm:text-base">{name}</p>
                        {active && (
                          <span className="rounded-full bg-salvaGold/10 px-2 py-0.5 text-[7px] font-black uppercase tracking-widest text-salvaGold">
                            Active
                          </span>
                        )}
                      </div>

                      <p className="mt-1 font-mono text-[8px] text-white/30 sm:text-[9px]">
                        Chain ID {chain.chainId ?? '—'}
                      </p>
                    </div>

                    <span className="shrink-0 text-lg text-white/20 transition group-hover:translate-x-0.5 group-hover:text-white/55">
                      ›
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Chains;
