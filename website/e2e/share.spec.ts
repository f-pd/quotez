import fs from 'node:fs';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect, openQuote, settled, MODES } from './fixtures';
import { FANON } from './catalog';

const SIZES: Record<string, [number, number]> = {
  '16:9': [1920, 1080],
  '4:3': [1600, 1200],
  '1:1': [1440, 1440],
  '3:4': [1200, 1600],
  '9:16': [1080, 1920],
};

/** Width and height from the IHDR chunk of a PNG */
function pngSize(buf: Buffer): [number, number] {
  expect(buf.subarray(1, 4).toString('latin1')).toBe('PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

for (const mode of MODES) {
  test.describe(mode, () => {
    test.use({ mode });

    test('menu offers the link and five image formats', async ({ page }) => {
      await openQuote(page, 'en', FANON.id, mode);
      const button = page.getByTestId('share-btn');
      await expect(button).toHaveText('Share');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await button.click();
      const menu = page.getByTestId('share-menu');
      await expect(menu).toBeVisible();
      await expect(menu).toHaveClass(new RegExp(`share-menu-${mode}`));
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByTestId('share-link')).toHaveText('Link');
      for (const f of Object.keys(SIZES)) {
        await expect(page.getByTestId(`share-image-${f.replace(':', 'x')}`)).toHaveText(f);
      }
      // Inside the screen, above the button
      const m = (await menu.boundingBox())!;
      const b = (await button.boundingBox())!;
      const vp = page.viewportSize()!;
      expect(m.x).toBeGreaterThanOrEqual(0);
      expect(m.x + m.width).toBeLessThanOrEqual(vp.width);
      expect(m.y + m.height).toBeLessThanOrEqual(b.y);
    });
  });
}

test('Escape and a click outside close the menu', async ({ page }) => {
  await openQuote(page, 'en', FANON.id);
  const button = page.getByTestId('share-btn');
  await button.click();
  await expect(page.getByTestId('share-menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('share-menu')).toHaveCount(0);
  await expect(button).toBeFocused();
  await button.click();
  await expect(page.getByTestId('share-menu')).toBeVisible();
  await page.mouse.click(5, 300);
  await expect(page.getByTestId('share-menu')).toHaveCount(0);
  // The button toggles it too
  await button.click();
  await button.click();
  await expect(page.getByTestId('share-menu')).toHaveCount(0);
});

test('a new quote closes the menu', async ({ page }) => {
  await openQuote(page, 'en', FANON.id);
  await page.getByTestId('share-btn').click();
  await expect(page.getByTestId('share-menu')).toBeVisible();
  // The menu covers nothing the keyboard cannot reach
  await page.getByTestId('new-quote-btn').focus();
  await page.keyboard.press('Enter');
  await settled(page, 'zen');
  await expect(page.getByTestId('share-menu')).toHaveCount(0);
});

/**
 * Clipboard: Chromium lets the test read it back; Firefox and WebKit have no
 * such permission, so every browser also records what the page wrote.
 */
async function watchClipboard(page: Page, context: BrowserContext, browserName: string) {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    const w = window as any;
    w.__clip = [];
    const cb = navigator.clipboard;
    if (!cb) return;
    const writeText = cb.writeText?.bind(cb);
    const write = cb.write?.bind(cb);
    if (writeText) cb.writeText = (t: string) => writeText(t).then(() => void w.__clip.push(t));
    if (write)
      cb.write = (items: ClipboardItem[]) =>
        write(items).then(() => void w.__clip.push(items.flatMap((i) => [...i.types])));
  });
}

test.describe('link', () => {
  test('is copied on desktop, with a confirmation', async ({ page, context, browserName, baseURL }) => {
    await watchClipboard(page, context, browserName);
    await openQuote(page, 'it', FANON.id);
    await page.getByTestId('share-btn').click();
    await page.getByTestId('share-link').click();
    await expect(page.getByTestId('share-btn')).toHaveText('Link copiato');
    await expect(page.getByTestId('share-btn')).toHaveClass(/is-confirmed/);
    const url = `${baseURL}/it/q/${FANON.id}`;
    expect(await page.evaluate(() => (window as any).__clip)).toEqual([url]);
    if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url);
    await expect(page.getByTestId('share-btn')).toHaveText('Condividi', { timeout: 5_000 });
  });
});

/** Picks an image format in the share menu and waits for the preview */
async function openPreview(page: Page, format: string) {
  await page.getByTestId('share-btn').click();
  await page.getByTestId(`share-image-${format.replace(':', 'x')}`).click();
  const preview = page.getByTestId('image-preview');
  await expect(preview).toBeVisible();
  return preview;
}

