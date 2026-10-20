'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { parseHardwareEvent, ACTIONS } = require('../parser');
const { createProtocol } = require('../protocol');
const { stripIconX } = require('../layout');
const devices = require('../devices');
const { parseKv, buildAddDeviceBuffer, buildKeyPressLine, buildKeyRotateLine, keyToRowCol } = require('../satellite');
const lock = require('../lock');
const os = require('os');
const path = require('path');
const fs = require('fs');

test('parser maps buttons with state, touch/swipe/rotation as presses', () => {
  assert.deepEqual(parseHardwareEvent(0x01, 0x01), { event: 'button_1_1', pressed: true, rawAction: '0x01' });
  assert.equal(parseHardwareEvent(0x0a, 0x00).pressed, false);
  assert.equal(parseHardwareEvent(0x40, 0x00).event, 'touch_1');
  assert.equal(parseHardwareEvent(0x43, 0x00).event, 'touch_4');
  assert.equal(parseHardwareEvent(0x38, 0).event, 'swipe_right');
  assert.equal(parseHardwareEvent(0x39, 0).event, 'swipe_left');
  assert.equal(parseHardwareEvent(0xa0, 0).event, 'encoder_1_left');
  assert.equal(parseHardwareEvent(0x71, 0).event, 'encoder_4_right');
  assert.equal(parseHardwareEvent(0x35, 0x01).event, 'encoder_2_push');
  assert.equal(parseHardwareEvent(0x00, 0), null);
});

test('parser reports an unknown action only once', () => {
  const msgs = [];
  assert.equal(
    parseHardwareEvent(0xee, 0, (m) => msgs.push(m)),
    null
  );
  assert.equal(
    parseHardwareEvent(0xee, 0, (m) => msgs.push(m)),
    null
  );
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /0xee/);
  assert.equal(ACTIONS.size, 28);
});

test('protocol builds the exact report bytes', () => {
  const p = createProtocol();
  assert.equal(p.reportLen, 1025);
  const lig = p.buildBrightnessReport(100);
  assert.deepEqual([...lig.subarray(0, 12)], [0, 0x43, 0x52, 0x54, 0, 0, 0x4c, 0x49, 0x47, 0, 0, 100]);
  assert.equal(lig.length, 1025);
  assert.equal(p.buildBrightnessReport(500)[11], 100);
  assert.equal(p.buildBrightnessReport(-5)[11], 0);
  const bat = p.buildBatPreambleReport(0x1234, 5);
  assert.deepEqual([...bat.subarray(0, 14)], [0, 0x43, 0x52, 0x54, 0, 0, 0x42, 0x41, 0x54, 0, 0, 0x12, 0x34, 6]);
  assert.deepEqual([...p.buildStpReport().subarray(0, 9)], [0, 0x43, 0x52, 0x54, 0, 0, 0x53, 0x54, 0x50]);
});

test('protocol chunks payloads into 1024-byte pieces behind a 0x00 report id', () => {
  const p = createProtocol();
  const data = Buffer.alloc(2500, 9);
  const packs = p.chunkImagePayloadReports(data);
  assert.equal(packs.length, 3);
  assert.ok(packs.every((b) => b.length === 1025 && b[0] === 0));
  assert.equal(packs[2][1 + 451], 9);
  assert.equal(packs[2][1 + 452], 0);
  const all = p.buildImagePackets(data, 3);
  assert.equal(all.length, 5);
  assert.equal(all[0][13], 4);
  assert.equal(all[4][6], 0x53);
});

test('strip icons: outer icons flush with edges, inner evenly spread, reversed for the 180° rotation', () => {
  const g = { width: 800, iconSize: 112, zones: 4 };
  assert.deepEqual(stripIconX(g), [688, 459, 229, 0]);
  assert.deepEqual(stripIconX(g, 10), [678, 455, 233, 10]);
  assert.deepEqual(stripIconX({ ...g, zones: 1 }), [344]);
});

