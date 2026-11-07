import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BANK_HOLIDAY_CRON_MAIN,
  BANK_HOLIDAY_CRON_RETRY,
  parseHdfcDate,
  parseHdfcHolidays,
  validateHolidays,
} from '../../src/lib/bank-holidays';
import { ROOT, readRepo, readSrc } from '../helpers/repo';

const fixture = fs.readFileSync(path.join(ROOT, 'tests/fixtures/hdfc-bank-holidays.html'), 'utf8');

describe('bank holidays (HDFC, West Bengal)', () => {
  it('parses HDFC dates', () => {
    expect(parseHdfcDate('23-Jan-26')).toBe('2026-01-23');
    expect(parseHdfcDate('9-Nov-2026')).toBe('2026-11-09');
    expect(parseHdfcDate('Holi')).toBeNull();
  });

  it('picks the West Bengal table, not another state that also lists Bengali New Year', () => {
    const holidays = parseHdfcHolidays(fixture);
    expect(holidays.length).toBeGreaterThanOrEqual(15);
    const names = holidays.map((row) => row.name);
    expect(names).toContain('Netaji Birthday and Saraswati Puja');
    expect(names).toContain('Birthday of Rabindranath Tagore');
    expect(names).not.toContain('Garia Puja');
    expect(holidays.every((row) => /^2026-\d{2}-\d{2}$/.test(row.date))).toBe(true);
    expect([...holidays].sort((a, b) => a.date.localeCompare(b.date))).toEqual(holidays);
  });

  it('rejects a list for the wrong year or a broken page', () => {
    const holidays = parseHdfcHolidays(fixture);
    expect(validateHolidays(holidays, 2026)).toBeNull();
    expect(validateHolidays(holidays, 2027)).toMatch(/still shows 2026/);
    expect(validateHolidays([], 2026)).toMatch(/Found only 0/);
  });

  it('runs on 1 Jan at 10:30 IST with an 18:00 IST retry', () => {
    expect(BANK_HOLIDAY_CRON_MAIN).toBe('0 5 1 1 *');
    expect(BANK_HOLIDAY_CRON_RETRY).toBe('30 12 1 1 *');
    const toml = readRepo('wrangler.toml');
    expect(toml).toContain(`"${BANK_HOLIDAY_CRON_MAIN}"`);
    expect(toml).toContain(`"${BANK_HOLIDAY_CRON_RETRY}"`);
    expect(toml).toMatch(/main = "\.\/src\/worker\.ts"/);
    expect(readSrc('worker.ts')).toMatch(/scheduled/);
    expect(readRepo('migrations/0014_bank_holidays.sql')).toMatch(/CREATE TABLE IF NOT EXISTS job_runs/);
  });

  it('builds an A4, one-page-wide Excel with a repeating header', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const { buildBankHolidaysWorkbook, weekday } = await import('../../src/lib/bank-holidays-excel');
    const holidays = parseHdfcHolidays(fixture);
    const bytes = await buildBankHolidaysWorkbook(2026, holidays);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes as ArrayBuffer);
    const ws = book.getWorksheet('Bank Holidays 2026')!;
    expect(ws.pageSetup.paperSize).toBe(9);
    expect(ws.pageSetup.fitToWidth).toBe(1);
    expect(ws.pageSetup.printTitlesRow).toBe('5:5');
    expect(ws.getCell('A2').value).toBe('Bank Holidays 2026 — West Bengal (Kolkata)');
    expect(ws.getRow(5).values).toEqual([undefined, '#', 'Date', 'Day', 'Holiday']);
    expect(ws.getCell('D6').value).toBe(holidays[0].name);
    expect(ws.getCell('C6').value).toBe(weekday(holidays[0].date));
    expect(weekday('2026-11-11')).toBe('Wednesday');
    const texts = ws.getSheetValues().flat().filter((value) => typeof value === 'string').join(' ');
    expect(texts).not.toMatch(/Source: HDFC|2nd and 4th Saturday/);
    expect(readSrc('pages/ledger/bank-holidays.astro')).not.toMatch(/2nd and 4th Saturday/);
  });

  it('warms up on the HDFC home page and sends it as referrer', () => {
    const lib = readSrc('lib/bank-holidays.ts');
    expect(lib).toMatch(/const HDFC_HOME = 'https:\/\/www\.hdfc\.bank\.in\/'/);
    expect(lib).toMatch(/referer: HDFC_HOME/);
  });
});