test.describe('link on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('opens the share sheet, for the link and for the image', async ({ page, baseURL }) => {
    await page.addInitScript(() => {
      (window as any).__shared = [];
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: unknown) => {
          (window as any).__shared.push(data);
        },
      });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    });
    await openQuote(page, 'en', FANON.id);
    await page.getByTestId('share-btn').tap();
    await page.getByTestId('share-link').tap();
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
    const data = await page.evaluate(() => (window as any).__shared[0]);
    expect(data.url).toBe(`${baseURL}/en/q/${FANON.id}`);
    expect(data.text).toContain('Each generation');
    // The image: preview first, then the share sheet from the Share tap
    await page.getByTestId('share-btn').tap();
    await page.getByTestId('share-image-9x16').tap();
    await expect(page.getByTestId('image-preview')).toBeVisible();
    await expect(page.getByTestId('preview-share')).toHaveClass(/primary/);
    expect(await page.evaluate(() => (window as any).__shared.length)).toBe(1);
    await page.getByTestId('preview-share').tap();
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(2);
    const file = await page.evaluate(() => {
      const f = (window as any).__shared[1].files[0] as File;
      return { name: f.name, type: f.type, size: f.size };
    });
    expect(file).toMatchObject({ name: `quotez-${FANON.id}-9x16.png`, type: 'image/png' });
    expect(file.size).toBeGreaterThan(10_000);
  });

  test('says so when sharing fails', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async () => {
          throw new DOMException('denied', 'NotAllowedError');
        },
      });
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    });
    await openQuote(page, 'it', FANON.id);
    await page.getByTestId('share-btn').tap();
    await page.getByTestId('share-image-1x1').tap();
    await page.getByTestId('preview-share').tap();
    await expect(page.getByTestId('preview-note')).toHaveText(/condivisione non ha funzionato/);
    await expect(page.getByTestId('preview-note')).toHaveClass(/err/);
  });
});

test.describe('image', () => {
  for (const mode of MODES) {
    test(`${mode}: every format is previewed, downloaded at its size and counted`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('display_mode', m), mode);
      await openQuote(page, 'en', FANON.id, mode);
      for (const [format, [w, h]] of Object.entries(SIZES)) {
        const slug = format.replace(':', 'x');
        const beacon = page.waitForRequest((r) => r.url().endsWith('/stats/image') && r.method() === 'POST');
        const preview = await openPreview(page, format);
        await expect(page.getByTestId('share-menu')).toHaveCount(0);
        // Counted when generated
        expect(JSON.parse((await beacon).postData() ?? '{}')).toEqual({ id: FANON.id, locale: 'en', format });
        await expect(preview).toHaveClass(new RegExp(`image-preview-${mode}`));
        await expect(preview.getByRole('dialog')).toHaveAttribute('aria-label', `Image ${format}`);
        const img = preview.locator('img');
        await expect.poll(() => img.evaluate((i: HTMLImageElement) => [i.naturalWidth, i.naturalHeight])).toEqual([w, h]);

        const download = page.waitForEvent('download');
        await page.getByTestId('preview-download').click();
        const d = await download;
        expect(d.suggestedFilename()).toBe(`quotez-${FANON.id}-${slug}.png`);
        expect(pngSize(fs.readFileSync((await d.path())!))).toEqual([w, h]);
        await expect(page.getByTestId('preview-note')).toHaveText(
          `Saved as quotez-${FANON.id}-${slug}.png in your Downloads folder`,
        );
        await page.keyboard.press('Escape');
        await expect(preview).toHaveCount(0);
        await expect(page.getByTestId('share-btn')).toBeFocused();
      }
    });
  }

  test('the preview closes with its button or a tap outside, and locks the page scroll', async ({ page }) => {
    await openQuote(page, 'fr', FANON.id);
    const preview = await openPreview(page, '4:3');
    await expect(page.locator('.image-preview-close')).toBeFocused();
    await expect(page.locator('.image-preview-close')).toHaveAttribute('aria-label', 'Fermer');
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
    await page.locator('.image-preview-close').click();
    await expect(preview).toHaveCount(0);
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('');
    await openPreview(page, '4:3');
    await page.getByTestId('image-preview').click({ position: { x: 3, y: 3 } });
    await expect(page.getByTestId('image-preview')).toHaveCount(0);
  });

  test.describe('copy', () => {
    test('puts the PNG on the clipboard', async ({ page, context, browserName }) => {
      await watchClipboard(page, context, browserName);
      await openQuote(page, 'it', FANON.id);
      await openPreview(page, '1:1');
      await page.getByTestId('preview-copy').click();
      await expect(page.getByTestId('preview-note')).toHaveText('Immagine copiata: incollala dove vuoi');
      await expect(page.getByTestId('preview-note')).toHaveClass(/ok/);
      expect(await page.evaluate(() => (window as any).__clip)).toEqual([['image/png']]);
      if (browserName === 'chromium') {
        const types = await page.evaluate(async () => (await navigator.clipboard.read()).flatMap((i) => [...i.types]));
        expect(types).toContain('image/png');
      }
    });
  });

  test('shows what is on screen: the original when it is shown', async ({ page }) => {
    await openQuote(page, 'en', FANON.id);
    const draw = async () => {
      await openPreview(page, '1:1');
      const download = page.waitForEvent('download');
      await page.getByTestId('preview-download').click();
      const buf = fs.readFileSync((await (await download).path())!);
      await page.keyboard.press('Escape');
      return buf;
    };
    const translated = await draw();
    await page.getByTestId('original-toggle').click();
    await settled(page, 'zen');
    const original = await draw();
    expect(original.equals(translated)).toBe(false);
  });
});