test('layout maps keys to draw slots exactly like the tested original', () => {
  const L = devices.AKP05_LAYOUT;
  const expected = { 0: 10, 1: 11, 2: 12, 3: 13, 4: 14, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 0, 11: 1, 12: 2, 13: 3 };
  for (const [k, slot] of Object.entries(expected)) assert.equal(devices.getDrawSlot(L, Number(k)), slot, `key ${k}`);
  for (const k of [14, 15, 16, 17, 18, 19, 20, 99]) assert.equal(devices.getDrawSlot(L, k), null, `key ${k}`);
  assert.equal(devices.companionKeyForEvent(L, 'encoder_3_right'), 17);
  assert.equal(devices.companionKeyForEvent(L, 'swipe_left'), 14);
  assert.equal(devices.companionKeyForEvent(L, 'swipe_right'), 19);
  assert.equal(devices.companionKeyForEvent(L, 'nope'), null);
  assert.equal(devices.behaviorFor('touch_2'), 'button');
  assert.equal(devices.behaviorFor('encoder_1_left'), 'encoder');
  assert.equal(devices.behaviorFor('encoder_1_push'), 'button');
  assert.equal(devices.isStatelessButtonEvent('encoder_1_push'), true);
  assert.equal(devices.isStatelessButtonEvent('button_1_1'), false);
});

test('device registry: unique ids and usb ids; tested hardware is unchanged', () => {
  const ids = devices.SUPPORTED_DEVICES.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length);
  const usb = devices.SUPPORTED_DEVICES.map((d) => `${d.vid}:${d.pid}`);
  assert.equal(new Set(usb).size, usb.length);
  const akp05 = devices.SUPPORTED_DEVICES.find((d) => d.vid === 0x0300 && d.pid === 0x3004);
  assert.equal(akp05.id, 'AJAZZ_AKP05');
  assert.equal(akp05.tested, true);
  assert.equal(devices.getKeysTotal(akp05), 20);
  assert.equal(akp05.initSequence.length, 3);
  assert.ok(devices.matchesProfile({ vendorId: 0x0300, productId: 0x3004, usagePage: 65440 }, akp05));
  assert.ok(!devices.matchesProfile({ vendorId: 0x0300, productId: 0x3004, usagePage: 1 }, akp05));
});

test('satellite lines match the wire format the tested bridge used', () => {
  const akp05 = devices.SUPPORTED_DEVICES[0];
  assert.equal(
    buildAddDeviceBuffer('AJAZZ_AKP05', akp05, 112).toString('ascii'),
    'ADD-DEVICE DEVICEID="AJAZZ_AKP05" PRODUCT_NAME="Ajazz AKP05E" KEYS_TOTAL=20 KEYS_PER_ROW=5 BITMAPS=112\n'
  );
  assert.ok(buildAddDeviceBuffer('x', akp05, 72, true).toString('ascii').endsWith('BITMAPS=72\r\n'));
  assert.equal(keyToRowCol(17, 5), '3/2');
  assert.equal(buildKeyPressLine('A"B', 11, true, 5), 'KEY-PRESS DEVICEID="AB" CONTROLID="2/1" KEY="2/1" PRESSED=1\n');
  assert.equal(
    buildKeyRotateLine('A', 15, false, 5),
    'KEY-ROTATE DEVICEID="A" CONTROLID="3/0" KEY="3/0" DIRECTION=0\n'
  );
});

test('parseKv handles quoted, unquoted and base64 values', () => {
  const kv = parseKv('DEVICEID="AJAZZ_AKP05" KEY=3 TYPE=BUTTON BITMAP="QUJD+/==" COLOR="#ff0000" PRESSED=false');
  assert.deepEqual(kv, {
    DEVICEID: 'AJAZZ_AKP05',
    KEY: '3',
    TYPE: 'BUTTON',
    BITMAP: 'QUJD+/==',
    COLOR: '#ff0000',
    PRESSED: 'false',
  });
});

test('single-instance lock', () => {
  const f = path.join(os.tmpdir(), `ajazz-lock-${process.pid}.lock`);
  fs.rmSync(f, { force: true });
  assert.equal(lock.acquire(f, 111111111), true);
  // pid 1 stand-in: our own pid is alive, so a different claimant must be refused.
  fs.writeFileSync(f, String(process.pid));
  assert.equal(lock.acquire(f, process.pid + 1), false);
  assert.equal(lock.acquire(f, process.pid), true);
  fs.writeFileSync(f, '999999999');
  assert.equal(lock.acquire(f, process.pid), true, 'stale lock is taken over');
  lock.release(f);
  assert.equal(fs.existsSync(f), false);
});
