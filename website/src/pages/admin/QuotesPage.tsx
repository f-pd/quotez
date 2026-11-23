import { useEffect, useMemo, useState } from 'react';
import { fetchQuotes, createQuote, updateQuote, deleteQuote, fetchLocales, type Quote } from '../../lib/api';
import { QOTD_MAX_BYTES, baseLanguage, canonicalLocale, languageName, utf8Bytes } from '../../lib/i18n';

type SortKey = 'id' | 'served' | 'text';

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'API';
  const parts = source.split('/');
  return parts[parts.length - 1] || source;
}

/** Byte size against the RFC 865 limit; over it the text is served on the web only */
function ByteCount({ text }: { text: string }) {
  const bytes = utf8Bytes(text);
  const over = bytes > QOTD_MAX_BYTES;
  return (
    <span className="muted small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <span style={over ? { color: 'var(--color-danger, #e5484d)' } : undefined}>
        {bytes}/{QOTD_MAX_BYTES} bytes
      </span>
      {over && (
        <span className="pill warn" title="Longer than the RFC 865 limit: shown on the website, never sent on port 17/8017">
          web only
        </span>
      )}
    </span>
  );
}

/** Texts of a quote that exceed the QOTD limit, as language tags */
function webOnlyLangs(q: Quote): string[] {
  const out: string[] = [];
  if (utf8Bytes(q.text) > QOTD_MAX_BYTES) out.push(q.original_lang ?? 'original');
  for (const [lang, text] of Object.entries(q.translations ?? {})) {
    if (utf8Bytes(text) > QOTD_MAX_BYTES) out.push(lang);
  }
  return out;
}

/** True when the quote has a text the given locale can be served from */
function hasLanguage(q: Quote, lang: string): boolean {
  const b = baseLanguage(lang);
  const langs = [q.original_lang ?? '', ...Object.keys(q.translations ?? {})];
  return langs.some((l) => l && baseLanguage(l) === b);
}

