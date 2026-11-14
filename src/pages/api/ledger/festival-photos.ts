import type { APIRoute } from 'astro';
import { publishLedgerAudit } from '../../../lib/audit-server';
import { currentKolkataYear } from '../../../lib/bank-holidays';
import { addPexelsPhoto, addUploadedPhoto, removeFestivalPhoto, setPinnedFestivalPhoto } from '../../../lib/festival-images';
import { FESTIVAL_IMAGE_WIDTHS, FESTIVALS, isFestivalSlug } from '../../../lib/festivals';
import { readFormIntent } from '../../../lib/form-intent';
import { RECEIPT_IMAGE_MAX_BYTES } from '../../../lib/receipt-limits';
import { receiptRateLimited, sniffReceiptType } from '../../../lib/receipts';

const PAGE = '/ledger/festival-photos';
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;

function back(slug: string, result: string) {
  return `${PAGE}?result=${result}${slug ? `&festival=${slug}` : ''}#${slug || 'top'}`;
}

export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const session = locals.session;
  if (!session || session.role !== 'admin' || locals.viewAsResident) return new Response('Forbidden', { status: 403 });
  if (Number(request.headers.get('content-length') ?? 0) > MAX_REQUEST_BYTES) return redirect(back('', 'size'));
  if (await receiptRateLimited('RECEIPT_UPLOAD_LIMIT', session.id)) return redirect(back('', 'rate'));

  const form = await request.formData();
  const intent = readFormIntent(form, '');
  const slug = String(form.get('slug') ?? '');
  if (!isFestivalSlug(slug)) return redirect(back('', 'missing'));
  const festival = FESTIVALS.find((item) => item.slug === slug)!.title(currentKolkataYear());
  const alt = String(form.get('alt') ?? '').trim();
  const year = currentKolkataYear();

  if (intent === 'remove') {
    const removed = await removeFestivalPhoto(slug, String(form.get('photo_key') ?? ''));
    if (removed) {
      await publishLedgerAudit(session, request, 'festival-photos', [
        { label: `${festival} · photo`, from: removed.source === 'upload' ? 'Uploaded photo' : removed.sourceUrl, to: 'removed' },
      ]);
    }
    return redirect(back(slug, removed ? 'removed' : 'missing'));
  }

  if (intent === 'pin' || intent === 'unpin') {
    const photoKey = intent === 'pin' ? String(form.get('photo_key') ?? '') : null;
    const ok = await setPinnedFestivalPhoto(slug, photoKey);
    if (!ok) return redirect(back(slug, 'missing'));
    await publishLedgerAudit(session, request, 'festival-photos', [
      { label: `${festival} · landing photo`, from: intent === 'pin' ? 'Rotation' : 'Pinned', to: intent === 'pin' ? `Pinned ${photoKey}` : 'Rotation' },
    ]);
    return redirect(back(slug, intent === 'pin' ? 'pinned' : 'unpinned'));
  }

  if (intent === 'link') {
    const result = await addPexelsPhoto(slug, String(form.get('url') ?? ''), alt, year);
    if (!result.ok) return redirect(back(slug, result.reason));
    await publishLedgerAudit(session, request, 'festival-photos', [
      { label: `${festival} · photo`, from: '—', to: String(form.get('url') ?? '').split('?')[0] },
    ]);
    return redirect(back(slug, 'added'));
  }

  if (intent === 'upload') {
    const files = new Map<number, ArrayBuffer>();
    for (const width of FESTIVAL_IMAGE_WIDTHS) {
      const file = form.get(`w${width}`);
      if (!(file instanceof File) || file.size === 0) continue;
      const bytes = await file.arrayBuffer();
      if (sniffReceiptType(new Uint8Array(bytes.slice(0, 16))) !== 'image/jpeg') return redirect(back(slug, 'type'));
      if (bytes.byteLength > RECEIPT_IMAGE_MAX_BYTES) return redirect(back(slug, 'size'));
      files.set(width, bytes);
    }
    if (!files.size) return redirect(back(slug, 'file'));
    const result = await addUploadedPhoto(slug, files, alt, year);
    if (!result.ok) return redirect(back(slug, result.reason));
    await publishLedgerAudit(session, request, 'festival-photos', [
      { label: `${festival} · photo`, from: '—', to: `Uploaded (${[...files.keys()].join(', ')} px wide)` },
    ]);
    return redirect(back(slug, 'added'));
  }

  return new Response('Unknown action', { status: 400 });
};
