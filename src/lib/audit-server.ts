import type { Session } from './auth';
import { FLATS, type CategoryKind, type PayMode } from './constants';
import { displayDate, formatAmount, roundAmount } from './format';
import { loadLedger, type LedgerEntry, type Withdrawal } from './ledger';
import { recordLedgerAudit } from './activity';
import type { LedgerYear } from './years';
import type { AuditChange } from './audit';

function auditAmount(value: number | null | undefined) {
  if (value == null) return '—';
  return formatAmount(value) || '0.00';
}

function auditText(value: string | null | undefined) {
  const text = (value ?? '').trim();
  return text || '—';
}

function amountsSame(a: number | null | undefined, b: number | null | undefined) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return roundAmount(a) === roundAmount(b);
}

export async function publishLedgerAudit(
  session: Session,
  request: Request,
  sheet: string,
  changes: AuditChange[],
) {
  if (!changes.length) return;
  await recordLedgerAudit(session, request, sheet, changes);
}

export async function auditMaintenanceSave(
  session: Session,
  request: Request,
  year: LedgerYear,
  updates: Array<{ flatId: string; month: string; amount: number | null; mode: PayMode }>,
) {
  const snapshot = await loadLedger(year);
  const residentByFlat = new Map(FLATS.map((flat) => [flat.id, flat.resident]));
  const byFlat = new Map(snapshot.maintenance.map((row) => [row.flatId, row]));
  const changes: AuditChange[] = [];

  for (const update of updates) {
    const row = byFlat.get(update.flatId);
    const prev = row?.months[update.month] ?? { amount: null, mode: 'Cash' as const };
    const amountSame = amountsSame(prev.amount, update.amount);
    const modeSame = prev.mode === update.mode;
    if (amountSame && modeSame) continue;
    const who = residentByFlat.get(update.flatId) ?? update.flatId;
    if (!amountSame) {
      changes.push({
        label: `${who} · ${update.month}`,
        from: auditAmount(prev.amount),
        to: auditAmount(update.amount),
      });
    }
    if (!modeSame) {
      changes.push({
        label: `${who} · ${update.month} · mode`,
        from: prev.mode,
        to: update.mode,
      });
    }
  }

  return changes;
}

export async function auditPujaSave(
  session: Session,
  request: Request,
  year: LedgerYear,
  updates: Array<{ flatId: string; amount: number }>,
) {
  const snapshot = await loadLedger(year);
  const residentByFlat = new Map(FLATS.map((flat) => [flat.id, flat.resident]));
  const byFlat = new Map(snapshot.puja.map((row) => [row.flatId, row.amount]));
  const changes: AuditChange[] = [];

  for (const update of updates) {
    const prev = byFlat.get(update.flatId) ?? 0;
    if (roundAmount(prev) === roundAmount(update.amount)) continue;
    const who = residentByFlat.get(update.flatId) ?? update.flatId;
    changes.push({
      label: `${who} · Puja`,
      from: prev ? auditAmount(prev) : '—',
      to: auditAmount(update.amount),
    });
  }

  return changes;
}

function withdrawalLabel(row: Pick<Withdrawal, 'date' | 'amount' | 'note'>) {
  const note = row.note.trim();
  return note || displayDate(row.date) || 'Withdrawal';
}

export function withdrawalCreateAudit(
  row: { date: string | null; amount: number; note: string },
): AuditChange[] {
  return [
    {
      label: withdrawalLabel(row),
      from: '—',
      to: `${displayDate(row.date)} · ${auditAmount(row.amount)}`,
    },
  ];
}

export async function auditWithdrawalUpdate(
  session: Session,
  request: Request,
  year: LedgerYear,
  id: number,
  next: { date: string | null; amount: number; note: string },
) {
  const snapshot = await loadLedger(year);
  const prev = snapshot.withdrawals.find((row) => row.id === id);
  if (!prev) return [];
  const changes: AuditChange[] = [];
  if (prev.date !== next.date) {
    changes.push({
      label: `${withdrawalLabel(prev)} · date`,
      from: displayDate(prev.date),
      to: displayDate(next.date),
    });
  }
  if (!amountsSame(prev.amount, next.amount)) {
    changes.push({
      label: withdrawalLabel(prev),
      from: auditAmount(prev.amount),
      to: auditAmount(next.amount),
    });
  }
  if (prev.note.trim() !== next.note.trim()) {
    changes.push({
      label: `${withdrawalLabel(prev)} · note`,
      from: auditText(prev.note),
      to: auditText(next.note),
    });
  }
  return changes;
}

export async function auditWithdrawalDelete(
  session: Session,
  request: Request,
  year: LedgerYear,
  id: number,
) {
  const snapshot = await loadLedger(year);
  const prev = snapshot.withdrawals.find((row) => row.id === id);
  if (!prev) return [];
  return [
    {
      label: withdrawalLabel(prev),
      from: `${displayDate(prev.date)} · ${auditAmount(prev.amount)}`,
      to: 'removed',
    },
  ];
}

