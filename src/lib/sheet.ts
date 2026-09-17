import { monthKeyFromIso, todayIso } from './years';

export function ledgerCurrentMonthKey(): string {
  return monthKeyFromIso(todayIso());
}

/** Blank amount in the current ledger month — payment not yet recorded. */
export function isMaintenancePaymentPending(
  monthKey: string,
  amount: number | null,
  activeMonths: readonly string[],
): boolean {
  if (amount != null) return false;
  if (!activeMonths.includes(monthKey)) return false;
  return monthKey === ledgerCurrentMonthKey();
}

/** Puja contribution not yet recorded (empty or zero). */
export function isPujaPaymentPending(amount: number): boolean {
  return amount <= 0;
}
