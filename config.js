/**
 * config.js — Every setting the bridge reads from the environment (`.env`), parsed and validated in one place.
 *
 * Unknown AKP05_* / COMPANION_* / HID_* / SATELLITE_* / BRIDGE_* variables are reported once at startup so typos
 * and retired settings do not fail silently.
 */
'use strict';

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const warnings = [];

function num(name, fallback, { min = -Infinity, max = Infinity, int = false } = {}) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = int ? parseInt(raw, 10) : parseFloat(raw);
  if (Number.isNaN(n) || n < min || n > max) {
    warnings.push(`${name}="${raw}" is invalid (expected ${min}..${max}); using ${fallback}`);
    return fallback;
  }
  return n;
}

function flag(name) {
  const v = process.env[name];
  return v === '1' || (typeof v === 'string' && v.toLowerCase() === 'true');
}

function str(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function imageSize() {
  const n = num('AKP05_IMAGE_SIZE', 112, { int: true });
  if (n === 72 || n === 112) return n;
  warnings.push(`AKP05_IMAGE_SIZE="${n}" must be 72 or 112; using 112`);
  return 112;
}

const config = {
  host: str('COMPANION_HOST', '127.0.0.1'),
  port: num('COMPANION_PORT', 16622, { min: 1, max: 65535, int: true }),

  /** Milliseconds between consecutive 1025-byte HID reports (0 = max throughput). */
  hidWriteDelayMs: num(
    process.env.HID_WRITE_DELAY_MS !== undefined ? 'HID_WRITE_DELAY_MS' : 'AKP05_HID_WRITE_DELAY_MS',
    0,
    { min: 0 }
  ),
  imageSize: imageSize(),
  jpegQuality: num('AKP05_JPEG_QUALITY', 75, { min: 40, max: 100, int: true }),
  stripJpegQuality: num('AKP05_STRIP_JPEG_QUALITY', num('AKP05_JPEG_QUALITY', 75, { min: 40, max: 100, int: true }), {
    min: 40,
    max: 100,
    int: true,
  }),
  /** Extra black margin (px) kept between the strip edge and the outer icons. 0 = flush with the edge. */
  stripEdgePadding: num('AKP05_STRIP_EDGE_PADDING', 0, { min: 0, max: 200, int: true }),
  /** Collect strip bitmaps arriving within this window into one JPEG upload. */
  stripBatchMs: num('AKP05_STRIP_BATCH_MS', 20, { min: 0, max: 500 }),

  keepaliveMs: num('BRIDGE_KEEPALIVE_MS', 1000, { min: 250, int: true }),
  pingIntervalMs: num('BRIDGE_PING_INTERVAL_MS', 1000, { min: 100, int: true }),
  /** No traffic from Companion for this long → treat the link as dead and reconnect. */
  linkTimeoutMs: num('BRIDGE_LINK_TIMEOUT_MS', 10000, { min: 1000, int: true }),
  reconnectMinMs: 3000,
  reconnectMaxMs: num('BRIDGE_RECONNECT_MAX_MS', 30000, { min: 3000, int: true }),
  hidScanMs: num('BRIDGE_HID_SCAN_MS', 5000, { min: 1000, int: true }),

  /** Synthetic key-up delay for touch zones, swipes and encoder pushes. */
  autoUpMs: num('BRIDGE_AUTO_UP_MS', 50, { min: 0, int: true }),
  swipeSwap: flag('BRIDGE_SWIPE_SWAP'),
  /** Multiply rapid same-direction encoder ticks (0/1 = off). */
  encoderAccel: num('BRIDGE_ENCODER_ACCEL', 1, { min: 1, max: 10, int: true }),
  encoderAccelWindowMs: num('BRIDGE_ENCODER_ACCEL_WINDOW_MS', 80, { min: 10, int: true }),
  /** Brightness (0-100) used when idle; 0 = off. */
  idleDimPercent: num('BRIDGE_IDLE_DIM_PERCENT', 0, { min: 0, max: 100, int: true }),
  /** Holding a dial push and turning sends the turn to an extra Companion row (row 4). */
  shiftRotate: flag('BRIDGE_SHIFT_ROTATE'),
  /** Dial pushes send real press/release (long-press) instead of a synthetic click. */
  dialPushHold: flag('BRIDGE_DIAL_PUSH_HOLD'),
  /** Blank the displays after this many minutes without input (0 = never). */
  idleOffMinutes: num('BRIDGE_IDLE_OFF_MINUTES', 0, { min: 0 }),

  logLevel: str('LOG_LEVEL', 'info').toLowerCase(),
  logDir: str('LOG_DIR', __dirname),
  logMaxBytes: num('LOG_MAX_BYTES', 5 * 1024 * 1024, { min: 64 * 1024, int: true }),
  logBackups: num('LOG_BACKUPS', 3, { min: 0, max: 20, int: true }),

  handshakeCrlf: flag('SATELLITE_HANDSHAKE_CRLF'),
  debugHex: flag('SATELLITE_DEBUG_HEX'),
  noTray: flag('BRIDGE_NO_TRAY'),
};

if (!['error', 'warn', 'info', 'debug'].includes(config.logLevel)) {
  warnings.push(`LOG_LEVEL="${config.logLevel}" must be error|warn|info|debug; using info`);
  config.logLevel = 'info';
}

const KNOWN = new Set([
  'COMPANION_HOST',
  'COMPANION_PORT',
  'HID_WRITE_DELAY_MS',
  'AKP05_HID_WRITE_DELAY_MS',
  'AKP05_IMAGE_SIZE',
  'AKP05_JPEG_QUALITY',
  'AKP05_STRIP_JPEG_QUALITY',
  'AKP05_STRIP_EDGE_PADDING',
  'AKP05_STRIP_BATCH_MS',
  'BRIDGE_KEEPALIVE_MS',
  'BRIDGE_PING_INTERVAL_MS',
  'BRIDGE_LINK_TIMEOUT_MS',
  'BRIDGE_RECONNECT_MAX_MS',
  'BRIDGE_HID_SCAN_MS',
  'BRIDGE_AUTO_UP_MS',
  'BRIDGE_SWIPE_SWAP',
  'BRIDGE_ENCODER_ACCEL',
  'BRIDGE_ENCODER_ACCEL_WINDOW_MS',
  'BRIDGE_IDLE_OFF_MINUTES',
  'BRIDGE_IDLE_DIM_PERCENT',
  'BRIDGE_SHIFT_ROTATE',
  'BRIDGE_DIAL_PUSH_HOLD',
  'BRIDGE_NO_TRAY',
  'LOG_LEVEL',
  'LOG_DIR',
  'LOG_MAX_BYTES',
  'LOG_BACKUPS',
  'SATELLITE_HANDSHAKE_CRLF',
  'SATELLITE_DEBUG_HEX',
]);

for (const key of Object.keys(process.env)) {
  if (/^(AKP05|COMPANION|HID|SATELLITE|BRIDGE|LOG)_/.test(key) && !KNOWN.has(key)) {
    warnings.push(`${key} is not a recognised setting and is ignored`);
  }
}

config.warnings = warnings;

module.exports = config;
