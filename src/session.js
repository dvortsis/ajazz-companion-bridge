/**
 * session.js — One open deck: its HID handle, outgoing USB queue, image pipeline and input handling.
 *
 * Outbound: Companion bitmap → (worker) JPEG → BAT/payload/STP reports → USB, strictly one image at a time.
 * Inbound:  USB report → parser.js → Companion key press / rotate, via the shared SatelliteClient.
 * A session is disposable: when the USB device errors out it closes itself, tells Companion to remove the
 * surface, and emits 'closed'; the device manager opens a fresh session when the deck shows up again.
 */
'use strict';

const { EventEmitter } = require('events');
const log = require('./log');
const { createProtocol } = require('./protocol');
const { parseHardwareEvent } = require('./parser');
const { grid, isStatelessButtonEvent, getDrawSlot, companionKeyForEvent, behaviorFor } = require('./devices');

/** Consecutive failed USB writes before the device is considered gone. */
const MAX_WRITE_FAILURES = 3;
/** One retry for a bitmap whose worker thread died mid-job. */
const MAX_IMAGE_RETRIES = 1;

const SWIPE_SWAP = { swipe_left: 'swipe_right', swipe_right: 'swipe_left' };

class DeckSession extends EventEmitter {
  /**
   * @param {object} o
   * @param {{path: string}} o.hidInfo   node-hid enumeration entry
   * @param {object} o.profile           entry from devices.js
   * @param {string} o.deviceId          Companion DEVICEID for this deck
   * @param {import('./satellite').SatelliteClient} o.satellite
   * @param {import('./worker-client').WorkerClient} o.worker
   * @param {object} o.config
   * @param {(path: string) => any} o.openHid
   */
  constructor({ hidInfo, profile, deviceId, satellite, worker, config, openHid }) {
    super();
    this.hidInfo = hidInfo;
    this.profile = profile;
    this.layout = profile.layout;
    this.deviceId = deviceId;
    this.satellite = satellite;
    this.worker = worker;
    this.config = config;
    this.openHid = openHid;
    this.protocol = createProtocol(profile.packetPayload);

    this.dev = null;
    this.closed = false;
    this.brightness = 100;
    this.asleep = false;
    this.lastInput = Date.now();

    this.writeQueue = [];
    this.draining = false;
    this.writeFailures = 0;

    this.pending = new Map();
    this.lastQueued = new Map();
    this.busy = false;
    this.pumpTimer = null;
    this.retries = new Map();

    this.keepaliveTimer = null;
    this.idleTimer = null;
    this.autoUpTimers = new Set();
    this.encoderState = new Map();
    this.dialsHeld = new Map();
    this.touchHeld = new Map();
    this.warnedUnmapped = new Set();
  }

