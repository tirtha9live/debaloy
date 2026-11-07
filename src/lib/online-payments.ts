import { env } from 'cloudflare:workers';
import { FLATS } from './constants';
import { roundAmount } from './format';
import { createEntry, loadLedger, saveMaintenance } from './ledger';
import { listFlatMobiles, mobileLast4 } from './mobiles';
import { monthInYear, todayIso, type LedgerYear } from './years';

export const PAYMENT_TYPES = ['maintenance', 'dues', 'others'] as const;
export type PaymentType = (typeof PAYMENT_TYPES)[number];
export type PaymentStatus = 'pending' | 'approved';

export type OnlinePayment = {
  id: number;
  yearId: number;
  flatId: string;
  resident: string;
  paymentType: PaymentType;
  description: string;
  amount: number;
  linkAccount: boolean;
  status: PaymentStatus;
  bank: string;
  accountHolder: string;
  appliedMonth: string | null;
  submittedAt: string;
  approvedAt: string | null;
  mobileLast4: string | null;
};

export type LinkedBankAccount = {
  id: number;
  flatId: string;
  bank: string;
  accountHolder: string;
  autoSync: boolean;
  lastUsedAt: string;
};

export type LinkedAccountsByFlat = {
  flatId: string;
  resident: string;
  accounts: LinkedBankAccount[];
};

function db() {
  return (env as Cloudflare.Env).DB;
}

export function paymentTypeLabel(type: PaymentType) {
  if (type === 'maintenance') return 'Maintenance';
  if (type === 'dues') return 'Dues';
  return 'Others';
}

export function asPaymentType(value: FormDataEntryValue | string | null | undefined): PaymentType | null {
  const text = String(value ?? '').trim();
  return PAYMENT_TYPES.includes(text as PaymentType) ? (text as PaymentType) : null;
}

function asPayment(row: {
  id: number;
  year_id: number;
  flat_id: string;
  payment_type: string;
  description: string;
  amount: number;
  link_account: number;
  status: string;
  bank: string;
  account_holder: string;
  applied_month: string | null;
  submitted_at: string;
  approved_at: string | null;
}): OnlinePayment | null {
  const paymentType = asPaymentType(row.payment_type);
  if (!paymentType) return null;
  const flat = FLATS.find((item) => item.id === row.flat_id);
  return {
    id: row.id,
    yearId: row.year_id,
    flatId: row.flat_id,
    resident: flat?.resident ?? row.flat_id,
    paymentType,
    description: row.description ?? '',
    amount: Number(row.amount) || 0,
    linkAccount: Boolean(row.link_account),
    status: row.status === 'approved' ? 'approved' : 'pending',
    bank: row.bank ?? '',
    accountHolder: row.account_holder ?? '',
    appliedMonth: row.applied_month,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    mobileLast4: null,
  };
}

export async function listOnlinePayments(yearId: number, status?: PaymentStatus): Promise<OnlinePayment[]> {
  const database = db();
  const result = status
    ? await database
        .prepare(
          `SELECT id, year_id, flat_id, payment_type, description, amount, link_account, status,
                  bank, account_holder, applied_month, submitted_at, approved_at
           FROM online_payments
           WHERE year_id = ? AND status = ?
           ORDER BY submitted_at DESC, id DESC`,
        )
        .bind(yearId, status)
        .all()
    : await database
        .prepare(
          `SELECT id, year_id, flat_id, payment_type, description, amount, link_account, status,
                  bank, account_holder, applied_month, submitted_at, approved_at
           FROM online_payments
           WHERE year_id = ?
           ORDER BY submitted_at DESC, id DESC`,
        )
        .bind(yearId)
        .all();

  const mobiles = await listFlatMobiles();
  const last4ByFlat = new Map(mobiles.map((row) => [row.flatId, row.last4]));

  return ((result.results ?? []) as Array<Parameters<typeof asPayment>[0]>)
    .map((row) => asPayment(row))
    .filter((row): row is OnlinePayment => Boolean(row))
    .map((row) => ({ ...row, mobileLast4: last4ByFlat.get(row.flatId) ?? null }));
}

export async function getOnlinePayment(id: number): Promise<OnlinePayment | null> {
  const row = await db()
    .prepare(
      `SELECT id, year_id, flat_id, payment_type, description, amount, link_account, status,
              bank, account_holder, applied_month, submitted_at, approved_at
       FROM online_payments WHERE id = ?`,
    )
    .bind(id)
    .first<Parameters<typeof asPayment>[0]>();
  if (!row) return null;
  const parsed = asPayment(row);
  if (!parsed) return null;
  const mobiles = await listFlatMobiles();
  parsed.mobileLast4 = mobiles.find((row) => row.flatId === parsed.flatId)?.last4 ?? mobileLast4(null);
  return parsed;
}

