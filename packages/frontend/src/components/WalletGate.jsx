// src/components/WalletGate.jsx
// ─────────────────────────────────────────────────────────────────────────────
// Renders:
//   • "Connect Wallet" button when disconnected
//   • "Switch Chain" button when on wrong network
//   • "No Wallet Detected" install card when no wallet found
//   • The children when connected + correct chain
// ─────────────────────────────────────────────────────────────────────────────

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { isMobile, buildMetaMaskDeepLink } from '../hooks/useWallet';

const WALLETS = [
  {
    name: 'MetaMask',
    icon: '🦊',
    description: 'The most popular Ethereum wallet',
    desktopUrl: 'https://metamask.io/download/',
    mobileUrl: null, // handled via deep link
    deepLink: true,
  },
  {
    name: 'Coinbase Wallet',
    icon: '🔵',
    description: 'Self-custody wallet by Coinbase',
    desktopUrl: 'https://www.coinbase.com/wallet/downloads',
    mobileUrl: 'https://www.coinbase.com/wallet',
    deepLink: false,
  },
  {
    name: 'Rainbow',
    icon: '🌈',
    description: 'A fun, simple Ethereum wallet',
    desktopUrl: 'https://rainbow.me/download',
    mobileUrl: 'https://rainbow.me',
    deepLink: false,
  },
];

