import { Show, createSignal, onCleanup, onMount } from 'solid-js';
import { Portal } from 'solid-js/web';
import type { ShareLabels } from '../lib/i18n';
import { canCopyImage, canShareFile, copyImage, downloadFile, shareFile } from '../lib/quote-image';

interface ImagePreviewProps {
  file: File;
  /** "16:9"... for the frame proportions */
  format: string;
  labels: ShareLabels;
  style: string;
  onClose: () => void;
}

type Note = { text: string; tone: 'ok' | 'err' } | null;

/**
 * The generated image with explicit actions: share (system sheet, from this
 * tap so the browser allows it), download (says the file name and where it
 * goes) and copy to the clipboard. Each button says what happened.
 */
export function ImagePreview(props: ImagePreviewProps) {
  // One preview per file: the parent mounts a new one for every image
  const file = props.file;
  const url = URL.createObjectURL(file);
  const [note, setNote] = createSignal<Note>(null);
  const [busy, setBusy] = createSignal(false);
  const shareable = canShareFile(file);
  const copyable = canCopyImage();
  let closeButton!: HTMLButtonElement;

  onMount(() => {
    closeButton.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') props.onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    onCleanup(() => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    });
  });
  onCleanup(() => URL.revokeObjectURL(url));

  const onShare = async () => {
    setBusy(true);
    const r = await shareFile(file, 'Quotez');
    setBusy(false);
    setNote(r === 'failed' ? { text: props.labels.shareFailed, tone: 'err' } : null);
  };

  const onDownload = () => {
    downloadFile(file);
    setNote({ text: props.labels.savedAs.replace('{name}', file.name), tone: 'ok' });
  };

  const onCopy = async () => {
    setBusy(true);
    const ok = await copyImage(file);
    setBusy(false);
    setNote(ok ? { text: props.labels.imageCopied, tone: 'ok' } : { text: props.labels.copyFailed, tone: 'err' });
  };

  return (
    <Portal>
      <div
        class={`image-preview-backdrop image-preview-${props.style}`}
        data-testid="image-preview"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) props.onClose();
        }}
      >
        <div class="image-preview" role="dialog" aria-modal="true" aria-label={`${props.labels.shareImage} ${props.format}`}>
          <div class="image-preview-head">
            <span class="image-preview-title">
              {props.labels.shareImage} <span class="image-preview-format">{props.format}</span>
            </span>
            <button
              ref={closeButton}
              type="button"
              class="image-preview-close"
              aria-label={props.labels.close}
              onClick={() => props.onClose()}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div class="image-preview-frame">
            <img src={url} alt="" />
          </div>
          <div class="image-preview-actions">
            <Show when={shareable}>
              <button
                type="button"
                class="image-preview-btn primary"
                data-testid="preview-share"
                disabled={busy()}
                onClick={onShare}
              >
                {props.labels.share}
              </button>
            </Show>
            <button
              type="button"
              class={`image-preview-btn ${shareable ? '' : 'primary'}`}
              data-testid="preview-download"
              onClick={onDownload}
            >
              {props.labels.downloadImage}
            </button>
            <Show when={copyable}>
              <button type="button" class="image-preview-btn" data-testid="preview-copy" disabled={busy()} onClick={onCopy}>
                {props.labels.copyImage}
              </button>
            </Show>
          </div>
          <div class={`image-preview-note ${note()?.tone ?? ''}`} aria-live="polite" data-testid="preview-note">
            {note()?.text ?? '\u00a0'}
          </div>
        </div>
      </div>
    </Portal>
  );
}
