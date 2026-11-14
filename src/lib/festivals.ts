import type { BankHoliday } from './bank-holidays';

export type FestivalSlug =
  | 'new-year'
  | 'republic-day'
  | 'maha-shivaratri'
  | 'holi'
  | 'good-friday'
  | 'bengali-new-year'
  | 'raksha-bandhan'
  | 'independence-day'
  | 'janmashtami'
  | 'ganesh-chaturthi'
  | 'gandhi-jayanti'
  | 'mahalaya'
  | 'durga-pujo'
  | 'diwali'
  | 'bhai-phota'
  | 'christmas';

export type FestivalWindow = {
  slug: FestivalSlug;
  title: string;
  /** The festival day itself. */
  date: string;
  /** Days the landing page shows it, in order. */
  days: string[];
};

/** A dated event from Drik Panchang (Kolkata). */
export type DrikEvent = { name: string; date: string };

/** Drik Panchang event names we keep; everything else on the page is discarded. */
export const DRIK_EVENT_NAMES = [
  'Maha Shivaratri',
  'Solar New Year',
  'Holi',
  'Rakhi',
  'Raksha Bandhan',
  'Krishna Janmashtami',
  'Ganesh Chaturthi',
  'Navratri Begins',
  'Durga Ashtami',
  'Diwali',
  'Bhaiya Dooj',
] as const;

type Festival = {
  slug: FestivalSlug;
  title: (year: number) => string;
  query: string;
  /** Landing gradient before the photo's own colours are read. */
  palette: [string, string, string];
};

export const FESTIVALS: Festival[] = [
  { slug: 'new-year', title: (y) => `Happy New Year ${y}`, query: 'new year fireworks', palette: ['#f9cb28', '#7928ca', '#007cf0'] },
  { slug: 'republic-day', title: () => 'Happy Republic Day', query: 'india republic day', palette: ['#ff9933', '#f1f5f9', '#138808'] },
  { slug: 'maha-shivaratri', title: () => 'Happy Maha Shivaratri', query: 'lord shiva', palette: ['#1e3a8a', '#60a5fa', '#e0f2fe'] },
  { slug: 'holi', title: () => 'Happy Holi', query: 'holi colors', palette: ['#ff0080', '#f9cb28', '#00dfd8'] },
  { slug: 'good-friday', title: () => 'Good Friday', query: 'good friday cross', palette: ['#7c3aed', '#a78bfa', '#e2e8f0'] },
  { slug: 'bengali-new-year', title: () => 'Subho Noboborsho', query: 'pohela boishakh', palette: ['#dc2626', '#f59e0b', '#fde68a'] },
  { slug: 'raksha-bandhan', title: () => 'Happy Raksha Bandhan', query: 'raksha bandhan rakhi', palette: ['#f59e0b', '#ef4444', '#fde68a'] },
  { slug: 'independence-day', title: () => 'Happy Independence Day', query: 'indian flag', palette: ['#ff9933', '#f1f5f9', '#138808'] },
  { slug: 'janmashtami', title: () => 'Happy Janmashtami', query: 'janmashtami', palette: ['#2563eb', '#f59e0b', '#facc15'] },
  { slug: 'ganesh-chaturthi', title: () => 'Happy Ganesh Chaturthi', query: 'ganesh chaturthi', palette: ['#f97316', '#dc2626', '#fde047'] },
  { slug: 'gandhi-jayanti', title: () => 'Gandhi Jayanti', query: 'mahatma gandhi', palette: ['#ff9933', '#e7e5e4', '#138808'] },
  { slug: 'mahalaya', title: () => 'Subho Mahalaya', query: 'durga idol', palette: ['#f97316', '#fbbf24', '#9a3412'] },
  { slug: 'durga-pujo', title: (y) => `Durga Pujo ${y}`, query: 'durga puja', palette: ['#dc2626', '#f59e0b', '#fef3c7'] },
  { slug: 'diwali', title: () => 'Happy Diwali', query: 'diwali', palette: ['#f97316', '#facc15', '#b91c1c'] },
  { slug: 'bhai-phota', title: () => 'Bhai Phota', query: 'bhai dooj', palette: ['#f59e0b', '#ec4899', '#fde68a'] },
  { slug: 'christmas', title: () => 'Merry Christmas', query: 'christmas lights', palette: ['#dc2626', '#16a34a', '#fef08a'] },
];

function festival(slug: FestivalSlug) {
  return FESTIVALS.find((item) => item.slug === slug)!;
}

