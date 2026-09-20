import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, t, tn } from '@agora/core';
import { useStore } from '../lib/store.jsx';

/**
 * Manage the setups saved on this device. There is no server behind Agora, so a profile
 * is a local saved setup rather than an account, and the export file is the only way to
 * carry one to another device. The page says so plainly instead of implying otherwise.
 */
export default function Profile() {
  const { profile, profiles, switchProfile, createProfile, updateProfile, deleteProfile, exportProfile, importProfile } = useStore();
  const [draft, setDraft] = useState({ id: profile.id, name: profile.name, email: profile.email });
  const [newProfile, setNewProfile] = useState({ name: '', email: '' });
  const [status, setStatus] = useState('');
  const fileRef = useRef(null);

  // Switching profiles has to refill this form. Resetting during render is React's own
  // pattern for state derived from a prop, and it avoids a flash of the previous values.
  if (draft.id !== profile.id) setDraft({ id: profile.id, name: profile.name, email: profile.email });

  const save = (e) => {
    e.preventDefault();
    updateProfile(profile.id, draft);
    setStatus(t('profile.saved'));
  };

  const add = (e) => {
    e.preventDefault();
    if (!newProfile.name.trim()) return;
    createProfile(newProfile);
    setNewProfile({ name: '', email: '' });
    setStatus(t('profile.addedStatus', { name: newProfile.name.trim() }));
  };

  const download = () => {
    const data = exportProfile(profile.id);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agora-profile-${profile.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile'}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setStatus(t('profile.exported'));
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      importProfile(data);
      setStatus(t('profile.imported', { name: data.profile.name || t('profile.defaultName') }));
    } catch (err) {
      setStatus(err && err.message ? err.message : t('profile.importBadFile'));
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = (p) => {
    if (window.confirm(t('profile.deleteConfirm', { name: p.name }))) {
      deleteProfile(p.id);
      setStatus(t('profile.deletedStatus', { name: p.name }));
    }
  };

  return (
    <div className="container narrow">
      <h1>{t('profile.title')}</h1>
      <p className="lead">{t('profile.intro')}</p>

      <div className="notice" style={{ margin: '14px 0 26px' }}>
        {t('profile.noServerNote')}
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status && (
        <p className="hint" style={{ marginBottom: 14 }}>
          {status}
        </p>
      )}

      <section aria-labelledby="h-this">
        <div className="section-head">
          <h2 id="h-this">{t('profile.active')}</h2>
        </div>
        <form onSubmit={save} className="card">
          <div className="field">
            <label htmlFor="p-name">{t('profile.nameLabel')}</label>
            <input id="p-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={40} />
          </div>
          <div className="field">
            <label htmlFor="p-email">{t('profile.emailLabel')}</label>
            <input id="p-email" type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} placeholder={t('profile.emailPlaceholder')} />
            <p className="hint">{t('profile.emailHelp')}</p>
          </div>
          <button type="submit" className="btn primary">
            {t('profile.save')}
          </button>
        </form>
        <p className="hint" style={{ marginTop: 8 }}>
          {/* Slicing the ISO string would report the UTC day, which is already tomorrow
              for anyone here after 7 PM. The rest of the app works in Central time. */}
          {t('profile.createdOn', { date: formatDate(new Date(profile.createdAt).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }), { withYear: true }) })}
        </p>
      </section>

      <section className="section" aria-labelledby="h-all">
        <div className="section-head">
          <h2 id="h-all">{tn('profile.allTitle', profiles.length)}</h2>
        </div>
        <ul className="rows">
          {profiles.map((p) => (
            <li key={p.id}>
              <div className="city-row" style={{ gridTemplateColumns: 'minmax(0, 1fr) auto' }}>
                <div>
                  <h3 className="name" style={{ fontSize: '1.05rem' }}>
                    {p.name}
                  </h3>
                  <p className="meta" style={{ margin: 0 }}>
                    {p.onboarded ? tn('profile.topicsChosen', (p.prefs.interests || []).length) : t('profile.notSetUp')}
                    {p.email ? ` · ${p.email}` : ''}
                  </p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  {p.id === profile.id ? (
                    <span className="tag brand">{t('profile.inUse')}</span>
                  ) : (
                    <button type="button" className="btn small" onClick={() => switchProfile(p.id)}>
                      {t('profile.switchTo')}
                    </button>
                  )}
                  <button type="button" className="btn quiet" onClick={() => remove(p)}>
                    {t('profile.deleteButton')}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="section" aria-labelledby="h-add">
        <div className="section-head">
          <h2 id="h-add">{t('profile.createTitle')}</h2>
        </div>
        <p className="muted">{t('profile.createHelp')}</p>
        <form onSubmit={add} className="card">
          <div className="field">
            <label htmlFor="n-name">{t('profile.nameLabel')}</label>
            <input id="n-name" value={newProfile.name} onChange={(e) => setNewProfile({ ...newProfile, name: e.target.value })} maxLength={40} placeholder={t('profile.namePlaceholder')} />
          </div>
          <div className="field">
            <label htmlFor="n-email">{t('profile.emailLabel')}</label>
            <input id="n-email" type="email" value={newProfile.email} onChange={(e) => setNewProfile({ ...newProfile, email: e.target.value })} placeholder={t('profile.emailPlaceholder')} />
          </div>
          <button type="submit" className="btn primary" disabled={!newProfile.name.trim()}>
            {t('profile.createButton')}
          </button>
        </form>
      </section>

      <section className="section" aria-labelledby="h-move">
        <div className="section-head">
          <h2 id="h-move">{t('profile.backupTitle')}</h2>
        </div>
        <p className="muted">{t('profile.backupHelp')}</p>
        <div className="row">
          <button type="button" className="btn" onClick={download}>
            {t('profile.exportButton')}
          </button>
          <button type="button" className="btn" onClick={() => fileRef.current && fileRef.current.click()}>
            {t('profile.importButton')}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="visually-hidden" aria-label={t('profile.importButton')} />
        </div>
      </section>

      <p className="hint section">
        {t('profile.privacyNote')} <Link to="/about">{t('nav.about')}</Link>
      </p>
    </div>
  );
}
