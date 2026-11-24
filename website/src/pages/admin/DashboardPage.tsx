import { For, Show, createSignal, onCleanup } from 'solid-js';
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

function Kpi(props: { label: string; value: string | number; sub?: string }) {
  return (
    <div class="kpi">
      <div class="label">{props.label}</div>
      <div class="value">{typeof props.value === 'number' ? nf.format(props.value) : props.value}</div>
      <Show when={props.sub}>
        <div class="sub">{props.sub}</div>
      </Show>
    </div>
  );
}

/** Requests per minute over the last hour, as a bar chart. */
function Timeline(props: { data: number[] }) {
  const w = 600;
  const h = 120;
  const max = () => Math.max(1, ...props.data);
  const bw = () => w / props.data.length;
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Requests per minute, last 60 minutes">
        <line x1="0" y1={h - 0.5} x2={w} y2={h - 0.5} stroke="var(--color-border)" />
        <For each={props.data}>
          {(v, i) => {
            const bh = () => (v === 0 ? 0 : Math.max(2, (v / max()) * (h - 8)));
            const ago = () => props.data.length - 1 - i();
            return (
              <rect x={i() * bw() + 1} y={h - bh()} width={Math.max(1, bw() - 2)} height={bh()} rx="2" fill="var(--color-accent)">
                <title>{`${ago() === 0 ? 'this minute' : `${ago()} min ago`}: ${v}`}</title>
              </rect>
            );
          }}
        </For>
      </svg>
      <div class="axis">
        <span>60 min ago</span>
        <span>peak {nf.format(Math.max(0, ...props.data))}/min</span>
        <span>now</span>
      </div>
    </div>
  );
}

function Row(props: { label: string; value: number }) {
  return (
    <tr>
      <td>{props.label}</td>
      <td class="num">{nf.format(props.value)}</td>
    </tr>
  );
}

