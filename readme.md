# Ajazz / Mirabox Companion Bridge

**Use your Ajazz or Mirabox button pad with [Bitfocus Companion](https://bitfocus.io/companion).**

Companion is free software that turns buttons into shortcuts: control lights, start apps, run smart-home scenes, and more. It normally works with Elgato Stream Decks. This small program lets it work with your Ajazz/Mirabox pad too: it shows Companion's button pictures on the pad's screens and tells Companion when you press a key, touch the strip, swipe or turn a dial.

![An Ajazz AKP05E showing Companion buttons](screenshot.png)

## What you get

- All the screen keys, the long **touch strip** (four touch buttons), the **dials** (turn and press) and **swipes**.
- Works on **Windows, Mac, Linux** and on a home server such as **Unraid** (using Docker).
- Fixes itself: if you unplug the pad or restart Companion, it reconnects on its own.

## What you need

- An **Ajazz AKP05E** pad (USB id `0300:3004`). This is the one that has been tested on real hardware. Other Ajazz and Mirabox pads are included as _experimental_: they may or may not work. See [docs/DEVICES.md](docs/DEVICES.md).
- A computer the pad is plugged into (Windows, Mac or Linux).
- **Bitfocus Companion** 3.0 or newer, running on that computer or any other computer on your network.
- **Node.js** (a free program that runs the bridge), version 20 or newer, from [nodejs.org](https://nodejs.org/). Pick the "LTS" download.

## Set it up in 5 steps (Windows)

New to this? The full walkthrough with every click is in **[docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)**. The short version:

1. **Turn on Companion's "Satellite API"**: in Companion open _Settings_ → _Satellite API_ and switch it on (port `16622`).
2. **Stop Companion from grabbing the pad itself**: _Settings_ → _Surfaces_ → switch **off** "Enable connected Mirabox Stream Dock devices".
3. **Install Node.js** from [nodejs.org](https://nodejs.org/) (keep the default options).
4. **Download this project** (green **Code** button on GitHub → _Download ZIP_), unzip it somewhere permanent, such as `C:\Ajazz-Bridge`, and double-click **`setup.cmd`**. It installs what the bridge needs and asks whether to start it automatically when you log in.
5. **Start it**: double-click **`launch-bridge.vbs`** (or run `npm start`). A small icon appears in the system tray (bottom-right, near the clock). Within a few seconds your pad lights up with your Companion buttons.

To stop the bridge, right-click the tray icon and choose **Quit**.

Mac, Linux and Unraid instructions: [docs/PLATFORMS.md](docs/PLATFORMS.md).

## Which Companion button is which? (AKP05E)

In Companion, the pad appears as a grid of 5 columns by 4 rows:

| On the pad                       | Row in Companion | Buttons       |
| :------------------------------- | :--------------- | :------------ |
| Top row of screen keys           | 0                | `0/0` … `0/4` |
| Middle row of screen keys        | 1                | `1/0` … `1/4` |
| Touch strip (four touch buttons) | 2                | `2/0` … `2/3` |
| Swipe the strip to the left      | 2                | `2/4`         |
| The four dials, left to right    | 3                | `3/0` … `3/3` |
| Swipe the strip to the right     | 3                | `3/4`         |

Buttons are numbered _row/column_, starting at 0 (so `1/2` is the middle row, third key). To make a dial do something when you turn it, open its button (for example `3/0`) in Companion and use the **Rotary Actions** section for "turn left" and "turn right". Pressing the dial in works like a normal button press.

## Common settings

You normally don't need to change anything. If you do, edit the file named `.env` in the bridge folder (right-click → _Open with_ → _Notepad_). Lines starting with `#` are comments. Restart the bridge after saving.

| Setting              | Default     | What it does                                                                 |
| :------------------- | :---------- | :--------------------------------------------------------------------------- |
| `COMPANION_HOST`     | `127.0.0.1` | The address of the computer running Companion. Leave as is if it's this one. |
| `HID_WRITE_DELAY_MS` | `0`         | If pictures look torn or half-drawn, try `1`, then `2`, then `5`.            |
| `LOG_LEVEL`          | `info`      | Set to `debug` when asking for help (makes the log much more detailed).      |

All other settings: [docs/CONFIGURATION.md](docs/CONFIGURATION.md).

## Something not working?

Start with **[docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)**. It covers the usual causes in plain language: the pad staying dark, "Companion offline", pictures tearing, a key doing nothing, and more.

## All the guides

| If you want to…                               | Read                                                             |
| :-------------------------------------------- | :--------------------------------------------------------------- |
| Install and use the bridge step by step       | [docs/GETTING-STARTED.md](docs/GETTING-STARTED.md)               |
| Fix a problem                                 | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)               |
| Set it up on Mac, Linux, Docker or Unraid     | [docs/PLATFORMS.md](docs/PLATFORMS.md)                           |
| Change a setting                              | [docs/CONFIGURATION.md](docs/CONFIGURATION.md)                   |
| See which pads work, or help test another one | [docs/DEVICES.md](docs/DEVICES.md)                               |
| Understand how the code works                 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                     |
| Contribute, or see what changed               | [CONTRIBUTING.md](CONTRIBUTING.md), [CHANGELOG.md](CHANGELOG.md) |

## Credits and licence

Built on the reverse-engineering work of [ambiso/opendeck-akp05](https://github.com/ambiso/opendeck-akp05) and [4ndv/mirajazz](https://github.com/4ndv/mirajazz). Free to use under the [MIT License](LICENSE).
