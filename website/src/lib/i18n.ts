/**
 * Page locale and quote languages.
 *
 * Locales are BCP 47 tags (it, it-IT, fr, en-US). The service decides which
 * quote languages are supported (GET /locales); the page locale picks the
 * language quotes are shown in, and only quotes that exist in that language
 * are served (never a quote in another language).
 */

export type LocalesInfo = { supported: string[]; default: string };

export type LocalizedQuote = {
  text: string;
  author: string | null;
  tags: string[];
  /** Language of `text` */
  lang: string;
  original_lang: string;
  translated: boolean;
  /** Text in its original language, present when `translated` */
  original?: string;
};

/** RFC 865 limit: quotes longer than this many UTF-8 bytes are web only */
export const QOTD_MAX_BYTES = 511;

const encoder = new TextEncoder();
export function utf8Bytes(text: string): number {
  return encoder.encode(text).length;
}

/** "IT_it" -> "it-IT"; null when not a language tag */
export function canonicalLocale(raw: string): string | null {
  const parts = raw.trim().split(/[-_]/);
  const first = parts[0] ?? '';
  if (!/^[A-Za-z]{2,3}$/.test(first)) return null;
  const out = [first.toLowerCase()];
  for (const p of parts.slice(1)) {
    if (!/^[A-Za-z0-9]{1,8}$/.test(p)) return null;
    if (/^[A-Za-z]{2}$/.test(p)) out.push(p.toUpperCase());
    else if (/^[A-Za-z]{4}$/.test(p)) out.push(p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
    else out.push(p.toLowerCase());
  }
  return out.join('-');
}

export function baseLanguage(tag: string): string {
  return (tag.split('-')[0] ?? tag).toLowerCase();
}

/** Supported entry matching `tag` exactly, else one with the same language */
export function matchSupported(tag: string, supported: string[]): string | null {
  const exact = supported.find((s) => s.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const b = baseLanguage(tag);
  return supported.find((s) => baseLanguage(s) === b) ?? null;
}

/** Human name of a language in that same language, e.g. "italiano" */
export function languageName(tag: string, displayIn?: string): string {
  try {
    const names = new Intl.DisplayNames([displayIn ?? tag], { type: 'language' });
    const name = names.of(tag);
    if (name) return name.charAt(0).toLocaleUpperCase(displayIn ?? tag) + name.slice(1);
  } catch {
    /* unknown tag */
  }
  return tag;
}

type Labels = {
  newQuote: string;
  loading: string;
  couldNotLoad: string;
  retry: string;
  noQuotesInLanguage: string;
  showOriginal: (language: string) => string;
  showTranslation: (language: string) => string;
  language: string;
};

const LABELS: Record<string, Labels> = {
  en: {
    newQuote: 'New Quote',
    loading: 'Loading...',
    couldNotLoad: 'Could not load quote',
    retry: 'Retry',
    noQuotesInLanguage: 'No quotes available in this language yet',
    showOriginal: (l) => `Show original (${l})`,
    showTranslation: (l) => `Show translation (${l})`,
    language: 'Language',
  },
  it: {
    newQuote: 'Nuova citazione',
    loading: 'Caricamento...',
    couldNotLoad: 'Impossibile caricare la citazione',
    retry: 'Riprova',
    noQuotesInLanguage: 'Ancora nessuna citazione in questa lingua',
    showOriginal: (l) => `Mostra l'originale (${l})`,
    showTranslation: (l) => `Mostra la traduzione (${l})`,
    language: 'Lingua',
  },
  fr: {
    newQuote: 'Nouvelle citation',
    loading: 'Chargement...',
    couldNotLoad: 'Impossible de charger la citation',
    retry: 'Réessayer',
    noQuotesInLanguage: 'Pas encore de citations dans cette langue',
    showOriginal: (l) => `Voir l'original (${l})`,
    showTranslation: (l) => `Voir la traduction (${l})`,
    language: 'Langue',
  },
};

/** UI labels for a locale (falls back to English for the interface only) */
export function labelsFor(locale: string): Labels {
  return LABELS[baseLanguage(locale)] ?? (LABELS.en as Labels);
}

export type ModeLabels = Pick<Labels, 'newQuote' | 'loading' | 'couldNotLoad' | 'retry'>;

const STORAGE_KEY = 'quote_locale';

export function savedLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function saveLocale(locale: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Initial page locale: URL prefix (/it-IT), then the saved choice, then the
 * browser languages, then the service default.
 */
export function pickLocale(info: LocalesInfo, urlLocale?: string | null): string {
  const candidates = [urlLocale, savedLocale(), ...(navigator.languages ?? [navigator.language])];
  for (const c of candidates) {
    if (!c) continue;
    const tag = canonicalLocale(c);
    if (tag && matchSupported(tag, info.supported)) return tag;
  }
  return info.default;
}
