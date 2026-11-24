/**
 * Open Graph images, rendered on the server (crawlers do not run JS).
 *
 * satori lays out a small element tree into SVG with the Inter font, resvg
 * turns the SVG into a 1200x630 PNG. The look follows the Zen style: dark
 * background, a violet / blue / green gradient, light text, uppercase author.
 * Results are cached in memory by the caller.
 */
import satori from 'satori';
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { clip } from './meta';

const require = createRequire(import.meta.url);

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
const CONTENT_WIDTH = OG_WIDTH - 160;

type FontSpec = { name: string; data: Buffer; weight: 300 | 400 | 600; style: 'normal' };

let ready: Promise<FontSpec[]> | null = null;

function loadFonts(): Promise<FontSpec[]> {
  if (ready) return ready;
  ready = (async () => {
    const wasm = fs.readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm'));
    await initWasm(wasm);
    const dir = path.join(path.dirname(require.resolve('@fontsource/inter/package.json')), 'files');
    const fonts: FontSpec[] = [];
    // latin first; latin-ext and greek(-ext) cover accents and Greek names
    // (distinct names: satori only falls back across different families)
    for (const [subset, name] of [['latin', 'Inter'], ['latin-ext', 'InterExt'], ['greek', 'InterGreek'], ['greek-ext', 'InterGreekExt']] as const) {
      for (const weight of [300, 400, 600] as const) {
        const file = path.join(dir, `inter-${subset}-${weight}-normal.woff`);
        if (fs.existsSync(file)) fonts.push({ name, data: fs.readFileSync(file), weight, style: 'normal' });
      }
    }
    return fonts;
  })();
  return ready;
}

/** Element tree node in the shape satori accepts (React-like, no JSX) */
type Node = { type: string; props: Record<string, unknown> & { children?: unknown } };

function el(type: string, style: Record<string, unknown>, children?: unknown): Node {
  return { type, props: { style, children } };
}

const COLORS = {
  bg: '#0f0f0f',
  text: '#e8e8e8',
  muted: '#9a9a9a',
  accent: '#7c6af7',
};

/** The opening quote mark of the site icon (public/favicon.svg): the
 *  Libre Baskerville Bold glyph (SIL Open Font License) */
