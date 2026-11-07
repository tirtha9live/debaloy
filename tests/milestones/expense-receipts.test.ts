import { describe, expect, it } from 'vitest';
import {
  formatBytes,
  RECEIPT_IMAGE_MAX_BYTES,
  RECEIPT_PDF_MAX_BYTES,
  RECEIPT_STORAGE_CAP_BYTES,
} from '../../src/lib/receipt-limits';
import { pickReceiptsToEvict, receiptHref, sniffReceiptType } from '../../src/lib/receipts';
import { readRepo, readSrc } from '../helpers/repo';

const bytes = (...values: number[]) => new Uint8Array([...values, ...new Array(16).fill(0)]);

describe('expense receipts', () => {
  it('sniffs real file types from the first bytes', () => {
    expect(sniffReceiptType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffReceiptType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffReceiptType(bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))).toBe('image/webp');
    expect(sniffReceiptType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe('application/pdf');
    expect(sniffReceiptType(bytes(0x3c, 0x68, 0x74, 0x6d, 0x6c))).toBeNull();
  });

  it('caps sizes: photos 1.5 MB, PDFs 4 MB, total 5 GB', () => {
    expect(RECEIPT_IMAGE_MAX_BYTES).toBe(1.5 * 1024 * 1024);
    expect(RECEIPT_PDF_MAX_BYTES).toBe(4 * 1024 * 1024);
    expect(RECEIPT_STORAGE_CAP_BYTES).toBe(5 * 1024 ** 3);
    expect(formatBytes(800 * 1024)).toBe('800 KB');
    expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('evicts the oldest receipts until the total fits under the cap', () => {
    const rows = [
      { id: 1, size: 400 },
      { id: 2, size: 300 },
      { id: 3, size: 500 },
    ];
    expect(pickReceiptsToEvict(rows, 1200, 2000)).toEqual([]);
    expect(pickReceiptsToEvict(rows, 1200, 1000).map((row) => row.id)).toEqual([1]);
    expect(pickReceiptsToEvict(rows, 1200, 600).map((row) => row.id)).toEqual([1, 2]);
  });

  it('versions receipt links so a replaced file is never served from cache', () => {
    expect(receiptHref({ id: 7, objectKey: 'expenses/3/abcd1234-ef56.jpg' })).toBe('/api/receipts/7?v=abcd1234');
  });

  it('wires the R2 bucket and rate limiters', () => {
    const toml = readRepo('wrangler.toml');
    expect(toml).toMatch(/binding = "RECEIPTS"/);
    expect(toml).toMatch(/bucket_name = "debaloy-receipts"/);
    expect(toml).toMatch(/name = "RECEIPT_UPLOAD_LIMIT"/);
    expect(toml).toMatch(/name = "RECEIPT_VIEW_LIMIT"/);
    expect(readRepo('migrations/0013_receipts.sql')).toMatch(/CREATE TABLE IF NOT EXISTS receipts/);
  });

  it('upload API checks role, rate, daily cap, real type, and size', () => {
    const api = readSrc('pages/api/ledger/receipts.ts');
    expect(api).toMatch(/locals\.canEdit/);
    expect(api).toMatch(/RECEIPT_UPLOAD_LIMIT/);
    expect(api).toMatch(/dailyUploadLimitReached/);
    expect(api).toMatch(/sniffReceiptType/);
    expect(api).toMatch(/receiptMaxBytes/);
    expect(readSrc('lib/receipts.ts')).toMatch(/enforceStorageCap\(\)/);
  });

  it('view API needs a session and is rate limited', () => {
    const view = readSrc('pages/api/receipts/[id].ts');
    expect(view).toMatch(/locals\.session/);
    expect(view).toMatch(/RECEIPT_VIEW_LIMIT/);
    expect(view).toMatch(/x-content-type-options/);
  });

  it('expenses sheet links receipts for everyone and compresses photos before upload', () => {
    const sheet = readSrc('components/EntriesSheet.astro');
    expect(sheet).toMatch(/data-receipt-form/);
    expect(sheet).toMatch(/receiptHref\(/);
    const script = readSrc('scripts/ledger-actions.ts');
    expect(script).toMatch(/prepareReceipt/);
    expect(script).toMatch(/bindReceiptViewer/);
    expect(script).toMatch(/event\.key === 'Escape'/);
    expect(sheet).toMatch(/data-receipt-view/);
    expect(script).toMatch(/image\/jpeg/);
    expect(readSrc('pages/api/ledger/entries.ts')).toMatch(/deleteReceiptForEntry/);
  });
});
