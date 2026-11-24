import { Match, Show, Switch } from 'solid-js';
import { quoteParts } from '../../lib/quote-parts';
import type { ModeProps } from './ZenMode';
import '../../styles/simple.css';

export function SimpleMode(props: ModeProps) {
  const parts = () => quoteParts(props.quote ?? '');
  return (
    <div class="simple-container">
      <Switch>
        <Match when={props.loading && !props.quote}>
          <div class="simple-status">{props.labels.loading}</div>
        </Match>
        <Match when={props.error}>
          <div class="simple-error">
            <p>{props.labels.couldNotLoad}</p>
            <button class="simple-button" onClick={() => props.onNewQuote()}>
              {props.labels.retry}
            </button>
          </div>
        </Match>
        <Match when={props.quote}>
          <div class="simple-quote-wrapper">
            <div class="simple-quote" data-testid="quote-text">
              {parts().text}
            </div>
            <Show when={parts().author}>
              <div class="simple-author">— {parts().author}</div>
            </Show>
            <Show when={props.work}>
              <cite class="quote-work simple-work" data-testid="quote-work">
                {props.work}
              </cite>
            </Show>
          </div>
        </Match>
      </Switch>
      <Show when={(!props.loading || props.quote) && !props.error}>
        <div class="quote-actions simple-actions">
          <button
            class="simple-button"
            data-testid="new-quote-btn"
            onClick={() => props.onNewQuote()}
            disabled={props.loading}
          >
            {props.labels.newQuote}
          </button>
          {props.share?.()}
        </div>
      </Show>
    </div>
  );
}
