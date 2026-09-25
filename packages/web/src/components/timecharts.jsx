import { useId, useState } from 'react';
import { t } from '@agora/core';
import { Figure } from './charts.jsx';

/**
 * Charts with time along the bottom, for a rehearsal: a line against a target band, and
 * a strip of one cell per second. Same rules as the rest: one hue, recessive grid,
 * direct labels, and a table view of the same numbers.
 */

function niceTicks(max, count = 4) {
  if (!(max > 0)) return [];
  const mag = Math.pow(10, Math.floor(Math.log10(max / count)));
  const norm = max / count / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = step; v <= max + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

function mmss(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * One or two series over time with an optional shaded target band.
 * series: [{ label, points: [{t, v}], dashed? }]
 */
export function TimeSeries({ title, series, band, unit = '', xMax, note, foot, yMax }) {
  const id = useId();
  const [table, setTable] = useState(false);
  const width = 680;
  const height = 220;
  const padL = 52;
  const padR = 16;
  const padT = 14;
  const padB = 34;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const all = series.flatMap((s) => s.points);
  const tMax = xMax || Math.max(...all.map((p) => p.t), 1);
  const vMax = yMax || Math.max(...all.map((p) => p.v), band ? band[1] : 0, 1) * 1.1;
  const ticks = niceTicks(vMax);
  const axisMax = Math.max(vMax, ticks[ticks.length - 1] || vMax);
  const x = (tt) => padL + (Math.min(tt, tMax) / tMax) * plotW;
  const y = (v) => padT + plotH - (Math.min(v, axisMax) / axisMax) * plotH;
  const xTicks = [];
  const step = tMax > 240 ? 60 : tMax > 90 ? 30 : 15;
  for (let s = 0; s <= tMax; s += step) xTicks.push(s);

  return (
    <Figure
      title={title}
      id={`${id}-cap`}
      note={note}
      foot={foot}
      tools={
        <button type="button" className="btn quiet" onClick={() => setTable((v) => !v)} aria-pressed={table}>
          {table ? t('insights.showChart') : t('insights.showAsTable')}
        </button>
      }
    >
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('rehearse.time')}</th>
                {series.map((s) => (
                  <th key={s.label} className="num">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(series[0] ? series[0].points : []).map((p, i) => (
                <tr key={i}>
                  <td>{mmss(p.t)}</td>
                  {series.map((s) => (
                    <td key={s.label} className="num">
                      {s.points[i] ? s.points[i].v : ''}
                      {unit}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart">
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`} style={{ minWidth: 420 }}>
            <desc id={`${id}-desc`}>{series.map((s) => `${s.label}: ${s.points.map((p) => `${mmss(p.t)} ${p.v}${unit}`).join(', ')}`).join('; ')}</desc>
            {band && <rect className="band" x={padL} y={y(band[1])} width={plotW} height={Math.max(0, y(band[0]) - y(band[1]))} />}
            {ticks.map((v) => (
              <g key={v}>
                <line className="grid-line" x1={padL} x2={padL + plotW} y1={y(v)} y2={y(v)} strokeWidth="1" />
                <text className="axis-label" x={padL - 8} y={y(v) + 4} textAnchor="end">
                  {v}
                  {unit}
                </text>
              </g>
            ))}
            {xTicks.map((s) => (
              <text key={s} className="axis-label" x={x(s)} y={height - 8} textAnchor={s === 0 ? 'start' : 'middle'}>
                {mmss(s)}
              </text>
            ))}
            <line className="axis" x1={padL} x2={padL} y1={padT} y2={padT + plotH} strokeWidth="1" />
            <line className="axis" x1={padL} x2={padL + plotW} y1={padT + plotH} y2={padT + plotH} strokeWidth="1" />
            {series.map((s, si) => {
              const d = s.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}`).join(' ');
              return (
                <g key={s.label}>
                  <path d={d} fill="none" stroke={si === 0 ? 'var(--series-1)' : 'var(--series-2)'} strokeWidth="2" strokeDasharray={s.dashed ? '4 4' : undefined} strokeLinejoin="round" />
                  {s.points.map((p, i) => (
                    <circle key={i} cx={x(p.t)} cy={y(p.v)} r="3" fill={si === 0 ? 'var(--series-1)' : 'var(--series-2)'} />
                  ))}
                </g>
              );
            })}
            {band && (
              <text className="axis-label" x={padL + plotW - 4} y={y(band[1]) - 4} textAnchor="end">
                {t('rehearse.targetBand', { lo: band[0], hi: band[1] })}
              </text>
            )}
          </svg>
          {series.length > 1 && (
            <p className="legend">
              {series.map((s, si) => (
                <span key={s.label} className={si === 0 ? 'k1' : 'k3'}>
                  {s.label}
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </Figure>
  );
}

/**
 * One cell per second. cells: true, false, or null for "no reading". Reads like the
 * cadence strip on the city index: a run of dark cells is a run of good seconds.
 */
export function TimeStrip({ title, cells, labels, note }) {
  const id = useId();
  const n = cells.length || 1;
  const w = Math.max(240, n * 6);
  const on = cells.filter((c) => c === true).length;
  const known = cells.filter((c) => c !== null).length;
  return (
    <Figure title={title} id={`${id}-cap`} note={note} foot={known ? t('rehearse.stripFoot', { pct: Math.round((on / known) * 100), on, known }) : t('rehearse.stripNone')}>
      <div className="chart">
        <svg viewBox={`0 0 ${w} 26`} role="img" aria-labelledby={`${id}-cap`} preserveAspectRatio="none" style={{ height: 26, width: '100%' }}>
          {cells.map((c, i) => (
            <rect key={i} x={(i / n) * w} y={c === null ? 10 : 2} width={w / n - 0.5} height={c === null ? 4 : 18} fill={c === true ? 'var(--series-3)' : c === false ? 'var(--series-1)' : 'var(--rule)'} />
          ))}
        </svg>
        <p className="legend" style={{ marginTop: 8 }}>
          <span className="k3">{labels.on}</span>
          <span className="k1">{labels.off}</span>
          <span className="k2">{labels.none}</span>
        </p>
      </div>
    </Figure>
  );
}
