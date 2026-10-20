/**
 * image-worker.js — Background thread for preparing images so the main app stays responsive.
 *
 * Touch strip (e.g. AKP05, 800×112): Companion sends one square image per strip key. This worker keeps the
 * latest icon per zone (per device) and composites them onto one black strip canvas, then encodes the whole
 * strip as a single JPEG. Other keys are a single square JPEG each.
 *
 * Job:    { id, deviceId, base64, slot, dim?, strip?: {zone, geometry, padding, quality}, render?: bool }
 *         or { id, deviceId, reset: true } to forget a device's strip icons.
 *         `dim` is a 0-100 brightness percent; `render: false` stores a strip icon without producing an image.
 * Reply:  { id, ok, jpeg?, skipped?, error? }
 */
'use strict';

const { parentPort } = require('worker_threads');
const sharp = require('sharp');
const config = require('./config');
const { stripIconX } = require('./layout');

sharp.cache(false);
sharp.concurrency(1);

const OUT_SIZE = 112;
const RGB_112_LEN = 112 * 112 * 3;
const RGB_72_LEN = 72 * 72 * 3;

const JPEG_OUTPUT = {
  quality: config.jpegQuality,
  progressive: false,
  chromaSubsampling: '4:2:0',
  mozjpeg: false,
  optimizeScans: false,
  overshootDeringing: false,
};

/** deviceId → array of PNG icon buffers, one per strip zone. */
const stripState = new Map();

function log(level, msg) {
  parentPort.postMessage({ type: 'log', level, msg });
}

/** Companion bitmap bytes → sharp pipeline. Raw RGB 112² / 72² or any encoded image. */
function decode(imgBuffer) {
  if (imgBuffer.length === RGB_112_LEN) {
    return sharp(imgBuffer, { raw: { width: 112, height: 112, channels: 3 } });
  }
  if (imgBuffer.length === RGB_72_LEN) {
    return sharp(imgBuffer, { raw: { width: 72, height: 72, channels: 3 } });
  }
  return sharp(imgBuffer);
}

/** Software brightness for one key (percent); 100/undefined = untouched. */
function dimmed(pipeline, dim) {
  return dim === undefined || dim === null || dim >= 100
    ? pipeline
    : pipeline.modulate({ brightness: Math.max(0, dim) / 100 });
}

/** Resize to the icon size; 72px sources are upscaled with Lanczos, 112px is already 1:1. */
function fit(pipeline, size, sourceIsRaw112) {
  if (sourceIsRaw112) return pipeline;
  return pipeline.resize(size, size, { fit: 'fill', kernel: sharp.kernel.lanczos3 });
}

/** Black strip canvas, created once per geometry and reused for every composite. */
const baseCache = new Map();
function blankStrip({ width, height }) {
  const key = `${width}x${height}`;
  let buf = baseCache.get(key);
  if (!buf) baseCache.set(key, (buf = Buffer.alloc(width * height * 3)));
  return sharp(buf, { raw: { width, height, channels: 3 } });
}

async function renderStrip(deviceId, strip) {
  const { geometry, padding, quality } = strip;
  const icons = stripState.get(deviceId) || [];
  const xs = stripIconX(geometry, padding);
  const composites = [];
  for (let i = 0; i < geometry.zones; i++) {
    if (icons[i]) composites.push({ input: icons[i], left: xs[i], top: 0 });
  }
  return blankStrip(geometry)
    .composite(composites)
    .jpeg({ quality, progressive: false, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

parentPort.on('message', async (job) => {
  if (!job || job.type !== 'bitmap' || typeof job.id !== 'number') return;

  try {
    if (job.reset) {
      stripState.delete(job.deviceId);
      parentPort.postMessage({ id: job.id, ok: true, skipped: true });
      return;
    }

    const imgBuffer = Buffer.from(job.base64, 'base64');
    const isRaw112 = imgBuffer.length === RGB_112_LEN;

    if (job.strip) {
      const { geometry } = job.strip;
      const icon = await dimmed(fit(decode(imgBuffer), geometry.iconSize, isRaw112), job.dim)
        .rotate(180)
        .removeAlpha()
        .png()
        .toBuffer();

      let icons = stripState.get(job.deviceId);
      if (!icons) stripState.set(job.deviceId, (icons = new Array(geometry.zones).fill(null)));
      icons[job.strip.zone] = icon;

      if (!job.render) {
        parentPort.postMessage({ id: job.id, ok: true, skipped: true });
        return;
      }
      const jpeg = await renderStrip(job.deviceId, job.strip);
      parentPort.postMessage({ id: job.id, ok: true, jpeg });
      return;
    }

    log('debug', `[WORKER] ${job.deviceId} slot ${job.slot} | ${OUT_SIZE}x${OUT_SIZE}`);
    const jpeg = await dimmed(fit(decode(imgBuffer), OUT_SIZE, isRaw112), job.dim)
      .rotate(180)
      .removeAlpha()
      .jpeg(JPEG_OUTPUT)
      .toBuffer();
    parentPort.postMessage({ id: job.id, ok: true, jpeg });
  } catch (e) {
    parentPort.postMessage({ id: job.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});
