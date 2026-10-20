/**
 * scripts/udev-rules.js — `npm run udev`: print the Linux udev rules that let a normal user (or the service /
 * container) open every supported deck. Install with:
 *   npm run udev | sudo tee /etc/udev/rules.d/99-ajazz-bridge.rules && sudo udevadm control --reload && sudo udevadm trigger
 * then unplug and replug the deck.
 */
'use strict';

const { SUPPORTED_DEVICES } = require('../devices');

const hex4 = (n) => n.toString(16).padStart(4, '0');

function udevRules(devices = SUPPORTED_DEVICES) {
  const lines = ['# Ajazz / Mirabox LCD decks: allow the logged-in user (uaccess) and the plugdev group to open them.'];
  for (const d of devices) {
    lines.push(
      `# ${d.name}`,
      `SUBSYSTEM=="hidraw", ATTRS{idVendor}=="${hex4(d.vid)}", ATTRS{idProduct}=="${hex4(d.pid)}", MODE="0660", GROUP="plugdev", TAG+="uaccess"`,
      `SUBSYSTEM=="usb", ATTRS{idVendor}=="${hex4(d.vid)}", ATTRS{idProduct}=="${hex4(d.pid)}", MODE="0660", GROUP="plugdev", TAG+="uaccess"`
    );
  }
  return lines.join('\n') + '\n';
}

module.exports = { udevRules };

if (require.main === module) process.stdout.write(udevRules());
