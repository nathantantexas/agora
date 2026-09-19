/**
 * Merge translator chunk files (data/i18n/<lang>-chunk-*.json, each an object mapping
 * English -> translation) into data/i18n/<lang>.json, then report coverage.
 *
 * Usage: node scripts/i18n-merge.mjs es   (or vi)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lang = process.argv[2];
if (!lang) {
  console.error('Usage: node scripts/i18n-merge.mjs <lang>');
  process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.resolve(here, '..', 'data', 'i18n');
const target = path.join(dir, `${lang}.json`);
const existing = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : { lang, strings: {} };
const strings = { ...(existing.strings || {}) };

let added = 0;
let bad = 0;
const chunks = readdirSync(dir).filter((f) => f.startsWith(`${lang}-chunk-`) && f.endsWith('.json'));
for (const file of chunks) {
  const map = JSON.parse(readFileSync(path.join(dir, file), 'utf8'));
  for (const [en, tr] of Object.entries(map)) {
    if (typeof tr !== 'string' || !tr.trim() || /\u2014|\u2013/.test(tr)) {
      bad += 1;
      continue;
    }
    if (!strings[en]) added += 1;
    strings[en] = tr.trim();
  }
}

const source = JSON.parse(readFileSync(path.join(dir, 'source-strings.json'), 'utf8'));
const missing = source.filter((s) => !strings[s]);
writeFileSync(target, JSON.stringify({ lang, generatedAt: new Date().toISOString().slice(0, 10), strings }, null, 1));
for (const file of chunks) unlinkSync(path.join(dir, file));
console.log(`${lang}: merged ${chunks.length} chunk files, ${added} new strings, ${bad} rejected, ${source.length - missing.length}/${source.length} covered`);
if (missing.length) {
  writeFileSync(path.join(dir, `${lang}-missing.json`), JSON.stringify(missing, null, 2));
  console.log(`  ${missing.length} still untranslated, listed in data/i18n/${lang}-missing.json`);
}
