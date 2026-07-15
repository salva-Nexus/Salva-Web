// src/pages/AdminStatsPage.jsx
// Validator-only analytics page — "View Stats" link on the Dashboard header.
// Reads from GET /api/admin-stats (gated server-side by isValidator check).
import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { SALVA_API_URL } from '../config';
import Stars from '../components/Stars';

const RANGES = [
  { id: '24h', label: '24H' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

const fmtCompact = (n) => {
  const num = Number(n || 0);
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + 'M';
  if (num >= 1_000) return (num / 1_000).toFixed(1) + 'K';
  return num.toLocaleString('en-US', { maximumFractionDigits: 2 });
};

const fmtTime = (iso) =>
  new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

// ── Custom tooltip — matches the Salva dark aesthetic ──────────────────────
const SalvaTooltip = ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-zinc-950 border border-salvaGold/20 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-[9px] uppercase tracking-widest text-white/40 font-black mb-2">
        {fmtTime(label)}
      </p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-xs font-bold">
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: p.color }} />
          <span className="text-white/60">{p.name}:</span>
          <span className="text-white font-black">{fmtCompact(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

// ── Reusable metric card wrapping a single LineChart ────────────────────────
const MetricChart = ({ title, subtitle, data, lines, accent }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
    <div
      className="h-px"
      style={{ background: `linear-gradient(90deg, transparent, ${accent}55, transparent)` }}
    />
    <div className="p-5">
      <p className="text-[10px] uppercase tracking-[0.3em] font-black text-white/60 mb-0.5">
        {title}
      </p>
      {subtitle && <p className="text-[11px] text-white/30 mb-4">{subtitle}</p>}
      {data.length === 0 ? (
        <div className="h-[220px] flex items-center justify-center">
          <p className="text-xs text-white/25 font-bold">No data yet for this range</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={data} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="recordedAt"
              tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700 }}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmtCompact}
              tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 9, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<SalvaTooltip />} />
            {lines.length > 1 && (
              <Legend
                wrapperStyle={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}
                iconType="circle"
                iconSize={8}
              />
            )}
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

const StatPill = ({ label, value, color }) => (
  <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4">
    <p className="text-[9px] uppercase tracking-widest text-white/40 font-black mb-1">{label}</p>
    <p className="text-2xl font-black" style={{ color }}>
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

  const [range, setRange] = useState('30d');
  const [snapshots, setSnapshots] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(
    async (silent = false) => {
      if (!user?.safeAddress) return;
      silent ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${SALVA_API_URL}/api/admin-stats?safeAddress=${user.safeAddress}&range=${range}`
        );
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || 'Access denied');
          setSnapshots([]);
          return;
        }
        setSnapshots(data.snapshots || []);
      } catch {
        setError('Network error — could not load stats');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user?.safeAddress, range]
  );

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch(`${SALVA_API_URL}/api/admin-stats/refresh?safeAddress=${user.safeAddress}`, {
        method: 'POST',
      });
    } catch {
      /* ignore */
    }
    await fetchStats(true);
  };

  if (!user) return null;

  const latest = snapshots[snapshots.length - 1] || null;

  // Flatten nested snapshot shape into chart-friendly rows
  const ngnData = snapshots.map((s) => ({
    recordedAt: s.recordedAt,
    Base: s.ngnCirculating?.base || 0,
    BNB: s.ngnCirculating?.bnb || 0,
    Combined: s.ngnCirculating?.combined || 0,
  }));

  const ngnFeeData = snapshots.map((s) => ({
    recordedAt: s.recordedAt,
    Base: s.treasuryFees?.ngn?.base || 0,
    BNB: s.treasuryFees?.ngn?.bnb || 0,
    Combined: s.treasuryFees?.ngn?.combined || 0,
  }));

  const usdFeeData = snapshots.map((s) => ({
    recordedAt: s.recordedAt,
    Base: s.treasuryFees?.usd?.base || 0,
    BNB: s.treasuryFees?.usd?.bnb || 0,
    Combined: s.treasuryFees?.usd?.combined || 0,
  }));

  const userData = snapshots.map((s) => ({
    recordedAt: s.recordedAt,
    Users: s.userCount || 0,
  }));

  const txData = snapshots.map((s) => ({
    recordedAt: s.recordedAt,
    Transactions: s.transactionVolume?.combined || 0,
  }));

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
          className="inline-flex items-center gap-2 text-[8px] uppercase tracking-[0.3em] text-white/25 hover:text-salvaGold transition-colors mb-5 font-black"
        >
          ← Dashboard
        </a>

        <header className="flex items-start justify-between gap-4 mb-8">
          <div>
            <p className="text-[8px] uppercase tracking-[0.35em] text-salvaGold/60 font-black mb-1">
              Salva Network Intelligence
            </p>
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">Analytics</h1>
          </div>
          <button
            onClick={handleManualRefresh}
            disabled={refreshing}
            className="flex-shrink-0 w-10 h-10 rounded-xl border border-white/[0.07] bg-white/[0.03] flex items-center justify-center hover:border-salvaGold/30 transition-all"
          >
            {refreshing ? (
              <span className="w-4 h-4 border-2 border-salvaGold/30 border-t-salvaGold rounded-full animate-spin" />
            ) : (
              <span className="text-salvaGold text-lg leading-none">↻</span>
            )}
          </button>
        </header>

        {/* ── Range selector ── */}
        <div className="flex gap-2 mb-6">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                range === r.id
                  ? 'bg-salvaGold text-black border-salvaGold'
                  : 'border-white/10 text-white/40 hover:text-white/70 hover:border-white/20'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-salvaGold/20 border-t-salvaGold rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-20">
            <p className="text-red-400 font-bold">{error}</p>
          </div>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {/* ── Top summary pills ── */}
            {latest && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatPill label="Total Users" value={latest.userCount} color="#D4AF37" />
                <StatPill
                  label="NGN Circulating"
                  value={latest.ngnCirculating?.combined}
                  color="#3b82f6"
                />
                <StatPill
                  label="Treasury NGN"
                  value={latest.treasuryFees?.ngn?.combined}
                  color="#22c55e"
                />
                <StatPill
                  label="Treasury USD"
                  value={latest.treasuryFees?.usd?.combined}
                  color="#f59e0b"
                />
              </div>
            )}

            {/* ── User growth ── */}
            <MetricChart
              title="Registered Users"
              subtitle="Cumulative Salva Nexus account count"
              data={userData}
              lines={[{ key: 'Users', name: 'Users', color: '#D4AF37' }]}
              accent="#D4AF37"
            />

            {/* ── NGN circulating (Base + BNB combined) ── */}
            <MetricChart
              title="Total NGN Circulating"
              subtitle="Base + BNB combined in one line, individual chains shown alongside"
              data={ngnData}
              lines={[
                { key: 'Combined', name: 'Combined', color: '#D4AF37' },
                { key: 'Base', name: 'Base', color: '#3b82f6' },
                { key: 'BNB', name: 'BNB', color: '#f59e0b' },
              ]}
              accent="#3b82f6"
            />

            {/* ── Treasury fund — NGN token graph ── */}
            <MetricChart
              title="Treasury Fund — NGN Tokens"
              subtitle="NGNs + cNGN accumulated fees, Base + BNB combined"
              data={ngnFeeData}
              lines={[
                { key: 'Combined', name: 'Combined', color: '#22c55e' },
                { key: 'Base', name: 'Base', color: '#3b82f6' },
                { key: 'BNB', name: 'BNB', color: '#f59e0b' },
              ]}
              accent="#22c55e"
            />

            {/* ── Treasury fund — USD token graph ── */}
            <MetricChart
              title="Treasury Fund — USD Tokens"
              subtitle="USDT + USDC accumulated fees, Base + BNB combined"
              data={usdFeeData}
              lines={[
                { key: 'Combined', name: 'Combined', color: '#f59e0b' },
                { key: 'Base', name: 'Base', color: '#3b82f6' },
                { key: 'BNB', name: 'BNB', color: '#f59e0b' },
              ]}
              accent="#f59e0b"
            />

            {/* ── Transaction volume ── */}
            <MetricChart
              title="Transaction Volume"
              subtitle="Cumulative confirmed transfers, swaps & pool deployments"
              data={txData}
              lines={[{ key: 'Transactions', name: 'Transactions', color: '#a855f7' }]}
              accent="#a855f7"
            />
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default AdminStatsPage;