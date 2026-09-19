import { useId, useState } from 'react';
import { t, tList, tn } from '@agora/core';

/**
 * General purpose chart primitives. They follow one set of rules: a single hue for
 * magnitude, hairline grids that sit behind the data, direct labels instead of legends
 * wherever a label fits, tabular numerals, square corners, and a table view of the same
 * numbers for anyone who cannot use the picture.
 */

export function StatTile({ value, label }) {
  return (
    <div className="tile">
      <div className="v">{value}</div>
      <div className="l">{label}</div>
    </div>
  );
}

/** Chart or table, remembered per figure. */
function useTableToggle(title) {
  const [table, setTable] = useState(false);
  const button = (
    <button type="button" className="btn quiet" onClick={() => setTable((v) => !v)} aria-pressed={table} aria-label={t('insights.tableView', { title })}>
      {table ? t('insights.showChart') : t('insights.showAsTable')}
    </button>
  );
  return { table, button };
}

/** Titled frame shared by every figure so charts line up across pages. */
export function Figure({ title, id, note, foot, tools, bare = false, children }) {
  return (
    <figure className={`figure${bare ? ' bare' : ''}`}>
      <div className="figure-head">
        <figcaption id={id}>{title}</figcaption>
        {tools}
      </div>
      {note && <p className="figure-note">{note}</p>}
      {children}
      {foot && <p className="figure-foot">{foot}</p>}
    </figure>
  );
}

function Tip({ tip }) {
  if (!tip) return null;
  return (
    <div className="chart-tip" style={{ left: tip.x, top: tip.y }} role="presentation">
      {tip.text}
    </div>
  );
}

/** Round gridline values, so an axis reads 25, 50, 75, 100 rather than 28.3, 56.5, 84.8. */
function niceTicks(max, count = 5) {
  if (!(max > 0)) return [];
  const mag = Math.pow(10, Math.floor(Math.log10(max / count)));
  const norm = max / count / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
  const out = [];
  for (let v = step; v <= max + step * 1e-6; v += step) out.push(Number(v.toPrecision(12)));
  return out;
}

/** Fit a long row label into the label gutter without cutting a word mid-stride. */
function trim(label, max = 33) {
  return label.length > max ? `${label.slice(0, max - 1).trimEnd()}…` : label;
}

/**
 * Cleveland dot plot. A dot on a leader line reads a ranking far more precisely than a
 * filled bar does, and it leaves the row free for a note.
 * rows: [{label, value, note}]
 */
