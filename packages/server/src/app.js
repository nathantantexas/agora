import express from 'express';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BRAND,
  TOPICS,
  todayStr,
  upcomingMeetings,
  expandCityMeetings,
  addDays,
  nextMeetingFor,
  buildPlan,
  matchMeetings,
  matchAgendaItems,
  computeStats,
  findCity,
  isDateStr,
  isTopicId,
  topicList,
  glossary,
  checklist,
  speakingTips,
  buildComment,
  estimateSpeakingSeconds,
  timeOfDayFor,
  LOCALES,
  isLocale,
  setLocale,
  localizeCities,
} from '@agora/core';
import { fetchNews } from './news.js';
import { loadTranslations } from '@agora/core/node';
import { geocode, normalizeQuery } from './geocode.js';
import { explainAgendaItem, draftComment, aiAvailable } from './ai.js';

const here = path.dirname(fileURLToPath(import.meta.url));

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "connect-src 'self' https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  // Community posts: photos and video stored on the device come back as blob: URLs, and
  // pasted video links are only ever rewritten to these two embed hosts.
  "media-src 'self' blob:",
  "frame-src https://www.youtube-nocookie.com https://player.vimeo.com",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

/** Origins allowed to call the API from a browser on another host (dev tools, a separately hosted web build). */
function corsAllowed(origin) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  const extra = String(process.env.CORS_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return extra.includes(origin);
}

/** Tiny per-IP sliding-window limiter; enough to keep a demo server from being abused. */
function limiter(max, windowMs = 60000) {
  const hits = new Map();
  let lastPrune = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - lastPrune > windowMs) {
      for (const [ip, times] of hits) {
        const keep = times.filter((t) => now - t < windowMs);
        if (keep.length) hits.set(ip, keep);
        else hits.delete(ip);
      }
      lastPrune = now;
    }
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const times = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    if (times.length >= max) {
      res.setHeader('Retry-After', String(Math.ceil(windowMs / 1000)));
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    times.push(now);
    hits.set(ip, times);
    next();
  };
}

const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max) : '');

/**
 * Build the Express app. Data is injected so tests can pass fixtures.
 * @param {{cities: object[], news: {sources: object[], topicLinks: object[]}, webDist?: string, now?: () => Date}} deps
 */
