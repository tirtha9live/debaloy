import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readSrc(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, 'src', relativePath), 'utf8');
}

export function readRepo(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

export function srcPath(relativePath: string) {
  return path.join(ROOT, 'src', relativePath);
}

/** True if `needle` appears after `anchor` in file (first occurrences). */
export function appearsAfter(fileText: string, anchor: string, needle: string) {
  const a = fileText.indexOf(anchor);
  const n = fileText.indexOf(needle);
  if (a === -1 || n === -1) return false;
  return n > a;
}

/** True when each listed `await call` has publishLedgerAudit within the next ~400 chars. */
export function everySaveFollowedByPublish(fileText: string, awaitCalls: string[]) {
  for (const call of awaitCalls) {
    const anchor = `await ${call}`;
    let from = 0;
    while (from < fileText.length) {
      const start = fileText.indexOf(anchor, from);
      if (start === -1) break;
      const slice = fileText.slice(start, start + 400);
      const pub = slice.indexOf('publishLedgerAudit');
      if (pub === -1 || pub < anchor.length) return false;
      from = start + anchor.length;
    }
  }
  return true;
}

export function importSourcesFromTs(source: string) {
  const imports: string[] = [];
  const re = /^\s*import\s+(?:type\s+)?(?:[\w*{}\s,$]+)\s+from\s+['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(re)) {
    imports.push(match[1]);
  }
  return imports;
}

export function walkJsFiles(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkJsFiles(full, out);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) out.push(full);
  }
  return out;
}
