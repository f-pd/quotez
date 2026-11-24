import 'solid-js';

declare module 'solid-js' {
  namespace JSX {
    // Keeps icons out of the tab order in old Edge/IE
    interface SvgSVGAttributes<T> {
      focusable?: 'true' | 'false';
    }
  }
}