const MARK = 'M37.2 14L37.2 14L40.1 18.2Q36.5 21 34.6 23.8Q32.6 26.7 32.6 29.2L32.6 29.2Q33 29 33.7 29Q34.3 28.9 34.8 28.9L34.8 28.9Q37.1 28.9 38.7 30.8Q40.2 32.6 40.2 35.3L40.2 35.3Q40.2 38.6 38 40.8Q35.8 43 32.5 43L32.5 43Q29.1 43 27.1 40.4Q25 37.9 25 33.6L25 33.6Q25 30.2 26.4 26.8Q27.8 23.5 30.5 20.3Q33.2 17 37.2 14ZM16.6 14L16.6 14L19.5 18.2Q15.9 21 14 23.8Q12 26.7 12 29.2L12 29.2Q12.4 29 13.1 29Q13.7 28.9 14.2 28.9L14.2 28.9Q16.5 28.9 18.1 30.8Q19.6 32.6 19.6 35.3L19.6 35.3Q19.6 38.6 17.4 40.8Q15.2 43 11.9 43L11.9 43Q8.5 43 6.5 40.4Q4.4 37.9 4.4 33.6L4.4 33.6Q4.4 30.2 5.8 26.8Q7.2 23.5 9.9 20.3Q12.6 17 16.6 14Z ';
const MARK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="4.40 14.00 35.8 29"><path fill="#8b7bff" d="${MARK}"/></svg>`;

function quoteMark(): Node {
  return {
    type: 'img',
    props: {
      src: `data:image/svg+xml;base64,${Buffer.from(MARK_SVG).toString('base64')}`,
      width: 70,
      height: 57,
      style: { width: 70, height: 57, marginBottom: 12 },
    },
  };
}

function frame(children: Node[]): Node {
  return el(
    'div',
    {
      // satori sizes boxes without their padding
      width: CONTENT_WIDTH,
      height: OG_HEIGHT - 64 - 48,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      paddingTop: 64,
      paddingRight: 80,
      paddingBottom: 48,
      paddingLeft: 80,
      color: COLORS.text,
      fontFamily: 'Inter, InterExt, InterGreek, InterGreekExt',
      backgroundColor: COLORS.bg,
      // Same stops as the Zen backdrop, a bit brighter so they survive
      // social previews' compression
      backgroundImage: 'linear-gradient(120deg, #241040 0%, #0f2240 50%, #0e3a22 100%)',
    },
    children,
  );
}

function footer(host: string): Node {
  return el(
    'div',
    {
      display: 'flex',
      flexShrink: 0,
      width: CONTENT_WIDTH,
      justifyContent: 'space-between',
      alignItems: 'center',
      fontSize: 24,
      color: COLORS.muted,
      letterSpacing: '0.08em',
    },
    [
      el('div', { display: 'flex', alignItems: 'center', gap: 14 }, [
        el('div', { width: 14, height: 14, borderRadius: 7, backgroundColor: COLORS.accent }),
        el('div', { fontWeight: 600, color: COLORS.text, textTransform: 'uppercase' }, 'Quotez'),
      ]),
      el('div', {}, host),
    ],
  );
}

/** Font size that keeps the quote inside the card */
function quoteSize(text: string): number {
  const n = [...text].length;
  if (n <= 60) return 64;
  if (n <= 110) return 54;
  if (n <= 170) return 46;
  if (n <= 240) return 40;
  if (n <= 330) return 34;
  return 29;
}

const MAX_CHARS = 420;

async function render(tree: Node): Promise<Uint8Array> {
  const fonts = await loadFonts();
  const svg = await satori(tree as never, { width: OG_WIDTH, height: OG_HEIGHT, fonts });
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: OG_WIDTH } }).render().asPng();
  return png;
}

export type OgQuote = { text: string; author: string | null; work: string | null };

/** Card for one quote: text, author, source */
export function renderQuoteImage(q: OgQuote, host: string): Promise<Uint8Array> {
  const text = clip(q.text, MAX_CHARS);
  const size = quoteSize(text);
  const meta: Node[] = [];
  if (q.author) {
    meta.push(
      el(
        'div',
        { fontSize: 26, color: COLORS.muted, letterSpacing: '0.08em', textTransform: 'uppercase' },
        `— ${q.author}`,
      ),
    );
  }
  if (q.work) {
    meta.push(el('div', { fontSize: 22, color: COLORS.muted, marginTop: 10, opacity: 0.85 }, clip(q.work, 110)));
  }
  return render(
    frame([
      el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, justifyContent: 'center', width: CONTENT_WIDTH }, [
        quoteMark(),
        el(
          'div',
          { display: 'flex', width: CONTENT_WIDTH, fontSize: size, fontWeight: 300, lineHeight: 1.28, letterSpacing: '-0.02em', marginTop: 8 },
          text,
        ),
        el('div', { display: 'flex', flexDirection: 'column', marginTop: 32 }, meta),
      ]),
      footer(host),
    ]),
  );
}

/** Card for the site itself (home, About) */
export function renderSiteImage(tagline: string, host: string): Promise<Uint8Array> {
  return render(
    frame([
      el('div', { display: 'flex', flexDirection: 'column', flexGrow: 1, flexShrink: 1, flexBasis: 0, justifyContent: 'center', width: CONTENT_WIDTH }, [
        quoteMark(),
        el('div', { fontSize: 96, fontWeight: 300, letterSpacing: '-0.03em', marginTop: 8 }, 'Quotez'),
        el('div', { fontSize: 36, fontWeight: 300, color: COLORS.muted, marginTop: 20, maxWidth: 900 }, tagline),
      ]),
      footer(host),
    ]),
  );
}
