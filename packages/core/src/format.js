import { parseDate, weekdayOf, daysBetween } from './schedule.js';
import { t, tn, tList, joinList } from './i18n/index.js';

/** English names, kept for callers that need a stable reference. Prefer weekdayNames() for display. */
export const WEEKDAY_NAMES = Object.freeze(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);
export const WEEKDAY_SHORT = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

export function weekdayNames(locale) {
  return tList('format.weekdays', locale);
}

export function weekdayShortNames(locale) {
  return tList('format.weekdaysShort', locale);
}

/** 'HH:MM' -> '7:00 PM' */
export function formatTime(time, locale) {
  if (!time) return '';
  const [hStr, mStr = '00'] = time.split(':');
  let h = Number(hStr);
  const suffix = h >= 12 ? t('format.pm', undefined, locale) : t('format.am', undefined, locale);
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${mStr.padStart(2, '0')} ${suffix}`;
}

/** '2026-09-14' -> 'Mon, Sep 14' (or with year, or with long names) in the active locale. */
export function formatDate(dateStr, { withYear = false, long = false, locale } = {}) {
  const { y, m, d } = parseDate(dateStr);
  const wd = weekdayOf(dateStr);
  const month = (long ? tList('format.months', locale) : tList('format.monthsShort', locale))[m - 1];
  const weekday = (long ? tList('format.weekdays', locale) : tList('format.weekdaysShort', locale))[wd];
  return t(withYear ? 'format.dateWithYear' : 'format.date', { weekday, month, day: d, year: y }, locale);
}

/** Human phrase for how far away a date is from `today`. */
export function relativeDays(dateStr, today, locale) {
  const n = daysBetween(today, dateStr);
  if (n === 0) return t('common.today', undefined, locale);
  if (n === 1) return t('common.tomorrow', undefined, locale);
  if (n < 0) return tn('common.daysAgo', -n, undefined, locale);
  if (n < 7) return t('common.inDays', { n }, locale);
  if (n < 14) return t('common.nextWeek', undefined, locale);
  const weeks = Math.round(n / 7);
  return tn('common.inWeeks', weeks, undefined, locale);
}

export function milesText(miles, locale) {
  if (miles == null || Number.isNaN(miles)) return '';
  if (miles < 0.95) return t('common.under1Mile', undefined, locale);
  return t('common.miles', { n: miles.toFixed(miles < 10 ? 1 : 0) }, locale);
}

/** Describe a recurrence rule in words: "2nd and 4th Mondays at 7:00 PM". */
export function describeRecurrence(rule, locale) {
  if (!rule) return '';
  const day = weekdayNames(locale)[rule.weekday] || '';
  const at = rule.time ? t('format.at', { time: formatTime(rule.time, locale) }, locale) : '';
  switch (rule.kind) {
    case 'weekly':
      return t('format.every', { day, at }, locale);
    case 'biweekly':
      return t('format.everyOther', { day, at }, locale);
    case 'nth-weekday': {
      const ordinals = joinList((rule.ordinals || []).map((n) => ordinalWord(n, locale)), locale);
      return t('format.nthDays', { ordinals, day, at }, locale).trim();
    }
    case 'custom':
      return t('format.published', { usually: day ? t('format.usually', { day }, locale) : '', at }, locale);
    default:
      return `${day}${at}`;
  }
}

export function ordinalWord(n, locale) {
  const list = tList('format.ordinals', locale);
  return list[n] || `${n}`;
}

export function pluralize(n, word, plural = `${word}s`) {
  return `${n} ${n === 1 ? word : plural}`;
}
