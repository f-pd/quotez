import { test, expect, openQuote } from './fixtures';
import { FANON } from './catalog';

/**
 * Zen and Rich backgrounds: a dithered gradient drawn on a canvas, so the
 * dark gradients show no flat bands. The pixels must vary a little from one
 * to the next (grain, at most a couple of levels) while following a smooth
 * gradient across the screen.
 */
for (const mode of ['zen', 'rich'] as const) {
  test.describe(mode, () => {
    test.use({ mode });

    test('the background is a dithered canvas covering the screen', async ({ page }) => {
      await openQuote(page, 'en', FANON.id, mode);
      const canvas = page.locator(`canvas.${mode}-bg`);
      await expect(canvas).toHaveAttribute('aria-hidden', 'true');
      const info = await canvas.evaluate((c: HTMLCanvasElement) => {
        const ctx = c.getContext('2d')!;
        const row = (y: number) => Array.from(ctx.getImageData(0, y, Math.min(256, c.width), 1).data);
        const at = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data);
        return {
          width: c.width,
          height: c.height,
          clientWidth: c.clientWidth,
          clientHeight: c.clientHeight,
          dpr: window.devicePixelRatio,
          row: row(Math.floor(c.height / 2)),
          corner: at(0, 0),
          centre: at(Math.floor(c.width / 2), Math.floor(c.height / 2)),
          far: at(c.width - 1, c.height - 1),
        };
      });
      const vp = page.viewportSize()!;
      // As tall as the screen; Zen is four screens wide and drifts sideways
      expect(info.clientHeight).toBe(vp.height);
      expect(info.clientWidth).toBe(mode === 'zen' ? vp.width * 4 : vp.width);
      // Device pixels (at most 2x), capped at 12 Mpx (Zen at 2x is over it)
      let scale = Math.min(info.dpr, 2);
      const want = info.clientWidth * info.clientHeight * scale * scale;
      if (want > 12_000_000) scale *= Math.sqrt(12_000_000 / want);
      expect(info.width).toBe(Math.round(info.clientWidth * scale));
      expect(info.height).toBe(Math.round(info.clientHeight * scale));

      // Grain: neighbouring pixels differ, but by a level or two at most
      let changes = 0;
      let maxStep = 0;
      for (let i = 4; i < info.row.length; i += 4) {
        for (let c = 0; c < 3; c++) {
          const step = Math.abs(info.row[i + c]! - info.row[i - 4 + c]!);
          if (step) changes++;
          maxStep = Math.max(maxStep, step);
        }
        expect(info.row[i + 3]).toBe(255);
      }
      expect(changes).toBeGreaterThan(30);
      expect(maxStep).toBeLessThanOrEqual(3);

      // A real gradient: the colour changes across the canvas
      const dist = (a: number[], b: number[]) => Math.abs(a[0]! - b[0]!) + Math.abs(a[1]! - b[1]!) + Math.abs(a[2]! - b[2]!);
      expect(Math.max(dist(info.corner, info.centre), dist(info.corner, info.far))).toBeGreaterThan(6);
    });

    test('it is drawn again at the new size after a resize', async ({ page }) => {
      await openQuote(page, 'en', FANON.id, mode);
      const canvas = page.locator(`canvas.${mode}-bg`);
      const before = await canvas.evaluate((c: HTMLCanvasElement) => c.height);
      await page.setViewportSize({ width: 800, height: 500 });
      await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.height)).not.toBe(before);
      const h = await canvas.evaluate((c: HTMLCanvasElement) => ({ h: c.height, dpr: window.devicePixelRatio }));
      expect(h.h).toBe(Math.round(500 * Math.min(h.dpr, 2)));
    });
  });
}

test('Simple has no background canvas', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('display_mode', 'simple'));
  await openQuote(page, 'en', FANON.id, 'simple');
  await expect(page.locator('canvas')).toHaveCount(0);
});
