/**
 * The quote catalog as the service loads it (quotes/*.json), with the ids
 * of the shared links: Blake3 of the trimmed original text, first 10 hex
 * digits, as in src/servers/public_routes.zig.
 */
import { blake3 } from '@noble/hashes/blake3.js';
import fs from 'node:fs';
import path from 'node:path';

export type CatalogQuote = {
  id: string;
  text: string;
  lang: string;
  translations: Record<string, string>;
};

const QUOTES_DIR = path.join(import.meta.dirname, '..', '..', 'quotes');

export const LOCALES = ['en', 'it', 'fr'] as const;

const base = (t: string) => t.split('-')[0]!.toLowerCase();

function quoteId(text: string): string {
  return Buffer.from(blake3(new TextEncoder().encode(text.trim()))).toString('hex').slice(0, 10);
}

export const catalog: CatalogQuote[] = fs
  .readdirSync(QUOTES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort()
  .flatMap((f) => {
    const data = JSON.parse(fs.readFileSync(path.join(QUOTES_DIR, f), 'utf8'));
    const list: any[] = Array.isArray(data) ? data : (data.quotes ?? []);
    return list
      .filter((q) => q?.text)
      .map((q) => ({ id: quoteId(q.text), text: q.text, lang: q.lang ?? 'en', translations: q.translations ?? {} }));
  });

/** Text of a quote in a page language, or null when it is not available there */
export function textIn(q: CatalogQuote, locale: string): string | null {
  if (base(q.lang) === base(locale)) return q.text;
  const key = Object.keys(q.translations).find((k) => base(k) === base(locale));
  return key ? q.translations[key]! : null;
}

/** The quote with the longest text in that language */
export function longestIn(locale: string): CatalogQuote {
  let best: CatalogQuote | null = null;
  let len = -1;
  for (const q of catalog) {
    const t = textIn(q, locale);
    if (t && Array.from(t).length > len) {
      best = q;
      len = Array.from(t).length;
    }
  }
  return best!;
}

/** The quote with the shortest text in that language */
export function shortestIn(locale: string): CatalogQuote {
  let best: CatalogQuote | null = null;
  let len = Infinity;
  for (const q of catalog) {
    const t = textIn(q, locale);
    if (t && Array.from(t).length < len) {
      best = q;
      len = Array.from(t).length;
    }
  }
  return best!;
}

/** Frantz Fanon, Les Damnés de la terre: French original, English and Italian translations */
export const FANON = catalog.find((q) => q.text.startsWith('Chaque génération'))!;

/** Text without the trailing " - author" */
export function body(text: string): string {
  const i = text.lastIndexOf(' - ');
  return i > 0 ? text.slice(0, i) : text;
}
