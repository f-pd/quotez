import { Show, createEffect, createMemo, createSignal, on, onCleanup, onMount, type Accessor, type JSX } from 'solid-js';

interface SmoothSwapProps<T> {
  /** Changing the key cross-fades from the old content to the new one */
  swapKey: string;
  /** What the content shows; frozen while the old content fades out */
  value: T;
  /** Fade duration in ms (the height follows a little slower) */
  duration?: number;
  children: (value: Accessor<T>) => JSX.Element;
}

/**
 * Cross-fades between contents and animates the height, so switching a quote
 * between translation and original never jumps. While the old content fades
 * out (CSS transition on .out) it stays on screen unchanged; then the new one
 * mounts and its CSS keyframes play while the box grows or shrinks to its
 * height. JS only measures the height: CSS cannot transition between two
 * arbitrary auto heights in every browser yet.
 */
export function SmoothSwap<T>(props: SmoothSwapProps<T>) {
  const duration = () => props.duration ?? 280;
  const [shownKey, setShownKey] = createSignal(props.swapKey);
  const pending = () => props.swapKey !== shownKey();

  // The value of the shown content: live, except while the old content fades
  // out, when it keeps the last value it had
  let last = props.value;
  const current = createMemo(() => {
    const value = props.value;
    if (pending()) return last;
    last = value;
    return value;
  });

  createEffect(
    on(
      () => props.swapKey,
      (key) => {
        if (key === shownKey()) return;
        const t = setTimeout(() => setShownKey(key), duration());
        onCleanup(() => clearTimeout(t));
      },
    ),
  );

  let inner!: HTMLDivElement;
  const [height, setHeight] = createSignal<number | undefined>(undefined);
  onMount(() => {
    const update = () => setHeight(inner.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(inner);
    onCleanup(() => ro.disconnect());
  });

  return (
    <div
      class="smooth-swap"
      style={{
        height: height() === undefined ? undefined : `${height()}px`,
        transition: `height ${Math.round(duration() * 1.8)}ms cubic-bezier(0.4, 0, 0.2, 1)`,
      }}
    >
      <div
        ref={inner}
        class={`smooth-swap-inner ${pending() ? 'out' : ''}`}
        style={{ 'transition-duration': `${duration()}ms` }}
      >
        {/* Keyed so the new content mounts fresh and its CSS enter
            animation (.quote-enter) plays from the start */}
        <Show when={shownKey()} keyed>
          {(_key) => <div class="smooth-swap-content">{props.children(current)}</div>}
        </Show>
      </div>
    </div>
  );
}
