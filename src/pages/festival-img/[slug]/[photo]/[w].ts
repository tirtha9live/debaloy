import type { APIRoute } from 'astro';
import { FESTIVAL_IMAGE_WIDTHS, isFestivalSlug } from '../../../../lib/festivals';
import { festivalImageResponse, festivalPhotoWidths, getFestivalPhoto } from '../../../../lib/festival-images';
import { receiptRateLimited } from '../../../../lib/receipts';

const WIDTHS = new Set<number>(FESTIVAL_IMAGE_WIDTHS);

export const GET: APIRoute = async ({ params, request }) => {
  const slug = String(params.slug ?? '');
  const photoKey = String(params.photo ?? '');
  const width = Number(params.w);
  if (!isFestivalSlug(slug) || !/^(px\d+|u[0-9a-f]{12})$/.test(photoKey) || !Number.isInteger(width)) {
    return new Response('Not found', { status: 404 });
  }
  const ip = request.headers.get('cf-connecting-ip') ?? 'local';
  if (await receiptRateLimited('RECEIPT_VIEW_LIMIT', `festival:${ip}`)) {
    return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });
  }
  const photo = await getFestivalPhoto(slug, photoKey);
  if (!photo) return new Response('Not found', { status: 404 });
  const allowed = photo.source === 'upload' ? new Set(festivalPhotoWidths(photo)) : WIDTHS;
  if (!allowed.has(width)) return new Response('Not found', { status: 404 });
  return festivalImageResponse(photo, width);
};
