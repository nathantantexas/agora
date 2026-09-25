import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyzeTranscript, markFillers, paceSeries, tokenize } from '../src/lib/rehearse/speech.js';
import { summarizeEnvelope, pitchStats, estimateSyllables, detectPitch, loudnessSeries } from '../src/lib/rehearse/audio.js';
import { headPoseFromLandmarks, isEyeContact, summarizeBody } from '../src/lib/rehearse/vision.js';
import { buildFindings } from '../src/lib/rehearse/coach.js';

test('fillers are counted, including two word ones, without double counting', () => {
  const marked = markFillers('So um I think, you know, the park is like closed um early.', 'en');
  const hits = marked.filter((m) => m.filler).map((m) => m.filler);
  assert.deepEqual(hits, ['um', 'you know', 'like', 'um']);
  const es = markFillers('Este, o sea, pues el parque cierra temprano.', 'es');
  assert.deepEqual(es.filter((m) => m.filler).map((m) => m.filler), ['este', 'o sea', 'pues']);
});

test('pace, script coverage, and whether the key elements landed', () => {
  const script = 'Good evening, my name is Ana Reyes and I am a student at Garland High School. I am here about the sidewalk on Park Boulevard. I am asking you to fund the sidewalk gap in this budget. Thank you for listening.';
  const said = 'good evening my name is ana reyes student at garland high school um the sidewalk on park boulevard is dangerous i am asking you to fund the sidewalk gap in this budget';
  const r = analyzeTranscript(said, { lang: 'en', durationSec: 15, script, fields: { name: 'Ana Reyes', school: 'Garland High School', itemTitle: 'Sidewalk on Park Boulevard', ask: 'fund the sidewalk gap in this budget' } });
  assert.equal(r.words, tokenize(said).length);
  assert.equal(r.wpm, Math.round((r.words / 15) * 60));
  assert.equal(r.script.sentences, 4);
  assert.equal(r.script.spokenCount, 3, 'the thank-you line was skipped');
  assert.deepEqual(r.script.skipped, ['Thank you for listening.']);
  assert.deepEqual(r.elements, { name: true, school: true, itemTitle: true, ask: true });
  assert.equal(r.fillerTotal, 1);
});

test('pace over time comes from the cumulative word timeline', () => {
  const series = paceSeries([{ t: 0, words: 0 }, { t: 15, words: 40 }, { t: 30, words: 60 }], 30, 15);
  assert.deepEqual(series.map((p) => p.v), [160, 80]);
});

test('pauses only count between the first and last speech, and trailing off is detected', () => {
  const dt = 0.05;
  const frames = [];
  const push = (sec, rms) => { for (let i = 0; i < sec / dt; i += 1) frames.push({ t: frames.length * dt, rms, pitchHz: 0 }); };
  push(1, 0.001); // silence before speaking: not a pause
  push(2, 0.2); // phrase
  push(1.0, 0.001); // a real pause, 1.0 s
  push(1.5, 0.2); // phrase that trails off:
  push(0.5, 0.02); // ... quiet tail
  push(2.0, 0.001); // long pause, 2.0 s
  push(2, 0.2);
  push(1, 0.001); // silence after: not a pause
  const e = summarizeEnvelope(frames, dt);
  assert.equal(e.pauses.length, 2);
  assert.equal(e.longPauses, 1);
  assert.ok(e.speakingSec > 5 && e.speakingSec < 7, `speaking ${e.speakingSec}`);
  assert.ok(e.loudness.trailOff > 0, 'one phrase trailed off');
});

test('pitch variety separates a monotone from a lively delivery, and detectPitch finds a tone', () => {
  const flat = Array.from({ length: 100 }, () => ({ rms: 0.2, pitchHz: 120 }));
  const lively = Array.from({ length: 100 }, (_, i) => ({ rms: 0.2, pitchHz: 110 + 40 * Math.sin(i / 6) }));
  assert.equal(pitchStats(flat).monotone, true);
  assert.equal(pitchStats(lively).monotone, false);
  const rate = 16000;
  const buf = new Float32Array(1024);
  for (let i = 0; i < buf.length; i += 1) buf[i] = Math.sin((2 * Math.PI * 200 * i) / rate);
  const hz = detectPitch(buf, rate);
  assert.ok(Math.abs(hz - 200) < 6, `detected ${hz}`);
});

test('syllable estimate and loudness series behave on a pulsed signal', () => {
  const dt = 0.05;
  const frames = [];
  for (let i = 0; i < 200; i += 1) frames.push({ t: i * dt, rms: i % 4 === 0 ? 0.3 : 0.05, pitchHz: 0 });
  const syl = estimateSyllables(frames, dt);
  assert.ok(syl >= 40 && syl <= 50, `syllables ${syl}`);
  const series = loudnessSeries(frames, dt, 5);
  assert.equal(series.length, 2);
  assert.equal(Math.max(...series.map((p) => p.v)), 100);
});

