import { useEffect, useState } from 'react';
import type { ModeLabels } from '../../lib/i18n';
import '../../styles/rich.css';

interface RichModeProps {
  quote: string | null;
  loading: boolean;
  error: boolean;
  onNewQuote: () => void;
  labels?: ModeLabels;
}

const DEFAULT_LABELS: ModeLabels = { newQuote: 'New Quote', loading: 'Loading...', couldNotLoad: 'Could not load quote', retry: 'Retry' };

export function RichMode({ quote, loading, error, onNewQuote, labels = DEFAULT_LABELS }: RichModeProps) {
  const [visible, setVisible] = useState(false);
  const [quoteCount, setQuoteCount] = useState(0);
  const [typed, setTyped] = useState(0);

  useEffect(() => {
    if (quote && !loading && !error) {
      setQuoteCount(prev => prev + 1);
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [quote, loading, error]);

  // Typewriter effect that reveals characters one by one, so long quotes
  // wrap onto several lines instead of being clipped on a single line.
  useEffect(() => {
    setTyped(0);
    if (!quote || loading || error) return;
    const total = quote.length;
    const step = Math.max(10, Math.min(40, 2000 / Math.max(total, 1)));
    let n = 0;
    const timer = setInterval(() => {
      n += 1;
      setTyped(n);
      if (n >= total) clearInterval(timer);
    }, step);
    return () => clearInterval(timer);
  }, [quote, loading, error]);

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

    if (quote.includes(' — ')) {
      const parts = quote.split(' — ');
      author = parts.pop() || '';
      text = parts.join(' — ');
    } else if (quote.includes(' - ')) {
      const parts = quote.split(' - ');
      author = parts.pop() || '';
      text = parts.join(' - ');
    }

    return (
      <div className={`rich-card ${visible ? 'visible' : ''}`}>
        <div className="rich-counter" data-testid="quote-counter">
          Quote #{quoteCount}
        </div>
        <div className="rich-quote-wrapper">
          <div className="rich-quote" data-testid="quote-text" aria-label={text}>
            <span aria-hidden="true">{text.slice(0, typed)}</span>
            <span className={`rich-caret ${typed >= text.length ? 'done' : ''}`} aria-hidden="true" />
            <span className="rich-quote-rest" aria-hidden="true">{text.slice(typed)}</span>
          </div>
          {author && (
            <div className={`rich-author ${visible ? 'visible' : ''}`}>
              — {author}
            </div>
          )}
        </div>
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
