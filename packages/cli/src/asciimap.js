import { DFW_BOUNDS, nextMeetingFor, daysBetween, formatDate, formatTime, t } from '@agora/core';
import { c } from './ui.js';

/**
 * Draw the DFW cities on a character grid. Each city is a letter; the legend below
 * lists the city and its next meeting. A user location renders as '@'.
 */
export function renderAsciiMap(cities, { today, you = null, width = 72, height = 24 } = {}) {
  const grid = Array.from({ length: height }, () => Array(width).fill(' '));
  const minLng = DFW_BOUNDS.minLng + 0.05;
  const maxLng = DFW_BOUNDS.maxLng - 0.05;
  const minLat = DFW_BOUNDS.minLat + 0.05;
  const maxLat = DFW_BOUNDS.maxLat - 0.15;

  const project = (p) => {
    const col = Math.round(((p.lng - minLng) / (maxLng - minLng)) * (width - 1));
    const row = Math.round(((maxLat - p.lat) / (maxLat - minLat)) * (height - 1));
    return { col: clamp(col, 0, width - 1), row: clamp(row, 0, height - 1) };
  };

  const place = (p, ch) => {
    let { col, row } = project(p);
    let tries = 0;
    while (grid[row][col] !== ' ' && tries < 8) {
      col = Math.min(width - 1, col + 1);
      if (grid[row][col] !== ' ' && tries % 3 === 2) row = Math.min(height - 1, row + 1);
      tries += 1;
    }
    grid[row][col] = ch;
    return { col, row };
  };

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const sorted = [...cities].sort((a, b) => a.name.localeCompare(b.name));
  const legend = [];
  sorted.forEach((city, i) => {
    const ch = letters[i % letters.length];
    const next = nextMeetingFor(city, today);
    const days = next ? daysBetween(today, next.date) : null;
    const color = days == null ? c.gray : days <= 3 ? c.green : days <= 10 ? c.yellow : c.blue;
    place({ lat: city.cityHall.lat, lng: city.cityHall.lng }, color(ch));
    legend.push({ ch, color, name: city.name, next: next ? `${formatDate(next.date)} ${formatTime(next.time)}` : t('cli.noMeetingFound'), days });
  });
  if (you) place(you, c.bold(c.magenta('@')));

  const border = c.gray('+' + '-'.repeat(width) + '+');
  const lines = [border, ...grid.map((row) => c.gray('|') + row.join('') + c.gray('|')), border];
  lines.unshift(c.gray(`  N`.padEnd(width + 2)));
  const legendLines = [];
  const cols = 3;
  const colWidth = 30;
  for (let i = 0; i < legend.length; i += cols) {
    const chunk = legend.slice(i, i + cols);
    legendLines.push(chunk.map((l) => `${l.color(l.ch)} ${l.name}`.padEnd(colWidth + (l.color(l.ch).length - 1))).join(''));
  }
  const key = `${c.green('*')} ${t('cli.within3')}   ${c.yellow('*')} ${t('cli.within10')}   ${c.blue('*')} ${t('cli.later')}   ${you ? c.magenta('@') + ' ' + t('cli.you') : ''}`;
  return [...lines, '', key, '', ...legendLines].join('\n');
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
