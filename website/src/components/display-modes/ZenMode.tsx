import { Match, Show, Switch, type JSX } from 'solid-js';
import type { ModeLabels } from '../../lib/i18n';
import { quoteParts } from '../../lib/quote-parts';
import { SmoothSwap } from '../SmoothSwap';
import { DitheredBackdrop } from '../DitheredBackdrop';
import '../../styles/zen.css';

export interface ModeProps {
  quote: string | null;
  loading: boolean;
  error: boolean;
  onNewQuote: () => void;
  labels: ModeLabels;
  /** Source work shown under the author */
  work?: string | null;
  /** Changes on every new quote */
  quoteId: number;
  /** True while the original language is shown instead of the translation */
  showingOriginal: boolean;
  /** Share button, shown next to "New quote" */
  share?: () => JSX.Element;
}

export function ZenMode(props: ModeProps) {
  return (
    <div class="zen-container">
      <DitheredBackdrop kind="zen" class="zen-bg" />
      <div class="zen-content">
        <Switch>
          <Match when={props.loading && !props.quote}>
            <div class="zen-status">{props.labels.loading}</div>
          </Match>
          <Match when={props.error}>
            <div class="zen-error">
              <p>{props.labels.couldNotLoad}</p>
              <button class="zen-button" onClick={() => props.onNewQuote()}>
                {props.labels.retry}
              </button>
            </div>
          </Match>
          <Match when={props.quote}>
            <SmoothSwap
              swapKey={`${props.quoteId}:${props.showingOriginal}`}
              value={{ ...quoteParts(props.quote ?? ''), work: props.work, loading: props.loading }}
            >
              {(v) => (
                <div class={`zen-quote-wrapper quote-enter ${v().loading ? 'is-loading' : ''}`}>
                  <div class="zen-quote" data-testid="quote-text">
                    {v().text}
                  </div>
                  <Show when={v().author}>
                    <div class="zen-author">— {v().author}</div>
                  </Show>
                  <Show when={v().work}>
                    <cite class="quote-work zen-work" data-testid="quote-work">
                      {v().work}
                    </cite>
                  </Show>
                </div>
              )}
            </SmoothSwap>
          </Match>
        </Switch>

        <div class="quote-actions zen-actions">
          <button
            class="zen-button"
            data-testid="new-quote-btn"
            onClick={() => props.onNewQuote()}
            disabled={props.loading}
          >
            {props.labels.newQuote}
          </button>
          {props.share?.()}
        </div>
      </div>
    </div>
  );
}
