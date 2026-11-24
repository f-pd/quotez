/**
 * The quote as an image, drawn in the browser with Canvas 2D (no WebGL, no
 * server): 16:9, 4:3, 1:1, 3:4 or 9:16, in the look of the current style
 * (Zen, Rich, Simple), with the same dithered backgrounds as the page.
 *
 * Everything here is synchronous on purpose: Safari only opens the share
 * sheet while the tap that asked for it is still "active", so the image is
 * drawn and encoded in the click handler itself. Fonts are awaited earlier,
 * when the share menu opens (`fontsReady`).
 */
import { NOISE_SIZE, PAGE_BG, RICH_OPACITY, ZEN_STOPS, noise, parseHex, type RGB } from '../components/DitheredBackdrop';

export type ImageFormat = '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
export type ImageStyle = 'zen' | 'rich' | 'simple';

export const IMAGE_FORMATS: ImageFormat[] = ['16:9', '4:3', '1:1', '3:4', '9:16'];

const SIZES: Record<ImageFormat, [number, number]> = {
  '16:9': [1920, 1080],
  '4:3': [1600, 1200],
  '1:1': [1440, 1440],
  '3:4': [1200, 1600],
  '9:16': [1080, 1920],
};

export type ImageQuote = {
  text: string;
  author: string | null;
  work: string | null;
  /** Language of the text (for line breaking and the lang of the canvas) */
  lang: string;
  /** Shown at the bottom, e.g. q.v.fulgid.us */
  host: string;
};

/** Wait for the page fonts, so the canvas does not fall back to defaults */
export async function fontsReady(): Promise<void> {
  try {
    await document.fonts?.ready;
  } catch {
    /* no Font Loading API */
  }
}

// ---------------------------------------------------------------------------
// Backgrounds (same maths as DitheredBackdrop, at image size)
// ---------------------------------------------------------------------------

