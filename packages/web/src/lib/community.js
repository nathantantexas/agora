/**
 * Pure helpers for the Community page: no React, no browser globals, so they run in the
 * Node test suite. The page itself and the on-device store live next to this file.
 */

export const KINDS = Object.freeze(['tip', 'toolkit', 'win', 'question']);

export function isKind(k) {
  return KINDS.includes(k);
}

/**
 * Turn a pasted YouTube or Vimeo link into a privacy-preserving embed URL, or null when
 * the link is anything else. Only these two hosts are allowed, because an iframe to an
 * arbitrary site is a phishing surface.
 */
export function parseVideoUrl(input) {
  let url;
  try {
    url = new URL(String(input || '').trim());
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol)) return null;
  const host = url.hostname.replace(/^www\.|^m\./, '');

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    let id = url.searchParams.get('v');
    if (!id) {
      const m = /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{6,})/.exec(url.pathname);
      if (m) id = m[1];
    }
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? { provider: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[A-Za-z0-9_-]{6,}$/.test(id) ? { provider: 'youtube', embed: `https://www.youtube-nocookie.com/embed/${id}` } : null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = /(\d{6,})/.exec(url.pathname);
    return m ? { provider: 'vimeo', embed: `https://player.vimeo.com/video/${m[1]}?dnt=1` } : null;
  }
  return null;
}

/**
 * A prefilled "new issue" link on the project repository. This is how a post written on
 * one device reaches the team for review, since the static site has nowhere else to send
 * it. Photos and video are attached in the issue editor, which hosts them.
 */
export function buildIssueUrl(repoUrl, post, labels = { kind: 'Kind', city: 'City', author: 'Posted by' }) {
  const base = String(repoUrl || '').replace(/\/+$/, '');
  const lines = [
    `**${labels.kind}:** ${post.kind}`,
    post.cityId ? `**${labels.city}:** ${post.cityId}` : null,
    post.author && post.author.name ? `**${labels.author}:** ${post.author.name}${post.author.school ? `, ${post.author.school}` : ''}` : null,
    '',
    post.body || '',
    '',
    post.media && post.media.length ? `_(${post.media.length} attachment${post.media.length === 1 ? '' : 's'} to add below)_` : null,
  ].filter((l) => l !== null);
  const params = new URLSearchParams({ title: `[community] ${post.title || ''}`.slice(0, 200), body: lines.join('\n').slice(0, 6000), labels: 'community' });
  return `${base}/issues/new?${params.toString()}`;
}

export function filterPosts(posts, { kind = '', cityId = '' } = {}) {
  return posts.filter((p) => (!kind || p.kind === kind) && (!cityId || p.cityId === cityId));
}

/** Newest first by default. "helpful" ranks by votes, then date, so ties stay stable. */
export function sortPosts(posts, by = 'newest') {
  const out = [...posts];
  if (by === 'helpful') out.sort((a, b) => (b.helpful || 0) - (a.helpful || 0) || String(b.postedAt).localeCompare(String(a.postedAt)));
  else out.sort((a, b) => String(b.postedAt).localeCompare(String(a.postedAt)));
  return out;
}

export function newPostId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `local-${Date.now().toString(36)}-${rand}`;
}

/** Shape check for anything that came from storage or a file, so the page can trust it. */
export function normalizePost(p) {
  if (!p || typeof p !== 'object') return null;
  const title = String(p.title || '').trim().slice(0, 140);
  const body = String(p.body || '').trim().slice(0, 4000);
  if (!title && !body) return null;
  return {
    id: String(p.id || newPostId()),
    sample: Boolean(p.sample),
    local: Boolean(p.local),
    kind: isKind(p.kind) ? p.kind : 'tip',
    title,
    body,
    author: { name: String((p.author && p.author.name) || '').trim().slice(0, 60), school: String((p.author && p.author.school) || '').trim().slice(0, 80), cityId: (p.author && p.author.cityId) || p.cityId || '' },
    cityId: String(p.cityId || ''),
    postedAt: /^\d{4}-\d{2}-\d{2}/.test(String(p.postedAt || '')) ? String(p.postedAt).slice(0, 10) : new Date().toISOString().slice(0, 10),
    helpful: Number.isFinite(Number(p.helpful)) ? Math.max(0, Math.floor(Number(p.helpful))) : 0,
    media: Array.isArray(p.media) ? p.media.filter((m) => m && (m.type === 'image' || m.type === 'video')).slice(0, 6) : [],
    links: Array.isArray(p.links) ? p.links.filter((l) => l && l.label && (l.to || l.url)).slice(0, 4) : [],
  };
}
