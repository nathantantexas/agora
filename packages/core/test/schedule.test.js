import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  nthWeekdayOfMonth,
  occurrencesForRule,
  expandCityMeetings,
  upcomingMeetings,
  addDays,
  daysBetween,
  weekdayOf,
  isDst,
  toISO,
  isSchoolHours,
  isDateStr,
} from '../src/schedule.js';

const plano = {
  cityId: 'plano',
  name: 'Plano',
  county: 'Collin',
  cityHall: { address: '1520 K Ave', lat: 33.0198, lng: -96.6989 },
  meetings: [
    { type: 'regular', label: 'City Council meeting', recurrence: { kind: 'nth-weekday', weekday: 1, ordinals: [2, 4], time: '19:00' } },
  ],
  scheduleExceptions: [{ date: '2026-09-28', status: 'cancelled', note: 'Cancelled for a holiday' }],
  agendaItems: [
    { title: 'Zoning case near Legacy', meetingDate: '2026-09-14', topics: ['zoning-development'] },
    { title: 'Youth advisory report', topics: ['youth'] },
  ],
};

test('date primitives', () => {
  assert.equal(weekdayOf('2026-09-10'), 4, 'Sept 10 2026 is a Thursday');
  assert.equal(addDays('2026-09-30', 1), '2026-10-01');
  assert.equal(daysBetween('2026-09-10', '2026-09-14'), 4);
  assert.equal(isDateStr('2026-02-30'), false);
  assert.equal(isDateStr('2028-02-29'), true);
});

test('nth weekday of month', () => {
  assert.equal(nthWeekdayOfMonth(2026, 9, 1, 2), '2026-09-14', 'second Monday of Sept 2026');
  assert.equal(nthWeekdayOfMonth(2026, 9, 1, 4), '2026-09-28');
  assert.equal(nthWeekdayOfMonth(2026, 9, 1, 5), null, 'Sept 2026 has only four Mondays');
  assert.equal(nthWeekdayOfMonth(2026, 9, 3, 1), '2026-09-02', 'first Wednesday');
});

test('recurrence expansion', () => {
  assert.deepEqual(occurrencesForRule({ kind: 'nth-weekday', weekday: 1, ordinals: [2, 4], time: '19:00' }, '2026-09-10', '2026-10-31'), ['2026-09-14', '2026-09-28', '2026-10-12', '2026-10-26']);
  assert.deepEqual(occurrencesForRule({ kind: 'weekly', weekday: 3, time: '09:00' }, '2026-09-10', '2026-09-30'), ['2026-09-16', '2026-09-23', '2026-09-30']);
  assert.deepEqual(occurrencesForRule({ kind: 'biweekly', weekday: 2, time: '10:00', anchorDate: '2026-09-08' }, '2026-09-10', '2026-10-10'), ['2026-09-22', '2026-10-06']);
  assert.deepEqual(occurrencesForRule({ kind: 'custom', weekday: 1, time: '18:00', dates: ['2026-09-01', '2026-09-21', '2026-12-01'] }, '2026-09-10', '2026-10-10'), ['2026-09-21']);
});

test('daylight saving offsets', () => {
  assert.equal(isDst('2026-09-14'), true);
  assert.equal(isDst('2026-11-02'), false);
  assert.equal(toISO('2026-09-14', '19:00'), '2026-09-14T19:00:00-05:00');
  assert.equal(toISO('2026-12-14', '19:00'), '2026-12-14T19:00:00-06:00');
});

test('school hours detection', () => {
  assert.equal(isSchoolHours('2026-09-16', '09:00'), true, 'Wednesday 9 AM');
  assert.equal(isSchoolHours('2026-09-16', '19:00'), false);
  assert.equal(isSchoolHours('2026-09-12', '09:00'), false, 'Saturday');
});

test('city expansion applies exceptions and attaches agenda items', () => {
  const occ = expandCityMeetings(plano, '2026-09-10', '2026-10-15');
  assert.deepEqual(
    occ.map((o) => [o.date, o.status]),
    [
      ['2026-09-14', 'scheduled'],
      ['2026-09-28', 'cancelled'],
      ['2026-10-12', 'scheduled'],
    ],
  );
  const first = occ[0];
  assert.equal(first.isEvening, true);
  assert.equal(first.startISO, '2026-09-14T19:00:00-05:00');
  assert.equal(first.agendaItems.length, 2, 'dated item plus undated item both land on the first regular meeting');
  assert.equal(occ[2].agendaItems.length, 0);
});

test('upcoming meetings drops cancelled by default and sorts', () => {
  const list = upcomingMeetings([plano], { from: '2026-09-10', days: 40 });
  assert.deepEqual(
    list.map((m) => m.date),
    ['2026-09-14', '2026-10-12'],
  );
  const withCancelled = upcomingMeetings([plano], { from: '2026-09-10', days: 40, includeCancelled: true });
  assert.equal(withCancelled.length, 3);
});

const colleyville = {
  cityId: 'colleyville',
  name: 'Colleyville',
  county: 'Tarrant',
  cityHall: { address: '100 Main St', lat: 32.88, lng: -97.15 },
  meetings: [
    { type: 'work-session', label: 'Council work session', openToPublicComment: false, recurrence: { kind: 'nth-weekday', weekday: 2, ordinals: [1, 3], time: '17:30' } },
    { type: 'regular', label: 'City Council meeting', openToPublicComment: true, recurrence: { kind: 'nth-weekday', weekday: 2, ordinals: [1, 3], time: '19:00' } },
  ],
};

