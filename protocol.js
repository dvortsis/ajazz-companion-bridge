/**
 * protocol.js — Builders for the USB HID output reports (CRT command family used by the AKP05 / Mirajazz v2+ devices).
 *
 * Every report is [reportId 0x00][payload…] zero-padded to packetPayload + 1 bytes (1024 + 1 by default).
 */
'use strict';

const CRT = [0x00, 0x43, 0x52, 0x54, 0x00, 0x00];
const DEFAULT_PACKET_PAYLOAD = 1024;

/** Highest hardware slot the BAT preamble accepts. */
const MAX_HW_SLOT = 23;

function createProtocol(packetPayload = DEFAULT_PACKET_PAYLOAD) {
  const reportLen = packetPayload + 1;

  /** One output report: leading bytes, zero padded to the fixed length. */
  function buildExtendedReport(byteValues) {
    const buf = Buffer.alloc(reportLen, 0);
    const src = Buffer.from(byteValues);
    src.copy(buf, 0, 0, Math.min(src.length, reportLen));
    return buf;
  }

  /** Backlight / brightness (0–100%). */
  function buildBrightnessReport(percent) {
    const p = Math.max(0, Math.min(100, Number(percent) | 0));
    return buildExtendedReport([...CRT, 0x4c, 0x49, 0x47, 0x00, 0x00, p]);
  }

  /** First packet of an image transfer: JPEG byte length and the 1-based hardware slot. */
  function buildBatPreambleReport(imageDataByteLength, hwSlot) {
    const len = imageDataByteLength >>> 0;
    const hw = Math.max(0, Math.min(MAX_HW_SLOT, Number(hwSlot) | 0));
    return buildExtendedReport([...CRT, 0x42, 0x41, 0x54, 0x00, 0x00, (len >> 8) & 0xff, len & 0xff, hw + 1]);
  }

  /** End-of-image marker. */
  function buildStpReport() {
    return buildExtendedReport([...CRT, 0x53, 0x54, 0x50]);
  }

  /** Split image bytes into full-length reports. */
  function chunkImagePayloadReports(imageBytes) {
    const bytes = Buffer.isBuffer(imageBytes) ? imageBytes : Buffer.from(imageBytes);
    const packs = [];
    for (let offset = 0; offset < bytes.length; offset += packetPayload) {
      const sliceLen = Math.min(packetPayload, bytes.length - offset);
      const buf = Buffer.alloc(reportLen, 0);
      bytes.copy(buf, 1, offset, offset + sliceLen);
      packs.push(buf);
    }
    return packs;
  }

  /** Full packet sequence for one image: BAT, payload chunks, STP. `hwSlot` is already the device slot. */
  function buildImagePackets(jpeg, hwSlot) {
    const bytes = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg);
    return [buildBatPreambleReport(bytes.length, hwSlot), ...chunkImagePayloadReports(bytes), buildStpReport()];
  }

  return {
    packetPayload,
    reportLen,
    buildExtendedReport,
    buildBrightnessReport,
    buildBatPreambleReport,
    buildStpReport,
    chunkImagePayloadReports,
    buildImagePackets,
  };
}

module.exports = { createProtocol, DEFAULT_PACKET_PAYLOAD, MAX_HW_SLOT };
