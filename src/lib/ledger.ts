import { env } from 'cloudflare:workers';
import {
  EXPENSE_TYPES,
  FLATS,
  INCOME_TYPES,
  type CategoryKind,
  type PayMode,
} from './constants';
import { roundAmount } from './format';
import {
  currentYear,
  dateInYear,
  getYear,
  monthsForYear,
  saveYearClosing,
  clearYearClosingOverride,
  type LedgerYear,
} from './years';

export type MaintenanceCell = {
  amount: number | null;
  mode: PayMode;
};

export type MaintenanceRow = {
  flatId: string;
  resident: string;
  months: Record<string, MaintenanceCell>;
  totalBank: number;
  totalCash: number;
  total: number;
};

export type LedgerEntry = {
  id: number;
  kind: CategoryKind;
  date: string | null;
  category: string;
  description: string;
  mode: PayMode;
  amount: number;
};

export type Withdrawal = {
  id: number;
  date: string | null;
  amount: number;
  note: string;
};

export type LedgerCategory = {
  id: number;
  kind: CategoryKind;
  name: string;
  sortOrder: number;
  isBuiltin: boolean;
};

export type LedgerSnapshot = {
  year: LedgerYear;
  months: string[];
  maintenance: MaintenanceRow[];
  maintenanceTotals: {
    months: Record<string, number>;
    bank: number;
    cash: number;
    grand: number;
  };
  puja: Array<{ flatId: string; resident: string; amount: number }>;
  pujaTotal: number;
  categories: LedgerCategory[];
  entries: LedgerEntry[];
  withdrawals: Withdrawal[];
  withdrawalsTotal: number;
  cashInHand: number;
  cashInBank: number;
  computedCashInHand: number;
  computedCashInBank: number;
  cashInHandOverride: boolean;
  cashInBankOverride: boolean;
  lastUpdatedAt: string | null;
};

export type RpLine = {
  receiptLabel: string;
  receiptAmount: number | null;
  receiptSection?: boolean;
  paymentLabel: string;
  paymentAmount: number | null;
  paymentSection?: boolean;
  paymentEditable?: boolean;
  paymentField?: 'cash_in_hand' | 'cash_in_bank';
};

function db() {
  return (env as Cloudflare.Env).DB;
}

function asMode(value: string | null | undefined): PayMode {
  return value === 'Bank' ? 'Bank' : 'Cash';
}