test('holiday shift on the new date moves every same-evening meeting together', () => {
  const city = { ...colleyville, scheduleExceptions: [{ date: '2026-10-07', status: 'rescheduled', note: 'Moved from Tuesday Oct 6 to Wednesday Oct 7 (work session 5:30 p.m., regular meeting 7:00 p.m.)' }] };
  const occ = expandCityMeetings(city, '2026-10-01', '2026-10-10');
  const byKey = Object.fromEntries(occ.map((o) => [`${o.date} ${o.time}`, o]));
  assert.equal(byKey['2026-10-06 17:30'].status, 'cancelled');
  assert.equal(byKey['2026-10-06 19:00'].status, 'cancelled');
  assert.match(byKey['2026-10-06 19:00'].note, /Moved to Wed, Oct 7/);
  assert.equal(byKey['2026-10-07 17:30'].status, 'rescheduled');
  assert.equal(byKey['2026-10-07 19:00'].status, 'rescheduled');
  assert.equal(byKey['2026-10-07 19:00'].openToPublicComment, true);
  assert.equal(byKey['2026-10-07 19:00'].type, 'regular');
});

test('explicit movedFrom and a bare new-date exception behave the same', () => {
  const explicit = { ...colleyville, scheduleExceptions: [{ date: '2026-10-07', status: 'rescheduled', movedFrom: '2026-10-06', note: 'Holiday shift' }] };
  const bare = { ...colleyville, scheduleExceptions: [{ date: '2026-10-07', status: 'rescheduled', note: 'Holiday shift' }] };
  for (const city of [explicit, bare]) {
    const live = expandCityMeetings(city, '2026-10-01', '2026-10-10').filter((o) => o.status !== 'cancelled');
    assert.deepEqual(live.map((o) => `${o.date} ${o.time} ${o.type}`), ['2026-10-07 17:30 work-session', '2026-10-07 19:00 regular']);
  }
});

test('old-date exception with "moved to" creates the meeting on the target date', () => {
  const city = { ...colleyville, scheduleExceptions: [{ date: '2026-11-03', status: 'rescheduled', note: 'Election Day: both meetings moved to Wednesday, Nov. 4.' }] };
  const occ = expandCityMeetings(city, '2026-11-01', '2026-11-10');
  assert.deepEqual(occ.filter((o) => o.status === 'cancelled').map((o) => o.date), ['2026-11-03', '2026-11-03']);
  assert.deepEqual(occ.filter((o) => o.date === '2026-11-04').map((o) => `${o.time} ${o.status}`), ['17:30 rescheduled', '19:00 rescheduled']);
});

test('single moved meeting takes the time named in the note; time-only change keeps the date', () => {
  const single = { ...colleyville, meetings: [colleyville.meetings[1]], scheduleExceptions: [{ date: '2026-10-07', status: 'rescheduled', note: 'Meeting moved to Wednesday at 6:00 p.m.' }] };
  const occ = expandCityMeetings(single, '2026-10-01', '2026-10-10');
  assert.deepEqual(occ.map((o) => `${o.date} ${o.time} ${o.status}`), ['2026-10-06 19:00 cancelled', '2026-10-07 18:00 rescheduled']);
  const retimed = { ...colleyville, meetings: [colleyville.meetings[1]], scheduleExceptions: [{ date: '2026-10-06', status: 'rescheduled', note: 'Starts at 6:00 p.m. instead of 7:00 p.m. because of the budget hearing.' }] };
  const occ2 = expandCityMeetings(retimed, '2026-10-01', '2026-10-10');
  assert.deepEqual(occ2.map((o) => `${o.date} ${o.time} ${o.status}`), ['2026-10-06 18:00 rescheduled']);
});

test('moved meeting onto a date another rule already uses does not vanish', () => {
  const city = {
    ...colleyville,
    meetings: [
      { type: 'work-session', label: 'Council work session', openToPublicComment: false, recurrence: { kind: 'nth-weekday', weekday: 1, ordinals: [1], time: '18:00' } },
      { type: 'regular', label: 'City Council meeting', openToPublicComment: true, recurrence: { kind: 'nth-weekday', weekday: 2, ordinals: [1], time: '19:00' } },
    ],
    scheduleExceptions: [{ date: '2026-11-02', status: 'rescheduled', movedFrom: '2026-11-03', note: 'Election Day: council meeting moved to Monday, Nov. 2' }],
  };
  const live = expandCityMeetings(city, '2026-11-01', '2026-11-10').filter((o) => o.status !== 'cancelled');
  assert.deepEqual(live.map((o) => `${o.date} ${o.time} ${o.type} ${o.status}`), ['2026-11-02 18:00 work-session scheduled', '2026-11-02 19:00 regular rescheduled']);
});

test('note date parsing', async () => {
  const { dateFromNote } = await import('../src/schedule.js');
  assert.equal(dateFromNote('moved to Tuesday, Nov. 10 at 9 a.m.', '2026-11-11'), '2026-11-10');
  assert.equal(dateFromNote('see 2026-12-02 agenda', '2026-11-11'), '2026-12-02');
  assert.equal(dateFromNote('rescheduled to 11/10', '2026-11-11'), '2026-11-10');
  assert.equal(dateFromNote('no date here', '2026-11-11'), null);
});
