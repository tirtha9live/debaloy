import { env } from 'cloudflare:workers';
import { claimDaily, recordJobRun } from './bank-holidays';
import {
  FESTIVAL_IMAGE_WIDTHS,
  FESTIVAL_IMAGES_PER_FESTIVAL,
  festivalQuery,
  type FestivalSlug,
} from './festivals';

export const FESTIVAL_JOB = 'festival_images';
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

export type FestivalImage = {
  slug: FestivalSlug;
  idx: number;
  year: number;
  sourceUrl: string;
  alt: string;
  photographer: string;
  pageUrl: string;
};

type Row = {
  slug: FestivalSlug;
  idx: number;
  year: number;
  source_url: string;
  alt: string;
  photographer: string;
  page_url: string;
};

type PexelsPhoto = {
  id: number;
  url: string;
  alt?: string;
  photographer?: string;
  src?: { original?: string };
};

function bindings() {
  return env as Cloudflare.Env & { PEXELS_API_KEY?: string };
}

function asImage(row: Row): FestivalImage {
  return {
    slug: row.slug,
    idx: Number(row.idx),
    year: Number(row.year),
    sourceUrl: row.source_url,
    alt: row.alt ?? '',
    photographer: row.photographer ?? '',
    pageUrl: row.page_url ?? '',
  };
}

export async function listFestivalImages(slug: FestivalSlug): Promise<FestivalImage[]> {
  const rows = await bindings()
    .DB.prepare(
      'SELECT slug, idx, year, source_url, alt, photographer, page_url FROM festival_images WHERE slug = ? ORDER BY idx',
    )
    .bind(slug)
    .all<Row>();
  return (rows.results ?? []).map(asImage);
}

export async function getFestivalImage(slug: FestivalSlug, idx: number): Promise<FestivalImage | null> {
  const row = await bindings()
    .DB.prepare(
      'SELECT slug, idx, year, source_url, alt, photographer, page_url FROM festival_images WHERE slug = ? AND idx = ?',
    )
    .bind(slug, idx)
    .first<Row>();
  return row ? asImage(row) : null;
}

export function festivalImagePath(image: Pick<FestivalImage, 'slug' | 'year' | 'idx'>, width: number) {
  return `/festival-img/${image.slug}/${image.year}/${image.idx}/${width}`;
}

export function festivalSrcset(image: FestivalImage) {
  return FESTIVAL_IMAGE_WIDTHS.map((width) => `${festivalImagePath(image, width)} ${width}w`).join(', ');
}

function objectKey(slug: string, year: number, idx: number, width: number) {
  return `festivals/${slug}/${year}/${idx}-${width}.jpg`;
}

/** Pexels search through the official API (the website itself blocks servers). */
async function searchPexels(query: string, apiKey: string): Promise<PexelsPhoto[]> {
  const url = new URL('https://api.pexels.com/v1/search');
  url.searchParams.set('query', query);
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('per_page', String(FESTIVAL_IMAGES_PER_FESTIVAL));
  const response = await fetch(url, { headers: { authorization: apiKey }, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Pexels API answered ${response.status}`);
  const body = (await response.json()) as { photos?: PexelsPhoto[] };
  return (body.photos ?? []).filter((photo) => photo.src?.original).slice(0, FESTIVAL_IMAGES_PER_FESTIVAL);
}

/** Replaces the saved photo list for one festival. On failure the cached photos stay. */
export async function refreshFestivalImages(slug: FestivalSlug, year: number) {
  const apiKey = bindings().PEXELS_API_KEY?.trim();
  if (!apiKey) {
    await recordJobRun('auto', 'failed', `${slug} ${year}: PEXELS_API_KEY is not set; using cached photos.`, FESTIVAL_JOB);
    return false;
  }
  try {
    const photos = await searchPexels(festivalQuery(slug), apiKey);
    if (!photos.length) throw new Error('Pexels returned no photos');
    const { DB, RECEIPTS } = bindings();
    await DB.batch([
      DB.prepare('DELETE FROM festival_images WHERE slug = ?').bind(slug),
      ...photos.map((photo, idx) =>
        DB.prepare(
          `INSERT INTO festival_images (slug, idx, year, source_url, alt, photographer, page_url)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(slug, idx, year, photo.src!.original!.split('?')[0], (photo.alt ?? '').slice(0, 200), photo.photographer ?? '', photo.url ?? ''),
      ),
    ]);
    const stale = await RECEIPTS.list({ prefix: `festivals/${slug}/` });
    const old = stale.objects.map((object) => object.key).filter((key) => !key.startsWith(`festivals/${slug}/${year}/`));
    if (old.length) await RECEIPTS.delete(old);
    await recordJobRun('auto', 'ok', `${slug} ${year}: saved ${photos.length} photos from Pexels.`, FESTIVAL_JOB);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordJobRun('auto', 'failed', `${slug} ${year}: ${message}; using cached photos.`, FESTIVAL_JOB);
    return false;
  }
}

/** This year's photos for the festival; refreshes once a year, keeping last year's set if Pexels fails. */
export async function festivalImagesFor(
  slug: FestivalSlug,
  year: number,
  today: string,
  waitUntil?: (promise: Promise<unknown>) => void,
) {
  let images = await listFestivalImages(slug);
  const current = images.length > 0 && images.every((image) => image.year === year);
  // A day's "no key" attempt doesn't block a real one once the key is added that day.
  const attempt = bindings().PEXELS_API_KEY?.trim() ? today : `${today}:no-key`;
  // At most one refresh attempt per festival per day, so a failing source is not hit on every visit.
  if (!current && (await claimDaily(`festival_refresh:${slug}`, attempt))) {
    if (images.length && waitUntil) {
      waitUntil(refreshFestivalImages(slug, year));
    } else {
      await Promise.race([refreshFestivalImages(slug, year), new Promise((resolve) => setTimeout(resolve, 8_000))]);
      images = await listFestivalImages(slug);
    }
  }
  return images;
}

/** Serves one width, downloading it from Pexels the first time anyone asks for it. */
export async function festivalImageResponse(image: FestivalImage, width: number) {
  const { RECEIPTS } = bindings();
  const key = objectKey(image.slug, image.year, image.idx, width);
  let object: R2ObjectBody | null = await RECEIPTS.get(key);
  let contentType = object?.httpMetadata?.contentType ?? 'image/jpeg';
  let body: ReadableStream | ArrayBuffer | null = object?.body ?? null;

  if (!object) {
    const source = `${image.sourceUrl}?auto=compress&cs=tinysrgb&w=${width}`;
    const response = await fetch(source, { signal: AbortSignal.timeout(15_000) });
    contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.startsWith('image/')) return new Response('Image unavailable', { status: 502 });
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength > MAX_IMAGE_BYTES) return new Response('Image too large', { status: 502 });
    await RECEIPTS.put(key, bytes, { httpMetadata: { contentType } });
    body = bytes;
  }

  return new Response(body, {
    headers: {
      'content-type': contentType,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
}
