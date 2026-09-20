import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, formatTime, relativeDays, getTopic, inferTopics, t } from '@agora/core';
import { CloseIcon, CalendarIcon, DirectionsIcon, ExternalIcon, MicIcon } from './icons.jsx';
import { TopicTag } from './TopicChips.jsx';
import { MeetingClock } from './viz.jsx';
import CityEmblem from './CityEmblem.jsx';
import { downloadIcs, directionsUrl } from '../lib/ics.js';
import { api } from '../lib/api.js';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Slide-over with everything about one meeting occurrence. Traps focus while open. */
export default function MeetingDrawer({ meeting, city, today, onClose, hideCityLink = false }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    closeRef.current && closeRef.current.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panelRef.current) return undefined;
      const items = panelRef.current.querySelectorAll(FOCUSABLE);
      if (!items.length) return undefined;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        e.preventDefault();
        return first.focus();
      }
      if (e.shiftKey && active === first) {
        e.preventDefault();
        return last.focus();
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        return first.focus();
      }
      return undefined;
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (returnFocus.current && returnFocus.current.focus) returnFocus.current.focus();
    };
  }, [onClose]);

  if (!meeting || !city) return null;
  const pc = city.publicComment || {};

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside ref={panelRef} className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title">
        <div className="drawer-head">
          <div className="city-ident">
            <CityEmblem city={city} size={52} />
            <div style={{ minWidth: 0 }}>
              <p className="muted" style={{ margin: 0, fontWeight: 600, fontSize: '0.88rem' }}>
                {city.name}
              </p>
              <h2 id="drawer-title" style={{ marginBottom: 2 }}>
                {meeting.label}
              </h2>
              <p className="muted" style={{ margin: 0 }}>
                {formatDate(meeting.date, { withYear: true, long: true })}, {formatTime(meeting.time)} · {relativeDays(meeting.date, today)}
              </p>
            </div>
          </div>
          <button ref={closeRef} type="button" className="btn icon" onClick={onClose} aria-label={t('common.close')}>
            <CloseIcon />
          </button>
        </div>

        {meeting.status !== 'scheduled' && (
          <div className={`notice${meeting.status === 'cancelled' ? ' warn' : ''}`} style={{ marginBottom: 12 }}>
            <strong>{meeting.status === 'cancelled' ? t('drawer.cancelledNote') : meeting.status === 'rescheduled' ? t('drawer.scheduleChange') : t('drawer.specialMeeting')}</strong> {meeting.note || t('drawer.checkCalendar')}
          </div>
        )}

        {/* Where this start time sits in a school day, drawn to scale. */}
        <MeetingClock time={meeting.time} weekday={meeting.weekday} label={t('viz.clockAria', { time: formatTime(meeting.time) })} />

        <dl className="facts">
          <dt>{t('drawer.where')}</dt>
          <dd>{meeting.location}</dd>
          <dt>{t('drawer.type')}</dt>
          <dd>
            {meeting.isEvening ? t('drawer.eveningMeeting') : meeting.isSchoolHours ? t('drawer.duringSchoolHours') : t('drawer.daytimeMeeting')}
            {meeting.openToPublicComment ? t('drawer.publicCommentAllowed') : t('drawer.noPublicComment')}
          </dd>
          {pc.timeLimitMinutes ? (
            <>
              <dt>{t('drawer.speakingTime')}</dt>
              <dd>{t('drawer.minutesPerPerson', { n: pc.timeLimitMinutes })}</dd>
            </>
          ) : null}
          {pc.deadline ? (
            <>
              <dt>{t('drawer.signupDeadline')}</dt>
              <dd>{pc.deadline}</dd>
            </>
          ) : null}
        </dl>

        <div className="row" style={{ marginBottom: 18 }}>
          <button type="button" className="btn primary" onClick={() => downloadIcs(meeting, city)}>
            <CalendarIcon /> {t('common.addToCalendar')}
          </button>
          <a className="btn" href={directionsUrl(meeting)} target="_blank" rel="noreferrer">
            <DirectionsIcon /> {t('common.directions')}
          </a>
        </div>

        <section style={{ marginBottom: 16 }}>
          <div className="section-head">
            <h3>
              <MicIcon /> {t('drawer.howToSpeakHere')}
            </h3>
          </div>
          <p>{pc.summary}</p>
          <p className="muted" style={{ marginBottom: 10 }}>
            {pc.howToRegister}
          </p>
          <div className="row">
            {pc.registrationUrl && (
              <a className="btn small primary" href={pc.registrationUrl} target="_blank" rel="noreferrer">
                {t('drawer.signupForm')} <ExternalIcon />
              </a>
            )}
            {!hideCityLink && (
              <Link className="btn small" to={`/city/${city.cityId}`}>
                {t('drawer.cityPage')}
              </Link>
            )}
          </div>
        </section>

        {meeting.agendaItems && meeting.agendaItems.length > 0 && (
          <section style={{ marginBottom: 14 }}>
            <div className="section-head">
              <h3>{t('drawer.onTheAgenda')}</h3>
            </div>
            <ul className="rows">
              {meeting.agendaItems.map((item, i) => (
                <AgendaItem key={`${item.title}-${i}`} item={item} city={city} />
              ))}
            </ul>
          </section>
        )}

        <div className="links">
          {city.agendaPortal && city.agendaPortal.url && (
            <a href={city.agendaPortal.url} target="_blank" rel="noreferrer">
              {t('common.agendas')} <ExternalIcon />
            </a>
          )}
          {(meeting.virtualUrl || (city.liveStream && city.liveStream.url)) && (
            <a href={meeting.virtualUrl || city.liveStream.url} target="_blank" rel="noreferrer">
              {t('common.watchLive')} <ExternalIcon />
            </a>
          )}
        </div>
      </aside>
    </>
  );
}

