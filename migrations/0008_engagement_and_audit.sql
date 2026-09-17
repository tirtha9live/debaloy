CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  path TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_sec INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_page_views_session ON page_views (session_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_path ON page_views (path);

CREATE TABLE IF NOT EXISTS ledger_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  session_id TEXT NOT NULL,
  role TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  sheet TEXT NOT NULL,
  field_label TEXT NOT NULL,
  old_value TEXT NOT NULL DEFAULT '',
  new_value TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ledger_audit_at ON ledger_audit (at DESC, id DESC);
