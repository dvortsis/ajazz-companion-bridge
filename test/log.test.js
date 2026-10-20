'use strict';

// Runs in its own process (node --test isolates files), so env set here is read by config.js on first require.
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ajazz-log-'));
process.env.LOG_DIR = dir;
process.env.LOG_MAX_BYTES = String(64 * 1024);
process.env.LOG_BACKUPS = '2';
process.env.LOG_LEVEL = 'info';
process.env.COMPANION_PORT = 'abc';
process.env.AKP05_TOUCH_KEYS = '7';
process.env.HID_WRITE_DELAY_MS = '3';
fs.writeFileSync(path.join(dir, 'bridge.log'), 'x'.repeat(70 * 1024));

const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../config');
const log = require('../log');

test('an oversized existing log is rotated at startup and files stay capped', () => {
  assert.ok(fs.existsSync(path.join(dir, 'bridge.log.1')), 'old 70 KB log became .1');
  for (let i = 0; i < 3000; i++) log.info('line', i, 'y'.repeat(60));
  const files = fs.readdirSync(dir).sort();
  assert.deepEqual(files, ['bridge.log', 'bridge.log.1', 'bridge.log.2']);
  for (const f of files) assert.ok(fs.statSync(path.join(dir, f)).size <= 64 * 1024 + 200, f);
});

test('debug lines are dropped at info level', () => {
  log.debug('secret-debug-marker');
  assert.ok(!fs.readFileSync(path.join(dir, 'bridge.log'), 'utf8').includes('secret-debug-marker'));
});

test('config falls back on invalid values and reports ignored settings', () => {
  assert.equal(config.port, 16622);
  assert.equal(config.stripEdgePadding, 8, 'strip icons sit 8 px in from the edges by default');
  assert.equal(config.hidWriteDelayMs, 3);
  assert.ok(config.warnings.some((w) => w.includes('COMPANION_PORT')));
  assert.ok(config.warnings.some((w) => w.includes('AKP05_TOUCH_KEYS')));
});

test('BRIDGE_KEY_BRIGHTNESS parses valid entries and reports bad ones', () => {
  process.env.BRIDGE_KEY_BRIGHTNESS = '0:60, 5:80,x:1,7:150';
  delete require.cache[require.resolve('../config')];
  const cfg = require('../config');
  assert.deepEqual(
    [...cfg.keyDim],
    [
      [0, 60],
      [5, 80],
    ]
  );
  assert.equal(cfg.warnings.filter((w) => w.includes('BRIDGE_KEY_BRIGHTNESS')).length, 2);
});

test('tray defaults off on headless Linux, stays on elsewhere, and BRIDGE_NO_TRAY overrides', () => {
  const real = Object.getOwnPropertyDescriptor(process, 'platform');
  const load = (platform, env) => {
    Object.defineProperty(process, 'platform', { value: platform });
    for (const k of ['DISPLAY', 'WAYLAND_DISPLAY', 'BRIDGE_NO_TRAY']) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[require.resolve('../config')];
    return require('../config').noTray;
  };
  try {
    assert.equal(load('linux', {}), true, 'no display server');
    assert.equal(load('linux', { DISPLAY: ':0' }), false);
    assert.equal(load('linux', { WAYLAND_DISPLAY: 'wayland-0' }), false);
    assert.equal(load('linux', { BRIDGE_NO_TRAY: '0' }), false, 'explicit 0 wins');
    assert.equal(load('win32', {}), false);
    assert.equal(load('darwin', {}), false);
    assert.equal(load('win32', { BRIDGE_NO_TRAY: '1' }), true);
  } finally {
    Object.defineProperty(process, 'platform', real);
  }
});
