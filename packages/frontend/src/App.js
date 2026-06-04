// src/App.js
import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import SetTransactionPin from './pages/SetTransactionPin';
import AccountSettings from './pages/AccountSettings';
import L1Dashboard from './pages/L1Dashboard';

const LoadingSpinner = () => (
  <div className="flex items-center justify-center min-h-screen bg-black">
    <div className="w-12 h-12 border-4 border-t-blue-600 border-blue-900 rounded-full animate-spin"></div>
  </div>
);

const ProtectedRoute = ({ children, isLoading }) => {
  const isAuthenticated = !!localStorage.getItem('salva_user');
  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
};

function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [l1Account, setL1Account] = useState(() => localStorage.getItem('l1_account') || null);
  const [l1Connecting, setL1Connecting] = useState(false);
  const [l1ChainId, setL1ChainId] = useState(null);
  const [l1NoWallet, setL1NoWallet] = useState(false);

const handleL1Connect = useCallback(async () => {
    if (!window.ethereum) {
      setL1NoWallet(true);
      return;
    }
    setL1Connecting(true);
    localStorage.removeItem('l1_account');
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      if (accounts.length > 0) {
        setL1Account(accounts[0]);
        localStorage.setItem('l1_account', accounts[0]);
        const chainIdHex = await window.ethereum.request({
          method: 'eth_chainId',
        });
        setL1ChainId(parseInt(chainIdHex, 16));
      }
    } catch (err) {
      console.error('L1 connect error:', err);
    } finally {
      setL1Connecting(false);
    }
  }, []);

  const handleL1Disconnect = useCallback(() => {
    setL1Account(null);
    setL1ChainId(null);
    localStorage.removeItem('l1_account');
  }, []);

  // Restore chain ID on mount if account was persisted
  useEffect(() => {
    if (l1Account && window.ethereum) {
      window.ethereum
        .request({ method: 'eth_chainId' })
        .then((hex) => setL1ChainId(parseInt(hex, 16)))
        .catch(() => {});
    }
  }, [l1Account]);

  useEffect(() => {
    if (!window.ethereum) return;
    const onAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setL1Account(null);
        setL1ChainId(null);
        localStorage.removeItem('l1_account');
      } else {
        setL1Account(accounts[0]);
        localStorage.setItem('l1_account', accounts[0]);
      }
    };
    const onChainChanged = (hex) => setL1ChainId(parseInt(hex, 16));
    window.ethereum.on('accountsChanged', onAccountsChanged);
    window.ethereum.on('chainChanged', onChainChanged);
    return () => {
      window.ethereum.removeListener('accountsChanged', onAccountsChanged);
      window.ethereum.removeListener('chainChanged', onChainChanged);
    };
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        await new Promise((r) => setTimeout(r, 800));
      } finally {
        setIsLoading(false);
      }
    };
    checkSession();
  }, []);

  if (isLoading) return <LoadingSpinner />;

  return (
    <Router>
      <div className="min-h-screen bg-black">
        <Navbar
          l1Account={l1Account}
          l1Connecting={l1Connecting}
          l1ChainId={l1ChainId}
          onL1Connect={handleL1Connect}
          onL1Disconnect={handleL1Disconnect}
        />
        <main>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route
              path="/l1"
              element={
                <L1Dashboard
                  l1Account={l1Account}
                  l1ChainId={l1ChainId}
                  onConnect={handleL1Connect}
                  l1Connecting={l1Connecting}
                  l1NoWallet={l1NoWallet}
                  onL1NoWalletDismiss={() => setL1NoWallet(false)}
                />
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/transactions"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <Transactions />
                </ProtectedRoute>
              }
            />
            <Route path="/set-transaction-pin" element={<SetTransactionPin />} />
            <Route path="/account-settings" element={<AccountSettings />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
