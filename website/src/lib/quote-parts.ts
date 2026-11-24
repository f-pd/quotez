/**
 * "text - author" as the service sends it, split for display. The
 * attribution follows the last " - " (seed convention); " — " only when
 * there is none, since quotes may contain em dashes themselves.
 */
export function quoteParts(quote: string): { text: string; author: string } {
  for (const sep of [' - ', ' — ']) {
    if (quote.includes(sep)) {
      const parts = quote.split(sep);
      const author = parts.pop() || '';
      return { text: parts.join(sep), author };
    }
  }
  return { text: quote, author: '' };
}
