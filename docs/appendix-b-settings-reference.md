# Appendix B: Settings reference

Every setting in `.env` (`src/config.js`) and the Unraid template (`templates/ajazz-companion-bridge.xml`) in one table. The recommended value is the safe choice for most setups.

<!-- index: settings reference; environment variables -->

| Setting | What it does | Recommended | Notes |
|---|---|---|---|
| `COMPANION_HOST` | IP address or hostname of the machine running Companion | `127.0.0.1` | Set to the Companion machine's LAN IP when Companion is on another computer |
| `COMPANION_PORT` | Companion Satellite API TCP port | `16622` | Must match **Settings** > **Satellite API** in Companion |
| **USB HID device** | Unraid/Docker device mapping (`--device`) | `/dev/hidraw0` (`/input0` node) | Find the exact `/input0` node with the `/sys/class/hidraw` command; keeps **Privileged** off |
| **Config / logs** (`LOG_DIR`) | Folder where `bridge.log` is written | Bridge folder or `/mnt/user/appdata/ajazz-companion-bridge` | Mapped to `/config` in Docker and Unraid |
| `HID_WRITE_DELAY_MS` | Milliseconds between 1025-byte USB image packets | `0` | Raise to `1`, `2` or `5` if button graphics look torn or half-drawn |
| `AKP05_IMAGE_SIZE` | Bitmap size in pixels requested from Companion | `112` | Accepts `72` or `112`; `72` is upscaled with Lanczos |
| `AKP05_JPEG_QUALITY` | JPEG quality (`40`–`100`) for the 10 LCD keys | `75` | Lower values send smaller USB payloads |
| `AKP05_STRIP_JPEG_QUALITY` | JPEG quality (`40`–`100`) for the touch strip | `75` | Defaults to `AKP05_JPEG_QUALITY` when unset |
| `AKP05_STRIP_EDGE_PADDING` | Black margin in pixels at the left and right edges of the strip | `8` | `8` aligns the 4 strip icons over the 4 dials; `0` is flush with the edges |
| `AKP05_STRIP_BATCH_MS` | Window in milliseconds to batch strip icon updates into one upload | `20` | Range `0`–`500` |
| `BRIDGE_KEY_BRIGHTNESS` | Per-key software brightness (`key:percent,key:percent`) | Unset (full brightness) | Example: `0:60,5:80` dims keys `0` and `5` |
| `BRIDGE_IDLE_OFF_MINUTES` | Minutes without input before displays dim or blank | `0` (never) | Any key, touch or dial input wakes the displays |
| `BRIDGE_IDLE_DIM_PERCENT` | Brightness (`0`–`100`) used while idle | `0` (screens off) | Requires `BRIDGE_IDLE_OFF_MINUTES` greater than `0` |
| `BRIDGE_KEEPALIVE_MS` | Interval in milliseconds for USB brightness keepalive reports | `1000` | Minimum `250` |
| `BRIDGE_AUTO_UP_MS` | Synthetic key-up delay in milliseconds for touch, swipe and dial push | `50` | Needed because the pad sends no release packet for those controls |
| `BRIDGE_SWIPE_SWAP` | Swap left (`2/4`) and right (`3/4`) swipe button slots | `0` | Set `1` to reverse swipe direction |
| `BRIDGE_ENCODER_ACCEL` | Multiplier (`1`–`10`) for rapid same-direction dial turns | `1` (off) | Multiplies ticks arriving within `BRIDGE_ENCODER_ACCEL_WINDOW_MS` |
| `BRIDGE_ENCODER_ACCEL_WINDOW_MS` | Window in milliseconds to detect rapid dial turns | `80` | Minimum `10` |
| `BRIDGE_SHIFT_ROTATE` | Hold a dial push and turn to send rotation to row 4 (`4/0`–`4/3`) | `0` | Expands the surface from 4 rows to 5 rows when set to `1` |
| `BRIDGE_DIAL_PUSH_HOLD` | Send real press/release for dial pushes instead of synthetic clicks | `0` | Only helps on firmware that sends a dial-release packet; ignored when `BRIDGE_SHIFT_ROTATE=1` |
| `BRIDGE_TOUCH_HOLD` | Hold touch zones down while touch reports repeat | `0` | On AKP05E firmware, touch sends one report per tap |
| `BRIDGE_TOUCH_HOLD_MS` | Timeout in milliseconds before releasing a held touch zone | `200` | Used when `BRIDGE_TOUCH_HOLD=1` |
| `BRIDGE_PING_INTERVAL_MS` | Interval in milliseconds between Companion `PING` messages | `1000` | Minimum `100` |
| `BRIDGE_LINK_TIMEOUT_MS` | Milliseconds of silence from Companion before reconnecting | `10000` | Minimum `1000` |
| `BRIDGE_RECONNECT_MAX_MS` | Maximum backoff delay in milliseconds between reconnect attempts | `30000` | Doubles from `3000` ms up to this limit |
| `BRIDGE_HID_SCAN_MS` | Interval in milliseconds between USB hot-plug scans | `5000` | Minimum `1000` |
| `BRIDGE_NO_TRAY` | Hide (`1`) or force (`0`) the system tray / menu bar icon | Auto | Off by default on headless Linux and in containers |
| `LOG_LEVEL` | Minimum log level written to `bridge.log` (`error`, `warn`, `info`, `debug`) | `info` | Set `debug` when capturing a log for a bug report |
| `LOG_MAX_BYTES` | Size in bytes before `bridge.log` rotates | `5242880` (5 MB) | Minimum `65536` |
| `LOG_BACKUPS` | Number of rotated `bridge.log.N` files kept | `3` | Range `0`–`20` |
| `SATELLITE_HANDSHAKE_CRLF` | End `ADD-DEVICE` lines with `CRLF` instead of `LF` | `0` | Diagnostic option |
| `SATELLITE_DEBUG_HEX` | Log raw incoming Satellite bytes when `LOG_LEVEL=debug` | `0` | Diagnostic option |

<!-- nav:start -->
---

[← Appendix A: Answers to check your understanding](appendix-a-answers.md) · [Contents](README.md#contents) · [Glossary →](glossary.md)
<!-- nav:end -->
