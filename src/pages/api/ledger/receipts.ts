import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { sameOriginPath } from '../../../lib/auth';
import { displayDate, formatAmount } from '../../../lib/format';
import { readFormIntent } from '../../../lib/form-intent';
import { publishLedgerAudit } from '../../../lib/audit-server';
import { formatBytes, RECEIPT_PDF_MAX_BYTES } from '../../../lib/receipt-limits';
import {
  dailyUploadLimitReached,
  deleteReceiptForEntry,
  receiptMaxBytes,
  receiptRateLimited,
  saveReceipt,
  sniffReceiptType,
  uploadsInLastDay,
} from '../../../lib/receipts';

const FALLBACK = '/ledger/expenses';
const MAX_REQUEST_BYTES = RECEIPT_PDF_MAX_BYTES + 256 * 1024;

function back(request: Request, error?: string) {
  const next = new URL(sameOriginPath(request, FALLBACK), 'http://local');
  next.searchParams.delete('receipt_error');
  if (error) next.searchParams.set('receipt_error', error);
  return `${next.pathname}${next.search}`;
}

async function expenseLabel(id: number) {
  const row = await (env as Cloudflare.Env).DB.prepare(
    "SELECT date, category, amount FROM entries WHERE id = ? AND kind = 'expense'",
  )
    .bind(id)
    .first<{ date: string | null; category: string; amount: number }>();
  if (!row) return null;
  return `${row.category} · ${displayDate(row.date)} · ${formatAmount(Number(row.amount) || 0)}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  if (!locals.canEdit || !locals.ledgerYear || !locals.session) return new Response('Forbidden', { status: 403 });
  const session = locals.session;

  if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) {
    return redirect(back(request, 'size'));
  }
  if (await receiptRateLimited('RECEIPT_UPLOAD_LIMIT', session.id)) {
    return redirect(back(request, 'rate'));
  }

  const form = await request.formData();
  const intent = readFormIntent(form, 'upload');
  const entryId = Number(form.get('entry_id'));
  const label = Number.isInteger(entryId) ? await expenseLabel(entryId) : null;
  if (!label) return redirect(back(request, 'missing'));

  if (intent === 'delete') {
    const removed = await deleteReceiptForEntry(entryId);
    if (removed) {
      await publishLedgerAudit(session, request, 'entries', [
        { label: `${label} · receipt`, from: removed.fileName || 'Receipt', to: '—' },
      ]);
    }
    return redirect(back(request));
  }

  const file = form.get('receipt');
  if (!(file instanceof File) || file.size === 0) return redirect(back(request, 'file'));
  if (dailyUploadLimitReached(await uploadsInLastDay())) return redirect(back(request, 'daily'));

  const bytes = await file.arrayBuffer();
  const type = sniffReceiptType(new Uint8Array(bytes.slice(0, 16)));
  if (!type) return redirect(back(request, 'type'));
  if (bytes.byteLength > receiptMaxBytes(type)) return redirect(back(request, 'size'));

  const { previous } = await saveReceipt(entryId, bytes, type, file.name);
  await publishLedgerAudit(session, request, 'entries', [
    {
      label: `${label} · receipt`,
      from: previous ? previous.fileName || 'Receipt' : '—',
      to: `${file.name || 'Receipt'} (${formatBytes(bytes.byteLength)})`,
    },
  ]);
  return redirect(back(request));
};
