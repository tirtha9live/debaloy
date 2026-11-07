-- Festival windows for the landing page, consolidated on 1 Jan from fixed dates, the bank list, and Drik Panchang.
CREATE TABLE IF NOT EXISTS festival_calendar (
  year INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  days TEXT NOT NULL,
  PRIMARY KEY (year, slug)
);
