import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { upcomingMeetings, matchMeetings, computeStats, BRAND, t, tn } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import MeetingDrawer from '../components/MeetingDrawer.jsx';
import { StatTile } from '../components/charts.jsx';
import { ScheduleRibbon } from '../components/viz.jsx';
import { StarIcon, ArrowIcon } from '../components/icons.jsx';

const RIBBON_DAYS = 45;
const pct = (x) => `${Math.round(x * 100)}%`;

/** What the app is, what is happening next, and the one thing to do about it. */
export default function Home() {
  const { prefs, onboarded, profile } = useStore();
  const { cities, cityById } = useCities();
  const today = todayFn();
  const [open, setOpen] = useState(null);

  const stats = useMemo(() => computeStats(cities, { today, days: 30 }), [cities, today]);
  const ribbon = useMemo(() => upcomingMeetings(cities, { from: today, days: RIBBON_DAYS }), [cities, today]);
  // Once someone has answered the setup questions, lead with their meetings rather than
  // whatever happens to be soonest across the region.
  const featured = useMemo(
    () => (onboarded ? matchMeetings(cities, prefs, { today, days: RIBBON_DAYS, limit: 4 }) : upcomingMeetings(cities, { from: today, days: 14 }).slice(0, 4)),
    [cities, onboarded, prefs, today],
  );

  return (
    <div className="container">
      <section className="hero">
        <div>
          <h1 className="hero-title">{BRAND.tagline}</h1>
          <p className="lead">{BRAND.shortDescription}</p>
          <div className="row" style={{ marginTop: 18 }}>
            {onboarded ? (
              <Link to="/for-you" className="btn primary">
                <StarIcon /> {t('home.seeMyMeetings')}
              </Link>
            ) : (
              <Link to="/start" className="btn primary">
                <StarIcon /> {t('home.getStarted')}
              </Link>
            )}
            <Link to="/map" className="btn">
              {t('home.browseMap')} <ArrowIcon />
            </Link>
          </div>
          {onboarded && (
            <p className="hint" style={{ marginTop: 12 }}>
              {t('home.signedInAs', { name: profile.name })} <Link to="/profile">{t('profile.manage')}</Link>
            </p>
          )}
        </div>
        <div>
          <p className="hero-note">{t('home.whyNote')}</p>
        </div>
      </section>

      <div className="tiles" style={{ margin: '26px 0 22px' }}>
        <StatTile value={stats.totals.cities} label={t('insights.citiesCovered')} />
        <StatTile value={stats.totals.meetings} label={t('insights.meetingsNext30')} />
        <StatTile value={pct(stats.totals.eveningShare)} label={t('insights.startAfter5')} />
        <StatTile value={stats.totals.citiesWithYouthPrograms} label={t('insights.citiesWithYouth')} />
      </div>

      <ScheduleRibbon meetings={ribbon} from={today} days={RIBBON_DAYS} title={t('home.ribbonTitle', { n: RIBBON_DAYS })} />

      <section aria-labelledby="h-next" style={{ marginTop: 26 }}>
        <div className="section-head">
          <h2 id="h-next">{onboarded ? t('home.nextForYou') : t('home.happeningNext')}</h2>
          <Link className="btn quiet" to={onboarded ? '/for-you' : '/map'}>
            {t('home.seeAll')}
          </Link>
        </div>
        <ul className="rows">
          {featured.map((m) => (
            <li key={m.id}>
              <MeetingCard meeting={m} today={today} onSelect={setOpen} selected={Boolean(open && open.id === m.id)} compact={!onboarded} />
            </li>
          ))}
        </ul>
        {featured.length === 0 && <p className="empty">{t('home.nothingScheduled')}</p>}
      </section>

      <section className="section" aria-labelledby="h-do">
        <div className="section-head">
          <h2 id="h-do">{t('home.whatYouCanDo')}</h2>
        </div>
        <ul className="linkgrid list-reset">
          {[
            ['/map', 'home.doMap', 'home.doMapNote'],
            ['/cities', 'home.doCities', 'home.doCitiesNote'],
            ['/learn', 'home.doLearn', 'home.doLearnNote'],
            ['/insights', 'home.doInsights', 'home.doInsightsNote'],
          ].map(([to, title, note]) => (
            <li key={to}>
              <Link to={to} style={{ fontWeight: 700, textDecoration: 'none' }}>
                {t(title)}
              </Link>
              <p className="hint" style={{ margin: '2px 0 0' }}>
                {t(note)}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <p className="hint section">
        {BRAND.nonpartisanNote} {tn('home.dataLine', cities.length)} <Link to="/about">{t('home.aboutTheData')}</Link>
      </p>

      {open && <MeetingDrawer meeting={open} city={cityById(open.cityId)} today={today} onClose={() => setOpen(null)} />}
    </div>
  );
}
