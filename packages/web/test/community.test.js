import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVideoUrl, buildIssueUrl, filterPosts, sortPosts, normalizePost } from '../src/lib/community.js';

test('video links resolve only for YouTube and Vimeo, to privacy-preserving embeds', () => {
  assert.equal(parseVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ').embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(parseVideoUrl('https://youtu.be/dQw4w9WgXcQ?t=10').embed, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  assert.equal(parseVideoUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ').provider, 'youtube');
  assert.equal(parseVideoUrl('https://vimeo.com/123456789').embed, 'https://player.vimeo.com/video/123456789?dnt=1');
  // Anything else is refused: an iframe to an arbitrary host is a phishing surface.
  assert.equal(parseVideoUrl('https://example.com/watch?v=abc'), null);
  assert.equal(parseVideoUrl('javascript:alert(1)'), null);
  assert.equal(parseVideoUrl('not a url'), null);
  assert.equal(parseVideoUrl('https://www.youtube.com/watch?v=<script>'), null);
});

test('the review link carries the post into a prefilled issue on the repository', () => {
  const url = buildIssueUrl('https://github.com/example/agora/', { kind: 'win', title: 'Crosswalk on the list', body: 'Six of us spoke.', cityId: 'garland', author: { name: 'J.', school: 'Garland HS' }, media: [{ type: 'image' }] });
  const u = new URL(url);
  assert.equal(u.origin + u.pathname, 'https://github.com/example/agora/issues/new');
  assert.equal(u.searchParams.get('title'), '[community] Crosswalk on the list');
  assert.match(u.searchParams.get('body'), /\*\*Kind:\*\* win/);
  assert.match(u.searchParams.get('body'), /Six of us spoke\./);
  assert.match(u.searchParams.get('body'), /1 attachment/);
  assert.equal(u.searchParams.get('labels'), 'community');
});

test('filtering and sorting', () => {
  const posts = [
    { id: 'a', kind: 'tip', cityId: 'plano', postedAt: '2026-09-01', helpful: 5 },
    { id: 'b', kind: 'win', cityId: 'plano', postedAt: '2026-09-10', helpful: 40 },
    { id: 'c', kind: 'tip', cityId: 'denton', postedAt: '2026-09-05', helpful: 40 },
  ];
  assert.deepEqual(filterPosts(posts, { kind: 'tip' }).map((p) => p.id), ['a', 'c']);
  assert.deepEqual(filterPosts(posts, { cityId: 'plano' }).map((p) => p.id), ['a', 'b']);
  assert.deepEqual(sortPosts(posts).map((p) => p.id), ['b', 'c', 'a'], 'newest first');
  assert.deepEqual(sortPosts(posts, 'helpful').map((p) => p.id), ['b', 'c', 'a'], 'votes, then date breaks the tie');
});

test('anything from storage is normalized before the page trusts it', () => {
  assert.equal(normalizePost(null), null);
  assert.equal(normalizePost({ title: '', body: '   ' }), null, 'an empty post is dropped');
  const p = normalizePost({ title: 'x', kind: 'nonsense', helpful: -3, postedAt: 'garbage', media: [{ type: 'script' }, { type: 'image', src: 'a' }], links: [{ label: 'ok', to: '/map' }, { label: 'no target' }] });
  assert.equal(p.kind, 'tip');
  assert.equal(p.helpful, 0);
  assert.match(p.postedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(p.media.length, 1);
  assert.equal(p.links.length, 1);
});
