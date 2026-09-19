/** Node-only data loading. The browser bundle imports the JSON directly instead. */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(here, '..', '..', '..');
export const DATA_DIR = path.join(REPO_ROOT, 'data');

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadCities() {
  const merged = path.join(DATA_DIR, 'cities.json');
  const data = readJson(merged, null);
  if (!data) {
    throw new Error(`Missing ${merged}. Run "npm run build:data" first.`);
  }
  return data.cities;
}

export function loadNews() {
  return readJson(path.join(DATA_DIR, 'news.json'), { sources: [], topicLinks: [] });
}

/** Translation memory for city data in one language ({ english: translated }), or null for English. */
export function loadTranslations(lang) {
  if (!lang || lang === 'en') return null;
  const data = readJson(path.join(DATA_DIR, 'i18n', `${lang}.json`), null);
  return data ? data.strings || null : null;
}

export function loadMeta() {
  const data = readJson(path.join(DATA_DIR, 'cities.json'), null);
  return data ? { generatedAt: data.generatedAt, cityCount: data.cities.length } : null;
}
