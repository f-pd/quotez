import { test, expect, openQuote, settled, quoteText, MODES } from './fixtures';
import { FANON, body, catalog, textIn } from './catalog';

const fanonEn = textIn(FANON, 'en')!;
const fanonIt = textIn(FANON, 'it')!;

test.describe('display modes', () => {
  test('Zen is the default and shows a quote', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.zen-container')).toBeVisible();
    await expect(page.getByTestId('mode-btn-zen')).toHaveClass(/active/);
    await expect(page.getByTestId('quote-text')).not.toBeEmpty();
    await expect(page.getByTestId('new-quote-btn')).toBeEnabled();
  });

  for (const mode of MODES) {
    test(`${mode}: picked from the selector and kept after a reload`, async ({ page }) => {
      await page.goto('/en');
      await page.getByTestId(`mode-btn-${mode}`).click();
      await expect(page.locator(`.${mode}-container`)).toBeVisible();
      await expect(page.getByTestId(`mode-btn-${mode}`)).toHaveClass(/active/);
      for (const other of MODES.filter((m) => m !== mode)) {
        await expect(page.getByTestId(`mode-btn-${other}`)).not.toHaveClass(/active/);
        await expect(page.locator(`.${other}-container`)).toHaveCount(0);
      }
      expect(await page.evaluate(() => localStorage.getItem('display_mode'))).toBe(mode);
      await page.reload();
      await expect(page.locator(`.${mode}-container`)).toBeVisible();
      await expect(page.getByTestId(`mode-btn-${mode}`)).toHaveClass(/active/);
    });
  }

  for (const mode of MODES) {
    test.describe(mode, () => {
      test.use({ mode });

      test('shows text, author and source of the quote', async ({ page }) => {
        await openQuote(page, 'en', FANON.id, mode);
        expect(await quoteText(page, mode)).toBe(body(fanonEn));
        await expect(page.locator(`.${mode}-author`)).toHaveText('— Frantz Fanon');
        await expect(page.getByTestId('quote-work')).toContainText('Les Damnés de la terre');
      });

      test('"New quote" loads another quote from the service', async ({ page }) => {
        await openQuote(page, 'en', FANON.id, mode);
        const next = page.waitForResponse((r) => /\/en\/quote\?format=json$/.test(r.url()) && r.ok());
        await page.getByTestId('new-quote-btn').click();
        const res = await next;
        const json = await res.json();
        await settled(page, mode);
        const expected = json.text.includes(' - ') ? json.text.slice(0, json.text.lastIndexOf(' - ')) : json.text;
        await expect.poll(() => quoteText(page, mode)).toBe(expected);
      });
    });
  }

  test.describe('rich', () => {
    test.use({ mode: 'rich' });

    test('types the text, then shows author and source together', async ({ page }) => {
      await page.goto(`/en/q/${FANON.id}`);
      const meta = page.locator('.rich-meta');
      // Partway through, only part of the text is typed and the meta is hidden
      await expect(page.locator('.rich-quote-rest')).not.toBeEmpty();
      await expect(meta).not.toHaveClass(/shown/);
      await expect(meta).toHaveClass(/shown/, { timeout: 10_000 });
      await expect(page.locator('.rich-quote-rest')).toBeEmpty();
      await expect(page.locator('.rich-caret')).toHaveClass(/done/);
      await expect(page.getByTestId('quote-text')).toHaveAttribute('aria-label', body(fanonEn));
    });

    test('counts the quotes shown', async ({ page }) => {
      await openQuote(page, 'en', FANON.id, 'rich');
      await expect(page.getByTestId('quote-counter')).toHaveText('Quote #1');
      await page.getByTestId('new-quote-btn').click();
      await expect(page.getByTestId('quote-counter')).toHaveText('Quote #2');
    });

    test.describe('with reduced motion', () => {
      test.use({ reducedMotion: 'reduce' });
      test('shows the whole text at once', async ({ page }) => {
        await page.goto(`/en/q/${FANON.id}`);
        await expect(page.locator('.rich-meta')).toHaveClass(/shown/, { timeout: 1_500 });
        await expect(page.locator('.rich-quote-rest')).toBeEmpty();
      });
    });
  });
});

test.describe('page language', () => {
  for (const [path, lang, newQuote] of [
    ['/it', 'it', 'Nuova citazione'],
    ['/it-IT', 'it', 'Nuova citazione'],
    ['/fr', 'fr', 'Nouvelle citation'],
    ['/en', 'en', 'New Quote'],
  ] as const) {
    test(`${path} shows quotes and labels in that language`, async ({ page }) => {
      const quote = page.waitForResponse((r) => new RegExp(`/${lang}(-[A-Z]{2})?/quote\\?format=json$`).test(r.url()));
      await page.goto(path);
      const res = await quote;
      expect(res.ok()).toBe(true);
      expect((await res.json()).lang.split('-')[0]).toBe(lang);
      await expect(page.locator('html')).toHaveAttribute('lang', new RegExp(`^${lang}`));
      await expect(page.getByTestId('locale-selector').locator('select')).toHaveValue(lang);
      await expect(page.getByTestId('new-quote-btn')).toHaveText(newQuote);
    });
  }

  test('the selector names each language in itself and switches the page', async ({ page }) => {
    await page.goto('/en');
    const select = page.getByTestId('locale-selector').locator('select');
    await expect(select.locator('option')).toHaveText(['English', 'Italiano', 'Français']);
    const quote = page.waitForResponse((r) => /\/fr\/quote\?format=json$/.test(r.url()));
    await select.selectOption('fr');
    await quote;
    await expect(page).toHaveURL(/\/fr$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.getByTestId('new-quote-btn')).toHaveText('Nouvelle citation');
    // The choice is remembered for the plain address
    await page.goto('/');
    await expect(select).toHaveValue('fr');
  });

  test.describe('browser in Italian', () => {
    test.use({ locale: 'it-IT' });
    test('/ follows the browser language', async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('html')).toHaveAttribute('lang', /^it/);
      await expect(page.getByTestId('new-quote-btn')).toHaveText('Nuova citazione');
    });
  });

  test('a quote in a language is never replaced by another language', async ({ page }) => {
    for (let i = 0; i < 5; i++) {
      const res = page.waitForResponse((r) => /\/it\/quote\?format=json$/.test(r.url()));
      if (i === 0) await page.goto('/it');
      else await page.getByTestId('new-quote-btn').click();
      const q = await (await res).json();
      expect(q.lang.split('-')[0]).toBe('it');
      // (quotes added by the backoffice tests start with "E2E")
      expect(q.text.startsWith('E2E') || catalog.some((c) => textIn(c, 'it') === q.text)).toBe(true);
    }
  });
});

