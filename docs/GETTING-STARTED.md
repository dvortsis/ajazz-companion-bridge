# Getting started (step by step)

This guide assumes no technical background. It uses Windows; Mac, Linux and Unraid are in [PLATFORMS.md](PLATFORMS.md). Allow about 15 minutes.

## How it fits together

```text
 Your pad ──USB──▶ This bridge ──network──▶ Bitfocus Companion
 (keys, strip,      (a small program        (where you set up
  dials)             running on the          what each button does)
                     computer the pad
                     is plugged into)
```

The bridge is a translator. Companion decides what each button looks like and does; the bridge shows those pictures on the pad and reports your presses back. You set up buttons in Companion as usual.

## Words you'll see

| Word                      | Meaning                                                                                                       |
| :------------------------ | :------------------------------------------------------------------------------------------------------------ |
| **Companion**             | The Bitfocus program that runs your buttons.                                                                  |
| **Satellite API**         | The feature in Companion that lets other programs (like this bridge) act as buttons. It must be switched on.  |
| **Node.js**               | A free program that runs the bridge. You install it once and never open it yourself.                          |
| **Terminal / PowerShell** | The text window where you type commands. Only needed for a few optional steps.                                |
| **System tray**           | The row of small icons at the bottom-right of the Windows screen, next to the clock (some hide behind a `^`). |
| **Surface**               | Companion's word for a connected device that shows buttons: your pad is a "surface".                          |
| **`.env` file**           | A small text file of settings in the bridge folder. You only edit it if you want to change something.         |

## Step 1: Switch on Companion's Satellite API

1. Open Companion's web page. By default it is [http://127.0.0.1:8000](http://127.0.0.1:8000).
2. Click **Settings**, then **Satellite API**.
3. Turn **Enable Satellite API** on. Leave the port as `16622`. Save if there is a Save button.

## Step 2: Stop Companion from grabbing the pad

Companion can try to drive Mirabox-style pads on its own, and then the bridge can't use them. Turn that off:

1. In Companion go to **Settings** → **Surfaces**.
2. Switch **off** "Enable connected Mirabox Stream Dock devices".

If you don't own an Elgato Stream Deck you can switch that option off too.

## Step 3: Install Node.js

1. Go to [nodejs.org](https://nodejs.org/) and download the **LTS** version (version 20 or newer).
2. Run the installer and keep the default options.

To check it worked, open the Start menu, type `powershell`, open it, and type `node -v`. You should see something like `v22.12.0`. Any number 20 or higher is fine.

## Step 4: Get the bridge

1. Open the project page on GitHub, click the green **Code** button, then **Download ZIP**.
2. Right-click the ZIP → **Extract All…**, and extract it to a folder you will keep, for example `C:\Ajazz-Bridge`. Don't leave it in Downloads or the Temp folder.
3. Open that folder and double-click **`setup.cmd`**. A black window opens and installs what the bridge needs (it needs an internet connection and takes a minute or two). It also creates your settings file, `.env`.
4. When it asks "Start the bridge automatically when you log in?", type `y` and press Enter if you want that, or press Enter to skip.

If Windows shows a security warning (for example a blue "Windows protected your PC" notice, or "Open File - Security Warning"), click **More info** → **Run anyway** (or **Run**). The script only installs the bridge's dependencies and you can open it in Notepad to read it first.

## Step 5: Start it

1. Plug in your pad.
2. In the bridge folder, double-click **`launch-bridge.vbs`**. Nothing visible happens except a small icon appearing in the system tray.
3. Within a few seconds the pad's screens fill with your Companion buttons.

Right-click the tray icon to see its menu:

| Menu item          | What it does                                                           |
| :----------------- | :--------------------------------------------------------------------- |
| _(top line)_       | Status: which pad is connected and whether Companion is reachable.     |
| **Open log**       | Opens the log file; useful when asking for help.                       |
| **Open folder**    | Opens the bridge folder.                                               |
| **Reconnect**      | Reconnects to Companion and looks for the pad again.                   |
| **Start at login** | Tick it to start the bridge automatically when you sign in to Windows. |
| **Quit**           | Stops the bridge.                                                      |

## Step 6: Set up your buttons in Companion

Your pad shows up in Companion under **Surfaces**. It displays whichever Companion page it is set to, as a grid of 5 columns by 4 rows:

| On the pad                    | Companion button   |
| :---------------------------- | :----------------- |
| Top row of screen keys        | row 0: `0/0`–`0/4` |
| Middle row of screen keys     | row 1: `1/0`–`1/4` |
| The touch strip, four zones   | row 2: `2/0`–`2/3` |
| Swipe strip left / right      | `2/4` / `3/4`      |
| The four dials, left to right | row 3: `3/0`–`3/3` |

Buttons are written _row/column_ and counting starts at 0. To give a dial an action when you turn it, open its button in Companion (for example `3/0`) and add actions under **Rotary Actions** for turning left and right. Pressing the dial in acts like a normal button press.

## Changing how it behaves (optional)

Most people never need this. To change a setting, open the `.env` file in the bridge folder with Notepad (right-click → **Open with** → **Notepad**), remove the `#` at the start of the line you want, change the value, save, then choose **Quit** from the tray menu and start the bridge again. Examples:

```text
COMPANION_HOST=192.168.1.50     # Companion is on another computer at this address
HID_WRITE_DELAY_MS=2            # pictures looked torn, so slow the drawing down a little
```

Every setting is explained in [CONFIGURATION.md](CONFIGURATION.md).

## Keeping it running

- **Starts with Windows:** tick **Start at login** in the tray menu, or double-click `setup.cmd` again and answer `y`.
- **Updating:** download the newest ZIP, extract it over the same folder (your `.env` is kept), and run `setup.cmd` again.
- **Removing:** right-click the tray icon → untick **Start at login** → **Quit**, then delete the folder.

## If something goes wrong

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md). The quickest checks: is the pad plugged in, is Companion running with the Satellite API on, and is the manufacturer's own app for the pad closed?
