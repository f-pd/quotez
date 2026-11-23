import { useEffect, useRef, useState } from 'react';
import { fetchLogs, setDebug, type LogLine } from '../../lib/api';
import { notifyModesChanged } from '../../components/AdminLayout';

const POLL_MS = 2000;
const MAX_LINES = 2000;
const LEVELS = ['debug', 'info', 'warn', 'error'] as const;

function formatTs(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString(undefined, { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
}

export function AdminLogsPage() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [level, setLevel] = useState<(typeof LEVELS)[number]>('info');
  const [filter, setFilter] = useState('');
  const [paused, setPaused] = useState(false);
  const [follow, setFollow] = useState(true);
  const [debugOn, setDebugOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sinceRef = useRef(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Restart the tail whenever the level changes
  useEffect(() => {
    sinceRef.current = 0;
    setLines([]);
  }, [level]);

  useEffect(() => {
    if (paused) return;
    let alive = true;
    const poll = async () => {
      try {
        const res = await fetchLogs({ since: sinceRef.current, level, limit: 500 });
        if (!alive) return;
        sinceRef.current = res.next_seq - 1;
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
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [paused, level]);

  useEffect(() => {
    if (follow && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [lines, follow]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
  };

  const toggleDebug = async () => {
    try {
      const r = await setDebug(!debugOn);
      setDebugOn(r.debug);
      if (r.debug && level !== 'debug') setLevel('debug');
      notifyModesChanged();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const needle = filter.trim().toLowerCase();
  const shown = needle ? lines.filter((l) => l.message.toLowerCase().includes(needle)) : lines;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Logs</h1>
          <div className="muted small">Live tail of the service log (last {MAX_LINES} lines kept in view, 500 on the server).</div>
        </div>
        <div className="actions">
          <span className="muted small">Debug mode</span>
          <button
            className={`switch ${debugOn ? 'on' : ''}`}
            role="switch"
            aria-checked={debugOn}
            aria-label="Debug mode"
            onClick={toggleDebug}
          />
        </div>
      </div>

      <div className="toolbar">
        <select className="select" value={level} onChange={(e) => setLevel(e.target.value as (typeof LEVELS)[number])}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {l === 'debug' ? 'All levels' : `${l} and above`}
            </option>
          ))}
        </select>
        <input
          className="input grow"
          type="search"
          placeholder="Filter lines…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button className="btn" onClick={() => setPaused(!paused)}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button className="btn" onClick={() => setLines([])}>
          Clear view
        </button>
      </div>

      {error && <div className="banner err">{error}</div>}
      {level === 'debug' && !debugOn && (
        <div className="banner info">Debug lines are only recorded while debug mode is on.</div>
      )}

      <div className="logs" ref={boxRef} onScroll={onScroll}>
        {shown.length === 0 ? (
          <div className="empty">{paused ? 'Paused.' : 'Waiting for log lines…'}</div>
        ) : (
          shown.map((l) => (
            <div className="line" key={l.seq}>
              <span className="ts">{formatTs(l.ts)}</span>
              <span className={`lv-${l.level}`}>{l.level}</span>
              <span>{l.message}</span>
            </div>
          ))
        )}
      </div>
      {!follow && (
        <div style={{ marginTop: 8 }}>
          <button
            className="btn sm"
            onClick={() => {
              setFollow(true);
            }}
          >
            Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}
