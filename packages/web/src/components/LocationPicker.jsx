import { useState } from 'react';
import { findCity, cityPoint, isInDfw, nearestCity, t } from '@agora/core';
import { useCities } from '../lib/DataProvider.jsx';
import { api } from '../lib/api.js';
import { LocateIcon } from './icons.jsx';

/** About 100 meters of precision: enough to measure distance, not enough to identify a house. */
function coarse(p) {
  return { lat: Math.round(p.lat * 1000) / 1000, lng: Math.round(p.lng * 1000) / 1000 };
}

/**
 * Pick a home city, and optionally a precise location (browser geolocation or a ZIP/address
 * through the API). Works with no API: the city hall becomes the location.
 */
export default function LocationPicker({ value, onChange }) {
  const { cities } = useCities();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState({ kind: 'idle', text: '' });
  const update = (patch) => onChange((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  const hallLabel = (city) => t('common.cityHallOf', { city: city.name });

  const setCity = (cityId) => {
    const city = findCity(cities, cityId);
    if (!city) return update({ homeCityId: null });
    update((prev) => {
      const keepPrecise = prev.location && prev.locationLabel && prev.locationLabel !== hallLabel(city) && !/City Hall$/.test(prev.locationLabel);
      return { homeCityId: city.cityId, location: keepPrecise ? prev.location : cityPoint(city), locationLabel: keepPrecise ? prev.locationLabel : hallLabel(city) };
    });
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return setStatus({ kind: 'error', text: t('location.noGeo') });
    setStatus({ kind: 'loading', text: t('location.finding') });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = coarse({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        if (!isInDfw(p)) return setStatus({ kind: 'error', text: t('location.outsideDfw') });
        const near = nearestCity(cities, p);
        update((prev) => ({ location: p, locationLabel: t('common.yourCurrentArea'), homeCityId: prev.homeCityId || (near ? near.city.cityId : null) }));
        setStatus({ kind: 'ok', text: t('location.usingArea', { near: near ? t('location.nearCity', { city: near.city.name }) : '' }) });
      },
      () => setStatus({ kind: 'error', text: t('location.denied') }),
      { timeout: 8000, maximumAge: 600000 },
    );
  };

  const search = async (e) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const city = findCity(cities, q);
    if (city && city.name.toLowerCase() === q.toLowerCase()) {
      setCity(city.cityId);
      return setStatus({ kind: 'ok', text: t('location.usingCityHall', { city: city.name }) });
    }
    setStatus({ kind: 'loading', text: t('location.lookingUp') });
    try {
      const r = await api.geocode(q);
      const p = coarse(r);
      const near = nearestCity(cities, p);
      update((prev) => ({ location: p, locationLabel: r.label, homeCityId: prev.homeCityId || r.cityId || (near ? near.city.cityId : null) }));
      setStatus({ kind: 'ok', text: t('location.found', { label: r.label }) });
    } catch {
      setStatus({ kind: 'error', text: t('location.lookupFailed') });
    }
  };

  return (
    <div className="stack">
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor="home-city">{t('location.yourCity')}</label>
        <select id="home-city" value={value.homeCityId || ''} onChange={(e) => setCity(e.target.value)}>
          <option value="">{t('location.chooseCity')}</option>
          {cities.map((c) => (
            <option key={c.cityId} value={c.cityId}>
              {c.name} ({t('location.countyOf', { county: c.county })})
            </option>
          ))}
        </select>
      </div>
      <form onSubmit={search} className="row" aria-label={t('location.preciseLocation')}>
        <div style={{ flex: '1 1 200px' }}>
          <label htmlFor="loc-query" className="visually-hidden">
            {t('location.zipLabel')}
          </label>
          <input id="loc-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('location.zipPlaceholder')} inputMode="text" autoComplete="postal-code" maxLength={120} />
        </div>
        <button type="submit" className="btn">
          {t('location.find')}
        </button>
        <button type="button" className="btn" onClick={useMyLocation}>
          <LocateIcon /> {t('location.useMyLocation')}
        </button>
      </form>
      <p className="hint" role="status" aria-live="polite">
        {status.kind === 'loading' && <span className="spinner" style={{ marginRight: 6 }} />}
        {status.text || (value.locationLabel ? t('location.measuredFrom', { label: value.locationLabel }) : '')}
      </p>
    </div>
  );
}
