import { useEffect, useState } from 'react';
import { topicList, getTopic, t } from '@agora/core';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { ExternalIcon } from '../components/icons.jsx';
import TopicIcon from '../components/TopicIcon.jsx';
import { TopicTag } from '../components/TopicChips.jsx';

export default function News() {
  const { prefs, lang } = useStore();
  const [topic, setTopic] = useState(prefs.interests[0] || '');
  const [city, setCity] = useState('');
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    api
      .news({ topic, city, limit: 30 })
      .then((data) => !cancelled && setState({ status: 'ok', data }))
      .catch(() => !cancelled && setState({ status: 'error', data: null }));
    return () => {
      cancelled = true;
    };
  }, [topic, city]);

  return (
    <div className="container">
      <h1>{t('news.heading')}</h1>
      <div className="chips" style={{ margin: '12px 0' }} role="group" aria-label={t('news.topic')}>
        <button type="button" className="chip small" aria-pressed={topic === ''} onClick={() => setTopic('')}>
          {t('news.allTopics')}
        </button>
        {topicList()
          .filter((x) => x.id !== 'other')
          .map((x) => (
            <button key={x.id} type="button" className="chip small" aria-pressed={topic === x.id} onClick={() => setTopic(x.id)}>
              <TopicIcon id={x.id} size={14} /> {x.label}
            </button>
          ))}
      </div>
      <div className="field" style={{ maxWidth: 360 }}>
        <label htmlFor="news-city">{t('news.mentioning')}</label>
        <input id="news-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder={t('news.placeholder')} />
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {state.status === 'loading' ? t('news.loading') : state.status === 'error' ? t('news.unavailableStatus') : state.data ? t('news.headlinesShown', { n: state.data.items.length }) : ''}
      </p>
      {state.status === 'loading' && (
        <p>
          <span className="spinner" /> {t('news.loading')}
        </p>
      )}
      {state.status === 'error' && (
        <div className="notice warn">
          <strong>{t('news.unavailableTitle')}</strong> {t('news.unavailableBody')}
          <OfflineLinks topic={topic} />
        </div>
      )}
      {state.status === 'ok' && state.data && (
        <>
          {state.data.items.length === 0 && <p className="muted">{t('news.noStories')}</p>}
          {/* Say plainly when the headlines were collected, rather than implying they are live. */}
          {state.data.snapshotAt && (
            <p className="hint" style={{ marginBottom: 10 }}>
              {t('news.snapshotNote', { when: new Date(state.data.snapshotAt).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) })}
            </p>
          )}
          <ul className="rows">
            {state.data.items.map((item) => (
              <li key={item.link} style={{ padding: '13px 0 14px' }}>
                <a href={item.link} target="_blank" rel="noreferrer" style={{ fontWeight: 700, fontSize: '1.05rem' }}>
                  {item.title} <ExternalIcon />
                </a>
                <p className="hint" style={{ margin: '2px 0 6px' }}>
                  {item.sourceName}
                  {item.publishedAt ? ` · ${item.publishedAt.slice(0, 10)}` : ''}
                </p>
                {item.description && <p className="muted" style={{ marginBottom: 6 }}>{item.description}</p>}
                <div className="labels">
                  {item.topics.map((id) => (
                    <TopicTag key={id} id={id} className="tag" />
                  ))}
                </div>
              </li>
            ))}
          </ul>
          {state.data.topicLinks.length > 0 && (
            <section className="section">
              <div className="section-head">
                <h2>{t('news.keepReading')}</h2>
              </div>
              <ul className="linkgrid list-reset">
                {state.data.topicLinks.slice(0, 12).map((l) => (
                  <li key={l.url}>
                    <a href={l.url} target="_blank" rel="noreferrer" style={{ fontWeight: 600 }}>
                      {l.label} <ExternalIcon />
                    </a>
                    <p className="hint" style={{ margin: 0 }}>
                      {l.sourceName} · {getTopic(l.topic).label}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function OfflineLinks({ topic }) {
  const links = [
    { name: 'KERA News', url: 'https://www.keranews.org/' },
    { name: 'Fort Worth Report', url: 'https://fortworthreport.org/' },
    { name: 'The Dallas Morning News', url: 'https://www.dallasnews.com/news/' },
    { name: 'Community Impact', url: 'https://communityimpact.com/dallas-fort-worth/' },
  ];
  return (
    <ul>
      {links.map((l) => (
        <li key={l.url}>
          <a href={l.url} target="_blank" rel="noreferrer">
            {l.name}
          </a>
          {topic ? t('news.searchFor', { topic: getTopic(topic).label.toLowerCase() }) : ''}
        </li>
      ))}
    </ul>
  );
}
