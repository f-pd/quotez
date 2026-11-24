import { For } from 'solid-js';
import type { DisplayMode } from './QuoteDisplay';
import '../styles/mode-selector.css';

interface ModeSelectorProps {
  mode: DisplayMode;
  onModeChange: (mode: DisplayMode) => void;
}

const MODES: { mode: DisplayMode; label: string }[] = [
  { mode: 'zen', label: 'Zen' },
  { mode: 'rich', label: 'Rich' },
  { mode: 'simple', label: 'Simple' },
];

export function ModeSelector(props: ModeSelectorProps) {
  return (
    <div class="mode-selector" data-testid="mode-selector">
      <For each={MODES}>
        {(m) => (
          <button
            class={`mode-btn ${props.mode === m.mode ? 'active' : ''}`}
            data-testid={`mode-btn-${m.mode}`}
            onClick={() => props.onModeChange(m.mode)}
          >
            {m.label}
          </button>
        )}
      </For>
    </div>
  );
}
