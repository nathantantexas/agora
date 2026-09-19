import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { parseFeed } from '../src/news.js';

const cities = [
  {
    cityId: 'plano',
    name: 'Plano',
    county: 'Collin',
    website: 'https://www.plano.gov',
    cityHall: { address: '1520 K Ave, Plano, TX 75074', lat: 33.0198, lng: -96.6989 },
    meetings: [{ type: 'regular', label: 'City Council meeting', openToPublicComment: true, recurrence: { kind: 'nth-weekday', weekday: 1, ordinals: [2, 4], time: '19:00' } }],
    publicComment: { summary: 'Fill out a card.', howToRegister: 'Speaker card at the door.', virtualAllowed: false, timeLimitMinutes: 3 },
    youthPrograms: [],
    agendaItems: [{ title: 'Rezoning near Legacy', meetingDate: '2026-09-14', topics: ['zoning-development', 'housing'] }],
    confidence: 'high',
    sources: [],
  },
];

let server;
let base;

before(async () => {
  const app = createApp({ cities, news: { sources: [], topicLinks: [{ topic: 'housing', label: 'Housing news', url: 'https://example.com', sourceName: 'Example' }] }, webDist: 'C:/definitely/not/here', now: () => new Date('2026-09-10T15:00:00Z') });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server && server.close());

test('health reports city count and today in Central time', async () => {
  const res = await fetch(`${base}/api/health`);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.cities, 1);
  assert.equal(body.today, '2026-09-10');
});

test('cities summary includes next meeting', async () => {
  const body = await (await fetch(`${base}/api/cities`)).json();
  assert.equal(body.cities[0].nextMeeting.date, '2026-09-14');
});

test('meetings endpoint filters by city and evening', async () => {
  const body = await (await fetch(`${base}/api/meetings?days=30&city=Plano&evening=1`)).json();
  assert.equal(body.count, 2);
  const none = await (await fetch(`${base}/api/meetings?days=30&city=Nowhere`)).json();
  assert.equal(none.count, 0);
});

test('match via GET and POST agree', async () => {
  const get = await (await fetch(`${base}/api/match?interests=housing&city=plano`)).json();
  const post = await (await fetch(`${base}/api/match`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefs: { interests: ['housing'], homeCityId: 'plano' } }) })).json();
  assert.equal(get.meetings[0].cityId, 'plano');
  assert.equal(post.meetings[0].cityId, 'plano');
  assert.ok(post.summary.includes('Plano'));
});

test('unknown city is a 404 and unknown api route is JSON 404', async () => {
  assert.equal((await fetch(`${base}/api/cities/nope`)).status, 404);
  const res = await fetch(`${base}/api/nothing`);
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error, 'Not found');
});

test('news falls back to topic links when there are no feeds', async () => {
  const body = await (await fetch(`${base}/api/news?topic=housing`)).json();
  assert.equal(body.items.length, 0);
  assert.equal(body.topicLinks.length, 1);
});

test('comment endpoint returns a template draft without AI', async () => {
  const body = await (await fetch(`${base}/api/comment`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Ana', cityName: 'Plano', topicId: 'parks-recreation' }) })).json();
  assert.match(body.draft, /My name is Ana/);
  assert.ok(body.seconds > 0);
});

test('rss and atom parsing', () => {
  const rss = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[Council OKs budget]]></title><link>https://x.test/a</link><pubDate>Wed, 09 Sep 2026 12:00:00 GMT</pubDate><description>&lt;p&gt;Tax rate set&lt;/p&gt;</description></item></channel></rss>`;
  const items = parseFeed(rss);
  assert.equal(items.length, 1);
  assert.equal(items[0].title, 'Council OKs budget');
  assert.equal(items[0].description, 'Tax rate set');
  assert.equal(items[0].publishedAt.slice(0, 10), '2026-09-09');
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>DART vote</title><link href="https://x.test/b"/><updated>2026-09-08T10:00:00Z</updated><summary>Bus plan</summary></entry></feed>`;
  const a = parseFeed(atom);
  assert.equal(a[0].link, 'https://x.test/b');
});

test('language comes from the query string and the Accept-Language header', async () => {
  const en = await (await fetch(`${base}/api/topics`)).json();
  const es = await (await fetch(`${base}/api/topics?lang=es`)).json();
  const vi = await (await fetch(`${base}/api/topics`, { headers: { 'Accept-Language': 'vi-VN,vi;q=0.9' } })).json();
  assert.notEqual(es.topics[0].label, en.topics[0].label);
  assert.notEqual(vi.topics[0].label, en.topics[0].label);
  assert.notEqual(vi.topics[0].label, es.topics[0].label);
  assert.equal(es.topics.length, en.topics.length);

  const health = await (await fetch(`${base}/api/health?lang=es`));
  assert.equal(health.headers.get('content-language'), 'es');
  assert.equal((await health.json()).lang, 'es');

  const unknown = await (await fetch(`${base}/api/health?lang=klingon`)).json();
  assert.equal(unknown.lang, 'en', 'an unsupported language falls back to English');
});

test('learn content and match reasons follow the request language', async () => {
  const en = await (await fetch(`${base}/api/learn`)).json();
  const es = await (await fetch(`${base}/api/learn?lang=es`)).json();
  assert.equal(es.glossary.length, en.glossary.length);
  assert.notEqual(es.glossary[0].term, en.glossary[0].term);
  assert.notEqual(es.checklist[0], en.checklist[0]);

  const planEn = await (await fetch(`${base}/api/match?interests=housing&city=plano`)).json();
  const planEs = await (await fetch(`${base}/api/match?interests=housing&city=plano&lang=es`)).json();
  assert.equal(planEs.meetings.length, planEn.meetings.length);
  assert.notEqual(planEs.meetings[0].reasons[0].text, planEn.meetings[0].reasons[0].text);
});

test('city data is localized when a translation memory is supplied', async () => {
  const app = createApp({
    cities,
    news: { sources: [], topicLinks: [] },
    webDist: 'C:/definitely/not/here',
    now: () => new Date('2026-09-10T15:00:00Z'),
    translations: (lang) => (lang === 'es' ? { 'Fill out a card.': 'Llene una tarjeta.', 'Rezoning near Legacy': 'Rezonificación cerca de Legacy' } : null),
  });
  const server2 = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const base2 = `http://127.0.0.1:${server2.address().port}`;
  try {
    const es = await (await fetch(`${base2}/api/cities/plano?lang=es`)).json();
    assert.equal(es.city.publicComment.summary, 'Llene una tarjeta.');
    assert.equal(es.city.agendaItems[0].title, 'Rezonificación cerca de Legacy');
    assert.equal(es.city.name, 'Plano', 'the city name stays as it is');
    const en = await (await fetch(`${base2}/api/cities/plano`)).json();
    assert.equal(en.city.publicComment.summary, 'Fill out a card.', 'English is untouched');
  } finally {
    server2.close();
  }
});
