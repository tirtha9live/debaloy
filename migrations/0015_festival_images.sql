CREATE TABLE IF NOT EXISTS festival_images (
  slug TEXT NOT NULL,
  idx INTEGER NOT NULL,
  year INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  alt TEXT NOT NULL DEFAULT '',
  photographer TEXT NOT NULL DEFAULT '',
  page_url TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (slug, idx)
);

-- Starter Diwali photo (year 0 = seed, replaced by the first successful Pexels fetch).
INSERT OR IGNORE INTO festival_images (slug, idx, year, source_url, alt, photographer, page_url)
VALUES (
  'diwali', 0, 0,
  'https://images.pexels.com/photos/34641279/pexels-photo-34641279/free-photo-of-glowing-oil-lamps-for-diwali-celebration.jpeg',
  'Illuminated clay oil lamps create a warm glow, ideal for festive celebrations.',
  '',
  'https://www.pexels.com/photo/34641279/'
);
