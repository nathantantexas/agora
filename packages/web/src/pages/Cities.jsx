import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { nextMeetingFor, expandCityMeetings, addDays, formatDate, formatTime, relativeDays, describeRecurrence, haversineMiles, cityPoint, milesText, t, tn } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { CadenceStrip } from '../components/viz.jsx';

const CADENCE_DAYS = 42;

export default function Cities() {
  const { prefs } = useStore();
  const { cities } = useCities();
  const today = todayFn();
  const [q, setQ] = useState('');
  const [county, setCounty] = useState('');
  const [sort, setSort] = useState(prefs.location ? 'distance' : 'name');

  const counties = useMemo(() => [...new Set(cities.map((c) => c.county))].sort(), [cities]);
  const rows = useMemo(() => {
    const horizon = addDays(today, CADENCE_DAYS);
    let list = cities.map((city) => ({
      city,
      next: nextMeetingFor(city, today),
      miles: prefs.location ? haversineMiles(prefs.location, cityPoint(city)) : null,
      dates: new Set(
        expandCityMeetings(city, today, horizon)
          .filter((m) => m.status !== 'cancelled')
          .map((m) => m.date),
      ),
    }));
    if (q) list = list.filter((r) => r.city.name.toLowerCase().includes(q.toLowerCase()));
    if (county) list = list.filter((r) => r.city.county === county);
    list.sort((a, b) => {
      if (sort === 'distance' && a.miles != null && b.miles != null) return a.miles - b.miles;
      if (sort === 'next') return (a.next ? a.next.date : '9').localeCompare(b.next ? b.next.date : '9');
      return a.city.name.localeCompare(b.city.name);
    });
    return list;
  }, [cities, q, county, sort, today, prefs.location]);

  return (
    <div className="container">
      <h1>{t('cities.heading', { n: cities.length })}</h1>

      <div className="row" style={{ margin: '14px 0 14px' }}>
        <div style={{ flex: '1 1 240px' }}>
          <label htmlFor="city-search" className="visually-hidden">
            {t('cities.search')}
          </label>
          <input id="city-search" type="search" placeholder={t('cities.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div>
          <label htmlFor="sort" className="visually-hidden">
            {t('cities.sort')}
          </label>
          <select id="sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">{t('cities.sortAZ')}</option>
            <option value="next">{t('cities.sortSoonest')}</option>
            {prefs.location && <option value="distance">{t('cities.sortNearest')}</option>}
          </select>
        </div>
      </div>

      <div className="filters" role="group" aria-label={t('cities.county')}>
        <span className="label">{t('cities.county')}</span>
        <button type="button" className="chip small" aria-pressed={county === ''} onClick={() => setCounty('')}>
          {t('cities.allCounties')}
        </button>
        {counties.map((c) => (
          <button key={c} type="button" className="chip small" aria-pressed={county === c} onClick={() => setCounty(c)}>
            {c}
          </button>
        ))}
      </div>

      <ul className="rows">
        {rows.map(({ city, next, miles, dates }) => {
          const evening = city.meetings.some((m) => Number(m.recurrence.time.split(':')[0]) >= 17);
          const isHome = prefs.homeCityId === city.cityId;
          return (
            <li key={city.cityId}>
              <div className="city-row">
                <div>
                  <h3 className="name">
                    <Link to={`/city/${city.cityId}`}>{city.name}</Link>
                  </h3>
                  <p className="meta" style={{ margin: 0 }}>
                    {t('location.countyOf', { county: city.county })}
                    {miles != null ? ` · ${milesText(miles)}` : ''}
                    {isHome ? ` · ${t('common.yourCity')}` : ''}
                  </p>
                </div>

                <div className="cadence-cell">
                  <p className="next" style={{ margin: '0 0 2px' }}>
                    {next ? (
                      <>
                        <strong>{formatDate(next.date)}</strong>, {formatTime(next.time)} <span className="muted">· {relativeDays(next.date, today)}</span>
                      </>
                    ) : (
                      <span className="muted">{t('common.noMeetingFound')}</span>
                    )}
                  </p>
                  <p className="meta" style={{ margin: '0 0 5px' }}>
                    {describeRecurrence(city.meetings[0].recurrence)}
                    {city.meetings.length > 1 ? t('cities.plusMore', { n: city.meetings.length - 1 }) : ''}
                  </p>
                  {/* Six weeks of this council's calendar, so cadence reads at a glance down the page. */}
                  <span className="cadence-row">
                    <CadenceStrip dates={dates} from={today} days={CADENCE_DAYS} label={t('viz.cadenceHeading') + ': ' + tn('viz.cadenceAria', dates.size)} />
                    <span className="axis-note">{t('viz.cadenceHeading')}</span>
                  </span>
                </div>

                <div className="labels">
                  {evening && <span className="tag good">{t('common.eveningMeetings')}</span>}
                  {city.publicComment && city.publicComment.virtualAllowed && <span className="tag brand">{t('common.remoteComment')}</span>}
                  {(city.youthPrograms || []).length > 0 && <span className="tag">{t('common.youthPrograms')}</span>}
                  {(city.agendaItems || []).length > 0 && <span className="tag">{tn('common.agendaItems', city.agendaItems.length)}</span>}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      {rows.length === 0 && <p className="empty">{t('cities.noCitiesMatch')}</p>}
    </div>
  );
}
