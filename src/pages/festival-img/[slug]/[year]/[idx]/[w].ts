import type { APIRoute } from 'astro';
import { FESTIVAL_IMAGE_WIDTHS, isFestivalSlug } from '../../../../../lib/festivals';
import { festivalImageResponse, getFestivalImage } from '../../../../../lib/festival-images';
import { receiptRateLimited } from '../../../../../lib/receipts';

const WIDTHS = new Set<number>(FESTIVAL_IMAGE_WIDTHS);

export const GET: APIRoute = async ({ params, request }) => {
  const slug = String(params.slug ?? '');
  const year = Number(params.year);
  const idx = Number(params.idx);
  const width = Number(params.w);
  if (!isFestivalSlug(slug) || !Number.isInteger(idx) || !WIDTHS.has(width)) {
    return new Response('Not found', { status: 404 });
  }
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  if (await receiptRateLimited('RECEIPT_VIEW_LIMIT', `festival:${ip}`)) {
    return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });
  }
  const image = await getFestivalImage(slug, idx);
  if (!image || image.year !== year) return new Response('Not found', { status: 404 });
  return festivalImageResponse(image, width);
};
