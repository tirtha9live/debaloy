import { env } from 'cloudflare:workers';
import { recordJobRun, type JobTrigger } from './bank-holidays';
import { DRIK_EVENT_NAMES, type DrikEvent } from './festivals';

export const DRIK_JOB = 'drik_festivals';
const DRIK_URL = 'https://www.drikpanchang.com/calendars/hindu/hinducalendar.html';
/** Kolkata, so tithi-based dates follow the Bengal sunrise. */
const KOLKATA_GEONAME_ID = '1275004';
const REQUIRED = ['Holi', 'Durga Ashtami', 'Diwali'];

const MONTHS: Record<string, string> = {
  january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
  july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
};

const BROWSER_HEADERS = {
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language': 'en-IN,en-GB;q=0.9,en-US;q=0.8,en;q=0.7',
  'cache-control': 'no-cache',
  pragma: 'no-cache',
  'upgrade-insecure-requests': '1',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

function db() {
  return (env as Cloudflare.Env).DB;
}

/** "February 15, 2026, Sunday" → "2026-02-15". */
export function parseDrikDate(text: string): string | null {
  const match = text.trim().match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})/);
  const month = match && MONTHS[match[1].toLowerCase()];
  if (!match || !month) return null;
  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
}

/** First date for each wanted event, from `.dpEventInfo` → name div, Gregorian date div. Other events are dropped. */
export function parseDrikFestivals(html: string): DrikEvent[] {
  const wanted = new Set<string>(DRIK_EVENT_NAMES);
  const found = new Map<string, string>();
  const re = /<div class="dpEventInfo">\s*<div class="dpEventName[^"]*">([\s\S]*?)<\/div>\s*<div class="dpEventGregDate">([\s\S]*?)<\/div>/g;
  for (const match of html.matchAll(re)) {
    const name = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    if (!wanted.has(name) || found.has(name)) continue;
    const date = parseDrikDate(match[2].replace(/<[^>]+>/g, ''));
    if (date) found.set(name, date);
  }
  return [...found].map(([name, date]) => ({ name, date })).sort((a, b) => a.date.localeCompare(b.date));
}

export function validateDrikFestivals(events: DrikEvent[], year: number): string | null {
  const missing = REQUIRED.filter((name) => !events.some((event) => event.name === name));
  if (missing.length) return `Drik Panchang list is missing ${missing.join(', ')}; the page layout may have changed.`;
  const outside = events.filter((event) => !event.date.startsWith(`${year}-`));
  if (outside.length === events.length) return `Drik Panchang still shows ${events[0].date.slice(0, 4)}, not ${year}.`;
  if (outside.length) return `${outside.length} Drik dates are outside ${year}.`;
  return null;
}

export async function listDrikFestivals(year: number): Promise<DrikEvent[]> {
  const rows = await db().prepare('SELECT name, date FROM drik_festivals WHERE year = ? ORDER BY date').bind(year).all<DrikEvent>();
  return rows.results ?? [];
}

/** Home page first for cookies, then the calendar with it as referrer (like a browser arriving from search). */
async function fetchDrikCalendar(year: number) {
  const cookies = new Map<string, string>();
  try {
    const home = await fetch('https://www.drikpanchang.com/', {
      headers: { ...BROWSER_HEADERS, referer: 'https://www.google.com/' },
      signal: AbortSignal.timeout(20_000),
    });
    for (const line of home.headers.getSetCookie?.() ?? []) {
      const pair = line.split(';')[0];
      const index = pair.indexOf('=');
      if (index > 0) cookies.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
    }
    await home.body?.cancel();
  } catch {
    // The calendar can still answer without the warm-up.
  }
  const url = new URL(DRIK_URL);
  url.searchParams.set('year', String(year));
  url.searchParams.set('geoname-id', KOLKATA_GEONAME_ID);
  const cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  return fetch(url, {
    headers: { ...BROWSER_HEADERS, referer: 'https://www.drikpanchang.com/', ...(cookie ? { cookie } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
}

export async function refreshDrikFestivals(trigger: JobTrigger, year: number) {
  try {
    const response = await fetchDrikCalendar(year);
    if (!response.ok) throw new Error(`Drik Panchang answered ${response.status}`);
    const html = await response.text();
    const events = parseDrikFestivals(html);
    const problem = validateDrikFestivals(events, year);
    if (problem) {
      const title = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim().slice(0, 60) ?? 'no title';
      const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
      throw new Error(`${problem} (got ${html.length} bytes, “${title}”: ${text})`);
    }
    const database = db();
    await database.batch([
      database.prepare('DELETE FROM drik_festivals WHERE year = ?').bind(year),
      ...events.map((event) =>
        database.prepare('INSERT INTO drik_festivals (year, name, date) VALUES (?, ?, ?)').bind(year, event.name, event.date),
      ),
    ]);
    await recordJobRun(trigger, 'ok', `Saved ${events.length} Kolkata festival dates for ${year}.`, DRIK_JOB);
    return { ok: true as const, count: events.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordJobRun(trigger, 'failed', `${year}: ${message}`, DRIK_JOB);
    return { ok: false as const, error: message };
  }
}
