'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { DeviceManager, deviceKey } = require('../src/manager');
const { waitFor, FakeHid, FakeSatellite, FakeWorker, baseConfig, report } = require('./helpers');

const akp = (extra = {}) => ({
  path: 'path-1',
  vendorId: 0x0300,
  productId: 0x3004,
  usagePage: 65440,
  serialNumber: 'S1',
  ...extra,
});

function makeHid(entries) {
  const opened = [];
  return {
    entries,
    opened,
    devices() {
      return this.entries;
    },
    HID: class {
      constructor(p) {
        const h = new FakeHid();
        h.path = p;
        opened.push(h);
        return h;
      }
    },
  };
}

function manager(hid, satellite = new FakeSatellite()) {
  return new DeviceManager({ hid, satellite, worker: new FakeWorker(), config: { ...baseConfig, hidScanMs: 20 } });
}

test('opens a matching deck once, ignores other HID devices and duplicate interfaces', () => {
  const hid = makeHid([{ path: 'kbd', vendorId: 1, productId: 2, usagePage: 1 }, akp(), akp({ path: 'path-1b' })]);
  const m = manager(hid);
  m.scan();
  m.scan();
  assert.equal(hid.opened.length, 1);
  assert.equal(m.sessions.size, 1);
  assert.equal(m.describe(), 'Ajazz AKP05E');
  m.stop();
});

test('keeps scanning with nothing plugged in, then opens the deck when it appears', async () => {
  const hid = makeHid([]);
  const m = manager(hid);
  m.start();
  assert.equal(m.sessions.size, 0);
  assert.equal(m.describe(), 'No deck connected');
  hid.entries = [akp()];
  await waitFor(() => m.sessions.size === 1);
  m.stop();
});

test('replug: a lost session is replaced on the next scan and re-registered with Companion', async () => {
  const sat = new FakeSatellite();
  const hid = makeHid([akp()]);
  const m = manager(hid, sat);
  m.start();
  await waitFor(() => hid.opened.length === 1);
  hid.opened[0].emit('error', new Error('could not read from HID device'));
  assert.equal(sat.removed, 'AJAZZ_AKP05');
  assert.equal(m.sessions.size, 0);
  await waitFor(() => hid.opened.length === 2);
  assert.equal(m.sessions.size, 1);
  assert.equal(sat.deviceId, 'AJAZZ_AKP05');
  m.stop();
});

test('a second deck of the same model gets a distinct device id', () => {
  const hid = makeHid([akp(), akp({ path: 'path-2', serialNumber: 'S2' })]);
  const m = manager(hid);
  m.scan();
  const ids = [...m.sessions.values()].map((s) => s.deviceId);
  assert.deepEqual(ids, ['AJAZZ_AKP05', 'AJAZZ_AKP05_S2']);
  assert.notEqual(deviceKey(akp()), deviceKey(akp({ serialNumber: 'S2' })));
  m.stop();
});

test('a deck that fails to open is retried, not left half-registered', () => {
  const hid = makeHid([akp()]);
  hid.HID = class {
    constructor() {
      throw new Error('in use by another application');
    }
  };
  const m = manager(hid);
  m.scan();
  assert.equal(m.sessions.size, 0);
  m.scan();
  assert.equal(m.sessions.size, 0);
});

const net = require('net');
const { SatelliteClient } = require('../src/satellite');

test('two decks through the real satellite client: separate ids, routing, input and removal', async () => {
  const conns = [];
  const server = net.createServer((s) => {
    const c = { s, lines: [], buf: '' };
    conns.push(c);
    s.on('data', (d) => {
      c.buf += d;
      let i;
      while ((i = c.buf.indexOf('\n')) !== -1) {
        c.lines.push(c.buf.slice(0, i));
        c.buf = c.buf.slice(i + 1);
      }
    });
    s.on('error', () => {});
    s.write('BEGIN\n');
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const satellite = new SatelliteClient({
    host: '127.0.0.1',
    port: server.address().port,
    bitmapSize: 112,
    pingIntervalMs: 1000,
    linkTimeoutMs: 5000,
    reconnectMinMs: 50,
    reconnectMaxMs: 100,
    beginDelayMs: 5,
  });
  satellite.start();

  const hid = makeHid([akp(), akp({ path: 'path-2', serialNumber: 'S2' })]);
  const worker = new FakeWorker();
  const m = new DeviceManager({ hid, satellite, worker, config: { ...baseConfig, hidScanMs: 20 } });
  m.start();
  await waitFor(() => conns[0] && conns[0].lines.filter((l) => l.startsWith('ADD-DEVICE')).length === 2);
  const adds = conns[0].lines.filter((l) => l.startsWith('ADD-DEVICE'));
  assert.ok(adds.some((l) => l.includes('DEVICEID="AJAZZ_AKP05" ')));
  assert.ok(adds.some((l) => l.includes('DEVICEID="AJAZZ_AKP05_S2"')));

  conns[0].s.write('ADD-DEVICE OK DEVICEID="AJAZZ_AKP05"\nADD-DEVICE OK DEVICEID="AJAZZ_AKP05_S2"\n');
  await waitFor(() => satellite.isReady('AJAZZ_AKP05') && satellite.isReady('AJAZZ_AKP05_S2'));

  // A bitmap for deck 2 is drawn on deck 2's USB handle only.
  conns[0].s.write('KEY-STATE DEVICEID="AJAZZ_AKP05_S2" KEY=5 BITMAP="AAAA"\n');
  await waitFor(() => hid.opened[1].bats().length === 1);
  assert.equal(hid.opened[0].bats().length, 0);
  assert.equal(hid.opened[1].bats()[0].key, 6);

  // Input on deck 1 is sent as deck 1.
  hid.opened[0].emit('data', report(0x01, 1));
  await waitFor(() => conns[0].lines.some((l) => l.startsWith('KEY-PRESS DEVICEID="AJAZZ_AKP05" ')));

  // Unplugging deck 2 removes only deck 2.
  hid.opened[1].emit('error', new Error('could not read from HID device'));
  await waitFor(() => conns[0].lines.includes('REMOVE-DEVICE DEVICEID="AJAZZ_AKP05_S2"'));
  assert.ok(!conns[0].lines.some((l) => l === 'REMOVE-DEVICE DEVICEID="AJAZZ_AKP05"'));

  m.stop();
  satellite.stop();
  server.close();
});
