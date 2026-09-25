/**
 * What was said: pace, fillers, repetition, and how much of the script actually made it
 * out loud. Pure functions, so they run in the Node test suite.
 */

// Words that are almost always a stall rather than content. Deliberately conservative:
// "so" and "right" are left out because they carry meaning too often to flag.
export const FILLERS = Object.freeze({
  en: ['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'like', 'you know', 'i mean', 'sort of', 'kind of', 'basically', 'literally', 'actually', 'okay so'],
  es: ['este', 'eh', 'em', 'o sea', 'pues', 'bueno', 'tipo', 'como que', 'digamos', 'nada'],
  vi: ['ừm', 'ờ', 'à', 'ừ', 'kiểu như', 'nói chung là', 'cái kiểu', 'thế thì'],
});

// Words per minute that read as steady in a council chamber. Vietnamese counts syllables,
// which is what its spaces separate, so its band sits higher.
export const PACE_TARGET = Object.freeze({ en: [120, 160], es: [125, 170], vi: [140, 190] });

const STOP = {
  en: new Set('a an the and or but of to in on at for with by from as is are was were be been being it its this that these those i you he she we they me him her us them my your our their his hers ours theirs so if then than too very just not no yes do does did have has had will would can could should may might about into over after before up down out off here there when where why how all any each more most some such only own same'.split(' ')),
  es: new Set('el la los las un una unos unas y o pero de del a al en con por para que se su sus es son era eran fue fueron ser estar está están yo tú él ella nosotros ustedes ellos ellas me te le nos les mi mis tu tus lo como más muy ya también sí no si esto eso ese esa este esta hay'.split(' ')),
  vi: new Set('và là của có được cho với để này đó các những một không tôi bạn chúng ta anh chị em họ thì mà ở về từ đến đã sẽ đang rất cũng nhưng vì nên như khi nào'.split(' ')),
};

export function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'’\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function contentWords(text, lang) {
  const stop = STOP[lang] || STOP.en;
  const min = lang === 'vi' ? 2 : 3;
  return tokenize(text).filter((w) => w.length >= min && !stop.has(w));
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Mark each token that is a filler, matching multi-word fillers first so "you know" is
 * one hit rather than a stray "know". Returns tokens with their original text.
 */
export function markFillers(text, lang = 'en') {
  const list = (FILLERS[lang] || FILLERS.en).map((f) => f.split(' '));
  const raw = String(text || '').split(/\s+/).filter(Boolean);
  const norm = raw.map((w) => tokenize(w)[0] || '');
  const out = [];
  for (let i = 0; i < raw.length; i += 1) {
    let hit = null;
    for (const f of list) {
      if (f.length > raw.length - i) continue;
      let ok = true;
      for (let k = 0; k < f.length; k += 1) if (norm[i + k] !== f[k]) { ok = false; break; }
      if (ok && (!hit || f.length > hit.length)) hit = f;
    }
    if (hit) {
      out.push({ text: raw.slice(i, i + hit.length).join(' '), filler: hit.join(' ') });
      i += hit.length - 1;
    } else {
      out.push({ text: raw[i], filler: null });
    }
  }
  return out;
}

/** How many of a phrase's content words appear in the spoken token set. */
function hitRate(phrase, spoken, lang) {
  const words = contentWords(phrase, lang);
  if (!words.length) return 0;
  let n = 0;
  for (const w of words) if (spoken.has(w)) n += 1;
  return n / words.length;
}

/**
 * Compare the transcript against the script and against the fields the comment builder
 * asked for. Recognition drops and swaps words, so sentence coverage counts a sentence as
 * spoken when half its content words turned up, not when it matched exactly.
 */
export function analyzeTranscript(transcript, { lang = 'en', durationSec = 0, script = '', fields = {} } = {}) {
  const tokens = tokenize(transcript);
  const words = tokens.length;
  const minutes = durationSec > 0 ? durationSec / 60 : 0;
  const wpm = minutes > 0 ? Math.round(words / minutes) : 0;

  const marked = markFillers(transcript, lang);
  const fillerCounts = new Map();
  for (const m of marked) if (m.filler) fillerCounts.set(m.filler, (fillerCounts.get(m.filler) || 0) + 1);
  const fillers = [...fillerCounts.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count);
  const fillerTotal = fillers.reduce((n, f) => n + f.count, 0);
  const fillerRate = words ? Math.round((fillerTotal / words) * 1000) / 10 : 0;

  const counts = new Map();
  for (const w of contentWords(transcript, lang)) counts.set(w, (counts.get(w) || 0) + 1);
  const repeats = [...counts.entries()]
    .filter(([, c]) => c >= 4)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const sentences = splitSentences(transcript);
  const longSentences = sentences.filter((s) => tokenize(s).length > 30).length;

  const spoken = new Set(tokens);
  let scriptResult = null;
  if (script && script.trim()) {
    const lines = splitSentences(script);
    const said = lines.map((line) => hitRate(line, spoken, lang) >= 0.5);
    scriptResult = {
      sentences: lines.length,
      spokenCount: said.filter(Boolean).length,
      coverage: lines.length ? said.filter(Boolean).length / lines.length : 0,
      skipped: lines.filter((_, i) => !said[i]).slice(0, 6),
    };
  }

  const elements = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!value || !String(value).trim()) continue;
    const rate = hitRate(String(value), spoken, lang);
    elements[key] = key === 'name' ? rate > 0 : rate >= 0.5;
  }

  return { words, wpm, fillers, fillerTotal, fillerRate, repeats, sentences: sentences.length, longSentences, script: scriptResult, elements, marked };
}

/**
 * Pace over time from a timeline of cumulative word counts, bucketed so a rushed opening
 * and a slow finish show up as a shape rather than one average.
 */
export function paceSeries(timeline, durationSec, bucketSec = 15) {
  if (!durationSec || !timeline || !timeline.length) return [];
  const out = [];
  const at = (t) => {
    let words = 0;
    for (const p of timeline) if (p.t <= t) words = p.words;
    return words;
  };
  for (let start = 0; start < durationSec; start += bucketSec) {
    const end = Math.min(durationSec, start + bucketSec);
    const span = end - start;
    if (span < 3) break;
    const n = at(end) - at(start);
    out.push({ t: start + span / 2, v: Math.round((n / span) * 60) });
  }
  return out;
}
