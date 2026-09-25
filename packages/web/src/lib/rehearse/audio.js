/**
 * How it was said: pauses, volume consistency, pitch variety, and a syllable estimate
 * for pace when there is no transcript. The summaries are pure functions over frames of
 * {t, rms, pitchHz} sampled every few milliseconds; the capture helper at the bottom is
 * the only part that touches the browser, and it never leaves the device.
 */

const MIN_PAUSE_SEC = 0.7;
const LONG_PAUSE_SEC = 1.5;
const PHRASE_GAP_SEC = 0.35;

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))];
}

function mean(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function std(values) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Which frames carry speech, judged against the recording's own noise floor. */
export function speechMask(frames) {
  const rms = frames.map((f) => f.rms);
  const floor = percentile(rms, 0.2);
  const threshold = Math.max(floor * 3, 0.012);
  return { mask: rms.map((v) => v > threshold), floor, threshold };
}

/** Runs of consecutive frames where the mask holds, as [startIndex, endIndex). */
function runs(mask, wanted) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= mask.length; i += 1) {
    const on = i < mask.length && mask[i] === wanted;
    if (on && start < 0) start = i;
    if (!on && start >= 0) {
      out.push([start, i]);
      start = -1;
    }
  }
  return out;
}

/**
 * Pauses and volume. A pause only counts once speech has started and before it ends, so
 * the quiet moment before the first word is not held against anyone.
 */
export function summarizeEnvelope(frames, dt) {
  if (!frames.length) return { speakingSec: 0, silenceSec: 0, pauses: [], longPauses: 0, loudness: { mean: 0, cv: 0, trailOff: 0 }, phrases: 0 };
  const { mask } = speechMask(frames);
  const speech = runs(mask, true);
  if (!speech.length) return { speakingSec: 0, silenceSec: frames.length * dt, pauses: [], longPauses: 0, loudness: { mean: 0, cv: 0, trailOff: 0 }, phrases: 0 };

  const firstSpeech = speech[0][0];
  const lastSpeech = speech[speech.length - 1][1];
  const pauses = runs(mask, false)
    .filter(([s, e]) => s >= firstSpeech && e <= lastSpeech && (e - s) * dt >= MIN_PAUSE_SEC)
    .map(([s, e]) => ({ start: s * dt, end: e * dt, dur: (e - s) * dt }));

  // Phrases: speech runs merged across gaps too short to be a real pause.
  const phrases = [];
  for (const [s, e] of speech) {
    const last = phrases[phrases.length - 1];
    if (last && (s - last[1]) * dt < PHRASE_GAP_SEC) last[1] = e;
    else phrases.push([s, e]);
  }
  const levels = [];
  let trail = 0;
  let judged = 0;
  for (const [s, e] of phrases) {
    const seg = frames.slice(s, e).map((f) => f.rms);
    if (seg.length < 8) continue;
    const m = mean(seg);
    levels.push(m);
    const tail = seg.slice(Math.floor(seg.length * 0.8));
    // Quieter by more than 6 dB at the end of a phrase reads as trailing off.
    if (mean(tail) < m * 0.5) trail += 1;
    judged += 1;
  }
  const loudMean = mean(levels);
  return {
    speakingSec: speech.reduce((n, [s, e]) => n + (e - s), 0) * dt,
    silenceSec: frames.length * dt - speech.reduce((n, [s, e]) => n + (e - s), 0) * dt,
    pauses,
    longPauses: pauses.filter((p) => p.dur >= LONG_PAUSE_SEC).length,
    loudness: { mean: loudMean, cv: loudMean ? std(levels) / loudMean : 0, trailOff: judged ? trail / judged : 0 },
    phrases: phrases.length,
  };
}

/** Pitch variety in semitones. Under about a semitone and a half reads as monotone. */
export function pitchStats(frames) {
  const voiced = frames.filter((f) => f.pitchHz > 60 && f.pitchHz < 450).map((f) => f.pitchHz);
  if (voiced.length < 10) return { meanHz: 0, stdSemitones: 0, voicedShare: 0, monotone: false, enough: false };
  const semis = voiced.map((hz) => 12 * Math.log2(hz / 100));
  const s = std(semis);
  return { meanHz: Math.round(mean(voiced)), stdSemitones: Math.round(s * 10) / 10, voicedShare: voiced.length / frames.length, monotone: s < 1.5, enough: true };
}

