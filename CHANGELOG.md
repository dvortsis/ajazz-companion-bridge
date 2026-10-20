# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Repository reorganised: program code moved to `src/`, icons and screenshot to `assets/`, `readme.md` renamed `README.md`, the Prettier config moved into `package.json`. Commands (`npm start`, `npm run probe`, `install-startup`, `package`), the release bundles and the Docker image work as before; the app-store icon URL now points at `assets/`.

### Verified

- On a real Unraid 7.3.2 server (Docker 29.5.3) with an AKP05E: the published image ran without `--privileged` with only `/dev/hidraw7` mapped, registered with a real Companion container, drew all 14 images and delivered key presses, the four touch zones, a swipe, dial turns and a dial push, all acknowledged with no warnings. The pad creates two hidraw nodes (vendor-defined `input0` and a keyboard `input1`); the bridge correctly uses the vendor-defined one.

### Added

- Community Applications (Unraid app store) submission files: `ca_profile.xml` and `templates/ajazz-companion-bridge.xml`. The template now runs without `--privileged` by default and maps the pad through a "USB HID device" field.

### Changed

- Docker and Unraid instructions now use the published `ghcr.io/dvortsis/ajazz-companion-bridge` image (public, amd64 and arm64) instead of building locally.

## [1.3.0] - 2026-10-20

### Added

- Ready-to-run release bundles for Windows (`.zip`), macOS arm64 and x64 and Linux x64 (`.tar.gz`), built and attached to each GitHub release by `.github/workflows/release.yml`. `npm run package` builds the bundle for the current OS; bundles include Node.js, the docs and launcher scripts.

### Changed

- Documentation rewritten for non-technical users: a plain-language readme, a step-by-step getting-started guide (`docs/GETTING-STARTED.md`) with a glossary, a troubleshooting guide (`docs/TROUBLESHOOTING.md`), friendlier platform, configuration and device pages, and clearer `.env.example` comments.
- Touch strip icons now sit 8 px in from the strip edges by default (`AKP05_STRIP_EDGE_PADDING=8`) so the outer icons line up with the outer dials; set it to 0 for the previous flush-to-edge layout.

## [1.2.0] - 2026-10-20

### Added

- macOS, Linux and Docker/Unraid support: start at login on every OS (Windows Startup launcher, macOS launchd agent, Linux systemd user service via `npm run install-startup`), generated Linux udev rules (`scripts/udev-rules.js`, committed in `deploy/linux/`), a Docker image, `docker-compose.yml`, an Unraid template (`deploy/unraid/`) and a workflow that publishes the image to `ghcr.io` on `v*` tags.
- Documentation set: platform guide, configuration reference, device guide, architecture overview and contributing guide in `docs/` and `CONTRIBUTING.md`.

### Changed

- USB matching accepts platforms that report no HID usage page (Linux, macOS); Windows stays strict.
- The tray icon is off by default on headless Linux and in containers; macOS and Linux use a PNG icon. The tray toggle is now "Start at login".
- The single-instance lock is no longer fatal on a read-only install directory.
- The readme is reorganised around a quick start; settings moved to `docs/CONFIGURATION.md`.

## [1.1.0] - 2026-10-20

### Added

- Multiple decks at once, USB hot-plug scanning and experimental profiles for further devices from the reference projects (`tested: false`).
- Tray status line with Open log, Open folder, Reconnect and Start with Windows; single-instance lock; `supervisor.js` that restarts the bridge after a crash.
- `npm run probe` (raw report dump with timing), `install-startup`, `package` (portable Windows bundle), `setup.cmd`, tests, ESLint/Prettier and CI.
- Options: per-key dimming (`BRIDGE_KEY_BRIGHTNESS`), idle dim/off, dial acceleration, press-and-rotate (`BRIDGE_SHIFT_ROTATE`), dial long-press (`BRIDGE_DIAL_PUSH_HOLD`), swipe swap, configurable auto-release and touch hold.
- MIT `LICENSE` and an `.env.example` that documents every setting.

### Changed

- Touch strip icons are edge-aligned so they sit over the dials, and the four strip images are composited and uploaded once instead of four times.
- The strip canvas is cached and 72 px images are upscaled with Lanczos.
- `bridge.log` rotates at 5 MB with log levels; per-frame output is `debug` only.
- The Companion link pings every second, detects a dead link and reconnects with exponential backoff.
- The code is split into modules, device behaviour lives in `devices.js` profiles, the parser is table driven and `.env` is validated at startup.
- The product name shown in Companion is "Ajazz AKP05E" (the `AJAZZ_AKP05` id is unchanged).

### Fixed

- `HID_WRITE_DELAY_MS` from `.env` is honoured (the code read a different name).
- A refused Companion connection no longer crashes the bridge.
- Unplugging and replugging recovers fully: the surface is removed and re-registered, the old handle is closed and any USB error is detected.
- Keys no longer stick down when the socket or USB link drops, and dial pushes no longer click twice if a release report arrives.
- The image queue keeps the newest frame per key, unchanged frames are skipped and a crashed image worker retries its job.
- The strip honours the configured JPEG quality.

### Removed

- The unused `axios` dependency, dead mapping helpers and the non-functional `AKP05_TOUCH_KEYS` setting.

### Verified

Run on an Ajazz AKP05E with Companion 4.x on Windows: registration, all key and strip images, the strip icons aligned over the dials, key presses and releases, the four touch zones, swipes, dial turns in both directions and a dial push all reached Companion and were acknowledged, with no errors or reconnects. Touch zones, swipes and dial pushes send one report and no release, so the synthetic release is required, and a touch cannot be detected as a hold. The tray menu appears and Open log and Reconnect respond. On Linux (Debian, Node 22) install, lint and all tests pass.

## [1.0.0] - 2026-04-01

### Added

- Initial release: Ajazz AKP05 bridge for Bitfocus Companion with touch strip compositing, rotary dials, swipes, system-tray icon and Windows auto-start.

[Unreleased]: https://github.com/dvortsis/ajazz-companion-bridge/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/dvortsis/ajazz-companion-bridge/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/dvortsis/ajazz-companion-bridge/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/dvortsis/ajazz-companion-bridge/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/dvortsis/ajazz-companion-bridge/releases/tag/v1.0.0