  /** Open the device, run its init sequence and register it with Companion. Returns false on failure. */
  start() {
    try {
      this.dev = this.openHid(this.hidInfo.path);
    } catch (e) {
      log.error(`[HID] Open failed (${this.deviceId}):`, e.message || e);
      return false;
    }
    log.info(
      `[HID] Secured ${this.profile.name} as ${this.deviceId} (VID ${this.profile.vid.toString(16)} PID ${this.profile.pid.toString(16)})`
    );
    if (!this.profile.tested) {
      log.warn(`[HID] ${this.profile.name} is experimental: its profile has not been verified on real hardware.`);
    }

    try {
      for (const seq of this.profile.initSequence) this.dev.write(this.protocol.buildExtendedReport(seq));
    } catch (e) {
      log.error(`[HID] Init failed (${this.deviceId}):`, e.message || e);
      this.teardown();
      return false;
    }

    this.dev.on('data', (d) => this.onHidData(d));
    this.dev.on('error', (err) => this.fail(`device error: ${err && err.message != null ? err.message : err}`));

    this.keepaliveTimer = setInterval(() => this.keepalive(), this.config.keepaliveMs);
    if (this.config.idleOffMinutes > 0) {
      this.idleTimer = setInterval(() => this.idleCheck(), 10000);
    }

    this.satellite.addDevice(this.deviceId, this.profile, {
      onBitmap: (key, b64) => this.onBitmap(key, b64),
      onBrightness: (p) => {
        this.brightness = p;
      },
    });
    return true;
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------

  fail(reason) {
    if (this.closed) return;
    log.error(`[HID] ${this.deviceId} lost: ${reason}`);
    this.close();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.satellite.removeDevice(this.deviceId);
    this.teardown();
    this.emit('closed');
  }

  teardown() {
    clearInterval(this.keepaliveTimer);
    clearInterval(this.idleTimer);
    clearTimeout(this.pumpTimer);
    for (const t of this.autoUpTimers) clearTimeout(t);
    this.autoUpTimers.clear();
    for (const t of this.touchHeld.values()) clearTimeout(t);
    this.touchHeld.clear();
    const queued = this.writeQueue.splice(0);
    for (const item of queued) if (item.onLast) item.onLast();
    this.pending.clear();
    try {
      if (this.dev) this.dev.close();
    } catch (e) {
      log.warn('[HID] close:', e.message || e);
    }
    this.dev = null;
    if (this.worker.worker) this.worker.request({ reset: true, deviceId: this.deviceId }).catch(() => {});
  }

  // ---- outgoing USB ---------------------------------------------------------------------------------------

  enqueue(packs, onComplete) {
    const n = packs.length;
    for (let i = 0; i < n; i++) {
      this.writeQueue.push({ buf: packs[i], onLast: i === n - 1 ? onComplete : null });
    }
    if (!this.draining) {
      this.draining = true;
      void this.drain();
    }
  }

  async drain() {
    try {
      while (this.dev && this.writeQueue.length > 0) {
        const item = this.writeQueue.shift();
        try {
          this.dev.write(item.buf);
          this.writeFailures = 0;
        } catch (e) {
          log.error('[HID] write:', e.message || e);
          if (++this.writeFailures >= MAX_WRITE_FAILURES) {
            if (item.onLast) item.onLast();
            this.fail('repeated write failures');
            return;
          }
        }
        if (item.onLast) {
          try {
            item.onLast();
          } catch (e) {
            log.error('[HID] callback:', e.message || e);
          }
        }
        if (this.writeQueue.length > 0) {
          await new Promise((r) =>
            this.config.hidWriteDelayMs > 0 ? setTimeout(r, this.config.hidWriteDelayMs) : setImmediate(r)
          );
        }
      }
    } finally {
      this.draining = false;
    }
  }

  effectiveBrightness() {
    return this.asleep ? this.config.idleDimPercent || 0 : this.brightness;
  }

  keepalive() {
    if (!this.dev || this.writeQueue.length > 0) return;
    setImmediate(() => {
      if (!this.dev || this.writeQueue.length > 0) return;
      try {
        this.dev.write(this.protocol.buildBrightnessReport(this.effectiveBrightness()));
        this.writeFailures = 0;
      } catch (e) {
        log.error('[HID] keepalive LIG:', e.message || e);
        if (++this.writeFailures >= MAX_WRITE_FAILURES) this.fail('repeated write failures');
      }
    });
  }

  idleCheck() {
    if (this.asleep || Date.now() - this.lastInput < this.config.idleOffMinutes * 60000) return;
    this.asleep = true;
    log.info(
      `[IDLE] ${this.deviceId}: displays ` +
        (this.effectiveBrightness() > 0 ? `dimmed to ${this.effectiveBrightness()}%` : 'off')
    );
    this.enqueue([this.protocol.buildBrightnessReport(this.effectiveBrightness())], null);
  }

  wake() {
    this.lastInput = Date.now();
    if (!this.asleep) return;
    this.asleep = false;
    log.info(`[IDLE] ${this.deviceId}: displays on`);
    this.enqueue([this.protocol.buildBrightnessReport(this.brightness)], null);
  }

  // ---- images ---------------------------------------------------------------------------------------------

  onBitmap(keyIdx, base64) {
    const slot = getDrawSlot(this.layout, keyIdx);
    if (slot === null) return;
    if (this.lastQueued.get(keyIdx) === base64) return;
    log.debug(`[VISUAL] ${this.deviceId}: key ${keyIdx} → slot ${slot}`);
    this.lastQueued.set(keyIdx, base64);
    this.pending.set(keyIdx, base64);
    this.retries.delete(keyIdx);
    const isStrip = this.layout.stripZoneBySlot.has(slot);
    if (isStrip && this.config.stripBatchMs > 0) {
      if (!this.pumpTimer) {
        this.pumpTimer = setTimeout(() => {
          this.pumpTimer = null;
          this.pump();
        }, this.config.stripBatchMs);
      }
    } else {
      this.pump();
    }
  }

  /** Build the worker job for the next pending bitmap and ship the result to the device. */
  pump() {
    if (this.busy || this.closed || this.pending.size === 0 || this.pumpTimer) return;
    this.busy = true;

    const [keyIdx, base64] = this.pending.entries().next().value;
    this.pending.delete(keyIdx);
    const slot = getDrawSlot(this.layout, keyIdx);
    const zone = this.layout.stripZoneBySlot.get(slot);
    const strip = this.layout.strip;

    const job = { deviceId: this.deviceId, base64, slot };
    const dim = this.config.keyDim && this.config.keyDim.get(keyIdx);
    if (dim !== undefined) job.dim = dim;
    if (zone !== undefined) {
      const othersPending = [...this.pending.keys()].some((k) =>
        this.layout.stripZoneBySlot.has(getDrawSlot(this.layout, k))
      );
      job.render = !othersPending;
      job.strip = {
        zone,
        geometry: { width: strip.width, height: strip.height, iconSize: strip.iconSize, zones: strip.zones },
        padding: this.config.stripEdgePadding,
        quality: this.config.stripJpegQuality,
      };
    }

    const finish = () => {
      this.busy = false;
      setImmediate(() => this.pump());
    };

    this.worker.request(job).then(
      (reply) => {
        if (this.closed || !this.dev || reply.skipped || !reply.jpeg) return finish();
        const hwSlot = zone !== undefined ? strip.hardwareSlot : slot;
        const packs = this.protocol.buildImagePackets(Buffer.from(reply.jpeg), hwSlot);
        if (zone !== undefined) packs.push(this.protocol.buildBrightnessReport(this.effectiveBrightness()));
        process.stdout.write('.');
        this.enqueue(packs, finish);
      },
      (err) => {
        this.lastQueued.delete(keyIdx);
        const tries = this.retries.get(keyIdx) || 0;
        if (err.workerCrashed && tries < MAX_IMAGE_RETRIES && !this.pending.has(keyIdx)) {
          this.retries.set(keyIdx, tries + 1);
          this.lastQueued.set(keyIdx, base64);
          this.pending.set(keyIdx, base64);
        } else {
          log.error('[IMAGE]', err.message || err);
        }
        finish();
      }
    );
  }

  // ---- input ----------------------------------------------------------------------------------------------

  onHidData(d) {
    if (d[0] !== 0x41 || d[1] !== 0x43 || d[2] !== 0x4b) return;
    if (!this.satellite.isReady(this.deviceId)) return;
    setImmediate(() => {
      try {
        this.handleInput(d);
      } catch (e) {
        log.error('[INPUT]', e.message || e);
      }
    });
  }

  handleInput(d) {
    const ev = parseHardwareEvent(d[9], d[10], (m) => log.warn(m));
    if (!ev) return;
    this.wake();

    const eventName = this.config.swipeSwap && SWIPE_SWAP[ev.event] ? SWIPE_SWAP[ev.event] : ev.event;
    const key = companionKeyForEvent(this.layout, eventName);
    if (key == null) {
      if (!this.warnedUnmapped.has(eventName)) {
        this.warnedUnmapped.add(eventName);
        log.warn(`[UNMAPPED INPUT] Hardware sent '${eventName}' but it is not in devices.js (layout.inputMap)`);
      }
      return;
    }

    const dial = /^encoder_(\d+)_(left|right|push)$/.exec(eventName);

    if (behaviorFor(eventName) === 'encoder') {
      const right = eventName.includes('_right');
      const count = this.encoderRepeat(eventName, right);
      let rotateKey = key;
      const held = this.config.shiftRotate && this.dialsHeld.get(dial[1]);
      if (held) {
        // Press-and-rotate: turns while the dial is held go to the extra "shift" row (row 4, one key per dial).
        held.rotated = true;
        rotateKey = grid(4, Number(dial[1]) - 1);
      }
      for (let i = 0; i < count; i++) this.satellite.sendRotate(this.deviceId, rotateKey, right);
      return;
    }

    if (dial && dial[2] === 'push' && this.config.shiftRotate) return this.handleShiftPush(dial[1], key, ev.pressed);
    if (dial && dial[2] === 'push' && this.config.dialPushHold) {
      // Real press/release (long-press works in Companion) instead of a synthetic click.
      this.satellite.sendKey(this.deviceId, key, ev.pressed);
      return;
    }

    if (this.config.touchHold && eventName.startsWith('touch_')) return this.handleTouchHold(key);

    if (isStatelessButtonEvent(eventName)) {
      // These controls may never report a release; ignore explicit release packets and synthesise our own.
      if (!ev.pressed) return;
      this.satellite.sendKey(this.deviceId, key, true);
      const t = setTimeout(() => {
        this.autoUpTimers.delete(t);
        this.satellite.sendKey(this.deviceId, key, false);
      }, this.config.autoUpMs);
      this.autoUpTimers.add(t);
      return;
    }

    this.satellite.sendKey(this.deviceId, key, ev.pressed);
  }

  /**
   * Touch hold: the first touch report presses the key; further reports keep it pressed, and it is released
   * touchHoldMs after the last one. If the firmware never repeats reports this is just a slightly longer click.
   */
  handleTouchHold(key) {
    const release = () => {
      this.touchHeld.delete(key);
      this.satellite.sendKey(this.deviceId, key, false);
    };
    const held = this.touchHeld.get(key);
    if (held) {
      clearTimeout(held);
    } else {
      this.satellite.sendKey(this.deviceId, key, true);
    }
    this.touchHeld.set(key, setTimeout(release, this.config.touchHoldMs));
  }

  /**
   * Press-and-rotate mode: the push is held back until release so a push used as a shift for turning does not
   * also click. A plain push (no turn) clicks on release. A dial that never reports a release is freed after 5 s.
   */
  handleShiftPush(dialNo, key, pressed) {
    const held = this.dialsHeld.get(dialNo);
    if (pressed) {
      if (held) clearTimeout(held.timer);
      const entry = { rotated: false, timer: null };
      entry.timer = setTimeout(() => this.dialsHeld.delete(dialNo), 5000);
      this.dialsHeld.set(dialNo, entry);
      return;
    }
    if (!held) return;
    clearTimeout(held.timer);
    this.dialsHeld.delete(dialNo);
    if (held.rotated) return;
    this.satellite.sendKey(this.deviceId, key, true);
    const t = setTimeout(() => {
      this.autoUpTimers.delete(t);
      this.satellite.sendKey(this.deviceId, key, false);
    }, this.config.autoUpMs);
    this.autoUpTimers.add(t);
  }

  /** 1, or encoderAccel when the dial is being spun quickly in one direction. */
  encoderRepeat(eventName, right) {
    if (this.config.encoderAccel <= 1) return 1;
    const dial = eventName.split('_')[1];
    const now = Date.now();
    const prev = this.encoderState.get(dial);
    this.encoderState.set(dial, { ts: now, right });
    const fast = prev && prev.right === right && now - prev.ts <= this.config.encoderAccelWindowMs;
    return fast ? this.config.encoderAccel : 1;
  }
}

module.exports = { DeckSession };
