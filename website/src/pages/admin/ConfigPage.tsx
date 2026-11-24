import { For, Match, Show, Switch, createSignal } from 'solid-js';
import { fetchConfig, updateConfig } from '../../lib/api';

type Config = { selection_mode: string; polling_interval: number; directories: string[] };

const fieldStyle = {
  padding: 'var(--spacing-sm)',
  'border-radius': 'var(--radius)',
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  width: '100%',
  'max-width': '300px',
};
const rowStyle = { display: 'flex', 'flex-direction': 'column', gap: 'var(--spacing-sm)' } as const;
const hintStyle = { color: 'var(--color-text-muted)', 'font-size': '0.875rem' };

const MODES = [
  ['random', 'Random'],
  ['sequential', 'Sequential'],
  ['random-no-repeat', 'Random No Repeat'],
  ['shuffle-cycle', 'Shuffle Cycle'],
] as const;

export function AdminConfigPage() {
  const [config, setConfig] = createSignal<Config | null>(null);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<{ message: string; type: 'success' | 'error' } | null>(null);

  const [mode, setMode] = createSignal('random');
  const [interval, setIntervalValue] = createSignal(60);

  fetchConfig()
    .then((data) => {
      setConfig(data);
      setMode(data.selection_mode);
      setIntervalValue(data.polling_interval);
      setError(null);
    })
    .catch((err: any) => setError(err.message || 'Failed to fetch config'))
    .finally(() => setLoading(false));

  const handleApply = async () => {
    try {
      await updateConfig({ selection_mode: mode(), polling_interval: interval() });
      setToast({ message: 'Configuration updated successfully', type: 'success' });
      setTimeout(() => setToast(null), 3000);
    } catch (err: any) {
      setToast({ message: `Failed to update config: ${err.message}`, type: 'error' });
    }
  };

  return (
    <Switch>
      <Match when={loading()}>
        <div style={{ color: 'var(--color-text-muted)' }}>Loading configuration...</div>
      </Match>
      <Match when={error()}>
        <div style={{ color: 'red' }}>Error: {error()}</div>
      </Match>
      <Match when={config()}>
        {(config) => (
          <div>
            <h1 style={{ 'margin-bottom': 'var(--spacing-lg)' }}>Configuration</h1>

            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                'border-radius': 'var(--radius)',
                padding: 'var(--spacing-lg)',
                display: 'flex',
                'flex-direction': 'column',
                gap: 'var(--spacing-lg)',
              }}
            >
              <div style={rowStyle}>
                <label style={{ 'font-weight': 'bold' }}>Selection Mode</label>
                <select data-testid="mode-select" value={mode()} onChange={(e) => setMode(e.currentTarget.value)} style={fieldStyle}>
                  <For each={MODES}>
                    {([value, label]) => (
                      <option value={value} selected={value === mode()}>
                        {label}
                      </option>
                    )}
                  </For>
                </select>
                <span style={hintStyle}>How quotes are selected when requested.</span>
              </div>

              <div style={rowStyle}>
                <label style={{ 'font-weight': 'bold' }}>Polling Interval (seconds)</label>
                <input
                  type="number"
                  data-testid="interval-input"
                  min="1"
                  value={interval()}
                  onInput={(e) => setIntervalValue(parseInt(e.currentTarget.value, 10) || 1)}
                  style={fieldStyle}
                />
                <span style={hintStyle}>How often to check directories for new or updated quotes.</span>
              </div>

              <div style={rowStyle}>
                <label style={{ 'font-weight': 'bold' }}>Directories</label>
                <ul
                  data-testid="directories-list"
                  style={{
                    margin: 0,
                    padding: 'var(--spacing-md)',
                    background: 'var(--color-bg)',
                    border: '1px solid var(--color-border)',
                    'border-radius': 'var(--radius)',
                    'list-style-type': 'none',
                    display: 'flex',
                    'flex-direction': 'column',
                    gap: 'var(--spacing-sm)',
                  }}
                >
                  <For each={config().directories}>
                    {(dir) => <li style={{ 'font-family': 'monospace', 'font-size': '0.875rem' }}>{dir}</li>}
                  </For>
                  <Show when={config().directories.length === 0}>
                    <li style={{ color: 'var(--color-text-muted)', 'font-style': 'italic' }}>No directories configured</li>
                  </Show>
                </ul>
                <span style={hintStyle}>Directories being monitored for quote files (read-only).</span>
              </div>

              <div style={{ display: 'flex', 'align-items': 'center', gap: 'var(--spacing-md)', 'margin-top': 'var(--spacing-md)' }}>
                <button
                  data-testid="apply-btn"
                  onClick={handleApply}
                  style={{
                    background: 'var(--color-accent)',
                    color: 'white',
                    border: 'none',
                    padding: 'var(--spacing-sm) var(--spacing-lg)',
                    'border-radius': 'var(--radius)',
                    cursor: 'pointer',
                    'font-weight': 'bold',
                  }}
                >
                  Apply Changes
                </button>

                <Show when={toast()}>
                  {(t) => (
                    <span
                      style={{
                        color: t().type === 'success' ? '#10b981' : '#ef4444',
                        'font-weight': 'bold',
                        'font-size': '0.875rem',
                      }}
                    >
                      {t().message}
                    </span>
                  )}
                </Show>
              </div>
            </div>
          </div>
        )}
      </Match>
    </Switch>
  );
}
