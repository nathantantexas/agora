import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { defaultPrefs, normalizePrefs } from '@agora/core';

export const PREFS_PATH = process.env.AGORA_PREFS || path.join(os.homedir(), '.agora.json');

export function loadPrefs() {
  if (!existsSync(PREFS_PATH)) return { prefs: defaultPrefs(), saved: false };
  try {
    return { prefs: normalizePrefs(JSON.parse(readFileSync(PREFS_PATH, 'utf8'))), saved: true };
  } catch {
    return { prefs: defaultPrefs(), saved: false };
  }
}

export function savePrefs(prefs) {
  writeFileSync(PREFS_PATH, JSON.stringify(normalizePrefs(prefs), null, 2));
  return PREFS_PATH;
}
