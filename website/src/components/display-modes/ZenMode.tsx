import { useEffect, useState } from 'react';
import type { ModeLabels } from '../../lib/i18n';
import { SmoothSwap } from '../SmoothSwap';
import '../../styles/zen.css';

interface ZenModeProps {
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

export function ZenMode({ quote, loading, error, onNewQuote, labels = DEFAULT_LABELS, work, quoteId = 0, showingOriginal = false }: ZenModeProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (quote && !loading && !error) {
      // Small delay to ensure DOM is updated before applying transition class
      const timer = setTimeout(() => setVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [quote, loading, error]);

  const renderContent = () => {
    if (loading && !quote) {
      return <div className="zen-status">{labels.loading}</div>;
    }

    if (error) {
      return (
        <div className="zen-error">
          <p>{labels.couldNotLoad}</p>
          <button className="zen-button" onClick={onNewQuote}>{labels.retry}</button>
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
      <SmoothSwap swapKey={`${quoteId}:${showingOriginal}`}>
        <div className="zen-quote-wrapper">
          <div 
            className={`zen-quote ${visible ? 'visible' : ''}`} 
            data-testid="quote-text"
          >
            {text}
          </div>
          {author && (
            <div className="zen-author">
              — {author}
            </div>
          )}
          {work && (
            <cite className="quote-work zen-work" data-testid="quote-work">
              {work}
            </cite>
          )}
        </div>
      </SmoothSwap>
    );
  };

  return (
    <div className="zen-container">
      <div className="zen-bg" />
      <div className="zen-content">
        {renderContent()}
        
        <button 
          className="zen-button" 
          data-testid="new-quote-btn" 
          onClick={onNewQuote}
          disabled={loading}
        >
          {labels.newQuote}
        </button>
      </div>
    </div>
  );
}
