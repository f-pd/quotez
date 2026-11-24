import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
export function ImagePreview({ file, format, labels, style, onClose }: ImagePreviewProps) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  const [note, setNote] = useState<Note>(null);
  const [busy, setBusy] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shareable = useMemo(() => canShareFile(file), [file]);
  const copyable = useMemo(() => canCopyImage(), []);

  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const onShare = async () => {
    setBusy(true);
    const r = await shareFile(file, 'Quotez');
    setBusy(false);
    if (r === 'failed') setNote({ text: labels.shareFailed, tone: 'err' });
    else setNote(null);
  };

  const onDownload = () => {
    downloadFile(file);
    setNote({ text: labels.savedAs.replace('{name}', file.name), tone: 'ok' });
  };

  const onCopy = async () => {
    setBusy(true);
    const ok = await copyImage(file);
    setBusy(false);
    setNote(ok ? { text: labels.imageCopied, tone: 'ok' } : { text: labels.copyFailed, tone: 'err' });
  };

  return createPortal(
    <div
      className={`image-preview-backdrop image-preview-${style}`}
      data-testid="image-preview"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="image-preview" role="dialog" aria-modal="true" aria-label={`${labels.shareImage} ${format}`}>
        <div className="image-preview-head">
          <span className="image-preview-title">
            {labels.shareImage} <span className="image-preview-format">{format}</span>
          </span>
          <button ref={closeRef} type="button" className="image-preview-close" aria-label={labels.close} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="image-preview-frame">
          <img src={url} alt="" />
        </div>
        <div className="image-preview-actions">
          {shareable && (
            <button type="button" className="image-preview-btn primary" data-testid="preview-share" disabled={busy} onClick={onShare}>
              {labels.share}
            </button>
          )}
          <button
            type="button"
            className={`image-preview-btn ${shareable ? '' : 'primary'}`}
            data-testid="preview-download"
            onClick={onDownload}
          >
            {labels.downloadImage}
          </button>
          {copyable && (
            <button type="button" className="image-preview-btn" data-testid="preview-copy" disabled={busy} onClick={onCopy}>
              {labels.copyImage}
            </button>
          )}
        </div>
        <div className={`image-preview-note ${note?.tone ?? ''}`} aria-live="polite" data-testid="preview-note">
          {note?.text ?? ' '}
        </div>
      </div>
    </div>,
    document.body,
  );
}
