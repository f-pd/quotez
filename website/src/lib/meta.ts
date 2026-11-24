/**
 * <head> tags for link previews and search engines, built on the server.
 *
 * Crawlers (Facebook, X, Telegram, WhatsApp, Slack, Google...) do not run
 * JavaScript, so the server writes these tags into index.html for each page:
 * the site pages (/, /:locale, /about) and the shared quote pages
 * (/:locale/q/:id), whose preview shows that quote and its own image.
 */

export type SiteText = { tagline: string; description: string; imageAlt: string };

const SITE: Record<string, SiteText> = {
  en: {
    tagline: 'A quote of the day, from the RFC 865 protocol to your browser.',
    description:
      'Quotez is a small Quote of the Day server (RFC 865): connect on port 17 and get a quote. The website shows the same quotes in three styles and several languages, with each original text one click away.',
    imageAlt: 'Quotez, a quote of the day',
  },
  it: {
    tagline: 'Una citazione al giorno, dal protocollo RFC 865 al tuo browser.',
    description:
      'Quotez è un piccolo server Quote of the Day (RFC 865): ti colleghi alla porta 17 e ricevi una citazione. Il sito mostra le stesse citazioni in tre stili e in più lingue, con il testo originale a un clic.',
    imageAlt: 'Quotez, una citazione al giorno',
  },
  fr: {
    tagline: 'Une citation du jour, du protocole RFC 865 à votre navigateur.',
    description:
      "Quotez est un petit serveur Quote of the Day (RFC 865) : connectez-vous au port 17 et recevez une citation. Le site affiche les mêmes citations en trois styles et en plusieurs langues, avec le texte original à un clic.",
    imageAlt: 'Quotez, une citation du jour',
  },
};

export function siteText(locale: string): SiteText {
  return SITE[base(locale)] ?? (SITE.en as SiteText);
}

function base(tag: string): string {
  return (tag.split('-')[0] ?? tag).toLowerCase();
}

/** "it-IT" -> "it_IT", "it" -> "it_IT" (og:locale wants language_TERRITORY) */
const DEFAULT_TERRITORY: Record<string, string> = { en: 'US', it: 'IT', fr: 'FR', de: 'DE', es: 'ES', pt: 'PT' };
export function ogLocale(tag: string): string {
  const [lang, region] = tag.split('-');
  const l = (lang ?? 'en').toLowerCase();
  const r = region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : DEFAULT_TERRITORY[l];
  return r ? `${l}_${r}` : l;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Split "Text - Author" (catalog convention: attribution after the last " - ") */
export function splitAuthor(text: string, author: string | null): { text: string; author: string | null } {
  if (author) {
    const suffix = [` - ${author}`, ` — ${author}`].find((s) => text.endsWith(s));
    return { text: suffix ? text.slice(0, -suffix.length) : text, author };
  }
  for (const sep of [' - ', ' — ']) {
    const i = text.lastIndexOf(sep);
    if (i > 0) {
      const a = text.slice(i + sep.length).trim();
      if (a && a.length <= 80) return { text: text.slice(0, i), author: a };
    }
  }
  return { text, author: null };
}

export function clip(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max).join('');
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, '')}…`;
}

export type PageMeta = {
  /** Page language (BCP 47) */
  locale: string;
  title: string;
  description: string;
  /** Absolute URLs */
  url: string;
  image: string;
  imageAlt: string;
  type: 'website' | 'article';
  /** Same page in other languages: [BCP 47 tag or "x-default", absolute URL] */
  alternates: Array<[string, string]>;
};

export function headTags(m: PageMeta): string {
  const e = escapeHtml;
  const altLocales = m.alternates
    .map(([l]) => l)
    .filter((l) => l !== 'x-default' && ogLocale(l) !== ogLocale(m.locale));
  const lines = [
    `<title>${e(m.title)}</title>`,
    `<meta name="description" content="${e(m.description)}" />`,
    `<link rel="canonical" href="${e(m.url)}" />`,
    ...m.alternates.map(([l, href]) => `<link rel="alternate" hreflang="${e(l)}" href="${e(href)}" />`),
    `<meta property="og:site_name" content="Quotez" />`,
    `<meta property="og:type" content="${m.type}" />`,
    `<meta property="og:title" content="${e(m.title)}" />`,
    `<meta property="og:description" content="${e(m.description)}" />`,
    `<meta property="og:url" content="${e(m.url)}" />`,
    `<meta property="og:locale" content="${e(ogLocale(m.locale))}" />`,
    ...[...new Set(altLocales.map(ogLocale))].map((l) => `<meta property="og:locale:alternate" content="${e(l)}" />`),
    `<meta property="og:image" content="${e(m.image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="${e(m.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${e(m.title)}" />`,
    `<meta name="twitter:description" content="${e(m.description)}" />`,
    `<meta name="twitter:image" content="${e(m.image)}" />`,
    `<meta name="twitter:image:alt" content="${e(m.imageAlt)}" />`,
  ];
  return lines.join('\n    ');
}

/** index.html with the page's tags in place of the static <title> */
export function injectHead(html: string, m: PageMeta): string {
  const withLang = html.replace(/<html lang="[^"]*">/, `<html lang="${escapeHtml(m.locale)}">`);
  return withLang.replace(/<title>[\s\S]*?<\/title>/, headTags(m));
}
