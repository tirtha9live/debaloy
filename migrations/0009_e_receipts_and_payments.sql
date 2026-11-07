CREATE TABLE IF NOT EXISTS e_receipt_mobiles (
  flat_id TEXT PRIMARY KEY,
  mobile TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS online_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year_id INTEGER NOT NULL,
  flat_id TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('maintenance', 'dues', 'others')),
  description TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL,
  link_account INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  bank TEXT NOT NULL DEFAULT '',
  account_holder TEXT NOT NULL DEFAULT '',
  applied_month TEXT,
  submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_online_payments_year_status ON online_payments (year_id, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_online_payments_flat ON online_payments (flat_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS flat_bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flat_id TEXT NOT NULL,
  bank TEXT NOT NULL,
  account_holder TEXT NOT NULL,
  auto_sync INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT NOT NULL,
  UNIQUE (flat_id, bank, account_holder)
);

CREATE INDEX IF NOT EXISTS idx_flat_bank_accounts_flat ON flat_bank_accounts (flat_id, last_used_at DESC);
