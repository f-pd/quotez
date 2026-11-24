import { test, expect, openQuote, MODES } from './fixtures';
import { LOCALES, longestIn, shortestIn } from './catalog';

/**
 * On a phone the quote page fits the screen: the page never scrolls, header
 * and footer stay in view, nothing covers the quote.
 */
const PHONES = [
  { name: '360x640', width: 360, height: 640 },
  { name: '390x844', width: 390, height: 844 },
];

for (const phone of PHONES) {
  test.describe(phone.name, () => {
    test.use({ viewport: { width: phone.width, height: phone.height }, hasTouch: true, isMobile: true });

    for (const mode of MODES) {
      test.describe(mode, () => {
        test.use({ mode });

        for (const locale of LOCALES) {
          for (const [kind, pick] of [
            ['longest', longestIn],
            ['shortest', shortestIn],
          ] as const) {
            test(`${locale}, ${kind} quote: no page scroll, everything in view`, async ({ page }) => {
              const q = pick(locale);
              await openQuote(page, locale, q.id, mode);
              const m = await page.evaluate(() => {
                const de = document.documentElement;
                const box = (sel: string) => {
                  const el = document.querySelector(sel);
                  if (!el) return null;
                  const r = el.getBoundingClientRect();
                  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
                };
                return {
                  scrollH: Math.max(de.scrollHeight, document.body.scrollHeight),
                  scrollW: Math.max(de.scrollWidth, document.body.scrollWidth),
                  innerH: window.innerHeight,
                  innerW: window.innerWidth,
                  header: box('.qd-header'),
                  footer: box('.qd-footer'),
                  main: box('[data-testid="quote-main"]'),
                  newQuote: box('[data-testid="new-quote-btn"]'),
                  share: box('[data-testid="share-btn"]'),
                  about: box('[data-testid="about-link"]'),
                };
              });
              expect(m.scrollH).toBeLessThanOrEqual(m.innerH);
              expect(m.scrollW).toBeLessThanOrEqual(m.innerW);
              expect(m.header!.top).toBeGreaterThanOrEqual(0);
              expect(m.footer!.bottom).toBeLessThanOrEqual(m.innerH + 0.5);
              // Header, quote and footer are stacked, not on top of each other
              expect(m.main!.top).toBeGreaterThanOrEqual(m.header!.bottom - 0.5);
              expect(m.main!.bottom).toBeLessThanOrEqual(m.footer!.top + 0.5);
              for (const b of [m.newQuote!, m.share!, m.about!]) {
                expect(b.left).toBeGreaterThanOrEqual(0);
                expect(b.right).toBeLessThanOrEqual(m.innerW + 0.5);
              }
              await expect(page.getByTestId('quote-text')).toBeInViewport();
              // The share button is icon-only on narrow screens
              // (label kept for screen readers, 1px)
              if (phone.width <= 480) {
                const label = await page.locator('.share-label').boundingBox();
                expect(label!.width).toBeLessThanOrEqual(1);
              }
            });
          }
        }
      });
    }

    test('the share menu fits the screen', async ({ page }) => {
      await openQuote(page, 'en', shortestIn('en').id);
      await page.getByTestId('share-btn').tap();
      const box = (await page.getByTestId('share-menu').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(phone.width);
    });

    test('/about scrolls normally and has no horizontal scroll', async ({ page }) => {
      await page.goto('/about');
      await expect(page.getByTestId('about-stats')).toBeVisible();
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(w).toBeLessThanOrEqual(phone.width);
    });
  });
}
