/**
 * index.js — Main program: connects your deck(s) to Bitfocus Companion over the network.
 *
 * Outbound: Companion says which key image to show; we prepare it and send it over USB.
 * Inbound:  The deck reports a press / dial turn; we turn that into Companion key presses and rotations.
 *
 * Settings: `.env` or environment variables (see .env.example and docs/CONFIGURATION.md). Wiring only: the work
 * happens in config, log, devices, parser, protocol, layout, satellite, session, manager, worker-client +
 * image-worker, tray, startup and lock (see docs/ARCHITECTURE.md). `supervisor.js` restarts this process on a crash;
 * `node index.js --probe` dumps raw device reports instead of running the bridge.
 */
'use strict';

const path = require('path');
const { spawn } = require('child_process');
const config = require('./config');
const log = require('./log');
const { ROOT } = require('./paths');

function main() {
  const lock = require('./lock');
  const lockFile = path.join(ROOT, 'bridge.lock');
  try {
    if (!lock.acquire(lockFile)) {
      log.error('[BRIDGE] Another bridge instance is already running; exiting.');
      process.exit(0);
    }
  } catch (e) {
    // Read-only install directory (container, locked-down service): run without the single-instance guard.
    log.warn('[BRIDGE] Single-instance lock unavailable:', e.message || e);
  }

  const HID = require('node-hid');
  const { SatelliteClient } = require('./satellite');
  const { WorkerClient } = require('./worker-client');
  const { DeviceManager } = require('./manager');
  const startup = require('./startup');

  log.info(`[BRIDGE] Starting (Companion ${config.host}:${config.port}, log level ${config.logLevel})`);
  for (const w of config.warnings) log.warn(`[CONFIG] ${w}`);
  log.info('[HID] Inter-report delay:', config.hidWriteDelayMs, 'ms (set HID_WRITE_DELAY_MS to add pacing)');

  const worker = new WorkerClient();
  const satellite = new SatelliteClient({ ...config, bitmapSize: config.imageSize });
  const manager = new DeviceManager({ hid: HID, satellite, worker, config });

  let tray = null;
  let shuttingDown = false;

  function refreshStatus() {
    if (!tray) return;
    const link = satellite.connected ? 'Companion connected' : 'Companion offline';
    tray.setStatus(`${manager.describe()} · ${link}`);
  }
  manager.on('change', refreshStatus);
  satellite.on('connected', refreshStatus);
  satellite.on('disconnected', refreshStatus);

  function shutdown(code = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    const finish = () => {
      lock.release(lockFile);
      const t = tray;
      tray = null;
      const exit = () => process.exit(code);
      if (t) t.kill().then(exit, exit);
      else exit();
    };
    try {
      manager.stop();
    } catch (e) {
      log.warn('[BRIDGE] shutdown:', e.message || e);
    }
    // Give REMOVE-DEVICE a moment to leave the socket before tearing everything down.
    setTimeout(() => {
      satellite.stop();
      worker.terminate().finally(finish);
    }, 150);
    setTimeout(finish, 2000).unref();
  }

  process.on('uncaughtException', (e) => {
    log.error('[BRIDGE] Uncaught exception:', e && e.stack ? e.stack : e);
    shutdown(1);
  });
  process.on('unhandledRejection', (e) => {
    log.error('[BRIDGE] Unhandled rejection:', e && e.stack ? e.stack : e);
    shutdown(1);
  });
  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  if (!config.noTray) {
    const { createTray } = require('./tray');
    const opener = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
    const open = (target, exe = opener) => spawn(exe, [target], { detached: true, stdio: 'ignore' }).unref();
    tray = createTray({
      startupEnabled: startup.isEnabled(),
      openLog: () => open(log.file, process.platform === 'win32' ? 'notepad.exe' : opener),
      openFolder: () => open(ROOT),
      reconnect: () => {
        satellite.reconnect();
        manager.scan();
      },
      toggleStartup: () => {
        try {
          return startup.toggle();
        } catch (e) {
          log.warn('[TRAY] Start with Windows:', e.message || e);
          return startup.isEnabled();
        }
      },
      quit: () => shutdown(0),
    });
    refreshStatus();
  }

  satellite.start();
  manager.start();
}

if (process.argv.includes('--probe')) require('./probe').run();
else main();
