CREATE TABLE IF NOT EXISTS ledger_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  opening_cash REAL NOT NULL DEFAULT 0,
  opening_bank REAL NOT NULL DEFAULT 0,
  cash_in_hand REAL,
  cash_in_bank REAL,
  cash_in_hand_override INTEGER NOT NULL DEFAULT 0,
  cash_in_bank_override INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO ledger_years (
  id, label, start_date, end_date, opening_cash, opening_bank,
  cash_in_hand, cash_in_bank, cash_in_hand_override, cash_in_bank_override
)
SELECT
  1,
  'FY 2026-27',
  '2026-09-01',
  NULL,
  1364.0,
  229460.9,
  (SELECT value FROM settings WHERE key = 'cash_in_hand'),
  (SELECT value FROM settings WHERE key = 'cash_in_bank'),
  CASE WHEN (SELECT value FROM settings WHERE key = 'cash_in_hand_override') = '1' THEN 1 ELSE 0 END,
  CASE WHEN (SELECT value FROM settings WHERE key = 'cash_in_bank_override') = '1' THEN 1 ELSE 0 END
WHERE NOT EXISTS (SELECT 1 FROM ledger_years);

CREATE TABLE IF NOT EXISTS puja_by_year (
  flat_id TEXT NOT NULL,
  year_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  PRIMARY KEY (flat_id, year_id)
);

INSERT INTO puja_by_year (flat_id, year_id, amount)
SELECT flat_id, 1, amount FROM puja;

DROP TABLE puja;
ALTER TABLE puja_by_year RENAME TO puja;
