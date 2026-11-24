import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests of the website (public pages and backoffice).
 *
 *   bun run test:e2e                 # starts e2e/stack.sh unless :3000 answers
 *   BASE_URL=http://localhost:3001 bunx playwright test
 *
 * The "visual" project compares screenshots: CI records them on the build of
 * main and checks the build of the branch against them, on the same machine
 * (see .github/workflows/website.yml).
 */
const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  expect: { timeout: 7_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL,
    trace: 'off',
    screenshot: 'only-on-failure',
  },
  snapshotPathTemplate: '{snapshotDir}/{testFilePath}-snapshots/{arg}{ext}',
  snapshotDir: process.env.SNAPSHOT_DIR ?? 'e2e/.snapshots',
  projects: [
    {
      name: 'e2e',
      testIgnore: /visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'visual',
      testMatch: /visual\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], reducedMotion: 'reduce' },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: 'bash e2e/stack.sh',
        url: 'http://localhost:3000/locales',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
