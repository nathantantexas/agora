/**
 * Split a language's still-untranslated strings into numbered work files for translators.
 *
 * Usage: node scripts/i18n-split.mjs es 6
 * Writes data/i18n/todo-es-1.json ... todo-es-6.json (each a JSON array of English strings).
 */
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const lang = process.argv[2];
const parts = Math.max(1, Number(process.argv[3]) || 6);
if (!lang) {
  console.error('Usage: node scripts/i18n-split.mjs <lang> [parts]');
  process.exit(1);
}
const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'i18n');
for (const f of readdirSync(dir).filter((f) => f.startsWith(`todo-${lang}-`))) unlinkSync(path.join(dir, f));

const missing = JSON.parse(readFileSync(path.join(dir, `${lang}-missing.json`), 'utf8'));
// Balance by character count so no agent gets all the long strings.
const sorted = [...missing].sort((a, b) => b.length - a.length);
const buckets = Array.from({ length: parts }, () => ({ chars: 0, items: [] }));
for (const s of sorted) {
  const smallest = buckets.reduce((a, b) => (a.chars <= b.chars ? a : b));
  smallest.items.push(s);
  smallest.chars += s.length;
}
buckets.forEach((b, i) => {
  writeFileSync(path.join(dir, `todo-${lang}-${i + 1}.json`), JSON.stringify(b.items, null, 2));
  console.log(`todo-${lang}-${i + 1}.json: ${b.items.length} strings, ${b.chars} characters`);
});
