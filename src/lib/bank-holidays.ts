import { env } from 'cloudflare:workers';
import { todayIso } from './years';

export const BANK_HOLIDAY_STATE = 'West Bengal';
export const BANK_HOLIDAY_SOURCE = 'https://www.hdfc.bank.in/bank-holiday-list';
const HDFC_HOME = 'https://www.hdfc.bank.in/';
const JOB = 'bank_holidays';

/** 1 Jan 10:30 IST and the 18:00 IST retry, in UTC. */
export const BANK_HOLIDAY_CRON_MAIN = '0 5 1 1 *';
export const BANK_HOLIDAY_CRON_RETRY = '30 12 1 1 *';

export type BankHoliday = { date: string; name: string };
export type JobTrigger = 'cron' | 'retry' | 'manual' | 'auto';
export type JobRun = { id: number; job: string; trigger: JobTrigger; status: 'ok' | 'failed' | 'skipped'; detail: string; at: string };

const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
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

function decodeEntities(text: string) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&#x27;|`/g, "'")
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function cellText(html: string) {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** "23-Jan-26" → "2026-01-23". */
export function parseHdfcDate(text: string): string | null {
  const match = text.trim().match(/^(\d{1,2})[-\s]([A-Za-z]{3})[A-Za-z]*[-\s](\d{2}|\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${match[1].padStart(2, '0')}`;
}

/** Holidays for one state from the HDFC page: its accordion title, then the first real table in that panel. */
export function parseHdfcHolidays(html: string, state = BANK_HOLIDAY_STATE): BankHoliday[] {
  const titleRe = new RegExp(`cmp-accordion__title">\\s*${state.replace(/\s+/g, '\\s+')}\\s*<`, 'i');
  const start = html.search(titleRe);
  if (start < 0) return [];
  const nextItem = html.indexOf('cmp-accordion__item', start + 1);
  const section = html.slice(start, nextItem > 0 ? nextItem : undefined);
  const table = section.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) return [];

  const holidays: BankHoliday[] = [];
  const seen = new Set<string>();
  for (const row of table.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? []).map(cellText);
    if (cells.length < 2) continue;
    const date = parseHdfcDate(cells[cells.length - 1]) ?? parseHdfcDate(cells[0]);
    const name = parseHdfcDate(cells[0]) ? cells[cells.length - 1] : cells[0];
    if (!date || !name) continue;
    const key = `${date}|${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    holidays.push({ date, name });
  }
  return holidays.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}

/** A usable list: enough rows, and every date inside the requested year. */
export function validateHolidays(holidays: BankHoliday[], year: number): string | null {
  if (holidays.length < 8) return `Found only ${holidays.length} holidays for ${BANK_HOLIDAY_STATE}; the page layout may have changed.`;
  const other = holidays.filter((row) => !row.date.startsWith(`${year}-`));
  if (other.length === holidays.length) {
    const shown = holidays[0].date.slice(0, 4);
    return `The source still shows ${shown}, not ${year}.`;
  }
  if (other.length) return `${other.length} dates are outside ${year}.`;
  return null;
}

function cookieJar() {
  const jar = new Map<string, string>();
  return {
    keep(response: Response) {
      for (const line of response.headers.getSetCookie?.() ?? []) {
        const pair = line.split(';')[0];
        const index = pair.indexOf('=');
        if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
      }
    },
    header() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    },
  };
}

/** Visits the HDFC home page first (cookies, referrer), then the holiday list. */
export async function fetchHdfcHolidayPage(): Promise<string> {
  const jar = cookieJar();
  try {
    const warm = await fetch(HDFC_HOME, {
      headers: { ...BROWSER_HEADERS, referer: 'https://www.google.com/' },
      signal: AbortSignal.timeout(20_000),
    });
    jar.keep(warm);
    await warm.body?.cancel();
  } catch {
    // The list page can still answer without the warm-up.
  }
  const cookies = jar.header();
  const response = await fetch(BANK_HOLIDAY_SOURCE, {
    headers: { ...BROWSER_HEADERS, referer: HDFC_HOME, ...(cookies ? { cookie: cookies } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`HDFC answered ${response.status} ${response.statusText}`.trim());
  return response.text();
}

export async function listBankHolidays(year: number): Promise<BankHoliday[]> {
  const rows = await db()
    .prepare('SELECT date, name FROM bank_holidays WHERE year = ? ORDER BY date, name')
    .bind(year)
    .all<BankHoliday>();
  return rows.results ?? [];
}

export async function bankHolidayYears(): Promise<number[]> {
  const rows = await db().prepare('SELECT DISTINCT year FROM bank_holidays ORDER BY year DESC').all<{ year: number }>();
  return (rows.results ?? []).map((row) => Number(row.year));
}

async function saveBankHolidays(year: number, holidays: BankHoliday[]) {
  const database = db();
  await database.batch([
    database.prepare('DELETE FROM bank_holidays WHERE year = ?').bind(year),
    ...holidays.map((row) =>
      database.prepare('INSERT INTO bank_holidays (year, date, name) VALUES (?, ?, ?)').bind(year, row.date, row.name),
    ),
  ]);
}

export async function recordJobRun(trigger: JobTrigger, status: JobRun['status'], detail: string, job = JOB) {
  await db()
    .prepare('INSERT INTO job_runs (job, trigger, status, detail) VALUES (?, ?, ?, ?)')
    .bind(job, trigger, status, detail.slice(0, 500))
    .run();
}

export async function listJobRuns(limit = 20): Promise<JobRun[]> {
  const rows = await db()
    .prepare('SELECT id, job, trigger, status, detail, at FROM job_runs ORDER BY at DESC, id DESC LIMIT ?')
    .bind(limit)
    .all<JobRun>();
  return rows.results ?? [];
}

export async function lastBankHolidayRun(): Promise<JobRun | null> {
  return (
    (await db()
      .prepare("SELECT id, job, trigger, status, detail, at FROM job_runs WHERE job = ? AND status != 'skipped' ORDER BY at DESC, id DESC LIMIT 1")
      .bind(JOB)
      .first<JobRun>()) ?? null
  );
}

export function currentKolkataYear() {
  return Number(todayIso().slice(0, 4));
}

/** Fetch, check, save. Every attempt is logged for the Activity page. */
export async function refreshBankHolidays(trigger: JobTrigger, year = currentKolkataYear()) {
  try {
    const html = await fetchHdfcHolidayPage();
    const holidays = parseHdfcHolidays(html);
    const problem = validateHolidays(holidays, year);
    if (problem) throw new Error(problem);
    await saveBankHolidays(year, holidays);
    await recordJobRun(trigger, 'ok', `Saved ${holidays.length} ${BANK_HOLIDAY_STATE} holidays for ${year}.`);
    return { ok: true as const, count: holidays.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordJobRun(trigger, 'failed', `${year}: ${message}`);
    return { ok: false as const, error: message };
  }
}

/** Stores `today` under `key` and returns true the first time it is called that day. */
export async function claimDaily(key: string, today: string) {
  const database = db();
  const row = await database.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first<{ value: string }>();
  if (row?.value === today) return false;
  await database
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(key, today)
    .run();
  return true;
}
