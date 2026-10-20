/**
 * devices.js — Supported USB decks and how each control maps to Companion and to on-device drawing.
 *
 * Everything that differs between products lives in the profile: USB ids, grid size, report size, init
 * sequence, and the layout (event → Companion key, Companion key → draw slot, touch-strip geometry).
 * Adding a device is a new entry in SUPPORTED_DEVICES; index.js and the image worker never name a product.
 *
 * Only the Ajazz AKP05E (USB 0300:3004, registered as "AJAZZ_AKP05") has been tested on real hardware.
 * Every other profile has `tested: false` and is built from the reference projects ambiso/opendeck-akp05
 * and 4ndv/mirajazz; the bridge logs a warning when one is opened.
 */
'use strict';

/** Row and column (0-based) on a 5-column Companion page → one flat key number (0, 1, 2 …). */
const grid = (row, col) => row * 5 + col;

/**
 * Touch, swipes, and encoder “push” sometimes only send a press with no release; the bridge adds a short
 * synthetic release so Companion sees a complete click.
 */
function isStatelessButtonEvent(eventName) {
  return eventName.startsWith('touch_') || eventName.includes('swipe') || eventName.includes('_push');
}

/**
 * Event name from parser.js → Companion key index (top-left of grid = 0, 5 columns).
 * Adjust grid(row, col) if you move actions in Companion’s layout.
 */
const AKP05_INPUT_MAP = {
  button_1_1: grid(0, 0),
  button_1_2: grid(0, 1),
  button_1_3: grid(0, 2),
  button_1_4: grid(0, 3),
  button_1_5: grid(0, 4),
  button_2_1: grid(1, 0),
  button_2_2: grid(1, 1),
  button_2_3: grid(1, 2),
  button_2_4: grid(1, 3),
  button_2_5: grid(1, 4),
  touch_1: grid(2, 0),
  touch_2: grid(2, 1),
  touch_3: grid(2, 2),
  touch_4: grid(2, 3),
  encoder_1_push: grid(3, 0),
  encoder_1_left: grid(3, 0),
  encoder_1_right: grid(3, 0),
  encoder_2_push: grid(3, 1),
  encoder_2_left: grid(3, 1),
  encoder_2_right: grid(3, 1),
  encoder_3_push: grid(3, 2),
  encoder_3_left: grid(3, 2),
  encoder_3_right: grid(3, 2),
  encoder_4_push: grid(3, 3),
  encoder_4_left: grid(3, 3),
  encoder_4_right: grid(3, 3),
  swipe_left: grid(2, 4),
  swipe_right: grid(3, 4),
};

/**
 * Where each named control’s picture is drawn. Main LCD keys use the device’s real screen slots (5–14).
 * The four touch-strip keys use reserved “virtual” slots 0–3 so strip art never targets the main LCD; the
 * composited wide image is then uploaded to hardware slot 0 (the physical strip).
 */
const AKP05_VISUAL_MAP = {
  button_1_1: 10,
  button_1_2: 11,
  button_1_3: 12,
  button_1_4: 13,
  button_1_5: 14,
  button_2_1: 5,
  button_2_2: 6,
  button_2_3: 7,
  button_2_4: 8,
  button_2_5: 9,
  touch_1: 0,
  touch_2: 1,
  touch_3: 2,
  touch_4: 3,
};

/**
 * Builds the lookup tables used at runtime from a layout's two maps.
 * `slotByKey`: Companion key → virtual draw slot. `strip`: slot → zone index (touch strip) if applicable.
 */
function buildLayout({ inputMap, visualMap, strip }) {
  const slotByKey = new Map();
  for (const [event, key] of Object.entries(inputMap)) {
    if (visualMap[event] !== undefined && !slotByKey.has(key)) slotByKey.set(key, visualMap[event]);
  }
  const stripZoneBySlot = new Map();
  if (strip) {
    for (let zone = 0; zone < strip.zones; zone++) stripZoneBySlot.set(strip.firstSlot + zone, zone);
  }
  return { inputMap, visualMap, strip, slotByKey, stripZoneBySlot };
}

const AKP05_LAYOUT = buildLayout({
  inputMap: AKP05_INPUT_MAP,
  visualMap: AKP05_VISUAL_MAP,
  strip: { width: 800, height: 112, iconSize: 112, zones: 4, firstSlot: 0, hardwareSlot: 0 },
});

/** CRT-family init: DIS, backlight off, backlight 100%. */
const CRT_INIT = [
  [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x44, 0x49, 0x53],
  [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, 0x00, 0x00],
  [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, 100],
];

