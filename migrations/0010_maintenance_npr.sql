ALTER TABLE maintenance ADD COLUMN npr INTEGER NOT NULL DEFAULT 0 CHECK (npr IN (0, 1));

-- Until now 0 meant "no payment required". 0 now means not paid, so carry those cells over as NPR.
UPDATE maintenance SET npr = 1, amount = NULL WHERE amount = 0;
