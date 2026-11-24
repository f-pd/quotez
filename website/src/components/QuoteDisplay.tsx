import { Match, Show, Switch, batch, createEffect, createMemo, createSignal, on, onCleanup, untrack } from 'solid-js';
import { Link } from '@tanstack/solid-router';
import { ZenMode, type ModeProps } from './display-modes/ZenMode';
import { RichMode } from './display-modes/RichMode';
import { SimpleMode } from './display-modes/SimpleMode';
import { ModeSelector } from './ModeSelector';
import { LocaleSelector } from './LocaleSelector';
import { ShareButton } from './ShareButton';
import { clearSharedQuote, sharedQuote } from '../lib/share';
import { splitAuthor } from '../lib/meta';
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
import '../styles/share.css';

export type DisplayMode = 'zen' | 'rich' | 'simple';

const FALLBACK_LOCALES: LocalesInfo = { supported: ['en', 'it', 'fr'], default: 'en' };

/** "text - author" as the display modes expect it */
function joinAuthor(text: string, author: string | null): string {
  if (!author || text.includes(author)) return text;
  return `${text} - ${author}`;
}

function savedMode(): DisplayMode {
  const saved = localStorage.getItem('display_mode');
  return saved === 'zen' || saved === 'rich' || saved === 'simple' ? saved : 'zen';
}

interface QuoteDisplayProps {
  /** Locale from the URL (/it, /it-IT), if any */
  urlLocale?: string | null;
  /** Called when the visitor picks another locale */
  onLocaleChange?: (locale: string) => void;
}

