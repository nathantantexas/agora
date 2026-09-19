import { upcomingMeetings, occurrencesForRule, addDays, hourOf } from './schedule.js';
import { TOPICS } from './topics.js';

/**
 * Aggregates for the Insights charts and the CLI summary. Pure function of the data.
 */
export function computeStats(cities, { today, days = 30 } = {}) {
  const meetings = upcomingMeetings(cities, { from: today, days });
  const evening = meetings.filter((m) => m.isEvening).length;
  const speakable = meetings.filter((m) => m.openToPublicComment).length;

  // Weekday x hour grid built from the next 90 days of occurrences (a full cycle for every rule).
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
  const cycle = upcomingMeetings(cities, { from: today, days: 90 });
  for (const m of cycle) grid[m.weekday][hourOf(m.time)] += 1;

  // Per city: how many meetings per month start after 5 PM vs during the day.
  const perCity = cities.map((city) => {
    const to = addDays(today, 90);
    let eveningCount = 0;
    let daytimeCount = 0;
    for (const rule of city.meetings || []) {
      const n = occurrencesForRule(rule.recurrence, today, to).length / 3;
      if (hourOf(rule.recurrence.time) >= 17) eveningCount += n;
      else daytimeCount += n;
    }
    return {
      cityId: city.cityId,
      name: city.name,
      county: city.county,
      evening: Math.round(eveningCount * 10) / 10,
      daytime: Math.round(daytimeCount * 10) / 10,
      virtualComment: !!(city.publicComment && city.publicComment.virtualAllowed),
      youthPrograms: (city.youthPrograms || []).length,
      timeLimitMinutes: (city.publicComment && city.publicComment.timeLimitMinutes) || null,
    };
  });

  const topicCounts = new Map(TOPICS.map((t) => [t.id, 0]));
  for (const city of cities) for (const item of city.agendaItems || []) for (const t of item.topics || []) topicCounts.set(t, (topicCounts.get(t) || 0) + 1);

  const byCounty = new Map();
  for (const c of cities) byCounty.set(c.county, (byCounty.get(c.county) || 0) + 1);

  return {
    today,
    windowDays: days,
    totals: {
      cities: cities.length,
      meetings: meetings.length,
      eveningShare: meetings.length ? evening / meetings.length : 0,
      speakableShare: meetings.length ? speakable / meetings.length : 0,
      citiesWithYouthPrograms: cities.filter((c) => (c.youthPrograms || []).length).length,
      citiesWithVirtualComment: cities.filter((c) => c.publicComment && c.publicComment.virtualAllowed).length,
      agendaItems: cities.reduce((n, c) => n + (c.agendaItems || []).length, 0),
    },
    byWeekdayHour: grid,
    perCity: perCity.sort((a, b) => b.evening - a.evening || a.name.localeCompare(b.name)),
    topicCounts: [...topicCounts.entries()].map(([topicId, count]) => ({ topicId, count })).filter((t) => t.count > 0).sort((a, b) => b.count - a.count),
    byCounty: [...byCounty.entries()].map(([county, count]) => ({ county, count })).sort((a, b) => b.count - a.count),
  };
}
