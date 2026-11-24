import { test as base, expect, type Page } from '@playwright/test';
import { FANON } from './catalog';

const test = base;

async function login(page: Page) {
  await page.goto('/admin/login');
  await page.locator('#username').fill('admin');
  await page.locator('#password').fill('quotez');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByTestId('status-card')).toBeVisible();
}

test.describe('login', () => {
  test('/admin without credentials goes to the login page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByTestId('login-form')).toBeVisible();
    await page.goto('/admin/quotes');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('wrong credentials are refused', async ({ page }) => {
    await page.goto('/admin/login');
    await page.locator('#username').fill('admin');
    await page.locator('#password').fill('wrong');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText('Invalid credentials')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('login, navigation and logout', async ({ page }) => {
    await login(page);
    // Logged in: the login page sends back to the dashboard
    await page.goto('/admin/login');
    await expect(page).toHaveURL(/\/admin$/);

    const nav = page.getByTestId('admin-nav');
    await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveClass(/active/);
    await expect(nav.locator('.pill.ok')).toHaveText('live');

    await nav.getByRole('link', { name: 'Quotes' }).click();
    await expect(page).toHaveURL(/\/admin\/quotes$/);
    await expect(nav.getByRole('link', { name: 'Quotes' })).toHaveClass(/active/);
    await expect(nav.getByRole('link', { name: 'Dashboard' })).not.toHaveClass(/active/);
    await expect(page.getByTestId('quotes-list')).toBeVisible();

    await nav.getByRole('link', { name: 'Logs' }).click();
    await expect(page).toHaveURL(/\/admin\/logs$/);
    await expect(page.locator('h1')).toHaveText('Logs');

    await nav.getByRole('link', { name: 'Config' }).click();
    await expect(page).toHaveURL(/\/admin\/config$/);
    await expect(page.getByTestId('mode-select')).toHaveValue('random');

    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
  });
});

test.describe('dashboard', () => {
  test('shows the service numbers and refreshes them', async ({ page }) => {
    await login(page);
    const kpis = page.getByTestId('status-card').locator('.kpi');
    await expect(kpis).toHaveCount(6);
    await expect(kpis.filter({ hasText: 'Quotes loaded' }).locator('.value')).toHaveText(/^\d[\d,]*$/);
    await expect(page.locator('.chart svg rect')).toHaveCount(60);
    const refresh = page.waitForRequest((r) => r.url().includes('/api/stats'), { timeout: 8_000 });
    await refresh;
  });

  test('debug mode on and off, shown in the sidebar', async ({ page }) => {
    await login(page);
    const sw = page.getByTestId('debug-btn');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await sw.click();
    await expect(page.locator('.toast')).toHaveText('Debug mode on');
    await expect(sw).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('admin-nav').locator('.pill.info')).toHaveText('debug');
    await expect(page.locator('.banner.info')).toBeVisible();
    await sw.click();
    await expect(page.locator('.toast')).toHaveText('Debug mode off');
    await expect(sw).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId('admin-nav').locator('.pill.info')).toHaveCount(0);
  });

  test('maintenance message can be edited and saved', async ({ page }) => {
    const msg = `Back in ${Date.now() % 1000} minutes.`;
    const loaded = page.waitForResponse((r) => r.url().endsWith('/api/maintenance') && r.request().method() === 'GET');
    await login(page);
    await loaded;
    const area = page.locator('textarea.textarea');
    await area.fill(msg);
    await page.getByRole('button', { name: 'Save message' }).click();
    await expect(page.locator('.toast')).toHaveText('Maintenance message saved');
    await expect(page.getByRole('button', { name: 'Save message' })).toHaveCount(0);
    await page.reload();
    await expect(page.locator('textarea.textarea')).toHaveValue(msg);
    await expect(page.getByTestId('maintenance-btn')).toHaveAttribute('aria-checked', 'false');
  });

  test('reload quotes', async ({ page }) => {
    await login(page);
    await page.getByTestId('reload-btn').click();
    await expect(page.locator('.toast')).toHaveText('Quotes reloaded from disk');
  });

  test('shared quotes: link visits and generated images', async ({ page, request }) => {
    // One human visit of a shared link and one generated image
    await request.get(`/it/q/${FANON.id}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36' },
    });
    // A crawler is not a visit
    await request.get(`/fr/q/${FANON.id}`, { headers: { 'User-Agent': 'TelegramBot (like TwitterBot)' } });
    const beacon = await request.post('/stats/image', { data: JSON.stringify({ id: FANON.id, locale: 'it', format: '4:3' }) });
    expect(beacon.status()).toBe(204);

    await login(page);
    const card = page.getByTestId('share-stats');
    await expect(card).toBeVisible();
    await page.getByTestId('share-lang').selectOption('it');
    const visit = card.locator('.top-list li').filter({ hasText: 'Ogni generazione' });
    await expect(visit).toHaveCount(1);
    await expect(visit.locator('a')).toHaveAttribute('href', `/it/q/${FANON.id}`);
    await page.getByTestId('share-lang').selectOption('it');
    await page.getByTestId('share-metric').selectOption('image');
    await expect(page.getByTestId('share-format')).toBeVisible();
    await expect(card.locator('.format-total')).toHaveCount(5);
    const image = card.locator('.top-list li').filter({ hasText: 'Ogni generazione' });
    await expect(image).toContainText('4:3');
    await card.locator('.format-total').filter({ hasText: '4:3' }).click();
    await expect(page.getByTestId('share-format')).toHaveValue('4:3');
    await expect(image).toHaveCount(1);
    await page.getByTestId('share-format').selectOption('16:9');
    await expect(card.locator('.top-list li').filter({ hasText: 'Ogni generazione' })).toHaveCount(0);
  });
});

test.describe('quotes', () => {
  test('list, search and filters', async ({ page }) => {
    await login(page);
    await page.goto('/admin/quotes');
    const rows = page.getByTestId('quotes-list').locator('tbody tr');
    await expect.poll(() => rows.count()).toBeGreaterThan(50);
    await page.getByPlaceholder('Search quotes…').fill('Chaque génération');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Les Damnés de la terre');
    await expect(rows.first().locator('.pill.info')).toHaveText('fr');
    await page.getByPlaceholder('Search quotes…').fill('');
    await page.locator('.toolbar select').nth(1).selectOption('no-work');
    await expect(page.locator('.card.empty, [data-testid="quotes-list"]')).toBeVisible();
    await page.locator('.toolbar select').nth(1).selectOption('all');
    // Sorting by id, both ways
    const first = await rows.first().locator('td').first().innerText();
    await page.getByRole('columnheader', { name: /^#/ }).click();
    await expect(rows.first().locator('td').first()).not.toHaveText(first);
  });

  test('add, edit and delete a quote', async ({ page }) => {
    const tag = `E2E ${Date.now()}`;
    page.on('dialog', (d) => d.accept());
    await login(page);
    await page.goto('/admin/quotes');

    await page.getByTestId('add-quote-btn').click();
    await page.getByTestId('quote-textarea').fill(`${tag} original text`);
    await expect(page.getByText(`${`${tag} original text`.length}/511 bytes`)).toBeVisible();
    await page.getByTestId('quote-lang').selectOption('it');
    await page.getByPlaceholder('Author').fill('Nessuno');
    await page.getByTestId('quote-work-it').fill('Prova, cap. 1');
    await page.getByTestId('quote-work').fill('Test, ch. 1');
    await page.getByTestId('translation-en').fill(`${tag} translated text`);
    await page.getByTestId('quote-submit').click();
    await expect(page.locator('.toast')).toHaveText('Quote created');

    const search = page.getByPlaceholder('Search quotes…');
    await search.fill(tag);
    const row = page.getByTestId('quotes-list').locator('tbody tr');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Nessuno');
    await expect(row).toContainText('Test, ch. 1');
    await expect(row.locator('.pill.info')).toHaveText('it');
    await expect(row.locator('.pill').filter({ hasText: /^en$/ })).toHaveCount(1);

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.getByTestId('quote-textarea')).toHaveValue(`${tag} original text`);
    await expect(page.getByTestId('translation-en')).toHaveValue(`${tag} translated text`);
    await expect(page.getByTestId('quote-work-it')).toHaveValue('Prova, cap. 1');
    await expect(page.getByTestId('quote-lang')).toHaveValue('it');
    await page.getByTestId('quote-textarea').fill(`${tag} edited text`);
    await page.getByTestId('quote-submit').click();
    await expect(page.locator('.toast')).toHaveText('Quote updated');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`${tag} edited text`);

    await row.getByRole('button', { name: 'Delete' }).click();
    await expect(page.locator('.toast')).toHaveText('Quote deleted');
    await expect(page.getByText('No quotes match your filters.')).toBeVisible();
  });

  test('a text over 511 bytes is marked web only', async ({ page }) => {
    await login(page);
    await page.goto('/admin/quotes');
    await page.getByTestId('add-quote-btn').click();
    await page.getByTestId('quote-textarea').fill('é'.repeat(300));
    await expect(page.getByText('600/511 bytes')).toBeVisible();
    await expect(page.locator('form .pill.warn')).toHaveText('web only');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByTestId('quote-textarea')).toHaveCount(0);
  });
});

test.describe('logs and config', () => {
  test('logs are tailed and can be filtered and paused', async ({ page }) => {
    await login(page);
    await page.goto('/admin/logs');
    const lines = page.locator('.logs .line');
    await expect(lines.first()).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Pause' }).click();
    await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
    await page.getByPlaceholder('Filter lines…').fill('zzzz-no-such-line');
    await expect(lines).toHaveCount(0);
    await expect(page.locator('.logs .empty')).toHaveText('Paused.');
    await page.getByRole('button', { name: 'Resume' }).click();
    await page.getByPlaceholder('Filter lines…').fill('');
    await page.getByRole('button', { name: 'Clear view' }).click();
    await page.locator('.toolbar select').selectOption('warn');
    await expect(page.locator('.toolbar select')).toHaveValue('warn');
  });

  test('config shows the directories and applies changes', async ({ page }) => {
    await login(page);
    await page.goto('/admin/config');
    await expect(page.getByTestId('directories-list').locator('li')).not.toHaveCount(0);
    await expect(page.getByTestId('interval-input')).toHaveValue('60');
    await page.getByTestId('apply-btn').click();
    await expect(page.getByText('Configuration updated successfully')).toBeVisible();
  });
});
