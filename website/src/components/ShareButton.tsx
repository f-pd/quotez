import { For, Show, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ShareLabels } from '../lib/i18n';
import { countImage, shareLink, shareUrl } from '../lib/share';
import { ImagePreview } from './ImagePreview';
import {
  IMAGE_FORMATS,
  canvasToPngFile,
  fontsReady,
  renderQuoteImage,
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
  class: string;
  disabled?: boolean;
}

/** "share-2" from Lucide (ISC license, lucide.dev): three linked nodes */
function ShareIcon() {
  return (
    <svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
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
    <svg class="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

/** A rectangle with the proportions of the format */
function FormatIcon(props: { format: ImageFormat }) {
  const [a, b] = props.format.split(':').map(Number) as [number, number];
  const s = 16 / Math.max(a, b);
  const w = a * s;
  const h = b * s;
  return (
    <svg class="share-format-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x={10 - w / 2} y={10 - h / 2} width={w} height={h} rx="1.5" />
    </svg>
  );
}

type Status = 'idle' | 'copied' | 'failed';

/**
 * Share menu: the link (share sheet on phones, copied elsewhere) or the
 * quote as an image in five formats, drawn in the browser.
 */
export function ShareButton(props: ShareButtonProps) {
  const [open, setOpen] = createSignal(false);
  const [status, setStatus] = createSignal<Status>('idle');
  const [preview, setPreview] = createSignal<{ file: File; format: ImageFormat } | null>(null);
  const [pos, setPos] = createSignal<{ left: number; bottom: number } | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let button!: HTMLButtonElement;
  let menu: HTMLDivElement | undefined;

  onCleanup(() => clearTimeout(timer));

  // A new quote resets the confirmation and closes the menu
  createEffect(
    on(
      () => props.quoteId,
      () => {
        setStatus('idle');
        setOpen(false);
      },
      { defer: true },
    ),
  );

  const confirm = (s: Status) => {
    setStatus(s);
    clearTimeout(timer);
    timer = setTimeout(() => setStatus('idle'), 2200);
  };

  // Place the menu above the button, inside the screen
  const place = () => {
    if (!menu) return;
    const r = button.getBoundingClientRect();
    const mw = menu.offsetWidth;
    const left = Math.min(Math.max(12, r.left + r.width / 2 - mw / 2), window.innerWidth - mw - 12);
    setPos({ left, bottom: window.innerHeight - r.top + 10 });
  };

  createEffect(() => {
    if (!open()) {
      setPos(null);
      return;
    }
    place();
    void fontsReady();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menu?.contains(t) || button.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.focus();
      }
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', place);
    onCleanup(() => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', place);
    });
  });

  const onLink = async () => {
    setOpen(false);
    const result = await shareLink({ url: shareUrl(props.locale, props.quoteId), title: 'Quotez', text: props.text });
    if (result === 'copied' || result === 'failed') confirm(result);
  };

  const closePreview = () => {
    setPreview(null);
    button.focus();
  };

  // Drawn in the browser, then shown with explicit Share / Download / Copy
  // buttons: the share sheet opens from that tap, never from a stale one
  const onImage = async (format: ImageFormat) => {
    setOpen(false);
    try {
      await fontsReady();
      const canvas = renderQuoteImage({ ...props.image, host: window.location.host }, format, props.style);
      const file = await canvasToPngFile(canvas, `quotez-${props.quoteId}-${format.replace(':', 'x')}.png`);
      countImage(props.quoteId, props.locale, format);
      setPreview({ file, format });
    } catch (err) {
      console.error('Image generation failed:', err);
      confirm('failed');
    }
  };

  const label = () => {
    switch (status()) {
      case 'copied':
        return props.labels.linkCopied;
      case 'failed':
        return props.labels.copyFailed;
      default:
        return props.labels.share;
    }
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        class={`${props.class} share-button ${status() !== 'idle' ? 'is-confirmed' : ''}`}
        data-testid="share-btn"
        aria-haspopup="menu"
        aria-expanded={open()}
        onClick={() => setOpen((o) => !o)}
        disabled={props.disabled}
      >
        <ShareIcon />
        <span class="share-label" aria-live="polite">
          {label()}
        </span>
      </button>
      <Show when={open()}>
        <Portal>
          <div
            ref={menu}
            class={`share-menu share-menu-${props.style}`}
            role="menu"
            data-testid="share-menu"
            style={
              pos()
                ? { left: `${pos()!.left}px`, bottom: `${pos()!.bottom}px` }
                : { visibility: 'hidden' }
            }
          >
            <button type="button" role="menuitem" class="share-menu-item" data-testid="share-link" onClick={onLink}>
              <LinkIcon />
              <span>{props.labels.shareLink}</span>
            </button>
            <div class="share-menu-title">{props.labels.shareImage}</div>
            <div class="share-formats">
              <For each={IMAGE_FORMATS}>
                {(f) => (
                  <button
                    type="button"
                    role="menuitem"
                    class="share-format"
                    data-testid={`share-image-${f.replace(':', 'x')}`}
                    aria-label={`${props.labels.shareImage} ${f}`}
                    onClick={() => void onImage(f)}
                  >
                    <FormatIcon format={f} />
                    <span>{f}</span>
                  </button>
                )}
              </For>
            </div>
          </div>
        </Portal>
      </Show>
      <Show when={preview()}>
        {(p) => (
          <ImagePreview
            file={p().file}
            format={p().format}
            labels={props.labels}
            style={props.style}
            onClose={closePreview}
          />
        )}
      </Show>
    </>
  );
}
