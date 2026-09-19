/** Thin fetch wrappers. Every call fails soft so the UI can fall back to bundled data. */

// Same origin in development and in the single-server production build. A static deploy
// with no API of its own can point this at a hosted one by setting VITE_API_BASE.
const API = (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, '');

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

export const api = {
  health: () => getJson(`${API}/health`),
  news: (params = {}) => getJson(`${API}/news?${new URLSearchParams(clean(params))}`),
  geocode: (q) => getJson(`${API}/geocode?q=${encodeURIComponent(q)}`),
  explain: (body) => getJson(`${API}/explain`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  comment: (body) => getJson(`${API}/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
};

function clean(params) {
  const out = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') out[k] = v;
  return out;
}
