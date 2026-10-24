# Chapter 4: Keep Ajazz Companion Bridge safe

Keep [Companion](glossary.md#companion)'s control ports on your private network, use minimal USB permissions and update without losing your configuration.

> [!NOTE]
> **What you will learn**
> - Keep Companion's web UI and [Satellite API](glossary.md#satellite-api) off the public internet.
> - Run the Docker or Unraid [container](glossary.md#container) without Privileged mode.
> - Update and back up your `.env` and [appdata](glossary.md#appdata) settings safely.
> - Share `bridge.log` for support without exposing private network details.

## 4.1 Keep Companion and the Satellite API private

<!-- index: remote access; VPN; port forwarding; security -->

Companion's web UI (port `8000`) and Satellite API (port `16622`) have no login check on Satellite commands. Any program that reaches port `16622` can press buttons and trigger actions, so keep both ports on your home network in [host mode](glossary.md#host-mode) or bridge mode.

| Option | When to use it |
|---|---|
| **Local LAN or VPN (recommended)** | Companion and the bridge are on the same machine, the same home LAN, or linked through a [VPN](glossary.md#vpn) such as WireGuard or Tailscale. |
| Router port forward for `8000` or `16622` | Never. Anyone on the internet could trigger your Companion buttons. |

> [!WARNING]
> Don't add a [port forwarding](glossary.md#port-forwarding) rule on your router for Companion (`8000`) or the Satellite API (`16622`). Use a VPN such as WireGuard or Tailscale instead when linking a pad away from home.

<details>
<summary>Why the bridge uses host mode in Docker without exposing a port</summary>

In `docker-compose.yml` and the Unraid template, the bridge uses [host mode](glossary.md#host-mode) (`network_mode: host`) so `COMPANION_HOST=127.0.0.1` reaches a Companion instance running on the same server. Unlike a web server, the bridge opens no listening port at all; it only makes an outbound TCP connection to `COMPANION_HOST:COMPANION_PORT`.

</details>

## 4.2 Use least-privilege USB access

<!-- index: hidraw; udev rules; SmartScreen; Privileged mode -->

On Linux and Unraid, avoid running the bridge as root or in a privileged container:

- **Unraid and Docker:** pass only the pad's `/input0` [hidraw](glossary.md#hidraw) node (`--device=/dev/hidrawN:/dev/hidrawN`) and keep **Privileged** off.
- **Linux desktop or server:** install `deploy/linux/99-ajazz-bridge.rules` ([udev rules](glossary.md#udev-rules)) so your regular user account can open the pad without `sudo`.
- **Windows and macOS:** download release bundles only from the official GitHub **Releases** page (`https://github.com/dvortsis/ajazz-companion-bridge/releases`).

## 4.3 Back up settings and update

<!-- index: backup; updates; .env -->

The bridge stores no database. Your only custom state is your `.env` file (or Unraid template) and your Companion layout (exported from Companion's menu).

To update the bridge on Windows:

1. Right-click the Ajazz Bridge icon in the [system tray](glossary.md#system-tray) and select **Quit**.
   **Result:** The tray icon disappears and the bridge releases the USB pad.
2. Download the newest `ajazz-bridge-<version>-windows-x64.zip` and extract it over your existing `C:\Ajazz-Bridge` folder.
   **Result:** The program files update while your `.env` file stays untouched (the bundle ships `.env.example`, not `.env`).
3. Double-click **`launch-bridge.vbs`**.
   **Result:** The updated bridge starts and reconnects to Companion.

| Mistake | What to do instead |
|---|---|
| Extracting the new zip into `Downloads` | Extract over your permanent folder (`C:\Ajazz-Bridge`) so your startup shortcut still points to it |
| Starting a second copy without quitting first | Quit from the tray menu before updating so `node.exe` isn't locked |
| Turning on **Privileged** after an Unraid reboot | Run the `/sys/class/hidraw` check to find the new `/input0` node number and update **USB HID device** |

## 4.4 Share logs safely

<!-- index: logs; bridge.log -->

`bridge.log` stores no passwords or API keys, only USB events and the `COMPANION_HOST` address. If `COMPANION_HOST` is set to a public IP or private hostname you don't want to share, replace it with `<redacted>` before attaching `bridge.log` to a GitHub issue.

## 4.5 Check your understanding

1. You want to use your pad at a remote studio to trigger Companion at home. How should the bridge reach your home network?
2. Why does extracting a Windows update over `C:\Ajazz-Bridge` keep your settings?

> [!TIP]
> **Key takeaways**
> - Never port-forward Companion (`8000`) or the Satellite API (`16622`) on your router; use a VPN.
> - Pass the `/input0` `/dev/hidrawN` device to Docker and keep **Privileged** off.
> - Quit the bridge from the tray before extracting an update over your install folder.

<!-- nav:start -->
---

[← Chapter 3: Set up buttons in Companion](03-set-up-buttons-in-companion.md) · [Contents](README.md#contents) · [Chapter 5: Troubleshooting →](05-troubleshooting.md)
<!-- nav:end -->