export function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [formText, setFormText] = useState('');
  const [formAuthor, setFormAuthor] = useState('');
  const [formLang, setFormLang] = useState('');
  const [formTranslations, setFormTranslations] = useState<Record<string, string>>({});
  const [newTransLang, setNewTransLang] = useState('');
  const [locales, setLocales] = useState<{ supported: string[]; default: string }>({ supported: ['en', 'it', 'fr'], default: 'en' });
  const [langFilter, setLangFilter] = useState('all');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    loadQuotes();
    fetchLocales().then(setLocales).catch(() => {});
  }, []);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Ids are positions in the server-side store and shift after every
  // add/edit/delete, so the list is always reloaded after a mutation.
  const loadQuotes = async (showSpinner = true) => {
    try {
      if (showSpinner) setLoading(true);
      setError(null);
      setQuotes(await fetchQuotes());
    } catch (err: any) {
      setError(err.message || 'Failed to load quotes');
    } finally {
      setLoading(false);
    }
  };

  const sources = useMemo(() => {
    const set = new Set(quotes.map((q) => sourceLabel(q.source)));
    return Array.from(set).sort();
  }, [quotes]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const list = quotes.filter(
      (q) =>
        (sourceFilter === 'all' || sourceLabel(q.source) === sourceFilter) &&
        (langFilter === 'all' ||
          (langFilter === 'web-only' && webOnlyLangs(q).length > 0) ||
          (langFilter.startsWith('has:') && hasLanguage(q, langFilter.slice(4))) ||
          (langFilter.startsWith('missing:') && !hasLanguage(q, langFilter.slice(8)))) &&
        (!needle || q.text.toLowerCase().includes(needle)),
    );
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'id') cmp = a.id - b.id;
      else if (sortKey === 'served') cmp = (a.served ?? 0) - (b.served ?? 0);
      else cmp = a.text.localeCompare(b.text);
      return sortDesc ? -cmp : cmp;
    });
    return list;
  }, [quotes, search, sourceFilter, langFilter, sortKey, sortDesc]);

  const totalServed = useMemo(() => quotes.reduce((a, q) => a + (q.served ?? 0), 0), [quotes]);

  const sortBy = (key: SortKey) => {
    if (sortKey === key) setSortDesc(!sortDesc);
    else {
      setSortKey(key);
      setSortDesc(key === 'served');
    }
  };
  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '');

  const handleAddClick = () => {
    setEditingQuote(null);
    setFormText('');
    setFormAuthor('');
    setFormLang('');
    setFormTranslations({});
    setIsFormOpen(true);
  };

  const handleEditClick = (quote: Quote) => {
    setEditingQuote(quote);
    setFormText(quote.text);
    setFormAuthor(quote.author ?? '');
    setFormLang(quote.lang ?? '');
    setFormTranslations({ ...(quote.translations ?? {}) });
    setIsFormOpen(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = async (quote: Quote) => {
    const preview = quote.text.length > 80 ? quote.text.slice(0, 80) + '…' : quote.text;
    if (!window.confirm(`Delete this quote?\n\n"${preview}"`)) return;
    try {
      await deleteQuote(quote.id);
      showToast('Quote deleted', 'success');
      await loadQuotes(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to delete quote', 'error');
    }
  };

  const effectiveLang = formLang || locales.default;
  // One translation box per supported locale (except the original language),
  // plus any other language the quote already has
  const translationLangs = useMemo(() => {
    const list = locales.supported.filter((l) => baseLanguage(l) !== baseLanguage(effectiveLang));
    for (const l of Object.keys(formTranslations)) {
      if (!list.includes(l) && baseLanguage(l) !== baseLanguage(effectiveLang)) list.push(l);
    }
    return list;
  }, [locales, effectiveLang, formTranslations]);
  const langOptions = useMemo(() => {
    const list = [...locales.supported];
    if (formLang && !list.includes(formLang)) list.push(formLang);
    return list;
  }, [locales, formLang]);

  const addTranslationLang = () => {
    const tag = canonicalLocale(newTransLang);
    if (!tag) {
      showToast('Invalid language tag (use it, it-IT, pt-BR…)', 'error');
      return;
    }
    setFormTranslations({ ...formTranslations, [tag]: formTranslations[tag] ?? '' });
    setNewTransLang('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) return;
    try {
      setIsSubmitting(true);
      const translations: Record<string, string> = {};
      for (const [lang, text] of Object.entries(formTranslations)) {
        if (text.trim() && baseLanguage(lang) !== baseLanguage(effectiveLang)) translations[lang] = text.trim();
      }
      const input = {
        text: formText,
        author: formAuthor.trim() || null,
        lang: formLang || null,
        translations,
      };
      if (editingQuote) {
        await updateQuote(editingQuote.id, input);
        showToast('Quote updated', 'success');
      } else {
        await createQuote(input);
        showToast('Quote created', 'success');
      }
      setIsFormOpen(false);
      await loadQuotes(false);
    } catch (err: any) {
      showToast(err.message || 'Failed to save quote', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Quotes</h1>
          <div className="muted small">
            {quotes.length} quotes · {totalServed} served in the current stats window
          </div>
        </div>
        <div className="actions">
          <button className="btn" onClick={() => loadQuotes()}>
            Refresh
          </button>
          <button data-testid="add-quote-btn" className="btn primary" onClick={handleAddClick}>
            Add quote
          </button>
        </div>
      </div>

      {isFormOpen && (
        <form className="card" style={{ marginBottom: 'var(--spacing-lg)' }} onSubmit={handleSubmit}>
          <h2>{editingQuote ? `Edit quote #${editingQuote.id}` : 'New quote'}</h2>
          <textarea
            data-testid="quote-textarea"
            className="textarea"
            rows={4}
            value={formText}
            onChange={(e) => setFormText(e.target.value)}
            placeholder="Quote text, in its original language"
            autoFocus
            required
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
            <ByteCount text={formText} />
            <label className="small" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              Original language
              <select data-testid="quote-lang" className="select" value={formLang} onChange={(e) => setFormLang(e.target.value)}>
                <option value="">Default ({languageName(locales.default, 'en')})</option>
                {langOptions.map((l) => (
                  <option key={l} value={l}>
                    {languageName(l, 'en')} ({l})
                  </option>
                ))}
              </select>
            </label>
            <input
              className="input"
              placeholder="Author"
              value={formAuthor}
              onChange={(e) => setFormAuthor(e.target.value)}
              style={{ minWidth: 200 }}
            />
          </div>

          <h3 style={{ marginTop: 'var(--spacing-lg)' }}>Translations</h3>
          <div className="muted small" style={{ marginBottom: 6 }}>
            A page in another language shows only quotes translated into it, never a different language. Leave a box empty
            to drop that translation.
          </div>
          {translationLangs.map((lang) => (
            <div key={lang} style={{ marginBottom: 'var(--spacing-md)' }}>
              <div className="small" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong>
                  {languageName(lang, 'en')} <span className="mono muted">{lang}</span>
                </strong>
                <ByteCount text={formTranslations[lang] ?? ''} />
              </div>
              <textarea
                data-testid={`translation-${lang}`}
                className="textarea"
                rows={2}
                lang={lang}
                value={formTranslations[lang] ?? ''}
                onChange={(e) => setFormTranslations({ ...formTranslations, [lang]: e.target.value })}
                placeholder={`Translation in ${languageName(lang, 'en')}`}
              />
            </div>
          ))}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <input
              className="input"
              placeholder="Other language (e.g. de, pt-BR)"
              value={newTransLang}
              onChange={(e) => setNewTransLang(e.target.value)}
            />
            <button type="button" className="btn sm" onClick={addTranslationLang} disabled={!newTransLang.trim()}>
              Add language
            </button>
          </div>
          {editingQuote?.source && (
            <div className="muted small" style={{ marginTop: 6 }}>
              This quote comes from <span className="mono">{editingQuote.source}</span>. The edited version is saved in the
              API-managed file; the original line stays in its source file and comes back on reload.
            </div>
          )}
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', justifyContent: 'flex-end', marginTop: 'var(--spacing-md)' }}>
            <button type="button" className="btn" onClick={() => setIsFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" data-testid="quote-submit" className="btn primary" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      )}

      <div className="toolbar">
        <input
          className="input grow"
          type="search"
          placeholder="Search quotes…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="select" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="select" value={langFilter} onChange={(e) => setLangFilter(e.target.value)}>
          <option value="all">All languages</option>
          {locales.supported.map((l) => (
            <option key={`has:${l}`} value={`has:${l}`}>
              In {languageName(l, 'en')}
            </option>
          ))}
          {locales.supported.map((l) => (
            <option key={`missing:${l}`} value={`missing:${l}`}>
              Missing {languageName(l, 'en')}
            </option>
          ))}
          <option value="web-only">Web only (over {QOTD_MAX_BYTES} bytes)</option>
        </select>
      </div>

      {loading ? (
        <div className="empty">Loading quotes…</div>
      ) : error ? (
        <div className="banner err">{error}</div>
      ) : quotes.length === 0 ? (
        <div className="card empty">No quotes yet. Click "Add quote" to create one.</div>
      ) : visible.length === 0 ? (
        <div className="card empty">No quotes match your filters.</div>
      ) : (
        <div className="card table-wrap" style={{ padding: 0 }}>
          <table className="data" data-testid="quotes-list">
            <thead>
              <tr>
                <th className="sortable num" onClick={() => sortBy('id')}>
                  #{arrow('id')}
                </th>
                <th className="sortable" onClick={() => sortBy('text')}>
                  Quote{arrow('text')}
                </th>
                <th>Languages</th>
                <th>Source</th>
                <th className="sortable num" onClick={() => sortBy('served')}>
                  Served{arrow('served')}
                </th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((quote) => (
                <tr key={quote.id} data-testid={`quote-row-${quote.id}`}>
                  <td className="num muted">{quote.id}</td>
                  <td style={{ whiteSpace: 'pre-wrap' }}>
                    {quote.text}
                    {quote.author && !quote.text.includes(quote.author) && <span className="muted"> — {quote.author}</span>}
                  </td>
                  <td>
                    <span className="pill info" title={quote.lang ? 'Original language' : 'Original language not declared: default assumed'}>
                      {quote.original_lang ?? locales.default}
                      {!quote.lang && '*'}
                    </span>{' '}
                    {Object.keys(quote.translations ?? {}).map((l) => (
                      <span key={l} className="pill" title={quote.translations?.[l]}>
                        {l}
                      </span>
                    ))}{' '}
                    {webOnlyLangs(quote).length > 0 && (
                      <span
                        className="pill warn"
                        title={`Over ${QOTD_MAX_BYTES} bytes, served on the website only: ${webOnlyLangs(quote).join(', ')}`}
                      >
                        web only: {webOnlyLangs(quote).join(', ')}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="pill" title={quote.source ?? 'Added through the API'}>
                      {sourceLabel(quote.source)}
                    </span>
                  </td>
                  <td className="num">{quote.served ?? 0}</td>
                  <td className="actions">
                    <button className="btn sm" onClick={() => handleEditClick(quote)}>
                      Edit
                    </button>{' '}
                    <button className="btn sm danger" onClick={() => handleDeleteClick(quote)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
