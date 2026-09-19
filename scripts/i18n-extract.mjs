/**
 * Collect every translatable English string from data/cities/*.json into
 * data/i18n/source-strings.json (sorted, deduplicated), and report what each
 * locale's translation memory still lacks.
 *
 * Usage: node scripts/i18n-extract.mjs [--chunks N]   (writes chunk files for translators)
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCityStrings } from '../packages/core/src/i18n/data.js';
import { LOCALES } from '../packages/core/src/i18n/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const citiesDir = path.join(root, 'data', 'cities');
const outDir = path.join(root, 'data', 'i18n');
mkdirSync(outDir, { recursive: true });

const strings = new Set();
for (const file of readdirSync(citiesDir).filter((f) => f.endsWith('.json'))) {
  const city = JSON.parse(readFileSync(path.join(citiesDir, file), 'utf8'));
  collectCityStrings(city, strings);
}
const list = [...strings].sort((a, b) => a.localeCompare(b));
writeFileSync(path.join(outDir, 'source-strings.json'), JSON.stringify(list, null, 2));
const words = list.reduce((n, s) => n + s.split(/\s+/).length, 0);
console.log(`${list.length} unique strings, about ${words} words, written to data/i18n/source-strings.json`);

const chunkArg = process.argv.indexOf('--chunks');
if (chunkArg !== -1) {
  const n = Math.max(1, Number(process.argv[chunkArg + 1]) || 1);
  const per = Math.ceil(list.length / n);
  for (let i = 0; i < n; i += 1) {
    const chunk = list.slice(i * per, (i + 1) * per);
    writeFileSync(path.join(outDir, `chunk-${i + 1}.json`), JSON.stringify(chunk, null, 2));
  }
  console.log(`Wrote ${n} chunk files (about ${per} strings each) to data/i18n/`);
}

for (const locale of LOCALES) {
  if (locale.code === 'en') continue;
  const file = path.join(outDir, `${locale.code}.json`);
  if (!existsSync(file)) {
    console.log(`${locale.code}: no translation memory yet (data/i18n/${locale.code}.json)`);
    continue;
  }
  const memory = JSON.parse(readFileSync(file, 'utf8'));
  const table = memory.strings || memory;
  const missing = list.filter((s) => !table[s]);
  console.log(`${locale.code}: ${list.length - missing.length}/${list.length} data strings translated${missing.length ? `, ${missing.length} missing` : ''}`);
}
