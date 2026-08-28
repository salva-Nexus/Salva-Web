// src/pages/AdminStatsPage.jsx
// Validator-only analytics page — "View Stats" link on the Dashboard header.
// Reads from GET /api/data/stats (flat snapshot: usersCount, ngnsCirculating,
// treasuryNGN, treasuryUSD — no history, no range, no transaction volume).
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const fmtCompact = (n) => {
  const num = Number(n);
  if (!Number.isFinite(num)) return '0'; // guards NaN from bad/legacy values
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const StatPill = ({ label, value, color }) => (
  <div className="rounded-lg sm:rounded-2xl border border-white/[0.07] bg-white/[0.03] p-2.5 sm:p-4">
    <p className="text-[6px] sm:text-[9px] uppercase tracking-widest text-white/40 font-black mb-0.5 sm:mb-1">
      {label}
    </p>
    <p className="text-sm sm:text-2xl font-black" style={{ color }}>
      {fmtCompact(value)}
    </p>
  </div>
);

const AdminStatsPage = () => {
  const [user] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('salva_user') || 'null');
    } catch {
      return null;
    }
  });

  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async (silent = false) => {
    silent ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${SALVA_API_URL}/api/data/stats`);
      const data = await res.json();
      if (!res.ok || !data.status) {
        setError(data.message || 'Access denied');
        setStats(null);
        return;
      }
      setStats(data.data || null);
    } catch {
      setError('Network error — could not load stats');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleManualRefresh = () => fetchStats(true);

  if (!user) return null;

  if (!user.isValidator) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-white flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🔒</span>
          </div>
          <h2 className="text-xl font-black mb-2">Validator Access Only</h2>
          <p className="text-sm text-white/60">This page is restricted to Salva validators.</p>
          <a
            href="/dashboard"
            className="inline-block mt-6 text-[10px] font-black uppercase tracking-widest text-salvaGold hover:opacity-70 transition-opacity"
          >
            ← Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-white pt-16 px-4 pb-16 relative overflow-x-hidden">
      <Stars />
      <div className="max-w-5xl mx-auto relative z-10">
        {/* ── Header ── */}
        <a
          href="/dashboard"
          className="inline-flex items-center gap-2 text-[6px] sm:text-[8px] uppercase tracking-[0.25em] sm:tracking-[0.3em] text-white/25 hover:text-salvaGold transition-colors mb-3 sm:mb-5 font-black"
        >
          ← Dashboard
        </a>

        <header className="flex items-start justify-between gap-3 mb-5 sm:mb-8">
          <div>
            <p className="text-[6px] sm:text-[8px] uppercase tracking-[0.3em] text-salvaGold/60 font-black mb-0.5 sm:mb-1">
              Salva Network Intelligence
            </p>
            <h1 className="text-base sm:text-4xl font-black tracking-tight">Analytics</h1>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex-shrink-0 w-7 h-7 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            {refreshing ? (
              <span className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            ) : (
              <span className="text-salvaGold text-xs sm:text-lg leading-none">↻</span>
            )}
          </button>
        </header>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 font-bold">{error}</p>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3"
          >
            <StatPill label="Total Users" value={stats?.usersCount} color="#D4AF37" />
            <StatPill label="NGN Circulating" value={stats?.ngnsCirculating} color="#3b82f6" />
            <StatPill label="Treasury NGN" value={stats?.treasuryNGN} color="#22c55e" />
            <StatPill label="Treasury USD" value={stats?.treasuryUSD} color="#f59e0b" />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminStatsPage;
