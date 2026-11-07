-- Hindu festival dates for Kolkata from Drik Panchang (only the festivals the landing page uses).
CREATE TABLE IF NOT EXISTS drik_festivals (
  year INTEGER NOT NULL,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  PRIMARY KEY (year, name)
);

DELETE FROM festival_images WHERE slug = 'dol-jatra';
