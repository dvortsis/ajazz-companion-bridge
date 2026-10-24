# Chapter 3: Set up buttons in Companion

Map your pad's screen keys, [touch strip](glossary.md#touch-strip), swipes and dials on [Companion](glossary.md#companion)'s 5×4 button grid, and tune drawing or input options when needed.

> [!NOTE]
> **What you will learn**
> - Find your connected pad under **Surfaces** in Companion.
> - Map the 10 LCD keys, 4 touch zones, 2 swipes and 4 rotary dials by row and column.
> - Configure rotary left/right actions and dial pushes.
> - Adjust `.env` settings for remote Companion hosts, strip alignment or dial behavior.

## 3.1 Map keys, touch strip, swipes and dials

<!-- index: button layout; rotary actions; dials; touch strip; swipes -->

In Companion, the Ajazz AKP05E registers as a [surface](glossary.md#surface) with ID `AJAZZ_AKP05` and a grid of 5 columns by 4 rows (20 slots, numbered `row/column` from `0/0`).

| On the pad | Row in Companion | Buttons (`row/col`) | How it works |
|---|---|---|---|
| Top row of 5 LCD keys | Row 0 | `0/0` to `0/4` | Full press and release; shows 112×112 button graphics |
| Middle row of 5 LCD keys | Row 1 | `1/0` to `1/4` | Full press and release; shows 112×112 button graphics |
| Touch strip (4 touch zones) | Row 2 | `2/0` to `2/3` | Tap triggers a click; shows 4 icons across the wide strip |
| Swipe strip left | Row 2 | `2/4` | Swiping left across the strip triggers button `2/4` |
| Four rotary dials (left to right) | Row 3 | `3/0` to `3/3` | Turn triggers rotary actions; pushing clicks the button |
| Swipe strip right | Row 3 | `3/4` | Swiping right across the strip triggers button `3/4` |

To assign a rotary dial's turn and push actions in Companion:

1. Open Companion in your browser and select **Buttons**.
2. Select slot **`3/0`** (the leftmost dial on row 3, column 0).
3. Switch **Rotary Actions** on at the top of the button editor.
   **Result:** Separate **Rotate Left** and **Rotate Right** action lists appear alongside the normal press actions.
4. Add your turn actions under **Rotate Left** and **Rotate Right**, and add any push click action under **Press**.
   **Result:** Turning the first dial runs the rotary actions, and pressing the dial in runs the press action.

> [!NOTE]
> **Worked example**
> You run Companion on a second PC at `192.168.1.50` while the pad is plugged into your Windows desk PC. Open `C:\Ajazz-Bridge\.env` in Notepad, set `COMPANION_HOST=192.168.1.50`, save the file, right-click the [system tray](glossary.md#system-tray) icon, select **Quit**, and double-click `launch-bridge.vbs`. The tray status changes to connected and the pad fills with the remote computer's buttons.

## 3.2 Optional drawing and input settings

<!-- index: .env; HID_WRITE_DELAY_MS; AKP05_STRIP_EDGE_PADDING; BRIDGE_SHIFT_ROTATE -->

Most setups need no changes. On Windows, macOS and Linux, settings live in `.env` inside the bridge folder (copied from `.env.example`). On Unraid and Docker, pass them as [container](glossary.md#container) environment variables in [appdata](glossary.md#appdata) or the template.

### HID_WRITE_DELAY_MS

Pause in milliseconds between 1025-byte USB image packets.

**Recommended:** `0`. If button graphics look torn or half-drawn on a slow USB controller, try `1`, then `2`, then `5`.

### AKP05_STRIP_EDGE_PADDING

Black margin in pixels between the left/right edges of the touch strip and the outer strip icons.

**Recommended:** `8`, which centers the four strip icons directly above the four physical dials. Set `0` to place outer icons flush with the strip edges.

### BRIDGE_IDLE_OFF_MINUTES

Minutes of no input before the bridge blanks or dims the pad's screens (`0` disables idle blanking).

**Recommended:** `0`, or `15` to `30` if the pad stays on overnight and you want the LCDs to sleep until touched.

### BRIDGE_SHIFT_ROTATE

Press-and-turn mode for the four dials. When set to `1`, holding a dial in while turning sends the rotation to row 4 (`4/0` to `4/3`, expanding the surface to 5 rows).

**Recommended:** `0` unless you need a second layer of four rotary functions.

## 3.3 Check your understanding

1. Which Companion button slot triggers when you swipe the touch strip to the right?
2. Where in Companion's button editor do you add actions for turning a dial left or right?

> [!TIP]
> **Key takeaways**
> - Row 0 and Row 1 are the 10 LCD keys; Row 2 (`2/0`–`2/3`) is the touch strip; Row 3 (`3/0`–`3/3`) is the four dials.
> - Swiping left triggers `2/4` and swiping right triggers `3/4`.
> - Enable **Rotary Actions** on slots `3/0` to `3/3` to respond to dial turns.

<!-- nav:start -->
---

[← Chapter 2: Install the bridge on your machine](02-install-ajazz-companion-bridge.md) · [Contents](README.md#contents) · [Chapter 4: Keep Ajazz Companion Bridge safe →](04-keep-ajazz-companion-bridge-safe.md)
<!-- nav:end -->
