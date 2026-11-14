import { env } from 'cloudflare:workers';
import {
  FESTIVAL_IMAGE_WIDTHS,
  FESTIVAL_IMAGES_PER_FESTIVAL,
  festivalVariantIndex,
  type FestivalSlug,
  type FestivalWindow,
} from './festivals';

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export type FestivalPhoto = {
  id: number;
  slug: FestivalSlug;
  photoKey: string;
  source: 'pexels' | 'upload';
  sourceUrl: string;
  /** Uploads only: widths stored in R2. */
  widths: number[];
  alt: string;
  year: number;
  /** Shown instead of the rotation while set. */
  pinned: boolean;
};

type Row = {
  id: number;
  slug: FestivalSlug;
  photo_key: string;
  source: 'pexels' | 'upload';
  source_url: string;
  widths: string;
  alt: string;
  year: number;
  pinned: number;
};

const COLUMNS = 'id, slug, photo_key, source, source_url, widths, alt, year, pinned';

function bindings() {
  return env;
}

function asPhoto(row: Row): FestivalPhoto {
  return {
    id: Number(row.id),
    slug: row.slug,
    photoKey: row.photo_key,
    source: row.source,
    sourceUrl: row.source_url,
    widths: row.widths ? row.widths.split(',').map(Number).filter(Boolean).sort((a, b) => a - b) : [],
    alt: row.alt ?? '',
    year: Number(row.year),
    pinned: Boolean(row.pinned),
  };
}

/** The pinned photo if there is one, else the photo for this slot of the 7am–11pm rotation. */
export function pickFestivalPhoto(photos: FestivalPhoto[], window: FestivalWindow, today: string, minuteOfDay: number) {
  if (!photos.length) return null;
  return photos.find((photo) => photo.pinned) ?? photos[festivalVariantIndex(window, today, minuteOfDay, photos.length)];
}

/** Pins one photo for its festival (unpinning the rest), or clears the pin when `photoKey` is null. */
export async function setPinnedFestivalPhoto(slug: FestivalSlug, photoKey: string | null) {
  const database = bindings().DB;
  if (photoKey && !(await getFestivalPhoto(slug, photoKey))) return false;
  await database
    .prepare('UPDATE festival_photos SET pinned = CASE WHEN photo_key = ? THEN 1 ELSE 0 END WHERE slug = ?')
    .bind(photoKey ?? '', slug)
    .run();
  return true;
}