export function AdminPage() {
  const [stats, setStats] = createSignal<Stats | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [message, setMessage] = createSignal('');
  const [messageDirty, setMessageDirty] = createSignal(false);
  const [busy, setBusy] = createSignal(false);
  const [toast, setToast] = createSignal<{ text: string; type: 'success' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      setStats(await fetchStats(10));
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch stats');
    }
  };

  load();
  fetchMaintenance()
    .then((m) => setMessage(m.message))
    .catch(() => {});
  const timer = setInterval(load, REFRESH_MS);
  onCleanup(() => clearInterval(timer));

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
    const s = stats();
    if (!s) return;
    const enabling = !s.maintenance;
    run(
      () => setMaintenance(enabling ? { enabled: true, message: message() } : { enabled: false }),
      enabling ? 'Maintenance mode on' : 'Maintenance mode off',
    ).then(() => setMessageDirty(false));
  };

  const saveMessage = () =>
    run(() => setMaintenance({ message: message() }), 'Maintenance message saved').then(() => setMessageDirty(false));

  const toggleDebug = () => {
    const s = stats();
    if (!s) return;
    run(() => setDebug(!s.debug), s.debug ? 'Debug mode off' : 'Debug mode on');
  };

  const handleReload = () => run(() => triggerReload(), 'Quotes reloaded from disk');

  const handleReset = () => {
    if (!window.confirm('Reset all counters and per-quote statistics?')) return;
    run(resetStats, 'Statistics reset');
  };

  return (
    <Show
      when={stats()}
      fallback={
        <Show when={error()} fallback={<div class="muted">Loading dashboard…</div>}>
          <div class="banner err">Error: {error()}</div>
        </Show>
      }
    >
      {(stats) => {
        const lastHour = () => stats().timeline_per_minute.reduce((a, b) => a + b, 0);
        const coverage = () =>
          stats().quotes > 0 ? Math.round(((stats().quotes - stats().never_served) / stats().quotes) * 100) : 0;
        return (
          <div>
            <div class="page-head">
              <div>
                <h1>Dashboard</h1>
                <div class="muted small">
                  Mode <span class="mono">{stats().mode}</span> · up {formatDuration(stats().uptime_seconds)} · auto-refresh every{' '}
                  {REFRESH_MS / 1000}s
                </div>
              </div>
              <div class="actions">
                <button data-testid="reload-btn" class="btn" disabled={busy()} onClick={handleReload}>
                  Reload quotes
                </button>
                <button class="btn" disabled={busy()} onClick={handleReset}>
                  Reset stats
                </button>
              </div>
            </div>

            <Show when={error()}>
              <div class="banner err">Live refresh failed: {error()}</div>
            </Show>
            <Show when={stats().maintenance}>
              <div class="banner warn">
                Maintenance mode is on: QOTD clients receive the maintenance message instead of a quote.
              </div>
            </Show>
            <Show when={stats().debug}>
              <div class="banner info">Debug mode is on: every request is logged and QOTD replies include internal state.</div>
            </Show>

            <div class="grid kpis" data-testid="status-card">
              <Kpi label="Quotes served" value={stats().served.total} sub={`over ${formatDuration(stats().stats_window_seconds)}`} />
              <Kpi label="Last hour" value={lastHour()} sub="requests" />
              <Kpi label="TCP / UDP" value={`${nf.format(stats().served.tcp)} / ${nf.format(stats().served.udp)}`} />
              <Kpi
                label="Last served"
                value={stats().last_served_seconds_ago === null ? '—' : `${formatDuration(stats().last_served_seconds_ago!)}`}
                sub={stats().last_served_seconds_ago === null ? 'nothing yet' : 'ago'}
              />
              <Kpi
                label="Quotes loaded"
                value={stats().quotes}
                sub={`${stats().store.files_parsed} files · ${stats().store.duplicates_removed} dupes`}
              />
              <Kpi label="Coverage" value={`${coverage()}%`} sub={`${nf.format(stats().never_served)} never served`} />
            </div>

            <div class="grid two">
              <div class="card">
                <h2>Requests per minute</h2>
                <Timeline data={stats().timeline_per_minute} />
              </div>

              <ShareStats />
            </div>

            <div class="grid two">
              <div class="card">
                <h2>Operational modes</h2>
                <div class="toggle-row">
                  <div style={{ flex: 1 }}>
                    <strong>Maintenance mode</strong>
                    <div class="muted small" style={{ 'margin-bottom': '8px' }}>
                      Serve a fixed message on TCP/UDP instead of quotes.
                    </div>
                    <textarea
                      class="textarea"
                      rows={2}
                      maxLength={512}
                      value={message()}
                      onInput={(e) => {
                        setMessage(e.currentTarget.value);
                        setMessageDirty(true);
                      }}
                      placeholder="The quote service is under maintenance. Please try again later."
                    />
                    <Show when={messageDirty()}>
                      <button class="btn sm" style={{ 'margin-top': '6px' }} disabled={busy()} onClick={saveMessage}>
                        Save message
                      </button>
                    </Show>
                  </div>
                  <button
                    data-testid="maintenance-btn"
                    class={`switch warn ${stats().maintenance ? 'on' : ''}`}
                    role="switch"
                    aria-checked={stats().maintenance}
                    aria-label="Maintenance mode"
                    disabled={busy()}
                    onClick={toggleMaintenance}
                  />
                </div>
                <div class="toggle-row">
                  <div>
                    <strong>Debug mode</strong>
                    <div class="muted small">Log every request and append selection details to QOTD replies.</div>
                  </div>
                  <button
                    data-testid="debug-btn"
                    class={`switch ${stats().debug ? 'on' : ''}`}
                    role="switch"
                    aria-checked={stats().debug}
                    aria-label="Debug mode"
                    disabled={busy()}
                    onClick={toggleDebug}
                  />
                </div>
              </div>

              <div class="card">
                <h2>Traffic breakdown</h2>
                <table class="data">
                  <tbody>
                    <Row label="Quotes over TCP" value={stats().served.tcp} />
                    <Row label="Quotes over UDP" value={stats().served.udp} />
                    <Row label="Maintenance replies" value={stats().served.maintenance} />
                    <Row label="Empty replies (no quotes)" value={stats().served.empty} />
                    <Row label="HTTP requests" value={stats().http.requests} />
                    <Row label="Authenticated API calls" value={stats().http.api_requests} />
                    <Row label="Failed API logins" value={stats().http.auth_failures} />
                    <Row label="Reloads" value={stats().reloads} />
                  </tbody>
                </table>
              </div>
            </div>

            <Show when={toast()}>{(t) => <div class={`toast ${t().type}`}>{t().text}</div>}</Show>
          </div>
        );
      }}
    </Show>
  );
}
