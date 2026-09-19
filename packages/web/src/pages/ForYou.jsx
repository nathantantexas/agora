import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { buildPlan, matchMeetings, getTopic, formatDate, milesText, BRAND, t } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import MeetingCard from '../components/MeetingCard.jsx';
import MeetingDrawer from '../components/MeetingDrawer.jsx';
import { ReachPlot } from '../components/viz.jsx';
import { TopicTag } from '../components/TopicChips.jsx';
import { StarIcon } from '../components/icons.jsx';

export default function ForYou() {
  const { prefs, onboarded } = useStore();
  const { cities, cityById } = useCities();
  const today = todayFn();
  const [open, setOpen] = useState(null);
  const plan = useMemo(() => buildPlan(cities, prefs, { today, days: 45 }), [cities, prefs, today]);
  // The plot wants every candidate, not just the twelve the plan shows.
  const allNearby = useMemo(() => (prefs.location ? matchMeetings(cities, prefs, { today, days: 45, limit: 400 }) : []), [cities, prefs, today]);

  if (!onboarded) {
    return (
      <div className="container narrow">
        <h1>{t('forYou.tellUs')}</h1>
        <p className="muted">{t('forYou.tellUsIntro', { n: cities.length, region: BRAND.region })}</p>
        <Link to="/start" className="btn primary">
          <StarIcon /> {t('forYou.start')}
        </Link>
      </div>
    );
  }

  const home = prefs.homeCityId ? cityById(prefs.homeCityId) : null;

  return (
    <div className="container">
      <div className="row between">
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('forYou.next45')}</h1>
          <p className="muted">{[...prefs.interests.map((id) => getTopic(id).label), home ? home.name : null].filter(Boolean).join(' · ')}</p>
        </div>
        <Link to="/start" className="btn small">
          {t('forYou.editAnswers')}
        </Link>
      </div>

      <div className="notice" style={{ margin: '14px 0 22px' }}>
        {plan.summary}
      </div>

      {prefs.location && allNearby.length > 0 && (
        <div style={{ marginBottom: 26 }}>
          <ReachPlot meetings={allNearby} prefs={prefs} title={t('viz.reachTitle')} note={t('viz.reachNote')} />
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', alignItems: 'start' }}>
        <section aria-labelledby="h-meetings">
          <div className="section-head">
            <h2 id="h-meetings">{t('forYou.rankedHeading')}</h2>
          </div>
          <ul className="rows">
            {plan.meetings.map((m) => (
              <li key={m.id}>
                <MeetingCard meeting={m} today={today} onSelect={setOpen} selected={Boolean(open && open.id === m.id)} />
              </li>
            ))}
          </ul>
          {plan.meetings.length === 0 && <p className="empty">{t('forYou.nothingYet')}</p>}
        </section>

        <div className="stack">
          <section aria-labelledby="h-agenda">
            <div className="section-head">
              <h2 id="h-agenda">{t('forYou.onAgendas')}</h2>
            </div>
            {plan.agendaItems.length === 0 && <p className="muted">{t('forYou.noAgendaItems')}</p>}
            <ul className="rows">
              {plan.agendaItems.slice(0, 8).map((a, i) => (
                <li key={`${a.cityId}-${i}`} style={{ padding: '10px 0 11px' }}>
                  <p style={{ fontWeight: 600, marginBottom: 2 }}>{a.title}</p>
                  <p className="hint" style={{ marginBottom: 5 }}>
                    <Link to={`/city/${a.cityId}`}>{a.cityName}</Link>
                    {a.meetingDate ? ` · ${formatDate(a.meetingDate)}` : ''}
                    {a.distanceMiles != null ? ` · ${milesText(a.distanceMiles)}` : ''}
                  </p>
                  <div className="labels">
                    {a.matchedTopics.map((id) => (
                      <TopicTag key={id} id={id} />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {plan.youthPrograms.length > 0 && (
            <section aria-labelledby="h-youth">
              <div className="section-head">
                <h2 id="h-youth">{t('forYou.youthHeading')}</h2>
              </div>
              <ul className="rows">
                {plan.youthPrograms.map((p, i) => (
                  <li key={`${p.cityId}-${i}`} style={{ padding: '10px 0 11px' }}>
                    <p style={{ fontWeight: 600, marginBottom: 2 }}>
                      {p.url ? (
                        <a href={p.url} target="_blank" rel="noreferrer">
                          {p.name}
                        </a>
                      ) : (
                        p.name
                      )}{' '}
                      <span className="hint">· {p.cityName}</span>
                    </p>
                    {p.ages && <p className="hint" style={{ margin: 0 }}>{p.ages}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>

      {open && <MeetingDrawer meeting={open} city={cityById(open.cityId)} today={today} onClose={() => setOpen(null)} />}
    </div>
  );
}
