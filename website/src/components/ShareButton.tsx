import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ShareLabels } from '../lib/i18n';
import { countImage, shareLink, shareUrl } from '../lib/share';
import {
  IMAGE_FORMATS,
  canvasToFile,
  fontsReady,
  renderQuoteImage,
  shareOrDownload,
  type ImageFormat,
  type ImageQuote,
  type ImageStyle,
} from '../lib/quote-image';

interface ShareButtonProps {
  /** Page locale the link opens in */
  locale: string;
  quoteId: string;
  /** Text and author, for the share sheet */
  text: string;
  /** The quote as shown, for the image */
  image: Omit<ImageQuote, 'host'>;
  /** Current style: the image follows it */
  style: ImageStyle;
  labels: ShareLabels;
  /** Button class of the current style (zen-button, rich-button...) */
  className: string;
  disabled?: boolean;
}

/** "share-2" from Lucide (ISC license, lucide.dev): three linked nodes */
function ShareIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="18" cy="5" r="3" />
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" />
      <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
      <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
    </svg>
  );
}

/** "link" from Lucide (ISC license) */
function LinkIcon() {
  return (
    <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** A rectangle with the proportions of the format */
function FormatIcon({ format }: { format: ImageFormat }) {
  const [a, b] = format.split(':').map(Number) as [number, number];
  const s = 16 / Math.max(a, b);
  const w = a * s;
  const h = b * s;
  return (
    <svg className="share-format-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x={10 - w / 2} y={10 - h / 2} width={w} height={h} rx="1.5" />
    </svg>
  );
}

type Status = 'idle' | 'copied' | 'failed' | 'saved';

/**
 * Share menu: the link (share sheet on phones, copied elsewhere) or the
 * quote as an image in five formats, drawn in the browser.
 */
export function ShareButton({ locale, quoteId, text, image, style, labels, className, disabled }: ShareButtonProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('idle');
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // A new quote resets the confirmation and closes the menu
  useEffect(() => {
    setStatus('idle');
    setOpen(false);
  }, [quoteId]);

  const confirm = (s: Status) => {
    setStatus(s);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 2200);
  };

  // Place the menu above the button, inside the screen
  const place = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const r = btn.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - mw / 2), window.innerWidth - mw - 12);
    setPos({ left, bottom: window.innerHeight - r.top + 10 });
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    void fontsReady();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || buttonRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    };
  }, [open, place]);

  const onLink = async () => {
    setOpen(false);
    const result = await shareLink({ url: shareUrl(locale, quoteId), title: 'Quotez', text });
    if (result === 'copied' || result === 'failed') confirm(result);
  };

  // Drawn and encoded synchronously, so the share sheet still opens on Safari
  const onImage = (format: ImageFormat) => {
    setOpen(false);
    try {
      const canvas = renderQuoteImage({ ...image, host: window.location.host }, format, style);
      const file = canvasToFile(canvas, `quotez-${quoteId}-${format.replace(':', 'x')}.png`);
      countImage(quoteId, locale, format);
      void shareOrDownload(file, 'Quotez').then((r) => {
        if (r === 'downloaded') confirm('saved');
      });
    } catch (err) {
      console.error('Image share failed:', err);
      confirm('failed');
    }
  };

  const label =
    status === 'copied'
      ? labels.linkCopied
      : status === 'saved'
        ? labels.imageSaved
        : status === 'failed'
          ? labels.copyFailed
          : labels.share;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`${className} share-button ${status !== 'idle' ? 'is-confirmed' : ''}`}
        data-testid="share-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
      >
        <ShareIcon />
        <span className="share-label" aria-live="polite">{label}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            className={`share-menu share-menu-${style}`}
            role="menu"
            data-testid="share-menu"
            style={pos ? { left: pos.left, bottom: pos.bottom } : { visibility: 'hidden' }}
          >
            <button type="button" role="menuitem" className="share-menu-item" data-testid="share-link" onClick={onLink}>
              <LinkIcon />
              <span>{labels.shareLink}</span>
            </button>
            <div className="share-menu-title">{labels.shareImage}</div>
            <div className="share-formats">
              {IMAGE_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  role="menuitem"
                  className="share-format"
                  data-testid={`share-image-${f.replace(':', 'x')}`}
                  aria-label={`${labels.shareImage} ${f}`}
                  onClick={() => onImage(f)}
                >
                  <FormatIcon format={f} />
                  <span>{f}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
