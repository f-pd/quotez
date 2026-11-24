import { test as base, expect, type Page } from '@playwright/test';

export type Mode = 'zen' | 'rich' | 'simple';
export const MODES: Mode[] = ['zen', 'rich', 'simple'];

/** Measurements as published on the perf-stats branch, for the About page */
export const STATS = {
  updated_at: '2026-11-24T10:00:00Z',
  commit: '5ad7afb0123456789',
  image: {
    local: { platform: 'linux/amd64', uncompressed_bytes: 1_800_000, binary_bytes: 1_234_567 },
    registry: {
      platforms: [
        { platform: 'linux/amd64', compressed_bytes: 812_345 },
        { platform: 'linux/arm64', compressed_bytes: 798_765 },
      ],
    },
  },
  load_test: {
    host: { cpu: 'AMD EPYC 7763', cores: 4 },
    criteria: { step_duration: '20s', p95_limit_ms: 50 },
    profiles: [
      {
        name: 'small',
        cpus: 0.25,
        memory: '32m',
        max_healthy_rate: 4000,
        suffering: { rate: 6000, kind: 'p95', value: 81 },
        levels: [{ target_rate: 4000, achieved_rate: 3998, ok_rate: 1, latency_ms: { p50: 1, p95: 9 }, memory_after: '3.1 MB' }],
      },
      {
        name: 'large',
        cpus: 1,
        memory: '128m',
        max_healthy_rate: 16000,
        suffering: null,
        levels: [{ target_rate: 16000, achieved_rate: 15990, ok_rate: 1, latency_ms: { p50: 1, p95: 6 }, memory_after: '3.4 MB' }],
      },
    ],
  },
  production: {
    target: 'q.v.fulgid.us:17',
    target_rate: 50,
    duration_s: 30,
    ok_rate: 0.999,
    latency_ms: { p50: 42, p95: 88 },
  },
};

export const test = base.extend<{ mode: Mode }>({
  mode: ['zen', { option: true }],
  page: async ({ page, mode }, use) => {
    // Display mode as saved by the page, and stable measurements
    await page.addInitScript((m) => {
      try {
        if (!sessionStorage.getItem('e2e-mode-set')) {
          localStorage.setItem('display_mode', m);
          sessionStorage.setItem('e2e-mode-set', '1');
        }
      } catch {}
    }, mode);
    await page.route('**/stats.json', (route) => route.fulfill({ json: STATS }));
    await use(page);
  },
});

export { expect };

/** Opens a quote through its shared link and waits until it is on screen */
export async function openQuote(page: Page, locale: string, id: string, mode: Mode = 'zen') {
  await page.goto(`/${locale}/q/${id}`);
  await settled(page, mode);
}

/** Waits for the quote to be fully shown (Rich types it out first) */
export async function settled(page: Page, mode: Mode) {
  await expect(page.getByTestId('quote-text')).toBeVisible();
  if (mode === 'rich') {
    await expect(page.locator('.rich-meta')).toHaveClass(/shown/, { timeout: 10_000 });
  }
  await expect(page.locator('.smooth-swap-inner.out')).toHaveCount(0);
}

/** Visible text of the quote (Rich keeps the full text in aria-label) */
export async function quoteText(page: Page, mode: Mode): Promise<string> {
  const el = page.getByTestId('quote-text');
  if (mode === 'rich') return (await el.getAttribute('aria-label')) ?? '';
  return (await el.innerText()).trim();
}
