/**
 * parser.js — Reads the device’s USB reports and turns them into short names the bridge already knows
 * (e.g. button_2_3, touch_1, encoder_2_left).
 *
 * AKP05 touch bar (hardware limitation):
 *   The strip does not send X/Y touch coordinates. It only sends four different codes (0x40 through 0x43),
 *   one per zone from left to right. We map those to touch_1 … touch_4. New firmware codes would need new
 *   cases in the switch below.
 */
function parseHardwareEvent(actionByte, stateByte, report) {
  const actionId = parseInt(actionByte, 16);
  const stateId = parseInt(stateByte, 16);

  let isPressed = true;
  let eventName = 'unmapped';

  switch (actionId) {
    case 0x00:
      return null;

    case 0x40:
    case 0x41:
    case 0x42:
    case 0x43: {
      if (!report) {
        return null;
      }
      const touchId = report[9];
      let zone = 0;
      if (touchId === 0x40) zone = 1;
      if (touchId === 0x41) zone = 2;
      if (touchId === 0x42) zone = 3;
      if (touchId === 0x43) zone = 4;

      if (zone > 0) {
        eventName = `touch_${zone}`;
      } else {
        return null;
      }
      break;
    }
    case 0x38:
      eventName = 'swipe_right';
      break;
    case 0x39:
      eventName = 'swipe_left';
      break;

    case 0x01:
      eventName = 'button_1_1';
      isPressed = stateId === 0x01;
      break;
    case 0x02:
      eventName = 'button_1_2';
      isPressed = stateId === 0x01;
      break;
    case 0x03:
      eventName = 'button_1_3';
      isPressed = stateId === 0x01;
      break;
    case 0x04:
      eventName = 'button_1_4';
      isPressed = stateId === 0x01;
      break;
    case 0x05:
      eventName = 'button_1_5';
      isPressed = stateId === 0x01;
      break;

    case 0x06:
      eventName = 'button_2_1';
      isPressed = stateId === 0x01;
      break;
    case 0x07:
      eventName = 'button_2_2';
      isPressed = stateId === 0x01;
      break;
    case 0x08:
      eventName = 'button_2_3';
      isPressed = stateId === 0x01;
      break;
    case 0x09:
      eventName = 'button_2_4';
      isPressed = stateId === 0x01;
      break;
    case 0x0a:
      eventName = 'button_2_5';
      isPressed = stateId === 0x01;
      break;

    case 0xa0:
      eventName = 'encoder_1_left';
      break;
    case 0xa1:
      eventName = 'encoder_1_right';
      break;
    case 0x37:
      eventName = 'encoder_1_push';
      isPressed = stateId === 0x01;
      break;

    case 0x50:
      eventName = 'encoder_2_left';
      break;
    case 0x51:
      eventName = 'encoder_2_right';
      break;
    case 0x35:
      eventName = 'encoder_2_push';
      isPressed = stateId === 0x01;
      break;

    case 0x90:
      eventName = 'encoder_3_left';
      break;
    case 0x91:
      eventName = 'encoder_3_right';
      break;
    case 0x33:
      eventName = 'encoder_3_push';
      isPressed = stateId === 0x01;
      break;

    case 0x70:
      eventName = 'encoder_4_left';
      break;
    case 0x71:
      eventName = 'encoder_4_right';
      break;
    case 0x36:
      eventName = 'encoder_4_push';
      isPressed = stateId === 0x01;
      break;

    default:
      console.warn(`[PARSER] Unhandled Hardware Action ID: 0x${actionByte}`);
      return null;
  }

  return {
    event: eventName,
    pressed: isPressed,
    rawAction: `0x${actionByte}`,
  };
}

module.exports = { parseHardwareEvent };
