import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from '../src/main.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, '..', 'bin', 'agora.js');
const env = { ...process.env, NO_COLOR: '1', AGORA_PREFS: path.join(here, 'no-such-prefs.json') };

function cli(args) {
  return execFileSync(process.execPath, [bin, ...args], { env, encoding: 'utf8' });
}

test('argument parser', () => {
  assert.deepEqual(parseArgs(['match', '--interests', 'a,b', '--evening', 'extra', '--miles=5']), { cmd: 'match', flags: { interests: 'a,b', evening: true, miles: '5' }, args: ['extra'] });
  assert.deepEqual(parseArgs([]).cmd, 'help');
});

test('help prints commands', () => {
  const out = cli(['help']);
  assert.match(out, /Commands:/);
  assert.match(out, /match/);
});

test('cities and meetings run against the merged data', () => {
  const cities = JSON.parse(cli(['cities', '--json', '--today', '2026-09-14']));
  assert.ok(cities.cities.length >= 1, 'data/cities.json should have at least one city');
  const meetings = JSON.parse(cli(['meetings', '--json', '--days', '30', '--today', '2026-09-14']));
  assert.ok(Array.isArray(meetings.meetings));
  assert.ok(meetings.meetings.every((m) => m.date >= '2026-09-14'));
});

test('match with flags returns ranked meetings with reasons', () => {
  const plan = JSON.parse(cli(['match', '--json', '--interests', 'housing,transit', '--evening', '--weekends', '--today', '2026-09-14']));
  assert.ok(plan.meetings.length > 0);
  assert.ok(plan.meetings[0].reasons.length > 0);
  assert.ok(plan.meetings.every((m, i, arr) => i === 0 || arr[i - 1].score >= m.score), 'sorted by score');
});

test('unknown city fails with a clear message', () => {
  assert.throws(() => cli(['speak', 'Atlantis']), (err) => /No city called/.test(err.stderr || String(err)));
});

test('comment drafting works offline', () => {
  const out = cli(['comment', '--name', 'Sam', '--topic', 'transit', '--ask', 'add a bus stop by the high school']);
  assert.match(out, /My name is Sam/);
  assert.match(out, /add a bus stop/);
});
