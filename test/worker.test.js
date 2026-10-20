'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { WorkerClient } = require('../worker-client');

const geometry = { width: 800, height: 112, iconSize: 112, zones: 4 };
const stripJob = (deviceId, zone, base64, render) => ({
  deviceId,
  base64,
  slot: zone,
  render,
  strip: { zone, geometry, padding: 0, quality: 90 },
});

const solid = (r, g, b, size = 112) => {
  const buf = Buffer.alloc(size * size * 3);
  for (let i = 0; i < buf.length; i += 3) {
    buf[i] = r;
    buf[i + 1] = g;
    buf[i + 2] = b;
  }
  return buf.toString('base64');
};

async function pixel(jpeg, x, y) {
  const { data, info } = await sharp(jpeg).raw().toBuffer({ resolveWithObject: true });
  const o = (y * info.width + x) * info.channels;
  return [data[o], data[o + 1], data[o + 2]];
}

test('worker: main key → 112×112 JPEG, 72px sources are accepted', async () => {
  const w = new WorkerClient();
  try {
    for (const size of [112, 72]) {
      const reply = await w.request({ deviceId: 'd', slot: 10, base64: solid(255, 0, 0, size) });
      const meta = await sharp(reply.jpeg).metadata();
      assert.equal(meta.format, 'jpeg');
      assert.equal(meta.width, 112);
      assert.equal(meta.height, 112);
      const [r, g, b] = await pixel(reply.jpeg, 50, 50);
      assert.ok(r > 200 && g < 60 && b < 60);
    }
  } finally {
    await w.terminate();
  }
});

test('worker: strip is one 800×112 JPEG; outer icons touch the edges; zone order is mirrored', async () => {
  const w = new WorkerClient();
  try {
    const skipped = await w.request(stripJob('d', 0, solid(255, 255, 255), false));
    assert.equal(skipped.skipped, true);
    await w.request(stripJob('d', 3, solid(255, 255, 255), false));
    const reply = await w.request(stripJob('d', 1, solid(255, 255, 255), true));
    const meta = await sharp(reply.jpeg).metadata();
    assert.equal(meta.width, 800);
    assert.equal(meta.height, 112);
    // zone 0 → x 688..799, zone 3 → x 0..111, zone 1 → x 459..570; zone 2 is empty.
    for (const x of [694, 799, 2, 109, 465, 565]) assert.ok((await pixel(reply.jpeg, x, 56))[0] > 200, `x=${x} bright`);
    for (const x of [300, 345, 600, 680]) assert.ok((await pixel(reply.jpeg, x, 56))[0] < 40, `x=${x} dark`);
  } finally {
    await w.terminate();
  }
});

test('worker: strip state is per device and can be reset', async () => {
  const w = new WorkerClient();
  try {
    await w.request(stripJob('a', 0, solid(255, 255, 255), false));
    const b = await w.request(stripJob('b', 3, solid(255, 255, 255), true));
    assert.ok((await pixel(b.jpeg, 740, 56))[0] < 40, "device a's icon must not leak into b");
    await w.request({ deviceId: 'a', reset: true });
    const a = await w.request(stripJob('a', 3, solid(255, 255, 255), true));
    assert.ok((await pixel(a.jpeg, 740, 56))[0] < 40, 'reset dropped the old zone 0 icon');
  } finally {
    await w.terminate();
  }
});

test('worker: undecodable data is reported as an error, not a crash', async () => {
  const w = new WorkerClient();
  try {
    await assert.rejects(
      w.request({ deviceId: 'd', slot: 10, base64: Buffer.from('not an image').toString('base64') })
    );
    const ok = await w.request({ deviceId: 'd', slot: 10, base64: solid(0, 255, 0) });
    assert.ok(ok.jpeg.length > 100);
  } finally {
    await w.terminate();
  }
});

test('worker client: a killed worker rejects in-flight jobs with workerCrashed and restarts', async () => {
  const w = new WorkerClient();
  try {
    await w.request({ deviceId: 'd', slot: 10, base64: solid(1, 2, 3) });
    const pending = w.request({ deviceId: 'd', slot: 10, base64: solid(1, 2, 3) });
    await w.worker.terminate();
    await assert.rejects(pending, (e) => e.workerCrashed === true);
    const again = await w.request({ deviceId: 'd', slot: 10, base64: solid(1, 2, 3) });
    assert.ok(again.jpeg);
  } finally {
    await w.terminate();
  }
});
