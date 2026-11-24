/**
 * Screenshots compared before and after a change of the website: CI records
 * them on the build of main (--update-snapshots) and checks the build of the
 * branch against them on the same runner, so fonts and rendering match.
 * Motion is reduced and animations are stopped so every shot is stable.
 */
import { test, expect, openQuote, settled, type Mode } from './fixtures';
import type { Page, PageAssertionsToHaveScreenshotOptions } from '@playwright/test';
import { FANON } from './catalog';

const SCREENS = [
  { name: 'desktop', width: 1280, height: 800 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-360', width: 360, height: 640 },
];

const shot = (page: Page, name: string, opts: PageAssertionsToHaveScreenshotOptions = {}) =>
  expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
    maxDiffPixelRatio: 0.002,
    // Live numbers are masked; fixed widths keep them from moving the layout
    style: '.page-head .muted { width: 30em; } td.num { width: 7em; }',
    ...opts,
  });

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test.use({ viewport: { width: screen.width, height: screen.height } });

    for (const mode of ['zen', 'rich', 'simple'] as Mode[]) {
      test.describe(mode, () => {
        test.use({ mode });

        test(`${mode} quote`, async ({ page }) => {
          await openQuote(page, 'en', FANON.id, mode);
          await shot(page, `${screen.name}-${mode}-quote`);
        });

        test(`${mode} original`, async ({ page }) => {
          await openQuote(page, 'it', FANON.id, mode);
          await page.getByTestId('original-toggle').click();
          await settled(page, mode);
          await expect(page.getByTestId('original-toggle')).toHaveText(/traduzione/);
          await shot(page, `${screen.name}-${mode}-original`);
        });

        test(`${mode} share menu`, async ({ page }) => {
          await openQuote(page, 'fr', FANON.id, mode);
          await page.getByTestId('share-btn').click();
          await expect(page.getByTestId('share-menu')).toBeVisible();
          await shot(page, `${screen.name}-${mode}-share-menu`);
        });
      });
    }

    test('about', async ({ page }) => {
      await page.goto('/about');
      await expect(page.getByTestId('about-stats')).toBeVisible();
      await shot(page, `${screen.name}-about`, { fullPage: true });
    });

    test('admin login', async ({ page }) => {
      await page.goto('/admin/login');
      await expect(page.getByTestId('login-form')).toBeVisible();
      await shot(page, `${screen.name}-admin-login`);
    });
  });
}

test.describe('backoffice', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('quotez');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('status-card')).toBeVisible();
  });

  test('dashboard', async ({ page }) => {
    await expect(page.getByTestId('share-stats')).toBeVisible();
    await shot(page, 'admin-dashboard', {
      // Live numbers change from one run to the next
      mask: [
        page.locator('.page-head .muted'),
        page.locator('.kpi .value, .kpi .sub'),
        page.locator('.chart'),
        page.locator('table.data'),
        page.getByTestId('share-stats').locator('.top-list, .card-head-row .muted, .format-totals'),
        page.locator('textarea'),
      ],
    });
  });

  test('quotes', async ({ page }) => {
    await page.getByTestId('admin-nav').getByRole('link', { name: 'Quotes' }).click();
    await expect(page.getByTestId('quotes-list')).toBeVisible();
    await shot(page, 'admin-quotes', { mask: [page.locator('td.num'), page.locator('.page-head .muted')] });
  });

  test('quote form', async ({ page }) => {
    await page.getByTestId('admin-nav').getByRole('link', { name: 'Quotes' }).click();
    await page.getByTestId('add-quote-btn').click();
    await page.getByTestId('quote-textarea').fill('Una prova di modulo');
    await page.getByTestId('quote-textarea').blur();
    await shot(page, 'admin-quote-form', { mask: [page.locator('td.num'), page.locator('.page-head .muted')] });
  });

  test('config', async ({ page }) => {
    await page.getByTestId('admin-nav').getByRole('link', { name: 'Config' }).click();
    await expect(page.getByTestId('directories-list')).toBeVisible();
    await shot(page, 'admin-config', { mask: [page.getByTestId('directories-list')] });
  });
});
