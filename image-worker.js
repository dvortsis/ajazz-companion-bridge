/**
 * image-worker.js — Background thread for preparing images so the main app stays responsive.
 *
 * AKP05 “giant canvas” touch strip:
 *   The bottom strip is physically one long 800×112 screen. Companion still sends four separate button
 *   images (one per soft key). This worker stitches those four square icons onto a single black 800×112
 *   image—like placing four stickers on one strip—then encodes that whole strip as one JPEG for USB.
 *   Other keys (main LCD) stay a single square image each.
 */
'use strict';

const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const { getHwScreenFromCompanionKey } = require('./devices');

const NUM_TOUCH_KEYS = Math.min(7, Math.max(1, parseInt(process.env.AKP05_TOUCH_KEYS || '4', 10)));
const touchState = new Array(NUM_TOUCH_KEYS).fill(null);
const TOUCH_X = [];
const ZONE_WIDTH = 800 / NUM_TOUCH_KEYS;
for (let i = 0; i < NUM_TOUCH_KEYS; i++) {
  TOUCH_X.push(Math.round(i * ZONE_WIDTH + (ZONE_WIDTH - 112) / 2));
}
TOUCH_X.reverse();

sharp.cache(false);
sharp.concurrency(1);

/** Typical BITMAP payload from Companion: raw RGB, one square per key. */
const RAW = 112;
const RAW_RGB_LEN = RAW * RAW * 3;

const JPEG_QUALITY = Math.min(100, Math.max(40, parseInt(process.env.AKP05_JPEG_QUALITY || '75', 10) || 75));

/** JPEG settings for the device decoder (quality overridable with AKP05_JPEG_QUALITY). */
const JPEG_OUTPUT = {
  quality: JPEG_QUALITY,
  progressive: false,
  chromaSubsampling: '4:2:0',
  mozjpeg: false,
  optimizeScans: false,
  overshootDeringing: false,
};

const OUT_SIZE = 112;

parentPort.on('message', async (job) => {
  if (!job || job.type !== 'bitmap' || typeof job.id !== 'number') return;

  try {
    const keyIdx = job.keyIdx != null ? job.keyIdx | 0 : 0;
    const hwIndex = getHwScreenFromCompanionKey(keyIdx);
    if (hwIndex == null || hwIndex < 0) {
      parentPort.postMessage({
        id: job.id,
        keyIdx: job.keyIdx,
        ok: true,
        skipped: true,
      });
      return;
    }

    const imgBuffer = Buffer.from(job.base64, 'base64');

    let pipeline;
    if (imgBuffer.length === RAW_RGB_LEN) {
      pipeline = sharp(imgBuffer, {
        raw: { width: RAW, height: RAW, channels: 3 },
      });
    } else if (imgBuffer.length === 15552) {
      pipeline = sharp(imgBuffer, { raw: { width: 72, height: 72, channels: 3 } });
    } else {
      pipeline = sharp(imgBuffer);
    }

    const isTouch = hwIndex >= 0 && hwIndex <= 3;

    if (isTouch) {
      // Strip path: prepare each icon, keep PNG buffers for layering, then one JPEG for the full bar.
      const iconBuf = await pipeline
        .resize(112, 112, { fit: 'fill', kernel: sharp.kernel.nearest })
        .rotate(180)
        .removeAlpha()
        .png()
        .toBuffer();

      if (hwIndex < NUM_TOUCH_KEYS) {
        touchState[hwIndex] = iconBuf;
      }

      const composites = [];
      for (let i = 0; i < NUM_TOUCH_KEYS; i++) {
        if (touchState[i]) {
          composites.push({
            input: touchState[i],
            left: TOUCH_X[i],
            top: 0,
          });
        }
      }

      const jpeg = await sharp({
        create: {
          width: 800,
          height: 112,
          channels: 3,
          background: { r: 0, g: 0, b: 0 },
        },
      })
        .composite(composites)
        .jpeg({ quality: 75, progressive: false, chromaSubsampling: '4:2:0' })
        .toBuffer();

      parentPort.postMessage({ id: job.id, keyIdx: job.keyIdx, ok: true, jpeg });
      return;
    }

    console.log(`[WORKER] Key ${keyIdx} -> HW ${hwIndex} | 112x112`);

    const jpeg = await pipeline
      .resize(OUT_SIZE, OUT_SIZE, { fit: 'fill', kernel: sharp.kernel.nearest })
      .rotate(180)
      .removeAlpha()
      .jpeg(JPEG_OUTPUT)
      .toBuffer();

    parentPort.postMessage({
      id: job.id,
      keyIdx: job.keyIdx,
      ok: true,
      jpeg,
    });
  } catch (e) {
    parentPort.postMessage({
      id: job.id,
      keyIdx: job.keyIdx,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});
