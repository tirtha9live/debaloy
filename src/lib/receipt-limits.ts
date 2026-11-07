/** Shared by the upload script (browser) and the receipts API (Worker). */
export const RECEIPT_IMAGE_TARGET_BYTES = 800 * 1024;
export const RECEIPT_IMAGE_MAX_BYTES = 1.5 * 1024 * 1024;
export const RECEIPT_PDF_MAX_BYTES = 4 * 1024 * 1024;
export const RECEIPT_IMAGE_MAX_EDGE = 2000;
export const RECEIPT_STORAGE_CAP_BYTES = 5 * 1024 * 1024 * 1024;
export const RECEIPT_DAILY_UPLOADS = 50;
export const RECEIPT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

export function formatBytes(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
