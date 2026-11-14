-- A pinned photo is shown for its festival instead of the 7am–11pm rotation (one per festival).
ALTER TABLE festival_photos ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0;