export function DotPlot({ title, rows, valueFormat = (v) => String(v), unit = '', maxRows = 14, emphasisIndex = -1, note, foot }) {
  const id = useId();
  const { table, button } = useTableToggle(title);
  const [tip, setTip] = useState(null);
  const data = rows.slice(0, maxRows);
  const max = Math.max(...data.map((r) => r.value), 0.0001);
  const ticks = niceTicks(max);
  const axisMax = Math.max(max, ticks[ticks.length - 1] || max);
  const width = 680;
  const labelW = 220;
  const rightPad = 62;
  const plotW = width - labelW - rightPad;
  const rowH = 25;
  const top = 24;
  const height = top + data.length * rowH + 6;
  const x = (v) => labelW + (v / axisMax) * plotW;

  return (
    <Figure title={title} id={`${id}-cap`} note={note} foot={foot} tools={button}>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('insights.item')}</th>
                <th className="num">{unit || t('insights.value')}</th>
                <th>{t('insights.note')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{valueFormat(r.value)}</td>
                  <td>{r.note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart chart-wrap" onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`} style={{ minWidth: 480 }}>
            <desc id={`${id}-desc`}>{data.map((r) => `${r.label}: ${valueFormat(r.value)}${unit ? ` ${unit}` : ''}`).join('; ')}</desc>
            {ticks.map((v) => (
              <g key={v}>
                <line className="grid-line" x1={x(v)} x2={x(v)} y1={top - 8} y2={height - 4} strokeWidth="1" />
                <text className="axis-label" x={x(v)} y={top - 13} textAnchor="middle">
                  {valueFormat(v)}
                </text>
              </g>
            ))}
            <line className="axis" x1={labelW} x2={labelW} y1={top - 8} y2={height - 4} strokeWidth="1" />
            {data.map((r, i) => {
              const cy = top + i * rowH + rowH / 2;
              const emph = emphasisIndex === i;
              return (
                <g key={r.label} onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${r.label}: ${valueFormat(r.value)}${unit ? ` ${unit}` : ''}${r.note ? ` (${r.note})` : ''}` })}>
                  <rect className="hit" x={0} y={cy - rowH / 2} width={width} height={rowH} />
                  <text x={labelW - 10} y={cy + 4} textAnchor="end" className={emph ? 'label-strong' : undefined}>
                    {trim(r.label)}
                  </text>
                  <line className="leader" x1={labelW + 1} x2={x(r.value)} y1={cy} y2={cy} strokeWidth="1" />
                  <circle className={`dot${emph ? ' emph' : ''}`} cx={x(r.value)} cy={cy} r={emph ? 5.5 : 4.5} />
                  <text className="value" x={x(r.value) + 10} y={cy + 4}>
                    {valueFormat(r.value)}
                  </text>
                </g>
              );
            })}
          </svg>
          <Tip tip={tip} />
        </div>
      )}
    </Figure>
  );
}

/**
 * Two measures per row joined by a bar: a dumbbell. Where a single ranking would show
 * fourteen cities tied at the same number, the gap between the two marks carries the
 * story instead, which here is how much of a council's calendar a student can reach.
 * rows: [{label, a, b, note}] with a drawn hollow and b drawn solid.
 */
export function Dumbbell({ title, rows, labelA, labelB, valueFormat = (v) => String(v), unit = '', maxRows = 18, emphasisIndex = -1, note, foot }) {
  const id = useId();
  const { table, button } = useTableToggle(title);
  const [tip, setTip] = useState(null);
  const data = rows.slice(0, maxRows);
  const max = Math.max(...data.flatMap((r) => [r.a, r.b]), 0.0001);
  const ticks = niceTicks(max);
  const axisMax = Math.max(max, ticks[ticks.length - 1] || max);
  const width = 680;
  const labelW = 220;
  const rightPad = 26;
  const plotW = width - labelW - rightPad;
  const rowH = 25;
  const top = 24;
  const height = top + data.length * rowH + 6;
  const x = (v) => labelW + (v / axisMax) * plotW;

  return (
    <Figure
      title={title}
      id={`${id}-cap`}
      note={note}
      foot={foot}
      tools={button}
    >
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('insights.item')}</th>
                <th className="num">{labelA}</th>
                <th className="num">{labelB}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.label}>
                  <td>{r.label}</td>
                  <td className="num">{valueFormat(r.a)}</td>
                  <td className="num">{valueFormat(r.b)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <p className="legend">
            <span className="k2">{labelA}</span>
            <span className="k1">{labelB}</span>
          </p>
          <div className="chart chart-wrap" onMouseLeave={() => setTip(null)}>
            <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`} style={{ minWidth: 480 }}>
              <desc id={`${id}-desc`}>{data.map((r) => `${r.label}: ${labelA} ${valueFormat(r.a)}, ${labelB} ${valueFormat(r.b)}`).join('; ')}</desc>
              {ticks.map((v) => (
                <g key={v}>
                  <line className="grid-line" x1={x(v)} x2={x(v)} y1={top - 8} y2={height - 4} strokeWidth="1" />
                  <text className="axis-label" x={x(v)} y={top - 13} textAnchor="middle">
                    {valueFormat(v)}
                  </text>
                </g>
              ))}
              <line className="axis" x1={labelW} x2={labelW} y1={top - 8} y2={height - 4} strokeWidth="1" />
              {data.map((r, i) => {
                const cy = top + i * rowH + rowH / 2;
                const emph = emphasisIndex === i;
                const lo = Math.min(r.a, r.b);
                const hi = Math.max(r.a, r.b);
                return (
                  <g
                    key={r.label}
                    onMouseEnter={(e) =>
                      setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: `${r.label}: ${labelA} ${valueFormat(r.a)}, ${labelB} ${valueFormat(r.b)}${unit ? ` ${unit}` : ''}` })
                    }
                  >
                    <rect className="hit" x={0} y={cy - rowH / 2} width={width} height={rowH} />
                    <text x={labelW - 10} y={cy + 4} textAnchor="end" className={emph ? 'label-strong' : undefined}>
                      {trim(r.label)}
                    </text>
                    <line className="leader" x1={labelW + 1} x2={x(lo)} y1={cy} y2={cy} strokeWidth="1" />
                    <line x1={x(lo)} x2={x(hi)} y1={cy} y2={cy} stroke="var(--rule-strong)" strokeWidth="3" />
                    <circle className="dot hollow" cx={x(r.a)} cy={cy} r={4.5} />
                    <circle className={`dot${emph ? ' emph' : ''}`} cx={x(r.b)} cy={cy} r={4.5} />
                  </g>
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

const HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
const RAMP = ['var(--seq-1)', 'var(--seq-2)', 'var(--seq-3)', 'var(--seq-4)'];
const RAMP_INK = ['var(--seq-ink-light)', 'var(--seq-ink-light)', 'var(--seq-ink-dark)', 'var(--seq-ink-dark)'];

function hourLabel(h) {
  if (h === 12) return '12 PM';
  return h > 12 ? `${h - 12} PM` : `${h} AM`;
}

/**
 * Density matrix of weekday against start hour. Square cells, no numbers printed inside:
 * the point of the picture is the block of dark cells on weekday evenings, and figures
 * in every cell would bury it. Exact counts come from hover and from the table.
 */
export function Matrix({ title, grid, note, foot }) {
  const id = useId();
  const { table, button } = useTableToggle(title);
  const [tip, setTip] = useState(null);
  const max = Math.max(...grid.flat(), 1);
  const days = tList('format.weekdaysShort');
  const cell = 30;
  const left = 44;
  const top = 26;
  const width = left + HOURS.length * cell + 6;
  const height = top + 7 * cell + 6;
  const bin = (v) => Math.min(3, Math.floor(((v - 1) / max) * 4));

  const legend = (
    <span className="ramp">
      {t('viz.fewer')}
      <i>
        <b style={{ background: 'var(--seq-0)' }} />
        {RAMP.map((c) => (
          <b key={c} style={{ background: c }} />
        ))}
      </i>
      {t('viz.more')}
    </span>
  );

  return (
    <Figure title={title} id={`${id}-cap`} note={note} foot={foot} tools={<span className="row" style={{ gap: 14 }}>{legend}{button}</span>}>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('insights.day')}</th>
                {HOURS.map((h) => (
                  <th key={h} className="num">
                    {hourLabel(h)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((d, i) => (
                <tr key={d}>
                  <td>{d}</td>
                  {HOURS.map((h) => (
                    <td key={h} className="num">
                      {grid[i][h] || ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart chart-wrap" onMouseLeave={() => setTip(null)}>
          <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${id}-cap`} aria-describedby={`${id}-desc`} style={{ minWidth: 460 }}>
            <desc id={`${id}-desc`}>
              {days
                .map((d, i) => {
                  const hits = HOURS.filter((h) => grid[i][h]).map((h) => `${hourLabel(h)} ${grid[i][h]}`);
                  return hits.length ? `${d}: ${hits.join(', ')}` : null;
                })
                .filter(Boolean)
                .join('; ')}
            </desc>
            {HOURS.map((h, j) =>
              (h - 8) % 3 === 0 ? (
                <text key={h} className="axis-label" x={left + j * cell + cell / 2} y={15} textAnchor="middle">
                  {hourLabel(h)}
                </text>
              ) : null,
            )}
            {days.map((d, i) => (
              <g key={d}>
                <text x={left - 9} y={top + i * cell + cell / 2 + 4} textAnchor="end" className="label-strong">
                  {d}
                </text>
                {HOURS.map((h, j) => {
                  const v = grid[i][h] || 0;
                  return (
                    <rect
                      key={h}
                      x={left + j * cell}
                      y={top + i * cell}
                      width={cell}
                      height={cell}
                      fill={v === 0 ? 'var(--seq-0)' : RAMP[bin(v)]}
                      stroke="var(--surface)"
                      strokeWidth="1.5"
                      onMouseEnter={(e) => setTip({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY, text: tn('insights.meetingsTip', v, { label: `${d} ${hourLabel(h)}` }) })}
                    />
                  );
                })}
              </g>
            ))}
            {/* The darkest cells carry their count, so the peak is readable without hovering. */}
            {days.map((d, i) =>
              HOURS.map((h, j) => {
                const v = grid[i][h] || 0;
                if (v === 0 || bin(v) < 2) return null;
                return (
                  <text key={`${d}-${h}`} x={left + j * cell + cell / 2} y={top + i * cell + cell / 2 + 4} textAnchor="middle" style={{ fill: RAMP_INK[bin(v)], fontWeight: 700, pointerEvents: 'none' }}>
                    {v}
                  </text>
                );
              }),
            )}
          </svg>
          <Tip tip={tip} />
        </div>
      )}
    </Figure>
  );
}

/**
 * Unit chart: one square per counted thing. For small totals this beats a bar, because
 * the reader can count the squares instead of trusting an axis.
 * groups: [{label, count, note}]
 */
export function UnitChart({ title, groups, unitLabel, note, foot, color = 'var(--series-1)' }) {
  const id = useId();
  const { table, button } = useTableToggle(title);
  const data = groups.filter((g) => g.count > 0);

  return (
    <Figure title={title} id={`${id}-cap`} note={note} foot={foot || unitLabel} tools={button}>
      {table ? (
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>{t('insights.item')}</th>
                <th className="num">{t('viz.count')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((g) => (
                <tr key={g.label}>
                  <td>{g.label}</td>
                  <td className="num">{g.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div aria-describedby={`${id}-desc`}>
          <p className="visually-hidden" id={`${id}-desc`}>
            {data.map((g) => `${g.label}: ${g.count}`).join('; ')}
          </p>
          {data.map((g) => (
            <div className="unit-group" key={g.label}>
              <span className="k">{g.label}</span>
              <span className="units" aria-hidden="true">
                {Array.from({ length: g.count }, (_, i) => (
                  <b key={i} style={{ background: color }} />
                ))}
              </span>
              <span className="n">{g.count}</span>
            </div>
          ))}
        </div>
      )}
    </Figure>
  );
}
