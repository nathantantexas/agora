import { isInDfw, findCity, cityPoint } from '@agora/core';

/**
 * Turn "75230", "Plano", or "10600 Preston Rd, Dallas" into a DFW lat/lng.
 * City names resolve locally with no network call. Everything else goes to
 * OpenStreetMap Nominatim (free, no key) restricted to the DFW bounding box.
 *
 * Nominatim's usage policy allows about one request per second per application, so
 * outbound calls are serialized with a short gap, results (including misses) are cached
 * in a bounded map, and queries are capped in length.
 */
const MAX_QUERY_LENGTH = 120;
const CACHE_MAX = 300;
const HIT_TTL_MS = 24 * 60 * 60 * 1000;
const MISS_TTL_MS = 60 * 60 * 1000;
const MIN_GAP_MS = 1100;
const USER_AGENT = 'Agora civic app (student project; contact via GitHub)';

const cache = new Map();
let lastRequestAt = 0;
let queue = Promise.resolve();

function remember(key, value, ttl) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { value, expires: Date.now() + ttl });
}

function recall(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires < Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

/** Run outbound requests one at a time with at least MIN_GAP_MS between them. */
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  queue = run.catch(() => {});
  return run;
}

export function normalizeQuery(query) {
  return String(query || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export async function geocode(query, cities) {
  const q = normalizeQuery(query);
  if (!q) return null;
  const city = findCity(cities, q);
  if (city && city.name.toLowerCase() === q.toLowerCase()) {
    const p = cityPoint(city);
    return { query: q, label: `${city.name}, TX`, lat: p.lat, lng: p.lng, cityId: city.cityId, source: 'local' };
  }

  const key = q.toLowerCase();
  const cached = recall(key);
  if (cached !== undefined) return cached;

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('viewbox', '-97.6,33.4,-96.3,32.4');
  url.searchParams.set('bounded', '1');
  url.searchParams.set('q', /^\d{5}$/.test(q) ? `${q}, Texas` : q);

  const result = await throttled(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = await res.json();
      const row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return null;
      const point = { lat: Number(row.lat), lng: Number(row.lon) };
      if (!isInDfw(point)) return null;
      return { query: q, label: shortLabel(row.display_name), lat: round3(point.lat), lng: round3(point.lng), cityId: city ? city.cityId : null, source: 'nominatim' };
    } finally {
      clearTimeout(timer);
    }
  });
  remember(key, result, result ? HIT_TTL_MS : MISS_TTL_MS);
  return result;
}

/** About 100 meters of precision: enough for distances, not enough to identify a house. */
function round3(n) {
  return Math.round(n * 1000) / 1000;
}

/** "10600, Preston Road, Dallas, Dallas County, Texas" -> "Preston Road, Dallas" (no house number). */
function shortLabel(displayName) {
  const parts = String(displayName || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const withoutNumber = parts.length && /^\d+[a-z]?$/i.test(parts[0]) ? parts.slice(1) : parts;
  return withoutNumber.slice(0, 2).join(', ');
}
