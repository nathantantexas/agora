import { useMemo } from 'react';
import { computeStats, upcomingMeetings, getTopic, BRAND, t } from '@agora/core';
import { today as todayFn } from '../lib/data.js';
import { useCities } from '../lib/DataProvider.jsx';
import { useStore } from '../lib/store.jsx';
import { StatTile, DotPlot, Dumbbell, Matrix, UnitChart } from '../components/charts.jsx';
import { ScheduleRibbon } from '../components/viz.jsx';

const pct = (x) => `${Math.round(x * 100)}%`;
const RIBBON_DAYS = 60;

export default function Insights() {
  const { prefs } = useStore();
  const { cities } = useCities();
  const today = todayFn();
  const stats = useMemo(() => computeStats(cities, { today, days: 30 }), [cities, today]);
  const ribbon = useMemo(() => upcomingMeetings(cities, { from: today, days: RIBBON_DAYS }), [cities, today]);

  const schoolHours = useMemo(() => {
    let during = 0;
    let total = 0;
    stats.byWeekdayHour.forEach((row, wd) =>
      row.forEach((n, h) => {
        total += n;
        if (wd >= 1 && wd <= 5 && h >= 8 && h < 16) during += n;
      }),
    );
    return total ? during / total : 0;
  }, [stats]);

  // Almost every council meets four evenings a month, so a single ranking would be
  // fourteen cities tied at 4.0. The pair of marks shows the split that actually differs:
  // how much of each calendar happens while a student is still in class.
  const cityRows = stats.perCity
    .filter((c) => c.evening + c.daytime > 0)
    .map((c) => ({ label: c.name, a: c.daytime, b: c.evening }))
    .sort((x, y) => y.a + y.b - (x.a + x.b) || y.b - x.b || x.label.localeCompare(y.label));
  const homeName = prefs.homeCityId ? (cities.find((c) => c.cityId === prefs.homeCityId) || {}).name : null;
  const homeIndex = homeName ? cityRows.findIndex((r) => r.label === homeName) : -1;
  const topicRows = stats.topicCounts.map((x) => ({ label: getTopic(x.topicId).label, value: x.count }));

  const limitGroups = useMemo(() => {
    const counts = cities
      .filter((c) => c.publicComment && c.publicComment.timeLimitMinutes)
      .reduce((m, c) => m.set(c.publicComment.timeLimitMinutes, (m.get(c.publicComment.timeLimitMinutes) || 0) + 1), new Map());
    return [...counts.entries()].sort((a, b) => a[0] - b[0]).map(([mins, n]) => ({ label: t('insights.minutesLabel', { n: mins }), count: n }));
  }, [cities]);

  const countyGroups = stats.byCounty.map((x) => ({ label: x.county, count: x.count }));

  return (
    <div className="container">
      <h1>{t('insights.heading', { region: BRAND.region })}</h1>

      <div className="tiles" style={{ margin: '18px 0 22px' }}>
        <StatTile value={stats.totals.cities} label={t('insights.citiesCovered')} />
        <StatTile value={stats.totals.meetings} label={t('insights.meetingsNext30')} />
        <StatTile value={pct(stats.totals.eveningShare)} label={t('insights.startAfter5')} />
        <StatTile value={pct(schoolHours)} label={t('insights.duringSchool')} />
        <StatTile value={pct(stats.totals.speakableShare)} label={t('insights.allowComment')} />
        <StatTile value={stats.totals.citiesWithYouthPrograms} label={t('insights.citiesWithYouth')} />
        <StatTile value={stats.totals.citiesWithVirtualComment} label={t('insights.citiesWithRemote')} />
      </div>

      <ScheduleRibbon meetings={ribbon} from={today} days={RIBBON_DAYS} title={t('insights.ribbonTitle')} />

      <div className="stack">
        <Matrix title={t('insights.heatmapTitle')} grid={stats.byWeekdayHour} note={t('insights.matrixNote')} />
        <Dumbbell
          title={t('insights.eveningByCity')}
          rows={cityRows}
          labelA={t('viz.daytimeMark')}
          labelB={t('viz.eveningMark')}
          valueFormat={(v) => v.toFixed(1)}
          unit={t('insights.perMonth')}
          maxRows={18}
          emphasisIndex={homeIndex}
          note={t('insights.eveningNote')}
        />
        {topicRows.length > 0 && <DotPlot title={t('insights.agendasTitle')} rows={topicRows} unit={t('insights.items')} maxRows={12} note={t('insights.agendasNote')} />}
        {limitGroups.length > 0 && <UnitChart title={t('insights.speakTitle')} groups={limitGroups} note={t('insights.limitsNote')} />}
        {countyGroups.length > 0 && <UnitChart title={t('insights.countyTitle')} groups={countyGroups} note={t('insights.limitsNote')} color="var(--series-4)" />}
      </div>
    </div>
  );
}
