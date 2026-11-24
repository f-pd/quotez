import { For, Show, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { fetchLogs, setDebug, type LogLine } from '../../lib/api';
import { notifyModesChanged } from '../../components/AdminLayout';

const POLL_MS = 2000;
const MAX_LINES = 2000;
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;
type Level = (typeof LEVELS)[number];

function formatTs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function AdminLogsPage() {
  const [lines, setLines] = createSignal<LogLine[]>([]);
  const [level, setLevel] = createSignal<Level>('info');
  const [filter, setFilter] = createSignal('');
  const [paused, setPaused] = createSignal(false);
  const [follow, setFollow] = createSignal(true);
  const [debugOn, setDebugOn] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  let since = 0;
  let box!: HTMLDivElement;

  // Restart the tail whenever the level changes
  createEffect(
    on(
      level,
      () => {
        since = 0;
        setLines([]);
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    if (paused()) return;
    const lv = level();
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetchLogs({ since, level: lv, limit: 500 });
        if (!alive) return;
        since = res.next_seq - 1;
        setDebugOn(res.debug);
        if (res.lines.length) {
          setLines((prev) => {
            const next = prev.concat(res.lines);
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
        }
        setError(null);
      } catch (err: any) {
        if (alive) setError(err.message || 'Failed to fetch logs');
      }
    };
    poll();
    const t = setInterval(poll, POLL_MS);
    onCleanup(() => {
      alive = false;
      clearInterval(t);
    });
  });

  createEffect(() => {
    lines();
    if (follow()) box.scrollTop = box.scrollHeight;
  });

  const onScroll = () => setFollow(box.scrollHeight - box.scrollTop - box.clientHeight < 24);

  const toggleDebug = async () => {
    try {
      const r = await setDebug(!debugOn());
      setDebugOn(r.debug);
      if (r.debug && level() !== 'debug') setLevel('debug');
      notifyModesChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const shown = () => {
    const needle = filter().trim().toLowerCase();
    return needle ? lines().filter((l) => l.message.toLowerCase().includes(needle)) : lines();
  };

  return (
    <div>
      <div class="page-head">
        <div>
          <h1>Logs</h1>
          <div class="muted small">Live tail of the service log (last {MAX_LINES} lines kept in view, 500 on the server).</div>
        </div>
        <div class="actions">
          <span class="muted small">Debug mode</span>
          <button
            class={`switch ${debugOn() ? 'on' : ''}`}
            role="switch"
            aria-checked={debugOn()}
            aria-label="Debug mode"
            onClick={toggleDebug}
          />
        </div>
      </div>

      <div class="toolbar">
        <select class="select" value={level()} onChange={(e) => setLevel(e.currentTarget.value as Level)}>
          <For each={LEVELS}>
            {(l) => (
              <option value={l} selected={l === level()}>
                {l === 'debug' ? 'All levels' : `${l} and above`}
              </option>
            )}
          </For>
        </select>
        <input
          class="input grow"
          type="search"
          placeholder="Filter lines…"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
        <button class="btn" onClick={() => setPaused(!paused())}>
          {paused() ? 'Resume' : 'Pause'}
        </button>
        <button class="btn" onClick={() => setLines([])}>
          Clear view
        </button>
      </div>

      <Show when={error()}>
        <div class="banner err">{error()}</div>
      </Show>
      <Show when={level() === 'debug' && !debugOn()}>
        <div class="banner info">Debug lines are only recorded while debug mode is on.</div>
      </Show>

      <div class="logs" ref={box} onScroll={onScroll}>
        <Show when={shown().length > 0} fallback={<div class="empty">{paused() ? 'Paused.' : 'Waiting for log lines…'}</div>}>
          <For each={shown()}>
            {(l) => (
              <div class="line">
                <span class="ts">{formatTs(l.ts)}</span>
                <span class={`lv-${l.level}`}>{l.level}</span>
                <span>{l.message}</span>
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={!follow()}>
        <div style={{ 'margin-top': '8px' }}>
          <button class="btn sm" onClick={() => setFollow(true)}>
            Jump to latest
          </button>
        </div>
      </Show>
    </div>
  );
}
