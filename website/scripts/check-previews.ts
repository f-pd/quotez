/**
 * Link preview check: for every quote in quotes/*.json and every supported
 * language, fetch /:locale/q/:id the way Telegram does (no JS) and check the
 * Open Graph tags and the image they point to.
 *
 *   bun run scripts/check-previews.ts http://localhost:3000
 *   bun run scripts/check-previews.ts https://q.v.fulgid.us
 *
 * Quote ids are computed here like the service does (Blake3 of the trimmed
 * text, first 10 hex digits), so no admin access is needed.
 */
import { blake3 } from '@noble/hashes/blake3.js';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const QUOTES_DIR = process.argv[3] ?? path.join(import.meta.dir, '..', '..', 'quotes');
const UA = 'TelegramBot (like TwitterBot)';
const CONCURRENCY = 6;

type RawQuote = { text: string; lang?: string; translations?: Record<string, string> };

function quoteId(text: string): string {
  return Buffer.from(blake3(new TextEncoder().encode(text.trim()))).toString('hex').slice(0, 10);
}

const base = (t: string) => t.split('-')[0]!.toLowerCase();

function metaContent(html: string, prop: string): string | null {
  const re = new RegExp(`<meta (?:property|name)="${prop.replace(/[:]/g, '\\:')}" content="([^"]*)"`);
  return re.exec(html)?.[1] ?? null;
}

const quotes: RawQuote[] = [];
for (const f of fs.readdirSync(QUOTES_DIR).filter((f) => f.endsWith('.json'))) {
  const data = JSON.parse(fs.readFileSync(path.join(QUOTES_DIR, f), 'utf8'));
  for (const q of Array.isArray(data) ? data : data.quotes ?? []) if (q?.text) quotes.push(q);
}

const locales: { supported: string[]; default: string } = await fetch(`${BASE}/locales?format=json`)
  .then((r) => r.json())
  .catch(() => ({ supported: ['en', 'it', 'fr'], default: 'en' }));

type Job = { id: string; locale: string; available: boolean };
const jobs: Job[] = [];
for (const q of quotes) {
  const langs = [q.lang ?? locales.default, ...Object.keys(q.translations ?? {})].map(base);
  for (const l of locales.supported) jobs.push({ id: quoteId(q.text), locale: l, available: langs.includes(base(l)) });
}

const failures: string[] = [];
let checked = 0;

async function check(job: Job): Promise<void> {
  const url = `${BASE}/${job.locale}/q/${job.id}`;
  const where = `${job.locale}/q/${job.id}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  } catch (err) {
    failures.push(`${where}: page fetch failed (${err})`);
    return;
  }
  const html = await res.text();
  if (res.status !== 200) return void failures.push(`${where}: page HTTP ${res.status}`);
  const title = metaContent(html, 'og:title');
  const image = metaContent(html, 'og:image');
  if (!title || !image) return void failures.push(`${where}: missing og:title or og:image`);
  if (job.available) {
    if (!image.endsWith(`/og/${job.locale}/${job.id}.png`)) failures.push(`${where}: og:image is ${image}, expected the quote card`);
  }
  // Images are absolute URLs on the public origin; fetch them on BASE
  const imgPath = new URL(image).pathname;
  try {
    const img = await fetch(`${BASE}${imgPath}`, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
    const body = new Uint8Array(await img.arrayBuffer());
    const png = body[0] === 0x89 && body[1] === 0x50;
    if (img.status !== 200 || !png) failures.push(`${where}: image ${imgPath} HTTP ${img.status} ${img.headers.get('content-type')}`);
  } catch (err) {
    failures.push(`${where}: image fetch failed (${err})`);
  }
  checked++;
}

const queue = [...jobs];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await check(job);
  }),
);

console.log(`${checked}/${jobs.length} previews ok (${quotes.length} quotes x ${locales.supported.length} languages) on ${BASE}`);
if (failures.length) {
  console.error(`${failures.length} failures:\n  ${failures.join('\n  ')}`);
  process.exit(1);
}
