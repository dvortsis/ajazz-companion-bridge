# Troubleshooting

Find your symptom below. For most problems, the tray icon's top line and the log file (tray menu → **Open log**) tell you what is wrong.

## The pad stays dark

1. **Is it plugged in directly?** Try another USB port, and avoid unpowered hubs.
2. **Is the pad's own app closed?** Only one program can use the pad at a time. Close the manufacturer's software (and any other Stream Deck-style software).
3. **Did you switch off Companion's Mirabox driver?** In Companion: _Settings_ → _Surfaces_ → turn **off** "Enable connected Mirabox Stream Dock devices". Otherwise Companion keeps the pad for itself.
4. **Is the bridge running?** Look for its icon in the system tray (it may be hidden behind the `^`). If it isn't there, start it with `launch-bridge.vbs`.
5. **Is your pad supported?** Only the AKP05E (`0300:3004`) is confirmed. See [DEVICES.md](DEVICES.md).

## The tray says "Companion offline"

The bridge can't reach Companion.

- Is Companion running?
- Is the **Satellite API** switched on in Companion (_Settings_ → _Satellite API_), with port `16622`?
- If Companion is on a different computer, set `COMPANION_HOST` in `.env` to that computer's address (for example `192.168.1.50`) and make sure its firewall allows port 16622.

The bridge keeps retrying by itself, so once Companion is ready it connects without you doing anything.

## Companion says "Device exists elsewhere"

Two programs are trying to be the same pad. Usually that is a second copy of the bridge running (for example one started at login plus one you started by hand), or Companion's own Mirabox driver. Quit every bridge from the tray menu, make sure the Mirabox driver is switched off in Companion, then start one bridge.

## Pictures look torn, flicker or only half draw

Slow the drawing down slightly. In `.env` set `HID_WRITE_DELAY_MS=1`; if it persists try `2`, then `5`. Restart the bridge after changing it.

## The wrong icon is under a dial (strip icons not lined up)

The strip icons are placed 8 px in from the edges by default. To move them further in or out, set `AKP05_STRIP_EDGE_PADDING` in `.env` (`0` puts them right at the edges, larger numbers move them in).

## A key, dial or the strip does nothing

1. Check it's mapped in Companion: the row/column table is in [GETTING-STARTED.md](GETTING-STARTED.md#step-6-set-up-your-buttons-in-companion). A button with no action does nothing.
2. Dials need actions under **Rotary Actions** in Companion to react when turned.
3. Run the probe to see whether the pad itself reports it: close the bridge, open PowerShell in the bridge folder and run `npm run probe`. Press the control. If a line like `action=0x…` appears, the pad works and the issue is in mapping; if nothing appears, tell us (below).

## The bridge won't start, or closes straight away

- Is **Node.js** installed? In PowerShell run `node -v`; it should show 20 or higher.
- Did `setup.cmd` finish without errors? Run it again.
- Is another copy already running? The second copy exits silently by design. Check the tray.
- Open the log (tray icon, or the file `bridge.log` in the bridge folder) and read the last few lines.

## Mac or Linux: "permission denied" opening the pad

- **Linux:** install the USB permission rules, then unplug and replug the pad. Steps are in [PLATFORMS.md](PLATFORMS.md#linux-desktop-or-server).
- **Mac:** macOS may ask to let your terminal app monitor input devices. Allow it under _System Settings_ → _Privacy & Security_ → _Input Monitoring_.

## How to ask for help

Open an issue on the project's GitHub page and include:

1. Your pad's exact model and your operating system.
2. What you expected and what happened.
3. The log: set `LOG_LEVEL=debug` in `.env`, restart the bridge, reproduce the problem, then attach `bridge.log` (tray menu → **Open log**). It contains no passwords.
4. If a control does nothing: the output of `npm run probe` while pressing it.
