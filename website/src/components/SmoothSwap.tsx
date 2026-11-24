import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface SmoothSwapProps {
  /** Changing the key cross-fades from the old content to the new one */
  swapKey: string;
  children: ReactNode;
  /** Fade duration in ms (the height follows a little slower) */
  duration?: number;
}

/**
 * Cross-fades between contents and animates the height, so switching a quote
 * between translation and original never jumps. While the old content fades
 * out (CSS transition on .out) it stays on screen unchanged; then the new one
 * mounts and its CSS keyframes play while the box grows or shrinks to its
 * height. JS only measures the height: CSS cannot transition between two
 * arbitrary auto heights in every browser yet.
 */
export function SmoothSwap({ swapKey, children, duration = 280 }: SmoothSwapProps) {
  const [shownKey, setShownKey] = useState(swapKey);
  const lastChildren = useRef<ReactNode>(children);
  const pending = swapKey !== shownKey;
  if (!pending) lastChildren.current = children;

  useEffect(() => {
    if (!pending) return;
    const t = setTimeout(() => setShownKey(swapKey), duration);
    return () => clearTimeout(t);
  }, [swapKey, pending, duration]);

  const innerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      className="smooth-swap"
      style={{ height, transition: `height ${Math.round(duration * 1.8)}ms cubic-bezier(0.4, 0, 0.2, 1)` }}
    >
      <div
        ref={innerRef}
        className={`smooth-swap-inner ${pending ? 'out' : ''}`}
        style={{ transitionDuration: `${duration}ms` }}
      >
        {/* Keyed so the new content mounts fresh and its CSS enter
            animation (.quote-enter) plays from the start */}
        <div key={shownKey} className="smooth-swap-content">
          {pending ? lastChildren.current : children}
        </div>
      </div>
    </div>
  );
}
