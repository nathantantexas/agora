import { upcomingMeetings, daysBetween, hourOf } from './schedule.js';
import { haversineMiles, cityPoint } from './geo.js';
import { getTopic, isTopicId } from './topics.js';
import { milesText, formatDate, formatTime } from './format.js';
import { t, tn, joinList, isLocale } from './i18n/index.js';

/**
 * User preferences. No account needed: the web app keeps these in localStorage and
 * the CLI keeps them in a small JSON file.
 */
export function defaultPrefs() {
  return {
    lang: null,
    interests: [],
    availability: { evenings: true, daytime: false, weekends: true },
    location: null,
    locationLabel: '',
    homeCityId: null,
    maxMiles: 15,
    virtualOk: true,
    canSpeakOnly: false,
    student: true,
  };
}

export function normalizePrefs(input) {
  const base = defaultPrefs();
  const p = { ...base, ...(input || {}) };
  p.lang = isLocale(p.lang) ? p.lang : null;
  p.interests = Array.isArray(p.interests) ? p.interests.filter(isTopicId) : [];
  p.availability = { ...base.availability, ...(p.availability || {}) };
  if (p.location && (typeof p.location.lat !== 'number' || typeof p.location.lng !== 'number')) p.location = null;
  p.maxMiles = Number.isFinite(Number(p.maxMiles)) && Number(p.maxMiles) > 0 ? Number(p.maxMiles) : base.maxMiles;
  p.virtualOk = p.virtualOk !== false;
  p.canSpeakOnly = p.canSpeakOnly === true;
  p.student = p.student !== false;
  return p;
}

function itemMatches(item, interests) {
  return (item.topics || []).some((t) => interests.includes(t));
}

/**
 * Score one meeting occurrence for a user. Returns the score plus plain-language
 * reasons so the UI can show why something was recommended.
 */
export function scoreMeeting(meeting, city, prefs, { today }) {
  const reasons = [];
  let score = 0;
  const add = (points, text, kind) => {
    score += points;
    reasons.push({ text, kind, points });
  };

  // Topics: agenda items that hit the user's interests.
  const matchedItems = (meeting.agendaItems || []).filter((it) => itemMatches(it, prefs.interests));
  if (matchedItems.length) {
    const topicIds = [...new Set(matchedItems.flatMap((it) => it.topics.filter((t) => prefs.interests.includes(t))))];
    const labels = topicIds.slice(0, 2).map((id) => getTopic(id).short || getTopic(id).label.toLowerCase());
    add(Math.min(9, matchedItems.length * 3), tn('match.itemsOn', matchedItems.length, { topics: joinList(labels) }), 'topic');
  } else if (prefs.interests.length && meeting.type === 'regular') {
    add(1, t('match.votingMeeting'), 'topic');
  }

  // Time of day and day of week.
  const hour = hourOf(meeting.time);
  const weekend = meeting.weekday === 0 || meeting.weekday === 6;
  if (weekend) {
    if (prefs.availability.weekends) add(2, t('match.weekendMeeting'), 'time');
    else add(-2, t('match.weekendMeeting'), 'time');
  } else if (hour >= 17) {
    if (prefs.availability.evenings) add(3, t('match.eveningAfterSchool'), 'time');
    else add(-1, t('match.eveningMeeting'), 'time');
  } else if (meeting.isSchoolHours && prefs.student) {
    if (prefs.availability.daytime) add(0, t('match.duringSchool'), 'time');
    else if (meeting.virtualUrl && prefs.virtualOk) add(-2, t('match.duringSchoolStream'), 'time');
    else add(-4, t('match.duringSchool'), 'time');
  } else if (prefs.availability.daytime) {
    add(1, t('match.daytimeMeeting'), 'time');
  } else {
    add(-1, t('match.daytimeMeeting'), 'time');
  }

  // Distance and home city.
  let distanceMiles = null;
  if (prefs.location) {
    distanceMiles = haversineMiles(prefs.location, cityPoint(city));
    if (distanceMiles != null) {
      const distance = milesText(distanceMiles);
      if (distanceMiles <= 5) add(4, t('match.away', { distance }), 'distance');
      else if (distanceMiles <= 10) add(2, t('match.away', { distance }), 'distance');
      else if (distanceMiles <= prefs.maxMiles) add(0, t('match.away', { distance }), 'distance');
      else add(-5, t('match.awayPastLimit', { distance, max: prefs.maxMiles }), 'distance');
    }
  }
  if (prefs.homeCityId && prefs.homeCityId === city.cityId) add(3, t('match.yourCity'), 'distance');

  // Ability to participate.
  if (meeting.openToPublicComment) add(2, t('match.canSignUp'), 'speak');
  if (city.publicComment && city.publicComment.virtualAllowed && prefs.virtualOk) add(1, t('match.remoteAllowed'), 'speak');

  // Timing.
  const days = daysBetween(today, meeting.date);
  if (days <= 3) add(2, t('match.thisWeek'), 'soon');
  else if (days <= 7) add(1, t('match.withinWeek'), 'soon');

  if ((city.youthPrograms || []).length) add(1, t('match.youthPrograms'), 'youth');
  if (meeting.status === 'rescheduled' || meeting.status === 'special') add(0, t('match.scheduleChange'), 'note');

  return { score, reasons, distanceMiles, matchedItems };
}

