/**
 * lock.js — Single-instance guard. Two bridges would fight over the same HID device.
 */
'use strict';

const fs = require('fs');

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

/** Returns true if the lock was taken; false if another live process holds it. */
function acquire(file, pid = process.pid) {
  try {
    const other = parseInt(fs.readFileSync(file, 'utf8'), 10);
    if (other && other !== pid && isAlive(other)) return false;
  } catch (_) {
    // No lock file (or unreadable): take it.
  }
  fs.writeFileSync(file, String(pid));
  return true;
}

function release(file, pid = process.pid) {
  try {
    if (parseInt(fs.readFileSync(file, 'utf8'), 10) === pid) fs.rmSync(file, { force: true });
  } catch (_) {
    // Already gone.
  }
}

module.exports = { acquire, release, isAlive };
