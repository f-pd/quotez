import { For, Match, Show, Switch, createMemo, createSignal } from 'solid-js';
import { fetchQuotes, createQuote, updateQuote, deleteQuote, fetchLocales, type Quote } from '../../lib/api';
import { QOTD_MAX_BYTES, baseLanguage, canonicalLocale, languageName, utf8Bytes } from '../../lib/i18n';

type SortKey = 'id' | 'served' | 'text';

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'API';
  const parts = source.split('/');
  return parts[parts.length - 1] || source;
}

/** Byte size against the RFC 865 limit; over it the text is served on the web only */
function ByteCount(props: { text: string }) {
  const bytes = () => utf8Bytes(props.text);
  const over = () => bytes() > QOTD_MAX_BYTES;
  return (
    <span class="muted small" style={{ display: 'inline-flex', gap: '6px', 'align-items': 'center' }}>
      <span style={over() ? { color: 'var(--color-danger, #e5484d)' } : undefined}>
        {bytes()}/{QOTD_MAX_BYTES} bytes
      </span>
      <Show when={over()}>
        <span class="pill warn" title="Longer than the RFC 865 limit: shown on the website, never sent on port 17/8017">
          web only
        </span>
      </Show>
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
  const [quotes, setQuotes] = createSignal<Quote[]>([]);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<string | null>(null);
  const [toast, setToast] = createSignal<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isFormOpen, setIsFormOpen] = createSignal(false);
  const [editingQuote, setEditingQuote] = createSignal<Quote | null>(null);
  const [formText, setFormText] = createSignal('');
  const [formAuthor, setFormAuthor] = createSignal('');
  const [formWork, setFormWork] = createSignal('');
  const [formLang, setFormLang] = createSignal('');
  const [formTranslations, setFormTranslations] = createSignal<Record<string, string>>({});
  const [formWorks, setFormWorks] = createSignal<Record<string, string>>({});
  const [newTransLang, setNewTransLang] = createSignal('');
  const [locales, setLocales] = createSignal<{ supported: string[]; default: string }>({ supported: ['en', 'it', 'fr'], default: 'en' });
  const [langFilter, setLangFilter] = createSignal('all');
  const [isSubmitting, setIsSubmitting] = createSignal(false);

  const [search, setSearch] = createSignal('');
  const [sourceFilter, setSourceFilter] = createSignal('all');
  const [sortKey, setSortKey] = createSignal<SortKey>('id');
  const [sortDesc, setSortDesc] = createSignal(false);

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

  loadQuotes();
  fetchLocales().then(setLocales).catch(() => {});

  const sources = createMemo(() => Array.from(new Set(quotes().map((q) => sourceLabel(q.source)))).sort());

  const visible = createMemo(() => {
    const needle = search().trim().toLowerCase();
    const lf = langFilter();
    const sf = sourceFilter();
    const list = quotes().filter(
      (q) =>
        (sf === 'all' || sourceLabel(q.source) === sf) &&
        (lf === 'all' ||
          (lf === 'web-only' && webOnlyLangs(q).length > 0) ||
          (lf === 'no-work' && !q.work && Object.keys(q.works ?? {}).length === 0) ||
          (lf.startsWith('has:') && hasLanguage(q, lf.slice(4))) ||
          (lf.startsWith('missing:') && !hasLanguage(q, lf.slice(8)))) &&
        (!needle || q.text.toLowerCase().includes(needle)),
    );
    const key = sortKey();
    const desc = sortDesc();
    list.sort((a, b) => {
      let cmp = 0;
      if (key === 'id') cmp = a.id - b.id;
      else if (key === 'served') cmp = (a.served ?? 0) - (b.served ?? 0);
      else cmp = a.text.localeCompare(b.text);
      return desc ? -cmp : cmp;
    });
    return list;
  });

  const totalServed = createMemo(() => quotes().reduce((a, q) => a + (q.served ?? 0), 0));

  const sortBy = (key: SortKey) => {
    if (sortKey() === key) setSortDesc(!sortDesc());
    else {
      setSortKey(key);
      setSortDesc(key === 'served');
    }
  };
  const arrow = (key: SortKey) => (sortKey() === key ? (sortDesc() ? ' ↓' : ' ↑') : '');

  const handleAddClick = () => {
    setEditingQuote(null);
    setFormText('');
    setFormAuthor('');
    setFormWork('');
    setFormWorks({});
    setFormLang('');
    setFormTranslations({});
    setIsFormOpen(true);
  };

  const handleEditClick = (quote: Quote) => {
    setEditingQuote(quote);
    setFormText(quote.text);
    setFormAuthor(quote.author ?? '');
    setFormWork(quote.work ?? '');
    setFormWorks({ ...(quote.works ?? {}) });
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

  const effectiveLang = () => formLang() || locales().default;
  // One translation box per supported locale (except the original language),
  // plus any other language the quote already has
  const translationLangs = createMemo(() => {
    const original = baseLanguage(effectiveLang());
    const list = locales().supported.filter((l) => baseLanguage(l) !== original);
    for (const l of Object.keys(formTranslations())) {
      if (!list.includes(l) && baseLanguage(l) !== original) list.push(l);
    }
    return list;
  });
  const langOptions = createMemo(() => {
    const list = [...locales().supported];
    if (formLang() && !list.includes(formLang())) list.push(formLang());
    return list;
  });

  const addTranslationLang = () => {
    const tag = canonicalLocale(newTransLang());
    if (!tag) {
      showToast('Invalid language tag (use it, it-IT, pt-BR…)', 'error');
      return;
    }
    setFormTranslations({ ...formTranslations(), [tag]: formTranslations()[tag] ?? '' });
    setNewTransLang('');
  };

  const handleSubmit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!formText().trim()) return;
    try {
      setIsSubmitting(true);
      const translations: Record<string, string> = {};
      for (const [lang, text] of Object.entries(formTranslations())) {
        if (text.trim() && baseLanguage(lang) !== baseLanguage(effectiveLang())) translations[lang] = text.trim();
      }
      const works: Record<string, string> = {};
      for (const [lang, text] of Object.entries(formWorks())) {
        if (text.trim()) works[lang] = text.trim();
      }
      const input = {
        text: formText(),
        author: formAuthor().trim() || null,
        work: formWork().trim() || null,
        works,
        lang: formLang() || null,
        translations,
      };
      const editing = editingQuote();
      if (editing) {
        await updateQuote(editing.id, input);
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
      <div class="page-head">
        <div>
          <h1>Quotes</h1>
          <div class="muted small">
            {quotes().length} quotes · {totalServed()} served in the current stats window
          </div>
        </div>
        <div class="actions">
          <button class="btn" onClick={() => loadQuotes()}>
            Refresh
          </button>
          <button data-testid="add-quote-btn" class="btn primary" onClick={handleAddClick}>
            Add quote
          </button>
        </div>
      </div>

      <Show when={isFormOpen()}>
        <form class="card" style={{ 'margin-bottom': 'var(--spacing-lg)' }} onSubmit={handleSubmit}>
          <h2>{editingQuote() ? `Edit quote #${editingQuote()!.id}` : 'New quote'}</h2>
          <textarea
            data-testid="quote-textarea"
            class="textarea"
            rows={4}
            value={formText()}
            onInput={(e) => setFormText(e.currentTarget.value)}
            placeholder="Quote text, in its original language"
            autofocus
            ref={(el) => queueMicrotask(() => el.focus())}
            required
          />
          <div style={{ display: 'flex', gap: 'var(--spacing-md)', 'flex-wrap': 'wrap', 'align-items': 'center', 'margin-top': '6px' }}>
            <ByteCount text={formText()} />
            <label class="small" style={{ display: 'inline-flex', gap: '6px', 'align-items': 'center' }}>
              Original language
              <select data-testid="quote-lang" class="select" value={formLang()} onChange={(e) => setFormLang(e.currentTarget.value)}>
                <option value="" selected={formLang() === ''}>
                  Default ({languageName(locales().default, 'en')})
                </option>
                <For each={langOptions()}>
                  {(l) => (
                    <option value={l} selected={l === formLang()}>
                      {languageName(l, 'en')} ({l})
                    </option>
                  )}
                </For>
              </select>
            </label>
            <input
              class="input"
              placeholder="Author"
              value={formAuthor()}
              onInput={(e) => setFormAuthor(e.currentTarget.value)}
              style={{ 'min-width': '200px' }}
            />
          </div>
          <h3 style={{ 'margin-top': 'var(--spacing-lg)' }}>Source</h3>
          <div class="muted small" style={{ 'margin-bottom': '6px' }}>
            Book, speech or work with a precise reference. Keep titles in their original language and write the rest
            (chapter, preface, closing words, dates) in each page language.
          </div>
          <For each={locales().supported}>
            {(lang) => (
              <label class="small" style={{ display: 'block', 'margin-bottom': 'var(--spacing-sm)' }}>
                <strong>
                  {languageName(lang, 'en')} <span class="mono muted">{lang}</span>
                </strong>
                <input
                  data-testid={`quote-work-${lang}`}
                  class="input"
                  lang={lang}
                  placeholder={
                    lang === 'it'
                      ? 'e.g. Grundlinien der Philosophie des Rechts (1820), Prefazione'
                      : `Source described in ${languageName(lang, 'en')}`
                  }
                  value={formWorks()[lang] ?? ''}
                  onInput={(e) => setFormWorks({ ...formWorks(), [lang]: e.currentTarget.value })}
                  style={{ width: '100%', 'margin-top': '4px' }}
                />
              </label>
            )}
          </For>
          <label class="small" style={{ display: 'block' }}>
            <strong>Fallback</strong> <span class="muted">for languages without their own description</span>
            <input
              data-testid="quote-work"
              class="input"
              placeholder="e.g. Epistulae morales ad Lucilium 1, 3"
              value={formWork()}
              onInput={(e) => setFormWork(e.currentTarget.value)}
              style={{ width: '100%', 'margin-top': '4px' }}
            />
          </label>

          <h3 style={{ 'margin-top': 'var(--spacing-lg)' }}>Translations</h3>
          <div class="muted small" style={{ 'margin-bottom': '6px' }}>
            A page in another language shows only quotes translated into it, never a different language. Leave a box empty
            to drop that translation.
          </div>
          <For each={translationLangs()}>
            {(lang) => (
              <div style={{ 'margin-bottom': 'var(--spacing-md)' }}>
                <div class="small" style={{ display: 'flex', 'justify-content': 'space-between', 'margin-bottom': '4px' }}>
                  <strong>
                    {languageName(lang, 'en')} <span class="mono muted">{lang}</span>
                  </strong>
                  <ByteCount text={formTranslations()[lang] ?? ''} />
                </div>
                <textarea
                  data-testid={`translation-${lang}`}
                  class="textarea"
                  rows={2}
                  lang={lang}
                  value={formTranslations()[lang] ?? ''}
                  onInput={(e) => setFormTranslations({ ...formTranslations(), [lang]: e.currentTarget.value })}
                  placeholder={`Translation in ${languageName(lang, 'en')}`}
                />
              </div>
            )}
          </For>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)' }}>
            <input
              class="input"
              placeholder="Other language (e.g. de, pt-BR)"
              value={newTransLang()}
              onInput={(e) => setNewTransLang(e.currentTarget.value)}
            />
            <button type="button" class="btn sm" onClick={addTranslationLang} disabled={!newTransLang().trim()}>
              Add language
            </button>
          </div>
          <Show when={editingQuote()?.source}>
            <div class="muted small" style={{ 'margin-top': '6px' }}>
              This quote comes from <span class="mono">{editingQuote()!.source}</span>. The edited version is saved in the
              API-managed file; the original line stays in its source file and comes back on reload.
            </div>
          </Show>
          <div style={{ display: 'flex', gap: 'var(--spacing-sm)', 'justify-content': 'flex-end', 'margin-top': 'var(--spacing-md)' }}>
            <button type="button" class="btn" onClick={() => setIsFormOpen(false)}>
              Cancel
            </button>
            <button type="submit" data-testid="quote-submit" class="btn primary" disabled={isSubmitting()}>
              {isSubmitting() ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </Show>

      <div class="toolbar">
        <input
          class="input grow"
          type="search"
          placeholder="Search quotes…"
          value={search()}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
        <select class="select" value={sourceFilter()} onChange={(e) => setSourceFilter(e.currentTarget.value)}>
          <option value="all">All sources</option>
          <For each={sources()}>
            {(s) => (
              <option value={s} selected={s === sourceFilter()}>
                {s}
              </option>
            )}
          </For>
        </select>
        <select class="select" value={langFilter()} onChange={(e) => setLangFilter(e.currentTarget.value)}>
          <option value="all">All languages</option>
          <For each={locales().supported}>
            {(l) => (
              <option value={`has:${l}`} selected={langFilter() === `has:${l}`}>
                In {languageName(l, 'en')}
              </option>
            )}
          </For>
          <For each={locales().supported}>
            {(l) => (
              <option value={`missing:${l}`} selected={langFilter() === `missing:${l}`}>
                Missing {languageName(l, 'en')}
              </option>
            )}
          </For>
          <option value="web-only">Web only (over {QOTD_MAX_BYTES} bytes)</option>
          <option value="no-work">Without source</option>
        </select>
      </div>

      <Switch>
        <Match when={loading()}>
          <div class="empty">Loading quotes…</div>
        </Match>
        <Match when={error()}>
          <div class="banner err">{error()}</div>
        </Match>
        <Match when={quotes().length === 0}>
          <div class="card empty">No quotes yet. Click "Add quote" to create one.</div>
        </Match>
        <Match when={visible().length === 0}>
          <div class="card empty">No quotes match your filters.</div>
        </Match>
        <Match when={true}>
          <div class="card table-wrap" style={{ padding: 0 }}>
            <table class="data" data-testid="quotes-list">
              <thead>
                <tr>
                  <th class="sortable num" onClick={() => sortBy('id')}>
                    #{arrow('id')}
                  </th>
                  <th class="sortable" onClick={() => sortBy('text')}>
                    Quote{arrow('text')}
                  </th>
                  <th>Languages</th>
                  <th>Source</th>
                  <th class="sortable num" onClick={() => sortBy('served')}>
                    Served{arrow('served')}
                  </th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <For each={visible()}>
                  {(quote) => (
                    <tr data-testid={`quote-row-${quote.id}`}>
                      <td class="num muted">{quote.id}</td>
                      <td style={{ 'white-space': 'pre-wrap' }}>
                        {quote.text}
                        <Show when={quote.author && !quote.text.includes(quote.author)}>
                          <span class="muted"> — {quote.author}</span>
                        </Show>
                        <Show
                          when={quote.work}
                          fallback={
                            <div class="small" style={{ color: 'var(--color-danger, #e5484d)' }}>
                              No source
                            </div>
                          }
                        >
                          <div class="muted small" style={{ 'font-style': 'italic' }}>
                            {quote.work}
                          </div>
                        </Show>
                      </td>
                      <td>
                        <span
                          class="pill info"
                          title={quote.lang ? 'Original language' : 'Original language not declared: default assumed'}
                        >
                          {quote.original_lang ?? locales().default}
                          {!quote.lang && '*'}
                        </span>{' '}
                        <For each={Object.keys(quote.translations ?? {})}>
                          {(l) => (
                            <span class="pill" title={quote.translations?.[l]}>
                              {l}
                            </span>
                          )}
                        </For>{' '}
                        <Show when={webOnlyLangs(quote).length > 0}>
                          <span
                            class="pill warn"
                            title={`Over ${QOTD_MAX_BYTES} bytes, served on the website only: ${webOnlyLangs(quote).join(', ')}`}
                          >
                            web only: {webOnlyLangs(quote).join(', ')}
                          </span>
                        </Show>
                      </td>
                      <td>
                        <span class="pill" title={quote.source ?? 'Added through the API'}>
                          {sourceLabel(quote.source)}
                        </span>
                      </td>
                      <td class="num">{quote.served ?? 0}</td>
                      <td class="actions">
                        <button class="btn sm" onClick={() => handleEditClick(quote)}>
                          Edit
                        </button>{' '}
                        <button class="btn sm danger" onClick={() => handleDeleteClick(quote)}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </div>
        </Match>
      </Switch>

      <Show when={toast()}>{(t) => <div class={`toast ${t().type}`}>{t().message}</div>}</Show>
    </div>
  );
}
