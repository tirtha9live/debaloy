CREATE TABLE maintenance_new (
  flat_id TEXT NOT NULL,
  month TEXT NOT NULL,
  amount REAL,
  mode TEXT NOT NULL DEFAULT 'Cash' CHECK (mode IN ('Bank', 'Cash')),
  PRIMARY KEY (flat_id, month)
);

INSERT INTO maintenance_new (flat_id, month, amount, mode)
SELECT flat_id, month, CASE WHEN amount = 0 THEN NULL ELSE amount END, mode
FROM maintenance;

DROP TABLE maintenance;
ALTER TABLE maintenance_new RENAME TO maintenance;
