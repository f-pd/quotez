import { test, expect, STATS } from './fixtures';

test('/about explains the server and shows the measured numbers', async ({ page }) => {
  await page.goto('/about');
  await expect(page.locator('html')).toHaveAttribute('lang', /^en/);
  await expect(page).toHaveTitle(/· Quotez$/);
  await expect(page.locator('h1')).not.toBeEmpty();
  await expect(page.getByRole('link', { name: 'RFC 865' })).toHaveAttribute('href', /rfc865/);
  await expect(page.locator('.about-code')).toContainText('nc localhost 17');
  await expect(page.getByRole('link', { name: 'github.com/f-pd/quotez' })).toBeVisible();
  await expect(page.getByTestId('about-ai-disclaimer')).toBeVisible();

  const stats = page.getByTestId('about-stats');
  await expect(stats).toBeVisible();
  await expect(stats).toContainText(STATS.commit.slice(0, 7));
  await expect(stats).toContainText('812.3 KB');
  await expect(stats).toContainText('1.23 MB');
  const rows = stats.locator('.about-table tbody tr');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('0.25 vCPU · 32 MB');
  await expect(rows.nth(0)).toContainText('4,000');
  await expect(rows.nth(0)).toContainText('3.1 MB');
  await expect(rows.nth(1)).toContainText('16,000');
  await expect(stats).toContainText('99.9%');
  await expect(stats).toContainText('88 ms');
});

test('/it/about in Italian, with numbers formatted for Italy', async ({ page }) => {
  await page.goto('/it/about');
  await expect(page.locator('html')).toHaveAttribute('lang', 'it');
  const stats = page.getByTestId('about-stats');
  await expect(stats).toContainText('16.000');
  await expect(stats).toContainText('99,9%');
  await page.getByRole('link', { name: /←/ }).click();
  await expect(page).toHaveURL(/\/it$/);
  await expect(page.getByTestId('new-quote-btn')).toHaveText('Nuova citazione');
});

test('/fr/about in French', async ({ page }) => {
  await page.goto('/fr/about');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  await expect(page.getByTestId('about-stats')).toBeVisible();
});

test('without measurements it says so', async ({ page }) => {
  await page.route('**/stats.json', (route) => route.fulfill({ status: 503, json: { error: 'Stats unavailable' } }));
  await page.goto('/about');
  await expect(page.getByTestId('about-stats')).toContainText('Measurements are not available yet');
});

test('back link from /about goes to /', async ({ page }) => {
  await page.goto('/about');
  await page.getByRole('link', { name: /←/ }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId('quote-text')).toBeVisible();
});

test('the title is restored when leaving /about', async ({ page }) => {
  await page.goto('/en');
  const title = await page.title();
  await page.getByTestId('about-link').click();
  await expect(page).toHaveTitle(/· Quotez$/);
  await page.getByRole('link', { name: /←/ }).click();
  await expect(page).toHaveTitle(title);
});
