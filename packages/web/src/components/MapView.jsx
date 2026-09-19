import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Link } from 'react-router-dom';
import { DFW_CENTER, nextMeetingFor, daysBetween, formatDate, formatTime, relativeDays, t } from '@agora/core';

const PIN_SVG = (color, ring) =>
  `<svg class="pin" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg"><path d="M15 1C7.3 1 1 7.2 1 14.8 1 25 15 37 15 37s14-12 14-22.2C29 7.2 22.7 1 15 1z" fill="${color}" stroke="${ring}" stroke-width="1.5"/><circle cx="15" cy="14.5" r="5.2" fill="${ring}"/></svg>`;

function pinIcon(days) {
  const color = days == null ? 'var(--muted)' : days <= 3 ? 'var(--seq-3)' : days <= 10 ? 'var(--seq-2)' : 'var(--seq-1)';
  return L.divIcon({ className: '', html: PIN_SVG(color, 'var(--surface)'), iconSize: [30, 38], iconAnchor: [15, 36], popupAnchor: [0, -34] });
}

const YOU_ICON = L.divIcon({ className: '', html: '<svg class="pin you" viewBox="0 0 22 22" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="9" fill="var(--accent)" stroke="var(--surface)" stroke-width="3"/></svg>', iconSize: [22, 22], iconAnchor: [11, 11] });

function FlyTo({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo([target.lat, target.lng], Math.max(map.getZoom(), 11), { duration: 0.6 });
  }, [target, map]);
  return null;
}

function Resize({ visible }) {
  const map = useMap();
  useEffect(() => {
    if (!visible) return undefined;
    const timer = setTimeout(() => map.invalidateSize(), 50);
    const onResize = () => map.invalidateSize();
    window.addEventListener('resize', onResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', onResize);
    };
  }, [map, visible]);
  return null;
}

/**
 * The DFW map. Pins are colored by how soon the next meeting is (darker = sooner).
 * Every pin is keyboard focusable; Enter opens the popup.
 */
export default function MapView({ cities, today, selectedCityId, onSelectCity, you, flyTarget, visible = true }) {
  const pins = useMemo(
    () =>
      cities.map((city) => {
        const next = nextMeetingFor(city, today);
        const days = next ? daysBetween(today, next.date) : null;
        return { city, next, days };
      }),
    [cities, today],
  );

  return (
    <MapContainer center={[DFW_CENTER.lat, DFW_CENTER.lng]} zoom={9} minZoom={8} maxZoom={17} scrollWheelZoom zoomControl={false} preferCanvas={false} attributionControl>
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Resize visible={visible} />
      <FlyTo target={flyTarget} />
      {pins.map(({ city, next, days }) => (
        <Marker
          key={city.cityId}
          position={[city.cityHall.lat, city.cityHall.lng]}
          icon={pinIcon(days)}
          alt={t('map.cityHallPin', { city: city.name })}
          title={`${city.name}: ${next ? t('map.nextMeeting', { date: formatDate(next.date), time: formatTime(next.time) }) : t('map.noMeetingScheduled')}`}
          eventHandlers={{ click: () => onSelectCity && onSelectCity(city.cityId), keypress: (e) => e.originalEvent.key === 'Enter' && onSelectCity && onSelectCity(city.cityId) }}
          zIndexOffset={selectedCityId === city.cityId ? 1000 : 0}
        >
          <Popup>
            <strong>{city.name}</strong>
            <br />
            {next ? (
              <>
                {next.label}
                <br />
                {formatDate(next.date)}, {formatTime(next.time)} ({relativeDays(next.date, today).toLowerCase()})
              </>
            ) : (
              t('common.noMeetingFound')
            )}
            <br />
            <Link className="btn small primary" to={`/city/${city.cityId}`}>
              {t('drawer.cityPage')}
            </Link>
          </Popup>
        </Marker>
      ))}
      {you && <Marker position={[you.lat, you.lng]} icon={YOU_ICON} alt={t('map.yourLocation')} title={t('map.youAreHere')} interactive={false} />}
    </MapContainer>
  );
}
