import { isDateStr, isTimeStr, weekdayOf } from './schedule.js';
import { isInDfw } from './geo.js';
import { isTopicId } from './topics.js';

const KINDS = new Set(['nth-weekday', 'weekly', 'biweekly', 'custom']);
const MEETING_TYPES = new Set(['regular', 'work-session', 'briefing', 'town-hall', 'committee', 'other']);
const EXCEPTION_STATUS = new Set(['cancelled', 'rescheduled', 'special', 'recess']);

function isUrl(u) {
  return typeof u === 'string' && /^https?:\/\/\S+$/i.test(u);
}

/** Returns a list of human-readable problems; empty means the city record is usable. */
export function validateCity(city) {
  const errors = [];
  const where = (city && city.cityId) || (city && city.name) || 'unknown city';
  const err = (msg) => errors.push(`${where}: ${msg}`);

  if (!city || typeof city !== 'object') return ['city record is not an object'];
  if (!city.cityId || !/^[a-z0-9-]+$/.test(city.cityId)) err('cityId must be a lowercase kebab-case slug');
  if (!city.name) err('name is required');
  if (!city.county) err('county is required');
  if (!isUrl(city.website)) err('website must be an http(s) URL');

  const hall = city.cityHall;
  if (!hall || typeof hall !== 'object') err('cityHall is required');
  else {
    if (!hall.address) err('cityHall.address is required');
    if (typeof hall.lat !== 'number' || typeof hall.lng !== 'number') err('cityHall.lat/lng must be numbers');
    else if (!isInDfw(hall)) err(`cityHall coordinates (${hall.lat}, ${hall.lng}) fall outside Dallas-Fort Worth`);
  }

  if (!Array.isArray(city.meetings) || !city.meetings.length) err('at least one meeting rule is required');
  else {
    city.meetings.forEach((m, i) => {
      const tag = `meetings[${i}]`;
      if (!MEETING_TYPES.has(m.type)) err(`${tag}.type "${m.type}" is not a known meeting type`);
      if (!m.label) err(`${tag}.label is required`);
      const r = m.recurrence;
      if (!r || typeof r !== 'object') return err(`${tag}.recurrence is required`);
      if (!KINDS.has(r.kind)) err(`${tag}.recurrence.kind "${r.kind}" is not valid`);
      if (!Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6) err(`${tag}.recurrence.weekday must be 0..6`);
      if (!isTimeStr(r.time)) err(`${tag}.recurrence.time "${r.time}" must be HH:MM (24-hour)`);
      if (r.kind === 'nth-weekday') {
        if (!Array.isArray(r.ordinals) || !r.ordinals.length) err(`${tag}.recurrence.ordinals is required for nth-weekday`);
        else if (r.ordinals.some((n) => !Number.isInteger(n) || n < 1 || n > 5)) err(`${tag}.recurrence.ordinals must be integers 1..5`);
      }
      if (r.kind === 'biweekly') {
        if (!isDateStr(r.anchorDate)) err(`${tag}.recurrence.anchorDate (a known meeting date, YYYY-MM-DD) is required for biweekly`);
        else if (weekdayOf(r.anchorDate) !== r.weekday) err(`${tag}.recurrence.anchorDate falls on a different weekday than recurrence.weekday`);
      }
      if (m.openToPublicComment !== undefined && typeof m.openToPublicComment !== 'boolean') err(`${tag}.openToPublicComment must be true or false`);
      if (r.kind === 'custom') {
        if (!Array.isArray(r.dates) || !r.dates.length) err(`${tag}.recurrence.dates is required for custom`);
        else if (r.dates.some((d) => !isDateStr(d))) err(`${tag}.recurrence.dates must all be YYYY-MM-DD`);
      }
      if (m.virtualUrl && !isUrl(m.virtualUrl)) err(`${tag}.virtualUrl is not a URL`);
    });
  }

  for (const key of ['scheduleExceptions', 'youthPrograms', 'agendaItems', 'sources']) {
    if (city[key] !== undefined && !Array.isArray(city[key])) err(`${key} must be an array`);
  }
  const arr = (key) => (Array.isArray(city[key]) ? city[key] : []);

  arr('scheduleExceptions').forEach((ex, i) => {
    if (!isDateStr(ex.date)) err(`scheduleExceptions[${i}].date must be YYYY-MM-DD`);
    if (!EXCEPTION_STATUS.has(ex.status)) err(`scheduleExceptions[${i}].status "${ex.status}" is not valid`);
    for (const f of ['movedFrom', 'movedTo']) {
      if (ex[f] !== undefined && !isDateStr(ex[f])) err(`scheduleExceptions[${i}].${f} must be YYYY-MM-DD`);
      if (ex[f] && ex.status !== 'rescheduled') err(`scheduleExceptions[${i}].${f} only applies to rescheduled exceptions`);
    }
  });

  const pc = city.publicComment;
  if (!pc || typeof pc !== 'object') err('publicComment is required');
  else {
    if (!pc.summary) err('publicComment.summary is required');
    if (!pc.howToRegister) err('publicComment.howToRegister is required');
    if (pc.registrationUrl && !isUrl(pc.registrationUrl)) err('publicComment.registrationUrl is not a URL');
  }

  for (const key of ['councilPageUrl']) if (city[key] && !isUrl(city[key])) err(`${key} is not a URL`);
  if (city.agendaPortal && city.agendaPortal.url && !isUrl(city.agendaPortal.url)) err('agendaPortal.url is not a URL');
  if (city.liveStream && city.liveStream.url && !isUrl(city.liveStream.url)) err('liveStream.url is not a URL');

  arr('youthPrograms').forEach((p, i) => {
    if (!p.name) err(`youthPrograms[${i}].name is required`);
    if (p.url && !isUrl(p.url)) err(`youthPrograms[${i}].url is not a URL`);
  });

  arr('agendaItems').forEach((a, i) => {
    if (!a.title) err(`agendaItems[${i}].title is required`);
    if (!Array.isArray(a.topics) || !a.topics.length) err(`agendaItems[${i}].topics is required`);
    else for (const t of a.topics) if (!isTopicId(t)) err(`agendaItems[${i}] has unknown topic "${t}"`);
    if (a.meetingDate && !isDateStr(a.meetingDate)) err(`agendaItems[${i}].meetingDate must be YYYY-MM-DD`);
  });

  if (!['high', 'medium', 'low'].includes(city.confidence)) err('confidence must be high, medium, or low');
  return errors;
}

export function validateCities(cities) {
  const errors = [];
  const seen = new Set();
  for (const c of cities) {
    errors.push(...validateCity(c));
    if (c && c.cityId) {
      if (seen.has(c.cityId)) errors.push(`${c.cityId}: duplicate cityId`);
      seen.add(c.cityId);
    }
  }
  return errors;
}