function sumByCategory(entries: LedgerEntry[], kind: CategoryKind, name: string): number {
  if (!name) return 0;
  return entries
    .filter((entry) => entry.kind === kind && entry.category === name)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function sumByMode(entries: LedgerEntry[], kind: CategoryKind, mode: PayMode): number {
  return entries
    .filter((entry) => entry.kind === kind && entry.mode === mode)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function computeClosingBalances(input: {
  openingCash: number;
  openingBank: number;
  cashMaintenance: number;
  bankMaintenance: number;
  pujaTotal: number;
  entries: LedgerEntry[];
  withdrawalsTotal?: number;
}) {
  const withdrawalsTotal = input.withdrawalsTotal ?? 0;
  return {
    cashInHand: roundAmount(
      input.openingCash +
        input.cashMaintenance +
        input.pujaTotal +
        sumByMode(input.entries, 'income', 'Cash') -
        sumByMode(input.entries, 'expense', 'Cash') +
        withdrawalsTotal,
    ),
    cashInBank: roundAmount(
      input.openingBank +
        input.bankMaintenance +
        sumByMode(input.entries, 'income', 'Bank') -
        sumByMode(input.entries, 'expense', 'Bank') -
        withdrawalsTotal,
    ),
  };
}

export async function loadLedger(selectedYear?: LedgerYear): Promise<LedgerSnapshot> {
  const year = selectedYear ?? (await currentYear());
  const months = monthsForYear(year.startDate, year.endDate);
  const database = db();
  const [maintenanceRows, pujaRows, categoryRows, entryRows, withdrawalRows] = await database.batch([
    database.prepare(
      'SELECT flat_id, month, amount, mode FROM maintenance ORDER BY flat_id, month',
    ),
    database.prepare('SELECT flat_id, amount FROM puja WHERE year_id = ?').bind(year.id),
    database.prepare(
      'SELECT id, kind, name, sort_order, is_builtin FROM categories ORDER BY kind, sort_order, id',
    ),
    database.prepare(
      'SELECT id, kind, date, category, description, mode, amount FROM entries ORDER BY date IS NULL, date, id',
    ),
    database.prepare(
      'SELECT id, date, amount, note FROM withdrawals ORDER BY date IS NULL, date, id',
    ),
  ]);

  const cells = new Map<string, MaintenanceCell>();
  for (const row of (maintenanceRows.results ?? []) as Array<{
    flat_id: string;
    month: string;
    amount: number | null;
    mode: string;
  }>) {
    cells.set(`${row.flat_id}:${row.month}`, {
      amount: row.amount == null ? null : Number(row.amount),
      mode: asMode(row.mode),
    });
  }

  const pujaMap = new Map<string, number>();
  for (const row of (pujaRows.results ?? []) as Array<{ flat_id: string; amount: number }>) {
    pujaMap.set(row.flat_id, Number(row.amount) || 0);
  }

  const maintenance: MaintenanceRow[] = FLATS.map((flat) => {
    const monthCells: Record<string, MaintenanceCell> = {};
    let totalBank = 0;
    let totalCash = 0;
    for (const month of months) {
      const cell = cells.get(`${flat.id}:${month}`) ?? { amount: null, mode: 'Cash' as const };
      monthCells[month] = cell;
      const amount = cell.amount ?? 0;
      if (cell.mode === 'Bank') totalBank += amount;
      else totalCash += amount;
    }
    return {
      flatId: flat.id,
      resident: flat.resident,
      months: monthCells,
      totalBank,
      totalCash,
      total: totalBank + totalCash,
    };
  });

  const monthTotals: Record<string, number> = {};
  for (const month of months) {
    monthTotals[month] = maintenance.reduce((sum, row) => sum + (row.months[month].amount ?? 0), 0);
  }

  const puja = FLATS.map((flat) => ({
    flatId: flat.id,
    resident: flat.resident,
    amount: pujaMap.get(flat.id) ?? 0,
  }));

  const categories = ((categoryRows.results ?? []) as Array<{
    id: number;
    kind: CategoryKind;
    name: string;
    sort_order: number;
    is_builtin: number;
  }>).map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name ?? '',
    sortOrder: row.sort_order,
    isBuiltin: Boolean(row.is_builtin),
  }));

  const entries = ((entryRows.results ?? []) as Array<{
    id: number;
    kind: CategoryKind;
    date: string | null;
    category: string;
    description: string | null;
    mode: string;
    amount: number;
  }>)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      date: row.date,
      category: row.category,
      description: row.description ?? '',
      mode: asMode(row.mode),
      amount: Number(row.amount) || 0,
    }))
    .filter((entry) => dateInYear(entry.date, year));

  const withdrawals = ((withdrawalRows.results ?? []) as Array<{
    id: number;
    date: string | null;
    amount: number;
    note: string | null;
  }>)
    .map((row) => ({
      id: row.id,
      date: row.date,
      amount: Number(row.amount) || 0,
      note: row.note ?? '',
    }))
    .filter((row) => dateInYear(row.date, year));
  const withdrawalsTotal = withdrawals.reduce((sum, row) => sum + row.amount, 0);

  const maintenanceTotals = {
    months: monthTotals,
    bank: maintenance.reduce((sum, row) => sum + row.totalBank, 0),
    cash: maintenance.reduce((sum, row) => sum + row.totalCash, 0),
    grand: maintenance.reduce((sum, row) => sum + row.total, 0),
  };
  const pujaTotal = puja.reduce((sum, row) => sum + row.amount, 0);
  const computed = computeClosingBalances({
    openingCash: year.openingCash,
    openingBank: year.openingBank,
    cashMaintenance: maintenanceTotals.cash,
    bankMaintenance: maintenanceTotals.bank,
    pujaTotal,
    entries,
    withdrawalsTotal,
  });

  return {
    year,
    months,
    maintenance,
    maintenanceTotals,
    puja,
    pujaTotal,
    categories,
    entries,
    withdrawals,
    withdrawalsTotal,
    computedCashInHand: computed.cashInHand,
    computedCashInBank: computed.cashInBank,
    cashInHandOverride: year.cashInHandOverride,
    cashInBankOverride: year.cashInBankOverride,
    cashInHand: year.cashInHandOverride ? Number(year.cashInHand ?? 0) || 0 : computed.cashInHand,
    cashInBank: year.cashInBankOverride ? Number(year.cashInBank ?? 0) || 0 : computed.cashInBank,
    lastUpdatedAt: await getLastUpdatedAt(),
  };
}

