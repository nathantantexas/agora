#!/usr/bin/env node
import { run } from '../src/main.js';

/*
 * Set the exit code rather than calling process.exit(). On Linux and macOS a write to a
 * pipe is asynchronous, so exiting immediately truncates anything still buffered, which
 * silently cuts off large output such as `agora cities --json | jq` or a redirect to a
 * file. Letting the process end on its own lets stdout drain first.
 */
run(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code || 0;
  },
  (err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exitCode = 1;
  },
);
