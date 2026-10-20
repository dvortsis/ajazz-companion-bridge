# Platform setup

> **New here?** Windows users should follow [GETTING-STARTED.md](GETTING-STARTED.md), which explains every click. This page covers the other systems and the more technical options.
>
> Some steps below use a **terminal**: on a Mac open _Terminal_ (Applications → Utilities); on Linux press `Ctrl+Alt+T` or search for _Terminal_. Type each command and press Enter. Commands starting with `sudo` ask for your computer password (nothing shows as you type; that is normal).

The bridge must run on the machine the deck is plugged into. Companion can be anywhere on the network: set `COMPANION_HOST` (and `COMPANION_PORT`) to reach its Satellite API.

**Verification status:** only Windows with an AKP05E has been run against a real deck. Linux (Debian, Node 22) passes install, lint and the full test suite; the Docker image builds, starts, connects to a Satellite server and runs on a read-only filesystem; the generated systemd unit passes `systemd-analyze verify`; the launchd plist is well-formed. A real deck on macOS, Linux or Unraid and USB passthrough into a container have not been tried.

## Windows

1. Install Node.js 20+. Double-click `setup.cmd`, or run `npm install` and copy `.env.example` to `.env`.
2. `npm start`. The tray icon shows status and offers **Open log**, **Open folder**, **Reconnect**, **Start at login** and **Quit**.
3. Start at login: the tray item, or `npm run install-startup` (`npm run uninstall-startup` to remove). This puts a launcher in your Startup folder that runs `launch-bridge.vbs` → `supervisor.js` in a hidden window; the supervisor restarts the bridge if it crashes and stops when you choose **Quit**.
4. No Node on the target PC? `npm run package` builds `dist/ajazz-bridge-portable.zip` with Node and the native modules included (build it on the OS you ship to).

## macOS

Step 1 uses [Homebrew](https://brew.sh). If you don't have it, install Node.js from [nodejs.org](https://nodejs.org/) instead and skip that command.

1. `brew install node`, then `npm install` and copy `.env.example` to `.env`.
2. `npm start`. A menu-bar icon appears (`BRIDGE_NO_TRAY=1` hides it). The first time the deck is read, macOS may ask to allow **Input Monitoring** for your terminal or Node.
3. Start at login: `npm run install-startup` writes `~/Library/LaunchAgents/com.ajazz.bridge.plist` and loads it; `npm run uninstall-startup` removes it. Output goes to `launchd.out.log` / `launchd.err.log` in the bridge folder.

## Linux (desktop or server)

On Linux a normal user is not allowed to talk to USB devices until you add a permission rule (step 2). If you skip it the bridge reports a _permission denied_ error.

1. Install Node.js 20+. If no prebuilt USB module matches your system: `sudo apt install libudev-dev libusb-1.0-0-dev build-essential`. Then `npm install`.
2. Allow your user to open the deck:
   ```text
   node scripts/udev-rules.js | sudo tee /etc/udev/rules.d/99-ajazz-bridge.rules
   sudo udevadm control --reload && sudo udevadm trigger
   ```
   Then unplug and replug the deck. The rules grant the logged-in desktop user (`uaccess`) and the `plugdev` group; on a headless server add the service user to `plugdev`. A copy is committed at `deploy/linux/99-ajazz-bridge.rules`.
3. `npm start`. The tray icon only shows when a display server exists (it is off by default over SSH, on servers and in containers; `BRIDGE_NO_TRAY=0` forces it).
4. Start at login/boot: `npm run install-startup` creates a systemd **user** service. Then `systemctl --user start ajazz-bridge`, and `loginctl enable-linger $USER` so it runs without an open session. Logs: `journalctl --user -u ajazz-bridge` and `bridge.log`.

## Docker

Docker packages the bridge so you don't install Node yourself. It suits servers and home labs; on a desktop PC the normal install above is easier.

The image is headless and configured with environment variables; logs and the lock go to `/config`.

```text
docker build -t ajazz-companion-bridge .
docker run -d --name ajazz-bridge --restart unless-stopped --network host \
  -e COMPANION_HOST=127.0.0.1 -e COMPANION_PORT=16622 -v $PWD/config:/config \
  --device=/dev/hidraw0 ajazz-companion-bridge
```

or `docker compose up -d` with the included `docker-compose.yml`. The deck appears as `/dev/hidrawN` (`ls -l /dev/hidraw*`); pass that device with `--device`, or use `--privileged` if the number changes between boots. Install the udev rules on the Docker host too. `docker logs ajazz-bridge` should show `[HID] Secured …` and `ADD-DEVICE OK`. Tagging a release (`v*`) on GitHub publishes `ghcr.io/<owner>/ajazz-companion-bridge` for amd64 and arm64 with `.github/workflows/docker.yml`.

## Unraid

The pad must be plugged into the Unraid server for this route. If it is plugged into your PC, run the bridge on the PC instead (step 5).

1. Build the image on the server (`docker build -t ajazz-companion-bridge /path/to/ajazz-bridge`), or use the `ghcr.io` image once published.
2. Copy `deploy/unraid/ajazz-bridge.xml` to `/boot/config/plugins/dockerMan/templates-user/`, then **Docker → Add Container → ajazz-companion-bridge**. Set **Repository** to your image if you built it locally.
3. Set **Companion host** to the Unraid IP if Companion is another container, or to the IP of the machine that runs Companion.
4. The template runs with `--privileged` so the container can open the USB HID device. To avoid that, turn Privileged off and add `--device=/dev/hidrawN` under Extra Parameters.
5. If the deck is plugged into another PC rather than Unraid, run the bridge on that PC and point it at Companion on Unraid.