function lastUpdatedStatement(database: D1Database) {
  return database
    .prepare(
      `INSERT INTO settings (key, value) VALUES ('last_updated_at', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .bind(new Date().toISOString());
}

export async function getLastUpdatedAt(): Promise<string | null> {
  const row = await db()
    .prepare(`SELECT value FROM settings WHERE key = 'last_updated_at'`)
    .first<{ value: string }>();
  return row?.value ?? null;
}

export function namedCategories(snapshot: LedgerSnapshot, kind: CategoryKind): LedgerCategory[] {
  return snapshot.categories.filter((category) => category.kind === kind && category.name.trim());
}

export function categoryTotals(snapshot: LedgerSnapshot, kind: CategoryKind) {
  return namedCategories(snapshot, kind).map((category) => ({
    ...category,
    total: sumByCategory(snapshot.entries, kind, category.name.trim()),
  }));
}

export function buildReceiptsPayments(snapshot: LedgerSnapshot): {
  lines: RpLine[];
  receiptTotal: number;
  paymentTotal: number;
} {
  const incomeExtra = namedCategories(snapshot, 'income').filter((category) => !category.isBuiltin);
  const expenseExtra = namedCategories(snapshot, 'expense').filter((category) => !category.isBuiltin);

  const income = (name: string) => sumByCategory(snapshot.entries, 'income', name);
  const expense = (name: string) => sumByCategory(snapshot.entries, 'expense', name);

  const lines: RpLine[] = [
    {
      receiptLabel: 'Opening Balances',
      receiptAmount: null,
      receiptSection: true,
      paymentLabel: 'Operating Expenses',
      paymentAmount: null,
      paymentSection: true,
    },
    {
      receiptLabel: '  Bank Balance (Brought Forward)',
      receiptAmount: snapshot.year.openingBank,
      paymentLabel: "  Sweeper's Salary with Bonus",
      paymentAmount: expense("Sweeper's Salary with Bonus"),
    },
    {
      receiptLabel: '  Cash Balance (Brought Forward)',
      receiptAmount: snapshot.year.openingCash,
      paymentLabel: '  Lift Maintenance Contract Renewal',
      paymentAmount: expense('Lift Maintenance Contract Renewal'),
    },
    {
      receiptLabel: 'Maintenance',
      receiptAmount: null,
      receiptSection: true,
      paymentLabel: '  Electricity Bill',
      paymentAmount: expense('Electricity Bill'),
    },
    {
      receiptLabel: '  Maintenance (Bank)',
      receiptAmount: snapshot.maintenanceTotals.bank,
      paymentLabel: '  Water Tank Cleaning Charges',
      paymentAmount: expense('Water Tank Cleaning Charges'),
    },
    {
      receiptLabel: '  Maintenance (Cash)',
      receiptAmount: snapshot.maintenanceTotals.cash,
      paymentLabel: '  Electrical Maintenance',
      paymentAmount: expense('Electrical Maintenance'),
    },
    {
      receiptLabel: 'Puja & Festival Collections',
      receiptAmount: null,
      receiptSection: true,
      paymentLabel: '  Printing & Stationery',
      paymentAmount: expense('Printing & Stationery'),
    },
    {
      receiptLabel: '  Puja Contribution (residents)',
      receiptAmount: snapshot.pujaTotal,
      paymentLabel: '  Donation for Durga Puja & Kali Puja',
      paymentAmount: expense('Donation for Durga Puja & Kali Puja'),
    },
    {
      receiptLabel: '  Special Donation (external)',
      receiptAmount: income('Special Donation'),
      paymentLabel: 'Infrastructure & Safety',
      paymentAmount: null,
      paymentSection: true,
    },
    {
      receiptLabel: 'Other Income',
      receiptAmount: null,
      receiptSection: true,
      paymentLabel: '  Fire Extinguisher Install & Refilling',
      paymentAmount: expense('Fire Extinguisher Installation & Refilling'),
    },
    {
      receiptLabel: '  Bank Interest',
      receiptAmount: income('Bank Interest'),
      paymentLabel: '  New Water Pump Installation',
      paymentAmount: expense('New Water Pump Installation'),
    },
    {
      receiptLabel: '  Outstanding Dues',
      receiptAmount: income('Outstanding Dues'),
      paymentLabel: '  Septic Tank Cleaning & SDDM',
      paymentAmount: expense('Septic Tank Cleaning & Other SDDM Charges'),
    },
    {
      receiptLabel: '  Other Income',
      receiptAmount: income('Other Income'),
      paymentLabel: 'Miscellaneous',
      paymentAmount: null,
      paymentSection: true,
    },
  ];

  const miscExpenses = [
    'General Charges',
    'Miscellaneous Expenses',
    'Building Maintenance',
    'Bank Charges',
    'Other Expenses',
  ] as const;
  miscExpenses.forEach((misc, index) => {
    const extra = incomeExtra[index];
    lines.push({
      receiptLabel: extra ? `  ${extra.name}` : '',
      receiptAmount: extra ? income(extra.name) : null,
      paymentLabel: `  ${misc}`,
      paymentAmount: expense(misc),
    });
  });

  const leftoverIncome = incomeExtra.slice(miscExpenses.length);
  const extraCount = Math.max(leftoverIncome.length, expenseExtra.length);
  for (let i = 0; i < extraCount; i += 1) {
    const extraIncome = leftoverIncome[i];
    const extraExpense = expenseExtra[i];
    lines.push({
      receiptLabel: extraIncome ? `  ${extraIncome.name}` : '',
      receiptAmount: extraIncome ? income(extraIncome.name) : null,
      paymentLabel: extraExpense ? `  ${extraExpense.name}` : '',
      paymentAmount: extraExpense ? expense(extraExpense.name) : null,
    });
  }

  lines.push({
    receiptLabel: '',
    receiptAmount: null,
    paymentLabel: 'Closing Balances',
    paymentAmount: null,
    paymentSection: true,
  });
  lines.push({
    receiptLabel: '',
    receiptAmount: null,
    paymentLabel: '  Cash in Hand',
    paymentAmount: snapshot.cashInHand,
    paymentEditable: true,
    paymentField: 'cash_in_hand',
  });
  lines.push({
    receiptLabel: '',
    receiptAmount: null,
    paymentLabel: '  Cash in Bank',
    paymentAmount: snapshot.cashInBank,
    paymentEditable: true,
    paymentField: 'cash_in_bank',
  });

  const receiptTotal = lines.reduce((sum, line) => sum + (line.receiptAmount ?? 0), 0);
  const paymentTotal = lines.reduce((sum, line) => sum + (line.paymentAmount ?? 0), 0);

  return { lines, receiptTotal, paymentTotal };
}

export async function saveMaintenance(
  updates: Array<{ flatId: string; month: string; amount: number | null; mode: PayMode }>,
) {
  const database = db();
  const statements = updates.map((update) =>
    database
      .prepare(
        `INSERT INTO maintenance (flat_id, month, amount, mode)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(flat_id, month) DO UPDATE SET amount = excluded.amount, mode = excluded.mode`,
      )
      .bind(update.flatId, update.month, update.amount, update.mode),
  );
  if (statements.length) await database.batch([...statements, lastUpdatedStatement(database)]);
}

export async function savePuja(yearId: number, updates: Array<{ flatId: string; amount: number }>) {
  const database = db();
  const statements = updates.map((update) =>
    database
      .prepare(
        `INSERT INTO puja (flat_id, year_id, amount)
         VALUES (?, ?, ?)
         ON CONFLICT(flat_id, year_id) DO UPDATE SET amount = excluded.amount`,
      )
      .bind(update.flatId, yearId, update.amount),
  );
  if (statements.length) await database.batch([...statements, lastUpdatedStatement(database)]);
}

export async function createEntry(entry: Omit<LedgerEntry, 'id'>) {
  const database = db();
  await database.batch([
    database
      .prepare(
        `INSERT INTO entries (kind, date, category, description, mode, amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(entry.kind, entry.date, entry.category, entry.description, entry.mode, entry.amount),
    lastUpdatedStatement(database),
  ]);
}

