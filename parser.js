/**
 * USB INPUT PARSER — turn raw binary into named events
 *
 * The cable carries bytes, not words. When you press a key, the device’s microcontroller packs a short HID
 * report; two nibbles we treat as hex digits (`actionByte`, `stateByte`) identify which control fired and
 * whether it is pressed, released, or rotated. This module is the Rosetta stone: a `switch` maps those
 * numbers to stable string names such as `swipe_left`, `touch_1`, or `encoder_1_push`.
 *
 * index.js passes those names into devices.js to obtain Companion key indices and build Satellite commands.
 * If you add support for a new hardware revision, you may need new `case` branches when the firmware
 * introduces previously unseen action codes.
 */

function parseHardwareEvent(actionByte, stateByte) {
    const actionId = parseInt(actionByte, 16);
    const stateId = parseInt(stateByte, 16);

    let isPressed = true; 
    let eventName = "unmapped";

    switch(actionId) {
        // Ghost Input Filter
        case 0x00: 
            return null;

        // LCD Touch Zones
        case 0x40: eventName = "touch_1"; break;
        case 0x41: eventName = "touch_2"; break;
        case 0x42: eventName = "touch_3"; break;
        case 0x43: eventName = "touch_4"; break;
        case 0x38: eventName = "swipe_right"; break;
        case 0x39: eventName = "swipe_left"; break;

        // Physical Buttons (Row 1)
        case 0x01: eventName = "button_1_1"; isPressed = (stateId === 0x01); break;
        case 0x02: eventName = "button_1_2"; isPressed = (stateId === 0x01); break;
        case 0x03: eventName = "button_1_3"; isPressed = (stateId === 0x01); break;
        case 0x04: eventName = "button_1_4"; isPressed = (stateId === 0x01); break;
        case 0x05: eventName = "button_1_5"; isPressed = (stateId === 0x01); break;

        // Physical Buttons (Row 2)
        case 0x06: eventName = "button_2_1"; isPressed = (stateId === 0x01); break;
        case 0x07: eventName = "button_2_2"; isPressed = (stateId === 0x01); break;
        case 0x08: eventName = "button_2_3"; isPressed = (stateId === 0x01); break;
        case 0x09: eventName = "button_2_4"; isPressed = (stateId === 0x01); break;
        case 0x0a: eventName = "button_2_5"; isPressed = (stateId === 0x01); break;

        // Rotary Encoder 1
        case 0xa0: eventName = "encoder_1_left"; break;
        case 0xa1: eventName = "encoder_1_right"; break;
        case 0x37: eventName = "encoder_1_push"; isPressed = (stateId === 0x01); break;

        // Rotary Encoder 2
        case 0x50: eventName = "encoder_2_left"; break;
        case 0x51: eventName = "encoder_2_right"; break;
        case 0x35: eventName = "encoder_2_push"; isPressed = (stateId === 0x01); break;

        // Rotary Encoder 3
        case 0x90: eventName = "encoder_3_left"; break;
        case 0x91: eventName = "encoder_3_right"; break;
        case 0x33: eventName = "encoder_3_push"; isPressed = (stateId === 0x01); break;

        // Rotary Encoder 4
        case 0x70: eventName = "encoder_4_left"; break;
        case 0x71: eventName = "encoder_4_right"; break;
        case 0x36: eventName = "encoder_4_push"; isPressed = (stateId === 0x01); break;

        default:
            console.warn(`[PARSER] Unhandled Hardware Action ID: 0x${actionByte}`);
            return null;
    }

    return {
        event: eventName,
        pressed: isPressed,
        rawAction: `0x${actionByte}`
    };
}

module.exports = { parseHardwareEvent };