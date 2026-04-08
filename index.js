/**
 * index.js — Main program: connects your deck to Bitfocus Companion over the network.
 *
 * Outbound: Companion says which key image to show; we prepare it and send it over USB.
 * Inbound: The deck sends “you pressed this”; we turn that into Companion key presses or knob spins.
 *
 * Optional settings: `.env` (host, port, delays, etc.).
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

/** Map a hardware screen index back to a Companion key index (rare code paths). */
function mirajazzHwToCompanion(hw) {
  const h = hw | 0;
  for (let i = 0; i < 32; i++) {
    const match = Object.keys(INPUT_CORRECTION_MAP).some(
      (key) => INPUT_CORRECTION_MAP[key] === i && VISUAL_MAP[key] === h
    );
    if (match) return i;
  }
  if (h >= 15 && h <= 22) return h;
  return h;
}

/** Companion key index → draw slot from devices.js (VISUAL_MAP). */
function mapPositionOpenDeck(index, isInput) {
  if (isInput) return mirajazzHwToCompanion(index);
  return getHwScreenFromCompanionKey(index | 0);
}

/**
 * Sending pictures over USB: each chunk is up to 1024 bytes of image data in a 1025-byte HID report.
 * Optional pause between chunks: AKP05_HID_WRITE_DELAY_MS.
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

/** Build one HID output report (leading byte + payload, padded to fixed length). */
function buildExtendedReport(byteValues) {
  const buf = Buffer.alloc(HID_REPORT_LEN, 0);
  const src = Buffer.from(byteValues);
  src.copy(buf, 0, 0, Math.min(src.length, HID_REPORT_LEN));
  return buf;
}

/** Backlight / brightness command (0–100%). */
function buildLigBrightnessReport(percent) {
  const p = Math.max(0, Math.min(100, Number(percent) | 0));
  return buildExtendedReport([
    0x00, 0x43, 0x52, 0x54, 0x00, 0x00, 0x4c, 0x49, 0x47, 0x00, 0x00, p,
  ]);
}

/** Last brightness from Companion BRIGHTNESS command; keepalive LIG uses this (default 100). */
let companionBrightnessPercent = 100;

/**
 * First packet of an image transfer: JPEG size plus which hardware slot should receive it.
 * Touch strip: the four zones use Virtual IDs in VISUAL_MAP (often 100–103, or 0–3 here) so strip art does
 * not overwrite main LCD slots (5–14). When sending the combined 800×112 strip, we pass slot 0 into this
 * function so the device paints the wide image on the physical touch bar (see scheduleHidWrites).
 */
function buildBatPreambleReport(imageDataByteLength, keyIdxZeroBased) {
  const len = imageDataByteLength >>> 0;
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

/** Marks the end of the image data stream. */
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

/** How often we ping Companion on the TCP link (milliseconds). */
const SATELLITE_PING_INTERVAL_MS = 100;

/** Set when a registry profile is matched and HID is opened; drives ADD-DEVICE and KEY-PRESS/ROTATE lines. */
let activeDeviceConfig = null;

/** Strip embedded quotes from id before wrapping as DEVICEID="..." (matches companion-satellite sendMessage). */
function sanitizeSatelliteDeviceId(id) {
  if (id == null || id === '') return id;
  return String(id).replace(/"/g, '').trim();
}

/** Companion key index → "row/col" text for Satellite KEY-PRESS / KEY-ROTATE lines. */
function companionKeyToRowColString(keyIdx) {
  const k = keyIdx | 0;
  const cols = activeDeviceConfig ? activeDeviceConfig.keysPerRow : 5;
  const row = Math.floor(k / cols);
  const col = k % cols;
  return `${row}/${col}`;
}

/** One KEY-PRESS line for Companion (down or up). */
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
 * Registers the deck with Companion: key count, columns, bitmap size. Line ends with LF or CRLF
 * (SATELLITE_HANDSHAKE_CRLF=1).
 */
function buildAddDeviceHandshakeBuffer() {
  if (!activeDeviceConfig) {
    throw new Error('buildAddDeviceHandshakeBuffer: no active device');
  }
  const keysTotal = Number(getKeysTotal(activeDeviceConfig)) || 25;
  const keysPerRow = Number(activeDeviceConfig.keysPerRow) || 5;
  const id = sanitizeSatelliteDeviceId(activeDeviceConfig.id);
  const productName = String(activeDeviceConfig.name).replace(/"/g, '').trim();
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
/** Incoming TCP text buffer; lines split on newline. */
let visualLineBuf = '';

/** Timer for periodic PING lines to Companion. */
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

/** Outgoing USB packets queued here and sent one at a time (keeps the device from seeing mixed images). */
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

/** Process one BITMAP at a time so USB packets stay in order. */
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
 * Send one image: preamble (BAT), all payload chunks, then end marker (STP). Optionally a brightness packet
 * after touch-strip uploads.
 *
 * Virtual IDs & touch strip: VISUAL_MAP uses separate numbers for the four strip keys (e.g. 100–103, or 0–3)
 * so strip drawing never targets the main LCD indices (5–14). For that combined strip image, we call
 * buildBatPreambleReport with hardware slot 0 so the wide JPEG is applied to the physical touch bar.
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
  const isTouch = mirajazzKeyIdx >= 0 && mirajazzKeyIdx <= 3;
  const packs = [
    buildBatPreambleReport(imageBytes.length, isTouch ? 0 : mirajazzKeyIdx),
    ...chunkImagePayloadReports(imageBytes),
    buildStpReport(),
  ];
  if (isTouch) {
    packs.push(buildLigBrightnessReport(companionBrightnessPercent));
  }

  enqueueHidReports(packs, done);
}

/** Add packets to the queue; they are written to USB strictly in order. */
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

/** Write queued packets to USB one by one (async loop). */
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
 * TCP link to Companion (port 16622 by default; COMPANION_HOST / COMPANION_PORT in `.env`).
 * Handles ping/pong, device registration, incoming BITMAP lines, brightness; sends key events from the deck.
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
 * Find a supported device on USB (match vid/pid from devices.js), open it, and run its initSequence so
 * screens and lighting are ready before we push images.
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
     * USB input: ignore packets without the expected header, then parser.js → event name → Companion key
     * via INPUT_CORRECTION_MAP. Short taps with no release get a synthetic release when isStatelessButtonEvent
     * applies (touch, swipes, encoder push).
     */
    dev.on('data', (d) => {
      if (d[0] !== 0x41 || d[1] !== 0x43 || d[2] !== 0x4b) return;
      if (!satelliteInputReady()) return;
      setImmediate(() => {
        try {
          const ev = parseHardwareEvent(
            d[9].toString(16).padStart(2, '0'),
            d[10].toString(16).padStart(2, '0'),
            d
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

/** Windows: optional tray icon; Quit closes USB and TCP cleanly. */
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
