import { For } from 'solid-js';
import { languageName } from '../lib/i18n';

interface LocaleSelectorProps {
  locales: string[];
  value: string;
  label: string;
  onChange: (locale: string) => void;
}

/** Language picker: each language is named in itself (English, Italiano, Français) */
export function LocaleSelector(props: LocaleSelectorProps) {
  return (
    <label class="locale-selector" data-testid="locale-selector">
      <span class="visually-hidden">{props.label}</span>
      <select value={props.value} onChange={(e) => props.onChange(e.currentTarget.value)} aria-label={props.label}>
        <For each={props.locales}>
          {(l) => (
            <option value={l} lang={l} selected={l === props.value}>
              {languageName(l)}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}
