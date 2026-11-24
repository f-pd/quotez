import { useCallback, useEffect, useState } from 'react';
import {
  fetchStats,
  fetchMaintenance,
  setMaintenance,
  setDebug,
  triggerReload,
  resetStats,
  type Stats,
} from '../../lib/api';
import { notifyModesChanged } from '../../components/AdminLayout';
import { ShareStats } from './ShareStats';

const REFRESH_MS = 5000;

function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const nf = new Intl.NumberFormat();

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="kpi">
      <div className="label">{label}</div>
      <div className="value">{typeof value === 'number' ? nf.format(value) : value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

/** Requests per minute over the last hour, as a bar chart. */
function Timeline({ data }: { data: number[] }) {
  const w = 600;
  const h = 120;
  const max = Math.max(1, ...data);
  const bw = w / data.length;
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Requests per minute, last 60 minutes">
        <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke="var(--color-border)" />
        {data.map((v, i) => {
          const bh = v === 0 ? 0 : Math.max(2, (v / max) * (h - 8));
          return (
            <rect key={i} x={i * bw + 1} y={h - bh} width={Math.max(1, bw - 2)} height={bh} rx="2" fill="var(--color-accent)">
              <title>{`${data.length - 1 - i === 0 ? 'this minute' : `${data.length - 1 - i} min ago`}: ${v}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="axis">
        <span>60 min ago</span>
        <span>peak {nf.format(Math.max(0, ...data))}/min</span>
        <span>now</span>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [messageDirty, setMessageDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = useCallback(async () => {
    try {
      setStats(await fetchStats(10));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch stats');
    }
  }, []);

  useEffect(() => {
    load();
    fetchMaintenance()
      .then((m) => setMessage(m.message))
      .catch(() => {});
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      showToast(ok);
      notifyModesChanged();
      await load();
    } catch (err: any) {
      showToast(err.message || 'Request failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const toggleMaintenance = () => {
    if (!stats) return;
    const enabling = !stats.maintenance;
    run(
      () => setMaintenance(enabling ? { enabled: true, message } : { enabled: false }),
      enabling ? 'Maintenance mode on' : 'Maintenance mode off',
    ).then(() => setMessageDirty(false));
  };

  const saveMessage = () =>
    run(() => setMaintenance({ message }), 'Maintenance message saved').then(() => setMessageDirty(false));

  const toggleDebug = () => {
    if (!stats) return;
    run(() => setDebug(!stats.debug), stats.debug ? 'Debug mode off' : 'Debug mode on');
  };

  const handleReload = () =>
    run(async () => {
      const r = await triggerReload();
      return r;
    }, 'Quotes reloaded from disk');

  const handleReset = () => {
    if (!window.confirm('Reset all counters and per-quote statistics?')) return;
    run(resetStats, 'Statistics reset');
  };

  if (!stats) {
    return error ? <div className="banner err">Error: {error}</div> : <div className="muted">Loading dashboard…</div>;
  }

  const lastHour = stats.timeline_per_minute.reduce((a, b) => a + b, 0);
  const coverage = stats.quotes > 0 ? Math.round(((stats.quotes - stats.never_served) / stats.quotes) * 100) : 0;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Dashboard</h1>
          <div className="muted small">
            Mode <span className="mono">{stats.mode}</span> · up {formatDuration(stats.uptime_seconds)} · auto-refresh every{' '}
            {REFRESH_MS / 1000}s
          </div>
        </div>
        <div className="actions">
          <button data-testid="reload-btn" className="btn" disabled={busy} onClick={handleReload}>
            Reload quotes
          </button>
          <button className="btn" disabled={busy} onClick={handleReset}>
            Reset stats
          </button>
        </div>
      </div>

      {error && <div className="banner err">Live refresh failed: {error}</div>}
      {stats.maintenance && (
        <div className="banner warn">
          Maintenance mode is on: QOTD clients receive the maintenance message instead of a quote.
        </div>
      )}
      {stats.debug && (
        <div className="banner info">Debug mode is on: every request is logged and QOTD replies include internal state.</div>
      )}

      <div className="grid kpis" data-testid="status-card">
        <Kpi label="Quotes served" value={stats.served.total} sub={`over ${formatDuration(stats.stats_window_seconds)}`} />
        <Kpi label="Last hour" value={lastHour} sub="requests" />
        <Kpi label="TCP / UDP" value={`${nf.format(stats.served.tcp)} / ${nf.format(stats.served.udp)}`} />
        <Kpi
          label="Last served"
          value={stats.last_served_seconds_ago === null ? '—' : `${formatDuration(stats.last_served_seconds_ago)}`}
          sub={stats.last_served_seconds_ago === null ? 'nothing yet' : 'ago'}
        />
        <Kpi label="Quotes loaded" value={stats.quotes} sub={`${stats.store.files_parsed} files · ${stats.store.duplicates_removed} dupes`} />
        <Kpi label="Coverage" value={`${coverage}%`} sub={`${nf.format(stats.never_served)} never served`} />
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Requests per minute</h2>
          <Timeline data={stats.timeline_per_minute} />
        </div>

        <ShareStats />
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Operational modes</h2>
          <div className="toggle-row">
            <div style={{ flex: 1 }}>
              <strong>Maintenance mode</strong>
              <div className="muted small" style={{ marginBottom: 8 }}>
                Serve a fixed message on TCP/UDP instead of quotes.
              </div>
              <textarea
                className="textarea"
                rows={2}
                maxLength={512}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  setMessageDirty(true);
                }}
                placeholder="The quote service is under maintenance. Please try again later."
              />
              {messageDirty && (
                <button className="btn sm" style={{ marginTop: 6 }} disabled={busy} onClick={saveMessage}>
                  Save message
                </button>
              )}
            </div>
            <button
              data-testid="maintenance-btn"
              className={`switch warn ${stats.maintenance ? 'on' : ''}`}
              role="switch"
              aria-checked={stats.maintenance}
              aria-label="Maintenance mode"
              disabled={busy}
              onClick={toggleMaintenance}
            />
          </div>
          <div className="toggle-row">
            <div>
              <strong>Debug mode</strong>
              <div className="muted small">Log every request and append selection details to QOTD replies.</div>
            </div>
            <button
              data-testid="debug-btn"
              className={`switch ${stats.debug ? 'on' : ''}`}
              role="switch"
              aria-checked={stats.debug}
              aria-label="Debug mode"
              disabled={busy}
              onClick={toggleDebug}
            />
          </div>
        </div>

        <div className="card">
          <h2>Traffic breakdown</h2>
          <table className="data">
            <tbody>
              <tr>
                <td>Quotes over TCP</td>
                <td className="num">{nf.format(stats.served.tcp)}</td>
              </tr>
              <tr>
                <td>Quotes over UDP</td>
                <td className="num">{nf.format(stats.served.udp)}</td>
              </tr>
              <tr>
                <td>Maintenance replies</td>
                <td className="num">{nf.format(stats.served.maintenance)}</td>
              </tr>
              <tr>
                <td>Empty replies (no quotes)</td>
                <td className="num">{nf.format(stats.served.empty)}</td>
              </tr>
              <tr>
                <td>HTTP requests</td>
                <td className="num">{nf.format(stats.http.requests)}</td>
              </tr>
              <tr>
                <td>Authenticated API calls</td>
                <td className="num">{nf.format(stats.http.api_requests)}</td>
              </tr>
              <tr>
                <td>Failed API logins</td>
                <td className="num">{nf.format(stats.http.auth_failures)}</td>
              </tr>
              <tr>
                <td>Reloads</td>
                <td className="num">{nf.format(stats.reloads)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </div>
  );
}
