/**
 * devices.js — Supported USB decks and how each control maps to Companion and to on-device drawing.
 *
 * If you rearrange buttons in Companion or rename controls, update INPUT_CORRECTION_MAP and VISUAL_MAP
 * together so presses and pictures still line up.
 */
'use strict';

/** Row and column (0-based) on a 5-column Companion page → one flat key number (0, 1, 2 …). */
const grid = (row, col) => row * 5 + col;

/**
 * Each entry is one product the bridge can open. The OS matches USB vendor/product IDs (vid/pid) to pick
 * the right profile. usagePage narrows the HID interface when a device exposes more than one.
 *
 * keysPerRow × rows = how many keys Companion thinks the deck has (used at connect). Init sequences are
 * short wake-up commands so displays and backlight work before we send images.
 *
 * Grid sizes:
 *   Ajazz AKP05      — 5 × 4
 *   Ajazz AKP05E Pro — 5 × 5
 *   Ajazz AKP153 / E / R — 5 × 3
 *   Mirabox N4 / N4E — 5 × 3
 */
const SUPPORTED_DEVICES = [
  {
    id: 'AJAZZ_AKP05',
    name: 'Ajazz AKP05',
    vid: 0x0300,
    pid: 0x3004,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 4,
    initSequence: [
      [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x44, 0x49, 0x53],
      [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, 100],
    ],
  },
  {
    id: 'AJAZZ_AKP153',
    name: 'Ajazz AKP153',
    vid: 0x0300,
    pid: 0x1530,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 3,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00], // DIS
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00], // LIG (100%)
    ],
  },
  {
    id: 'AJAZZ_AKP153E',
    name: 'Ajazz AKP153E',
    vid: 0x0300,
    pid: 0x1010,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 3,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
    ],
  },
  {
    id: 'AJAZZ_AKP153R',
    name: 'Ajazz AKP153R',
    vid: 0x0300,
    pid: 0x1020,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 3,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
    ],
  },
  {
    id: 'AJAZZ_AKP05E_PRO',
    name: 'Ajazz AKP05E Pro',
    vid: 0x0300,
    pid: 0x3013,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 5,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
    ],
  },
  {
    id: 'MIRABOX_N4E',
    name: 'Mirabox N4E',
    vid: 0x6603,
    pid: 0x1007,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 3,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
    ],
  },
  {
    id: 'MIRABOX_N4',
    name: 'Mirabox N4',
    vid: 0x6602,
    pid: 0x1001,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 3,
    initSequence: [
      [0x00, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00],
      [0x00, 0x01, 0x02, 0x64, 0x00, 0x00, 0x00, 0x00],
    ],
  },
];

function getKeysTotal(device) {
  return device.keysPerRow * device.rows;
}

/**
 * Tells index.js whether to send a normal button press or a knob rotation to Companion.
 */
const INPUT_BEHAVIORS = {
  swipe_left: 'button',
  swipe_right: 'button',
  touch_1: 'button',
  touch_2: 'button',
  touch_3: 'button',
  touch_4: 'button',
  touch_5: 'button',
  touch_6: 'button',
  touch_7: 'button',
  encoder_1_left: 'encoder',
  encoder_1_right: 'encoder',
  encoder_2_left: 'encoder',
  encoder_2_right: 'encoder',
  encoder_3_left: 'encoder',
  encoder_3_right: 'encoder',
  encoder_4_left: 'encoder',
  encoder_4_right: 'encoder',
  encoder_1_push: 'button',
  encoder_2_push: 'button',
  encoder_3_push: 'button',
  encoder_4_push: 'button',
};

/**
 * Touch, swipes, and encoder “push” sometimes only send a press with no release; the bridge adds a short
 * synthetic release so Companion sees a complete click.
 */
function isStatelessButtonEvent(eventName) {
  return (
    eventName.startsWith('touch_') ||
    eventName.includes('swipe') ||
    eventName.includes('_push')
  );
}

/**
 * VISUAL_MAP — Where each named control’s picture is sent on the hardware.
 *
 * Main LCD keys use the device’s real screen slot numbers (here 5–14 for the two rows of five).
 *
 * Touch strip (AKP05): The bottom bar is one wide display. Companion still uses four separate keys for art;
 * we give those keys their own “draw slot” numbers here so they never reuse the main LCD slots (5–14) or
 * Companion’s top grid keys (0–9). A common pattern is Virtual IDs 100–103 for the four zones. This
 * project may use 0–3 instead for the same idea—reserved numbers only used for the strip. index.js then
 * sends the finished wide image using USB hardware slot 0 so it lands on the physical touch bar (see
 * scheduleHidWrites / buildBatPreambleReport).
 */
const VISUAL_MAP = {
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
 * INPUT_CORRECTION_MAP — Event name from parser.js → Companion key index (top-left of grid = 0, 5 columns).
 * Adjust grid(row, col) if you move actions in Companion’s layout.
 */
const INPUT_CORRECTION_MAP = {
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
 * Looks up which draw slot (VISUAL_MAP) Companion is asking for when it sends a BITMAP for a key index.
 * Returns null for keys that have no screen (e.g. encoder-only actions).
 */
function getHwScreenFromCompanionKey(keyIdx) {
  const k = keyIdx | 0;
  const hwString = Object.keys(INPUT_CORRECTION_MAP).find(
    (key) => INPUT_CORRECTION_MAP[key] === k && VISUAL_MAP[key] !== undefined
  );
  return hwString !== undefined ? VISUAL_MAP[hwString] : null;
}

module.exports = {
  grid,
  SUPPORTED_DEVICES,
  getKeysTotal,
  INPUT_BEHAVIORS,
  isStatelessButtonEvent,
  VISUAL_MAP,
  INPUT_CORRECTION_MAP,
  getHwScreenFromCompanionKey,
};
