import fs from 'node:fs';
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

test.describe('link', () => {
  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test('is copied on desktop, with a confirmation', async ({ page, baseURL }) => {
    await openQuote(page, 'it', FANON.id);
    await page.getByTestId('share-btn').click();
    await page.getByTestId('share-link').click();
    await expect(page.getByTestId('share-btn')).toHaveText('Link copiato');
    await expect(page.getByTestId('share-btn')).toHaveClass(/is-confirmed/);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${baseURL}/it/q/${FANON.id}`);
    await expect(page.getByTestId('share-btn')).toHaveText('Condividi', { timeout: 5_000 });
  });
});

test.describe('link on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test('opens the share sheet', async ({ page, baseURL }) => {
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
    // The image goes to the share sheet as a PNG file
    await page.getByTestId('share-btn').tap();
    await page.getByTestId('share-image-9x16').tap();
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(2);
    const file = await page.evaluate(() => {
      const f = (window as any).__shared[1].files[0] as File;
      return { name: f.name, type: f.type, size: f.size };
    });
    expect(file).toMatchObject({ name: `quotez-${FANON.id}-9x16.png`, type: 'image/png' });
    expect(file.size).toBeGreaterThan(10_000);
  });
});

test.describe('image', () => {
  for (const mode of MODES) {
    test(`${mode}: every format is downloaded at its size and counted`, async ({ page }) => {
      await page.addInitScript((m) => localStorage.setItem('display_mode', m), mode);
      await openQuote(page, 'en', FANON.id, mode);
      for (const [format, [w, h]] of Object.entries(SIZES)) {
        const slug = format.replace(':', 'x');
        const beacon = page.waitForRequest((r) => r.url().endsWith('/stats/image') && r.method() === 'POST');
        const download = page.waitForEvent('download');
        await page.getByTestId('share-btn').click();
        await page.getByTestId(`share-image-${slug}`).click();
        const d = await download;
        expect(d.suggestedFilename()).toBe(`quotez-${FANON.id}-${slug}.png`);
        const buf = fs.readFileSync((await d.path())!);
        expect(pngSize(buf)).toEqual([w, h]);
        expect(JSON.parse((await beacon).postData() ?? '{}')).toEqual({ id: FANON.id, locale: 'en', format });
        await expect(page.getByTestId('share-btn')).toHaveText('Image saved');
        await expect(page.getByTestId('share-menu')).toHaveCount(0);
      }
    });
  }

  test('shows what is on screen: the original when it is shown', async ({ page }) => {
    await openQuote(page, 'en', FANON.id);
    const draw = async () => {
      const download = page.waitForEvent('download');
      await page.getByTestId('share-btn').click();
      await page.getByTestId('share-image-1x1').click();
      return fs.readFileSync((await (await download).path())!);
    };
    const translated = await draw();
    await page.getByTestId('original-toggle').click();
    await settled(page, 'zen');
    const original = await draw();
    expect(original.equals(translated)).toBe(false);
  });
});