test.describe('original text', () => {
  for (const mode of MODES) {
    test.describe(mode, () => {
      test.use({ mode });

      test('toggles between translation and original', async ({ page }) => {
        await openQuote(page, 'en', FANON.id, mode);
        const toggle = page.getByTestId('original-toggle');
        await expect(toggle).toHaveText('Show original (French)');
        await expect(toggle).toHaveAttribute('lang', 'fr');
        await toggle.click();
        if (mode !== 'simple') {
          // Zen and Rich fade the old text out before the new one comes in
          await expect(page.locator('.smooth-swap-inner.out')).toHaveCount(1);
        }
        await settled(page, mode);
        await expect.poll(() => quoteText(page, mode)).toBe(body(FANON.text));
        await expect(toggle).toHaveText('Show translation (English)');
        await expect(toggle).toHaveAttribute('lang', 'en');
        await expect(page.getByTestId('quote-work')).toContainText('Les Damnés de la terre');
        await toggle.click();
        await settled(page, mode);
        await expect.poll(() => quoteText(page, mode)).toBe(body(fanonEn));
      });
    });
  }

  test('no toggle for a quote shown in its own language', async ({ page }) => {
    await openQuote(page, 'fr', FANON.id);
    expect(await quoteText(page, 'zen')).toBe(body(FANON.text));
    await expect(page.getByTestId('original-toggle')).toHaveCount(0);
  });

  test('a new quote goes back to the translation', async ({ page }) => {
    await openQuote(page, 'en', FANON.id);
    await page.getByTestId('original-toggle').click();
    await settled(page, 'zen');
    await page.getByTestId('new-quote-btn').click();
    await settled(page, 'zen');
    const toggle = page.getByTestId('original-toggle');
    if (await toggle.count()) await expect(toggle).toHaveText(/^Show original/);
  });
});

test.describe('shared links', () => {
  test('/:locale/q/:id opens that quote and cleans the address', async ({ page }) => {
    await page.goto(`/it/q/${FANON.id}`);
    await expect(page).toHaveURL(/\/it$/);
    await settled(page, 'zen');
    expect(await quoteText(page, 'zen')).toBe(body(fanonIt));
    // The address is replaced, not pushed: about:blank and this page only
    expect(await page.evaluate(() => history.length)).toBe(2);
    await page.goBack();
    await expect(page).toHaveURL('about:blank');
  });

  test('/q/:id without a language', async ({ page }) => {
    await page.goto(`/q/${FANON.id}`);
    await expect(page).toHaveURL(/\/$/);
    await settled(page, 'zen');
    expect(await quoteText(page, 'zen')).toBe(body(fanonEn));
  });

  test('a link to a missing quote shows a random one', async ({ page }) => {
    await page.goto('/en/q/0000000000');
    await expect(page).toHaveURL(/\/en$/);
    await settled(page, 'zen');
    await expect(page.getByTestId('quote-text')).not.toBeEmpty();
  });

  test('"New quote" after a shared link loads a random quote', async ({ page }) => {
    await openQuote(page, 'en', FANON.id);
    const next = page.waitForResponse((r) => /\/en\/quote\?format=json$/.test(r.url()));
    await page.getByTestId('new-quote-btn').click();
    await next;
  });

  test('crawlers get the preview tags of the quote', async ({ request }) => {
    const res = await request.get(`/en/q/${FANON.id}`, { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } });
    expect(res.ok()).toBe(true);
    const html = await res.text();
    expect(html).toContain(`/og/en/${FANON.id}.png`);
    expect(html).toContain('Frantz Fanon');
    const img = await request.get(`/og/en/${FANON.id}.png`);
    expect(img.headers()['content-type']).toBe('image/png');
  });
});

test.describe('about link', () => {
  test('from / goes to /about', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('about-link').click();
    await expect(page).toHaveURL(/\/about$/);
    await expect(page.getByTestId('about-page')).toBeVisible();
  });

  test('from /fr goes to /fr/about', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.getByTestId('about-link')).toHaveText('À propos');
    await page.getByTestId('about-link').click();
    await expect(page).toHaveURL(/\/fr\/about$/);
    await expect(page.locator('h1')).toBeVisible();
  });
});
