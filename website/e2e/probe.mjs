// Temporary: open production in each browser and report what breaks
import { firefox, webkit, chromium } from 'playwright';
for (const [name, type] of [['firefox', firefox], ['webkit', webkit]]) {
  const browser = await type.launch();
  for (const path of ['/', '/it', '/en/about']) {
    const page = await browser.newPage({ locale: 'it-IT' });
    const logs = [];
    page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
    page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack}`));
    page.on('response', (r) => logs.push(`resp ${r.status()} ${r.url()} cc=${r.headers()['cache-control']}`));
    await page.goto('https://q.v.fulgid.us' + path);
    await page.waitForTimeout(4000);
    console.log(`==== ${name} ${path}: share ${await page.locator('[data-testid=share-btn]').count()}\n${logs.join('\n')}`);
    await page.close();
  }
  await browser.close();
}