/** Legacy-family init carried over from the original profiles (unverified on hardware). */
const LEGACY_INIT = [
  [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
  [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
];

function profile(base) {
  return Object.freeze({
    keysPerRow: 5,
    usagePage: 65440,
    packetPayload: 1024,
    layout: AKP05_LAYOUT,
    tested: false,
    ...base,
  });
}

/**
 * Each entry is one product the bridge can open. The OS matches vid/pid to pick the profile; usagePage
 * narrows the HID interface when a device exposes more than one. keysPerRow × rows = how many keys
 * Companion is told the deck has.
 */
const SUPPORTED_DEVICES = [
  // Tested hardware: USB 0300:3004, called the AKP05E upstream. The DEVICEID ("AJAZZ_AKP05") is deliberately kept so
  // existing Companion surface configuration keeps working; only the displayed product name says AKP05E.
  profile({
    id: 'AJAZZ_AKP05',
    name: 'Ajazz AKP05E',
    vid: 0x0300,
    pid: 0x3004,
    rows: 4,
    initSequence: CRT_INIT,
    tested: true,
  }),
  profile({ id: 'AJAZZ_AKP153', name: 'Ajazz AKP153', vid: 0x0300, pid: 0x1530, rows: 3, initSequence: LEGACY_INIT }),
  profile({ id: 'AJAZZ_AKP153E', name: 'Ajazz AKP153E', vid: 0x0300, pid: 0x1010, rows: 3, initSequence: LEGACY_INIT }),
  profile({ id: 'AJAZZ_AKP153R', name: 'Ajazz AKP153R', vid: 0x0300, pid: 0x1020, rows: 3, initSequence: LEGACY_INIT }),
  profile({
    id: 'AJAZZ_AKP05E_PRO',
    name: 'Ajazz AKP05E Pro',
    vid: 0x0300,
    pid: 0x3013,
    rows: 5,
    initSequence: LEGACY_INIT,
  }),
  profile({ id: 'MIRABOX_N4E', name: 'Mirabox N4E', vid: 0x6603, pid: 0x1007, rows: 3, initSequence: LEGACY_INIT }),
  profile({ id: 'MIRABOX_N4', name: 'Mirabox N4', vid: 0x6602, pid: 0x1001, rows: 3, initSequence: LEGACY_INIT }),

  // Experimental: ids from ambiso/opendeck-akp05, same 2×5 keys + 4 dials + strip as the tested AKP05E.
  profile({
    id: 'AJAZZ_AKP05_3006',
    name: 'Ajazz AKP05 (3006)',
    vid: 0x0300,
    pid: 0x3006,
    rows: 4,
    initSequence: CRT_INIT,
  }),
  profile({
    id: 'AJAZZ_AKP05CN_PRO',
    name: 'Ajazz AKP05CN Pro',
    vid: 0x0300,
    pid: 0x3014,
    rows: 4,
    initSequence: CRT_INIT,
  }),
  profile({
    id: 'MIRABOX_N4_PRO_E',
    name: 'Mirabox N4 Pro E',
    vid: 0x5548,
    pid: 0x1021,
    rows: 4,
    initSequence: CRT_INIT,
  }),
  profile({ id: 'MIRABOX_N4_PRO', name: 'Mirabox N4 Pro', vid: 0x5548, pid: 0x1008, rows: 4, initSequence: CRT_INIT }),
  profile({ id: 'VSD_N4', name: 'VSDinside N4', vid: 0x5548, pid: 0x1004, rows: 4, initSequence: CRT_INIT }),
  profile({ id: 'VSD_N4_PRO', name: 'VSDinside N4 Pro', vid: 0x5548, pid: 0x1023, rows: 4, initSequence: CRT_INIT }),
  profile({
    id: 'MIRABOX_MSD_PRO',
    name: 'Mirabox MSD Pro',
    vid: 0x0b00,
    pid: 0x1003,
    rows: 4,
    initSequence: CRT_INIT,
  }),
  profile({ id: 'CN003', name: 'CN003', vid: 0x1500, pid: 0x3002, rows: 4, initSequence: CRT_INIT }),
  profile({
    id: 'STREONOR_S10_PRO',
    name: 'Streonor S10 Pro',
    vid: 0x1500,
    pid: 0x3007,
    rows: 4,
    initSequence: CRT_INIT,
  }),
  profile({ id: 'SS552', name: 'SS552', vid: 0x0200, pid: 0x3001, rows: 4, initSequence: CRT_INIT }),
];

function getKeysTotal(device) {
  return device.keysPerRow * device.rows;
}

/**
 * Whether a HID enumeration entry matches a profile. On Windows the usage page must match exactly. Linux
 * (hidraw/libusb) and macOS do not always report one (0 or undefined), so there it is accepted as unknown.
 */
function matchesProfile(hid, p, platform = process.platform) {
  if (hid.vendorId !== p.vid || hid.productId !== p.pid) return false;
  if (p.usagePage == null || hid.usagePage === p.usagePage) return true;
  return platform !== 'win32' && !hid.usagePage;
}

/** Companion key → virtual draw slot for a layout, or null if the key has no screen. */
function getDrawSlot(layout, keyIdx) {
  const slot = layout.slotByKey.get(keyIdx | 0);
  return slot === undefined ? null : slot;
}

/** Event name → Companion key index, or null. */
function companionKeyForEvent(layout, eventName) {
  const key = layout.inputMap[eventName];
  return key === undefined ? null : key;
}

/** 'encoder' for dial rotation events, 'button' for everything else (buttons, touch, swipes, dial pushes). */
function behaviorFor(eventName) {
  return /^encoder_\d+_(left|right)$/.test(eventName) ? 'encoder' : 'button';
}

module.exports = {
  grid,
  SUPPORTED_DEVICES,
  AKP05_LAYOUT,
  buildLayout,
  getKeysTotal,
  isStatelessButtonEvent,
  matchesProfile,
  getDrawSlot,
  companionKeyForEvent,
  behaviorFor,
};
