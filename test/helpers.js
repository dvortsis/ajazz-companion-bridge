'use strict';

const { EventEmitter } = require('events');

async function waitFor(cond, ms = 2000, step = 5) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return;
    await new Promise((r) => setTimeout(r, step));
  }
  throw new Error('waitFor timed out');
}

class FakeHid extends EventEmitter {
  constructor() {
    super();
    this.writes = [];
    this.closed = false;
    this.failWrites = false;
  }
  write(buf) {
    if (this.failWrites) throw new Error('could not write');
    this.writes.push(Buffer.from(buf));
    return buf.length;
  }
  close() {
    this.closed = true;
  }
  /** Reports that carry a BAT preamble: returns [{len, key}] */
  bats() {
    return this.writes
      .filter((b) => b[6] === 0x42 && b[7] === 0x41 && b[8] === 0x54)
      .map((b) => ({ len: (b[11] << 8) | b[12], key: b[13] }));
  }
}

class FakeSatellite {
  constructor() {
    this.sent = [];
    this.ready = true;
    this.handlers = null;
    this.removed = null;
  }
  addDevice(id, profile, handlers) {
    this.deviceId = id;
    this.handlers = handlers;
  }
  removeDevice(id) {
    this.removed = id;
  }
  isReady() {
    return this.ready;
  }
  sendKey(id, key, pressed) {
    this.sent.push(['key', key, pressed]);
    return true;
  }
  sendRotate(id, key, right) {
    this.sent.push(['rot', key, right]);
    return true;
  }
}

class FakeWorker {
  constructor() {
    this.worker = {};
    this.requests = [];
    this.crashOnce = false;
  }
  async request(job) {
    this.requests.push(job);
    if (this.crashOnce && !job.reset) {
      this.crashOnce = false;
      const e = new Error('worker stopped');
      e.workerCrashed = true;
      throw e;
    }
    if (job.reset) return { ok: true, skipped: true };
    return { ok: true, jpeg: Buffer.alloc(2500, 7), skipped: !!(job.strip && !job.render) };
  }
}

const baseConfig = {
  keepaliveMs: 100000,
  idleOffMinutes: 0,
  hidWriteDelayMs: 0,
  stripBatchMs: 5,
  stripEdgePadding: 0,
  stripJpegQuality: 75,
  autoUpMs: 5,
  swipeSwap: false,
  encoderAccel: 1,
  encoderAccelWindowMs: 80,
};

function report(action, state = 0) {
  const d = Buffer.alloc(32);
  d[0] = 0x41;
  d[1] = 0x43;
  d[2] = 0x4b;
  d[9] = action;
  d[10] = state;
  return d;
}

module.exports = { waitFor, FakeHid, FakeSatellite, FakeWorker, baseConfig, report };
