import { For, Show, createMemo, createSignal, onCleanup } from 'solid-js';
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
  const [rows, setRows] = createSignal<ShareCount[] | null>(null);
  const [quotes, setQuotes] = createSignal<Map<string, Quote>>(new Map());
  const [error, setError] = createSignal<string | null>(null);
  const [metric, setMetric] = createSignal<Metric>('visit');
  const [lang, setLang] = createSignal('');
  const [format, setFormat] = createSignal('');

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
  onCleanup(() => clearInterval(t));

  const langs = createMemo(() => [...new Set((rows() ?? []).map((r) => r.locale))].sort());

  const filtered = createMemo(() =>
    (rows() ?? []).filter(
      (r) =>
        r.kind === metric() && (!lang() || r.locale === lang()) && (metric() !== 'image' || !format() || r.format === format()),
    ),
  );

  const total = () => filtered().reduce((a, r) => a + r.count, 0);

  // One line per quote and language; for images, the split by format
  const ranking = createMemo(() => {
    const by = new Map<string, { id: string; locale: string; count: number; formats: Record<string, number> }>();
    for (const r of filtered()) {
      const k = `${r.id}|${r.locale}`;
      const e = by.get(k) ?? { id: r.id, locale: r.locale, count: 0, formats: {} };
      e.count += r.count;
      if (r.format) e.formats[r.format] = (e.formats[r.format] ?? 0) + r.count;
      by.set(k, e);
    }
    return [...by.values()].sort((a, b) => b.count - a.count).slice(0, 15);
  });

  // Images per format, with the language filter
  const perFormat = createMemo(() => {
    const m: Record<string, number> = {};
    for (const r of rows() ?? []) {
      if (r.kind === 'image' && (!lang() || r.locale === lang())) m[r.format] = (m[r.format] ?? 0) + r.count;
    }
    return m;
  });

  const max = () => Math.max(1, ...ranking().map((r) => r.count));

  return (
    <div class="card" data-testid="share-stats">
      <div class="card-head-row">
        <h2>Shared quotes</h2>
        <span class="muted small">
          {nf.format(total())} {metric() === 'visit' ? 'visits' : 'images'}
        </span>
      </div>
      <div class="filters-row">
        <select
          class="select"
          data-testid="share-metric"
          value={metric()}
          onChange={(e) => setMetric(e.currentTarget.value as Metric)}
        >
          <option value="visit">Visits of shared links</option>
          <option value="image">Images generated</option>
        </select>
        <select class="select" data-testid="share-lang" value={lang()} onChange={(e) => setLang(e.currentTarget.value)}>
          <option value="">All languages</option>
          <For each={langs()}>
            {(l) => (
              <option value={l} selected={l === lang()}>
                {l}
              </option>
            )}
          </For>
        </select>
        <Show when={metric() === 'image'}>
          <select
            class="select"
            data-testid="share-format"
            value={format()}
            onChange={(e) => setFormat(e.currentTarget.value)}
          >
            <option value="">All formats</option>
            <For each={FORMATS}>
              {(f) => (
                <option value={f} selected={f === format()}>
                  {f}
                </option>
              )}
            </For>
          </select>
        </Show>
      </div>

      <Show when={metric() === 'image'}>
        <div class="format-totals">
          <For each={FORMATS}>
            {(f) => (
              <button
                type="button"
                class={`format-total ${format() === f ? 'active' : ''}`}
                onClick={() => setFormat(format() === f ? '' : f)}
              >
                <span class="mono">{f}</span>
                <strong>{nf.format(perFormat()[f] ?? 0)}</strong>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={error()}>
        <div class="muted small">Could not load: {error()}</div>
      </Show>
      <Show
        when={!(rows() && ranking().length === 0)}
        fallback={
          <div class="muted small">{metric() === 'visit' ? 'No shared link opened yet.' : 'No image generated yet.'}</div>
        }
      >
        <ol class="top-list">
          <For each={ranking()}>
            {(r) => {
              const text = () => textFor(quotes().get(r.id), r.locale);
              const split = () =>
                metric() === 'image' && !format()
                  ? FORMATS.filter((f) => r.formats[f])
                      .map((f) => `${f} ${r.formats[f]}`)
                      .join(' · ')
                  : '';
              return (
                <li>
                  <div class="row">
                    <span class="lang-tag mono">{r.locale}</span>
                    <a class="text" href={`/${r.locale}/q/${r.id}`} target="_blank" rel="noreferrer" title={text() ?? r.id}>
                      {text() ?? <span class="mono">{r.id}</span>}
                    </a>
                    <span class="count">{nf.format(r.count)}</span>
                  </div>
                  <Show when={split()}>
                    <div class="muted small mono">{split()}</div>
                  </Show>
                  <div class="track">
                    <div class="bar" style={{ width: `${(r.count / max()) * 100}%` }} />
                  </div>
                </li>
              );
            }}
          </For>
        </ol>
      </Show>
      <div class="muted small" style={{ 'margin-top': '10px' }}>
        Anonymous totals only: no IP, cookie or visitor data. Link previews and bots are not counted.
      </div>
    </div>
  );
}
