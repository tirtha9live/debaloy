import { env } from 'cloudflare:workers';
import {
  RECEIPT_DAILY_UPLOADS,
  RECEIPT_IMAGE_MAX_BYTES,
  RECEIPT_PDF_MAX_BYTES,
  RECEIPT_STORAGE_CAP_BYTES,
} from './receipt-limits';

export type Receipt = {
  id: number;
  entryId: number;
  objectKey: string;
  contentType: string;
  size: number;
  fileName: string;
  createdAt: string;
};

type ReceiptRow = {
  id: number;
  entry_id: number;
  object_key: string;
  content_type: string;
  size: number;
  file_name: string;
  created_at: string;
};

const KINDS = {
  'image/jpeg': { ext: 'jpg', max: RECEIPT_IMAGE_MAX_BYTES },
  'image/png': { ext: 'png', max: RECEIPT_IMAGE_MAX_BYTES },
  'image/webp': { ext: 'webp', max: RECEIPT_IMAGE_MAX_BYTES },
  'application/pdf': { ext: 'pdf', max: RECEIPT_PDF_MAX_BYTES },
} as const;

type ReceiptType = keyof typeof KINDS;

function bindings() {
  return env as Cloudflare.Env;
}

function asReceipt(row: ReceiptRow): Receipt {
  return {
    id: row.id,
    entryId: row.entry_id,
    objectKey: row.object_key,
    contentType: row.content_type,
    size: Number(row.size) || 0,
    fileName: row.file_name ?? '',
    createdAt: row.created_at,
  };
}

/** Trust the file's first bytes, not the browser-supplied type. */
export function sniffReceiptType(head: Uint8Array): ReceiptType | null {
  const at = (index: number, ...bytes: number[]) => bytes.every((byte, offset) => head[index + offset] === byte);
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (at(0, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp';
  if (at(0, 0x25, 0x50, 0x44, 0x46, 0x2d)) return 'application/pdf';
  return null;
}

/** The version changes on every replace, so browsers never show a stale cached file. */
export function receiptHref(receipt: Pick<Receipt, 'id' | 'objectKey'>) {
  const version = receipt.objectKey.split('/').pop()?.slice(0, 8) ?? '';
  return `/api/receipts/${receipt.id}?v=${version}`;
}

export function receiptMaxBytes(type: ReceiptType) {
  return KINDS[type].max;
}

export async function listReceiptsByEntry(): Promise<Map<number, Receipt>> {
  const rows = await bindings()
    .DB.prepare(
      'SELECT id, entry_id, object_key, content_type, size, file_name, created_at FROM receipts',
    )
    .all<ReceiptRow>();
  return new Map((rows.results ?? []).map((row) => [row.entry_id, asReceipt(row)]));
}

export async function getReceipt(id: number): Promise<Receipt | null> {
  const row = await bindings()
    .DB.prepare(
      'SELECT id, entry_id, object_key, content_type, size, file_name, created_at FROM receipts WHERE id = ?',
    )
    .bind(id)
    .first<ReceiptRow>();
  return row ? asReceipt(row) : null;
}

export async function receiptForEntry(entryId: number): Promise<Receipt | null> {
  const row = await bindings()
    .DB.prepare(
      'SELECT id, entry_id, object_key, content_type, size, file_name, created_at FROM receipts WHERE entry_id = ?',
    )
    .bind(entryId)
    .first<ReceiptRow>();
  return row ? asReceipt(row) : null;
}

export async function uploadsInLastDay(): Promise<number> {
  const row = await bindings()
    .DB.prepare(
      `SELECT COUNT(*) AS count FROM receipts
       WHERE created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`,
    )
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export function dailyUploadLimitReached(count: number) {
  return count >= RECEIPT_DAILY_UPLOADS;
}

function cleanFileName(name: string) {
  return name.replace(/[^\w.\- ()]+/g, '_').slice(0, 80);
}

/** One receipt per expense: a new upload replaces the old file. */
export async function saveReceipt(entryId: number, bytes: ArrayBuffer, type: ReceiptType, fileName: string) {
  const { DB, RECEIPTS } = bindings();
  const key = `expenses/${entryId}/${crypto.randomUUID()}.${KINDS[type].ext}`;
  await RECEIPTS.put(key, bytes, { httpMetadata: { contentType: type } });
  const previous = await receiptForEntry(entryId);
  await DB.prepare(
    `INSERT INTO receipts (entry_id, object_key, content_type, size, file_name)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(entry_id) DO UPDATE SET
       object_key = excluded.object_key, content_type = excluded.content_type,
       size = excluded.size, file_name = excluded.file_name,
       created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  )
    .bind(entryId, key, type, bytes.byteLength, cleanFileName(fileName))
    .run();
  if (previous) await RECEIPTS.delete(previous.objectKey);
  await enforceStorageCap();
  return { previous };
}

export async function deleteReceiptForEntry(entryId: number) {
  const receipt = await receiptForEntry(entryId);
  if (!receipt) return null;
  const { DB, RECEIPTS } = bindings();
  await DB.prepare('DELETE FROM receipts WHERE id = ?').bind(receipt.id).run();
  await RECEIPTS.delete(receipt.objectKey);
  return receipt;
}

/** Oldest-first rows to drop so the remaining total fits under the cap. */
export function pickReceiptsToEvict<T extends { size: number }>(oldestFirst: T[], total: number, cap: number): T[] {
  let excess = total - cap;
  const remove: T[] = [];
  for (const row of oldestFirst) {
    if (excess <= 0) break;
    remove.push(row);
    excess -= Number(row.size) || 0;
  }
  return remove;
}

/** Keeps total receipt storage under the cap by removing the oldest receipts first. */
export async function enforceStorageCap(cap = RECEIPT_STORAGE_CAP_BYTES) {
  const { DB, RECEIPTS } = bindings();
  const total = await DB.prepare('SELECT COALESCE(SUM(size), 0) AS total FROM receipts').first<{ total: number }>();
  const sum = Number(total?.total ?? 0);
  if (sum <= cap) return [];
  const oldest = await DB.prepare('SELECT id, object_key, size FROM receipts ORDER BY created_at, id').all<{
    id: number;
    object_key: string;
    size: number;
  }>();
  const remove = pickReceiptsToEvict(oldest.results ?? [], sum, cap);
  if (!remove.length) return [];
  await DB.batch(remove.map((row) => DB.prepare('DELETE FROM receipts WHERE id = ?').bind(row.id)));
  await RECEIPTS.delete(remove.map((row) => row.object_key));
  return remove;
}

export async function receiptRateLimited(binding: 'RECEIPT_UPLOAD_LIMIT' | 'RECEIPT_VIEW_LIMIT', key: string) {
  const limiter = bindings()[binding];
  if (!limiter) return false;
  const { success } = await limiter.limit({ key });
  return !success;
}
