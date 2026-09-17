CREATE TABLE IF NOT EXISTS flats (
  id TEXT PRIMARY KEY,
  resident TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS maintenance (
  flat_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  mode TEXT NOT NULL DEFAULT 'Cash' CHECK (mode IN ('Bank', 'Cash')),
  PRIMARY KEY (flat_id, month)
);

CREATE TABLE IF NOT EXISTS puja (
  flat_id TEXT PRIMARY KEY,
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  name TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL,
  is_builtin INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
  date TEXT,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'Bank' CHECK (mode IN ('Bank', 'Cash')),
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_entries_kind ON entries (kind);
CREATE INDEX IF NOT EXISTS idx_entries_kind_category ON entries (kind, category);

INSERT INTO flats (id, resident, sort_order) VALUES
  ('403', 'Rajeshree Saha', 1),
  ('402', 'Poushali Deb Barman', 2),
  ('401', 'Somnath NagChoudhury', 3),
  ('303', 'Sayantan Roy', 4),
  ('302', 'Kumar Dey', 5),
  ('301', 'Souren Dutta', 6),
  ('203', 'Goutam Roy', 7),
  ('202', 'Soumen Dutta', 8),
  ('201', 'Pradip Kumar Sinha', 9),
  ('103', 'Sushanta Pal', 10),
  ('102', 'Saikat Sarkar', 11),
  ('101', 'Tulsi Saha', 12),
  ('G2', 'Tarak Das', 13),
  ('G1', 'Protima Das', 14);

INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Sep-26', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Oct-26', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Nov-26', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Dec-26', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Jan-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Feb-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Mar-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Apr-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'May-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Jun-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Jul-27', 0, 'Cash' FROM flats;
INSERT INTO maintenance (flat_id, month, amount, mode) SELECT id, 'Aug-27', 0, 'Cash' FROM flats;

INSERT INTO puja (flat_id, amount) SELECT id, 0 FROM flats;

INSERT INTO categories (kind, name, sort_order, is_builtin) VALUES
  ('income', 'Special Donation', 1, 1),
  ('income', 'Bank Interest', 2, 1),
  ('income', 'Outstanding Dues', 3, 1),
  ('income', 'Other Income', 4, 1),
  ('expense', 'Sweeper''s Salary with Bonus', 1, 1),
  ('expense', 'Lift Maintenance Contract Renewal', 2, 1),
  ('expense', 'Electricity Bill', 3, 1),
  ('expense', 'Water Tank Cleaning Charges', 4, 1),
  ('expense', 'Electrical Maintenance', 5, 1),
  ('expense', 'Printing & Stationery', 6, 1),
  ('expense', 'Donation for Durga Puja & Kali Puja', 7, 1),
  ('expense', 'Fire Extinguisher Installation & Refilling', 8, 1),
  ('expense', 'New Water Pump Installation', 9, 1),
  ('expense', 'Septic Tank Cleaning & Other SDDM Charges', 10, 1),
  ('expense', 'General Charges', 11, 1),
  ('expense', 'Miscellaneous Expenses', 12, 1),
  ('expense', 'Building Maintenance', 13, 1),
  ('expense', 'Bank Charges', 14, 1),
  ('expense', 'Other Expenses', 15, 1);

INSERT INTO settings (key, value) VALUES
  ('cash_in_hand', '0'),
  ('cash_in_bank', '0');
