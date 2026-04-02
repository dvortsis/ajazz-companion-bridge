/**
 * DEVICE REGISTRY & KEY MAPS — Companion ↔ hardware crosswalk (devices.js)
 *
 * This module lists which USB products we support and how logical controls map to Companion’s grid.
 */
'use strict';

/**
 * SUPPORTED_DEVICES — one entry per deck model we recognize
 *
 * USB basics (why VID/PID matter):
 *   Every USB gadget announces a 16-bit Vendor ID (VID) and 16-bit Product ID (PID). VID tells you *who*
 *   made the chip or device (assigned by the USB consortium); PID tells you *which model* it is within
 *   that vendor’s lineup. Windows and macOS expose these to libraries like node-hid; we compare them to the
 *   values below so the bridge opens the right device when several USB peripherals are plugged in at once.
 *
 * Optional `usagePage` helps when one physical device exposes more than one HID interface (e.g. keyboard
 * vs. vendor-specific control surface). We only open the interface whose usage page matches—avoiding the
 * wrong endpoint.
 *
 * `keysPerRow` and `rows` describe the Companion button grid for ADD-DEVICE (how many keys total and how
 * they wrap into rows/columns for CONTROLID strings). Scan order is the array order: the first matching
 * profile wins.
 *
 * initSequence — wake-up bytes for the LCD / brightness controller:
 *   Values are written in hexadecimal notation (0xFF = 255). Each inner array is one logical command
 *   (display enable “DIS”, lighting “LIG”, etc.) padded to a full HID output report by index.js. Different
 *   chip families expect different command shapes; that is why each product has its own sequence. Sending the
 *   correct sequence powers the screen pipeline so later image transfers show up; skipping it can leave the
 *   deck dark even though USB enumeration succeeded.
 */
const SUPPORTED_DEVICES = [
  {
    id: 'AJAZZ_AKP05',
    name: 'Ajazz AKP05',
    vid: 0x0300,
    pid: 0x3004,
    usagePage: 65440,
    keysPerRow: 5,
    rows: 5,
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
 * Per-event input semantics: 'button' (KEYDOWN/KEYUP) or 'encoder' (ROTATE).
 * Unlisted events fall back in index.js: button_* → button, else encoder.
 */
const INPUT_BEHAVIORS = {
  swipe_left: 'button',
  swipe_right: 'button',
  touch_1: 'button',
  touch_2: 'button',
  touch_3: 'button',
  touch_4: 'button',
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
 * Single source of truth: inputs that only send DOWN (or miss UP) and need a 50ms synthetic UP in bridge.
 */
function isStatelessButtonEvent(eventName) {
  return (
    eventName.startsWith('touch_') ||
    eventName.includes('swipe') ||
    eventName.includes('_push')
  );
}

/**
 * Hardware event string → mirajazz HW screen index for BAT (draw targets).
 * AKP05-oriented: other products may need per-device maps if screen indices differ.
 */
const VISUAL_MAP = {
  // Physical Top Row -> Hardware Screen Indices 10-14
  button_1_1: 10,
  button_1_2: 11,
  button_1_3: 12,
  button_1_4: 13,
  button_1_5: 14,
  // Physical Middle Row -> Hardware Screen Indices 5-9
  button_2_1: 5,
  button_2_2: 6,
  button_2_3: 7,
  button_2_4: 8,
  button_2_5: 9,
  // Physical Touch Strip -> Hardware Screen Indices 0–3 (176×112)
  touch_1: 0,
  touch_2: 1,
  touch_3: 2,
  touch_4: 3,
};

/**
 * Parser event name → Companion key index (0 … KEYS_TOTAL−1).
 * Tied to firmware byte pairs → event strings in parser.js; layouts differ by product.
 * New devices with different physical grids may need their own maps here, a registry of
 * maps keyed by activeDeviceConfig.id, or shared offset/key-order rules—do not assume
 * one global map fits all SUPPORTED_DEVICES entries.
 */
const INPUT_CORRECTION_MAP = {
  // Top Row triggers Companion Keys 0-4
  button_1_1: 0,
  button_1_2: 1,
  button_1_3: 2,
  button_1_4: 3,
  button_1_5: 4,
  // Middle Row triggers Companion Keys 5-9
  button_2_1: 5,
  button_2_2: 6,
  button_2_3: 7,
  button_2_4: 8,
  button_2_5: 9,
  // Touch Strip triggers Companion Keys 10-13 (row 3, no fifth column)
  touch_1: 10,
  touch_2: 11,
  touch_3: 12,
  touch_4: 13,
  // Encoders trigger Companion Keys 15-18
  encoder_1_push: 15,
  encoder_1_left: 15,
  encoder_1_right: 15,
  encoder_2_push: 16,
  encoder_2_left: 16,
  encoder_2_right: 16,
  encoder_3_push: 17,
  encoder_3_left: 17,
  encoder_3_right: 17,
  encoder_4_push: 18,
  encoder_4_left: 18,
  encoder_4_right: 18,
  swipe_left: 14,
  swipe_right: 19,
};

/**
 * Companion key index → HW screen index for surfaces that exist in VISUAL_MAP.
 * Returns null if there is no drawable surface (e.g. key 14 blank, encoders 15-18).
 */
function getHwScreenFromCompanionKey(keyIdx) {
  const k = keyIdx | 0;
  const hwString = Object.keys(INPUT_CORRECTION_MAP).find(
    (key) => INPUT_CORRECTION_MAP[key] === k && VISUAL_MAP[key] !== undefined
  );
  return hwString !== undefined ? VISUAL_MAP[hwString] : null;
}

module.exports = {
  SUPPORTED_DEVICES,
  getKeysTotal,
  INPUT_BEHAVIORS,
  isStatelessButtonEvent,
  VISUAL_MAP,
  INPUT_CORRECTION_MAP,
  getHwScreenFromCompanionKey,
};