// ── No Wallet Card ────────────────────────────────────────────────────────────
export const NoWalletCard = ({ onDismiss }) => {
  const mobile = isMobile();
  const mmDeepLink = buildMetaMaskDeepLink();

  // On mobile: primary action is deep-linking into the wallet app,
  // not installing — wallet is almost certainly already installed.
  if (mobile) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        className="rounded-3xl border border-white/10 bg-zinc-950 overflow-hidden"
      >
        <div className="h-px bg-gradient-to-r from-transparent via-salvaGold/50 to-transparent" />
        <div className="p-7">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-12 h-12 rounded-2xl bg-salvaGold/10 border border-salvaGold/20 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl">🔗</span>
            </div>
            <div>
              <h3 className="font-black text-lg text-white">Open in Wallet App</h3>
              <p className="text-[11px] text-white/60 mt-0.5">
                Tap below to open this page inside your wallet's browser
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-2 mb-5">
            <button
              onClick={() => {
                window.location.href = mmDeepLink;
              }}
              className="flex items-center justify-center gap-3 w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98]"
              style={{
                background: '#D4AF37',
                color: '#000',
                boxShadow: '0 8px 24px rgba(212,175,55,0.25)',
              }}
            >
              <span>🦊</span> Open in MetaMask
            </button>
            <button
              onClick={() => {
                window.location.href = 'https://go.cb-wallet.io/dapp';
              }}
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest border border-white/10 bg-white/[0.03] transition-all active:scale-[0.98] text-white"
            >
              <span>🔵</span> Open in Coinbase Wallet
            </button>
            <button
              onClick={() => {
                window.location.href = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(window.location.href)}`;
              }}
              className="flex items-center justify-center gap-3 w-full py-3.5 rounded-2xl font-black text-sm uppercase tracking-widest border border-white/10 bg-white/[0.03] transition-all active:scale-[0.98] text-white"
            >
              <span>🔗</span> Open in Trust Wallet
            </button>
          </div>

          <p className="text-[10px] text-white/30 text-center font-bold mb-4">
            Don't have a wallet yet?
          </p>

          <div className="space-y-2 mb-5">
            {WALLETS.map((w) => (
              <a
                key={w.name}
                href={w.deepLink ? mmDeepLink : w.mobileUrl || w.desktopUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 p-3.5 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-salvaGold/30 transition-all group"
              >
                <span className="text-xl">{w.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-black text-sm text-white">{w.name}</p>
                  <p className="text-[10px] text-white/50">{w.description}</p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest text-salvaGold/60 flex-shrink-0">
                  Install ↗
                </span>
              </a>
            ))}
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="w-full py-3 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:text-white transition-all"
            >
              Back
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  // Desktop: original install-focused layout
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="rounded-3xl border border-white/10 bg-zinc-950 overflow-hidden"
    >
      <div className="h-px bg-gradient-to-r from-transparent via-orange-500/50 to-transparent" />
      <div className="p-7">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center flex-shrink-0">
            <span className="text-2xl">🔐</span>
          </div>
          <div>
            <h3 className="font-black text-lg text-white">No Wallet Found</h3>
            <p className="text-[11px] text-white/60 mt-0.5">
              Install a browser wallet extension to get started
            </p>
          </div>
        </div>

        <div className="space-y-2.5 mb-5">
          {WALLETS.map((w) => (
            <a
              key={w.name}
              href={w.desktopUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 p-4 rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-blue-500/30 hover:bg-blue-500/[0.04] transition-all group"
            >
              <span className="text-2xl">{w.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="font-black text-sm text-white">{w.name}</p>
                <p className="text-[10px] text-white/50">{w.description}</p>
              </div>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                Install ↗
              </span>
            </a>
          ))}
        </div>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="w-full py-3 rounded-xl border border-white/10 text-white/60 font-bold text-sm hover:text-white transition-all"
          >
            Back
          </button>
        )}
      </div>
    </motion.div>
  );
};

// ── Connect Button ────────────────────────────────────────────────────────────
export const ConnectWalletButton = ({
  onConnect,
  connecting,
  error,
  accentColor = '#3b82f6',
  label = 'Connect Wallet',
  compact = false,
}) => (
  <div className={compact ? '' : 'space-y-3'}>
    <button
      onClick={onConnect}
      disabled={connecting}
      className="w-full py-4 rounded-2xl font-black text-sm uppercase tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98]"
      style={{
        background: accentColor,
        color: '#000',
        boxShadow: `0 8px 24px ${accentColor}33`,
      }}
    >
      {connecting ? (
        <>
          <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
          Connecting…
        </>
      ) : (
        <>
          <span>🔗</span>
          {label}
        </>
      )}
    </button>
    {error && <p className="text-[11px] text-red-400 font-bold text-center px-2">{error}</p>}
  </div>
);

// ── Switch Chain Button ───────────────────────────────────────────────────────
export const SwitchChainBanner = ({ onSwitch, chainName = 'Ethereum Mainnet' }) => (
  <motion.div
    initial={{ opacity: 0, y: -4 }}
    animate={{ opacity: 1, y: 0 }}
    className="p-4 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] flex items-center justify-between gap-3"
  >
    <div>
      <p className="text-sm font-black text-orange-400">Wrong Network</p>
      <p className="text-[11px] text-orange-400/70 mt-0.5">Switch to {chainName} to continue</p>
    </div>
    <button
      onClick={onSwitch}
      className="flex-shrink-0 px-4 py-2 rounded-xl bg-orange-500 text-black font-black text-xs uppercase tracking-widest hover:brightness-110 transition-all"
    >
      Switch
    </button>
  </motion.div>
);

// ── WalletGate — wrap any section that needs a wallet ────────────────────────
export const WalletGate = ({
  wallet, // object from useWallet()
  accentColor,
  children,
  label, // optional connect button label override
}) => {
  const [showInstall, setShowInstall] = React.useState(false);

  if (wallet.status === 'no_wallet' || showInstall) {
    return (
      <NoWalletCard
        onDismiss={() => {
          setShowInstall(false);
          if (wallet.status === 'no_wallet') {
            // reset status so the connect button shows again
            wallet.connect?.();
          }
        }}
      />
    );
  }

  if (!wallet.isConnected) {
    return (
      <div className="space-y-3">
        <ConnectWalletButton
          onConnect={async () => {
            await wallet.connect();
          }}
          connecting={wallet.status === 'connecting'}
          error={wallet.error}
          accentColor={accentColor}
          label={label || 'Connect Wallet to Continue'}
        />
        <button
          onClick={() => setShowInstall(true)}
          className="w-full py-2.5 text-[10px] text-white/40 font-bold uppercase tracking-widest hover:text-white/60 transition-colors"
        >
          Don't have a wallet?
        </button>
      </div>
    );
  }

  if (wallet.wrongChain) {
    return (
      <SwitchChainBanner
        onSwitch={wallet.switchChain}
        chainName={process.env.NODE_ENV === 'production' ? 'BNB Smart Chain' : 'BNB Testnet'}
      />
    );
  }

  return children;
};
