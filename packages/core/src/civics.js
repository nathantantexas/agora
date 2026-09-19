import { getTopic } from './topics.js';
import { t, tList } from './i18n/index.js';

/** English glossary, kept for callers that need a stable reference. Prefer glossary() for display. */
export const GLOSSARY = Object.freeze(tList('civics.glossary', 'en'));
export const FIRST_MEETING_CHECKLIST = Object.freeze(tList('civics.checklist', 'en'));
export const SPEAKING_TIPS = Object.freeze(tList('civics.tips', 'en'));

/** Localized versions for display. */
export function glossary(locale) {
  return tList('civics.glossary', locale);
}

export function checklist(locale) {
  return tList('civics.checklist', locale);
}

export function speakingTips(locale) {
  return tList('civics.tips', locale);
}

/** Greeting bucket for a meeting start time ('HH:MM'). */
export function timeOfDayFor(time) {
  const hour = Number(String(time || '18:00').split(':')[0]);
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

/**
 * Build a first-draft public comment from a few inputs. Deterministic, no AI needed,
 * in the active (or given) locale.
 * @param {{name?: string, school?: string, cityName?: string, topicId?: string, itemTitle?: string, position?: 'support'|'oppose'|'concerned'|'ask', story?: string, ask?: string, timeOfDay?: 'morning'|'afternoon'|'evening', locale?: string}} input
 */
export function buildComment(input = {}) {
  const locale = input.locale;
  const tr = (key, params) => t(key, params, locale);
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  const name = str(input.name) || tr('civics.comment.myName');
  const school = str(input.school);
  const city = str(input.cityName) || tr('civics.comment.thisCity');
  const topic = getTopic(input.topicId || 'other', locale);
  const generic = topic.id === 'other';
  const topicPhrase = generic ? tr('civics.comment.genericTopic') : topic.short || topic.label.toLowerCase();
  const item = str(input.itemTitle);
  const story = str(input.story);
  const ask = str(input.ask);
  const position = ['support', 'oppose', 'concerned', 'ask'].includes(input.position) ? input.position : 'ask';
  const greeting = { morning: tr('civics.comment.greetingMorning'), afternoon: tr('civics.comment.greetingAfternoon'), evening: tr('civics.comment.greetingEvening') }[input.timeOfDay] || tr('civics.comment.greetingEvening');

  const intro = school ? tr('civics.comment.introSchool', { greeting, name, school, city }) : tr('civics.comment.introLive', { greeting, name, city });
  const subject = item ? tr('civics.comment.subjectItem', { item }) : tr('civics.comment.subjectTopic', { topic: topicPhrase });
  const stance = {
    support: tr('civics.comment.stanceSupport'),
    oppose: tr('civics.comment.stanceOppose'),
    concerned: tr('civics.comment.stanceConcerned'),
    ask: generic ? tr('civics.comment.stanceAskGeneric') : tr('civics.comment.stanceAskTopic', { topic: topicPhrase }),
  }[position];

  const angle = topic.youthAngle.replace(/\.$/, '');
  const why = story ? story : generic ? tr('civics.comment.whyGeneric') : tr('civics.comment.whyTopic', { angle: angle.charAt(0).toLowerCase() + angle.slice(1) });
  const close = ask ? tr('civics.comment.closeAsk', { ask: ask.replace(/\.$/, '') }) : tr('civics.comment.closeDefault');

  return [intro, subject, stance, why, close].join('\n\n');
}

/** Rough spoken length: about 130 words per minute. */
export function estimateSpeakingSeconds(text) {
  const words = String(text || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.round((words / 130) * 60);
}