test('head pose from landmarks: centered face is eye contact, nose dropped is looking down', () => {
  const lm = [];
  lm[1] = { x: 0.5, y: 0.55 };
  lm[10] = { x: 0.5, y: 0.2 };
  lm[152] = { x: 0.5, y: 0.8 };
  lm[234] = { x: 0.3, y: 0.5 };
  lm[454] = { x: 0.7, y: 0.5 };
  lm[33] = { x: 0.4, y: 0.4 };
  lm[263] = { x: 0.6, y: 0.4 };
  const centered = headPoseFromLandmarks(lm.map((p) => ({ ...p })));
  assert.ok(Math.abs(centered.yaw) < 1 && Math.abs(centered.pitch) < 3, JSON.stringify(centered));
  assert.equal(isEyeContact(centered), true);
  const turned = { ...lm, 1: { x: 0.64, y: 0.55 } };
  assert.ok(Math.abs(headPoseFromLandmarks(Object.assign([], lm, turned)).yaw) > 18);
  const down = Object.assign([], lm, { 1: { x: 0.5, y: 0.7 } });
  assert.ok(headPoseFromLandmarks(down).pitch < -14);
  assert.equal(isEyeContact(headPoseFromLandmarks(down)), false);
});

test('body summary: shares, sway, hands, and the per second timeline', () => {
  const samples = [];
  for (let i = 0; i < 100; i += 1) {
    const t = i / 10;
    samples.push({ t, faceFound: true, yaw: i < 60 ? 0 : 30, pitch: 0, smile: 0.1, poseFound: true, shoulderMidX: 0.5 + (i % 2 ? 0.05 : -0.05), shoulderTilt: 2, handsVisible: i < 50, handNearFace: i < 30, wristMove: 0.01 });
  }
  const b = summarizeBody(samples, { fps: 10, durationSec: 10 });
  assert.equal(b.faceShare, 1);
  assert.equal(Math.round(b.eyeContactShare * 100), 60);
  assert.ok(b.swayStd > 0.035, `sway ${b.swayStd}`);
  assert.equal(b.handsVisibleShare, 0.5);
  assert.equal(b.handsNearFaceShare, 0.3);
  assert.equal(b.timeline.length, 10);
  assert.deepEqual(b.timeline.slice(0, 6), [true, true, true, true, true, true]);
  assert.deepEqual(b.timeline.slice(6), [false, false, false, false]);
});

test('coach ranks the worst problems first and names what went well', () => {
  const bad = buildFindings({
    speech: { words: 200, wpm: 190, fillerRate: 6, fillers: [{ word: 'um', count: 9 }, { word: 'like', count: 3 }], fillerTotal: 12, repeats: [], longSentences: 0, script: { coverage: 0.5, skipped: ['a', 'b'] }, elements: { name: true, ask: false } },
    envelope: { phrases: 8, longPauses: 4, loudness: { trailOff: 0.5, cv: 0.2 } },
    pitch: { enough: true, monotone: true, stdSemitones: 0.8 },
    body: { frames: 300, faceShare: 0.9, eyeContactShare: 0.2, lookingDownShare: 0.5, poseShare: 0.9, swayStd: 0.01, handsNearFaceShare: 0.3, handsVisibleShare: 0.8, gestureActivity: 0.05, headMovement: 10 },
    durationSec: 230, limitSec: 180, wpm: 190, lang: 'en', hasScript: true,
  });
  const ids = bad.findings.map((f) => f.id);
  assert.equal(ids.length, 5, 'capped at five');
  assert.equal(ids[0], 'over_time', 'running long is the one rule the chamber enforces');
  assert.ok(ids.includes('fillers') && ids.includes('script_skipped'), ids.join(','));
  assert.ok(bad.findings.every((f, i, a) => i === 0 || a[i - 1].severity >= f.severity), 'sorted by severity');

  const good = buildFindings({
    speech: { words: 300, wpm: 140, fillerRate: 1, fillers: [{ word: 'um', count: 3 }], fillerTotal: 3, repeats: [], longSentences: 0, script: { coverage: 0.9, skipped: [] }, elements: { name: true, itemTitle: true, ask: true } },
    envelope: { phrases: 8, longPauses: 1, loudness: { trailOff: 0.1, cv: 0.2 } },
    pitch: { enough: true, monotone: false, stdSemitones: 3.2 },
    body: { frames: 300, faceShare: 0.95, eyeContactShare: 0.8, lookingDownShare: 0.1, poseShare: 0.9, swayStd: 0.01, handsNearFaceShare: 0.05, handsVisibleShare: 0.7, gestureActivity: 0.1, headMovement: 6 },
    durationSec: 150, limitSec: 180, wpm: 140, lang: 'en', hasScript: true,
  });
  assert.equal(good.findings.length, 0);
  const s = good.strengths.map((x) => x.id);
  for (const id of ['on_time', 'pace_good', 'few_fillers', 'script_covered', 'eye_contact_good']) assert.ok(s.includes(id), `missing strength ${id} in ${s.join(',')}`);
});
