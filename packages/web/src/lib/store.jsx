import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { defaultPrefs, normalizePrefs, setLocale, detectLocale, isLocale, t } from '@agora/core';

/**
 * Profiles, preferences, language, and small UI state.
 *
 * Everything here lives in this browser and nothing is sent anywhere. A profile is not
 * an account on a server: it is a separate saved setup on this device, so a shared
 * laptop can hold one for each person. Because there is no server, the only recovery
 * that can exist is exporting a profile to a file and importing it somewhere else,
 * which is what exportProfile and importProfile are for.
 */
const PROFILES_KEY = 'agora.profiles.v1';

// Keys from before profiles existed, and from before the app was renamed. Anyone with a
// saved setup keeps it as their first profile rather than being sent back to onboarding.
const LEGACY_PREFS = ['agora.prefs.v1', 'takethefloor.prefs.v1'];
const LEGACY_UI = ['agora.ui.v1', 'takethefloor.ui.v1'];

const Ctx = createContext(null);

function readRaw(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function readJson(keys, fallback) {
  for (const key of [].concat(keys)) {
    const raw = readRaw(key);
    if (raw === null) continue;
    try {
      return JSON.parse(raw);
    } catch {
      /* corrupt entry: fall through to the next key */
    }
  }
  return fallback;
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode or quota: ignore, state still lives in memory */
  }
}

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return `p_${crypto.randomUUID().slice(0, 8)}`;
  } catch {
    /* fall through */
  }
  return `p_${Math.random().toString(36).slice(2, 10)}`;
}

function deviceLang() {
  return detectLocale(typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []);
}

