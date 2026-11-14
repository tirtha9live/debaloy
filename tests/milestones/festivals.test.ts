import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseHdfcHolidays } from '../../src/lib/bank-holidays';
import { parseDrikDate, parseDrikFestivals, validateDrikFestivals } from '../../src/lib/drik-festivals';
import {
  activeFestival,
  buildFestivalCalendar,
  FESTIVAL_IMAGE_WIDTHS,
  festivalPalette,
  festivalVariantIndex,
} from '../../src/lib/festivals';
import { ROOT, readRepo, readSrc } from '../helpers/repo';

const fixture = (name: string) => fs.readFileSync(path.join(ROOT, 'tests/fixtures', name), 'utf8');
const bank = parseHdfcHolidays(fixture('hdfc-bank-holidays.html'));
const drik = parseDrikFestivals(fixture('drik-hindu-calendar-2026.html'));
const calendar = buildFestivalCalendar(2026, bank, drik);
const bySlug = Object.fromEntries(calendar.map((window) => [window.slug, window]));

describe('Drik Panchang festival dates (Kolkata)', () => {
  it('keeps only the chosen events', () => {
    expect(parseDrikDate('February 15, 2026, Sunday')).toBe('2026-02-15');
    expect(drik).toEqual([
      { name: 'Maha Shivaratri', date: '2026-02-15' },
      { name: 'Holi', date: '2026-03-04' },
      { name: 'Solar New Year', date: '2026-04-14' },
      { name: 'Raksha Bandhan', date: '2026-08-28' },
      { name: 'Rakhi', date: '2026-08-28' },
      { name: 'Krishna Janmashtami', date: '2026-09-04' },
      { name: 'Ganesh Chaturthi', date: '2026-09-14' },
      { name: 'Navratri Begins', date: '2026-10-11' },
      { name: 'Durga Ashtami', date: '2026-10-19' },
      { name: 'Diwali', date: '2026-11-08' },
      { name: 'Bhaiya Dooj', date: '2026-11-11' },
    ]);
    expect(validateDrikFestivals(drik, 2026)).toBeNull();
    expect(validateDrikFestivals(drik, 2027)).toMatch(/still shows 2026/);
    expect(validateDrikFestivals([], 2026)).toMatch(/missing/);
  });

  it('asks Drik for Kolkata', () => {
    expect(readSrc('lib/drik-festivals.ts')).toMatch(/KOLKATA_GEONAME_ID = '1275004'/);
  });
});

