# Ajazz / Mirabox Companion Bridge

This application connects Ajazz and Mirabox LCD macro pads to [Bitfocus Companion](https://bitfocus.io/companion), allowing them to function as native control surfaces (similar to an Elgato Stream Deck).

It runs quietly in your Windows System Tray and translates the USB signals from your device into network commands that Companion understands, unlocking features like the ultra-wide touch strip and rotary dials.

---

![Ajazz Bridge Screenshot](screenshot.png)

---

## Supported Devices

| Device                                                                                                            | USB id                        | Status                                                                                                                                |
| :---------------------------------------------------------------------------------------------------------------- | :---------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| **Ajazz AKP05E** (5x4 grid, registered as `AJAZZ_AKP05`)                                                          | `0300:3004`                   | **Tested.** Touch strip, rotary dials, swipes.                                                                                        |
| Ajazz AKP153 / 153E / 153R                                                                                        | `0300:1530` / `1010` / `1020` | Experimental, untested                                                                                                                |
| Ajazz AKP05E Pro                                                                                                  | `0300:3013`                   | Experimental, untested                                                                                                                |
| Mirabox N4 / N4E                                                                                                  | `6602:1001` / `6603:1007`     | Experimental, untested                                                                                                                |
| AKP05 (3006), AKP05CN Pro, Mirabox N4 Pro / Pro E, VSDinside N4 / N4 Pro, MSD Pro, CN003, Streonor S10 Pro, SS552 | see `devices.js`              | Experimental: profiles taken from [ambiso/opendeck-akp05](https://github.com/ambiso/opendeck-akp05), assumed to behave like the AKP05 |

Experimental devices log a warning when opened. If you own one, run `npm run probe`, press every control, and open an issue with the output so the profile can be verified. More than one deck can be connected at once; the first of each model keeps its plain id (for example `AJAZZ_AKP05`), further ones get the serial number appended.

---

## Part 1: Prerequisites

1.  **Node.js** 20 or newer (LTS) from [nodejs.org](https://nodejs.org/).
2.  **Bitfocus Companion** 3.0 or higher.

## Part 2: Bitfocus Companion Setup

1.  Open the Companion web interface (usually `http://127.0.0.1:8000`).
2.  **Settings** > **Satellite API** > set **Enable Satellite API** to ON, port `16622`, **Save**.

**CRITICAL STEP**: with Companion 3.0 or newer, disable the native drivers or Windows will block this bridge from the hardware. Under **Settings** > **Surfaces** turn **OFF** "Enable connected Mirabox Stream Dock devices" (and optionally the Elgato option if you have no Stream Deck).

## Part 3: Installing the Bridge

Double-click `setup.cmd` (installs dependencies, creates `.env`, offers auto-start), or by hand:

Double-click `setup.cmd` (installs dependencies, creates `.env`, offers auto-start), or by hand:

```text
cd path\to\ajazz-bridge
npm install
```

## Part 4: Configuration (.env file)

Copy `.env.example` to `.env` and uncomment what you want to change. Every setting is optional; unknown or invalid values are reported in the log at startup and the default is used.

| Setting                                                                                                                     | Default                        | Purpose                                                                                                                                                                                                                 |
| :-------------------------------------------------------------------------------------------------------------------------- | :----------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `COMPANION_HOST` / `COMPANION_PORT`                                                                                         | `127.0.0.1` / `16622`          | Where Companion runs. Change the host if Companion is on another machine.                                                                                                                                               |
| `HID_WRITE_DELAY_MS`                                                                                                        | `0`                            | Pause between USB image packets. If buttons look torn or half drawn, try `1`, `2`, `5`.                                                                                                                                 |
| `AKP05_IMAGE_SIZE`                                                                                                          | `112`                          | Bitmap size requested from Companion (`72` or `112`).                                                                                                                                                                   |
| `AKP05_JPEG_QUALITY` / `AKP05_STRIP_JPEG_QUALITY`                                                                           | `75`                           | JPEG quality (40-100) for keys / the touch strip.                                                                                                                                                                       |
| `AKP05_STRIP_EDGE_PADDING`                                                                                                  | `0`                            | Pixels of black between the strip edge and the outer icons.                                                                                                                                                             |
| `AKP05_STRIP_BATCH_MS`                                                                                                      | `20`                           | The four strip icons arriving within this window become one upload.                                                                                                                                                     |
| `BRIDGE_AUTO_UP_MS`                                                                                                         | `50`                           | Synthetic key-up delay for touch zones, swipes and dial pushes.                                                                                                                                                         |
| `BRIDGE_SWIPE_SWAP`                                                                                                         | `0`                            | `1` swaps the swipe left / right assignment.                                                                                                                                                                            |
| `BRIDGE_ENCODER_ACCEL`                                                                                                      | `1`                            | Repeat fast same-direction dial ticks N times (max 10). `BRIDGE_ENCODER_ACCEL_WINDOW_MS` sets "fast" (default 80).                                                                                                      |
| `BRIDGE_IDLE_OFF_MINUTES`                                                                                                   | `0`                            | Blank the displays after N idle minutes; any input wakes them.                                                                                                                                                          |
| `BRIDGE_IDLE_DIM_PERCENT`                                                                                                   | `0`                            | Dim to this brightness when idle instead of fully off.                                                                                                                                                                  |
| `BRIDGE_SHIFT_ROTATE`                                                                                                       | `0`                            | Press-and-rotate: turning a dial while holding its push sends the turn to Companion row 4 (`4/0` ... `4/3`; the surface becomes 5 rows). A plain push clicks on release.                                                |
| `BRIDGE_KEY_BRIGHTNESS`                                                                                                     | _(none)_                       | Per-key brightness applied to the image, e.g. `0:60,5:80` (Companion key index : percent).                                                                                                                              |
| `BRIDGE_TOUCH_HOLD` / `BRIDGE_TOUCH_HOLD_MS`                                                                                | `0` / `200`                    | Keep a touch zone pressed while the firmware keeps sending touch reports; released this long after the last one. Check with `npm run probe` whether your firmware repeats reports (it prints the time between reports). |
| `BRIDGE_DIAL_PUSH_HOLD`                                                                                                     | `0`                            | Dial pushes send real press/release so Companion long-press works.                                                                                                                                                      |
| `BRIDGE_KEEPALIVE_MS`, `BRIDGE_PING_INTERVAL_MS`, `BRIDGE_LINK_TIMEOUT_MS`, `BRIDGE_RECONNECT_MAX_MS`, `BRIDGE_HID_SCAN_MS` | see `.env.example`             | Timing of the USB keepalive, Companion ping, dead-link detection, reconnect backoff and USB rescans.                                                                                                                    |
| `LOG_LEVEL`, `LOG_DIR`, `LOG_MAX_BYTES`, `LOG_BACKUPS`                                                                      | `info`, bridge folder, 5 MB, 3 | `bridge.log` rotates at the size limit. `LOG_LEVEL=debug` logs every frame and packet.                                                                                                                                  |
| `BRIDGE_NO_TRAY`                                                                                                            | `0`                            | `1` disables the tray icon.                                                                                                                                                                                             |

## Part 5: Ajazz AKP05 Mapping Guide

Companion sees the AKP05 as a **5-column by 4-row** grid (20 keys):

| Physical Feature                     | Companion Row | Companion Buttons (Row/Col)        |
| :----------------------------------- | :------------ | :--------------------------------- |
| **Top Row (Main)**                   | Row 0         | `0/0` … `0/4`                      |
| **Middle Row (Main)**                | Row 1         | `1/0` … `1/4`                      |
| **Touch Strip (LCD)**                | Row 2         | `2/0`, `2/1`, `2/2`, `2/3`         |
| **Touch Strip Swipe Left**           | Row 2         | `2/4` _(press)_                    |
| **Rotary Dials 1-4 (left to right)** | Row 3         | `3/0` … `3/3` _(push, rotate L/R)_ |
| **Touch Strip Swipe Right**          | Row 3         | `3/4` _(press)_                    |

Assign dial turns in Companion's **Rotary Actions** tab on the dial's button (e.g. `3/0`).

**Touch strip layout:** the four strip icons are spread across the 800 px strip so the outer two sit flush with the left and right edges and the inner two are evenly spaced, lining each icon up with the dial beneath it. `AKP05_STRIP_EDGE_PADDING` pulls them inwards.

## Part 6: Running the Bridge

```text
node index.js
```

A tray icon appears. Its menu shows status (deck and Companion connection) and offers **Open log**, **Open folder**, **Reconnect**, **Start with Windows** and **Quit**.

- If the bridge is started twice, the second copy exits immediately (single-instance lock).
- Unplug and replug the deck at any time: the bridge removes the surface from Companion, then re-registers it once the deck is back.
- If Companion is not running, the bridge keeps retrying with a growing delay (3 s up to 30 s).

## Part 7: Windows Auto-Start

Either use the tray item **Start with Windows**, or:

```text
npm run install-startup      (npm run uninstall-startup to remove)
```

This puts a small launcher in your Startup folder that runs `launch-bridge.vbs`, which starts `supervisor.js` in a hidden window. The supervisor restarts the bridge if it ever crashes and stops when you choose **Quit**.

## Part 8: Adding or verifying a device

Each product is one entry in `devices.js` (`SUPPORTED_DEVICES`): USB ids, grid size, packet size, init sequence and a layout (event → Companion key, key → draw slot, touch-strip geometry). Nothing else names a product. To check a device:

1.  `npm run probe` prints the raw input reports; press every control and compare with `parser.js` (`ACTIONS`).
2.  Set `tested: true` on the profile once everything works, and update the table above.

## Other platforms

The core (USB, image processing, Companion link) is cross-platform; set `BRIDGE_NO_TRAY=1` if the tray icon is unavailable. Auto-start (`install-startup`) is Windows only. CI also runs on Ubuntu, but only Windows with the AKP05 has been tried on real hardware. A single-file `.exe` is not offered because `sharp` and `node-hid` are native modules; `setup.cmd` is the one-step installer instead.

## Other platforms

The core (USB, image processing, Companion link) is cross-platform; set `BRIDGE_NO_TRAY=1` if the tray icon is unavailable. Auto-start (`install-startup`) is Windows only. CI also runs on Ubuntu, but only Windows with the AKP05 has been tried on real hardware. A single-file `.exe` is not offered because `sharp` and `node-hid` are native modules; `setup.cmd` is the one-step installer instead.

## Development

```text
npm test            # unit + integration tests (mock Companion server, fake USB device, real image worker)
npm run lint
npm run format
```

## Acknowledgments

Built on the reverse engineering and protocol work of:

- [ambiso/opendeck-akp05](https://github.com/ambiso/opendeck-akp05)
- [4ndv/mirajazz](https://github.com/4ndv/mirajazz)

## Troubleshooting

| Symptom                                   | What to do                                                                                                                                  |
| :---------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------ |
| Device does not light up                  | Close the manufacturer's software; only one program can own the USB device.                                                                 |
| Companion shows "Device exists elsewhere" | Another copy of the bridge (or Companion's own Mirabox driver) holds that id. Quit other copies and disable the native driver in Companion. |
| Tray says "Companion offline"             | Check `COMPANION_HOST`, `COMPANION_PORT` and that the Satellite API is enabled.                                                             |
| Buttons tear or draw halfway              | Raise `HID_WRITE_DELAY_MS`.                                                                                                                 |
| Need more detail                          | Set `LOG_LEVEL=debug`, reproduce, then use tray > **Open log**.                                                                             |
| Settings seem ignored                     | The log lists unrecognised or invalid settings at startup (`[CONFIG]`).                                                                     |