/** Agenda item with an on-demand plain-language explanation (AI when the server has a key, topic guide otherwise). */
export function AgendaItem({ item, city }) {
  const [state, setState] = useState({ status: 'idle', text: '' });
  const topics = item.topics && item.topics.length ? item.topics : inferTopics(item.title);

  const explain = async () => {
    if (state.status === 'open') return setState((s) => ({ ...s, status: 'closed' }));
    if (state.text) return setState((s) => ({ ...s, status: 'open' }));
    setState({ status: 'loading', text: '' });
    try {
      const r = await api.explain({ title: item.title, summary: item.summary, cityId: city.cityId });
      setState({ status: 'open', text: r.text });
    } catch {
      const topic = getTopic(topics[0]);
      setState({
        status: 'open',
        text: `${topic.id === 'other' ? t('drawer.itemOnAgenda', { city: city.name }) : t('drawer.itemAbout', { topic: topic.short, city: city.name })} ${item.summary || ''}${topic.id === 'other' ? '' : ` ${t('drawer.whyMatters', { angle: topic.youthAngle })}`}`,
      });
    }
  };

  return (
    <li style={{ padding: '11px 0 12px' }}>
      <p style={{ fontWeight: 600, marginBottom: 4 }}>
        {item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer">
            {item.title}
          </a>
        ) : (
          item.title
        )}
      </p>
      {item.summary && <p className="muted" style={{ marginBottom: 7 }}>{item.summary}</p>}
      <div className="row" style={{ gap: 8 }}>
        <div className="labels">
          {topics.map((id) => (
            <TopicTag key={id} id={id} />
          ))}
        </div>
        <button type="button" className="btn quiet" onClick={explain} aria-expanded={state.status === 'open'}>
          {state.status === 'loading' ? <span className="spinner" aria-label={t('common.loading')} /> : null} {state.status === 'open' ? t('drawer.hide') : t('drawer.explainThis')}
        </button>
      </div>
      {state.status === 'open' && (
        <div className="notice" style={{ marginTop: 10 }}>
          <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{state.text}</p>
        </div>
      )}
    </li>
  );
}
