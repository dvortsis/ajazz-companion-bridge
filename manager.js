/**
 * manager.js — Finds supported decks on USB and keeps one DeckSession open per physical device.
 *
 * Scans every hidScanMs: new decks are opened, vanished decks are cleaned up by their session's own error
 * handling, and a closed session is simply replaced on the next scan (this is also how replugging works).
 */
'use strict';

const { EventEmitter } = require('events');
const log = require('./log');
const { SUPPORTED_DEVICES, matchesProfile } = require('./devices');
const { DeckSession } = require('./session');

/** One physical deck = vid:pid:serial (serial may be empty, then all such interfaces count as one). */
function deviceKey(hid) {
  return `${hid.vendorId}:${hid.productId}:${hid.serialNumber || ''}`;
}

class DeviceManager extends EventEmitter {
  /**
   * @param {{hid: {devices: () => any[], HID: new (path: string) => any}, satellite: any, worker: any, config: any,
   *          profiles?: object[]}} o
   */
  constructor({ hid, satellite, worker, config, profiles = SUPPORTED_DEVICES }) {
    super();
    this.hid = hid;
    this.satellite = satellite;
    this.worker = worker;
    this.config = config;
    this.profiles = profiles;
    this.sessions = new Map();
    this.timer = null;
    this.lastScanHadNone = false;
  }

  start() {
    this.scan();
    this.timer = setInterval(() => this.scan(), this.config.hidScanMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    for (const s of [...this.sessions.values()]) s.close();
    this.sessions.clear();
  }

  /** Deck ids in use: the profile id for the first deck of a model, profile id + serial for further ones. */
  assignDeviceId(profile, hidInfo) {
    const taken = new Set([...this.sessions.values()].map((s) => s.deviceId));
    if (!taken.has(profile.id)) return profile.id;
    const suffix = hidInfo.serialNumber || hidInfo.path.replace(/\W+/g, '').slice(-8);
    return `${profile.id}_${suffix}`;
  }

  /** Enumerate USB and open any supported deck we do not already hold. */
  scan() {
    let list;
    try {
      list = this.hid.devices();
    } catch (e) {
      log.error('[HID] enumerate failed:', e.message || e);
      return;
    }

    const seen = new Set();
    for (const hidInfo of list) {
      if (!hidInfo.path) continue;
      const profile = this.profiles.find((p) => matchesProfile(hidInfo, p));
      if (!profile) continue;
      const key = deviceKey(hidInfo);
      if (seen.has(key)) continue;
      seen.add(key);
      if (this.sessions.has(key)) continue;
      this.open(key, hidInfo, profile);
    }

    const none = this.sessions.size === 0;
    if (none && !this.lastScanHadNone) log.info('[HID] No supported devices found; will keep scanning.');
    this.lastScanHadNone = none;
  }

  open(key, hidInfo, profile) {
    const deviceId = this.assignDeviceId(profile, hidInfo);
    const session = new DeckSession({
      hidInfo,
      profile,
      deviceId,
      satellite: this.satellite,
      worker: this.worker,
      config: this.config,
      openHid: (p) => new this.hid.HID(p),
    });
    session.on('closed', () => {
      if (this.sessions.get(key) === session) this.sessions.delete(key);
      this.emit('change');
    });
    this.sessions.set(key, session);
    if (!session.start()) {
      this.sessions.delete(key);
      return;
    }
    this.emit('change');
  }

  /** Human readable summary for the tray. */
  describe() {
    if (this.sessions.size === 0) return 'No deck connected';
    return [...this.sessions.values()].map((s) => s.profile.name).join(', ');
  }
}

module.exports = { DeviceManager, deviceKey };
