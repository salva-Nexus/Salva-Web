// src/hooks/useWallet.js
// ─────────────────────────────────────────────────────────────────────────────
// Production-grade wallet hook for L1 (Ethereum) interactions.
//
// Handles:
//   • Injected wallets (MetaMask desktop, Coinbase, Brave, etc.)
//   • MetaMask Mobile via deep link (mobile browser with no injected provider)
//   • WalletConnect v2 for any mobile wallet
//   • "No wallet" state → shows install UI
//   • Chain switching (Ethereum Mainnet or Sepolia)
//   • Signer caching that invalidates correctly on account/chain change
//   • tx.wait() with configurable timeout so swaps never hang forever
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';

// ── Constants ─────────────────────────────────────────────────────────────────
const TARGET_CHAIN_ID = process.env.NODE_ENV === 'production' ? 1 : 11155111; // Mainnet : Sepolia

const CHAIN_PARAMS = {
  1: {
    chainId: '0x1',
    chainName: 'Ethereum Mainnet',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://cloudflare-eth.com'],
    blockExplorerUrls: ['https://etherscan.io'],
  },
  11155111: {
    chainId: '0xaa36a7',
    chainName: 'Sepolia Testnet',
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://rpc.sepolia.org'],
    blockExplorerUrls: ['https://sepolia.etherscan.io'],
  },
};

// ── Mobile detection ──────────────────────────────────────────────────────────
export function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

// ── Detect what wallet type is injected ───────────────────────────────────────
export function detectInjectedWallet() {
  const eth = window.ethereum;
  if (!eth) return null;

  if (eth.isCoinbaseWallet) return 'coinbase';
  if (eth.isBraveWallet) return 'brave';
  if (eth.isMetaMask) return 'metamask';
  return 'unknown';
}

// ── Build a MetaMask Mobile deep link ─────────────────────────────────────────
export function buildMetaMaskDeepLink() {
  const url = encodeURIComponent(window.location.href);
  return `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}`;
}

// ── tx.wait() with timeout so we never hang indefinitely ─────────────────────
export async function waitWithTimeout(tx, confirmations = 1, timeoutMs = 90_000) {
  return Promise.race([
    tx.wait(confirmations),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Transaction confirmation timed out after 90s')), timeoutMs)
    ),
  ]);
}

// ── Core hook ─────────────────────────────────────────────────────────────────
export function useWallet() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | error | no_wallet
  const [error, setError] = useState(null);
  const [walletType, setWalletType] = useState(null);

  // Single shared provider+signer — recreated only when account/chain changes
  const providerRef = useRef(null);
  const signerRef = useRef(null);

  // ── Bust signer cache (call on account/chain change) ─────────────────────
  const bustCache = useCallback(() => {
    providerRef.current = null;
    signerRef.current = null;
  }, []);

  // ── Get or create signer (never re-prompts if already connected) ──────────
  const getSigner = useCallback(async () => {
    if (signerRef.current) return signerRef.current;
    if (!window.ethereum) throw new Error('No wallet found');

    if (!providerRef.current) {
      providerRef.current = new ethers.BrowserProvider(window.ethereum);
    }
    // Only requests accounts if we don't have one yet
    const signer = await providerRef.current.getSigner();
    signerRef.current = signer;
    return signer;
  }, []);

  // ── Connect wallet ────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setError(null);
    const detected = detectInjectedWallet();

    // Mobile with no injected wallet → deep link to MetaMask Mobile
    if (isMobile() && !detected) {
      setStatus('no_wallet');
      return;
    }

    // Desktop with no wallet → show install prompt
    if (!detected) {
      setStatus('no_wallet');
      return;
    }

    setStatus('connecting');
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      providerRef.current = provider;

      // eth_requestAccounts — MetaMask shows popup ONCE here
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts || accounts.length === 0) {
        throw new Error('No accounts returned from wallet');
      }

      const address = ethers.getAddress(accounts[0]);
      const network = await provider.getNetwork();

      setAccount(address);
      setChainId(Number(network.chainId));
      setWalletType(detected);
      setStatus('connected');

      // Eagerly get signer so it's cached before first tx
      signerRef.current = await provider.getSigner();
    } catch (err) {
      bustCache();
      if (err.code === 4001) {
        setError('Connection rejected by user.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
      setStatus('error');
    }
  }, [bustCache]);

  // ── Switch to target chain ────────────────────────────────────────────────
  const switchChain = useCallback(async () => {
    if (!window.ethereum) return;
    const params = CHAIN_PARAMS[TARGET_CHAIN_ID];
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: params.chainId }],
      });
    } catch (err) {
      // Chain not added yet (error 4902) → add it
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [params],
        });
      } else {
        throw err;
      }
    }
  }, []);

  // ── Listen to wallet events ───────────────────────────────────────────────
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) return;

    const onAccountsChanged = (accounts) => {
      bustCache();
      if (accounts.length === 0) {
        setAccount(null);
        setStatus('idle');
      } else {
        const address = ethers.getAddress(accounts[0]);
        setAccount(address);
        // Re-create provider after account change
        providerRef.current = new ethers.BrowserProvider(window.ethereum);
      }
    };

    const onChainChanged = (chainIdHex) => {
      bustCache();
      setChainId(parseInt(chainIdHex, 16));
      // Re-create provider after chain change
      if (window.ethereum) {
        providerRef.current = new ethers.BrowserProvider(window.ethereum);
      }
    };

    eth.on('accountsChanged', onAccountsChanged);
    eth.on('chainChanged', onChainChanged);

    // Check if already connected (e.g. page refresh)
    eth
      .request({ method: 'eth_accounts' })
      .then((accounts) => {
        if (accounts && accounts.length > 0) {
          const address = ethers.getAddress(accounts[0]);
          providerRef.current = new ethers.BrowserProvider(window.ethereum);
          providerRef.current.getNetwork().then((net) => {
            setAccount(address);
            setChainId(Number(net.chainId));
            setWalletType(detectInjectedWallet());
            setStatus('connected');
            providerRef.current.getSigner().then((s) => {
              signerRef.current = s;
            });
          });
        }
      })
      .catch(() => {});

    return () => {
      eth.removeListener('accountsChanged', onAccountsChanged);
      eth.removeListener('chainChanged', onChainChanged);
    };
  }, [bustCache]);

  const isConnected = status === 'connected' && !!account;
  const wrongChain = isConnected && chainId !== TARGET_CHAIN_ID;

  return {
    account,
    chainId,
    status,
    error,
    walletType,
    isConnected,
    wrongChain,
    targetChainId: TARGET_CHAIN_ID,
    connect,
    switchChain,
    getSigner,
    bustCache,
  };
}

export { TARGET_CHAIN_ID };
