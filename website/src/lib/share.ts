/**
 * Shared quote links: /:locale/q/:id
 *
 * The server answers those URLs with the quote's own preview tags (for
 * crawlers). In the browser, `takeSharedLink` runs before the router starts:
 * it remembers the quote to show and rewrites the address to the plain page
 * (/it), so "New quote", a refresh or a bookmark behave as usual.
 */

export type SharedQuote = { locale: string | null; id: string };

const SHARED_PATH = /^(?:\/([A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*))?\/q\/([0-9A-Fa-f]{10})\/?$/;

let pending: SharedQuote | null = null;

/** Call once at startup, before the router reads the location */
export function takeSharedLink(): void {
  const m = SHARED_PATH.exec(window.location.pathname);
  if (!m) return;
  pending = { locale: m[1] ?? null, id: m[2]!.toLowerCase() };
  const clean = `${m[1] ? `/${m[1]}` : '/'}${window.location.search}${window.location.hash}`;
  window.history.replaceState(window.history.state, '', clean);
}

/** The quote a shared link asked for, until `clearSharedQuote` */
export function sharedQuote(): SharedQuote | null {
  return pending;
}

export function clearSharedQuote(): void {
  pending = null;
}

export function shareUrl(locale: string, id: string): string {
  return `${window.location.origin}/${locale}/q/${id}`;
}

/** Touch devices with a native share sheet use it; the rest copy the link */
function prefersShareSheet(): boolean {
  if (typeof navigator.share !== 'function') return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareLink(data: { url: string; title: string; text: string }): Promise<ShareResult> {
  if (prefersShareSheet()) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
      // Share sheet unavailable (e.g. permissions): copy instead
    }
  }
  return (await copyText(data.url)) ? 'copied' : 'failed';
}

/**
 * Anonymous counter for the backoffice: one quote image generated, in this
 * language and format. Only these three values are sent, nothing about the
 * visitor; a failed beacon is ignored.
 */
export function countImage(id: string, locale: string, format: string): void {
  const body = JSON.stringify({ id, locale, format });
  try {
    if (navigator.sendBeacon?.('/stats/image', new Blob([body], { type: 'text/plain' }))) return;
  } catch {
    // fall through
  }
  void fetch('/stats/image', { method: 'POST', body, keepalive: true, credentials: 'omit' }).catch(() => {});
}
