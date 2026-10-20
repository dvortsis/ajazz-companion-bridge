/**
 * startup.js — Start the bridge when you log in.
 *
 *   Windows: a launcher in the per-user Startup folder runs launch-bridge.vbs (hidden window, auto-restart).
 *   macOS:   a launchd agent (~/Library/LaunchAgents/com.ajazz.bridge.plist).
 *   Linux:   a systemd user service (~/.config/systemd/user/ajazz-bridge.service).
 *
 * CLI: `node startup.js install | uninstall | status` (or `npm run install-startup`).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { ROOT } = require('./paths');

const LAUNCHD_LABEL = 'com.ajazz.bridge';
const SYSTEMD_UNIT = 'ajazz-bridge.service';

/** Content generators are pure so they can be tested on any OS. */
function vbsContent(launcher) {
  return `CreateObject("WScript.Shell").Run "wscript.exe ""${launcher}""", 0, False\r\n`;
}

function xmlEscape(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plistContent({ nodePath, appDir, logDir }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCHD_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(nodePath)}</string>
    <string>${xmlEscape(path.join(appDir, 'src', 'supervisor.js'))}</string>
  </array>
  <key>WorkingDirectory</key><string>${xmlEscape(appDir)}</string>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${xmlEscape(path.join(logDir, 'launchd.out.log'))}</string>
  <key>StandardErrorPath</key><string>${xmlEscape(path.join(logDir, 'launchd.err.log'))}</string>
</dict>
</plist>
`;
}

function unitContent({ nodePath, appDir }) {
  return `[Unit]
Description=Ajazz / Mirabox Companion Bridge
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${appDir}
ExecStart=${nodePath} ${path.join(appDir, 'src', 'supervisor.js')}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

/** Where the login item lives on this OS, or null when unsupported. */
function startupFile(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'win32') {
    return env.APPDATA
      ? path.join(env.APPDATA, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'AjazzBridge.vbs')
      : null;
  }
  if (platform === 'darwin') return path.join(home, 'Library', 'LaunchAgents', `${LAUNCHD_LABEL}.plist`);
  if (platform === 'linux')
    return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'systemd', 'user', SYSTEMD_UNIT);
  return null;
}

function isEnabled() {
  const f = startupFile();
  return !!f && fs.existsSync(f);
}

/** Best effort: login items still work after the next login even if the service manager is unreachable. */
function run(cmd, args) {
  try {
    execFileSync(cmd, args, { stdio: 'ignore' });
  } catch (_) {
    // Not fatal.
  }
}

function enable() {
  const f = startupFile();
  if (!f) throw new Error(`Start at login is not supported on ${process.platform}`);
  const appDir = ROOT;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  if (process.platform === 'win32') {
    fs.writeFileSync(f, vbsContent(path.join(appDir, 'launch-bridge.vbs')));
  } else if (process.platform === 'darwin') {
    fs.writeFileSync(f, plistContent({ nodePath: process.execPath, appDir, logDir: appDir }));
    run('launchctl', ['load', '-w', f]);
  } else {
    fs.writeFileSync(f, unitContent({ nodePath: process.execPath, appDir }));
    run('systemctl', ['--user', 'daemon-reload']);
    run('systemctl', ['--user', 'enable', SYSTEMD_UNIT]);
  }
}

function disable() {
  const f = startupFile();
  if (!f) return;
  if (process.platform === 'darwin' && fs.existsSync(f)) run('launchctl', ['unload', '-w', f]);
  if (process.platform === 'linux' && fs.existsSync(f)) {
    run('systemctl', ['--user', 'disable', '--now', SYSTEMD_UNIT]);
  }
  fs.rmSync(f, { force: true });
  if (process.platform === 'linux') run('systemctl', ['--user', 'daemon-reload']);
}

/** Flip the setting; returns the new state. */
function toggle() {
  if (isEnabled()) disable();
  else enable();
  return isEnabled();
}

module.exports = { isEnabled, enable, disable, toggle, startupFile, vbsContent, plistContent, unitContent };

if (require.main === module) {
  const cmd = process.argv[2];
  try {
    if (cmd === 'install') enable();
    else if (cmd === 'uninstall') disable();
    else if (cmd !== 'status') {
      console.log('usage: node startup.js install | uninstall | status');
      process.exit(1);
    }
    console.log(`Start at login: ${isEnabled() ? 'enabled' : 'disabled'}`);
    if (cmd === 'install' && process.platform === 'linux') {
      console.log(
        'Start it now with: systemctl --user start ajazz-bridge   (and: loginctl enable-linger $USER to run without logging in)'
      );
    }
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
