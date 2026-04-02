/**
 * Off-thread image pipeline — Companion raw RGB → JPEG (112×112). Uses devices.js for key→hardware mapping.
 */
'use strict';

const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const { getHwScreenFromCompanionKey } = require('./devices');

sharp.cache(false);
sharp.concurrency(1);

/** Companion satellite sends raw RGB at 112×112 for this surface (112×112×3 = 37,632 bytes). */
const RAW = 112;
const RAW_RGB_LEN = RAW * RAW * 3;

const JPEG_QUALITY = Math.min(100, Math.max(40, parseInt(process.env.AKP05_JPEG_QUALITY || '75', 10) || 75));

/** Baseline JPEG settings for embedded decoders (see Sharp JpegOptions). */
const JPEG_OUTPUT = {
  quality: JPEG_QUALITY,
  progressive: false,
  chromaSubsampling: '4:2:0',
  mozjpeg: false,
  optimizeScans: false,
  overshootDeringing: false,
};

/** Every key (including touch zones) is encoded as 112×112 for the device. */
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

    console.log(`[WORKER] Key ${keyIdx} -> HW ${hwIndex} | 112x112`);

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
