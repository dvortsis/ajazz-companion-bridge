# Chapter 5: Troubleshooting

Find your symptom in the table below. Each [surface](glossary.md#surface) and [hidraw](glossary.md#hidraw) check points to the exact setting to change.

## 5.1 Common problems

<!-- index: troubleshooting; dark pad; Companion offline; torn images; permission denied -->

| Problem | Likely cause | Fix |
|---|---|---|
| The pad stays dark | Manufacturer's app or [Companion](glossary.md#companion)'s built-in Mirabox driver is holding the USB device | Close the manufacturer's software, and in Companion open **Settings** > **Surfaces** and turn **Enable connected Mirabox Stream Dock devices** off |
| [System tray](glossary.md#system-tray) says `Companion offline` | Companion isn't running, the [Satellite API](glossary.md#satellite-api) is off, or `COMPANION_HOST` is wrong | Open Companion > **Settings** > **Satellite API**, turn **Enable Satellite API** on (port `16622`), and set `COMPANION_HOST` in `.env` if Companion is on another computer |
| Companion says `Device exists elsewhere` | Two copies of the bridge are running, or Companion's Mirabox driver is still on | Right-click every Ajazz Bridge tray icon and select **Quit**, turn off Companion's Mirabox surface option, then start one bridge |
| Button pictures look torn, flicker or half-draw | USB packets arrive faster than your USB hub or controller handles them | Plug the pad directly into the computer, or set `HID_WRITE_DELAY_MS=1` (then `2` or `5`) in `.env` and restart the bridge |
| [Touch strip](glossary.md#touch-strip) icons don't line up over the dials | Strip edge padding differs from your viewing angle | Set `AKP05_STRIP_EDGE_PADDING` in `.env` (`8` is default; `0` moves outer icons flush to the edges) and restart |
| Turning a dial does nothing | No rotary actions are assigned on that button slot in Companion | In Companion open slot `3/0`–`3/3`, switch **Rotary Actions** on, and add **Rotate Left** and **Rotate Right** actions |
| Linux or macOS says `permission denied` opening the pad | Missing [udev rules](glossary.md#udev-rules) on Linux, or missing Input Monitoring permission on macOS | On Linux install `deploy/linux/99-ajazz-bridge.rules` and replug the pad; on macOS allow your terminal under **System Settings** > **Privacy & Security** > **Input Monitoring** |
| Unraid or Docker log says `No supported devices found` | The wrong `/dev/hidrawN` node was passed into the [container](glossary.md#container), or the number changed after a reboot | Run the `/sys/class/hidraw` command from [Chapter 2](02-install-ajazz-companion-bridge.md#22-install-on-unraid) to find the node ending in `/input0` and update **USB HID device** |

## 5.2 Probe a control and get help

<!-- index: probe; debug log; bridge.log -->

If a button, touch zone or dial still does nothing, run the hardware probe. It checks whether the pad sends USB reports when you press a control.

To test your pad with the hardware probe on Windows:

1. Right-click the Ajazz Bridge tray icon and select **Quit** so the bridge releases the pad.
2. Open PowerShell in your bridge folder (`C:\Ajazz-Bridge`) and run the command below.

   In PowerShell, inside the bridge folder, paste:

   ```powershell
   npm run probe
   ```

   **Result:** PowerShell lists matching USB interfaces and prints a line with `action=0x...` every time you press a key, tap the strip or turn a dial.
3. Press **Ctrl+C** in PowerShell to stop the probe, then start the bridge again with **`launch-bridge.vbs`**.
   **Result:** The probe exits and the bridge reconnects to Companion.

When opening an issue on GitHub (`https://github.com/dvortsis/ajazz-companion-bridge/issues`), include your pad's USB ID (`vid:pid`) and your operating system. Attach the `npm run probe` output and `bridge.log` captured with `LOG_LEVEL=debug` in `.env` (or in [appdata](glossary.md#appdata) on Unraid).

<!-- nav:start -->
---

[← Chapter 4: Keep Ajazz Companion Bridge safe](04-keep-ajazz-companion-bridge-safe.md) · [Contents](README.md#contents) · [Appendix A: Answers to check your understanding →](appendix-a-answers.md)
<!-- nav:end -->