export async function updateEntry(entry: LedgerEntry) {
  const database = db();
  await database.batch([
    database
      .prepare(
        `UPDATE entries
         SET date = ?, category = ?, description = ?, mode = ?, amount = ?
         WHERE id = ? AND kind = ?`,
      )
      .bind(entry.date, entry.category, entry.description, entry.mode, entry.amount, entry.id, entry.kind),
    lastUpdatedStatement(database),
  ]);
}

export async function deleteEntry(id: number, kind: CategoryKind) {
  const database = db();
  await database.batch([
    database.prepare('DELETE FROM entries WHERE id = ? AND kind = ?').bind(id, kind),
    lastUpdatedStatement(database),
  ]);
}

export async function createWithdrawal(row: Omit<Withdrawal, 'id'>) {
  if (row.amount <= 0) return;
  const database = db();
  await database.batch([
    database
      .prepare('INSERT INTO withdrawals (date, amount, note) VALUES (?, ?, ?)')
      .bind(row.date, row.amount, row.note),
    lastUpdatedStatement(database),
  ]);
}

export async function updateWithdrawal(row: Withdrawal) {
  if (row.amount <= 0) return;
  const database = db();
  await database.batch([
    database
      .prepare('UPDATE withdrawals SET date = ?, amount = ?, note = ? WHERE id = ?')
      .bind(row.date, row.amount, row.note, row.id),
    lastUpdatedStatement(database),
  ]);
}

