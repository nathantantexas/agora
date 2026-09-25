/**
 * Put the on-device vision models where the web app can serve them from its own origin.
 *
 * Rehearse tracks eye contact, posture, and hands with two MediaPipe models (Apache 2.0).
 * They are large binaries, so they are not committed: this script downloads them into
 * packages/web/public/models/ (gitignored) and copies the matching WebAssembly runtime out
 * of node_modules. The deploy runs it before the build; locally run `npm run models` once.
 * Without the files the app still works, and Rehearse simply offers voice analysis only.
 *
 * Usage: node scripts/fetch-models.mjs
 */
import { mkdirSync, existsSync, statSync, copyFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'packages', 'web', 'public', 'models');
const wasmSrc = path.join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const wasmDir = path.join(outDir, 'wasm');

const MODELS = [
  { file: 'face_landmarker.task', url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task' },
  { file: 'pose_landmarker_lite.task', url: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task' },
];

mkdirSync(wasmDir, { recursive: true });

for (const m of MODELS) {
  const dest = path.join(outDir, m.file);
  const head = await fetch(m.url, { method: 'HEAD' });
  if (!head.ok) throw new Error(`${m.file}: HTTP ${head.status} from ${m.url}`);
  const expected = Number(head.headers.get('content-length') || 0);
  if (existsSync(dest) && expected && statSync(dest).size === expected) {
    console.log(`${m.file}: already present (${Math.round(expected / 1024)} KB)`);
    continue;
  }
  const res = await fetch(m.url);
  if (!res.ok) throw new Error(`${m.file}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`${m.file}: downloaded ${Math.round(buf.length / 1024)} KB`);
}

if (!existsSync(wasmSrc)) throw new Error(`WebAssembly runtime not found at ${wasmSrc}. Run npm install first.`);
let copied = 0;
for (const f of readdirSync(wasmSrc)) {
  if (!/\.(js|wasm)$/.test(f)) continue;
  copyFileSync(path.join(wasmSrc, f), path.join(wasmDir, f));
  copied += 1;
}
console.log(`runtime: copied ${copied} files to ${path.relative(root, wasmDir)}`);
writeFileSync(path.join(outDir, 'LICENSE.txt'), 'The model files and WebAssembly runtime in this folder are from MediaPipe, Copyright Google LLC, distributed under the Apache License 2.0.\nhttps://github.com/google-ai-edge/mediapipe\n');
