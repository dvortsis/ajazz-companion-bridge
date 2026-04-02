/**
 * MAIN ENGINE — Ajazz / Mirabox Companion Bridge (index.js)
 *
 * This file is the main program that connects your physical USB control surface to Bitfocus Companion
 * over the network. Companion (on your PC) exposes the Satellite protocol: a simple text-based API
 * over TCP. This process uses the `node-hid` library to talk USB (HID reports) on one side and a TCP
 * socket to Companion on the other—so the bridge acts as a translator the two systems do not need
 * to know about each other directly.
 *
 * Why two paths? USB delivers small binary packets when you press keys or when we push image data to
 * the screen. Companion speaks plain-text lines like KEY-PRESS and BITMAP. This file orchestrates both.
 *
 * Rough data flow:
 *   • Images: Companion sends BITMAP lines → we decode JPEG off-thread (image-worker.js) → HID writes
 *     chunk the picture to the correct LCD region (devices.js maps key indices to hardware slots).
 *   • Input: Device sends a HID report → parser.js decodes bytes into event names → devices.js maps
 *     those to Companion key indices → we send KEY-PRESS / KEY-ROTATE lines with CONTROLID="row/col".
 *
 * Configuration: `.env` (loaded via dotenv) can set Companion host/port and pacing; see env vars below.
 */
'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const util = require('util');
const HID = require('node-hid');
const net = require('net');
const { Worker } = require('worker_threads');
const SysTray = require('systray2').default;
const { parseHardwareEvent } = require('./parser.js');
const {
  SUPPORTED_DEVICES,
  getKeysTotal,
  INPUT_BEHAVIORS,
  isStatelessButtonEvent,
  VISUAL_MAP,
  INPUT_CORRECTION_MAP,
  getHwScreenFromCompanionKey,
} = require('./devices');

const S_HOST = process.env.COMPANION_HOST || '127.0.0.1';
const S_PORT = Number(process.env.COMPANION_PORT) || 16622;

const logStream = fs.createWriteStream(path.join(__dirname, 'bridge.log'), { flags: 'a' });
const stripAnsi = (str) => String(str).replace(/\x1b\[[0-9;]*m/g, '');

const originalLog = console.log;
const originalError = console.error;

console.log = function (...args) {
  const msg = util.format(...args);
  logStream.write(`[${new Date().toISOString()}] LOG: ${stripAnsi(msg)}\n`);
  originalLog.apply(console, args);
};

console.error = function (...args) {
  const msg = util.format(...args);
  logStream.write(`[${new Date().toISOString()}] ERR: ${stripAnsi(msg)}\n`);
  originalError.apply(console, args);
};

function companionKeyToMirajazzHw(k) {
  return mapPositionOpenDeck(k, false);
}

/** HW → Companion: match LCD/touch HW via VISUAL_MAP + INPUT_CORRECTION_MAP; encoder HW 15–22 passthrough. */
function mirajazzHwToCompanion(hw) {
  const h = hw | 0;
  for (let i = 0; i < 15; i++) {
    const match = Object.keys(INPUT_CORRECTION_MAP).some(
      (key) => INPUT_CORRECTION_MAP[key] === i && VISUAL_MAP[key] === h
    );
    if (match) return i;
  }
  if (h >= 15 && h <= 22) return h;
  return h;
}

function mapPositionOpenDeck(index, isInput) {
  if (isInput) return mirajazzHwToCompanion(index);
  return getHwScreenFromCompanionKey(index | 0);
}

/**
 * HID image path mirrors reference_mirajazz device.rs (reference_opendeck does not reimplement BAT).
 *
 * PID 0x3004 (Kind::Akp05E, reference_opendeck mappings.rs): image_format() is 112×112 JPEG @ protocol v3
 * (same helper for all pv3 kinds — no separate 72/100 path in repo). set_button_image → mirajazz only.
 *
 * BAT: mirajazz send_image always uses two 0x00 bytes at vec indices 9–10 after "BAT", then BE length, then key+1.
 * There is no 0x3004-specific "length immediately after BAT" layout in OpenDeck or mirajazz.
 *
 * Between chunks: setTimeout when delay > 0; setImmediate when 0 so the event loop is not starved.
 */
const HID_PACKET_PAYLOAD = 1024;
const HID_REPORT_LEN = HID_PACKET_PAYLOAD + 1;

const AKP05_BITMAP_SIZE = (() => {
  const n = parseInt(process.env.AKP05_IMAGE_SIZE || '112', 10);
  if (n === 72 || n === 112) return n;
  return 112;
})();

/** Milliseconds between consecutive 1025-byte HID chunks (default 0 = max throughput). Invalid env → 0. */
const HID_WRITE_DELAY_MS = (() => {
  const v = process.env.AKP05_HID_WRITE_DELAY_MS;
  if (v === undefined || v === '') return 0;
  const n = parseFloat(v);
  if (Number.isNaN(n) || n < 0) return 0;
  return n;
})();
console.log(
  '[HID] Inter-report delay:',
  HID_WRITE_DELAY_MS,
  'ms default 0 (set AKP05_HID_WRITE_DELAY_MS to add pacing)'
);

/** device.rs write_extended_data: payload.resize(1 + packet_size, 0) → 1025 bytes total. */
function buildExtendedReport(byteValues) {
  const buf = Buffer.alloc(HID_REPORT_LEN, 0);
  const src = Buffer.from(byteValues);
  src.copy(buf, 0, 0, Math.min(src.length, HID_REPORT_LEN));
  return buf;
}

/**
 * device.rs set_brightness — 12-byte payload: CRT\\0\\0LIG\\0\\0 then percent at index 11 (mirajazz vec last byte).
 * @param {number} percent 0–100
 */
function buildLigBrightnessReport(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) | 0));
  return buildExtendedReport([
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, p,
  ]);
}

