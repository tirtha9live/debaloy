import { describe, expect, it } from 'vitest';
import {
  cleanPexelsUrl,
  festivalImagePath,
  festivalPhotoWidths,
  festivalSrcset,
  pexelsPhotoKey,
  pickStoredWidth,
  type FestivalPhoto,
} from '../../src/lib/festival-images';
import { readRepo, readSrc } from '../helpers/repo';

const pexels: FestivalPhoto = {
  id: 1,
  slug: 'diwali',
  photoKey: 'px34641279',
  source: 'pexels',
  sourceUrl: 'https://images.pexels.com/photos/34641279/pexels-photo-34641279/x.jpeg',
  widths: [],
  alt: '',
  year: 2026,
  pinned: false,
};
const upload: FestivalPhoto = { ...pexels, id: 2, photoKey: 'u0123456789ab', source: 'upload', sourceUrl: '', widths: [400, 800, 1200] };

describe('festival photos', () => {
  it('uses a permanent photo key in every URL, so removing one never shifts another', () => {
    expect(pexelsPhotoKey('https://images.pexels.com/photos/8887173/pexels-photo-8887173.jpeg?w=500')).toBe('px8887173');
    expect(festivalImagePath(pexels, 800)).toBe('/festival-img/diwali/px34641279/800');
    expect(cleanPexelsUrl('https://images.pexels.com/photos/8887173/pexels-photo-8887173.jpeg?auto=compress&w=500')).toBe(
      'https://images.pexels.com/photos/8887173/pexels-photo-8887173.jpeg',
    );
    expect(cleanPexelsUrl('https://example.com/a.jpg')).toBeNull();
  });

  it('offers all 7 widths for Pexels photos and only stored widths for uploads', () => {
    expect(festivalPhotoWidths(pexels)).toEqual([150, 300, 400, 600, 800, 1200, 1600]);
    expect(festivalSrcset(upload)).toBe(
      '/festival-img/diwali/u0123456789ab/400 400w, /festival-img/diwali/u0123456789ab/800 800w, /festival-img/diwali/u0123456789ab/1200 1200w',
    );
    expect(pickStoredWidth([400, 800, 1200], 600)).toBe(800);
    expect(pickStoredWidth([400, 800, 1200], 1600)).toBe(1200);
  });

  it('stores one row per photo with a per-festival unique key', () => {
    const sql = readRepo('migrations/0018_festival_photos.sql');
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS festival_photos/);
    expect(sql).toMatch(/UNIQUE \(slug, photo_key\)/);
    expect(sql).toMatch(/DROP TABLE IF EXISTS festival_images/);
  });

  it('lets only the treasurer upload, add a Pexels link, or remove, each logged', () => {
    const api = readSrc('pages/api/ledger/festival-photos.ts');
    expect(api).toMatch(/session\.role !== 'admin' \|\| locals\.viewAsResident/);
    expect(api).toMatch(/intent === 'remove'/);
    expect(api).toMatch(/intent === 'link'/);
    expect(api).toMatch(/intent === 'upload'/);
    expect(api).toMatch(/sniffReceiptType/);
    expect(api.match(/publishLedgerAudit\(session, request, 'festival-photos'/g)).toHaveLength(4);
    const page = readSrc('pages/ledger/festival-photos.astro');
    expect(page).toMatch(/session\?\.role !== 'admin'/);
    expect(page).toMatch(/data-festival-upload/);
    expect(page).toMatch(/value="remove"/);
    const nav = readSrc('components/Navigation.astro');
    expect(nav).toMatch(/>\s*Admin\s*</);
    expect(nav).not.toMatch(/>\s*Activity\s*</);
    expect(nav).toMatch(/current === 'activity' \|\| current === 'festival-photos'/);
    const tabs = readSrc('components/AdminTabs.astro');
    expect(tabs).toContain("href: '/ledger/activity', label: 'Activity'");
    expect(tabs).toContain("href: '/ledger/festival-photos', label: 'Festival photos'");
    expect(readSrc('pages/ledger/activity.astro')).toMatch(/<AdminTabs current="activity" \/>/);
    expect(page).toMatch(/<AdminTabs current="festival-photos" \/>/);
    expect(readSrc('scripts/ledger-actions.ts')).toMatch(/festivalPhotoVariants/);
  });

  it('shows a pinned photo instead of the rotation', async () => {
    const { pickFestivalPhoto } = await import('../../src/lib/festival-images');
    const window = { slug: 'diwali' as const, title: 'Happy Diwali', date: '2026-11-08', days: ['2026-11-07', '2026-11-08'] };
    const photos = [0, 1, 2, 3, 4, 5, 6].map((i) => ({ ...pexels, id: i, photoKey: `px${i}`, pinned: false }));
    expect(pickFestivalPhoto(photos, window, '2026-11-08', 15 * 60)?.photoKey).toBe('px5');
    photos[0].pinned = true;
    expect(pickFestivalPhoto(photos, window, '2026-11-08', 15 * 60)?.photoKey).toBe('px0');
    expect(pickFestivalPhoto([], window, '2026-11-08', 15 * 60)).toBeNull();
    const api = readSrc('pages/api/ledger/festival-photos.ts');
    expect(api).toMatch(/intent === 'pin' \|\| intent === 'unpin'/);
    expect(readRepo('migrations/0019_festival_photo_pin.sql')).toMatch(/ADD COLUMN pinned/);
  });

  it('never fetches photos automatically; only the treasurer changes them', () => {
    const lib = readSrc('lib/festival-images.ts');
    expect(lib).not.toMatch(/api\.pexels\.com|PEXELS_API_KEY|refreshFestivalImages/);
    expect(readSrc('pages/index.astro')).toMatch(/await listFestivalPhotos\(festival\.slug\)/);
    expect(readSrc('pages/ledger/activity.astro')).toMatch(/Festival photos are never fetched automatically/);
  });

  it('ships a PC tool that scrapes Pexels with a stealth browser after a warm-up visit', () => {
    const tool = readRepo('tools/festival-photos/fetch.mjs');
    expect(tool).toMatch(/StealthPlugin/);
    expect(tool).toMatch(/page\.goto\('https:\/\/www\.pexels\.com\/'/);
    expect(tool).toMatch(/a\[class\*="mediacard" i\] img\[src\]/);
  });
});