export async function deleteWithdrawal(id: number) {
  const database = db();
  await database.batch([
    database.prepare('DELETE FROM withdrawals WHERE id = ?').bind(id),
    lastUpdatedStatement(database),
  ]);
}

export async function renameCategory(id: number, name: string, kind: CategoryKind) {
  const database = db();
  await database.batch([
    database
      .prepare('UPDATE categories SET name = ? WHERE id = ? AND kind = ? AND is_builtin = 0')
      .bind(name, id, kind),
    lastUpdatedStatement(database),
  ]);
}

export async function createCategory(kind: CategoryKind, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;

  const database = db();
  const duplicate = await database
    .prepare('SELECT id FROM categories WHERE kind = ? AND lower(trim(name)) = lower(?)')
    .bind(kind, trimmed)
    .first();
  if (duplicate) return;

  const empty = await database
    .prepare(
      `SELECT id FROM categories
       WHERE kind = ? AND is_builtin = 0 AND trim(name) = ''
       ORDER BY sort_order, id
       LIMIT 1`,
    )
    .bind(kind)
    .first<{ id: number }>();
  if (empty) {
    await renameCategory(empty.id, trimmed, kind);
    return;
  }

  const max = await database
    .prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories WHERE kind = ?')
    .bind(kind)
    .first<{ max_order: number }>();
  await database.batch([
    database
      .prepare('INSERT INTO categories (kind, name, sort_order, is_builtin) VALUES (?, ?, ?, 0)')
      .bind(kind, trimmed, (max?.max_order ?? 0) + 1),
    lastUpdatedStatement(database),
  ]);
}

export async function saveClosingBalances(yearId: number, cashInHand: number, cashInBank: number) {
  const year = (await getYear(yearId)) ?? (await currentYear());
  const snapshot = await loadLedger(year);
  await saveYearClosing(yearId, 'cash_in_hand', cashInHand, snapshot.computedCashInHand);
  await saveYearClosing(yearId, 'cash_in_bank', cashInBank, snapshot.computedCashInBank);
  const database = db();
  await database.batch([lastUpdatedStatement(database)]);
}

export async function clearClosingOverride(yearId: number, field: 'cash_in_hand' | 'cash_in_bank') {
  await clearYearClosingOverride(yearId, field);
  const database = db();
  await database.batch([lastUpdatedStatement(database)]);
}

export function emptyEntry(kind: CategoryKind): Omit<LedgerEntry, 'id'> {
  return {
    kind,
    date: new Date().toISOString().slice(0, 10),
    category: kind === 'income' ? INCOME_TYPES[0] : EXPENSE_TYPES[0],
    description: '',
    mode: 'Bank',
    amount: 0,
  };
}