export function festivalPalette(slug: FestivalSlug): [string, string, string] {
  return festival(slug)?.palette ?? ['#f97316', '#facc15', '#b91c1c'];
}

export function isFestivalSlug(value: string): value is FestivalSlug {
  return FESTIVALS.some((item) => item.slug === value);
}

export function addDaysIso(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function span(date: string, before: number, after: number) {
  const days: string[] = [];
  for (let offset = -before; offset <= after; offset += 1) days.push(addDaysIso(date, offset));
  return days;
}

/**
 * Fixed dates; Good Friday and Bengali New Year from the bank list; the rest from Drik Panchang (Kolkata),
 * which also catches festivals that fall on a weekend and so never appear as bank holidays.
 * Shown on the festival day only, except: New Year n..n+10, Mahalaya on Navratri−1,
 * Durga Pujo Ashtami−4..Ashtami+4, Diwali n−1..n.
 */
export function buildFestivalCalendar(year: number, bank: BankHoliday[], drik: DrikEvent[]): FestivalWindow[] {
  const bankDate = (pattern: RegExp) =>
    bank.filter((row) => row.date.startsWith(`${year}-`) && pattern.test(row.name)).map((row) => row.date).sort()[0];
  const drikDate = (...names: string[]) =>
    drik.filter((row) => row.date.startsWith(`${year}-`) && names.includes(row.name)).map((row) => row.date).sort()[0];

  const windows: FestivalWindow[] = [];
  const add = (slug: FestivalSlug, date: string | undefined, days: (date: string) => string[] = (d) => [d]) => {
    if (!date) return;
    windows.push({ slug, title: festival(slug).title(year), date, days: days(date) });
  };

  add('new-year', `${year}-01-01`, (d) => span(d, 0, 10));
  add('republic-day', `${year}-01-26`);
  add('maha-shivaratri', drikDate('Maha Shivaratri'));
  add('holi', drikDate('Holi'));
  add('good-friday', bankDate(/good\s*friday/i));
  const solarNewYear = drikDate('Solar New Year');
  add('bengali-new-year', bankDate(/bengali\s*new\s*year|poila|pohela/i) ?? (solarNewYear && addDaysIso(solarNewYear, 1)));
  add('raksha-bandhan', drikDate('Raksha Bandhan', 'Rakhi'));
  add('independence-day', `${year}-08-15`);
  add('janmashtami', drikDate('Krishna Janmashtami'));
  add('ganesh-chaturthi', drikDate('Ganesh Chaturthi'));
  add('gandhi-jayanti', `${year}-10-02`);
  const navratri = drikDate('Navratri Begins');
  add('mahalaya', navratri && addDaysIso(navratri, -1));
  add('durga-pujo', drikDate('Durga Ashtami'), (d) => span(d, 4, 4));
  add('diwali', drikDate('Diwali'), (d) => span(d, 1, 0));
  add('bhai-phota', drikDate('Bhaiya Dooj'));
  add('christmas', `${year}-12-25`);
  return windows;
}

/** The festival to show today. Overlaps go to the one whose own day is nearest. */
export function activeFestival(today: string, windows: FestivalWindow[]): FestivalWindow | null {
  const live = windows.filter((window) => window.days.includes(today));
  if (!live.length) return null;
  const distance = (window: FestivalWindow) => Math.abs(window.days.indexOf(window.date) - window.days.indexOf(today));
  return live.sort((a, b) => distance(a) - distance(b) || a.days.length - b.days.length)[0];
}

export const WAKE_START_MINUTE = 7 * 60;
export const WAKE_END_MINUTE = 23 * 60;

/** Splits 07:00–23:00 across all shown days into `count` equal slots. Night keeps the last slot. */
export function festivalVariantIndex(window: FestivalWindow, today: string, minuteOfDay: number, count: number) {
  if (count <= 1) return 0;
  const dayIndex = Math.max(0, window.days.indexOf(today));
  const perDay = WAKE_END_MINUTE - WAKE_START_MINUTE;
  const elapsed = dayIndex * perDay + Math.min(perDay, Math.max(0, minuteOfDay - WAKE_START_MINUTE));
  const total = window.days.length * perDay;
  return Math.min(count - 1, Math.floor((elapsed * count) / total));
}

export function kolkataClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return {
    date: `${pick('year')}-${pick('month')}-${pick('day')}`,
    minuteOfDay: Number(pick('hour')) * 60 + Number(pick('minute')),
  };
}

export const FESTIVAL_IMAGE_WIDTHS = [150, 300, 400, 600, 800, 1200, 1600] as const;
export const FESTIVAL_IMAGES_PER_FESTIVAL = 7;
