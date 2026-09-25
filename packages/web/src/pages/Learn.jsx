import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { glossary, checklist, speakingTips, topicList, buildComment, estimateSpeakingSeconds, timeOfDayFor, t } from '@agora/core';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { api } from '../lib/api.js';
import { SpeakingRuler } from '../components/viz.jsx';
import { CheckIcon } from '../components/icons.jsx';

const TAB_IDS = ['checklist', 'comment', 'tips', 'glossary'];

export default function Learn() {
  const [params, setParams] = useSearchParams();
  const tab = TAB_IDS.includes(params.get('tab')) ? params.get('tab') : 'checklist';
  const setTab = (id) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set('tab', id);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="container" style={{ maxWidth: 860 }}>
      <h1>{t('learn.heading')}</h1>
      <div className="tabs" role="tablist" aria-label={t('learn.sections')}>
        {TAB_IDS.map((id) => (
          <button key={id} role="tab" type="button" aria-selected={tab === id} aria-controls={`panel-${id}`} id={`tab-${id}`} onClick={() => setTab(id)}>
            {t(`learn.tabs.${id}`)}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'checklist' && <Checklist />}
        {tab === 'comment' && <CommentBuilder initialCity={params.get('city')} />}
        {tab === 'tips' && (
          <ul className="list-reset check">
            {speakingTips().map((tip, i) => (
              <li key={tip}>
                <span className="n">{i + 1}</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === 'glossary' && (
          <dl className="rows glossary">
            {glossary().map((g) => (
              <div key={g.term}>
                <dt>{g.term}</dt>
                <dd className="muted">{g.definition}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

function Checklist() {
  const { ui, setUi } = useStore();
  const done = new Set(ui.checklist || []);
  const toggle = (i) => {
    const next = new Set(done);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setUi({ checklist: [...next] });
  };
  return (
    <ul className="list-reset check">
      {checklist().map((item, i) => (
        <li key={item}>
          <button type="button" className="n" aria-pressed={done.has(i)} onClick={() => toggle(i)} aria-label={t('learn.stepDone', { n: i + 1 })} style={{ border: 0, cursor: 'pointer', font: 'inherit' }}>
            {done.has(i) ? <CheckIcon /> : i + 1}
          </button>
          <span style={{ textDecoration: done.has(i) ? 'line-through' : 'none', color: done.has(i) ? 'var(--muted)' : 'inherit' }}>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CommentBuilder({ initialCity }) {
  const { prefs, profile, setUi } = useStore();
  const navigate = useNavigate();
  const { cities, cityById } = useCities();
  const [form, setForm] = useState({
    name: profile.name === t('profile.defaultName') ? '' : profile.name,
    school: '',
    cityId: initialCity || prefs.homeCityId || '',
    topicId: prefs.interests[0] || 'parks-recreation',
    itemTitle: '',
    position: 'ask',
    story: '',
    ask: '',
  });
  const [ai, setAi] = useState({ status: 'idle', text: '' });
  const [copied, setCopied] = useState(false);
  const city = form.cityId ? cityById(form.cityId) : null;
  const timeOfDay = city && city.meetings && city.meetings[0] ? timeOfDayFor(city.meetings[0].recurrence.time) : 'evening';
  const draft = useMemo(() => {
    const body = buildComment({ ...form, cityName: city ? city.name : '', timeOfDay });
    // The one place a profile email is ever used: closing your own draft with a contact line.
    return profile.email ? [body, t('learn.contactLine', { email: profile.email })].join('\n\n') : body;
  }, [form, city, timeOfDay, profile.email]);
  const seconds = estimateSpeakingSeconds(ai.text || draft);
  const limit = city && city.publicComment && city.publicComment.timeLimitMinutes ? city.publicComment.timeLimitMinutes * 60 : 180;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const polish = async () => {
    setAi({ status: 'loading', text: '' });
    try {
      const r = await api.comment({ ...form, cityName: city ? city.name : '', useAi: true });
      setAi(r.ai && r.ai.text ? { status: 'ok', text: r.ai.text } : { status: 'idle', text: '' });
    } catch {
      setAi({ status: 'idle', text: '' });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ai.text || draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const positions = [
    ['support', t('learn.support')],
    ['oppose', t('learn.oppose')],
    ['concerned', t('learn.concerned')],
    ['ask', t('learn.askingForAction')],
  ];

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', alignItems: 'start' }}>
      <form onSubmit={(e) => e.preventDefault()} className="card">
        <div className="field">
          <label htmlFor="c-name">{t('learn.name')}</label>
          <input id="c-name" value={form.name} onChange={set('name')} autoComplete="name" />
        </div>
        <div className="field">
          <label htmlFor="c-school">{t('learn.school')}</label>
          <input id="c-school" value={form.school} onChange={set('school')} placeholder={t('learn.schoolPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="c-city">{t('learn.cityCouncil')}</label>
          <select id="c-city" value={form.cityId} onChange={set('cityId')}>
            <option value="">{t('learn.choose')}</option>
            {cities.map((c) => (
              <option key={c.cityId} value={c.cityId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-topic">{t('learn.topic')}</label>
          <select id="c-topic" value={form.topicId} onChange={set('topicId')}>
            {topicList().map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-item">{t('learn.agendaItem')}</label>
          <input id="c-item" value={form.itemTitle} onChange={set('itemTitle')} placeholder={t('learn.agendaItemPlaceholder')} />
        </div>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('learn.position')}</legend>
          <div className="chips">
            {positions.map(([v, l]) => (
              <button key={v} type="button" className="chip small" aria-pressed={form.position === v} onClick={() => setForm({ ...form, position: v })}>
                {l}
              </button>
            ))}
          </div>
        </fieldset>
        <div className="field">
          <label htmlFor="c-story">{t('learn.story')}</label>
          <textarea id="c-story" value={form.story} onChange={set('story')} placeholder={t('learn.storyPlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="c-ask">{t('learn.ask')}</label>
          <input id="c-ask" value={form.ask} onChange={set('ask')} placeholder={t('learn.askPlaceholder')} />
        </div>
      </form>

      <div className="stack">
        <div className="card">
          <div className="section-head">
            <h2 style={{ margin: 0 }}>{t('learn.yourDraft')}</h2>
          </div>
          <pre className="pre">{ai.text || draft}</pre>
          {/* Three minutes is an abstraction until you watch the bar run past the line. */}
          <SpeakingRuler seconds={seconds} limitSeconds={limit} title={city ? t('viz.rulerTitleCity', { city: city.name }) : t('viz.rulerTitleGeneric')} />
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn primary" onClick={copy}>
              {copied ? t('common.copied') : t('common.copy')}
            </button>
            <button type="button" className="btn" onClick={polish} disabled={ai.status === 'loading'}>
              {ai.status === 'loading' ? <span className="spinner" /> : null} {t('learn.polish')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                // Hand the draft and the fields to Rehearse so the report can check what landed.
                setUi({ lastDraft: { text: ai.text || draft, cityId: form.cityId, fields: { name: form.name, school: form.school, itemTitle: form.itemTitle, ask: form.ask } } });
                navigate('/rehearse');
              }}
            >
              {t('learn.rehearseButton')}
            </button>
            {ai.text && <span className="tag brand">{t('learn.aiTag')}</span>}
          </div>
        </div>
        {city && city.publicComment && (
          <div className="notice">
            <strong>{t('learn.howToSignUp', { city: city.name })}</strong> {city.publicComment.howToRegister}
          </div>
        )}
      </div>
    </div>
  );
}
