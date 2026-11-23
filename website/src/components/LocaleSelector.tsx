import { languageName } from '../lib/i18n';

interface LocaleSelectorProps {
  locales: string[];
  value: string;
  label: string;
  onChange: (locale: string) => void;
}

/** Language picker: each language is named in itself (English, Italiano, Français) */
export function LocaleSelector({ locales, value, label, onChange }: LocaleSelectorProps) {
  return (
    <label className="locale-selector" data-testid="locale-selector">
      <span className="visually-hidden">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {locales.map((l) => (
          <option key={l} value={l} lang={l}>
            {languageName(l)}
          </option>
        ))}
      </select>
    </label>
  );
}
