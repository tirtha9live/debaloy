import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { getReceipt, receiptRateLimited } from '../../../lib/receipts';

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.session) return new Response('Unauthorised', { status: 401 });
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return new Response('Not found', { status: 404 });
  if (await receiptRateLimited('RECEIPT_VIEW_LIMIT', locals.session.id)) {
    return new Response('Too many requests. Try again in a minute.', {
      status: 429,
      headers: { 'retry-after': '60' },
    });
  }

  const receipt = await getReceipt(id);
  if (!receipt) return new Response('Not found', { status: 404 });
  const object = await (env as Cloudflare.Env).RECEIPTS.get(receipt.objectKey);
  if (!object) return new Response('Not found', { status: 404 });

  const pdf = receipt.contentType === 'application/pdf';
  const ext = pdf ? 'pdf' : receipt.contentType.split('/')[1];
  const headers = new Headers({
    'content-type': receipt.contentType,
    'content-length': String(object.size),
    'content-disposition': `inline; filename="receipt-${receipt.entryId}.${ext}"`,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex',
  });
  // Chrome refuses to render PDFs under a sandbox CSP.
  if (!pdf) headers.set('content-security-policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  return new Response(object.body, { headers });
};