/** Last brightness from Companion BRIGHTNESS command; keepalive LIG uses this (default 100). */
let companionBrightnessPercent = 100;

/**
 * device.rs send_image first packet — length is image_data.len() only; key+1 is separate at index 13.
 */
function buildBatPreambleReport(imageDataByteLength, keyIdxZeroBased) {
  const len = imageDataByteLength >>> 0;
  /** mirajazz send_image: BAT byte is key+1; HW 5–14 (LCD rows), HW 0–3 (touch strip). */
  const hw = Math.max(0, Math.min(23, Number(keyIdxZeroBased) | 0));
  const key = hw + 1;
  return buildExtendedReport([
    0x00,
    0x43,
    0x52,
    0x54,
    0x00,
    0x00,
    0x42,
    0x41,
    0x54,
    0x00,
    0x00,
    (len >> 8) & 0xff,
    len & 0xff,
    key,
  ]);
}

/** device.rs flush STP packet */
function buildStpReport() {
  return buildExtendedReport([0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x53, 0x54, 0x50]);
}

function chunkImagePayloadReports(imageBytes) {
  const packs = [];
  const bytes = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes);
  for (let offset = 0; offset < bytes.length; offset += HID_PACKET_PAYLOAD) {
    const sliceLen = Math.min(HID_PACKET_PAYLOAD, bytes.length - offset);
    const buf = Buffer.alloc(HID_REPORT_LEN, 0);
    buf[0] = 0x00;
    bytes.copy(buf, 1, offset, offset + sliceLen);
    packs.push(buf);
  }
  return packs;
}

const BITMAP_RE = /KEY=(\d+).*BITMAP="([^"]*)"/;
const MAX_PENDING_IMAGES = 24;

/** Same as reference_companion-satellite satellite/src/client/client.ts PING_INTERVAL */
const SATELLITE_PING_INTERVAL_MS = 100;

/** Set when a registry profile is matched and HID is opened; drives ADD-DEVICE and KEY-PRESS/ROTATE lines. */
let activeDeviceConfig = null;