describe('festival landing calendar', () => {
  it('shows fixed festivals and single-day festivals on the day only', () => {
    expect(bySlug['republic-day'].days).toEqual(['2026-01-26']);
    expect(bySlug['independence-day'].days).toEqual(['2026-08-15']);
    expect(bySlug['gandhi-jayanti'].days).toEqual(['2026-10-02']);
    expect(bySlug['christmas'].days).toEqual(['2026-12-25']);
    expect(bySlug['good-friday'].days).toEqual(['2026-04-03']);
    expect(bySlug['maha-shivaratri'].days).toEqual(['2026-02-15']);
    expect(bySlug['holi'].days).toEqual(['2026-03-04']);
    expect(bySlug['raksha-bandhan'].days).toEqual(['2026-08-28']);
    expect(bySlug['janmashtami'].days).toEqual(['2026-09-04']);
    expect(bySlug['ganesh-chaturthi'].days).toEqual(['2026-09-14']);
  });

  it('runs New Year from 1 to 11 January', () => {
    expect(bySlug['new-year'].days).toHaveLength(11);
    expect(bySlug['new-year'].days[0]).toBe('2026-01-01');
    expect(bySlug['new-year'].days[10]).toBe('2026-01-11');
    expect(activeFestival('2026-12-31', calendar)).toBeNull();
  });

  it('shows Subho Noboborsho on the Bengali New Year (bank list, else Solar New Year + 1)', () => {
    expect(bySlug['bengali-new-year']).toMatchObject({ title: 'Subho Noboborsho', days: ['2026-04-15'] });
    const withoutBank = buildFestivalCalendar(2026, [], drik).find((window) => window.slug === 'bengali-new-year');
    expect(withoutBank?.days).toEqual(['2026-04-15']);
  });

  it('shows Subho Mahalaya only on the day before Navratri', () => {
    expect(bySlug['mahalaya']).toMatchObject({ title: 'Subho Mahalaya', days: ['2026-10-10'] });
  });

  it('shows Durga Pujo from Ashtami − 4 to Ashtami + 4', () => {
    expect(bySlug['durga-pujo'].title).toBe('Durga Pujo 2026');
    expect(bySlug['durga-pujo'].days[0]).toBe('2026-10-15');
    expect(bySlug['durga-pujo'].days.at(-1)).toBe('2026-10-23');
    expect(bySlug['durga-pujo'].days).toHaveLength(9);
  });

  it('takes Diwali from Drik even on a weekend (not a bank holiday), shown n−1 and n', () => {
    expect(bank.some((row) => /diwali/i.test(row.name))).toBe(false);
    expect(bySlug['diwali'].days).toEqual(['2026-11-07', '2026-11-08']);
    expect(activeFestival('2026-11-08', calendar)?.title).toBe('Happy Diwali');
    expect(activeFestival('2026-11-09', calendar)).toBeNull();
  });

  it('shows Bhai Phota on Bhaiya Dooj only', () => {
    expect(bySlug['bhai-phota']).toMatchObject({ title: 'Bhai Phota', days: ['2026-11-11'] });
  });

  it('gives every festival a gradient palette', () => {
    for (const window of calendar) expect(festivalPalette(window.slug)).toHaveLength(3);
  });

  it('splits 7 photos across 07:00–23:00 of all shown days', () => {
    const diwali = bySlug['diwali'];
    expect(festivalVariantIndex(diwali, '2026-11-07', 6 * 60, 7)).toBe(0);
    expect(festivalVariantIndex(diwali, '2026-11-07', 22 * 60 + 59, 7)).toBe(3);
    expect(festivalVariantIndex(diwali, '2026-11-08', 7 * 60, 7)).toBe(3);
    expect(festivalVariantIndex(diwali, '2026-11-08', 23 * 60, 7)).toBe(6);
    const single = bySlug['holi'];
    expect([7, 9.3, 11.6, 13.9, 16.2, 18.5, 20.8].map((h) => festivalVariantIndex(single, '2026-03-04', Math.round(h * 60), 7))).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(festivalVariantIndex(diwali, '2026-11-08', 12 * 60, 1)).toBe(0);
  });

  it('serves responsive widths from R2, downloading each width only on first request', () => {
    expect([...FESTIVAL_IMAGE_WIDTHS]).toEqual([150, 300, 400, 600, 800, 1200, 1600]);
    const lib = readSrc('lib/festival-images.ts');
    expect(lib).toMatch(/await RECEIPTS\.get\(key\)/);
    expect(lib).toMatch(/await RECEIPTS\.put\(key, bytes/);
    expect(readSrc('middleware.ts')).toMatch(/\/festival-img\//);
    const landing = readSrc('pages/index.astro');
    expect(landing).toMatch(/srcset=\{festivalSrcset/);
    expect(landing).toMatch(/festivalCalendarFor/);
    expect(landing).not.toMatch(/on\s*<a[^>]*>Pexels<\/a>/);
    expect(readRepo('migrations/0017_festival_calendar.sql')).toMatch(/CREATE TABLE IF NOT EXISTS festival_calendar/);
  });

  it('lets the treasurer force each fetch and the consolidation from Activity, logged and rate limited', () => {
    const api = readSrc('pages/api/ledger/calendar-jobs.ts');
    expect(api).toMatch(/locals\.session\?\.role !== 'admin' \|\| locals\.viewAsResident/);
    expect(api).toMatch(/refreshBankHolidays\('manual', year\)/);
    expect(api).toMatch(/refreshDrikFestivals\('manual', year\)/);
    expect(api).toMatch(/consolidateFestivals\('manual', year\)/);
    expect(api).toMatch(/'-1 minute'/);
    const activity = readSrc('pages/ledger/activity.astro');
    expect(activity).toMatch(/action="\/api\/ledger\/calendar-jobs"/);
    for (const intent of ['all', 'bank', 'drik', 'consolidate']) expect(activity).toContain(`intent: '${intent}'`);
    expect(activity).toMatch(/data-confirm-action/);
  });

  it('fetches bank holidays and Drik together on 1 Jan, then consolidates; the retry consolidates again', () => {
    const jobs = readSrc('lib/calendar-jobs.ts');
    const refresh = jobs.slice(jobs.indexOf('export async function refreshCalendars'), jobs.indexOf('export async function runCalendarCron'));
    expect(refresh).toMatch(/Promise\.all\(\[refreshBankHolidays\(trigger, year\), refreshDrikFestivals\(trigger, year\)\]\)/);
    expect(refresh.indexOf('Promise.all')).toBeLessThan(refresh.indexOf('consolidateFestivals'));
    const cron = jobs.slice(jobs.indexOf('export async function runCalendarCron'), jobs.indexOf('export async function festivalCalendarFor'));
    expect(cron).toMatch(/BANK_HOLIDAY_CRON_RETRY/);
    expect(cron).toMatch(/consolidateFestivals\('retry', year\)/);
    expect(readSrc('worker.ts')).toMatch(/runCalendarCron\(controller\.cron\)/);
    expect(readRepo('wrangler.toml')).toMatch(/crons = \["0 5 1 1 \*", "30 12 1 1 \*"\]/);
    expect(readRepo('migrations/0016_drik_festivals.sql')).toMatch(/CREATE TABLE IF NOT EXISTS drik_festivals/);
  });
});
