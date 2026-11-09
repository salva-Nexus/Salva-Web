// src/App.js
import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import Navbar from './components/Navbar';
import Home from './pages/Home';
import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import Dashboard from './pages/Dashboard';
import Chains from './pages/Chains';
import Transactions from './pages/Transactions';
import SetTransactionPin from './pages/SetTransactionPin';
import AccountSettings from './pages/AccountSettings';
import AdminStatsPage from './pages/AdminStatsPage';
import LinkNamePage from './pages/LinkNamePage';
import ManageAssets from './pages/ManageAssets';
import Services from './pages/Services';
import Assets from './pages/Assets';
import DeployPool from './pages/DeployPool';
import PoolInventories from './pages/PoolInventories';

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

const ChainsRoute = () => {
  const navigate = useNavigate();

  let user = null;
  try {
    const raw = localStorage.getItem('salva_user');
    user = raw ? JSON.parse(raw) : null;
  } catch {
    user = null;
  }

  const selectedChain = localStorage.getItem('salva_chain') || 'base';

  const handleSelect = (chain) => {
    const name = String(chain?.chainName || chain?.name || chain || '')
      .trim()
      .toLowerCase();

    if (!name) return;

    localStorage.setItem('salva_chain', name);
    navigate('/dashboard', { replace: true });
  };

  const handleDeployed = (chain) => {
    const name = String(chain || '')
      .trim()
      .toLowerCase();
    if (name) localStorage.setItem('salva_chain', name);
    navigate('/dashboard', { replace: true });
  };

  return (
    <Chains
      user={user}
      selectedChain={selectedChain}
      onSelect={handleSelect}
      onClose={() => navigate('/dashboard', { replace: true })}
      onDeployed={handleDeployed}
    />
  );
};

function App() {
  const [isLoading, setIsLoading] = useState(true);

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
        <Navbar />

        <main>
          <Routes>
            <Route
              path="/"
              element={
                Capacitor.isNativePlatform() ? (
                  <Navigate
                    to={localStorage.getItem('salva_user') ? '/dashboard' : '/login'}
                    replace
                  />
                ) : (
                  <Home />
                )
              }
            />

            <Route path="/login" element={<Login />} />

            <Route path="/forgot-password" element={<ForgotPassword />} />

            <Route
              path="/dashboard"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <Dashboard />
                </ProtectedRoute>
              }
            />

            <Route
              path="/chains"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <ChainsRoute />
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

            <Route
              path="/link-name"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <LinkNamePage />
                </ProtectedRoute>
              }
            />

            <Route
              path="/services"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <Services />
                </ProtectedRoute>
              }
            />

            <Route path="/manage-assets" element={<ManageAssets />} />
            <Route path="/dashboard/assets" element={<Assets />} />

            <Route
              path="/pools"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <DeployPool />
                </ProtectedRoute>
              }
            />

            <Route
              path="/pools/:safeAddress/:chain/:poolAddress"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <PoolInventories />
                </ProtectedRoute>
              }
            />

            <Route
              path="/stats"
              element={
                <ProtectedRoute isLoading={isLoading}>
                  <AdminStatsPage />
                </ProtectedRoute>
              }
            />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
