/**
 * Calendar math for council meetings.
 *
 * Every date is a 'YYYY-MM-DD' string and every time is 24-hour 'HH:MM' in Central Time.
 * All arithmetic goes through Date.UTC so results never depend on the machine's timezone.
 */

import { t, tList } from './i18n/index.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isDateStr(s) {
  const m = DATE_RE.exec(String(s || ''));
  if (!m) return false;
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isTimeStr(s) {
  return TIME_RE.test(String(s || ''));
}

export function parseDate(s) {
  const m = DATE_RE.exec(String(s || ''));
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { y: +m[1], m: +m[2], d: +m[3] };
}

export function toDateStr(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function utcOf(s) {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms) {
  const dt = new Date(ms);
  return toDateStr(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(s, n) {
  return fromUtc(utcOf(s) + n * 86400000);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a, b) {
  return Math.round((utcOf(b) - utcOf(a)) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekdayOf(s) {
  return new Date(utcOf(s)).getUTCDay();
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Date of the nth (1..5) given weekday in a month, or null if the month has no such day. */
export function nthWeekdayOfMonth(y, m, weekday, n) {
  const firstWd = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const offset = (weekday - firstWd + 7) % 7;
  const day = 1 + offset + (n - 1) * 7;
  if (day > daysInMonth(y, m)) return null;
  return toDateStr(y, m, day);
}

export function compareDates(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Today's calendar date in a timezone (default Central). */
export function todayStr(tz = 'America/Chicago', now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(now);
}

export function nowTimeStr(tz = 'America/Chicago', now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt.format(now).replace(/^24/, '00');
}

/** US daylight saving time: second Sunday of March through first Sunday of November. */
export function isDst(dateStr) {
  const { y } = parseDate(dateStr);
  const start = nthWeekdayOfMonth(y, 3, 0, 2);
  const end = nthWeekdayOfMonth(y, 11, 0, 1);
  return dateStr >= start && dateStr < end;
}

export function centralOffset(dateStr) {
  return isDst(dateStr) ? '-05:00' : '-06:00';
}

export function toISO(dateStr, time = '00:00') {
  return `${dateStr}T${time}:00${centralOffset(dateStr)}`;
}

export function hourOf(time) {
  return Number(String(time || '00:00').split(':')[0]);
}

export function isEvening(time) {
  return hourOf(time) >= 17;
}

/** Weekday between 7:30 and 16:00: a student cannot attend without missing class. */
export function isSchoolHours(dateStr, time) {
  const wd = weekdayOf(dateStr);
  if (wd === 0 || wd === 6) return false;
  return time >= '07:30' && time < '16:00';
}

/**
 * Concrete dates for one recurrence rule within [from, to].
 * kinds: 'nth-weekday' | 'weekly' | 'biweekly' | 'custom'
 */
export function occurrencesForRule(rule, from, to) {
  if (!rule || !isDateStr(from) || !isDateStr(to) || from > to) return [];
  const out = [];
  switch (rule.kind) {
    case 'custom': {
      for (const d of rule.dates || []) if (isDateStr(d) && d >= from && d <= to) out.push(d);
      break;
    }
    case 'weekly': {
      let d = from;
      const delta = (rule.weekday - weekdayOf(from) + 7) % 7;
      d = addDays(from, delta);
      while (d <= to) {
        out.push(d);
        d = addDays(d, 7);
      }
      break;
    }
    case 'biweekly': {
      const anchor = isDateStr(rule.anchorDate) ? rule.anchorDate : null;
      let d = addDays(from, (rule.weekday - weekdayOf(from) + 7) % 7);
      while (d <= to) {
        if (!anchor || Math.abs(daysBetween(anchor, d)) % 14 === 0) out.push(d);
        d = addDays(d, 7);
      }
      break;
    }
    case 'nth-weekday':
    default: {
      const ords = (rule.ordinals && rule.ordinals.length ? rule.ordinals : [1]).map(Number);
      let { y, m } = parseDate(from);
      const end = parseDate(to);
      while (y < end.y || (y === end.y && m <= end.m)) {
        for (const n of ords) {
          const d = nthWeekdayOfMonth(y, m, rule.weekday, n);
          if (d && d >= from && d <= to) out.push(d);
        }
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }
  }
  return [...new Set(out)].sort(compareDates);
}

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function timeFromNote(note) {
  const m = /\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)/i.exec(note || '') || /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(note || '');
  if (!m) return null;
  let h = Number(m[1]);
  const mm = m[2] || '00';
  const ap = (m[3] || '').toLowerCase();
  if (ap.startsWith('p') && h < 12) h += 12;
  if (ap.startsWith('a') && h === 12) h = 0;
  if (h > 23) return null;
  return `${String(h).padStart(2, '0')}:${mm}`;
}

/**
 * Expand every meeting rule for a city into dated occurrences, apply exceptions,
 * and attach agenda items. Returns occurrences sorted by date then time.
 */
export function expandCityMeetings(city, from, to) {
  const rules = Array.isArray(city.meetings) ? city.meetings : [];
  const occurrences = [];
  for (const rule of rules) {
    const rec = rule.recurrence || {};
    for (const date of occurrencesForRule(rec, from, to)) {
      occurrences.push(makeOccurrence(city, rule, date, rec.time || '18:00', 'scheduled'));
    }
  }

  const exceptions = Array.isArray(city.scheduleExceptions) ? city.scheduleExceptions : [];
  const defaultTime = (rules[0] && rules[0].recurrence && rules[0].recurrence.time) || '18:00';
  for (const ex of exceptions) {
    if (!isDateStr(ex.date) || ex.date < from || ex.date > to) continue;
    const onDate = occurrences.filter((o) => o.date === ex.date);
    if (ex.status === 'cancelled' || ex.status === 'recess') {
      for (const o of onDate) {
        o.status = 'cancelled';
        o.note = ex.note || (ex.status === 'recess' ? t('schedule.councilRecess') : t('schedule.cancelled'));
      }
    } else if (ex.status === 'rescheduled') {
      applyReschedule(city, rules, occurrences, ex, defaultTime);
    } else if (ex.status === 'special') {
      if (onDate.length) {
        // A special session layered on a regular date: annotate instead of duplicating.
        for (const o of onDate) {
          o.status = 'special';
          o.note = ex.note || t('schedule.specialMeeting');
        }
      } else {
        occurrences.push(
          makeOccurrence(city, { type: 'other', label: ex.note ? shortLabel(ex.note) : t('schedule.specialMeeting'), openToPublicComment: false }, ex.date, timeFromNote(ex.note) || defaultTime, 'special', ex.note),
        );
      }
    }
  }

  attachAgendaItems(city, occurrences);
  occurrences.sort((a, b) => compareDates(a.date, b.date) || a.time.localeCompare(b.time));
  return occurrences;
}

const WEEKDAY_WORDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTH_WORDS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
/** "2026-11-10" -> "Tue, Nov 10" in the active locale (kept local to avoid a circular import with format.js). */
function shortDate(dateStr) {
  const { m, d } = parseDate(dateStr);
  return t('format.date', { weekday: tList('format.weekdaysShort')[weekdayOf(dateStr)], month: tList('format.monthsShort')[m - 1], day: d });
}

/** Parse "Nov. 10", "November 10, 2026", "11/10", or "2026-11-10" out of free text, near a reference year. */
export function dateFromNote(text, near) {
  const s = String(text || '');
  const { y } = parseDate(near);
  let m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})\b(?:,?\s+(\d{4}))?/i.exec(s);
  if (m) {
    const month = MONTH_WORDS.findIndex((w) => w.startsWith(m[1].toLowerCase().slice(0, 3))) + 1;
    const candidate = toDateStr(m[3] ? Number(m[3]) : y, month, Number(m[2]));
    return isDateStr(candidate) ? candidate : null;
  }
  m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(s);
  if (m && isDateStr(m[0])) return m[0];
  m = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(s);
  if (m) {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : y;
    const candidate = toDateStr(year, Number(m[1]), Number(m[2]));
    return isDateStr(candidate) ? candidate : null;
  }
  return null;
}

/** Nearest date to `near` (excluding it) that falls on `weekday`, within 7 days; ties go forward. */
function nearestDateWithWeekday(near, weekday) {
  for (let d = 1; d <= 7; d += 1) {
    const fwd = addDays(near, d);
    if (weekdayOf(fwd) === weekday) return fwd;
    const back = addDays(near, -d);
    if (weekdayOf(back) === weekday) return back;
  }
  return null;
}

/**
 * Read direction words out of a note: "moved to Wednesday, Nov 4" gives a target,
 * "moved from Tuesday" gives a source. Returns dates when they can be resolved.
 */
function noteDirection(note, date) {
  const text = String(note || '').toLowerCase();
  const out = { to: null, from: null };
  const resolve = (clause) => {
    if (!clause) return null;
    const explicit = dateFromNote(clause, date);
    if (explicit && explicit !== date) return explicit;
    const wd = WEEKDAY_WORDS.findIndex((w) => new RegExp(`\\b${w}\\b`).test(clause));
    if (wd >= 0 && wd !== weekdayOf(date)) return nearestDateWithWeekday(date, wd);
    return null;
  };
  const toClause = /\b(?:to|until)\s+((?:[a-z]+day\b)?[^;.]{0,40})/.exec(text);
  const fromClause = /\bfrom\s+((?:[a-z]+day\b)?[^;.]{0,40})/.exec(text);
  if (toClause) out.to = resolve(toClause[1].split(/\bto\b|\bfrom\b/)[0]);
  if (fromClause) out.from = resolve(fromClause[1].split(/\bto\b|\bfrom\b/)[0]);
  return out;
}

/** Copy an occurrence's rule template so a moved meeting keeps its type, label, and comment rules. */
function ruleFor(rules, occurrence) {
  return rules.find((r) => (r.label || defaultLabel(r.type)) === occurrence.label) || null;
}

/**
 * Apply one 'rescheduled' exception. Forms supported, in priority order:
 *  1. explicit movedFrom / movedTo fields on the exception;
 *  2. a note that says "moved to <day or date>" (exception dated on the OLD date) or
 *     "moved from <day or date>" (exception dated on the NEW date);
 *  3. an exception on a date that has meetings (annotate them, apply a new time from the note);
 *  4. an exception on an empty date (the usual holiday shift: the nearest scheduled date
 *     within 3 days moves here, every meeting on that evening together).
 */
function applyReschedule(city, rules, occurrences, ex, defaultTime) {
  const onDate = occurrences.filter((o) => o.date === ex.date && o.status === 'scheduled');
  let source = isDateStr(ex.movedFrom) ? ex.movedFrom : null;
  let target = isDateStr(ex.movedTo) ? ex.movedTo : null;
  if (!source && !target) {
    const dir = noteDirection(ex.note, ex.date);
    if (dir.to) {
      source = ex.date;
      target = dir.to;
    } else if (dir.from) {
      source = dir.from;
      target = ex.date;
    } else if (onDate.length) {
      source = ex.date;
    } else {
      target = ex.date;
      source = nearestScheduledDate(occurrences, ex.date, 3);
    }
  } else if (source && !target) target = ex.date;
  else if (target && !source) source = ex.date;

  const noteTime = timeFromNote(ex.note);
  const moved = source ? occurrences.filter((o) => o.date === source && o.status === 'scheduled') : [];

  if (!target) {
    // Old-date form with no destination known: keep the meetings visible but flagged.
    for (const o of moved) {
      o.status = 'rescheduled';
      o.note = ex.note || t('schedule.rescheduledCheck');
      if (noteTime && moved.length === 1 && noteTime !== o.time) retime(o, noteTime);
    }
    return;
  }

  for (const o of moved) {
    o.status = 'cancelled';
    o.note = t('schedule.movedTo', { date: shortDate(target) });
  }
  if (moved.length) {
    for (const o of moved) {
      const template = ruleFor(rules, o) || { type: o.type, label: o.label, openToPublicComment: o.openToPublicComment, location: o.location };
      const existing = occurrences.find((x) => x.date === target && x.label === o.label && x.status !== 'cancelled');
      if (existing) {
        existing.status = 'rescheduled';
        existing.note = ex.note || existing.note;
        continue;
      }
      const time = moved.length === 1 && noteTime ? noteTime : o.time;
      occurrences.push(makeOccurrence(city, template, target, time, 'rescheduled', ex.note));
    }
  } else if (!occurrences.some((x) => x.date === target && x.status !== 'cancelled')) {
    const template = rules[0] || { type: 'regular', label: t('schedule.rescheduledCouncil') };
    occurrences.push(makeOccurrence(city, template, target, noteTime || defaultTime, 'rescheduled', ex.note));
  }
}

function retime(o, time) {
  o.time = time;
  o.startISO = toISO(o.date, time);
  o.isEvening = isEvening(time);
  o.isSchoolHours = isSchoolHours(o.date, time);
}

/** Nearest date to `date` (excluding it, within maxDays) that still has scheduled meetings. */
function nearestScheduledDate(occurrences, date, maxDays) {
  let best = null;
  for (const o of occurrences) {
    if (o.status !== 'scheduled') continue;
    const d = Math.abs(daysBetween(date, o.date));
    if (d === 0 || d > maxDays) continue;
    if (!best || d < best.d || (d === best.d && o.date > best.date)) best = { date: o.date, d };
  }
  return best ? best.date : null;
}

function shortLabel(note) {
  // Cut at the first sentence break, semicolon, or parenthesis, but never inside "6:00 p.m."
  const s = String(note)
    .replace(/\b([ap])\.m\./gi, '$1m')
    .split(/[.;(:]\s|\s\(/)[0]
    .replace(/,\s*\d{1,2}(:\d{2})?\s*[ap]m.*$/i, '')
    .trim();
  return s.length > 60 ? `${s.slice(0, 57)}...` : s || t('schedule.specialMeeting');
}

function makeOccurrence(city, rule, date, time, status, note) {
  const label = rule.label || defaultLabel(rule.type);
  return {
    id: `${city.cityId}:${date}:${slug(label)}`,
    cityId: city.cityId,
    cityName: city.name,
    county: city.county,
    type: rule.type || 'regular',
    label,
    date,
    time,
    startISO: toISO(date, time),
    weekday: weekdayOf(date),
    isEvening: isEvening(time),
    isSchoolHours: isSchoolHours(date, time),
    location: rule.location || (city.cityHall && (city.cityHall.name ? `${city.cityHall.name}, ${city.cityHall.address}` : city.cityHall.address)) || '',
    lat: city.cityHall && city.cityHall.lat,
    lng: city.cityHall && city.cityHall.lng,
    virtualUrl: rule.virtualUrl || (city.liveStream && city.liveStream.url) || '',
    openToPublicComment: rule.openToPublicComment !== false,
    status,
    note: note || rule.notes || '',
    durationMinutes: (rule.recurrence && rule.recurrence.durationMinutes) || null,
    agendaItems: [],
  };
}

function defaultLabel(type) {
  const labels = t('schedule.labels');
  return (labels && typeof labels === 'object' && labels[type]) || t('schedule.labels.regular');
}

function attachAgendaItems(city, occurrences) {
  const items = Array.isArray(city.agendaItems) ? city.agendaItems : [];
  if (!items.length || !occurrences.length) return;
  const live = occurrences.filter((o) => o.status !== 'cancelled');
  const firstRegular = live.find((o) => o.type === 'regular') || live[0];
  for (const item of items) {
    let target = null;
    if (isDateStr(item.meetingDate)) {
      target = live.find((o) => o.date === item.meetingDate && o.type === 'regular') || live.find((o) => o.date === item.meetingDate);
    }
    if (!target && !isDateStr(item.meetingDate)) target = firstRegular;
    if (target) target.agendaItems.push(item);
  }
}

/** All meetings across cities in the window, soonest first. */
export function upcomingMeetings(cities, { from, days = 30, includeCancelled = false } = {}) {
  const to = addDays(from, days);
  const all = [];
  for (const city of cities) {
    for (const occ of expandCityMeetings(city, from, to)) {
      if (!includeCancelled && occ.status === 'cancelled') continue;
      all.push(occ);
    }
  }
  all.sort((a, b) => compareDates(a.date, b.date) || a.time.localeCompare(b.time) || a.cityName.localeCompare(b.cityName));
  return all;
}

/** The next meeting for one city on or after `from`. */
export function nextMeetingFor(city, from, { publicCommentOnly = false, horizonDays = 90 } = {}) {
  const list = expandCityMeetings(city, from, addDays(from, horizonDays)).filter((o) => o.status !== 'cancelled');
  return list.find((o) => !publicCommentOnly || o.openToPublicComment) || null;
}
