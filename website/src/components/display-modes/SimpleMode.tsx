import type { ModeLabels } from '../../lib/i18n';
import '../../styles/simple.css';

interface SimpleModeProps {
  quote: string | null;
  loading: boolean;
  error: boolean;
  onNewQuote: () => void;
  labels?: ModeLabels;
  /** Source work shown under the author */
  work?: string | null;
}

const DEFAULT_LABELS: ModeLabels = { newQuote: 'New Quote', loading: 'Loading...', couldNotLoad: 'Could not load quote', retry: 'Retry' };

export function SimpleMode({ quote, loading, error, onNewQuote, labels = DEFAULT_LABELS, work }: SimpleModeProps) {
  const renderContent = () => {
    if (loading && !quote) {
      return <div className="simple-status">{labels.loading}</div>;
    }

    if (error) {
      return (
        <div className="simple-error">
          <p>{labels.couldNotLoad}</p>
          <button className="simple-button" onClick={onNewQuote}>{labels.retry}</button>
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
      <div className="simple-quote-wrapper">
        <div className="simple-quote" data-testid="quote-text">
          {text}
        </div>
        {author && (
          <div className="simple-author">
            — {author}
          </div>
        )}
        {work && (
          <cite className="quote-work simple-work" data-testid="quote-work">
            {work}
          </cite>
        )}
      </div>
    );
  };

  return (
    <div className="simple-container">
      {renderContent()}
      {(!loading || quote) && !error && (
        <button 
          className="simple-button" 
          data-testid="new-quote-btn" 
          onClick={onNewQuote}
          disabled={loading}
        >
          {labels.newQuote}
        </button>
      )}
    </div>
  );
}
