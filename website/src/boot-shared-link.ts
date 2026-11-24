// Imported first by main.tsx, so it runs before the router reads the
// address: /it/q/:id -> remember the quote, show /it in the address bar.
import { takeSharedLink } from './lib/share';

takeSharedLink();
