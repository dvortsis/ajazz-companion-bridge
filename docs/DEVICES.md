# Supported devices

**In plain words:** the **Ajazz AKP05E** is the pad this bridge was built and tested on, so it is the safe choice. The other pads in the list are _experimental_: the bridge recognises them and tries the same approach, but nobody has confirmed they work. If you own one, you can help by running the `npm run probe` check described below and sharing the result. The table and sections below are the technical details.

**How to tell which pad you have:** on Windows open Device Manager → Human Interface Devices → your pad → Properties → Details → _Hardware Ids_; it shows `VID_0300&PID_3004` for the AKP05E (VID is the maker's id, PID the product id).

Each product is one entry in `SUPPORTED_DEVICES` in `devices.js`: USB ids, grid size, report size, init sequence and a **layout** (input event → Companion key, Companion key → draw slot, touch-strip geometry). Nothing else in the code names a product.

| Device                         | USB id (vid:pid)                        | Companion id           | Status               |
| :----------------------------- | :-------------------------------------- | :--------------------- | :------------------- |
| **Ajazz AKP05E**               | `0300:3004`                             | `AJAZZ_AKP05`          | **Tested** (Windows) |
| Ajazz AKP153 / 153E / 153R     | `0300:1530` / `0300:1010` / `0300:1020` | `AJAZZ_AKP153…`        | Experimental         |
| Ajazz AKP05E Pro               | `0300:3013`                             | `AJAZZ_AKP05E_PRO`     | Experimental         |
| Mirabox N4 / N4E               | `6602:1001` / `6603:1007`               | `MIRABOX_N4`, `…_N4E`  | Experimental         |
| Ajazz AKP05 (3006)             | `0300:3006`                             | `AJAZZ_AKP05_3006`     | Experimental         |
| Ajazz AKP05CN Pro              | `0300:3014`                             | `AJAZZ_AKP05CN_PRO`    | Experimental         |
| Mirabox N4 Pro / N4 Pro E      | `5548:1008` / `5548:1021`               | `MIRABOX_N4_PRO…`      | Experimental         |
| VSDinside N4 / N4 Pro          | `5548:1004` / `5548:1023`               | `VSD_N4`, `VSD_N4_PRO` | Experimental         |
| Mirabox MSD Pro                | `0b00:1003`                             | `MIRABOX_MSD_PRO`      | Experimental         |
| CN003, Streonor S10 Pro, SS552 | `1500:3002`, `1500:3007`, `0200:3001`   | see `devices.js`       | Experimental         |

**Tested** means a person ran it on the real device against real Companion: registration, every image, and every key, touch zone, swipe and dial. Upstream projects call the `0300:3004` device the "AKP05E"; the bridge keeps the original `AJAZZ_AKP05` id so existing Companion surface configuration keeps working.

**Experimental** profiles were built from [ambiso/opendeck-akp05](https://github.com/ambiso/opendeck-akp05) and [4ndv/mirajazz](https://github.com/4ndv/mirajazz) and carry `tested: false`; opening one logs a warning. The AKP153 family and Mirabox N4/N4E profiles still use the original init bytes, which the reference projects do not confirm. AKP153-class devices use 512-byte (protocol v1) packets upstream, but this bridge's image path is AKP05's, so expect them to need work.

## Verifying a device

1. `npm run probe` lists matching USB interfaces and prints every raw input report with the time since the previous one.
2. Press every key, touch every zone, turn and push every dial, swipe. Compare `action=0x..` values with `ACTIONS` in `parser.js`.
3. Run the bridge, check the images and every control in Companion.
4. Set `tested: true` on the profile in `devices.js`, update this table, and open a pull request or issue with the probe output.

## Adding a device

Add a `profile({...})` entry to `SUPPORTED_DEVICES`: `id` (becomes the Companion `DEVICEID`), `name`, `vid`, `pid`, `rows`, `initSequence`, and optionally `packetPayload`, `usagePage` and a custom `layout` built with `buildLayout()` if its controls differ from the AKP05's. New input codes go in `ACTIONS` in `parser.js`. The Linux udev rules and tests are generated from this list, so run `node scripts/udev-rules.js > deploy/linux/99-ajazz-bridge.rules` afterwards.
