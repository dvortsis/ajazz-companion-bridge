/**
 * startup.js — Start the bridge when you log in to Windows.
 *
 * Writes a tiny launcher script into the per-user Startup folder that runs launch-bridge.vbs (hidden window,
 * auto-restart). CLI: `node startup.js install | uninstall | status` (or `npm run install-startup`).
 */
'use strict';

const fs = require('fs');
const path = require('path');

function startupFile() {
  const appData = process.env.APPDATA;
  if (process.platform !== 'win32' || !appData) return null;
  return path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AjazzBridge.vbs');
}

function isEnabled() {
  const f = startupFile();
  return !!f && fs.existsSync(f);
}

function enable() {
  const f = startupFile();
  if (!f) throw new Error('Start with Windows is only available on Windows');
  const launcher = path.join(__dirname, 'launch-bridge.vbs');
  const script = `CreateObject("WScript.Shell").Run "wscript.exe ""${launcher}""", 0, False\r\n`;
  fs.writeFileSync(f, script);
}

function disable() {
  const f = startupFile();
  if (f) fs.rmSync(f, { force: true });
}

/** Flip the setting; returns the new state. */
function toggle() {
  if (isEnabled()) disable();
  else enable();
  return isEnabled();
}

module.exports = { isEnabled, enable, disable, toggle, startupFile };

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'install') enable();
    else if (cmd === 'uninstall') disable();
    else if (cmd !== 'status') {
      console.log('usage: node startup.js install | uninstall | status');
      process.exit(1);
    }
    console.log(`Start with Windows: ${isEnabled() ? 'enabled' : 'disabled'}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
