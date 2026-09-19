/** Terminal styling helpers. Honors NO_COLOR and non-TTY output. */
const enabled = !process.env.NO_COLOR && process.env.FORCE_COLOR !== '0' && (process.stdout.isTTY || process.env.FORCE_COLOR);

const wrap = (open, close) => (s) => (enabled ? `[${open}m${s}[${close}m` : String(s));

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  italic: wrap(3, 23),
  underline: wrap(4, 24),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
  bgBlue: wrap(44, 49),
};

export function heading(text) {
  return `\n${c.bold(c.cyan(text))}\n${c.gray('-'.repeat(Math.min(72, visibleLength(text))))}`;
}

export function label(k, v) {
  return `${c.gray(k.padEnd(14))} ${v}`;
}

export function bullet(text, indent = 2) {
  return `${' '.repeat(indent)}${c.cyan('•')} ${text}`;
}

export function visibleLength(s) {
  return String(s).replace(/\[[0-9;]*m/g, '').length;
}

function padEnd(s, width) {
  const len = visibleLength(s);
  return len >= width ? s : s + ' '.repeat(width - len);
}

/** Render rows as an aligned table. `columns` is [{key, title, width?, align?}]. */
export function table(rows, columns) {
  if (!rows.length) return c.dim('  (nothing to show)');
  const widths = columns.map((col) => {
    const cells = rows.map((r) => visibleLength(String(r[col.key] ?? '')));
    const natural = Math.max(visibleLength(col.title), ...cells);
    return Math.min(col.width || natural, natural);
  });
  const line = (cells) => '  ' + cells.map((cell, i) => padEnd(truncate(String(cell ?? ''), widths[i]), widths[i])).join('  ');
  const out = [c.bold(line(columns.map((col) => col.title))), c.gray(line(widths.map((w) => '-'.repeat(w))))];
  for (const r of rows) out.push(line(columns.map((col) => r[col.key])));
  return out.join('\n');
}

export function truncate(s, width) {
  if (visibleLength(s) <= width) return s;
  const plain = String(s).replace(/\[[0-9;]*m/g, '');
  return `${plain.slice(0, Math.max(0, width - 1))}…`;
}

/** Simple horizontal bar for text charts. */
export function bar(value, max, width = 24) {
  const n = max > 0 ? Math.round((value / max) * width) : 0;
  return c.blue('█'.repeat(n)) + c.gray('░'.repeat(Math.max(0, width - n)));
}

export function wrapText(text, width = 76, indent = 0) {
  const pad = ' '.repeat(indent);
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) {
      lines.push(pad + line.trim());
      line = w;
    } else line = `${line} ${w}`;
  }
  if (line.trim()) lines.push(pad + line.trim());
  return lines.join('\n');
}
