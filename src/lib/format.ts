const amountFormatter = new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '';
  return amountFormatter.format(value);
}

export function formatInr(value: number | null | undefined): string {
  const formatted = formatAmount(value);
  return formatted ? `₹${formatted}` : '—';
}

export function parseAmount(raw: FormDataEntryValue | string | null | undefined): number {
  return parseOptionalAmount(raw) ?? 0;
}

export function parseOptionalAmount(raw: FormDataEntryValue | string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim().replace(/,/g, '');
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

export function amountsEqual(left: number, right: number): boolean {
  return roundAmount(left) === roundAmount(right);
}

export function formatDateInput(value: string | null | undefined): string {
  if (!value) return '';
  return value.slice(0, 10);
}

const DISPLAY_TIME_ZONE = 'Asia/Kolkata';

export function displayDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}

export function formatUpdatedOn(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = value.length <= 10 ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
  return `Last updated on ${formatted}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: DISPLAY_TIME_ZONE,
  }).format(date);
}
