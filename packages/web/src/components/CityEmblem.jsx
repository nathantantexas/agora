import { useMemo } from 'react';
import { DFW_BOUNDS, t } from '@agora/core';
import { useCities } from '../lib/DataProvider.jsx';

/**
 * A locator mark for one city: the whole region as a field of faint marks, with this
 * city's hall struck through by a crosshair. Every city gets a visibly different emblem
 * because the position is real, so the set works as a visual identity and as information
 * at the same time. Drawn from the coordinates already in the data, so it costs nothing
 * to ship and carries no licensing of someone else's photograph.
 */
const COUNTY_INK = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

export default function CityEmblem({ city, size = 56, label }) {
  const { cities } = useCities();

  const { x, y, others, ink } = useMemo(() => {
    const span = { lng: DFW_BOUNDS.maxLng - DFW_BOUNDS.minLng, lat: DFW_BOUNDS.maxLat - DFW_BOUNDS.minLat };
    const place = (p) => ({
      x: 6 + ((p.lng - DFW_BOUNDS.minLng) / span.lng) * 52,
      // Latitude grows northward and SVG y grows downward, so this axis is inverted.
      y: 6 + ((DFW_BOUNDS.maxLat - p.lat) / span.lat) * 52,
    });
    const here = place(city.cityHall);
    const counties = [...new Set(cities.map((c) => c.county))].sort();
    return {
      ...here,
      others: cities.filter((c) => c.cityId !== city.cityId).map((c) => place(c.cityHall)),
      ink: COUNTY_INK[Math.max(0, counties.indexOf(city.county)) % COUNTY_INK.length],
    };
  }, [city, cities]);

  return (
    <svg
      className="emblem"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : 'true'}
    >
      <rect x="0.5" y="0.5" width="63" height="63" fill="var(--surface-2)" stroke="var(--ink)" strokeWidth="1" />
      {others.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="1.1" fill="var(--rule-strong)" />
      ))}
      <line x1="2" x2="62" y1={y} y2={y} stroke={ink} strokeWidth="0.6" strokeDasharray="2 2" />
      <line x1={x} x2={x} y1="2" y2="62" stroke={ink} strokeWidth="0.6" strokeDasharray="2 2" />
      <circle cx={x} cy={y} r="4.4" fill="var(--surface)" stroke={ink} strokeWidth="1.6" />
      <circle cx={x} cy={y} r="1.7" fill={ink} />
    </svg>
  );
}

/** The sentence a screen reader gets in place of the mark. */
export function emblemLabel(city) {
  return t('city.emblemAlt', { city: city.name, county: city.county });
}
