#!/usr/bin/env node
import { run } from '../src/main.js';

run(process.argv.slice(2)).then(
  (code) => process.exit(code || 0),
  (err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  },
);
