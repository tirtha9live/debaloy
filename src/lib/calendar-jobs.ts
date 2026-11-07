import { env } from 'cloudflare:workers';
import {
  BANK_HOLIDAY_CRON_RETRY,
  claimDaily,
  currentKolkataYear,
  listBankHolidays,
  recordJobRun,
  refreshBankHolidays,
  type JobTrigger,
} from './bank-holidays';
import { listDrikFestivals, refreshDrikFestivals } from './drik-festivals';
import { buildFestivalCalendar, isFestivalSlug, type FestivalWindow } from './festivals';

export const CALENDAR_JOB = 'festival_calendar';
type WaitUntil = (promise: Promise<unknown>) => void;

function db() {
  return (env as Cloudflare.Env).DB;
}

/** Merges fixed dates, the saved bank list, and the saved Drik dates into this year's festival windows. */
export async function consolidateFestivals(trigger: JobTrigger, year: number) {
  const [bank, drik] = await Promise.all([listBankHolidays(year), listDrikFestivals(year)]);
  const windows = buildFestivalCalendar(year, bank, drik);
  const database = db();
  await database.batch([
    database.prepare('DELETE FROM festival_calendar WHERE year = ?').bind(year),
    ...windows.map((window) =>
      database
        .prepare('INSERT INTO festival_calendar (year, slug, title, date, days) VALUES (?, ?, ?, ?, ?)')
        .bind(year, window.slug, window.title, window.date, JSON.stringify(window.days)),
    ),
  ]);
  const sources = `bank list ${bank.length ? 'yes' : 'missing'}, Drik ${drik.length ? 'yes' : 'missing'}`;
  await recordJobRun(trigger, bank.length && drik.length ? 'ok' : 'failed', `Consolidated ${windows.length} festivals for ${year} (${sources}).`, CALENDAR_JOB);
  return windows;
}

export async function listFestivalCalendar(year: number): Promise<FestivalWindow[]> {
  const rows = await db()
    .prepare('SELECT slug, title, date, days FROM festival_calendar WHERE year = ? ORDER BY date')
    .bind(year)
    .all<{ slug: string; title: string; date: string; days: string }>();
  return (rows.results ?? []).flatMap((row) => {
    if (!isFestivalSlug(row.slug)) return [];
    try {
      return [{ slug: row.slug, title: row.title, date: row.date, days: JSON.parse(row.days) as string[] }];
    } catch {
      return [];
    }
  });
}

/** 1 Jan: fetch the HDFC bank list and Drik Panchang together, then consolidate once both have answered. */
export async function refreshCalendars(trigger: JobTrigger, year = currentKolkataYear()) {
  const [bank, drik] = await Promise.all([refreshBankHolidays(trigger, year), refreshDrikFestivals(trigger, year)]);
  await consolidateFestivals(trigger, year);
  return { bank, drik };
}

/** 10:30 fetches both and consolidates; the 18:00 retry fetches only what is still missing, then consolidates again. */
export async function runCalendarCron(cron: string) {
  const year = currentKolkataYear();
  if (cron !== BANK_HOLIDAY_CRON_RETRY) {
    await refreshCalendars('cron', year);
    return;
  }
  const [bank, drik] = await Promise.all([listBankHolidays(year), listDrikFestivals(year)]);
  if (bank.length && drik.length) {
    await recordJobRun('retry', 'skipped', `${year} bank list and festival dates already saved; retry not needed.`, CALENDAR_JOB);
    return;
  }
  await Promise.all([
    bank.length ? null : refreshBankHolidays('retry', year),
    drik.length ? null : refreshDrikFestivals('retry', year),
  ]);
  await consolidateFestivals('retry', year);
}

/**
 * Landing page: the consolidated calendar for the year. If 1 Jan was missed (or failed), fetch whatever is
 * missing in the background at most once a day, and use fixed dates plus whatever is saved meanwhile.
 */
export async function festivalCalendarFor(year: number, today: string, waitUntil?: WaitUntil): Promise<FestivalWindow[]> {
  const [saved, bank, drik] = await Promise.all([listFestivalCalendar(year), listBankHolidays(year), listDrikFestivals(year)]);
  if (waitUntil && (!bank.length || !drik.length) && (await claimDaily('calendar_auto', today))) {
    waitUntil(
      (async () => {
        await Promise.all([
          bank.length ? null : refreshBankHolidays('auto', year),
          drik.length ? null : refreshDrikFestivals('auto', year),
        ]);
        await consolidateFestivals('auto', year);
      })(),
    );
  }
  return saved.length ? saved : buildFestivalCalendar(year, bank, drik);
}
