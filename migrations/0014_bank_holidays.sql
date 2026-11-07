CREATE TABLE IF NOT EXISTS bank_holidays (
  year INTEGER NOT NULL,
  date TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (year, date, name)
);

CREATE TABLE IF NOT EXISTS job_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job TEXT NOT NULL,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('ok', 'failed', 'skipped')),
  detail TEXT NOT NULL DEFAULT '',
  at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS job_runs_job_at ON job_runs (job, at);
