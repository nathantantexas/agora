/**
 * Start the API server and the Vite dev server together.
 * Usage: npm run dev   (then open http://localhost:5173)
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const webDir = path.join(root, 'packages', 'web');
const require = createRequire(path.join(webDir, 'package.json'));

if (!existsSync(path.join(root, 'data', 'cities.json'))) {
  const build = spawn(process.execPath, [path.join(root, 'scripts', 'build-data.mjs')], { stdio: 'inherit' });
  await new Promise((resolve) => build.on('exit', resolve));
}

// Vite's package "exports" hides bin/vite.js, so walk up from the resolved entry to the package root.
let viteBin;
try {
  let dir = path.dirname(require.resolve('vite'));
  while (dir !== path.dirname(dir) && !existsSync(path.join(dir, 'bin', 'vite.js'))) dir = path.dirname(dir);
  viteBin = path.join(dir, 'bin', 'vite.js');
  if (!existsSync(viteBin)) throw new Error('bin not found');
} catch {
  console.error('Vite is not installed. Run "npm install" first.');
  process.exit(1);
}

const children = [
  spawn(process.execPath, ['--watch', path.join(root, 'packages', 'server', 'src', 'index.js')], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [viteBin, '--host'], { cwd: webDir, stdio: 'inherit', env: process.env }),
];

const stop = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const child of children) child.on('exit', (code) => (code ? stop() : null));

console.log('\nAgora dev: API on http://localhost:8787, web on http://localhost:5173 (Ctrl+C stops both)\n');
