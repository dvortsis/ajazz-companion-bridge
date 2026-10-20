'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const { SatelliteClient } = require('../src/satellite');
const { SUPPORTED_DEVICES } = require('../src/devices');
const { waitFor } = require('./helpers');

/** Minimal Companion Satellite server: collects lines per connection. */
function startServer(onConn) {
  const conns = [];
  const server = net.createServer((sock) => {
    const c = { sock, lines: [], buf: '' };
    conns.push(c);
    sock.on('data', (d) => {
      c.buf += d.toString();
      let i;
      while ((i = c.buf.indexOf('\n')) !== -1) {
        c.lines.push(c.buf.slice(0, i));
        c.buf = c.buf.slice(i + 1);
      }
    });
    sock.on('error', () => {});
    if (onConn) onConn(c);
  });
  return new Promise((res) => server.listen(0, '127.0.0.1', () => res({ server, conns, port: server.address().port })));
}

const opts = (port, extra = {}) => ({
  host: '127.0.0.1',
  port,
  bitmapSize: 112,
  pingIntervalMs: 50,
  linkTimeoutMs: 400,
  reconnectMinMs: 50,
  reconnectMaxMs: 200,
  handshakeCrlf: false,
  debugHex: false,
  beginDelayMs: 10,
  ...extra,
});

test('handshake, bitmaps, brightness, keys, held-key release and removal', async () => {
  const { server, conns, port } = await startServer((c) => c.sock.write('BEGIN CompanionVersion=4.2.6\n'));
  const client = new SatelliteClient(opts(port));
  const got = { bitmaps: [], brightness: [], ready: 0 };
  client.addDevice('AJAZZ_AKP05', SUPPORTED_DEVICES[0], {
    onBitmap: (k, b) => got.bitmaps.push([k, b]),
    onBrightness: (p) => got.brightness.push(p),
    onReady: () => got.ready++,
  });
  client.start();

  await waitFor(() => conns[0] && conns[0].lines.some((l) => l.startsWith('ADD-DEVICE')));
  assert.equal(
    conns[0].lines.find((l) => l.startsWith('ADD-DEVICE')),
    'ADD-DEVICE DEVICEID="AJAZZ_AKP05" PRODUCT_NAME="Ajazz AKP05E" KEYS_TOTAL=20 KEYS_PER_ROW=5 BITMAPS=112'
  );
  assert.equal(client.sendKey('AJAZZ_AKP05', 3, true), false, 'not ready before ADD-DEVICE OK');

  const s = conns[0].sock;
  s.write('ADD-DEVICE OK DEVICEID="AJAZZ_AKP05"\n');
  await waitFor(() => client.isReady('AJAZZ_AKP05'));
  assert.equal(got.ready, 1);

  s.write('KEY-STATE DEVICEID="AJAZZ_AKP05" KEY=10 TYPE=BUTTON BITMAP="QUJDRA==" PRESSED=false\r\n');
  s.write('BRIGHTNESS DEVICEID="AJAZZ_AKP05" VALUE=55\n');
  s.write('PING abc\n');
  await waitFor(() => got.bitmaps.length === 1 && got.brightness.length === 1);
  assert.deepEqual(got.bitmaps[0], [10, 'QUJDRA==']);
  assert.deepEqual(got.brightness, [55]);
  await waitFor(() => conns[0].lines.includes('PONG abc'));
  await waitFor(() => conns[0].lines.includes('PING'));

  assert.equal(client.sendKey('AJAZZ_AKP05', 7, true), true);
  assert.equal(client.sendRotate('AJAZZ_AKP05', 15, true), true);
  client.releaseAll('AJAZZ_AKP05');
  client.removeDevice('AJAZZ_AKP05');
  await waitFor(() => conns[0].lines.some((l) => l.startsWith('REMOVE-DEVICE')));
  const lines = conns[0].lines;
  assert.ok(lines.includes('KEY-PRESS DEVICEID="AJAZZ_AKP05" CONTROLID="1/2" KEY="1/2" PRESSED=1'));
  assert.ok(
    lines.includes('KEY-PRESS DEVICEID="AJAZZ_AKP05" CONTROLID="1/2" KEY="1/2" PRESSED=0'),
    'held key released'
  );
  assert.ok(lines.includes('KEY-ROTATE DEVICEID="AJAZZ_AKP05" CONTROLID="3/0" KEY="3/0" DIRECTION=1'));
  assert.ok(lines.includes('REMOVE-DEVICE DEVICEID="AJAZZ_AKP05"'));

  client.stop();
  server.close();
});

test('a deck plugged in after BEGIN is registered immediately; messages route by DEVICEID', async () => {
  const { server, conns, port } = await startServer((c) => c.sock.write('BEGIN\n'));
  const client = new SatelliteClient(opts(port));
  client.start();
  await waitFor(() => client.beginHandled);
  const a = [];
  const b = [];
  client.addDevice('A', SUPPORTED_DEVICES[0], { onBitmap: (k) => a.push(k) });
  client.addDevice('B', SUPPORTED_DEVICES[0], { onBitmap: (k) => b.push(k) });
  await waitFor(() => conns[0].lines.filter((l) => l.startsWith('ADD-DEVICE')).length === 2);
  conns[0].sock.write('KEY-STATE DEVICEID="B" KEY=2 BITMAP="AA=="\n');
  await waitFor(() => b.length === 1);
  assert.equal(a.length, 0);
  client.stop();
  server.close();
});

test('reconnects after the server drops and re-registers; backoff never exceeds the maximum', async () => {
  const { server, conns, port } = await startServer((c) => c.sock.write('BEGIN\n'));
  const client = new SatelliteClient(opts(port));
  client.addDevice('A', SUPPORTED_DEVICES[0], {});
  const events = [];
  client.on('connected', () => events.push('up'));
  client.on('disconnected', () => events.push('down'));
  client.start();
  await waitFor(() => conns[0] && conns[0].lines.some((l) => l.startsWith('ADD-DEVICE')));
  conns[0].sock.destroy();
  await waitFor(() => conns.length === 2 && conns[1].lines.some((l) => l.startsWith('ADD-DEVICE')));
  assert.deepEqual(events.slice(0, 3), ['up', 'down', 'up']);
  client.stop();
  server.close();
});

test('refused connection does not crash; connects once Companion appears', async () => {
  // Reserve a free port, close it, start the client against it, then start a server there.
  const probe = net.createServer();
  await new Promise((r) => probe.listen(0, '127.0.0.1', r));
  const port = probe.address().port;
  await new Promise((r) => probe.close(r));

  const client = new SatelliteClient(opts(port));
  client.start();
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(client.connected, false);

  const conns = [];
  const server = net.createServer((s) => {
    conns.push(s);
    s.on('error', () => {});
  });
  await new Promise((r) => server.listen(port, '127.0.0.1', r));
  await waitFor(() => client.connected, 3000);
  client.stop();
  conns.forEach((s) => s.destroy());
  server.close();
});

test('a silent link is dropped after the timeout', async () => {
  const { server, conns, port } = await startServer();
  const client = new SatelliteClient(opts(port, { linkTimeoutMs: 150, reconnectMinMs: 5000, reconnectMaxMs: 5000 }));
  client.start();
  await waitFor(() => client.connected);
  await waitFor(() => !client.connected, 2000);
  assert.equal(conns.length, 1);
  client.stop();
  server.close();
});