export async function createOnlinePayment(input: {
  yearId: number;
  flatId: string;
  paymentType: PaymentType;
  description: string;
  amount: number;
  linkAccount: boolean;
}) {
  if (!FLATS.some((flat) => flat.id === input.flatId)) return null;
  if (input.amount <= 0) return null;
  const result = await db()
    .prepare(
      `INSERT INTO online_payments (
         year_id, flat_id, payment_type, description, amount, link_account, status, submitted_at
       ) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
    )
    .bind(
      input.yearId,
      input.flatId,
      input.paymentType,
      input.description.trim().slice(0, 240),
      roundAmount(input.amount),
      input.linkAccount ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
  return Number(result.meta.last_row_id) || null;
}

async function rememberBankAccount(
  flatId: string,
  bank: string,
  accountHolder: string,
  autoSync: boolean,
) {
  const database = db();
  const now = new Date().toISOString();
  await database
    .prepare(
      `INSERT INTO flat_bank_accounts (flat_id, bank, account_holder, auto_sync, last_used_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(flat_id, bank, account_holder) DO UPDATE SET
         auto_sync = CASE WHEN excluded.auto_sync = 1 THEN 1 ELSE flat_bank_accounts.auto_sync END,
         last_used_at = excluded.last_used_at`,
    )
    .bind(flatId, bank, accountHolder, autoSync ? 1 : 0, now)
    .run();

  const kept = await database
    .prepare(
      `SELECT id FROM flat_bank_accounts
       WHERE flat_id = ?
       ORDER BY last_used_at DESC, id DESC`,
    )
    .bind(flatId)
    .all<{ id: number }>();
  for (const extra of (kept.results ?? []).slice(3)) {
    await database.prepare('DELETE FROM flat_bank_accounts WHERE id = ?').bind(extra.id).run();
  }
}

export async function listLinkedAccounts(): Promise<LinkedAccountsByFlat[]> {
  const rows = await db()
    .prepare(
      `SELECT id, flat_id, bank, account_holder, auto_sync, last_used_at
       FROM flat_bank_accounts
       ORDER BY last_used_at DESC, id DESC`,
    )
    .all<{
      id: number;
      flat_id: string;
      bank: string;
      account_holder: string;
      auto_sync: number;
      last_used_at: string;
    }>();

  const byFlat = new Map<string, LinkedBankAccount[]>();
  for (const row of rows.results ?? []) {
    const list = byFlat.get(row.flat_id) ?? [];
    if (list.length >= 3) continue;
    list.push({
      id: row.id,
      flatId: row.flat_id,
      bank: row.bank,
      accountHolder: row.account_holder,
      autoSync: Boolean(row.auto_sync),
      lastUsedAt: row.last_used_at,
    });
    byFlat.set(row.flat_id, list);
  }

  return FLATS.map((flat) => ({
    flatId: flat.id,
    resident: flat.resident,
    accounts: byFlat.get(flat.id) ?? [],
  }));
}

export async function approveOnlinePayment(
  year: LedgerYear,
  id: number,
  input: { bank: string; accountHolder: string; month?: string | null },
) {
  const payment = await getOnlinePayment(id);
  if (!payment || payment.status !== 'pending' || payment.yearId !== year.id) {
    return { ok: false as const, reason: 'missing' };
  }

  const bank = input.bank.trim().slice(0, 80);
  const accountHolder = input.accountHolder.trim().slice(0, 80);
  if (!bank || !accountHolder) return { ok: false as const, reason: 'bank' };

  let appliedMonth = input.month?.trim() || null;
  if (payment.paymentType === 'maintenance') {
    if (!appliedMonth || !monthInYear(appliedMonth, year)) {
      return { ok: false as const, reason: 'month' };
    }
  } else {
    appliedMonth = null;
  }

  const snapshot = await loadLedger(year);
  if (payment.paymentType === 'maintenance' && appliedMonth) {
    const row = snapshot.maintenance.find((item) => item.flatId === payment.flatId);
    const prev = row?.months[appliedMonth];
    const nextAmount = roundAmount((prev?.amount ?? 0) + payment.amount);
    await saveMaintenance([
      { flatId: payment.flatId, month: appliedMonth, amount: nextAmount, mode: 'Bank', npr: false },
    ]);
  } else {
    const category = payment.paymentType === 'dues' ? 'Outstanding Dues' : 'Other Income';
    const note = [
      `Flat ${payment.flatId} ${payment.resident}`,
      payment.description.trim(),
      bank,
      accountHolder,
    ]
      .filter(Boolean)
      .join(' · ')
      .slice(0, 240);
    await createEntry({
      kind: 'income',
      date: todayIso(),
      category,
      description: note,
      mode: 'Bank',
      amount: payment.amount,
    });
  }

  await rememberBankAccount(payment.flatId, bank, accountHolder, payment.linkAccount);
  await db()
    .prepare(
      `UPDATE online_payments
       SET status = 'approved', bank = ?, account_holder = ?, applied_month = ?, approved_at = ?
       WHERE id = ? AND status = 'pending'`,
    )
    .bind(bank, accountHolder, appliedMonth, new Date().toISOString(), id)
    .run();

  return { ok: true as const, payment, bank, accountHolder, appliedMonth };
}
