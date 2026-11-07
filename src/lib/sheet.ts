import { monthKeyFromIso, monthStartIso, todayIso } from './years';

export function ledgerCurrentMonthKey(): string {
  return monthKeyFromIso(todayIso());
}

/** Blank or 0 in the current month or any earlier month — not paid. NPR is never pending. */
export function isMaintenancePaymentPending(
  monthKey: string,
  cell: { amount: number | null; npr: boolean },
  activeMonths: readonly string[],
  currentMonthKey: string = ledgerCurrentMonthKey(),
): boolean {
  if (cell.npr) return false;
  if (cell.amount != null && cell.amount !== 0) return false;
  if (!activeMonths.includes(monthKey)) return false;
  const month = monthStartIso(monthKey);
  const current = monthStartIso(currentMonthKey);
  if (!month || !current) return false;
  return month <= current;
}

/** Puja contribution not yet recorded (empty or zero). */
export function isPujaPaymentPending(amount: number): boolean {
  return amount <= 0;
}
