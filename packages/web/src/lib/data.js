/**
 * Bundled data plus the core engine, so the app works even with no API server.
 * Network-only features (news, geocoding, AI) live in api.js and degrade gracefully.
 */
import citiesFile from '@data/cities.json';
import { todayStr } from '@agora/core';

export const CITIES = Object.freeze(citiesFile.cities);
export const DATA_GENERATED_AT = citiesFile.generatedAt;
export const CITY_BY_ID = new Map(CITIES.map((c) => [c.cityId, c]));

/** Central-time calendar date, refreshed on every call so long-open tabs stay correct. */
export function today() {
  return todayStr('America/Chicago');
}

export function cityById(id) {
  return CITY_BY_ID.get(id) || null;
}
