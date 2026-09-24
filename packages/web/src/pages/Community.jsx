import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND, formatDate, t, tn } from '@agora/core';
import seed from '@data/community.json';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { KINDS, parseVideoUrl, buildIssueUrl, filterPosts, sortPosts, newPostId, normalizePost } from '../lib/community.js';
import { listPosts, putPost, deletePost, putMedia, getMedia, deleteMedia, downscaleImage } from '../lib/communityDb.js';
import CityEmblem from '../components/CityEmblem.jsx';
import { ExternalIcon } from '../components/icons.jsx';

const HELPFUL_KEY = 'agora.community.helpful.v1';
const MAX_PHOTOS = 4;
const MAX_VIDEO_BYTES = 120 * 1024 * 1024;

function readHelpful() {
  try {
    return JSON.parse(localStorage.getItem(HELPFUL_KEY) || '{}');
  } catch {
    return {};
  }
}

/**
 * Tips, toolkits, and wins from people who have actually stood up at a meeting. Seed
 * posts ship in the build; posts written here are kept on this device and can be sent
 * to the team for review, which is the only path onto everyone's feed a static site can
 * offer. The page says so rather than pretending to be a live forum.
 */
export default function Community() {
  const { profile } = useStore();
  const { cities, cityById } = useCities();
  const [localPosts, setLocalPosts] = useState([]);
  const [urls, setUrls] = useState({});
  const [helpful, setHelpful] = useState(readHelpful);
  const [kind, setKind] = useState('');
  const [cityFilter, setCityFilter] = useState('');
  const [sort, setSort] = useState('newest');
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState('');

  // Posts written on this device, plus object URLs for their stored media.
  useEffect(() => {
    let alive = true;
    const created = [];
    (async () => {
      const stored = (await listPosts()).map(normalizePost).filter(Boolean);
      const map = {};
      for (const p of stored) {
        for (const m of p.media) {
          if (!m.mediaId) continue;
          const rec = await getMedia(m.mediaId);
          if (rec && rec.blob) {
            map[m.mediaId] = URL.createObjectURL(rec.blob);
            created.push(map[m.mediaId]);
          }
        }
      }
      if (alive) {
        setLocalPosts(stored);
        setUrls(map);
      }
    })();
    return () => {
      alive = false;
      for (const u of created) URL.revokeObjectURL(u);
    };
  }, []);

  const all = useMemo(() => {
    const seeded = (seed.posts || []).map((p) => normalizePost({ ...p, sample: true })).filter(Boolean);
    return [...localPosts.map((p) => ({ ...p, local: true })), ...seeded];
  }, [localPosts]);

  const shown = useMemo(() => sortPosts(filterPosts(all, { kind, cityId: cityFilter }), sort), [all, kind, cityFilter, sort]);

  const toggleHelpful = (id) => {
    const next = { ...helpful, [id]: !helpful[id] };
    setHelpful(next);
    try {
      localStorage.setItem(HELPFUL_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const remove = async (post) => {
    if (!window.confirm(t('community.deleteConfirm'))) return;
    for (const m of post.media) if (m.mediaId) await deleteMedia(m.mediaId);
    await deletePost(post.id);
    setLocalPosts((prev) => prev.filter((p) => p.id !== post.id));
    setStatus(t('community.deleted'));
  };

  const onPosted = (post, mediaUrls) => {
    setLocalPosts((prev) => [post, ...prev]);
    setUrls((prev) => ({ ...prev, ...mediaUrls }));
    setOpen(false);
    setStatus(t('community.posted'));
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="container">
      <div className="row between" style={{ alignItems: 'start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>{t('community.heading')}</h1>
          <p className="muted" style={{ maxWidth: '62ch' }}>
            {t('community.intro')}
          </p>
        </div>
        <button type="button" className="btn primary" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="composer">
          {open ? t('community.closeComposer') : t('community.share')}
        </button>
      </div>

      <div className="notice" style={{ margin: '12px 0 20px' }}>
        {t('community.howItWorks')}
      </div>

      <p className="visually-hidden" role="status" aria-live="polite">
        {status}
      </p>
      {status && <p className="hint">{status}</p>}

      {open && <Composer id="composer" cities={cities} profile={profile} onPosted={onPosted} onCancel={() => setOpen(false)} />}

      <div className="filters" role="group" aria-label={t('community.filterLabel')}>
        <span className="label">{t('community.filterLabel')}</span>
        <button type="button" className="chip small" aria-pressed={kind === ''} onClick={() => setKind('')}>
          {t('community.allKinds')}
        </button>
        {KINDS.map((k) => (
          <button key={k} type="button" className="chip small" aria-pressed={kind === k} onClick={() => setKind(k)}>
            {t(`community.kinds.${k}`)}
          </button>
        ))}
        <span style={{ flex: '1 1 auto' }} />
        <label className="lang" style={{ margin: 0 }}>
          <span className="visually-hidden">{t('community.cityFilter')}</span>
          <select value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} aria-label={t('community.cityFilter')}>
            <option value="">{t('community.allCities')}</option>
            {cities.map((c) => (
              <option key={c.cityId} value={c.cityId}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="lang" style={{ margin: 0 }}>
          <span className="visually-hidden">{t('community.sortLabel')}</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label={t('community.sortLabel')}>
            <option value="newest">{t('community.sortNewest')}</option>
            <option value="helpful">{t('community.sortHelpful')}</option>
          </select>
        </label>
      </div>

      <p className="visually-hidden" role="status">
        {tn('community.postsShown', shown.length)}
      </p>

      <ul className="rows">
        {shown.map((post) => (
          <li key={post.id}>
            <PostCard post={post} city={cityById(post.cityId)} urls={urls} voted={Boolean(helpful[post.id])} onHelpful={() => toggleHelpful(post.id)} onDelete={post.local ? () => remove(post) : null} />
          </li>
        ))}
      </ul>
      {shown.length === 0 && <p className="empty">{t('community.nothingHere')}</p>}

      <p className="hint section">{t('community.languageNote')}</p>
    </div>
  );
}

function PostCard({ post, city, urls, voted, onHelpful, onDelete }) {
  const count = (post.helpful || 0) + (voted ? 1 : 0);
  return (
    <article className="post" aria-labelledby={`post-${post.id}`}>
      <div className="post-head">
        {city ? <CityEmblem city={city} size={40} /> : <span className="emblem-blank" aria-hidden="true" />}
        <div style={{ minWidth: 0 }}>
          <div className="labels" style={{ marginBottom: 4 }}>
            <span className={`tag ${post.kind === 'win' ? 'good' : post.kind === 'question' ? 'brand' : ''}`}>{t(`community.kinds.${post.kind}`)}</span>
            {post.local && <span className="tag warn">{t('community.onThisDevice')}</span>}
            {post.sample && <span className="tag">{t('community.sampleTag')}</span>}
          </div>
          <h2 id={`post-${post.id}`} className="post-title">
            {post.title}
          </h2>
          <p className="post-meta">
            {post.author.name || t('community.anonymous')}
            {post.author.school ? `, ${post.author.school}` : ''}
            {city ? ` · ${city.name}` : ''}
            {` · ${formatDate(post.postedAt, { withYear: true })}`}
          </p>
        </div>
      </div>

      <p className="post-body">{post.body}</p>

      {post.media.length > 0 && <MediaGallery media={post.media} urls={urls} />}

      <div className="row" style={{ gap: '6px 18px', marginTop: 10 }}>
        <button type="button" className={`chip small${voted ? ' on' : ''}`} aria-pressed={voted} onClick={onHelpful}>
          {tn('community.helpful', count)}
        </button>
        {post.links.map((l) =>
          l.to ? (
            <Link key={l.label} to={l.to} className="btn quiet">
              {l.label}
            </Link>
          ) : (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer" className="btn quiet">
              {l.label} <ExternalIcon />
            </a>
          ),
        )}
        {post.local && (
          <>
            <a className="btn quiet" href={buildIssueUrl(BRAND.repoUrl, post, { kind: t('community.issueKind'), city: t('community.issueCity'), author: t('community.issueAuthor') })} target="_blank" rel="noreferrer">
              {t('community.sendToTeam')} <ExternalIcon />
            </a>
            <button type="button" className="btn quiet" onClick={onDelete}>
              {t('community.delete')}
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function MediaGallery({ media, urls }) {
  const base = import.meta.env.BASE_URL;
  const src = (m) => (m.mediaId ? urls[m.mediaId] : m.src ? `${base}${m.src.replace(/^\//, '')}` : '');
  const images = media.filter((m) => m.type === 'image');
  const videos = media.filter((m) => m.type === 'video');
  return (
    <div className="post-media">
      {images.length > 0 && (
        <div className={`post-photos n${Math.min(images.length, 4)}`}>
          {images.map((m, i) => (
            <figure key={i}>
              <img src={src(m)} alt={m.alt || ''} loading="lazy" />
              {m.caption && <figcaption>{m.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
      {videos.map((m, i) => (
        <figure key={`v${i}`} className="post-video">
          {m.embed ? (
            <div className="post-embed">
              <iframe src={m.embed} title={m.caption || t('community.videoTitle')} loading="lazy" allow="encrypted-media; picture-in-picture" allowFullScreen sandbox="allow-scripts allow-same-origin allow-presentation allow-popups" referrerPolicy="strict-origin-when-cross-origin" />
            </div>
          ) : (
            <video controls preload="metadata" src={src(m)} poster={m.poster ? `${base}${m.poster.replace(/^\//, '')}` : undefined}>
              {t('community.videoUnsupported')}
            </video>
          )}
          {m.caption && <figcaption>{m.caption}</figcaption>}
        </figure>
      ))}
    </div>
  );
}

/** Write a post. Photos are shrunk before storage; a video is stored as the file it came in as. */
function Composer({ id, cities, profile, onPosted, onCancel }) {
  const [form, setForm] = useState({ kind: 'tip', title: '', body: '', cityId: profile.prefs.homeCityId || '', name: profile.name === t('profile.defaultName') ? '' : profile.name, school: '', videoUrl: '' });
  const [photos, setPhotos] = useState([]);
  const [video, setVideo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const previews = useMemo(() => photos.map((p) => URL.createObjectURL(p.blob)), [photos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setBusy(true);
    const next = [];
    for (const f of files.slice(0, MAX_PHOTOS - photos.length)) next.push({ blob: await downscaleImage(f), alt: '', name: f.name });
    setPhotos((prev) => [...prev, ...next].slice(0, MAX_PHOTOS));
    setBusy(false);
    if (photoRef.current) photoRef.current.value = '';
  };

  const addVideo = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (!f.type.startsWith('video/')) return setError(t('community.videoNotVideo'));
    if (f.size > MAX_VIDEO_BYTES) return setError(t('community.videoTooLarge', { mb: Math.round(MAX_VIDEO_BYTES / 1024 / 1024) }));
    setError('');
    setVideo(f);
    if (videoRef.current) videoRef.current.value = '';
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.body.trim()) return setError(t('community.needTitleBody'));
    const embed = form.videoUrl.trim() ? parseVideoUrl(form.videoUrl) : null;
    if (form.videoUrl.trim() && !embed) return setError(t('community.videoLinkRejected'));
    setBusy(true);
    setError('');
    try {
      const media = [];
      const mediaUrls = {};
      for (const p of photos) {
        const mediaId = `${newPostId()}-img`;
        await putMedia(mediaId, p.blob, { alt: p.alt });
        media.push({ type: 'image', mediaId, alt: p.alt });
        mediaUrls[mediaId] = URL.createObjectURL(p.blob);
      }
      if (video) {
        const mediaId = `${newPostId()}-vid`;
        await putMedia(mediaId, video);
        media.push({ type: 'video', mediaId });
        mediaUrls[mediaId] = URL.createObjectURL(video);
      }
      if (embed) media.push({ type: 'video', embed: embed.embed, provider: embed.provider });
      const post = normalizePost({
        id: newPostId(),
        local: true,
        kind: form.kind,
        title: form.title,
        body: form.body,
        cityId: form.cityId,
        author: { name: form.name, school: form.school, cityId: form.cityId },
        postedAt: new Date().toISOString().slice(0, 10),
        helpful: 0,
        media,
        links: [],
      });
      await putPost(post);
      onPosted(post, mediaUrls);
    } catch (err) {
      setError(err && err.message ? err.message : t('community.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form id={id} className="card composer" onSubmit={submit} style={{ marginBottom: 22 }}>
      <div className="section-head">
        <h2>{t('community.composerTitle')}</h2>
      </div>
      <p className="muted">{t('community.composerNote')}</p>

      <fieldset className="field" style={{ border: 0, padding: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('community.kindLabel')}</legend>
        <div className="chips">
          {KINDS.map((k) => (
            <button key={k} type="button" className="chip small" aria-pressed={form.kind === k} onClick={() => setForm({ ...form, kind: k })}>
              {t(`community.kinds.${k}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="cp-title">{t('community.titleLabel')}</label>
        <input id="cp-title" value={form.title} onChange={set('title')} maxLength={140} placeholder={t('community.titlePlaceholder')} />
      </div>
      <div className="field">
        <label htmlFor="cp-body">{t('community.bodyLabel')}</label>
        <textarea id="cp-body" value={form.body} onChange={set('body')} maxLength={4000} placeholder={t('community.bodyPlaceholder')} />
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        <div className="field">
          <label htmlFor="cp-name">{t('community.nameLabel')}</label>
          <input id="cp-name" value={form.name} onChange={set('name')} maxLength={60} placeholder={t('community.namePlaceholder')} />
        </div>
        <div className="field">
          <label htmlFor="cp-school">{t('community.schoolLabel')}</label>
          <input id="cp-school" value={form.school} onChange={set('school')} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="cp-city">{t('community.cityLabel')}</label>
          <select id="cp-city" value={form.cityId} onChange={set('cityId')}>
            <option value="">{t('community.noCity')}</option>
            {cities.map((c) => (
              <option key={c.cityId} value={c.cityId}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-head" style={{ marginTop: 8 }}>
        <h3>{t('community.mediaTitle')}</h3>
      </div>
      <div className="row" style={{ gap: 10 }}>
        <button type="button" className="btn small" onClick={() => photoRef.current && photoRef.current.click()} disabled={busy || photos.length >= MAX_PHOTOS}>
          {tn('community.addPhotos', MAX_PHOTOS - photos.length)}
        </button>
        <input ref={photoRef} type="file" accept="image/*" multiple onChange={addPhotos} className="visually-hidden" aria-label={t('community.addPhotosLabel')} />
        <button type="button" className="btn small" onClick={() => videoRef.current && videoRef.current.click()} disabled={busy || Boolean(video)}>
          {t('community.addVideo')}
        </button>
        <input ref={videoRef} type="file" accept="video/*" onChange={addVideo} className="visually-hidden" aria-label={t('community.addVideo')} />
      </div>

      {photos.length > 0 && (
        <ul className="list-reset post-photos n4" style={{ marginTop: 12 }}>
          {photos.map((p, i) => (
            <li key={i} className="composer-photo">
              <img src={previews[i]} alt="" />
              <label htmlFor={`cp-alt-${i}`} className="visually-hidden">
                {t('community.altLabel')}
              </label>
              <input id={`cp-alt-${i}`} value={p.alt} onChange={(e) => setPhotos(photos.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} placeholder={t('community.altPlaceholder')} maxLength={160} />
              <button type="button" className="btn quiet" onClick={() => setPhotos(photos.filter((_, j) => j !== i))}>
                {t('community.removePhoto')}
              </button>
            </li>
          ))}
        </ul>
      )}
      {video && (
        <p className="hint" style={{ marginTop: 10 }}>
          {t('community.videoAttached', { name: video.name, mb: (video.size / 1024 / 1024).toFixed(1) })}{' '}
          <button type="button" className="btn quiet" onClick={() => setVideo(null)}>
            {t('community.removeVideo')}
          </button>
        </p>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <label htmlFor="cp-video-url">{t('community.videoUrlLabel')}</label>
        <input id="cp-video-url" value={form.videoUrl} onChange={set('videoUrl')} placeholder="https://youtu.be/..." inputMode="url" />
        <p className="hint">{t('community.videoUrlHelp')}</p>
      </div>

      {error && (
        <p className="hint" role="alert" style={{ color: 'var(--crit)' }}>
          {error}
        </p>
      )}

      <div className="row" style={{ marginTop: 6 }}>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? <span className="spinner" aria-hidden="true" /> : null} {t('community.post')}
        </button>
        <button type="button" className="btn quiet" onClick={onCancel}>
          {t('common.back')}
        </button>
      </div>
    </form>
  );
}
