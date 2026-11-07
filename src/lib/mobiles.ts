import { env } from 'cloudflare:workers';
import { FLATS } from './constants';

const MOBILE_RE = /^[6-9]\d{9}$/;

export type FlatMobile = {
  flatId: string;
  resident: string;
  mobile: string | null;
  last4: string | null;
};

function db() {
  return (env as Cloudflare.Env).DB;
}

export function digitsOnly(raw: FormDataEntryValue | string | null | undefined) {
  return String(raw ?? '').replace(/\D/g, '');
}

export function normalizeMobile(raw: FormDataEntryValue | string | null | undefined) {
  let digits = digitsOnly(raw);
  if (digits.startsWith('91') && digits.length === 12) digits = digits.slice(2);
  return digits;
}

export function isValidMobile(mobile: string) {
  return MOBILE_RE.test(mobile);
}

export function mobileLast4(mobile: string | null | undefined) {
  const digits = normalizeMobile(mobile);
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function formatMobileLast4(mobile: string | null | undefined) {
  const last4 = mobileLast4(mobile);
  return last4 ? `•••• ${last4}` : '—';
}

export function formatMobileFull(mobile: string | null | undefined) {
  const digits = normalizeMobile(mobile);
  if (!isValidMobile(digits)) return '—';
  return `+91-${digits}`;
}

export async function listFlatMobiles(): Promise<FlatMobile[]> {
  const rows = await db()
    .prepare('SELECT flat_id, mobile FROM e_receipt_mobiles')
    .all<{ flat_id: string; mobile: string }>();
  const byFlat = new Map((rows.results ?? []).map((row) => [row.flat_id, row.mobile]));
  return FLATS.map((flat) => {
    const mobile = byFlat.get(flat.id) ?? null;
    return {
      flatId: flat.id,
      resident: flat.resident,
      mobile,
      last4: mobileLast4(mobile),
    };
  });
}

export async function getFlatMobile(flatId: string): Promise<string | null> {
  const row = await db()
    .prepare('SELECT mobile FROM e_receipt_mobiles WHERE flat_id = ?')
    .bind(flatId)
    .first<{ mobile: string }>();
  return row?.mobile ?? null;
}

export async function saveFlatMobile(flatId: string, mobile: string) {
  const digits = normalizeMobile(mobile);
  if (!FLATS.some((flat) => flat.id === flatId) || !isValidMobile(digits)) return false;
  await db()
    .prepare(
      `INSERT INTO e_receipt_mobiles (flat_id, mobile, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(flat_id) DO UPDATE SET mobile = excluded.mobile, updated_at = excluded.updated_at`,
    )
    .bind(flatId, digits, new Date().toISOString())
    .run();
  return true;
}
