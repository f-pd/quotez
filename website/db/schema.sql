-- Settings table (key-value store) for backoffice configuration
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default settings (idempotent insertion via INSERT OR IGNORE)
INSERT OR IGNORE INTO settings (key, value, description) VALUES
  ('display_mode', 'fullscreen', 'Quote display mode: fullscreen|minimal|card|terminal'),
  ('backdrop_source', 'gradient', 'Backdrop source: gradient|unsplash|upload|pattern'),
  ('qotd_host', 'localhost', 'QOTD service hostname'),
  ('qotd_port', '8017', 'QOTD service TCP port'),
  ('unsplash_api_key', '', 'Unsplash API key for backdrop images'),
  ('site_title', 'Quote of the Day', 'Website title'),
  ('refresh_interval', '0', 'Auto-refresh interval in seconds (0=disabled)');

-- Anonymous aggregated counters (no IP, no cookie, nothing about the visitor):
-- one row per quote id, language, kind ('visit' of a shared link /:locale/q/:id,
-- 'image' generated in the page) and image format ('' for visits)
CREATE TABLE IF NOT EXISTS share_counts (
  quote_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  kind TEXT NOT NULL,
  format TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  last_at TEXT,
  PRIMARY KEY (quote_id, locale, kind, format)
)
