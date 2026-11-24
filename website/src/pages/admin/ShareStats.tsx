import { useEffect, useMemo, useState } from 'react';
import { fetchQuotes, fetchShareCounts, type Quote, type ShareCount } from '../../lib/api';

const REFRESH_MS = 30000;
const FORMATS = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const;
const nf = new Intl.NumberFormat();

type Metric = 'visit' | 'image';

/** Text of the quote in that language, else the original */
function textFor(q: Quote | undefined, locale: string): string | null {
  if (!q) return null;
  const tr = q.translations ?? {};
  const base = locale.split('-')[0]!.toLowerCase();
  const key =
    Object.keys(tr).find((k) => k.toLowerCase() === locale.toLowerCase()) ??
    Object.keys(tr).find((k) => k.split('-')[0]!.toLowerCase() === base);
  return key ? tr[key]! : q.text;
}

/**
 * Ranking of the shared quotes: visits of the links /:locale/q/:id (counted
 * by the server, bots left out) or images generated in the page, per quote
 * and language, filterable by language and image format.
 */
export function ShareStats() {
  const [rows, setRows] = useState<ShareCount[] | null>(null);
  const [quotes, setQuotes] = useState<Map<string, Quote>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('visit');
  const [lang, setLang] = useState('');
  const [format, setFormat] = useState('');

  useEffect(() => {
    const load = () =>
      fetchShareCounts()
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((e: Error) => setError(e.message));
    load();
    fetchQuotes()
      .then((qs) => setQuotes(new Map(qs.filter((q) => q.public_id).map((q) => [q.public_id!, q]))))
      .catch(() => {});
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const langs = useMemo(() => [...new Set((rows ?? []).map((r) => r.locale))].sort(), [rows]);

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => r.kind === metric && (!lang || r.locale === lang) && (metric !== 'image' || !format || r.format === format),
      ),
    [rows, metric, lang, format],
  );

  const total = filtered.reduce((a, r) => a + r.count, 0);

  // One line per quote and language; for images, the split by format
  const ranking = useMemo(() => {
    const by = new Map<string, { id: string; locale: string; count: number; formats: Record<string, number> }>();
    for (const r of filtered) {
      const k = `${r.id}|${r.locale}`;
      const e = by.get(k) ?? { id: r.id, locale: r.locale, count: 0, formats: {} };
      e.count += r.count;
      if (r.format) e.formats[r.format] = (e.formats[r.format] ?? 0) + r.count;
      by.set(k, e);
    }
    return [...by.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  }, [filtered]);

  // Images per format, with the language filter
  const perFormat = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows ?? []) {
      if (r.kind === 'image' && (!lang || r.locale === lang)) m[r.format] = (m[r.format] ?? 0) + r.count;
    }
    return m;
  }, [rows, lang]);

  const max = Math.max(1, ...ranking.map((r) => r.count));

  return (
    <div className="card" data-testid="share-stats">
      <div className="card-head-row">
        <h2>Shared quotes</h2>
        <span className="muted small">
          {nf.format(total)} {metric === 'visit' ? 'visits' : 'images'}
        </span>
      </div>
      <div className="filters-row">
        <select className="select" data-testid="share-metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
          <option value="visit">Visits of shared links</option>
          <option value="image">Images generated</option>
        </select>
        <select className="select" data-testid="share-lang" value={lang} onChange={(e) => setLang(e.target.value)}>
          <option value="">All languages</option>
          {langs.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        {metric === 'image' && (
          <select className="select" data-testid="share-format" value={format} onChange={(e) => setFormat(e.target.value)}>
            <option value="">All formats</option>
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        )}
      </div>

      {metric === 'image' && (
        <div className="format-totals">
          {FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              className={`format-total ${format === f ? 'active' : ''}`}
              onClick={() => setFormat(format === f ? '' : f)}
            >
              <span className="mono">{f}</span>
              <strong>{nf.format(perFormat[f] ?? 0)}</strong>
            </button>
          ))}
        </div>
      )}

      {error && <div className="muted small">Could not load: {error}</div>}
      {rows && ranking.length === 0 ? (
        <div className="muted small">
          {metric === 'visit' ? 'No shared link opened yet.' : 'No image generated yet.'}
        </div>
      ) : (
        <ol className="top-list">
          {ranking.map((r) => {
            const text = textFor(quotes.get(r.id), r.locale);
            const split =
              metric === 'image' && !format
                ? FORMATS.filter((f) => r.formats[f]).map((f) => `${f} ${r.formats[f]}`).join(' · ')
                : '';
            return (
              <li key={`${r.id}|${r.locale}`}>
                <div className="row">
                  <span className="lang-tag mono">{r.locale}</span>
                  <a className="text" href={`/${r.locale}/q/${r.id}`} target="_blank" rel="noreferrer" title={text ?? r.id}>
                    {text ?? <span className="mono">{r.id}</span>}
                  </a>
                  <span className="count">{nf.format(r.count)}</span>
                </div>
                {split && <div className="muted small mono">{split}</div>}
                <div className="track">
                  <div className="bar" style={{ width: `${(r.count / max) * 100}%` }} />
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className="muted small" style={{ marginTop: 10 }}>
        Anonymous totals only: no IP, cookie or visitor data. Link previews and bots are not counted.
      </div>
    </div>
  );
}