function paintZen(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const [c0, c1, c2] = ZEN_STOPS;
  // 135deg linear gradient over the whole image: colour depends on x + y
  const diag = w + h;
  const lut = new Float32Array(diag * 3);
  for (let k = 0; k < diag; k++) {
    const t = (k + 1) / diag;
    const a = t < 0.5 ? c0 : c1;
    const b = t < 0.5 ? c1 : c2;
    const u = t < 0.5 ? t * 2 : t * 2 - 1;
    lut[k * 3] = a[0] + (b[0] - a[0]) * u + 0.5;
    lut[k * 3 + 1] = a[1] + (b[1] - a[1]) * u + 0.5;
    lut[k * 3 + 2] = a[2] + (b[2] - a[2]) * u + 0.5;
  }
  const nt = noise();
  let o = 0;
  for (let y = 0; y < h; y++) {
    const nRow = (y & (NOISE_SIZE - 1)) * NOISE_SIZE;
    for (let x = 0; x < w; x++) {
      const n = nt[nRow + (x & (NOISE_SIZE - 1))]!;
      const l = (x + y) * 3;
      d[o] = lut[l]! + n;
      d[o + 1] = lut[l + 1]! + n;
      d[o + 2] = lut[l + 2]! + n;
      d[o + 3] = 255;
      o += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function paintRich(ctx: CanvasRenderingContext2D, w: number, h: number, accent: RGB) {
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const cx = w / 2;
  const cy = h / 2;
  const radius = 0.5 * Math.hypot(w, h);
  const delta: RGB = [
    RICH_OPACITY * (accent[0] - PAGE_BG[0]),
    RICH_OPACITY * (accent[1] - PAGE_BG[1]),
    RICH_OPACITY * (accent[2] - PAGE_BG[2]),
  ];
  const nt = noise();
  let o = 0;
  for (let y = 0; y < h; y++) {
    const dy = y + 0.5 - cy;
    const dy2 = dy * dy;
    const nRow = (y & (NOISE_SIZE - 1)) * NOISE_SIZE;
    for (let x = 0; x < w; x++) {
      const dx = x + 0.5 - cx;
      const t = Math.sqrt(dx * dx + dy2) / radius;
      const a = t < 1 ? 1 - t : 0;
      const n = nt[nRow + (x & (NOISE_SIZE - 1))]!;
      d[o] = PAGE_BG[0] + a * delta[0] + n + 0.5;
      d[o + 1] = PAGE_BG[1] + a * delta[1] + n + 0.5;
      d[o + 2] = PAGE_BG[2] + a * delta[2] + n + 0.5;
      d[o + 3] = 255;
      o += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Text layout
// ---------------------------------------------------------------------------

/**
 * Break opportunities. Text with spaces breaks only at spaces (punctuation
 * stays with its word); scripts without spaces (Chinese...) use the word
 * segmenter, else single characters.
 */
function segments(text: string, lang: string): string[] {
  if (/\s/.test(text.trim())) return text.split(/(\s+)/).filter((t) => t.length > 0);
  const Seg = (Intl as unknown as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) {
    try {
      return Array.from(new Seg(lang, { granularity: 'word' }).segment(text), (s) => s.segment);
    } catch {
      /* unknown locale */
    }
  }
  return Array.from(text);
}

/** Greedy line breaking at `maxWidth` with the current ctx.font */
function wrap(ctx: CanvasRenderingContext2D, text: string, lang: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  const push = () => {
    if (line.trim()) lines.push(line.trim());
    line = '';
  };
  for (const seg of segments(text, lang)) {
    if (seg === '\n') {
      push();
      continue;
    }
    const next = line + seg;
    if (ctx.measureText(next.trim()).width <= maxWidth || !line.trim()) {
      line = next;
      // A single segment wider than the line: break it by characters
      if (ctx.measureText(line.trim()).width > maxWidth) {
        let part = '';
        for (const ch of Array.from(line)) {
          if (ctx.measureText(part + ch).width > maxWidth && part) {
            lines.push(part.trim());
            part = '';
          }
          part += ch;
        }
        line = part;
      }
    } else {
      push();
      line = seg.trimStart();
    }
  }
  push();
  return lines;
}

type Block = {
  lines: string[];
  font: string;
  size: number;
  lineHeight: number;
  color: string;
  letterSpacing?: number;
  gapBefore: number;
};

function blockHeight(b: Block): number {
  return b.lines.length * b.size * b.lineHeight;
}

type Theme = {
  align: 'center' | 'left';
  quoteFont: (size: number) => string;
  quoteLineHeight: number;
  quoteLetterSpacing: number;
  quoteColor: string;
  authorFont: (size: number) => string;
  authorColor: string;
  authorUpper: boolean;
  authorLetterSpacing: number;
  workFont: (size: number) => string;
  workColor: string;
};

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function themeFor(style: ImageStyle): Theme {
  const sans = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  const mono = cssVar('--font-mono', 'monospace');
  const text = cssVar('--color-text', '#e8e8e8');
  const muted = cssVar('--color-text-muted', '#888');
  const accent = cssVar('--color-accent', '#7c6af7');
  switch (style) {
    case 'rich':
      return {
        align: 'center',
        quoteFont: (s) => `600 ${s}px ${sans}`,
        quoteLineHeight: 1.4,
        quoteLetterSpacing: 0,
        quoteColor: text,
        authorFont: (s) => `italic 400 ${s}px ${sans}`,
        authorColor: accent,
        authorUpper: false,
        authorLetterSpacing: 0,
        workFont: (s) => `italic 400 ${s}px ${sans}`,
        workColor: muted,
      };
    case 'simple':
      return {
        align: 'left',
        quoteFont: (s) => `400 ${s}px ${mono}`,
        quoteLineHeight: 1.6,
        quoteLetterSpacing: 0,
        quoteColor: text,
        authorFont: (s) => `400 ${s}px ${mono}`,
        authorColor: muted,
        authorUpper: false,
        authorLetterSpacing: 0,
        workFont: (s) => `italic 400 ${s}px ${mono}`,
        workColor: muted,
      };
    default:
      return {
        align: 'center',
        quoteFont: (s) => `300 ${s}px ${sans}`,
        quoteLineHeight: 1.3,
        quoteLetterSpacing: -0.02,
        quoteColor: text,
        authorFont: (s) => `400 ${s}px ${sans}`,
        authorColor: muted,
        authorUpper: true,
        authorLetterSpacing: 0.05,
        workFont: (s) => `italic 400 ${s}px ${sans}`,
        workColor: muted,
      };
  }
}

function setSpacing(ctx: CanvasRenderingContext2D, em: number, size: number) {
  // letterSpacing is recent (Chrome 99, Safari 17); older browsers skip it
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${(em * size).toFixed(2)}px`;
}

/**
 * Largest quote size whose lines, author and source fit the box: the text
 * is never cut, only made smaller.
 */
function layout(
  ctx: CanvasRenderingContext2D,
  q: ImageQuote,
  theme: Theme,
  boxW: number,
  boxH: number,
  unit: number,
): Block[] {
  const authorText = q.author ? (theme.authorUpper ? `— ${q.author}`.toLocaleUpperCase(q.lang) : `— ${q.author}`) : null;

  // Author and source scale with the quote, within readable bounds
  const meta = (quoteSize: number): Block[] => {
    const authorSize = Math.round(Math.min(Math.max(quoteSize * 0.5, 24 * unit), 44 * unit));
    const workSize = Math.round(Math.min(Math.max(quoteSize * 0.38, 20 * unit), 34 * unit));
    const out: Block[] = [];
    if (authorText) {
      ctx.font = theme.authorFont(authorSize);
      setSpacing(ctx, theme.authorLetterSpacing, authorSize);
      out.push({
        lines: wrap(ctx, authorText, q.lang, boxW),
        font: theme.authorFont(authorSize),
        size: authorSize,
        lineHeight: 1.35,
        color: theme.authorColor,
        letterSpacing: theme.authorLetterSpacing,
        gapBefore: Math.round(quoteSize * 0.7),
      });
    }
    if (q.work) {
      ctx.font = theme.workFont(workSize);
      setSpacing(ctx, 0, workSize);
      out.push({
        lines: wrap(ctx, q.work, q.lang, boxW),
        font: theme.workFont(workSize),
        size: workSize,
        lineHeight: 1.4,
        color: theme.workColor,
        gapBefore: Math.round(authorText ? workSize * 0.5 : quoteSize * 0.7),
      });
    }
    return out;
  };

  const height = (blocks: Block[]) => blocks.reduce((sum, b) => sum + b.gapBefore + blockHeight(b), 0);

  const quoteBlock = (size: number): Block => {
    ctx.font = theme.quoteFont(size);
    setSpacing(ctx, theme.quoteLetterSpacing, size);
    return {
      lines: wrap(ctx, q.text, q.lang, boxW),
      font: theme.quoteFont(size),
      size,
      lineHeight: theme.quoteLineHeight,
      color: theme.quoteColor,
      letterSpacing: theme.quoteLetterSpacing,
      gapBefore: 0,
    };
  };

  // Binary search on the font size (px), between a readable floor and a cap
  let lo = Math.max(12, Math.round(18 * unit));
  let hi = Math.round(110 * unit);
  let best = [quoteBlock(lo), ...meta(lo)];
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const blocks = [quoteBlock(mid), ...meta(mid)];
    if (height(blocks) <= boxH) {
      best = blocks;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return best;
}

function drawBlocks(
  ctx: CanvasRenderingContext2D,
  blocks: Block[],
  align: 'center' | 'left',
  x: number,
  y: number,
  w: number,
) {
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  const ax = align === 'center' ? x + w / 2 : x;
  let cy = y;
  for (const b of blocks) {
    cy += b.gapBefore;
    ctx.font = b.font;
    ctx.fillStyle = b.color;
    setSpacing(ctx, b.letterSpacing ?? 0, b.size);
    const lh = b.size * b.lineHeight;
    for (const line of b.lines) {
      // Baseline placed like CSS line boxes: half-leading above, ~0.8em ascent
      ctx.fillText(line, ax, cy + (lh - b.size) / 2 + b.size * 0.82);
      cy += lh;
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draw the image for `q` in `format` and `style` */
export function renderQuoteImage(q: ImageQuote, format: ImageFormat, style: ImageStyle): HTMLCanvasElement {
  const [W, H] = SIZES[format];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D unavailable');

  // Same visual scale for every format (equal areas)
  const unit = Math.sqrt(W * H) / 1340;
  const theme = themeFor(style);
  const accent = parseHex(cssVar('--color-accent', '#7c6af7'), [0x7c, 0x6a, 0xf7]);

  if (style === 'zen') paintZen(ctx, W, H);
  else if (style === 'rich') paintRich(ctx, W, H, accent);
  else {
    ctx.fillStyle = cssVar('--color-bg', '#0f0f0f');
    ctx.fillRect(0, 0, W, H);
  }

  // Footer: site name and address
  const pad = Math.round(Math.min(W, H) * 0.08);
  const footSize = Math.round(24 * unit);
  const footY = H - pad;
  const sans = getComputedStyle(document.body).fontFamily || 'sans-serif';
  const footFont = style === 'simple' ? cssVar('--font-mono', 'monospace') : sans;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = `rgb(${accent.join(',')})`;
  ctx.beginPath();
  ctx.arc(pad + footSize * 0.3, footY - footSize * 0.36, footSize * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `600 ${footSize}px ${footFont}`;
  setSpacing(ctx, 0.08, footSize);
  ctx.fillStyle = cssVar('--color-text', '#e8e8e8');
  ctx.textAlign = 'left';
  ctx.fillText('QUOTEZ', pad + footSize, footY);
  ctx.font = `400 ${footSize}px ${footFont}`;
  ctx.fillStyle = cssVar('--color-text-muted', '#888');
  ctx.textAlign = 'right';
  ctx.fillText(q.host, W - pad, footY);

  // Content box above the footer
  const top = pad;
  const bottom = footY - footSize - Math.round(48 * unit);
  const boxX = pad;
  const boxW = W - 2 * pad;
  const boxY = top;
  const boxH = bottom - top;

  if (style === 'rich') {
    // The card of the Rich style, as tall as its content, centred
    const inner = Math.round(64 * unit);
    const blocks = layout(ctx, q, theme, boxW - 2 * inner, boxH - 2 * inner, unit);
    const total = blocks.reduce((sum, b) => sum + b.gapBefore + blockHeight(b), 0);
    const cardH = total + 2 * inner;
    const cardY = boxY + (boxH - cardH) / 2;
    const r = Math.round(12 * unit);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40 * unit;
    ctx.shadowOffsetY = 14 * unit;
    ctx.fillStyle = cssVar('--color-surface', '#1a1a1a');
    roundRect(ctx, boxX, cardY, boxW, cardH, r);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = cssVar('--color-border', '#2a2a2a');
    ctx.lineWidth = Math.max(1, 2 * unit);
    roundRect(ctx, boxX, cardY, boxW, cardH, r);
    ctx.stroke();
    drawBlocks(ctx, blocks, theme.align, boxX + inner, cardY + inner, boxW - 2 * inner);
    return canvas;
  }

  const blocks = layout(ctx, q, theme, boxW, boxH, unit);
  const total = blocks.reduce((sum, b) => sum + b.gapBefore + blockHeight(b), 0);
  drawBlocks(ctx, blocks, theme.align, boxX, boxY + Math.max(0, (boxH - total) / 2), boxW);
  return canvas;
}

/** PNG file of the canvas, built synchronously (see the note at the top) */
export function canvasToFile(canvas: HTMLCanvasElement, name: string): File {
  const url = canvas.toDataURL('image/png');
  const bin = atob(url.slice(url.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: 'image/png' });
}

/** Share sheet with the file where supported, else a download */
export async function shareOrDownload(file: File, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  if (coarse && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title });
      return 'shared';
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