/**
 * Rough syllable count from the loudness envelope: each local peak that clears the speech
 * threshold, at least 120 ms apart. Good enough to estimate pace when there is no transcript.
 */
export function estimateSyllables(frames, dt) {
  const { mask, threshold } = speechMask(frames);
  const minGap = Math.max(1, Math.round(0.12 / dt));
  let count = 0;
  let last = -minGap;
  for (let i = 1; i < frames.length - 1; i += 1) {
    if (!mask[i]) continue;
    const v = frames[i].rms;
    if (v >= frames[i - 1].rms && v > frames[i + 1].rms && v > threshold * 1.3 && i - last >= minGap) {
      count += 1;
      last = i;
    }
  }
  return count;
}

/** Mean loudness per bucket, scaled so the loudest bucket is 1. */
export function loudnessSeries(frames, dt, bucketSec = 5) {
  const out = [];
  const per = Math.max(1, Math.round(bucketSec / dt));
  for (let i = 0; i < frames.length; i += per) {
    const seg = frames.slice(i, i + per);
    out.push({ t: (i + seg.length / 2) * dt, v: mean(seg.map((f) => f.rms)) });
  }
  const max = Math.max(...out.map((p) => p.v), 1e-9);
  return out.map((p) => ({ t: p.t, v: Math.round((p.v / max) * 100) }));
}

/** Estimated words per minute per bucket from syllables, at about 1.4 syllables a word. */
export function paceEstimateSeries(frames, dt, bucketSec = 15) {
  const out = [];
  const per = Math.max(1, Math.round(bucketSec / dt));
  for (let i = 0; i < frames.length; i += per) {
    const seg = frames.slice(i, i + per);
    if (seg.length * dt < 3) break;
    const syl = estimateSyllables(seg, dt);
    out.push({ t: (i + seg.length / 2) * dt, v: Math.round((syl / 1.4 / (seg.length * dt)) * 60) });
  }
  return out;
}

/**
 * Fundamental frequency by normalized autocorrelation over 70 to 400 Hz. Zero when the
 * frame is not clearly voiced.
 */
export function detectPitch(buf, sampleRate) {
  const n = buf.length;
  let energy = 0;
  for (let i = 0; i < n; i += 1) energy += buf[i] * buf[i];
  if (energy < 1e-4) return 0;
  const minLag = Math.floor(sampleRate / 400);
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 70));
  let best = 0;
  let bestLag = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let c = 0;
    for (let i = 0; i < n - lag; i += 1) c += buf[i] * buf[i + lag];
    c /= energy;
    if (c > best) {
      best = c;
      bestLag = lag;
    }
  }
  return best > 0.5 && bestLag ? sampleRate / bestLag : 0;
}

/**
 * Sample loudness and pitch from a microphone stream. Browser only. Nothing here is
 * recorded or sent: it keeps a few numbers per tick and throws the audio away.
 */
export function startAudioCapture(stream, { intervalMs = 50 } = {}) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const buf = new Float32Array(analyser.fftSize);
  const half = new Float32Array(analyser.fftSize / 2);
  const frames = [];
  let level = 0;
  const started = performance.now();
  const timer = setInterval(() => {
    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    level = rms;
    // Pitch on a half-rate copy: plenty for voice, and a quarter of the work.
    for (let i = 0; i < half.length; i += 1) half[i] = buf[i * 2];
    const pitchHz = rms > 0.015 ? detectPitch(half, ctx.sampleRate / 2) : 0;
    frames.push({ t: (performance.now() - started) / 1000, rms, pitchHz });
  }, intervalMs);
  return {
    frames,
    dt: intervalMs / 1000,
    level: () => level,
    stop() {
      clearInterval(timer);
      try {
        source.disconnect();
        ctx.close();
      } catch {
        /* already closed */
      }
      return frames;
    },
  };
}
