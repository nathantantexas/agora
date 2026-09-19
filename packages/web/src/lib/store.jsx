import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { defaultPrefs, normalizePrefs, setLocale, detectLocale, isLocale } from '@agora/core';

const KEY = 'agora.prefs.v1';
const UI_KEY = 'agora.ui.v1';

const Ctx = createContext(null);

// Keys the app used before it was renamed. Anyone who set preferences under the old name
// keeps them rather than being sent back through onboarding.
const LEGACY_KEYS = { 'agora.prefs.v1': 'takethefloor.prefs.v1', 'agora.ui.v1': 'takethefloor.ui.v1' };

function read(key, fallback) {
  try {
    let raw = localStorage.getItem(key);
    if (raw === null && LEGACY_KEYS[key]) {
      raw = localStorage.getItem(LEGACY_KEYS[key]);
      if (raw !== null) {
        localStorage.setItem(key, raw);
        localStorage.removeItem(LEGACY_KEYS[key]);
      }
    }
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota: ignore, state still lives in memory */
  }
}

function applyLang(lang) {
  setLocale(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

function initialUi() {
  const saved = read(UI_KEY, {});
  const lang = isLocale(saved.lang) ? saved.lang : detectLocale(typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
  applyLang(lang);
  return { checklist: [], ...saved, lang };
}

/** Preferences, language, and small UI state with no account: stored only in this browser. */
export function StoreProvider({ children }) {
  const [ui, setUiState] = useState(initialUi);
  const [prefs, setPrefsState] = useState(() => normalizePrefs(read(KEY, null) || defaultPrefs()));
  const [onboarded, setOnboarded] = useState(() => Boolean(read(KEY, null)));

  const setPrefs = useCallback((updater) => {
    setPrefsState((prev) => {
      const next = normalizePrefs(typeof updater === 'function' ? updater(prev) : updater);
      write(KEY, next);
      setOnboarded(true);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setPrefsState(defaultPrefs());
    setOnboarded(false);
  }, []);

  const setUi = useCallback((patch) => {
    if (patch.lang && isLocale(patch.lang)) applyLang(patch.lang);
    setUiState((prev) => {
      const next = { ...prev, ...patch };
      write(UI_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo(() => ({ prefs, setPrefs, resetPrefs, onboarded, ui, setUi, lang: ui.lang }), [prefs, setPrefs, resetPrefs, onboarded, ui, setUi]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