/** Rank upcoming meetings for a user. */
export function matchMeetings(cities, prefsInput, { today, days = 45, limit = 25 } = {}) {
  const prefs = normalizePrefs(prefsInput);
  const byId = new Map(cities.map((c) => [c.cityId, c]));
  const meetings = upcomingMeetings(cities, { from: today, days });
  const scored = [];
  for (const m of meetings) {
    if (prefs.canSpeakOnly && !m.openToPublicComment) continue;
    const city = byId.get(m.cityId);
    const { score, reasons, distanceMiles, matchedItems } = scoreMeeting(m, city, prefs, { today });
    if (prefs.location && distanceMiles != null && distanceMiles > prefs.maxMiles * 2) continue;
    scored.push({ ...m, score, reasons, distanceMiles, matchedItems });
  }
  scored.sort((a, b) => b.score - a.score || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.cityName.localeCompare(b.cityName));
  return scored.slice(0, limit);
}

/** Agenda items across all cities that touch the user's interests, soonest first. */
export function matchAgendaItems(cities, prefsInput, { today, limit = 30 } = {}) {
  const prefs = normalizePrefs(prefsInput);
  const out = [];
  for (const city of cities) {
    const distanceMiles = prefs.location ? haversineMiles(prefs.location, cityPoint(city)) : null;
    if (distanceMiles != null && distanceMiles > prefs.maxMiles * 2) continue;
    for (const item of city.agendaItems || []) {
      const hits = (item.topics || []).filter((t) => prefs.interests.includes(t));
      if (!hits.length && prefs.interests.length) continue;
      if (item.meetingDate && item.meetingDate < today) continue;
      out.push({
        ...item,
        cityId: city.cityId,
        cityName: city.name,
        matchedTopics: hits,
        distanceMiles,
        score: hits.length * 3 + (prefs.homeCityId === city.cityId ? 3 : 0) + (distanceMiles != null && distanceMiles <= 10 ? 2 : 0),
      });
    }
  }
  out.sort((a, b) => b.score - a.score || String(a.meetingDate || '9').localeCompare(String(b.meetingDate || '9')));
  return out.slice(0, limit);
}

/** Youth councils and commissions, nearest first when a location is known. */
export function matchYouthPrograms(cities, prefsInput) {
  const prefs = normalizePrefs(prefsInput);
  const out = [];
  for (const city of cities) {
    const distanceMiles = prefs.location ? haversineMiles(prefs.location, cityPoint(city)) : null;
    for (const p of city.youthPrograms || []) {
      out.push({ ...p, cityId: city.cityId, cityName: city.name, distanceMiles, home: prefs.homeCityId === city.cityId });
    }
  }
  out.sort((a, b) => Number(b.home) - Number(a.home) || (a.distanceMiles ?? 999) - (b.distanceMiles ?? 999) || a.cityName.localeCompare(b.cityName));
  return out;
}

/** Everything the "Your plan" screen needs, in one call. */
export function buildPlan(cities, prefsInput, { today, days = 45 } = {}) {
  const prefs = normalizePrefs(prefsInput);
  const meetings = matchMeetings(cities, prefs, { today, days, limit: 12 });
  const agendaItems = matchAgendaItems(cities, prefs, { today, limit: 12 });
  const youthPrograms = matchYouthPrograms(cities, prefs).slice(0, 8);
  const top = meetings[0] || null;
  const why = top ? top.reasons.filter((r) => r.points > 0).slice(0, 2).map((r) => r.text.charAt(0).toLowerCase() + r.text.slice(1)) : [];
  const summary = top
    ? t('match.summary', { city: top.cityName, label: top.label, date: formatDate(top.date), time: formatTime(top.time), why: why.length ? ` (${why.join('; ')})` : '' })
    : t('match.noMatches');
  return { prefs, meetings, agendaItems, youthPrograms, summary };
}
