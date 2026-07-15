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
import BNBDashboard from './pages/BNBDashboard';
import BNBDeployWallet from './pages/BNBDeployWallet';
import CrossChainAction from './pages/CrossChainAction';
import AdminStatsPage from './pages/AdminStatsPage';

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
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/bnb" element={<BNBDashboard />} />
            <Route path="/bnb/deploy-wallet" element={<BNBDeployWallet />} />
            <Route path="/chain-action" element={<CrossChainAction />} />
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
