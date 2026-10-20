# Configuration

**You probably don't need this page.** The defaults work for most people. The three settings worth knowing are `COMPANION_HOST` (if Companion is on another computer), `HID_WRITE_DELAY_MS` (if pictures look torn) and `LOG_LEVEL` (when asking for help).

**How to change a setting:** open the file named `.env` in the bridge folder with Notepad (or any text editor), remove the `#` at the start of the line, change the value, save the file, then quit and restart the bridge. If there is no `.env` yet, copy `.env.example` to `.env` first. Example:

```text
COMPANION_HOST=192.168.1.50
HID_WRITE_DELAY_MS=2
```

The rest of this page is the complete reference for advanced users.

Settings come from `.env` in the bridge folder (copy `.env.example`) or from real environment variables, which win over `.env`. Every setting is optional. Invalid values fall back to the default and unknown `AKP05_*`, `COMPANION_*`, `HID_*`, `SATELLITE_*`, `BRIDGE_*` and `LOG_*` names are reported as `[CONFIG]` warnings at startup. Parsing lives in `src/config.js`.

## Companion link

| Setting                    | Default     | Purpose                                                                                |
| :------------------------- | :---------- | :------------------------------------------------------------------------------------- |
| `COMPANION_HOST`           | `127.0.0.1` | Machine running Companion. The bridge itself always runs where the deck is plugged in. |
| `COMPANION_PORT`           | `16622`     | Satellite API port.                                                                    |
| `SATELLITE_HANDSHAKE_CRLF` | `0`         | Send `ADD-DEVICE` with CRLF instead of LF.                                             |
| `SATELLITE_DEBUG_HEX`      | `0`         | Log raw received bytes (needs `LOG_LEVEL=debug`).                                      |
| `BRIDGE_PING_INTERVAL_MS`  | `1000`      | How often the bridge pings Companion.                                                  |
| `BRIDGE_LINK_TIMEOUT_MS`   | `10000`     | No data from Companion for this long → drop and reconnect.                             |
| `BRIDGE_RECONNECT_MAX_MS`  | `30000`     | Reconnect delay doubles from 3 s up to this limit.                                     |

## Drawing

| Setting                    | Default     | Purpose                                                                                                                    |
| :------------------------- | :---------- | :------------------------------------------------------------------------------------------------------------------------- |
| `HID_WRITE_DELAY_MS`       | `0`         | Pause between USB image packets. Try `1`, `2`, `5` if buttons look torn.                                                   |
| `AKP05_IMAGE_SIZE`         | `112`       | Bitmap size requested from Companion (`72` or `112`). 72 px images are upscaled.                                           |
| `AKP05_JPEG_QUALITY`       | `75`        | JPEG quality (40-100) for keys.                                                                                            |
| `AKP05_STRIP_JPEG_QUALITY` | key quality | JPEG quality for the touch strip.                                                                                          |
| `AKP05_STRIP_EDGE_PADDING` | `8`         | Pixels of black between the strip edge and the outer icons (8 lines the icons up over the dials, 0 = flush with the edge). |
| `AKP05_STRIP_BATCH_MS`     | `20`        | Strip icons arriving within this window are composited into one upload.                                                    |
| `BRIDGE_KEY_BRIGHTNESS`    | none        | Per-key software dimming, e.g. `0:60,5:80` (Companion key index : percent).                                                |
| `BRIDGE_IDLE_OFF_MINUTES`  | `0`         | Dim or blank the displays after this many idle minutes; any input wakes them.                                              |
| `BRIDGE_IDLE_DIM_PERCENT`  | `0`         | Brightness while idle (`0` = off).                                                                                         |
| `BRIDGE_KEEPALIVE_MS`      | `1000`      | USB brightness keepalive interval.                                                                                         |

## Input

| Setting                                     | Default    | Purpose                                                                                                                                                                               |
| :------------------------------------------ | :--------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BRIDGE_AUTO_UP_MS`                         | `50`       | Synthetic release delay for touch zones, swipes and dial pushes (the deck sends no release).                                                                                          |
| `BRIDGE_SWIPE_SWAP`                         | `0`        | `1` swaps the swipe left / right assignment.                                                                                                                                          |
| `BRIDGE_ENCODER_ACCEL`                      | `1`        | Repeat fast same-direction dial ticks N times (max 10).                                                                                                                               |
| `BRIDGE_ENCODER_ACCEL_WINDOW_MS`            | `80`       | How close ticks must be to count as "fast".                                                                                                                                           |
| `BRIDGE_SHIFT_ROTATE`                       | `0`        | Press-and-rotate: turns made while a dial is held go to Companion row 4 (`4/0`-`4/3`, the surface becomes 5 rows). A plain push clicks on release.                                    |
| `BRIDGE_DIAL_PUSH_HOLD`                     | `0`        | Dial pushes send real press and release so Companion long-press works. The AKP05E sends no release packet, so this only helps on firmware that does.                                  |
| `BRIDGE_TOUCH_HOLD`, `BRIDGE_TOUCH_HOLD_MS` | `0`, `200` | Keep a touch zone pressed while touch reports repeat. Verified on the AKP05E: one report per touch, so this only lengthens the click. For other firmware, check with `npm run probe`. |

## Process

| Setting                        | Default       | Purpose                                                                                                   |
| :----------------------------- | :------------ | :-------------------------------------------------------------------------------------------------------- |
| `BRIDGE_HID_SCAN_MS`           | `5000`        | How often USB is rescanned for new or returning decks.                                                    |
| `BRIDGE_NO_TRAY`               | auto          | `1` hides the tray icon, `0` forces it. Default: off on Linux without a display server and in containers. |
| `LOG_LEVEL`                    | `info`        | `error`, `warn`, `info` or `debug`.                                                                       |
| `LOG_DIR`                      | bridge folder | Where `bridge.log` is written (`/config` in the Docker image).                                            |
| `LOG_MAX_BYTES`, `LOG_BACKUPS` | 5 MB, 3       | Rotation: `bridge.log` → `bridge.log.1` … `.N`.                                                           |
