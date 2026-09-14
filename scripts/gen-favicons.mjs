// One-off favicon generator: renders public/favicon.svg into a PNG-based
// favicon.ico (32x32) and apple-touch-icon.png (180x180) using sharp.
import sharp from 'sharp';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = await readFile(join(root, 'public', 'favicon.svg'));

// Modern browsers + Windows accept PNG-encoded ICO entries.
const icoPng = await sharp(svg).resize(32, 32).png().toBuffer();

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(1, 4); // image count

const entry = Buffer.alloc(16);
entry.writeUInt8(32, 0); // width
entry.writeUInt8(32, 1); // height
entry.writeUInt8(0, 2); // palette
entry.writeUInt8(0, 3); // reserved
entry.writeUInt16LE(1, 4); // color planes
entry.writeUInt16LE(32, 6); // bits per pixel
entry.writeUInt32LE(icoPng.length, 8); // size of image data
entry.writeUInt32LE(6 + 16, 12); // offset to image data

await writeFile(join(root, 'public', 'favicon.ico'), Buffer.concat([header, entry, icoPng]));
await sharp(svg).resize(180, 180).png().toFile(join(root, 'public', 'apple-touch-icon.png'));

console.log('Generated favicon.ico + apple-touch-icon.png');
