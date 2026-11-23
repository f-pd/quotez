import { useEffect, useMemo, useState } from 'react';
import { fetchQuotes, createQuote, updateQuote, deleteQuote, type Quote } from '../../lib/api';

type SortKey = 'id' | 'served' | 'text';

function sourceLabel(source: string | null | undefined): string {
  if (!source) return 'API';
  const parts = source.split('/');
  return parts[parts.length - 1] || source;
}

export function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quote | null>(null);
  const [formText, setFormText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('id');
  const [sortDesc, setSortDesc] = useState(false);

  useEffect(() => {
    loadQuotes();
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
  }, [quotes, search, sourceFilter, sortKey, sortDesc]);

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
    setIsFormOpen(true);
  };

  const handleEditClick = (quote: Quote) => {
    setEditingQuote(quote);
    setFormText(quote.text);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formText.trim()) return;
    try {
      setIsSubmitting(true);
      if (editingQuote) {
        await updateQuote(editingQuote.id, formText);
        showToast('Quote updated', 'success');
      } else {
        await createQuote(formText);
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
            placeholder="Quote text"
            autoFocus
            required
          />
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
                  <td style={{ whiteSpace: 'pre-wrap' }}>{quote.text}</td>
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
