CREATE TABLE IF NOT EXISTS visitors (
  session_id TEXT PRIMARY KEY,
  role TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen ON visitors (last_seen DESC);

CREATE TABLE IF NOT EXISTS login_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  role TEXT,
  ip TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  fingerprint TEXT NOT NULL DEFAULT '',
  session_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_events_at ON login_events (at DESC);
