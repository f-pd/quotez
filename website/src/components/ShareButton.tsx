import { useEffect, useRef, useState } from 'react';
import type { ShareLabels } from '../lib/i18n';
import { shareLink, shareUrl } from '../lib/share';

interface ShareButtonProps {
  /** Page locale the link opens in */
  locale: string;
  quoteId: string;
  /** Text and author, for the share sheet */
  text: string;
  labels: ShareLabels;
  /** Button class of the current style (zen-button, rich-button...) */
  className: string;
  disabled?: boolean;
}

/** Share sheet on phones, copy link elsewhere; the label confirms the copy */
export function ShareButton({ locale, quoteId, text, labels, className, disabled }: ShareButtonProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // A new quote resets the confirmation
  useEffect(() => setStatus('idle'), [quoteId]);

  const onClick = async () => {
    const result = await shareLink({ url: shareUrl(locale, quoteId), title: 'Quotez', text });
    if (result === 'copied' || result === 'failed') {
      setStatus(result);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setStatus('idle'), 2200);
    }
  };

  const label = status === 'copied' ? labels.linkCopied : status === 'failed' ? labels.copyFailed : labels.share;

  return (
    <button
      type="button"
      className={`${className} share-button ${status !== 'idle' ? 'is-confirmed' : ''}`}
      data-testid="share-btn"
      onClick={onClick}
      disabled={disabled}
    >
      {/* "share-2" from Lucide (ISC license, lucide.dev): three linked nodes */}
      <svg className="share-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" x2="15.42" y1="13.51" y2="17.49" />
        <line x1="15.41" x2="8.59" y1="6.51" y2="10.49" />
      </svg>
      <span className="share-label" aria-live="polite">{label}</span>
    </button>
  );
}
