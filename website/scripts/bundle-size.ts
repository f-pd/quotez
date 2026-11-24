/**
 * Size of the website bundle (dist/assets), raw, gzip and brotli, optionally
 * compared with another build:
 *
 *   bun run scripts/bundle-size.ts dist                 # this build
 *   bun run scripts/bundle-size.ts dist ../base/dist    # compared with main
 *
 * With a base, the table goes to the GitHub job summary too, and the run
 * fails when the JavaScript (gzip) grows by more than BUNDLE_MAX_GROWTH
 * percent (default 5).
 */
import fs from 'node:fs';
import path from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';

type Size = { raw: number; gzip: number; brotli: number; files: number };
type Sizes = { js: Size; css: Size };

function measure(dist: string): Sizes {
  const dir = path.join(dist, 'assets');
  const out: Sizes = {
    js: { raw: 0, gzip: 0, brotli: 0, files: 0 },
    css: { raw: 0, gzip: 0, brotli: 0, files: 0 },
  };
  for (const f of fs.readdirSync(dir)) {
    const kind = f.endsWith('.js') ? 'js' : f.endsWith('.css') ? 'css' : null;
    if (!kind) continue;
    const buf = fs.readFileSync(path.join(dir, f));
    out[kind].raw += buf.length;
    out[kind].gzip += gzipSync(buf, { level: 9 }).length;
    out[kind].brotli += brotliCompressSync(buf).length;
    out[kind].files += 1;
  }
  return out;
}

const kb = (n: number) => `${(n / 1000).toFixed(1)} KB`;
const delta = (now: number, before: number) => {
  const d = now - before;
  const pct = before ? (d / before) * 100 : 0;
  return `${d > 0 ? '+' : ''}${kb(d)} (${pct > 0 ? '+' : ''}${pct.toFixed(1)}%)`;
};

const [headDir, baseDir] = process.argv.slice(2);
if (!headDir) {
  console.error('usage: bun run scripts/bundle-size.ts <dist> [base dist]');
  process.exit(2);
}
const head = measure(headDir);
const base = baseDir ? measure(baseDir) : null;

const lines: string[] = ['### Website bundle', ''];
if (base) {
  lines.push('| | main | this build | change |', '|---|---:|---:|---:|');
  for (const kind of ['js', 'css'] as const) {
    for (const m of ['raw', 'gzip', 'brotli'] as const) {
      lines.push(`| ${kind.toUpperCase()} ${m} | ${kb(base[kind][m])} | ${kb(head[kind][m])} | ${delta(head[kind][m], base[kind][m])} |`);
    }
  }
} else {
  lines.push('| | raw | gzip | brotli |', '|---|---:|---:|---:|');
  for (const kind of ['js', 'css'] as const) {
    lines.push(`| ${kind.toUpperCase()} | ${kb(head[kind].raw)} | ${kb(head[kind].gzip)} | ${kb(head[kind].brotli)} |`);
  }
}
const report = lines.join('\n');
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`);

if (base) {
  const limit = Number(process.env.BUNDLE_MAX_GROWTH ?? 5);
  const growth = ((head.js.gzip - base.js.gzip) / base.js.gzip) * 100;
  if (growth > limit) {
    console.error(`JavaScript (gzip) grew by ${growth.toFixed(1)}%, over the ${limit}% limit`);
    process.exit(1);
  }
}
