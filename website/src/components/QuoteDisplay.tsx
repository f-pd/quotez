import { useState, useEffect, useCallback, useMemo } from 'react';
import { ZenMode } from './display-modes/ZenMode';
import { RichMode } from './display-modes/RichMode';
import { SimpleMode } from './display-modes/SimpleMode';
import { Link } from '@tanstack/react-router';
import { ModeSelector } from './ModeSelector';
import { LocaleSelector } from './LocaleSelector';
import {
  labelsFor,
  languageName,
  matchSupported,
  pickLocale,
  saveLocale,
  type LocalesInfo,
  type LocalizedQuote,
} from '../lib/i18n';
import { aboutFor } from '../lib/about';
import '../styles/locale.css';
import '../styles/about.css';
import '../styles/layout.css';

export type DisplayMode = 'zen' | 'rich' | 'simple';

const FALLBACK_LOCALES: LocalesInfo = { supported: ['en', 'it', 'fr'], default: 'en' };

/** "text - author" as the display modes expect it */
function joinAuthor(text: string, author: string | null): string {
  if (!author || text.includes(author)) return text;
  return `${text} - ${author}`;
}

interface QuoteDisplayProps {
  /** Locale from the URL (/it, /it-IT), if any */
  urlLocale?: string | null;
  /** Called when the visitor picks another locale */
  onLocaleChange?: (locale: string) => void;
}

export function QuoteDisplay({ urlLocale, onLocaleChange }: QuoteDisplayProps) {
  const [mode, setMode] = useState<DisplayMode>(() => {
    const savedMode = localStorage.getItem('display_mode');
    if (savedMode === 'zen' || savedMode === 'rich' || savedMode === 'simple') {
      return savedMode;
    }
    return 'zen';
  });
  const [locales, setLocales] = useState<LocalesInfo | null>(null);
  const [locale, setLocale] = useState<string | null>(null);
  const [quote, setQuote] = useState<LocalizedQuote | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
  const [quoteId, setQuoteId] = useState(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<'none' | 'failed' | 'no-quotes'>('none');

  // Supported languages come from the service
  useEffect(() => {
    let cancelled = false;
    fetch('/locales?format=json')
      .then((r) => (r.ok ? r.json() : FALLBACK_LOCALES))
      .catch(() => FALLBACK_LOCALES)
      .then((info: LocalesInfo) => {
        if (cancelled) return;
        setLocales(info);
        setLocale(pickLocale(info, urlLocale));
      });
    return () => {
      cancelled = true;
    };
    // urlLocale changes are handled below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!locales || !urlLocale) return;
    const picked = pickLocale(locales, urlLocale);
    setLocale((current) => (current === picked ? current : picked));
  }, [urlLocale, locales]);

  useEffect(() => {
    if (locale) document.documentElement.lang = locale;
  }, [locale]);

  const fetchQuote = useCallback(async () => {
    if (!locale) return;
    setLoading(true);
    setError('none');
    setShowOriginal(false);
    try {
      const response = await fetch(`/${encodeURIComponent(locale)}/quote?format=json`);
      if (response.status === 404) {
        setQuote(null);
        setError('no-quotes');
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch quote');
      setQuote((await response.json()) as LocalizedQuote);
      setQuoteId((n) => n + 1);
    } catch (err) {
      console.error('Error fetching quote:', err);
      setError('failed');
    } finally {
      setLoading(false);
    }
  }, [locale]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  const handleModeChange = (newMode: DisplayMode) => {
    setMode(newMode);
    localStorage.setItem('display_mode', newMode);
  };

  const handleLocaleChange = (newLocale: string) => {
    saveLocale(newLocale);
    setLocale(newLocale);
    onLocaleChange?.(newLocale);
  };

  const uiLocale = locale ?? 'en';
  const labels = labelsFor(uiLocale);
  const modeLabels = useMemo(
    () => ({
      ...labels,
      couldNotLoad: error === 'no-quotes' ? labels.noQuotesInLanguage : labels.couldNotLoad,
    }),
    [labels, error],
  );

  const shown = quote
    ? joinAuthor(showOriginal && quote.original ? quote.original : quote.text, quote.author)
    : null;

  const props = {
    quote: shown,
    loading,
    error: error !== 'none',
    onNewQuote: fetchQuote,
    labels: modeLabels,
    work: quote?.work ?? null,
    quoteId,
    showingOriginal: showOriginal,
  };

  const renderMode = () => {
    switch (mode) {
      case 'zen':
        return <ZenMode {...props} />;
      case 'rich':
        return <RichMode {...props} />;
      case 'simple':
        return <SimpleMode {...props} />;
      default:
        return <div>Mode {mode} not implemented yet</div>;
    }
  };

  // Long texts get a smaller type scale so they fit the screen without scrolling
  const length = shown ? Array.from(shown).length : 0;
  const sizeClass = length > 320 ? 'qd-xlong' : length > 160 ? 'qd-long' : '';

  // Header, quote and footer stay in the normal flow of a full-height column:
  // nothing is fixed on top of the quote, whatever its length or the screen.
  return (
    <div className="quote-display-container">
      <header className="qd-header">
        <ModeSelector mode={mode} onModeChange={handleModeChange} />
        {locales && locale && (
          <LocaleSelector
            locales={locales.supported}
            value={matchSupported(locale, locales.supported) ?? locale}
            label={labels.language}
            onChange={handleLocaleChange}
          />
        )}
      </header>
      <div className={`qd-main ${sizeClass}`} data-testid="quote-main">
        {renderMode()}
      </div>
      <footer className="qd-footer">
        <Link
          className="about-link"
          data-testid="about-link"
          {...(urlLocale
            ? { to: '/$locale/about' as const, params: { locale: urlLocale } }
            : { to: '/about' as const })}
        >
          {aboutFor(uiLocale).link}
        </Link>
        {quote?.translated && quote.original && !loading && (
          <button
            className="original-toggle"
            data-testid="original-toggle"
            onClick={() => setShowOriginal(!showOriginal)}
            lang={showOriginal ? uiLocale : quote.original_lang}
          >
            {showOriginal
              ? labels.showTranslation(languageName(quote.lang, uiLocale))
              : labels.showOriginal(languageName(quote.original_lang, uiLocale))}
          </button>
        )}
      </footer>
    </div>
  );
}
