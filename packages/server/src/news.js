import { inferTopics } from '@agora/core';

/**
 * Pull recent local-government stories from the curated RSS feeds in data/news.json.
 * Feeds are fetched in parallel with a short timeout. Successes are cached for 15 minutes,
 * failures for 5 minutes (so one dead feed cannot slow every request), and concurrent
 * requests share one in-flight fetch per feed. If every feed fails, the caller still gets
 * the curated topic links.
 */
const HIT_TTL_MS = 15 * 60 * 1000;
const MISS_TTL_MS = 5 * 60 * 1000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const USER_AGENT = 'Agora civic app (student project; contact via GitHub)';

const cache = new Map();
const inflight = new Map();

export async function fetchNews(news, { topic, city, limit = 20 } = {}) {
  const sources = (news.sources || []).filter((s) => typeof s.rssUrl === 'string' && /^https?:\/\//i.test(s.rssUrl));
  const feeds = await Promise.all(sources.map((s) => loadFeed(s).catch(() => [])));
  let items = feeds.flat();

  const cityLower = city ? String(city).toLowerCase().slice(0, 60) : null;
  // Headlines are short and noisy, so demand a stronger keyword signal than agenda items need.
  items = items.map((item) => ({ ...item, topics: inferTopics(`${item.title} ${item.description || ''}`, 3, { minScore: 2 }) }));
  if (topic) items = items.filter((i) => i.topics.includes(topic));
  if (cityLower) items = items.filter((i) => `${i.title} ${i.description || ''}`.toLowerCase().includes(cityLower));

  items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || ''));
  const seen = new Set();
  items = items.filter((i) => {
    const key = i.link || i.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const topicLinks = (news.topicLinks || []).filter((l) => !topic || l.topic === topic);
  return {
    topic: topic || null,
    city: city || null,
    fetchedFeeds: feeds.filter((f) => f.length).length,
    totalFeeds: sources.length,
    items: items.slice(0, limit),
    topicLinks,
  };
}

async function loadFeed(source) {
  const key = source.rssUrl;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) {
    if (cached.error) throw cached.error;
    return cached.items;
  }
  if (inflight.has(key)) return inflight.get(key);
  const promise = fetchFeed(source)
    .then((items) => {
      cache.set(key, { items, expires: Date.now() + HIT_TTL_MS });
      return items;
    })
    .catch((error) => {
      cache.set(key, { items: [], error, expires: Date.now() + MISS_TTL_MS });
      throw error;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

async function fetchFeed(source) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(source.rssUrl, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const length = Number(res.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) throw new Error('Feed too large');
    const xml = await readLimited(res, MAX_BODY_BYTES);
    return parseFeed(xml).map((i) => ({ ...i, sourceId: source.id, sourceName: source.name }));
  } finally {
    clearTimeout(timer);
  }
}

async function readLimited(res, maxBytes) {
  if (!res.body || typeof res.body.getReader !== 'function') return (await res.text()).slice(0, maxBytes);
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel().catch(() => {});
      throw new Error('Feed too large');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Tiny RSS 2.0 / Atom parser. Good enough for headline, link, date, and a short description. */
export function parseFeed(xml) {
  const out = [];
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml);
  const blockRe = isAtom ? /<entry[\s\S]*?<\/entry>/gi : /<item[\s\S]*?<\/item>/gi;
  const blocks = xml.match(blockRe) || [];
  for (const block of blocks.slice(0, 40)) {
    const title = clean(tag(block, 'title'));
    let link = clean(tag(block, 'link'));
    if (isAtom) {
      const href = /<link[^>]*href="([^"]+)"/i.exec(block);
      if (href) link = decodeEntities(href[1]);
    }
    if (!/^https?:\/\//i.test(link)) continue;
    const description = clean(tag(block, 'description') || tag(block, 'summary') || tag(block, 'content')).slice(0, 280);
    const dateRaw = tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated') || tag(block, 'dc:date');
    const publishedAt = dateRaw ? toIso(dateRaw) : '';
    if (title) out.push({ title, link, description, publishedAt });
  }
  return out;
}

function tag(block, name) {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i');
  const m = re.exec(block);
  return m ? m[1] : '';
}

function codePoint(n) {
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : '';
}

function decodeEntities(s) {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]{1,6});/gi, (m, hex) => codePoint(parseInt(hex, 16)))
    .replace(/&#(\d{1,7});/g, (m, dec) => codePoint(Number(dec)))
    .replace(/&amp;/g, '&');
}

/**
 * Unwrap CDATA, strip tags, decode escaped HTML, collapse whitespace.
 *
 * Tags are stripped before entities are decoded, not after. Newsroom feeds embed an
 * <img> whose alt text can contain an encoded &gt;, and decoding first turns that into a
 * real angle bracket that ends the tag early, leaking the remaining attributes into the
 * summary as text. Stripping runs a second time after decoding for the feeds that escape
 * their markup instead of embedding it.
 */
function clean(s) {
  const unwrapped = String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(unwrapped.replace(/<[^>]*>/g, ' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toIso(s) {
  const d = new Date(clean(s));
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