/** "https://images.pexels.com/photos/8887173/…" → "px8887173". */
export function pexelsPhotoKey(url: string) {
  const id = url.match(/images\.pexels\.com\/photos\/(\d+)\//)?.[1];
  return id ? `px${id}` : null;
}

export function cleanPexelsUrl(url: string) {
  const clean = url.trim().split('?')[0];
  return /^https:\/\/images\.pexels\.com\/photos\/\d+\/[\w./-]+\.(jpe?g|png|webp)$/i.test(clean) ? clean : null;
}

export async function listFestivalPhotos(slug?: FestivalSlug): Promise<FestivalPhoto[]> {
  const database = bindings().DB;
  const rows = slug
    ? await database.prepare(`SELECT ${COLUMNS} FROM festival_photos WHERE slug = ? ORDER BY id`).bind(slug).all<Row>()
    : await database.prepare(`SELECT ${COLUMNS} FROM festival_photos ORDER BY slug, id`).all<Row>();
  return (rows.results ?? []).map(asPhoto);
}

export async function getFestivalPhoto(slug: FestivalSlug, photoKey: string): Promise<FestivalPhoto | null> {
  const row = await bindings()
    .DB.prepare(`SELECT ${COLUMNS} FROM festival_photos WHERE slug = ? AND photo_key = ?`)
    .bind(slug, photoKey)
    .first<Row>();
  return row ? asPhoto(row) : null;
}

export function festivalPhotoWidths(photo: FestivalPhoto): number[] {
  return photo.source === 'upload' ? photo.widths : [...FESTIVAL_IMAGE_WIDTHS];
}

export function festivalImagePath(photo: Pick<FestivalPhoto, 'slug' | 'photoKey'>, width: number) {
  return `/festival-img/${photo.slug}/${photo.photoKey}/${width}`;
}

export function festivalSrcset(photo: FestivalPhoto) {
  return festivalPhotoWidths(photo)
    .map((width) => `${festivalImagePath(photo, width)} ${width}w`)
    .join(', ');
}

/** A width that exists for this photo, closest to what the browser asked for (never smaller unless none larger). */
export function pickStoredWidth(widths: number[], requested: number) {
  return widths.find((width) => width >= requested) ?? widths[widths.length - 1];
}

function objectKey(slug: string, photoKey: string, width: number) {
  return `festivals/${slug}/${photoKey}/${width}.jpg`;
}

async function deleteObjectsFor(slug: string, photoKey: string) {
  const { RECEIPTS } = bindings();
  const listed = await RECEIPTS.list({ prefix: `festivals/${slug}/${photoKey}/` });
  const keys = listed.objects.map((object) => object.key);
  if (keys.length) await RECEIPTS.delete(keys);
}

export async function countFestivalPhotos(slug: FestivalSlug) {
  const row = await bindings()
    .DB.prepare('SELECT COUNT(*) AS count FROM festival_photos WHERE slug = ?')
    .bind(slug)
    .first<{ count: number }>();
  return Number(row?.count ?? 0);
}

export async function addPexelsPhoto(slug: FestivalSlug, url: string, alt: string, year: number) {
  const clean = cleanPexelsUrl(url);
  const key = clean && pexelsPhotoKey(clean);
  if (!clean || !key) return { ok: false as const, reason: 'link' };
  if ((await countFestivalPhotos(slug)) >= FESTIVAL_IMAGES_PER_FESTIVAL) return { ok: false as const, reason: 'full' };
  const result = await bindings()
    .DB.prepare(
      `INSERT OR IGNORE INTO festival_photos (slug, photo_key, source, source_url, alt, year)
       VALUES (?, ?, 'pexels', ?, ?, ?)`,
    )
    .bind(slug, key, clean, alt.slice(0, 200), year)
    .run();
  return result.meta.changes ? { ok: true as const, key } : { ok: false as const, reason: 'duplicate' };
}

/** Treasurer upload: the browser sends a few pre-sized JPEG widths; each is stored as-is. */
export async function addUploadedPhoto(slug: FestivalSlug, files: Map<number, ArrayBuffer>, alt: string, year: number) {
  if ((await countFestivalPhotos(slug)) >= FESTIVAL_IMAGES_PER_FESTIVAL) return { ok: false as const, reason: 'full' };
  const key = `u${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const { DB, RECEIPTS } = bindings();
  const widths = [...files.keys()].sort((a, b) => a - b);
  for (const width of widths) {
    await RECEIPTS.put(objectKey(slug, key, width), files.get(width)!, { httpMetadata: { contentType: 'image/jpeg' } });
  }
  await DB.prepare(
    `INSERT INTO festival_photos (slug, photo_key, source, widths, alt, year) VALUES (?, ?, 'upload', ?, ?, ?)`,
  )
    .bind(slug, key, widths.join(','), alt.slice(0, 200), year)
    .run();
  return { ok: true as const, key };
}

export async function removeFestivalPhoto(slug: FestivalSlug, photoKey: string) {
  const photo = await getFestivalPhoto(slug, photoKey);
  if (!photo) return null;
  await bindings().DB.prepare('DELETE FROM festival_photos WHERE id = ?').bind(photo.id).run();
  await deleteObjectsFor(slug, photoKey);
  return photo;
}

function imageHeaders(contentType: string) {
  return {
    'content-type': contentType,
    'cache-control': 'public, max-age=31536000, immutable',
    'x-content-type-options': 'nosniff',
  };
}

/** Uploads: the stored width nearest the request. Pexels: downloads each width the first time anyone asks for it. */
export async function festivalImageResponse(photo: FestivalPhoto, width: number) {
  const { RECEIPTS } = bindings();
  if (photo.source === 'upload') {
    const stored = pickStoredWidth(photo.widths, width);
    const object = stored ? await RECEIPTS.get(objectKey(photo.slug, photo.photoKey, stored)) : null;
    if (!object) return new Response('Not found', { status: 404 });
    return new Response(object.body, { headers: imageHeaders(object.httpMetadata?.contentType ?? 'image/jpeg') });
  }

  const key = objectKey(photo.slug, photo.photoKey, width);
  const cached = await RECEIPTS.get(key);
  if (cached) return new Response(cached.body, { headers: imageHeaders(cached.httpMetadata?.contentType ?? 'image/jpeg') });

  const response = await fetch(`${photo.sourceUrl}?auto=compress&cs=tinysrgb&w=${width}`, { signal: AbortSignal.timeout(15_000) });
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.startsWith('image/')) return new Response('Image unavailable', { status: 502 });
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_IMAGE_BYTES) return new Response('Image too large', { status: 502 });
  await RECEIPTS.put(key, bytes, { httpMetadata: { contentType } });
  return new Response(bytes, { headers: imageHeaders(contentType) });
}