export function QuoteDisplay(props: QuoteDisplayProps) {
  const [mode, setMode] = createSignal<DisplayMode>(savedMode());
  const [locales, setLocales] = createSignal<LocalesInfo | null>(null);
  const [locale, setLocale] = createSignal<string | null>(null);
  const [quote, setQuote] = createSignal<LocalizedQuote | null>(null);
  const [showOriginal, setShowOriginal] = createSignal(false);
  const [quoteId, setQuoteId] = createSignal(0);
  const [loading, setLoading] = createSignal(true);
  const [error, setError] = createSignal<'none' | 'failed' | 'no-quotes'>('none');

  // Supported languages come from the service
  let cancelled = false;
  onCleanup(() => (cancelled = true));
  fetch('/locales?format=json')
    .then((r) => (r.ok ? r.json() : FALLBACK_LOCALES))
    .catch(() => FALLBACK_LOCALES)
    .then((info: LocalesInfo) => {
      if (cancelled) return;
      batch(() => {
        setLocales(info);
        setLocale(pickLocale(info, untrack(() => props.urlLocale)));
      });
    });

  // A new locale in the URL (back/forward, links) switches the language
  createEffect(
    on(
      () => [props.urlLocale, locales()] as const,
      ([urlLocale, info]) => {
        if (!info || !urlLocale) return;
        setLocale(pickLocale(info, urlLocale));
      },
      { defer: true },
    ),
  );

  createEffect(() => {
    const l = locale();
    if (l) document.documentElement.lang = l;
  });

  let request = 0;
  const fetchQuote = async () => {
    const l = untrack(locale);
    if (!l) return;
    const mine = ++request;
    batch(() => {
      setLoading(true);
      setError('none');
      setShowOriginal(false);
    });
    try {
      // A shared link (/it/q/:id) opens on that quote; if it is gone or not
      // available in this language, a random one is shown instead
      const shared = sharedQuote();
      let response: Response | null = null;
      if (shared) {
        const byId = await fetch(`/${encodeURIComponent(l)}/quote/${encodeURIComponent(shared.id)}?format=json`).catch(() => null);
        clearSharedQuote();
        if (byId?.ok) response = byId;
      }
      response ??= await fetch(`/${encodeURIComponent(l)}/quote?format=json`);
      if (mine !== request) return;
      if (response.status === 404) {
        batch(() => {
          setQuote(null);
          setError('no-quotes');
          setLoading(false);
        });
        return;
      }
      if (!response.ok) throw new Error('Failed to fetch quote');
      const next = (await response.json()) as LocalizedQuote;
      if (mine !== request) return;
      // Text and id change together, so the display swaps them in one step
      batch(() => {
        setQuote(next);
        setQuoteId((n) => n + 1);
        setLoading(false);
      });
    } catch (err) {
      if (mine !== request) return;
      console.error('Error fetching quote:', err);
      batch(() => {
        setError('failed');
        setLoading(false);
      });
    }
  };

  // A quote for every (new) locale
  createEffect(
    on(locale, (l) => {
      if (l) void fetchQuote();
    }),
  );

  const handleModeChange = (newMode: DisplayMode) => {
    setMode(newMode);
    localStorage.setItem('display_mode', newMode);
  };

  const handleLocaleChange = (newLocale: string) => {
    saveLocale(newLocale);
    setLocale(newLocale);
    props.onLocaleChange?.(newLocale);
  };

  const uiLocale = () => locale() ?? 'en';
  const labels = createMemo(() => labelsFor(uiLocale()));
  const modeLabels = createMemo(() => ({
    ...labels(),
    couldNotLoad: error() === 'no-quotes' ? labels().noQuotesInLanguage : labels().couldNotLoad,
  }));

  const shownText = () => {
    const q = quote();
    return q ? (showOriginal() && q.original ? q.original : q.text) : null;
  };
  const shown = () => {
    const q = quote();
    const t = shownText();
    return q && t !== null ? joinAuthor(t, q.author) : null;
  };

  const shareLocale = () => {
    const l = locale()!;
    return matchSupported(l, locales()?.supported ?? []) ?? l;
  };

  const share = () => (
    <Show when={quote()?.id && locale() && error() === 'none' ? quote() : null}>
      {(q) => {
        // The image shows what is on screen: translation or original
        const parts = () => splitAuthor(shownText() ?? '', q().author);
        return (
          <ShareButton
            locale={shareLocale()}
            quoteId={q().id!}
            text={joinAuthor(q().text, q().author)}
            image={{
              text: parts().text,
              author: parts().author,
              work: q().work ?? null,
              lang: showOriginal() ? q().original_lang : q().lang,
            }}
            style={mode()}
            labels={labels()}
            class={mode() === 'zen' ? 'zen-button' : mode() === 'rich' ? 'rich-button rich-button-secondary' : 'simple-button'}
            disabled={loading()}
          />
        );
      }}
    </Show>
  );

  const modeProps: ModeProps = {
    share,
    get quote() {
      return shown();
    },
    get loading() {
      return loading();
    },
    get error() {
      return error() !== 'none';
    },
    onNewQuote: () => void fetchQuote(),
    get labels() {
      return modeLabels();
    },
    get work() {
      return quote()?.work ?? null;
    },
    get quoteId() {
      return quoteId();
    },
    get showingOriginal() {
      return showOriginal();
    },
  };

  // Long texts get a smaller type scale so they fit the screen without scrolling
  const sizeClass = () => {
    const s = shown();
    const length = s ? Array.from(s).length : 0;
    return length > 320 ? 'qd-xlong' : length > 160 ? 'qd-long' : '';
  };

  // Header, quote and footer stay in the normal flow of a full-height column:
  // nothing is fixed on top of the quote, whatever its length or the screen.
  return (
    <div class="quote-display-container">
      <header class="qd-header">
        <ModeSelector mode={mode()} onModeChange={handleModeChange} />
        <Show when={locales() && locale()}>
          <LocaleSelector
            locales={locales()!.supported}
            value={matchSupported(locale()!, locales()!.supported) ?? locale()!}
            label={labels().language}
            onChange={handleLocaleChange}
          />
        </Show>
      </header>
      <div class={`qd-main ${sizeClass()}`} data-testid="quote-main">
        <Switch>
          <Match when={mode() === 'zen'}>
            <ZenMode {...modeProps} />
          </Match>
          <Match when={mode() === 'rich'}>
            <RichMode {...modeProps} />
          </Match>
          <Match when={mode() === 'simple'}>
            <SimpleMode {...modeProps} />
          </Match>
        </Switch>
      </div>
      <footer class="qd-footer">
        <Show
          when={props.urlLocale}
          fallback={
            <Link class="about-link" data-testid="about-link" to="/about">
              {aboutFor(uiLocale()).link}
            </Link>
          }
        >
          {(l) => (
            <Link class="about-link" data-testid="about-link" to="/$locale/about" params={{ locale: l() }}>
              {aboutFor(uiLocale()).link}
            </Link>
          )}
        </Show>
        <Show when={quote()?.translated && quote()?.original && !loading() ? quote() : null}>
          {(q) => (
            <button
              class="original-toggle"
              data-testid="original-toggle"
              onClick={() => setShowOriginal(!showOriginal())}
              lang={showOriginal() ? uiLocale() : q().original_lang}
            >
              {showOriginal()
                ? labels().showTranslation(languageName(q().lang, uiLocale()))
                : labels().showOriginal(languageName(q().original_lang, uiLocale()))}
            </button>
          )}
        </Show>
      </footer>
    </div>
  );
}
