-- One row per landing-page photo. photo_key is permanent (URLs and R2 keys use it), so removing a photo
-- never shifts another photo into its cached URL.
CREATE TABLE IF NOT EXISTS festival_photos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  photo_key TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pexels', 'upload')),
  source_url TEXT NOT NULL DEFAULT '',
  widths TEXT NOT NULL DEFAULT '',
  alt TEXT NOT NULL DEFAULT '',
  year INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (slug, photo_key)
);

CREATE INDEX IF NOT EXISTS festival_photos_slug ON festival_photos (slug, id);

INSERT OR IGNORE INTO festival_photos (slug, photo_key, source, source_url, alt, year)
VALUES (
  'diwali', 'px34641279', 'pexels',
  'https://images.pexels.com/photos/34641279/pexels-photo-34641279/free-photo-of-glowing-oil-lamps-for-diwali-celebration.jpeg',
  'Illuminated clay oil lamps create a warm glow, ideal for festive celebrations.',
  0
);

DROP TABLE IF EXISTS festival_images;
