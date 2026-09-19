import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { upcomingMeetings, matchMeetings, cityPoint, BRAND, t, tn } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import MapView from '../components/MapView.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import MeetingDrawer from '../components/MeetingDrawer.jsx';
import { ScheduleRibbon } from '../components/viz.jsx';
import { StarIcon, ArrowIcon } from '../components/icons.jsx';

const WINDOWS = [
  { days: 7, key: 'map.thisWeek' },
  { days: 14, key: 'map.twoWeeks' },
  { days: 30, key: 'map.thirtyDays' },
  { days: 60, key: 'map.sixtyDays' },
];

export default function MapPage() {
  const { prefs, onboarded } = useStore();
  const { cities, cityById } = useCities();
  const today = todayFn();
  const [days, setDays] = useState(14);
  const [eveningOnly, setEveningOnly] = useState(false);
  const [speakOnly, setSpeakOnly] = useState(false);
  const [mode, setMode] = useState('for-you');
  const [selectedCityId, setSelectedCityId] = useState(null);
  const [openMeeting, setOpenMeeting] = useState(null);

  const list = useMemo(() => {
    let items;
    if (mode === 'for-you' && onboarded) items = matchMeetings(cities, prefs, { today, days, limit: 200 });
    else items = upcomingMeetings(cities, { from: today, days });
    if (eveningOnly) items = items.filter((m) => m.isEvening);
    if (speakOnly) items = items.filter((m) => m.openToPublicComment);
    if (selectedCityId) items = items.filter((m) => m.cityId === selectedCityId);
    return items;
  }, [cities, mode, onboarded, prefs, today, days, eveningOnly, speakOnly, selectedCityId]);

  const selectedCity = selectedCityId ? cityById(selectedCityId) : null;
  const flyTarget = useMemo(() => (selectedCity ? cityPoint(selectedCity) : null), [selectedCity]);
  const onSelectCity = useCallback((id) => setSelectedCityId((cur) => (cur === id ? null : id)), []);
  const closeDrawer = useCallback(() => setOpenMeeting(null), []);
  const resetFilters = () => {
    setEveningOnly(false);
    setSpeakOnly(false);
    setSelectedCityId(null);
    setDays(30);
  };

  return (
    <div className="map-page">
      <section className="map-side" aria-label={t('map.meetingList')}>
        {!onboarded && (
          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ marginBottom: 6 }}>{BRAND.tagline}</h2>
            <p className="muted">{BRAND.shortDescription}</p>
            <Link to="/start" className="btn primary">
              <StarIcon /> {t('map.setMyInterests')}
            </Link>
          </div>
        )}
        <h1 style={{ fontSize: '1.3rem', marginBottom: 10 }}>
          {selectedCity ? t('map.cityMeetings', { city: selectedCity.name }) : mode === 'for-you' && onboarded ? t('map.yourBestMatches') : t('map.upcomingMeetings')}
        </h1>
        <p className="visually-hidden" role="status" aria-live="polite">
          {tn('map.meetingsShown', list.length, { where: selectedCity ? t('map.forCity', { city: selectedCity.name }) : '' })}
        </p>

        <div className="chips" style={{ marginBottom: 12 }}>
          {onboarded && (
            <button type="button" className="chip small" aria-pressed={mode === 'for-you'} onClick={() => setMode(mode === 'for-you' ? 'all' : 'for-you')}>
              <StarIcon /> {t('map.forYou')}
            </button>
          )}
          {WINDOWS.map((w) => (
            <button key={w.days} type="button" className="chip small" aria-pressed={days === w.days} onClick={() => setDays(w.days)}>
              {t(w.key)}
            </button>
          ))}
          <button type="button" className="chip small" aria-pressed={eveningOnly} onClick={() => setEveningOnly((v) => !v)}>
            {t('map.evenings')}
          </button>
          <button type="button" className="chip small" aria-pressed={speakOnly} onClick={() => setSpeakOnly((v) => !v)}>
            {t('map.canSpeak')}
          </button>
          {selectedCity && (
            <button type="button" className="chip small on" onClick={() => setSelectedCityId(null)} aria-label={t('map.clearCity', { city: selectedCity.name })}>
              {selectedCity.name}
            </button>
          )}
        </div>

        {/* The strip answers "is anything happening soon" before the list answers "what". */}
        {list.length > 0 && <ScheduleRibbon meetings={list} from={today} days={days} title={t('viz.ribbonTitle', { n: days })} compact />}

        <ul className="rows">
          {list.slice(0, 60).map((m) => (
            <li key={m.id}>
              <MeetingCard meeting={m} today={today} onSelect={setOpenMeeting} selected={Boolean(openMeeting && openMeeting.id === m.id)} compact={mode !== 'for-you'} />
            </li>
          ))}
        </ul>
        {list.length === 0 && (
          <div className="empty">
            <p>{t('map.noMatch')}</p>
            <button type="button" className="btn" onClick={resetFilters}>
              {t('map.resetFilters')}
            </button>
          </div>
        )}
      </section>

      <section className="map-main" aria-label={t('map.mapOfCityHalls')}>
        <div className="map-toolbar">
          {selectedCity && (
            <Link to={`/city/${selectedCity.cityId}`} className="btn small primary">
              {t('map.cityDetails', { city: selectedCity.name })} <ArrowIcon />
            </Link>
          )}
        </div>
        <MapView cities={cities} today={today} selectedCityId={selectedCityId} onSelectCity={onSelectCity} you={prefs.location} flyTarget={flyTarget} />
        <p className="visually-hidden">
          {t('map.mapAlt', { n: cities.length })} {selectedCity ? t('map.citySelected', { city: selectedCity.name }) : ''}
        </p>
      </section>

      {openMeeting && <MeetingDrawer meeting={openMeeting} city={cityById(openMeeting.cityId)} today={today} onClose={closeDrawer} />}
    </div>
  );
}
