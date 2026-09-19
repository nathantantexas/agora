import { useId, useMemo, useState } from 'react';
import { addDays, weekdayOf, hourOf, parseDate, formatDate, formatTime, milesText, t, tn, tList } from '@agora/core';
import { Figure } from './charts.jsx';

/**
 * Visualizations built for this data in particular, meant to sit inside a page rather
 * than on a charts page of their own. Each one answers a question a student actually has:
 * when is anything happening, does this land during school, how long do I get to talk,
 * and which of these can I physically get to.
 */

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.text}
    </div>
  );
}

function clock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

function minutesOf(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * A day by day column of how much is happening across the region. The shape of the
 * month is the point: council calendars cluster on the first and third weeks, and a
 * strip like this shows that in one glance where a list of dates cannot.
 */
export function ScheduleRibbon({ meetings, from, days = 45, title, compact = false }) {
  const id = useId();
  const [tip, setTip] = useState(null);
  const months = tList('format.monthsShort');

  const cols = useMemo(() => {
    const counts = new Map();
    for (const m of meetings) counts.set(m.date, (counts.get(m.date) || 0) + 1);
    return Array.from({ length: days }, (_, i) => {
      const date = addDays(from, i);
      return { date, i, n: counts.get(date) || 0, wd: weekdayOf(date), day: parseDate(date).d, month: parseDate(date).m };
    });
  }, [meetings, from, days]);

  // The viewBox is sized close to the column it lands in, so the labels scale to a
  // readable size instead of being blown up or shrunk by a large aspect correction.
  const width = compact ? 380 : 900;
  const height = compact ? 62 : 86;
  const baseline = height - 17;
  const plotTop = 10;
  const colW = width / days;
  const barW = Math.max(2, Math.min(14, colW - 2));
  const max = Math.max(...cols.map((c) => c.n), 1);
  const busiest = cols.reduce((best, c) => (c.n > (best ? best.n : 0) ? c : best), null);
  const total = cols.reduce((n, c) => n + c.n, 0);

  return (
    <figure className="ribbon">
      <div className="ribbon-head">
        <figcaption id={`${id}-cap`}>{title}</figcaption>
        <span className="hint">{tn('viz.ribbonTotal', total)}</span>
      </div>
      <div className="chart chart-wrap" onMouseLeave={() => setTip(null)}>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`}>
          <desc id={`${id}-desc`}>
            {cols
              .filter((c) => c.n > 0)
              .map((c) => `${formatDate(c.date)}: ${c.n}`)
              .join('; ') || t('viz.ribbonEmpty')}
          </desc>
          {cols.map((c) =>
            c.wd === 0 || c.wd === 6 ? <rect key={`w${c.i}`} x={c.i * colW} y={plotTop - 4} width={colW} height={baseline - plotTop + 4} fill="var(--surface-2)" /> : null,
          )}
          {cols.map((c) =>
            c.day === 1 ? (
              <g key={`m${c.i}`}>
                <line x1={c.i * colW} x2={c.i * colW} y1={plotTop - 4} y2={baseline + 5} stroke="var(--rule-strong)" strokeWidth="1" />
                <text className="axis-label" x={c.i * colW + 4} y={height - 4} textAnchor="start">
                  {months[c.month - 1]}
                </text>
              </g>
            ) : null,
          )}
          <text className="axis-label" x={2} y={height - 4} textAnchor="start">
            {t('viz.today')}
          </text>
          <line className="axis" x1={0} x2={width} y1={baseline} y2={baseline} strokeWidth="1" />
          {cols.map((c) => (
            <g key={c.i} onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: tn('viz.meetingsOn', c.n, { label: formatDate(c.date) }) })}>
              <rect className="hit" x={c.i * colW} y={plotTop - 4} width={colW} height={baseline - plotTop + 4} />
              {c.n > 0 && (
                <rect
                  x={c.i * colW + (colW - barW) / 2}
                  y={baseline - Math.max(3, (c.n / max) * (baseline - plotTop))}
                  width={barW}
                  height={Math.max(3, (c.n / max) * (baseline - plotTop))}
                  fill={c.i === 0 ? 'var(--ink)' : 'var(--series-1)'}
                />
              )}
            </g>
          ))}
        </svg>
        <Tip tip={tip} />
      </div>
      {busiest && busiest.n > 0 && (
        <p className="ribbon-foot">{t('viz.ribbonBusiest', { date: formatDate(busiest.date), n: busiest.n })}</p>
      )}
    </figure>
  );
}

/**
 * Where one meeting falls in a school day. Drawn to scale from 6 AM to 11 PM with the
 * school block shaded, because "7:00 PM" means nothing until you see it sitting well
 * clear of the part of the day a student is not free.
 */
export function MeetingClock({ time, weekday, label }) {
  const id = useId();
  const start = minutesOf(time);
  const width = 440;
  const height = 72;
  const padL = 24;
  const plotW = width - padL * 2;
  const from = 6 * 60;
  const span = 17 * 60;
  const x = (min) => padL + ((Math.min(Math.max(min, from), from + span) - from) / span) * plotW;
  const baseline = 44;
  const weekdayMeeting = weekday >= 1 && weekday <= 5;
  const ticks = [6, 8, 10, 12, 14, 16, 18, 20, 22];
  const markerX = x(start);
  const anchor = markerX > width - 60 ? 'end' : markerX < 60 ? 'start' : 'middle';

  return (
    <div className="clock" role="img" aria-label={label || t('viz.clockAria', { time: formatTime(time) })}>
      <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {weekdayMeeting && (
          <>
            <rect x={x(8 * 60)} y={26} width={x(16 * 60) - x(8 * 60)} height={18} fill="var(--surface-2)" />
            <text className="axis-label" x={(x(8 * 60) + x(16 * 60)) / 2} y={39} textAnchor="middle">
              {t('viz.clockSchool')}
            </text>
          </>
        )}
        <line className="axis" x1={padL} x2={width - padL} y1={baseline} y2={baseline} strokeWidth="1" />
        {ticks.map((h) => (
          <g key={h}>
            <line x1={x(h * 60)} x2={x(h * 60)} y1={baseline} y2={baseline + 5} stroke="var(--rule-strong)" strokeWidth="1" />
            <text className="axis-label" x={x(h * 60)} y={baseline + 17} textAnchor="middle">
              {clock(h * 60)}
            </text>
          </g>
        ))}
        <line x1={markerX} x2={markerX} y1={14} y2={baseline + 2} stroke="var(--ink)" strokeWidth="2" />
        <circle cx={markerX} cy={14} r={4} fill="var(--ink)" />
        <text className="value" x={markerX} y={9} textAnchor={anchor} style={{ fontSize: 12 }}>
          {formatTime(time)}
        </text>
      </svg>
      <p className="visually-hidden" id={`${id}-d`}>
        {label || t('viz.clockAria', { time: formatTime(time) })}
      </p>
    </div>
  );
}

/**
 * The draft measured against the city's speaking limit, on a real ruler. A number of
 * seconds is abstract; a bar that runs past a marked line is not.
 */
export function SpeakingRuler({ seconds, limitSeconds, title }) {
  const width = 400;
  const height = 82;
  const padL = 22;
  const plotW = width - padL * 2;
  const scaleMax = Math.ceil(Math.max(limitSeconds * 1.2, seconds * 1.08, 90) / 30) * 30;
  const x = (s) => padL + (Math.max(0, s) / scaleMax) * plotW;
  const over = seconds > limitSeconds;
  const barTop = 18;
  const barH = 18;
  const baseline = 46;
  const ticks = [];
  for (let s = 0; s <= scaleMax; s += 15) ticks.push(s);
  const diff = Math.abs(limitSeconds - seconds);
  const limitX = x(limitSeconds);

  return (
    <div className="ruler">
      <div className="ruler-head">
        <span className="k">{title}</span>
        <span className={`tag${over ? ' warn' : ' good'}`}>{over ? t('viz.rulerOver', { n: diff }) : t('viz.rulerUnder', { n: diff })}</span>
      </div>
      <div className="chart">
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={t('viz.rulerAria', { used: fmtClock(seconds), limit: fmtClock(limitSeconds) })}>
          <rect x={padL} y={barTop} width={x(Math.min(seconds, limitSeconds)) - padL} height={barH} fill="var(--series-1)" />
          {over && <rect x={limitX} y={barTop} width={x(seconds) - limitX} height={barH} fill="var(--crit)" />}
          <line className="axis" x1={padL} x2={width - padL} y1={baseline} y2={baseline} strokeWidth="1" />
          {ticks.map((s) => (
            <g key={s}>
              <line x1={x(s)} x2={x(s)} y1={baseline} y2={baseline + (s % 60 === 0 ? 8 : 4)} stroke="var(--rule-strong)" strokeWidth="1" />
              {s % 60 === 0 && (
                <text className="axis-label" x={x(s)} y={baseline + 20} textAnchor={s === 0 ? 'start' : s === scaleMax ? 'end' : 'middle'}>
                  {fmtClock(s)}
                </text>
              )}
            </g>
          ))}
          <line x1={limitX} x2={limitX} y1={10} y2={baseline + 2} stroke="var(--ink)" strokeWidth="2" />
          <text className="value" x={limitX} y={7} textAnchor={limitX > width - 60 ? 'end' : 'middle'} style={{ fontSize: 11 }}>
            {t('viz.rulerLimit', { time: fmtClock(limitSeconds) })}
          </text>
        </svg>
      </div>
      <p className="ruler-foot">{t('viz.rulerRead', { used: fmtClock(seconds), limit: fmtClock(limitSeconds) })}</p>
    </div>
  );
}

function fmtClock(s) {
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

const REACH_HOURS = [7, 22];

/**
 * Distance against start time for every meeting ahead of you. The shaded rectangle is
 * the answers you gave during setup, so anything inside it is a meeting you said you
 * could get to, and anything outside it shows what you would have to change.
 */
export function ReachPlot({ meetings, prefs, title, note }) {
  const id = useId();
  const [tip, setTip] = useState(null);
  const [table, setTable] = useState(false);

  const points = useMemo(() => {
    const m = new Map();
    for (const x of meetings) {
      if (x.distanceMiles == null) continue;
      const hour = hourOf(x.time);
      const key = `${x.cityId}|${x.time}`;
      const cur = m.get(key);
      if (cur) cur.n += 1;
      else m.set(key, { key, cityId: x.cityId, cityName: x.cityName, hour, time: x.time, miles: x.distanceMiles, weekend: x.weekday === 0 || x.weekday === 6, n: 1 });
    }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [meetings]);

  const fits = (p) => {
    if (p.miles > prefs.maxMiles) return false;
    if (p.weekend) return prefs.availability.weekends === true;
    return p.hour >= 17 ? prefs.availability.evenings === true : prefs.availability.daytime === true;
  };

  const width = 660;
  const height = 330;
  const padL = 54;
  const padR = 16;
  const padT = 16;
  const padB = 46;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const xMax = Math.max(5, Math.ceil(Math.max(prefs.maxMiles * 1.35, ...points.map((p) => p.miles), 10) / 5) * 5);
  const x = (mi) => padL + (Math.min(mi, xMax) / xMax) * plotW;
  const y = (h) => padT + ((Math.min(Math.max(h, REACH_HOURS[0]), REACH_HOURS[1]) - REACH_HOURS[0]) / (REACH_HOURS[1] - REACH_HOURS[0])) * plotH;

  const bands = [];
  if (prefs.availability.daytime) bands.push([8, 17]);
  if (prefs.availability.evenings) bands.push([17, REACH_HOURS[1]]);

  const xTicks = [];
  for (let mi = 0; mi <= xMax; mi += xMax > 20 ? 10 : 5) xTicks.push(mi);
  const yTicks = [8, 11, 14, 17, 20];
  const inside = points.filter(fits).reduce((n, p) => n + p.n, 0);
  const totalMeetings = points.reduce((n, p) => n + p.n, 0);

  const toggle = (
    <button type="button" className="btn quiet" onClick={() => setTable((v) => !v)} aria-pressed={table} aria-label={t('insights.tableView', { title })}>
      {table ? t('insights.showChart') : t('insights.showAsTable')}
    </button>
  );

  if (!points.length) {
    return (
      <Figure title={title} id={`${id}-cap`} note={note}>
        <p className="muted">{t('viz.reachEmpty')}</p>
      </Figure>
    );
  }

  return (
    <Figure title={title} id={`${id}-cap`} note={note} tools={toggle} foot={t('viz.reachFoot', { inside, total: totalMeetings, miles: prefs.maxMiles })}>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('viz.city')}</th>
                <th>{t('viz.startTime')}</th>
                <th className="num">{t('viz.milesAxis')}</th>
                <th className="num">{t('viz.count')}</th>
                <th>{t('viz.reachFits')}</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <td>{p.cityName}</td>
                  <td>{formatTime(p.time)}</td>
                  <td className="num">{p.miles.toFixed(1)}</td>
                  <td className="num">{p.n}</td>
                  <td>{fits(p) ? t('viz.reachInside') : t('viz.reachOutside')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="legend">
            <span className="k1">{t('viz.reachInside')}</span>
            <span className="k2">{t('viz.reachOutside')}</span>
          </p>
          <div className="chart chart-wrap" onMouseLeave={() => setTip(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`} style={{ minWidth: 480 }}>
              <desc id={`${id}-desc`}>{points.map((p) => `${p.cityName} ${formatTime(p.time)} ${milesText(p.miles)} ${tn('viz.meetingCount', p.n)}`).join('; ')}</desc>
              {bands.map(([a, b]) => (
                <rect key={a} className="band" x={padL} y={y(a)} width={x(prefs.maxMiles) - padL} height={y(b) - y(a)} />
              ))}
              {xTicks.map((mi) => (
                <g key={mi}>
                  <line className="grid-line" x1={x(mi)} x2={x(mi)} y1={padT} y2={padT + plotH} strokeWidth="1" />
                  <text className="axis-label" x={x(mi)} y={padT + plotH + 16} textAnchor="middle">
                    {mi}
                  </text>
                </g>
              ))}
              {yTicks.map((h) => (
                <g key={h}>
                  <line className="grid-line" x1={padL} x2={padL + plotW} y1={y(h)} y2={y(h)} strokeWidth="1" />
                  <text className="axis-label" x={padL - 8} y={y(h) + 4} textAnchor="end">
                    {clock(h * 60)}
                  </text>
                </g>
              ))}
              <line className="band-line" x1={x(prefs.maxMiles)} x2={x(prefs.maxMiles)} y1={padT} y2={padT + plotH} strokeWidth="1.5" />
              <line className="axis" x1={padL} x2={padL} y1={padT} y2={padT + plotH} strokeWidth="1" />
              <line className="axis" x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} strokeWidth="1" />
              <text className="axis-label" x={padL + plotW / 2} y={height - 8} textAnchor="middle">
                {t('viz.milesAxis')}
              </text>
              <text className="axis-label" x={x(prefs.maxMiles) - 6} y={padT + 11} textAnchor="end">
                {t('viz.reachLimit', { n: prefs.maxMiles })}
              </text>
              {points.map((p) => {
                const ok = fits(p);
                const r = Math.min(9, 3.4 + Math.sqrt(Math.max(0, p.n - 1)) * 2.2);
                return (
                  <circle
                    key={p.key}
                    className={`dot${ok ? '' : ' dim'}`}
                    cx={x(p.miles)}
                    cy={y(p.hour)}
                    r={r}
                    onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${p.cityName}, ${formatTime(p.time)}, ${milesText(p.miles)}, ${tn('viz.meetingCount', p.n)}` })}
                  />
                );
              })}
            </svg>
            <Tip tip={tip} />
          </div>
        </>
      )}
    </Figure>
  );
}

/**
 * Six weeks of one city's calendar as a single strip, sized to sit inside a table row.
 * Forty of them stacked down the page make the difference between a council that meets
 * weekly and one that meets twice a month obvious without reading a word.
 */
export function CadenceStrip({ dates, from, days = 42, label }) {
  const set = useMemo(() => (dates instanceof Set ? dates : new Set(dates)), [dates]);
  const cells = useMemo(() => Array.from({ length: days }, (_, i) => set.has(addDays(from, i))), [set, from, days]);
  const n = cells.filter(Boolean).length;

  return (
    <svg className="cadence" viewBox={`0 0 ${days * 3} 18`} preserveAspectRatio="none" role="img" aria-label={label || tn('viz.cadenceAria', n)}>
      {cells.map((on, i) => (
        <rect key={i} className={on ? 'on' : 'off'} x={i * 3} y={on ? 1 : 11} width={2} height={on ? 16 : 3} />
      ))}
    </svg>
  );
}
