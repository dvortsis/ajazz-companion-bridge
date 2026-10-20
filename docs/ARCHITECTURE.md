# Architecture

```text
              Companion (Satellite API, TCP 16622)
                         ▲  │ BEGIN / BITMAP / BRIGHTNESS / PING
   KEY-PRESS / KEY-ROTATE│  ▼
                 ┌──────────────────┐
                 │ SatelliteClient  │  satellite.js   one connection, many decks, ping + backoff
                 └───────▲──────────┘
                         │ addDevice / removeDevice / sendKey / sendRotate
 ┌───────────────┐   ┌───┴─────────┐   jobs    ┌───────────────┐   JPEG   ┌────────────┐
 │ DeviceManager │──▶│ DeckSession │──────────▶│ WorkerClient  │─────────▶│ image-worker│
 │  manager.js   │   │ session.js  │◀──────────│worker-client.js│          │  (thread)  │
 └──────┬────────┘   └──────┬──────┘           └───────────────┘          └────────────┘
        │ HID scan          │ HID write (BAT/payload/STP), keepalive, input
        ▼                   ▼
   node-hid  ◀──────────  USB deck
```

## Repository layout

```text
src/              all program code (the modules below, plus paths.js for locating project files)
assets/           tray icons and the readme screenshot
docs/             guides (getting started, troubleshooting, platforms, configuration, devices, architecture)
test/             unit and integration tests (fake USB device, mock Companion server, real image worker)
scripts/          maintenance tools: package.js (release bundles), udev-rules.js (Linux USB rules)
deploy/linux/     generated udev rules for Linux
templates/        Unraid Community Applications template (ca_profile.xml at the root is required by the store)
.github/          CI, release-bundle and Docker-image workflows
setup.cmd         Windows one-click installer      launch-bridge.vbs   Windows silent launcher
Dockerfile, docker-compose.yml, .env.example, package.json, LICENSE, CHANGELOG.md, CONTRIBUTING.md
```

## Modules

All modules are in `src/`.

| File                   | Role                                                                                                                         |
| :--------------------- | :--------------------------------------------------------------------------------------------------------------------------- |
| `src/index.js`         | Entry point: lock, wiring, tray, signal handling, shutdown. `--probe` runs `src/probe.js` instead.                           |
| `src/config.js`        | Reads and validates every setting; reports unknown ones.                                                                     |
| `src/log.js`           | Levels, console output and the rotating `bridge.log`.                                                                        |
| `src/devices.js`       | Device profiles and layouts (event → Companion key, key → draw slot, strip geometry). The only place that names a product.   |
| `src/parser.js`        | Table of input action ids → event names; one warning per unknown id.                                                         |
| `src/protocol.js`      | Pure builders for the USB output reports (brightness, image header, payload chunks, commit).                                 |
| `src/layout.js`        | Pure touch-strip icon geometry.                                                                                              |
| `src/satellite.js`     | Satellite API client: handshake, routing by `DEVICEID`, ping/timeout, reconnect backoff, key and rotate lines.               |
| `src/session.js`       | One open deck: init, write queue, keepalive, idle dim, image pipeline, input handling (stateless releases, shift-rotate, …). |
| `src/manager.js`       | Scans USB every few seconds, opens a session per physical deck, replaces sessions that close (replug).                       |
| `src/worker-client.js` | Promise wrapper around the image worker; restarts it and flags in-flight jobs when it dies.                                  |
| `src/image-worker.js`  | Decodes Companion bitmaps, dims, rotates 180°, encodes JPEG; keeps per-device strip icons and composites the strip.          |
| `src/tray.js`          | Tray / menu-bar icon and menu.                                                                                               |
| `src/startup.js`       | Start-at-login for Windows, macOS and Linux (content generators are pure and tested).                                        |
| `src/lock.js`          | Single-instance lock file.                                                                                                   |
| `src/supervisor.js`    | Restarts `src/index.js` after a crash with backoff; stops on a clean exit.                                                   |
| `src/probe.js`         | Raw report dump for verifying devices.                                                                                       |

## Data flow

**Outbound (Companion → deck).** Companion sends `KEY-STATE … BITMAP=<base64>` lines. `SatelliteClient` routes each to its `DeckSession` by `DEVICEID`. The session maps the Companion key to a draw slot via the layout, drops frames identical to the last one, keeps only the newest pending frame per key, and hands one job at a time to the image worker. Strip keys are batched for `AKP05_STRIP_BATCH_MS` so four icons produce one composite. The worker returns a JPEG; the session turns it into `BAT` + payload chunks + `STP` reports and writes them in order. Strip uploads end with a brightness report.

**Inbound (deck → Companion).** USB reports starting with `ACK` go through `parseHardwareEvent`. The layout maps the event to a Companion key. Buttons forward press/release; touch zones, swipes and dial pushes send a press plus a synthetic release (the deck sends none); dial turns become `KEY-ROTATE`.

**Failure handling.** A USB error closes the session: Companion gets `REMOVE-DEVICE`, held keys are released, timers and the write queue are cleared. The manager reopens the deck on a later scan, which registers it again. If Companion goes quiet the client drops the socket and reconnects with growing delays; every registered deck re-registers after the next `BEGIN`. An uncaught error exits non-zero so `src/supervisor.js` (or systemd, launchd, Docker) restarts the process.

## Conventions

- Settings are read only in `src/config.js`; modules receive them as arguments, which keeps tests simple.
- Anything that differs between products belongs in a profile in `src/devices.js`, not in a conditional elsewhere.
- Pure logic (`src/protocol.js`, `src/layout.js`, `src/parser.js`, start-up content generators) stays free of I/O so it is covered by unit tests; I/O modules take their dependencies (HID, worker, satellite) by injection, which is how `test/` runs them with fakes.
