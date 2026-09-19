import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { expandCityMeetings, addDays, weekdayOf, describeRecurrence, cityPoint, formatDate, formatTime, t, tn } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import MeetingDrawer, { AgendaItem } from '../components/MeetingDrawer.jsx';
import { ScheduleRibbon, MeetingClock } from '../components/viz.jsx';
import { ExternalIcon, MicIcon, PinIcon } from '../components/icons.jsx';

const HORIZON = 90;

/** Hostname for a source link, or null when the string is not a valid URL. */
function hostnameOf(s) {
  try {
    return new URL(s).hostname;
  } catch {
    return null;
  }
}

/** The weekday a rule lands on, so the clock can shade school hours correctly. */
function ruleWeekday(recurrence) {
  if (typeof recurrence.weekday === 'number') return recurrence.weekday;
  const first = (recurrence.dates || [])[0];
  return first ? weekdayOf(first) : 1;
}

export default function CityPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { prefs, setPrefs } = useStore();
  const { cityById } = useCities();
  const today = todayFn();
  const city = cityById(String(id).toLowerCase());
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);

  const upcoming = useMemo(() => (city ? expandCityMeetings(city, today, addDays(today, HORIZON)) : []), [city, today]);

  useEffect(() => {
    const date = params.get('date');
    if (date && upcoming.length) {
      const m = upcoming.find((x) => x.date === date);
      if (m) setOpen(m);
    }
  }, [params, upcoming]);

  useEffect(() => {
    if (location.hash === '#speak') {
      const el = document.getElementById('speak');
      if (el) setTimeout(() => el.scrollIntoView({ block: 'start' }), 50);
    }
  }, [city]);

  if (!city) {
    return (
      <div className="container">
        <h1>{t('city.notFound')}</h1>
        <p>
          <Link to="/cities">{t('city.seeAllCities')}</Link>
        </p>
      </div>
    );
  }

  const pc = city.publicComment || {};
  const isHome = prefs.homeCityId === city.cityId;
  const live = upcoming.filter((m) => m.status !== 'cancelled');
  const cancelled = upcoming.filter((m) => m.status === 'cancelled');
  const shown = showAll ? live : live.slice(0, 6);
  const sources = (city.sources || []).filter(hostnameOf).slice(0, 3);

  return (
    <div className="container">
      <div className="row between" style={{ alignItems: 'start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('city.councilTitle', { city: city.name })}</h1>
          <p className="muted" style={{ marginBottom: 4 }}>
            <PinIcon /> {city.cityHall.name ? `${city.cityHall.name}, ` : ''}
            {city.cityHall.address}
          </p>
          {city.council && city.council.structure && (
            <p className="muted">
              {city.council.size ? `${t('city.members', { n: city.council.size })}, ` : ''}
              {city.council.structure}
              {city.council.mayorName ? t('city.mayor', { name: city.council.mayorName }) : ''}
            </p>
          )}
        </div>
        {isHome ? (
          <span className="tag brand">{t('common.yourCity')}</span>
        ) : (
          <button
            type="button"
            className="btn small"
            onClick={() =>
              setPrefs((p) => ({
                ...p,
                homeCityId: city.cityId,
                location: p.location || cityPoint(city),
                locationLabel: p.locationLabel || t('common.cityHallOf', { city: city.name }),
              }))
            }
          >
            {t('common.setAsMyCity')}
          </button>
        )}
      </div>
      <div className="links" style={{ margin: '6px 0 18px' }}>
        <a href={city.website} target="_blank" rel="noreferrer">
          {t('common.cityWebsite')} <ExternalIcon />
        </a>
        {city.agendaPortal && city.agendaPortal.url && (
          <a href={city.agendaPortal.url} target="_blank" rel="noreferrer">
            {t('common.agendas')} <ExternalIcon />
          </a>
        )}
        {city.liveStream && city.liveStream.url && (
          <a href={city.liveStream.url} target="_blank" rel="noreferrer">
            {t('common.watchLive')} <ExternalIcon />
          </a>
        )}
        {city.council && (city.council.findMyDistrictUrl || city.council.districtMapUrl) && (
          <a href={city.council.findMyDistrictUrl || city.council.districtMapUrl} target="_blank" rel="noreferrer">
            {t('common.findMyDistrict')} <ExternalIcon />
          </a>
        )}
      </div>

      {live.length > 0 && <ScheduleRibbon meetings={live} from={today} days={HORIZON} title={t('viz.cityRibbonTitle', { n: HORIZON })} compact />}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', alignItems: 'start' }}>
        <div className="stack">
          <section aria-labelledby="h-when">
            <div className="section-head">
              <h2 id="h-when">{t('city.whenTheyMeet')}</h2>
            </div>
            <ul className="rows">
              {city.meetings.map((m, i) => (
                <li key={i} style={{ padding: '11px 0 14px' }}>
                  <p style={{ fontWeight: 700, marginBottom: 2 }}>{m.label}</p>
                  <p style={{ marginBottom: 3 }}>{describeRecurrence(m.recurrence)}</p>
                  {/* A start time only means something once you can see it against a school day. */}
                  <MeetingClock
                    time={m.recurrence.time}
                    weekday={ruleWeekday(m.recurrence)}
                    label={t('viz.clockAria', { time: formatTime(m.recurrence.time) })}
                  />
                  <p className="hint" style={{ margin: 0 }}>
                    {m.location || city.cityHall.address}
                    {m.openToPublicComment === false ? t('city.noPublicCommentType') : ''}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="h-next">
            <div className="section-head">
              <h2 id="h-next">{t('city.next90')}</h2>
              {live.length > 6 && (
                <button type="button" className="btn quiet" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? t('common.showFewer') : t('common.showAll', { n: live.length })}
                </button>
              )}
            </div>
            <ul className="rows">
              {shown.map((m) => (
                <li key={m.id}>
                  <MeetingCard meeting={m} today={today} onSelect={setOpen} selected={Boolean(open && open.id === m.id)} showCity={false} compact />
                </li>
              ))}
            </ul>
            {cancelled.length > 0 && (
              <p className="hint" style={{ marginTop: 10 }}>
                {t('city.cancelledOrMoved', { list: cancelled.map((m) => `${formatDate(m.date)}${m.note ? ` (${m.note})` : ''}`).join('; ') })}
              </p>
            )}
          </section>
        </div>

        <div className="stack">
          <section id="speak" className="card" aria-labelledby="h-speak" tabIndex={-1}>
            <h2 id="h-speak">
              <MicIcon /> {t('city.howToSpeakHere')}
            </h2>
            <p>{pc.summary}</p>
            <h3>{t('city.steps')}</h3>
            <p style={{ whiteSpace: 'pre-line' }}>{pc.howToRegister}</p>
            <dl className="facts">
              {pc.deadline && (
                <>
                  <dt>{t('city.deadline')}</dt>
                  <dd>{pc.deadline}</dd>
                </>
              )}
              {pc.timeLimitMinutes && (
                <>
                  <dt>{t('city.timeLimit')}</dt>
                  <dd>{tn('common.minutes', pc.timeLimitMinutes)}</dd>
                </>
              )}
              <dt>{t('city.remote')}</dt>
              <dd>{pc.virtualAllowed === true ? t('city.remoteYes') : pc.virtualAllowed === false ? t('city.remoteNo') : t('city.remoteUnknown')}</dd>
              {pc.writtenCommentMethod && (
                <>
                  <dt>{t('city.written')}</dt>
                  <dd>{pc.writtenCommentMethod}</dd>
                </>
              )}
            </dl>
            {pc.notes && <p className="hint">{pc.notes}</p>}
            {pc.registrationUrl && (
              <a className="btn primary" href={pc.registrationUrl} target="_blank" rel="noreferrer">
                {t('city.signUpToSpeak')} <ExternalIcon />
              </a>
            )}
          </section>

          {(city.youthPrograms || []).length > 0 && (
            <section aria-labelledby="h-youth">
              <div className="section-head">
                <h2 id="h-youth">{t('city.youthIn', { city: city.name })}</h2>
              </div>
              <ul className="rows">
                {city.youthPrograms.map((p, i) => (
                  <li key={i} style={{ padding: '11px 0 12px' }}>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}
                    </p>
                    {p.ages && <p className="hint" style={{ marginBottom: 2 }}>{p.ages}</p>}
                    {p.description && <p className="muted" style={{ marginBottom: 4 }}>{p.description}</p>}
                    {p.applyWindow && <p className="hint" style={{ margin: 0 }}>{t('city.apply', { window: p.applyWindow })}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(city.agendaItems || []).length > 0 && (
            <section aria-labelledby="h-agenda">
              <div className="section-head">
                <h2 id="h-agenda">{t('city.onTheAgenda')}</h2>
              </div>
              <ul className="rows">
                {city.agendaItems.map((item, i) => (
                  <AgendaItem key={i} item={item} city={city} />
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      <p className="hint section">
        {t('city.verifiedLine', { date: city.lastVerified ? formatDate(city.lastVerified) : '' })}
        {sources.length > 0 && (
          <>
            {' '}
            {sources.map((s, i) => (
              <span key={s}>
                {i > 0 ? ', ' : ''}
                <a href={s} target="_blank" rel="noreferrer">
                  {hostnameOf(s)}
                </a>
              </span>
            ))}
          </>
        )}
      </p>

      {open && <MeetingDrawer meeting={open} city={city} today={today} onClose={() => setOpen(null)} hideCityLink />}
    </div>
  );
}
