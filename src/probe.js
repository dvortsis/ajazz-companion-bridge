/**
 * probe.js — `node index.js --probe`: list USB decks and dump their raw input reports as hex.
 *
 * For owners of other devices: run it, press every key / turn every dial / touch the strip, and attach the
 * output to an issue. Does not talk to Companion or draw anything. Press Ctrl+C to stop.
 */
'use strict';

const HID = require('node-hid');
const { SUPPORTED_DEVICES, matchesProfile } = require('./devices');

function run() {
  const all = HID.devices();
  const found = all.filter((h) => SUPPORTED_DEVICES.some((p) => matchesProfile(h, p)));
  console.log(`Found ${all.length} HID interfaces, ${found.length} match a supported profile.`);
  if (found.length === 0) {
    console.log('Nothing to probe. Close the manufacturer software and check the USB connection.');
    console.log('Candidate Ajazz/Mirabox-looking interfaces:');
    for (const h of all.filter((x) => [0x0300, 0x6602, 0x6603, 0x5548, 0x0b00, 0x1500, 0x0200].includes(x.vendorId))) {
      console.log(
        `  ${h.vendorId.toString(16)}:${h.productId.toString(16)} usagePage=${h.usagePage} ${h.product || ''}`
      );
    }
    return;
  }

  for (const h of found) {
    const p = SUPPORTED_DEVICES.find((x) => matchesProfile(h, x));
    console.log(`Opening ${p.name} (${h.vendorId.toString(16)}:${h.productId.toString(16)}, tested=${p.tested})`);
    const dev = new HID.HID(h.path);
    let last = Date.now();
    dev.on('data', (d) => {
      const now = Date.now();
      const dt = now - last;
      last = now;
      const known = d[0] === 0x41 && d[1] === 0x43 && d[2] === 0x4b;
      console.log(
        `${p.id} +${dt}ms ${known ? 'ACK' : '???'} action=0x${d[9].toString(16)} state=0x${d[10].toString(16)} | ${d.subarray(0, 16).toString('hex')}`
      );
    });
    dev.on('error', (e) => console.error(`${p.id} error:`, e.message || e));
  }
  console.log('Listening. Interact with the deck; Ctrl+C to exit.');
}

module.exports = { run };
