import { env } from 'cloudflare:workers';
import { FLATS, HANDOVER_CLOSING_BANK, HANDOVER_CLOSING_CASH } from './constants';
import { roundAmount } from './format';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export type LedgerYear = {
  id: number;
  label: string;
  startDate: string;
  endDate: string | null;
  openingCash: number;
  openingBank: number;
  cashInHand: number | null;
  cashInBank: number | null;
  cashInHandOverride: boolean;
  cashInBankOverride: boolean;
};

function db() {
  return (env as Cloudflare.Env).DB;
}

export function todayIso(timeZone = 'Asia/Kolkata') {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function addDays(iso: string, days: number) {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function yearLabel(startDate: string, endDate: string | null) {
  const startYear = Number(startDate.slice(0, 4));
  const endYear = endDate ? Number(endDate.slice(0, 4)) : startDate.slice(5, 7) >= '09' ? startYear + 1 : startYear;
  if (endYear <= startYear) return `FY ${startYear}`;
  return `FY ${startYear}-${String(endYear).slice(-2)}`;
}

export function monthKeyFromIso(iso: string) {
  const month = Number(iso.slice(5, 7));
  return `${MONTH_NAMES[month - 1]}-${iso.slice(2, 4)}`;
}

export function monthStartIso(key: string) {
  const match = key.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAMES.indexOf(match[1] as (typeof MONTH_NAMES)[number]) + 1;
  const year = 2000 + Number(match[2]);
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

export function monthsForYear(startDate: string, endDate: string | null, today = todayIso()) {
  let start = `${startDate.slice(0, 7)}-01`;
  if (start < startDate) start = addMonthsIso(start, 1);
  let last = endDate ? `${endDate.slice(0, 7)}-01` : `${today.slice(0, 7)}-01`;
  if (endDate && last > endDate) last = addMonthsIso(last, -1);
  if (!endDate) {
    const fourteen = addMonthsIso(start, 13);
    const ahead = addMonthsIso(`${today.slice(0, 7)}-01`, 2);
    if (fourteen > last) last = fourteen;
    if (ahead > last) last = ahead;
  }
  const months: string[] = [];
  let cursor = start;
  while (cursor <= last && months.length < 24) {
    months.push(monthKeyFromIso(cursor));
    cursor = addMonthsIso(cursor, 1);
  }
  return months;
}

function addMonthsIso(iso: string, count: number) {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const date = new Date(Date.UTC(year, month - 1 + count, 1));
  return date.toISOString().slice(0, 10);
}

export function dateInYear(date: string | null, year: LedgerYear) {
  if (!date) return year.endDate == null;
  if (date < year.startDate) return false;
  if (year.endDate && date > year.endDate) return false;
  return true;
}

export function monthInYear(monthKey: string, year: LedgerYear) {
  const start = monthStartIso(monthKey);
  if (!start) return false;
  return dateInYear(start, year);
}

function asYear(row: {
  id: number;
  label: string;
  start_date: string;
  end_date: string | null;
  opening_cash: number;
  opening_bank: number;
  cash_in_hand: number | null;
  cash_in_bank: number | null;
  cash_in_hand_override: number;
  cash_in_bank_override: number;
}): LedgerYear {
  return {
    id: row.id,
    label: row.label,
    startDate: row.start_date,
    endDate: row.end_date,
    openingCash: Number(row.opening_cash) || 0,
    openingBank: Number(row.opening_bank) || 0,
    cashInHand: row.cash_in_hand == null ? null : Number(row.cash_in_hand),
    cashInBank: row.cash_in_bank == null ? null : Number(row.cash_in_bank),
    cashInHandOverride: Boolean(row.cash_in_hand_override),
    cashInBankOverride: Boolean(row.cash_in_bank_override),
  };
}

export async function listYears(): Promise<LedgerYear[]> {
  const rows = await db()
    .prepare(
      `SELECT id, label, start_date, end_date, opening_cash, opening_bank,
              cash_in_hand, cash_in_bank, cash_in_hand_override, cash_in_bank_override
       FROM ledger_years
       ORDER BY start_date, id`,
    )
    .all<{
      id: number;
      label: string;
      start_date: string;
      end_date: string | null;
      opening_cash: number;
      opening_bank: number;
      cash_in_hand: number | null;
      cash_in_bank: number | null;
      cash_in_hand_override: number;
      cash_in_bank_override: number;
    }>();
  return (rows.results ?? []).map(asYear);
}

export async function currentYear(): Promise<LedgerYear> {
  const years = await listYears();
  const year = years.find((item) => item.endDate == null) ?? years[years.length - 1];
  if (!year) throw new Error('No ledger year is set up.');
  return year;
}

export async function getYear(id: number): Promise<LedgerYear | null> {
  const years = await listYears();
  return years.find((year) => year.id === id) ?? null;
}

export function resolveYear(years: LedgerYear[], requestedId: number | null) {
  const current = years.find((year) => year.endDate == null) ?? years[years.length - 1];
  if (!current) throw new Error('No ledger year is set up.');
  if (!requestedId) return current;
  return years.find((year) => year.id === requestedId) ?? current;
}

export function nextYearStart(endDate: string) {
  return addDays(endDate, 1);
}

function lastUpdatedStatement() {
  return db()
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('last_updated_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(new Date().toISOString());
}

export async function closeCurrentYear(meetingDate: string, closing: { cash: number; bank: number }) {
  const years = await listYears();
  const current = years.find((year) => year.endDate == null);
  if (!current) throw new Error('There is no open year to close.');
  if (meetingDate < current.startDate) {
    throw new Error('The meeting date cannot be before this year started.');
  }
  const start = nextYearStart(meetingDate);
  const nextLabel = yearLabel(start, null);
  const closedLabel = yearLabel(current.startDate, meetingDate);
  const database = db();
  await database.batch([
    database
      .prepare(
        `UPDATE ledger_years
         SET end_date = ?, label = ?, cash_in_hand_override = 0, cash_in_bank_override = 0
         WHERE id = ?`,
      )
      .bind(meetingDate, closedLabel, current.id),
    database
      .prepare(
        `INSERT INTO ledger_years (
           label, start_date, end_date, opening_cash, opening_bank,
           cash_in_hand_override, cash_in_bank_override
         ) VALUES (?, ?, NULL, ?, ?, 0, 0)`,
      )
      .bind(nextLabel, start, roundAmount(closing.cash), roundAmount(closing.bank)),
    lastUpdatedStatement(),
  ]);
  const created = await database
    .prepare('SELECT id FROM ledger_years WHERE start_date = ? ORDER BY id DESC LIMIT 1')
    .bind(start)
    .first<{ id: number }>();
  if (created) {
    await database.batch(
      FLATS.map((flat) =>
        database
          .prepare('INSERT OR IGNORE INTO puja (flat_id, year_id, amount) VALUES (?, ?, 0)')
          .bind(flat.id, created.id),
      ),
    );
  }
  return created?.id ?? 0;
}

export async function updateYearEnd(yearId: number, meetingDate: string, closing: { cash: number; bank: number }) {
  const years = await listYears();
  const index = years.findIndex((year) => year.id === yearId);
  const year = years[index];
  const next = years[index + 1];
  if (!year?.endDate) throw new Error('Only a closed year has a freeze date.');
  if (!next) throw new Error('There is no following year to adjust.');
  if (meetingDate < year.startDate) {
    throw new Error('The meeting date cannot be before this year started.');
  }
  if (next.endDate && meetingDate >= next.endDate) {
    throw new Error('The meeting date must stay before the next year ends.');
  }
  const start = nextYearStart(meetingDate);
  const database = db();
  await database.batch([
    database
      .prepare(
        `UPDATE ledger_years
         SET end_date = ?, label = ?, cash_in_hand_override = 0, cash_in_bank_override = 0
         WHERE id = ?`,
      )
      .bind(meetingDate, yearLabel(year.startDate, meetingDate), year.id),
    database
      .prepare(
        `UPDATE ledger_years
         SET start_date = ?, label = ?, opening_cash = ?, opening_bank = ?,
             cash_in_hand_override = 0, cash_in_bank_override = 0
         WHERE id = ?`,
      )
      .bind(start, yearLabel(start, next.endDate), roundAmount(closing.cash), roundAmount(closing.bank), next.id),
    lastUpdatedStatement(),
  ]);
}

export async function saveYearClosing(
  yearId: number,
  field: 'cash_in_hand' | 'cash_in_bank',
  submitted: number,
  computed: number,
) {
  const equal = roundAmount(submitted) === roundAmount(computed);
  const overrideColumn = field === 'cash_in_hand' ? 'cash_in_hand_override' : 'cash_in_bank_override';
  const valueColumn = field === 'cash_in_hand' ? 'cash_in_hand' : 'cash_in_bank';
  if (equal) {
    await db()
      .prepare(`UPDATE ledger_years SET ${overrideColumn} = 0 WHERE id = ?`)
      .bind(yearId)
      .run();
    return;
  }
  await db()
    .prepare(`UPDATE ledger_years SET ${valueColumn} = ?, ${overrideColumn} = 1 WHERE id = ?`)
    .bind(submitted, yearId)
    .run();
}

export async function clearYearClosingOverride(yearId: number, field: 'cash_in_hand' | 'cash_in_bank') {
  const overrideColumn = field === 'cash_in_hand' ? 'cash_in_hand_override' : 'cash_in_bank_override';
  await db().prepare(`UPDATE ledger_years SET ${overrideColumn} = 0 WHERE id = ?`).bind(yearId).run();
}

export { HANDOVER_CLOSING_BANK, HANDOVER_CLOSING_CASH };
