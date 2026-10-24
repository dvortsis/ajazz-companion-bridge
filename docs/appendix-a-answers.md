# Appendix A: Answers to check your understanding

Answers to the questions at the end of each chapter, in the same order.

## Chapter 1: Before you start

1. Your Windows PC. The bridge always runs on the machine holding the physical USB cable, and reaches Companion over the network using `COMPANION_HOST`.
2. Switch **Enable Satellite API** on (under **Settings** > **Satellite API**, port `16622`) and switch **Enable connected Mirabox Stream Dock devices** off (under **Settings** > **Surfaces**).

## Chapter 2: Install the bridge on your machine

1. `/dev/hidraw7` (the entry whose `HID_PHYS` ends in `/input0`). The `/input1` node is a secondary keyboard interface that doesn't accept button images.
2. Passing the single `/dev/hidrawN` device gives the container access only to the pad, instead of exposing every disk and USB device on the server.

## Chapter 3: Set up buttons in Companion

1. Button `3/4` (row 3, column 4). Swiping left triggers `2/4`.
2. Open the dial's slot (`3/0` to `3/3`), turn **Rotary Actions** on, and add actions under **Rotate Left** and **Rotate Right**.

## Chapter 4: Keep Ajazz Companion Bridge safe

1. Connect the remote computer to your home network over a VPN such as WireGuard or Tailscale, never by port-forwarding port `16622` on your router.
2. The release bundle ships `.env.example` rather than `.env`, so extracting over your existing folder updates the code without overwriting your `.env` file.

<!-- nav:start -->
---

[← Chapter 5: Troubleshooting](05-troubleshooting.md) · [Contents](README.md#contents) · [Appendix B: Settings reference →](appendix-b-settings-reference.md)
<!-- nav:end -->
