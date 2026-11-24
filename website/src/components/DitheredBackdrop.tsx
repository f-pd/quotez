import { useEffect, useRef } from 'react';

/**
 * Gradient backgrounds drawn pixel by pixel on a canvas, with dithering.
 *
 * The gradients of the Zen and Rich modes are dark and span only 10-30
 * colour levels across the whole screen, so the browser draws them as wide
 * flat bands. Noise laid over a finished gradient does not help: the bands
 * are already rounded off. Here each pixel's exact colour is computed and a
 * small fixed noise (+-1 level) is added before rounding, so the steps turn
 * into a fine, static grain and the eye sees a smooth gradient.
 *
 * The canvas is drawn once (and again on resize). The CSS animations of the
 * modes (hue rotation, Zen's slow drift) act on the canvas element, not on
 * its pixels, so the grain itself never moves relative to the gradient.
 */

type Kind = 'rich' | 'zen';

interface DitheredBackdropProps {
  kind: Kind;
  className: string;
}

type RGB = [number, number, number];

/**
 * 64x64 tile of interleaved gradient noise (Jimenez 2014), mapped to
 * [-1, 1): high frequency, no visible pattern, computed once.
 */
const NOISE_SIZE = 64;
let noiseTile: Float32Array | null = null;
function noise(): Float32Array {
  if (noiseTile) return noiseTile;
  noiseTile = new Float32Array(NOISE_SIZE * NOISE_SIZE);
  for (let y = 0; y < NOISE_SIZE; y++) {
    for (let x = 0; x < NOISE_SIZE; x++) {
      const f = 0.06711056 * x + 0.00583715 * y;
      const g = 52.9829189 * (f - Math.floor(f));
      noiseTile[y * NOISE_SIZE + x] = 2 * (g - Math.floor(g)) - 1;
    }
  }
  return noiseTile;
}

function parseHex(hex: string, fallback: RGB): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Same colours as the former CSS gradients.
const PAGE_BG: RGB = [0x0f, 0x0f, 0x0f];
const RICH_OPACITY = 0.15;
const ZEN_STOPS: [RGB, RGB, RGB] = [
  [0x1a, 0x0a, 0x2e],
  [0x0a, 0x1a, 0x2e],
  [0x0a, 0x2e, 0x1a],
];

// Upper bound on canvas pixels (the Zen canvas is four screens wide).
const MAX_PIXELS = 12_000_000;

function paint(canvas: HTMLCanvasElement, kind: Kind) {
  // The canvas's own CSS box (not affected by the drift transform). For Zen
  // it is four screens wide; cssW is one screen.
  const widthFactor = kind === 'zen' ? 4 : 1;
  const cssW = canvas.clientWidth / widthFactor;
  const cssH = canvas.clientHeight;
  if (cssW === 0 || cssH === 0) return;

  // Zen: the gradient image is 4x the screen in both directions and drifts
  // horizontally; only a band one screen tall (rows 1.5H..2.5H) is ever seen.
  let scale = Math.min(window.devicePixelRatio || 1, 2);
  const want = cssW * widthFactor * cssH * scale * scale;
  if (want > MAX_PIXELS) scale *= Math.sqrt(MAX_PIXELS / want);

  const w = Math.max(1, Math.round(cssW * widthFactor * scale));
  const h = Math.max(1, Math.round(cssH * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.createImageData(w, h);
  const d = img.data;

  if (kind === 'rich') {
    const accent = parseHex(
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent'),
      [0x7c, 0x6a, 0xf7],
    );
    // radial-gradient(circle, accent 0%, transparent 50%) on a 200% box,
    // shown at 0.15 opacity over the page background.
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
  } else {
    // linear-gradient(135deg, ...) on a 4W x 4H image; this canvas holds its
    // rows 1.5H..2.5H (background-position-y 50%).
    const gw = w;
    const gh = 4 * h;
    const len = Math.SQRT1_2 * (gw + gh);
    const yOff = 1.5 * h;
    // The colour depends only on x + y: one lookup table per diagonal.
    const [c0, c1, c2] = ZEN_STOPS;
    const diag = w + h;
    const lut = new Float32Array(diag * 3);
    for (let k = 0; k < diag; k++) {
      // pixel centre (x + 0.5, y + 0.5) with x + y = k
      const gxy = k + 1 - gw / 2 + yOff - gh / 2;
      let t = (Math.SQRT1_2 * gxy) / len + 0.5;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
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
  }
  ctx.putImageData(img, 0, 0);
}

export function DitheredBackdrop({ kind, className }: DitheredBackdropProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const sizeKey = () => {
      return `${canvas.clientWidth}x${canvas.clientHeight}@${window.devicePixelRatio}`;
    };
    paint(canvas, kind);
    let last = sizeKey();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      const key = sizeKey();
      if (key === last) return;
      last = key;
      clearTimeout(timer);
      timer = setTimeout(() => paint(canvas, kind), 150);
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [kind]);

  return <canvas ref={ref} className={className} aria-hidden="true" />;
}
