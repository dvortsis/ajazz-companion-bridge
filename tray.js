/**
 * tray.js — System-tray / menu-bar icon (Windows, macOS, Linux desktop) with status text and a small menu.
 *
 * Menu: status line, Open log, Open folder, Reconnect, Start at login (toggle), Quit.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const SysTray = require('systray2').default;
const log = require('./log');

/**
 * @param {{openLog: Function, openFolder: Function, reconnect: Function, toggleStartup: () => boolean,
 *          quit: Function, startupEnabled: boolean}} actions
 * @returns {{setStatus: (text: string) => void, kill: () => Promise<void>} | null}
 */
function createTray(actions) {
  try {
    const icon = fs
      .readFileSync(path.join(__dirname, process.platform === 'win32' ? 'AKP05_icon.ico' : 'AKP05_icon.png'))
      .toString('base64');
    const statusItem = { title: 'Starting…', tooltip: 'Bridge status', enabled: false };
    const startupItem = { title: 'Start at login', tooltip: 'Launch at login', checked: !!actions.startupEnabled };
    const handlers = [
      null,
      null,
      () => actions.openLog(),
      () => actions.openFolder(),
      () => actions.reconnect(),
      () => {
        startupItem.checked = !!actions.toggleStartup();
        tray.sendAction({ type: 'update-item', item: startupItem, seq_id: 5 });
      },
      null,
      () => actions.quit(),
    ];
    const tray = new SysTray({
      menu: {
        icon,
        title: 'Ajazz Companion Bridge',
        tooltip: 'Ajazz Companion Bridge',
        items: [
          statusItem,
          SysTray.separator,
          { title: 'Open log', tooltip: 'Open bridge.log' },
          { title: 'Open folder', tooltip: 'Open the bridge folder' },
          { title: 'Reconnect', tooltip: 'Reconnect to Companion and rescan USB' },
          startupItem,
          SysTray.separator,
          { title: 'Quit', tooltip: 'Exit Ajazz Bridge' },
        ],
      },
      debug: false,
      copyDir: true,
    });
    tray.onClick((action) => {
      const handler = handlers[action.seq_id];
      if (handler) handler();
    });
    return {
      setStatus(text) {
        statusItem.title = text;
        tray.sendAction({ type: 'update-item', item: statusItem, seq_id: 0 }).catch(() => {});
      },
      kill: () => tray.kill(false),
    };
  } catch (e) {
    log.warn('[TRAY] System tray unavailable:', e.message || e);
    return null;
  }
}

module.exports = { createTray };
