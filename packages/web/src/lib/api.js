/** Thin fetch wrappers. Every call fails soft so the UI can fall back to bundled data. */

// Same origin in development and in the single-server production build. A static deploy
// with no API of its own can point this at a hosted one by setting VITE_API_BASE.
const API = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

// Set by the Pages build, which has no server behind it. Without this the news page
// would fire a request that is certain to 404 before falling back on every visit.
const STATIC_ONLY = import.meta.env.VITE_STATIC_DEPLOY === '1';

async function getJson(url, options) {
  const res = await fetch(url, { ...options, headers: { Accept: 'application/json', ...(options && options.headers) } });
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json()).error || '';
    } catch {
      /* ignore */
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json();
}

/**
 * Headlines gathered at deploy time, for the hosted copy that has no server to run
 * /api/news. Fetched once per session and filtered in the browser, which is what the
 * server would otherwise do per request.
 */
let snapshot = null;

function loadSnapshot() {
  if (!snapshot) {
    snapshot = fetch(`${import.meta.env.BASE_URL}news-snapshot.json`).then((r) => {
      if (!r.ok) throw new Error(`No headline snapshot (${r.status})`);
      return r.json();
    });
    // Let a failed load be retried rather than caching the rejection for the session.
    snapshot.catch(() => {
      snapshot = null;
    });
  }
  return snapshot;
}

function filterSnapshot(snap, { topic, city, limit = 20 } = {}) {
  let items = snap.items || [];
  if (topic) items = items.filter((i) => (i.topics || []).includes(topic));
  if (city) {
    const needle = String(city).toLowerCase();
    items = items.filter((i) => `${i.title} ${i.description || ''}`.toLowerCase().includes(needle));
  }
  return {
    topic: topic || null,
    city: city || null,
    fetchedFeeds: snap.fetchedFeeds,
    totalFeeds: snap.totalFeeds,
    items: items.slice(0, limit),
    topicLinks: (snap.topicLinks || []).filter((l) => !topic || l.topic === topic),
    snapshotAt: snap.generatedAt,
  };
}

export const api = {
  health: () => getJson(`${API}/health`),
  news: async (params = {}) => {
    if (STATIC_ONLY) return filterSnapshot(await loadSnapshot(), params);
    try {
      return await getJson(`${API}/news?${new URLSearchParams(clean(params))}`);
    } catch (err) {
      // An API was expected but did not answer. Fall back to the snapshot, and if that is
      // missing too, report the original failure so the page shows its offline links.
      const snap = await loadSnapshot().catch(() => {
        throw err;
      });
      return filterSnapshot(snap, params);
    }
  },
  geocode: (q) => getJson(`${API}/geocode?q=${encodeURIComponent(q)}`),
  explain: (body) => getJson(`${API}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  comment: (body) => getJson(`${API}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};

function clean(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}
