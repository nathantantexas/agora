/**
 * Verify that every locale dictionary mirrors the English one: same keys, same array
 * lengths, and the same {parameters} in each string. Exits non-zero on problems.
 *
 * Usage: node scripts/i18n-check.mjs
 */
import { DICTIONARIES, dictionaryKeys, LOCALES } from '../packages/core/src/i18n/index.js';

const en = DICTIONARIES.en;
const enKeys = dictionaryKeys(en);
let problems = 0;

function get(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict);
}

function params(s) {
  return [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
}

for (const { code } of LOCALES) {
  if (code === 'en') continue;
  const dict = DICTIONARIES[code];
  const keys = new Set(dictionaryKeys(dict));
  const missing = enKeys.filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !enKeys.includes(k));
  const issues = [];
  for (const key of enKeys) {
    if (!keys.has(key)) continue;
    const a = get(en, key);
    const b = get(dict, key);
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) issues.push(`${key}: array length ${Array.isArray(b) ? b.length : 'n/a'} vs ${a.length}`);
      else if (typeof a[0] === 'object') {
        a.forEach((item, i) => {
          for (const f of Object.keys(item)) if (typeof b[i][f] !== 'string' || !b[i][f]) issues.push(`${key}[${i}].${f}: empty`);
        });
      }
    } else if (typeof a === 'string') {
      if (typeof b !== 'string' || !b.trim()) issues.push(`${key}: empty`);
      else if (params(a) !== params(b)) issues.push(`${key}: params {${params(b)}} vs {${params(a)}}`);
      else if (/\u2014|\u2013/.test(b)) issues.push(`${key}: contains an em dash or en dash`);
    }
  }
  const total = missing.length + extra.length + issues.length;
  problems += total;
  console.log(`${code}: ${enKeys.length - missing.length}/${enKeys.length} keys${total ? `, ${total} problems` : ' OK'}`);
  for (const m of missing.slice(0, 15)) console.log(`  missing ${m}`);
  if (missing.length > 15) console.log(`  ... ${missing.length - 15} more missing`);
  for (const e of extra.slice(0, 10)) console.log(`  extra ${e}`);
  for (const i of issues.slice(0, 25)) console.log(`  ${i}`);
  if (issues.length > 25) console.log(`  ... ${issues.length - 25} more issues`);
}

process.exit(problems ? 1 : 0);