function applyLang(lang) {
  setLocale(lang);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** An email is only ever kept to prefill your own drafts, so a loose shape check is enough. */
function cleanEmail(value) {
  const s = String(value || '').trim().slice(0, 120);
  return s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : '';
}

function makeProfile(patch = {}) {
  return {
    id: newId(),
    name: String(patch.name || '').trim().slice(0, 40) || t('profile.defaultName'),
    email: cleanEmail(patch.email),
    lang: isLocale(patch.lang) ? patch.lang : deviceLang(),
    createdAt: new Date().toISOString(),
    onboarded: Boolean(patch.onboarded),
    prefs: normalizePrefs(patch.prefs || defaultPrefs()),
    ui: { checklist: Array.isArray(patch.ui && patch.ui.checklist) ? patch.ui.checklist : [] },
  };
}

/** Repair anything hand-edited or imported so the rest of the app can trust the shape. */
function normalizeProfile(p) {
  const base = makeProfile(p || {});
  return { ...base, id: (p && p.id) || base.id, createdAt: (p && p.createdAt) || base.createdAt };
}

function initialState() {
  const stored = readJson(PROFILES_KEY, null);
  if (stored && Array.isArray(stored.profiles) && stored.profiles.length) {
    const profiles = stored.profiles.map(normalizeProfile);
    const activeId = profiles.some((p) => p.id === stored.activeId) ? stored.activeId : profiles[0].id;
    return { activeId, profiles };
  }

  // First run, or an upgrade from the single-setup version that came before profiles.
  const oldPrefs = readJson(LEGACY_PREFS, null);
  const oldUi = readJson(LEGACY_UI, null) || {};
  const profile = makeProfile({
    prefs: oldPrefs || defaultPrefs(),
    ui: oldUi,
    lang: isLocale(oldUi.lang) ? oldUi.lang : undefined,
    onboarded: Boolean(oldPrefs),
  });
  const next = { activeId: profile.id, profiles: [profile] };

  // Persist immediately. Without this the migrated profile only lives in memory until the
  // first edit, so a visitor who just reads a page and leaves would be migrated again on
  // every visit, and a new id each time makes the stored state hard to reason about.
  write(PROFILES_KEY, next);
  if (oldPrefs) {
    for (const key of [...LEGACY_PREFS, ...LEGACY_UI]) {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
  }
  return next;
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(() => {
    const initial = initialState();
    const active = initial.profiles.find((p) => p.id === initial.activeId);
    applyLang(active.lang);
    return initial;
  });

  const active = state.profiles.find((p) => p.id === state.activeId) || state.profiles[0];

  /** Persist and apply a change to the active profile. */
  const patchActive = useCallback((patch) => {
    setState((prev) => {
      const profiles = prev.profiles.map((p) => (p.id === prev.activeId ? { ...p, ...(typeof patch === 'function' ? patch(p) : patch) } : p));
      const next = { ...prev, profiles };
      write(PROFILES_KEY, next);
      return next;
    });
  }, []);

  const setPrefs = useCallback(
    (updater) => {
      patchActive((p) => ({ prefs: normalizePrefs(typeof updater === 'function' ? updater(p.prefs) : updater), onboarded: true }));
    },
    [patchActive],
  );

  const resetPrefs = useCallback(() => {
    patchActive({ prefs: defaultPrefs(), onboarded: false });
  }, [patchActive]);

  const setUi = useCallback(
    (patch) => {
      if (patch.lang && isLocale(patch.lang)) {
        applyLang(patch.lang);
        patchActive({ lang: patch.lang });
      }
      const { lang, ...rest } = patch;
      if (Object.keys(rest).length) patchActive((p) => ({ ui: { ...p.ui, ...rest } }));
    },
    [patchActive],
  );

  const switchProfile = useCallback((id) => {
    setState((prev) => {
      if (!prev.profiles.some((p) => p.id === id) || id === prev.activeId) return prev;
      const next = { ...prev, activeId: id };
      applyLang(next.profiles.find((p) => p.id === id).lang);
      write(PROFILES_KEY, next);
      return next;
    });
  }, []);

  /** Create a profile and switch to it. Returns the new id. */
  const createProfile = useCallback((patch = {}) => {
    const profile = makeProfile({ ...patch, lang: patch.lang || undefined });
    setState((prev) => {
      const next = { activeId: profile.id, profiles: [...prev.profiles, profile] };
      applyLang(profile.lang);
      write(PROFILES_KEY, next);
      return next;
    });
    return profile.id;
  }, []);

  const updateProfile = useCallback((id, patch) => {
    setState((prev) => {
      const profiles = prev.profiles.map((p) =>
        p.id === id
          ? {
              ...p,
              ...(patch.name !== undefined ? { name: String(patch.name).trim().slice(0, 40) || p.name } : {}),
              ...(patch.email !== undefined ? { email: cleanEmail(patch.email) } : {}),
            }
          : p,
      );
      const next = { ...prev, profiles };
      write(PROFILES_KEY, next);
      return next;
    });
  }, []);

  /** Removing the last profile leaves a fresh empty one rather than no profile at all. */
  const deleteProfile = useCallback((id) => {
    setState((prev) => {
      const remaining = prev.profiles.filter((p) => p.id !== id);
      const profiles = remaining.length ? remaining : [makeProfile()];
      const activeId = profiles.some((p) => p.id === prev.activeId) ? prev.activeId : profiles[0].id;
      const next = { activeId, profiles };
      applyLang(profiles.find((p) => p.id === activeId).lang);
      write(PROFILES_KEY, next);
      return next;
    });
  }, []);

  /** A portable copy of one profile. This is the only recovery there can be with no server. */
  const exportProfile = useCallback(
    (id) => {
      const p = state.profiles.find((x) => x.id === id) || active;
      return { agoraProfile: 1, exportedAt: new Date().toISOString(), profile: { name: p.name, email: p.email, lang: p.lang, onboarded: p.onboarded, prefs: p.prefs, ui: p.ui } };
    },
    [state.profiles, active],
  );

  const importProfile = useCallback(
    (data) => {
      if (!data || data.agoraProfile !== 1 || !data.profile) throw new Error(t('profile.importBadFile'));
      return createProfile(data.profile);
    },
    [createProfile],
  );

  const value = useMemo(
    () => ({
      prefs: active.prefs,
      setPrefs,
      resetPrefs,
      onboarded: active.onboarded,
      ui: active.ui,
      setUi,
      lang: active.lang,
      profile: active,
      profiles: state.profiles,
      switchProfile,
      createProfile,
      updateProfile,
      deleteProfile,
      exportProfile,
      importProfile,
    }),
    [active, setPrefs, resetPrefs, setUi, state.profiles, switchProfile, createProfile, updateProfile, deleteProfile, exportProfile, importProfile],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore must be used inside StoreProvider');
  return ctx;
}