function entryLabel(entry: Pick<LedgerEntry, 'category' | 'description'>) {
  return entry.description.trim() || entry.category || 'Entry';
}

export function entryCreateAudit(entry: Omit<LedgerEntry, 'id'>): AuditChange[] {
  return [
    {
      label: entryLabel(entry),
      from: '—',
      to: `${auditAmount(entry.amount)} · ${entry.mode}`,
    },
  ];
}

export async function auditEntryUpdate(
  session: Session,
  request: Request,
  year: LedgerYear,
  kind: CategoryKind,
  id: number,
  next: Omit<LedgerEntry, 'id'>,
) {
  const snapshot = await loadLedger(year);
  const prev = snapshot.entries.find((row) => row.id === id && row.kind === kind);
  if (!prev) return [];
  const changes: AuditChange[] = [];
  if (prev.date !== next.date) {
    changes.push({
      label: `${entryLabel(prev)} · date`,
      from: displayDate(prev.date),
      to: displayDate(next.date),
    });
  }
  if (prev.category !== next.category) {
    changes.push({
      label: `${entryLabel(prev)} · category`,
      from: auditText(prev.category),
      to: auditText(next.category),
    });
  }
  if (prev.description.trim() !== next.description.trim()) {
    changes.push({
      label: `${entryLabel(prev)} · description`,
      from: auditText(prev.description),
      to: auditText(next.description),
    });
  }
  if (prev.mode !== next.mode) {
    changes.push({
      label: `${entryLabel(prev)} · mode`,
      from: prev.mode,
      to: next.mode,
    });
  }
  if (!amountsSame(prev.amount, next.amount)) {
    changes.push({
      label: entryLabel(prev),
      from: auditAmount(prev.amount),
      to: auditAmount(next.amount),
    });
  }
  return changes;
}

export async function auditEntryDelete(
  session: Session,
  request: Request,
  year: LedgerYear,
  kind: CategoryKind,
  id: number,
) {
  const snapshot = await loadLedger(year);
  const prev = snapshot.entries.find((row) => row.id === id && row.kind === kind);
  if (!prev) return [];
  return [
    {
      label: entryLabel(prev),
      from: `${auditAmount(prev.amount)} · ${prev.mode}`,
      to: 'removed',
    },
  ];
}

export async function auditClosingSave(
  session: Session,
  request: Request,
  year: LedgerYear,
  next: { cashInHand: number; cashInBank: number },
) {
  const snapshot = await loadLedger(year);
  const changes: AuditChange[] = [];
  const hand = snapshot.cashInHandOverride ? snapshot.cashInHand : snapshot.computedCashInHand;
  const bank = snapshot.cashInBankOverride ? snapshot.cashInBank : snapshot.computedCashInBank;
  if (!amountsSame(hand, next.cashInHand)) {
    changes.push({
      label: 'Cash in Hand',
      from: auditAmount(hand),
      to: auditAmount(next.cashInHand),
    });
  }
  if (!amountsSame(bank, next.cashInBank)) {
    changes.push({
      label: 'Cash in Bank',
      from: auditAmount(bank),
      to: auditAmount(next.cashInBank),
    });
  }
  return changes;
}

export async function auditClosingRefetch(
  session: Session,
  request: Request,
  year: LedgerYear,
  field: 'cash_in_hand' | 'cash_in_bank',
) {
  const snapshot = await loadLedger(year);
  const from =
    field === 'cash_in_hand'
      ? snapshot.cashInHandOverride
        ? snapshot.cashInHand
        : snapshot.computedCashInHand
      : snapshot.cashInBankOverride
        ? snapshot.cashInBank
        : snapshot.computedCashInBank;
  const to = field === 'cash_in_hand' ? snapshot.computedCashInHand : snapshot.computedCashInBank;
  return [
    {
      label: field === 'cash_in_hand' ? 'Cash in Hand' : 'Cash in Bank',
      from: auditAmount(from),
      to: auditAmount(to),
    },
  ];
}

export async function auditCategoriesSave(
  session: Session,
  request: Request,
  year: LedgerYear,
  kind: CategoryKind,
  renames: Array<{ id: number; name: string }>,
  newName: string,
) {
  const snapshot = await loadLedger(year);
  const byId = new Map(snapshot.categories.filter((c) => c.kind === kind).map((c) => [c.id, c]));
  const changes: AuditChange[] = [];
  for (const rename of renames) {
    const prev = byId.get(rename.id);
    if (!prev || prev.name.trim() === rename.name.trim()) continue;
    changes.push({
      label: `${kind === 'income' ? 'Collection' : 'Expense'} type`,
      from: auditText(prev.name),
      to: auditText(rename.name),
    });
  }
  if (newName.trim()) {
    changes.push({
      label: `${kind === 'income' ? 'Collection' : 'Expense'} type`,
      from: '—',
      to: auditText(newName),
    });
  }
  return changes;
}

export function yearActionAudit(intent: string, meetingDate: string): AuditChange[] {
  return [
    {
      label: intent === 'close' ? 'Close books' : 'Archive freeze date',
      from: '—',
      to: displayDate(meetingDate),
    },
  ];
}