export function createApp({ cities, news, webDist, now = () => new Date(), translations = loadTranslationsSafely }) {
  // City data localized per language, built once per language and reused.
  const localized = new Map([['en', cities]]);
  const citiesIn = (lang) => {
    if (localized.has(lang)) return localized.get(lang);
    const list = localizeCities(cities, translations(lang));
    localized.set(lang, list);
    return list;
  };
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '32kb' }));

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    res.setHeader('X-Frame-Options', 'DENY');
    if (req.path.startsWith('/api/')) {
      res.setHeader('Cache-Control', 'no-store');
      const origin = req.headers.origin;
      if (corsAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      }
      if (req.method === 'OPTIONS') return res.sendStatus(204);
    } else {
      res.setHeader('Content-Security-Policy', CSP);
    }
    next();
  });

  app.use('/api', limiter(240));

  // Language comes from ?lang= or the Accept-Language header, and applies for this request only.
  app.use('/api', (req, res, next) => {
    const header = String(req.headers['accept-language'] || '')
      .split(',')
      .map((part) => part.split(';')[0].trim());
    req.lang = [req.query.lang, ...header].map((x) => String(x || '').split('-')[0]).find(isLocale) || 'en';
    setLocale(req.lang);
    res.setHeader('Content-Language', req.lang);
    res.setHeader('Vary', [res.getHeader('Vary'), 'Accept-Language'].filter(Boolean).join(', '));
    next();
  });

  const today = () => todayStr('America/Chicago', now());
  const cityIndex = new Map(cities.map((c) => [c.cityId, c]));
  const findAgendaItem = (cityId, title) => {
    const pool = cityId && cityIndex.has(cityId) ? [cityIndex.get(cityId)] : cities;
    const wanted = title.toLowerCase();
    for (const city of pool) for (const item of city.agendaItems || []) if (item.title.toLowerCase() === wanted) return { city, item };
    return null;
  };

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, app: BRAND.name, cities: cities.length, today: today(), ai: aiAvailable(), lang: req.lang, languages: LOCALES });
  });

  app.get('/api/topics', (req, res) => res.json({ topics: topicList(req.lang) }));

  app.get('/api/cities', (req, res) => {
    const from = today();
    res.json({ cities: citiesIn(req.lang).map((c) => summarizeCity(c, from)) });
  });

  app.get('/api/cities/:id', (req, res) => {
    const city = citiesIn(req.lang).find((c) => c.cityId === req.params.id) || findCity(citiesIn(req.lang), req.params.id);
    if (!city) return res.status(404).json({ error: 'City not found' });
    const from = today();
    res.json({ city, upcoming: expandCityMeetings(city, from, addDays(from, 60)) });
  });

  app.get('/api/meetings', (req, res) => {
    const from = isDateStr(req.query.from) ? req.query.from : today();
    const days = clampInt(req.query.days, 1, 120, 30);
    let list = upcomingMeetings(citiesIn(req.lang), { from, days, includeCancelled: req.query.includeCancelled === '1' });
    if (req.query.city) {
      const city = findCity(citiesIn(req.lang), str(req.query.city, 60));
      list = city ? list.filter((m) => m.cityId === city.cityId) : [];
    }
    if (req.query.evening === '1') list = list.filter((m) => m.isEvening);
    if (req.query.speak === '1') list = list.filter((m) => m.openToPublicComment);
    if (isTopicId(req.query.topic)) list = list.filter((m) => m.agendaItems.some((a) => a.topics.includes(req.query.topic)));
    res.json({ from, days, count: list.length, meetings: list });
  });

  app.post('/api/match', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const prefs = body.prefs && typeof body.prefs === 'object' ? body.prefs : body;
    const from = today();
    res.json(buildPlan(citiesIn(req.lang), prefs, { today: from, days: clampInt(body.days, 7, 120, 45) }));
  });

  app.get('/api/match', (req, res) => {
    const list = citiesIn(req.lang);
    const homeCity = req.query.city ? findCity(list, str(req.query.city, 60)) : null;
    const prefs = {
      interests: str(req.query.interests, 400)
        .split(',')
        .map((s) => s.trim())
        .filter(isTopicId),
      availability: { evenings: req.query.evenings !== '0', daytime: req.query.daytime === '1', weekends: req.query.weekends !== '0' },
      homeCityId: homeCity ? homeCity.cityId : null,
      location: req.query.lat && req.query.lng ? { lat: Number(req.query.lat), lng: Number(req.query.lng) } : null,
      maxMiles: req.query.miles ? Number(req.query.miles) : undefined,
      canSpeakOnly: req.query.speak === '1',
    };
    const from = today();
    res.json({
      prefs,
      meetings: matchMeetings(list, prefs, { today: from, days: clampInt(req.query.days, 7, 120, 45), limit: clampInt(req.query.limit, 1, 50, 10) }),
      agendaItems: matchAgendaItems(list, prefs, { today: from, limit: 10 }),
    });
  });

  app.get('/api/stats', (req, res) => {
    res.json(computeStats(citiesIn(req.lang), { today: today(), days: clampInt(req.query.days, 7, 120, 30) }));
  });

  app.get('/api/news', limiter(30), async (req, res) => {
    const topic = isTopicId(req.query.topic) ? req.query.topic : undefined;
    try {
      const result = await fetchNews(news, { topic, city: str(req.query.city, 60) || undefined, limit: clampInt(req.query.limit, 1, 50, 20) });
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: 'News feeds unavailable', detail: String(e.message || e), topicLinks: news.topicLinks });
    }
  });

  app.get('/api/geocode', limiter(20), async (req, res) => {
    const q = normalizeQuery(req.query.q);
    if (!q) return res.status(400).json({ error: 'Missing q' });
    try {
      const result = await geocode(q, citiesIn('en'));
      if (!result) return res.status(404).json({ error: 'No match in Dallas-Fort Worth' });
      res.json(result);
    } catch (e) {
      res.status(502).json({ error: 'Geocoder unavailable', detail: String(e.message || e) });
    }
  });

  app.get('/api/learn', (req, res) => {
    res.json({ glossary: glossary(req.lang), checklist: checklist(req.lang), tips: speakingTips(req.lang), nonpartisan: BRAND.nonpartisanNote });
  });

  app.post('/api/comment', limiter(12), async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const city = body.cityId ? citiesIn(req.lang).find((c) => c.cityId === str(body.cityId, 60)) : null;
    const input = {
      name: str(body.name, 80),
      school: str(body.school, 120),
      cityName: city ? city.name : str(body.cityName, 60),
      topicId: isTopicId(body.topicId) ? body.topicId : 'other',
      itemTitle: str(body.itemTitle, 200),
      position: ['support', 'oppose', 'concerned', 'ask'].includes(body.position) ? body.position : 'ask',
      story: str(body.story, 1200),
      ask: str(body.ask, 300),
      timeOfDay: city && city.meetings && city.meetings[0] ? timeOfDayFor(city.meetings[0].recurrence.time) : 'evening',
      locale: req.lang,
    };
    const draft = buildComment(input);
    const ai = body.useAi === true && aiAvailable() ? await draftComment(input, draft) : null;
    res.json({ draft, seconds: estimateSpeakingSeconds(draft), ai });
  });

  app.post('/api/explain', limiter(12), async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const title = str(body.title, 300);
    if (!title) return res.status(400).json({ error: 'Missing title' });
    const cityId = str(body.cityId, 60);
    const known = findAgendaItem(cityId, title);
    const city = known ? known.city : cityIndex.get(cityId) || null;
    // AI explanations are English-only for now; the template fallback follows the request language.
    // The AI explanation is only spent on agenda items that exist in the dataset; anything else gets the template.
    const result = known ? await explainAgendaItem({ title: known.item.title, summary: known.item.summary, city }) : await explainAgendaItem({ title, summary: str(body.summary, 2000), city, templateOnly: true });
    res.json(result);
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // Serve the built web app when it exists (npm run build), with SPA fallback.
  const dist = webDist || path.resolve(here, '..', '..', 'web', 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { maxAge: '1h', index: 'index.html' }));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(dist, 'index.html'));
    });
  } else {
    app.get('/', (req, res) => {
      res.type('text/plain').send(`${BRAND.name} API is running. Build the web app with "npm run build" to serve it here, or run "npm run dev".\n\nTry: /api/health, /api/cities, /api/meetings?days=14, /api/match?interests=housing,transit&city=plano`);
    });
  }

  // Every error, including malformed JSON bodies, comes back as JSON without a stack trace.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.type === 'entity.parse.failed' ? 400 : err.type === 'entity.too.large' ? 413 : err.status || err.statusCode || 500;
    const error = status === 400 ? 'Invalid JSON body' : status === 413 ? 'Request body too large' : status >= 500 ? 'Server error' : String(err.message || 'Request failed');
    if (status >= 500) console.error(err);
    res.status(status).json({ error });
  });

  return app;
}

function summarizeCity(city, from) {
  const next = nextMeetingFor(city, from);
  const nextSpeak = nextMeetingFor(city, from, { publicCommentOnly: true });
  return {
    cityId: city.cityId,
    name: city.name,
    county: city.county,
    populationApprox: city.populationApprox,
    cityHall: city.cityHall,
    website: city.website,
    confidence: city.confidence,
    meetingRules: (city.meetings || []).map((m) => ({ type: m.type, label: m.label, recurrence: m.recurrence, openToPublicComment: m.openToPublicComment !== false })),
    publicComment: city.publicComment,
    youthProgramCount: (city.youthPrograms || []).length,
    agendaItemCount: (city.agendaItems || []).length,
    nextMeeting: next,
    nextSpeakableMeeting: nextSpeak,
  };
}

/** Translation memory loader that never throws, so a missing file just means English. */
function loadTranslationsSafely(lang) {
  try {
    return loadTranslations(lang);
  } catch {
    return null;
  }
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
