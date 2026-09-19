/**
 * Generate PWA icons (PNG) without any image library: the Agora stoa, a limestone
 * colonnade on black-figure ink, rendered with 4x supersampling and encoded with
 * Node's zlib. The geometry matches packages/web/public/favicon.svg exactly.
 *
 * Usage: node scripts/make-icons.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, '..', 'packages', 'web', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const INK = [23, 21, 15];
const STONE = [242, 239, 231];

function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c;
  const table = [];
  for (let n = 0; n < 256; n += 1) {
    c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

/**
 * The stoa as axis-aligned bars, in the favicon's 64 unit grid: cornice, architrave,
 * three columns, and the stylobate they stand on.
 */
const BARS = [
  [6, 13, 52, 5],
  [10, 19, 44, 4],
  [15, 25, 7, 20],
  [29, 25, 7, 20],
  [43, 25, 7, 20],
  [6, 46, 52, 5],
].map(([x, y, w, h]) => [x / 64, y / 64, (x + w) / 64, (y + h) / 64]);

function insideStoa(x, y) {
  for (const [x0, y0, x1, y1] of BARS) if (x >= x0 && x < x1 && y >= y0 && y < y1) return true;
  return false;
}

function render(size, { maskable = false } = {}) {
  const ss = 4;
  const rgba = Buffer.alloc(size * size * 4);
  // A maskable icon has to survive a circular crop, so the glyph is inset.
  const pad = maskable ? 0.14 : 0.04;
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const acc = [0, 0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const x = (px + (sx + 0.5) / ss) / size;
          const y = (py + (sy + 0.5) / ss) / size;
          const gx = (x - pad) / (1 - 2 * pad);
          const gy = (y - pad) / (1 - 2 * pad);
          const color = gx >= 0 && gx < 1 && gy >= 0 && gy < 1 && insideStoa(gx, gy) ? STONE : INK;
          acc[0] += color[0];
          acc[1] += color[1];
          acc[2] += color[2];
          acc[3] += 255;
        }
      }
      const n = ss * ss;
      const i = (py * size + px) * 4;
      rgba[i] = Math.round(acc[0] / n);
      rgba[i + 1] = Math.round(acc[1] / n);
      rgba[i + 2] = Math.round(acc[2] / n);
      rgba[i + 3] = Math.round(acc[3] / n);
    }
  }
  return encodePng(size, size, rgba);
}

writeFileSync(path.join(outDir, 'icon-192.png'), render(192));
writeFileSync(path.join(outDir, 'icon-512.png'), render(512));
writeFileSync(path.join(outDir, 'maskable-512.png'), render(512, { maskable: true }));
console.log(`Wrote icons to ${outDir}`);
