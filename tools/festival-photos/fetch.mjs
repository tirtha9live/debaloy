// Finds up to 7 landscape Pexels photos per festival and writes tools/festival-photos/out.sql.
// Pexels' search page is behind a Cloudflare challenge that servers cannot pass, so run this on a PC:
//   cd tools/festival-photos && npm install && npx playwright install chromium
//   npm run fetch                 # writes out.sql
//   cd ../.. && npx wrangler d1 execute debaloy-ledger --remote --file tools/festival-photos/out.sql
// Uploaded photos are kept; only Pexels photos for each festival are replaced.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { FESTIVALS, FESTIVAL_IMAGES_PER_FESTIVAL } from '../../src/lib/festivals.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const year = Number(process.argv.find((arg) => /^--year=\d{4}$/.test(arg))?.slice(7) ?? new Date().getFullYear());
const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7).split(',');

chromium.use(StealthPlugin());
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: ['--disable-blink-features=AutomationControlled'] });
const context = await browser.newContext({
  locale: 'en-IN',
  timezoneId: 'Asia/Kolkata',
  viewport: { width: 1366, height: 900 },
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
});
const page = await context.newPage();

async function passChallenge() {
  for (let i = 0; i < 30; i++) {
    if (!/just a moment/i.test(await page.title().catch(() => ''))) return true;
    await page.waitForTimeout(1000);
  }
  return false;
}

const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;
const cleanAlt = (alt) => (alt ?? '').replace(/^Free\s+/i, '').replace(/\s+Stock Photo$/i, '').trim().slice(0, 200);

await page.goto('https://www.pexels.com/', { waitUntil: 'domcontentloaded', referer: 'https://www.google.com/' });
if (!(await passChallenge())) throw new Error('Pexels warm-up did not pass the Cloudflare challenge.');

const statements = [];
for (const festival of FESTIVALS) {
  if (only && !only.includes(festival.slug)) continue;
  const url = `https://www.pexels.com/search/${encodeURIComponent(festival.query)}/?orientation=landscape`;
  await page.goto(url, { waitUntil: 'domcontentloaded', referer: 'https://www.pexels.com/' });
  if (!(await passChallenge())) {
    console.warn(`${festival.slug}: challenge not passed, skipped`);
    continue;
  }
  await page.waitForSelector('a[class*="mediacard" i] img[src]', { timeout: 20_000 }).catch(() => null);
  const found = await page.$$eval('a[class*="mediacard" i] img[src]', (nodes) =>
    nodes.map((img) => ({ src: img.getAttribute('src') ?? '', alt: img.getAttribute('alt') ?? '' })),
  );
  const photos = [];
  for (const item of found) {
    const src = item.src.split('?')[0];
    const id = src.match(/images\.pexels\.com\/photos\/(\d+)\//)?.[1];
    if (!id || photos.some((photo) => photo.id === id)) continue;
    photos.push({ id, src, alt: cleanAlt(item.alt) });
    if (photos.length === FESTIVAL_IMAGES_PER_FESTIVAL) break;
  }
  console.log(`${festival.slug} (“${festival.query}”): ${photos.length} photos`);
  if (!photos.length) continue;
  statements.push(`DELETE FROM festival_photos WHERE slug = ${sqlString(festival.slug)} AND source = 'pexels';`);
  for (const photo of photos) {
    statements.push(
      `INSERT OR IGNORE INTO festival_photos (slug, photo_key, source, source_url, alt, year) VALUES (${[
        sqlString(festival.slug),
        sqlString(`px${photo.id}`),
        "'pexels'",
        sqlString(photo.src),
        sqlString(photo.alt),
        year,
      ].join(', ')});`,
    );
  }
  await page.waitForTimeout(1500);
}
await browser.close();

const out = path.join(here, 'out.sql');
fs.writeFileSync(out, `${statements.join('\n')}\n`);
console.log(`\nWrote ${statements.length} statements to ${out}`);