/** Strip embedded quotes from id before wrapping as DEVICEID="..." (matches companion-satellite sendMessage). */
function sanitizeSatelliteDeviceId(id) {
  if (id == null || id === '') return id;
  return String(id).replace(/"/g, '').trim();
}

/** Legacy grid position as row/col string (companion-satellite client.ts keyDown KEY / CONTROLID). */
function companionKeyToRowColString(keyIdx) {
  const k = keyIdx | 0;
  const cols = activeDeviceConfig ? activeDeviceConfig.keysPerRow : 5;
  const row = Math.floor(k / cols);
  const col = k % cols;
  return `${row}/${col}`;
}

/**
 * Outbound lines match CompanionSatelliteClient.sendMessage(): KEY-PRESS / KEY-ROTATE (not KEY-STATE — that is server→client draw).
 * PRESSED uses 1/0; DEVICEID and KEY/CONTROLID use double quotes like the reference client.
 */
function buildKeyPressLine(keyIdx, pressed) {
  const id = sanitizeSatelliteDeviceId(activeDeviceConfig.id);
  const rc = companionKeyToRowColString(keyIdx);
  const p = pressed ? 1 : 0;
  return `KEY-PRESS DEVICEID="${id}" CONTROLID="${rc}" KEY="${rc}" PRESSED=${p}\n`;
}

function buildKeyRotateLine(keyIdx, directionRight) {
  const id = sanitizeSatelliteDeviceId(activeDeviceConfig.id);
  const rc = companionKeyToRowColString(keyIdx);
  const d = directionRight ? 1 : 0;
  return `KEY-ROTATE DEVICEID="${id}" CONTROLID="${rc}" KEY="${rc}" DIRECTION=${d}\n`;
}

/**
 * Minimal legacy ADD-DEVICE (Companion ServiceSatelliteApi.#addDevice): only required layout fields.
 * KEYS_TOTAL / KEYS_PER_ROW from activeDeviceConfig; BITMAPS matches AKP05_IMAGE_SIZE.
 *
 * Buffer: ASCII line + 0x0a (LF), or CRLF if SATELLITE_HANDSHAKE_CRLF=1.
 */
function buildAddDeviceHandshakeBuffer() {
  if (!activeDeviceConfig) {
    throw new Error('buildAddDeviceHandshakeBuffer: no active device');
  }
  const keysTotal = Number(getKeysTotal(activeDeviceConfig)) || 25;
  const keysPerRow = Number(activeDeviceConfig.keysPerRow) || 5;
  const id = sanitizeSatelliteDeviceId(activeDeviceConfig.id);
  const productName = String(activeDeviceConfig.name).replace(/"/g, '').trim();
  /** ADD-DEVICE DEVICEID="…" first (quoted value on wire); PRODUCT_NAME quoted per Companion regex. */
  const line = [
    'ADD-DEVICE',
    `DEVICEID="${id}"`,
    `PRODUCT_NAME="${productName}"`,
    `KEYS_TOTAL=${keysTotal}`,
    `KEYS_PER_ROW=${keysPerRow}`,
    `BITMAPS=${AKP05_BITMAP_SIZE}`,
  ].join(' ');
  const crlf = process.env.SATELLITE_HANDSHAKE_CRLF === '1';
  const wireSuffix = crlf ? '\r\n' : '\n';
  const wire = line + wireSuffix;
  console.log('\x1b[33m%s\x1b[0m', `[HANDSHAKE] ${JSON.stringify(wire)}`);
  const body = Buffer.from(line, 'ascii');
  const ending = crlf ? Buffer.from([0x0d, 0x0a]) : Buffer.from([0x0a]);
  return Buffer.concat([body, ending]);
}

function companionKeyFromHardwareEvent(ev) {
  return INPUT_CORRECTION_MAP[ev.event] ?? null;
}

let dev = null;
/** When no HID match, single pending scan retry (5s). */
let hidScanTimer = null;
/** Cleared on HID disconnect so reconnect does not stack keepalive timers. */
let hidKeepaliveInterval = null;
/** connectSockets() registers sSock handlers once; HID reconnect only reopens the device. */
let satelliteSocketSetupDone = false;

/** Set when system tray initializes successfully; used for Quit → shutdown + systray.kill. */
let systrayInstance = null;

function scheduleHidRetry() {
  if (hidScanTimer != null) return;
  hidScanTimer = setTimeout(() => {
    hidScanTimer = null;
    startHid();
  }, 5000);
}
/** Matches reference client.ts _handleReceivedData: split on \\n only, strip trailing \\r per line. */
let visualLineBuf = '';

/** companion-satellite client.ts: PING every 100ms once TCP connects (before/after BEGIN). */
let visualPingTimer = null;

/** Only react to first BEGIN per connection. */
let visualBeginHandled = false;
/** ADD-DEVICE buffer sent at most once per visual (sSock) connection — avoids duplicate Companion entries. */
let addDeviceHandshakeSent = false;
let satelliteAddDeviceOk = false;
const sSock = new net.Socket();

function satelliteInputReady() {
  return !sSock.destroyed && sSock.writable && satelliteAddDeviceOk;
}

function sendSatelliteInput(line) {
  sSock.write(line);
  console.log('\x1b[36m%s\x1b[0m', `[SATELLITE TX] ${JSON.stringify(line)}`);
}

let imageWorker = null;
let nextJobId = 1;
let imagePipelineBusy = false;
const inflight = new Map();
const imageQueue = [];

/** FIFO of HID output reports; drained by drainHidQueue(). LIG keepalive is skipped while length > 0. */
const hidWriteQueue = [];
let hidDrainRunning = false;

function ensureImageWorker() {
  if (imageWorker) return;
  try {
    imageWorker = new Worker(path.join(__dirname, 'image-worker.js'));
  } catch (e) {
    console.error('[IMAGE] worker start:', e.message || e);
    return;
  }
  imageWorker.on('message', onWorkerMessage);
  imageWorker.on('error', (e) => {
    console.error('[IMAGE] Worker Error:', e);
    imageWorker = null;
    imagePipelineBusy = false;
    setImmediate(pumpImageQueue);
  });
  imageWorker.on('exit', (code) => {
    imageWorker = null;
    imagePipelineBusy = false;
    if (code !== 0) console.error('[IMAGE] worker exit:', code);
    setImmediate(pumpImageQueue);
  });
}

function onWorkerMessage(msg) {
  if (!msg || typeof msg.id !== 'number') return;

  const meta = inflight.get(msg.id);
  inflight.delete(msg.id);

  if (!msg.ok) {
    console.error('[IMAGE]', msg.error || 'decode failed');
    imagePipelineBusy = false;
    setImmediate(pumpImageQueue);
    return;
  }

  if (msg.skipped) {
    imagePipelineBusy = false;
    setImmediate(pumpImageQueue);
    return;
  }

  const keyIdx = meta?.keyIdx ?? msg.keyIdx;
  const jpegBuf = Buffer.from(msg.jpeg != null ? msg.jpeg : msg.pixels);
  scheduleHidWrites(jpegBuf, keyIdx, () => {
    process.stdout.write('.');
    imagePipelineBusy = false;
    setImmediate(pumpImageQueue);
  });
}

/**
 * One worker job at a time so JPEG → scheduleHidWrites stays ordered; do not parallelize without an image-level HID lock.
 */
function pumpImageQueue() {
  if (imagePipelineBusy || imageQueue.length === 0) return;
  ensureImageWorker();
  if (!imageWorker) {
    imagePipelineBusy = false;
    return;
  }

  imagePipelineBusy = true;
  const job = imageQueue.shift();
  const id = nextJobId++;
  inflight.set(id, { keyIdx: job.keyIdx });
  imageWorker.postMessage({
    type: 'bitmap',
    id,
    keyIdx: job.keyIdx,
    base64: job.base64,
  });
}

/**
 * device.rs send_image + write_image_data_reports + flush (single cached image):
 * one BAT extended write, payload chunks, one STP (mirajazz sends STP once after the for-loop over images).
 */
function scheduleHidWrites(jpegBuffer, keyIdx, done) {
  if (!dev) {
    setImmediate(done);
    return;
  }

  const mirajazzKeyIdx = mapPositionOpenDeck(keyIdx, false);
  if (mirajazzKeyIdx == null || mirajazzKeyIdx === -1) {
    setImmediate(done);
    return;
  }

  const imageBytes = Buffer.isBuffer(jpegBuffer) ? jpegBuffer : Buffer.from(jpegBuffer);
  const packs = [
    buildBatPreambleReport(imageBytes.length, mirajazzKeyIdx),
    ...chunkImagePayloadReports(imageBytes),
    buildStpReport(),
  ];
  if (mirajazzKeyIdx >= 0 && mirajazzKeyIdx <= 3) {
    packs.push(buildLigBrightnessReport(companionBrightnessPercent));
  }

  enqueueHidReports(packs, done);
}

/** Enqueue one image’s HID packets in order; drainHidQueue serializes all dev.write (mutex for USB stream). */
function enqueueHidReports(packs, onComplete) {
  const n = packs.length;
  for (let i = 0; i < n; i++) {
    hidWriteQueue.push({
      buf: packs[i],
      onLast: i === n - 1 ? onComplete : null,
    });
  }
  startHidDrain();
}

function startHidDrain() {
  if (hidDrainRunning) return;
  hidDrainRunning = true;
  void drainHidQueue();
}

/** Single async drain: one dev.write at a time, FIFO — chunks from different images cannot interleave. */
async function drainHidQueue() {
  try {
    while (dev && hidWriteQueue.length > 0) {
      const item = hidWriteQueue.shift();
      try {
        dev.write(item.buf);
      } catch (e) {
        console.error('[HID] write:', e.message || e);
      }

      if (item.onLast) {
        try {
          item.onLast();
        } catch (e) {
          console.error('[HID] callback:', e.message || e);
        }
      }

      if (hidWriteQueue.length > 0) {
        if (HID_WRITE_DELAY_MS > 0) {
          await new Promise((r) => setTimeout(r, HID_WRITE_DELAY_MS));
        } else {
          await new Promise((r) => setImmediate(r));
        }
      }
    }
  } finally {
    hidDrainRunning = false;
  }
}

function appendVisualData(data) {
  visualLineBuf += data;
  let i = -1;
  let offset = 0;
  while ((i = visualLineBuf.indexOf('\n', offset)) !== -1) {
    let line = visualLineBuf.substring(offset, i);
    if (line.endsWith('\r')) line = line.substring(0, line.length - 1);
    offset = i + 1;
    handleVisualLine(line);
  }
  visualLineBuf = visualLineBuf.substring(offset);
}

function handleVisualLine(line) {
  const firstSpace = line.indexOf(' ');
  const cmd = firstSpace === -1 ? line : line.slice(0, firstSpace);
  const body = firstSpace === -1 ? '' : line.slice(firstSpace + 1);
  const cmdUp = cmd.toUpperCase();

  /** companion-satellite client.ts handleCommand: server can send PING; reply with PONG ${body} */
  if (cmdUp === 'PING') {
    if (!sSock.destroyed && sSock.writable) {
      try {
        sSock.write(`PONG ${body}\n`);
      } catch (_) {}
    }
    return;
  }
  if (cmdUp === 'PONG') {
    return;
  }

  const trimmed = line.trim();
  if (!trimmed) return;

  if (/^\s*BRIGHTNESS\b/i.test(trimmed)) {
    const idMatch = trimmed.match(/DEVICEID="([^"]+)"/);
    const valMatch = trimmed.match(/\bVALUE=(\d+)/);
    if (idMatch && activeDeviceConfig && idMatch[1] === activeDeviceConfig.id && valMatch) {
      const p = parseInt(valMatch[1], 10);
      if (!Number.isNaN(p)) {
        companionBrightnessPercent = Math.max(0, Math.min(100, p));
      }
    }
    return;
  }

  if (/^ADD-DEVICE\s+OK\b/i.test(trimmed)) {
    satelliteAddDeviceOk = true;
    console.log(`[COMPANION] ${trimmed}`);
    return;
  }
  if (/^ADD-DEVICE\s+ERROR\b/i.test(trimmed)) {
    console.error(`[COMPANION] ${trimmed}`);
    return;
  }

  if (cmdUp === 'BEGIN') {
    if (visualBeginHandled) return;
    visualBeginHandled = true;
    satelliteAddDeviceOk = false;
    console.log(
      `[VISUAL] BEGIN received; DEVICEID=${activeDeviceConfig ? activeDeviceConfig.id : '?'} — sending minimal ADD-DEVICE in 600ms…`
    );
    setTimeout(() => {
      if (sSock.destroyed || !sSock.writable) return;
      if (addDeviceHandshakeSent) return;
      addDeviceHandshakeSent = true;
      try {
        const handshakeBuffer = buildAddDeviceHandshakeBuffer();
        console.log('[DEBUG TX HEX]', handshakeBuffer.toString('hex'));
        sSock.write(handshakeBuffer);
      } catch (e) {
        addDeviceHandshakeSent = false;
        console.error('[VISUAL] ADD-DEVICE write failed:', e.message || e);
      }
    }, 600);
    return;
  }

  const m = trimmed.match(BITMAP_RE);
  if (m) {
    const keyIdx = parseInt(m[1], 10);
    const translatedIndex = getHwScreenFromCompanionKey(keyIdx);
    if (translatedIndex == null || translatedIndex === -1) {
      return;
    }
    console.log(`[VISUAL] Companion wants to draw Key ${keyIdx} at HID index ${translatedIndex}`);
    if (imageQueue.length < MAX_PENDING_IMAGES) {
      imageQueue.push({ keyIdx, base64: m[2] });
      pumpImageQueue();
    }
  } else if (trimmed.includes('ERROR') || trimmed.length < 200) {
    console.log(`[COMPANION] ${trimmed}`);
  }
}

/**
 * COMPANION SOCKET — Satellite API over TCP
 *
 * Bitfocus Companion listens for Satellite clients on a TCP port (default 16622; set COMPANION_PORT and
 * COMPANION_HOST in `.env` to point at another machine or port). This function configures one long-lived
 * socket: low latency (setNoDelay), keepalive, and handlers for connect / incoming data / disconnect.
 *
 * After connect, we send periodic PING lines so Companion knows we are alive, and we parse inbound
 * lines for PING (reply PONG), BEGIN (then ADD-DEVICE handshake), BITMAP (button art), and brightness.
 * Outbound KEY-PRESS and KEY-ROTATE lines generated from hardware go through this same socket.
 */
function connectSockets() {
  sSock.setNoDelay(true);
  sSock.setKeepAlive(true, 1000);

  sSock.on('connect', () => {
    console.log('[VISUAL] Connected.');
    visualBeginHandled = false;
    addDeviceHandshakeSent = false;
    satelliteAddDeviceOk = false;
    visualLineBuf = '';
    if (visualPingTimer) {
      clearInterval(visualPingTimer);
      visualPingTimer = null;
    }
    visualPingTimer = setInterval(() => {
      if (sSock.destroyed || !sSock.writable) return;
      try {
        sSock.write('PING\n');
      } catch (_) {}
    }, SATELLITE_PING_INTERVAL_MS);
  });

  sSock.on('data', (chunk) => {
    if (process.env.SATELLITE_DEBUG_HEX) {
      console.log('[DEBUG RX HEX]', chunk.toString('hex'));
    }
    appendVisualData(chunk.toString('utf8'));
  });

  sSock.on('close', () => {
    if (visualPingTimer) {
      clearInterval(visualPingTimer);
      visualPingTimer = null;
    }
    visualLineBuf = '';
    console.log('[VISUAL] Lost. Reconnecting...');
    setTimeout(() => {
      try {
        sSock.connect(S_PORT, S_HOST);
      } catch (_) {}
    }, 3000);
  });

  sSock.connect(S_PORT, S_HOST);
}

/**
 * HID CONNECTION — discover the deck on USB and send “wake” bytes
 *
 * `HID.devices()` asks the operating system for every HID device currently plugged in. We walk that list
 * and compare each entry’s Vendor ID (VID) and Product ID (PID) against `SUPPORTED_DEVICES` in devices.js.
 * VID identifies the manufacturer; PID identifies the exact product—together they are how Windows/Linux
 * tell one USB gadget from another.
 *
 * When a profile matches, we open that device’s `path` and send `initSequence`: short binary commands the
 * firmware expects to initialize the display controller (wake from idle, turn on backlights, set default
 * brightness). Without this step, later image writes may not appear on screen even though USB is connected.
 */
function startHid() {
  if (dev) return;
  try {
    const hidList = HID.devices();
    let matched = null;
    for (const hid of hidList) {
      if (!hid.path) continue;
      const profile = SUPPORTED_DEVICES.find(
        (s) =>
          hid.vendorId === s.vid &&
          hid.productId === s.pid &&
          (s.usagePage == null || hid.usagePage === s.usagePage)
      );
      if (profile) {
        matched = { hid, profile };
        break;
      }
    }
    if (!matched) {
      console.log('[HID] No supported devices found.');
      scheduleHidRetry();
      return;
    }
    if (hidScanTimer != null) {
      clearTimeout(hidScanTimer);
      hidScanTimer = null;
    }
    activeDeviceConfig = matched.profile;
    try {
      dev = new HID.HID(matched.hid.path);
    } catch (e) {
      console.error('[HID] Open failed:', e.message || e);
      activeDeviceConfig = null;
      scheduleHidRetry();
      return;
    }
    console.log('[HID] Secured.', activeDeviceConfig.name, `(VID ${activeDeviceConfig.vid.toString(16)} PID ${activeDeviceConfig.pid.toString(16)})`);
    for (const seq of activeDeviceConfig.initSequence) {
      dev.write(buildExtendedReport(seq));
    }
    companionBrightnessPercent = 100;
    if (!satelliteSocketSetupDone) {
      satelliteSocketSetupDone = true;
      setTimeout(connectSockets, 1000);
    }

    if (hidKeepaliveInterval) {
      clearInterval(hidKeepaliveInterval);
      hidKeepaliveInterval = null;
    }
    hidKeepaliveInterval = setInterval(() => {
      if (!dev) return;
      if (hidWriteQueue.length > 0) return;
      setImmediate(() => {
        if (!dev) return;
        if (hidWriteQueue.length > 0) return;
        try {
          dev.write(buildLigBrightnessReport(companionBrightnessPercent));
        } catch (e) {
          console.error('[HID] keepalive LIG:', e.message || e);
        }
      });
    }, 1000);

    /**
     * INPUT TRANSLATION — HID report → Companion KEY-PRESS / KEY-ROTATE
     *
     * Each time you touch the device, the firmware sends a binary HID report (a Buffer). We first check a
     * short “ACK” signature so we only parse real input frames. Two bytes inside the report describe *what*
     * happened; `parseHardwareEvent` in parser.js turns those into names like `button_2_3` or `encoder_1_left`.
     *
     * Next, `companionKeyFromHardwareEvent` uses devices.js (`INPUT_CORRECTION_MAP`) to convert that name into
     * a Companion key index (0 … KEYS_TOTAL−1). From the index we build a grid coordinate string
     * `row/col` (e.g. `1/2`) used as CONTROLID and KEY in the Satellite line—Companion uses that to match
     * the physical control to the cell in your layout.
     *
     * Ordinary keys become KEY-PRESS with PRESSED=1/0. Knobs emit KEY-ROTATE with DIRECTION for left/right.
     * Some controls only send a single “down” pulse; we optionally synthesize a quick release so Companion
     * sees a full click (see `isStatelessButtonEvent`).
     */
    dev.on('data', (d) => {
      if (d[0] !== 0x41 || d[1] !== 0x43 || d[2] !== 0x4b) return;
      if (!satelliteInputReady()) return;
      setImmediate(() => {
        try {
          const ev = parseHardwareEvent(
            d[9].toString(16).padStart(2, '0'),
            d[10].toString(16).padStart(2, '0')
          );
          if (!ev) return;
          const companionKey = companionKeyFromHardwareEvent(ev);
          const behavior =
            INPUT_BEHAVIORS[ev.event] || (ev.event.startsWith('button_') ? 'button' : 'encoder');

          let action;
          let scheduleAutoUp = false;

          if (behavior === 'encoder') {
            if (ev.event.includes('_left')) action = 'ROTATE-LEFT';
            else if (ev.event.includes('_right')) action = 'ROTATE-RIGHT';
            else action = ev.pressed ? 'DOWN' : 'UP';
          } else {
            if (isStatelessButtonEvent(ev.event)) {
              action = 'DOWN';
              scheduleAutoUp = true;
            } else {
              action = ev.pressed ? 'DOWN' : 'UP';
            }
          }

          if (companionKey == null) {
            console.warn(
              `\x1b[33m[UNMAPPED INPUT]\x1b[0m Hardware sent '${ev.event}' but it is not in devices.js (INPUT_CORRECTION_MAP)`
            );
            return;
          }
          let rotateDir;
          if (action.startsWith('ROTATE')) {
            rotateDir = action === 'ROTATE-RIGHT' ? 1 : 0;
          }
          if (satelliteInputReady() && activeDeviceConfig) {
            const key = companionKey;
            if (action === 'DOWN') {
              sendSatelliteInput(buildKeyPressLine(key, true));
            } else if (action === 'UP') {
              sendSatelliteInput(buildKeyPressLine(key, false));
            } else if (action.startsWith('ROTATE')) {
              sendSatelliteInput(buildKeyRotateLine(key, rotateDir === 1));
            }

            if (scheduleAutoUp && action === 'DOWN') {
              setTimeout(() => {
                if (!satelliteInputReady()) return;
                sendSatelliteInput(buildKeyPressLine(key, false));
              }, 50);
            }
          }
        } catch (e) {
          console.error('[INPUT]', e.message || e);
        }
      });
    });

    dev.on('error', (err) => {
      const msg = err && err.message != null ? err.message : String(err);
      console.error('\x1b[31m%s\x1b[0m', `[HID] Device Error: ${msg}`);
      // If the device actually disconnected, clear the reference so the write loops don't crash
      if (msg.includes('could not read')) {
        dev = null;
        activeDeviceConfig = null;
        if (hidKeepaliveInterval) {
          clearInterval(hidKeepaliveInterval);
          hidKeepaliveInterval = null;
        }
        console.log('[HID] Device disconnected. Please restart the bridge or reconnect the device.');
        scheduleHidRetry();
      }
    });
  } catch (e) {
    console.error('[HID] Error:', e.message);
  }
}

function shutdownFromTray() {
  try {
    if (dev) {
      dev.close();
      dev = null;
    }
  } catch (e) {
    console.warn('[TRAY] HID close:', e.message || e);
  }
  try {
    if (sSock && !sSock.destroyed) sSock.destroy();
  } catch (e) {
    console.warn('[TRAY] TCP destroy:', e.message || e);
  }
  const tray = systrayInstance;
  systrayInstance = null;
  if (tray) {
    tray
      .kill(false)
      .then(() => process.exit(0))
      .catch(() => process.exit(0));
  } else {
    process.exit(0);
  }
}

/**
 * SYSTEM TRAY — background operation on Windows
 *
 * The `systray2` module spawns a tiny helper that draws an icon in the Windows notification area (system tray).
 * That lets you run this bridge without keeping a console window in the foreground—useful when started from
 * a launcher script. The menu’s Quit item calls `shutdownFromTray`, which closes the HID handle, destroys
 * the Companion TCP socket so the port is freed, stops the tray helper, and exits the Node process—avoiding
 * orphaned USB or network resources when you leave for the day.
 */
function initSystemTray() {
  try {
    const iconPath = path.join(__dirname, 'AKP05_icon.ico');
    const iconData = fs.readFileSync(iconPath).toString('base64');
    const quitItem = {
      title: 'Quit',
      tooltip: 'Exit Ajazz Bridge',
      click: shutdownFromTray,
    };
    systrayInstance = new SysTray({
      menu: {
        icon: iconData,
        title: 'Ajazz Companion Bridge',
        tooltip: 'Ajazz Companion Bridge',
        items: [quitItem],
      },
      debug: false,
      copyDir: true,
    });
    systrayInstance.onClick((action) => {
      if (action.item.click != null) action.item.click();
    });
  } catch (e) {
    console.warn('[TRAY] System tray unavailable (missing AKP05_icon.ico or init failed):', e.message || e);
    systrayInstance = null;
  }
}

startHid();
initSystemTray();
