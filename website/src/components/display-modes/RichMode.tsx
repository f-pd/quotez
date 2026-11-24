import { Match, Show, Switch, createEffect, createSignal, on, onCleanup } from 'solid-js';
import { quoteParts } from '../../lib/quote-parts';
import { SmoothSwap } from '../SmoothSwap';
import { DitheredBackdrop } from '../DitheredBackdrop';
import type { ModeProps } from './ZenMode';
import '../../styles/rich.css';

export function RichMode(props: ModeProps) {
  const [visible, setVisible] = createSignal(false);
  const [quoteCount, setQuoteCount] = createSignal(0);

  // The card fades in once; later quotes swap inside it (SmoothSwap)
  createEffect(
    on(
      () => [props.quote, props.error] as const,
      ([quote, error]) => {
        if (quote && !error) {
          setQuoteCount((n) => n + 1);
          const timer = setTimeout(() => setVisible(true), 50);
          onCleanup(() => clearTimeout(timer));
          return;
        }
        if (error) setVisible(false);
      },
    ),
  );

  // Typewriter effect that reveals characters one by one, so long quotes
  // wrap onto several lines instead of being clipped on a single line.
  // The count belongs to one text: a new text starts at 0 on its very first
  // render (no flash of the whole text), and loading the next quote leaves
  // the current one untouched while it fades out.
  const [typing, setTyping] = createSignal<{ text: string | null; n: number }>({ text: null, n: 0 });
  const typed = () => (typing().text === props.quote ? typing().n : 0);
  let lastQuoteId = props.quoteId;
  createEffect(
    on(
      () => [props.quote, props.error] as const,
      ([quote, error]) => {
        if (!quote || error) return;
        // Switching translation/original: wait for the old text to fade out
        const delay = lastQuoteId === props.quoteId ? 280 : 0;
        lastQuoteId = props.quoteId;
        const total = quote.length;
        const step = Math.max(10, Math.min(40, 2000 / Math.max(total, 1)));
        const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
        let n = 0;
        let timer: ReturnType<typeof setInterval> | undefined;
        const start = setTimeout(() => {
          if (reduced) {
            setTyping({ text: quote, n: total });
            return;
          }
          timer = setInterval(() => {
            n += 1;
            setTyping({ text: quote, n });
            if (n >= total) clearInterval(timer);
          }, step);
        }, delay);
        onCleanup(() => {
          clearTimeout(start);
          if (timer) clearInterval(timer);
        });
      },
    ),
  );

  return (
    <div class="rich-container">
      <DitheredBackdrop kind="rich" class="rich-bg" />
      <Switch>
        <Match when={props.loading && !props.quote}>
          <div class="rich-status">{props.labels.loading}</div>
        </Match>
        <Match when={props.error}>
          <div class="rich-error">
            <p>{props.labels.couldNotLoad}</p>
            <button class="rich-button" onClick={() => props.onNewQuote()}>
              {props.labels.retry}
            </button>
          </div>
        </Match>
        <Match when={props.quote}>
          <div class={`rich-card ${visible() ? 'visible' : ''}`}>
            <div class="rich-counter" data-testid="quote-counter">
              Quote #{props.quoteId || quoteCount()}
            </div>
            <SmoothSwap
              swapKey={`${props.quoteId}:${props.showingOriginal}`}
              value={{
                ...quoteParts(props.quote ?? ''),
                length: (props.quote ?? '').length,
                typed: typed(),
                work: props.work,
                loading: props.loading,
              }}
            >
              {(v) => (
                <div class={`rich-quote-wrapper ${v().loading ? 'is-loading' : ''}`}>
                  <div class="rich-quote" data-testid="quote-text" aria-label={v().text}>
                    <span aria-hidden="true">{v().text.slice(0, v().typed)}</span>
                    <span class={`rich-caret ${v().typed >= v().text.length ? 'done' : ''}`} aria-hidden="true" />
                    <span class="rich-quote-rest" aria-hidden="true">
                      {v().text.slice(v().typed)}
                    </span>
                  </div>
                  {/* Author and source appear together once the text is typed */}
                  <div class={`rich-meta ${v().length > 0 && v().typed >= v().length ? 'shown' : ''}`}>
                    <Show when={v().author}>
                      <div class="rich-author">— {v().author}</div>
                    </Show>
                    <Show when={v().work}>
                      <cite class="quote-work rich-work" data-testid="quote-work">
                        {v().work}
                      </cite>
                    </Show>
                  </div>
                </div>
              )}
            </SmoothSwap>
            <div class="quote-actions rich-actions">
              <button
                class="rich-button"
                data-testid="new-quote-btn"
                onClick={() => props.onNewQuote()}
                disabled={props.loading}
              >
                {props.labels.newQuote}
              </button>
              {props.share?.()}
            </div>
          </div>
        </Match>
      </Switch>
    </div>
  );
}
