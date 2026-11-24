import { useEffect, useRef, useState } from 'react';
import type { ModeLabels } from '../../lib/i18n';
import { SmoothSwap } from '../SmoothSwap';
import '../../styles/rich.css';

interface RichModeProps {
  quote: string | null;
  loading: boolean;
  error: boolean;
  onNewQuote: () => void;
  labels?: ModeLabels;
  /** Source work shown under the author */
  work?: string | null;
  /** Changes on every new quote */
  quoteId?: number;
  /** True while the original language is shown instead of the translation */
  showingOriginal?: boolean;
}

const DEFAULT_LABELS: ModeLabels = { newQuote: 'New Quote', loading: 'Loading...', couldNotLoad: 'Could not load quote', retry: 'Retry' };

export function RichMode({ quote, loading, error, onNewQuote, labels = DEFAULT_LABELS, work, quoteId = 0, showingOriginal = false }: RichModeProps) {
  const [visible, setVisible] = useState(false);
  const [quoteCount, setQuoteCount] = useState(0);

  useEffect(() => {
    // The card fades in once; later quotes swap inside it (SmoothSwap)
    if (quote && !error) {
      setQuoteCount(prev => prev + 1);
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    }
    if (error) setVisible(false);
  }, [quote, error]);

  // Typewriter effect that reveals characters one by one, so long quotes
  // wrap onto several lines instead of being clipped on a single line.
  // The count belongs to one text: a new text starts at 0 on its very first
  // render (no flash of the whole text), and loading the next quote leaves
  // the current one untouched while it fades out.
  const [typing, setTyping] = useState<{ text: string | null; n: number }>({ text: null, n: 0 });
  const typed = typing.text === quote ? typing.n : 0;
  const lastQuoteId = useRef(quoteId);
  useEffect(() => {
    if (!quote || error) return;
    // Switching translation/original: wait for the old text to fade out
    const delay = lastQuoteId.current === quoteId ? 280 : 0;
    lastQuoteId.current = quoteId;
    const total = quote.length;
    const step = Math.max(10, Math.min(40, 2000 / Math.max(total, 1)));
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let n = 0;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = setTimeout(() => {
      if (reduced) {
        setTyping({ text: quote, n: total });
        return;
      }
      timer = setInterval(() => {
        n += 1;
        setTyping({ text: quote, n });
        if (n >= total) clearInterval(timer);
      }, step);
    }, delay);
    return () => {
      clearTimeout(start);
      if (timer) clearInterval(timer);
    };
    // quoteId is read through the ref; a new id always comes with a new text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote, error]);

  const renderContent = () => {
    if (loading && !quote) {
      return <div className="rich-status">{labels.loading}</div>;
    }

    if (error) {
      return (
        <div className="rich-error">
          <p>{labels.couldNotLoad}</p>
          <button className="rich-button" onClick={onNewQuote}>{labels.retry}</button>
        </div>
      );
    }

    if (!quote) return null;

    let text = quote;
    let author = '';

    // The attribution follows the last " - " (seed convention); " — " only
    // when there is none, since quotes may contain em dashes themselves
    if (quote.includes(' - ')) {
      const parts = quote.split(' - ');
      author = parts.pop() || '';
      text = parts.join(' - ');
    } else if (quote.includes(' — ')) {
      const parts = quote.split(' — ');
      author = parts.pop() || '';
      text = parts.join(' — ');
    }

    return (
      <div className={`rich-card ${visible ? 'visible' : ''}`}>
        <div className="rich-counter" data-testid="quote-counter">
          Quote #{quoteId || quoteCount}
        </div>
        <SmoothSwap swapKey={`${quoteId}:${showingOriginal}`}>
        <div className={`rich-quote-wrapper ${loading ? 'is-loading' : ''}`}>
          <div className="rich-quote" data-testid="quote-text" aria-label={text}>
            <span aria-hidden="true">{text.slice(0, typed)}</span>
            <span className={`rich-caret ${typed >= text.length ? 'done' : ''}`} aria-hidden="true" />
            <span className="rich-quote-rest" aria-hidden="true">{text.slice(typed)}</span>
          </div>
          {/* Author and source appear together once the text is typed */}
          <div className={`rich-meta ${quote.length > 0 && typed >= quote.length ? 'shown' : ''}`}>
            {author && <div className="rich-author">— {author}</div>}
            {work && (
              <cite className="quote-work rich-work" data-testid="quote-work">
                {work}
              </cite>
            )}
          </div>
        </div>
        </SmoothSwap>
        <button 
          className="rich-button" 
          data-testid="new-quote-btn" 
          onClick={onNewQuote}
          disabled={loading}
        >
          {labels.newQuote}
        </button>
      </div>
    );
  };

  return (
    <div className="rich-container">
      <div className="rich-bg" />
      {renderContent()}
    </div>
  );
}
