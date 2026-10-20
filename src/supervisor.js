/**
 * supervisor.js — Keeps the bridge running: restarts index.js if it crashes, stops when it exits cleanly
 * (tray Quit, or "already running"). Restart delay backs off if it keeps failing quickly.
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const { ROOT } = require('./paths');

const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 60000;
const HEALTHY_RUN_MS = 60000;

let delay = MIN_DELAY_MS;

function run() {
  const started = Date.now();
  const child = spawn(process.execPath, [path.join(__dirname, 'index.js')], { stdio: 'inherit', cwd: ROOT });
  child.on('exit', (code) => {
    if (code === 0) process.exit(0);
    delay = Date.now() - started > HEALTHY_RUN_MS ? MIN_DELAY_MS : Math.min(delay * 2, MAX_DELAY_MS);
    console.error(`[SUPERVISOR] bridge exited with code ${code}; restarting in ${delay / 1000}s`);
    setTimeout(run, delay);
  });
}

run();
