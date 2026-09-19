/**
 * Gather the newsroom feeds once and write a static snapshot the web app can read.
 *
 * The hosted copy of Agora is a static site with no server behind it, so /api/news has
 * nowhere to run. Fetching the feeds at deploy time instead gives that copy real
 * headlines; a scheduled workflow re-runs this every few hours so they stay current.
 * Anywhere the API is actually running, the live endpoint is still used first and this
 * file is never read.
 *
 * Usage: node scripts/build-news.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNews } from '@agora/core/node';
import { fetchNews } from '../packages/server/src/news.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'packages', 'web', 'public');
const outFile = path.join(outDir, 'news-snapshot.json');

// Generous, because the app filters this list by topic and city in the browser rather
// than asking a server for a new slice.
const LIMIT = 200;

const news = loadNews();
let result = { items: [], topicLinks: news.topicLinks || [], fetchedFeeds: 0, totalFeeds: (news.sources || []).length };

try {
  result = await fetchNews(news, { limit: LIMIT });
} catch (err) {
  // One bad network day should not fail a deploy. The page still gets the curated topic
  // links, which is what it falls back to anyway.
  console.warn(`Could not gather headlines: ${err && err.message ? err.message : err}`);
}

const snapshot = {
  generatedAt: new Date().toISOString(),
  fetchedFeeds: result.fetchedFeeds,
  totalFeeds: result.totalFeeds,
  items: result.items,
  topicLinks: result.topicLinks,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, `${JSON.stringify(snapshot)}\n`);

const kb = Math.round(Buffer.byteLength(JSON.stringify(snapshot)) / 1024);
console.log(`Wrote ${snapshot.items.length} headlines from ${snapshot.fetchedFeeds} of ${snapshot.totalFeeds} feeds (${kb} KB) to ${path.relative(process.cwd(), outFile)}`);

// A snapshot with no headlines is not worth deploying silently, so say so loudly. It is
// still not a build failure: the page degrades to the curated links.
if (!snapshot.items.length) console.warn('WARNING: no headlines were gathered. The news page will show its curated links only.');
