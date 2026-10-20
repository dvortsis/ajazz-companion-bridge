/**
 * parser.js — Reads the device’s USB input reports and turns them into short names the bridge already knows
 * (e.g. button_2_3, touch_1, encoder_2_left).
 *
 * AKP05 touch bar (hardware limitation):
 *   The strip does not send X/Y touch coordinates. It only sends four different codes (0x40 through 0x43),
 *   one per zone from left to right → touch_1 … touch_4. New firmware codes need a new row in ACTIONS.
 *
 * Rows: action id → [event name, whether the state byte (report[10]) carries pressed/released].
 */
'use strict';

const ACTIONS = new Map([
  [0x40, ['touch_1', false]],
  [0x41, ['touch_2', false]],
  [0x42, ['touch_3', false]],
  [0x43, ['touch_4', false]],
  [0x38, ['swipe_right', false]],
  [0x39, ['swipe_left', false]],

  [0x01, ['button_1_1', true]],
  [0x02, ['button_1_2', true]],
  [0x03, ['button_1_3', true]],
  [0x04, ['button_1_4', true]],
  [0x05, ['button_1_5', true]],
  [0x06, ['button_2_1', true]],
  [0x07, ['button_2_2', true]],
  [0x08, ['button_2_3', true]],
  [0x09, ['button_2_4', true]],
  [0x0a, ['button_2_5', true]],

  [0xa0, ['encoder_1_left', false]],
  [0xa1, ['encoder_1_right', false]],
  [0x37, ['encoder_1_push', true]],
  [0x50, ['encoder_2_left', false]],
  [0x51, ['encoder_2_right', false]],
  [0x35, ['encoder_2_push', true]],
  [0x90, ['encoder_3_left', false]],
  [0x91, ['encoder_3_right', false]],
  [0x33, ['encoder_3_push', true]],
  [0x70, ['encoder_4_left', false]],
  [0x71, ['encoder_4_right', false]],
  [0x36, ['encoder_4_push', true]],
]);

/** Action ids already reported as unknown, so a chatty control cannot flood the log. */
const warned = new Set();

/**
 * @param {number} actionId report[9]
 * @param {number} stateId  report[10]
 * @param {(msg: string) => void} [onUnknown] called once per unknown action id
 * @returns {{event: string, pressed: boolean, rawAction: string} | null}
 */
function parseHardwareEvent(actionId, stateId, onUnknown) {
  if (actionId === 0x00) return null;

  const row = ACTIONS.get(actionId);
  if (!row) {
    if (!warned.has(actionId)) {
      warned.add(actionId);
      if (onUnknown) onUnknown(`[PARSER] Unhandled hardware action ID: 0x${actionId.toString(16).padStart(2, '0')}`);
    }
    return null;
  }

  const [event, hasState] = row;
  return {
    event,
    pressed: hasState ? stateId === 0x01 : true,
    rawAction: `0x${actionId.toString(16).padStart(2, '0')}`,
  };
}

module.exports = { parseHardwareEvent, ACTIONS };
