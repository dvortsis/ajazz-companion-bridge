/**
 * log.js — Console + rotating log file with levels.
 *
 * bridge.log is capped at LOG_MAX_BYTES and rotated to bridge.log.1 … .N (LOG_BACKUPS). Per-frame and
 * protocol chatter is logged at `debug` and is off by default (set LOG_LEVEL=debug).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const util = require('util');
const config = require('./config');

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const threshold = LEVELS[config.logLevel];
const file = path.join(config.logDir, 'bridge.log');

let size = 0;

function rotate() {
  try {
    for (let i = config.logBackups; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i - 1}`;
      const to = `${file}.${i}`;
      if (!fs.existsSync(from)) continue;
      if (i === config.logBackups && fs.existsSync(to)) fs.rmSync(to, { force: true });
      fs.renameSync(from, to);
    }
    if (config.logBackups === 0) fs.rmSync(file, { force: true });
  } catch (_) {
    // Rotation is best-effort; keep logging even if the file is locked.
  }
  size = 0;
}

try {
  size = fs.existsSync(file) ? fs.statSync(file).size : 0;
  if (size > config.logMaxBytes) rotate();
} catch (_) {
  size = 0;
}

function write(level, args) {
  if (LEVELS[level] > threshold) return;
  const msg = util.format(...args);
  const line = `[${new Date().toISOString()}] ${level.toUpperCase()}: ${msg}\n`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(msg);
  try {
    if (size + line.length > config.logMaxBytes) rotate();
    fs.appendFileSync(file, line);
    size += line.length;
  } catch (_) {
    // Never let logging take the bridge down.
  }
}

module.exports = {
  file,
  error: (...a) => write('error', a),
  warn: (...a) => write('warn', a),
  info: (...a) => write('info', a),
  debug: (...a) => write('debug', a),
  /** Log a message that originated in another thread. */
  fromWorker: (level, msg) => write(LEVELS[level] === undefined ? 'info' : level, [msg]),
  isDebug: threshold >= LEVELS.debug,
};
