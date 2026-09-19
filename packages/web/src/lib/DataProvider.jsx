import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { localizeCities } from '@agora/core';
import { CITIES as RAW_CITIES } from './data.js';
import { useStore } from './store.jsx';

const Ctx = createContext(null);

/** Translation memories are loaded on demand so English users never download them. */
const LOADERS = {
  es: () => import('@data/i18n/es.json'),
  vi: () => import('@data/i18n/vi.json'),
};

/** Provides the city records in the active language. */
export function DataProvider({ children }) {
  const { lang } = useStore();
  const [strings, setStrings] = useState(null);

  useEffect(() => {
    let alive = true;
    const loader = LOADERS[lang];
    if (!loader) {
      setStrings(null);
      return undefined;
    }
    loader()
      .then((mod) => {
        const data = mod.default || mod;
        if (alive) setStrings(data.strings || null);
      })
      .catch(() => alive && setStrings(null));
    return () => {
      alive = false;
    };
  }, [lang]);

  const value = useMemo(() => {
    const cities = localizeCities(RAW_CITIES, strings);
    const byId = new Map(cities.map((c) => [c.cityId, c]));
    return { cities, cityById: (id) => byId.get(id) || null, translated: Boolean(strings) };
  }, [strings]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCities() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCities must be used inside DataProvider');
  return ctx;
}
