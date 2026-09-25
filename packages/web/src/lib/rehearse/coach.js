import { PACE_TARGET } from './speech.js';

/**
 * Turn the measurements into a short, ranked list of things to work on, each with the
 * evidence and one drill, plus what went well. Every entry is an id and parameters; the
 * words live in the dictionaries under rehearse.findings.<id>, so the coaching translates.
 */

export const LIMITS = Object.freeze({
  fillerRate: 3,
  longPauses: 3,
  monotoneSemitones: 1.5,
  trailOff: 0.3,
  loudnessCv: 0.55,
  scriptCoverage: 0.7,
  eyeContact: 0.5,
  lookingDown: 0.3,
  sway: 0.035,
  handsNearFace: 0.2,
  handsHidden: 0.3,
  faceVisible: 0.5,
});

// Severity only orders the list; it is never shown, so it is not capped.
function add(list, id, severity, params = {}) {
  if (severity > 0) list.push({ id, severity, params });
}

/**
 * @param {object} input
 * @param {object} input.speech  analyzeTranscript() result, or null when there was no transcript
 * @param {object} input.envelope summarizeEnvelope() result
 * @param {object} input.pitch  pitchStats() result
 * @param {object|null} input.body summarizeBody() result, or null when the camera was off
 * @param {number} input.durationSec
 * @param {number} input.limitSec
 * @param {number} input.wpm  spoken or estimated words per minute
 * @param {string} input.lang
 */
export function buildFindings({ speech, envelope, pitch, body, durationSec, limitSec, wpm, lang = 'en', hasScript = false }) {
  const findings = [];
  const strengths = [];
  const [lo, hi] = PACE_TARGET[lang] || PACE_TARGET.en;

  // Time against the city's limit is the one rule the chamber enforces for you, so
  // running over outranks everything else that could be on this list.
  if (limitSec && durationSec > limitSec) add(findings, 'over_time', 2 + (durationSec - limitSec) / limitSec, { over: Math.round(durationSec - limitSec), limit: Math.round(limitSec / 60) });
  else if (limitSec && durationSec < limitSec * 0.4 && durationSec > 5) add(findings, 'under_time', 0.3, { used: Math.round(durationSec), limit: Math.round(limitSec / 60) });
  else if (limitSec && durationSec > 5) strengths.push({ id: 'on_time', params: { used: Math.round(durationSec), limit: Math.round(limitSec / 60) } });

  if (wpm > 0) {
    if (wpm > hi) add(findings, 'pace_fast', 0.4 + (wpm - hi) / hi, { wpm, hi });
    else if (wpm < lo && durationSec > 10) add(findings, 'pace_slow', 0.3 + (lo - wpm) / lo, { wpm, lo });
    else strengths.push({ id: 'pace_good', params: { wpm } });
  }

  if (speech && speech.words >= 20) {
    if (speech.fillerRate >= LIMITS.fillerRate) add(findings, 'fillers', 0.4 + speech.fillerRate / 10, { rate: speech.fillerRate, list: speech.fillers.slice(0, 3).map((f) => f.word).join(', '), total: speech.fillerTotal });
    else strengths.push({ id: 'few_fillers', params: { total: speech.fillerTotal } });
    if (speech.longSentences >= 2) add(findings, 'long_sentences', 0.3, { n: speech.longSentences });
    if (speech.repeats.length && speech.repeats[0].count >= 6) add(findings, 'repeats', 0.25, { word: speech.repeats[0].word, count: speech.repeats[0].count });
    if (hasScript && speech.script) {
      if (speech.script.coverage < LIMITS.scriptCoverage) add(findings, 'script_skipped', 0.5 + (LIMITS.scriptCoverage - speech.script.coverage), { pct: Math.round(speech.script.coverage * 100), skipped: speech.script.skipped.length });
      else strengths.push({ id: 'script_covered', params: { pct: Math.round(speech.script.coverage * 100) } });
    }
    const missing = Object.entries(speech.elements || {})
      .filter(([, ok]) => !ok)
      .map(([k]) => k);
    if (missing.length) add(findings, 'missing_elements', 0.55, { missing: missing.join(', '), n: missing.length });
    else if (Object.keys(speech.elements || {}).length >= 2) strengths.push({ id: 'elements_landed', params: {} });
  }

  if (envelope && envelope.phrases >= 3) {
    if (envelope.longPauses >= LIMITS.longPauses) add(findings, 'long_pauses', 0.35 + envelope.longPauses / 20, { n: envelope.longPauses, sec: LIMITS.longPauses });
    if (envelope.loudness.trailOff >= LIMITS.trailOff) add(findings, 'trail_off', 0.4, { pct: Math.round(envelope.loudness.trailOff * 100) });
    if (envelope.loudness.cv >= LIMITS.loudnessCv) add(findings, 'uneven_volume', 0.3, {});
    if (envelope.loudness.trailOff < LIMITS.trailOff && envelope.loudness.cv < LIMITS.loudnessCv) strengths.push({ id: 'steady_volume', params: {} });
  }

  if (pitch && pitch.enough) {
    if (pitch.monotone) add(findings, 'monotone', 0.45, { semis: pitch.stdSemitones });
    else strengths.push({ id: 'varied_pitch', params: { semis: pitch.stdSemitones } });
  }

  if (body && body.frames >= 20) {
    if (body.faceShare < LIMITS.faceVisible) add(findings, 'face_not_visible', 0.5, { pct: Math.round(body.faceShare * 100) });
    else {
      if (body.eyeContactShare < LIMITS.eyeContact) add(findings, 'eye_contact_low', 0.5 + (LIMITS.eyeContact - body.eyeContactShare), { pct: Math.round(body.eyeContactShare * 100) });
      else strengths.push({ id: 'eye_contact_good', params: { pct: Math.round(body.eyeContactShare * 100) } });
      if (body.lookingDownShare >= LIMITS.lookingDown) add(findings, 'looking_down', 0.45 + body.lookingDownShare / 2, { pct: Math.round(body.lookingDownShare * 100) });
    }
    if (body.poseShare >= 0.5) {
      if (body.swayStd >= LIMITS.sway) add(findings, 'sway', 0.35 + body.swayStd, {});
      if (body.handsNearFaceShare >= LIMITS.handsNearFace) add(findings, 'hands_near_face', 0.4, { pct: Math.round(body.handsNearFaceShare * 100) });
      if (body.handsVisibleShare < LIMITS.handsHidden) add(findings, 'hands_hidden', 0.2, { pct: Math.round(body.handsVisibleShare * 100) });
      else if (body.gestureActivity > 0 && body.gestureActivity < 0.02 && body.headMovement < 4) add(findings, 'very_still', 0.15, {});
      if (body.swayStd < LIMITS.sway && body.handsNearFaceShare < LIMITS.handsNearFace) strengths.push({ id: 'settled_body', params: {} });
    }
  }

  // Five things to fix is all anyone acts on; everything that went well is worth hearing.
  findings.sort((a, b) => b.severity - a.severity);
  return { findings: findings.slice(0, 5), strengths };
}
