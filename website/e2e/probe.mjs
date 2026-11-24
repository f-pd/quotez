// Temporary: open production in each browser and report what breaks
import { firefox, webkit, chromium } from 'playwright';
for (const [name, type] of [['firefox', firefox], ['webkit', webkit], ['chromium', chromium]]) {
  const browser = await type.launch();
  const page = await browser.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}\n${e.stack}`));
  page.on('response', async (r) => {
    if (r.url().includes('/quote')) logs.push(`resp ${r.status()} ${r.url()} ${(await r.text().catch(() => '')).slice(0, 300)}`);
  });
  await page.goto('https://q.v.fulgid.us/en');
  await page.waitForTimeout(5000);
  const share = await page.locator('[data-testid=share-btn]').count();
  const html = (await page.content()).slice(0, 3000);
  console.log(`==== ${name}: share buttons ${share}\n${logs.join('\n')}\n${html}\n`);
  await page.screenshot({ path: `probe-${name}.png` });
  await browser.close();
}
