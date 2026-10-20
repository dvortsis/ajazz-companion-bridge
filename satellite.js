/**
 * satellite.js — TCP client for the Bitfocus Companion Satellite API (default port 16622).
 *
 * One connection serves any number of decks. Per connection: wait for BEGIN, register each deck with
 * ADD-DEVICE, answer PING with PONG, receive BITMAP/BRIGHTNESS lines, send KEY-PRESS / KEY-ROTATE.
 * The link is pinged regularly; silence for linkTimeoutMs is treated as a dead link and reconnected with
 * exponential backoff.
 */
'use strict';

const net = require('net');
const { EventEmitter } = require('events');
const log = require('./log');
const { getKeysTotal } = require('./devices');

/** Parse `KEY=value KEY2="quoted value"` pairs from a protocol line. */
function parseKv(text) {
  const out = {};
  const re = /([A-Za-z_][\w-]*)=("([^"]*)"|[^\s"]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) out[m[1]] = m[3] !== undefined ? m[3] : m[2];
  return out;
}

/** Strip embedded quotes from an id before wrapping it as DEVICEID="..." */
function sanitizeId(id) {
  return id == null ? id : String(id).replace(/"/g, '').trim();
}

/** Companion key index → "row/col" text for KEY-PRESS / KEY-ROTATE lines. */
function keyToRowCol(keyIdx, keysPerRow) {
  const k = keyIdx | 0;
  return `${Math.floor(k / keysPerRow)}/${k % keysPerRow}`;
}

function buildKeyPressLine(deviceId, key, pressed, keysPerRow) {
  const rc = keyToRowCol(key, keysPerRow);
  return `KEY-PRESS DEVICEID="${sanitizeId(deviceId)}" CONTROLID="${rc}" KEY="${rc}" PRESSED=${pressed ? 1 : 0}\n`;
}

function buildKeyRotateLine(deviceId, key, directionRight, keysPerRow) {
  const rc = keyToRowCol(key, keysPerRow);
  return `KEY-ROTATE DEVICEID="${sanitizeId(deviceId)}" CONTROLID="${rc}" KEY="${rc}" DIRECTION=${directionRight ? 1 : 0}\n`;
}

/** ADD-DEVICE registration line (LF, or CRLF when requested). */
function buildAddDeviceBuffer(deviceId, profile, bitmapSize, crlf = false) {
  const line = [
    'ADD-DEVICE',
    `DEVICEID="${sanitizeId(deviceId)}"`,
    `PRODUCT_NAME="${String(profile.name).replace(/"/g, '').trim()}"`,
    `KEYS_TOTAL=${Number(getKeysTotal(profile)) || 25}`,
    `KEYS_PER_ROW=${Number(profile.keysPerRow) || 5}`,
    `BITMAPS=${bitmapSize}`,
  ].join(' ');
  return Buffer.concat([Buffer.from(line, 'ascii'), crlf ? Buffer.from([0x0d, 0x0a]) : Buffer.from([0x0a])]);
}

class SatelliteClient extends EventEmitter {
  /**
   * @param {{host: string, port: number, bitmapSize: number, pingIntervalMs: number, linkTimeoutMs: number,
   *          reconnectMinMs: number, reconnectMaxMs: number, handshakeCrlf: boolean, debugHex: boolean,
   *          beginDelayMs?: number}} opts
   */
  constructor(opts) {
    super();
    this.opts = { beginDelayMs: 600, ...opts };
    this.devices = new Map();
    this.sock = null;
    this.connected = false;
    this.beginHandled = false;
    this.lineBuf = '';
    this.lastRx = 0;
    this.pingTimer = null;
    this.retryTimer = null;
    this.retryMs = opts.reconnectMinMs;
    this.stopped = true;
  }

  start() {
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearPing();
    if (this.sock) this.sock.destroy();
  }

  /** Force a fresh connection (tray "Reconnect"). */
  reconnect() {
    this.retryMs = this.opts.reconnectMinMs;
    if (this.sock && !this.sock.destroyed) this.sock.destroy();
    else if (!this.stopped && !this.connected) {
      clearTimeout(this.retryTimer);
      this.connect();
    }
  }

  get writable() {
    return !!this.sock && !this.sock.destroyed && this.sock.writable && this.connected;
  }

  /**
   * Register a deck. `handlers`: onBitmap(keyIdx, base64), onBrightness(percent), onReady().
   * If the link is already past BEGIN the ADD-DEVICE goes out immediately.
   */
  addDevice(deviceId, profile, handlers) {
    this.devices.set(deviceId, { profile, handlers, handshakeSent: false, ok: false, held: new Set() });
    if (this.writable && this.beginHandled) this.sendAddDevice(deviceId);
  }

  /** Unregister a deck (USB unplugged): releases held keys and tells Companion to drop the surface. */
  removeDevice(deviceId) {
    const dev = this.devices.get(deviceId);
    if (!dev) return;
    this.releaseAll(deviceId);
    this.devices.delete(deviceId);
    if (this.writable && dev.handshakeSent) this.write(`REMOVE-DEVICE DEVICEID="${sanitizeId(deviceId)}"\n`);
  }

  isReady(deviceId) {
    const dev = this.devices.get(deviceId);
    return !!dev && dev.ok && this.writable;
  }

  sendKey(deviceId, key, pressed) {
    const dev = this.devices.get(deviceId);
    if (!dev || !this.isReady(deviceId)) return false;
    if (pressed) dev.held.add(key);
    else dev.held.delete(key);
    this.write(buildKeyPressLine(deviceId, key, pressed, dev.profile.keysPerRow));
    return true;
  }

  sendRotate(deviceId, key, directionRight) {
    const dev = this.devices.get(deviceId);
    if (!dev || !this.isReady(deviceId)) return false;
    this.write(buildKeyRotateLine(deviceId, key, directionRight, dev.profile.keysPerRow));
    return true;
  }

  /** Send key-up for every key currently held so Companion never sees a stuck button. */
  releaseAll(deviceId) {
    const dev = this.devices.get(deviceId);
    if (!dev) return;
    if (this.isReady(deviceId)) {
      for (const key of dev.held) this.write(buildKeyPressLine(deviceId, key, false, dev.profile.keysPerRow));
    }
    dev.held.clear();
  }

  write(data) {
    try {
      this.sock.write(data);
      log.debug('[SATELLITE TX]', JSON.stringify(String(data)));
    } catch (e) {
      log.warn('[SATELLITE] write failed:', e.message || e);
    }
  }

  sendAddDevice(deviceId) {
    const dev = this.devices.get(deviceId);
    if (!dev || dev.handshakeSent || !this.writable) return;
    dev.handshakeSent = true;
    const buf = buildAddDeviceBuffer(deviceId, dev.profile, this.opts.bitmapSize, this.opts.handshakeCrlf);
    log.info(`[HANDSHAKE] ${JSON.stringify(buf.toString('ascii'))}`);
    log.debug('[DEBUG TX HEX]', buf.toString('hex'));
    try {
      this.sock.write(buf);
    } catch (e) {
      dev.handshakeSent = false;
      log.error('[VISUAL] ADD-DEVICE write failed:', e.message || e);
    }
  }

  connect() {
    if (this.stopped) return;
    const sock = new net.Socket();
    this.sock = sock;
    sock.setNoDelay(true);
    sock.setKeepAlive(true, 1000);

    sock.on('connect', () => {
      log.info('[VISUAL] Connected.');
      this.connected = true;
      this.beginHandled = false;
      this.lineBuf = '';
      this.lastRx = Date.now();
      this.retryMs = this.opts.reconnectMinMs;
      for (const dev of this.devices.values()) {
        dev.handshakeSent = false;
        dev.ok = false;
        dev.held.clear();
      }
      this.clearPing();
      this.pingTimer = setInterval(() => this.pingTick(), this.opts.pingIntervalMs);
      this.emit('connected');
    });

    sock.on('data', (chunk) => {
      this.lastRx = Date.now();
      if (this.opts.debugHex) log.debug('[DEBUG RX HEX]', chunk.toString('hex'));
      this.appendData(chunk.toString('utf8'));
    });

    // Without a listener a refused connection is an uncaught exception; 'close' always follows and reconnects.
    sock.on('error', (e) => log.warn('[VISUAL] Socket error:', e.message || e));

    sock.on('close', () => {
      if (this.sock !== sock) return;
      const wasConnected = this.connected;
      this.connected = false;
      this.clearPing();
      this.lineBuf = '';
      for (const dev of this.devices.values()) {
        dev.ok = false;
        dev.held.clear();
      }
      if (wasConnected) this.emit('disconnected');
      if (this.stopped) return;
      log.info(`[VISUAL] Lost. Reconnecting in ${Math.round(this.retryMs / 1000)}s…`);
      this.retryTimer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 2, this.opts.reconnectMaxMs);
    });

    sock.connect(this.opts.port, this.opts.host);
  }

  pingTick() {
    if (!this.writable) return;
    if (Date.now() - this.lastRx > this.opts.linkTimeoutMs) {
      log.warn('[VISUAL] No data from Companion; dropping the connection.');
      this.sock.destroy();
      return;
    }
    try {
      this.sock.write('PING\n');
    } catch (_) {
      // The 'close' handler takes care of reconnecting.
    }
  }

  clearPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  appendData(data) {
    this.lineBuf += data;
    let offset = 0;
    let i;
    while ((i = this.lineBuf.indexOf('\n', offset)) !== -1) {
      let line = this.lineBuf.substring(offset, i);
      if (line.endsWith('\r')) line = line.slice(0, -1);
      offset = i + 1;
      this.handleLine(line);
    }
    this.lineBuf = this.lineBuf.substring(offset);
  }

  /** Find the registered device a message is addressed to (falls back to the only device). */
  routeDevice(kv) {
    if (kv.DEVICEID !== undefined) return this.devices.get(kv.DEVICEID) || null;
    return this.devices.size === 1 ? [...this.devices.values()][0] : null;
  }

  handleLine(line) {
    const firstSpace = line.indexOf(' ');
    const cmd = (firstSpace === -1 ? line : line.slice(0, firstSpace)).toUpperCase();
    const body = firstSpace === -1 ? '' : line.slice(firstSpace + 1);

    if (cmd === 'PING') {
      if (this.writable) {
        try {
          this.sock.write(`PONG ${body}\n`);
        } catch (_) {
          // Reconnect is handled by 'close'.
        }
      }
      return;
    }
    if (cmd === 'PONG') return;

    const trimmed = line.trim();
    if (!trimmed) return;

    if (cmd === 'BRIGHTNESS') {
      const kv = parseKv(body);
      const dev = this.routeDevice(kv);
      const p = parseInt(kv.VALUE, 10);
      if (dev && !Number.isNaN(p) && dev.handlers.onBrightness)
        dev.handlers.onBrightness(Math.max(0, Math.min(100, p)));
      return;
    }

    if (cmd === 'ADD-DEVICE') {
      const kv = parseKv(body);
      if (/^OK\b/i.test(body)) {
        log.info(`[COMPANION] ${trimmed}`);
        const targets = kv.DEVICEID !== undefined ? [this.devices.get(kv.DEVICEID)] : [...this.devices.values()];
        for (const dev of targets) {
          if (!dev) continue;
          dev.ok = true;
          if (dev.handlers.onReady) dev.handlers.onReady();
        }
      } else if (/^ERROR\b/i.test(body)) {
        log.error(`[COMPANION] ${trimmed}`);
      }
      return;
    }

    if (cmd === 'BEGIN') {
      if (this.beginHandled) return;
      this.beginHandled = true;
      log.info(`[VISUAL] BEGIN received; registering ${this.devices.size} device(s) in ${this.opts.beginDelayMs}ms…`);
      setTimeout(() => {
        for (const id of this.devices.keys()) this.sendAddDevice(id);
      }, this.opts.beginDelayMs);
      return;
    }

    if (trimmed.includes('BITMAP=')) {
      const kv = parseKv(body);
      const keyIdx = parseInt(kv.KEY, 10);
      const dev = this.routeDevice(kv);
      if (dev && !Number.isNaN(keyIdx) && kv.BITMAP !== undefined && dev.handlers.onBitmap) {
        dev.handlers.onBitmap(keyIdx, kv.BITMAP);
      }
      return;
    }

    if (trimmed.includes('ERROR')) log.error(`[COMPANION] ${trimmed}`);
    else if (trimmed.length < 200) log.debug(`[COMPANION] ${trimmed}`);
  }
}

module.exports = {
  SatelliteClient,
  parseKv,
  sanitizeId,
  keyToRowCol,
  buildKeyPressLine,
  buildKeyRotateLine,
  buildAddDeviceBuffer,
};
