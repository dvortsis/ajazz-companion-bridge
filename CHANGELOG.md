# Changelog

## 1.1.0

### Verified on real hardware (Ajazz AKP05E + Companion 4.x, 2026-10-20)

- Registration (ADD-DEVICE OK), all 14 key and strip images drawn, strip icons aligned over the dials.
- Every input reached Companion and was acknowledged: top/middle keys (press + release), the four touch zones, swipe left/right, dial 1 and 4 rotation both directions, dial 2 push.
- Dial pushes and touch/swipe send a single report with no release, so the synthetic release is required.
- Tray menu appears and Open log / Reconnect respond. No errors, warnings or reconnects during the session.

### Fixed

- `HID_WRITE_DELAY_MS` from `.env` is now honoured (the code read a different name).
- A refused Companion connection no longer crashes the bridge.
- Unplug/replug fully recovers: the surface is removed from Companion and re-registered, the old handle is closed, and any USB error (not just "could not read") is detected.
- Keys can no longer get stuck down when the socket or USB link drops.
- Dial pushes no longer click twice if the device also sends a release packet.
- The image queue keeps the newest frame per key instead of dropping new frames when full; unchanged frames are skipped.
- Strip JPEG quality honours `AKP05_STRIP_JPEG_QUALITY` / `AKP05_JPEG_QUALITY`.
- A crashed image worker retries the job instead of losing it.

### Changed

- Touch strip icons: outer icons flush with the edges to line up with the dials; inner icons evenly spaced.
- The four strip bitmaps are composited and uploaded once instead of four times.
- Rotating `bridge.log` with log levels; per-frame chatter is `debug` only.
- Companion link: 1 s ping, dead-link detection, exponential reconnect backoff.
- 72 px sources are upscaled with Lanczos.
- Code split into modules; device behaviour lives in `devices.js` profiles; table-driven parser; `.env` validation.

### Added

- Multiple decks at once; USB hot-plug scanning.
- Experimental profiles for further devices from the reference projects (marked `tested: false`).
- Tray status, Open log/folder, Reconnect, Start with Windows; single-instance lock; supervisor with auto-restart.
- `npm run probe`, `install-startup`, tests, ESLint/Prettier, CI.
- Opt-in press-and-rotate (`BRIDGE_SHIFT_ROTATE`) and dial long-press (`BRIDGE_DIAL_PUSH_HOLD`), idle dim level, `setup.cmd` installer, Ubuntu CI.
- Per-key software dimming (`BRIDGE_KEY_BRIGHTNESS`), opt-in touch hold (`BRIDGE_TOUCH_HOLD`; probed on real AKP05E: one report per touch, so no true hold on that firmware), probe prints time between reports, `npm run package` portable bundle (no Node install needed).
- Tray/product name now reads "Ajazz AKP05E" (DEVICEID `AJAZZ_AKP05` unchanged).
- Optional idle screen-off, encoder acceleration, swipe swap, configurable auto-release.
- MIT `LICENSE`, `.env.example` documenting every setting.

### Removed

- Unused `axios` dependency, dead mapping helpers, and the non-functional `AKP05_TOUCH_KEYS` setting.
