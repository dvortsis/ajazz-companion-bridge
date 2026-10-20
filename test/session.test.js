'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeckSession } = require('../session');
const { SUPPORTED_DEVICES } = require('../devices');
const { waitFor, FakeHid, FakeSatellite, FakeWorker, baseConfig, report } = require('./helpers');

function make(cfg = {}) {
  const hid = new FakeHid();
  const satellite = new FakeSatellite();
  const worker = new FakeWorker();
  const session = new DeckSession({
    hidInfo: { path: 'fake' },
    profile: SUPPORTED_DEVICES[0],
    deviceId: 'AJAZZ_AKP05',
    satellite,
    worker,
    config: { ...baseConfig, ...cfg },
    openHid: () => hid,
  });
  assert.equal(session.start(), true);
  return { hid, satellite, worker, session };
}

const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

test('init sequence is written and the device registers with Companion', () => {
  const { hid, satellite, session } = make();
  assert.equal(hid.writes.length, 3);
  assert.equal(hid.writes[0][6], 0x44); // DIS
  assert.equal(hid.writes[2][11], 100); // LIG 100%
  assert.equal(satellite.deviceId, 'AJAZZ_AKP05');
  session.close();
});

test('buttons send down and up; touch zones and pushes get a synthetic release', async () => {
  const { hid, satellite, session } = make();
  hid.emit('data', report(0x06, 1));
  hid.emit('data', report(0x06, 0));
  hid.emit('data', report(0x41)); // touch_2 → key 11
  hid.emit('data', report(0x35, 1)); // encoder_2_push → key 16
  hid.emit('data', report(0x35, 0)); // release packet must not click twice
  await waitFor(() => satellite.sent.length >= 6);
  await tick(30);
  assert.deepEqual(satellite.sent, [
    ['key', 5, true],
    ['key', 5, false],
    ['key', 11, true],
    ['key', 16, true],
    ['key', 11, false],
    ['key', 16, false],
  ]);
  session.close();
});

test('dial turns rotate the dial key; accel repeats fast same-direction ticks', async () => {
  const { hid, satellite, session } = make({ encoderAccel: 3 });
  hid.emit('data', report(0xa1)); // encoder_1_right
  await waitFor(() => satellite.sent.length === 1);
  hid.emit('data', report(0xa1));
  await waitFor(() => satellite.sent.length === 4);
  hid.emit('data', report(0xa0)); // direction change resets
  await waitFor(() => satellite.sent.length === 5);
  assert.deepEqual(satellite.sent.slice(0, 1), [['rot', 15, true]]);
  assert.deepEqual(satellite.sent[4], ['rot', 15, false]);
  session.close();
});

test('swipe swap and unmapped/unknown input', async () => {
  const { hid, satellite, session } = make({ swipeSwap: true });
  hid.emit('data', report(0x39)); // swipe_left → swapped to swipe_right → key 19
  hid.emit('data', report(0xee));
  await waitFor(() => satellite.sent.length >= 1);
  assert.deepEqual(satellite.sent[0], ['key', 19, true]);
  session.close();
});

test('input is ignored until Companion has accepted the device', async () => {
  const { hid, satellite, session } = make();
  satellite.ready = false;
  hid.emit('data', report(0x01, 1));
  await tick();
  assert.equal(satellite.sent.length, 0);
  session.close();
});

test('main key bitmap becomes one BAT for its slot; unchanged frames are not re-sent', async () => {
  const { hid, satellite, worker, session } = make();
  const before = hid.writes.length;
  satellite.handlers.onBitmap(0, 'AAAA'); // key 0 → slot 10 → BAT key byte 11
  await waitFor(() => hid.bats().length === 1);
  assert.equal(hid.bats()[0].key, 11);
  assert.equal(hid.bats()[0].len, 2500);
  satellite.handlers.onBitmap(0, 'AAAA');
  await tick(30);
  assert.equal(hid.bats().length, 1, 'identical frame skipped');
  satellite.handlers.onBitmap(0, 'BBBB');
  await waitFor(() => hid.bats().length === 2);
  assert.ok(hid.writes.length > before);
  assert.equal(worker.requests.filter((r) => !r.reset).length, 2);
  session.close();
});

test('keys without a screen are ignored', async () => {
  const { satellite, worker, session } = make();
  satellite.handlers.onBitmap(15, 'AAAA');
  satellite.handlers.onBitmap(99, 'AAAA');
  await tick(30);
  assert.equal(worker.requests.length, 0);
  session.close();
});

test('four strip bitmaps are batched into one upload on hardware slot 0', async () => {
  const { hid, satellite, worker, session } = make();
  for (const k of [10, 11, 12, 13]) satellite.handlers.onBitmap(k, `img${k}`);
  await waitFor(() => hid.bats().length === 1);
  await tick(30);
  assert.equal(hid.bats().length, 1);
  assert.equal(hid.bats()[0].key, 1);
  const jobs = worker.requests.filter((r) => r.strip);
  assert.equal(jobs.length, 4);
  assert.deepEqual(
    jobs.map((j) => j.render),
    [false, false, false, true]
  );
  assert.deepEqual(
    jobs.map((j) => j.strip.zone),
    [0, 1, 2, 3]
  );
  // The strip upload is followed by a brightness report.
  const last = hid.writes[hid.writes.length - 1];
  assert.equal(last[6], 0x4c);
  session.close();
});

test('a crashed worker job is retried once', async () => {
  const { hid, satellite, worker, session } = make();
  worker.crashOnce = true;
  satellite.handlers.onBitmap(2, 'CCCC');
  await waitFor(() => hid.bats().length === 1);
  assert.equal(worker.requests.filter((r) => !r.reset).length, 2);
  session.close();
});

test('brightness from Companion drives the keepalive; idle blanks and input wakes', async () => {
  const { hid, satellite, session } = make({ keepaliveMs: 20, idleOffMinutes: 1 });
  satellite.handlers.onBrightness(40);
  await waitFor(() => hid.writes.some((b) => b[6] === 0x4c && b[11] === 40));
  session.lastInput = Date.now() - 2 * 60000;
  session.idleCheck();
  await waitFor(() => hid.writes.some((b) => b[6] === 0x4c && b[11] === 0));
  hid.emit('data', report(0x01, 1));
  await waitFor(() => session.asleep === false);
  await waitFor(() => hid.writes[hid.writes.length - 1][11] === 40);
  session.close();
});

test('repeated write failures close the session, release Companion and clear timers', async () => {
  const { hid, satellite, session } = make({ keepaliveMs: 10 });
  let closed = 0;
  session.on('closed', () => closed++);
  hid.failWrites = true;
  await waitFor(() => closed === 1);
  assert.equal(satellite.removed, 'AJAZZ_AKP05');
  assert.equal(hid.closed, true);
});

test('a device error event closes the session once', async () => {
  const { hid, satellite, session } = make();
  let closed = 0;
  session.on('closed', () => closed++);
  hid.emit('error', new Error('could not read from HID device'));
  hid.emit('error', new Error('again'));
  assert.equal(closed, 1);
  assert.equal(satellite.removed, 'AJAZZ_AKP05');
  assert.equal(session.dev, null);
});

test('open failure reports false and leaves nothing registered', () => {
  const satellite = new FakeSatellite();
  const session = new DeckSession({
    hidInfo: { path: 'x' },
    profile: SUPPORTED_DEVICES[0],
    deviceId: 'A',
    satellite,
    worker: new FakeWorker(),
    config: baseConfig,
    openHid: () => {
      throw new Error('busy');
    },
  });
  assert.equal(session.start(), false);
  assert.equal(satellite.handlers, null);
});
